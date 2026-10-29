import { test, expect, type Page, type Locator } from '@playwright/test';
import { backend, ownerId, campaignId } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, tabletopState, sceneId, tokenId, otherTokenId } from './tabletop-backend';
import { CELL } from '../../apps/web/features/tabletop/geometry';

const renderErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  renderErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Encountered two children with the same key')
    )
      errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(
    renderErrors.get(page),
    'Rendering must preserve unique component identity without runtime errors',
  ).toEqual([]);
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function openTable(page: Page, role = { master: true }, portrait = false) {
  const sheets = await backend(page, role);
  const chat = await chatBackend(page, undefined, role);
  const state = tabletopState();
  state.scenes[0].modo_visao = 'manual';
  if (portrait) {
    const asset = {
      id: '73000000-0000-4000-a000-000000000002',
      campanha_id: campaignId,
      usuario_id: ownerId,
      nome: 'Retrato de Zephira',
      caminho: campaignId + '/zephira.png',
      mime: 'image/png',
      tamanho: 68,
      estado: 'pronto' as const,
      visibilidade: 'campanha' as const,
      criado_em: '2026-10-29T12:00:00Z',
    };
    state.assets.push(asset);
    state.objects.set(asset.caminho, {
      mime: asset.mime,
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    state.tokens.find((token) => token.id === tokenId)!.imagem_id = asset.id;
  }
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
  const maps = await tabletopBackend(page, sheets, chat, state, role);
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await expect(hero).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => chat.sockets.some((s) => s.filters.some((f) => f.table === 'invalidacoes_mapa')))
    .toBe(true);
  return { maps, chat, hero, sheets, role };
}

// Exercise the real Supabase subscription, including invalidations arriving while reads are pending.
function invalidate(
  chat: Awaited<ReturnType<typeof chatBackend>>,
  maps: ReturnType<typeof tabletopState>,
) {
  maps.revision++;
  maps.invalidationRevision++;
  for (const socket of chat.sockets) {
    const ids = socket.filters.filter((f) => f.table === 'invalidacoes_mapa').map((f) => f.id);
    if (!ids.length || !socket.topic) continue;
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
            record: {
              campanha_id: campaignId,
              usuario_id: ownerId,
              revisao: maps.invalidationRevision,
              revisao_fundo: maps.backgroundRevision,
            },
          },
        },
      ]),
    );
  }
}

async function delaySnapshot(page: Page) {
  const hold = gate();
  let started = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', async (route) => {
    started = true;
    await hold.promise;
    await route.fallback();
  });
  return { release: hold.release, started: () => started };
}

// A final screenshot cannot prove continuity: retain references and record every removal.
async function observe(page: Page, targets: Record<string, Locator>) {
  await page.evaluate(() => {
    (window as any).continuity = { nodes: {}, removed: [] };
  });
  for (const [name, locator] of Object.entries(targets)) {
    await locator.evaluate((node, key) => {
      (window as any).continuity.nodes[key] = node;
    }, name);
  }
  await page.evaluate(() => {
    const state = (window as any).continuity;
    state.observer = new MutationObserver((records) => {
      for (const record of records)
        for (const removed of record.removedNodes) {
          for (const [name, node] of Object.entries(state.nodes)) {
            if (removed === node || removed.contains(node as Node)) state.removed.push(name);
          }
        }
    });
    state.observer.observe(document.body, { subtree: true, childList: true });
  });
}

async function expectConnected(page: Page) {
  expect(
    await page.evaluate(() => {
      const state = (window as any).continuity;
      return {
        removed: state.removed,
        disconnected: Object.entries(state.nodes)
          .filter(([, node]) => !(node as Node).isConnected)
          .map(([name]) => name),
      };
    }),
  ).toEqual({ removed: [], disconnected: [] });
}

