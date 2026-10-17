import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { resolveState } from '../packages/character-creation/state';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { projectSheet } from '../packages/character-creation/project';
import type { CreationDraft } from '../packages/contracts/character-creation';
import { fixture, id } from './fixtures/creation';

const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
  loadCuration(process.cwd()),
]);
registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
const catalog = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);
const support = fixture();
const c = {
  ...catalog,
  entries: [...catalog.entries, support.species, support.background, support.cls],
};
const artificer = catalog.entries.find((e) => e.kind === 'classe' && e.name === 'Artífice')!;
const groups = catalog.choices.filter((g) => g.ownerRevisionId === artificer.ref.revisionId);
const plans = () => {
  const result = groups.filter((g) => g.key.startsWith('planos-'));
  assert.ok(result.length, 'Artificer needs permanent plan choices');
  return result;
};
const tools = () => {
  const result = groups.find((g) => g.key === 'ferramenta-artesao');
  assert.ok(result, 'Artificer needs an artisan tool proficiency choice');
  return result;
};
function setup(level = 2) {
  const draft = structuredClone(support.draft);
  draft.abilities.external = { for: 14, des: 14, con: 14, int: 14, sab: 14, car: 14 };
  draft.classes[0].classRef = artificer.ref;
  draft.classes[0].level = level;
  draft.levels = Array.from({ length: level }, (_, i) => ({
    ...draft.levels[0],
    totalLevel: i + 1,
  }));
  return draft;
}
function choose(draft: CreationDraft, key: string, names: string[]) {
  const g = groups.find((g) => g.key === key);
  assert.ok(g, `choice ${key} exists`);
  draft.choices = draft.choices.filter((s) => s.groupId !== g.id);
  draft.choices.push({
    sourceInstanceId: `class:${draft.classes[0].id}`,
    groupId: g.id,
    values: names.map((name) => {
      const option = g.options.find((o) => o.name === name);
      assert.ok(option, `option ${name} exists`);
      return { type: 'option' as const, optionId: option.id };
    }),
  });
}
const initial = [
  'Jarro da Alquimia',
  'Bolsa dos Cestos',
  'Chapéu de Respirar na Água',
  'Pedras Mensageiras',
];
function project(draft: CreationDraft) {
  const state = resolveState(c, draft);
  const casting = resolveSpellcasting(c, draft, state);
  return {
    state,
    casting,
    sheet: projectSheet(
      c,
      draft,
      state,
      resolveHitPoints(c, draft, state),
      resolveDefenses(c, draft, state),
      casting,
    ),
  };
}

test('Artificer plan quotas follow the local progression and remain absent at level 1', () => {
  assert.deepEqual(
    plans().map((g) => [g.level, g.minimum, g.maximum]),
    [
      [2, 4, 4],
      [6, 1, 1],
      [10, 1, 1],
      [14, 1, 1],
      [18, 1, 1],
    ],
  );
  assert.ok(
    !project(setup(1)).state.concessions.choices.some((a) => a.group.key.startsWith('planos-')),
  );
  const pending = project(setup()).state.concessions.choices.find(
    (a) => a.group.key === 'planos-2',
  );
  assert.equal(pending?.group.minimum, 4);
});

test('Artificer level 2 records four known plans in the sheet without creating magic items', () => {
  const draft = setup();
  choose(draft, 'planos-2', initial);
  choose(draft, 'ferramenta-artesao', ['Suprimentos de Alquimista']);
  choose(
    draft,
    'pericias',
    groups
      .find((g) => g.key === 'pericias')!
      .options.slice(0, 2)
      .map((o) => o.name),
  );
  const money = catalog.equipmentOptions.find(
    (o) => o.ownerRevisionId === artificer.ref.revisionId && o.key === 'B',
  )!;
  draft.equipmentOptions.push({ ownerRevisionId: artificer.ref.revisionId, optionId: money.id });
  const { state, sheet } = project(draft);
  assert.deepEqual(state.problems, []);
  assert.deepEqual(
    sheet.caracteristicas
      .filter((f) => f.nome.startsWith('Plano: '))
      .map((f) => f.nome)
      .sort(),
    initial.map((n) => `Plano: ${n}`).sort(),
  );
  assert.equal(sheet.inventario.itens.length, 0);
  assert.equal(sheet.combate.pvMaximos, 17);
  assert.ok(sheet.treinamento.ferramentas.includes('Suprimentos de Alquimista'));
  assert.ok(sheet.magias.some((s) => s.nome === 'Reparar'));
  const refs = plans()[0].options.map((o) => o.targetRef!.revisionId);
  assert.ok(!catalog.grants.some((g) => refs.includes(g.targetRef?.revisionId ?? '')));
});

