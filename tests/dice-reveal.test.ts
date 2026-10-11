import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../packages/contracts/chat';
import {
  concealedResults,
  initialRevealState,
  revealReducer,
} from '../apps/web/features/dice/reveal-state';

const presentation = (id: string) => ({
  message: { id } as ChatMessage,
  plan: { dice: [], groups: [], omitted: 0, unsupported: 0 },
  finished: false,
});
test('fila revela cada resultado apenas após seu término e mantém a última apresentação', () => {
  let state = revealReducer(initialRevealState, {
    type: 'show',
    presentation: presentation('primeiro'),
  });
  state = revealReducer(state, { type: 'show', presentation: presentation('segundo') });
  assert.deepEqual([...concealedResults(state)], ['primeiro', 'segundo']);
  state = revealReducer(state, { type: 'finish', id: 'primeiro' });
  assert.deepEqual([...concealedResults(state)], ['segundo']);
  assert.equal(state.current?.message.id, 'segundo');
  // Uma callback atrasada da cena já descartada não conclui a rolagem seguinte.
  state = revealReducer(state, { type: 'finish', id: 'primeiro' });
  assert.deepEqual([...concealedResults(state)], ['segundo']);
  state = revealReducer(state, { type: 'finish', id: 'segundo' });
  assert.equal(concealedResults(state).size, 0);
  assert.equal(state.current?.message.id, 'segundo');
  assert.equal(state.current?.finished, true);
});
test('recolher ou desligar libera toda a fila; revogação remove a apresentação', () => {
  let state = revealReducer(initialRevealState, {
    type: 'show',
    presentation: presentation('primeiro'),
  });
  state = revealReducer(state, { type: 'show', presentation: presentation('segundo') });
  state = revealReducer(state, { type: 'release' });
  assert.equal(concealedResults(state).size, 0);
  assert.equal(state.queue.length, 0);
  assert.equal(state.current?.finished, true);
  state = revealReducer(state, { type: 'clear' });
  assert.equal(state.current, null);
});
