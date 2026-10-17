import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { fixture, grant } from './fixtures/creation';
import { resolveState } from '../packages/character-creation/state';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { projectSheet } from '../packages/character-creation/project';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveCreation } from '../packages/character-creation/resolve';
import { populateFeatChoices } from '../tools/compendium-import/feat-choices';

const catalog = Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8'),
  loadCuration(process.cwd()),
]).then(([json, legacy, registry, curation]) =>
  resolveCatalog(normalizeSources([...legacy, ...json], JSON.parse(registry)), curation),
);

async function scenario(name: string) {
  const c = structuredClone(await catalog),
    { draft } = fixture();
  const species = c.entries.find((e) => e.kind === 'especie' && e.name === 'Ogros')!;
  const cls = c.entries.find((e) => e.kind === 'classe' && e.name === 'Bárbaro')!;
  const feat = c.entries.find(
    (e) => e.kind === 'talento' && e.name === name && e.sourcePath === 'data/feats.json',
  )!;
  assert.ok(feat, name);
  draft.speciesRef = species.ref;
  assert.ok(species.kind === 'especie');
  draft.size = species.data.defaultSize;
  draft.form = species.data.sizes[0].form;
  draft.backgroundRef = null;
  draft.abilities.backgroundBonuses = {};
  draft.classes[0].classRef = cls.ref;
  c.grants.push(grant(990001, species, feat));
  const choose = (groupName: string, ...optionNames: string[]) => {
    const active = resolveState(c, draft).concessions.choices.find(
      (g) => g.group.name === groupName,
    );
    assert.ok(active, groupName);
    draft.choices.push({
      groupId: active.group.id,
      sourceInstanceId: active.instance.id,
      values: optionNames.map((name) => {
        const option = active.group.options.find((o) => o.name === name);
        assert.ok(option, `${groupName}: ${name}`);
        return { type: 'option', optionId: option.id };
      }),
    });
  };
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
  return { c, draft, feat, species, choose, sheet };
}

test('late racial and warlock feat choices offer their declared category', async () => {
  const c = await catalog;
  for (const name of ['Versátil', 'Dádiva Herdada', 'Lições dos Primogênitos']) {
    const owners = c.entries.filter((e) => e.name === name);
    const groups = c.choices.filter(
      (g) => owners.some((e) => e.ref.revisionId === g.ownerRevisionId) && g.featCategory,
    );
    assert.ok(groups.length, name);
    for (const g of groups) {
      assert.ok(g.options.length > 0, name);
      assert.ok(
        g.options.every((o) =>
          c.entries.some(
            (e) =>
              e.kind === 'talento' &&
              e.ref.revisionId === o.targetRef?.revisionId &&
              e.data.category === g.featCategory,
          ),
        ),
      );
    }
  }
});

test('the twelve curated special feats are grantable without unresolved prerequisite flags', async () => {
  for (const name of [
    'Anatomia Aberrante',
    'Alma Ecoante',
    'Sussurros Reunidos',
    'Sombra Viva',
    'Andarilho das Brumas',
    'Segunda Pele',
    'Ser Simbiótico',
    'Toque da Morte',
    'Observadores',
    'Pacto Feérico',
    'Pacto Infernal',
    'Pacto das Sombras',
  ]) {
    const { c, draft, feat } = await scenario(name);
    const state = resolveState(c, draft);
    assert.ok(
      state.concessions.instances.some((i) => i.entry.ref.revisionId === feat.ref.revisionId),
      name,
    );
    assert.ok(!state.concessions.problems.some((p) => p.code === 'INCOMPLETE_REQUIREMENTS'), name);
  }
});

test('planar pact exclusion rejects a second distinct pact', async () => {
  const { c, draft, species } = await scenario('Pacto Feérico');
  const other = c.entries.find(
    (e) =>
      e.kind === 'talento' && e.name === 'Pacto Infernal' && e.sourcePath === 'data/feats.json',
  )!;
  c.grants.push(grant(990002, species, other));
  const state = resolveState(c, draft);
  assert.ok(
    state.concessions.problems.some((p) => p.code === 'REQUIREMENT_NOT_MET'),
    JSON.stringify(state.concessions.problems),
  );
  assert.ok(
    state.concessions.instances.filter(
      (i) => i.entry.kind === 'talento' && i.entry.data.category === 'pacto-planar',
    ).length <= 1,
  );
});

