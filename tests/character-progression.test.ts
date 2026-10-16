import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { resolveCreation } from '../packages/character-creation/resolve';
import { fixture, entry, classData, grant, id } from './fixtures/creation';
import type { SpellcastingProfileDefinition } from '../packages/contracts/compendium';
function levels(draft: ReturnType<typeof fixture>['draft'], counts: number[]) {
  draft.levels = [];
  counts.forEach((count, index) => {
    draft.classes[index].level = count;
    for (let n = 0; n < count; n++)
      draft.levels.push({
        totalLevel: draft.levels.length + 1,
        classEntryId: draft.classes[index].id,
        hitPointMethod: 'fixed',
        hitPointRoll: null,
      });
  });
}
function caster(
  owner: string,
  n: number,
  denominator: 1 | 2 | 3,
  rounding: 'cima' | 'baixo',
  type: 'conjuracao' | 'pacto' | 'concedida' = 'conjuracao',
): SpellcastingProfileDefinition {
  return {
    id: id(n),
    ownerRevisionId: owner,
    key: 'casting',
    type,
    method: 'conhecidas',
    contributionNumerator: 1,
    contributionDenominator: denominator,
    rounding,
    firstLevel: 1,
    abilities: ['car'],
    progression: Array.from({ length: 20 }, (_, i) => ({
      level: i + 1,
      cantrips: 2,
      prepared: null,
      known: i + 2,
      maximumCircle: Math.ceil((i + 1) / denominator / 2),
    })),
    slots: Array.from({ length: 20 }, (_, i) => ({
      level: i + 1,
      circle: 1,
      total: type === 'pacto' ? 2 : Math.min(i + 2, 4),
    })),
    spells: [],
  };
}
test('HP maximizes only first total level; mixed dice and Constitution are retroactive', () => {
  const { catalog, draft } = fixture();
  const other = entry(8, 'classe', classData(12));
  catalog.entries.push(other);
  draft.classes.push({ id: id(102), classRef: other.ref, subclassRef: null, level: 1 });
  levels(draft, [2, 1]);
  let hp = resolveHitPoints(catalog, draft);
  assert.deepEqual(
    hp.levels.map((l) => l.roll),
    [8, 5, 7],
  );
  assert.equal(hp.total, 20);
  draft.abilities.external.con = 14;
  hp = resolveHitPoints(catalog, draft);
  assert.equal(hp.total, 26);
  draft.levels[1].hitPointMethod = 'roll';
  draft.levels[1].hitPointRoll = 1;
  draft.abilities.external.con = 1;
  assert.equal(resolveHitPoints(catalog, draft).levels[1].gain, 1);
  draft.levels[1].hitPointRoll = 9;
  assert.ok(resolveHitPoints(catalog, draft).problems.length);
});
test('AC uses one applicable alternative and selected form movement', () => {
  const { catalog, draft, species } = fixture();
  draft.abilities.external.con = 16;
  draft.abilities.external.des = 16;
  catalog.effects.push({
    id: id(60),
    ownerRevisionId: species.ref.revisionId,
    key: 'shell',
    type: 'ca_formula',
    stacking: 'alternativa',
    formula: {
      op: 'add',
      args: [
        { op: 'constant', value: 13 },
        { op: 'ability_modifier', ability: 'con' },
      ],
    },
    requirementId: null,
    level: 1,
    condition: '',
    abilities: [],
    defenses: [{ damageType: null, unarmored: true, permitsShield: true }],
    resources: [],
    proficiencies: [],
  });
  const shield = entry(9, 'equipamento', {
    category: 'escudo',
    weight: 3,
    weightUnit: 'kg',
    cost: null,
    currencyRef: null,
    requiresAttunement: false,
    shield: { acBonus: 2 },
  });
  catalog.entries.push(shield);
  draft.equippedRefs = [shield.ref];
  assert.equal(resolveDefenses(catalog, draft).armorClass, 18);
  species.data.movements.push({
    id: id(61),
    mode: 'voo',
    distance: 60,
    unit: 'pes',
    form: 'exotraje',
    condition: '',
    hover: false,
  });
  assert.equal(
    resolveDefenses(catalog, draft).movements.some((m) => m.mode === 'voo'),
    false,
  );
  draft.form = 'exotraje';
  assert.equal(resolveDefenses(catalog, draft).movements.find((m) => m.mode === 'voo')?.feet, 60);
});
test('single casting source uses own table, multiclass sums fractions and never unlocks higher spells', () => {
  const { catalog, draft, cls } = fixture();
  const other = entry(10, 'classe', classData(6));
  catalog.entries.push(other);
  draft.classes.push({ id: id(102), classRef: other.ref, subclassRef: null, level: 3 });
  levels(draft, [4, 3]);
  const half = caster(cls.ref.revisionId, 70, 2, 'cima'),
    full = caster(other.ref.revisionId, 71, 1, 'baixo');
  catalog.castingProfiles = [half, full];
  catalog.multiclassSlots = [
    { level: 5, circle: 1, total: 4 },
    { level: 5, circle: 2, total: 3 },
    { level: 5, circle: 3, total: 2 },
  ];
  let sc = resolveSpellcasting(catalog, draft);
  assert.equal(sc.effectiveCasterLevel, 5);
  assert.deepEqual(
    sc.slots.map((s) => s.total),
    [4, 3, 2],
  );
  assert.deepEqual(
    sc.profiles.map((p) => p.maximumCircle),
    [1, 2],
  );
  catalog.castingProfiles.pop();
  sc = resolveSpellcasting(catalog, draft);
  assert.deepEqual(sc.slots, [{ circle: 1, total: 4 }]);
  catalog.castingProfiles = [{ ...half, contributionDenominator: 3, rounding: 'baixo' }, full];
  assert.equal(resolveSpellcasting(catalog, draft).effectiveCasterLevel, 4);
});
test('pact remains separate and two granted spell sources retain own uses and profiles', () => {
  const { catalog, draft, cls, species, background } = fixture();
  catalog.castingProfiles = [
    caster(cls.ref.revisionId, 72, 1, 'baixo', 'pacto'),
    caster(species.ref.revisionId, 73, 1, 'baixo', 'concedida'),
    caster(background.ref.revisionId, 74, 1, 'baixo', 'concedida'),
  ];
  let sc = resolveSpellcasting(catalog, draft);
  assert.equal(sc.slots.length, 0);
  assert.equal(sc.pactSlots[0].total, 2);
  assert.equal(sc.profiles.length, 3);
  const profile = sc.profiles[1];
  draft.castingAbilities = [{ profileId: profile.id, ability: 'int' }];
  sc = resolveSpellcasting(catalog, draft);
  assert.ok(sc.problems.some((p) => p.code === 'CASTING_ABILITY'));
});
test('projection is deterministic and does not grant merely loaded dependencies', () => {
  const { catalog, draft } = fixture();
  catalog.entries.push(
    entry(
      11,
      'talento',
      { category: 'origem', repeatable: false, prerequisiteText: '', requirementsComplete: true },
      'Não adquirido',
    ),
  );
  const preview = resolveCreation(catalog, draft);
  assert.equal(preview.problems.length, 0);
  assert.ok(preview.sheet);
  assert.deepEqual(preview, resolveCreation(catalog, draft));
  assert.equal(preview.sheet!.talentos.length, 0);
});
