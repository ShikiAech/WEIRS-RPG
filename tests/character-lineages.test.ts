import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { exportPublishedSnapshot } from '../tools/compendium-import/snapshot';
import { createSnapshotRepository } from '../packages/compendium/snapshot';
import { resolveCreation } from '../packages/character-creation/resolve';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { fixture } from './fixtures/creation';

const published = Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  loadCuration(process.cwd()),
]).then(([json, legacy, curation]) =>
  exportPublishedSnapshot(
    resolveCatalog(normalizeSources([...legacy, ...json], { records: {} }), curation),
  ),
);

const subdivisions = [
  ['Onis', ['Asmodeus', 'Beelzebub', 'Belial']],
  ['Talpas', ['Talpa Armeiro', 'Talpa Ferramenteiro', 'Talpa Ferreiro']],
  ['Namyrianos', ['Chamas', 'Gélido', 'Montanha', 'Trovão']],
  ['Draconianos', ['Elétrico', 'Gélido', 'Ígneo', 'Ácido', 'Venenoso']],
  ['Elfos', ['Meio-Elfo']],
  ['Humanos', ['Manchados', 'Marcados']],
] as const;

for (const [speciesName, names] of subdivisions) {
  test(`${speciesName}: o catálogo publicado oferece todas as subdivisões da própria espécie`, async () => {
    const snapshot = await published;
    const species = snapshot.catalog.entries.find(
      (e) => e.kind === 'especie' && e.name === speciesName,
    )!;
    assert.ok(species, `Espécie publicada: ${speciesName}`);
    const repository = createSnapshotRepository(async () => snapshot);
    const result = await repository.list({
      ruleSetId: snapshot.catalog.ruleSetId,
      kind: 'linhagem',
      parentRevisionId: species.ref.revisionId,
    });
    assert.deepEqual(result.entries.map((e) => e.name).sort(), [...names].sort());
    for (const summary of result.entries) {
      const lineage = await repository.get(summary.ref);
      assert.ok(lineage.kind === 'linhagem');
      assert.deepEqual(lineage.data.speciesRef, species.ref);
      assert.ok(lineage.description.trim(), `Descrição da subdivisão ${lineage.name}`);
    }
  });
}

for (const [speciesName, names] of subdivisions.slice(0, 4)) {
  test(`${speciesName}: a ficha recebe somente os traços da subdivisão selecionada`, async () => {
    const catalog = structuredClone((await published).catalog);
    const { catalog: base, draft } = fixture();
    catalog.entries.push(...base.entries);
    const species = catalog.entries.find((e) => e.kind === 'especie' && e.name === speciesName)!;
    const lineages = catalog.entries.filter(
      (e) => e.kind === 'linhagem' && e.data.speciesRef.revisionId === species.ref.revisionId,
    );
    assert.equal(lineages.length, names.length);
    draft.speciesRef = species.ref;
    draft.size = species.kind === 'especie' ? species.data.defaultSize : null;
    draft.form = 'normal';
    const exclusiveTraits = catalog.entries.filter(
      (e) =>
        e.kind === 'caracteristica' &&
        lineages.some((l) => l.ref.revisionId === e.data.parentRef?.revisionId),
    );
    assert.ok(exclusiveTraits.length >= names.length);
    for (const lineage of lineages) {
      draft.lineageRef = lineage.ref;
      draft.castingAbilities = [];
      for (const profile of resolveSpellcasting(catalog, draft).profiles) {
        const definition = catalog.castingProfiles.find((p) => profile.id.endsWith(`:${p.id}`));
        if (!profile.ability && definition?.abilities.length)
          draft.castingAbilities.push({ profileId: profile.id, ability: definition.abilities[0] });
      }
      const selectedTraits = exclusiveTraits.filter(
        (e) =>
          e.kind === 'caracteristica' && e.data.parentRef?.revisionId === lineage.ref.revisionId,
      );
      const preview = resolveCreation(catalog, draft);
      assert.deepEqual(preview.problems, []);
      assert.ok(preview.sheet);
      assert.equal(preview.sheet.identidade.especie, `${speciesName} / ${lineage.name}`);
      assert.deepEqual(
        preview.sheet.tracos
          .filter((t) => exclusiveTraits.some((e) => e.name === t.nome))
          .map((t) => t.nome)
          .sort(),
        selectedTraits.map((e) => e.name).sort(),
      );
      if (speciesName === 'Namyrianos') {
        assert.ok(
          !preview.sheet.tracos.some((t) => t.nome === 'Habilidades da Afinidade Elemental'),
        );
      }
    }
    draft.lineageRef = null;
    const withoutLineage = resolveCreation(catalog, draft);
    assert.ok(withoutLineage.problems.some((p) => p.code === 'LINEAGE_REQUIRED'));
    assert.ok(
      !withoutLineage.contributions.some((c) =>
        exclusiveTraits.some((e) => e.ref.revisionId === c.sourceRevisionId),
      ),
    );
  });
}
