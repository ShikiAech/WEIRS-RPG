import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, entry, grant, id } from './fixtures/creation';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { resolveCreation } from '../packages/character-creation/resolve';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import type { ChoiceGroupDefinition } from '../packages/contracts/compendium';

test('especialização exige proficiência anterior e projeta o grau sem criar treinamento próprio', () => {
  const { catalog, draft, cls, background } = fixture();
  catalog.proficiencies.push({
    id: id(20),
    ownerRevisionId: cls.ref.revisionId,
    type: 'pericia',
    skill: 'furtividade',
  });
  const group: ChoiceGroupDefinition = {
    id: id(21),
    ownerRevisionId: cls.ref.revisionId,
    key: 'expertise',
    name: 'Especialização',
    minimum: 1,
    maximum: 1,
    acquisition: 'ambas',
    abilityPoints: null,
    abilityLimit: null,
    optionKind: null,
    featCategory: null,
    requirementId: null,
    level: 1,
    options: [
      {
        id: id(22),
        groupId: id(21),
        name: 'furtividade',
        type: 'especializacao',
        targetRef: null,
        ability: null,
        proficiencyId: id(20),
        value: null,
        quantity: 1,
      },
    ],
  };
  catalog.choices.push(group);
  draft.choices.push({
    groupId: group.id,
    sourceInstanceId: `class:${draft.classes[0].id}`,
    values: [{ type: 'option', optionId: id(22) }],
  });
  let result = resolveCreation(catalog, draft);
  assert.ok(result.problems.some((p) => p.code === 'EXPERTISE_REQUIRES_PROFICIENCY'));
  assert.equal(result.sheet, null);
  // Background proficiency is a distinct record, and can be discovered after the class choice.
  catalog.proficiencies.push({
    id: id(23),
    ownerRevisionId: background.ref.revisionId,
    type: 'pericia',
    skill: 'furtividade',
  });
  catalog.effects.push({
    id: id(24),
    ownerRevisionId: background.ref.revisionId,
    key: 'trained',
    type: 'proficiencia',
    formula: null,
    requirementId: null,
    level: 1,
    stacking: 'maximo',
    condition: '',
    abilities: [],
    defenses: [],
    resources: [],
    proficiencies: [{ proficiencyId: id(23), degree: 'proficiente' }],
  });
  result = resolveCreation(catalog, draft);
  assert.deepEqual(result.problems, []);
  assert.equal(result.sheet!.pericias.furtividade.grau, 'especializacao');
});

test('uma característica opcional não ignora requisito de nível da própria classe', () => {
  const { catalog, draft, cls } = fixture();
  const feature = entry(
    30,
    'caracteristica',
    { category: 'invocacao', manualDecision: false, optional: true },
    'Invocação restrita',
  );
  catalog.entries.push(feature);
  catalog.grants.push(grant(31, cls, feature));
  catalog.requirements.push({
    id: id(32),
    ownerRevisionId: feature.ref.revisionId,
    parentId: null,
    operator: 'nivel-classe',
    ability: null,
    targetRef: cls.ref,
    minimum: 3,
    choiceKey: null,
    proficiencyId: null,
  });
  let resolved = resolveConcessions(catalog, draft);
  assert.ok(resolved.problems.some((p) => p.code === 'REQUIREMENT_NOT_MET'));
  assert.ok(!resolved.instances.some((i) => i.entry.ref.recordId === feature.ref.recordId));
  draft.classes[0].level = 3;
  draft.levels = Array.from({ length: 3 }, (_, i) => ({ ...draft.levels[0], totalLevel: i + 1 }));
  resolved = resolveConcessions(catalog, draft);
  assert.ok(resolved.instances.some((i) => i.entry.ref.recordId === feature.ref.recordId));
  assert.ok(!resolved.problems.some((p) => p.code === 'REQUIREMENT_NOT_MET'));
});

