import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
import { anchoredArea } from '../apps/web/features/tabletop/SceneEntities';
async function fixture(upgrade = true) {
  const f = await mesaFixture();
  await f.db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
  const migrate = async (names: string[]) => {
    for (const name of names)
      await f.db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
  };
  await migrate(['202610110006_mesa_virtual.sql', '202610110007_agilidade.sql']);
  const finish = () => migrate(['202610280017_visao_mapa.sql', '202610280018_operacoes_mapa.sql']);
  if (upgrade) await finish();
  const op = async (uid: string, command: any, pedido = crypto.randomUUID()) =>
    (
      await f.user(uid, 'select public.operar_mapa($1,$2,$3) result', [f.campaign, pedido, command])
    )[0].result;
  const scene = async () =>
    (
      await op(f.gm, {
        tipo: 'cena_criar',
        nome: 'Pequena',
        largura: 10,
        altura: 8,
        publicada: true,
      })
    ).cena;
  return { ...f, op, scene, finish };
}
test('I1 anchors clamp translation and rotation to actual scene bounds in SQL and local preview', async () => {
  const f = await fixture();
  try {
    const c = await f.scene();
    let t = (
      await f.op(f.gm, {
        tipo: 'token_criar',
        cena_id: c.id,
        nome: 'Fonte',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: f.sheet,
      })
    ).token;
    let a = (
      await f.op(f.gm, {
        tipo: 'area_criar',
        cena_id: c.id,
        nome: 'Âncora',
        forma: 'cone',
        x: 9,
        y: 7,
        tamanho: 2,
        cor: '#ffffff',
        token_id: t.id,
        acompanhar_rotacao: true,
      })
    ).area;
    const initial = a;
    t = (
      await f.op(f.gm, {
        tipo: 'token_atualizar',
        id: t.id,
        versao: t.versao,
        patch: { x: 9, y: 7 },
      })
    ).token;
    a = (await f.db.query<any>('select * from public.areas_mapa where id=$1', [a.id])).rows[0];
    assert.deepEqual([Number(a.x), Number(a.y)], [10, 8]);
    assert.deepEqual([anchoredArea(initial, [t], c).x, anchoredArea(initial, [t], c).y], [10, 8]);
    t = (
      await f.op(f.gm, {
        tipo: 'token_atualizar',
        id: t.id,
        versao: t.versao,
        patch: { rotacao: 90 },
      })
    ).token;
    a = (await f.db.query<any>('select * from public.areas_mapa where id=$1', [a.id])).rows[0];
    const preview = anchoredArea(initial, [t], c);
    assert(Math.abs(Number(a.x) - preview.x) < 1e-8);
    assert(Math.abs(Number(a.y) - preview.y) < 1e-8);
    assert.equal(Number(a.y), 8);
    assert.equal(preview.angulo, Number(a.angulo));
    t = (
      await f.op(f.gm, {
        tipo: 'token_atualizar',
        id: t.id,
        versao: t.versao,
        patch: { x: 1, y: 1, rotacao: 180 },
      })
    ).token;
    a = (await f.db.query<any>('select * from public.areas_mapa where id=$1', [a.id])).rows[0];
    const lower = anchoredArea(initial, [t], c);
    assert.deepEqual([Number(a.x), Number(a.y), lower.x, lower.y], [0, 0, 0, 0]);
    assert.equal(lower.angulo, Number(a.angulo));
    await f.op(f.gm, {
      tipo: 'cena_atualizar',
      id: c.id,
      versao: c.versao,
      patch: { nome: 'Continua válida' },
    });
  } finally {
    await f.db.close();
  }
});
test('I2 stable seeded layer identity survives rename and duplicate display names', async () => {
  const f = await fixture();
  try {
    const c = await f.scene();
    const layers = (
      await f.db.query<any>('select * from public.camadas_mapa where cena_id=$1', [c.id])
    ).rows;
    const players = layers.find((l) => l.nome === 'Jogadores'),
      map = layers.find((l) => l.nome === 'Mapa');
    await f.op(f.gm, {
      tipo: 'camada_atualizar',
      id: players.id,
      versao: 1,
      patch: { nome: 'Heróis' },
    });
    await f.op(f.gm, {
      tipo: 'camada_atualizar',
      id: map.id,
      versao: 1,
      patch: { nome: 'Cenário' },
    });
    await f.op(f.gm, {
      tipo: 'camada_criar',
      cena_id: c.id,
      nome: 'Jogadores',
      ordem: -1,
      visivel: false,
    });
    await f.op(f.gm, {
      tipo: 'camada_criar',
      cena_id: c.id,
      nome: 'Mapa',
      ordem: -1,
      visivel: false,
    });
    const t = (
      await f.op(f.player, {
        tipo: 'token_criar',
        cena_id: c.id,
        nome: 'Meu',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: f.sheet,
      })
    ).token;
    assert.equal(t.camada_id, players.id);
    const a = (
      await f.op(f.player, {
        tipo: 'area_criar',
        cena_id: c.id,
        nome: 'Minha',
        forma: 'circulo',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).area;
    assert.equal(a.camada_id, players.id);
    await f.op(f.gm, {
      tipo: 'cena_atualizar',
      id: c.id,
      versao: c.versao,
      patch: {
        desenhos: [
          {
            id: 'legado',
            cor: '#ffffff',
            pontos: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
          },
        ],
      },
    });
    const obj = (
      await f.db.query<any>('select * from public.objetos_mapa where cena_id=$1', [c.id])
    ).rows[0];
    assert.equal(obj.camada_id, map.id);
    assert.deepEqual(
      (await f.db.query<any>('select desenhos from public.cenas_mapa where id=$1', [c.id])).rows[0]
        .desenhos,
      [],
    );
  } finally {
    await f.db.close();
  }
});
test('I3 drawing translation/scaling updates stored stroke geometry and current visibility', async () => {
  const f = await fixture();
  try {
    const c = await f.scene();
    const layer = (
      await f.db.query<any>("select id from public.camadas_mapa where cena_id=$1 and nome='Mapa'", [
        c.id,
      ])
    ).rows[0].id;
    await f.op(f.gm, {
      tipo: 'token_criar',
      cena_id: c.id,
      nome: 'Fonte',
      x: 1,
      y: 1,
      tamanho: 1,
      cor: '#ffffff',
      ficha_id: f.sheet,
      alcance_visao: 0,
    });
    const object = (
      await f.op(f.gm, {
        tipo: 'objeto_criar',
        cena_id: c.id,
        camada_id: layer,
        nome: 'Traço',
        x: 1,
        y: 1,
        w: 2,
        h: 2,
        imagem_id: null,
        desenho: {
          id: 'traco',
          cor: '#ffffff',
          pontos: [
            { x: 1, y: 1 },
            { x: 3, y: 3 },
          ],
        },
        oculto: false,
      })
    ).objeto;
    const snap = async () =>
      (
        await f.user(f.player, 'select public.ler_mapa_visivel($1,$2) result', [f.campaign, c.id])
      )[0].result;
    assert.equal((await snap()).objetos.length, 1);
    const moved = (
      await f.op(f.gm, {
        tipo: 'objeto_atualizar',
        id: object.id,
        versao: object.versao,
        patch: { x: 5, y: 4, w: 4, h: 2 },
      })
    ).objeto;
    assert.deepEqual(moved.desenho.pontos, [
      { x: 5, y: 4 },
      { x: 9, y: 6 },
    ]);
    assert.equal((await snap()).objetos.length, 0);
    const back = (
      await f.op(f.gm, {
        tipo: 'objeto_atualizar',
        id: object.id,
        versao: moved.versao,
        patch: { x: 1, y: 1, w: 2, h: 2 },
      })
    ).objeto;
    assert.deepEqual(back.desenho.pontos, object.desenho.pontos);
    assert.equal((await snap()).objetos.length, 1);
  } finally {
    await f.db.close();
  }
});
test('I4 locked source layer blocks player area update/delete and escape to unlocked layer', async () => {
  const f = await fixture();
  try {
    const c = await f.scene();
    await f.op(f.gm, {
      tipo: 'cena_atualizar',
      id: c.id,
      versao: c.versao,
      patch: { modo_visao: 'manual' },
    });
    const a = (
      await f.op(f.player, {
        tipo: 'area_criar',
        cena_id: c.id,
        nome: 'Minha',
        forma: 'circulo',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).area;
    const other = (await f.op(f.gm, { tipo: 'camada_criar', cena_id: c.id, nome: 'Outra' })).camada;
    await f.op(f.gm, {
      tipo: 'camada_atualizar',
      id: a.camada_id,
      versao: 1,
      patch: { bloqueada: true },
    });
    for (const command of [
      { tipo: 'area_excluir', id: a.id, versao: a.versao },
      { tipo: 'area_atualizar', id: a.id, versao: a.versao, patch: { camada_id: other.id } },
    ])
      await assert.rejects(f.op(f.player, command), { code: 'WV002' });
    assert.equal(
      (await f.db.query<any>('select camada_id from public.areas_mapa where id=$1', [a.id])).rows[0]
        .camada_id,
      a.camada_id,
    );
  } finally {
    await f.db.close();
  }
});
test('I5 pre-upgrade deletion retries remain ID-only, recheck current roles and recover scene context', async () => {
  const f = await fixture(false);
  try {
    const c = await f.scene();
    const t = (
      await f.op(f.gm, {
        tipo: 'token_criar',
        cena_id: c.id,
        nome: 'Antigo',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).token;
    const a = (
      await f.op(f.player, {
        tipo: 'area_criar',
        cena_id: c.id,
        nome: 'Antiga',
        forma: 'circulo',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).area;
    const tokenCommand = { tipo: 'token_excluir', id: t.id, versao: 1 },
      areaCommand = { tipo: 'area_excluir', id: a.id, versao: 1 };
    const tp = crypto.randomUUID(),
      ap = crypto.randomUUID();
    const tr = await f.op(f.gm, tokenCommand, tp),
      ar = await f.op(f.player, areaCommand, ap);
    await f.finish();
    assert.deepEqual(await f.op(f.gm, tokenCommand, tp), tr);
    assert.deepEqual(await f.op(f.player, areaCommand, ap), ar);
    const context = (
      await f.db.query<any>('select cena_id from private.operacoes_mapa where pedido_id=$1', [ap])
    ).rows[0];
    assert.equal(context.cena_id, c.id);
    await f.db.query(
      "update public.membros_campanha set papel='espectador' where campanha_id=$1 and usuario_id=$2",
      [f.campaign, f.player],
    );
    await assert.rejects(f.op(f.player, areaCommand, ap), { code: 'WV002' });
    await f.db.query(
      "update public.membros_campanha set papel='jogador' where campanha_id=$1 and usuario_id=$2",
      [f.campaign, f.gm],
    );
    await assert.rejects(f.op(f.gm, tokenCommand, tp), { code: 'WV002' });
  } finally {
    await f.db.close();
  }
});
test('M1 exploration reset sends content-free recipient invalidation', async () => {
  const f = await fixture();
  try {
    const c = await f.scene();
    const rev = async () =>
      (
        await f.db.query<any>(
          'select revisao from public.invalidacoes_mapa where campanha_id=$1 and usuario_id=$2',
          [f.campaign, f.player],
        )
      ).rows[0].revisao;
    const before = Number(await rev());
    await f.op(f.gm, { tipo: 'exploracao_limpar', cena_id: c.id });
    assert(Number(await rev()) > before);
  } finally {
    await f.db.close();
  }
});
test('M2 legacy drawings reconcile edits/removals and clear uses atomic object versions without private collateral', async () => {
  const f = await fixture();
  try {
    let c = await f.scene();
    const layers = (
      await f.db.query<any>('select * from public.camadas_mapa where cena_id=$1', [c.id])
    ).rows;
    const layer = layers.find((l) => l.nome === 'Mapa').id,
      secret = layers.find((l) => l.nome === 'Mestre').id;
    const draw = (x: number) => ({
      id: 'legado',
      cor: '#ffffff',
      pontos: [
        { x, y: 1 },
        { x: x + 1, y: 2 },
      ],
    });
    c = (
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { desenhos: [draw(1)] },
      })
    ).cena;
    c = (
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { nome: 'Não apagar' },
      })
    ).cena;
    assert.equal(
      (await f.db.query<any>('select id from public.objetos_mapa where cena_id=$1', [c.id])).rows
        .length,
      1,
    );
    c = (
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { desenhos: [draw(3)] },
      })
    ).cena;
    assert.deepEqual(
      (await f.db.query<any>('select desenho from public.objetos_mapa where cena_id=$1', [c.id]))
        .rows[0].desenho.pontos,
      draw(3).pontos,
    );
    const add = async (id: string, camada: string) =>
      (
        await f.op(f.gm, {
          tipo: 'objeto_criar',
          cena_id: c.id,
          camada_id: camada,
          nome: id,
          x: 1,
          y: 1,
          w: 1,
          h: 1,
          imagem_id: null,
          desenho: { ...draw(1), id },
          oculto: false,
        })
      ).objeto;
    const privateObject = await add('privado', secret),
      fresh = await add('novo', layer);
    c = (
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { desenhos: [] },
      })
    ).cena;
    assert.deepEqual(
      (
        await f.db.query<any>('select id from public.objetos_mapa where cena_id=$1 order by nome', [
          c.id,
        ])
      ).rows.map((o) => o.id),
      [fresh.id, privateObject.id],
    );
    await assert.rejects(
      f.op(f.gm, { tipo: 'desenhos_limpar', cena_id: c.id, itens: [{ id: fresh.id, versao: 99 }] }),
      { code: 'WV001' },
    );
    // Failure after a valid first member must roll the whole clear back.
    await assert.rejects(
      f.op(f.gm, {
        tipo: 'desenhos_limpar',
        cena_id: c.id,
        itens: [
          { id: fresh.id, versao: 1 },
          { id: privateObject.id, versao: 1 },
        ],
      }),
      { code: 'WV001' },
    );
    assert.equal(
      (await f.db.query<any>('select id from public.objetos_mapa where id=$1', [fresh.id])).rows
        .length,
      1,
    );
    await f.op(f.gm, {
      tipo: 'desenhos_limpar',
      cena_id: c.id,
      itens: [{ id: fresh.id, versao: 1 }],
    });
    assert.deepEqual(
      (
        await f.db.query<any>('select id from public.objetos_mapa where cena_id=$1', [c.id])
      ).rows.map((o) => o.id),
      [privateObject.id],
    );
  } finally {
    await f.db.close();
  }
});

