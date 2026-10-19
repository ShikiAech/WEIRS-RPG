import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, entry, grant, id } from './fixtures/creation';
import { reconcileSpellSelections } from '../packages/character-creation/reconcile-spells';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { resolveCreation } from '../packages/character-creation/resolve';
import type { SpellcastingProfileDefinition } from '../packages/contracts/compendium';

function castingFixture(method: SpellcastingProfileDefinition['method'] = 'preparadas') {
  const f = fixture();
  f.cls.name = 'Bruxo';
  const definition: SpellcastingProfileDefinition = {
    id: id(30),
    ownerRevisionId: f.cls.ref.revisionId,
    key: 'classe',
    type: 'conjuracao',
    method,
    contributionNumerator: 1,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: ['car'],
    progression: [
      {
        level: 1,
        cantrips: 2,
        prepared: method === 'conhecidas' ? null : 2,
        known: method === 'preparadas' ? null : 3,
        maximumCircle: 1,
      },
      {
        level: 5,
        cantrips: 3,
        prepared: method === 'conhecidas' ? null : 4,
        known: method === 'preparadas' ? null : 5,
        maximumCircle: 3,
      },
    ],
    slots: [],
    spells: [],
  };
  f.catalog.castingProfiles.push(definition);
  const profileId = `class:${f.draft.classes[0].id}/casting:${definition.id}`;
  const spells = [0, 0, 0, 1, 1, 1, 1, 3].map((circle, i) =>
    entry(
      40 + i,
      'magia',
      {
        circle,
        school: '',
        castingTime: '',
        range: '',
        rangeFeet: null,
        duration: '',
        durationSeconds: null,
        concentration: false,
        ritual: false,
        components: {
          verbal: true,
          somatic: false,
          material: '',
          costCopper: null,
          consumed: false,
        },
        classRefs: [f.cls.ref],
        damages: [],
        scales: [],
      },
      `Magia ${i + 1}`,
    ),
  );
  f.catalog.entries.push(...spells);
  const choose = (index: number, prepared = true, origin = profileId) => ({
    profileId: origin,
    spellRef: spells[index].ref,
    prepared,
  });
  return { ...f, definition, profileId, spells, choose };
}

test('retira magia de círculo perdido ao reduzir o nível e mantém outra origem', () => {
  const f = castingFixture();
  const other = {
    ...f.definition,
    id: id(80),
    ownerRevisionId: f.species.ref.revisionId,
    listClassRefs: [f.cls.ref],
    progression: [{ level: 1, cantrips: 0, prepared: 1, known: null, maximumCircle: 3 }],
  };
  f.catalog.castingProfiles.push(other);
  const otherId = `species/casting:${other.id}`;
  f.draft.spellSelections = [f.choose(7), f.choose(3), f.choose(7, true, otherId)];
  const before = structuredClone(f.draft);
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(3), f.choose(7, true, otherId)]);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].name, 'Magia 8');
  assert.equal(result.changes[0].origin, 'Bruxo');
  assert.match(result.changes[0].reason, /círculo.*3.*máximo.*1/);
  assert.equal(result.changes[0].action, 'removed');
  assert.deepEqual(f.draft, before, 'não altera o rascunho recebido');
});

test('troca de lista remove somente as magias ausentes da nova lista', () => {
  const f = castingFixture();
  const cleric = entry(80, 'classe', f.cls.data, 'Clérigo');
  f.catalog.entries.push(cleric);
  f.definition.listClassRefs = [cleric.ref];
  f.spells[1].data.classRefs.push(cleric.ref);
  f.draft.spellSelections = [f.choose(0), f.choose(1)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(1)]);
  assert.match(result.changes[0].reason, /lista.*Clérigo/);
});

test('origem removida, revisão ausente e duplicatas têm motivos distintos', () => {
  const f = castingFixture();
  const duplicate = f.choose(0);
  f.draft.spellSelections = [
    f.choose(0),
    duplicate,
    f.choose(1, false, 'origem-removida'),
    { ...f.choose(3), spellRef: { ...f.spells[3].ref, revisionId: id(999) } },
  ];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(0)]);
  assert.equal(result.changes.length, 3);
  assert.equal(result.changes[0].selection, duplicate);
  assert.match(result.changes[0].reason, /já.*escolhida|duplicad/i);
  assert.match(result.changes[1].reason, /origem.*removida/i);
  assert.match(result.changes[2].reason, /versão.*compêndio/i);
  assert.equal(result.changes[2].name, 'Magia 4');
});

test('redução de cotas mantém as escolhas mais antigas e retira excedentes de truques e preparadas', () => {
  const f = castingFixture();
  f.draft.spellSelections = [0, 1, 2, 3, 4, 5].map((n) => f.choose(n));
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(
    result.draft.spellSelections,
    [0, 1, 3, 4].map((n) => f.choose(n)),
  );
  assert.equal(result.changes.length, 2);
  assert.match(result.changes[0].reason, /limite.*2.*truques/i);
  assert.match(result.changes[1].reason, /limite.*2.*preparadas/i);
  assert.ok(!resolveSpellcasting(f.catalog, result.draft).problems.length);
});

test('origem sem cota de truques remove apenas os truques', () => {
  const f = castingFixture();
  f.definition.progression[0].cantrips = 0;
  f.draft.spellSelections = [f.choose(0), f.choose(3)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(3)]);
  assert.match(result.changes[0].reason, /não.*truques.*nível/i);
});

