import { test, expect, type Page } from '@playwright/test';
import { fixture, entry, id } from '../fixtures/creation';
import type { ChoiceGroupDefinition } from '../../packages/contracts/compendium';

function choice(n: number, ownerRevisionId: string, name: string): ChoiceGroupDefinition {
  return {
    id: id(n),
    ownerRevisionId,
    key: name,
    name,
    minimum: 1,
    maximum: 1,
    acquisition: 'ambas',
    abilityPoints: null,
    abilityLimit: null,
    optionKind: null,
    featCategory: null,
    requirementId: null,
    level: 1,
    options: [],
  };
}
function option(n: number, group: ChoiceGroupDefinition, name: string) {
  return {
    id: id(n),
    groupId: group.id,
    name,
    type: 'texto',
    targetRef: null,
    ability: null,
    proficiencyId: null,
    value: null,
    quantity: 1,
  };
}
async function showSpecies(page: Page, catalog: ReturnType<typeof fixture>['catalog']) {
  await page.route('**/compendium/demo.json', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        mode: 'demonstracao',
        catalog,
      },
    }),
  );
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espécie', exact: true }).fill('especie');
  await page.getByRole('option', { name: 'especie · Teste', exact: true }).click();
}

test('talentos elegíveis usam autocomplete, teclado e limpeza da seleção', async ({ page }) => {
  const { catalog, species } = fixture();
  const group = choice(50, species.ref.revisionId, 'Talento de origem');
  group.optionKind = 'talento';
  for (const [n, name] of [
    [60, 'Alerta'],
    [61, 'Atleta'],
    [62, 'Veterano'],
  ] as const) {
    const feat = entry(
      n,
      'talento',
      { category: 'origem', repeatable: false, prerequisiteText: '', requirementsComplete: true },
      name,
    );
    catalog.entries.push(feat);
    group.options.push({ ...option(n + 10, group, name), type: 'talento', targetRef: feat.ref });
    if (name === 'Veterano')
      catalog.requirements.push({
        id: id(90),
        ownerRevisionId: feat.ref.revisionId,
        parentId: null,
        operator: 'nivel',
        ability: null,
        targetRef: null,
        minimum: 4,
        choiceKey: null,
        proficiencyId: null,
      });
  }
  catalog.choices.push(group);
  await showSpecies(page, catalog);
  const choices = page.getByRole('group', { name: group.name, exact: true });
  const search = choices.getByRole('combobox', { name: `Buscar em ${group.name}`, exact: true });
  await search.click();
  await expect(choices.getByRole('checkbox', { name: 'Veterano', exact: true })).toHaveCount(0);
  await expect(choices).not.toContainText('Requisitos ainda não atendidos');
  await search.fill('atl');
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('Atleta');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await search.fill('alerta');
  await choices.getByRole('checkbox', { name: 'Alerta', exact: true }).click();
  await expect(search).toHaveValue('Alerta');
  await search.fill('atleta');
  await expect(choices.getByRole('checkbox', { name: 'Atleta', exact: true })).not.toBeChecked();
  await choices.getByRole('button', { name: `Limpar ${group.name}`, exact: true }).click();
  await search.fill('alerta');
  await expect(choices.getByRole('checkbox', { name: 'Alerta', exact: true })).not.toBeChecked();
});

