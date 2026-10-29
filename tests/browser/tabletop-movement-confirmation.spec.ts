import { test, expect, type Page } from '@playwright/test';
import { backend, ownerId, campaignId } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, tabletopState, sceneId, tokenId, otherTokenId } from './tabletop-backend';
import { CELL } from '../../apps/web/features/tabletop/geometry';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function openMap(page: Page) {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await expect(hero).toBeVisible();
  return { maps, chat, hero, shape: hero.locator('..') };
}
async function dragHero(page: Page) {
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  const points = await hero.evaluate((node, cell) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    return {
      x: matrix.e + (cell / 2) * matrix.a,
      y: matrix.f + (cell / 2) * matrix.d,
      dx: cell * matrix.a,
    };
  }, CELL);
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.x + points.dx, points.y, { steps: 4 });
  await page.mouse.up();
}

test('token mantém a posição solta durante envio, leitura antiga e confirmação seguida de leitura lenta', async ({
  page,
}) => {
  const { maps, chat, shape } = await openMap(page);
  const operation = gate(),
    read = gate();
  maps.delay = operation.promise;
  // Exercise the HTTP confirmation path with Realtime temporarily disconnected.
  for (const socket of chat.sockets)
    socket.filters = socket.filters.filter((f) => f.table !== 'invalidacoes_mapa');
  await dragHero(page);
  await expect.poll(() => maps.operations.length).toBe(1);
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
  expect(maps.tokens.find((t) => t.id === tokenId)?.x).toBe(3);
  const freshRead = page.waitForResponse((response) => response.url().includes('/tokens_mapa'));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await freshRead;
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
  let reads = 0;
  await page.route('https://weirs-test.supabase.co/rest/v1/cenas_mapa**', async (route) => {
    reads++;
    await read.promise;
    await route.fallback();
  });
  operation.resolve();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
  read.resolve();
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
});

test('rejeição de versão remove a posição provisória e mostra a posição autorizada', async ({
  page,
}) => {
  const { maps, shape } = await openMap(page);
  const operation = gate();
  maps.delay = operation.promise;
  maps.beforeOperation = () => {
    const row = maps.tokens.find((t) => t.id === tokenId)!;
    row.x = 9;
    row.versao++;
  };
  await dragHero(page);
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
  operation.resolve();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(shape).toHaveAttribute('transform', `translate(${9 * CELL} ${3 * CELL})`);
});

test('seleção múltipla mantém todas as posições pendentes sem alterar as versões enviadas', async ({
  page,
}) => {
  const { maps, hero, shape } = await openMap(page);
  maps.tokens.find((t) => t.id === otherTokenId)!.controlador_id = ownerId;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await hero.click();
  const other = page.getByRole('button', { name: 'Token Guarda', exact: true });
  await other.click({ modifiers: ['Shift'] });
  const operation = gate();
  maps.delay = operation.promise;
  await other.press('ArrowRight');
  await expect.poll(() => maps.operations.length).toBe(1);
  await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
  await expect(other.locator('..')).toHaveAttribute(
    'transform',
    `translate(${8 * CELL} ${3 * CELL})`,
  );
  expect(maps.operations[0].command.itens.map((item: any) => item.versao)).toEqual([1, 1]);
  operation.resolve();
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
});

for (const outcome of ['retry', 'release', 'newer', 'removed'] as const) {
  test(`movimento sem confirmação preserva a tentativa e respeita ${outcome}`, async ({ page }) => {
    const { maps, hero, shape } = await openMap(page);
    const attempts: any[] = [];
    await page.route('https://weirs-test.supabase.co/rest/v1/rpc/operar_mapa', async (route) => {
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"message":"offline"}',
        });
      else await route.fallback();
    });
    await dragHero(page);
    const retry = page.getByRole('button', { name: 'Reenviar alteração', exact: true });
    await expect(retry).toBeVisible();
    await expect(shape).toHaveAttribute('transform', `translate(${4 * CELL} ${3 * CELL})`);
    if (outcome === 'release') {
      await page.getByRole('button', { name: 'Liberar nova alteração', exact: true }).click();
      await expect(retry).toHaveCount(0);
      await expect(shape).toHaveAttribute('transform', `translate(${3 * CELL} ${3 * CELL})`);
      expect(attempts).toHaveLength(1);
      return;
    }
    if (outcome === 'newer') {
      const row = maps.tokens.find((t) => t.id === tokenId)!;
      row.x = 9;
      row.versao++;
    } else if (outcome === 'removed') {
      maps.tokens = maps.tokens.filter((t) => t.id !== tokenId);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    if (outcome === 'removed') await expect(hero).toHaveCount(0);
    else
      await expect(shape).toHaveAttribute(
        'transform',
        `translate(${(outcome === 'newer' ? 9 : 4) * CELL} ${3 * CELL})`,
      );
    await retry.click();
    await expect(retry).toHaveCount(0);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    if (outcome === 'removed') await expect(hero).toHaveCount(0);
    else
      await expect(shape).toHaveAttribute(
        'transform',
        `translate(${(outcome === 'newer' ? 9 : 4) * CELL} ${3 * CELL})`,
      );
  });
}

test('posição pendente não altera a prévia de visão calculada das posições confirmadas', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const state = tabletopState();
  state.scenes[0].modo_visao = 'automatica';
  const layer = '72000000-0000-4000-a000-000000000001';
  state.layers.push({
    id: layer,
    campanha_id: campaignId,
    cena_id: sceneId,
    versao: 1,
    nome: 'Jogadores',
    ordem: 1,
    visivel: true,
    bloqueada: false,
    finalidade: 'jogadores',
  });
  state.tokens.forEach((token) => {
    token.camada_id = layer;
    token.alcance_visao = 5;
  });
  const maps = await tabletopBackend(page, sheets, chat, state, { master: true });
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await hero.click();
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  const preview = page.getByLabel('Prévia da visão dos tokens selecionados', { exact: true });
  await preview.check();
  const mask = page.locator('mask[id^="previewFog"]');
  const before = await mask.evaluate((node) => node.innerHTML);
  const operation = gate();
  maps.delay = operation.promise;
  await hero.press('ArrowRight');
  await expect.poll(() => maps.operations.length).toBe(1);
  await preview.uncheck();
  await preview.check();
  expect(await mask.evaluate((node) => node.innerHTML)).toBe(before);
  operation.resolve();
});
