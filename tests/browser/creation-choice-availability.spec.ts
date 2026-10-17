import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
});
const entry = (kind: string, name: string, path?: string) =>
  snapshot.catalog.entries.find(
    (e: any) => e.kind === kind && e.name === name && (!path || e.source.path === path),
  );
async function choose(page: Page, label: string, kind: string, name: string, path?: string) {
  const target = entry(kind, name, path);
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${target.sourceTitle}`, exact: true }).click();
}

test('Pacto Planar permite substituir Feérico por Infernal no mesmo campo', async ({ page }) => {
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'antecedente', 'Buscador de Pacto', 'data/background.json');
  const background = entry('antecedente', 'Buscador de Pacto', 'data/background.json');
  const definition = snapshot.catalog.choices.find(
    (g: any) =>
      g.ownerRevisionId === background.ref.revisionId && g.featCategory === 'pacto-planar',
  );
  const group = page.getByRole('group', { name: definition.name, exact: true });
  await group.getByRole('radio', { name: 'Pacto Feérico', exact: true }).check();
  await expect(group.getByRole('radio', { name: 'Pacto Infernal', exact: true })).toBeEnabled();
  await group.getByRole('radio', { name: 'Pacto Infernal', exact: true }).check();
  await expect(group.getByRole('radio', { name: 'Pacto Feérico', exact: true })).not.toBeChecked();
  await page
    .getByRole('group', { name: 'Resistência Infernal', exact: true })
    .getByRole('radio', { name: 'Veneno', exact: true })
    .check();
  await group.getByRole('radio', { name: 'Pacto Feérico', exact: true }).check();
  await expect(page.getByRole('group', { name: 'Resistência Infernal', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('group', { name: 'Truques Feéricos', exact: true })).toBeVisible();
});

test('invocação repetível admite duas aquisições no mesmo nível com alvos distintos', async ({
  page,
}) => {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Bruxo');
  await page.getByLabel('Níveis em Bruxo', { exact: true }).fill('2');
  await page.getByLabel('Níveis em Bruxo', { exact: true }).press('Tab');
  await page
    .getByRole('group', { name: 'Invocações Místicas do nível 1', exact: true })
    .getByRole('radio', { name: 'Pacto do Tomo', exact: true })
    .check();
  const tome = page.getByRole('group', { name: 'Truques do Livro das Sombras', exact: true });
  for (const spell of ['Chama Sagrada', 'Chicote de Espinhos', 'Luz']) {
    await tome.getByLabel('Buscar em Truques do Livro das Sombras', { exact: true }).fill(spell);
    await tome.getByRole('checkbox', { name: spell, exact: true }).check();
  }
  const invocation = page.getByRole('group', {
    name: 'Invocações Místicas do nível 2',
    exact: true,
  });
  await invocation
    .getByLabel('Buscar em Invocações Místicas do nível 2', { exact: true })
    .fill('Rajada Agonizante');
  await invocation.getByRole('checkbox', { name: 'Rajada Agonizante', exact: true }).check();
  await invocation
    .getByRole('checkbox', { name: 'Rajada Agonizante (2ª aquisição)', exact: true })
    .check();
  const targets = page.getByRole('group', {
    name: 'Truque beneficiado por Rajada Agonizante',
    exact: true,
  });
  await expect(targets).toHaveCount(2);
  const repeated = targets.filter({ hasText: 'Rajada Agonizante (2ª aquisição)' });
  const first = targets.filter({ hasNotText: 'Rajada Agonizante (2ª aquisição)' });
  await first.getByRole('radio', { name: 'Chama Sagrada', exact: true }).check();
  await expect(repeated.getByRole('radio', { name: /Chama Sagrada/ })).toBeDisabled();
  await repeated.getByRole('radio', { name: 'Chicote de Espinhos', exact: true }).check();
  await expect(first.getByRole('radio', { name: 'Chama Sagrada', exact: true })).toBeChecked();
  await expect(
    repeated.getByRole('radio', { name: 'Chicote de Espinhos', exact: true }),
  ).toBeChecked();
});

test('manobra já aprendida fica indisponível nas escolhas de outro nível', async ({ page }) => {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Guerreiro');
  await page.getByLabel('Níveis em Guerreiro', { exact: true }).fill('7');
  await page.getByLabel('Níveis em Guerreiro', { exact: true }).press('Tab');
  await choose(page, 'Subclasse de Guerreiro', 'subclasse', 'Mestre de Batalha');
  const first = page.getByRole('group', { name: 'Manobras do nível 3', exact: true });
  await first.getByRole('checkbox', { name: 'Aparar', exact: true }).check();
  const master = entry('subclasse', 'Mestre de Batalha');
  const choices = snapshot.catalog.choices.find(
    (g: any) => g.ownerRevisionId === master.ref.revisionId && g.key === 'manobras-3',
  );
  for (const option of choices.options.filter((o: any) => o.name !== 'Aparar').slice(0, 2))
    await first.getByRole('checkbox', { name: option.name, exact: true }).check();
  const later = page.getByRole('group', { name: 'Manobras do nível 7', exact: true });
  await expect(later.getByRole('checkbox', { name: /Aparar/ })).toBeDisabled();
  await expect(first.getByRole('checkbox', { name: 'Aparar', exact: true })).toBeEnabled();
  await first.getByRole('checkbox', { name: 'Aparar', exact: true }).uncheck();
  await expect(later.getByRole('checkbox', { name: 'Aparar', exact: true })).toBeEnabled();
});

test('Artífice escolhe quatro planos e reconhece Reparar automático fora da cota', async ({
  page,
}) => {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Artífice');
  await page.getByLabel('Níveis em Artífice', { exact: true }).fill('2');
  await page.getByLabel('Níveis em Artífice', { exact: true }).press('Tab');
  const artificer = entry('classe', 'Artífice');
  const definition = snapshot.catalog.choices.find(
    (g: any) => g.ownerRevisionId === artificer.ref.revisionId && g.key === 'planos-2',
  );
  const group = page.getByRole('group', { name: definition.name, exact: true });
  const minimumLevel = (o: any) =>
    snapshot.catalog.requirements.find(
      (r: any) => r.ownerRevisionId === o.targetRef.revisionId && r.operator === 'nivel-classe',
    ).minimum;
  for (const option of definition.options.filter((o: any) => minimumLevel(o) === 2).slice(0, 4)) {
    await group.getByLabel(`Buscar em ${definition.name}`, { exact: true }).fill(option.name);
    await group.getByRole('checkbox', { name: option.name, exact: true }).check();
  }
  const later = definition.options.find((o: any) => minimumLevel(o) === 6);
  await group.getByLabel(`Buscar em ${definition.name}`, { exact: true }).fill(later.name);
  await expect(
    group.getByRole('checkbox', {
      name: new RegExp(later.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    }),
  ).toBeDisabled();
  const artisan = snapshot.catalog.choices.find(
    (g: any) => g.ownerRevisionId === artificer.ref.revisionId && g.key === 'ferramenta-artesao',
  );
  await page
    .getByRole('group', { name: artisan.name, exact: true })
    .getByRole('radio', { name: artisan.options[0].name, exact: true })
    .check();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const casting = page.getByRole('group', { name: 'Artífice', exact: true });
  await casting.getByLabel('Buscar magias de Artífice', { exact: true }).fill('Reparar');
  const granted = casting.getByRole('checkbox', { name: /Reparar/ });
  await expect(granted).toBeChecked();
  await expect(granted).toBeDisabled();
  await expect(casting).toContainText('Truques: 0/2');
  await expect(casting).toContainText('Concedida automaticamente');
});
