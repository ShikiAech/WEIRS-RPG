import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, entry, grant, id } from './fixtures/creation';
import { resolveCreation } from '../packages/character-creation/resolve';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { requirementMet } from '../packages/character-creation/requirements';
import { profileGrantedSpells } from '../packages/character-creation/casting-grants';
import { resolveState } from '../packages/character-creation/state';
import type {
  ChoiceGroupDefinition,
  SpellcastingProfileDefinition,
} from '../packages/contracts/compendium';

const profile = (
  owner: ReturnType<typeof fixture>['cls'],
  n = 30,
): SpellcastingProfileDefinition => ({
  id: id(n),
  ownerRevisionId: owner.ref.revisionId,
  key: 'classe',
  type: 'conjuracao',
  method: 'conhecidas',
  contributionNumerator: 1,
  contributionDenominator: 1,
  rounding: 'baixo',
  firstLevel: 1,
  abilities: ['car'],
  progression: [{ level: 1, cantrips: 2, prepared: null, known: 0, maximumCircle: 0 }],
  slots: [],
  spells: [],
});
function spells(cls: ReturnType<typeof fixture>['cls']) {
  return [40, 41, 42].map((n) =>
    entry(
      n,
      'magia',
      {
        circle: 0,
        school: '',
        castingTime: '',
        range: '18m',
        rangeFeet: 60,
        duration: '',
        durationSeconds: null,
        concentration: false,
        ritual: false,
        components: {
          verbal: true,
          somatic: true,
          material: '',
          costCopper: null,
          consumed: false,
        },
        classRefs: [cls.ref],
        damages: n === 41 ? [] : [{ id: id(n + 50), order: 0, dice: '1d8', damageType: 'fogo' }],
        scales: [],
      },
      n === 41 ? 'Luz' : 'Dano ' + n,
    ),
  );
}
function invocationFixture() {
  const f = fixture(),
    [damage, light, unknown] = spells(f.cls),
    p = profile(f.cls);
  const inv = entry(
    50,
    'caracteristica',
    {
      category: 'invocacao',
      manualDecision: false,
      optional: true,
      spellPrerequisite: { classRef: f.cls.ref, circle: 0, dealsDamage: true },
    },
    'Rajada Agonizante',
  );
  const g: ChoiceGroupDefinition = {
    id: id(51),
    ownerRevisionId: inv.ref.revisionId,
    key: 'truque-afetado',
    name: 'Truque afetado',
    minimum: 1,
    maximum: 1,
    acquisition: 'ambas',
    abilityPoints: null,
    abilityLimit: null,
    optionKind: null,
    featCategory: null,
    requirementId: null,
    level: 1,
    options: [damage, light, unknown].map((s, i) => ({
      id: id(52 + i),
      groupId: id(51),
      name: s.name,
      type: 'magia-alvo',
      targetRef: s.ref,
      ability: null,
      proficiencyId: null,
      value: null,
      quantity: 1,
    })),
  };
  f.catalog.entries.push(damage, light, unknown, inv);
  f.catalog.castingProfiles.push(p);
  f.catalog.choices.push(g);
  const invGrant = grant(55, f.cls, inv);
  f.catalog.grants.push(invGrant);
  const origin = `class:${f.draft.classes[0].id}`,
    instance = `${origin}/grant:${invGrant.id}`;
  f.draft.spellSelections.push(
    ...[damage, light].map((s) => ({
      profileId: `${origin}/casting:${p.id}`,
      spellRef: s.ref,
      prepared: false,
    })),
  );
  f.draft.choices.push({
    groupId: g.id,
    sourceInstanceId: instance,
    values: [{ type: 'option', optionId: g.options[0].id }],
  });
  return { ...f, damage, light, unknown, inv, g, instance };
}

test('ausente nega posse do outro pacto e falha fechado sem referência', () => {
  const { catalog, cls } = fixture();
  catalog.requirements.push({
    id: id(60),
    ownerRevisionId: cls.ref.revisionId,
    parentId: null,
    operator: 'ausente' as any,
    ability: null,
    targetRef: cls.ref,
    minimum: null,
    choiceKey: null,
    proficiencyId: null,
  });
  const ctx = {
    level: 1,
    classLevels: new Map<string, number>(),
    abilities: {},
    records: new Set<string>(),
    proficiencies: new Set<string>(),
    choices: [],
    repetitions: new Map<string, number>(),
  };
  assert.equal(requirementMet(catalog, id(60), ctx), true);
  ctx.records.add(cls.ref.revisionId);
  assert.equal(requirementMet(catalog, id(60), ctx), false);
  catalog.requirements[0].targetRef = null;
  ctx.records.clear();
  assert.equal(requirementMet(catalog, id(60), ctx), false);
});

