import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function startWizard(page: Page) {
  const wizard = snapshot.catalog.entries.find(
    (entry: any) => entry.kind === 'classe' && entry.name === 'Mago',
  );
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill('Mago');
  await page.getByRole('option', { name: `Mago · ${wizard.sourceTitle}`, exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  return page.getByRole('group', { name: 'Mago', exact: true });
}

async function search(profile: Locator, name: string) {
  await profile.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true }).fill(name);
  return profile.getByRole('checkbox', { name, exact: true });
}

function row(profile: Locator, name: string) {
  return profile
    .locator('.dropdown-option')
    .filter({ has: profile.page().getByRole('checkbox', { name, exact: true }) });
}

test('texto da magia seleciona e desmarca uma única vez mantendo o dropdown aberto', async ({
  page,
}) => {
  const profile = await startWizard(page);
  const checkbox = await search(profile, 'Luz');
  await profile.getByText('Luz', { exact: true }).click();
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Truques: 1/3');
  await profile.getByText('Luz', { exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(profile).toContainText('Truques: 0/3');
  await expect(
    profile.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
});

test('padding da linha alterna a magia uma única vez sem exigir clique no checkbox', async ({
  page,
}) => {
  const profile = await startWizard(page);
  const checkbox = await search(profile, 'Luz');
  await row(profile, 'Luz').click({ position: { x: 4, y: 4 } });
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Truques: 1/3');
  await row(profile, 'Luz').click({ position: { x: 4, y: 4 } });
  await expect(checkbox).not.toBeChecked();
  await expect(profile).toContainText('Truques: 0/3');
});

test('texto Preparar altera somente o preparo e preserva a magia no grimório', async ({ page }) => {
  const profile = await startWizard(page);
  await profile.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  const checkbox = await search(profile, 'Alarme');
  await checkbox.check();
  const prepare = profile.getByRole('checkbox', { name: 'Preparar Alarme', exact: true });
  await expect(prepare).toBeChecked();
  await profile.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true }).focus();
  await row(profile, 'Alarme').getByText('Preparar', { exact: true }).click();
  await expect(prepare).not.toBeChecked();
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Grimório: 1/6 · Preparadas: 0/4');
  await row(profile, 'Alarme').getByText('Preparar', { exact: true }).click();
  await expect(prepare).toBeChecked();
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Grimório: 1/6 · Preparadas: 1/4');
});

test('botão de informação e tooltip permitem ler sem selecionar a magia', async ({ page }) => {
  const profile = await startWizard(page);
  const checkbox = await search(profile, 'Luz');
  await profile.getByRole('button', { name: 'Sobre Luz', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  const tooltip = profile.getByRole('tooltip');
  await expect(tooltip).toContainText('Você toca');
  await tooltip.getByText('Luz', { exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await expect(profile).toContainText('Truques: 0/3');
});

test('texto e padding de linha bloqueada preservam o limite de truques', async ({ page }) => {
  const profile = await startWizard(page);
  for (const name of ['Luz', 'Mão Mágica', 'Raio de Gelo'])
    await (await search(profile, name)).check();
  const checkbox = await search(profile, 'Ilusão Menor');
  await expect(checkbox).toBeDisabled();
  await row(profile, 'Ilusão Menor')
    .getByText('Ilusão Menor', { exact: true })
    .click({ force: true });
  await expect(checkbox).not.toBeChecked();
  await row(profile, 'Ilusão Menor').click({ position: { x: 4, y: 4 }, force: true });
  await expect(checkbox).not.toBeChecked();
  await expect(profile).toContainText('Truques: 3/3');
});

test('checkbox direto e barra de espaço continuam alternando a seleção uma única vez', async ({
  page,
}) => {
  const profile = await startWizard(page);
  const checkbox = await search(profile, 'Luz');
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Truques: 1/3');
  await checkbox.press('Space');
  await expect(checkbox).not.toBeChecked();
  await expect(profile).toContainText('Truques: 0/3');
  await checkbox.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(profile).toContainText('Truques: 1/3');
});
