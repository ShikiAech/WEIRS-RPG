import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { fixture } from './fixtures/creation';
import { resolveState } from '../packages/character-creation/state';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { projectSheet } from '../packages/character-creation/project';
const catalog = Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8'),
  loadCuration(process.cwd()),
]).then(([json, legacy, registry, curation]) =>
  resolveCatalog(normalizeSources([...legacy, ...json], JSON.parse(registry)), curation),
);
async function scenario(name: string, lineage?: string, level = 1, form = '') {
  const c = await catalog,
    draft = fixture().draft;
  const species = c.entries.find((e) => e.kind === 'especie' && e.name === name)!;
  draft.speciesRef = species.ref;
  draft.lineageRef = lineage
    ? c.entries.find(
        (e) =>
          e.kind === 'linhagem' &&
          e.name === lineage &&
          e.data.speciesRef.revisionId === species.ref.revisionId,
      )!.ref
    : null;
  const cls = c.entries.find((e) => e.kind === 'classe' && e.name === 'Guerreiro')!;
  draft.classes = [{ id: 'fighter', classRef: cls.ref, subclassRef: null, level }];
  draft.levels = Array.from({ length: level }, (_, i) => ({
    totalLevel: i + 1,
    classEntryId: 'fighter',
    hitPointMethod: 'fixed' as const,
    hitPointRoll: null,
  }));
  draft.form = form;
  draft.abilities.external = { for: 10, des: 14, con: 10, int: 10, sab: 10, car: 10 };
  draft.abilities.backgroundBonuses = {};
  draft.backgroundRef = null;
  return { c, draft, species };
}
test('base humans and elves allow optional variants; species choices retain cardinality', async () => {
  for (const name of ['Humanos', 'Elfos']) {
    const { species } = await scenario(name);
    assert.equal(species.kind === 'especie' && species.data.lineageRequired, false);
  }
  for (const [name, lineage, groups] of [
    ['Humanos', undefined, ['Hábil', 'Versátil']],
    ['Elfos', undefined, ['Sentidos Aguçados']],
    ['Elfos', 'Meio-Elfo', ['Dádiva Herdada']],
    [
      'Humanos',
      'Marcados',
      ['Corpo Marcado', 'Conhecimento Proibido: perícias', 'Conhecimento Proibido: especialização'],
    ],
  ] as const) {
    const { c, draft } = await scenario(name, lineage);
    const state = resolveState(c, draft);
    for (const group of groups)
      assert.ok(
        state.concessions.choices.some((g) => g.group.name === group),
        `${name}/${lineage}: ${group}`,
      );
  }
});
test('racial spell progression and single casting ability per legacy', async () => {
  for (const [name, lineage, expected] of [
    ['Onis', 'Belial', ['thaumaturgy', 'fire bolt', 'hellish rebuke', 'darkness']],
    ['Onis', 'Beelzebub', ['thaumaturgy', 'poison spray', 'ray of sickness', 'hold person']],
    ['Onis', 'Asmodeus', ['thaumaturgy', 'chill touch', 'false life', 'ray of enfeeblement']],
    ["Yun'kais", undefined, ['eldritch blast', 'misty step', 'moonbeam']],
    ['Namyrianos', 'Gélido', ['ray of frost']],
    ['Elfos', undefined, ['message', 'detect magic', 'counterspell']],
  ] as const) {
    const { c, draft } = await scenario(name, lineage, 5);
    const state = resolveState(c, draft),
      casting = resolveSpellcasting(c, draft, state);
    assert.equal(casting.profiles.length, 1, `${name}/${lineage}`);
    const definition = c.castingProfiles.find(
      (p) => p.ownerRevisionId === casting.profiles[0].ownerRevisionId,
    )!;
    assert.deepEqual(
      definition.spells
        .map((s) =>
          c.entries
            .find((e) => e.ref.revisionId === s.spellRef.revisionId)!
            .originalName.toLowerCase(),
        )
        .sort(),
      [...expected].sort(),
    );
    assert.deepEqual(definition.abilities, name === 'Elfos' ? [] : ['int', 'sab', 'car']);
  }
});
test('N0-V4 form values derive class HP with ceil and fixed AC', async () => {
  const { c, draft } = await scenario('N0-V4', undefined, 5, 'natural');
  let state = resolveState(c, draft);
  assert.equal(resolveHitPoints(c, draft, state).total, 17);
  assert.equal(resolveDefenses(c, draft, state).armorClass, 10);
  assert.deepEqual(
    resolveDefenses(c, draft, state).movements.map((m) => [m.mode, m.feet]),
    [
      ['terrestre', 20],
      ['escalada', 20],
    ],
  );
  draft.form = 'exotraje';
  state = resolveState(c, draft);
  const hp = resolveHitPoints(c, draft, state),
    def = resolveDefenses(c, draft, state);
  assert.equal(hp.total, 34);
  assert.equal(def.armorClass, 16);
  const sheet = projectSheet(c, draft, state, hp, def, resolveSpellcasting(c, draft, state));
  assert.ok(sheet.recursos.some((r) => r.nome === 'Vida Falsa do Exotraje' && r.maximo === 68));
});
test('fixed secondary movement and darkvision are projected', async () => {
  for (const [name, mode, feet] of [
    ['Fadas', 'voo', 30],
    ['Kinect', 'natacao', 40],
  ] as const) {
    const { c, draft } = await scenario(name);
    assert.ok(resolveDefenses(c, draft).movements.some((m) => m.mode === mode && m.feet === feet));
  }
  for (const [name, feet] of [
    ["Yun'kais", 60],
    ['Onis', 120],
  ] as const) {
    const { species } = await scenario(name);
    assert.ok(
      species.kind === 'especie' && species.data.senses.some((s) => s.distanceFeet === feet),
    );
  }
});
test('configurations grant persistent selected traits and only affect the suit', async () => {
  const { c, draft } = await scenario('N0-V4', undefined, 1, 'exotraje');
  let state = resolveState(c, draft);
  for (const [groupName, optionName] of [
    ['Sistema de Mobilidade', 'Aquático'],
    ['Módulo Especializado', 'Módulo Defensivo'],
    ['Blindagem Adaptativa', 'Frio'],
  ]) {
    const active = state.concessions.choices.find((g) => g.group.name === groupName)!;
    assert.ok(active, groupName);
    draft.choices.push({
      groupId: active.group.id,
      sourceInstanceId: active.instance.id,
      values: [
        { type: 'option', optionId: active.group.options.find((o) => o.name === optionName)!.id },
      ],
    });
  }
  state = resolveState(c, draft);
  const hp = resolveHitPoints(c, draft, state),
    def = resolveDefenses(c, draft, state),
    sheet = projectSheet(c, draft, state, hp, def, resolveSpellcasting(c, draft, state));
  assert.equal(def.armorClass, 17);
  assert.ok(def.movements.some((m) => m.mode === 'natacao' && m.feet === 40));
  assert.ok(sheet.combate.resistencias.includes('Frio'));
  assert.ok(sheet.tracos.some((t) => t.nome === 'Aquático' && t.descricao.includes('40')));
  draft.form = 'natural';
  state = resolveState(c, draft);
  assert.equal(resolveDefenses(c, draft, state).armorClass, 10);
  assert.ok(!resolveDefenses(c, draft, state).movements.some((m) => m.mode === 'natacao'));
  const k = await scenario('Kinect');
  assert.ok(
    resolveState(k.c, k.draft).concessions.choices.some(
      (g) => g.group.name === 'Núcleo Elemental' && g.group.options.length === 5,
    ),
  );
});
test('racial spells appear at source levels and share the selected attribute in the sheet', async () => {
  for (const level of [1, 3, 5]) {
    const { c, draft } = await scenario('Onis', 'Belial', level);
    let state = resolveState(c, draft),
      casting = resolveSpellcasting(c, draft, state);
    draft.castingAbilities = [{ profileId: casting.profiles[0].id, ability: 'sab' }];
    casting = resolveSpellcasting(c, draft, state);
    const sheet = projectSheet(
      c,
      draft,
      state,
      resolveHitPoints(c, draft, state),
      resolveDefenses(c, draft, state),
      casting,
    );
    assert.equal(sheet.magias.length, level === 1 ? 2 : level === 3 ? 3 : 4);
    assert.equal(sheet.conjuracao.perfis.length, 1);
    assert.equal(sheet.conjuracao.perfis[0].atributo, 'sab');
    assert.equal(
      sheet.recursos.filter((r) => r.recuperacao === 'longo' && r.nome.includes('Legado')).length,
      level === 1 ? 0 : level === 3 ? 1 : 2,
    );
  }
  const { c, draft } = await scenario('Elfos', undefined, 3);
  const state = resolveState(c, draft),
    casting = resolveSpellcasting(c, draft, state),
    sheet = projectSheet(
      c,
      draft,
      state,
      resolveHitPoints(c, draft, state),
      resolveDefenses(c, draft, state),
      casting,
    );
  assert.equal(sheet.magias.length, 3);
  assert.equal(sheet.conjuracao.perfis.length, 0);
  assert.equal(casting.profiles[0].ability, null);
});
test('N0-V4 rounds odd class HP upward, adds shield only to suit, rejects worn armor', async () => {
  const { c, draft } = await scenario('N0-V4', undefined, 1, 'natural');
  draft.levels[0].hitPointRoll = null;
  draft.abilities.external.con = 12;
  assert.equal(resolveHitPoints(c, draft).total, 6);
  const shield = c.entries.find((e) => e.kind === 'equipamento' && e.data.shield)!;
  draft.equippedRefs = [shield.ref];
  assert.equal(resolveDefenses(c, draft).armorClass, 10);
  draft.form = 'exotraje';
  assert.equal(resolveDefenses(c, draft).armorClass, 18);
  const armor = c.entries.find((e) => e.kind === 'equipamento' && e.data.armor)!;
  draft.equippedRefs = [armor.ref];
  assert.ok(resolveDefenses(c, draft).problems.some((p) => p.code === 'FORM_ARMOR'));
});
test('utility module chooses a tool, persists training only in the suit, armament becomes an attack', async () => {
  const { c, draft } = await scenario('N0-V4', undefined, 1, 'exotraje');
  let state = resolveState(c, draft);
  const modules = state.concessions.choices.find((g) => g.group.name === 'Módulo Especializado')!;
  draft.choices.push({
    groupId: modules.group.id,
    sourceInstanceId: modules.instance.id,
    values: [
      {
        type: 'option',
        optionId: modules.group.options.find((o) => o.name === 'Módulo Utilitário')!.id,
      },
    ],
  });
  state = resolveState(c, draft);
  const tool = state.concessions.choices.find((g) => g.group.name === 'Ferramenta integrada')!;
  assert.ok(tool.group.options.length > 0);
  draft.choices.push({
    groupId: tool.group.id,
    sourceInstanceId: tool.instance.id,
    values: [{ type: 'option', optionId: tool.group.options[0].id }],
  });
  const sheet = () => {
    const s = resolveState(c, draft);
    return projectSheet(
      c,
      draft,
      s,
      resolveHitPoints(c, draft, s),
      resolveDefenses(c, draft, s),
      resolveSpellcasting(c, draft, s),
    );
  };
  assert.ok(sheet().treinamento.ferramentas.includes(tool.group.options[0].name));
  assert.ok(
    !sheet().ataques.some((attack) => attack.nome === 'Módulo de Armamento'),
    'Módulo Utilitário não concede a arma do módulo alternativo',
  );
  draft.form = 'natural';
  assert.ok(!sheet().treinamento.ferramentas.includes(tool.group.options[0].name));
  draft.form = 'exotraje';
  draft.choices[0].values = [
    {
      type: 'option',
      optionId: modules.group.options.find((o) => o.name === 'Módulo de Armamento')!.id,
    },
  ];
  assert.ok(
    sheet().ataques.some(
      (a) =>
        a.nome === 'Módulo de Armamento' &&
        a.danos?.some((d) => d.dado === '1d8' && d.tipo === 'Energia'),
    ),
  );
});
test('energy armament projects a Dexterity attack only while in the suit', async () => {
  const { c, draft } = await scenario('N0-V4', undefined, 1, 'exotraje');
  const state = resolveState(c, draft),
    g = state.concessions.choices.find((g) => g.group.name === 'Módulo Especializado')!;
  draft.choices.push({
    groupId: g.group.id,
    sourceInstanceId: g.instance.id,
    values: [
      {
        type: 'option',
        optionId: g.group.options.find((o) => o.name === 'Módulo de Armamento')!.id,
      },
    ],
  });
  const s = resolveState(c, draft);
  const sheet = projectSheet(
    c,
    draft,
    s,
    resolveHitPoints(c, draft, s),
    resolveDefenses(c, draft, s),
    resolveSpellcasting(c, draft, s),
  );
  assert.ok(
    sheet.ataques.some(
      (a) =>
        a.nome === 'Módulo de Armamento' &&
        a.atributo === 'des' &&
        a.danos?.some((d) => d.dado === '1d8' && d.tipo === 'Energia'),
    ),
  );
});
test('Marked knowledge grants two new skills and expertise in an already trained skill', async () => {
  const { c, draft } = await scenario('Humanos', 'Marcados');
  function choose(name: string, skillNames: string[]) {
    const state = resolveState(c, draft),
      active = state.concessions.choices.find((g) => g.group.name === name)!;
    draft.choices.push({
      groupId: active.group.id,
      sourceInstanceId: active.instance.id,
      values: skillNames.map((name) => ({
        type: 'option' as const,
        optionId: active.group.options.find((o) => o.name === name)!.id,
      })),
    });
  }
  choose('Hábil', ['Medicina']);
  choose('Conhecimento Proibido: perícias', ['Arcanismo', 'História']);
  choose('Conhecimento Proibido: especialização', ['Medicina']);
  let state = resolveState(c, draft);
  const sheet = projectSheet(
    c,
    draft,
    state,
    resolveHitPoints(c, draft, state),
    resolveDefenses(c, draft, state),
    resolveSpellcasting(c, draft, state),
  );
  assert.equal(sheet.pericias.arcanismo.grau, 'proficiente');
  assert.equal(sheet.pericias.historia.grau, 'proficiente');
  assert.equal(sheet.pericias.medicina.grau, 'especializacao');
  const expert = state.concessions.choices.find(
    (g) => g.group.name === 'Conhecimento Proibido: especialização',
  )!;
  draft.choices.find((g) => g.groupId === expert.group.id)!.values = [
    { type: 'option', optionId: expert.group.options.find((o) => o.name === 'Sobrevivência')!.id },
  ];
  state = resolveState(c, draft);
  assert.ok(state.concessions.problems.some((p) => p.code === 'EXPERTISE_REQUIRES_PROFICIENCY'));
});
test('each species choice proficiency has a unique catalog row identity', async () => {
  const { c, draft } = await scenario('Humanos', 'Marcados');
  const state = resolveState(c, draft);
  const knowledge = state.concessions.instances.find(
    (i) => i.entry.name === 'Conhecimento Proibido',
  )!;
  const rows = c.proficiencies.filter((p) => p.ownerRevisionId === knowledge.entry.ref.revisionId);
  assert.equal(new Set(rows.map((p) => p.id)).size, rows.length);
});

