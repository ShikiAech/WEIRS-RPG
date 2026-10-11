import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

async function fixture() {
  const f = await mesaFixture();
  await f.db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
  await f.db.exec(
    await readFile(
      new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
      'utf8',
    ),
  );
  const migration = await readFile(
    new URL('../supabase/migrations/202610110007_agilidade.sql', import.meta.url),
    'utf8',
  );
  await f.db.exec(migration);
  async function operate(uid: string, command: any, request = crypto.randomUUID()) {
    return (
      await f.user(uid, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
        f.campaign,
        request,
        command,
      ])
    )[0].result;
  }
  const scene = (
    await operate(f.gm, {
      tipo: 'cena_criar',
      nome: 'Pátio',
      largura: 20,
      altura: 16,
      publicada: true,
    })
  ).cena;
  async function token(x: number, extras = {}) {
    return (
      await operate(f.gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Guarda',
        x,
        y: 3,
        tamanho: 1,
        cor: '#d4af37',
        ...extras,
      })
    ).token;
  }
  return { ...f, operate, scene, token };
}

test('multi-token operations are atomic, versioned, replayable and restricted to current masters', async () => {
  const f = await fixture();
  try {
    const a = await f.token(2),
      b = await f.token(5);
    const move = {
      tipo: 'tokens_lote',
      cena_id: f.scene.id,
      itens: [
        { tipo: 'token_atualizar', id: a.id, versao: 1, patch: { x: 4, y: 6 } },
        { tipo: 'token_atualizar', id: b.id, versao: 1, patch: { x: 7, y: 6 } },
      ],
    };
    await assert.rejects(f.operate(f.player, move), { code: 'WV002' });
    const request = crypto.randomUUID();
    const response = await f.operate(f.gm, move, request);
    assert.deepEqual(
      response.tokens.map((t: any) => [t.x, t.y, t.versao]),
      [
        [4, 6, 2],
        [7, 6, 2],
      ],
    );
    assert.deepEqual(await f.operate(f.gm, move, request), response);
    await assert.rejects(f.operate(f.gm, move), { code: 'WV001' });
    await assert.rejects(
      f.operate(f.gm, {
        ...move,
        itens: [
          { tipo: 'token_atualizar', id: a.id, versao: 2, patch: { x: 8 } },
          { tipo: 'token_atualizar', id: b.id, versao: 2, patch: { x: 20 } },
        ],
      }),
      { code: 'WV003' },
    );
    assert.deepEqual(
      (await f.user(f.gm, 'SELECT x,versao FROM public.tokens_mapa WHERE id=$1', [a.id]))[0],
      { x: '4', versao: 2 },
    );
    await assert.rejects(
      f.operate(f.gm, {
        ...move,
        itens: [
          { tipo: 'token_excluir', id: a.id, versao: 2 },
          { tipo: 'token_excluir', id: b.id, versao: 1 },
        ],
      }),
      { code: 'WV001' },
    );
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.tokens_mapa')).length, 2);
    await assert.rejects(f.operate(f.gm, { ...move, itens: [move.itens[0], move.itens[0]] }), {
      code: 'WV003',
    });
    await assert.rejects(f.operate(f.gm, { ...move, itens: [] }), { code: 'WV003' });
    await assert.rejects(f.operate(f.gm, { ...move, itens: Array(41).fill(move.itens[0]) }), {
      code: 'WV003',
    });
    await f.db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [f.campaign, f.gm],
    );
    await assert.rejects(f.operate(f.gm, move, request), { code: 'WV002' });
  } finally {
    await f.db.close();
  }
});