test('dropping a token keeps the entire tabletop and selected-token panel mounted until confirmation', async ({
  page,
}) => {
  const { maps, hero } = await openTable(page);
  await hero.click();
  const panel = page.getByLabel('Token selecionado', { exact: true });
  await expect(panel).toBeVisible();
  await observe(page, {
    hero,
    panel,
    tools: page.getByRole('navigation', { name: 'Ferramentas do mapa' }),
    layers: page.locator('.map-administration'),
  });
  if (test.info().project.name === 'desktop')
    await page.screenshot({ path: 'artifacts/tabletop-continuity-before.png', fullPage: true });
  const read = await delaySnapshot(page);
  try {
    const p = await hero.evaluate((node, cell) => {
      const m = (node as SVGGraphicsElement).getScreenCTM()!;
      return { x: m.e + (cell * m.a) / 2, y: m.f + (cell * m.d) / 2, dx: cell * m.a };
    }, CELL);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + p.dx, p.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(read.started).toBe(true);
    await expectConnected(page);
    for (const name of ['Arquivos da campanha', 'Cenas e mapas', 'Lista de tokens'])
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
    await expect(hero.locator('..')).toHaveAttribute(
      'transform',
      `translate(${4 * CELL} ${3 * CELL})`,
    );
    if (test.info().project.name === 'desktop')
      await page.screenshot({ path: 'artifacts/tabletop-continuity-pending.png', fullPage: true });
    read.release();
    await expect(page.locator('.map-status')).not.toContainText('Salvando');
    await expectConnected(page);
    await expect(hero.locator('..')).toHaveAttribute(
      'transform',
      `translate(${4 * CELL} ${3 * CELL})`,
    );
    expect(maps.operations).toHaveLength(1);
    if (test.info().project.name === 'desktop')
      await page.screenshot({
        path: 'artifacts/tabletop-continuity-confirmed.png',
        fullPage: true,
      });
  } finally {
    read.release();
  }
});

test('remote movement preserves selection, typed HP expression, focus and usable tools through refresh', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await hero.click();
  await page.getByText('PV e condições', { exact: true }).click();
  const amount = page.getByLabel('Quantidade de PV do token', { exact: true });
  await amount.fill('2d8 + 5');
  await observe(page, {
    hero,
    amount,
    panel: page.getByLabel('Token selecionado', { exact: true }),
    layers: page.locator('.map-administration'),
  });
  const read = await delaySnapshot(page);
  try {
    const other = maps.tokens.find((t) => t.id === otherTokenId)!;
    other.x++;
    other.versao++;
    invalidate(chat, maps);
    await expect.poll(read.started).toBe(true);
    await expectConnected(page);
    await expect(hero).not.toHaveAttribute('aria-busy', 'true');
    await expect(
      page.getByRole('button', { name: 'Token Guarda', exact: true }),
    ).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.map-token-sync')).toHaveCount(0);
    await expect(amount).toBeFocused();
    await expect(amount).toHaveValue('2d8 + 5');
    await expect(amount).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Régua', exact: true })).toBeEnabled();
    read.release();
    await expect(
      page.getByRole('button', { name: 'Token Guarda', exact: true }).locator('..'),
    ).toHaveAttribute('transform', `translate(${8 * CELL} ${3 * CELL})`);
    await expectConnected(page);
    await expect(amount).toBeFocused();
    await expect(amount).toHaveValue('2d8 + 5');
    expect(maps.operations).toHaveLength(0);
  } finally {
    read.release();
  }
});

test('a layer revision preserves its focused name draft and synchronizes untouched fields', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  const name = page.locator('.map-administration').getByLabel('Nome', { exact: true });
  const order = page.locator('.map-administration').getByLabel('Ordem', { exact: true });
  await name.fill('Rascunho da camada');
  await observe(page, { name, order, hero, layers: page.locator('.map-administration') });
  const read = await delaySnapshot(page);
  try {
    maps.layers[0].bloqueada = true;
    maps.layers[0].ordem = 3;
    maps.layers[0].versao++;
    invalidate(chat, maps);
    await expect.poll(read.started).toBe(true);
    await expectConnected(page);
    await expect(name).toBeFocused();
    read.release();
    await expect(page.getByLabel('Bloqueada: Jogadores', { exact: true })).toBeChecked();
    await expectConnected(page);
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Rascunho da camada');
    await expect(order).toHaveValue('3');
    expect(maps.operations).toHaveLength(0);
  } finally {
    read.release();
  }
});