test('dark gift fixed spells retain ability choice, free uses and preparation', async () => {
  for (const [name, expected] of [
    [
      'Sussurros Reunidos',
      [
        ['message', null],
        ['augury', 1],
      ],
    ],
    ['Sombra Viva', [['mage hand', null]]],
    ['Segunda Pele', [['alter self', 1]]],
    ['Toque da Morte', [['chill touch', null]]],
    [
      'Observadores',
      [
        ['beast sense', 1],
        ['speak with animals', 1],
      ],
    ],
  ] as const) {
    const { c, draft, feat, sheet } = await scenario(name);
    const casting = resolveSpellcasting(c, draft);
    const active = casting.profiles.find((p) => p.ownerRevisionId === feat.ref.revisionId);
    assert.ok(active, name);
    const definition = c.castingProfiles.find((p) => p.ownerRevisionId === feat.ref.revisionId)!;
    assert.deepEqual(definition.abilities, name === 'Observadores' ? [] : ['int', 'sab', 'car']);
    assert.deepEqual(
      definition.spells.map((s) => [
        c.entries
          .find((e) => e.ref.revisionId === s.spellRef.revisionId)!
          .originalName.toLowerCase(),
        s.ownUses,
      ]),
      expected,
    );
    assert.ok(
      definition.spells.every(
        (s) => s.alwaysPrepared && s.recovery === (s.ownUses ? 'longo' : null),
      ),
    );
    if (name !== 'Observadores') {
      assert.ok(casting.problems.some((p) => p.code === 'CASTING_ABILITY'));
      draft.castingAbilities.push({ profileId: active.id, ability: 'sab' });
    }
    assert.equal(sheet().magias.length, expected.length, name);
    assert.ok(!resolveSpellcasting(c, draft).problems.some((p) => p.code === 'CASTING_ABILITY'));
  }
});

test('Fey Pact allows exactly a divination or enchantment cantrip and shares the casting ability', async () => {
  const { c, draft, feat, choose, sheet } = await scenario('Pacto Feérico');
  const group = resolveState(c, draft).concessions.choices.find(
    (g) => g.group.name === 'Truques Feéricos',
  );
  assert.ok(group);
  assert.ok(group.group.options.some((o) => o.name === 'Orientação'));
  assert.ok(
    !group.group.options.some((o) => ['Raio de Fogo', 'Druidismo', 'Mensagem'].includes(o.name)),
  );
  for (const option of group.group.options) {
    const spell = c.entries.find((e) => e.ref.revisionId === option.targetRef?.revisionId)!;
    assert.ok(
      spell.kind === 'magia' &&
        spell.data.circle === 0 &&
        ['Adivinhação', 'Encantamento'].includes(spell.data.school),
    );
  }
  choose('Truques Feéricos', 'Orientação');
  const profile = resolveSpellcasting(c, draft).profiles.find(
    (p) => p.ownerRevisionId === feat.ref.revisionId,
  )!;
  draft.castingAbilities.push({ profileId: profile.id, ability: 'car' });
  const result = sheet();
  assert.equal(result.magias.length, 2);
  assert.equal(result.pericias.natureza.grau, 'proficiente');
  assert.ok(result.idiomas.some((i) => i.nome === 'Silvestre'));
  assert.equal(result.conjuracao.perfis[0].atributo, 'car');
});

test('Echoing Soul persists two skills, trained expertise and a PHB language', async () => {
  const { choose, sheet } = await scenario('Alma Ecoante');
  choose('Proeza Canalizada: perícias', 'Acrobacia', 'História');
  choose('Proeza Canalizada: especialização', 'História');
  choose('Idiomas Inerentes', 'Elvish');
  const result = sheet();
  assert.equal(result.pericias.acrobacia.grau, 'proficiente');
  assert.equal(result.pericias.historia.grau, 'especializacao');
  assert.ok(result.idiomas.some((i) => i.nome === 'Elvish'));
});

test('Symbiotic Being only offers its ten source skills and saves a language', async () => {
  const { c, draft, choose, sheet } = await scenario('Ser Simbiótico');
  const group = resolveState(c, draft).concessions.choices.find(
    (g) => g.group.name === 'Segunda Mente: perícia',
  );
  assert.ok(group);
  assert.equal(group.group.options.length, 10);
  assert.ok(!group.group.options.some((o) => o.name === 'Atletismo'));
  choose('Segunda Mente: perícia', 'Arcanismo');
  choose('Segunda Mente: idioma', 'Elvish');
  assert.equal(sheet().pericias.arcanismo.grau, 'proficiente');
  assert.ok(sheet().idiomas.some((i) => i.nome === 'Elvish'));
});

