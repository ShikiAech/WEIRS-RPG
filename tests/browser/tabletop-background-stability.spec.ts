import { test, expect, type Page } from '@playwright/test';
import { backend, ownerId, campaignId } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, tabletopState, sceneId } from './tabletop-backend';
import { CELL } from '../../apps/web/features/tabletop/geometry';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function openMap(page: Page, master = false, automatic = false) {
  const sheets = await backend(page, { master });
  const chat = await chatBackend(page, undefined, { master });
  const state = tabletopState();
  const asset = {
    id: '73000000-0000-4000-a000-000000000001',
    campanha_id: campaignId,
    usuario_id: ownerId,
    nome: 'Mapa da campanha',
    caminho: campaignId + '/mapa.png',
    mime: 'image/png',
    tamanho: 68,
    estado: 'pronto' as const,
    visibilidade: 'campanha' as const,
    criado_em: '2026-10-29T12:00:00Z',
  };
  state.assets.push(asset);
  state.objects.set(asset.caminho, {
    mime: 'image/png',
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  state.scenes[0].fundo_id = asset.id;
  if (automatic) state.scenes[0].modo_visao = 'automatica';
  if (master) {
    state.scenes[0].modo_visao = 'manual';
    state.layers.push({
      id: '72000000-0000-4000-a000-000000000001',
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
      token.camada_id = state.layers[0].id;
    });
  }
  const maps = await tabletopBackend(page, sheets, chat, state, { master });
  let downloads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/storage/v1/object/') && request.method() === 'GET') downloads++;
  });
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const image = page
    .getByRole('application', { name: 'Mapa da campanha' })
    .locator('image')
    .first();
  await expect(image).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.map-status')).not.toContainText('Atualizando');
  await expect
    .poll(() => chat.sockets.some((s) => s.filters.some((f) => f.table === 'invalidacoes_mapa')))
    .toBe(true);
  // Observe the actual painted element throughout refresh, rather than only its final state.
  await image.evaluate((node) => {
    const observed = window as any;
    observed.backgroundElement = node;
    observed.backgroundHref = node.getAttribute('href');
    observed.backgroundRemoved = false;
    observed.backgroundHrefChanged = false;
    observed.backgroundObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === 'childList' &&
          [...record.removedNodes].some((removed) => removed === node || removed.contains(node))
        )
          observed.backgroundRemoved = true;
        if (
          record.type === 'attributes' &&
          record.target === node &&
          record.attributeName === 'href'
        )
          observed.backgroundHrefChanged = true;
      }
    });
    observed.backgroundObserver.observe(node.closest('svg')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  });
  return { maps, chat, image, downloads: () => downloads };
}
function publishInvalidation(
  chat: Awaited<ReturnType<typeof chatBackend>>,
  record: Record<string, unknown>,
) {
  for (const socket of chat.sockets) {
    const ids = socket.filters
      .filter((filter) => filter.table === 'invalidacoes_mapa')
      .map((filter) => filter.id);
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
              columns: [],
              old_record: {},
              errors: null,
              commit_timestamp: new Date().toISOString(),
              record,
            },
          },
        ]),
      );
  }
}
async function dragHero(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
  ).toBeEnabled();
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  const p = await hero.evaluate((node, cell) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    return {
      x: matrix.e + (cell / 2) * matrix.a,
      y: matrix.f + (cell / 2) * matrix.d,
      dx: cell * matrix.a,
    };
  }, CELL);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + p.dx, p.y, { steps: 4 });
  await page.mouse.up();
}