test('Artificer plans enforce all four source tiers and allow a legal replacement in an older group', () => {
  plans();
  for (const [level, locked] of [
    [2, 'Botas dos Elfos'],
    [6, 'Escudo +2'],
    [10, 'Armadura +2'],
  ] as const) {
    const draft = setup(level);
    choose(draft, 'planos-2', [locked, ...initial.slice(1)]);
    const { state, sheet } = project(draft);
    assert.ok(
      state.problems.some((p) => p.code === 'REQUIREMENT_NOT_MET'),
      `${locked} unavailable at ${level}`,
    );
    assert.ok(!sheet.caracteristicas.some((f) => f.nome === `Plano: ${locked}`));
  }
  const draft = setup(6);
  choose(draft, 'planos-2', ['Botas dos Elfos', ...initial.slice(1)]);
  choose(draft, 'planos-6', ['Jarro da Alquimia']);
  const { state, sheet } = project(draft);
  assert.ok(
    !state.problems.some((p) => ['REQUIREMENT_NOT_MET', 'DUPLICATE_FEATURE'].includes(p.code)),
  );
  assert.equal(sheet.caracteristicas.filter((f) => f.nome.startsWith('Plano: ')).length, 5);
});

test('Artificer rejects duplicated plans within a group and across progression groups', () => {
  plans();
  const draft = setup(6);
  choose(draft, 'planos-2', initial);
  choose(draft, 'planos-6', ['Jarro da Alquimia']);
  let result = project(draft);
  assert.ok(result.state.problems.some((p) => p.code === 'DUPLICATE_FEATURE'));
  assert.equal(
    result.sheet.caracteristicas.filter((f) => f.nome === 'Plano: Jarro da Alquimia').length,
    1,
  );
  choose(draft, 'planos-2', ['Jarro da Alquimia', 'Jarro da Alquimia', ...initial.slice(2)]);
  result = project(draft);
  assert.ok(
    result.state.problems.some(
      (p) => p.code === 'INVALID_CHOICE' && p.field === `choices.${plans()[0].id}`,
    ),
  );
  assert.equal(
    result.sheet.caracteristicas.filter((f) => f.nome === 'Plano: Jarro da Alquimia').length,
    1,
  );
});

test('generic plans resolve only concrete eligible wonderful items and retain the early Bag alias', () => {
  const options = plans()[0].options;
  for (const [name, level] of [
    ['Manoplas de Força do Ogro', 10],
    ['Botas Aladas', 10],
    ['Capa do Saltimbanco', 14],
    ['Bolsa dos Cestos', 2],
  ] as const) {
    const option = options.find((o) => o.name === name);
    assert.ok(option, `concrete plan ${name} exists`);
    assert.equal(
      catalog.requirements.find(
        (r) => r.ownerRevisionId === option.targetRef?.revisionId && r.operator === 'nivel-classe',
      )?.minimum,
      level,
    );
  }
  assert.ok(
    !options.some((o) =>
      /Poção|Pergaminho|amaldiçoado|Item Maravilhoso|Item mágico Comum|Bolsa de Carga/.test(o.name),
    ),
  );
  assert.ok(
    catalog.issues.some(
      (i) => i.revisionId === artificer.ref.revisionId && /Comum/.test(i.message),
    ),
  );
});

