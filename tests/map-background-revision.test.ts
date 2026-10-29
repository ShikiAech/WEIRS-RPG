import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

const migration = '202610290021_revisao_fundo_mapa.sql';

async function fixture() {
  const f = await mesaFixture();
  await f.db.exec(await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'));
  for (const name of [
    '202610110006_mesa_virtual.sql',
    '202610110007_agilidade.sql',
    '202610280017_visao_mapa.sql',
    '202610280018_operacoes_mapa.sql',
  ])
    await f.db.exec(
      await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
    );
  const op = async (command: unknown) =>
    (
      await f.user(f.gm, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
        f.campaign,
        crypto.randomUUID(),
        command,
      ])
    )[0].result;
  const scene = (
    await op({
      tipo: 'cena_criar',
      nome: 'Mapa conhecido',
      largura: 10,
      altura: 8,
      publicada: true,
    })
  ).cena;
  const token = (
    await op({
      tipo: 'token_criar',
      cena_id: scene.id,
      nome: 'Fonte',
      x: 1,
      y: 1,
      tamanho: 1,
      cor: '#ffffff',
      ficha_id: f.sheet,
    })
  ).token;
  const upgrade = async () =>
    f.db.exec(
      await readFile(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'),
    );
  const invalidation = async (uid = f.player) =>
    (
      await f.user(uid, 'SELECT * FROM public.invalidacoes_mapa WHERE campanha_id=$1', [f.campaign])
    )[0];
  return { ...f, op, scene, token, upgrade, invalidation };
}

test('background revision upgrades existing recipients without exposing other rows or private helpers', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.user(f.player, 'SELECT revisao_fundo FROM public.invalidacoes_mapa'), {
      code: '42703',
    });
    const before = await f.invalidation();
    const permissions = `SELECT p.oid::regprocedure::text AS signature,p.proacl AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' ORDER BY signature`;
    const beforePermissions = (await f.db.query(permissions)).rows;
    await f.upgrade();
    const after = await f.invalidation();
    assert.deepEqual(after, { ...before, revisao_fundo: 1 });
    assert.deepEqual((await f.db.query(permissions)).rows, beforePermissions);
    assert.deepEqual(await f.user(f.outsider, 'SELECT * FROM public.invalidacoes_mapa'), []);
    assert.deepEqual(
      (await f.user(f.player, 'SELECT usuario_id FROM public.invalidacoes_mapa')).map(
        (row) => row.usuario_id,
      ),
      [f.player],
    );
    await assert.rejects(f.user(f.player, 'UPDATE public.invalidacoes_mapa SET revisao_fundo=99'), {
      code: '42501',
    });
    await assert.rejects(f.user(f.player, 'SELECT private.invalidar_mapa()'), { code: '42501' });
    assert.deepEqual(
      (
        await f.db.query(`SELECT
          has_table_privilege('anon','public.invalidacoes_mapa','SELECT') AS anonymous,
          has_table_privilege('authenticated','public.invalidacoes_mapa','INSERT') AS write`)
      ).rows,
      [{ anonymous: false, write: false }],
    );
  } finally {
    await f.db.close();
  }
});

