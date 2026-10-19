import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import type { ResolvedEntry } from '../tools/compendium-import/resolved';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { fixture } from './fixtures/creation';

const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
  loadCuration(process.cwd()),
]);
registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
const catalog = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);
const find = (kind: string, name: string, parent?: string) =>
  catalog.entries.find(
    (e) =>
      e.kind === kind &&
      (e.name === name || e.aliases.includes(name)) &&
      (!parent ||
        (e.kind === 'caracteristica' &&
          catalog.entries.find((p) => p.ref.revisionId === e.data.parentRef?.revisionId)?.name ===
            parent)),
  )!;
const groups = (owner: ResolvedEntry) =>
  catalog.choices.filter((g) => g.ownerRevisionId === owner.ref.revisionId);
const profGroups = (owner: ResolvedEntry, type: string) =>
  groups(owner).filter((g) => g.options.some((o) => o.type === type));

test('Bardo imports any three skills and three instrument proficiencies', () => {
  const bard = find('classe', 'Bardo');
  const skills = groups(bard).find((g) => g.key === 'pericias')!;
  assert.ok(skills, 'any three skills choice is required');
  assert.equal(skills.minimum, 3);
  assert.equal(skills.options.length, 18);
  const instruments = groups(bard).find((g) => g.key === 'instrumentos')!;
  assert.equal(instruments?.minimum, 3);
  assert.ok(instruments.options.length >= 10);
  assert.ok(
    instruments.options.every((o) =>
      catalog.entries
        .find(
          (e) =>
            e.ref.revisionId ===
            catalog.proficiencies.find((p) => p.id === o.proficiencyId)?.equipment?.revisionId,
        )
        ?.sourcePath.includes('ferramentas'),
    ),
  );
});
test('Bard and Rogue expertise progresses at the levels printed in their own source', () => {
  for (const [name, levels] of [
    ['Bardo', [2, 9]],
    ['Ladino', [1, 6]],
  ] as const) {
    const expertise = profGroups(find('classe', name), 'especializacao');
    assert.deepEqual(
      expertise.map((g) => [g.level, g.minimum]),
      levels.map((l) => [l, 2]),
    );
    assert.ok(
      expertise.every((g) => g.options.length === 18 && g.options.every((o) => !!o.proficiencyId)),
    );
  }
});
test('Monk chooses one artisan tool or instrument; Barbarian gains one skill at level3', () => {
  const monk = groups(find('classe', 'Monge')).find((g) => g.key === 'ferramenta-instrumento');
  assert.equal(monk?.minimum, 1);
  assert.ok(monk!.options.length > 20);
  const barbarian = groups(find('classe', 'Bárbaro')).find(
    (g) => g.key === 'conhecimento-primitivo',
  );
  assert.equal(barbarian?.level, 3);
  assert.equal(barbarian.minimum, 1);
  assert.equal(barbarian.options.length, 6);
});
test('Rogue has two masteries; Barbarian masteries contain only melee weapons', () => {
  const rogue = groups(find('classe', 'Ladino')).find((g) => g.key === 'maestrias-1');
  assert.equal(rogue?.minimum, 2);
  for (const g of groups(find('classe', 'Bárbaro')).filter((g) => g.key.startsWith('maestrias-')))
    assert.ok(
      g.options.every((o) => {
        const w = catalog.entries.find((e) => e.ref.revisionId === o.targetRef?.revisionId);
        return w?.kind === 'equipamento' && w.data.weapon?.rangeType === 'corpo-a-corpo';
      }),
    );
});
test('Battle Master chooses three maneuvers and gains two more at7,10,15 plus student training', () => {
  const master = find('subclasse', 'Mestre de Batalha');
  const maneuvers = groups(master).filter((g) => g.key.startsWith('manobras-'));
  assert.deepEqual(
    maneuvers.map((g) => [g.level, g.minimum]),
    [
      [3, 3],
      [7, 2],
      [10, 2],
      [15, 2],
    ],
  );
  assert.ok(maneuvers.every((g) => g.options.length >= 15));
  assert.equal(groups(master).find((g) => g.key === 'estudante-pericia')?.minimum, 1);
  assert.equal(groups(master).find((g) => g.key === 'estudante-ferramenta')?.minimum, 1);
  for (const g of maneuvers)
    assert.ok(
      g.options.every(
        (o) => !catalog.grants.some((gr) => gr.targetRef?.revisionId === o.targetRef?.revisionId),
      ),
    );
});
test('Warlock invocation quotas follow source table and every listed option stays optional with exact levels', () => {
  const warlock = find('classe', 'Bruxo');
  const invocations = groups(warlock).filter((g) => g.key.startsWith('invocacoes-'));
  assert.deepEqual(
    invocations.map((g) => [g.level, g.minimum]),
    [
      [1, 1],
      [2, 2],
      [5, 2],
      [7, 1],
      [9, 1],
      [12, 1],
      [15, 1],
      [18, 1],
    ],
  );
  assert.ok(
    invocations.every((g) => new Set(g.options.map((o) => o.targetRef?.recordId)).size === 30),
  );
  for (const [name, level] of [
    ['Armadura das Sombras', undefined],
    ['Lâmina Devoradora', 12],
    ['Visão de Bruxa', 15],
  ] as const) {
    const invocation = find('caracteristica', name, 'Bruxo');
    assert.ok(invocation.kind === 'caracteristica' && invocation.data.optional);
    assert.equal(
      catalog.requirements.find(
        (r) => r.ownerRevisionId === invocation.ref.revisionId && r.operator === 'nivel-classe',
      )?.minimum,
      level,
    );
    assert.ok(!catalog.grants.some((g) => g.targetRef?.revisionId === invocation.ref.revisionId));
  }
  const devour = find('caracteristica', 'Lâmina Devoradora', 'Bruxo');
  assert.equal(
    catalog.requirements.find(
      (r) => r.ownerRevisionId === devour.ref.revisionId && r.operator === 'caracteristica',
    )?.targetRef?.revisionId,
    find('caracteristica', 'Lâmina Sedenta', 'Bruxo').ref.revisionId,
  );
});
test('Sorcerer metamagic offers two options at2,10,17 and no automatic options', () => {
  const gs = groups(find('classe', 'Feiticeiro')).filter((g) => g.key.startsWith('metamagia-'));
  assert.deepEqual(
    gs.map((g) => [g.level, g.minimum]),
    [
      [2, 2],
      [10, 2],
      [17, 2],
    ],
  );
  assert.ok(gs.every((g) => g.options.length === 10));
});
test('Divine and Primal Orders record permanent decisions and grant the matching proficiency or cantrip list', () => {
  for (const [cls, key, casting, martial, armor] of [
    ['Clérigo', 'ordem-divina', 'Taumaturgo', 'Protetor', 'armadura-pesada'],
    ['Druida', 'ordem-primitiva', 'Magista', 'Guardião', 'armadura-media'],
  ] as const) {
    const group = groups(find('classe', cls)).find((g) => g.key === key)!;
    assert.equal(group?.minimum, 1);
    assert.equal(group.options.length, 2);
    const caster = catalog.entries.find(
      (e) =>
        e.ref.revisionId === group.options.find((o) => o.name === casting)?.targetRef?.revisionId,
    )!;
    const p = catalog.castingProfiles.find((p) => p.ownerRevisionId === caster.ref.revisionId)!;
    assert.equal(p?.progression[0].cantrips, 1);
    assert.deepEqual(p.listClassRefs, [find('classe', cls).ref]);
    const warrior = catalog.entries.find(
      (e) =>
        e.ref.revisionId === group.options.find((o) => o.name === martial)?.targetRef?.revisionId,
    )!;
    assert.ok(
      catalog.effects.some(
        (e) =>
          e.ownerRevisionId === warrior.ref.revisionId &&
          e.proficiencies.some(
            (p) => catalog.proficiencies.find((x) => x.id === p.proficiencyId)?.category === armor,
          ),
      ),
    );
  }
});
test('Druid always receives Herbalism, Druidic, and Speak with Animals without consuming prepared quota', () => {
  const druid = find('classe', 'Druida');
  assert.ok(
    druid.kind === 'classe' &&
      druid.data.proficiencies.some(
        (p) =>
          catalog.proficiencies.find((x) => x.id === p.proficiencyId)?.equipment?.revisionId ===
          find('equipamento', 'Kit de Herbalismo').ref.revisionId,
      ),
  );
  assert.ok(
    catalog.effects.some(
      (e) =>
        e.ownerRevisionId === druid.ref.revisionId &&
        e.key === 'idioma-druidico' &&
        e.type === 'proficiencia',
    ),
  );
  assert.ok(
    catalog.castingProfiles
      .find((p) => p.ownerRevisionId === druid.ref.revisionId && p.key === 'classe')
      ?.spells.some(
        (s) =>
          s.spellRef.revisionId === find('magia', 'Falar com Animais').ref.revisionId &&
          s.alwaysPrepared,
      ),
  );
});
test('Paladin and Ranger caster styles offer only two cantrips from their stated class list', () => {
  for (const [cls, style, list, ability] of [
    ['Paladino', 'Guerreiro Abençoado', 'Clérigo', 'car'],
    ['Patrulheiro', 'Guerreiro Druídico', 'Druida', 'sab'],
  ] as const) {
    const feature = find('caracteristica', 'Estilo de Luta', cls);
    const option = groups(feature)
      .find((g) => g.key === 'estilo-luta')
      ?.options.find((o) => o.name === style);
    assert.ok(option);
    const profile = catalog.castingProfiles.find(
      (p) => p.ownerRevisionId === option.targetRef?.revisionId,
    )!;
    assert.equal(profile.progression[0].cantrips, 2);
    assert.equal(profile.progression[0].known, 0);
    assert.deepEqual(profile.listClassRefs, [find('classe', list).ref]);
    assert.deepEqual(profile.abilities, [ability]);
  }
});

