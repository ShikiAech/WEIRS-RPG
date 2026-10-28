import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AssetRecord,
  MapSnapshot,
  AreaRecord,
  MapCommand,
  MapPing,
  MapResponse,
  SceneRecord,
  TokenRecord,
} from '../../../packages/contracts/tabletop';

const messages: Record<string, string> = {
  WV001:
    'Outra janela alterou o mapa. A versão atual foi recarregada; confira antes de tentar novamente.',
  WV002: 'Seu acesso a esta operação foi encerrado ou este token pertence a outro jogador.',
  WV003:
    'Confira os valores, os vínculos e os limites do mapa. Arquivos usados em cenas precisam estar disponíveis aos jogadores.',
  WV004: 'Esta tentativa já foi usada para outra alteração.',
  WV006: 'Muitas alterações em poucos segundos. Aguarde e reenvie a mesma tentativa.',
  PGRST202:
    'A mesa virtual precisa das migrações 006 e 007 no Supabase. Consulte o guia de configuração.',
  PGRST205:
    'A mesa virtual precisa das migrações 006 e 007 no Supabase. Consulte o guia de configuração.',
  ARQUIVO: 'Envie uma imagem PNG, JPEG ou WebP, ou um PDF, de até 5 MB após a redução.',
  LIMITE:
    'A campanha atingiu o limite de arquivos. Remova arquivos sem vínculos antes de enviar mais.',
};
export class MapError extends Error {
  constructor(public code: string) {
    super(
      messages[code] ||
        'Não foi possível confirmar. Reenvie a mesma tentativa para evitar duplicação.',
    );
  }
}

function errorCode(error: unknown): string {
  const e = error as { code?: string; status?: number | string; statusCode?: number | string };
  if (String(e?.statusCode ?? e?.status) === '403' || String(e?.statusCode ?? e?.status) === '401')
    return 'WV002';
  return e?.code || 'REDE';
}
async function prepareFile(file: File): Promise<File> {
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type) ||
    !file.size ||
    file.size > 20 * 1024 * 1024
  )
    throw new MapError('ARQUIVO');
  if (file.type === 'application/pdf') {
    if (
      file.size > 5 * 1024 * 1024 ||
      !new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer()).includes('%PDF-')
    )
      throw new MapError('ARQUIVO');
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MapError('ARQUIVO');
  }
  try {
    if (bitmap.width <= 4096 && bitmap.height <= 4096 && file.size <= 1024 * 1024) return file;
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new MapError('ARQUIVO');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.86),
    );
    if (!blob || blob.size > 5 * 1024 * 1024) throw new MapError('ARQUIVO');
    if (scale === 1 && blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: blob.type });
  } finally {
    bitmap.close();
  }
}

