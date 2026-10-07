import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SessionCommand,
  SessionResponse,
  SessionState,
} from '../../../packages/contracts/session';

const messages: Record<string, string> = {
  WM001:
    'Outra janela alterou estes dados. A versão atual foi recarregada; confira antes de tentar novamente.',
  WM002: 'Seu acesso a esta operação foi encerrado.',
  WM003: 'Confira os valores, o saldo, o estoque e os recursos disponíveis.',
  WM004: 'Esta tentativa já foi usada com outra operação.',
  WM006: 'Muitas operações em poucos segundos. Aguarde e reenvie a mesma tentativa.',
  PGRST202:
    'A sessão precisa da migração 202610070004_mesa.sql no Supabase. O chat continua disponível.',
};
export class SessionError extends Error {
  constructor(public code: string) {
    super(
      messages[code] ||
        'Não foi possível confirmar. Reenvie a mesma operação para evitar duplicação.',
    );
  }
}
export function createSessionRepository(client: SupabaseClient) {
  async function request<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw new SessionError((error as { code?: string }).code || 'REDE');
    if (!data) throw new SessionError('RESPOSTA');
    return data as T;
  }
  return {
    read: (campaign: string) =>
      request<SessionState>(client.rpc('ler_mesa', { p_campanha: campaign })),
    operate: (campaign: string, id: string, command: SessionCommand) =>
      request<SessionResponse>(
        client.rpc('operar_mesa', { p_campanha: campaign, p_pedido: id, p_comando: command }),
      ),
    subscribe(campaign: string, refresh: () => void) {
      const channel = client.channel('mesa:' + campaign + ':' + crypto.randomUUID());
      for (const table of ['mesas', 'fichas'])
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
