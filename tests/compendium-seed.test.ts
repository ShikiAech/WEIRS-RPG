import test from 'node:test';
import assert from 'node:assert/strict';
import { compendiumFixture } from './sql/compendium-fixture';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { generateSeed, coverageReport } from '../tools/compendium-import/sql';

async function sample(includeLegacyBackground = false) {
  const sources = await readJsonSources(process.cwd());
  for (const s of sources)
    s.records = s.records.filter(
      (r) =>
        (r.kind === 'antecedente' && r.name === 'Acólito') ||
        (r.kind === 'talento' && ['Magic Initiate', 'Actor'].includes(r.originalName)) ||
        r.key === 'especie:weirs:cranoris' ||
        r.parentKey === 'especie:weirs:cranoris',
    );
  const legacy = await readLegacySources(process.cwd());
  for (const source of legacy)
    source.records = source.records.filter(
      (r) =>
        (r.kind === 'classe' && ['Clérigo', 'Druida', 'Mago'].includes(r.name)) ||
        (includeLegacyBackground && r.kind === 'antecedente' && r.name === 'Acólito'),
    );
  sources.push(...legacy.filter((s) => s.records.length));
  const c = resolveCatalog(
    normalizeSources(sources, { records: {} }),
    await loadCuration(process.cwd()),
  );
  const actor = c.entries.find((e) => e.originalName === 'Actor')!;
  actor.description =
    "Uma tradução com 'aspas', barra \\ e\nparágrafo novo. Texto literal $verify$; $compendio_0$.";
  return { c, actor };
}

test('reimportação oculta a cópia antiga do antecedente sem apagar sua revisão', async () => {
  const f = await compendiumFixture();
  try {
    const legacy = await readLegacySources(process.cwd());
    for (const s of legacy)
      s.records = s.records.filter((r) => r.kind === 'antecedente' && r.name === 'Acólito');
    const old = resolveCatalog(
      normalizeSources(
        legacy.filter((s) => s.records.length),
        { records: {} },
      ),
      await loadCuration(process.cwd()),
    );
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(generateSeed(old));
    const unmerged = await sample();
    const previous = unmerged.c.entries.find((e) => e.kind === 'antecedente')!;
    // The historical JSON record is independently published, without unrelated class packages.
    await f.db.exec(
      generateSeed({
        ...unmerged.c,
        entries: [previous],
        origins: unmerged.c.origins.filter((r) => r.id === previous.ref.recordId),
        requirements: [],
        choices: [],
        grants: [],
        effects: [],
        proficiencies: [],
        castingProfiles: [],
        equipmentOptions: [],
        progressionCells: [],
      }),
    );
    const { c } = await sample(true);
    const sql = generateSeed(c);
    await f.db.exec(sql);
    await f.db.exec(sql);
    assert.equal(
      (await f.anonymous("SELECT * FROM buscar_compendio('dnd-5e-2024','antecedente','Acólito')"))
        .length,
      1,
    );
    assert.equal(
      (
        await f.db.query<{ ativo: boolean }>('SELECT ativo FROM compendio_registros WHERE id=$1', [
          previous.ref.recordId,
        ])
      ).rows[0].ativo,
      false,
    );
    assert.equal(
      (
        await f.anonymous('SELECT id FROM compendio_revisoes WHERE id=$1', [
          previous.ref.revisionId,
        ])
      ).length,
      1,
    );
    const legacyId = old.entries.find((e) => e.kind === 'antecedente')!.legacyIds[0];
    assert.equal(
      (await f.anonymous('SELECT * FROM referencia_legada_compendio($1)', [legacyId])).length,
      1,
    );
  } finally {
    await f.db.close();
  }
});

test('retired source concepts leave current search without deleting pinned revisions', async () => {
  const f = await compendiumFixture();
  try {
    const old = await f.species('Conteúdo removido da fonte');
    await f.publish(old.revisionId);
    const { c } = await sample();
    c.retiredRecordIds = [old.recordId];
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(generateSeed(c));
    await f.db.exec(generateSeed(c));
    assert.equal(
      (
        await f.anonymous(
          "SELECT * FROM buscar_compendio('dnd-5e-2024','especie','Conteúdo removido')",
        )
      ).length,
      0,
    );
    assert.equal(
      (await f.anonymous('SELECT id FROM compendio_revisoes WHERE id=$1', [old.revisionId])).length,
      1,
    );
    assert.equal(
      (await f.db.query<any>('SELECT ativo FROM compendio_registros WHERE id=$1', [old.recordId]))
        .rows[0].ativo,
      false,
    );
  } finally {
    await f.db.close();
  }
});

