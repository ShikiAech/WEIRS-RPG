import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function fighter(page: Page, level = 1) {
  const entry = snapshot.catalog.entries.find(
    (item: any) => item.kind === 'classe' && item.name === 'Guerreiro',
  );
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill('Guerreiro');
  await page.getByRole('option', { name: `Guerreiro · ${entry.sourceTitle}`, exact: true }).click();
  if (level > 1) {
    await page.getByLabel('Níveis em Guerreiro', { exact: true }).fill(String(level));
    await page.getByLabel('Níveis em Guerreiro', { exact: true }).press('Tab');
  }
}

test('tooltip do estilo de luta mostra o benefício sem selecionar o talento', async ({ page }) => {
  await fighter(page);
  const group = page.getByRole('group', { name: 'Estilo de luta', exact: true });
  await group.getByRole('combobox').fill('Defesa');
  const checkbox = group.getByRole('checkbox', { name: 'Defesa', exact: true });
  await group.getByRole('button', { name: 'Sobre Defesa', exact: true }).click();
  const tooltip = group.getByRole('tooltip');
  await expect(tooltip).toContainText('bônus de +1 na Classe de Armadura');
  await expect(checkbox).not.toBeChecked();
  await tooltip.getByText('Defesa', { exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(group.getByRole('status')).toContainText('0/1');
  await expect(group.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
});

test('tooltip do talento de nível abre por foco e fecha com Escape', async ({ page }) => {
  await fighter(page, 4);
  const group = page.getByRole('group', { name: 'Talento do nível 4', exact: true });
  await group.getByRole('combobox').fill('Cozinheiro');
  const checkbox = group.getByRole('checkbox', { name: 'Cozinheiro', exact: true });
  const info = group.getByRole('button', { name: 'Sobre Cozinheiro', exact: true });
  await info.focus();
  await expect(group.getByRole('tooltip')).toContainText('Utensílios de Cozinheiro');
  await expect(info).toHaveAttribute('aria-describedby', /.+/);
  await expect(checkbox).not.toBeChecked();
  await info.press('Escape');
  await expect(group.getByRole('tooltip')).toBeHidden();
  await expect(group.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  await expect(checkbox).not.toBeChecked();
});
