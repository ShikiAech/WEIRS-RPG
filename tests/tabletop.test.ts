import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

test('maps protect unpublished scenes, hidden tokens, ownership and versioned retries', async () => {
  const f = await mesaFixture();
  const { db, gm, player, outsider, spectator, campaign, sheet, user } = f;
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
        'utf8',
      ),
    );
    async function operate(uid: string, command: unknown, pedido = crypto.randomUUID()) {
      return (
        await user(uid, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
          campaign,
          pedido,
          command,
        ])
      )[0].result;
    }
    const scene = (
      await operate(gm, { tipo: 'cena_criar', nome: 'Floresta', largura: 24, altura: 16 })
    ).cena;
    assert.equal(scene.publicada, false);
    assert.deepEqual(await user(player, 'SELECT * FROM public.cenas_mapa'), []);
    await assert.rejects(
      operate(player, { tipo: 'cena_criar', nome: 'Invasão', largura: 10, altura: 10 }),
      { code: 'WV002' },
    );
    const active = (await operate(gm, { tipo: 'cena_ativar', id: scene.id, versao: scene.versao }))
      .cena;
    assert.equal(active.ativa, true);
    assert.equal(active.publicada, true);
    const token = (
      await operate(gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Zephira',
        x: 2,
        y: 3,
        tamanho: 1,
        cor: '#d4af37',
        ficha_id: sheet,
      })
    ).token;
    const hiddenCreate = {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Emboscada',
        x: 5,
        y: 5,
        tamanho: 1,
        cor: '#aa4455',
        oculto: true,
      },
      hiddenRequest = crypto.randomUUID();
    const hidden = (await operate(gm, hiddenCreate, hiddenRequest)).token;
    assert.equal((await user(player, 'SELECT * FROM public.tokens_mapa')).length, 1);
    assert.equal((await user(gm, 'SELECT * FROM public.tokens_mapa')).length, 2);
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.tokens_mapa'), []);
    await assert.rejects(
      operate(player, { tipo: 'token_atualizar', id: hidden.id, versao: 1, patch: { x: 6 } }),
      { code: 'WV002' },
    );
    await assert.rejects(
      operate(spectator, { tipo: 'token_atualizar', id: token.id, versao: 1, patch: { x: 3 } }),
      { code: 'WV002' },
    );
    await assert.rejects(
      operate(player, {
        tipo: 'token_atualizar',
        id: token.id,
        versao: 1,
        patch: { oculto: true },
      }),
      { code: 'WV002' },
    );
    await assert.rejects(
      operate(player, { tipo: 'token_atualizar', id: token.id, versao: 1, patch: { x: 24 } }),
      { code: 'WV003' },
    );
    const move = { tipo: 'token_atualizar', id: token.id, versao: 1, patch: { x: 4, y: 4 } },
      pedido = crypto.randomUUID();
    const moved = await operate(player, move, pedido);
    assert.equal(moved.token.versao, 2);
    assert.deepEqual(await operate(player, move, pedido), moved);
    await assert.rejects(operate(player, { ...move, patch: { x: 5 } }, pedido), { code: 'WV004' });
    await assert.rejects(operate(player, move), { code: 'WV001' });
    await operate(gm, {
      tipo: 'token_atualizar',
      id: token.id,
      versao: 2,
      patch: { bloqueado: true },
    });
    await assert.rejects(operate(player, move, pedido), { code: 'WV002' });
    await assert.rejects(
      user(player, 'UPDATE public.tokens_mapa SET x=9 WHERE id=$1', [token.id]),
      { code: '42501' },
    );
    await assert.rejects(user(gm, 'SELECT * FROM private.operacoes_mapa'), { code: '42501' });
    await assert.rejects(
      operate(gm, {
        tipo: 'cena_atualizar',
        id: scene.id,
        versao: active.versao,
        patch: { ativa: true },
      }),
      { code: 'WV003' },
    );
    await assert.rejects(
      operate(gm, {
        tipo: 'cena_atualizar',
        id: scene.id,
        versao: active.versao,
        patch: { largura: 4 },
      }),
      { code: 'WV003' },
    );
    await assert.rejects(
      operate(gm, {
        tipo: 'cena_atualizar',
        id: scene.id,
        versao: active.versao,
        patch: { revelacoes: [{ x: 20, y: 0, w: 5, h: 4 }] },
      }),
      { code: 'WV003' },
    );
    const drawing = {
      id: 'trace',
      cor: '#ffffff',
      pontos: [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
      ],
    };
    const fogged = (
      await operate(gm, {
        tipo: 'cena_atualizar',
        id: scene.id,
        versao: active.versao,
        patch: { nevoa: true, revelacoes: [{ x: 0, y: 0, w: 10, h: 10 }], desenhos: [drawing] },
      })
    ).cena;
    assert.equal(fogged.nevoa, true);
    assert.deepEqual(fogged.desenhos, [drawing]);
    const another = (
      await operate(gm, {
        tipo: 'cena_criar',
        nome: 'Masmorra',
        largura: 10,
        altura: 10,
        publicada: true,
      })
    ).cena;
    assert.equal(another.ativa, false);
    await operate(gm, { tipo: 'cena_ativar', id: another.id, versao: another.versao });
    assert.equal((await user(player, 'SELECT * FROM public.cenas_mapa WHERE ativa')).length, 1);
    const campaign2 = crypto.randomUUID(),
      foreignSheet = crypto.randomUUID();
    await db.query("INSERT INTO public.campanhas(id,nome) VALUES($1,'Outros')", [campaign2]);
    await db.query(
      'INSERT INTO public.fichas(id,campanha_id,proprietario_id,nome,conteudo) SELECT $1,$2,proprietario_id,nome,conteudo FROM public.fichas WHERE id=$3',
      [foreignSheet, campaign2, sheet],
    );
    await assert.rejects(
      operate(gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Inválido',
        x: 0,
        y: 0,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: foreignSheet,
      }),
      { code: 'WV003' },
    );
    await db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [campaign, gm],
    );
    await assert.rejects(operate(gm, hiddenCreate, hiddenRequest), { code: 'WV002' });
    await assert.rejects(
      operate(gm, { tipo: 'token_atualizar', id: hidden.id, versao: 1, patch: { x: 6 } }),
      { code: 'WV002' },
    );
    assert.equal((await user(gm, 'SELECT * FROM public.tokens_mapa')).length, 1);
  } finally {
    await db.close();
  }
});