test('duplication preserves formation, creates new identities and clears combat bindings', async () => {
  const f = await fixture();
  try {
    const combatId = crypto.randomUUID();
    await f.db.query('INSERT INTO public.mesas(campanha_id) VALUES($1)', [f.campaign]);
    await f.db.query(
      "UPDATE public.mesas SET estado=jsonb_set(estado,'{combate,participantes}',$2) WHERE campanha_id=$1",
      [f.campaign, [{ id: combatId, nome: 'Guarda' }]],
    );
    const a = await f.token(2, { combate_id: combatId, aura: { raio: 2, cor: '#3366ff' } }),
      b = await f.token(5);
    const copy = {
      tipo: 'tokens_duplicar',
      cena_id: f.scene.id,
      tokens: [
        { id: a.id, versao: 1 },
        { id: b.id, versao: 1 },
      ],
      dx: 1,
      dy: 2,
    };
    const request = crypto.randomUUID(),
      result = await f.operate(f.gm, copy, request);
    assert.equal(result.tokens.length, 2);
    assert.deepEqual(
      result.tokens.map((t: any) => [t.x, t.y, t.versao, t.combate_id]),
      [
        [3, 5, 1, null],
        [6, 5, 1, null],
      ],
    );
    assert.notEqual(result.tokens[0].id, a.id);
    assert.deepEqual(result.tokens[0].aura, { raio: 2, cor: '#3366ff' });
    assert.deepEqual(await f.operate(f.gm, copy, request), result);
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.tokens_mapa')).length, 4);
    await assert.rejects(f.operate(f.player, copy), { code: 'WV002' });
    await assert.rejects(f.operate(f.gm, { ...copy, dx: 15 }), { code: 'WV003' });
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.tokens_mapa')).length, 4);
    const deleted = await f.operate(f.gm, {
      tipo: 'tokens_lote',
      cena_id: f.scene.id,
      itens: result.tokens.map((t: any) => ({ tipo: 'token_excluir', id: t.id, versao: 1 })),
    });
    assert.deepEqual(
      deleted.excluidos,
      result.tokens.map((t: any) => t.id),
    );
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.tokens_mapa')).length, 2);
  } finally {
    await f.db.close();
  }
});

test('spell areas share within a visible scene and enforce current authorship, control and versions', async () => {
  const f = await fixture();
  try {
    const owned = await f.token(2, { ficha_id: f.sheet });
    const command = {
      tipo: 'area_criar',
      cena_id: f.scene.id,
      token_id: owned.id,
      nome: 'Bola de fogo',
      forma: 'circulo',
      x: 3,
      y: 4,
      tamanho: 4,
      cor: '#ff6633',
    };
    const area = (await f.operate(f.player, command)).area;
    assert.equal(area.usuario_id, f.player);
    assert.equal(area.versao, 1);
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.areas_mapa')).length, 1);
    assert.equal((await f.user(f.spectator, 'SELECT id FROM public.areas_mapa')).length, 1);
    assert.deepEqual(await f.user(f.outsider, 'SELECT id FROM public.areas_mapa'), []);
    await assert.rejects(f.operate(f.spectator, command), { code: 'WV002' });
    await assert.rejects(f.operate(f.player, { ...command, usuario_id: f.gm }), { code: 'WV003' });
    await assert.rejects(f.user(f.player, 'UPDATE public.areas_mapa SET tamanho=100'), {
      code: '42501',
    });
    const edit = {
        tipo: 'area_atualizar',
        id: area.id,
        versao: 1,
        patch: { forma: 'cone', angulo: 45, tamanho: 6 },
      },
      request = crypto.randomUUID();
    const edited = await f.operate(f.player, edit, request);
    assert.equal(edited.area.versao, 2);
    assert.equal(edited.area.forma, 'cone');
    assert.deepEqual(await f.operate(f.player, edit, request), edited);
    await assert.rejects(f.operate(f.player, edit), { code: 'WV001' });
    for (const patch of [
      { x: 21 },
      { tamanho: 0 },
      { largura: 21 },
      { angulo: 361 },
      { forma: 'script' },
      { cor: 'red' },
      { usuario_id: f.gm },
    ]) {
      await assert.rejects(f.operate(f.player, { ...edit, versao: 2, patch }), { code: 'WV003' });
    }
    // Another player's controlled token does not grant control of an unrelated area.
    await f.db.query("INSERT INTO public.membros_campanha VALUES($1,$2,'jogador')", [
      f.campaign,
      f.outsider,
    ]);
    await assert.rejects(f.operate(f.outsider, { ...edit, versao: 2 }), { code: 'WV002' });
    await f.operate(f.gm, {
      tipo: 'token_atualizar',
      id: owned.id,
      versao: 1,
      patch: { controlador_id: f.outsider },
    });
    const transferred = await f.operate(f.outsider, { ...edit, versao: 2, patch: { x: 8 } });
    assert.equal(transferred.area.x, 8);
    const author = await f.operate(f.player, { ...edit, versao: 3, patch: { y: 9 } });
    assert.equal(author.area.y, 9);
    await f.operate(f.gm, {
      tipo: 'token_atualizar',
      id: owned.id,
      versao: 2,
      patch: { oculto: true },
    });
    assert.deepEqual(await f.user(f.player, 'SELECT id FROM public.areas_mapa'), []);
    await assert.rejects(f.operate(f.player, edit, request), { code: 'WV002' });
    assert.equal((await f.user(f.gm, 'SELECT id FROM public.areas_mapa')).length, 1);
    await f.operate(f.gm, { tipo: 'token_excluir', id: owned.id, versao: 3 });
    assert.deepEqual(await f.user(f.gm, 'SELECT id FROM public.areas_mapa'), []);
  } finally {
    await f.db.close();
  }
});

