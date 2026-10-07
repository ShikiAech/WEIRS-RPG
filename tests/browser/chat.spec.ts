import { test, expect } from '@playwright/test';
import { backend, campaignId, ownerId } from './backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';
import type { Page, WebSocketRoute } from '@playwright/test';

test('chat carrega histórico, envia texto e dados sem executar HTML; retry mantém a mensagem', async ({
  page,
}) => {
  const state = await backend(page);
  const chat = await chatBackend(page);
  await page.goto('app.html#/chat');
  await expect(page.getByRole('heading', { name: 'Chat da campanha' })).toBeVisible();
  await expect(page.getByText('Mensagem anterior')).toBeVisible();
  await page.getByLabel('Mensagem ou comando de dados').fill('<img src=x onerror=alert(1)> Olá');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('<img src=x onerror=alert(1)> Olá');
  await expect(page.getByRole('log').locator('img')).toHaveCount(0);
  chat.failAcknowledgement = true;
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('confirmar', { timeout: 20000 });
  await expect(page.getByRole('status')).toHaveText('Ao vivo');
  await page.getByRole('button', { name: 'Reenviar mesma tentativa' }).click();
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
  await expect(page.getByRole('log').getByText('2d6+3', { exact: true })).toHaveCount(1);
  expect(chat.rows).toHaveLength(3);
  await expect(page.locator('.chat-room')).toHaveCSS('border-top-width', '1px');
  await expect(page.locator('.chat-room')).toHaveCSS('background-color', 'rgba(18, 18, 19, 0.85)');
  await page.screenshot({ path: `artifacts/chat-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByText('Mensagem anterior')).toHaveCount(0);
  await expect(page.getByText('Entre com Google para conversar com sua mesa.')).toBeVisible();
  expect(state.rows).toHaveLength(1);
});

test('espectador consulta o chat com envio desabilitado', async ({ page }) => {
  await backend(page, { readonly: true });
  await chatBackend(page);
  await page.goto('app.html#/chat');
  await expect(page.getByText('Mensagem anterior')).toBeVisible();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
});

test('ataque da ficha usa a versão salva e chega ao chat; rascunhos não podem rolar', async ({
  page,
}) => {
  const state = await backend(page);
  const chat = await chatBackend(page);
  const attack = { ...novaEntrada('ataques'), nome: 'Espada longa', valor: 7, dano: '1d8+4' };
  state.rows[0].conteudo.ataques.push(attack);
  await page.goto('app.html#/fichas/' + state.rows[0].id);
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await page.getByRole('button', { name: 'Rolar ataque: Espada longa', exact: true }).click();
  await expect(page.getByText('Ação enviada ao chat.')).toBeVisible();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Novo nome');
  await expect(
    page.getByRole('button', { name: 'Rolar ataque: Espada longa', exact: true }),
  ).toBeDisabled();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('link', { name: 'Ver no chat' }).click();
  await expect(page.getByRole('log')).toContainText('Zephira · Espada longa');
  expect(chat.commands[0]).toMatchObject({
    ficha_id: state.rows[0].id,
    entrada_id: attack.id,
    versao: 1,
    acao: 'ataque',
    modo: 'normal',
  });
});

test('Realtime entrega entre duas janelas e reconexão recupera lacunas sem duplicar', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await backend(page);
  await backend(second);
  const state = await chatBackend(page);
  await chatBackend(second, state);
  await page.goto('app.html#/chat');
  await second.goto('app.html#/chat');
  await expect(page.getByRole('status')).toHaveText('Ao vivo');
  await expect(second.getByRole('status')).toHaveText('Ao vivo');
  await page.getByLabel('Mensagem ou comando de dados').fill('Mensagem entre janelas');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(
    second.getByRole('log').getByText('Mensagem entre janelas', { exact: true }),
  ).toHaveCount(1);
  await expect(
    second.getByRole('log').getByText('Mensagem entre janelas', { exact: true }),
  ).toBeVisible();
  // Evento recente chega após uma lacuna: o cursor deve continuar na última consulta completa.
  const missed = state.row(3, { texto: 'Mensagem perdida na conexão' });
  const recent = state.row(4, { texto: 'Mensagem após a lacuna' });
  state.rows.push(missed, recent);
  state.publish(recent);
  await expect(second.getByRole('log')).toContainText('Mensagem perdida na conexão');
  state.publish(recent);
  await expect(
    second.getByRole('log').getByText('Mensagem após a lacuna', { exact: true }),
  ).toHaveCount(1);
  // Servidor encerra o canal. Outro registro fica somente no banco durante a reconexão.
  for (const socket of state.sockets)
    socket.ws.send(JSON.stringify([socket.join, null, socket.topic, 'phx_error', {}]));
  state.rows.push(state.row(5, { texto: 'Mensagem durante desconexão' }));
  await expect(second.getByRole('log')).toContainText('Mensagem durante desconexão');
  await second.close();
});

test('paginação recupera mensagens antigas e trocar campanha elimina a conversa anterior', async ({
  page,
}) => {
  await backend(page);
  const state = await chatBackend(page);
  state.rows = Array.from({ length: 65 }, (_, i) =>
    state.row(i + 1, { texto: 'Mensagem ' + (i + 1) }),
  );
  await page.goto('app.html#/chat');
  await expect(page.getByRole('log').getByText('Mensagem 65', { exact: true })).toBeVisible();
  await expect(page.getByRole('log').getByText('Mensagem 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Carregar mensagens anteriores' }).click();
  await expect(page.getByRole('log').getByText('Mensagem 1', { exact: true })).toHaveCount(1);
  await page.goto('app.html#/chat/20000000-0000-4000-a000-000000000099');
  await expect(page.getByText('Esta campanha não está disponível para sua conta.')).toBeVisible();
  await expect(page.getByRole('log')).toHaveCount(0);
});

test('erro de validação libera a expressão para correção sem reenviar comando inválido', async ({
  page,
}) => {
  await backend(page);
  const state = await chatBackend(page);
  state.rejectCode = 'WC003';
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d0');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confira');
  await expect(page.getByLabel('Mensagem ou comando de dados')).toBeEnabled();
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d20');
  state.rejectCode = null;
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('1d20');
});

test('revogar acesso limpa a conversa durante sincronização', async ({ page }) => {
  await backend(page);
  const state = await chatBackend(page);
  await page.goto('app.html#/chat');
  await expect(page.getByText('Mensagem anterior')).toBeVisible();
  await page.route('https://weirs-test.supabase.co/rest/v1/membros_campanha**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  state.publish(state.row(2, { texto: 'Evento antes da revogação' }));
  await expect(page.getByRole('alert')).toContainText('não participa');
  await expect(page.getByRole('log').getByText('Mensagem anterior')).toHaveCount(0);
  await expect(page.getByLabel('Mensagem ou comando de dados')).toBeDisabled();
  state.publish(state.row(3, { texto: 'Evento atrasado' }));
  await expect(page.getByRole('log').getByText('Evento atrasado')).toHaveCount(0);
});

test('histórico inicial indisponível é recuperado ao voltar a conexão', async ({ page }) => {
  await backend(page);
  const state = await chatBackend(page);
  state.historyUnavailable = true;
  await page.goto('app.html#/chat');
  await expect(page.getByRole('alert')).toContainText('confirmar', { timeout: 20000 });
  state.historyUnavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Mensagem anterior')).toBeVisible();
});

test('retorno de tabela da RPC confirma o envio sem criar uma mensagem vazia', async ({ page }) => {
  await backend(page);
  await chatBackend(page);
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('Envio confirmado');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  await expect(page.locator('.chat-message')).toHaveCount(2);
});

test('paginação detecta acesso revogado e remove também mensagens já carregadas', async ({
  page,
}) => {
  await backend(page);
  const state = await chatBackend(page);
  state.rows = Array.from({ length: 65 }, (_, i) =>
    state.row(i + 1, { texto: 'Mensagem ' + (i + 1) }),
  );
  await page.goto('app.html#/chat');
  await expect(page.getByRole('log')).toContainText('Mensagem 65');
  await page.route('https://weirs-test.supabase.co/rest/v1/membros_campanha**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.getByRole('button', { name: 'Carregar mensagens anteriores' }).click();
  await expect(page.getByRole('alert')).toContainText('não participa');
  await expect(page.getByRole('log').getByText('Mensagem 65', { exact: true })).toHaveCount(0);
});

// HTTP externo é simulado; cálculos/autorização reais são cobertos no PostgreSQL em chat-database.
async function chatBackend(page: Page, shared?: ReturnType<typeof chatState>) {
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
              resultado: {
                expressao: p_comando.expressao || '1d20+7',
                total: 11,
                termos: [
                  { sinal: 1, faces: 6, dados: [4, 4], selecionados: [1, 2], subtotal: 8 },
                  { sinal: 1, valor: 3, subtotal: 3 },
                ],
                regras: 1,
              },
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
    receipts: new Map<string, any>(),
    failAcknowledgement: false,
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