test('token movement revisions preserve a focused sight-range draft without committing it', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  const range = page.getByLabel('Alcance de Zephira (pés)', { exact: true });
  await range.fill('90');
  await observe(page, { range, hero, layers: page.locator('.map-administration') });
  const token = maps.tokens.find((t) => t.id === tokenId)!;
  token.x++;
  token.versao++;
  invalidate(chat, maps);
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${4 * CELL} ${3 * CELL})`,
  );
  await expectConnected(page);
  await expect(range).toBeFocused();
  await expect(range).toHaveValue('90');
  expect(maps.operations).toHaveLength(0);
});

test('a temporary refresh failure retains the coherent scene and drafts until a successful retry', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  const name = page.getByLabel('Nome da camada', { exact: true });
  await name.fill('Efeitos pendentes');
  await observe(page, { hero, name, layers: page.locator('.map-administration') });
  await page.route(
    'https://weirs-test.supabase.co/rest/v1/cenas_mapa**',
    (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'Tempo limite de leitura excedido' }),
      }),
    { times: 1 },
  );
  invalidate(chat, maps);
  await expect(page.getByRole('button', { name: 'Atualizar mapa', exact: true })).toBeVisible();
  await expectConnected(page);
  await expect(name).toHaveValue('Efeitos pendentes');
  await expect(name).toBeFocused();
  await expect(name).toBeEnabled();
  const other = maps.tokens.find((t) => t.id === otherTokenId)!;
  other.x++;
  other.versao++;
  invalidate(chat, maps);
  await expect(
    page.getByRole('button', { name: 'Token Guarda', exact: true }).locator('..'),
  ).toHaveAttribute('transform', `translate(${8 * CELL} ${3 * CELL})`);
  await expectConnected(page);
  await expect(name).toHaveValue('Efeitos pendentes');
  await expect(name).toBeFocused();
  await expect(page.getByRole('button', { name: 'Atualizar mapa', exact: true })).toHaveCount(0);
});

test('an accepted move keeps its dropped coordinates when the confirmation read fails and settles on recovery', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await hero.click();
  await observe(page, {
    hero,
    panel: page.getByLabel('Token selecionado', { exact: true }),
    layers: page.locator('.map-administration'),
  });
  let unavailable = true;
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', async (route) => {
    if (unavailable)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'Tempo limite de leitura excedido' }),
      });
    await route.fallback();
  });
  const p = await hero.evaluate((node, cell) => {
    const m = (node as SVGGraphicsElement).getScreenCTM()!;
    return { x: m.e + (cell * m.a) / 2, y: m.f + (cell * m.d) / 2, dx: cell * m.a };
  }, CELL);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + p.dx, p.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => maps.operations.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Atualizar mapa', exact: true })).toBeVisible();
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  await expectConnected(page);
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${4 * CELL} ${3 * CELL})`,
  );
  expect(maps.tokens.find((token) => token.id === tokenId)?.x).toBe(4);
  // An unrelated successful operation must not discard the move awaiting its readback.
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  await page.getByLabel('Nome da camada', { exact: true }).fill('Efeitos');
  await page.getByRole('button', { name: 'Criar camada', exact: true }).click();
  await expect.poll(() => maps.operations.length).toBe(2);
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${4 * CELL} ${3 * CELL})`,
  );
  // The accepted move is still awaiting its authoritative read: block stale-version
  // commands instead of sending another move and relying on a server conflict.
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  await expect(hero).toHaveAttribute('aria-busy', 'true');
  await expect(hero).toHaveAttribute('aria-disabled', 'true');
  await expect(hero.locator('.map-token-sync')).toBeVisible();
  await hero.focus();
  await page.keyboard.press('ArrowRight');
  expect(maps.operations).toHaveLength(2);
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${4 * CELL} ${3 * CELL})`,
  );
  unavailable = false;
  await page.getByRole('button', { name: 'Atualizar mapa', exact: true }).click();
  await expect(hero).not.toHaveAttribute('aria-busy', 'true');
  await expect(hero).not.toHaveAttribute('aria-disabled', 'true');
  await expect(hero.locator('.map-token-sync')).toHaveCount(0);
  await hero.click();
  await hero.press('ArrowRight');
  await expect.poll(() => maps.operations.length).toBe(3);
  expect(maps.operations[2].command.versao).toBe(2);
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  await expectConnected(page);
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${5 * CELL} ${3 * CELL})`,
  );
  const token = maps.tokens.find((token) => token.id === tokenId)!;
  token.x = 6;
  token.versao++;
  invalidate(chat, maps);
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${6 * CELL} ${3 * CELL})`,
  );
  await expectConnected(page);
});

