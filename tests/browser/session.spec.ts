import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';

test('ficha fica no chat, rola testes e ações, mantém rascunho e acompanha PV', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  const f = sheets.rows[0];
  f.conteudo.combate.pvAtuais = 20;
  f.conteudo.combate.pvMaximos = 20;
  f.conteudo.combate.pvTemporarios = 3;
  f.conteudo.ataques.push({ ...novaEntrada('ataques'), nome: 'Espada', valor: 5, dano: '1d8+3' });
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(panel).toContainText('PV 20/20');
  await page.getByLabel('Mensagem ou comando de dados').fill('Minha próxima ação');
  await panel.getByRole('button', { name: 'Força +0', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  expect(chat.commands[0]).toMatchObject({
    tipo: 'acao',
    acao: 'atributo',
    entrada_id: 'for',
    ficha_id: f.id,
    versao: 1,
  });
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('Minha próxima ação');
  await panel.getByLabel('Quantidade de PV').fill('8');
  await panel.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(panel).toContainText('PV 15/20');
  expect(session.operations[0].command.tipo).toBe('pv');
  await panel.getByRole('button', { name: 'Ações', exact: true }).click();
  await panel.getByRole('button', { name: 'Ataque: Espada', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  expect(chat.commands.at(-1)).toMatchObject({ acao: 'ataque', versao: 2 });
  await page.screenshot({
    path: `artifacts/session-${test.info().project.name}.png`,
    fullPage: true,
  });
  await panel.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('Operação de sessão confirmada.');
});

test('loja modal compra e vende, reenvio de resposta perdida não gasta duas vezes', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  sheets.rows[0].conteudo.inventario.moedas.po = 10;
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Loja', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  session.lost = true;
  await dialog.getByRole('button', { name: 'Comprar Poção de cura', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Reenviar operação' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Reenviar operação' }).click();
  await expect(dialog).toContainText('8 PO');
  expect(session.operations[0].id).toBe(session.operations[1].id);
  expect(sheets.rows[0].conteudo.inventario.itens).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Vender Poção de cura (×1)', exact: true }).click();
  await expect(dialog).toContainText('9 PO');
  expect(sheets.rows[0].conteudo.inventario.itens).toHaveLength(0);
  await page.screenshot({ path: `artifacts/shop-${test.info().project.name}.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Fechar loja', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('mestre administra NPCs e turnos dentro do chat', async ({ page }) => {
  const sheets = await backend(page, { master: true }),
    chat = await chatBackend(page);
  await sessionBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Combate da campanha' });
  await panel.getByLabel('Nome do NPC', { exact: true }).fill('Goblin');
  await panel.getByRole('button', { name: 'Adicionar ao encontro' }).click();
  await expect(panel).toContainText('Goblin');
  await panel.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(panel).toContainText('Combate ativo');
  await panel.getByRole('button', { name: 'Próximo turno' }).click();
  await expect(panel).toContainText('Rodada 2');
  await page.screenshot({
    path: `artifacts/combat-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('espectador lê a sessão sem operar e consegue fechar a loja', async ({ page }) => {
  const sheets = await backend(page, { readonly: true }),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aplicar dano', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('button', { name: 'Loja', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Comprar Poção de cura', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar loja', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(session.operations).toHaveLength(0);
});

test('magia homebrew rola dano, gasta espaço e controla condição e concentração', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  const session = await sessionBackend(page, sheets, chat),
    f = sheets.rows[0];
  const profile = {
    ...novaEntrada('conjuracao.perfis'),
    nome: 'Mago',
    classeId: f.conteudo.classes[0].id,
  };
  const spell = {
    ...novaEntrada('magias'),
    nome: 'Raio homebrew',
    perfilId: profile.id,
    circulo: 1,
    concentracao: true,
    dano: '2d6+1',
  };
  f.conteudo.conjuracao.perfis.push(profile);
  f.conteudo.magias.push(spell);
  f.conteudo.conjuracao.espacos[0].total = 1;
  await page.goto('app.html#/chat');
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByRole('button', { name: 'Ações', exact: true }).click();
  await panel.getByRole('button', { name: 'Dano de magia: Raio homebrew', exact: true }).click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    acao: 'magia_dano',
    entrada_id: spell.id,
    modo: 'normal',
    versao: 1,
  });
  await panel.getByRole('button', { name: 'Concentrar: Raio homebrew', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Encerrar concentração', exact: true }),
  ).toBeVisible();
  await panel.getByLabel('Nova condição', { exact: true }).fill('Envenenado');
  await panel.getByRole('button', { name: 'Aplicar condição', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Remover Envenenado', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Recursos', exact: true }).click();
  await panel.getByRole('button', { name: 'Gastar espaço 1', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Gastar espaço 1', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Recuperar espaço 1', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Gastar espaço 1', exact: true })).toBeEnabled();
  expect(session.operations.map((x) => x.command.tipo)).toEqual([
    'concentracao',
    'condicao',
    'gasto',
    'gasto',
  ]);
  expect(session.operations.map((x) => x.command.versao)).toEqual([1, 2, 3, 4]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('compra com preço alterado exige revisar a oferta antes de gastar moedas', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  sheets.rows[0].conteudo.inventario.moedas.po = 10;
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Loja', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Compra 200 PC');
  session.beforeOperation = () => {
    session.mesa.estado.loja.ofertas[0].preco = 300;
    session.mesa.versao++;
  };
  await dialog.getByRole('button', { name: 'Comprar Poção de cura', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Outra janela alterou');
  await expect(dialog).toContainText('Compra 300 PC');
  expect(sheets.rows[0].conteudo.inventario.moedas.po).toBe(10);
  expect(sheets.rows[0].conteudo.inventario.itens).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Comprar Poção de cura', exact: true }).click();
  await expect(dialog).toContainText('7 PO');
  expect(session.operations.map((x) => x.command.preco_unitario)).toEqual([200, 300]);
});

test('conflito de ficha recarrega PV e revogação elimina a ficha visível', async ({ page }) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  sheets.rows[0].conteudo.combate.pvMaximos = 20;
  sheets.rows[0].conteudo.combate.pvAtuais = 20;
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(panel).toContainText('PV 20/20');
  session.beforeOperation = () => {
    sheets.rows[0].versao++;
    sheets.rows[0].conteudo.combate.pvAtuais = 10;
  };
  await panel.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Outra janela alterou');
  await expect(panel).toContainText('PV 10/20');
  await panel.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(panel).toContainText('PV 9/20');
  expect(session.operations.at(-1).command.versao).toBe(2);
  session.denied = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(panel.getByRole('alert')).toContainText('Seu acesso');
  await expect(panel.getByRole('button', { name: 'Aplicar dano', exact: true })).toHaveCount(0);
  await expect(panel).not.toContainText('PV 9/20');
});

test('operação pendente ou sem confirmação protege navegação e saída da conta', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(panel.getByRole('button', { name: 'Aplicar dano', exact: true })).toBeEnabled();
  let resolve!: () => void;
  session.delay = new Promise<void>((done) => {
    resolve = done;
  });
  session.lost = true;
  try {
    await panel.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
    await expect(panel).toContainText('Confirmando operação');
    await page.getByRole('link', { name: 'Compêndio', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat$/);
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  } finally {
    resolve();
  }
  session.delay = null;
  await expect(panel.getByRole('button', { name: 'Reenviar operação' })).toBeVisible();
  await page.getByRole('link', { name: 'Compêndio', exact: true }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await panel.getByRole('button', { name: 'Reenviar operação' }).click();
  await expect(panel.getByRole('button', { name: 'Reenviar operação' })).toHaveCount(0);
  expect(session.operations[0].id).toBe(session.operations[1].id);
  await page.getByRole('link', { name: 'Compêndio', exact: true }).click();
  await expect(page).toHaveURL(/#\/compendio$/);
});

test('mestre configura loja e edição antiga não sobrescreve estoque de outra janela', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true }),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Loja', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const summary = dialog.getByText('Editar oferta: Poção de cura', { exact: true });
  await summary.click();
  await dialog.getByLabel('Preço de compra (PC)', { exact: true }).fill('300');
  session.mesa.versao++;
  session.mesa.estado.loja.ofertas[0].estoque = 2;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(dialog).toContainText('A mesa mudou durante a edição');
  await dialog.getByRole('button', { name: 'Salvar oferta', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Outra janela alterou');
  expect(session.mesa.estado.loja.ofertas[0].preco).toBe(200);
  expect(session.mesa.estado.loja.ofertas[0].estoque).toBe(2);
  await summary.click();
  await summary.click();
  await dialog.getByLabel('Preço de compra (PC)', { exact: true }).fill('300');
  await dialog.getByRole('button', { name: 'Salvar oferta', exact: true }).click();
  await expect(dialog).toContainText('Compra 300 PC');
  expect(session.mesa.estado.loja.ofertas[0].estoque).toBe(2);
  await dialog.getByRole('button', { name: 'Fechar negócios', exact: true }).click();
  await expect(dialog).toContainText('A loja está fechada');
  expect(session.mesa.estado.loja.nome).toBe('Loja de Othans');
  await dialog.getByLabel('Nome do produto', { exact: true }).fill('Espada');
  await dialog.getByRole('button', { name: 'Adicionar oferta', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Espada', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abrir negócios', exact: true }).click();
  await expect(dialog).toContainText('Aberta para negócios');
});
