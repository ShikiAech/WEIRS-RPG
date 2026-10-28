import test from 'node:test';
import assert from 'node:assert/strict';
import { compendiumFixture } from './sql/compendium-fixture';
import { decodeCatalog } from '../packages/compendium/decode';

test('prerequisite references preserve identity without loading unrelated origin rules', async () => {
  const f = await compendiumFixture();
  try {
    const species = await f.species('Espécie de requisito');
    await f.publish(species.revisionId);
    const selected = await f.draft('caracteristica', 'Característica selecionada');
    await f.db.query(
      "INSERT INTO compendio_caracteristicas(revisao_id,categoria) VALUES($1,'traco')",
      [selected.revisionId],
    );
    await f.db.query(
      "INSERT INTO compendio_requisitos(revisao_id,operador,alvo_revisao_id) VALUES($1,'especie',$2)",
      [selected.revisionId, species.revisionId],
    );
    await f.publish(selected.revisionId);
    const raw = (
      await f.anonymous('SELECT obter_compendio_seletivo($1,NULL) AS catalog', [
        [selected.revisionId],
      ])
    )[0].catalog;
    assert.deepEqual(
      raw.records.map((r: any) => r.id),
      [selected.revisionId],
    );
    assert.deepEqual(
      raw.references.map((r: any) => [r.id, r.registro_id]),
      [[species.revisionId, species.recordId]],
    );
    const catalog = decodeCatalog(raw);
    assert.deepEqual(catalog.requirements[0].targetRef, species);
    assert.equal(catalog.entries.length, 1);
  } finally {
    await f.db.close();
  }
});
