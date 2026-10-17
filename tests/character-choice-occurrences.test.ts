import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { fixture, entry, id } from './fixtures/creation';
import type { ChoiceGroupDefinition } from '../packages/contracts/compendium';

const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
  loadCuration(process.cwd()),
]);
registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
const real = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);

test('Arcana da fonte do Mago oferece Arcanismo entre as sete perícias iniciais', () => {
  const wizard = real.entries.find((e) => e.kind === 'classe' && e.name === 'Mago')!;
  const skills = real.choices.find(
    (g) => g.ownerRevisionId === wizard.ref.revisionId && g.key === 'pericias',
  )!;
  assert.equal(skills.options.length, 7);
  assert.ok(
    skills.options.some(
      (o) => real.proficiencies.find((p) => p.id === o.proficiencyId)?.skill === 'arcanismo',
    ),
  );
});

test('couro cravejado do kit Artífice usa a armadura tipada do acervo', () => {
  const artificer = real.entries.find((e) => e.kind === 'classe' && e.name === 'Artífice')!;
  const packages = real.equipmentOptions
    .filter((o) => o.ownerRevisionId === artificer.ref.revisionId)
    .map((o) => real.entries.find((e) => e.ref.revisionId === o.packageRef.revisionId))
    .filter((e) => e?.kind === 'pacote');
  const armor = packages
    .flatMap((p) =>
      p.data.items.map((i) =>
        real.entries.find((e) => e.ref.revisionId === i.equipmentRef?.revisionId),
      ),
    )
    .find((e) => e?.kind === 'equipamento' && /Couro/i.test(e.name));
  assert.ok(armor?.kind === 'equipamento' && armor.data.armor, 'kit armor must be equippable');
  assert.equal(armor.data.armor.baseAc, 12);
});

test('duas aquisições no nível2 podem escolher a mesma invocação repetível em ocorrências distintas', () => {
  const warlock = real.entries.find((e) => e.kind === 'classe' && e.name === 'Bruxo')!;
  const group = real.choices.find(
    (g) => g.ownerRevisionId === warlock.ref.revisionId && g.key === 'invocacoes-2',
  )!;
  const invocation = real.entries.find(
    (e) => e.kind === 'caracteristica' && e.name === 'Rajada Agonizante',
  )!;
  const copies = group.options.filter((o) => o.targetRef?.recordId === invocation.ref.recordId);
  assert.equal(group.minimum, 2);
  assert.equal(copies.length, 2);
  assert.equal(new Set(copies.map((o) => o.id)).size, 2);
  assert.equal(new Set(copies.map((o) => o.name)).size, 2);
  const unique = real.entries.find(
    (e) => e.kind === 'caracteristica' && e.name === 'Pacto do Tomo',
  )!;
  assert.equal(
    group.options.filter((o) => o.targetRef?.recordId === unique.ref.recordId).length,
    1,
  );
});

function choiceGroup(
  owner: string,
  n: number,
  target: ReturnType<typeof entry>,
): ChoiceGroupDefinition {
  return {
    id: id(n),
    ownerRevisionId: owner,
    key: 'escolha-' + n,
    name: 'Escolha ' + n,
    minimum: 1,
    maximum: 1,
    level: 1,
    acquisition: 'ambas',
    requirementId: null,
    optionKind: null,
    featCategory: null,
    abilityPoints: null,
    abilityLimit: null,
    options: [
      {
        id: id(n + 1),
        groupId: id(n),
        name: target.name,
        type: target.kind,
        targetRef: target.ref,
        ability: null,
        proficiencyId: null,
        value: null,
        quantity: 1,
      },
    ],
  };
}

test('Pacto exclusivo pode ser substituído no mesmo radio; outra origem continua impedindo coexistência', () => {
  const { catalog, draft, background, cls } = fixture();
  const pact = (n: number, name: string) =>
    entry(
      n,
      'talento',
      {
        category: 'pacto-planar',
        repeatable: false,
        prerequisiteText: 'Não pode ter outro talento de Pacto Planar',
        requirementsComplete: true,
      },
      name,
    );
  const a = pact(20, 'Pacto A'),
    b = pact(21, 'Pacto B');
  catalog.entries.push(a, b);
  for (const [own, other, n] of [
    [a, b, 22],
    [b, a, 23],
  ] as const)
    catalog.requirements.push({
      id: id(n),
      ownerRevisionId: own.ref.revisionId,
      parentId: null,
      operator: 'ausente',
      targetRef: other.ref,
      ability: null,
      minimum: null,
      choiceKey: null,
      proficiencyId: null,
    });
  const group = choiceGroup(background.ref.revisionId, 30, a);
  group.options.push({ ...group.options[0], id: id(32), name: b.name, targetRef: b.ref });
  catalog.choices.push(group);
  draft.choices.push({
    groupId: group.id,
    sourceInstanceId: 'background',
    values: [{ type: 'option', optionId: id(31) }],
  });
  let state = resolveConcessions(catalog, draft);
  assert.equal(state.problems.length, 0);
  assert.equal(state.choices[0].unavailableOptions?.[id(32)], undefined);
  draft.choices[0].values = [{ type: 'option', optionId: id(32) }];
  state = resolveConcessions(catalog, draft);
  assert.equal(state.problems.length, 0);
  assert.ok(state.instances.some((i) => i.entry.ref.recordId === b.ref.recordId));
  assert.ok(!state.instances.some((i) => i.entry.ref.recordId === a.ref.recordId));
  draft.choices = [];
  catalog.grants.push({
    id: id(33),
    ownerRevisionId: cls.ref.revisionId,
    key: 'outro-pacto',
    kind: 'talento',
    targetRef: b.ref,
    groupId: null,
    requirementId: null,
    level: 1,
    acquisition: 'ambas',
    quantity: 1,
  });
  state = resolveConcessions(catalog, draft);
  assert.ok(state.choices[0].unavailableOptions?.[id(31)]);
});

test('característica já aprendida fica indisponível em outro grupo, mantendo seleção atual operável', () => {
  const { catalog, draft, cls } = fixture();
  const maneuver = entry(
    40,
    'caracteristica',
    { category: 'manobra', optional: true, manualDecision: true },
    'Aparar',
  );
  catalog.entries.push(maneuver);
  const first = choiceGroup(cls.ref.revisionId, 41, maneuver),
    second = choiceGroup(cls.ref.revisionId, 43, maneuver);
  catalog.choices.push(first, second);
  draft.choices.push({
    groupId: first.id,
    sourceInstanceId: `class:${draft.classes[0].id}`,
    values: [{ type: 'option', optionId: id(42) }],
  });
  const state = resolveConcessions(catalog, draft);
  assert.equal(
    state.choices.find((c) => c.group.id === first.id)!.unavailableOptions?.[id(42)],
    undefined,
  );
  assert.ok(state.choices.find((c) => c.group.id === second.id)!.unavailableOptions?.[id(44)]);
});
