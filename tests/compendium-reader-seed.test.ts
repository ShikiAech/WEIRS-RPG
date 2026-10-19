import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compendiumFixture } from './sql/compendium-fixture';

test('leitura pública conserva revisões fixadas e regras atuais sem consultar regras por revisão', async (t) => {
  const f = await compendiumFixture();
  try {
    async function feature(category: string, ruleset = 'dnd-5e-2024') {
      const row = await f.draft('caracteristica', category);
      await f.db.query('UPDATE compendio_revisoes SET conjunto_regras_codigo=$2 WHERE id=$1', [
        row.revisionId,
        ruleset,
      ]);
      await f.db.query(
        'INSERT INTO compendio_caracteristicas(revisao_id,categoria) VALUES($1,$2)',
        [row.revisionId, category],
      );
      return row;
    }
    const historical = await feature('regra-criacao');
    await f.publish(historical.revisionId);
    const current = crypto.randomUUID();
    await f.db.query(
      `INSERT INTO compendio_revisoes(id,registro_id,numero,conjunto_regras_codigo,fonte_id,nome_pt)
       VALUES($1,$2,2,'dnd-5e-2024',$3,'Regra atual')`,
      [current, historical.recordId, f.sourceId],
    );
    await f.db.query(
      "INSERT INTO compendio_caracteristicas(revisao_id,categoria) VALUES($1,'regra-criacao')",
      [current],
    );
    await f.publish(current);
    await f.db.query('UPDATE compendio_registros SET ativo=false WHERE id=$1', [
      historical.recordId,
    ]);
    const draft = await feature('regra-criacao');
    const ordinary = await feature('traco');
    await f.publish(ordinary.revisionId);
    await f.db.exec(
      "INSERT INTO compendio_conjuntos_regras VALUES('outro','Outro conjunto','2024',true)",
    );
    const other = await feature('regra-criacao', 'outro');
    await f.publish(other.revisionId);
    const read = async (revisions: string[] | null, ruleset: string | null) => {
      const rows = await f.anonymous('SELECT obter_compendio($1,$2) AS catalog', [
        revisions,
        ruleset,
      ]);
      return rows[0].catalog.records.map((row: { id: string }) => row.id).sort();
    };

    await t.test(
      'ids explícitos preservam histórico e excluem rascunhos e outro conjunto',
      async () => {
        assert.deepEqual(
          await read(
            [historical.revisionId, historical.revisionId, draft.revisionId, other.revisionId],
            'dnd-5e-2024',
          ),
          [historical.revisionId, current].sort(),
        );
      },
    );
    await t.test(
      'conjunto nulo não acrescenta regras implícitas e permite histórico de outros conjuntos',
      async () => {
        assert.deepEqual(
          await read([historical.revisionId, other.revisionId, draft.revisionId], null),
          [historical.revisionId, other.revisionId].sort(),
        );
        assert.deepEqual(await read([], null), []);
      },
    );
    await t.test(
      'ids nulos e duplicados preservam somente a regra atual do conjunto solicitado',
      async () => {
        assert.deepEqual(await read(null, 'dnd-5e-2024'), [current]);
        assert.deepEqual(await read([current, current], 'dnd-5e-2024'), [current]);
        assert.deepEqual(await read([historical.revisionId], 'inexistente'), []);
      },
    );
    await t.test(
      'seleção inicial não executa subconsulta correlacionada por revisão publicada',
      async () => {
        const source = (
          await f.db.query<{ prosrc: string }>(
            "SELECT prosrc FROM pg_proc WHERE oid='public.obter_compendio(uuid[],text)'::regprocedure",
          )
        ).rows[0].prosrc;
        // Explain the actual production statement, including its parameter types.
        const seed = source
          .match(/SELECT coalesce\(array_agg\(DISTINCT r.id\),'\{\}'\) INTO ids[\s\S]*?;/)![0]
          .replace(' INTO ids', '')
          .replace(/\bp_revisoes\b/g, '$1::uuid[]')
          .replace(/\bp_conjunto\b/g, '$2::text');
        const explained = await f.db.query<any>('EXPLAIN (ANALYZE,FORMAT JSON) ' + seed, [
          [ordinary.revisionId],
          'dnd-5e-2024',
        ]);
        const repeatedSubqueries: number[] = [];
        function visit(plan: any) {
          if (plan['Subplan Name']) repeatedSubqueries.push(plan['Actual Loops']);
          for (const child of plan.Plans ?? []) visit(child);
        }
        visit(explained.rows[0]['QUERY PLAN'][0].Plan);
        assert.ok(
          repeatedSubqueries.every((loops) => loops <= 1),
          `A busca de regras foi repetida por revisão: ${repeatedSubqueries.join(', ')}`,
        );
      },
    );
    await t.test(
      'montagem final conserva o payload anterior completo, relações e domínios vazios',
      async () => {
        const original = await readFile('supabase/migrations/202610160011_compendio.sql', 'utf8');
        await f.db.exec(
          original
            .slice(
              original.indexOf('CREATE FUNCTION public.obter_compendio'),
              original.indexOf('REVOKE ALL ON FUNCTION public.obter_compendio'),
            )
            .replace('public.obter_compendio(', 'pg_temp.reader_reference('),
        );
        const parent = await f.species('Espécie com decimal');
        await f.db.query(
          "INSERT INTO compendio_deslocamentos(revisao_id,modo,distancia,unidade) VALUES($1,'voo',1.25,'metros')",
          [parent.revisionId],
        );
        await f.publish(parent.revisionId);
        const linked = await feature('traco');
        await f.db.query(
          'UPDATE compendio_caracteristicas SET origem_revisao_id=$2 WHERE revisao_id=$1',
          [linked.revisionId, parent.revisionId],
        );
        await f.db.query('INSERT INTO compendio_aliases(revisao_id,nome) VALUES($1,$2)', [
          linked.revisionId,
          'Nome com acentuação e "aspas"',
        ]);
        await f.publish(linked.revisionId);
        const normalize = (payload: any) => ({
          records: payload.records.sort((a: any, b: any) => a.id.localeCompare(b.id)),
          tables: Object.fromEntries(
            Object.entries(payload.tables).map(([name, rows]) => [
              name,
              (rows as unknown[]).sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b)),
              ),
            ]),
          ),
        });
        for (const ruleset of ['dnd-5e-2024', null]) {
          const revisions = [
            linked.revisionId,
            historical.revisionId,
            draft.revisionId,
            other.revisionId,
          ];
          const previous = (
            await f.db.query<any>('SELECT pg_temp.reader_reference($1,$2) AS catalog', [
              revisions,
              ruleset,
            ])
          ).rows[0].catalog;
          const currentPayload = (
            await f.anonymous('SELECT obter_compendio($1,$2) AS catalog', [revisions, ruleset])
          )[0].catalog;
          assert.deepEqual(normalize(currentPayload), normalize(previous));
          assert.deepEqual(currentPayload.tables.compendio_magias, []);
          assert.ok(currentPayload.records.some((row: any) => row.id === parent.revisionId));
          assert.equal(
            currentPayload.tables.compendio_deslocamentos.find((row: any) => row.modo === 'voo')
              .distancia,
            1.25,
          );
          assert.equal(
            currentPayload.tables.compendio_caracteristicas.find(
              (row: any) => row.revisao_id === linked.revisionId,
            ).nivel,
            null,
          );
          assert.ok(!currentPayload.records.some((row: any) => row.id === draft.revisionId));
        }
        await f.db.exec('BEGIN; DELETE FROM private.compendio_dominios; SET LOCAL ROLE anon;');
        try {
          const result = (
            await f.db.query<any>('SELECT obter_compendio($1,NULL) AS catalog', [
              [linked.revisionId],
            ])
          ).rows[0].catalog;
          assert.deepEqual(result.tables, {});
        } finally {
          await f.db.exec('ROLLBACK');
        }
      },
    );
  } finally {
    await f.db.close();
  }
});
