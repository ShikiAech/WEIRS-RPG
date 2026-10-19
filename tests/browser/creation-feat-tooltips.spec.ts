import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function chooseClass(page: Page, name: string, level = 1) {
  const entry = snapshot.catalog.entries.find(
    (item: any) => item.kind === 'classe' && item.name === name,
  );
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
  if (level > 1) {
    await page.getByLabel(`Níveis em ${name}`, { exact: true }).fill(String(level));
    await page.getByLabel(`Níveis em ${name}`, { exact: true }).press('Tab');
  }
}

test('tooltip do estilo de luta mostra o benefício sem selecionar o talento', async ({ page }) => {
  await chooseClass(page, 'Guerreiro');
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
  await chooseClass(page, 'Guerreiro', 4);
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

test('invocação mística mostra sua descrição sem selecionar a opção', async ({ page }) => {
  await chooseClass(page, 'Bruxo', 2);
  const group = page.getByRole('group', { name: 'Invocações Místicas do nível 2', exact: true });
  await group.getByRole('combobox').fill('Armadura das Sombras');
  const info = group.getByRole('button', { name: 'Sobre Armadura das Sombras', exact: true });
  await expect(info).toBeVisible();
  await info.click();
  await expect(group.getByRole('tooltip')).toContainText('Armadura de Mago');
  await expect(
    group.getByRole('checkbox', { name: 'Armadura das Sombras', exact: true }),
  ).not.toBeChecked();
  await group.getByRole('tooltip').getByText('Armadura das Sombras', { exact: true }).click();
  await expect(group.getByRole('status')).toContainText('0/2');
});

test('manobra do Mestre de Batalha mostra o efeito por foco no ícone', async ({ page }) => {
  await chooseClass(page, 'Guerreiro', 3);
  const subclass = snapshot.catalog.entries.find(
    (entry: any) => entry.kind === 'subclasse' && entry.name === 'Mestre de Batalha',
  );
  await page
    .getByRole('combobox', { name: 'Subclasse de Guerreiro', exact: true })
    .fill(subclass.name);
  await page
    .getByRole('option', { name: `${subclass.name} · ${subclass.sourceTitle}`, exact: true })
    .click();
  const group = page.getByRole('group', { name: 'Manobras do nível 3', exact: true });
  await group.getByRole('combobox').fill('Aparar');
  const info = group.getByRole('button', { name: 'Sobre Aparar', exact: true });
  await expect(info).toBeVisible();
  await info.focus();
  await expect(group.getByRole('tooltip')).toContainText('Dado de Superioridade');
  await expect(group.getByRole('checkbox', { name: 'Aparar', exact: true })).not.toBeChecked();
  await info.press('Escape');
  await expect(group.getByRole('tooltip')).toBeHidden();
  await expect(group.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
});

test('escolha de arma descrita no compêndio também possui informação', async ({ page }) => {
  await chooseClass(page, 'Bárbaro');
  const group = page.getByRole('group', { name: 'Maestrias em armas do nível 1', exact: true });
  await group.getByRole('combobox').fill('Tridente');
  const info = group.getByRole('button', { name: 'Sobre Tridente', exact: true });
  await expect(info).toBeVisible();
  await info.click();
  await expect(group.getByRole('tooltip')).toContainText('Lança militar de três pontas');
  await expect(group.getByRole('checkbox', { name: 'Tridente', exact: true })).not.toBeChecked();
});

test('opção sem descrição não ganha um ícone de informação vazio', async ({ page }) => {
  const fixture = structuredClone(snapshot);
  const weapon = fixture.catalog.entries.find(
    (entry: any) => entry.kind === 'equipamento' && entry.name === 'Tridente',
  );
  weapon.description = ' \n  ';
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: fixture }));
  await chooseClass(page, 'Bárbaro');
  const group = page.getByRole('group', { name: 'Maestrias em armas do nível 1', exact: true });
  await group.getByRole('combobox').fill('Tridente');
  await expect(group.getByRole('checkbox', { name: 'Tridente', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Sobre Tridente', exact: true })).toHaveCount(0);
});