test('alvo de invocação exige truque conhecido elegível sem conceder outro exemplar', () => {
  const f = invocationFixture();
  let result = resolveCreation(f.catalog, f.draft);
  assert.equal(result.problems.length, 0, JSON.stringify(result.problems));
  assert.match(
    result.sheet!.caracteristicas.find((c) => c.nome === f.inv.name)!.descricao,
    /Truque afetado: Dano 40/,
  );
  assert.equal(
    resolveConcessions(f.catalog, f.draft).instances.filter((i) => i.entry.kind === 'magia').length,
    0,
  );
  const active = resolveConcessions(f.catalog, f.draft).choices.find((c) => c.group.id === f.g.id)!;
  assert.deepEqual(
    active.group.options.map((o) => o.name),
    [f.damage.name],
  );
  for (const option of f.g.options.slice(1)) {
    f.draft.choices[0].values = [{ type: 'option', optionId: option.id }];
    result = resolveCreation(f.catalog, f.draft);
    assert.ok(result.problems.some((p) => p.code === 'INVALID_SPELL_TARGET'));
    assert.equal(result.sheet, null);
  }
});

test('invocação repetível requer alvo diferente para cada exemplar', () => {
  const f = invocationFixture();
  f.inv.description = 'Repetível. Escolha um truque diferente a cada vez.';
  f.draft.spellSelections[1].spellRef = f.unknown.ref;
  const second = grant(61, f.cls, f.inv);
  f.catalog.grants.push(second);
  f.draft.choices.push({
    groupId: f.g.id,
    sourceInstanceId: `class:${f.draft.classes[0].id}/grant:${second.id}`,
    values: [{ type: 'option', optionId: f.g.options[0].id }],
  });
  assert.ok(
    resolveCreation(f.catalog, f.draft).problems.some((p) => p.code === 'DUPLICATE_SPELL_TARGET'),
  );
  f.draft.choices[1].values = [{ type: 'option', optionId: f.g.options[2].id }];
  assert.equal(resolveCreation(f.catalog, f.draft).problems.length, 0);
});

test('truque adicional da ordem exige magia distinta dos truques base da mesma classe', () => {
  const f = fixture(),
    [one, two, third] = spells(f.cls),
    p = profile(f.cls);
  const extra = entry(
    70,
    'caracteristica',
    { category: 'escolha-classe', manualDecision: false, parentRef: f.cls.ref },
    'Taumaturgo',
  );
  const extraProfile = {
    ...p,
    id: id(71),
    ownerRevisionId: extra.ref.revisionId,
    key: 'ordem-divina',
    type: 'concedida' as const,
    listClassRefs: [f.cls.ref],
    contributionNumerator: 0,
    progression: [{ level: 1, cantrips: 1, prepared: 0, known: 0, maximumCircle: 0 }],
  };
  const gr = grant(72, f.cls, extra),
    origin = `class:${f.draft.classes[0].id}`;
  f.catalog.entries.push(one, two, third, extra);
  f.catalog.grants.push(gr);
  f.catalog.castingProfiles.push(p, extraProfile);
  f.draft.spellSelections.push(
    ...[one, two].map((s) => ({
      profileId: `${origin}/casting:${p.id}`,
      spellRef: s.ref,
      prepared: false,
    })),
    {
      profileId: `${origin}/grant:${gr.id}/casting:${extraProfile.id}`,
      spellRef: one.ref,
      prepared: false,
    },
  );
  assert.ok(
    resolveCreation(f.catalog, f.draft).problems.some(
      (p) => p.code === 'ADDITIONAL_CANTRIP_DUPLICATE',
    ),
  );
  f.draft.spellSelections[2].spellRef = third.ref;
  assert.equal(resolveCreation(f.catalog, f.draft).problems.length, 0);
});

test('magia fixa usa somente a concessão do maior nível atingido', () => {
  const f = fixture(),
    [spell] = spells(f.cls),
    p = profile(f.cls);
  p.spells = [1, 5].map((level, i) => ({
    spellRef: spell.ref,
    level,
    alwaysPrepared: true,
    usesSlots: true,
    ownUses: 2 + i,
    recovery: 'longo',
  }));
  f.catalog.entries.push(spell);
  f.catalog.castingProfiles.push(p);
  const state = resolveState(f.catalog, f.draft),
    instance = state.concessions.instances.find((i) => i.entry.kind === 'classe')!;
  let granted = profileGrantedSpells(f.catalog, state, instance, p);
  assert.equal(granted.length, 1);
  assert.equal(granted[0].ownUses, 2);
  granted = profileGrantedSpells(f.catalog, state, { ...instance, level: 5 }, p);
  assert.equal(granted.length, 1);
  assert.equal(granted[0].ownUses, 3);
});
