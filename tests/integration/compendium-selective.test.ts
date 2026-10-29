import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compendiumFixture } from '../sql/compendium-fixture';
import { fixture } from '../fixtures/creation';
import { decodeCatalog } from '../../packages/compendium/decode';
import { resolveCreation } from '../../packages/character-creation/resolve';
import { resolveState } from '../../packages/character-creation/state';

test(
  'selective real catalog preserves character rules without traversing prerequisite class graphs',
  { timeout: 240000 },
  async () => {
    const f = await compendiumFixture();
    try {
      await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
      await f.db.exec(await readFile('supabase/compendium-seed.sql', 'utf8'));
      const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
      const find = (kind: string, name: string) =>
        snapshot.entries.find((e: any) => e.kind === kind && e.name === name);
      const wizard = find('classe', 'Mago'),
        species = find('especie', 'Talpas'),
        lineage = find('linhagem', 'Talpa Ferramenteiro');
      const refs = [wizard, species, lineage].map((e) => e.ref.revisionId);
      const start = performance.now();
      const original = (
        await f.anonymous('SELECT obter_compendio($1,$2) AS catalog', [refs, 'dnd-5e-2024'])
      )[0].catalog;
      const originalMs = performance.now() - start;
      const selectiveStart = performance.now();
      const selective = (
        await f.anonymous('SELECT obter_compendio_seletivo($1,$2) AS catalog', [
          refs,
          'dnd-5e-2024',
        ])
      )[0].catalog;
      const selectiveMs = performance.now() - selectiveStart;
      const full = decodeCatalog(original),
        lean = decodeCatalog(selective);
      assert.ok(lean.entries.length < full.entries.length / 2);
      assert.equal(lean.entries.filter((e) => e.kind === 'classe').length, 1);
      const { draft } = fixture();
      draft.speciesRef = species.ref;
      draft.lineageRef = lineage.ref;
      draft.backgroundRef = null;
      draft.size = 'pequeno';
      draft.form = 'normal';
      draft.classes[0].classRef = wizard.ref;
      assert.deepEqual(resolveCreation(lean, draft), resolveCreation(full, draft));
      const gadgets = resolveState(lean, draft).concessions.choices.find(
        (g) => g.group.name === 'Engenhocas Talpa funcionais',
      );
      assert.ok(gadgets);
      assert.equal(gadgets.group.maximum, 2);
      draft.choices = [
        {
          groupId: gadgets.group.id,
          sourceInstanceId: gadgets.instance.id,
          values: gadgets.group.options
            .slice(0, 2)
            .map((o) => ({ type: 'option', optionId: o.id })),
        },
      ];
      assert.deepEqual(resolveCreation(lean, draft), resolveCreation(full, draft));
      // Spell class membership remains usable, but choosing a spell does not import those classes.
      const spell = lean.entries.find((e) => e.kind === 'magia' && e.data.classRefs.length > 1);
      assert.ok(spell?.kind === 'magia');
      const rawSpell = (
        await f.anonymous('SELECT obter_compendio_seletivo($1,NULL) AS catalog', [
          [spell.ref.revisionId],
        ])
      )[0].catalog;
      const spellCatalog = decodeCatalog(rawSpell);
      assert.equal(spellCatalog.entries.filter((e) => e.kind === 'classe').length, 0);
      assert.deepEqual(
        spellCatalog.entries.find((e) => e.ref.revisionId === spell.ref.revisionId)?.data,
        spell.data,
      );
      process.stdout.write(
        JSON.stringify({
          originalMs: Math.round(originalMs),
          selectiveMs: Math.round(selectiveMs),
          originalBytes: Buffer.byteLength(JSON.stringify(original)),
          selectiveBytes: Buffer.byteLength(JSON.stringify(selective)),
          originalRecords: full.entries.length,
          selectiveRecords: lean.entries.length,
        }) + '\n',
      );
    } finally {
      await f.db.close();
    }
  },
);
