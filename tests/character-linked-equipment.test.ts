import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { resolveState } from '../packages/character-creation/state';
import { resolveHitPoints } from '../packages/character-creation/hit-points';
import { resolveDefenses } from '../packages/character-creation/defenses';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { projectSheet } from '../packages/character-creation/project';
import { fixture } from './fixtures/creation';
import type { CreationDraft } from '../packages/contracts/character-creation';

const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
  loadCuration(process.cwd()),
]);
registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
const catalog = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);
const find = (kind: string, name: string) =>
  catalog.entries.find(
    (e) =>
      e.kind === kind &&
      e.name === name &&
      (kind !== 'antecedente' || e.sourceTitle === "Player's Handbook (2024)"),
  )!;
const groups = (revision: string) => catalog.choices.filter((g) => g.ownerRevisionId === revision);
const kit = (revision: string, name: string) =>
  catalog.equipmentOptions.find((o) => o.ownerRevisionId === revision && o.key === name)!;
function setup(className = 'Druida', backgroundName = 'Soldado') {
  const draft = fixture().draft;
  draft.speciesRef = find('especie', 'Fadas').ref;
  draft.backgroundRef = find('antecedente', backgroundName).ref;
  draft.classes[0].classRef = find('classe', className).ref;
  return draft;
}
function choose(
  draft: CreationDraft,
  owner: string,
  instance: string,
  key: string,
  names: string[],
) {
  const g = groups(owner).find((g) => g.key === key)!;
  assert.ok(g, `choice ${key} exists`);
  draft.choices = draft.choices.filter(
    (c) => c.groupId !== g.id || c.sourceInstanceId !== instance,
  );
  draft.choices.push({
    groupId: g.id,
    sourceInstanceId: instance,
    values: names.map((name) => {
      const o = g.options.find((o) => o.name === name)!;
      assert.ok(o, `option ${name} exists`);
      return { type: 'option' as const, optionId: o.id };
    }),
  });
}
function selectKit(draft: CreationDraft, owner: string, name: string) {
  draft.equipmentOptions = draft.equipmentOptions.filter((o) => o.ownerRevisionId !== owner);
  draft.equipmentOptions.push({ ownerRevisionId: owner, optionId: kit(owner, name).id });
}
function project(draft: CreationDraft) {
  const state = resolveState(catalog, draft);
  return {
    state,
    sheet: projectSheet(
      catalog,
      draft,
      state,
      resolveHitPoints(catalog, draft, state),
      resolveDefenses(catalog, draft, state),
      resolveSpellcasting(catalog, draft, state),
    ),
  };
}

test('Druid + Soldier 2024 kit A grants exactly the selected game object and its separate proficiency', () => {
  const draft = setup(),
    bg = draft.backgroundRef!.revisionId;
  choose(draft, bg, 'background', 'ferramenta', ['Dados']);
  selectKit(draft, bg, 'A');
  selectKit(draft, draft.classes[0].classRef.revisionId, 'A');
  const { sheet } = project(draft);
  assert.equal(sheet.inventario.itens.filter((i) => i.nome === 'Dados').length, 1);
  assert.equal(sheet.inventario.itens.find((i) => i.nome === 'Dados')?.quantidade, 1);
  assert.match(sheet.treinamento.ferramentas, /Dados/);
  const unselected = groups(bg)
    .find((g) => g.key === 'ferramenta')!
    .options.filter((o) => o.name !== 'Dados')
    .map((o) => o.name);
  assert.ok(!sheet.inventario.itens.some((i) => unselected.includes(i.nome)));
});

test('changing the selected game replaces its object; kit B removes the object but retains proficiency', () => {
  const draft = setup(),
    bg = draft.backgroundRef!.revisionId;
  choose(draft, bg, 'background', 'ferramenta', ['Dados']);
  selectKit(draft, bg, 'A');
  assert.equal(project(draft).sheet.inventario.itens.filter((i) => i.nome === 'Dados').length, 1);
  const other = groups(bg)
    .find((g) => g.key === 'ferramenta')!
    .options.find((o) => o.name !== 'Dados')!.name;
  choose(draft, bg, 'background', 'ferramenta', [other]);
  let sheet = project(draft).sheet;
  assert.ok(!sheet.inventario.itens.some((i) => i.nome === 'Dados'));
  assert.equal(sheet.inventario.itens.find((i) => i.nome === other)?.quantidade, 1);
  selectKit(draft, bg, 'B');
  sheet = project(draft).sheet;
  assert.ok(!sheet.inventario.itens.some((i) => i.nome === other));
  assert.ok(sheet.treinamento.ferramentas.includes(other));
});

test('a physical choice made before proficiency follows the later required linked selection', () => {
  const draft = setup(),
    bg = draft.backgroundRef!.revisionId;
  selectKit(draft, bg, 'A');
  const pkg = kit(bg, 'A').packageRef.revisionId;
  const pending = project(draft).state.concessions.choices.find(
    (c) => c.group.ownerRevisionId === pkg,
  )!;
  choose(draft, pkg, pending.instance.id, 'ferramenta', ['Dados']);
  const other = groups(bg)
    .find((g) => g.key === 'ferramenta')!
    .options.find((o) => o.name !== 'Dados')!.name;
  choose(draft, bg, 'background', 'ferramenta', [other]);
  const { state, sheet } = project(draft);
  assert.equal(sheet.inventario.itens.find((i) => i.nome === other)?.quantidade, 1);
  assert.ok(!sheet.inventario.itens.some((i) => i.nome === 'Dados'));
  assert.ok(!state.concessions.choices.some((c) => c.group.ownerRevisionId === pkg));
});