test('Inamons expose five fixed traits and one then two distinct improvements with published movement and carapace', async () => {
  for (const level of [1, 7, 11]) {
    const { c, draft } = await scenario('Inamons', undefined, level);
    let state = resolveState(c, draft);
    assert.equal(
      state.concessions.instances.filter((i) => i.id.startsWith('species/grant:')).length,
      5,
    );
    const improvements = state.concessions.choices.filter((g) =>
      g.group.name.startsWith('Aprimoramento Inamônico'),
    );
    assert.equal(improvements.length, level >= 7 ? 2 : 1);
    for (const [index, active] of improvements.entries()) {
      const option = active.group.options.find(
        (o) => o.name === (index ? 'Asas Abissais' : 'Carapaça Reforçada'),
      )!;
      draft.choices.push({
        groupId: active.group.id,
        sourceInstanceId: active.instance.id,
        values: [{ type: 'option', optionId: option.id }],
      });
    }
    state = resolveState(c, draft);
    const defense = resolveDefenses(c, draft, state);
    assert.equal(defense.armorClass, level >= 11 ? 18 : 16);
    if (level >= 7) assert.equal(defense.movements.find((m) => m.mode === 'voo')?.feet, 30);
    const sheet = projectSheet(
      c,
      draft,
      state,
      resolveHitPoints(c, draft, state),
      defense,
      resolveSpellcasting(c, draft, state),
    );
    assert.ok(sheet.tracos.some((t) => t.nome === 'Arma Natural Integrada'));
    if (level >= 7) {
      const first = improvements[0],
        second = improvements[1];
      const duplicate = second.group.options.find((o) => o.name === 'Carapaça Reforçada')!;
      assert.ok(
        resolveState(c, draft).concessions.choices.find((g) => g.group.id === second.group.id)
          ?.unavailableOptions?.[duplicate.id],
      );
    }
  }
});
test('Inamon integrated weapon waits for completed proficiency and rejects an ineligible weapon after class change', async () => {
  const { c, draft } = await scenario('Inamons');
  let state = resolveState(c, draft);
  const active = state.concessions.choices.find((g) => g.group.name === 'Arma Natural Integrada')!;
  assert.ok(active);
  const option = active.group.options.find((o) => o.name === 'Espada Longa')!;
  assert.ok(option);
  assert.equal(active.unavailableOptions?.[option.id], undefined);
  draft.choices.push({
    groupId: active.group.id,
    sourceInstanceId: active.instance.id,
    values: [{ type: 'option', optionId: option.id }],
  });
  state = resolveState(c, draft);
  const sheet = projectSheet(
    c,
    draft,
    state,
    resolveHitPoints(c, draft, state),
    resolveDefenses(c, draft, state),
    resolveSpellcasting(c, draft, state),
  );
  assert.ok(sheet.ataques.some((a) => a.nome.includes('Espada Longa')));
  draft.classes = [];
  state = resolveState(c, draft);
  assert.ok(state.concessions.problems.some((p) => p.code === 'INTEGRATED_WEAPON_PROFICIENCY'));
  assert.ok(
    state.concessions.choices.find((g) => g.group.id === active.group.id)?.unavailableOptions?.[
      option.id
    ],
  );
});

