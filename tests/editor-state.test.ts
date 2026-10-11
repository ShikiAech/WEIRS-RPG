import test from 'node:test';
import assert from 'node:assert/strict';
import { saveRevision, markEdited, acknowledgeSave } from '../apps/web/lib/editor-state';
import { validatePublicConfig, callbackUrl } from '../apps/web/lib/config';

test('resposta de save atrasada não marca novas alterações como salvas', () => {
  const initial = { revision: 0, savedRevision: 0 };
  const edited = markEdited(initial);
  const submitted = saveRevision(edited);
  const newer = markEdited(edited);
  const acknowledged = acknowledgeSave(newer, submitted);
  assert.equal(acknowledged.revision, 2);
  assert.equal(acknowledged.savedRevision, 1);
  assert.notEqual(acknowledged.revision, acknowledged.savedRevision);
});

test('configuração ausente não conecta; segredo e JWT administrativo são recusados', () => {
  assert.equal(validatePublicConfig('', ''), null);
  assert.throws(() => validatePublicConfig('https://example.supabase.co', 'sb_secret_segredo'));
  const service = `eyJ.fake.${Buffer.from('{}').toString('base64url')}`;
  const jwt = `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.throws(() => validatePublicConfig('https://example.supabase.co', jwt));
  assert.throws(() => validatePublicConfig('http://example.supabase.co', service));
  assert.deepEqual(validatePublicConfig('https://example.supabase.co', 'sb_publishable_example'), {
    url: 'https://example.supabase.co',
    key: 'sb_publishable_example',
  });
  assert.equal(
    callbackUrl('https://weirs.example', '/WEIRS-RPG/'),
    'https://weirs.example/WEIRS-RPG/app.html',
  );
});