test('area removal can recover lost acknowledgements while private-scene receipts stay private', async () => {
  const f = await fixture();
  try {
    const area = (
      await f.operate(f.player, {
        tipo: 'area_criar',
        cena_id: f.scene.id,
        nome: 'Zona',
        forma: 'quadrado',
        x: 1,
        y: 1,
        tamanho: 2,
        cor: '#55bb77',
      })
    ).area;
    const remove = { tipo: 'area_excluir', id: area.id, versao: 1 },
      request = crypto.randomUUID();
    const result = await f.operate(f.player, remove, request);
    assert.deepEqual(result, { excluido: area.id });
    assert.deepEqual(await f.operate(f.player, remove, request), result);
    assert.deepEqual(await f.user(f.player, 'SELECT * FROM public.areas_mapa'), []);
    const privateScene = (
      await f.operate(f.gm, { tipo: 'cena_criar', nome: 'Segredo', largura: 10, altura: 10 })
    ).cena;
    const command = {
        tipo: 'area_criar',
        cena_id: privateScene.id,
        nome: 'Armadilha',
        forma: 'linha',
        x: 2,
        y: 2,
        tamanho: 4,
        cor: '#bb3366',
      },
      secretRequest = crypto.randomUUID();
    await f.operate(f.gm, command, secretRequest);
    assert.deepEqual(await f.user(f.player, 'SELECT * FROM public.areas_mapa'), []);
    await assert.rejects(f.operate(f.player, command), { code: 'WV002' });
    await f.db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [f.campaign, f.gm],
    );
    await assert.rejects(f.operate(f.gm, command, secretRequest), { code: 'WV002' });
    await f.db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      f.campaign,
      f.player,
    ]);
    await assert.rejects(f.operate(f.player, remove, request), { code: 'WV002' });
  } finally {
    await f.db.close();
  }
});

test('background alignment and auras validate bounded geometry without granting players editing rights', async () => {
  const f = await fixture();
  try {
    assert.deepEqual([f.scene.fundo_x, f.scene.fundo_y, f.scene.fundo_escala], [0, 0, 1]);
    const aligned = (
      await f.operate(f.gm, {
        tipo: 'cena_atualizar',
        id: f.scene.id,
        versao: 1,
        patch: { fundo_x: -2, fundo_y: 1.5, fundo_escala: 1.25 },
      })
    ).cena;
    assert.deepEqual([aligned.fundo_x, aligned.fundo_y, aligned.fundo_escala], [-2, 1.5, 1.25]);
    for (const patch of [{ fundo_x: 101 }, { fundo_escala: 0 }, { fundo_y: null }])
      await assert.rejects(
        f.operate(f.gm, { tipo: 'cena_atualizar', id: aligned.id, versao: 2, patch }),
        { code: 'WV003' },
      );
    const token = await f.token(2, { ficha_id: f.sheet });
    assert.equal(token.aura, null);
    await assert.rejects(
      f.operate(f.player, {
        tipo: 'token_atualizar',
        id: token.id,
        versao: 1,
        patch: { aura: { raio: 3, cor: '#dd5544' } },
      }),
      { code: 'WV002' },
    );
    const aura = (
      await f.operate(f.gm, {
        tipo: 'token_atualizar',
        id: token.id,
        versao: 1,
        patch: { aura: { raio: 3, cor: '#dd5544' } },
      })
    ).token;
    assert.deepEqual(aura.aura, { raio: 3, cor: '#dd5544' });
    for (const auraValue of [
      { raio: 0, cor: '#dd5544' },
      { raio: 21, cor: '#dd5544' },
      { raio: 3, cor: 'red' },
      { raio: '3', cor: '#dd5544' },
      { raio: 3, cor: '#dd5544', hidden: true },
    ]) {
      await assert.rejects(
        f.operate(f.gm, {
          tipo: 'token_atualizar',
          id: token.id,
          versao: 2,
          patch: { aura: auraValue },
        }),
        { code: 'WV003' },
      );
    }
    await f.operate(f.gm, {
      tipo: 'area_criar',
      cena_id: aligned.id,
      nome: 'Parede',
      forma: 'linha',
      x: 15,
      y: 8,
      tamanho: 6,
      largura: 1,
      angulo: 90,
      cor: '#44ccff',
    });
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'cena_atualizar',
        id: aligned.id,
        versao: 2,
        patch: { largura: 10 },
      }),
      { code: 'WV003' },
    );
  } finally {
    await f.db.close();
  }
});

