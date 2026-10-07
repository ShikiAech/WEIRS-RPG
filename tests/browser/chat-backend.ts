import type { Page, WebSocketRoute } from '@playwright/test';
import { campaignId, ownerId } from './backend';
// HTTP externo é simulado; cálculos/autorização reais são cobertos no PostgreSQL em chat-database.
export async function chatBackend(page: Page, shared?: ReturnType<typeof chatState>) {
  const state = shared || chatState();
  await page.routeWebSocket('wss://weirs-test.supabase.co/realtime/**', (ws) => {
    const socket = { ws, topic: '', join: null as string | null, filters: [] as any[] };
    state.sockets.push(socket);
    ws.onMessage((raw) => {
      const [join, ref, topic, event, payload] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        socket.topic = topic;
        socket.join = join;
        socket.filters = payload.config.postgres_changes.map((filter: any, i: number) => ({
          ...filter,
          id: i + 1,
        }));
      }
      if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat')
        ws.send(
          JSON.stringify([
            join,
            ref,
            topic,
            'phx_reply',
            {
              status: 'ok',
              response: event === 'phx_join' ? { postgres_changes: socket.filters } : {},
            },
          ]),
        );
    });
    ws.onClose(() => {
      state.sockets = state.sockets.filter((s) => s !== socket);
    });
  });
  await page.route('https://weirs-test.supabase.co/rest/v1/mensagens_chat**', async (route) => {
    if (state.historyUnavailable)
      return route.fulfill({
        status: 503,
        headers: { 'Retry-After': '0.01' },
        contentType: 'application/json',
        body: '{}',
      });
    const params = new URL(route.request().url()).searchParams;
    const filter = params.get('sequencia');
    let rows = [...state.rows];
    if (filter?.startsWith('gt.')) rows = rows.filter((r) => r.sequencia > Number(filter.slice(3)));
    if (filter?.startsWith('lt.')) rows = rows.filter((r) => r.sequencia < Number(filter.slice(3)));
    if (params.get('order')?.includes('desc')) rows.reverse();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(rows.slice(0, 50)),
    });
  });
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/enviar_chat', async (route) => {
    const { p_pedido, p_comando } = route.request().postDataJSON();
    if (state.rejectCode)
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: state.rejectCode }),
      });
    if (!state.receipts.has(p_pedido)) {
      state.commands.push(p_comando);
      const result = state.row(
        state.rows.length + 1,
        p_comando.tipo === 'texto'
          ? { texto: p_comando.texto }
          : {
              tipo: p_comando.tipo,
              texto: '',
              rotulo: p_comando.tipo === 'acao' ? 'Zephira · Espada longa' : 'Rolagem livre',
              resultado:
                state.rollResult ||
                (p_comando.tipo === 'acao'
                  ? {
                      expressao: '1d20+7',
                      total: 11,
                      regras: 1,
                      termos: [
                        { sinal: 1, faces: 20, dados: [4], selecionados: [1], subtotal: 4 },
                        { sinal: 1, valor: 7, subtotal: 7 },
                      ],
                    }
                  : {
                      expressao: p_comando.expressao || '1d20+7',
                      total: 11,
                      termos: [
                        { sinal: 1, faces: 6, dados: [4, 4], selecionados: [1, 2], subtotal: 8 },
                        { sinal: 1, valor: 3, subtotal: 3 },
                      ],
                      regras: 1,
                    }),
            },
      );
      state.rows.push(result);
      state.receipts.set(p_pedido, result);
      state.publish(result);
    }
    if (state.failAcknowledgement) {
      state.failAcknowledgement = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"offline"}',
      });
    }
    await state.acknowledgementGate;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([state.receipts.get(p_pedido)]),
    });
  });
  return state;
}

function chatState() {
  const row = (sequence: number, extra = {}) => ({
    id: `40000000-0000-4000-a000-${String(sequence).padStart(12, '0')}`,
    campanha_id: campaignId,
    sequencia: sequence,
    autor_id: ownerId,
    autor_nome: 'Jogador da mesa',
    tipo: 'texto',
    texto: 'Mensagem anterior',
    rotulo: '',
    resultado: null,
    criado_em: '2026-10-07T12:00:00Z',
    ...extra,
  });
  const state = {
    row,
    rows: [row(1)] as any[],
    commands: [] as any[],
    rollResult: null as Record<string, unknown> | null,
    receipts: new Map<string, any>(),
    failAcknowledgement: false,
    acknowledgementGate: null as Promise<void> | null,
    rejectCode: null as string | null,
    historyUnavailable: false,
    sockets: [] as { ws: WebSocketRoute; topic: string; join: string | null; filters: any[] }[],
    publish(message: any) {
      for (const socket of state.sockets) {
        if (!socket.topic) continue;
        socket.ws.send(
          JSON.stringify([
            socket.join,
            null,
            socket.topic,
            'postgres_changes',
            {
              ids: [1],
              data: {
                schema: 'public',
                table: 'mensagens_chat',
                type: 'INSERT',
                commit_timestamp: message.criado_em,
                columns: [],
                record: message,
                old_record: {},
                errors: null,
              },
            },
          ]),
        );
      }
    },
  };
  return state;
}
