import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonSources } from '../tools/compendium-import/json';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { exportPublishedSnapshot } from '../tools/compendium-import/snapshot';
import { createSnapshotRepository } from '../packages/compendium/snapshot';

test('demonstração exporta somente o grafo publicável e permite retentar a carga', async () => {
  const sources = await readJsonSources(process.cwd());
  for (const s of sources)
    s.records = s.records.filter(
      (r) =>
        (r.kind === 'talento' && r.originalName === 'Actor') ||
        r.key === 'especie:weirs:cranoris' ||
        r.parentKey === 'especie:weirs:cranoris',
    );
  const c = resolveCatalog(
    normalizeSources(sources, { records: {} }),
    await loadCuration(process.cwd()),
  );
  const shell = c.entries.find((e) => e.name === 'Carapaça Óssea')!,
    species = c.entries.find((e) => e.kind === 'especie')!;
  c.issues.push({
    code: 'UNRESOLVED_REFERENCE',
    severity: 'error',
    path: 'fixture',
    pointer: 'shell',
    revisionId: shell.ref.revisionId,
    message: 'Rascunho editorial.',
  });
  const snapshot = exportPublishedSnapshot(c);
  assert.equal(snapshot.mode, 'demonstracao');
  assert.ok(
    !snapshot.catalog.entries.some(
      (e) =>
        e.ref.revisionId === shell.ref.revisionId || e.ref.revisionId === species.ref.revisionId,
    ),
  );
  let attempts = 0;
  const repo = createSnapshotRepository(async () => {
    attempts++;
    if (attempts === 1) throw Error('Rede indisponível');
    return snapshot;
  });
  await assert.rejects(repo.list({ ruleSetId: c.ruleSetId }), /Não foi possível/);
  const found = await repo.list({ ruleSetId: c.ruleSetId, query: 'ator' });
  assert.equal(found.entries.length, 1);
  assert.equal(attempts, 2);
  const detail = await repo.get(found.entries[0].ref);
  assert.equal(detail.name, 'Ator');
  await assert.rejects(repo.get(shell.ref), /não está disponível/);
});
