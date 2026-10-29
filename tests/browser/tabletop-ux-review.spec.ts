import { test, expect, type Page } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, otherTokenId, tokenId } from './tabletop-backend';
import { ownerId } from './backend';

async function openMap(page: Page, master = true) {
  const sheets = await backend(page, { master });
  const chat = await chatBackend(page, undefined, { master });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master });
  maps.scenes[0].modo_visao = 'manual';
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('application', { name: 'Mapa da campanha' })).toBeVisible();
  return maps;
}

test('ruler controls remain usable beside the map administration panel', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Régua', exact: true }).click();
  const options = page.getByLabel('Opções da régua', { exact: true });
  await page.screenshot({
    path: `output/map-ux-review/ruler-${test.info().project.name}.png`,
    fullPage: true,
  });
  await options.getByLabel('Cor', { exact: true }).click({ trial: true, timeout: 3000 });
  await options.getByLabel('Espessura', { exact: true }).fill('5');
  await options.getByRole('combobox', { name: 'Estilo', exact: true }).selectOption('continua');
  await options
    .getByRole('checkbox', { name: 'Medir movimento', exact: true })
    .uncheck({ timeout: 3000 });
  await options
    .getByRole('checkbox', { name: 'Medir altura (distância euclidiana)', exact: true })
    .check({ timeout: 3000 });
  await expect(options.getByLabel('Espessura', { exact: true })).toHaveValue('5');
});

test('Escape cancels an area immediately after entering placement', async ({ page }) => {
  const maps = await openMap(page);
  await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
  await page.getByRole('button', { name: 'Posicionar no mapa', exact: true }).click();
  await expect(page.locator('[data-area-id="preview"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-area-id="preview"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Selecionar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(maps.operations.some((o) => o.command.tipo === 'area_criar')).toBe(false);
});

for (const name of [
  'Régua',
  'Cenas e mapas',
  'Arquivos da campanha',
  'Lista de tokens',
  'Novo token',
]) {
  test(`leaving area placement for ${name} clears its unsaved preview`, async ({ page }) => {
    const maps = await openMap(page);
    await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
    await page.getByRole('button', { name: 'Posicionar no mapa', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('[data-area-id="preview"]')).toHaveCount(0);
    expect(maps.operations.some((o) => o.command.tipo === 'area_criar')).toBe(false);
  });
}

test('area settings remain clickable when map administration is available', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
  await page.screenshot({
    path: `output/map-ux-review/area-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Fechar ferramentas do mapa', exact: true })
    .click({ trial: true, timeout: 3000 });
  await page.getByRole('textbox', { name: 'Nome da área', exact: true }).click({ timeout: 3000 });
  await page.getByRole('textbox', { name: 'Nome da área', exact: true }).fill('Cone de gelo');
  await page.getByRole('combobox', { name: 'Forma da área', exact: true }).selectOption('cone');
  await page.getByRole('button', { name: 'Confirmar área', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Configurar áreas de magia' })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-area-id="preview"]')).toHaveCount(0);
  await expect(page.getByLabel('Área Cone de gelo', { exact: true })).toBeVisible();
});

test('resizing the viewport preserves an area being configured', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Áreas de magia', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome da área', exact: true }).fill('Área em preparação');
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 200 });
  await expect(page.getByRole('textbox', { name: 'Nome da área', exact: true })).toHaveValue(
    'Área em preparação',
  );
});

test('arrow keys in a drawing tool do not move a previously selected token', async ({ page }) => {
  const maps = await openMap(page);
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).click();
  await page.getByRole('button', { name: 'Desenhar no mapa', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  expect(maps.operations.filter((o) => o.command.tipo === 'token_atualizar')).toHaveLength(0);
  expect(maps.tokens.find((t) => t.id === tokenId)?.x).toBe(3);
});

test('a player can add a controlled token after inspecting an uncontrolled token', async ({
  page,
}) => {
  const maps = await openMap(page, false);
  await page.getByRole('button', { name: 'Token Guarda', exact: true }).click();
  await page
    .getByRole('button', { name: 'Token Zephira', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Token Zephira', exact: true }).press('ArrowRight');
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(4);
  expect(maps.tokens.find((t) => t.id === otherTokenId)?.x).toBe(7);
});

test('wall drawing closes its panel and cancelled pointer gestures leave no wall', async ({
  page,
}) => {
  const maps = await openMap(page);
  await page.getByText('Camadas, visão e participantes', { exact: true }).click();
  await page.getByRole('button', { name: 'Desenhar parede no mapa', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Criar parede ou porta', exact: true }),
  ).not.toBeVisible();
  const canvas = page.getByRole('application', { name: 'Mapa da campanha' });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await expect(canvas.locator('line[stroke="#fff"]')).toHaveCount(1);
  await canvas.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(canvas.locator('line[stroke="#fff"]')).toHaveCount(0);
  expect(maps.operations.some((o) => o.command.tipo === 'parede_criar')).toBe(false);
});

test('keyboard multi-selection keeps earlier controlled tokens when focus moves', async ({
  page,
}) => {
  const maps = await openMap(page, false);
  maps.tokens.find((t) => t.id === otherTokenId)!.controlador_id = ownerId;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  const guard = page.getByRole('button', { name: 'Token Guarda', exact: true });
  await hero.focus();
  await hero.press('Enter');
  await page.keyboard.down('Shift');
  await guard.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await expect(hero).toHaveAttribute('aria-pressed', 'true');
  await expect(guard).toHaveAttribute('aria-pressed', 'true');
  await guard.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(4);
  await expect.poll(() => maps.tokens.find((t) => t.id === otherTokenId)?.x).toBe(8);
});

test('a player can finish a checkbox group selection using touch controls', async ({ page }) => {
  const maps = await openMap(page, false);
  maps.tokens.find((t) => t.id === otherTokenId)!.controlador_id = ownerId;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('button', { name: 'Lista de tokens', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Incluir Zephira na seleção', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Incluir Guarda na seleção', exact: true }).check();
  await page.getByRole('button', { name: 'Voltar ao mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Mover seleção para direita', exact: true }).click();
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(4);
  await expect.poll(() => maps.tokens.find((t) => t.id === otherTokenId)?.x).toBe(8);
});