test('R1 sequential legacy appends from returned empty scenes preserve earlier strokes', async () => {
  const f = await fixture();
  try {
    let c = await f.scene();
    const stroke = (id: string, x: number) => ({
      id,
      cor: '#ffffff',
      pontos: [
        { x, y: 1 },
        { x: x + 1, y: 2 },
      ],
    });
    for (const drawing of [stroke('A', 1), stroke('B', 3)]) {
      c = (
        await f.op(f.gm, {
          tipo: 'cena_atualizar',
          id: c.id,
          versao: c.versao,
          patch: { desenhos: [...c.desenhos, drawing] },
        })
      ).cena;
      assert.deepEqual(c.desenhos, []);
    }
    const drawings = async () =>
      (
        await f.db.query<any>(
          'select origem_desenho,desenho from public.objetos_mapa where cena_id=$1 order by origem_desenho',
          [c.id],
        )
      ).rows;
    assert.deepEqual(
      (await drawings()).map((o) => o.origem_desenho),
      ['A', 'B'],
    );
    c = (
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { desenhos: [stroke('B', 5)] },
      })
    ).cena;
    assert.deepEqual(
      (await drawings()).map((o) => o.desenho),
      [stroke('A', 1), stroke('B', 5)],
    );
    await f.op(f.gm, {
      tipo: 'cena_atualizar',
      id: c.id,
      versao: c.versao,
      patch: { desenhos: [] },
    });
    assert.deepEqual(await drawings(), []);
  } finally {
    await f.db.close();
  }
});