export function createTabletopRepository(client: SupabaseClient) {
  async function request<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw new MapError(errorCode(error));
    if (data === null || data === undefined) throw new MapError('RESPOSTA');
    return data as T;
  }
  const operate = (campaign: string, command: MapCommand, pedido: string = crypto.randomUUID()) =>
    request<MapResponse>(
      client.rpc('operar_mapa', { p_campanha: campaign, p_pedido: pedido, p_comando: command }),
    );
  // Upload phases reuse their request IDs after a lost HTTP acknowledgement.
  async function uploadOperation(campaign: string, command: MapCommand) {
    const pedido = crypto.randomUUID();
    try {
      return await operate(campaign, command, pedido);
    } catch (e) {
      if (e instanceof MapError && !['REDE', 'RESPOSTA'].includes(e.code)) throw e;
      return operate(campaign, command, pedido);
    }
  }
  return {
    snapshot: (campaign: string, scene: string) => request<MapSnapshot>(client.rpc('ler_mapa_visivel', {p_campanha: campaign, p_cena: scene})),
    scenes: (campaign: string) =>
      request<SceneRecord[]>(
        client.from('cenas_mapa').select('*').eq('campanha_id', campaign).order('nome'),
      ),
    tokens: (campaign: string, scene: string) =>
      request<TokenRecord[]>(
        client
          .from('tokens_mapa')
          .select('*')
          .eq('campanha_id', campaign)
          .eq('cena_id', scene)
          .order('nome'),
      ),
    assets: (campaign: string) =>
      request<AssetRecord[]>(
        client
          .from('arquivos_mapa')
          .select('*')
          .eq('campanha_id', campaign)
          .order('criado_em', { ascending: false }),
      ),
    areas: (campaign: string, scene: string) =>
      request<AreaRecord[]>(
        client
          .from('areas_mapa')
          .select('*')
          .eq('campanha_id', campaign)
          .eq('cena_id', scene)
          .order('nome'),
      ),
    pings: (campaign: string, scene: string) =>
      request<MapPing[]>(
        client
          .from('marcadores_mapa')
          .select('*')
          .eq('campanha_id', campaign)
          .eq('cena_id', scene)
          .gt('criado_em', new Date(Date.now() - 6000).toISOString()),
      ),
    ping: (campaign: string, scene: string, point: { x: number; y: number }) =>
      request<MapPing>(
        client.rpc('marcar_mapa', {
          p_campanha: campaign,
          p_cena: scene,
          p_x: point.x,
          p_y: point.y,
        }),
      ),
    operate,
    async upload(
      campaign: string,
      source: File,
      visibility: 'campanha' | 'mestre' = 'campanha',
    ): Promise<AssetRecord> {
      const file = await prepareFile(source),
        id = crypto.randomUUID(),
        path = `${campaign}/${id}`;
      try {
        await uploadOperation(campaign, {
          tipo: 'arquivo_registrar',
          id,
          nome: file.name.slice(0, 160),
          mime: file.type,
          tamanho: file.size,
          visibilidade: visibility,
        });
        const { error } = await client.storage
          .from('weirs-mesa')
          .upload(path, file, { contentType: file.type, cacheControl: '60', upsert: false });
        if (error) throw new MapError(errorCode(error));
        const result = await uploadOperation(campaign, { tipo: 'arquivo_finalizar', id });
        if (!result.asset) throw new MapError('RESPOSTA');
        return result.asset;
      } catch (e) {
        // Metadata cannot be deleted while its object exists. Interrupted uploads stay visible
        // to their owner if cleanup itself loses connectivity, so they can be removed later.
        try {
          await uploadOperation(campaign, { tipo: 'arquivo_preparar_exclusao', id });
          const cleanup = await client.storage.from('weirs-mesa').remove([path]);
          if (!cleanup.error) await uploadOperation(campaign, { tipo: 'arquivo_excluir', id });
        } catch {
          /* Preserve pending metadata for a later authenticated cleanup. */
        }
        throw e;
      }
    },
    async download(asset: AssetRecord): Promise<Blob> {
      if (asset.estado !== 'pronto') throw new MapError('ARQUIVO');
      const { data, error } = await client.storage.from('weirs-mesa').download(asset.caminho);
      if (error) throw new MapError(errorCode(error));
      if (!data) throw new MapError('RESPOSTA');
      return data;
    },
    async remove(asset: AssetRecord): Promise<void> {
      await uploadOperation(asset.campanha_id, { tipo: 'arquivo_preparar_exclusao', id: asset.id });
      const { error } = await client.storage.from('weirs-mesa').remove([asset.caminho]);
      if (error) throw new MapError(errorCode(error));
      await uploadOperation(asset.campanha_id, { tipo: 'arquivo_excluir', id: asset.id });
    },
    subscribe(campaign: string, refresh: () => void) {
      const channel = client.channel('mapa:' + campaign + ':' + crypto.randomUUID());
      for (const table of [
        'invalidacoes_mapa',
      ])
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: 'campanha_id=eq.' + campaign },
          refresh,
        );
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
