import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compendiumFixture } from './sql/compendium-fixture';

test('map migrations preserve compendium reader permissions while keeping private map helpers closed', async () => {
  const f = await compendiumFixture();
  try {
    const published = await f.species('Publicada');
    await f.species('Rascunho privado');
    await f.publish(published.revisionId);
    await f.db.exec(`CREATE FUNCTION private.unrelated_catalog_helper() RETURNS integer
      LANGUAGE sql AS 'SELECT 1';
      GRANT EXECUTE ON FUNCTION private.unrelated_catalog_helper() TO PUBLIC,anon,authenticated;`);
    const aclQuery = `SELECT p.oid::regprocedure::text AS signature,p.proacl AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname IN
        ('compendio_admin','compendio_visivel','unrelated_catalog_helper')
      ORDER BY signature`;
    const before = (await f.db.query(aclQuery)).rows;
    const readPublished = async () => {
      assert.deepEqual(await f.anonymous('SELECT revisao_id FROM public.compendio_indice'), [
        { revisao_id: published.revisionId },
      ]);
      assert.deepEqual(await f.anonymous('SELECT revisao_id FROM public.compendio_especies'), [
        { revisao_id: published.revisionId },
      ]);
      assert.deepEqual(await f.user(f.player, 'SELECT revisao_id FROM public.compendio_indice'), [
        { revisao_id: published.revisionId },
      ]);
    };
    await readPublished();
    for (const name of ['202610280017_visao_mapa.sql', '202610280018_operacoes_mapa.sql'])
      await f.db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    await readPublished();
    assert.deepEqual((await f.db.query(aclQuery)).rows, before);
    assert.deepEqual(await f.anonymous('SELECT private.unrelated_catalog_helper() AS allowed'), [
      { allowed: 1 },
    ]);
    const newlyExposed = await f.db.query(`SELECT p.oid::regprocedure::text AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname IN (
        'preparar_cena_mapa','invalidar_mapa','camada_visivel','dono_token','celula_visivel',
        'token_visivel','area_cobre','objeto_visivel','arquivo_visivel','arquivo_storage',
        'arquivo_storage_anterior','segmentos_intersectam','normalizar_ancora_area_mapa',
        'recibo_exclusao_mapa','operar_mapa_base','validar_recibo_mapa','mover_ancoras_mapa',
        'marcar_mapa_anterior','converter_desenhos_mapa','poligono_cobre_celula','objeto_cobre')
      AND has_function_privilege('anon',p.oid,'EXECUTE')`);
    assert.deepEqual(newlyExposed.rows, []);
    await assert.rejects(f.anonymous('SELECT * FROM private.visibilidade_mapa'), { code: '42501' });
    await assert.rejects(f.anonymous('SELECT * FROM public.tokens_mapa'), { code: '42501' });
  } finally {
    await f.db.close();
  }
});

test('map upgrade accepts linked area rotation fields and preserves existing manual scenes', async () => {
  const f = await compendiumFixture();
  const operate = async (user: string, command: unknown, request = crypto.randomUUID()) =>
    (
      await f.user(user, 'SELECT public.operar_mapa($1,$2,$3) AS result', [
        f.campaign,
        request,
        command,
      ])
    )[0].result;
  try {
    const scene = (
      await operate(f.gm, {
        tipo: 'cena_criar',
        nome: 'Cena anterior à atualização',
        largura: 20,
        altura: 16,
        publicada: true,
      })
    ).cena;
    await operate(f.gm, { tipo: 'cena_ativar', id: scene.id, versao: scene.versao });
    const token = (
      await operate(f.gm, {
        tipo: 'token_criar',
        cena_id: scene.id,
        nome: 'Personagem',
        x: 3,
        y: 3,
        tamanho: 1,
        cor: '#ffffff',
        ficha_id: f.sheet,
      })
    ).token;
    const command = {
      tipo: 'area_criar',
      cena_id: scene.id,
      nome: 'Cone vinculado',
      forma: 'cone',
      x: 4,
      y: 3,
      tamanho: 3,
      largura: 1,
      angulo: 0,
      cor: '#ff6633',
      token_id: token.id,
      acompanhar_rotacao: true,
    };
    await assert.rejects(operate(f.player, command), {
      code: 'WV003',
      message: 'Campos de área inválidos.',
    });
    const { acompanhar_rotacao: _, ...legacyCommand } = command;
    const legacyArea = (await operate(f.player, legacyCommand)).area;
    for (const name of ['202610280017_visao_mapa.sql', '202610280018_operacoes_mapa.sql'])
      await f.db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const kept = (await f.db.query<any>('SELECT * FROM public.cenas_mapa WHERE id=$1', [scene.id]))
      .rows[0];
    assert.equal(kept.modo_visao, 'manual');
    assert.equal(kept.nome, scene.nome);
    assert.deepEqual((await f.db.query<any>('SELECT id,x,y,versao FROM public.tokens_mapa')).rows, [
      { id: token.id, x: '3', y: '3', versao: token.versao },
    ]);
    const updated = (
      await operate(f.player, {
        tipo: 'area_atualizar',
        id: legacyArea.id,
        versao: legacyArea.versao,
        patch: { acompanhar_rotacao: true },
      })
    ).area;
    assert.equal(updated.acompanhar_rotacao, true);
    const request = crypto.randomUUID();
    const result = await operate(f.player, command, request);
    assert.equal(result.area.token_id, token.id);
    assert.equal(result.area.acompanhar_rotacao, true);
    assert.deepEqual(await operate(f.player, command, request), result);
    await operate(f.player, {
      tipo: 'token_atualizar',
      id: token.id,
      versao: token.versao,
      patch: { x: 5, y: 3, rotacao: 90 },
    });
    const anchored = (
      await f.db.query<any>('SELECT x,y,angulo FROM public.areas_mapa WHERE id=$1', [
        result.area.id,
      ])
    ).rows[0];
    assert.equal(Number(anchored.x), 5);
    assert.equal(Number(anchored.y), 4);
    assert.equal(Number(anchored.angulo), 90);
    await assert.rejects(operate(f.spectator, command), { code: 'WV002' });
    const permissions = (
      await f.db.query<any>(
        `SELECT has_function_privilege('anon','public.operar_mapa(uuid,uuid,jsonb)','EXECUTE') AS operate,
          has_function_privilege('anon','public.ler_mapa_visivel(uuid,uuid)','EXECUTE') AS snapshot,
          has_table_privilege('anon','private.visibilidade_mapa','SELECT') AS visibility`,
      )
    ).rows[0];
    assert.deepEqual(permissions, { operate: false, snapshot: false, visibility: false });
  } finally {
    await f.db.close();
  }
});