test('generic plans refuse cursed consumable and ambiguously classified source cards', () => {
  const sources = structuredClone(legacy);
  const source = sources.find((s) => s.path === 'pages/itens/itens-magicos.html')!;
  const template = source.records.find((r) => r.name === 'Botas Aladas')!;
  assert.ok(template.payload.type === 'equipment');
  const invalid = [
    [
      'Relíquia Amaldiçoada de Teste',
      'Item Maravilhoso',
      'incomum',
      'Maldição: prejudica o portador.',
    ],
    ['Poção de Teste', 'Poção (Consumível)', 'comum', 'Recupera pontos de vida.'],
    ['Pergaminho de Teste', 'Pergaminho', 'incomum', 'Contém uma magia.'],
    ['Objeto de Classificação Incerta', 'Outro', 'incomum', 'Sem tipo maravilhoso explícito.'],
    [
      'Maravilhoso Muito Raro de Teste',
      'Item Maravilhoso',
      'muito raro',
      'Raridade não permitida.',
    ],
  ];
  for (const [index, [name, type, rarity, description]] of invalid.entries()) {
    source.records.push({
      ...template,
      key: `${template.key}:negative:${index}`,
      name,
      originalName: name,
      description,
      payload: {
        ...template.payload,
        input: {
          ...template.payload.input,
          nome: name,
          tipo: type,
          raridade: rarity,
          desc: description,
        },
      },
    });
  }
  const checked = resolveCatalog(normalizeSources([...sources, ...json], registry), curation);
  const options = checked.choices.find(
    (g) => g.ownerRevisionId === artificer.ref.revisionId && g.key === 'planos-2',
  )!.options;
  assert.ok(options.some((o) => o.name === 'Botas Aladas'));
  assert.ok(!options.some((o) => invalid.some(([name]) => name === o.name)));
});

test('Artificer fixed tools and chosen artisan proficiency reach the sheet independently from inventory', () => {
  const g = tools();
  assert.equal(g.minimum, 1);
  assert.equal(g.maximum, 1);
  assert.equal(g.acquisition, 'inicial');
  const draft = setup();
  const selected = g.options.find((o) => o.name === 'Suprimentos de Alquimista');
  assert.ok(selected);
  choose(draft, g.key, [selected.name]);
  const { sheet } = project(draft);
  for (const name of ['Ferramentas de Funileiro', 'Ferramentas de Ladrão', selected.name])
    assert.ok(sheet.treinamento.ferramentas.includes(name), name);
  assert.equal(sheet.inventario.itens.length, 0);
  assert.ok(g.options.every((o) => !o.targetRef && o.proficiencyId));
});

test('Artificer Mending grant preserves two chosen cantrips and three prepared spells at level 2', () => {
  const draft = setup();
  const profile = resolveSpellcasting(c, draft).profiles.find(
    (p) => p.ownerRevisionId === artificer.ref.revisionId,
  )!;
  assert.equal(profile.cantrips, 2);
  assert.equal(profile.prepared, 3);
  draft.spellSelections = [
    'Luz',
    'Raio de Fogo',
    'Alarme',
    'Curar Ferimentos',
    'Detectar Magia',
  ].map((name) => {
    const spell = catalog.entries.find((e) => e.kind === 'magia' && e.name === name)!;
    return { profileId: profile.id, spellRef: spell.ref, prepared: true };
  });
  const { casting, sheet } = project(draft);
  assert.deepEqual(casting.problems, []);
  const mending = catalog.entries.find(
    (e) => e.kind === 'magia' && e.originalName.toLowerCase() === 'mending',
  )!;
  assert.equal(mending.name, 'Reparar');
  assert.equal(sheet.magias.filter((s) => s.nome === 'Reparar').length, 1);
  assert.equal(sheet.magias.length, 6);
  assert.ok(!sheet.magias.some((s) => /Restauração/.test(s.nome)));
});

test('Artificer initial artisan training does not leak into a multiclass acquisition', () => {
  tools();
  const draft = setup(1);
  const artClass = { ...draft.classes[0], id: id(777) };
  draft.classes = [{ ...draft.classes[0], classRef: support.cls.ref }, artClass];
  draft.levels.push({ ...draft.levels[0], totalLevel: 2, classEntryId: artClass.id });
  const { state, sheet } = project(draft);
  assert.ok(!state.concessions.choices.some((a) => a.group.key === 'ferramenta-artesao'));
  assert.equal(sheet.treinamento.ferramentas, '');
});

test('changing away from Artificer removes plans tools and the granted cantrip', () => {
  const draft = setup();
  choose(draft, 'planos-2', initial);
  choose(draft, 'ferramenta-artesao', [tools().options[0].name]);
  draft.classes[0].classRef = support.cls.ref;
  const { sheet } = project(draft);
  assert.ok(!sheet.caracteristicas.some((f) => f.nome.startsWith('Plano: ')));
  assert.equal(sheet.treinamento.ferramentas, '');
  assert.ok(!sheet.magias.some((s) => s.nome === 'Reparar'));
});
