import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

function assertDetached(row: any, geometry = [3, 1, 37]) {
  assert(row, 'independent effect remains readable');
  assert.deepEqual([Number(row.x), Number(row.y), Number(row.angulo)], geometry);
  assert.deepEqual(
    [
      row.token_id,
      row.ancora_dx,
      row.ancora_dy,
      Number(row.ancora_rotacao),
      Number(row.ancora_angulo),
      row.acompanhar_rotacao,
    ],
    [null, null, null, 0, 0, false],
    'detached rows must not retain former source geometry or follow state',
  );
}

// Full history: the real RPC and authenticated table RLS must agree, including
// policies installed before the automatic-vision migrations.
test('linked areas inherit current source visibility across snapshots and direct reads', async (t) => {
  const f = await mesaFixture();
  try {
    await f.db.exec(
      await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(directory))
      .filter((name) => /^\d+_.+\.sql$/.test(name) && name > '202610070004_mesa.sql')
      .sort())
      await f.db.exec(await readFile(new URL(name, directory), 'utf8'));
    const op = async (actor: string, command: unknown) =>
      (
        await f.user(actor, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
          f.campaign,
          crypto.randomUUID(),
          command,
        ])
      )[0].result;
    const scene = (
      await op(f.gm, {
        tipo: 'cena_criar',
        nome: 'Âncoras e visão',
        largura: 20,
        altura: 20,
        publicada: true,
      })
    ).cena;
    const token = async (nome: string, x: number, extra = {}) =>
      (
        await op(f.gm, {
          tipo: 'token_criar',
          cena_id: scene.id,
          nome,
          x,
          y: 1,
          tamanho: 1,
          cor: '#ffffff',
          ...extra,
        })
      ).token;
    await token('Fonte do jogador', 1, { ficha_id: f.sheet });
    const enemy = await token('Adversário atrás da parede', 15);
    const visible = await token('Fonte visível', 2);
    const owned = await token('Fonte própria sem visão', 16, {
      controlador_id: f.player,
      visao: false,
    });
    await op(f.gm, {
      tipo: 'parede_criar',
      cena_id: scene.id,
      x1: 4,
      y1: 0,
      x2: 4,
      y2: 20,
      porta: true,
      aberta: false,
    });
    await op(f.gm, {
      tipo: 'cena_atribuir',
      cena_id: scene.id,
      usuarios: [f.spectator],
      seguir_usuario_id: f.player,
    });
    const area = async (nome: string, token_id: string | null, extra = {}) =>
      (
        await op(f.gm, {
          tipo: 'area_criar',
          cena_id: scene.id,
          nome,
          forma: 'circulo',
          x: 3,
          y: 1,
          tamanho: 1,
          cor: '#ffffff',
          token_id,
          acompanhar_rotacao: false,
          ...extra,
        })
      ).area;
    const hiddenArea = await area('Efeito da fonte fora da visão', enemy.id);
    const visibleArea = await area('Efeito da fonte visível', visible.id);
    const ownedArea = await area('Efeito da fonte própria', owned.id);
    const unlinkedArea = await area('Efeito independente', null);
    assert.deepEqual(
      [hiddenArea.x, hiddenArea.y, hiddenArea.ancora_dx, hiddenArea.ancora_dy],
      [3, 1, -12, 0],
    );
    const snapshot = async (actor: string) =>
      (
        await f.user(actor, 'SELECT public.ler_mapa_visivel($1,$2) AS result', [
          f.campaign,
          scene.id,
        ])
      )[0].result;
    const direct = (actor: string) =>
      f.user(actor, 'SELECT * FROM public.areas_mapa WHERE cena_id=$1', [scene.id]);
    for (const [role, actor] of [
      ['player', f.player],
      ['following spectator', f.spectator],
    ]) {
      for (const channel of ['snapshot', 'direct SELECT']) {
        await t.test(
          `${role}: ${channel} omits unseen anchors and preserves authorized areas`,
          async () => {
            const current = await snapshot(actor);
            assert(
              current.atual.includes('3,1'),
              'the effect itself covers currently visible space',
            );
            assert(!current.tokens.some((row: any) => row.id === enemy.id));
            const rows = channel === 'snapshot' ? current.areas : await direct(actor);
            assert(
              !rows.some((row: any) => row.id === hiddenArea.id),
              'unseen anchor must not disclose its identity or offsets',
            );
            assert(!JSON.stringify(rows).includes(enemy.id));
            const expected = [visibleArea.id, unlinkedArea.id];
            if (actor === f.player) expected.push(ownedArea.id);
            assert.deepEqual(rows.map((row: any) => row.id).sort(), expected.sort());
          },
        );
      }
    }
    await t.test('DM and owner retain authorized linked-area management', async () => {
      const current = await snapshot(f.gm);
      assert.equal(current.areas.length, 4);
      assert.equal((await direct(f.gm)).length, 4);
      assert.equal(
        (
          await op(f.gm, {
            tipo: 'area_atualizar',
            id: hiddenArea.id,
            versao: hiddenArea.versao,
            patch: { nome: 'Efeito administrado pelo mestre' },
          })
        ).area.token_id,
        enemy.id,
      );
      await snapshot(f.player);
      assert.equal(
        (
          await op(f.player, {
            tipo: 'area_atualizar',
            id: ownedArea.id,
            versao: ownedArea.versao,
            patch: { nome: 'Efeito administrado pelo dono' },
          })
        ).area.token_id,
        owned.id,
      );
    });
    await t.test(
      'a newly visible source reveals its area and losing it clears both read paths',
      async () => {
        let moved = (
          await op(f.gm, {
            tipo: 'token_atualizar',
            id: enemy.id,
            versao: enemy.versao,
            patch: { x: 3 },
          })
        ).token;
        for (const actor of [f.player, f.spectator]) {
          assert((await snapshot(actor)).areas.some((row: any) => row.id === hiddenArea.id));
          assert((await direct(actor)).some((row: any) => row.id === hiddenArea.id));
        }
        moved = (
          await op(f.gm, {
            tipo: 'token_atualizar',
            id: moved.id,
            versao: moved.versao,
            patch: { x: 15 },
          })
        ).token;
        for (const actor of [f.player, f.spectator]) {
          assert(
            !(await direct(actor)).some((row: any) => row.id === hiddenArea.id),
            'stale masks fail closed',
          );
          assert(!(await snapshot(actor)).areas.some((row: any) => row.id === hiddenArea.id));
          assert(!(await direct(actor)).some((row: any) => row.id === hiddenArea.id));
        }
      },
    );
    const rotatedEnemy = await token('Origem secreta girada', 15, { rotacao: 45 });
    let detached = await area('Efeito a desvincular', rotatedEnemy.id, {
      angulo: 37,
      acompanhar_rotacao: true,
    });
    assert.deepEqual(
      [detached.ancora_dx, detached.ancora_dy, detached.ancora_rotacao, detached.ancora_angulo],
      [-12, 0, 45, 37],
    );
    for (const actor of [f.player, f.spectator])
      assert(!(await snapshot(actor)).areas.some((row: any) => row.id === detached.id));
    detached = (
      await op(f.gm, {
        tipo: 'area_atualizar',
        id: detached.id,
        versao: detached.versao,
        patch: { token_id: null },
      })
    ).area;
    for (const [role, actor] of [
      ['player', f.player],
      ['following spectator', f.spectator],
    ]) {
      for (const channel of ['snapshot', 'direct SELECT']) {
        await t.test(
          `${role}: ${channel} shows detached effect without former hidden anchor metadata`,
          async () => {
            const current = await snapshot(actor);
            assert(!current.tokens.some((row: any) => row.id === rotatedEnemy.id));
            const rows = channel === 'snapshot' ? current.areas : await direct(actor);
            assertDetached(rows.find((row: any) => row.id === detached.id));
          },
        );
      }
    }
    await t.test(
      'detach responses are neutral and re-linking preserves DM and owner editing',
      async () => {
        assertDetached(detached);
        let linked = (
          await op(f.gm, {
            tipo: 'area_atualizar',
            id: detached.id,
            versao: detached.versao,
            patch: { token_id: owned.id, acompanhar_rotacao: true },
          })
        ).area;
        assert.deepEqual(
          [
            linked.token_id,
            linked.ancora_dx,
            linked.ancora_dy,
            linked.ancora_rotacao,
            linked.ancora_angulo,
            linked.acompanhar_rotacao,
          ],
          [owned.id, -13, 0, 0, 37, true],
        );
        await snapshot(f.player);
        linked = (
          await op(f.player, {
            tipo: 'area_atualizar',
            id: linked.id,
            versao: linked.versao,
            patch: { angulo: 61 },
          })
        ).area;
        assert.equal(linked.ancora_angulo, 61);
        await snapshot(f.player);
        const independent = (
          await op(f.player, {
            tipo: 'area_atualizar',
            id: linked.id,
            versao: linked.versao,
            patch: { token_id: null },
          })
        ).area;
        assertDetached(independent, [3, 1, 61]);
        assertDetached(
          (
            await op(f.gm, {
              tipo: 'area_atualizar',
              id: independent.id,
              versao: independent.versao,
              patch: { angulo: 80, acompanhar_rotacao: true },
            })
          ).area,
          [3, 1, 80],
        );
      },
    );
  } finally {
    await f.db.close();
  }
});

