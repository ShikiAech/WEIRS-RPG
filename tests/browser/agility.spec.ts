import { test, expect, type Page, type Response } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { tabletopBackend, tokenId, otherTokenId, hiddenTokenId } from './tabletop-backend';
import { campaignId, ownerId } from './backend';

async function mapView(page: Page) {
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('application', { name: 'Mapa da campanha' })).toBeVisible();
}

async function capture(page: Page, step: string) {
  await page.screenshot({
    path: `artifacts/agility-audit/after-${step}-${test.info().project.name}.png`,
    fullPage: true,
  });
}

test('auditoria de agilidade: mapa, ficha, rolagem, combate e loja', async ({ page }) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  await sessionBackend(page, sheets, chat);
  await tabletopBackend(page, sheets, chat, undefined, { master: true });
  sheets.rows[0].conteudo.combate.pvMaximos = 20;
  sheets.rows[0].conteudo.combate.pvAtuais = 20;
  await page.goto('app.html#/chat');
  await mapView(page);
  await capture(page, '01-map');
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ficha do token', exact: true })).toBeVisible();
  await capture(page, '02-token');
  await page.getByRole('button', { name: 'Ficha do token', exact: true }).click();
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(sheet).toContainText('PV 20/20');
  await capture(page, '03-sheet');
  await sheet.getByRole('button', { name: 'Força +0', exact: true }).click();
  const diceCanvas = page.getByRole('region', { name: 'Dados 3D' }).locator('canvas');
  await expect(diceCanvas).toBeVisible();
  expect(
    await diceCanvas.evaluate((canvas) => {
      const r = canvas.getBoundingClientRect();
      return [0.05, 0.95].every(
        (y) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height * y) === canvas,
      );
    }),
  ).toBe(true);
  await capture(page, '04-launch');
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  await capture(page, '04-roll');
  await sheet.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  const combat = page.getByRole('complementary', { name: 'Combate da campanha' });
  await expect(combat).toBeVisible();
  await capture(page, '05-combat');
  await combat.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.getByRole('button', { name: 'Loja', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture(page, '06-shop');
  await page.getByRole('button', { name: 'Fechar loja', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('seleção múltipla move e duplica tokens; desfazer e refazer preservam identidades e posições', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await mapView(page);
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  const guard = page.getByRole('button', { name: 'Token Guarda', exact: true });
  await hero.click();
  await guard.click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Duplicar seleção', exact: true })).toBeVisible();
  await hero.focus();
  await hero.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(4);
  expect(maps.tokens.find((token) => token.id === otherTokenId)?.x).toBe(8);
  expect(maps.operations.at(-1)?.command.tipo).toBe('tokens_lote');
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  await hero.focus();
  await hero.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(5);
  expect(maps.tokens.find((token) => token.id === otherTokenId)?.x).toBe(9);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(4);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(3);
  expect(maps.tokens.find((token) => token.id === otherTokenId)?.x).toBe(7);
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(4);
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(5);
  await page.getByRole('button', { name: 'Duplicar seleção', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(5);
  const originals = new Set([tokenId, otherTokenId, hiddenTokenId]);
  const copies = maps.tokens.filter((token) => !originals.has(token.id));
  expect(new Set(copies.map((token) => token.id)).size).toBe(2);
  expect(copies.every((token) => token.combate_id === null)).toBe(true);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(3);
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(5);
  await capture(page, '07-multiselect');
});

test('conflito no lote preserva todos os tokens e exige revisar as posições atuais', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await mapView(page);
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await hero.click();
  await page
    .getByRole('button', { name: 'Token Guarda', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Duplicar seleção', exact: true })).toBeVisible();
  maps.beforeOperation = () => {
    const guard = maps.tokens.find((token) => token.id === otherTokenId)!;
    guard.x = 12;
    guard.versao++;
  };
  await hero.focus();
  await hero.press('ArrowRight');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(maps.tokens.find((token) => token.id === tokenId)?.x).toBe(3);
  expect(maps.tokens.find((token) => token.id === otherTokenId)?.x).toBe(12);
  await expect(
    page.getByRole('button', { name: 'Desfazer alteração', exact: true }),
  ).toBeDisabled();
});

test('refazer duplicação remapeia a identidade da cópia para refazer seu movimento seguinte', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicar seleção', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(4);
  const originalIds = new Set([tokenId, otherTokenId, hiddenTokenId]);
  const copy = maps.tokens.find((token) => !originalIds.has(token.id))!;
  const oldId = copy.id,
    startX = copy.x;
  const copyControl = page.locator('[data-token-id="' + copy.id + '"]');
  await copyControl.click();
  await copyControl.focus();
  await copyControl.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((token) => token.id === oldId)?.x).toBe(startX + 1);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.find((token) => token.id === oldId)?.x).toBe(startX);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(3);
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(4);
  const replacement = maps.tokens.find((token) => !originalIds.has(token.id))!;
  expect(replacement.id).not.toBe(oldId);
  await page.getByRole('button', { name: 'Refazer alteração', exact: true }).click();
  await expect
    .poll(() => maps.tokens.find((token) => token.id === replacement.id)?.x)
    .toBe(startX + 1);
  expect(maps.tokens.find((token) => token.id === tokenId)?.x).toBe(3);
});

test('área de magia usa escala em pés e se compartilha com outra sessão', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  const sheets = await backend(page, { master: true });
  const playerSheets = await backend(player);
  const chat = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, chat);
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await tabletopBackend(player, playerSheets, chat, maps);
  await page.goto('app.html#/chat');
  await player.goto('app.html#/chat');
  await mapView(page);
  await mapView(player);
  await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
  await page.getByRole('combobox', { name: 'Forma da área', exact: true }).selectOption('circulo');
  await page.getByLabel('Tamanho da área (pés)', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Posicionar no mapa', exact: true }).click();
  const position = await page
    .getByRole('application', { name: 'Mapa da campanha' })
    .evaluate((node) => {
      const svg = node as SVGSVGElement,
        layer = svg.querySelector(':scope > g') as SVGGraphicsElement;
      const point = svg.createSVGPoint();
      point.x = 15 * 64;
      point.y = 10 * 64;
      const result = point.matrixTransform(layer.getScreenCTM()!);
      return { x: result.x, y: result.y };
    });
  await page.mouse.click(position.x, position.y);
  await page.getByRole('button', { name: 'Confirmar área', exact: true }).click();
  await expect.poll(() => maps.areas.length).toBe(1);
  expect(maps.areas[0]).toMatchObject({ forma: 'circulo', tamanho: 3 });
  await player.bringToFront();
  await expect(player.locator('.map-area')).toHaveCount(1);
  await capture(player, '08-shared-area');
  expect(chat.commands).toHaveLength(0);
  await player.close();
});

test('resposta perdida de duplicação reenvia o mesmo pedido sem criar mais cópias', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  maps.lost = true;
  await page.getByRole('button', { name: 'Duplicar seleção', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Reenviar alteração', exact: true });
  await expect(retry).toBeVisible({ timeout: 20000 });
  expect(maps.tokens).toHaveLength(4);
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(maps.tokens).toHaveLength(4);
  expect(maps.operations.at(-1)?.pedido).toBe(maps.operations.at(-2)?.pedido);
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.tokens.length).toBe(3);
});

test('desfazer rejeita a posição alterada por outra sessão sem sobrescrevê-la', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await mapView(page);
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await hero.click();
  await hero.focus();
  await hero.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((token) => token.id === tokenId)?.x).toBe(4);
  await expect(page.getByRole('button', { name: 'Desfazer alteração', exact: true })).toBeEnabled();
  maps.beforeOperation = () => {
    const token = maps.tokens.find((entry) => entry.id === tokenId)!;
    token.x = 10;
    token.versao++;
  };
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(maps.tokens.find((token) => token.id === tokenId)?.x).toBe(10);
  expect(maps.operations.at(-1)?.command.versao).toBe(2);
});

