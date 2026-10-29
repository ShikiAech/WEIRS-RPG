import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
import { novaEntrada } from '../packages/sheets/modelo.js';

test('atualização do chat habilita os mesmos pedidos de descrição recusados pelo servidor antigo', async () => {
  const f = await mesaFixture([
    '202610110005_rolagens_secretas.sql',
    '202610120010_danos_magias.sql',
  ]);
  try {
    const saved = (await f.db.query<any>('SELECT * FROM public.fichas WHERE id=$1', [f.sheet]))
      .rows[0];
    const spell = { ...novaEntrada('magias'), nome: 'Luz', descricao: 'Ilumina o ambiente.' };
    saved.conteudo.magias.push(spell);
    saved.conteudo.pericias.arcanismo.descricao = 'Conhecimento sobre magia.';
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [saved.conteudo, f.sheet]);
    const attempts = [
      { action: 'descricao_magia', entry: spell.id, text: spell.descricao },
      {
        action: 'descricao_pericia',
        entry: 'arcanismo',
        text: saved.conteudo.pericias.arcanismo.descricao,
      },
    ].map(({ action, entry, text }) => ({
      text,
      request: crypto.randomUUID(),
      command: {
        tipo: 'acao',
        ficha_id: f.sheet,
        versao: saved.versao + 1,
        entrada_id: entry,
        acao: action,
        modo: 'normal',
      },
    }));
    const send = (attempt: (typeof attempts)[number]) =>
      f.user(f.player, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        f.campaign,
        attempt.request,
        attempt.command,
      ]);
    for (const attempt of attempts)
      await assert.rejects(send(attempt), { code: 'WC003', message: 'Ação inválida.' });
    assert.equal((await f.db.query('SELECT * FROM public.mensagens_chat')).rows.length, 0);

    await f.db.exec(
      await readFile(
        new URL('../supabase/migrations/202610280016_combate_chat.sql', import.meta.url),
        'utf8',
      ),
    );
    for (const attempt of attempts) {
      const rows = await send(attempt);
      assert.equal(rows[0].resultado.descricao.texto, attempt.text);
      assert.equal(rows[0].resultado.origem.acao, attempt.command.acao);
      assert.deepEqual(await send(attempt), rows, 'Repetir o pedido recupera a mesma mensagem.');
    }
    assert.equal((await f.db.query('SELECT * FROM public.mensagens_chat')).rows.length, 2);
  } finally {
    await f.db.close();
  }
});