for (const update of ['movement', 'denial'] as const) {
  test(`an auxiliary sheet read cannot delay an authoritative ${update}`, async ({ page }) => {
    const { maps, chat, hero } = await openTable(page);
    const hold = gate();
    let started = false;
    await page.route('https://weirs-test.supabase.co/rest/v1/fichas**', async (route) => {
      started = true;
      await hold.promise;
      await route.fallback();
    });
    try {
      if (update === 'denial') {
        await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', (route) =>
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'WV002', message: 'Acesso encerrado' }),
          }),
        );
      } else {
        const guard = maps.tokens.find((token) => token.id === otherTokenId)!;
        guard.x++;
        guard.versao++;
      }
      invalidate(chat, maps);
      await expect.poll(() => started).toBe(true);
      if (update === 'denial') {
        await expect(hero).toHaveCount(0);
        await expect(page.locator('.map-administration')).toHaveCount(0);
      } else {
        await expect(
          page.getByRole('button', { name: 'Token Guarda', exact: true }).locator('..'),
        ).toHaveAttribute('transform', `translate(${8 * CELL} ${3 * CELL})`);
        await expect(
          page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
        ).toBeEnabled();
      }
    } finally {
      hold.release();
    }
  });
}

test('a confirmed authorization denial clears retained scene data after the response', async ({
  page,
}) => {
  const { maps, chat, hero } = await openTable(page);
  await hero.click();
  const hold = gate();
  let started = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', async (route) => {
    started = true;
    await hold.promise;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'WV002', message: 'Acesso encerrado' }),
    });
  });
  try {
    invalidate(chat, maps);
    await expect.poll(() => started).toBe(true);
    await expect(hero).toBeVisible();
    await expect(page.getByLabel('Token selecionado', { exact: true })).toBeVisible();
    hold.release();
    await expect(hero).toHaveCount(0);
    await expect(page.locator('.map-administration')).toHaveCount(0);
    await expect(page.getByLabel('Token selecionado', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Seu acesso ao mapa foi encerrado' }),
    ).toBeVisible();
  } finally {
    hold.release();
  }
});

test('changing role during a pending mutation releases the old context and permits new map actions', async ({
  page,
}) => {
  const { maps, hero, sheets, role } = await openTable(page);
  const hold = gate();
  maps.delay = hold.promise;
  try {
    await hero.click();
    await hero.press('ArrowRight');
    await expect.poll(() => maps.operations.length).toBe(1);
    await expect(page.locator('.map-status')).toContainText('Salvando');
    role.master = false;
    sheets.memberships.find((row) => row.usuario_id === ownerId)!.papel = 'jogador';
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.map-administration')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Token Emboscada secreta', exact: true }),
    ).toHaveCount(0);
    await expect(hero).toBeVisible();
    const response = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/operar_mapa'),
    );
    hold.release();
    await response;
    await expect(hero.locator('..')).toHaveAttribute(
      'transform',
      `translate(${4 * CELL} ${3 * CELL})`,
    );
    await expect(
      page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
    ).toBeEnabled();
    await expect(page.locator('.map-status')).not.toContainText('Salvando');
    await hero.click();
    await hero.press('ArrowRight');
    await expect.poll(() => maps.operations.length).toBe(2);
    await expect(hero.locator('..')).toHaveAttribute(
      'transform',
      `translate(${5 * CELL} ${3 * CELL})`,
    );
  } finally {
    hold.release();
  }
});