test('áreas vinculadas a tokens ocultos não chegam à sessão do jogador', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  const sheets = await backend(page, { master: true });
  const playerSheets = await backend(player);
  const chat = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, chat);
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  maps.areas.push({
    id: crypto.randomUUID(),
    campanha_id: campaignId,
    cena_id: maps.scenes[0].id,
    versao: 1,
    usuario_id: ownerId,
    token_id: hiddenTokenId,
    nome: 'Armadilha ainda secreta',
    forma: 'circulo',
    x: 9,
    y: 4,
    tamanho: 3,
    largura: 1,
    angulo: 0,
    cor: '#cc3333',
  });
  await tabletopBackend(player, playerSheets, chat, maps);
  const payloads: string[] = [];
  const bodyReads: Promise<void>[] = [];
  const bodyErrors: { url: string; error: unknown }[] = [];
  const captureAreaResponse = (response: Response) => {
    if (!/\/rest\/v1\/areas_mapa/.test(response.url())) return;
    // EventEmitter não aguarda callbacks async. Monitore cada leitura para não
    // validar uma lista incompleta nem abortar o body ao fechar a página.
    bodyReads.push(
      response.text().then(
        (body) => {
          payloads.push(body);
        },
        (error) => {
          bodyErrors.push({ url: response.url(), error });
        },
      ),
    );
  };
  player.on('response', captureAreaResponse);
  try {
    await page.goto('app.html#/chat');
    await player.goto('app.html#/chat');
    await mapView(page);
    await mapView(player);
    await expect(page.locator('.map-area')).toHaveCount(1);
    await expect(player.locator('.map-area')).toHaveCount(0);
    await expect.poll(() => bodyReads.length).toBeGreaterThan(0);
  } finally {
    player.off('response', captureAreaResponse);
    await Promise.all(bodyReads);
  }
  expect(bodyErrors, 'Toda resposta de áreas capturada deve ter seu body lido').toEqual([]);
  expect(
    payloads.length,
    'A verificação deve inspecionar ao menos uma resposta de áreas',
  ).toBeGreaterThan(0);
  expect(payloads.join('\n')).not.toContain('Armadilha ainda secreta');
  await player.close();
});

