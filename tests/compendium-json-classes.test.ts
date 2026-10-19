import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readClassJsonSource } from '../tools/compendium-import/json-classes';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { readJsonSources } from '../tools/compendium-import/json';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';

const root = process.cwd();
test('class JSON imports every class, subclass and level feature from the authored source', async () => {
  const rows = JSON.parse(await readFile('data/classes.json', 'utf8'));
  const source = await readClassJsonSource(root, 'test-commit');
  assert.equal(source.path, 'data/classes.json');
  assert.equal(source.commit, 'test-commit');
  assert.equal(source.records.filter((r) => r.kind === 'classe').length, rows.length);
  assert.equal(
    source.records.filter((r) => r.kind === 'subclasse').length,
    rows.reduce((n: number, c: any) => n + c.subclasses.length, 0),
  );
  for (const row of rows) {
    const cls = source.records.find((r) => r.kind === 'classe' && r.name === row.name_pt)!;
    assert.equal(cls.payload.type, 'class');
    assert.ok(cls.description.includes(row.description));
    assert.ok(source.records.some((r) => r.parentKey === cls.key && r.name === row.feats[0].name));
  }
});

test('JSON classes replace legacy values while keeping class identities, progression and child references', async () => {
  const [legacy, json, classes, registry, curation] = await Promise.all([
    readLegacySources(root),
    readJsonSources(root),
    readClassJsonSource(root),
    readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
    loadCuration(root),
  ]);
  registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
  const normalized = normalizeSources(
    [...legacy, ...json.filter((s) => s.path !== classes.path), classes],
    registry,
  );
  const catalog = resolveCatalog(normalized, curation);
  for (const [name, oldName] of [
    ['Artífice', 'Artífice'],
    ['Atirador', 'Pistoleiro'],
    ['Psiônico (UA)', 'Psionista (Psion)'],
  ]) {
    const old = legacy
      .flatMap((s) => s.records)
      .find((r) => r.kind === 'classe' && r.name === oldName)!;
    const matches = catalog.entries.filter((r) => r.kind === 'classe' && r.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].ref.recordId, registry.records[old.key]);
    assert.equal(matches[0].sourcePath, classes.path);
    assert.ok(
      catalog.progressionCells.some((p) => p.ownerRevisionId === matches[0].ref.revisionId),
    );
  }
  for (const name of ['Estrategista', 'Amaldiçoado', 'Necromante'])
    assert.ok(catalog.entries.some((r) => r.kind === 'classe' && r.name === name));
  const fighter = catalog.entries.find((r) => r.kind === 'classe' && r.name === 'Guerreiro')!;
  assert.ok(fighter.kind === 'classe');
  assert.deepEqual(fighter.data.primaryAbilities, ['for', 'des']);
  assert.ok(
    catalog.choices
      .find((g) => g.ownerRevisionId === fighter.ref.revisionId && g.key === 'pericias')
      ?.options.some(
        (o) => catalog.proficiencies.find((p) => p.id === o.proficiencyId)?.skill === 'persuasao',
      ),
  );
  const shadows = catalog.entries.find(
    (e) => e.name === 'Armadura das Sombras' && e.kind === 'caracteristica',
  )!;
  assert.equal(shadows.sourcePath, classes.path);
  assert.ok(
    !catalog.requirements.some(
      (r) => r.ownerRevisionId === shadows.ref.revisionId && r.operator === 'nivel-classe',
    ),
  );
  assert.ok(
    catalog.entries.some((e) => e.name === 'Explosão Agonizante' && e.kind === 'caracteristica'),
  );
  assert.ok(
    !catalog.issues.some(
      (i) => i.code === 'UNRESOLVED_REFERENCE' && /Origem|Classe da subclasse/.test(i.message),
    ),
  );
  const toolChoice = (name: string) => {
    const owner = catalog.entries.find((e) => e.kind === 'classe' && e.name === name)!;
    return catalog.choices.find(
      (g) => g.ownerRevisionId === owner.ref.revisionId && g.key === 'ferramentas-json',
    );
  };
  const gaming = toolChoice('Pugilista');
  assert.ok(gaming);
  assert.deepEqual([gaming.minimum, gaming.maximum, gaming.acquisition], [1, 1, 'inicial']);
  assert.deepEqual(
    gaming.options.map((o) => o.name).sort(),
    ['Baralho', 'Conjunto do Jogo dos Três Dragões', 'Dados', 'Xadrez-do-Dragão'].sort(),
  );
  const anyTools = toolChoice('Estrategista');
  assert.ok(anyTools);
  assert.deepEqual([anyTools.minimum, anyTools.maximum], [2, 2]);
  assert.ok(anyTools.options.some((o) => o.name === 'Ferramentas de Ladrão'));
  assert.ok(anyTools.options.some((o) => o.name === 'Alaúde'));
  assert.ok(
    !anyTools.options.some((o) => ['Kit de Jogos', 'Instrumento Musical'].includes(o.name)),
  );
  for (const name of ['Artífice', 'Bardo', 'Monge']) assert.ok(!toolChoice(name));
  const gunner = catalog.entries.find((e) => e.kind === 'classe' && e.name === 'Atirador')!;
  assert.ok(gunner.kind === 'classe');
  const guns = gunner.data.proficiencies.flatMap((g) => {
    const p = catalog.proficiencies.find((p) => p.id === g.proficiencyId);
    return p?.equipment
      ? [catalog.entries.find((e) => e.ref.revisionId === p.equipment!.revisionId)?.name]
      : [];
  });
  for (const name of ['Mosquete', 'Pistola', 'Bacamarte de Éter', 'Arco Longo', 'Besta de Mão'])
    assert.ok(guns.includes(name), name);
  for (const name of ['Rapieira', 'Espada Longa']) assert.ok(!guns.includes(name), name);
  assert.ok(
    !gunner.data.proficiencies.some(
      (g) =>
        catalog.proficiencies.find((p) => p.id === g.proficiencyId)?.category === 'arma-marcial',
    ),
  );
});
