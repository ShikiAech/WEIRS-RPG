import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
import { novaEntrada } from '../packages/sheets/modelo.js';

async function fixture() {
  const f = await mesaFixture([
    '202610110005_rolagens_secretas.sql',
    '202610120010_danos_magias.sql',
  ]);
  const migration = await readFile(
    new URL('../supabase/migrations/202610280016_combate_chat.sql', import.meta.url),
    'utf8',
  ).catch(() => '');
  if (migration) await f.db.exec(migration);
  const current = async () =>
    (await f.db.query<any>('SELECT * FROM public.fichas WHERE id=$1', [f.sheet])).rows[0];
  const operate = async (command: any, id = crypto.randomUUID(), user = f.player) =>
    (
      await f.user(user, 'SELECT public.operar_mesa($1,$2,$3) AS result', [f.campaign, id, command])
    )[0].result;
  const hp = async (acao: string, expressao: string, id = crypto.randomUUID()) =>
    operate(
      { tipo: 'pv', ficha_id: f.sheet, versao: (await current()).versao, acao, expressao },
      id,
    );
  const send = async (
    action: string,
    entry: string,
    extra = {},
    user = f.player,
    request = crypto.randomUUID(),
  ) =>
    (
      await f.user(user, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        f.campaign,
        request,
        {
          tipo: 'acao',
          ficha_id: f.sheet,
          versao: (await current()).versao,
          entrada_id: entry,
          acao: action,
          modo: 'normal',
          ...extra,
        },
      ])
    )[0];
  return { ...f, current, operate, hp, send };
}

test('PV resolve expressões e recibos atomicamente, preserva absorção, zero, limites e versões', async () => {
  const f = await fixture();
  try {
    await f.hp('temporarios', '8+4');
    assert.equal((await f.current()).conteudo.combate.pvTemporarios, 12);
    assert.equal((await f.hp('dano', '12-3')).ficha.conteudo.combate.pvTemporarios, 3);
    const request = crypto.randomUUID();
    const command = {
      tipo: 'pv',
      ficha_id: f.sheet,
      versao: (await f.current()).versao,
      acao: 'dano',
      expressao: '2d8+3',
    };
    const rolled = await f.operate(command, request);
    assert.equal(rolled.resultado.expressao, '2d8+3');
    assert.equal(rolled.ficha.conteudo.combate.pvAtuais, 20 - rolled.resultado.total + 3);
    assert.deepEqual(await f.operate(command, request), rolled);
    assert.equal((await f.current()).versao, rolled.ficha.versao);
    await assert.rejects(f.operate(command), { code: 'WM001' });
    await f.hp('cura', '0');
    const before = await f.current();
    for (const expressao of [
      '-1',
      '2*3',
      '(2+3)',
      '101d6',
      '1d1001',
      '1d6++2',
      '9999+1',
      '1'.repeat(121),
    ])
      await assert.rejects(f.hp('dano', expressao), { code: 'WM003' });
    assert.deepEqual(await f.current(), before);
    await assert.rejects(
      f.operate({ ...command, versao: before.versao }, crypto.randomUUID(), f.spectator),
      { code: 'WM002' },
    );
    await f.db.query('DELETE FROM public.membros_campanha WHERE usuario_id=$1', [f.player]);
    await assert.rejects(f.operate(command, request), { code: 'WM002' });
  } finally {
    await f.db.close();
  }
});