test('Infernal Pact records fire or poison resistance and grants Deception', async () => {
  const { choose, sheet } = await scenario('Pacto Infernal');
  choose('Resistência Infernal', 'Fogo');
  const result = sheet();
  assert.equal(result.pericias.enganacao.grau, 'proficiente');
  assert.ok(result.combate.resistencias.includes('Fogo'));
  assert.ok(!result.combate.resistencias.includes('Veneno'));
});

test('Second Skin saves the rolled change catalyst as a trait', async () => {
  const { choose, sheet } = await scenario('Segunda Pele');
  choose('Catalisador da Mudança', 'Ouvir sinos de templo tocando');
  assert.ok(sheet().tracos.some((t) => t.nome === 'Ouvir sinos de templo tocando'));
});

test('category population keeps manual choices intact and is repeatable', async () => {
  const c = structuredClone(await catalog);
  const group = c.choices.find((g) => g.featCategory === 'origem')!;
  const kept = group.options.slice(0, 1);
  assert.equal(kept.length, 1);
  group.options = kept;
  populateFeatChoices(c);
  populateFeatChoices(c);
  assert.deepEqual(group.options, kept);
});

test('all three special backgrounds reach a valid temporary sheet and remove their feat on origin change', async () => {
  for (const [backgroundName, featName] of [
    ['Errante da Névoa', 'Andarilho das Brumas'],
    ['Médium Espiritual', 'Sussurros Reunidos'],
    ['Buscador de Pacto', 'Pacto Feérico'],
  ]) {
    const { c, draft, feat } = await scenario(featName);
    c.grants = c.grants.filter((g) => g.id !== '00000000-0000-4000-8000-000000990001');
    const bg = c.entries.find(
      (e) =>
        e.kind === 'antecedente' &&
        e.name === backgroundName &&
        e.sourcePath === 'data/background.json',
    )!;
    assert.ok(bg.kind === 'antecedente');
    draft.backgroundRef = bg.ref;
    draft.abilities.external = { for: 14, des: 14, con: 14, int: 14, sab: 14, car: 14 };
    draft.abilities.backgroundBonuses = { [bg.data.abilities[0]]: 2, [bg.data.abilities[1]]: 1 };
    for (let iteration = 0; iteration < 5; iteration++) {
      const state = resolveState(c, draft);
      for (const active of state.concessions.choices) {
        if (
          draft.choices.some(
            (s) => s.groupId === active.group.id && s.sourceInstanceId === active.instance.id,
          )
        )
          continue;
        const options = active.group.featCategory
          ? active.group.options.filter((o) => o.targetRef?.revisionId === feat.ref.revisionId)
          : active.group.options;
        draft.choices.push({
          groupId: active.group.id,
          sourceInstanceId: active.instance.id,
          values: options
            .slice(0, active.group.minimum)
            .map((o) => ({ type: 'option', optionId: o.id })),
        });
      }
      for (const instance of state.concessions.instances) {
        const equipment = c.equipmentOptions.find(
          (e) => e.ownerRevisionId === instance.entry.ref.revisionId && e.key === 'B',
        );
        if (
          equipment &&
          !draft.equipmentOptions.some((e) => e.ownerRevisionId === equipment.ownerRevisionId)
        )
          draft.equipmentOptions.push({
            ownerRevisionId: equipment.ownerRevisionId,
            optionId: equipment.id,
          });
      }
      for (const p of resolveSpellcasting(c, draft).profiles)
        if (!draft.castingAbilities.some((a) => a.profileId === p.id))
          draft.castingAbilities.push({ profileId: p.id, ability: 'sab' });
    }
    const result = resolveCreation(c, draft);
    assert.deepEqual(result.problems, [], backgroundName);
    assert.ok(result.sheet, backgroundName);
    assert.ok(
      resolveState(c, draft).concessions.instances.some(
        (i) => i.entry.ref.revisionId === feat.ref.revisionId,
      ),
    );
    draft.backgroundRef = null;
    assert.ok(
      !resolveState(c, draft).concessions.instances.some(
        (i) => i.entry.ref.revisionId === feat.ref.revisionId,
      ),
    );
    assert.equal(resolveSpellcasting(c, draft).profiles.length, 0);
  }
});
