import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readRoll20Pdf,
  MAX_ROLL20_PDF_BYTES,
  checkPdfPageSize,
} from '../apps/web/lib/roll20-pdf-file';

test('leitura do PDF rejeita limite, vazio e assinatura incorreta antes de carregar PDF.js', async () => {
  let read = false;
  await assert.rejects(
    readRoll20Pdf({
      size: MAX_ROLL20_PDF_BYTES + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    }),
    /10 MiB/,
  );
  assert.equal(read, false);
  await assert.rejects(
    readRoll20Pdf({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) }),
    /vazio/,
  );
  await assert.rejects(
    readRoll20Pdf({ size: 5, arrayBuffer: async () => new TextEncoder().encode('abcde').buffer }),
    /PDF válido/,
  );
});
test('leitura cancelada não abre nem aplica conteúdo', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readRoll20Pdf(
      { size: 10, arrayBuffer: async () => new ArrayBuffer(10) },
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
});
test('páginas com dimensões enormes são rejeitadas antes de alocar pixels', () => {
  assert.doesNotThrow(() => checkPdfPageSize(612, 792));
  for (const [w, h] of [
    [10000, 10000],
    [Infinity, 792],
    [612, NaN],
    [0, 0],
    [1800, 1800],
  ])
    assert.throws(() => checkPdfPageSize(w, h), /páginas grandes|dimensões/i);
});
