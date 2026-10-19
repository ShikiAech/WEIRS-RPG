import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));

test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
});

async function chooseClass(page: Page, name: string, level: number) {
  const entry = snapshot.catalog.entries.find(
    (entry: any) => entry.kind === 'classe' && entry.name === name,
  );
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
  await page.getByLabel(`Níveis em ${name}`, { exact: true }).fill(String(level));
  await page.getByLabel(`Níveis em ${name}`, { exact: true }).press('Tab');
}

test('perícias e especializações do Bardo usam busca, seleção pela linha e limite de escolhas', async ({
  page,
}) => {
  await chooseClass(page, 'Bardo', 2);
  const skills = page.getByRole('group', { name: 'Perícias da classe inicial', exact: true });
  await expect(skills.getByRole('combobox')).toBeVisible();
  await skills.getByRole('combobox').click();
  for (const name of ['Acrobacia', 'Arcanismo', 'Atletismo'])
    await skills.getByRole('checkbox', { name, exact: true }).check();

  const expertise = page.getByRole('group', {
    name: 'Perícia Especialista do nível 2',
    exact: true,
  });
  const search = expertise.getByRole('combobox');
  await search.fill('acro');
  await expect(expertise.getByRole('checkbox')).toHaveCount(1);
  await expertise.getByText('Acrobacia', { exact: true }).click();
  await expect(expertise.getByRole('checkbox', { name: 'Acrobacia', exact: true })).toBeChecked();
  await search.fill('arcan');
  await expertise.getByRole('checkbox', { name: 'Arcanismo', exact: true }).check();
  await search.fill('atle');
  await expect(expertise.getByRole('checkbox', { name: 'Atletismo', exact: true })).toBeDisabled();
  await expertise.getByRole('button', { name: 'Limpar Perícia Especialista do nível 2' }).click();
  await search.fill('atle');
  await expect(expertise.getByRole('checkbox', { name: 'Atletismo', exact: true })).toBeEnabled();
  await search.press('Escape');
  await expect(expertise.getByRole('checkbox')).toHaveCount(0);
});

test('Proeza Canalizada e grupos pequenos usam o dropdown compartilhado com busca sem acentos', async ({
  page,
}) => {
  await chooseClass(page, 'Guerreiro', 4);
  const feats = page.getByRole('group', { name: 'Talento do nível 4', exact: true });
  await feats.getByRole('combobox').fill('Alma Ecoante');
  await feats.getByRole('checkbox', { name: 'Alma Ecoante', exact: true }).click();
  const group = page.getByRole('group', { name: 'Proeza Canalizada: perícias', exact: true });
  const search = group.getByRole('combobox');
  await expect(search).toBeVisible();
  await search.fill('percepcao');
  await expect(group.getByRole('checkbox', { name: 'Percepção', exact: true })).toBeVisible();
  await expect(group.getByRole('checkbox')).toHaveCount(1);
  await group.getByText('Percepção', { exact: true }).click();
  await search.fill('arcanismo');
  await group.getByRole('checkbox', { name: 'Arcanismo', exact: true }).check();
  await search.fill('historia');
  await expect(group.getByRole('checkbox', { name: 'História', exact: true })).toBeDisabled();
  await expect(group.getByRole('status')).toContainText('2/2 selecionados');
  await search.press('Escape');
  await expect(search).toHaveValue('Arcanismo, Percepção');
});
