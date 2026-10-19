import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectDropdown } from './dropdown';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
const catalog = snapshot.catalog;
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function choose(page: Page, label: string, kind: string, name: string) {
  const entry = catalog.entries.find((entry: any) => entry.kind === kind && entry.name === name);
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
}

async function background(page: Page) {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'antecedente', 'Soldado');
}

async function hitPoints(page: Page) {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Guerreiro');
  await page.getByLabel('Níveis em Guerreiro', { exact: true }).fill('2');
  await page.getByLabel('Níveis em Guerreiro', { exact: true }).press('Tab');
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
}

test('antecedente limita cada bônus ao orçamento restante e permite apagar o campo', async ({
  page,
}) => {
  await background(page);
  const strength = page.getByLabel('Força: bônus do antecedente', { exact: true });
  const dexterity = page.getByLabel('Destreza: bônus do antecedente', { exact: true });
  const constitution = page.getByLabel('Constituição: bônus do antecedente', { exact: true });
  await strength.fill('2');
  await expect(dexterity).toHaveAttribute('max', '1');
  await dexterity.fill('2');
  await expect(dexterity).toHaveValue('1');
  await expect(constitution).toBeDisabled();
  await strength.fill('');
  await expect(strength).toHaveValue('');
  await expect(constitution).toBeEnabled();
  await constitution.fill('1');
  await strength.fill('1');
  await expect(strength).toHaveValue('1');
  await expect(dexterity).toHaveValue('1');
  await expect(constitution).toHaveValue('1');
  await expect(page.getByText('Distribuídos: 3/3', { exact: true })).toBeVisible();
});

test('antecedente respeita o limite final do atributo antes de aplicar o bônus', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByLabel('Força: valor base', { exact: true }).fill('19');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'antecedente', 'Soldado');
  const strength = page.getByLabel('Força: bônus do antecedente', { exact: true });
  await expect(strength).toHaveAttribute('max', '1');
  await strength.fill('2');
  await expect(strength).toHaveValue('1');
});

test('antecedente sem distribuição não oferece campos de bônus', async ({ page }) => {
  const fixture = structuredClone(snapshot);
  fixture.catalog.entries.find(
    (entry: any) => entry.kind === 'antecedente' && entry.name === 'Soldado',
  ).data.distribution = 'nenhuma';
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: fixture }));
  await background(page);
  await expect(page.getByLabel(/: bônus do antecedente$/)).toHaveCount(0);
  await expect(page.getByText(/Esta versão não concede aumentos de atributos/)).toBeVisible();
});

test('vida permite uma rolagem por nível e mantém o resultado ao sair da etapa e recarregar', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await hitPoints(page);
  const method = page.getByLabel('Método de PV do nível 2', { exact: true });
  const result = page.getByLabel('Resultado de PV do nível 2', { exact: true });
  const roll = page.getByRole('button', { name: 'Rolar d10 para nível 2', exact: true });
  await selectDropdown(method, 'roll');
  await expect(result).toBeDisabled();
  await expect(roll).toBeEnabled();
  await roll.click();
  const rolled = await result.inputValue();
  expect(Number(rolled)).toBeGreaterThanOrEqual(1);
  expect(Number(rolled)).toBeLessThanOrEqual(10);
  await expect(roll).toBeDisabled();
  await expect(result).toBeDisabled();
  await expect(method).toBeDisabled();
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(result).toHaveValue(rolled);
  await expect(roll).toBeDisabled();
  await page.reload();
  await expect(page.locator('.creation-stage')).toHaveAttribute('aria-busy', 'false', {
    timeout: 20_000,
  });
  await expect(result).toHaveValue(rolled);
  await expect(roll).toBeDisabled();
  await expect(method).toBeDisabled();
});

test('resultado externo pode ser apagado e não é confundido com uma rolagem já realizada', async ({
  page,
}) => {
  await hitPoints(page);
  const method = page.getByLabel('Método de PV do nível 2', { exact: true });
  const result = page.getByLabel('Resultado de PV do nível 2', { exact: true });
  await selectDropdown(method, 'external');
  await result.fill('7');
  await result.fill('');
  await expect(result).toHaveValue('');
  await result.fill('7');
  await selectDropdown(method, 'roll');
  await expect(result).toHaveValue('');
  const roll = page.getByRole('button', { name: 'Rolar d10 para nível 2', exact: true });
  await expect(roll).toBeEnabled();
  await roll.click();
  await expect(roll).toBeDisabled();
  await expect(result).toBeDisabled();
  await expect(method).toBeDisabled();
});
