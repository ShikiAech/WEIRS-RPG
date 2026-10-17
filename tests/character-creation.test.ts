import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAbilities } from '../packages/character-creation/abilities';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { fixture, entry, grant, id } from './fixtures/creation';
test('two sets have no automatic selection; repeated values use distinct indices', () => {
  const { catalog, draft } = fixture();
  draft.abilities = {
    ...draft.abilities,
    mode: 'rolls',
    sets: [
      [12, 12, 14, 15, 16, 17],
      [8, 9, 10, 11, 12, 13],
    ],
    selectedSet: null,
    assignment: {},
  };
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.code === 'SET_REQUIRED'));
  draft.abilities.selectedSet = 0;
  draft.abilities.assignment = { for: 0, des: 1, con: 2, int: 3, sab: 4, car: 5 };
  assert.equal(resolveAbilities(catalog, draft).base.des, 12);
  draft.abilities.assignment.des = 0;
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.code === 'DUPLICATE_ROLL'));
  draft.abilities.sets.pop();
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.code === 'INVALID_SETS'));
});
test('external blanks and invalid background distributions remain pending', () => {
  const { catalog, draft } = fixture();
  delete draft.abilities.external.for;
  assert.equal(resolveAbilities(catalog, draft).base.for, undefined);
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.field === 'abilities.for'));
  draft.abilities.external.for = 20;
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.code === 'ABILITY_LIMIT'));
  draft.abilities.backgroundBonuses = { for: 3 };
  assert.ok(resolveAbilities(catalog, draft).problems.some((p) => p.code === 'BACKGROUND_BONUS'));
});
test('grants are deterministic, provenance survives and changing origin removes only its grants', () => {
  const { catalog, draft, species, background } = fixture();
  const trait = entry(4, 'caracteristica', { category: 'traco', manualDecision: true });
  const feat = entry(5, 'talento', {
    category: 'origem',
    repeatable: false,
    prerequisiteText: '',
    requirementsComplete: true,
  });
  catalog.entries.push(trait, feat);
  catalog.grants.push(grant(20, species, trait), grant(21, background, feat));
  const a = resolveConcessions(catalog, draft);
  assert.deepEqual(a, resolveConcessions(catalog, draft));
  assert.equal(a.instances.filter((x) => x.entry.kind === 'talento').length, 1);
  draft.backgroundRef = null;
  const b = resolveConcessions(catalog, draft);
  assert.equal(b.instances.filter((x) => x.entry.kind === 'talento').length, 0);
  assert.ok(b.instances.some((x) => x.entry.ref.recordId === trait.ref.recordId));
});
test('missing references and incomplete prerequisite text cannot silently grant a feat', () => {
  const { catalog, draft, species } = fixture();
  const feat = entry(
    6,
    'talento',
    {
      category: 'origem',
      repeatable: false,
      prerequisiteText: 'Campanha específica',
      requirementsComplete: false,
    },
    'Espírito Manchado',
  );
  catalog.entries.push(feat);
  catalog.grants.push(grant(22, species, feat));
  assert.ok(
    resolveConcessions(catalog, draft).problems.some((p) => p.code === 'INCOMPLETE_REQUIREMENTS'),
  );
  catalog.entries.pop();
  assert.ok(
    resolveConcessions(catalog, draft).problems.some((p) => p.code === 'MISSING_REFERENCE'),
  );
});
test('required choices validate candidates and feat acquisition level', () => {
  const { catalog, draft, cls } = fixture();
  const feat = entry(7, 'talento', {
    category: 'geral',
    repeatable: false,
    prerequisiteText: 'Nível 4',
    requirementsComplete: true,
  });
  catalog.entries.push(feat);
  catalog.grants.push(grant(23, cls, feat, 1));
  catalog.requirements.push({
    id: id(24),
    ownerRevisionId: feat.ref.revisionId,
    parentId: null,
    operator: 'nivel',
    minimum: 4,
    ability: null,
    targetRef: null,
    choiceKey: null,
    proficiencyId: null,
  });
  draft.classes[0].level = 5;
  draft.levels = Array.from({ length: 5 }, (_, i) => ({ ...draft.levels[0], totalLevel: i + 1 }));
  assert.ok(
    resolveConcessions(catalog, draft).problems.some((p) => p.code === 'REQUIREMENT_NOT_MET'),
  );
  const group = {
    id: id(25),
    ownerRevisionId: cls.ref.revisionId,
    key: 'skill',
    name: 'Perícia',
    minimum: 1,
    maximum: 1,
    acquisition: 'inicial' as const,
    abilityPoints: null,
    abilityLimit: null,
    optionKind: null,
    featCategory: null,
    requirementId: null,
    level: 1,
    options: [
      {
        id: id(26),
        groupId: id(25),
        name: 'Atletismo',
        type: 'proficiencia',
        targetRef: null,
        ability: null,
        proficiencyId: id(27),
        value: null,
        quantity: 1,
      },
    ],
  };
  catalog.choices.push(group);
  assert.ok(resolveConcessions(catalog, draft).problems.some((p) => p.code === 'CHOICE_REQUIRED'));
  draft.choices = [
    {
      groupId: group.id,
      sourceInstanceId: `class:${draft.classes[0].id}`,
      values: [{ type: 'option', optionId: id(99) }],
    },
  ];
  assert.ok(resolveConcessions(catalog, draft).problems.some((p) => p.code === 'INVALID_CHOICE'));
});
test('fixed background training participates in feat prerequisites and equipped items must be owned', async () => {
  const { catalog, draft, background, species } = fixture();
  const feat = entry(12, 'talento', {
    category: 'origem',
    repeatable: false,
    prerequisiteText: 'Treinamento',
    requirementsComplete: true,
  });
  catalog.entries.push(feat);
  catalog.grants.push(grant(28, species, feat));
  catalog.proficiencies.push({
    id: id(29),
    ownerRevisionId: background.ref.revisionId,
    type: 'categoria',
    category: 'armadura-leve',
  });
  catalog.effects.push({
    id: id(30),
    ownerRevisionId: background.ref.revisionId,
    key: 'training',
    type: 'proficiencia',
    formula: null,
    requirementId: null,
    level: 1,
    stacking: 'maximo',
    condition: '',
    abilities: [],
    defenses: [],
    resources: [],
    proficiencies: [{ proficiencyId: id(29), degree: 'proficiente' }],
  });
  catalog.requirements.push({
    id: id(31),
    ownerRevisionId: feat.ref.revisionId,
    parentId: null,
    operator: 'proficiencia',
    minimum: null,
    ability: null,
    targetRef: null,
    choiceKey: null,
    proficiencyId: id(29),
  });
  assert.equal(
    resolveConcessions(catalog, draft).problems.filter((p) => p.code === 'REQUIREMENT_NOT_MET')
      .length,
    0,
  );
  const { resolveCreation } = await import('../packages/character-creation/resolve');
  const item = entry(13, 'equipamento', {
    category: 'escudo',
    weight: 1,
    weightUnit: 'kg',
    cost: null,
    currencyRef: null,
    requiresAttunement: false,
    shield: { acBonus: 9 },
  });
  catalog.entries.push(item);
  draft.equippedRefs = [item.ref];
  assert.ok(resolveCreation(catalog, draft).problems.some((p) => p.code === 'EQUIPMENT_NOT_OWNED'));
});
test('proficiency requirements compare the trained domain rather than source-specific IDs', () => {
  const { catalog, draft, species, background } = fixture();
  const feat = entry(14, 'talento', {
    category: 'origem',
    repeatable: false,
    prerequisiteText: 'Armadura leve',
    requirementsComplete: true,
  });
  catalog.entries.push(feat);
  catalog.grants.push(grant(32, species, feat));
  catalog.proficiencies.push(
    {
      id: id(33),
      ownerRevisionId: background.ref.revisionId,
      type: 'categoria',
      category: 'armadura-leve',
    },
    {
      id: id(34),
      ownerRevisionId: feat.ref.revisionId,
      type: 'categoria',
      category: 'armadura-leve',
    },
  );
  catalog.effects.push({
    id: id(35),
    ownerRevisionId: background.ref.revisionId,
    key: 'training',
    type: 'proficiencia',
    formula: null,
    requirementId: null,
    level: 1,
    stacking: 'maximo',
    condition: '',
    abilities: [],
    defenses: [],
    resources: [],
    proficiencies: [{ proficiencyId: id(33), degree: 'proficiente' }],
  });
  catalog.requirements.push({
    id: id(36),
    ownerRevisionId: feat.ref.revisionId,
    parentId: null,
    operator: 'proficiencia',
    minimum: null,
    ability: null,
    targetRef: null,
    choiceKey: null,
    proficiencyId: id(34),
  });
  assert.equal(
    resolveConcessions(catalog, draft).problems.filter((p) => p.code === 'REQUIREMENT_NOT_MET')
      .length,
    0,
  );
});
test('projection does not depend on database row order', async () => {
  const { catalog, draft, species, background } = fixture();
  const a = entry(15, 'caracteristica', { category: 'traco', manualDecision: false }, 'A'),
    b = entry(16, 'caracteristica', { category: 'traco', manualDecision: false }, 'B');
  catalog.entries.push(a, b);
  catalog.grants.push(grant(38, species, a), grant(37, species, b), grant(39, background, a));
  const { resolveCreation } = await import('../packages/character-creation/resolve');
  const first = resolveCreation(catalog, draft);
  const reversed = structuredClone(catalog);
  reversed.entries.reverse();
  reversed.grants.reverse();
  assert.deepEqual(first, resolveCreation(reversed, draft));
});