for (const action of ['drop', 'layer', 'automatic-drop', 'fog'] as const) {
  test(`map image stays mounted with the same URL and download across realtime ${action}`, async ({
    page,
  }) => {
    const { maps, image, downloads } = await openMap(
      page,
      action === 'layer' || action === 'fog',
      action === 'automatic-drop',
    );
    const mask = page.locator('mask[id^="automaticFog"]');
    const initialMask = action === 'automatic-drop' ? await mask.innerHTML() : '';
    const initialDownloads = downloads();
    const initialHref = await image.getAttribute('href');
    const read = gate();
    let refreshStarted = false;
    await page.route('https://weirs-test.supabase.co/rest/v1/cenas_mapa**', async (route) => {
      refreshStarted = true;
      await read.promise;
      await route.fallback();
    });
    if (action === 'fog') {
      await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
      await page.getByLabel('Cobrir áreas não reveladas', { exact: true }).click();
    } else if (action !== 'layer') await dragHero(page);
    else {
      await page.getByText('Camadas, visão e participantes', { exact: true }).click();
      await page.getByLabel('Nome da camada', { exact: true }).fill('Efeitos');
      await page.getByRole('button', { name: 'Criar camada', exact: true }).click();
    }
    await expect.poll(() => refreshStarted).toBe(true);
    // Observe the dirty revision itself, not just the new snapshot after it.
    await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toHaveCount(0);
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('href', initialHref!);
    if (action === 'automatic-drop') expect(await mask.innerHTML()).toBe(initialMask);
    read.resolve();
    await expect(page.locator('.map-status')).not.toContainText('Salvando');
    if (action === 'fog')
      await expect(page.getByLabel('Cobrir áreas não reveladas', { exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
    await expect(image).toHaveAttribute('href', initialHref!);
    expect(downloads()).toBe(initialDownloads);
    expect(
      await page.evaluate(() => ({
        removed: (window as any).backgroundRemoved,
        changed: (window as any).backgroundHrefChanged,
      })),
    ).toEqual({ removed: false, changed: false });
    expect(maps.operations).toHaveLength(1);
    if (action === 'drop' || action === 'automatic-drop') {
      await dragHero(page);
      await expect.poll(() => maps.operations.length).toBe(2);
      await expect(page.locator('.map-status')).not.toContainText('Salvando');
      await dragHero(page);
      await expect.poll(() => maps.operations.length).toBe(3);
      await expect(page.locator('.map-status')).not.toContainText('Salvando');
      await expect(image).toHaveAttribute('href', initialHref!);
      expect(downloads()).toBe(initialDownloads);
      expect(await page.evaluate(() => (window as any).backgroundRemoved)).toBe(false);
    }
    await page.screenshot({
      path: `artifacts/map-background-${action}-${test.info().project.name}.png`,
      fullPage: true,
    });
  });
}

test('old background pixels are never revealed through a cached mask after geometry changes', async ({
  page,
}) => {
  const { maps, chat, image, downloads } = await openMap(page, false, true);
  const initialHref = await image.getAttribute('href');
  const initialDownloads = downloads();
  const snapshot = gate();
  let started = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', async (route) => {
    started = true;
    await snapshot.promise;
    await route.fallback();
  });
  maps.scenes[0].fundo_x = 2;
  maps.invalidationRevision++;
  publishInvalidation(chat, {
    campanha_id: campaignId,
    usuario_id: ownerId,
    revisao: maps.invalidationRevision,
    revisao_fundo: maps.backgroundRevision,
  });
  await expect.poll(() => started).toBe(true);
  await expect(image).toHaveAttribute('x', String(2 * CELL));
  const mask = page.locator('mask[id^="automaticFog"]');
  await expect(mask.locator('rect[fill="black"]')).toHaveCount(0);
  await expect(mask.locator('rect[fill="#777"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toHaveCount(0);
  snapshot.resolve();
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
  await expect(mask.locator('rect[fill="black"]').first()).toBeAttached();
  await expect(image).toHaveAttribute('href', initialHref!);
  expect(downloads()).toBe(initialDownloads);
});

test('presentation mask keeps the geometry from its authoritative snapshot when reads straddle an update', async ({
  page,
}) => {
  const { maps, chat, image } = await openMap(page, false, true);
  let split = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/cenas_mapa**', async (route) => {
    if (split) return route.fallback();
    split = true;
    const oldScenes = structuredClone(maps.scenes);
    maps.scenes[0].unidade = 1;
    maps.tokens[0].nome = 'Zephira atualizada';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(oldScenes) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByRole('button', { name: 'Token Zephira atualizada', exact: true }),
  ).toBeVisible();
  const mask = page.locator('mask[id^="automaticFog"]');
  await expect(mask.locator('rect[fill="black"][width="1536"]').first()).toBeAttached();
  const read = gate();
  let started = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/cenas_mapa**', async (route) => {
    started = true;
    await read.promise;
    await route.fallback();
  });
  maps.invalidationRevision++;
  publishInvalidation(chat, {
    campanha_id: campaignId,
    usuario_id: ownerId,
    revisao: maps.invalidationRevision,
    revisao_fundo: maps.backgroundRevision,
  });
  await expect.poll(() => started).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Token Zephira atualizada', exact: true }),
  ).toHaveCount(0);
  await expect(image).toBeVisible();
  await expect(mask.locator('rect[fill="black"]')).toHaveCount(0);
  read.resolve();
  await expect(
    page.getByRole('button', { name: 'Token Zephira atualizada', exact: true }),
  ).toBeVisible();
});