// Seed stale detached metadata before 018 to exercise the actual migration
// cleanup, then attempt new dirty writes through the centralized row invariant.
test('migration normalizes persisted detached rows and future writes cannot restore anchor metadata', async (t) => {
  const f = await mesaFixture();
  try {
    await f.db.exec(
      await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    const directory = new URL('../supabase/migrations/', import.meta.url);
    const scene = crypto.randomUUID(),
      area = crypto.randomUUID();
    for (const name of (await readdir(directory))
      .filter((name) => /^\d+_.+\.sql$/.test(name) && name > '202610070004_mesa.sql')
      .sort()) {
      if (name === '202610280018_operacoes_mapa.sql') {
        await f.db.query(
          "INSERT INTO public.cenas_mapa(id,campanha_id,nome,largura,altura,publicada,ativa) VALUES($1,$2,'Cena existente',20,20,true,true)",
          [scene, f.campaign],
        );
        const layer = (
          await f.db.query<any>(
            "SELECT id FROM public.camadas_mapa WHERE cena_id=$1 AND finalidade='jogadores'",
            [scene],
          )
        ).rows[0].id;
        await f.db.query(
          "INSERT INTO public.tokens_mapa(campanha_id,cena_id,camada_id,nome,x,y,controlador_id) VALUES($1,$2,$3,'Fonte',1,1,$4)",
          [f.campaign, scene, layer, f.player],
        );
        await f.db.query(
          'INSERT INTO public.atribuicoes_mapa(campanha_id,usuario_id,cena_id,seguir_usuario_id) VALUES($1,$2,$3,$4)',
          [f.campaign, f.spectator, scene, f.player],
        );
        await f.db.query(
          "INSERT INTO public.areas_mapa(id,campanha_id,cena_id,camada_id,usuario_id,nome,forma,x,y,tamanho,angulo,ancora_dx,ancora_dy,ancora_rotacao,ancora_angulo,acompanhar_rotacao) VALUES($1,$2,$3,$4,$5,'Efeito já desvinculado','circulo',3,1,1,37,-12,0,45,37,true)",
          [area, f.campaign, scene, layer, f.gm],
        );
      }
      await f.db.exec(await readFile(new URL(name, directory), 'utf8'));
    }
    for (const [role, actor] of [
      ['player', f.player],
      ['following spectator', f.spectator],
    ]) {
      for (const channel of ['snapshot', 'direct SELECT']) {
        await t.test(`${role}: ${channel} normalizes preexisting detached metadata`, async () => {
          const current = (
            await f.user(actor, 'SELECT public.ler_mapa_visivel($1,$2) AS result', [
              f.campaign,
              scene,
            ])
          )[0].result;
          const rows =
            channel === 'snapshot'
              ? current.areas
              : await f.user(actor, 'SELECT * FROM public.areas_mapa WHERE id=$1', [area]);
          assertDetached(rows.find((row: any) => row.id === area));
        });
      }
    }
    await t.test('future direct INSERT and UPDATE normalize all obsolete fields', async () => {
      const original = (
        await f.db.query<any>('SELECT * FROM public.areas_mapa WHERE id=$1', [area])
      ).rows[0];
      const dirty = {
        ...original,
        id: crypto.randomUUID(),
        ancora_dx: -12,
        ancora_dy: 0,
        ancora_rotacao: 45,
        ancora_angulo: 37,
        acompanhar_rotacao: true,
      };
      const inserted = (
        await f.db.query<any>(
          'INSERT INTO public.areas_mapa SELECT * FROM jsonb_populate_record(NULL::public.areas_mapa,$1) RETURNING *',
          [dirty],
        )
      ).rows[0];
      assertDetached(inserted);
      const updated = (
        await f.db.query<any>(
          'UPDATE public.areas_mapa SET ancora_dx=-9,ancora_dy=4,ancora_rotacao=90,ancora_angulo=55,acompanhar_rotacao=true WHERE id=$1 RETURNING *',
          [area],
        )
      ).rows[0];
      assertDetached(updated);
    });
  } finally {
    await f.db.close();
  }
});
