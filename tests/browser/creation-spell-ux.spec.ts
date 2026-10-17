import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
// Serve the same catalog read by selectors even if another focused worker regenerates it.
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});
const entry = (kind: string, name: string, source?: string) =>
  snapshot.catalog.entries.find(
    (e: any) => e.kind === kind && e.name === name && (!source || e.source.path === source),
  );
async function choose(page: Page, label: string, kind: string, name: string, source?: string) {
  const selected = entry(kind, name, source);
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page
    .getByRole('option', { name: `${name} · ${selected.sourceTitle}`, exact: true })
    .click();
}
async function startClass(page: Page, name: string) {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', name);
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  return page.getByRole('group', { name, exact: true });
}

test('truque adicional da Ordem Divina não repete um truque da classe', async ({ page }) => {
  const cleric = await startClass(page, 'Clérigo');
  await cleric.getByLabel('Buscar magias de Clérigo', { exact: true }).fill('Luz');
  await cleric.getByRole('checkbox', { name: 'Luz', exact: true }).check();
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page
    .getByRole('group', { name: 'Ordem Divina', exact: true })
    .getByRole('radio', { name: 'Taumaturgo', exact: true })
    .check();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const extra = page.getByRole('group', { name: 'Taumaturgo', exact: true });
  await extra.getByLabel('Buscar magias de Taumaturgo', { exact: true }).fill('Luz');
  await expect(extra.getByRole('checkbox', { name: /Luz/ })).toBeDisabled();
  await expect(extra).toContainText('Já conhecido pela classe');
  await extra.getByLabel('Buscar magias de Taumaturgo', { exact: true }).fill('Orientação');
  await extra.getByRole('checkbox', { name: 'Orientação', exact: true }).check();
  await expect(extra).toContainText('Truques: 1/1');
  await expect(extra.getByRole('list', { name: 'Pendências desta origem' })).toHaveCount(0);
});