test('perda do papel de mestre remove a lista privada mesmo quando o mapa fica offline', async ({
  page,
}) => {
  const role = { master: true };
  const sheets = await backend(page, role);
  const chat = await chatBackend(page, undefined, role);
  const maps = await tabletopBackend(page, sheets, chat, undefined, role);
  const privateSceneId = '74000000-0000-4000-a000-000000000001';
  const privateTokenId = '74000000-0000-4000-a000-000000000002';
  maps.scenes.push({
    ...structuredClone(maps.scenes[0]),
    id: privateSceneId,
    nome: 'Câmara reservada do mestre',
    publicada: false,
    ativa: false,
  });
  maps.tokens.push({
    ...structuredClone(maps.tokens[0]),
    id: privateTokenId,
    cena_id: privateSceneId,
    nome: 'Prisioneiro secreto',
    ficha_id: null,
    controlador_id: null,
  });
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByRole('button', { name: /^Câmara reservada do mestre/ }).click();
  await expect(
    page.getByRole('button', { name: 'Token Prisioneiro secreto', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar tokens', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Selecionar token Prisioneiro secreto', exact: true }),
  ).toBeVisible();
  await page.route(
    /https:\/\/weirs-test\.supabase\.co\/rest\/v1\/(cenas_mapa|tokens_mapa|areas_mapa)(\?|$)/,
    (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  role.master = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByRole('combobox', { name: 'Visibilidade da rolagem', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Selecionar token Prisioneiro secreto', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Token Prisioneiro secreto', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.tabletop-center')).not.toContainText('Câmara reservada do mestre');
});

test('contexto do token ajusta PV e condições e favorito usa a versão atual e a visibilidade do mestre', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  await sessionBackend(page, sheets, chat);
  await tabletopBackend(page, sheets, chat, undefined, { master: true });
  sheets.rows[0].conteudo.combate.pvMaximos = 20;
  sheets.rows[0].conteudo.combate.pvAtuais = 20;
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await sheet.getByRole('button', { name: 'Favoritar Força +0', exact: true }).click();
  await sheet.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.getByLabel('Mensagem ou comando de dados').fill('Meu próximo turno');
  await page
    .getByRole('combobox', { name: 'Visibilidade da rolagem', exact: true })
    .selectOption('secreta');
  await mapView(page);
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  const actions = page.getByRole('region', { name: 'Ações do token', exact: true });
  await actions.getByText('PV e condições', { exact: true }).click();
  await actions.getByLabel('Quantidade de PV do token', { exact: true }).fill('3');
  await actions.getByRole('button', { name: 'Aplicar dano no token', exact: true }).click();
  await expect(page.locator('.map-selection')).toContainText('PV 17/20');
  await actions.getByLabel('Condição do token', { exact: true }).fill('Envenenado');
  await actions.getByRole('button', { name: 'Aplicar condição no token', exact: true }).click();
  await expect(
    actions.getByRole('button', { name: 'Remover condição Envenenado', exact: true }),
  ).toBeVisible();
  await actions.getByText('PV e condições', { exact: true }).click();
  await actions.getByText('Ações rápidas', { exact: true }).click();
  await actions
    .getByRole('combobox', { name: 'Modo das ações rápidas', exact: true })
    .selectOption('vantagem');
  await actions
    .getByRole('region', { name: 'Ações favoritas', exact: true })
    .getByRole('button', { name: 'Força +0', exact: true })
    .click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    tipo: 'acao',
    acao: 'atributo',
    entrada_id: 'for',
    modo: 'vantagem',
    versao: 3,
    secreta: true,
  });
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('Meu próximo turno');
  await expect(page.getByRole('log')).toContainText('Somente mestres');
  await capture(page, '09-token-actions');
});

test('jogador não recebe controles de PV ou favoritos para token sem sua ficha', async ({
  page,
}) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  await sessionBackend(page, sheets, chat);
  await tabletopBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Token Guarda', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Aplicar dano no token', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ações favoritas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Duplicar seleção', exact: true })).toHaveCount(0);
});