test('private storage enforces campaign access, metadata limits and asset visibility', async () => {
  const { db, gm, player, outsider, spectator, campaign, user } = await mesaFixture();
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
        'utf8',
      ),
    );
    const op = async (uid: string, c: unknown) =>
      (
        await user(uid, 'SELECT public.operar_mapa($1,$2,$3) result', [
          campaign,
          crypto.randomUUID(),
          c,
        ])
      )[0].result;
    const id = crypto.randomUUID(),
      command = {
        tipo: 'arquivo_registrar',
        id,
        nome: 'Mapa.webp',
        mime: 'image/webp',
        tamanho: 1024,
        visibilidade: 'mestre',
      };
    await assert.rejects(op(player, command), { code: 'WV002' });
    await assert.rejects(op(spectator, { ...command, visibilidade: 'campanha' }), {
      code: 'WV002',
    });
    await assert.rejects(op(gm, { ...command, mime: 'image/svg+xml' }), { code: 'WV003' });
    await assert.rejects(op(gm, { ...command, tamanho: 5242881 }), { code: 'WV003' });
    const a = (await op(gm, command)).asset;
    assert.equal(a.caminho, `${campaign}/${id}`);
    await assert.rejects(
      user(player, 'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
        'weirs-mesa',
        a.caminho,
        { size: 1024, mimetype: 'image/webp' },
      ]),
      { code: '42501' },
    );
    await assert.rejects(op(gm, { tipo: 'arquivo_finalizar', id }), { code: 'WV003' });
    await assert.rejects(
      user(gm, 'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
        'weirs-mesa',
        a.caminho,
        { size: 2048, mimetype: 'image/webp' },
      ]),
      { code: '42501' },
    );
    await assert.rejects(
      user(gm, 'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
        'weirs-mesa',
        a.caminho,
        { size: 1024, mimetype: 'image/png' },
      ]),
      { code: '42501' },
    );
    await user(gm, 'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
      'weirs-mesa',
      a.caminho,
      { size: 1024, mimetype: 'image/webp' },
    ]);
    const ready = (await op(gm, { tipo: 'arquivo_finalizar', id })).asset;
    assert.equal(ready.estado, 'pronto');
    assert.deepEqual(await user(player, 'SELECT * FROM public.arquivos_mapa'), []);
    assert.deepEqual(await user(player, 'SELECT * FROM storage.objects'), []);
    assert.deepEqual(await user(outsider, 'SELECT * FROM storage.objects'), []);
    assert.equal((await user(gm, 'SELECT * FROM storage.objects')).length, 1);
    const publicId = crypto.randomUUID();
    const shared = (await op(player, { ...command, id: publicId, visibilidade: 'campanha' })).asset;
    await user(player, 'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)', [
      'weirs-mesa',
      shared.caminho,
      { size: 1024, mimetype: 'image/webp' },
    ]);
    await op(player, { tipo: 'arquivo_finalizar', id: publicId });
    assert.equal((await user(spectator, 'SELECT * FROM storage.objects')).length, 1);
    const scene = (await op(gm, { tipo: 'cena_criar', nome: 'Mesa', largura: 10, altura: 10 }))
      .cena;
    const privateScene = (
      await op(gm, { tipo: 'cena_atualizar', id: scene.id, versao: 1, patch: { fundo_id: id } })
    ).cena;
    await assert.rejects(
      op(gm, { tipo: 'cena_ativar', id: scene.id, versao: privateScene.versao }),
      { code: 'WV003' },
    );
    const referenced = (
      await op(gm, {
        tipo: 'cena_criar',
        nome: 'Segredo do mestre',
        largura: 10,
        altura: 10,
        fundo_id: publicId,
      })
    ).cena;
    assert.deepEqual(
      await user(player, 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [
        shared.caminho,
      ]),
      [],
    );
    assert.equal(
      (await user(player, 'SELECT * FROM storage.objects')).length,
      1,
      'hidden references still prevent object deletion',
    );
    await assert.rejects(op(player, { tipo: 'arquivo_preparar_exclusao', id: publicId }), {
      code: 'WV003',
    });
    await op(gm, { tipo: 'cena_excluir', id: referenced.id, versao: referenced.versao });
    assert.deepEqual(
      await user(player, 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [
        shared.caminho,
      ]),
      [],
      'ready assets require an atomic deletion reservation',
    );
    const prepareCommand = { tipo: 'arquivo_preparar_exclusao', id: publicId },
      prepareRequest = crypto.randomUUID();
    const preparing = (
      await user(player, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        prepareRequest,
        prepareCommand,
      ])
    )[0].result;
    assert.equal(preparing.asset.estado, 'excluindo');
    assert.deepEqual(
      (
        await user(player, 'SELECT public.operar_mapa($1,$2,$3) result', [
          campaign,
          prepareRequest,
          prepareCommand,
        ])
      )[0].result,
      preparing,
    );
    assert.equal(
      (await op(player, prepareCommand)).asset.estado,
      'excluindo',
      'interrupted cleanup can prepare again',
    );
    await assert.rejects(
      op(gm, {
        tipo: 'cena_criar',
        nome: 'Corrida de vínculos',
        largura: 10,
        altura: 10,
        publicada: true,
        fundo_id: publicId,
      }),
      { code: 'WV003' },
    );
    await assert.rejects(op(player, { tipo: 'arquivo_finalizar', id: publicId }), {
      code: 'WV003',
    });
    await user(player, 'DELETE FROM storage.objects WHERE name=$1', [shared.caminho]);
    const removeCommand = { tipo: 'arquivo_excluir', id: publicId },
      removeRequest = crypto.randomUUID();
    const removed = (
      await user(player, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        removeRequest,
        removeCommand,
      ])
    )[0].result;
    assert.deepEqual(
      (
        await user(player, 'SELECT public.operar_mapa($1,$2,$3) result', [
          campaign,
          removeRequest,
          removeCommand,
        ])
      )[0].result,
      removed,
    );
    await db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      campaign,
      player,
    ]);
    assert.deepEqual(await user(player, 'SELECT * FROM storage.objects'), []);
    await assert.rejects(op(player, { tipo: 'arquivo_excluir', id: publicId }), { code: 'WV002' });
  } finally {
    await db.close();
  }
});