test('seed registra as categorias adicionais de talento antes de publicar', async () => {
  const f = await compendiumFixture();
  try {
    const { c, actor } = await sample();
    assert.equal(actor.kind, 'talento');
    if (actor.kind !== 'talento') return;
    actor.data.category = 'selvagem';
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(generateSeed(c));
    assert.equal(
      (
        await f.anonymous('SELECT categoria_codigo FROM compendio_talentos WHERE revisao_id=$1', [
          actor.ref.revisionId,
        ])
      )[0].categoria_codigo,
      'selvagem',
    );
  } finally {
    await f.db.close();
  }
});
test('carga relacional publica vínculos, preserva texto e é idempotente', async () => {
  const f = await compendiumFixture();
  try {
    const { c, actor } = await sample(),
      sql = generateSeed(c);
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(sql);
    const count = async () =>
      Number(
        (await f.db.query<{ n: number }>('SELECT count(*)::int AS n FROM compendio_revisoes'))
          .rows[0].n,
      );
    const before = await count();
    await f.db.exec(sql);
    assert.equal(await count(), before);
    const saved = await f.anonymous('SELECT descricao_pt FROM compendio_revisoes WHERE id=$1', [
      actor.ref.revisionId,
    ]);
    assert.equal(saved[0].descricao_pt, actor.description);
    const links = await f.anonymous('SELECT * FROM compendio_concessoes');
    assert.ok(links.length >= 5);
    assert.equal(
      (
        await f.db.query(
          "SELECT * FROM compendio_pendencias WHERE severidade='error' AND NOT resolvida",
        )
      ).rows.length,
      0,
    );
    assert.equal(coverageReport(c).concepts, before);
  } finally {
    await f.db.close();
  }
});
test('reimportação detecta edição do rascunho e reverte a unidade sem sobrescrever', async () => {
  const f = await compendiumFixture();
  try {
    const { c, actor } = await sample();
    c.issues.push({
      code: 'UNRESOLVED_REFERENCE',
      severity: 'error',
      path: 'fixture',
      pointer: 'actor',
      revisionId: actor.ref.revisionId,
      message: 'Revisão editorial em andamento.',
    });
    const sql = generateSeed(c);
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(sql);
    await f.db.query('UPDATE compendio_revisoes SET descricao_pt=$1 WHERE id=$2', [
      'Edição posterior',
      actor.ref.revisionId,
    ]);
    await assert.rejects(f.db.exec(sql), (error: any) => error.code === 'WC004');
    await f.db.exec('ROLLBACK');
    assert.equal(
      (
        await f.db.query<{ descricao_pt: string }>(
          'SELECT descricao_pt FROM compendio_revisoes WHERE id=$1',
          [actor.ref.revisionId],
        )
      ).rows[0].descricao_pt,
      'Edição posterior',
    );
    assert.equal(
      (
        await f.db.query<{ estado: string }>('SELECT estado FROM compendio_revisoes WHERE id=$1', [
          actor.ref.revisionId,
        ])
      ).rows[0].estado,
      'rascunho',
    );
  } finally {
    await f.db.close();
  }
});
test('carga não sobrescreve manutenção em tabela filha nem publica dependência pendente', async () => {
  const f = await compendiumFixture();
  try {
    const { c } = await sample(),
      species = c.entries.find((e) => e.kind === 'especie')!;
    c.issues.push({
      code: 'UNSUPPORTED_MECHANIC',
      severity: 'error',
      path: 'fixture',
      pointer: 'species',
      revisionId: species.ref.revisionId,
      message: 'Rascunho em revisão.',
    });
    const sql = generateSeed(c);
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    await f.db.exec(sql);
    await f.db.query('UPDATE compendio_deslocamentos SET distancia=12 WHERE revisao_id=$1', [
      species.ref.revisionId,
    ]);
    await assert.rejects(f.db.exec(sql), (error: any) => error.code === 'WC004');
    await f.db.exec('ROLLBACK');
    assert.equal(
      Number(
        (
          await f.db.query<{ distancia: number }>(
            'SELECT distancia FROM compendio_deslocamentos WHERE revisao_id=$1',
            [species.ref.revisionId],
          )
        ).rows[0].distancia,
      ),
      12,
    );
    await f.db.query('UPDATE compendio_deslocamentos SET distancia=9 WHERE revisao_id=$1', [
      species.ref.revisionId,
    ]);
    await f.db.query(
      "INSERT INTO compendio_sentidos(revisao_id,tipo,distancia_pes) VALUES($1,'sentido editorial',30)",
      [species.ref.revisionId],
    );
    await assert.rejects(f.db.exec(sql), (error: any) => error.code === 'WC004');
    await f.db.exec('ROLLBACK');
  } finally {
    await f.db.close();
  }
});