test('grimório distingue livro e preparo, orienta cotas e nunca prepara seis automaticamente', async ({
  page,
}, info) => {
  const profile = await startClass(page, 'Mago');
  await expect(profile).toContainText('Grimório: 0/6');
  await expect(profile).toContainText('Preparadas: 0/4');
  await expect(profile).toContainText('Truques: 0/3');
  await expect(
    profile.getByRole('combobox', { name: 'Círculo para Mago', exact: true }),
  ).toHaveValue('0');
  for (const name of ['Luz', 'Mãos Mágicas', 'Raio de Gelo']) {
    await profile.getByLabel('Buscar magias de Mago', { exact: true }).fill(name);
    await profile.getByRole('checkbox', { name, exact: true }).check();
  }
  await expect(profile).toContainText('Truques: 3/3');
  await profile.getByRole('combobox', { name: 'Círculo para Mago', exact: true }).selectOption('1');
  for (const name of [
    'Absorver Elementos',
    'Alarme',
    'Armadura Arcana',
    'Catapulta',
    'Causar Medo',
    'Compreender Idiomas',
  ]) {
    await profile.getByLabel('Buscar magias de Mago', { exact: true }).fill(name);
    await profile.getByRole('checkbox', { name, exact: true }).check();
  }
  await expect(profile).toContainText('Grimório: 6/6');
  await expect(profile).toContainText('Preparadas: 4/4');
  await expect(profile.getByRole('list', { name: 'Pendências desta origem' })).toHaveCount(0);
  expect(
    await profile
      .getByRole('checkbox', { name: /^Preparar / })
      .evaluateAll((nodes: HTMLInputElement[]) => nodes.filter((n) => n.checked).length),
  ).toBe(4);
  await profile.getByLabel('Preparar Absorver Elementos', { exact: true }).uncheck();
  await expect(profile).toContainText('Preparadas: 3/4');
  await expect(profile).toContainText('Prepare mais 1');
  await profile.getByLabel('Preparar Compreender Idiomas', { exact: true }).check();
  await expect(profile).toContainText('Preparadas: 4/4');
  await expect(page.getByText('Consultando magias…', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/ux-swarm/fixes/${info.project.name}-spell-book.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preparação da lista inteira omite conhecidas e mostra pendências locais', async ({
  page,
}) => {
  const profile = await startClass(page, 'Clérigo');
  await expect(profile).not.toContainText(/0 conhecidas|Conhecidas:/);
  await expect(profile).toContainText('Preparadas: 0/4');
  await expect(profile).toContainText('Prepare mais 4');
  await expect(profile).toContainText('Escolha mais 3 truques');
});

for (const name of ['Paladino', 'Patrulheiro']) {
  test(`${name} sem truques abre círculo um e não oferece círculo zero`, async ({ page }) => {
    const profile = await startClass(page, name);
    const circle = profile.getByRole('combobox', { name: `Círculo para ${name}`, exact: true });
    await expect(circle).toHaveValue('1');
    await expect(circle.locator('option[value="0"]')).toHaveCount(0);
  });
}

for (const [background, spellList] of [
  ['Acólito', 'Clérigo'],
  ['Guia', 'Druida'],
  ['Sábio', 'Mago'],
  ['Tocado pelo Gênio', 'Mago'],
  ['Peregrino dos Poços da Lua', 'Druida'],
]) {
  test(`${background} exibe uma única seção para a lista fixa de Iniciado em Magia`, async ({
    page,
  }) => {
    await page.goto('app.html#/fichas/nova?demo=1');
    await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
    await choose(page, 'Antecedente', 'antecedente', background, 'data/background.json');
    const lists = page.getByRole('group', { name: 'Lista de Iniciado em Magia', exact: true });
    await expect(lists).toHaveCount(1);
    await expect(lists.getByRole('radio')).toHaveCount(1);
    await lists.getByRole('radio', { name: spellList, exact: true }).check();
    await expect(lists).toHaveCount(1);
    await page.getByRole('button', { name: '6 Magias', exact: true }).click();
    const profile = page.getByRole('group', { name: 'Iniciado em Magia', exact: true });
    await expect(profile).toHaveCount(1);
    await expect(profile.getByRole('searchbox')).toBeVisible();
  });
}

test('Iniciado sem lista pede resolução na origem sem oferecer catálogo universal', async ({
  page,
}, info) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'antecedente', 'Sábio', 'data/background.json');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const profile = page.getByRole('group', { name: 'Iniciado em Magia', exact: true });
  await expect(profile).toContainText(
    /Resolva a lista de magias no antecedente, classe ou espécie/,
  );
  await expect(profile.getByRole('searchbox')).toHaveCount(0);
  await expect(profile.getByRole('checkbox')).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/ux-swarm/fixes/${info.project.name}-spell-list-required.png`,
    fullPage: true,
  });
});

test('trocar lista identifica seleção antiga e permite removê-la preservando outra origem', async ({
  page,
}, info) => {
  // A repeatable feat may permit switching lists; Sábio itself normally fixes Mago.
  const fixture = structuredClone(snapshot);
  const background = entry('antecedente', 'Sábio', 'data/background.json');
  const group = fixture.catalog.choices.find(
    (g: any) => g.ownerRevisionId === background.ref.revisionId && g.key === 'iniciado-lista',
  );
  const clericOption = fixture.catalog.choices
    .flatMap((g: any) => g.options)
    .find((o: any) => o.type === 'lista-magia' && o.name === 'Clérigo');
  group.options.push({
    ...clericOption,
    id: '588d7f84-c6ce-47f9-a758-c1318e023902',
    groupId: group.id,
  });
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: fixture }));
  const cleric = await startClass(page, 'Clérigo');
  await cleric
    .getByRole('combobox', { name: 'Círculo para Clérigo', exact: true })
    .selectOption('1');
  await cleric.getByLabel('Buscar magias de Clérigo', { exact: true }).fill('Bênção');
  await cleric.getByRole('checkbox', { name: 'Bênção', exact: true }).check();
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'antecedente', 'Sábio', 'data/background.json');
  await page
    .getByRole('group', { name: 'Lista de Iniciado em Magia', exact: true })
    .first()
    .getByRole('radio', { name: 'Mago', exact: true })
    .check();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const initiate = page.getByRole('group', { name: 'Iniciado em Magia', exact: true });
  await initiate
    .getByLabel('Buscar magias de Iniciado em Magia', { exact: true })
    .fill('Mãos Mágicas');
  await initiate.getByRole('checkbox', { name: 'Mãos Mágicas', exact: true }).check();
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await page
    .getByRole('group', { name: 'Lista de Iniciado em Magia', exact: true })
    .first()
    .getByRole('radio', { name: 'Clérigo', exact: true })
    .check();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const old = initiate.getByRole('listitem').filter({ hasText: 'Mãos Mágicas' });
  await expect(old).toContainText('Indisponível para esta origem e nível');
  await expect(page.getByText('Consultando magias…', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/ux-swarm/fixes/${info.project.name}-spell-stale-selection.png`,
    fullPage: true,
  });
  await old.getByRole('button', { name: /Remover/ }).click();
  await expect(old).toHaveCount(0);
  await expect(cleric.getByRole('listitem').filter({ hasText: 'Bênção' })).toBeVisible();
});

test('perfil com listas permitidas combina magias de ambas sem vazar outra lista', async ({
  page,
}) => {
  const fixture = structuredClone(snapshot);
  const wizard = entry('classe', 'Mago');
  const cleric = entry('classe', 'Clérigo');
  const profileDefinition = fixture.catalog.castingProfiles.find(
    (p: any) => p.ownerRevisionId === wizard.ref.revisionId,
  );
  profileDefinition.listClassRefs = [wizard.ref, cleric.ref];
  profileDefinition.listChoiceKey = null;
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: fixture }));
  const profile = await startClass(page, 'Mago');
  await profile.getByRole('combobox', { name: 'Círculo para Mago', exact: true }).selectOption('1');
  for (const name of ['Bênção', 'Mísseis Mágicos']) {
    await profile.getByLabel('Buscar magias de Mago', { exact: true }).fill(name);
    await expect(profile.getByRole('checkbox', { name, exact: true })).toHaveCount(1);
  }
  await profile.getByRole('combobox', { name: 'Círculo para Mago', exact: true }).selectOption('0');
  await profile.getByLabel('Buscar magias de Mago', { exact: true }).fill('Raio Místico');
  await expect(
    profile.getByRole('status').filter({ hasText: 'Nenhuma magia encontrada' }),
  ).toBeVisible();
  await expect(profile.getByRole('checkbox', { name: 'Raio Místico', exact: true })).toHaveCount(0);
});