test('campaign storage quota includes pending reservations and anonymous clients cannot see maps', async () => {
  const { db, gm, campaign, user } = await mesaFixture();
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
        'utf8',
      ),
    );
    const reserve = (bytes: number) =>
      user(gm, 'SELECT public.operar_mapa($1,$2,$3)', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'arquivo_registrar',
          id: crypto.randomUUID(),
          nome: 'Mapa.webp',
          mime: 'image/webp',
          tamanho: bytes,
          visibilidade: 'campanha',
        },
      ]);
    for (let i = 0; i < 20; i++) await reserve(5242880);
    await assert.rejects(reserve(1), { code: 'WV003' });
    await db.exec('BEGIN; SET LOCAL ROLE anon');
    await assert.rejects(db.query('SELECT * FROM public.cenas_mapa'), { code: '42501' });
    await db.exec('ROLLBACK');
  } finally {
    await db.close();
  }
});

test('shared map pings are bounded, transient and respect private scenes and campaign roles', async () => {
  const { db, gm, player, spectator, outsider, campaign, user } = await mesaFixture();
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
        'utf8',
      ),
    );
    const create = async (publicada: boolean) =>
      (
        await user(gm, 'SELECT public.operar_mapa($1,$2,$3) result', [
          campaign,
          crypto.randomUUID(),
          {
            tipo: 'cena_criar',
            nome: publicada ? 'Mesa' : 'Segredo',
            largura: 10,
            altura: 10,
            publicada,
          },
        ])
      )[0].result.cena;
    const scene = await create(true),
      draft = await create(false);
    const ping = (uid: string, sceneId: string, x: number, y: number) =>
      user(uid, 'SELECT * FROM public.marcar_mapa($1,$2,$3,$4)', [campaign, sceneId, x, y]);
    await assert.rejects(ping(player, scene.id, 11, 2), { code: 'WV003' });
    await assert.rejects(ping(player, draft.id, 2, 2), { code: 'WV002' });
    await assert.rejects(ping(outsider, scene.id, 2, 2), { code: 'WV002' });
    await assert.rejects(ping(spectator, scene.id, 2, 2), { code: 'WV002' });
    const shared = await ping(player, scene.id, 2, 3);
    assert.equal(Number(shared[0].x), 2);
    await assert.rejects(ping(player, scene.id, 3, 3), { code: 'WV006' });
    await ping(gm, draft.id, 4, 4);
    assert.equal((await user(gm, 'SELECT * FROM public.marcadores_mapa')).length, 2);
    assert.equal((await user(player, 'SELECT * FROM public.marcadores_mapa')).length, 1);
    assert.equal((await user(spectator, 'SELECT * FROM public.marcadores_mapa')).length, 1);
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.marcadores_mapa'), []);
    await assert.rejects(user(player, 'UPDATE public.marcadores_mapa SET x=4'), { code: '42501' });
    await db.exec(
      "UPDATE public.marcadores_mapa SET criado_em=clock_timestamp()-interval '7 seconds'",
    );
    assert.deepEqual(await user(player, 'SELECT * FROM public.marcadores_mapa'), []);
    await ping(player, scene.id, 5, 6);
    assert.equal(
      (await db.query('SELECT * FROM public.marcadores_mapa WHERE usuario_id=$1', [player])).rows
        .length,
      1,
    );
    await db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      campaign,
      player,
    ]);
    assert.deepEqual(await user(player, 'SELECT * FROM public.marcadores_mapa'), []);
    await assert.rejects(ping(player, scene.id, 2, 2), { code: 'WV002' });
  } finally {
    await db.close();
  }
});