test('an unresolved linked selection grants no arbitrary tool and remains pending in the active kit', () => {
  const draft = setup(),
    bg = draft.backgroundRef!.revisionId;
  selectKit(draft, bg, 'A');
  const { state, sheet } = project(draft);
  const pkg = kit(bg, 'A').packageRef.revisionId;
  const g = groups(pkg).find((g) => g.key === 'ferramenta');
  assert.ok(g, 'linked game is a package choice');
  assert.ok(state.concessions.choices.some((c) => c.group.id === g.id));
  assert.ok(!sheet.inventario.itens.some((i) => g.options.some((o) => o.name === i.nome)));
});

test('explicit background links and Monk equipment use source proficiency options with package provenance', () => {
  const linkedBackgrounds = catalog.entries.filter(
    (e) =>
      e.kind === 'antecedente' &&
      catalog.equipmentOptions.some(
        (o) =>
          o.ownerRevisionId === e.ref.revisionId &&
          catalog.entries.some(
            (pkg) =>
              pkg.kind === 'pacote' &&
              pkg.ref.revisionId === o.packageRef.revisionId &&
              /mesm[oa]s? escolhid[oa]s? acima/i.test(pkg.data.notes),
          ),
      ),
  );
  assert.ok(linkedBackgrounds.length > 0, 'source-backed background links are present');
  for (const owner of [...linkedBackgrounds, find('classe', 'Monge')]) {
    const key = owner.kind === 'classe' ? 'ferramenta-instrumento' : 'ferramenta';
    const pkg = kit(owner.ref.revisionId, 'A');
    const g = groups(pkg.packageRef.revisionId).find((g) => g.key === key);
    assert.ok(g, `${owner.name} linked equipment exists`);
    assert.equal(g.minimum, 1);
    assert.equal(g.maximum, 1);
    assert.ok(g.options.length > 1);
    assert.ok(
      g.options.every((o) => o.type === 'equipamento' && !!o.targetRef && !o.proficiencyId),
    );
    const sourceOptions = groups(owner.ref.revisionId).find((g) => g.key === key)!.options;
    assert.deepEqual(
      g.options.map((o) => o.targetRef?.revisionId).sort(),
      sourceOptions
        .map(
          (o) => catalog.proficiencies.find((p) => p.id === o.proficiencyId)?.equipment?.revisionId,
        )
        .sort(),
    );
    const entry = catalog.entries.find((e) => e.ref.revisionId === pkg.packageRef.revisionId)!;
    assert.equal(entry.sourcePath, owner.sourcePath);
    assert.equal(entry.sourceId, owner.sourceId);
  }
});

test('Monk receives only the physical artisan tool or instrument selected for proficiency', () => {
  const draft = setup('Monge'),
    owner = draft.classes[0].classRef.revisionId;
  const g = groups(owner).find((g) => g.key === 'ferramenta-instrumento')!;
  const selected = g.options[0].name;
  choose(draft, owner, `class:${draft.classes[0].id}`, g.key, [selected]);
  selectKit(draft, owner, 'A');
  const { sheet } = project(draft);
  assert.equal(sheet.inventario.itens.find((i) => i.nome === selected)?.quantidade, 1);
  assert.ok(sheet.treinamento.ferramentas.includes(selected));
  assert.ok(!sheet.inventario.itens.some((i) => g.options.slice(1).some((o) => o.name === i.nome)));
});

test('Bard kit asks for one instrument instead of granting all three instrument proficiencies as objects', () => {
  const draft = setup('Bardo'),
    owner = draft.classes[0].classRef.revisionId;
  const instruments = groups(owner).find((g) => g.key === 'instrumentos')!;
  const names = instruments.options.slice(0, 3).map((o) => o.name);
  choose(draft, owner, `class:${draft.classes[0].id}`, 'instrumentos', names);
  selectKit(draft, owner, 'A');
  let { state, sheet } = project(draft);
  const pkg = kit(owner, 'A').packageRef.revisionId;
  const g = groups(pkg).find((g) => g.key === 'instrumentos');
  assert.ok(g, 'physical instrument selection exists');
  assert.equal(g.minimum, 1);
  assert.equal(g.maximum, 1);
  const pending = state.concessions.choices.find((c) => c.group.id === g.id);
  assert.ok(pending, 'three proficiency selections cannot silently satisfy one object');
  assert.ok(!sheet.inventario.itens.some((i) => names.includes(i.nome)));
  choose(draft, pkg, pending.instance.id, 'instrumentos', [names[0]]);
  sheet = project(draft).sheet;
  assert.equal(sheet.inventario.itens.find((i) => i.nome === names[0])?.quantidade, 1);
  assert.ok(!sheet.inventario.itens.some((i) => names.slice(1).includes(i.nome)));
});
