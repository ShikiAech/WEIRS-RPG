import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { exportPublishedSnapshot } from '../tools/compendium-import/snapshot';
import { fixture } from './fixtures/creation';
import { resolveState } from '../packages/character-creation/state';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { projectSheet } from '../packages/character-creation/project';

// Rebuild from all real sources and cross the published JSON boundary; no demo fixture catalog.
const catalog = Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8'),
  loadCuration(process.cwd()),
]).then(([json, legacy, registry, curation]) => {
  const resolved = resolveCatalog(
    normalizeSources([...legacy, ...json], JSON.parse(registry)),
    curation,
  );
  return JSON.parse(JSON.stringify(exportPublishedSnapshot(resolved))).catalog as ReturnType<
    typeof exportPublishedSnapshot
  >['catalog'];
});

// Literal expectations checked against data/races.json and the matching homebrew HTML tables.
const fixed = [
  ['Onis', 'Belial', 'Legado de Belial', 'Fogo'],
  ['Onis', 'Asmodeus', 'Legado de Asmodeus', 'Necrótico'],
  ['Onis', 'Beelzebub', 'Legado de Beelzebub', 'Veneno'],
  ['Namyrianos', 'Montanha', 'Afinidade Elemental (Montanha)', 'Contundente'],
  ['Namyrianos', 'Trovão', 'Afinidade Elemental (Trovão)', 'Elétrico'],
  ['Namyrianos', 'Chamas', 'Afinidade Elemental (Chamas)', 'Fogo'],
  ['Namyrianos', 'Gélido', 'Afinidade Elemental (Gélido)', 'Frio'],
  ['Draconianos', 'Elétrico', 'Herança Elemental (Elétrico)', 'Elétrico'],
  ['Draconianos', 'Gélido', 'Herança Elemental (Gélido)', 'Frio'],
  ['Draconianos', 'Ígneo', 'Herança Elemental (Ígneo)', 'Fogo'],
  ['Draconianos', 'Ácido', 'Herança Elemental (Ácido)', 'Ácido'],
  ['Draconianos', 'Venenoso', 'Herança Elemental (Venenoso)', 'Veneno'],
] as const;

async function scenario(name: string, lineageName?: string, level = 1) {
  const c = await catalog;
  const { draft } = fixture();
  const select = (speciesName: string, subdivision?: string) => {
    const species = c.entries.find((e) => e.kind === 'especie' && e.name === speciesName);
    assert.ok(species?.kind === 'especie');
    draft.speciesRef = species.ref;
    draft.size = species.data.defaultSize;
    draft.form = 'normal';
    const lineage = subdivision
      ? c.entries.find(
          (e) =>
            e.kind === 'linhagem' &&
            e.name === subdivision &&
            e.data.speciesRef.revisionId === species.ref.revisionId,
        )
      : null;
    assert.ok(!subdivision || lineage, `${speciesName}/${subdivision}`);
    draft.lineageRef = lineage?.ref ?? null;
  };
  select(name, lineageName);
  const fighter = c.entries.find((e) => e.kind === 'classe' && e.name === 'Guerreiro');
  assert.ok(fighter);
  draft.classes = [{ id: 'fighter', classRef: fighter.ref, subclassRef: null, level }];
  draft.levels = Array.from({ length: level }, (_, i) => ({
    totalLevel: i + 1,
    classEntryId: 'fighter',
    hitPointMethod: 'fixed' as const,
    hitPointRoll: null,
  }));
  draft.backgroundRef = null;
  draft.abilities.external = { for: 14, des: 14, con: 14, int: 14, sab: 14, car: 14 };
  draft.abilities.backgroundBonuses = {};
  const project = () => {
    const state = resolveState(c, draft);
    const casting = resolveSpellcasting(c, draft, state);
    draft.castingAbilities = casting.profiles.map((p) => ({ profileId: p.id, ability: 'sab' }));
    return {
      state,
      sheet: projectSheet(
        c,
        draft,
        state,
        resolveHitPoints(c, draft, state),
        resolveDefenses(c, draft, state),
        resolveSpellcasting(c, draft, state),
      ),
    };
  };
  return { c, draft, select, project };
}