test('an older authorized asset response cannot restore a revoked background', async ({ page }) => {
  const { maps, chat, image } = await openMap(page);
  const staleRead = gate();
  let started = false;
  const oldAssets = structuredClone(maps.assets);
  await page.route('https://weirs-test.supabase.co/rest/v1/arquivos_mapa**', async (route) => {
    if (!started) {
      started = true;
      await staleRead.promise;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(oldAssets) });
    } else await route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => started).toBe(true);
  maps.assets[0].visibilidade = 'mestre';
  maps.backgroundRevision = 2;
  maps.invalidationRevision = 2;
  publishInvalidation(chat, {
    campanha_id: campaignId,
    usuario_id: ownerId,
    revisao: 2,
    revisao_fundo: 2,
  });
  await expect(image).toHaveCount(0);
  staleRead.resolve();
  await expect(
    page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
  ).toBeEnabled();
  await expect(image).toHaveCount(0);
  maps.invalidationRevision++;
  publishInvalidation(chat, {
    campanha_id: campaignId,
    usuario_id: ownerId,
    revisao: 3,
    revisao_fundo: 2,
  });
  await expect(image).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
  await expect(image).toHaveCount(0);
});

for (const event of ['revoked-then-moved', 'legacy', 'reconnect'] as const) {
  test(`background access fails closed during ${event} with a delayed refresh`, async ({
    page,
  }) => {
    const { maps, chat, image, downloads } = await openMap(page);
    const initialDownloads = downloads();
    const read = gate();
    let started = false;
    await page.route('https://weirs-test.supabase.co/rest/v1/cenas_mapa**', async (route) => {
      started = true;
      await read.promise;
      await route.fallback();
    });
    maps.assets[0].visibilidade = 'mestre';
    maps.backgroundRevision = 2;
    maps.invalidationRevision = 2;
    const record: Record<string, unknown> = {
      campanha_id: campaignId,
      usuario_id: ownerId,
      revisao: 2,
      ...(event === 'legacy' ? {} : { revisao_fundo: 2 }),
    };
    if (event === 'reconnect') {
      // The repository reports an unqualified invalidation after joining a channel.
      for (const socket of chat.sockets) {
        if (socket.topic && socket.filters.some((f) => f.table === 'invalidacoes_mapa'))
          socket.ws.send(JSON.stringify([socket.join, socket.join, socket.topic, 'phx_error', {}]));
      }
    } else publishInvalidation(chat, record);
    await expect.poll(() => started).toBe(true);
    await expect(image).toHaveCount(0);
    if (event === 'revoked-then-moved') {
      maps.invalidationRevision++;
      publishInvalidation(chat, { ...record, revisao: 3 });
      await expect(image).toHaveCount(0);
    }
    read.resolve();
    await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
    await expect(image).toHaveCount(0);
    expect(downloads()).toBe(initialDownloads);
  });
}
