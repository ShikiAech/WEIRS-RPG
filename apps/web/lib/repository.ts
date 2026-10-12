import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SheetContent,
  SheetRecord,
  SheetRepository,
  CampaignMembership,
} from '../../../packages/contracts/sheets';
import { validarFicha, UUID } from '../../../packages/sheets/modelo.js';
import { SheetError, publicError } from './errors';
import { campaignAccess } from './campaign-access';

// PostgreSQL JSONB não conserva a ordem das propriedades; a identidade da tentativa
// depende dos valores, incluindo a ordem dos elementos nas listas.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

export function createRepository(client: SupabaseClient): SheetRepository {
  function valid(name: string, content: SheetContent) {
    const fields = validarFicha({ nome: name, conteudo: content, versao_esquema: 1 });
    if (fields.length) throw new SheetError('VALIDACAO', fields);
  }
  const id = (value: string) => {
    if (!UUID.test(value)) throw new SheetError('ACESSO');
  };
  async function user() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new SheetError('SESSAO');
    return data.user;
  }
  async function result<T>(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    try {
      const response = await request;
      if (response.error) throw response.error;
      return response.data as T;
    } catch (error) {
      throw publicError(error);
    }
  }
  function record(value: SheetRecord | SheetRecord[]): SheetRecord {
    const row = Array.isArray(value) ? value[0] : value;
    if (!row || row.versao_esquema !== 1) throw new SheetError('ACESSO');
    valid(row.nome, row.conteudo);
    return row;
  }
  return {
    async list() {
      await user();
      return (
        await result<SheetRecord[]>(
          client.from('fichas').select('*').order('atualizado_em', { ascending: false }),
        )
      ).map(record);
    },
    async campaigns() {
      const owner = await user();
      const access = await campaignAccess(client, owner.id).catch((e) => {
        throw publicError(e);
      });
      return {
        ...access,
        campaigns: access.campaigns.filter((c) =>
          access.memberships.some((m) => m.usuario_id === owner.id && m.campanha_id === c.id),
        ),
      };
    },
    async availableCampaigns() {
      const owner = await user();
      return campaignAccess(client, owner.id).catch((e) => {
        throw publicError(e);
      });
    },
    async joinCampaign(value) {
      id(value);
      const owner = await user();
      const response = await result<CampaignMembership | CampaignMembership[]>(
        client.rpc('entrar_campanha', { p_campanha: value }),
      );
      const row = Array.isArray(response) ? response[0] : response;
      if (!row || row.usuario_id !== owner.id || row.campanha_id !== value)
        throw new SheetError('ACESSO');
      return row;
    },
    async copyToCampaign(previous, campaignId, requestId) {
      id(previous.id);
      id(campaignId);
      id(requestId);
      await user();
      return record(
        await result<SheetRecord | SheetRecord[]>(
          client.rpc('copiar_ficha_campanha', {
            p_origem: previous.id,
            p_versao: previous.versao,
            p_campanha: campaignId,
            p_pedido: requestId,
          }),
        ),
      );
    },
    async get(value) {
      id(value);
      await user();
      return record(
        await result<SheetRecord>(client.from('fichas').select('*').eq('id', value).single()),
      );
    },
    async create(campaignId, name, content, requestId = crypto.randomUUID()) {
      id(campaignId);
      const owner = await user();
      valid(name, content);
      id(requestId);
      const response = await client
        .from('fichas')
        .insert({
          id: requestId,
          campanha_id: campaignId,
          proprietario_id: owner.id,
          nome: name.trim(),
          conteudo: content,
          versao_esquema: 1,
        })
        .select()
        .single();
      if (response.error?.code === '23505') {
        const previous = record(
          await result<SheetRecord>(client.from('fichas').select('*').eq('id', requestId).single()),
        );
        if (
          previous.proprietario_id !== owner.id ||
          previous.campanha_id !== campaignId ||
          previous.nome !== name.trim() ||
          canonical(previous.conteudo) !== canonical(content)
        )
          throw new SheetError('CONFLITO');
        return previous;
      }
      if (response.error) throw publicError(response.error);
      return record(response.data);
    },
    async save(previous, name, content) {
      id(previous.id);
      await user();
      valid(name, content);
      return record(
        await result<SheetRecord | SheetRecord[]>(
          client.rpc('salvar_ficha', {
            p_id: previous.id,
            p_versao: previous.versao,
            p_nome: name.trim(),
            p_conteudo: content,
            p_versao_esquema: 1,
          }),
        ),
      );
    },
    async remove(value) {
      id(value);
      await user();
      const rows = await result<{ id: string }[]>(
        client.from('fichas').delete().eq('id', value).select('id'),
      );
      if (!rows.length) throw new SheetError('ACESSO');
    },
  };
}
