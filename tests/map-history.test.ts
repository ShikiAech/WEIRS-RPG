import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inverseCommand,
  rebaseVersions,
  remapTokenIds,
} from '../apps/web/features/tabletop/map-history';
import type { SceneRecord, TokenRecord } from '../packages/contracts/tabletop';
const token = {
  id: 'a',
  cena_id: 's',
  versao: 4,
  x: 2,
  y: 3,
  tamanho: 1,
  cor: '#ffffff',
} as TokenRecord;
const scene = {
  id: 's',
  versao: 8,
  fundo_x: 0,
  fundo_y: 1,
  fundo_escala: 1,
  desenhos: [],
  revelacoes: [],
} as unknown as SceneRecord;

test('undo retains the acknowledged version instead of adopting a later external edit', () => {
  const undo = inverseCommand(
    { tipo: 'token_atualizar', id: 'a', versao: 4, patch: { x: 7, y: 3 } },
    { token: { ...token, x: 7, versao: 5 } },
    [token],
    scene,
  );
  assert.deepEqual(undo, { tipo: 'token_atualizar', id: 'a', versao: 5, patch: { x: 2, y: 3 } });
  assert.equal((undo as { versao: number }).versao, 5);
});

test('duplicate undo deletes only the confirmed new identities atomically', () => {
  const undo = inverseCommand(
    { tipo: 'tokens_duplicar', cena_id: 's', tokens: [{ id: 'a', versao: 4 }], dx: 1, dy: 1 },
    { tokens: [{ ...token, id: 'copy', versao: 1 }] },
    [token],
    scene,
  );
  assert.deepEqual(undo, {
    tipo: 'tokens_lote',
    cena_id: 's',
    itens: [{ tipo: 'token_excluir', id: 'copy', versao: 1 }],
  });
});

test('a confirmed own undo rebases older local versions without rebasing unrelated tokens', () => {
  const command = {
    tipo: 'tokens_lote' as const,
    cena_id: 's',
    itens: [
      { tipo: 'token_atualizar' as const, id: 'a', versao: 2, patch: { x: 1 } },
      { tipo: 'token_atualizar' as const, id: 'b', versao: 7, patch: { x: 4 } },
    ],
  };
  const rebased = rebaseVersions(command, { token: { ...token, versao: 4 } });
  assert.deepEqual(rebased, {
    ...command,
    itens: [{ ...command.itens[0], versao: 4 }, command.itens[1]],
  });
});
test('redo of a moved copy follows the new identity returned by re-duplication', () => {
  const command = {
    tipo: 'token_atualizar' as const,
    id: 'deleted-copy',
    versao: 3,
    patch: { x: 9 },
  };
  const remapped = remapTokenIds(command, new Map([['deleted-copy', 'new-copy']]));
  assert.deepEqual(
    rebaseVersions(remapped, { tokens: [{ ...token, id: 'new-copy', versao: 1 }] }),
    { ...command, id: 'new-copy', versao: 1 },
  );
});

test('undo restores changed scene fields only and does not include irreversible or session operations', () => {
  const undo = inverseCommand(
    { tipo: 'cena_atualizar', id: 's', versao: 8, patch: { fundo_x: 2, fundo_escala: 1.5 } },
    { cena: { ...scene, versao: 9, fundo_x: 2, fundo_escala: 1.5 } },
    [token],
    scene,
  );
  assert.deepEqual(undo, {
    tipo: 'cena_atualizar',
    id: 's',
    versao: 9,
    patch: { fundo_x: 0, fundo_escala: 1 },
  });
  assert.equal(
    inverseCommand(
      { tipo: 'token_excluir', id: 'a', versao: 4 },
      { excluido: 'a' },
      [token],
      scene,
    ),
    null,
  );
});

test('new wall/object creations have versioned inverse deletions; layer visibility is not guessed', () => {
  const wall = {
    id: 'wall',
    campanha_id: 'c',
    cena_id: 's',
    versao: 1,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    porta: false,
    aberta: false,
  };
  assert.deepEqual(
    inverseCommand(
      { tipo: 'parede_criar', cena_id: 's', x1: 0, y1: 0, x2: 1, y2: 1 },
      { parede: wall },
      [],
    ),
    { tipo: 'parede_excluir', id: 'wall', versao: 1 },
  );
  assert.equal(
    inverseCommand(
      { tipo: 'camada_atualizar', id: 'l', versao: 1, patch: { visivel: false } },
      {},
      [],
    ),
    null,
  );
});