test('group selections cannot cross scenes and spell-area quotas include hidden areas', async () => {
  const f = await fixture();
  try {
    const token = await f.token(2);
    const otherScene = (
      await f.operate(f.gm, { tipo: 'cena_criar', nome: 'Outra sala', largura: 10, altura: 10 })
    ).cena;
    const otherToken = (
      await f.operate(f.gm, {
        tipo: 'token_criar',
        cena_id: otherScene.id,
        nome: 'Segredo',
        x: 2,
        y: 3,
        tamanho: 1,
        cor: '#dd5544',
      })
    ).token;
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'tokens_lote',
        cena_id: f.scene.id,
        itens: [
          { tipo: 'token_atualizar', id: token.id, versao: 1, patch: { x: 8 } },
          { tipo: 'token_atualizar', id: otherToken.id, versao: 1, patch: { x: 5 } },
        ],
      }),
      { code: 'WV002' },
    );
    assert.equal(
      (await f.user(f.gm, 'SELECT x FROM public.tokens_mapa WHERE id=$1', [token.id]))[0].x,
      '2',
    );
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'tokens_duplicar',
        cena_id: f.scene.id,
        tokens: [{ id: token.id, versao: 1.5 }],
        dx: 1,
        dy: 1,
      }),
      { code: 'WV001' },
    );
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'area_criar',
        cena_id: f.scene.id,
        token_id: otherToken.id,
        nome: 'Vínculo invasor',
        forma: 'circulo',
        x: 3,
        y: 3,
        tamanho: 2,
        cor: '#55bb77',
      }),
      { code: 'WV003' },
    );
    await f.operate(f.gm, {
      tipo: 'token_atualizar',
      id: token.id,
      versao: 1,
      patch: { oculto: true },
    });
    await f.db.query(
      "INSERT INTO public.areas_mapa(campanha_id,cena_id,usuario_id,token_id,nome,forma,x,y,tamanho) SELECT $1,$2,$3,$4,'Área','circulo',2,3,2 FROM generate_series(1,100)",
      [f.campaign, f.scene.id, f.gm, token.id],
    );
    await assert.rejects(
      f.operate(f.player, {
        tipo: 'area_criar',
        cena_id: f.scene.id,
        nome: 'Excesso',
        forma: 'circulo',
        x: 3,
        y: 3,
        tamanho: 2,
        cor: '#55bb77',
      }),
      { code: 'WV003' },
    );
    assert.equal(
      (await f.user(f.player, 'SELECT count(*) AS total FROM public.areas_mapa'))[0].total,
      0,
    );
    assert.equal(
      (await f.user(f.gm, 'SELECT count(*) AS total FROM public.areas_mapa'))[0].total,
      100,
    );
  } finally {
    await f.db.close();
  }
});

test('extended map operations preserve storage tombstones and private image publication checks', async () => {
  const f = await fixture();
  try {
    const assetId = crypto.randomUUID();
    await f.operate(f.gm, {
      tipo: 'arquivo_registrar',
      id: assetId,
      nome: 'Mapa privado',
      mime: 'image/png',
      tamanho: 1024,
      visibilidade: 'mestre',
    });
    await f.db.query(
      "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('weirs-mesa',$1,$2)",
      [f.campaign + '/' + assetId, { mimetype: 'image/png', size: 1024 }],
    );
    await f.operate(f.gm, { tipo: 'arquivo_finalizar', id: assetId });
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'cena_atualizar',
        id: f.scene.id,
        versao: 1,
        patch: { fundo_id: assetId, fundo_escala: 2 },
      }),
      { code: 'WV003' },
    );
    const tombstone = await f.operate(f.gm, { tipo: 'arquivo_preparar_exclusao', id: assetId });
    assert.equal(tombstone.asset.estado, 'excluindo');
    await assert.rejects(
      f.operate(f.gm, {
        tipo: 'token_criar',
        cena_id: f.scene.id,
        nome: 'Imagem apagando',
        x: 2,
        y: 3,
        tamanho: 1,
        cor: '#dd5544',
        oculto: true,
        imagem_id: assetId,
        aura: { raio: 2, cor: '#dd5544' },
      }),
      { code: 'WV003' },
    );
    await f.db.query("DELETE FROM storage.objects WHERE bucket_id='weirs-mesa' AND name=$1", [
      f.campaign + '/' + assetId,
    ]);
    const remove = { tipo: 'arquivo_excluir', id: assetId },
      request = crypto.randomUUID();
    const removed = await f.operate(f.gm, remove, request);
    assert.deepEqual(await f.operate(f.gm, remove, request), removed);
    assert.deepEqual(await f.user(f.gm, 'SELECT * FROM public.arquivos_mapa'), []);
  } finally {
    await f.db.close();
  }
});
