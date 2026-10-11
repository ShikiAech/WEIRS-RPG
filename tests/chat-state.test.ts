import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFromText, mergeMessages, catchUp } from '../apps/web/lib/chat-state';
import type { ChatMessage } from '../packages/contracts/chat';

const message = (sequence: number): ChatMessage => ({
  id: String(sequence),
  campanha_id: 'mesa',
  sequencia: sequence,
  autor_id: 'a',
  autor_nome: 'Autor',
  tipo: 'texto',
  texto: String(sequence),
  rotulo: '',
  resultado: null,
  criado_em: '2026-10-07T12:00:00Z',
});

test('comandos de dados são explícitos e texto comum permanece texto', () => {
  assert.deepEqual(commandFromText('  /r 2d6+3 '), { tipo: 'rolagem', expressao: '2d6+3' });
  assert.deepEqual(commandFromText('/roll 4d6kh3'), { tipo: 'rolagem', expressao: '4d6kh3' });
  assert.deepEqual(commandFromText('/gmroll 2d20kh1+5'), {
    tipo: 'rolagem',
    expressao: '2d20kh1+5',
    secreta: true,
  });
  assert.deepEqual(commandFromText('/GR 1d6'), {
    tipo: 'rolagem',
    expressao: '1d6',
    secreta: true,
  });
  assert.deepEqual(commandFromText('Olá\nMesa'), { tipo: 'texto', texto: 'Olá\nMesa' });
  assert.throws(() => commandFromText('/r'), /expressão/i);
  assert.throws(() => commandFromText('   '), /mensagem/i);
  assert.throws(() => commandFromText('/r ' + '1'.repeat(121)), /120/);
  assert.throws(() => commandFromText('/gm 1d20'), /comando/i);
});

test('eventos fora de ordem e respostas repetidas aparecem uma vez em ordem', () => {
  assert.deepEqual(
    mergeMessages([message(3), message(1)], [message(2), message(3)]).map((m) => m.sequencia),
    [1, 2, 3],
  );
});

test('reconexão busca todas as páginas sem usar evento avulso como cursor', async () => {
  const rows = Array.from({ length: 125 }, (_, i) => message(i + 11));
  const seen: number[] = [];
  const result = await catchUp(10, async (after) => {
    seen.push(after);
    return rows.filter((r) => r.sequencia > after).slice(0, 50);
  });
  assert.equal(result.cursor, 135);
  assert.equal(result.messages.length, 125);
  assert.deepEqual(seen, [10, 60, 110]);
  // Uma falha não devolve um cursor que poderia esconder registros em nova tentativa.
  await assert.rejects(
    catchUp(10, async () => {
      throw new Error('offline');
    }),
    /offline/,
  );
});
