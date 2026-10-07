import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SheetContent,
  SheetRecord,
  SheetRepository,
  CampaignRecord,
  CampaignMembership,
} from '../../../packages/contracts/sheets';
import { validarFicha, UUID } from '../../../packages/sheets/modelo.js';
import { SheetError, publicError } from './errors';

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
      await user();
      const [campaigns, memberships] = await Promise.all([
        result<CampaignRecord[]>(client.from('campanhas').select('id,nome').order('nome')),
        result<CampaignMembership[]>(
          client.from('membros_campanha').select('campanha_id,usuario_id,papel'),
        ),
      ]);
      return { campaigns, memberships };
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
