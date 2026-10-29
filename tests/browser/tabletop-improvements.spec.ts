import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend } from './tabletop-backend';
test('ruler centers, styling, pinned persistence and explicit hover area cancellation', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const canvas = page.getByRole('application', { name: 'Mapa da campanha' });
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Régua', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Fixar régua', exact: true }).click();
  await expect(page.getByLabel('Régua fixada')).toHaveCount(1);
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click();
  await expect(page.getByLabel('Régua fixada')).toHaveCount(1);
  await canvas.press('Escape');
  await expect(page.getByLabel('Régua fixada')).toHaveCount(1);
  await page.getByRole('button', { name: 'Régua', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir régua', exact: true }).click();
  await expect(page.getByLabel('Régua fixada')).toHaveCount(0);
  await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
  await page.getByRole('button', { name: 'Posicionar no mapa', exact: true }).click();
  const preview = page.locator('[data-area-id="preview"]');
  const before = await preview.getAttribute('transform');
  await page.mouse.move(box.x + 250, box.y + 250);
  await expect(preview).not.toHaveAttribute('transform', before!);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Confirmar área', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(maps.operations.some((o) => o.command.tipo === 'area_criar')).toBe(false);
  await expect(preview).toHaveCount(0);
});
import { ownerId, campaignId } from './backend';
import { sceneId, tokenId, otherTokenId, tabletopState } from './tabletop-backend';
test('automatic snapshot hides unseen DOM and lists; no-source notice fails closed', async ({
  page,
}) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  const state = tabletopState();
  state.scenes[0].modo_visao = 'automatica';
  state.walls = [
    {
      id: 'wall',
      campanha_id: campaignId,
      cena_id: sceneId,
      versao: 1,
      x1: 6,
      y1: 0,
      x2: 6,
      y2: 16,
      porta: true,
      aberta: false,
    },
  ];
  await tabletopBackend(page, sheets, chat, state);
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveCount(0);
  await expect(page.getByText('Emboscada secreta', { exact: true })).toHaveCount(0);
  expect(await page.locator('[data-token-id]').count()).toBe(1);
  state.tokens.find((t) => t.id === tokenId)!.visao = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('status').filter({ hasText: 'Sem token próprio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveCount(0);
});
test('player controls group through list checkboxes without duplication permission', async ({
  page,
}) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  maps.tokens.find((t) => t.id === otherTokenId)!.controlador_id = ownerId;
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  await page
    .getByRole('button', { name: 'Token Guarda', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Duplicar seleção', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Token Guarda', exact: true }).press('ArrowRight');
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(4);
  expect(maps.tokens.find((t) => t.id === otherTokenId)?.x).toBe(8);
});
test('a newer invalidation discards an in-flight snapshot before hidden rows can reappear', async ({
  page,
}) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  maps.scenes[0].modo_visao = 'automatica';
  let visible = true,
    delayed = false,
    started = false;
  let release = () => {};
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', async (route) => {
    const body = {
      cena: maps.scenes[0],
      revisao: visible ? 1 : 2,
      atual: ['3,3', '7,3'],
      explorada: ['3,3', '7,3'],
      sem_fonte: false,
      tokens: maps.tokens.filter((t) => !t.oculto && (visible || t.id === tokenId)),
      areas: [],
      camadas: [],
      paredes: [],
      objetos: [],
      atribuicoes: [],
      assets: [],
    };
    if (delayed) {
      delayed = false;
      started = true;
      await new Promise<void>((r) => {
        release = r;
      });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toBeVisible();
  await expect
    .poll(() => chat.sockets.some((s) => s.filters.some((f) => f.table === 'invalidacoes_mapa')))
    .toBe(true);
  delayed = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => started).toBe(true);
  visible = false;
  for (const socket of chat.sockets) {
    const ids = socket.filters.filter((f) => f.table === 'invalidacoes_mapa').map((f) => f.id);
    if (ids.length && socket.topic)
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
              table: 'invalidacoes_mapa',
              type: 'UPDATE',
              record: { campanha_id: campaignId, usuario_id: ownerId, revisao: 2 },
              old_record: {},
              columns: [],
              errors: null,
              commit_timestamp: new Date().toISOString(),
            },
          },
        ]),
      );
  }
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveCount(0);
});
test('DM creates arbitrary layers and walls, switches door state and sees explicit vision controls', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  maps.scenes[0].modo_visao = 'automatica';
  maps.layers = [
    {
      id: 'layer',
      campanha_id: campaignId,
      cena_id: sceneId,
      versao: 1,
      nome: 'Jogadores',
      ordem: 1,
      visivel: true,
      bloqueada: false,
    },
  ];
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  await page.getByLabel('Nome da camada', { exact: true }).fill('Efeitos');
  await page.getByRole('button', { name: 'Criar camada', exact: true }).click();
  await expect(page.getByLabel('Visível: Efeitos', { exact: true })).toBeChecked();
  await page.getByLabel('Porta', { exact: true }).check();
  await page.getByRole('button', { name: 'Criar parede ou porta', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir porta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fechar porta', exact: true })).toBeVisible();
  expect(maps.walls[0].aberta).toBe(true);
  await expect(page.getByLabel('Alcance de Zephira (pés)', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `output/tabletop-controls-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('spectator follows an explicitly assigned source and cannot edit its token', async ({
  page,
}) => {
  const sheets = await backend(page, { readonly: true });
  const chat = await chatBackend(page, undefined, { readonly: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { readonly: true });
  maps.scenes[0].modo_visao = 'automatica';
  let following = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cena: maps.scenes[0],
        revisao: following ? 2 : 1,
        sem_fonte: !following,
        atual: following ? ['3,3'] : [],
        explorada: [],
        tokens: following ? maps.tokens.filter((t) => t.id === tokenId) : [],
        areas: [],
        camadas: [],
        paredes: [],
        objetos: [],
        atribuicoes: [],
        assets: [],
      }),
    }),
  );
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'O mestre precisa atribuir' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toHaveCount(0);
  following = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await expect(hero).toBeVisible();
  await hero.click();
  await hero.press('ArrowRight');
  expect(maps.operations).toHaveLength(0);
  await expect(
    page.getByRole('button', { name: 'Remover token do mapa', exact: true }),
  ).toHaveCount(0);
});
test('Enter preserves a ruler waypoint during an active pointer gesture', async ({ page }) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const canvas = page.getByRole('application', { name: 'Mapa da campanha' });
  await expect(canvas).toBeVisible();
  const points = await canvas.evaluate((node) => {
    const svg = node as SVGSVGElement,
      layer = svg.querySelector(':scope > g') as SVGGraphicsElement;
    return [
      [4.5, 4.5],
      [7.5, 4.5],
      [7.5, 7.5],
    ].map(([x, y]) => {
      const p = svg.createSVGPoint();
      p.x = x * 64;
      p.y = y * 64;
      const at = p.matrixTransform(layer.getScreenCTM()!);
      return { x: at.x, y: at.y };
    });
  });
  await page.getByRole('button', { name: 'Régua', exact: true }).click();
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y);
  await page.keyboard.press('Enter');
  await page.mouse.move(points[2].x, points[2].y);
  await page.mouse.up();
  await expect(page.locator('.map-status')).toContainText('30 pés');
});
test('new drawings use the stable map layer and clear by version without deleting private drawings', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  maps.scenes[0].modo_visao = 'automatica';
  maps.layers = [
    {
      id: 'private-layer',
      campanha_id: campaignId,
      cena_id: sceneId,
      versao: 1,
      nome: 'Mapa',
      finalidade: 'mestre',
      ordem: -1,
      visivel: false,
      bloqueada: false,
    },
    {
      id: 'map-layer',
      campanha_id: campaignId,
      cena_id: sceneId,
      versao: 1,
      nome: 'Cenário',
      finalidade: 'mapa',
      ordem: 0,
      visivel: true,
      bloqueada: true,
    },
  ];
  maps.placed = [
    {
      id: 'private-drawing',
      campanha_id: campaignId,
      cena_id: sceneId,
      camada_id: 'private-layer',
      versao: 1,
      nome: 'Privado',
      x: 1,
      y: 1,
      w: 1,
      h: 1,
      imagem_id: null,
      oculto: false,
      desenho: {
        id: 'secret',
        cor: '#ffffff',
        pontos: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    },
  ];
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const canvas = page.getByRole('application', { name: 'Mapa da campanha' });
  await expect(canvas).toBeVisible();
  const points = await canvas.evaluate((node) => {
    const svg = node as SVGSVGElement,
      layer = svg.querySelector(':scope > g') as SVGGraphicsElement;
    return [
      [4.5, 4.5],
      [7.5, 5.5],
    ].map(([x, y]) => {
      const p = svg.createSVGPoint();
      p.x = x * 64;
      p.y = y * 64;
      const at = p.matrixTransform(layer.getScreenCTM()!);
      return { x: at.x, y: at.y };
    });
  });
  await page.getByRole('button', { name: 'Desenhar no mapa', exact: true }).click();
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => maps.placed.length).toBe(2);
  const drawn = maps.placed.find((o) => o.id !== 'private-drawing')!;
  expect(drawn.camada_id).toBe('map-layer');
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  const clear = page.getByRole('button', { name: 'Limpar desenhos', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect.poll(() => maps.placed.map((o) => o.id)).toEqual(['private-drawing']);
  expect(maps.operations.at(-1)?.command).toEqual({
    tipo: 'desenhos_limpar',
    cena_id: sceneId,
    itens: [{ id: drawn.id, versao: drawn.versao }],
  });
});