test('PV temporários permitem definir redução e zero sem alterar concessão e NPC usa deltas', async () => {
  const f = await fixture();
  try {
    await f.hp('temporarios', '10');
    await f.hp('temporarios', '4');
    assert.equal((await f.current()).conteudo.combate.pvTemporarios, 10);
    await f.hp('temporarios_definir', '4');
    assert.equal((await f.current()).conteudo.combate.pvTemporarios, 4);
    await f.hp('temporarios_definir', '0');
    assert.equal((await f.current()).conteudo.combate.pvTemporarios, 0);
    let state = (await f.user(f.gm, 'SELECT public.ler_mesa($1) AS result', [f.campaign]))[0]
      .result;
    const added = await f.operate(
      {
        tipo: 'combate',
        versao: state.versao,
        acao: 'adicionar',
        nome: 'Ogro',
        pvMaximos: 30,
        pvAtuais: 30,
        ca: 12,
        iniciativa: 1,
      },
      crypto.randomUUID(),
      f.gm,
    );
    const id = added.mesa.estado.combate.participantes[0].id;
    const hurt = await f.operate(
      { tipo: 'combate', versao: added.mesa.versao, acao: 'dano', id, expressao: '8+4' },
      crypto.randomUUID(),
      f.gm,
    );
    assert.equal(hurt.mesa.estado.combate.participantes[0].pvAtuais, 18);
    const healed = await f.operate(
      { tipo: 'combate', versao: hurt.mesa.versao, acao: 'cura', id, expressao: '12-3' },
      crypto.randomUUID(),
      f.gm,
    );
    assert.equal(healed.mesa.estado.combate.participantes[0].pvAtuais, 27);
  } finally {
    await f.db.close();
  }
});

test('descrições são snapshots salvos, longos, sem regras inventadas e respeitam segredo e acesso', async () => {
  const f = await fixture();
  try {
    const current = await f.current();
    const spell = {
      ...novaEntrada('magias'),
      nome: 'Névoa',
      descricao: 'A'.repeat(10000),
      salvaguardaAtributo: 'des',
      cd: 15,
      bonusAtaque: 7,
    };
    current.conteudo.magias.push(spell);
    current.conteudo.ataques.push({
      ...novaEntrada('ataques'),
      nome: 'Lança',
      observacoes: 'Alcance longo',
    });
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      current.conteudo,
      f.sheet,
    ]);
    const request = crypto.randomUUID();
    const message = await f.send('descricao_magia', spell.id, {}, f.player, request);
    assert.equal(message.resultado.descricao.texto, spell.descricao);
    assert.equal(message.resultado.descricao.nome, 'Névoa');
    const magic = await f.send('magia', spell.id);
    assert.equal(magic.resultado.cd, 15);
    assert.equal(magic.resultado.salvaguardaAtributo, 'des');
    assert.equal(magic.resultado.bonusAtaque, 7);
    const missing = await f.send('descricao_pericia', 'arcanismo');
    assert.equal(missing.resultado.descricao.texto, '');
    assert.equal(missing.resultado.descricao.semDescricao, true);
    const secret = await f.send('descricao_magia', spell.id, { secreta: true }, f.gm);
    const publicRows = await f.user(f.player, 'SELECT * FROM public.mensagens_chat WHERE id=$1', [
      secret.id,
    ]);
    assert.equal(publicRows[0].resultado, null);
    await assert.rejects(f.send('descricao_magia', spell.id, {}, f.outsider), { code: 'WC002' });
    await assert.rejects(f.send('descricao_magia', spell.id, {}, f.spectator), { code: 'WC002' });
    await assert.rejects(f.send('descricao_magia', crypto.randomUUID()), { code: 'WC003' });
    current.conteudo.magias[0].descricao = 'Nova descrição';
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      current.conteudo,
      f.sheet,
    ]);
    assert.deepEqual(
      await f.send('descricao_magia', spell.id, { versao: 2 }, f.player, request),
      message,
    );
  } finally {
    await f.db.close();
  }
});

test('metadados explícitos permitem ataque de magia sem perfil e respeitam modificador salvo', async () => {
  const f = await fixture();
  try {
    const c = (await f.current()).conteudo;
    const spell = { ...novaEntrada('magias'), nome: 'Raio customizado', bonusAtaque: 7, cd: 15 };
    c.magias.push(spell);
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    const result = (await f.send('magia_ataque', spell.id)).resultado;
    assert.equal(result.expressao, '1d20+7');
    assert.equal(result.bonusAtaque, 7);
    assert.equal(result.cd, 15);
    assert.equal(result.salvaguardaAtributo, undefined);
  } finally {
    await f.db.close();
  }
});

