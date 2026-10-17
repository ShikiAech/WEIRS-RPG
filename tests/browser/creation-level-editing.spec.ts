import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
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
  await page.getByLabel('Método de PV do nível 3', { exact: true }).selectOption('external');
  await page.getByLabel('Resultado de PV do nível 3', { exact: true }).fill('7');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  const level = page.getByLabel('Níveis em Guerreiro', { exact: true });
  await level.fill('');
  await expect(level).toHaveAttribute('aria-invalid', 'true');
  await level.pressSequentially('12', { delay: 80 });
  await level.press('Tab');
  await expect(
    page.getByRole('combobox', { name: 'Subclasse de Guerreiro', exact: true }),
  ).toHaveValue('Campeão');
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(page.getByLabel('Método de PV do nível 3', { exact: true })).toHaveValue('external');
  await expect(page.getByLabel('Resultado de PV do nível 3', { exact: true })).toHaveValue('7');
  await expect(page.getByText('Nível 12 · Guerreiro', { exact: true })).toBeVisible();
});