test('Tome choices include exactly any cantrips and level1 rituals; its source prerequisite permits level1', () => {
  const tome = find('caracteristica', 'Pacto do Tomo', 'Bruxo');
  assert.ok(
    !catalog.requirements.some(
      (r) => r.ownerRevisionId === tome.ref.revisionId && r.operator === 'nivel-classe',
    ),
  );
  const gs = groups(tome);
  assert.deepEqual(
    gs.map((g) => g.minimum),
    [3, 2],
  );
  assert.ok(gs[0].options.length > 20 && gs[1].options.length > 5);
  for (const [index, g] of gs.entries())
    for (const o of g.options) {
      const spell = catalog.entries.find((e) => e.ref.revisionId === o.targetRef?.revisionId)!;
      assert.ok(
        spell.kind === 'magia' && spell.data.circle === index && (!index || spell.data.ritual),
      );
    }
});
test('legacy guardian token maps spells to Ranger without adding an unrelated Wizard spell', () => {
  const ranger = find('classe', 'Patrulheiro');
  const mark = find('magia', 'Curar Ferimentos');
  assert.ok(
    mark.kind === 'magia' &&
      mark.data.classRefs.some((r) => r.revisionId === ranger.ref.revisionId),
  );
  const missiles = find('magia', 'Mísseis Mágicos');
  assert.ok(
    missiles.kind === 'magia' &&
      !missiles.data.classRefs.some((r) => r.revisionId === ranger.ref.revisionId),
  );
});
test('special background feat choices expose only their category candidates', () => {
  const gs = catalog.choices.filter(
    (g) => g.featCategory && ['dom-sombrio', 'pacto-planar'].includes(g.featCategory),
  );
  assert.ok(gs.length >= 3);
  for (const g of gs) {
    assert.ok(g.options.length >= 3);
    assert.ok(
      g.options.every((o) => {
        const feat = catalog.entries.find((e) => e.ref.revisionId === o.targetRef?.revisionId);
        return feat?.kind === 'talento' && feat.data.category === g.featCategory;
      }),
    );
  }
});
test('Druid starting package resolves named armor shield and sickle to typed equipment', () => {
  const druid = find('classe', 'Druida');
  const packageRef = catalog.equipmentOptions.find(
    (e) => e.ownerRevisionId === druid.ref.revisionId && e.key === 'A',
  )?.packageRef;
  const pack = catalog.entries.find((e) => e.ref.revisionId === packageRef?.revisionId)!;
  assert.ok(pack?.kind === 'pacote');
  const equipment = pack.data.items.map((i) =>
    catalog.entries.find((e) => e.ref.revisionId === i.equipmentRef?.revisionId),
  );
  assert.ok(equipment.some((e) => e?.kind === 'equipamento' && e.name === 'Couro' && e.data.armor));
  assert.ok(
    equipment.some((e) => e?.kind === 'equipamento' && e.name === 'Escudo Padrão' && e.data.shield),
  );
  assert.ok(
    equipment.some((e) => e?.kind === 'equipamento' && e.name === 'Foice Curta' && e.data.weapon),
  );
});