test('grupo de especialização não repete uma especialização já adquirida', () => {
  const { catalog, draft, cls } = fixture();
  catalog.proficiencies.push({
    id: id(40),
    ownerRevisionId: cls.ref.revisionId,
    type: 'pericia',
    skill: 'furtividade',
  });
  cls.data.proficiencies.push({ proficiencyId: id(40), acquisition: 'inicial' });
  for (let i = 0; i < 2; i++) {
    const group: ChoiceGroupDefinition = {
      id: id(41 + i),
      ownerRevisionId: cls.ref.revisionId,
      key: `expertise-${i}`,
      name: 'Especialização',
      minimum: 1,
      maximum: 1,
      acquisition: 'ambas',
      abilityPoints: null,
      abilityLimit: null,
      optionKind: null,
      featCategory: null,
      requirementId: null,
      level: 1,
      options: [
        {
          id: id(43 + i),
          groupId: id(41 + i),
          name: 'furtividade',
          type: 'especializacao',
          targetRef: null,
          ability: null,
          proficiencyId: id(40),
          value: null,
          quantity: 1,
        },
      ],
    };
    catalog.choices.push(group);
    draft.choices.push({
      groupId: group.id,
      sourceInstanceId: `class:${draft.classes[0].id}`,
      values: [{ type: 'option', optionId: group.options[0].id }],
    });
  }
  assert.ok(
    resolveConcessions(catalog, draft).problems.some((p) => p.code === 'DUPLICATE_EXPERTISE'),
  );
});

test('magia escolhida por uma invocação chega ao perfil e à ficha com sua origem', () => {
  const { catalog, draft, cls } = fixture();
  const invocation = entry(
    60,
    'caracteristica',
    { category: 'invocacao', manualDecision: false, optional: true },
    'Livro de teste',
  );
  const spell = entry(
    61,
    'magia',
    {
      circle: 1,
      school: '',
      castingTime: '1 ação',
      range: '9 m',
      rangeFeet: 30,
      duration: '1 minuto',
      durationSeconds: 60,
      concentration: false,
      ritual: true,
      components: { verbal: true, somatic: false, material: '', costCopper: null, consumed: false },
      classRefs: [],
      damages: [],
      scales: [],
    },
    'Ritual do livro',
  );
  catalog.entries.push(invocation, spell);
  catalog.grants.push(grant(62, cls, invocation));
  catalog.castingProfiles.push({
    id: id(63),
    ownerRevisionId: invocation.ref.revisionId,
    key: 'livro',
    type: 'concedida',
    method: 'fixas',
    contributionNumerator: 0,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: ['car'],
    progression: [],
    slots: [],
    spells: [],
  });
  catalog.choices.push({
    id: id(64),
    ownerRevisionId: invocation.ref.revisionId,
    key: 'livro-magias',
    name: 'Rituais',
    minimum: 1,
    maximum: 1,
    acquisition: 'ambas',
    abilityPoints: null,
    abilityLimit: null,
    optionKind: null,
    featCategory: null,
    requirementId: null,
    level: 1,
    options: [
      {
        id: id(65),
        groupId: id(64),
        name: spell.name,
        type: 'magia',
        targetRef: spell.ref,
        ability: null,
        proficiencyId: null,
        value: 'nao-preparada',
        quantity: 1,
      },
    ],
  });
  const owner = resolveConcessions(catalog, draft).instances.find(
    (i) => i.entry.ref.recordId === invocation.ref.recordId,
  )!;
  draft.choices.push({
    groupId: id(64),
    sourceInstanceId: owner.id,
    values: [{ type: 'option', optionId: id(65) }],
  });
  const preview = resolveCreation(catalog, draft);
  assert.deepEqual(preview.problems, []);
  assert.equal(preview.spellcasting.profiles[0].maximumCircle, 1);
  assert.equal(preview.sheet!.magias.length, 1);
  assert.equal(preview.sheet!.magias[0].nome, spell.name);
  assert.equal(preview.sheet!.magias[0].preparada, true);
  assert.equal(preview.sheet!.conjuracao.perfis[0].atributo, 'car');
  draft.spellSelections.push({ profileId: 'outra-origem', spellRef: spell.ref, prepared: true });
  const collision = resolveConcessions(catalog, draft);
  assert.ok(collision.problems.some((p) => p.code === 'SPELL_ALREADY_PREPARED'));
  assert.ok(collision.choices.find((c) => c.group.id === id(64))?.unavailableOptions?.[id(65)]);
});