for (const [species, lineage, trait, resistance] of fixed) {
  for (const level of [1, 3, 5]) {
    test(`${species}/${lineage} projects only its fixed ${resistance} resistance at level ${level}`, async () => {
      const { c, draft, project } = await scenario(species, lineage, level);
      const { state, sheet } = project();
      assert.equal(sheet.combate.resistencias, resistance);
      assert.equal(sheet.combate.imunidades, '');
      assert.equal(sheet.combate.vulnerabilidades, '');
      assert.ok(sheet.tracos.some((t) => t.nome === trait));
      const otherLineages = c.entries.filter(
        (e) =>
          e.kind === 'linhagem' &&
          e.data.speciesRef.revisionId === draft.speciesRef?.revisionId &&
          e.ref.revisionId !== draft.lineageRef?.revisionId,
      );
      const otherTraits = c.entries.filter(
        (e) =>
          e.kind === 'caracteristica' &&
          otherLineages.some((l) => l.ref.revisionId === e.data.parentRef?.revisionId),
      );
      assert.ok(
        !state.concessions.instances.some((i) =>
          otherTraits.some((t) => t.ref.revisionId === i.entry.ref.revisionId),
        ),
      );
    });
  }
}

for (const species of ['Onis', 'Namyrianos', 'Draconianos']) {
  test(`${species} with no lineage does not inherit a default or combined resistance`, async () => {
    const { project } = await scenario(species);
    assert.equal(project().sheet.combate.resistencias, '');
  });
}

test('changing lineage and species removes old resistance, spells, and exclusive traits', async () => {
  const { draft, select, project } = await scenario('Onis', 'Belial', 5);
  for (const [species, lineage, trait, resistance] of fixed) {
    select(species, lineage);
    const { sheet } = project();
    assert.equal(sheet.combate.resistencias, resistance, `${species}/${lineage}`);
    for (const [, , otherTrait] of fixed)
      assert.equal(
        sheet.tracos.some((t) => t.nome === otherTrait),
        otherTrait === trait,
      );
    assert.equal(
      sheet.magias.length,
      species === 'Onis' ? 4 : species === 'Namyrianos' && lineage === 'Gélido' ? 1 : 0,
    );
    assert.equal(draft.classes[0].level, 5);
  }
  select('Talpas', 'Talpa Armeiro');
  const { sheet } = project();
  assert.equal(sheet.combate.resistencias, '');
  assert.equal(sheet.magias.length, 0);
  assert.ok(!sheet.tracos.some((t) => fixed.some(([, , trait]) => t.nome === trait)));
});

test('changing species retains a resistance selected from the independent real background feat', async () => {
  const { c, draft, select, project } = await scenario('Onis', 'Belial', 5);
  const background = c.entries.find(
    (e) => e.kind === 'antecedente' && e.name === 'Buscador de Pacto',
  );
  const infernal = c.entries.find((e) => e.kind === 'talento' && e.name === 'Pacto Infernal');
  assert.ok(background && infernal);
  draft.backgroundRef = background.ref;
  const choose = (optionName: string) => {
    const active = resolveState(c, draft).concessions.choices.find((g) =>
      g.group.options.some((o) => o.name === optionName),
    );
    assert.ok(active, optionName);
    draft.choices.push({
      groupId: active.group.id,
      sourceInstanceId: active.instance.id,
      values: [
        { type: 'option', optionId: active.group.options.find((o) => o.name === optionName)!.id },
      ],
    });
  };
  choose('Pacto Infernal');
  choose('Veneno');
  assert.deepEqual(project().sheet.combate.resistencias.split('; ').sort(), ['Fogo', 'Veneno']);
  select('Namyrianos', 'Montanha');
  assert.deepEqual(project().sheet.combate.resistencias.split('; ').sort(), [
    'Contundente',
    'Veneno',
  ]);
  select('Talpas', 'Talpa Armeiro');
  assert.equal(project().sheet.combate.resistencias, 'Veneno');
  draft.backgroundRef = null;
  assert.equal(project().sheet.combate.resistencias, '');
});
