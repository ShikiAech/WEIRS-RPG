import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compendiumFixture } from '../sql/compendium-fixture';
import { fixture } from '../fixtures/creation';
import { decodeCatalog } from '../../packages/compendium/decode';
import { resolveConcessions } from '../../packages/character-creation/concessions';
import { resolveCreation } from '../../packages/character-creation/resolve';
import { validateCreationRequest } from '../../packages/character-creation/server';

test(
  'full real compendium loads twice and creates a character from database choices',
  { timeout: 240000 },
  async () => {
    const f = await compendiumFixture();
    try {
      await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
      const sql = await readFile('supabase/compendium-seed.sql', 'utf8');
      await f.db.exec(sql);
      await f.db.exec(sql);
      const count = (
        await f.db.query<{ n: number }>('SELECT count(*)::int n FROM compendio_indice')
      ).rows[0].n;
      assert.ok(count >= 2985);
      const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
      const find = (kind: string, name: string, path?: string) =>
        snapshot.entries.find(
          (e: any) => e.kind === kind && e.name === name && (!path || e.source.path === path),
        );
      const species = find('especie', 'Anansis'),
        bg = find('antecedente', 'Criminoso', 'data/background.json'),
        cls = find('classe', 'Guerreiro');
      const raw = (
        await f.db.query<any>('SELECT obter_compendio($1,NULL) AS c', [
          [species.ref.revisionId, bg.ref.revisionId, cls.ref.revisionId],
        ])
      ).rows[0].c;
      const catalog = decodeCatalog(raw),
        draft = fixture().draft;
      draft.speciesRef = species.ref;
      draft.backgroundRef = bg.ref;
      draft.classes[0].classRef = cls.ref;
      draft.abilities.external = { for: 14, des: 14, con: 14, int: 14, sab: 14, car: 14 };
      draft.abilities.backgroundBonuses = { des: 2, con: 1 };
      draft.size = 'pequeno';
      draft.form = 'normal';
      draft.equipmentOptions = [bg, cls].map((e: any) => {
        const option = catalog.equipmentOptions
          .filter((o) => o.ownerRevisionId === e.ref.revisionId)
          .sort((a, b) => (a.key < b.key ? -1 : 1))
          .at(-1)!;
        return { ownerRevisionId: e.ref.revisionId, optionId: option.id };
      });
      for (let pass = 0; pass < 3; pass++)
        for (const { group, instance } of resolveConcessions(catalog, draft).choices) {
          if (
            draft.choices.some((c) => c.sourceInstanceId === instance.id && c.groupId === group.id)
          )
            continue;
          const options =
            group.featCategory === 'estilo-luta'
              ? group.options.filter((o) =>
                  catalog.entries.some(
                    (e) =>
                      e.ref.revisionId === o.targetRef?.revisionId && e.originalName === 'Archery',
                  ),
                )
              : group.options;
          draft.choices.push({
            groupId: group.id,
            sourceInstanceId: instance.id,
            values: options
              .slice(0, group.minimum)
              .map((o) => ({ type: 'option', optionId: o.id })),
          });
        }
      const preview = resolveCreation(catalog, draft);
      assert.deepEqual(preview.problems, []);
      assert.ok(preview.sheet);
      assert.equal(preview.sheet.magias.find((s) => s.nome === 'Mãos Mágicas')?.perfilId, '');
      assert.deepEqual(preview, resolveCreation(snapshot, draft));
      await f.db.exec(
        await readFile('supabase/migrations/202610160012_criacao_personagem.sql', 'utf8'),
      );
      const request = {
        campaignId: f.campaign,
        requestId: crypto.randomUUID(),
        name: 'Compêndio real',
        draft,
        expectedSheet: preview.sheet,
      };
      const canonical = validateCreationRequest(catalog, request);
      const args = [
        f.player,
        f.campaign,
        request.name,
        request.requestId,
        draft,
        canonical.content,
        canonical.snapshot.contributions,
      ];
      const created = (
        await f.db.query<any>(
          'SELECT * FROM registrar_criacao_personagem($1,$2,$3,$4,$5,$6,$7)',
          args,
        )
      ).rows[0];
      assert.deepEqual(created.conteudo, canonical.content);
      process.stdout.write(
        JSON.stringify({
          published: count,
          closure: catalog.entries.length,
          profiles: catalog.castingProfiles.length,
          hitPoints: created.conteudo.combate.pvMaximos,
          contributions: canonical.snapshot.contributions.length,
        }) + '\n',
      );
    } finally {
      await f.db.close();
    }
  },
);