test('removing a combatant unlinks its map token without freezing movement or changing other bindings', async () => {
  const { db, gm, player, campaign, user } = await mesaFixture();
  try {
    await db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610110006_mesa_virtual.sql', import.meta.url),
        'utf8',
      ),
    );
    const scene = (
      await user(gm, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'cena_criar',
          nome: 'Combate',
          largura: 12,
          altura: 12,
          publicada: true,
        },
      ])
    )[0].result.cena;
    const add = (versao: number, nome: string) =>
      user(gm, 'SELECT public.operar_mesa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'combate',
          versao,
          acao: 'adicionar',
          nome,
          pvMaximos: 10,
          pvAtuais: 10,
          iniciativa: 12,
          ca: 12,
        },
      ]);
    const first = (await add(0, 'Bandido'))[0].result.mesa.estado.combate.participantes[0];
    const second = (await add(1, 'Lobo'))[0].result.mesa.estado.combate.participantes.find(
      (p: { id: string }) => p.id !== first.id,
    );
    const token = (
      await user(gm, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'token_criar',
          cena_id: scene.id,
          nome: first.nome,
          x: 2,
          y: 2,
          tamanho: 1,
          cor: '#ffffff',
          controlador_id: player,
          combate_id: first.id,
        },
      ])
    )[0].result.token;
    const kept = (
      await user(gm, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'token_criar',
          cena_id: scene.id,
          nome: second.nome,
          x: 5,
          y: 5,
          tamanho: 1,
          cor: '#ffffff',
          combate_id: second.id,
        },
      ])
    )[0].result.token;
    await user(gm, 'SELECT public.operar_mesa($1,$2,$3)', [
      campaign,
      crypto.randomUUID(),
      { tipo: 'combate', versao: 2, acao: 'remover', id: first.id },
    ]);
    const current = (
      await user(player, 'SELECT * FROM public.tokens_mapa WHERE id=$1', [token.id])
    )[0];
    assert.equal(current.combate_id, null);
    assert.equal(current.versao, 2);
    assert.equal(
      (await user(gm, 'SELECT * FROM public.tokens_mapa WHERE id=$1', [kept.id]))[0].versao,
      1,
    );
    const moved = (
      await user(player, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'token_atualizar',
          id: token.id,
          versao: current.versao,
          patch: { x: 3, y: 3 },
        },
      ])
    )[0].result.token;
    assert.equal(Number(moved.x), 3);
    assert.equal(
      (await user(player, 'SELECT * FROM public.mensagens_chat')).length,
      3,
      'moving a token does not add chat announcements',
    );
  } finally {
    await db.close();
  }
});