test('Inamon improvements retain source descriptions, walking/climbing and do not grant extra attacks', async () => {
  for (const [name, mode, feet] of [
    ['Pernas Aprimoradas', 'terrestre', 40],
    ['Quatro Braços', 'escalada', 30],
  ] as const) {
    const { c, draft } = await scenario('Inamons');
    const active = resolveState(c, draft).concessions.choices.find((g) =>
      g.group.name.startsWith('Aprimoramento Inamônico'),
    )!;
    const option = active.group.options.find((o) => o.name === name)!;
    const feature = c.entries.find((e) => e.ref.revisionId === option.targetRef?.revisionId)!;
    assert.ok(feature.description.startsWith(name + ':'));
    draft.choices.push({
      groupId: active.group.id,
      sourceInstanceId: active.instance.id,
      values: [{ type: 'option', optionId: option.id }],
    });
    const state = resolveState(c, draft),
      defense = resolveDefenses(c, draft, state);
    assert.equal(defense.movements.find((m) => m.mode === mode)?.feet, feet);
    const sheet = projectSheet(
      c,
      draft,
      state,
      resolveHitPoints(c, draft, state),
      defense,
      resolveSpellcasting(c, draft, state),
    );
    assert.equal(sheet.ataques.length, 0);
    if (name === 'Quatro Braços')
      assert.match(feature.description, /não concedem ataques adicionais/);
  }
});

test('integrated weapon requires full proficiency rather than half proficiency', async () => {
  const { weaponProficient } = await import('../packages/character-creation/concessions');
  const { c, draft } = await scenario('Inamons');
  const state = resolveState(c, draft),
    weapon = c.entries.find((e) => e.kind === 'equipamento' && e.name === 'Espada Longa')!;
  const full = state.concessions.proficiencyGrants.filter((grant) =>
    weaponProficient(c, weapon, [grant]),
  );
  assert.ok(full.length);
  assert.equal(
    weaponProficient(
      c,
      weapon,
      full.map((grant) => ({ ...grant, degree: 'meia' })),
    ),
    false,
  );
});
