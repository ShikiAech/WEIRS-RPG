import test from 'node:test';
import assert from 'node:assert/strict';
import { spellToSheet } from '../packages/compendium/sheet-adapter';
test('spell adapter uses typed metadata and pins revision without parsing HTML', async () => {
  const {readFile}=await import('node:fs/promises');
  const snapshot=JSON.parse(await readFile('public/compendium/demo.json','utf8'));
  const spell=snapshot.catalog.entries.find((e:any)=>e.kind==='magia'&&e.name==='Simulacro');
  const result=spellToSheet({...spell,descriptionHtml:'<script>throw new Error()</script>'},'profile');
  assert.match(result.material,/1\.500\+ PO.*consome/);
  assert.ok(result.duracao);
  assert.deepEqual(result.compendioRef,spell.ref);
  assert.equal(result.perfilId,'profile');
});
