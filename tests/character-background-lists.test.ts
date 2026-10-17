import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import type { CreationCatalog } from '../packages/contracts/character-creation';
import { fixture, grant } from './fixtures/creation';

const published = readFile('public/compendium/demo.json', 'utf8').then(
  (raw) => JSON.parse(raw).catalog as CreationCatalog,
);

async function scenario(backgroundName?: string) {
  const catalog = structuredClone(await published);
  const f = fixture();
  catalog.entries.push(...f.catalog.entries);
  if (backgroundName)
    f.draft.backgroundRef = catalog.entries.find(
      (e) => e.kind === 'antecedente' && e.name === backgroundName,
    )!.ref;
  return { ...f, catalog };
}

for (const [name, spellList] of [
  ['Acólito', 'Clérigo'],
  ['Guia', 'Druida'],
  ['Sábio', 'Mago'],
  ['Tocado pelo Gênio', 'Mago'],
  ['Peregrino dos Poços da Lua', 'Druida'],
]) {
  test(`${name} mostra uma única escolha de Iniciado em Magia antes e depois de selecionar a lista`, async () => {
    const { catalog, draft } = await scenario(name);
    const choices = () =>
      resolveConcessions(catalog, draft).choices.filter((c) => c.group.key === 'iniciado-lista');
    assert.equal(choices().length, 1);
    const choice = choices()[0];
    assert.equal(choice.instance.id, 'background');
    assert.deepEqual(
      choice.group.options.map((o) => o.name),
      [spellList],
    );
    assert.equal(
      resolveSpellcasting(catalog, draft).profiles.find(
        (p) =>
          p.ownerRevisionId ===
          catalog.entries.find((e) => e.originalName === 'Magic Initiate')?.ref.revisionId,
      )?.listClassRevisionIds?.length,
      0,
      'a lista ainda exige a decisão na origem',
    );
    draft.choices.push({
      groupId: choice.group.id,
      sourceInstanceId: choice.instance.id,
      values: [{ type: 'option', optionId: choice.group.options[0].id }],
    });
    assert.equal(choices().length, 1);
    const casting = resolveSpellcasting(catalog, draft);
    const profiles = casting.profiles.filter((p) => p.type === 'concedida');
    assert.equal(profiles.length, 1);
    assert.deepEqual(profiles[0].listClassRevisionIds, [
      choice.group.options[0].targetRef!.revisionId,
    ]);
    assert.ok(!casting.problems.some((p) => p.code === 'SPELL_LIST_REQUIRED'));
  });
}

test('Iniciado em Magia adquirido sem lista fixa mantém as três opções', async () => {
  const { catalog, draft, species } = await scenario();
  const initiate = catalog.entries.find(
    (e) => e.kind === 'talento' && e.originalName === 'Magic Initiate',
  )!;
  catalog.grants.push(grant(990801, species, initiate));
  const choices = resolveConcessions(catalog, draft).choices.filter(
    (c) => c.group.key === 'iniciado-lista',
  );
  assert.equal(choices.length, 1);
  assert.deepEqual(choices[0].group.options.map((o) => o.name).sort(), [
    'Clérigo',
    'Druida',
    'Mago',
  ]);
});

test('uma escolha antiga do talento não contorna a lista fixa do Acólito', async () => {
  const { catalog, draft } = await scenario('Acólito');
  const initiate = catalog.entries.find(
    (e) => e.kind === 'talento' && e.originalName === 'Magic Initiate',
  )!;
  const instance = resolveConcessions(catalog, draft).instances.find(
    (i) => i.entry.ref.revisionId === initiate.ref.revisionId,
  )!;
  const child = catalog.choices.find(
    (g) => g.ownerRevisionId === initiate.ref.revisionId && g.key === 'iniciado-lista',
  )!;
  draft.choices.push({
    groupId: child.id,
    sourceInstanceId: instance.id,
    values: [{ type: 'option', optionId: child.options.find((o) => o.name === 'Mago')!.id }],
  });
  const choices = resolveConcessions(catalog, draft).choices.filter(
    (c) => c.group.key === 'iniciado-lista',
  );
  assert.equal(choices.length, 1);
  assert.equal(choices[0].instance.id, 'background');
  const casting = resolveSpellcasting(catalog, draft);
  assert.ok(casting.problems.some((p) => p.code === 'SPELL_LIST_REQUIRED'));
});
