import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectDropdown } from './dropdown';
const catalog = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) =>
    route.fulfill({ json: { schemaVersion: 1, mode: 'demonstracao', catalog } }),
  );
});
test('digitar um nível de dois dígitos preserva subclasse e resultados anteriores de vida', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  for (const [label, name, kind] of [
    ['Classe', 'Guerreiro', 'classe'],
    ['Subclasse de Guerreiro', 'Campeão', 'subclasse'],
  ]) {
    if (kind === 'subclasse') {
      await page.getByLabel('Níveis em Guerreiro', { exact: true }).fill('3');
      await page.getByLabel('Níveis em Guerreiro', { exact: true }).press('Tab');
    }
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    const entry = catalog.entries.find((e: any) => e.kind === kind && e.name === name);
    await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
  }
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await selectDropdown(page.getByLabel('Método de PV do nível 3', { exact: true }), 'external');
  await page.getByLabel('Resultado de PV do nível 3', { exact: true }).fill('7');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  const level = page.getByLabel('Níveis em Guerreiro', { exact: true });
  await level.fill('');
  await expect(level).toHaveAttribute('aria-invalid', 'true');
  await level.pressSequentially('12', { delay: 80 });
  await level.press('Tab');
  await expect(
    page.getByRole('combobox', { name: 'Subclasse de Guerreiro', exact: true }),
  ).toHaveAttribute(
    'data-value',
    catalog.entries.find((entry: any) => entry.kind === 'subclasse' && entry.name === 'Campeão').ref
      .revisionId,
  );
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(page.getByLabel('Método de PV do nível 3', { exact: true })).toHaveAttribute(
    'data-value',
    'external',
  );
  await expect(page.getByLabel('Resultado de PV do nível 3', { exact: true })).toHaveValue('7');
  await expect(page.getByText('Nível 12 · Guerreiro', { exact: true })).toBeVisible();
});

async function addClass(page: Page, label: string, name: string, levels: number) {
  const entry = catalog.entries.find((item: any) => item.kind === 'classe' && item.name === name);
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
  await page.getByLabel(`Níveis em ${name}`, { exact: true }).fill(String(levels));
  await page.getByLabel(`Níveis em ${name}`, { exact: true }).press('Tab');
}

test('níveis consecutivos da mesma classe não oferecem uma troca sem efeito', async ({ page }) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await addClass(page, 'Classe', 'Bardo', 4);
  await page.getByText('Ordem de aquisição dos níveis', { exact: true }).click();
  const order = page.locator('.creation-level-order');
  await expect(order.getByRole('listitem')).toHaveCount(4);
  await expect(order.getByRole('button')).toHaveCount(0);
});

test('multiclasse oferece apenas trocas que alteram a sequência e atualiza as ações após mover', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await addClass(page, 'Classe', 'Bardo', 2);
  await addClass(page, 'Adicionar multiclasse', 'Guerreiro', 2);
  await page.getByText('Ordem de aquisição dos níveis', { exact: true }).click();
  const order = page.locator('.creation-level-order');
  await expect(order.getByRole('button')).toHaveCount(1);
  await order.getByRole('button', { name: 'Antecipar nível 3', exact: true }).click();
  await expect(order.getByRole('listitem')).toHaveText([
    /Bardo · nível total 1/,
    /Guerreiro · nível total 2/,
    /Bardo · nível total 3/,
    /Guerreiro · nível total 4/,
  ]);
  await expect(order.getByRole('button')).toHaveCount(3);
  await order.getByRole('button', { name: 'Antecipar nível 2', exact: true }).click();
  await expect(order.getByRole('listitem')).toHaveText([
    /Guerreiro · nível total 1/,
    /Bardo · nível total 2/,
    /Bardo · nível total 3/,
    /Guerreiro · nível total 4/,
  ]);
  await expect(order.getByRole('button')).toHaveCount(2);
  await expect(order.getByRole('button', { name: 'Antecipar nível 3', exact: true })).toHaveCount(
    0,
  );
});
