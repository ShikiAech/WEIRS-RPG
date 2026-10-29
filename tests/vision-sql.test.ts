import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
test('authoritative snapshots, walls, locked sight, assignments, atomic player control and stale masks', async () => {
  const f = await mesaFixture();
  const { db, user, gm, player, spectator, campaign, sheet } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610280017_visao_mapa.sql',
      '202610280018_operacoes_mapa.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const op = async (uid: string, c: unknown, p = crypto.randomUUID()) =>
      (await user(uid, 'select public.operar_mapa($1,$2,$3) result', [campaign, p, c]))[0].result;
    const snap = async (uid: string, id: string) =>
      (await user(uid, 'select public.ler_mapa_visivel($1,$2) result', [campaign, id]))[0].result;
    let scene = (
      await op(gm, { tipo: 'cena_criar', nome: 'Visão', largura: 10, altura: 10, publicada: true })
    ).cena;
    assert.equal(scene.modo_visao, 'automatica');
    let own = (
      await op(player, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Meu token',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: sheet,
      })
    ).token;
    const enemy = (
      await op(gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Segredo',
        x: 8,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).token;
    const wall = (
      await op(gm, {
        tipo: 'parede_criar',
        cena_id: scene.id,
        x1: 4,
        y1: 0,
        x2: 4,
        y2: 10,
        porta: true,
        aberta: false,
      })
    ).parede;
    assert.deepEqual(
      await user(player, 'select id from public.tokens_mapa where id=$1', [enemy.id]),
      [],
    );
    let s = await snap(player, scene.id);
    assert.equal(
      s.tokens.some((t: any) => t.id === enemy.id),
      false,
    );
    assert(s.atual.includes('1,1'));
    assert(!s.atual.includes('8,1'));
    own = (
      await op(gm, {
        tipo: 'token_atualizar',
        id: own.id,
        versao: own.versao,
        patch: { bloqueado: true },
      })
    ).token;
    s = await snap(player, scene.id);
    assert(s.atual.includes('1,1'), 'locked token retains sight');
    await assert.rejects(
      op(player, {
        tipo: 'tokens_lote',
        cena_id: scene.id,
        itens: [{ tipo: 'token_atualizar', id: own.id, versao: own.versao, patch: { x: 2 } }],
      }),
      { code: 'WV002' },
    );
    await op(gm, {
      tipo: 'parede_atualizar',
      id: wall.id,
      versao: wall.versao,
      patch: { aberta: true },
    });
    s = await snap(player, scene.id);
    assert(s.tokens.some((t: any) => t.id === enemy.id));
    await op(gm, {
      tipo: 'parede_atualizar',
      id: wall.id,
      versao: wall.versao + 1,
      patch: { aberta: false },
    });
    assert.deepEqual(
      await user(player, 'select id from public.tokens_mapa where id=$1', [enemy.id]),
      [],
      'old visibility fails closed',
    );
    s = await snap(player, scene.id);
    assert(s.explorada.includes('8,1'));
    assert(!s.atual.includes('8,1'));
    assert.equal((await snap(spectator, scene.id)).atual.length, 0);
    await op(gm, {
      tipo: 'cena_atribuir',
      cena_id: scene.id,
      usuarios: [spectator],
      seguir_usuario_id: player,
    });
    assert((await snap(spectator, scene.id)).atual.includes('1,1'));
    const layer = s.camadas.find((l: any) => l.nome === 'Jogadores');
    await op(gm, {
      tipo: 'camada_atualizar',
      id: layer.id,
      versao: layer.versao,
      patch: { visivel: false },
    });
    assert.equal((await snap(player, scene.id)).tokens.length, 0);
    await assert.rejects(
      op(player, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Forjado',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: sheet,
        controlador_id: gm,
      }),
      { code: 'WV002' },
    );
  } finally {
    await db.close();
  }
});
test('atomic controlled groups reject stale/foreign members; private assets, receipt replay, assignments and revocation', async () => {
  const f = await mesaFixture();
  const { db, user, gm, player, spectator, outsider, campaign, sheet } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610280017_visao_mapa.sql',
      '202610280018_operacoes_mapa.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const op = async (uid: string, c: unknown, p = crypto.randomUUID()) =>
      (await user(uid, 'select public.operar_mapa($1,$2,$3) result', [campaign, p, c]))[0].result;
    const snap = async (uid: string, id: string) =>
      (await user(uid, 'select public.ler_mapa_visivel($1,$2) result', [campaign, id]))[0].result;
    const scene = (
      await op(gm, { tipo: 'cena_criar', nome: 'Teste', largura: 12, altura: 12, publicada: true })
    ).cena;
    const token = async (name: string) =>
      (
        await op(player, {
          tipo: 'token_criar',
          cena_id: scene.id,
          nome: name,
          x: 1,
          y: 1,
          tamanho: 1,
          cor: '#ffffff',
          ficha_id: sheet,
        })
      ).token;
    const a = await token('A'),
      b = await token('B');
    const enemy = (
      await op(gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Inimigo',
        x: 7,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).token;
    const batch = (items: any[]) => ({
      tipo: 'tokens_lote',
      cena_id: scene.id,
      itens: items.map((t) => ({
        tipo: 'token_atualizar',
        id: t.id,
        versao: t.versao,
        patch: { x: 3 },
      })),
    });
    await assert.rejects(op(player, batch([a, enemy])), { code: 'WV002' });
    assert.equal(
      (await db.query<any>('select x from public.tokens_mapa where id=$1', [a.id])).rows[0].x,
      '1',
    );
    await assert.rejects(op(player, batch([a, { ...b, versao: 9 }])), { code: 'WV001' });
    let moved = await op(player, batch([a, b]));
    assert.equal(moved.tokens.length, 2);
    await assert.rejects(
      op(player, {
        tipo: 'tokens_duplicar',
        cena_id: scene.id,
        tokens: [{ id: a.id, versao: 2 }],
        dx: 1,
        dy: 0,
      }),
      { code: 'WV002' },
    );
    const receipt = crypto.randomUUID();
    const command = { tipo: 'token_atualizar', id: a.id, versao: 2, patch: { y: 2 } };
    const response = await op(player, command, receipt);
    assert.deepEqual(await op(player, command, receipt), response);
    let s = await snap(gm, scene.id);
    const privateLayer = s.camadas.find((l: any) => l.nome === 'Mestre');
    await op(gm, {
      tipo: 'camada_transferir',
      cena_id: scene.id,
      camada_id: privateLayer.id,
      itens: [{ tipo: 'token', id: a.id, versao: 3 }],
    });
    await assert.rejects(op(player, command, receipt), { code: 'WV002' });
    assert.deepEqual(
      await user(player, 'select id from public.tokens_mapa where id=$1', [a.id]),
      [],
    );
    const asset = crypto.randomUUID();
    await db.query(
      "insert into public.arquivos_mapa(id,campanha_id,usuario_id,nome,caminho,mime,tamanho,visibilidade,estado) values($1,$2,$3,'Imagem',$4,'image/png',1,'campanha','pronto')",
      [asset, campaign, gm, `${campaign}/${asset}`],
    );
    await op(gm, { tipo: 'token_atualizar', id: a.id, versao: 4, patch: { imagem_id: asset } });
    assert.deepEqual(
      await user(player, 'select id from public.arquivos_mapa where id=$1', [asset]),
      [],
    );
    assert.equal(
      (
        await user(player, "select private.arquivo_storage($1,'ler') allowed", [
          `${campaign}/${asset}`,
        ])
      )[0].allowed,
      false,
    );
    const second = (
      await op(gm, {
        tipo: 'cena_criar',
        nome: 'Outra cena',
        largura: 12,
        altura: 12,
        publicada: true,
      })
    ).cena;
    await op(gm, { tipo: 'cena_atribuir', cena_id: second.id, usuarios: [player] });
    assert.deepEqual(
      (await user(player, 'select id from public.cenas_mapa')).map((r: any) => r.id),
      [second.id],
    );
    await assert.rejects(snap(player, scene.id), { code: 'WV002' });
    await assert.rejects(
      op(player, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Invadir',
        x: 0,
        y: 0,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: sheet,
      }),
      { code: 'WV002' },
    );
    await assert.rejects(
      user(player, 'select public.marcar_mapa($1,$2,1,1)', [campaign, scene.id]),
      { code: 'WV002' },
    );
    await db.query('delete from public.membros_campanha where campanha_id=$1 and usuario_id=$2', [
      campaign,
      player,
    ]);
    assert.deepEqual(await user(player, 'select * from public.cenas_mapa'), []);
    assert.equal(
      (await user(player, 'select * from public.invalidacoes_mapa')).length,
      1,
      'revoked recipient still receives content-free invalidation',
    );
    assert.deepEqual(await user(outsider, 'select * from public.invalidacoes_mapa'), []);
    await assert.rejects(
      user(player, 'select private.operar_mapa_base($1,$2,$3)', [
        campaign,
        crypto.randomUUID(),
        command,
      ]),
      { code: '42501' },
    );
    await assert.rejects(
      user(player, 'select private.arquivo_storage_anterior($1,$2)', [
        `${campaign}/${asset}`,
        'ler',
      ]),
      { code: '42501' },
    );
  } finally {
    await db.close();
  }
});
import {
  segmentsIntersect,
  visibleCells,
  areaCoversCell,
} from '../packages/tabletop/vision-geometry';
test('shared TS/SQL endpoint and coverage fixtures, translation anchors, resized exploration and maximum-scene benchmark', async (t) => {
  const f = await mesaFixture();
  const { db, user, gm, player, campaign, sheet } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610280017_visao_mapa.sql',
      '202610280018_operacoes_mapa.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    for (const coords of [
      [0, 0, 2, 0, 1, 0, 3, 0],
      [0, 0, 2, 2, 1, 1, 1, 2],
      [0, 0, 2, 2, 0, 1, 1, 0],
      [0, 0, 2, 2, 2, 2, 3, 2],
      [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4],
    ]) {
      const sql = (
        await db.query<any>(
          'select private.segmentos_intersectam($1,$2,$3,$4,$5,$6,$7,$8) result',
          coords,
        )
      ).rows[0].result;
      assert.equal(
        sql,
        segmentsIntersect(
          { x: coords[0], y: coords[1] },
          { x: coords[2], y: coords[3] },
          { x: coords[4], y: coords[5] },
          { x: coords[6], y: coords[7] },
        ),
      );
    }
    for (const forma of ['circulo', 'cone', 'quadrado', 'linha'])
      for (const angulo of [0, 45, 90]) {
        const area = { forma, x: 2, y: 2, tamanho: 0.75, largura: 0.5, angulo };
        for (const [x, y] of [
          [1, 1],
          [2, 2],
          [3, 1],
          [0, 0],
        ]) {
          const sql = (
            await db.query<any>(
              'select private.area_cobre(jsonb_populate_record(NULL::public.areas_mapa,$1),$2,$3) result',
              [area, x + 0.5, y + 0.5],
            )
          ).rows[0].result;
          assert.equal(sql, areaCoversCell(area, x, y), `${forma}/${angulo}/${x}/${y}`);
        }
      }
    const op = async (c: unknown) =>
      (
        await user(gm, 'select public.operar_mapa($1,$2,$3) result', [
          campaign,
          crypto.randomUUID(),
          c,
        ])
      )[0].result;
    const scene = (
      await op({
        tipo: 'cena_criar',
        nome: 'Cem por cem',
        largura: 100,
        altura: 100,
        publicada: true,
      })
    ).cena;
    const layer = (
      await db.query<any>(
        "select id from public.camadas_mapa where cena_id=$1 and nome='Jogadores'",
        [scene.id],
      )
    ).rows[0].id;
    for (let i = 0; i < 8; i++)
      await db.query(
        'insert into public.tokens_mapa(campanha_id,cena_id,camada_id,nome,x,y,ficha_id,alcance_visao) values($1,$2,$3,$4,$5,$6,$7,120)',
        [
          campaign,
          scene.id,
          layer,
          `Fonte ${i}`,
          5 + (i % 4) * 22,
          5 + Math.floor(i / 4) * 45,
          sheet,
        ],
      );
    for (let i = 0; i < 40; i++)
      await db.query(
        'insert into public.paredes_mapa(campanha_id,cena_id,x1,y1,x2,y2) values($1,$2,$3,$4,$3,$5)',
        [
          campaign,
          scene.id,
          10 + (i % 10) * 9,
          Math.floor(i / 10) * 25,
          Math.floor(i / 10) * 25 + 10,
        ],
      );
    const begin = performance.now();
    const snap = (
      await user(player, 'select public.ler_mapa_visivel($1,$2) result', [campaign, scene.id])
    )[0].result;
    const sqlMs = performance.now() - begin;
    const tokenRows = (
      await db.query<any>('select * from public.tokens_mapa where cena_id=$1', [scene.id])
    ).rows;
    const wallRows = (
      await db.query<any>('select * from public.paredes_mapa where cena_id=$1', [scene.id])
    ).rows.map((w) => ({
      ...w,
      x1: Number(w.x1),
      y1: Number(w.y1),
      x2: Number(w.x2),
      y2: Number(w.y2),
    }));
    const jsStart = performance.now();
    const mask = visibleCells(
      100,
      100,
      5,
      tokenRows.map((s) => ({ x: Number(s.x) + 0.5, y: Number(s.y) + 0.5, range: 120 })),
      wallRows,
    );
    const jsMs = performance.now() - jsStart;
    assert.deepEqual(snap.atual, mask);
    t.diagnostic(
      `100×100; 8 sources, 120ft; 40 walls: SQL ${sqlMs.toFixed(1)}ms, TS ${jsMs.toFixed(1)}ms; ${mask.length} current cells`,
    );
    const source = tokenRows[0];
    const area = (
      await op({
        tipo: 'area_criar',
        cena_id: scene.id,
        nome: 'Âncora',
        forma: 'circulo',
        x: Number(source.x) + 1,
        y: Number(source.y) + 2,
        tamanho: 1,
        cor: '#ffffff',
        token_id: source.id,
      })
    ).area;
    const moved = (
      await op({
        tipo: 'token_atualizar',
        id: source.id,
        versao: source.versao,
        patch: { x: Number(source.x) + 1, rotacao: 90 },
      })
    ).token;
    const anchored = (await db.query<any>('select * from public.areas_mapa where id=$1', [area.id]))
      .rows[0];
    assert.equal(Number(anchored.x), area.x + 1);
    assert.equal(Number(anchored.angulo), 0);
    await op({
      tipo: 'area_atualizar',
      id: area.id,
      versao: anchored.versao,
      patch: { acompanhar_rotacao: true },
    });
    await op({
      tipo: 'token_atualizar',
      id: source.id,
      versao: moved.versao,
      patch: { rotacao: 180 },
    });
    const rotated = (await db.query<any>('select * from public.areas_mapa where id=$1', [area.id]))
      .rows[0];
    assert.equal(Number(rotated.angulo), 90);
    await db.query('update public.cenas_mapa set largura=99 where id=$1', [scene.id]);
    const resized = (
      await user(player, 'select public.ler_mapa_visivel($1,$2) result', [campaign, scene.id])
    )[0].result;
    assert(resized.explorada.every((v: string) => Number(v.split(',')[0]) < 99));
    assert(resized.explorada.includes('5,5'));
  } finally {
    await db.close();
  }
});
test('storage upload/finalize/delete remains authorized after legacy helper revocation', async () => {
  const f = await mesaFixture();
  const { db, user, player, campaign } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610280017_visao_mapa.sql',
      '202610280018_operacoes_mapa.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const op = async (c: unknown) =>
      (
        await user(player, 'select public.operar_mapa($1,$2,$3) result', [
          campaign,
          crypto.randomUUID(),
          c,
        ])
      )[0].result;
    const id = crypto.randomUUID(),
      path = `${campaign}/${id}`;
    await op({
      tipo: 'arquivo_registrar',
      id,
      nome: 'Imagem',
      mime: 'image/png',
      tamanho: 10,
      visibilidade: 'campanha',
    });
    await user(
      player,
      "insert into storage.objects(bucket_id,name,metadata) values('weirs-mesa',$1,$2)",
      [path, { mimetype: 'image/png', size: 10 }],
    );
    await op({ tipo: 'arquivo_finalizar', id });
    assert.equal((await user(player, 'select name from storage.objects')).length, 1);
    await op({ tipo: 'arquivo_preparar_exclusao', id });
    await user(player, 'delete from storage.objects where name=$1', [path]);
    await op({ tipo: 'arquivo_excluir', id });
    assert.deepEqual(await user(player, 'select id from public.arquivos_mapa'), []);
  } finally {
    await db.close();
  }
});
test('placed drawings are explicit rows, whole unseen objects are absent, transfers atomic and scenes delete compatibly', async () => {
  const f = await mesaFixture();
  const { db, user, gm, player, campaign, sheet } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610280017_visao_mapa.sql',
      '202610280018_operacoes_mapa.sql',
    ])
      await db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const op = async (c: unknown) =>
      (
        await user(gm, 'select public.operar_mapa($1,$2,$3) result', [
          campaign,
          crypto.randomUUID(),
          c,
        ])
      )[0].result;
    const scene = (
      await op({ tipo: 'cena_criar', nome: 'Objetos', largura: 12, altura: 12, publicada: true })
    ).cena;
    const layers = (
      await db.query<any>('select * from public.camadas_mapa where cena_id=$1', [scene.id])
    ).rows;
    const shared = layers.find((l) => l.nome === 'Jogadores'),
      secret = layers.find((l) => l.nome === 'Mestre');
    const own = (
      await op({
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Fonte',
        x: 1,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: sheet,
        alcance_visao: 5,
      })
    ).token;
    const drawing = {
      id: 'linha',
      cor: '#ffffff',
      pontos: [
        { x: 8, y: 8 },
        { x: 10, y: 10 },
      ],
    };
    const object = (
      await op({
        tipo: 'objeto_criar',
        cena_id: scene.id,
        camada_id: shared.id,
        nome: 'Desenho distante',
        x: 8,
        y: 8,
        w: 2,
        h: 2,
        desenho: drawing,
        imagem_id: null,
        oculto: false,
      })
    ).objeto;
    const snap = async () =>
      (await user(player, 'select public.ler_mapa_visivel($1,$2) result', [campaign, scene.id]))[0]
        .result;
    assert.equal((await snap()).objetos.length, 0);
    assert.deepEqual(await user(player, 'select id from public.objetos_mapa'), []);
    await assert.rejects(
      op({
        tipo: 'camada_transferir',
        cena_id: scene.id,
        camada_id: secret.id,
        itens: [
          { tipo: 'token', id: own.id, versao: 1 },
          { tipo: 'objeto', id: object.id, versao: 99 },
        ],
      }),
      { code: 'WV001' },
    );
    assert.equal(
      (await db.query<any>('select camada_id from public.tokens_mapa where id=$1', [own.id]))
        .rows[0].camada_id,
      shared.id,
    );
    await op({
      tipo: 'objeto_atualizar',
      id: object.id,
      versao: 1,
      patch: {
        x: 1,
        y: 1,
        w: 2,
        h: 2,
        desenho: {
          ...drawing,
          pontos: [
            { x: 1, y: 1 },
            { x: 3, y: 3 },
          ],
        },
      },
    });
    assert.equal((await snap()).objetos.length, 1);
    await op({
      tipo: 'cena_atualizar',
      id: scene.id,
      versao: scene.versao,
      patch: {
        desenhos: [
          {
            id: 'legado',
            cor: '#ffffff',
            pontos: [
              { x: 0, y: 0 },
              { x: 2, y: 2 },
            ],
          },
        ],
      },
    });
    const updated = (await db.query<any>('select * from public.cenas_mapa where id=$1', [scene.id]))
      .rows[0];
    assert.deepEqual(updated.desenhos, []);
    assert.equal(
      (await db.query<any>('select id from public.objetos_mapa where cena_id=$1', [scene.id])).rows
        .length,
      2,
    );
    await op({ tipo: 'cena_excluir', id: scene.id, versao: updated.versao });
    assert.equal((await db.query<any>('select id from public.objetos_mapa')).rows.length, 0);
  } finally {
    await db.close();
  }
});