test('movement and vision invalidations preserve the background stamp, including legacy reset inserts', async () => {
  const f = await fixture();
  try {
    await f.upgrade();
    assert.equal((await f.invalidation()).revisao_fundo, 1);
    await f.op({
      tipo: 'area_criar',
      cena_id: f.scene.id,
      nome: 'Âncora',
      forma: 'circulo',
      x: 1,
      y: 1,
      tamanho: 2,
      cor: '#ffffff',
      token_id: f.token.id,
    });
    await f.db.query(
      `INSERT INTO public.paredes_mapa(campanha_id,cena_id,x1,y1,x2,y2)
       VALUES($1,$2,2,0,2,8)`,
      [f.campaign, f.scene.id],
    );
    await f.db.query(
      `INSERT INTO public.objetos_mapa(campanha_id,cena_id,camada_id,nome,x,y,w,h,desenho)
       VALUES($1,$2,$3,'Traço',1,1,1,1,'{"id":"stroke","pontos":[{"x":1,"y":1},{"x":2,"y":2}]}')`,
      [f.campaign, f.scene.id, f.token.camada_id],
    );
    await f.db.query(
      "INSERT INTO public.marcadores_mapa(campanha_id,cena_id,usuario_id,nome,x,y) VALUES($1,$2,$3,'Marca',1,1)",
      [f.campaign, f.scene.id, f.player],
    );
    for (const [table, field] of [
      ['tokens_mapa', 'x'],
      ['areas_mapa', 'x'],
      ['camadas_mapa', 'ordem'],
      ['paredes_mapa', 'x1'],
      ['objetos_mapa', 'x'],
      ['fichas', 'versao'],
      ['marcadores_mapa', 'x'],
    ]) {
      const before = await f.invalidation();
      await f.db.query(`UPDATE public.${table} SET ${field}=${field}+1 WHERE campanha_id=$1`, [
        f.campaign,
      ]);
      const after = await f.invalidation();
      assert(
        Number(after.revisao) > Number(before.revisao),
        table + ' still invalidates visibility',
      );
      assert.equal(after.revisao_fundo, before.revisao_fundo, table + ' keeps the base map');
    }
    const beforeReset = await f.invalidation();
    await f.op({ tipo: 'exploracao_limpar', cena_id: f.scene.id });
    const afterReset = await f.invalidation();
    assert(Number(afterReset.revisao) > Number(beforeReset.revisao));
    assert.equal(afterReset.revisao_fundo, beforeReset.revisao_fundo);
    // The existing exploration path inserts only the original three columns.
    await f.db.query('DELETE FROM public.invalidacoes_mapa WHERE usuario_id=$1', [f.player]);
    await f.op({ tipo: 'exploracao_limpar', cena_id: f.scene.id });
    assert.equal((await f.invalidation()).revisao_fundo, 1);
  } finally {
    await f.db.close();
  }
});