for (const protection of ['hidden', 'private-layer'] as const) {
  test(`R2 stale legacy lists preserve ${protection} identities without a public clone`, async () => {
    const f = await fixture();
    try {
      let c = await f.scene();
      c = (
        await f.op(f.gm, {
          tipo: 'cena_atualizar',
          id: c.id,
          versao: c.versao,
          patch: { modo_visao: 'manual' },
        })
      ).cena;
      const stroke = (id: string, x: number) => ({
        id,
        cor: '#ffffff',
        pontos: [
          { x, y: 1 },
          { x: x + 1, y: 2 },
        ],
      });
      const b = stroke('B', 1),
        next = stroke('C', 5);
      c = (
        await f.op(f.gm, {
          tipo: 'cena_atualizar',
          id: c.id,
          versao: c.versao,
          patch: { desenhos: [b] },
        })
      ).cena;
      const object = (
        await f.db.query<any>('select * from public.objetos_mapa where cena_id=$1', [c.id])
      ).rows[0];
      if (protection === 'hidden') {
        await f.op(f.gm, {
          tipo: 'objeto_atualizar',
          id: object.id,
          versao: object.versao,
          patch: { oculto: true },
        });
      } else {
        const layer = (
          await f.db.query<any>(
            "select id from public.camadas_mapa where cena_id=$1 and finalidade='mestre'",
            [c.id],
          )
        ).rows[0].id;
        await f.op(f.gm, {
          tipo: 'camada_transferir',
          cena_id: c.id,
          camada_id: layer,
          itens: [{ tipo: 'objeto', id: object.id, versao: object.versao }],
        });
      }
      const protectedRow = (
        await f.db.query<any>('select * from public.objetos_mapa where id=$1', [object.id])
      ).rows[0];
      // This old client still holds B and the current scene version from before protection.
      c = (
        await f.op(f.gm, {
          tipo: 'cena_atualizar',
          id: c.id,
          versao: c.versao,
          patch: { desenhos: [stroke('B', 3), next] },
        })
      ).cena;
      assert.deepEqual(
        (
          await f.user(
            f.player,
            'select origem_desenho from public.objetos_mapa where cena_id=$1 order by origem_desenho',
            [c.id],
          )
        ).map((o) => o.origem_desenho),
        ['C'],
      );
      const rows = (
        await f.db.query<any>(
          "select * from public.objetos_mapa where cena_id=$1 and origem_desenho='B'",
          [c.id],
        )
      ).rows;
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], protectedRow);
      await f.op(f.gm, {
        tipo: 'cena_atualizar',
        id: c.id,
        versao: c.versao,
        patch: { desenhos: [] },
      });
      assert.deepEqual(
        (
          await f.db.query<any>('select id from public.objetos_mapa where cena_id=$1', [c.id])
        ).rows.map((o) => o.id),
        [object.id],
      );
      assert.deepEqual(
        await f.user(f.player, 'select id from public.objetos_mapa where cena_id=$1', [c.id]),
        [],
      );
    } finally {
      await f.db.close();
    }
  });
}