test('switching scenes while participant profiles load still populates token controller choices', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true });
  const chat = await chatBackend(page, undefined, { master: true });
  const state = tabletopState();
  state.scenes[0].modo_visao = 'manual';
  const secondScene = {
    ...state.scenes[0],
    id: '70000000-0000-4000-a000-000000000002',
    nome: 'Câmara dos ecos',
    ativa: false,
  };
  state.scenes.push(secondScene);
  await tabletopBackend(page, sheets, chat, state, { master: true });
  const profiles = gate();
  let profileStarted = false;
  await page.route('https://weirs-test.supabase.co/rest/v1/perfis**', async (route) => {
    profileStarted = true;
    await profiles.promise;
    await route.fallback();
  });
  try {
    await page.goto('app.html#/chat');
    if (test.info().project.name === 'mobile')
      await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Token Zephira', exact: true })).toBeVisible();
    await expect.poll(() => profileStarted).toBe(true);
    await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
    await page.locator('.map-scene-select').filter({ hasText: secondScene.nome }).click();
    await expect(page.locator('.map-scene-caption strong')).toHaveText(secondScene.nome);
    await page.getByRole('button', { name: 'Novo token', exact: true }).click();
    const controller = page.getByRole('combobox', { name: 'Controlado por', exact: true });
    await expect(controller.locator(`option[value="${ownerId}"]`)).toHaveCount(0);
    const response = page.waitForResponse((response) => response.url().includes('/rest/v1/perfis'));
    profiles.release();
    await response;
    await expect(controller.locator(`option[value="${ownerId}"]`)).toHaveText('Jogador da mesa');
  } finally {
    profiles.release();
  }
});

test('slow sheet reads are shared across map updates and their completed data reaches open panels', async ({
  page,
}) => {
  const { maps, chat, sheets } = await openTable(page);
  await page.getByRole('button', { name: 'Novo token', exact: true }).click();
  const sheetOption = page
    .getByRole('combobox', { name: 'Ficha vinculada', exact: true })
    .locator(`option[value="${sheets.rows[0].id}"]`);
  await expect(sheetOption).toHaveText('Zephira');
  const first = gate();
  const unnecessary = gate();
  let reads = 0;
  await page.route('https://weirs-test.supabase.co/rest/v1/fichas**', async (route) => {
    const read = ++reads;
    await (read === 1 ? first.promise : unnecessary.promise);
    await route.fallback();
  });
  try {
    sheets.rows[0].nome = 'Zephira atualizada';
    const guard = maps.tokens.find((token) => token.id === otherTokenId)!;
    for (let update = 0; update < 3; update++) {
      guard.x++;
      guard.versao++;
      invalidate(chat, maps);
      await expect(
        page.getByRole('button', { name: 'Token Guarda', exact: true }).locator('..'),
      ).toHaveAttribute('transform', `translate(${guard.x * CELL} ${guard.y * CELL})`);
    }
    expect.soft(reads, 'Map updates should reuse the outstanding sheet read').toBe(1);
    first.release();
    await expect(sheetOption).toHaveText('Zephira atualizada');
  } finally {
    first.release();
    unnecessary.release();
  }
});

async function dragTokenRight(page: Page, token: Locator) {
  const position = await token.evaluate((node, cell) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    return {
      x: matrix.e + (cell * matrix.a) / 2,
      y: matrix.f + (cell * matrix.d) / 2,
      dx: cell * matrix.a,
    };
  }, CELL);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.mouse.move(position.x + position.dx, position.y, { steps: 4 });
  await page.mouse.up();
}

