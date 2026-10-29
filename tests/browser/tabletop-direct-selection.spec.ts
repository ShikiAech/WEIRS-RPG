import { test, expect, type Page } from '@playwright/test';
import { backend, ownerId } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, otherTokenId } from './tabletop-backend';
import { CELL } from '../../apps/web/features/tabletop/geometry';

async function open(page: Page) {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  maps.tokens.find((t) => t.id === otherTokenId)!.controlador_id = ownerId;
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const hero = page.getByRole('button', { name: 'Token Zephira', exact: true });
  const guard = page.getByRole('button', { name: 'Token Guarda', exact: true });
  await expect(hero).toBeVisible();
  const points = await hero.evaluate((node, cell) => {
    const m = (node as SVGGraphicsElement).getScreenCTM()!;
    return {
      x: m.e - cell * m.a,
      y: m.f - cell * m.d,
      right: m.e + 6 * cell * m.a,
      bottom: m.f + 2 * cell * m.d,
      emptyX: m.e + 12 * cell * m.a,
      emptyY: m.f + 7 * cell * m.d,
    };
  }, CELL);
  return { maps, hero, guard, points };
}

for (const modifier of ['Control', 'Meta', 'Shift'] as const) {
  test(`${modifier}+clique alterna tokens na seleção sem abrir ferramentas`, async ({ page }) => {
    const { maps, hero, guard } = await open(page);
    await hero.click();
    await guard.click({ modifiers: [modifier] });
    await expect(hero).toHaveAttribute('aria-pressed', 'true');
    await expect(guard).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('complementary', { name: 'Tokens da cena' })).toHaveCount(0);
    await expect(page.getByText('Adicionar meu personagem', { exact: true })).not.toBeVisible();
    if (modifier === 'Control')
      await page.screenshot({
        path: `artifacts/map-interactions/direct-selection-${test.info().project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await guard.click({ modifiers: [modifier] });
    await expect(hero).toHaveAttribute('aria-pressed', 'true');
    await expect(guard).toHaveAttribute('aria-pressed', 'false');
    expect(maps.operations).toHaveLength(0);
  });
}

test('arrastar o espaço vazio seleciona por retângulo e um clique vazio limpa a seleção', async ({
  page,
}) => {
  const { maps, hero, guard, points } = await open(page);
  const before = await hero.locator('..').getAttribute('transform');
  await page.mouse.move(points.right, points.bottom);
  await page.mouse.down();
  await page.mouse.move(points.x, points.y, { steps: 4 });
  await page.mouse.up();
  await expect(hero).toHaveAttribute('aria-pressed', 'true');
  await expect(guard).toHaveAttribute('aria-pressed', 'true');
  await expect(hero.locator('..')).toHaveAttribute('transform', before!);
  await expect(page.getByRole('complementary', { name: 'Tokens da cena' })).toHaveCount(0);
  await page.mouse.click(points.emptyX, points.emptyY);
  await expect(hero).toHaveAttribute('aria-pressed', 'false');
  await expect(guard).toHaveAttribute('aria-pressed', 'false');
  expect(maps.operations).toHaveLength(0);
});

test('Ctrl+A seleciona tokens controlados e Escape limpa sem enviar alteração', async ({
  page,
}) => {
  const { maps, hero, guard } = await open(page);
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Mensagem ou comando de dados', { exact: true }).fill('Rascunho');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await hero.click();
  await page.keyboard.press('Control+a');
  await expect(hero).toHaveAttribute('aria-pressed', 'true');
  await expect(guard).toHaveAttribute('aria-pressed', 'true');
  await hero.press('Escape');
  await expect(hero).toHaveAttribute('aria-pressed', 'false');
  await expect(guard).toHaveAttribute('aria-pressed', 'false');
  expect(maps.operations).toHaveLength(0);
});

test('perder controle durante o arraste cancela o movimento antes de enviar', async ({ page }) => {
  const { maps, hero } = await open(page);
  const box = (await hero.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 1.5, box.y + box.height / 2);
  const row = maps.tokens.find((t) => t.nome === 'Zephira')!;
  row.controlador_id = null;
  row.ficha_id = null;
  row.versao++;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.token-position')).toHaveCount(0);
  await page.mouse.up();
  await expect(hero.locator('..')).toHaveAttribute(
    'transform',
    `translate(${3 * CELL} ${3 * CELL})`,
  );
  expect(maps.operations).toHaveLength(0);
});