test('perfil sem progressão disponível não conserva escolhas acima das cotas zeradas', () => {
  const f = castingFixture();
  f.definition.type = 'concedida';
  f.definition.listClassRefs = [f.cls.ref];
  f.definition.progression = [];
  f.definition.slots = [{ level: 1, circle: 1, total: 1 }];
  f.draft.spellSelections = [f.choose(3)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, []);
  assert.match(result.changes[0].reason, /limite.*0.*conhecidas/i);
});

test('cota de conhecidas remove excedentes mesmo que estejam despreparadas', () => {
  const f = castingFixture('conhecidas');
  f.draft.spellSelections = [3, 4, 5, 6].map((n) => f.choose(n, false));
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(
    result.draft.spellSelections,
    [3, 4, 5].map((n) => f.choose(n, false)),
  );
  assert.equal(result.changes[0].name, 'Magia 7');
  assert.match(result.changes[0].reason, /limite.*3.*conhecidas/i);
});

test('grimório preserva magias do livro e apenas desprepara o excesso de preparo', () => {
  const f = castingFixture('grimorio');
  f.draft.spellSelections = [f.choose(3), f.choose(4), f.choose(5), f.choose(6, false)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(3), f.choose(4), f.choose(5, false)]);
  assert.deepEqual(
    result.changes.map((change) => change.action),
    ['unprepared', 'removed'],
  );
  assert.match(result.changes[0].reason, /limite.*2.*preparadas/i);
  assert.match(result.changes[1].reason, /limite.*3.*grimório/i);
  const second = reconcileSpellSelections(f.catalog, result.draft);
  assert.equal(second.draft, result.draft);
  assert.deepEqual(second.changes, []);
});

test('grimório com capacidade disponível preserva magias válidas despreparadas', () => {
  const f = castingFixture('grimorio');
  f.draft.spellSelections = [f.choose(3, false), f.choose(4, false)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.equal(result.draft, f.draft);
  assert.deepEqual(result.changes, []);
});

test('concessões automáticas fora da lista e círculo são preservadas na ficha sem ocupar cota', () => {
  const f = castingFixture();
  f.spells[7].data.classRefs = [];
  f.definition.spells.push({
    spellRef: f.spells[7].ref,
    level: 1,
    alwaysPrepared: true,
    usesSlots: true,
    ownUses: null,
    recovery: null,
  });
  f.draft.spellSelections = [f.choose(0), f.choose(1), f.choose(3), f.choose(4), f.choose(7)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(
    result.draft.spellSelections,
    [0, 1, 3, 4].map((n) => f.choose(n)),
  );
  assert.match(result.changes[0].reason, /concedida automaticamente.*continuará disponível/i);
  const preview = resolveCreation(f.catalog, result.draft);
  assert.equal(preview.problems.length, 0, JSON.stringify(preview.problems));
  assert.ok(preview.sheet!.magias.some((spell) => spell.nome === 'Magia 8' && spell.preparada));
});

test('concessões descendentes também ficam automáticas e liberam sua escolha manual', () => {
  const f = castingFixture();
  f.spells[7].data.classRefs = [];
  const feature = entry(
    80,
    'caracteristica',
    { category: 'classe', manualDecision: false },
    'Dom Mágico',
  );
  f.catalog.entries.push(feature);
  f.catalog.grants.push(grant(81, f.cls, feature), grant(82, feature, f.spells[7]));
  f.draft.spellSelections = [f.choose(7)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, []);
  assert.match(result.changes[0].reason, /concedida automaticamente/);
});

function extraCantripFixture() {
  const f = castingFixture();
  const extra = entry(
    80,
    'caracteristica',
    {
      category: 'escolha-classe',
      manualDecision: false,
      parentRef: f.cls.ref,
    },
    'Taumaturgo',
  );
  const extraProfile: SpellcastingProfileDefinition = {
    ...f.definition,
    id: id(81),
    ownerRevisionId: extra.ref.revisionId,
    type: 'concedida',
    listClassRefs: [f.cls.ref],
    progression: [{ level: 1, cantrips: 1, prepared: 0, known: 0, maximumCircle: 0 }],
  };
  const extraGrant = grant(82, f.cls, extra);
  f.catalog.entries.push(extra);
  f.catalog.castingProfiles.push(extraProfile);
  f.catalog.grants.push(extraGrant);
  const extraId = `class:${f.draft.classes[0].id}/grant:${extraGrant.id}/casting:${extraProfile.id}`;
  return { ...f, extraId };
}

test('conflito de truque preserva a classe base mesmo que o extra tenha sido escolhido antes', () => {
  const f = extraCantripFixture();
  f.draft.spellSelections = [f.choose(0, false, f.extraId), f.choose(0), f.choose(1)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [f.choose(0), f.choose(1)]);
  assert.equal(result.changes[0].origin, 'Taumaturgo');
  assert.match(result.changes[0].reason, /truque adicional.*diferente.*classe/i);
});

test('conflito removido libera cota do extra para a próxima escolha válida', () => {
  const f = extraCantripFixture();
  f.draft.spellSelections = [
    f.choose(0, false, f.extraId),
    f.choose(2, false, f.extraId),
    f.choose(0),
    f.choose(1),
  ];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [
    f.choose(2, false, f.extraId),
    f.choose(0),
    f.choose(1),
  ]);
  assert.equal(result.changes.length, 1);
});

test('truque base excedente não invalida uma escolha válida do extra', () => {
  const f = extraCantripFixture();
  f.draft.spellSelections = [f.choose(0), f.choose(1), f.choose(2), f.choose(2, false, f.extraId)];
  const result = reconcileSpellSelections(f.catalog, f.draft);
  assert.deepEqual(result.draft.spellSelections, [
    f.choose(0),
    f.choose(1),
    f.choose(2, false, f.extraId),
  ]);
  assert.equal(result.changes.length, 1);
});
