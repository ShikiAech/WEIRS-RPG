import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';

async function fixture() {
  const f = await mesaFixture(['202610110005_rolagens_secretas.sql']);
  try {
    await f.db.exec(
      await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    for (const name of [
      '202610110006_mesa_virtual.sql',
      '202610110007_agilidade.sql',
      '202610120008_ficha.sql',
      '202610120009_acessos.sql',
    ])
      await f.db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    return f;
  } catch (e) {
    await f.db.close();
    throw e;
  }
}

test('entrar na campanha vincula apenas o próprio jogador e preserva papéis existentes', async () => {
  const { db, outsider, player, gm, spectator, campaign, user } = await fixture();
  try {
    assert.equal((await user(outsider, 'SELECT * FROM public.campanhas')).length, 1);
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.fichas'), []);
    const enter = (id: string, cid = campaign) =>
      user(id, 'SELECT * FROM public.entrar_campanha($1)', [cid]);
    assert.equal((await enter(outsider))[0].papel, 'jogador');
    assert.equal((await enter(outsider))[0].usuario_id, outsider);
    assert.equal((await enter(gm))[0].papel, 'mestre');
    assert.equal((await enter(spectator))[0].papel, 'espectador');
    assert.equal(
      (await db.query('SELECT * FROM public.membros_campanha WHERE usuario_id=$1', [outsider])).rows
        .length,
      1,
    );
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.fichas'), []);
    await assert.rejects(enter(outsider, crypto.randomUUID()), { code: 'WF002' });
    await assert.rejects(enter(''), { code: 'WF002' });
    await assert.rejects(user(player, "UPDATE public.membros_campanha SET papel='mestre'"), {
      code: '42501',
    });
    await assert.rejects(
      user(player, 'INSERT INTO public.administradores(usuario_id) VALUES($1)', [player]),
      { code: '42501' },
    );
    await db.query(
      'UPDATE auth.users SET raw_user_meta_data=\'{"admin":true,"role":"admin"}\' WHERE id=$1',
      [outsider],
    );
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.administradores'), []);
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.fichas'), []);
  } finally {
    await db.close();
  }
});

test('admin edita e copia fichas entre campanhas sem assumir propriedade nem duplicar tentativas', async () => {
  const { db, outsider, gm, player, campaign, sheet, user } = await fixture();
  const other = crypto.randomUUID(),
    copy = crypto.randomUUID();
  try {
    await db.query("INSERT INTO public.campanhas(id,nome) VALUES($1,'Outra mesa')", [other]);
    await db.query('INSERT INTO public.administradores(usuario_id) VALUES($1)', [outsider]);
    assert.equal((await user(outsider, 'SELECT * FROM public.fichas')).length, 1);
    assert.deepEqual(await user(player, 'SELECT * FROM public.administradores'), []);
    assert.equal((await user(outsider, 'SELECT * FROM public.perfis')).length, 4);
    const source = (await user(outsider, 'SELECT * FROM public.fichas WHERE id=$1', [sheet]))[0];
    const save = (uid: string) =>
      user(uid, 'SELECT * FROM public.salvar_ficha($1,$2,$3,$4,1)', [
        sheet,
        1,
        'Zephira revisada',
        source.conteudo,
      ]);
    assert.equal((await save(outsider))[0].versao, 2);
    const duplicate = (uid: string, version = 2, destination = other) =>
      user(uid, 'SELECT * FROM public.copiar_ficha_campanha($1,$2,$3,$4)', [
        sheet,
        version,
        destination,
        copy,
      ]);
    await assert.rejects(duplicate(gm), { code: 'WF002' });
    const added = (await duplicate(outsider))[0];
    assert.equal(added.proprietario_id, player);
    assert.equal(added.campanha_id, other);
    assert.equal(added.versao, 1);
    assert.deepEqual((await duplicate(outsider))[0], added);
    assert.equal((await db.query('SELECT * FROM public.fichas')).rows.length, 2);
    assert.equal(
      (
        await db.query<{ papel: string }>(
          'SELECT * FROM public.membros_campanha WHERE usuario_id=$1 AND campanha_id=$2',
          [player, other],
        )
      ).rows[0].papel,
      'jogador',
    );
    await assert.rejects(duplicate(outsider, 1), { code: 'WF001' });
    await assert.rejects(duplicate(outsider, 2, campaign), { code: 'WF003' });
    assert.equal((await user(player, 'SELECT * FROM public.fichas')).length, 2);
    assert.deepEqual(
      await user(outsider, 'DELETE FROM public.fichas WHERE id=$1 RETURNING id', [sheet]),
      [],
    );
    await db.query('DELETE FROM public.administradores WHERE usuario_id=$1', [outsider]);
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.fichas'), []);
    await assert.rejects(save(outsider), { code: 'WF002' });
    await assert.rejects(duplicate(outsider), { code: 'WF002' });
  } finally {
    await db.close();
  }
});

test('admin sem vínculo usa mesa, segredos e mapa; revogação bloqueia todas as operações', async () => {
  const { db, outsider, campaign, user } = await fixture();
  try {
    await db.query('INSERT INTO public.administradores(usuario_id) VALUES($1)', [outsider]);
    const send = () =>
      user(outsider, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        campaign,
        crypto.randomUUID(),
        { tipo: 'rolagem', expressao: '1d20', rotulo: 'Segredo', secreta: true },
      ]);
    const rolled = (await send())[0];
    const secrets = () =>
      user(outsider, 'SELECT public.ler_segredos_chat($1,$2) result', [campaign, [rolled.id]]);
    const reveal = () =>
      user(outsider, 'SELECT * FROM public.revelar_rolagem($1,$2)', [campaign, rolled.id]);
    assert.equal((await secrets())[0].result.length, 1);
    assert.deepEqual((await reveal())[0].resultado, rolled.resultado);
    const mesa = () =>
      user(outsider, 'SELECT public.operar_mesa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'combate',
          versao: 0,
          acao: 'adicionar',
          nome: 'Lobo',
          pvMaximos: 10,
          pvAtuais: 10,
          iniciativa: 12,
          ca: 12,
        },
      ]);
    await mesa();
    const map = (command: unknown) =>
      user(outsider, 'SELECT public.operar_mapa($1,$2,$3) result', [
        campaign,
        crypto.randomUUID(),
        command,
      ]);
    const scene = (
      await map({ tipo: 'cena_criar', nome: 'Admin', largura: 10, altura: 10, publicada: true })
    )[0].result.cena;
    await map({ tipo: 'cena_ativar', id: scene.id, versao: scene.versao });
    await map({
      tipo: 'token_criar',
      cena_id: scene.id,
      nome: 'Admin',
      x: 2,
      y: 2,
      tamanho: 1,
      cor: '#ffffff',
      controlador_id: outsider,
    });
    const ping = () =>
      user(outsider, 'SELECT * FROM public.marcar_mapa($1,$2,2,2)', [campaign, scene.id]);
    await ping();
    await db.query('DELETE FROM public.administradores WHERE usuario_id=$1', [outsider]);
    for (const call of [send, secrets, reveal]) await assert.rejects(call(), { code: 'WC002' });
    await assert.rejects(mesa(), { code: 'WM002' });
    await assert.rejects(map({ tipo: 'cena_criar', nome: 'Revogado', largura: 10, altura: 10 }), {
      code: 'WV002',
    });
    await assert.rejects(ping(), { code: 'WV002' });
    assert.deepEqual(await user(outsider, 'SELECT * FROM public.cenas_mapa'), []);
  } finally {
    await db.close();
  }
});
