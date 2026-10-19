import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function barbarian(page: Page, level = 1) {
  const entry = snapshot.catalog.entries.find(
    (e: any) => e.kind === 'classe' && e.name === 'Bárbaro',
  );
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill('Bárbaro');
  await page.getByRole('option', { name: `Bárbaro · ${entry.sourceTitle}`, exact: true }).click();
  if (level > 1) {
    await page.getByLabel('Níveis em Bárbaro', { exact: true }).fill(String(level));
    await page.getByLabel('Níveis em Bárbaro', { exact: true }).press('Tab');
  }
  return page.getByRole('group', { name: `Maestrias em armas do nível ${level}`, exact: true });
}

async function rowFor(group: Locator, name: string) {
  await group.getByRole('combobox').click();
  await group.getByRole('combobox').fill(name);
  const checkbox = group.getByRole('checkbox', { name, exact: true });
  const row = group.locator('.dropdown-option').filter({
    has: group.page().getByRole('checkbox', { name, exact: true }),
  });
  await expect(row).toBeVisible();
  return { checkbox, row };
}

async function clickPadding(row: Locator, touch: boolean) {
  const bounds = (await row.boundingBox())!;
  const position = { x: bounds.width - 5, y: 5 };
  if (touch) await row.tap({ position });
  else await row.click({ position });
}

test('Tridente na maestria do Bárbaro nível 4 seleciona pelo texto e desmarca pelo espaço da linha', async ({
  page,
}, info) => {
  const group = await barbarian(page, 4);
  const search = group.getByRole('combobox');
  let option = await rowFor(group, 'Tridente');
  if (info.project.use.hasTouch) await option.row.getByText('Tridente', { exact: true }).tap();
  else await option.row.getByText('Tridente', { exact: true }).click();
  await expect(search).toHaveValue('Tridente');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(group.getByRole('status')).toContainText('1/1');
  option = await rowFor(group, 'Tridente');
  await expect(option.checkbox).toBeChecked();
  await clickPadding(option.row, !!info.project.use.hasTouch);
  await expect(search).toHaveValue('');
  await expect(group.getByRole('status')).toContainText('0/1');
});

test('linha de múltiplas maestrias alterna uma vez por clique e respeita o bloqueio da cota', async ({
  page,
}, info) => {
  const group = await barbarian(page);
  let option = await rowFor(group, 'Tridente');
  await option.row.getByText('Tridente', { exact: true }).click();
  await expect(option.checkbox).toBeChecked();
  await expect(group.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  await option.row.getByText('Tridente', { exact: true }).click();
  await expect(option.checkbox).not.toBeChecked();
  await option.checkbox.check();
  await expect(option.checkbox).toBeChecked();
  await option.checkbox.press('Space');
  await expect(option.checkbox).not.toBeChecked();
  await clickPadding(option.row, !!info.project.use.hasTouch);
  await expect(option.checkbox).toBeChecked();
  option = await rowFor(group, 'Cajado');
  await option.row.getByText('Cajado', { exact: true }).click();
  await expect(option.checkbox).toBeChecked();
  option = await rowFor(group, 'Adaga');
  await expect(option.checkbox).toBeDisabled();
  await clickPadding(option.row, !!info.project.use.hasTouch);
  await expect(option.checkbox).not.toBeChecked();
  await expect(group.getByRole('status')).toContainText('2/2');
});
