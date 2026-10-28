import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
});

async function chooseClass(page: Page, name: string) {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  const entry = snapshot.catalog.entries.find(
    (entry: any) => entry.kind === 'classe' && entry.name === name,
  );
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
}

test('etapas sem escolhas disponíveis ficam desabilitadas e a navegação as pula', async ({
  page,
}) => {
  const hp = page.getByRole('button', { name: '5 Vida e defesas', exact: true });
  const spells = page.getByRole('button', { name: '6 Magias', exact: true });
  await expect(hp).toBeDisabled();
  await expect(spells).toBeDisabled();
  await chooseClass(page, 'Guerreiro');
  await expect(hp).toBeEnabled();
  await expect(spells).toBeDisabled();
  await hp.click();
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await expect(page.getByRole('button', { name: '7 Revisão', exact: true })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await page.getByRole('button', { name: 'Etapa anterior', exact: true }).click();
  await expect(hp).toHaveAttribute('aria-current', 'step');
  await chooseClass(page, 'Mago');
  await expect(spells).toBeEnabled();
});

test('magias selecionadas ficam dentro da busca e continuam removíveis entre círculos', async ({
  page,
}, info) => {
  await chooseClass(page, 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const group = page.getByRole('group', { name: 'Mago', exact: true });
  const search = group.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true });
  await search.fill('Raio de Fogo');
  await group.getByRole('checkbox', { name: 'Raio de Fogo', exact: true }).check();
  await expect(search).toHaveValue('');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await search.press('Escape');
  const control = group
    .locator('.dropdown-control')
    .filter({ has: page.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true }) });
  const chips = control.getByRole('list', { name: 'Magias selecionadas de Mago', exact: true });
  await expect(chips.getByText('Raio de Fogo', { exact: true })).toBeVisible();
  const bounds = (await control.boundingBox())!;
  const selectedBounds = (await chips.boundingBox())!;
  expect(selectedBounds.y).toBeGreaterThanOrEqual(bounds.y);
  expect(selectedBounds.y + selectedBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await group.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await expect(chips.getByText('Raio de Fogo', { exact: true })).toBeVisible();
  await chips.getByRole('button', { name: 'Sobre Raio de Fogo', exact: true }).focus();
  await expect(chips.getByRole('tooltip')).toContainText('fogo');
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: `artifacts/task-review/${info.project.name}-spell-search-chips.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chips.getByRole('button', { name: 'Remover Raio de Fogo', exact: true }).click();
  await expect(group).toContainText('Truques: 0/3');
});

test('truque já conhecido na classe é ocultado da origem adicional', async ({ page }) => {
  await chooseClass(page, 'Clérigo');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const cleric = page.getByRole('group', { name: 'Clérigo', exact: true });
  await cleric.getByRole('combobox', { name: 'Buscar magias de Clérigo', exact: true }).fill('Luz');
  await cleric.getByRole('checkbox', { name: 'Luz', exact: true }).check();
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  const order = page.getByRole('group', { name: 'Ordem Divina', exact: true });
  await order.getByRole('combobox').click();
  await order.getByRole('checkbox', { name: 'Taumaturgo', exact: true }).click();
  await expect(order.getByRole('combobox')).toHaveValue('Taumaturgo');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const extra = page.getByRole('group', { name: 'Taumaturgo', exact: true });
  await extra
    .getByRole('combobox', { name: 'Buscar magias de Taumaturgo', exact: true })
    .fill('Luz');
  await expect(
    extra.getByRole('status').filter({ hasText: 'Nenhuma magia encontrada' }),
  ).toBeVisible();
  await expect(extra.getByRole('checkbox', { name: 'Luz', exact: true })).toHaveCount(0);
});

test('círculo sem cota de magias fica desabilitado e é ignorado pelo teclado', async ({ page }) => {
  const fixture = structuredClone(snapshot);
  const wizard = fixture.catalog.entries.find(
    (entry: any) => entry.kind === 'classe' && entry.name === 'Mago',
  );
  const profile = fixture.catalog.castingProfiles.find(
    (profile: any) => profile.ownerRevisionId === wizard.ref.revisionId,
  );
  const firstLevel = profile.progression.find((row: any) => row.level === 1);
  firstLevel.known = 0;
  firstLevel.prepared = 0;
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: fixture }));
  await page.reload();
  await chooseClass(page, 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const group = page.getByRole('group', { name: 'Mago', exact: true });
  await expect(group.getByRole('tab', { name: 'Círculo 1', exact: true })).toBeDisabled();
  const cantrips = group.getByRole('tab', { name: 'Truques', exact: true });
  await cantrips.focus();
  await cantrips.press('ArrowRight');
  await expect(cantrips).toBeFocused();
  await group
    .getByRole('combobox', { name: 'Buscar magias de Mago', exact: true })
    .fill('Míssil Mágico');
  await expect(
    group.getByRole('status').filter({ hasText: 'Nenhuma magia encontrada' }),
  ).toBeVisible();
  await expect(group.getByRole('checkbox', { name: 'Míssil Mágico', exact: true })).toHaveCount(0);
});

test('lista permanece dentro da janela quando os chips aumentam a altura da busca', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  // Menu placement must remain correct without a browser scroll-anchoring adjustment.
  await page.addStyleTag({ content: 'html { overflow-anchor: none; }' });
  await chooseClass(page, 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const group = page.getByRole('group', { name: 'Mago', exact: true });
  const search = group.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true });
  const popup = group.getByRole('dialog', { name: 'Opções de magias de Mago', exact: true });
  for (const name of ['Raio de Fogo', 'Mão Mágica', 'Raio de Gelo']) {
    await search.fill(name);
    await search.evaluate(async (input) => {
      window.scrollTo(0, input.getBoundingClientRect().top + window.scrollY - 340);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await group.getByRole('checkbox', { name, exact: true }).check();
    await expect.poll(() => popup.getByRole('checkbox').count()).toBeGreaterThan(3);
    await expect(search).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => {
        const bounds = (await popup.boundingBox())!;
        return bounds.y >= 0 && bounds.y + bounds.height <= 700;
      })
      .toBe(true);
  }
});