for (const selection of ['single', 'group'] as const) {
  test(`token sync overlay disables only affected ${selection} tokens through RPC and snapshot confirmation`, async ({
    page,
  }) => {
    const { maps, hero } = await openTable(page, { master: true }, true);
    const other = page.getByRole('button', { name: 'Token Guarda', exact: true });
    const untouched = page.getByRole('button', { name: 'Token Emboscada secreta', exact: true });
    const portrait = hero.locator('image');
    await expect(portrait).toBeVisible();
    const href = await portrait.getAttribute('href');
    await hero.click();
    if (selection === 'group') await other.click({ modifiers: ['Shift'] });
    const affected = selection === 'group' ? [hero, other] : [hero];
    const operation = gate(),
      read = await delaySnapshot(page);
    maps.delay = operation.promise;
    await observe(page, {
      hero,
      other,
      portrait,
      tools: page.getByRole('navigation', { name: 'Ferramentas do mapa' }),
    });
    try {
      await (selection === 'group' ? other : hero).press('ArrowRight');
      await expect.poll(() => maps.operations.length).toBe(1);
      for (const token of affected) {
        await expect(token).toHaveAttribute('aria-busy', 'true');
        await expect(token).toHaveAttribute('aria-disabled', 'true');
        await expect(token.locator('.map-token-sync')).toBeVisible();
      }
      await expect(untouched).not.toHaveAttribute('aria-busy', 'true');
      await expect(untouched).not.toHaveAttribute('aria-disabled', 'true');
      if (selection === 'single') {
        await expect(other).not.toHaveAttribute('aria-busy', 'true');
        await expect(other).not.toHaveAttribute('aria-disabled', 'true');
      }
      await expect(
        page.getByRole('button', { name: 'Arquivos da campanha', exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Régua', exact: true })).toBeEnabled();
      await expect(hero.locator('..')).toHaveAttribute(
        'transform',
        `translate(${4 * CELL} ${3 * CELL})`,
      );
      await hero.focus();
      await page.keyboard.press('ArrowRight');
      await dragTokenRight(page, hero);
      expect(maps.operations).toHaveLength(1);
      await expect(hero.locator('..')).toHaveAttribute(
        'transform',
        `translate(${4 * CELL} ${3 * CELL})`,
      );
      const acknowledgement = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/operar_mapa'),
      );
      operation.release();
      await acknowledgement;
      await expect.poll(read.started).toBe(true);
      for (const token of affected) {
        await expect(token).toHaveAttribute('aria-busy', 'true');
        await expect(token.locator('.map-token-sync')).toBeVisible();
      }
      await expectConnected(page);
      await expect(portrait).toHaveAttribute('href', href!);
      if (selection === 'single' && test.info().project.name === 'desktop')
        await page.screenshot({
          path: 'artifacts/tabletop-token-sync-pending.png',
          fullPage: true,
        });
      read.release();
      await expect(page.locator('.map-status')).not.toContainText('Salvando');
      for (const token of affected) {
        await expect(token).not.toHaveAttribute('aria-busy', 'true');
        await expect(token).not.toHaveAttribute('aria-disabled', 'true');
        await expect(token.locator('.map-token-sync')).toHaveCount(0);
      }
      await expectConnected(page);
      await expect(portrait).toHaveAttribute('href', href!);
    } finally {
      operation.release();
      read.release();
    }
  });
}

test('token sync overlay clears on an explicit movement rejection and authoritative rollback', async ({
  page,
}) => {
  const { maps, hero } = await openTable(page);
  await hero.click();
  const operation = gate();
  maps.delay = operation.promise;
  maps.beforeOperation = () => {
    const token = maps.tokens.find((candidate) => candidate.id === tokenId)!;
    token.x = 9;
    token.versao++;
  };
  try {
    await hero.press('ArrowRight');
    await expect.poll(() => maps.operations.length).toBe(1);
    await expect(hero).toHaveAttribute('aria-busy', 'true');
    await expect(hero.locator('.map-token-sync')).toBeVisible();
    operation.release();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(hero.locator('..')).toHaveAttribute(
      'transform',
      `translate(${9 * CELL} ${3 * CELL})`,
    );
    await expect(hero).not.toHaveAttribute('aria-busy', 'true');
    await expect(hero).not.toHaveAttribute('aria-disabled', 'true');
    await expect(hero.locator('.map-token-sync')).toHaveCount(0);
  } finally {
    operation.release();
  }
});
