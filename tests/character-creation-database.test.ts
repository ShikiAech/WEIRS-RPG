import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCreationRequest } from '../packages/character-creation/server';
import { resolveCreation } from '../packages/character-creation/resolve';
import { fixture, id } from './fixtures/creation';
import { compendiumFixture } from './sql/compendium-fixture';
import { validarFicha } from '../packages/sheets/modelo.js';

test('server rebuilds canonical projection, rejects forged preview and malformed drafts', async () => {
  const { catalog, draft } = fixture();
  const preview = resolveCreation(catalog, draft);
  const request = {
    campaignId: id(800),
    name: 'Personagem',
    requestId: id(801),
    draft,
    expectedSheet: preview.sheet,
  };
  const value = validateCreationRequest(catalog, request);
  assert.equal(value.content.combate.pvMaximos, preview.hitPoints.total);
  assert.deepEqual(value.snapshot.draft, draft);
  const forged = structuredClone(request);
  forged.expectedSheet!.combate.pvMaximos = 999;
  assert.throws(() => validateCreationRequest(catalog, forged), /prévia/i);
  assert.throws(() =>
    validateCreationRequest(catalog, {
      ...request,
      draft: { ...draft, classes: [...draft.classes, ...draft.classes] },
    }),
  );
  assert.throws(() =>
    validateCreationRequest(catalog, { ...request, draft: { ...draft, levels: null } }),
  );
  const manual = structuredClone(value.content);
  assert.equal(validarFicha({ nome: 'A', versao_esquema: 1, conteudo: manual }).length, 0);
  manual.criacao!.draft.abilities.external.for = -1;
  assert.ok(validarFicha({ nome: 'A', versao_esquema: 1, conteudo: manual }).length);
});
test('SQL creation is server-only, atomic, idempotent and private', async () => {
  const f = await compendiumFixture();
  try {
    await f.db.exec(
      await readFile('supabase/migrations/202610160012_criacao_personagem.sql', 'utf8'),
    );
    const { catalog, draft } = fixture();
    for (const e of catalog.entries) {
      await f.db.query('INSERT INTO compendio_registros(id,tipo,slug) VALUES($1,$2,$3)', [
        e.ref.recordId,
        e.kind,
        e.slug,
      ]);
      await f.db.query(
        "INSERT INTO compendio_revisoes(id,registro_id,numero,conjunto_regras_codigo,fonte_id,nome_pt,descricao_pt) VALUES($1,$2,1,'dnd-5e-2024',$3,$4,'Teste')",
        [e.ref.revisionId, e.ref.recordId, f.sourceId, e.name],
      );
      if (e.kind === 'especie') {
        await f.db.query('INSERT INTO compendio_especies(revisao_id) VALUES($1)', [
          e.ref.revisionId,
        ]);
        await f.db.query(
          "INSERT INTO compendio_deslocamentos(revisao_id,modo,distancia,unidade) VALUES($1,'terrestre',30,'pes')",
          [e.ref.revisionId],
        );
      }
      if (e.kind === 'classe')
        await f.db.query('INSERT INTO compendio_classes(revisao_id,dado_vida) VALUES($1,8)', [
          e.ref.revisionId,
        ]);
      if (e.kind === 'antecedente')
        await f.db.query(
          "INSERT INTO compendio_antecedentes(revisao_id,distribuicao_atributos) VALUES($1,'2-1-ou-1-1-1')",
          [e.ref.revisionId],
        );
    }
    await f.user(f.admin, 'SELECT publicar_compendio_lote($1)', [
      catalog.entries.map((e) => e.ref.revisionId),
    ]);
    const request = {
      campaignId: f.campaign,
      name: 'Criado',
      requestId: id(802),
      draft,
      expectedSheet: resolveCreation(catalog, draft).sheet,
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
    const sql = 'SELECT * FROM registrar_criacao_personagem($1,$2,$3,$4,$5,$6,$7)';
    await assert.rejects(f.user(f.player, sql, args), /permission denied/);
    const row = (await f.db.query<any>(sql, args)).rows[0];
    assert.equal(row.conteudo.combate.pvMaximos, canonical.content.combate.pvMaximos);
    assert.equal((await f.db.query<any>(sql, args)).rows[0].id, row.id);
    const recovery = 'SELECT * FROM recuperar_criacao_personagem($1,$2,$3,$4,$5)';
    const recoveryArgs = [
      request.requestId,
      f.campaign,
      request.name,
      draft,
      request.expectedSheet,
    ];
    assert.equal((await f.user(f.player, recovery, recoveryArgs))[0].id, row.id);
    assert.equal((await f.user(f.spectator, recovery, recoveryArgs))[0]?.id ?? null, null);
    await assert.rejects(
      f.user(f.player, recovery, [
        request.requestId,
        f.campaign,
        'Outro nome',
        draft,
        request.expectedSheet,
      ]),
      /Tentativa/,
    );
    await assert.rejects(
      f.db.query(sql, [...args.slice(0, 2), 'Diferente', ...args.slice(3)]),
      /Tentativa/,
    );
    await assert.rejects(
      f.db.query(sql, [f.spectator, f.campaign, request.name, id(803), ...args.slice(4)]),
      /Acesso/,
    );
    assert.equal((await f.user(f.spectator, 'SELECT * FROM ficha_criacoes')).length, 0);
    assert.equal((await f.user(f.player, 'SELECT * FROM ficha_criacoes')).length, 1);
    await assert.rejects(
      f.user(f.player, 'DELETE FROM ficha_criacoes WHERE ficha_id=$1', [row.id]),
      /permission denied/,
    );
    const bad = structuredClone(canonical.snapshot.contributions);
    bad[0].sourceRevisionId = id(999);
    await assert.rejects(
      f.db.query(sql, [f.player, f.campaign, request.name, id(804), draft, canonical.content, bad]),
    );
    assert.equal(
      (await f.db.query<any>('SELECT count(*)::int n FROM fichas WHERE id=$1', [id(804)])).rows[0]
        .n,
      0,
    );
    const brokenDraft = structuredClone(draft),
      brokenContent = structuredClone(canonical.content);
    brokenDraft.levels[0].classEntryId = id(999);
    brokenContent.criacao!.draft = brokenDraft;
    await assert.rejects(
      f.db.query(sql, [
        f.player,
        f.campaign,
        request.name,
        id(805),
        brokenDraft,
        brokenContent,
        canonical.snapshot.contributions,
      ]),
    );
    assert.equal(
      (await f.db.query<any>('SELECT count(*)::int n FROM fichas WHERE id=$1', [id(805)])).rows[0]
        .n,
      0,
    );
    const malformed = structuredClone(canonical.content);
    malformed.criacao!.draft.abilities.external.for = -1;
    await assert.rejects(
      f.user(f.player, 'SELECT salvar_ficha($1,1,$2,$3,1)', [row.id, 'Editado', malformed]),
      /Histórico/,
    );
    await f.db.query("INSERT INTO campanhas(id,nome) VALUES($1,'Destino')", [id(806)]);
    const copied = (
      await f.user(f.admin, 'SELECT * FROM copiar_ficha_campanha($1,1,$2,$3)', [
        row.id,
        id(806),
        id(807),
      ])
    )[0];
    assert.deepEqual(copied.conteudo.criacao, canonical.content.criacao);
    assert.equal(
      (await f.user(f.player, 'SELECT * FROM ficha_criacao_classes WHERE ficha_id=$1', [copied.id]))
        .length,
      1,
    );
  } finally {
    await f.db.close();
  }
});
