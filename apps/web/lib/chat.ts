import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatRepository, ChatMessage } from '../../../packages/contracts/chat';
import { UUID } from '../../../packages/sheets/modelo.js';

const errors: Record<string, string> = {
  WC002: 'Você não tem acesso para realizar esta ação nesta campanha.',
  WC003:
    'Confira a expressão ou ação: até 100 dados, faces de 2 a 1000, somas, subtrações e kh/kl. Salve um perfil para ataques de magia.',
  WC004:
    'Esta tentativa já foi usada com outro comando. Consulte o chat antes de tentar uma nova rolagem.',
  WC005: 'A ficha foi alterada. Recarregue a versão salva antes de rolar.',
  WC006: 'Muitas mensagens em poucos segundos. Aguarde um pouco e reenvie a mesma tentativa.',
  SESSAO: 'Entre novamente para acessar o chat.',
  ACESSO: 'Você não participa desta campanha.',
};
export class ChatError extends Error {
  constructor(public code: string) {
    super(
      errors[code] ||
        'Não foi possível confirmar a operação. Reenvie a mesma tentativa para evitar duplicação.',
    );
  }
}
export function chatError(error: unknown): ChatError {
  if (error instanceof ChatError) return error;
  const e = error as { code?: string; status?: number };
  return new ChatError(e?.status === 401 || e?.code === 'PGRST301' ? 'SESSAO' : e?.code || 'REDE');
}

export function createChatRepository(client: SupabaseClient): ChatRepository {
  const validId = (id: string) => {
    if (!UUID.test(id)) throw new ChatError('ACESSO');
  };
  async function request<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    try {
      const { data, error } = await query;
      if (error) throw error;
      return data as T;
    } catch (error) {
      throw chatError(error);
    }
  }
  async function access(campaign: string) {
    validId(campaign);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new ChatError('SESSAO');
    const rows = await request<{ usuario_id: string; campanha_id: string; papel: string }[]>(
      client
        .from('membros_campanha')
        .select('usuario_id,campanha_id,papel')
        .eq('usuario_id', data.user.id)
        .eq('campanha_id', campaign),
    );
    if (!rows.some((m) => m.usuario_id === data.user!.id && m.campanha_id === campaign))
      throw new ChatError('ACESSO');
    repository.onRole?.(
      rows.find((m) => m.usuario_id === data.user!.id && m.campanha_id === campaign)!.papel,
      campaign,
    );
  }
  async function hydrate(campaign: string, rows: ChatMessage[]) {
    const ids = rows.filter((row) => row.secreta).map((row) => row.id);
    if (!ids.length) return rows;
    const secrets = await request<
      Pick<ChatMessage, 'id' | 'rotulo' | 'resultado' | 'revelada_id'>[]
    >(client.rpc('ler_segredos_chat', { p_campanha: campaign, p_ids: ids }));
    const lookup = new Map(secrets.map((row) => [row.id, row]));
    return rows.map((row) => (lookup.has(row.id) ? { ...row, ...lookup.get(row.id)! } : row));
  }
  function message(data: ChatMessage | ChatMessage[], campaign: string) {
    const row = Array.isArray(data) && data.length === 1 ? data[0] : data;
    if (
      !row ||
      Array.isArray(row) ||
      !UUID.test(row.id) ||
      row.campanha_id !== campaign ||
      !Number.isSafeInteger(row.sequencia) ||
      row.sequencia < 1
    )
      throw new ChatError('RESPOSTA');
    return row;
  }
  const repository: ChatRepository = {
    async history(campaign, before) {
      await access(campaign);
      let query = client
        .from('mensagens_chat')
        .select('*')
        .eq('campanha_id', campaign)
        .order('sequencia', { ascending: false })
        .limit(50);
      if (before !== undefined) query = query.lt('sequencia', before);
      return hydrate(campaign, (await request<ChatMessage[]>(query)).reverse());
    },
    async since(campaign, after) {
      await access(campaign);
      return hydrate(
        campaign,
        await request<ChatMessage[]>(
          client
            .from('mensagens_chat')
            .select('*')
            .eq('campanha_id', campaign)
            .gt('sequencia', after)
            .order('sequencia')
            .limit(50),
        ),
      );
    },
    async send(campaign, pedido, command) {
      validId(campaign);
      validId(pedido);
      const data = await request<ChatMessage | ChatMessage[]>(
        client.rpc('enviar_chat', { p_campanha: campaign, p_pedido: pedido, p_comando: command }),
      );
      return message(data, campaign);
    },
    async reveal(campaign, id) {
      validId(campaign);
      validId(id);
      return message(
        await request<ChatMessage | ChatMessage[]>(
          client.rpc('revelar_rolagem', { p_campanha: campaign, p_mensagem: id }),
        ),
        campaign,
      );
    },
    subscribe(campaign, onMessage, onStatus) {
      validId(campaign);
      let active = true;
      onStatus('conectando');
      const channel = client
        .channel('chat:' + campaign + ':' + crypto.randomUUID())
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mensagens_chat',
            filter: 'campanha_id=eq.' + campaign,
          },
          (payload) => {
            const row = payload.new as ChatMessage;
            if (active && row.campanha_id === campaign) {
              if (!row.secreta) onMessage(row);
              else
                void hydrate(campaign, [row])
                  .then((rows) => {
                    if (active) onMessage(rows[0]);
                  })
                  .catch(() => {
                    if (active) onStatus('reconectando');
                  });
            }
          },
        )
        .subscribe((status) => {
          if (active) onStatus(status === 'SUBSCRIBED' ? 'ao_vivo' : 'reconectando');
        });
      return () => {
        active = false;
        void client.removeChannel(channel);
      };
    },
  };
  return repository;
}