test('dano usa fonte atual após PV, recusa fonte removida/sem dano e revalida acesso no recibo', async () => {
  const f = await fixture();
  try {
    const c = (await f.current()).conteudo;
    const attack = { ...novaEntrada('ataques'), nome: 'Lança', dano: '1d8+2' };
    c.ataques.push(attack);
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    const historical = await f.send('ataque', attack.id);
    await f.hp('dano', '1');
    const damage = await f.send('dano', attack.id);
    assert.ok(damage.resultado.origem.versao > historical.resultado.origem.versao);
    assert.equal(damage.resultado.expressao, '1d8+2');
    const version = (await f.current()).versao;
    const request = crypto.randomUUID();
    await f.send('descricao_ataque', attack.id, {}, f.gm, request);
    c.ataques[0].dano = '';
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    await assert.rejects(f.send('dano', attack.id), { code: 'WC003' });
    c.ataques = [];
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    await assert.rejects(f.send('dano', attack.id), { code: 'WC003' });
    await f.db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [f.campaign, f.gm],
    );
    await assert.rejects(
      f.send('descricao_ataque', attack.id, { versao: version }, f.gm, request),
      { code: 'WC002' },
    );
  } finally {
    await f.db.close();
  }
});

test('descrições de ataque vinculado, características, traços, talentos e perícias vêm da ficha', async () => {
  const f = await fixture();
  try {
    const c = (await f.current()).conteudo;
    const weapon = {
      ...novaEntrada('inventario.itens'),
      nome: 'Espada',
      descricao: 'Descrição do equipamento.',
    };
    c.inventario.itens.push(weapon);
    const attack = {
      ...novaEntrada('ataques'),
      nome: 'Espada',
      itemId: weapon.id,
      observacoes: 'Observação salva.',
    };
    c.ataques.push(attack);
    for (const path of ['caracteristicas', 'tracos', 'talentos'])
      c[path].push({ ...novaEntrada(path), nome: path, descricao: 'Texto salvo de ' + path });
    c.pericias.arcanismo.descricao = 'Pesquisa arcana registrada pelo jogador.';
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    assert.equal(
      (await f.send('descricao_ataque', attack.id)).resultado.descricao.texto,
      'Observação salva.\n\nDescrição do equipamento.',
    );
    for (const [path, action] of [
      ['caracteristicas', 'descricao_caracteristica'],
      ['tracos', 'descricao_traco'],
      ['talentos', 'descricao_talento'],
    ])
      assert.equal(
        (await f.send(action, c[path][0].id)).resultado.descricao.texto,
        'Texto salvo de ' + path,
      );
    assert.equal(
      (await f.send('descricao_pericia', 'arcanismo')).resultado.descricao.texto,
      c.pericias.arcanismo.descricao,
    );
    await assert.rejects(f.send('descricao_pericia', 'inventada'), { code: 'WC003' });
  } finally {
    await f.db.close();
  }
});

test('descrição de ataque mantém integralmente observações e equipamento dentro dos limites de cada campo', async () => {
  const f = await fixture();
  try {
    const c = (await f.current()).conteudo;
    const weapon = { ...novaEntrada('inventario.itens'), descricao: 'E'.repeat(10000) };
    const attack = {
      ...novaEntrada('ataques'),
      nome: 'Arma',
      itemId: weapon.id,
      observacoes: 'O'.repeat(10000),
    };
    c.inventario.itens.push(weapon);
    c.ataques.push(attack);
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      c,
      f.sheet,
    ]);
    assert.equal(
      (await f.send('descricao_ataque', attack.id)).resultado.descricao.texto,
      attack.observacoes + '\n\n' + weapon.descricao,
    );
  } finally {
    await f.db.close();
  }
});