test('listas explícitas sem escolha representam união; uma escolha de lista continua obrigatória', () => {
  const { catalog, draft, cls } = fixture();
  const secondClass = entry(70, 'classe', { ...cls.data }, 'Outra lista');
  catalog.entries.push(secondClass);
  catalog.castingProfiles.push({
    id: id(71),
    ownerRevisionId: cls.ref.revisionId,
    key: 'uniao',
    type: 'concedida',
    method: 'fixas',
    listClassRefs: [cls.ref, secondClass.ref],
    contributionNumerator: 0,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: ['int'],
    progression: [],
    slots: [],
    spells: [],
  });
  const union = resolveSpellcasting(catalog, draft);
  assert.deepEqual(union.profiles[0].listClassRevisionIds, [
    cls.ref.revisionId,
    secondClass.ref.revisionId,
  ]);
  assert.ok(!union.problems.some((p) => p.code === 'SPELL_LIST_REQUIRED'));
  catalog.castingProfiles[0].listChoiceKey = 'escolha-obrigatoria';
  assert.ok(
    resolveSpellcasting(catalog, draft).problems.some((p) => p.code === 'SPELL_LIST_REQUIRED'),
  );
});

test('truque concedido pelo Tomo satisfaz requisito de truque da sua classe; magia racial não satisfaz', () => {
  const { catalog, draft, cls, species } = fixture();
  const tome = entry(
    80,
    'caracteristica',
    { category: 'invocacao', manualDecision: false, optional: true },
    'Tomo',
  );
  const invocation = entry(
    81,
    'caracteristica',
    {
      category: 'invocacao',
      manualDecision: false,
      optional: true,
      spellPrerequisite: { classRef: cls.ref, circle: 0, dealsDamage: true },
    },
    'Invocação com truque',
  );
  const spell = entry(
    82,
    'magia',
    {
      circle: 0,
      school: '',
      castingTime: '',
      range: '36 m',
      rangeFeet: 120,
      duration: '',
      durationSeconds: null,
      concentration: false,
      ritual: false,
      components: { verbal: true, somatic: true, material: '', costCopper: null, consumed: false },
      classRefs: [],
      damages: [{ id: id(89), order: 0, dice: '1d10', damageType: 'fogo' }],
      scales: [],
    },
    'Truque de outra lista',
  );
  catalog.entries.push(tome, invocation, spell);
  catalog.grants.push(grant(83, cls, tome), grant(84, cls, invocation), grant(85, tome, spell));
  catalog.castingProfiles.push({
    id: id(86),
    ownerRevisionId: tome.ref.revisionId,
    key: 'tomo',
    type: 'concedida',
    method: 'fixas',
    contributionNumerator: 0,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: ['car'],
    progression: [],
    slots: [],
    spells: [],
  });
  const resolved = resolveConcessions(catalog, draft);
  assert.ok(resolved.instances.some((i) => i.entry.ref.recordId === invocation.ref.recordId));
  assert.ok(!resolved.problems.some((p) => p.code === 'SPELL_PREREQUISITE'));
  catalog.grants = catalog.grants.filter((g) => g.id !== id(85));
  catalog.grants.push(grant(87, species, spell));
  assert.ok(
    resolveConcessions(catalog, draft).problems.some((p) => p.code === 'SPELL_PREREQUISITE'),
  );
});
