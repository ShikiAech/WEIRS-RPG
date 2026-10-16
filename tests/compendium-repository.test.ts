import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compendiumFixture } from './sql/compendium-fixture';
import { createCompendiumRepository, resolveLegacyCompendiumRef } from '../apps/web/lib/compendium';
import type { CreationDraft } from '../packages/contracts/character-creation';

test('repositório lê apenas revisões publicadas, pagina variantes e conserva referências fixadas', async (t) => {
  const f = await compendiumFixture();
  try {
    const species = await f.species('Cranoris');
    const cls = await f.draft('classe', 'Mago');
    const legacyId = crypto.randomUUID();
    await f.db.query(
      'INSERT INTO compendio_referencias_legadas(revisao_id,legado_id) VALUES($1,$2)',
      [cls.revisionId, legacyId],
    );
    await f.db.query('INSERT INTO compendio_classes(revisao_id,dado_vida) VALUES($1,6)', [
      cls.revisionId,
    ]);
    const spell = await f.draft('magia', 'Raio de Fogo');
    await f.db.query(
      "INSERT INTO compendio_magias(revisao_id,circulo,escola) VALUES($1,0,'Evocação')",
      [spell.revisionId],
    );
    await f.db.query(
      'INSERT INTO compendio_magia_classes(revisao_id,classe_revisao_id) VALUES($1,$2)',
      [spell.revisionId, cls.revisionId],
    );
    const stain = await f.draft('talento', 'Espírito Manchado');
    await f.db.query(
      "INSERT INTO compendio_talentos(revisao_id,categoria_codigo) VALUES($1,'origem')",
      [stain.revisionId],
    );
    await f.db.query(
      "INSERT INTO compendio_aliases(revisao_id,nome) VALUES($1,'Mancha Espiritual')",
      [stain.revisionId],
    );
    await f.db.query(
      "INSERT INTO compendio_concessoes(revisao_id,chave,tipo,alvo_revisao_id) VALUES($1,'talento','talento',$2)",
      [species.revisionId, stain.revisionId],
    );
    const twin = await f.draft('talento', 'Espírito Manchado');
    await f.db.query(
      "INSERT INTO compendio_talentos(revisao_id,categoria_codigo) VALUES($1,'origem')",
      [twin.revisionId],
    );
    const hidden = await f.species('Rascunho privado');
    await f.user(f.admin, 'SELECT * FROM publicar_compendio_lote($1)', [
      [species.revisionId, cls.revisionId, spell.revisionId, stain.revisionId, twin.revisionId],
    ]);
    const calls: string[] = [];
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push(name);
        let signal: AbortSignal | undefined;
        return {
          abortSignal(value: AbortSignal) {
            signal = value;
            return this;
          },
          then(resolve: any, reject: any) {
            return (async () => {
              if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
              try {
                if (name === 'buscar_compendio')
                  return {
                    data: await f.anonymous(
                      'SELECT * FROM buscar_compendio($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                      [
                        args.p_conjunto,
                        args.p_tipo,
                        args.p_busca,
                        args.p_fonte,
                        args.p_classe,
                        args.p_pai,
                        args.p_circulo,
                        args.p_apos_nome,
                        args.p_apos_registro,
                        args.p_limite,
                      ],
                    ),
                    error: null,
                  };
                if (name === 'obter_compendio')
                  return {
                    data: (
                      await f.anonymous('SELECT obter_compendio($1,$2) AS valor', [
                        args.p_revisoes,
                        args.p_conjunto,
                      ])
                    )[0].valor,
                    error: null,
                  };
                if (name === 'referencia_legada_compendio')
                  return {
                    data: await f.anonymous('SELECT * FROM referencia_legada_compendio($1)', [
                      args.p_legado,
                    ]),
                    error: null,
                  };
                throw Error('RPC inesperada: ' + name);
              } catch (error) {
                return { data: null, error };
              }
            })().then(resolve, reject);
          },
        };
      },
    } as unknown as SupabaseClient;
    const repo = createCompendiumRepository(client);
    await t.test(
      'busca nome original/tradução/alias sem acentos e filtra classe/círculo',
      async () => {
        assert.equal(
          (await repo.list({ ruleSetId: 'dnd-5e-2024', query: 'espirito manchado' })).entries
            .length,
          2,
        );
        assert.equal(
          (await repo.list({ ruleSetId: 'dnd-5e-2024', query: 'mancha espiritual' })).entries[0].ref
            .recordId,
          stain.recordId,
        );
        const result = await repo.list({
          ruleSetId: 'dnd-5e-2024',
          kind: 'magia',
          classRevisionId: cls.revisionId,
          circle: 0,
        });
        assert.deepEqual(
          result.entries.map((e) => e.name),
          ['Raio de Fogo'],
        );
      },
    );
    await t.test('paginação estável não repete registros com o mesmo nome', async () => {
      let cursor: string | undefined,
        ids: string[] = [];
      do {
        const page = await repo.list({ ruleSetId: 'dnd-5e-2024', limit: 1, cursor });
        ids.push(...page.entries.map((e) => e.ref.recordId));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(ids.length, 5);
      assert.equal(new Set(ids).size, 5);
    });
    await t.test(
      'carrega concessões transitivas e mantém a revisão selecionada após atualização',
      async () => {
        const next = crypto.randomUUID();
        await f.db.query(
          "INSERT INTO compendio_revisoes(id,registro_id,numero,conjunto_regras_codigo,fonte_id,nome_pt) VALUES($1,$2,2,'dnd-5e-2024',$3,'Mago revisado')",
          [next, cls.recordId, f.sourceId],
        );
        await f.db.query('INSERT INTO compendio_classes(revisao_id,dado_vida) VALUES($1,8)', [
          next,
        ]);
        await f.publish(next);
        assert.deepEqual(await resolveLegacyCompendiumRef(client, legacyId), {
          recordId: cls.recordId,
          revisionId: next,
        });
        assert.ok(
          (
            await repo.list({ ruleSetId: 'dnd-5e-2024', query: 'Mago revisado' })
          ).entries[0].legacyIds?.includes(legacyId),
        );
        const old = await repo.get(cls);
        assert.equal(old.name, 'Mago');
        assert.ok(old.kind === 'classe' && old.data.hitDie === 6);
        const draft = {
          ruleSetId: 'dnd-5e-2024',
          speciesRef: species,
          lineageRef: null,
          backgroundRef: null,
          classes: [{ classRef: cls, subclassRef: null }],
          choices: [],
          spellSelections: [],
          equipmentOptions: [],
        } as unknown as CreationDraft;
        const c = await repo.getCreationCatalog(draft);
        assert.ok(c.entries.some((e) => e.ref.revisionId === stain.revisionId));
        assert.ok(c.grants.some((g) => g.targetRef?.revisionId === stain.revisionId));
        assert.ok(
          !c.entries.some(
            (e) => e.ref.revisionId === hidden.revisionId || e.ref.revisionId === next,
          ),
        );
      },
    );
    await t.test(
      'cancelamento e revisão indisponível não recorrem ao catálogo estático',
      async () => {
        const controller = new AbortController();
        controller.abort();
        const before = calls.length;
        await assert.rejects(repo.list({ ruleSetId: 'dnd-5e-2024' }, controller.signal), {
          name: 'AbortError',
        });
        assert.equal(calls.length, before);
        await assert.rejects(repo.get(hidden), /disponível|encontrad/i);
      },
    );
  } finally {
    await f.db.close();
  }
});
