import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { criarConteudo, novaEntrada } from '../packages/sheets/modelo.js';

test('chat calcula dados no banco, protege campanhas e repete comandos sem rerrolar', async () => {
  const db = new PGlite();
  const a = '10000000-0000-4000-a000-000000000001';
  const b = '10000000-0000-4000-a000-000000000002';
  const gm = '10000000-0000-4000-a000-000000000003';
  const spectator = '10000000-0000-4000-a000-000000000004';
  const c = '20000000-0000-4000-a000-000000000001';
  const other = '20000000-0000-4000-a000-000000000002';
  const sheet = '30000000-0000-4000-a000-000000000001';
  async function asUser(user: string, sql: string, values: unknown[] = []) {
    await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    try {
      const response = await db.query(sql, values);
      await db.exec('COMMIT');
      return response;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
  const send = async (
    user: string,
    command: unknown,
    request = crypto.randomUUID(),
    campaign = c,
  ) =>
    (await asUser(user, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [campaign, request, command]))
      .rows[0] as any;
  const rejected = (operation: Promise<unknown>, code: string) =>
    assert.rejects(operation, (e: any) => e.code === code);
  try {
    await db.exec(await readFile(new URL('./sql/bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610070001_foundation.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610070002_chat.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.equal(
      (
        await db.query<{ relrowsecurity: boolean }>(
          "SELECT relrowsecurity FROM pg_class WHERE oid='private.comandos_chat'::regclass",
        )
      ).rows[0].relrowsecurity,
      true,
      'A tabela de recibos também deve habilitar RLS.',
    );
    const receiptMigration = await readFile(
      new URL('../supabase/migrations/202610070003_chat_receipts_rls.sql', import.meta.url),
      'utf8',
    );
    for (const id of [a, b, gm, spectator])
      await db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)', [
        id,
        { full_name: '<b>Autor</b>' },
      ]);
    await db.query("INSERT INTO public.campanhas(id,nome) VALUES($1,'Mesa'),($2,'Outra')", [
      c,
      other,
    ]);
    await db.query(
      "INSERT INTO public.membros_campanha VALUES($1,$2,'jogador'),($1,$3,'mestre'),($1,$4,'espectador'),($5,$6,'jogador')",
      [c, a, gm, spectator, other, b],
    );

    const request = crypto.randomUUID();
    const command = { tipo: 'rolagem', expressao: '4d6kh3+1d4-2', rotulo: 'Atributos' };
    const rolled = await send(a, command, request);
    assert.equal(rolled.sequencia, 1);
    assert.equal(rolled.autor_nome, '<b>Autor</b>');
    assert.equal(rolled.resultado.expressao, '4d6kh3+1d4-2');
    const terms = rolled.resultado.termos;
    const kept = [...terms[0].dados].sort((x: number, y: number) => y - x).slice(0, 3);
    assert.equal(terms[0].selecionados.length, 3);
    assert.equal(
      terms[0].subtotal,
      kept.reduce((x: number, y: number) => x + y, 0),
    );
    assert.equal(rolled.resultado.total, terms[0].subtotal + terms[1].dados[0] - 2);
    for (const term of terms.filter((x: any) => x.dados))
      assert.ok(term.dados.every((value: number) => value >= 1 && value <= term.faces));
    assert.deepEqual(await send(a, command, request), rolled);
    // A correção de uma instalação anterior preserva o recibo e o resultado existentes.
    await db.exec('ALTER TABLE private.comandos_chat DISABLE ROW LEVEL SECURITY;');
    await db.exec(receiptMigration);
    await db.exec(receiptMigration);
    assert.deepEqual(await send(a, command, request), rolled);
    // Mesmo se um grant for ampliado por engano, recibos permanecem fechados por RLS.
    await rejected(asUser(a, 'SELECT * FROM private.comandos_chat'), '42501');
    await db.exec(
      'GRANT USAGE ON SCHEMA private TO anon; GRANT SELECT,INSERT,UPDATE,DELETE ON private.comandos_chat TO anon,authenticated;',
    );
    assert.equal((await asUser(a, 'SELECT * FROM private.comandos_chat')).rows.length, 0);
    await rejected(
      asUser(a, 'INSERT INTO private.comandos_chat VALUES($1,$2,$3,$4,$5)', [
        a,
        crypto.randomUUID(),
        c,
        command,
        rolled.id,
      ]),
      '42501',
    );
    assert.equal(
      (await asUser(a, "UPDATE private.comandos_chat SET comando='{}' RETURNING *")).rows.length,
      0,
    );
    assert.equal((await asUser(a, 'DELETE FROM private.comandos_chat RETURNING *')).rows.length, 0);
    await db.exec('BEGIN; SET LOCAL ROLE anon;');
    try {
      assert.equal((await db.query('SELECT * FROM private.comandos_chat')).rows.length, 0);
    } finally {
      await db.exec('ROLLBACK');
    }
    await db.exec(
      'REVOKE ALL ON private.comandos_chat FROM anon,authenticated; REVOKE USAGE ON SCHEMA private FROM anon;',
    );
    assert.deepEqual(await send(a, command, request), rolled);
    await rejected(send(a, { ...command, expressao: '1d20' }, request), 'WC004');
    await rejected(send(a, command, request, other), 'WC002');
    assert.equal((await asUser(b, 'SELECT * FROM public.mensagens_chat')).rows.length, 0);
    assert.equal((await asUser(spectator, 'SELECT * FROM public.mensagens_chat')).rows.length, 1);
    await rejected(send(spectator, { tipo: 'texto', texto: 'Olá' }), 'WC002');
    await rejected(send(b, command), 'WC002');
    await rejected(
      asUser(
        a,
        "INSERT INTO public.mensagens_chat(campanha_id,autor_id,autor_nome,sequencia,tipo,texto) VALUES($1,$2,'Falso',2,'texto','Falso')",
        [c, a],
      ),
      '42501',
    );
    await rejected(asUser(a, "UPDATE public.mensagens_chat SET resultado='{}'"), '42501');
    await rejected(asUser(a, 'DELETE FROM public.mensagens_chat'), '42501');
    await rejected(asUser(a, "SELECT private.rolar_dados('1d20')"), '42501');

    for (const expressao of [
      '',
      '1d1',
      '0d20',
      '101d6',
      '60d6+50d6',
      '1d1001',
      '4d6kh0',
      '4d6kl5',
      '1d20*2',
      '1d20;SELECT 1',
      '1d20++2',
      '10000',
      '1d6+Infinity',
      '1d20'.repeat(31),
    ])
      await rejected(send(a, { tipo: 'rolagem', expressao }), 'WC003');
    for (const bad of [
      null,
      [],
      {},
      { tipo: 'texto', texto: ' ' },
      { tipo: 'texto', texto: 'x'.repeat(2001) },
      { tipo: 'rolagem', expressao: '1d20', total: 20 },
    ])
      await rejected(send(a, bad), 'WC003');
    const low = await send(a, { tipo: 'rolagem', expressao: '2d20kl1-3' });
    assert.equal(low.resultado.total, Math.min(...low.resultado.termos[0].dados) - 3);
    const text = await send(gm, { tipo: 'texto', texto: '  <script>Olá</script>\nMesa!  ' });
    assert.equal(text.texto, '<script>Olá</script>\nMesa!');
    assert.equal(text.resultado, null);
    assert.equal(text.sequencia, 3);
    const unicode = await send(a, { tipo: 'texto', texto: '測'.repeat(2000) });
    assert.equal(unicode.texto.length, 2000);

    const content = criarConteudo();
    const attack = { ...novaEntrada('ataques'), nome: 'Espada', valor: 7, dano: '2d6+4' };
    const profile = {
      ...novaEntrada('conjuracao.perfis'),
      nome: 'Mago',
      atributo: 'int',
      ajusteAtaque: 1,
      ajusteCd: 2,
    };
    const spell = { ...novaEntrada('magias'), nome: 'Raio', perfilId: profile.id };
    content.classes[0].nivel = 5;
    content.atributos.int.valor = 18;
    content.ataques.push(attack);
    content.conjuracao.perfis.push(profile);
    content.magias.push(spell);
    await asUser(a, 'INSERT INTO public.fichas(id,campanha_id,nome,conteudo) VALUES($1,$2,$3,$4)', [
      sheet,
      c,
      'Zephira',
      content,
    ]);
    const action = {
      tipo: 'acao',
      ficha_id: sheet,
      versao: 1,
      entrada_id: attack.id,
      acao: 'ataque',
      modo: 'vantagem',
    };
    const actionRequest = crypto.randomUUID();
    const hit = await send(a, action, actionRequest);
    assert.equal(hit.resultado.expressao, '2d20kh1+7');
    assert.equal(hit.resultado.origem.ficha_nome, 'Zephira');
    assert.equal(hit.resultado.origem.versao, 1);
    assert.equal(hit.rotulo, 'Zephira · Espada');
    const damage = await send(gm, { ...action, acao: 'dano', modo: 'normal' });
    assert.equal(damage.resultado.expressao, '2d6+4');
    const magic = await send(a, {
      ...action,
      entrada_id: spell.id,
      acao: 'magia_ataque',
      modo: 'desvantagem',
    });
    assert.equal(magic.resultado.expressao, '2d20kl1+8');
    const announced = await send(a, {
      ...action,
      entrada_id: spell.id,
      acao: 'magia',
      modo: 'normal',
    });
    assert.equal(announced.resultado.cd, 17);
    assert.equal(announced.resultado.total, undefined);
    await rejected(send(a, { ...action, versao: 2 }), 'WC005');
    await rejected(send(a, { ...action, bonus: 100 }), 'WC003');
    await rejected(send(b, action), 'WC002');
    const peer = '10000000-0000-4000-a000-000000000005';
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [peer]);
    await db.query("INSERT INTO public.membros_campanha VALUES($1,$2,'jogador')", [c, peer]);
    await rejected(send(peer, action), 'WC002');
    await asUser(a, 'SELECT * FROM public.salvar_ficha($1,1,$2,$3,1)', [sheet, 'Nova', content]);
    await rejected(send(a, action), 'WC005');
    assert.deepEqual(await send(a, action, actionRequest), hit);
    // Um reenvio já confirmado mantém o snapshot anterior mesmo após edição da ficha.
    assert.deepEqual(await send(a, command, request), rolled);

    for (let i = 0; i < 28; i++) await send(gm, { tipo: 'texto', texto: String(i) });
    await rejected(send(gm, { tipo: 'texto', texto: 'Além do limite' }), 'WC006');
    assert.deepEqual(await send(a, command, request), rolled);
    await db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      c,
      a,
    ]);
    assert.equal((await asUser(a, 'SELECT * FROM public.mensagens_chat')).rows.length, 0);
    await rejected(send(a, command, request), 'WC002');
  } finally {
    await db.close();
  }
});