test('lista de tokens oferece seleção por teclado e foco para mover sem acertar um alvo pequeno', async ({
  page,
}) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Selecionar tokens', exact: true }).click();
  const select = page.getByRole('button', { name: 'Selecionar token Zephira', exact: true });
  await select.focus();
  await select.press('Enter');
  const token = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await expect(token).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((row) => row.id === tokenId)?.x).toBe(4);
  await expect(page.locator('.map-selection')).toContainText('Zephira');
  await capture(page, '11-token-list-keyboard');
});

test('contexto de NPC vinculado ao combate ajusta PV sem criar ficha', async ({ page }) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const session = await sessionBackend(page, sheets, chat);
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  const npcId = '73000000-0000-4000-a000-000000000001';
  session.mesa.estado.combate.participantes.push({
    id: npcId,
    nome: 'Guarda',
    pvAtuais: 12,
    pvMaximos: 12,
    ca: 13,
    iniciativa: 10,
  });
  maps.tokens.find((token) => token.id === otherTokenId)!.combate_id = npcId;
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Token Guarda', exact: true }).click();
  const actions = page.getByRole('region', { name: 'Ações do token', exact: true });
  await actions.getByText('PV do NPC', { exact: true }).click();
  await actions.getByLabel('Quantidade de PV do token', { exact: true }).fill('3');
  await actions.getByRole('button', { name: 'Aplicar dano no token', exact: true }).click();
  await expect(page.locator('.map-selection')).toContainText('PV 9/12');
  expect(session.operations[0].command).toMatchObject({
    tipo: 'combate',
    acao: 'dano',
    id: npcId,
    versao: 0,
    expressao: '3',
  });
  expect(sheets.creates).toBe(0);
});

test('combate permanece operável no celular após animação e loja devolve foco ao fechar por teclado', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  await sessionBackend(page, sheets, chat);
  await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d20');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: 'Combate', exact: true }).click();
  const combat = page.getByRole('complementary', { name: 'Combate da campanha' });
  if (test.info().project.name === 'mobile')
    await expect(
      page.getByRole('button', { name: 'Mesa de dados 3D', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
  await combat.getByLabel('Nome do NPC', { exact: true }).fill('Goblin');
  await combat.getByRole('button', { name: 'Adicionar ao encontro', exact: true }).click();
  await expect(combat).toContainText('Goblin');
  await combat.getByRole('button', { name: 'Iniciar combate', exact: true }).click();
  await expect(combat).toContainText('Combate ativo');
  await capture(page, '10-combat-unobstructed');
  await combat.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d20');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mesa de dados 3D', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  const shop = page.getByRole('button', { name: 'Loja', exact: true });
  await shop.focus();
  await shop.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fechar loja', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(shop).toBeFocused();
});

test('mestre alinha o fundo à grade com desfazer e configura aura em pés', async ({ page }) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  const imageId = '72000000-0000-4000-a000-000000000001';
  const path = campaignId + '/' + imageId;
  const body = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  maps.assets.push({
    id: imageId,
    campanha_id: campaignId,
    nome: 'Mapa alinhável',
    caminho: path,
    mime: 'image/png',
    tamanho: body.length,
    visibilidade: 'campanha',
    estado: 'pronto',
  });
  maps.objects.set(path, { body, mime: 'image/png' });
  maps.scenes[0].fundo_id = imageId;
  await page.goto('app.html#/chat');
  await mapView(page);
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByRole('button', { name: 'Editar cena Ruínas de Othans', exact: true }).click();
  await page.getByText('Alinhar imagem à grade', { exact: true }).click();
  await page.getByLabel('Deslocamento horizontal do fundo (células)', { exact: true }).fill('2');
  await page.getByLabel('Deslocamento vertical do fundo (células)', { exact: true }).fill('-1');
  await page.getByLabel('Escala do fundo (%)', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Salvar cena', exact: true }).click();
  await expect.poll(() => maps.scenes[0].fundo_escala).toBe(1.5);
  expect(maps.scenes[0]).toMatchObject({ fundo_x: 2, fundo_y: -1 });
  await page.getByRole('button', { name: 'Fechar ferramentas do mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Desfazer alteração', exact: true }).click();
  await expect.poll(() => maps.scenes[0].fundo_escala).toBe(1);
  expect(maps.scenes[0]).toMatchObject({ fundo_x: 0, fundo_y: 0 });
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  await page.getByRole('button', { name: 'Editar token', exact: true }).click();
  await page.getByText('Aura do token', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mostrar aura', exact: true }).check();
  await page.getByLabel('Raio da aura (pés)', { exact: true }).fill('15');
  await page.getByLabel('Cor da aura', { exact: true }).fill('#00ff00');
  await page.getByRole('button', { name: 'Salvar token', exact: true }).click();
  await expect
    .poll(() => maps.tokens.find((token) => token.id === tokenId)?.aura)
    .toEqual({ raio: 3, cor: '#00ff00' });
});
