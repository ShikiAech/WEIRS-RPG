import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConteudo } from '../packages/sheets/modelo.js';
import { readSheetFile } from '../apps/web/lib/sheet-file';

test('cópia exportada recupera zeros, decimais e homebrew sem importar proprietário ou campanha', () => {
  const content = criarConteudo();
  content.identidade.especie = 'Inamon';
  content.combate.pvTemporarios = 0;
  const recovered = readSheetFile(
    JSON.stringify({
      nome: 'Ímpio',
      conteudo: content,
      versao_esquema: 1,
      campanha_id: 'campanha-de-outra-pessoa',
      proprietario_id: 'outra-conta',
    }),
  );
  assert.deepEqual(recovered, { name: 'Ímpio', content });
});
test('importação rejeita JSON corrompido, schema desconhecido, seções inválidas e arquivo excessivo', () => {
  for (const value of [
    'null',
    '{}',
    '{',
    'x'.repeat(262145),
    JSON.stringify({ nome: 'Ímpio', conteudo: criarConteudo(), versao_esquema: 2 }),
  ])
    assert.throws(() => readSheetFile(value));
});
