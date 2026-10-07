import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { criarConteudo, novaEntrada, validarFicha } from '../packages/sheets/modelo.js';

test('sessão integra ficha, combate e comércio com transações, versões, acesso e reenvio', async () => {
  const db = new PGlite();
  const pc = crypto.randomUUID(),
    gm = crypto.randomUUID(),
    spectator = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  const campaign = crypto.randomUUID(),
    sheet = crypto.randomUUID(),
    offer = crypto.randomUUID();
  async function user(id: string, sql: string, args: unknown[] = []) {
    await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
    try {
      const out = await db.query<any>(sql, args);
      await db.exec('COMMIT');
      return out.rows[0];
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  const snapshot = (id = pc) =>
    user(id, 'SELECT public.ler_mesa($1) AS result', [campaign]).then((r) => r.result);
  const operate = (id: string, cmd: unknown, request = crypto.randomUUID()) =>
    user(id, 'SELECT public.operar_mesa($1,$2,$3) AS result', [campaign, request, cmd]).then(
      (r) => r.result,
    );
  const denied = (p: Promise<unknown>, code: string) =>
    assert.rejects(p, (e: any) => e.code === code);
  try {
    await db.exec(await readFile(new URL('./sql/bootstrap.sql', import.meta.url), 'utf8'));
    for (const file of [
      '202610070001_foundation.sql',
      '202610070002_chat.sql',
      '202610070003_chat_receipts_rls.sql',
    ]) {
      const sql = await readFile(
        new URL('../supabase/migrations/' + file, import.meta.url),
        'utf8',
      ).catch((e) => {
        if (e.code === 'ENOENT') return '';
        throw e;
      });
      if (sql) await db.exec(sql);
    }
    for (const id of [pc, gm, spectator, outsider])
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    await db.query("INSERT INTO public.campanhas(id,nome) VALUES($1,'Sessão')", [campaign]);
    for (const [id, role] of [
      [pc, 'jogador'],
      [gm, 'mestre'],
      [spectator, 'espectador'],
    ])
      await db.query('INSERT INTO public.membros_campanha VALUES($1,$2,$3)', [campaign, id, role]);
    const content = criarConteudo();
    content.combate.pvMaximos = 20;
    content.combate.pvAtuais = 20;
    content.combate.pvTemporarios = 3;
    content.atributos.des.valor = 16;
    content.pericias.acrobacia.grau = 'especializacao';
    content.inventario.moedas.po = 10;
    content.ataques.push({ ...novaEntrada('ataques'), nome: 'Espada', valor: 5, dano: '1d8+3' });
    content.recursos.push({
      ...novaEntrada('recursos'),
      nome: 'Fôlego',
      maximo: 2,
      gastos: 1,
      recuperacao: 'curto',
    } as never);
    await db.query(
      "INSERT INTO public.fichas(id,campanha_id,proprietario_id,nome,conteudo) VALUES($1,$2,$3,'Herói',$4)",
      [sheet, campaign, pc, content],
    );
    // Um cliente já usou a RPC antiga antes de atualizar o banco.
    await user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
      campaign,
      crypto.randomUUID(),
      {
        tipo: 'acao',
        ficha_id: sheet,
        versao: 1,
        entrada_id: content.ataques[0].id,
        acao: 'ataque',
        modo: 'normal',
      },
    ]);
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610070004_mesa.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.equal((await snapshot()).estado.combate.rodada, 1);
    await denied(snapshot(outsider), 'WM002');
    await denied(
      operate(spectator, { tipo: 'pv', ficha_id: sheet, versao: 1, acao: 'dano', valor: 8 }),
      'WM002',
    );
    const req = crypto.randomUUID(),
      damage = { tipo: 'pv', ficha_id: sheet, versao: 1, acao: 'dano', valor: 8 };
    const hurt = await operate(pc, damage, req);
    assert.equal(hurt.ficha.conteudo.combate.pvAtuais, 15);
    assert.equal(hurt.ficha.conteudo.combate.pvTemporarios, 0);
    assert.deepEqual(await operate(pc, damage, req), hurt);
    await denied(operate(pc, { ...damage, valor: 1 }, req), 'WM004');
    await denied(operate(pc, { ...damage, valor: 1 }), 'WM001');
    await denied(
      operate(pc, { tipo: 'loja', versao: 0, aberta: true, nome: 'Loja', ofertas: [] }),
      'WM002',
    );
    let state = await snapshot();
    const configure = {
      tipo: 'loja',
      versao: state.versao,
      aberta: true,
      nome: 'Mercador',
      ofertas: [
        { id: offer, nome: 'Poção', preco: 200, venda: 100, estoque: 2 },
        { id: crypto.randomUUID(), nome: 'Armadura', preco: 2000, venda: 1000, estoque: 1 },
      ],
    };
    await operate(gm, configure);
    const buyReq = crypto.randomUUID(),
      buy = {
        tipo: 'comprar',
        ficha_id: sheet,
        versao: 2,
        oferta_id: offer,
        quantidade: 1,
        preco_unitario: 200,
      };
    await denied(operate(pc, { ...buy, preco_unitario: 201 }), 'WM001');
    const beforeBalanceFailure = await snapshot();
    await denied(
      operate(pc, { ...buy, oferta_id: configure.ofertas[1].id, preco_unitario: 2000 }),
      'WM003',
    );
    assert.deepEqual(await snapshot(), beforeBalanceFailure);
    const purchased = await operate(pc, buy, buyReq);
    assert.equal(purchased.ficha.conteudo.inventario.moedas.po, 8);
    assert.equal(purchased.mesa.estado.loja.ofertas[0].estoque, 1);
    assert.deepEqual(await operate(pc, buy, buyReq), purchased);
    await denied(operate(pc, { ...buy, versao: 3, quantidade: 2 }), 'WM003');
    const item = purchased.ficha.conteudo.inventario.itens[0];
    const sold = await operate(pc, {
      tipo: 'vender',
      ficha_id: sheet,
      versao: 3,
      oferta_id: offer,
      item_id: item.id,
      quantidade: 1,
      preco_unitario: 100,
    });
    assert.equal(sold.ficha.conteudo.inventario.moedas.po, 9);
    assert.equal(sold.ficha.conteudo.inventario.itens.length, 0);
    const command = {
      tipo: 'acao',
      ficha_id: sheet,
      versao: 4,
      entrada_id: 'acrobacia',
      acao: 'pericia',
      modo: 'vantagem',
    };
    const roll = await user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
      campaign,
      crypto.randomUUID(),
      command,
    ]);
    assert.equal(roll.resultado.expressao, '2d20kh1+7');
    const initiative = await user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
      campaign,
      crypto.randomUUID(),
      { ...command, entrada_id: 'iniciativa', acao: 'iniciativa', modo: 'normal' },
    ]);
    state = await snapshot();
    assert.equal(state.estado.combate.participantes[0].iniciativa, initiative.resultado.total);
    assert.equal(state.estado.combate.participantes[0].pvAtuais, 15);
    await denied(operate(pc, { tipo: 'combate', versao: state.versao, acao: 'iniciar' }), 'WM002');
    const npc = await operate(gm, {
      tipo: 'combate',
      versao: state.versao,
      acao: 'adicionar',
      nome: 'Goblin',
      pvMaximos: 7,
      pvAtuais: 7,
      ca: 15,
      iniciativa: 30,
    });
    const start = await operate(gm, { tipo: 'combate', versao: npc.mesa.versao, acao: 'iniciar' });
    const next = await operate(gm, { tipo: 'combate', versao: start.mesa.versao, acao: 'avancar' });
    const wrap = await operate(gm, { tipo: 'combate', versao: next.mesa.versao, acao: 'avancar' });
    assert.equal(wrap.mesa.estado.combate.rodada, 2);
    const rest = await operate(pc, {
      tipo: 'descanso',
      ficha_id: sheet,
      versao: 4,
      descanso: 'longo',
    });
    assert.equal(rest.ficha.conteudo.combate.pvAtuais, 20);
    assert.equal(rest.ficha.conteudo.recursos[0].gastos, 0);
    const fixture = structuredClone(rest.ficha.conteudo);
    fixture.conjuracao.espacos[0].total = 1;
    fixture.conjuracao.pacto.total = 1;
    fixture.combate.dadosVida.push({ ...novaEntrada('combate.dadosVida'), maximo: 2 });
    fixture.magias.push({ ...novaEntrada('magias'), nome: 'Raio homebrew', dano: '2d6+1' });
    fixture.ataques.push({ ...novaEntrada('ataques'), nome: 'Espada', valor: 5, dano: '1d8+3' });
    fixture.inventario.itens.push({
      ...novaEntrada('inventario.itens'),
      nome: 'Flechas',
      quantidade: 9999,
    });
    fixture.historia.anotacoes = 'Segredo do personagem';
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      fixture,
      sheet,
    ]);
    const current = () => user(pc, 'SELECT * FROM public.fichas WHERE id=$1', [sheet]);
    const mutate = async (cmd: Record<string, unknown>, request = crypto.randomUUID()) => {
      const f = await current();
      const result = await operate(pc, { ...cmd, ficha_id: sheet, versao: f.versao }, request);
      assert.deepEqual(validarFicha(result.ficha), []);
      return result;
    };
    const action = async (acao: string, entrada_id: string, request = crypto.randomUUID()) => {
      const f = await current();
      return user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        campaign,
        request,
        { tipo: 'acao', ficha_id: sheet, versao: f.versao, entrada_id, acao, modo: 'normal' },
      ]);
    };
    await denied(mutate({ tipo: 'pv', acao: 'temporarios', valor: 10000 }), 'WM003');
    await denied(
      mutate({
        tipo: 'gasto',
        caminho: 'item',
        entrada_id: fixture.inventario.itens[0].id,
        delta: -1,
      }),
      'WM003',
    );
    const spent = await mutate({ tipo: 'gasto', caminho: 'espaco', circulo: 1, delta: 1 });
    assert.equal(spent.ficha.conteudo.conjuracao.espacos[0].gastos, 1);
    await denied(mutate({ tipo: 'gasto', caminho: 'espaco', circulo: 1, delta: 1 }), 'WM003');
    await mutate({ tipo: 'gasto', caminho: 'pacto', delta: 1 });
    await mutate({
      tipo: 'gasto',
      caminho: 'recurso',
      entrada_id: fixture.recursos[0].id,
      delta: 1,
    });
    const shortRest = await mutate({ tipo: 'descanso', descanso: 'curto' });
    assert.equal(shortRest.ficha.conteudo.conjuracao.espacos[0].gastos, 1);
    assert.equal(shortRest.ficha.conteudo.conjuracao.pacto.gastos, 0);
    assert.equal(shortRest.ficha.conteudo.recursos[0].gastos, 0);
    await mutate({ tipo: 'pv', acao: 'dano', valor: 10 });
    const hd = await action('dado_vida', fixture.combate.dadosVida[0].id);
    let after = await current();
    assert.equal(after.conteudo.combate.dadosVida[0].gastos, 1);
    assert.equal(
      after.conteudo.combate.pvAtuais,
      Math.min(20, 10 + Math.max(0, hd.resultado.total)),
    );
    assert.deepEqual(validarFicha(after), []);
    await action('dado_vida', fixture.combate.dadosVida[0].id);
    const halfRest = await mutate({
      tipo: 'descanso',
      descanso: 'longo',
      recuperacao_dados: 'metade',
    });
    assert.equal(halfRest.ficha.conteudo.combate.dadosVida[0].gastos, 1);
    assert.equal((await action('magia_dano', fixture.magias[0].id)).resultado.expressao, '2d6+1');
    assert.equal((await action('ataque', fixture.ataques[0].id)).resultado.expressao, '1d20+5');
    await mutate({ tipo: 'condicao', nome: 'Envenenado', ativa: true });
    await mutate({ tipo: 'concentracao', nome: 'Raio homebrew' });
    await denied(mutate({ tipo: 'concentracao', nome: 123 }), 'WM003');
    const publicState = await snapshot(spectator);
    assert.equal(
      publicState.estado.combate.participantes.find((p: any) => p.ficha_id === sheet).concentracao,
      'Raio homebrew',
    );
    assert.ok(!JSON.stringify(publicState).includes('Segredo do personagem'));
    assert.ok(!JSON.stringify(publicState).includes('moedas'));
    await mutate({ tipo: 'pv', acao: 'dano', valor: 9999 });
    const deathReq = crypto.randomUUID(),
      beforeDeath = await current();
    const deathCommand = {
      tipo: 'acao',
      ficha_id: sheet,
      versao: beforeDeath.versao,
      entrada_id: 'morte',
      acao: 'morte',
      modo: 'normal',
    };
    const death = await user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
      campaign,
      deathReq,
      deathCommand,
    ]);
    assert.deepEqual(
      await user(pc, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        campaign,
        deathReq,
        deathCommand,
      ]),
      death,
    );
    after = await current();
    const natural = death.resultado.termos[0].dados[0];
    assert.equal(after.versao, beforeDeath.versao + 1);
    assert.equal(after.conteudo.combate.pvAtuais, natural === 20 ? 1 : 0);
    assert.equal(after.conteudo.combate.sucessosMorte, natural >= 10 && natural < 20 ? 1 : 0);
    assert.equal(after.conteudo.combate.falhasMorte, natural === 1 ? 2 : natural < 10 ? 1 : 0);
    if (after.conteudo.combate.pvAtuais === 0) {
      await denied(mutate({ tipo: 'descanso', descanso: 'longo' }), 'WM003');
      await mutate({ tipo: 'pv', acao: 'cura', valor: 1 });
    }
    const endRest = await mutate({ tipo: 'descanso', descanso: 'longo' });
    assert.equal(endRest.ficha.conteudo.combate.pvAtuais, 20);
    assert.equal(endRest.ficha.conteudo.combate.dadosVida[0].gastos, 0);
    assert.equal(endRest.ficha.conteudo.conjuracao.espacos[0].gastos, 0);
    // Retirar quem está agindo deve passar ao seguinte; retirar o último fecha a rodada.
    const gmCombat = async (cmd: Record<string, unknown>) =>
      operate(gm, { tipo: 'combate', versao: (await snapshot()).versao, ...cmd });
    await gmCombat({
      acao: 'adicionar',
      nome: 'Ogro',
      pvAtuais: 30,
      pvMaximos: 30,
      ca: 12,
      iniciativa: -999,
    });
    await gmCombat({ acao: 'iniciar' });
    const middle = await gmCombat({ acao: 'avancar' });
    assert.equal(middle.mesa.estado.combate.turno, sheet);
    const removed = await gmCombat({ acao: 'remover', id: sheet });
    const ogre = removed.mesa.estado.combate.participantes.find((p: any) => p.nome === 'Ogro');
    assert.equal(removed.mesa.estado.combate.turno, ogre.id);
    const removeLast = await gmCombat({ acao: 'remover', id: ogre.id });
    assert.equal(removeLast.mesa.estado.combate.rodada, 2);
    assert.equal(
      removeLast.mesa.estado.combate.turno,
      removeLast.mesa.estado.combate.participantes[0].id,
    );
    // Duas fichas observam o mesmo estoque: a segunda compra não pode gastar dinheiro sem receber o item.
    await db.query('INSERT INTO public.membros_campanha VALUES($1,$2,$3)', [
      campaign,
      outsider,
      'jogador',
    ]);
    const secondSheet = crypto.randomUUID(),
      otherContent = criarConteudo();
    otherContent.inventario.moedas.po = 10;
    await db.query(
      "INSERT INTO public.fichas(id,campanha_id,proprietario_id,nome,conteudo) VALUES($1,$2,$3,'Outro herói',$4)",
      [secondSheet, campaign, outsider, otherContent],
    );
    await denied(
      operate(pc, { tipo: 'pv', ficha_id: secondSheet, versao: 1, acao: 'cura', valor: 1 }),
      'WM002',
    );
    assert.equal(
      await user(outsider, 'SELECT * FROM public.fichas WHERE id=$1', [sheet]),
      undefined,
    );
    state = await snapshot();
    await operate(gm, {
      ...configure,
      versao: state.versao,
      ofertas: [{ ...configure.ofertas[0], estoque: 1 }],
    });
    await mutate({ tipo: 'comprar', oferta_id: offer, quantidade: 1, preco_unitario: 200 });
    const emptyShop = await snapshot();
    await denied(
      operate(outsider, {
        tipo: 'comprar',
        ficha_id: secondSheet,
        versao: 1,
        oferta_id: offer,
        quantidade: 1,
        preco_unitario: 200,
      }),
      'WM003',
    );
    assert.deepEqual(await snapshot(), emptyShop);
    const notCharged = await user(outsider, 'SELECT * FROM public.fichas WHERE id=$1', [
      secondSheet,
    ]);
    assert.equal(notCharged.versao, 1);
    assert.equal(notCharged.conteudo.inventario.moedas.po, 10);
    assert.equal(notCharged.conteudo.inventario.itens.length, 0);
    const owned = await current(),
      boughtItem = owned.conteudo.inventario.itens.at(-1);
    owned.conteudo.inventario.sintonizados = [
      { ...novaEntrada('inventario.sintonizados'), nome: 'Poção', itemId: boughtItem.id },
    ];
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      owned.conteudo,
      sheet,
    ]);
    await denied(
      mutate({
        tipo: 'vender',
        oferta_id: offer,
        item_id: boughtItem.id,
        quantidade: 1,
        preco_unitario: 100,
      }),
      'WM003',
    );
    assert.deepEqual(await snapshot(), emptyShop);
    const gmReceipt = crypto.randomUUID(),
      gmChange = {
        tipo: 'pv',
        ficha_id: secondSheet,
        versao: 1,
        acao: 'cura',
        valor: 1,
      };
    await operate(gm, gmChange, gmReceipt);
    await db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [campaign, gm],
    );
    await denied(operate(gm, gmChange, gmReceipt), 'WM002');
    await db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      campaign,
      pc,
    ]);
    await denied(operate(pc, damage, req), 'WM002');
    await denied(user(pc, 'INSERT INTO public.mesas(campanha_id) VALUES($1)', [campaign]), '42501');
    await denied(user(pc, 'SELECT * FROM private.operacoes_mesa'), '42501');
    assert.equal(
      (
        await db.query<any>(
          "SELECT bool_and(relrowsecurity) AS protected FROM pg_class WHERE oid IN ('private.operacoes_mesa'::regclass,'public.mesas'::regclass)",
        )
      ).rows[0].protected,
      true,
    );
  } finally {
    await db.close();
  }
});