for (const [className, extraKey] of [
  ['Bárbaro', 'conhecimento-primitivo'],
  ['Guerreiro', 'estudante-pericia'],
] as const) {
  test(`${className} additional skill rejects existing training and accepts a new proficiency`, () => {
    const { draft, species, background } = fixture();
    const owner = find('classe', className);
    const scopedCatalog = { ...catalog, entries: [...catalog.entries, species, background] };
    draft.classes[0] = {
      ...draft.classes[0],
      classRef: owner.ref,
      level: 3,
      subclassRef: className === 'Guerreiro' ? find('subclasse', 'Mestre de Batalha').ref : null,
    };
    draft.levels = Array.from({ length: 3 }, (_, i) => ({ ...draft.levels[0], totalLevel: i + 1 }));
    const active = resolveConcessions(scopedCatalog, draft).choices;
    const initial = active.find(
      (a) => a.instance.entry.ref.revisionId === owner.ref.revisionId && a.group.key === 'pericias',
    )!;
    const extra = active.find((a) => a.group.key === extraKey)!;
    const skill = (option: (typeof initial.group.options)[number]) =>
      scopedCatalog.proficiencies.find((p) => p.id === option.proficiencyId)?.skill;
    const repeated = initial.group.options.find((o) => skill(o) === 'atletismo')!;
    const second = initial.group.options.find((o) => skill(o) !== 'atletismo')!;
    const extraRepeated = extra.group.options.find((o) => skill(o) === 'atletismo')!;
    const extraNew = extra.group.options.find(
      (o) => !['atletismo', skill(second)].includes(skill(o)),
    )!;
    draft.choices = [
      {
        sourceInstanceId: initial.instance.id,
        groupId: initial.group.id,
        values: [repeated, second].map((o) => ({ type: 'option', optionId: o.id })),
      },
      {
        sourceInstanceId: extra.instance.id,
        groupId: extra.group.id,
        values: [{ type: 'option', optionId: extraRepeated.id }],
      },
    ];
    const invalid = resolveConcessions(scopedCatalog, draft);
    assert.ok(
      invalid.problems.some(
        (p) => p.code === 'NEW_PROFICIENCY_REQUIRED' && p.field === `choices.${extra.group.id}`,
      ),
      'additional proficiency must not duplicate existing training',
    );
    assert.ok(
      invalid.choices.find((a) => a.group.id === extra.group.id)?.unavailableOptions?.[
        extraRepeated.id
      ],
    );
    draft.choices[1].values = [{ type: 'option', optionId: extraNew.id }];
    const valid = resolveConcessions(scopedCatalog, draft);
    assert.ok(!valid.problems.some((p) => p.code === 'NEW_PROFICIENCY_REQUIRED'));
    assert.ok(
      valid.proficiencyGrants.some(
        (p) => p.proficiencyId === extraNew.proficiencyId && p.degree === 'proficiente',
      ),
    );
  });
}