test('authorization changes advance a monotonic stamp that subsequent movement cannot erase', async () => {
  const f = await fixture();
  try {
    await f.upgrade();
    assert.equal((await f.invalidation()).revisao_fundo, 1);
    const assertBackgroundChange = async (change: () => Promise<unknown>) => {
      const before = await f.invalidation();
      await change();
      const after = await f.invalidation();
      const global = (
        await f.db.query<any>('SELECT revisao FROM public.revisoes_mapa WHERE campanha_id=$1', [
          f.campaign,
        ])
      ).rows[0];
      assert(Number(after.revisao_fundo) > Number(before.revisao_fundo));
      assert.equal(after.revisao_fundo, global.revisao);
      await f.db.query('UPDATE public.tokens_mapa SET x=x+1 WHERE id=$1', [f.token.id]);
      const moved = await f.invalidation();
      assert(Number(moved.revisao) > Number(after.revisao));
      assert.equal(moved.revisao_fundo, after.revisao_fundo);
    };
    await assertBackgroundChange(() =>
      f.db.query('UPDATE public.cenas_mapa SET ativa=false WHERE id=$1', [f.scene.id]),
    );
    await assertBackgroundChange(() =>
      f.db.query('UPDATE public.cenas_mapa SET publicada=false WHERE id=$1', [f.scene.id]),
    );
    await assertBackgroundChange(() =>
      f.db.query('UPDATE public.cenas_mapa SET publicada=true WHERE id=$1', [f.scene.id]),
    );
    await assertBackgroundChange(() =>
      f.db.query('UPDATE public.cenas_mapa SET ativa=true WHERE id=$1', [f.scene.id]),
    );
    const asset = crypto.randomUUID();
    await assertBackgroundChange(() =>
      f.db.query(
        `INSERT INTO public.arquivos_mapa(id,campanha_id,usuario_id,nome,caminho,mime,tamanho,visibilidade,estado)
         VALUES($1,$2,$3,'Fundo',$4,'image/png',1,'campanha','pronto')`,
        [asset, f.campaign, f.gm, `${f.campaign}/${asset}`],
      ),
    );
    await assertBackgroundChange(() =>
      f.db.query('UPDATE public.cenas_mapa SET fundo_id=$1 WHERE id=$2', [asset, f.scene.id]),
    );
    await assertBackgroundChange(() =>
      f.db.query(
        'INSERT INTO public.atribuicoes_mapa(campanha_id,usuario_id,cena_id) VALUES($1,$2,$3)',
        [f.campaign, f.player, f.scene.id],
      ),
    );
    await assertBackgroundChange(() =>
      f.db.query(
        "UPDATE public.membros_campanha SET papel='espectador' WHERE campanha_id=$1 AND usuario_id=$2",
        [f.campaign, f.player],
      ),
    );
    const beforeCoalesced = await f.invalidation();
    let authorizationStamp: number;
    await f.db.exec('BEGIN');
    try {
      await f.db.query("UPDATE public.arquivos_mapa SET visibilidade='mestre' WHERE id=$1", [
        asset,
      ]);
      authorizationStamp = (
        await f.db.query<any>('SELECT revisao FROM public.revisoes_mapa WHERE campanha_id=$1', [
          f.campaign,
        ])
      ).rows[0].revisao;
      await f.db.query('UPDATE public.tokens_mapa SET x=x+1 WHERE id=$1', [f.token.id]);
      await f.db.exec('COMMIT');
    } catch (e) {
      await f.db.exec('ROLLBACK');
      throw e;
    }
    const coalesced = await f.invalidation();
    assert(Number(coalesced.revisao_fundo) > Number(beforeCoalesced.revisao_fundo));
    assert.equal(coalesced.revisao_fundo, authorizationStamp);
    const beforeRemoval = await f.invalidation();
    await f.db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      f.campaign,
      f.player,
    ]);
    const removed = await f.invalidation();
    assert(Number(removed.revisao) > Number(beforeRemoval.revisao));
    assert(Number(removed.revisao_fundo) > Number(beforeRemoval.revisao_fundo));
    assert.deepEqual(Object.keys(removed).sort(), [
      'campanha_id',
      'revisao',
      'revisao_fundo',
      'usuario_id',
    ]);
    assert.deepEqual(await f.user(f.player, 'SELECT * FROM public.cenas_mapa'), []);
    await f.db.query('UPDATE public.tokens_mapa SET x=x+1 WHERE id=$1', [f.token.id]);
    assert.deepEqual(await f.invalidation(), removed);
    assert.deepEqual(await f.user(f.outsider, 'SELECT * FROM public.invalidacoes_mapa'), []);
  } finally {
    await f.db.close();
  }
});

test('scene tools retain the background stamp when backdrop and audience are unchanged', async () => {
  const f = await fixture();
  try {
    await f.upgrade();
    for (const patch of [
      "nome='Outra descrição'",
      'grade=false',
      'nevoa=true',
      "modo_visao='manual'",
      'largura=11,fundo_x=1,fundo_escala=1.5',
      `desenhos='[{"id":"legacy-stroke","cor":"#ffffff","pontos":[{"x":1,"y":1},{"x":2,"y":2}]}]'`,
    ]) {
      const before = await f.invalidation();
      await f.db.query(`UPDATE public.cenas_mapa SET ${patch} WHERE id=$1`, [f.scene.id]);
      const after = await f.invalidation();
      assert(Number(after.revisao) > Number(before.revisao), patch + ' invalidates current state');
      assert.equal(after.revisao_fundo, before.revisao_fundo, patch + ' keeps the backdrop');
    }
    assert.equal(
      (await f.db.query<any>('SELECT count(*) AS n FROM public.objetos_mapa')).rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});