test('perícia já treinada permanece visível com disabled e motivo acessível', async ({ page }) => {
  const { catalog, species } = fixture();
  catalog.proficiencies.push({
    id: id(100),
    ownerRevisionId: species.ref.revisionId,
    type: 'pericia',
    skill: 'furtividade',
  });
  catalog.effects.push({
    id: id(101),
    ownerRevisionId: species.ref.revisionId,
    key: 'treino',
    type: 'proficiencia',
    formula: null,
    requirementId: null,
    level: 1,
    stacking: 'maximo',
    condition: '',
    abilities: [],
    defenses: [],
    resources: [],
    proficiencies: [{ proficiencyId: id(100), degree: 'proficiente' }],
  });
  const group = choice(102, species.ref.revisionId, 'Nova perícia');
  group.options = [
    { ...option(103, group, 'furtividade'), type: 'proficiencia-nova', proficiencyId: id(100) },
  ];
  catalog.choices.push(group);
  await showSpecies(page, catalog);
  const choices = page.getByRole('group', { name: group.name, exact: true });
  await choices.getByRole('combobox').click();
  const skill = choices.getByRole('checkbox', { name: 'Furtividade', exact: true });
  await expect(skill).toBeDisabled();
  await expect(skill).toHaveAccessibleDescription('Você já tem esta proficiência.');
  const row = choices.locator('.dropdown-option').filter({
    has: page.getByRole('checkbox', { name: 'Furtividade', exact: true }),
  });
  await expect(row).toHaveAttribute('data-disabled', 'true');
  await expect(row).toContainText('Você já tem esta proficiência.');
});

test('autocomplete de múltiplas escolhas bloqueia a cota e libera ao desmarcar', async ({
  page,
}) => {
  const { catalog, species } = fixture();
  const group = choice(200, species.ref.revisionId, 'Idiomas adicionais');
  group.maximum = 2;
  group.options = Array.from({ length: 26 }, (_, i) =>
    option(201 + i, group, `Idioma ${String(i + 1).padStart(2, '0')}`),
  );
  catalog.choices.push(group);
  await showSpecies(page, catalog);
  const choices = page.getByRole('group', { name: group.name, exact: true });
  await choices.getByRole('combobox').click();
  await choices.getByRole('checkbox', { name: 'Idioma 01', exact: true }).check();
  await choices.getByRole('checkbox', { name: 'Idioma 02', exact: true }).check();
  const next = choices.getByRole('checkbox', { name: 'Idioma 03', exact: true });
  await expect(next).toBeDisabled();
  await expect(next).toHaveAccessibleDescription('Limite de escolhas atingido.');
  await choices.getByRole('checkbox', { name: 'Idioma 01', exact: true }).uncheck();
  await expect(next).toBeEnabled();
  await next.check();
  await expect(choices).toContainText('2/2 selecionados');
  await choices.getByRole('combobox').press('Escape');
  await expect(choices.getByRole('dialog')).toHaveCount(0);
  await expect(choices.getByRole('combobox')).toHaveValue('Idioma 02, Idioma 03');
});

test('aumentos podem ficar vazios e impedem exceder cota e limite do atributo', async ({
  page,
}) => {
  const { catalog, species } = fixture();
  const group = choice(110, species.ref.revisionId, 'Aumento de atributo');
  group.abilityPoints = 2;
  group.abilityLimit = 20;
  group.maximum = 3;
  group.options = (['for', 'con', 'des'] as const).map((ability, i) => ({
    ...option(111 + i, group, ability),
    ability,
    type: 'atributo',
  }));
  catalog.choices.push(group);
  await showSpecies(page, catalog);
  await page.getByRole('button', { name: '1 Atributos', exact: true }).click();
  await page.getByLabel('Força: valor base', { exact: true }).fill('19');
  await page.getByLabel('Constituição: valor base', { exact: true }).fill('18');
  await page.getByLabel('Destreza: valor base', { exact: true }).fill('10');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  const choices = page.getByRole('group', { name: group.name, exact: true });
  const strength = choices.getByLabel('Força: aumento', { exact: true });
  const constitution = choices.getByLabel('Constituição: aumento', { exact: true });
  await strength.fill('3');
  await expect(strength).toHaveValue('1');
  await constitution.fill('2');
  await expect(constitution).toHaveValue('1');
  await expect(choices.getByLabel('Destreza: aumento', { exact: true })).toBeDisabled();
  await strength.fill('');
  await expect(strength).toHaveValue('');
  await expect(choices).toContainText('1/2 pontos distribuídos');
  await expect(choices.getByLabel('Destreza: aumento', { exact: true })).toBeEnabled();
});
