import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { compendiumFixture } from '../sql/compendium-fixture';
import { readJsonSources } from '../../tools/compendium-import/json';
import { readLegacySources } from '../../tools/compendium-import/legacy';
import { normalizeSources } from '../../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../../tools/compendium-import/resolve';
import { generateSeed } from '../../tools/compendium-import/sql';
import { exportPublishedSnapshot } from '../../tools/compendium-import/snapshot';
import { decodeCatalog } from '../../packages/compendium/decode';

test(
  'upgrade do seed HEAD preserva revisões antigas e metadados do snapshot real com idempotência',
  { timeout: 240000 },
  async () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const [json, legacy, registry, curation] = await Promise.all([
      readJsonSources(root, 'metadata-roundtrip'),
      readLegacySources(root, 'metadata-roundtrip'),
      readFile(path.join(root, 'content/compendium/identities.json'), 'utf8').then(JSON.parse),
      loadCuration(root),
    ]);
    registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
    const resolved = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);
    const snapshot = exportPublishedSnapshot(resolved).catalog;
    const expected = snapshot.entries.filter(
      (e) =>
        (e.kind === 'especie' && e.data.formRules !== undefined) ||
        (e.kind === 'caracteristica' &&
          (e.data.formEffects !== undefined ||
            e.data.spellPrerequisite !== undefined ||
            e.data.skillBonuses !== undefined)),
    );
    assert.ok(expected.some((e) => e.kind === 'especie' && e.data.formRules?.length));
    for (const key of ['formEffects', 'spellPrerequisite', 'skillBonuses'] as const)
      assert.ok(
        expected.some((e) => e.kind === 'caracteristica' && e.data[key] !== undefined),
        key,
      );
    const f = await compendiumFixture();
    try {
      await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
      const baseline = execFileSync('git', ['show', 'HEAD:supabase/compendium-seed.sql'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 60 * 1024 * 1024,
      });
      await f.db.exec(baseline);
      await f.db.exec('CREATE TEMP TABLE revisoes_antes AS TABLE public.compendio_revisoes');
      const oldRevisions = (
        await f.db.query<{ count: number }>('SELECT count(*)::int AS count FROM revisoes_antes')
      ).rows[0].count;
      assert.ok(oldRevisions > 2000);
      const sql = generateSeed(resolved);
      await f.db.exec(sql);
      await f.db.exec(sql);
      assert.equal(
        (
          await f.db.query<{ preserved: boolean }>(
            'SELECT NOT EXISTS(SELECT * FROM revisoes_antes EXCEPT SELECT * FROM public.compendio_revisoes) AS preserved',
          )
        ).rows[0].preserved,
        true,
      );
      const raw = (
        await f.anonymous('SELECT obter_compendio($1,NULL) AS c', [
          expected.map((e) => e.ref.revisionId),
        ])
      )[0].c;
      const actual = decodeCatalog(raw);
      for (const before of expected) {
        const after = actual.entries.find((e) => e.ref.revisionId === before.ref.revisionId);
        assert.ok(after, before.name);
        if (before.kind === 'especie' && after.kind === 'especie')
          assert.deepEqual(after.data.formRules, before.data.formRules, before.name);
        else if (before.kind === 'caracteristica' && after.kind === 'caracteristica') {
          for (const key of ['formEffects', 'spellPrerequisite', 'skillBonuses'] as const)
            assert.deepEqual(after.data[key], before.data[key], `${before.name}: ${key}`);
        } else assert.fail(`Tipo divergente: ${before.name}`);
      }
      process.stdout.write(
        JSON.stringify({
          metadataEntries: expected.length,
          oldRevisionsPreserved: oldRevisions,
          closure: actual.entries.length,
          roundtrips: 2,
        }) + '\n',
      );
    } finally {
      await f.db.close();
    }
  },
);
