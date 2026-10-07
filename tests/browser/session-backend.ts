import type { Page } from '@playwright/test';
import type { backend } from './backend';
import { campaignId } from './backend';
import type { chatBackend } from './chat-backend';
export async function sessionBackend(
  page: Page,
  sheets: Awaited<ReturnType<typeof backend>>,
  chat: Awaited<ReturnType<typeof chatBackend>>,
) {
  const state = {
    mesa: {
      campanha_id: campaignId,
      versao: 0,
      estado: {
        combate: { ativo: false, rodada: 1, turno: '', participantes: [] as any[] },
        loja: {
          aberta: true,
          nome: 'Loja de Othans',
          ofertas: [
            { id: crypto.randomUUID(), nome: 'Poção de cura', preco: 200, venda: 100, estoque: 3 },
          ],
        },
      },
    },
    receipts: new Map<string, any>(),
    operations: [] as any[],
    lost: false,
    denied: false,
    delay: null as Promise<void> | null,
    beforeOperation: null as (() => void) | null,
  };
  await page.route('**/rest/v1/rpc/ler_mesa', async (route) =>
    route.fulfill({
      status: state.denied ? 403 : 200,
      contentType: 'application/json',
      body: JSON.stringify(state.denied ? { code: 'WM002' } : state.mesa),
    }),
  );
  await page.route('**/rest/v1/rpc/operar_mesa', async (route) => {
    const { p_pedido, p_comando: c } = route.request().postDataJSON();
    state.operations.push({ id: p_pedido, command: c });
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await state.delay;
    const before = state.beforeOperation;
    state.beforeOperation = null;
    before?.();
    if (state.denied) return respond({ code: 'WM002' }, 403);
    if (!state.receipts.has(p_pedido)) {
      const f = sheets.rows.find((r) => r.id === c.ficha_id);
      if (f && f.versao !== c.versao) return respond({ code: 'WM001' }, 409);
      if (['loja', 'combate'].includes(c.tipo) && c.versao !== state.mesa.versao)
        return respond({ code: 'WM001' }, 409);
      if (c.tipo === 'pv' && f) {
        const p = f.conteudo.combate;
        if (c.acao === 'cura') p.pvAtuais = Math.min(p.pvMaximos, p.pvAtuais + c.valor);
        else if (c.acao === 'dano') {
          p.pvAtuais = Math.max(0, p.pvAtuais - Math.max(0, c.valor - p.pvTemporarios));
          p.pvTemporarios = Math.max(0, p.pvTemporarios - c.valor);
        } else p.pvTemporarios = Math.max(p.pvTemporarios, c.valor);
      }
      if (c.tipo === 'condicao' && f) {
        const entries = f.conteudo.combate.condicoes as { id: string; nome: string }[];
        f.conteudo.combate.condicoes = [
          ...entries.filter((x) => x.nome !== c.nome),
          ...(c.ativa ? [{ id: crypto.randomUUID(), nome: c.nome }] : []),
        ] as never;
      }
      if (c.tipo === 'concentracao' && f) f.conteudo.combate.concentracaoAtiva = c.nome;
      if (c.tipo === 'gasto' && f) {
        const resource =
          c.caminho === 'espaco'
            ? f.conteudo.conjuracao.espacos.find((x) => x.circulo === c.circulo)
            : (f.conteudo.recursos as any[]).find((x) => x.id === c.entrada_id);
        if (resource) resource.gastos += c.delta;
      }
      if ((c.tipo === 'comprar' || c.tipo === 'vender') && f) {
        const offer = state.mesa.estado.loja.ofertas.find((o) => o.id === c.oferta_id)!;
        if (c.preco_unitario !== (c.tipo === 'comprar' ? offer.preco : offer.venda))
          return respond({ code: 'WM001' }, 409);
        if (c.tipo === 'comprar') {
          offer.estoque -= c.quantidade;
          f.conteudo.inventario.moedas.po -= (offer.preco * c.quantidade) / 100;
          (f.conteudo.inventario.itens as any[]).push({
            id: crypto.randomUUID(),
            nome: offer.nome,
            quantidade: c.quantidade,
            peso: 0,
            equipado: false,
            cargasMaximas: 0,
            cargasGastas: 0,
            observacoes: '',
          });
        } else {
          offer.estoque += c.quantidade;
          f.conteudo.inventario.moedas.po += (offer.venda * c.quantidade) / 100;
          f.conteudo.inventario.itens = f.conteudo.inventario.itens.filter(
            (i: any) => i.id !== c.item_id,
          );
        }
      }
      if (c.tipo === 'loja')
        state.mesa.estado.loja = { aberta: c.aberta, nome: c.nome, ofertas: c.ofertas };
      if (c.tipo === 'combate') {
        const b = state.mesa.estado.combate;
        if (c.acao === 'adicionar')
          b.participantes.push({
            id: crypto.randomUUID(),
            nome: c.nome,
            pvAtuais: c.pvAtuais,
            pvMaximos: c.pvMaximos,
            ca: c.ca,
            iniciativa: c.iniciativa,
          });
        if (c.acao === 'iniciar') {
          b.ativo = true;
          b.turno = b.participantes[0].id;
        }
        if (c.acao === 'avancar') b.rodada++;
      }
      if (f) f.versao++;
      state.mesa.versao++;
      const message = chat.row(chat.rows.length + 1, { texto: 'Operação de sessão confirmada.' });
      chat.rows.push(message);
      chat.publish(message);
      state.receipts.set(
        p_pedido,
        structuredClone({ mesa: state.mesa, ficha: f, mensagem: message }),
      );
    }
    if (state.lost) {
      state.lost = false;
      return respond({ message: 'offline' }, 503);
    }
    return respond(state.receipts.get(p_pedido));
  });
  return state;
}
