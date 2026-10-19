import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';

const root = process.cwd();
const sources = Promise.all([readLegacySources(root), readJsonSources(root)]);
const resolved = sources.then(async ([legacy, json]) => {
  const registry = JSON.parse(await readFile('content/compendium/identities.json', 'utf8'));
  const curation = await loadCuration(root);
  registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
  return {
    legacy,
    catalog: resolveCatalog(normalizeSources([...legacy, ...json], registry), curation),
  };
});

test('JSON classes and spells participate in the real catalog import', async () => {
  const [, json] = await sources;
  const classes = json.find((s) => s.path === 'data/classes.json');
  const spells = json.find((s) => s.path === 'data/spells.json');
  assert.ok(classes, 'classes.json was ignored');
  assert.ok(spells, 'spells.json was ignored');
  assert.equal(classes.records.filter((r) => r.kind === 'classe').length, 20);
  assert.equal(classes.records.filter((r) => r.kind === 'subclasse').length, 143);
  assert.equal(spells.records.length, 656);
});

test('revised JSON spells keep legacy identities and search aliases after translation changes', async () => {
  const { legacy, catalog } = await resolved;
  for (const originalName of ['Acid Splash', 'Chill Touch', 'Cure Wounds', 'Witch Bolt']) {
    const old = legacy
      .flatMap((s) => s.records)
      .find(
        (r) => r.kind === 'magia' && r.originalName.toLowerCase() === originalName.toLowerCase(),
      )!;
    const spell = catalog.entries.filter(
      (e) => e.kind === 'magia' && e.originalName === originalName,
    );
    assert.equal(spell.length, 1, originalName + ' should resolve to one current concept');
    assert.equal(spell[0].source.path, 'data/spells.json');
    assert.ok(
      spell[0].legacyIds.includes(old.legacyId!),
      originalName + ' lost its legacy reference',
    );
    if (old.name !== spell[0].name)
      assert.ok(spell[0].aliases.includes(old.name), old.name + ' lost searchability');
  }
});

test('JSON rules replace old spell values without treating healing as damage', async () => {
  const { catalog } = await resolved;
  const spell = (name: string) => {
    const entry = catalog.entries.find((e) => e.kind === 'magia' && e.originalName === name)!;
    assert.equal(entry.kind, 'magia');
    if (entry.kind !== 'magia') throw Error(name);
    return entry;
  };
  const chill = spell('Chill Touch');
  assert.equal(chill.data.range, 'Toque');
  assert.equal(chill.data.damages[0]?.dice, '1d10');
  assert.equal(spell('Acid Splash').data.school, 'Evocação');
  const cure = spell('Cure Wounds');
  assert.equal(cure.data.school, 'Abjuração');
  assert.match(cure.description, /2d8/);
  assert.equal(cure.data.damages.length, 0);
  assert.equal(spell('Witch Bolt').data.rangeFeet, 60);
  const names = chill.data.classRefs
    .map((r) => catalog.entries.find((e) => e.ref.revisionId === r.revisionId)?.name)
    .sort();
  assert.deepEqual(names, ['Bruxo', 'Feiticeiro', 'Mago']);
});

test('replaced legacy features retire from current search while their revisions remain stored', async () => {
  const { catalog } = await resolved;
  assert.ok(
    catalog.retiredRecordIds?.length,
    'the previous class feature set needs explicit retirement',
  );
  assert.ok(
    catalog.retiredRecordIds.every((id) => !catalog.entries.some((e) => e.ref.recordId === id)),
  );
});

test('class equipment packages preserve their published identities after switching source formats', async () => {
  const { legacy, catalog } = await resolved;
  const registry = JSON.parse(await readFile('content/compendium/identities.json', 'utf8'));
  const old = legacy
    .flatMap((s) => s.records)
    .find((r) => r.kind === 'classe' && r.name === 'Guerreiro')!;
  const fighter = catalog.entries.find((e) => e.kind === 'classe' && e.originalName === 'Fighter')!;
  const option = catalog.equipmentOptions.find(
    (o) => o.ownerRevisionId === fighter.ref.revisionId && o.key === 'A',
  )!;
  assert.equal(option.packageRef.recordId, registry.records[old.key + ':package:A']);
});

test('renamed class features remain searchable by their previous Portuguese names', async () => {
  const { catalog } = await resolved;
  for (const [name, oldName] of [
    ['Explosão Agonizante', 'Rajada Agonizante'],
    ['Salto Sobrenatural', 'Salto Extraplanar'],
    ['Companheiro Primal', 'Companheiro Primitivo'],
  ]) {
    const feature = catalog.entries.find((e) => e.kind === 'caracteristica' && e.name === name)!;
    assert.ok(feature.aliases.includes(oldName), oldName);
  }
});

test('legacy fallback mechanics and dependent spells receive new immutable revisions', async () => {
  const [legacy, json] = await sources;
  const registry = JSON.parse(await readFile('content/compendium/identities.json', 'utf8'));
  const curation = await loadCuration(root);
  const imported = normalizeSources([...legacy, ...json], registry);
  const first = resolveCatalog(imported, curation);
  const changed = structuredClone(imported);
  const bard = changed.records.find((r) => r.kind === 'classe' && r.originalName === 'Bard')!;
  const fallback = bard.alternatives.find((a) => a.payload.type === 'legacy')!;
  fallback.sourceHash = 'changed-legacy-progression';
  if (fallback.payload.type === 'legacy')
    fallback.payload.entry.descriptionHtml += '<p>Correção da progressão.</p>';
  const second = resolveCatalog(changed, curation);
  for (const originalName of ['Bard', 'Dancing Lights']) {
    const before = first.entries.find((e) => e.originalName === originalName)!;
    const after = second.entries.find((e) => e.originalName === originalName)!;
    assert.equal(after.ref.recordId, before.ref.recordId);
    assert.notEqual(after.ref.revisionId, before.ref.revisionId);
  }
});

test('obsolete generated equipment from replaced class kits is retired', async () => {
  const { catalog } = await resolved;
  const registry = JSON.parse(await readFile('content/compendium/identities.json', 'utf8'));
  const oldPlaceholder = registry.records['equipamento:fonte:mochila-de-artista'];
  assert.ok(oldPlaceholder);
  assert.ok(!catalog.entries.some((e) => e.ref.recordId === oldPlaceholder));
  assert.ok(catalog.retiredRecordIds?.includes(oldPlaceholder));
});
