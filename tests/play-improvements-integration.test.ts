import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

test('full migration history keeps HP receipts and map visibility under current campaign access', async () => {
  const f = await mesaFixture();
  try {
    await f.db.exec(
      await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    const directory = new URL('../supabase/migrations/', import.meta.url);
    const migrations = (await readdir(directory))
      .filter((name) => /^\d+_.+\.sql$/.test(name) && name > '202610070004_mesa.sql')
      .sort();
    for (const name of migrations)
      await f.db.exec(await readFile(new URL(name, directory), 'utf8'));

    const command = {
      tipo: 'pv',
      ficha_id: f.sheet,
      versao: 1,
      acao: 'dano',
      expressao: '2d4+3',
    };
    const request = crypto.randomUUID();
    const hp = async () =>
      (
        await f.user(f.player, 'SELECT public.operar_mesa($1,$2,$3) AS result', [
          f.campaign,
          request,
          command,
        ])
      )[0].result;
    const first = await hp();
    assert(first.resultado.total >= 5 && first.resultado.total <= 11);
    assert.equal(first.ficha.conteudo.combate.pvAtuais, 20 - first.resultado.total);
    assert.deepEqual(await hp(), first, 'retry preserves the roll and applies once');

    const map = async (actor: string, value: unknown) =>
      (
        await f.user(actor, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
          f.campaign,
          crypto.randomUUID(),
          value,
        ])
      )[0].result;
    const scene = (
      await map(f.gm, {
        tipo: 'cena_criar',
        nome: 'Integração',
        largura: 10,
        altura: 10,
        publicada: true,
      })
    ).cena;
    await map(f.player, {
      tipo: 'token_criar',
      cena_id: scene.id,
      nome: 'Personagem',
      x: 1,
      y: 1,
      tamanho: 1,
      cor: '#ffffff',
      ficha_id: f.sheet,
    });
    const enemy = (
      await map(f.gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Adversário oculto pela parede',
        x: 8,
        y: 1,
        tamanho: 1,
        cor: '#ffffff',
      })
    ).token;
    await map(f.gm, {
      tipo: 'parede_criar',
      cena_id: scene.id,
      x1: 4,
      y1: 0,
      x2: 4,
      y2: 10,
      porta: true,
      aberta: false,
    });
    const snapshot = (
      await f.user(f.player, 'SELECT public.ler_mapa_visivel($1,$2) AS result', [
        f.campaign,
        scene.id,
      ])
    )[0].result;
    assert(!snapshot.tokens.some((token: { id: string }) => token.id === enemy.id));
    assert.deepEqual(
      await f.user(f.player, 'SELECT id FROM public.tokens_mapa WHERE id=$1', [enemy.id]),
      [],
    );

    const legacy = await f.db.query<{ proname: string; executable: boolean }>(`
      SELECT proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS executable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND proname LIKE 'operar_mapa%'
        AND proname <> 'operar_mapa'
    `);
    assert.deepEqual(
      legacy.rows.filter((row) => row.executable),
      [],
      'renamed legacy RPCs must not bypass visibility checks',
    );

    await f.db.query('DELETE FROM public.membros_campanha WHERE usuario_id=$1', [f.player]);
    await assert.rejects(hp(), { code: 'WM002' });
    await assert.rejects(
      f.user(f.player, 'SELECT public.ler_mapa_visivel($1,$2)', [f.campaign, scene.id]),
    );
  } finally {
    await f.db.close();
  }
});
