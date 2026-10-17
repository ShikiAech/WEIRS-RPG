import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreationHandler } from '../packages/character-creation/http';
import { fixture, id } from './fixtures/creation';
import { resolveCreation } from '../packages/character-creation/resolve';
import type { SheetRecord } from '../packages/contracts/sheets';
test('confirmed receipt is recovered before reading a changed or unavailable catalog', async () => {
  const { catalog, draft } = fixture();
  const content = resolveCreation(catalog, draft).sheet!;
  let reads = 0,
    saves = 0;
  const record = { id: id(99), conteudo: content } as SheetRecord;
  const handler = createCreationHandler({
    authenticate: async () => id(98),
    recover: async () => record,
    compendium: () => {
      reads++;
      throw Error('Catálogo mudou');
    },
    persist: async () => {
      saves++;
      throw Error();
    },
  });
  const response = await handler(
    new Request('http://localhost/criar', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({
        campaignId: id(97),
        requestId: id(96),
        name: 'Teste',
        draft,
        expectedSheet: content,
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(reads, 0);
  assert.equal(saves, 0);
  assert.equal((await response.json()).record.id, record.id);
});
