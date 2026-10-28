import type { Page, WebSocketRoute } from '@playwright/test';
import type { SheetRecord } from '../../packages/contracts/sheets';
import { campaignId, ownerId } from './backend';
// HTTP externo é simulado; cálculos/autorização reais são cobertos no PostgreSQL em chat-database.
export async function chatBackend(
  page: Page,
  shared?: ReturnType<typeof chatState>,
  options: { master?: boolean; readonly?: boolean; sheets?: SheetRecord[] } = {},
) {
  const state = shared || chatState();
  await page.routeWebSocket('wss://weirs-test.supabase.co/realtime/**', (ws) => {
    // Supabase multiplexa chat, ficha e mapa na mesma conexão física. Cada
    // phx_join mantém seu próprio tópico/ref/filtros até o phx_leave.
    const channels = new Map<string, (typeof state.sockets)[number]>();
    ws.onMessage((raw) => {
      const [join, ref, topic, event, payload] = JSON.parse(String(raw));
      let socket = channels.get(topic);
      if (event === 'phx_join') {
        if (!socket) {
          socket = {
            ws,
            topic,
            join,
            filters: [],
            get master() {
              return !!options.master;
            },
          };
          channels.set(topic, socket);
          state.sockets.push(socket);
        }
        socket.join = join;
        socket.filters = (payload.config.postgres_changes || []).map((filter: any, i: number) => ({
          ...filter,
          id: i + 1,
        }));
      }
      if (event === 'phx_leave' && socket) {
        channels.delete(topic);
        state.sockets = state.sockets.filter((s) => s !== socket);
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
              response: event === 'phx_join' ? { postgres_changes: socket!.filters } : {},
            },
          ]),
        );
    });
    ws.onClose(() => {
      state.sockets = state.sockets.filter((s) => s.ws !== ws);
      channels.clear();
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
  // A mesa vazia é o estado inicial para os testes que exercitam apenas chat/ficha.
  // tabletopBackend registra respostas específicas por cima destas rotas.
  await page.route(
    /https:\/\/weirs-test\.supabase\.co\/rest\/v1\/(cenas_mapa|tokens_mapa|areas_mapa|arquivos_mapa|marcadores_mapa)(\?|$)/,
    (route) => route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('https://weirs-test.supabase.co/rest/v1/perfis**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: ownerId, nome: 'Jogador da mesa', nome_exibicao: 'Jogador da mesa' },
      ]),
    }),
  );
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mesa', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        campanha_id: campaignId,
        versao: 0,
        estado: {
          combate: { ativo: false, rodada: 1, turno: '', participantes: [] },
          loja: { aberta: false, nome: '', ofertas: [] },
        },
      }),
    }),
  );
  await page.route(
    'https://weirs-test.supabase.co/rest/v1/rpc/ler_segredos_chat',
    async (route) => {
      const { p_ids } = route.request().postDataJSON();
      const secrets = options.master
        ? (p_ids as string[]).flatMap((id) => {
            const original = state.privateRolls.get(id);
            return original
              ? [
                  {
                    id,
                    rotulo: original.rotulo,
                    resultado: original.resultado,
                    revelada_id: state.rows.find((r) => r.id === id)?.revelada_id || null,
                  },
                ]
              : [];
          })
        : [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(secrets) });
    },
  );
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/revelar_rolagem', async (route) => {
    const { p_mensagem } = route.request().postDataJSON();
    if (!options.master)
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"code":"WC002"}',
      });
    const original = state.privateRolls.get(p_mensagem);
    const marker = state.rows.find((r) => r.id === p_mensagem);
    if (!original || !marker)
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: '{"code":"WC003"}',
      });
    if (!marker.revelada_id) {
      const revealed = state.row(state.rows.length + 1, {
        ...original,
        id: undefined,
        sequencia: undefined,
        secreta: false,
      });
      revealed.id = `40000000-0000-4000-a000-${String(state.rows.length + 1).padStart(12, '0')}`;
      revealed.sequencia = state.rows.length + 1;
      state.rows.push(revealed);
      marker.revelada_id = revealed.id;
      state.publish(revealed);
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([state.rows.find((r) => r.id === marker.revelada_id)]),
    });
  });
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/enviar_chat', async (route) => {
    const { p_pedido, p_comando } = route.request().postDataJSON();
    if (options.readonly || (p_comando.secreta && !options.master))
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"code":"WC002"}',
      });
    if (
      p_comando.secreta &&
      (p_comando.tipo === 'texto' || ['iniciativa', 'morte', 'dado_vida'].includes(p_comando.acao))
    )
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: '{"code":"WC003"}',
      });
    if (state.rejectCode)
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: state.rejectCode }),
      });
    if (!state.receipts.has(p_pedido)) {
      state.commands.push(p_comando);
      let resolved: any;
      let resolvedLabel: string | undefined;
      if (p_comando.tipo === 'acao' && options.sheets) {
        const sheet = options.sheets.find(
          (s) => s.id === p_comando.ficha_id && s.campanha_id === campaignId,
        );
        const fail = (code: string) =>
          route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code }),
          });
        if (!sheet || (!options.master && sheet.proprietario_id !== ownerId)) return fail('WC002');
        if (sheet.versao !== p_comando.versao) return fail('WC005');
        const path = (
          {
            descricao_magia: 'magias',
            descricao_ataque: 'ataques',
            descricao_caracteristica: 'caracteristicas',
            descricao_traco: 'tracos',
            descricao_talento: 'talentos',
            descricao_pericia: 'pericias',
          } as Record<string, string>
        )[p_comando.acao];
        const source = sheet.conteudo as any;
        const entry =
          path === 'pericias'
            ? source.pericias[p_comando.entrada_id]
            : path
              ? source[path].find((e: any) => e.id === p_comando.entrada_id)
              : undefined;
        const origem = {
          ficha_id: sheet.id,
          ficha_nome: sheet.nome,
          versao: sheet.versao,
          entrada_id: p_comando.entrada_id,
          acao: p_comando.acao,
          modo: p_comando.modo,
        };
        if (path) {
          if (!entry) return fail('WC003');
          const nome = entry.nome || p_comando.entrada_id;
          let texto = entry.descricao || '';
          if (path === 'ataques')
            texto = [
              entry.observacoes,
              source.inventario.itens.find((i: any) => i.id === entry.itemId)?.descricao,
            ]
              .filter(Boolean)
              .join('\n\n');
          resolved = { regras: 1, origem, descricao: { nome, texto, semDescricao: !texto.trim() } };
          resolvedLabel = sheet.nome + ' · ' + nome;
        } else if (['magia', 'magia_ataque', 'magia_dano'].includes(p_comando.acao)) {
          const spell = source.magias.find((e: any) => e.id === p_comando.entrada_id);
          if (!spell) return fail('WC003');
          resolved = {
            regras: 1,
            origem,
            ...(spell.cd === undefined ? {} : { cd: spell.cd }),
            ...(spell.bonusAtaque === undefined ? {} : { bonusAtaque: spell.bonusAtaque }),
            ...(spell.salvaguardaAtributo
              ? { salvaguardaAtributo: spell.salvaguardaAtributo }
              : {}),
          };
          if (p_comando.acao === 'magia_dano')
            Object.assign(resolved, {
              expressao: spell.dano || spell.danos?.map((d: any) => d.dado).join('+'),
              total: 5,
            });
          resolvedLabel = sheet.nome + ' · ' + spell.nome;
        }
      }
      const result = state.row(
        state.rows.length + 1,
        p_comando.tipo === 'texto'
          ? { texto: p_comando.texto }
          : {
              tipo: p_comando.tipo,
              texto: '',
              rotulo:
                resolvedLabel ||
                p_comando.rotulo ||
                (p_comando.tipo === 'acao' ? 'Zephira · Espada longa' : 'Rolagem livre'),
              resultado:
                resolved ||
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
      const publicResult = p_comando.secreta
        ? {
            ...result,
            secreta: true,
            resultado: null,
            rotulo: 'Rolagem secreta',
            texto: 'O mestre realizou uma rolagem secreta.',
          }
        : result;
      if (p_comando.secreta) {
        result.secreta = true;
        state.privateRolls.set(result.id, structuredClone(result));
      }
      state.rows.push(publicResult);
      state.receipts.set(p_pedido, result);
      if (state.publishOnSend) state.publish(publicResult);
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
    secreta: false,
    revelada_id: null,
    criado_em: '2026-10-07T12:00:00Z',
    ...extra,
  });
  const state = {
    row,
    rows: [row(1)] as any[],
    commands: [] as any[],
    rollResult: null as Record<string, unknown> | null,
    receipts: new Map<string, any>(),
    privateRolls: new Map<string, any>(),
    failAcknowledgement: false,
    publishOnSend: true,
    acknowledgementGate: null as Promise<void> | null,
    rejectCode: null as string | null,
    historyUnavailable: false,
    sockets: [] as {
      ws: WebSocketRoute;
      topic: string;
      join: string | null;
      filters: any[];
      master: boolean;
    }[],
    publish(message: any) {
      for (const socket of state.sockets) {
        if (!socket.topic) continue;
        const ids = socket.filters
          .filter(
            (f) =>
              f.schema === 'public' &&
              f.table === 'mensagens_chat' &&
              (!f.event || f.event === '*' || f.event === 'INSERT'),
          )
          .map((f) => f.id);
        if (!ids.length) continue;
        socket.ws.send(
          JSON.stringify([
            socket.join,
            null,
            socket.topic,
            'postgres_changes',
            {
              ids,
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
