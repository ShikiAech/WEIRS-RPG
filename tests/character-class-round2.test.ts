import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import { loadCuration, resolveCatalog } from '../tools/compendium-import/resolve';
import { resolveConcessions } from '../packages/character-creation/concessions';
import { resolveCreation } from '../packages/character-creation/resolve';
import { resolveSpellcasting } from '../packages/character-creation/spellcasting';
import { resolveState } from '../packages/character-creation/state';
import { profileGrantedSpells } from '../packages/character-creation/casting-grants';
import { fixture } from './fixtures/creation';

const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(process.cwd()),
  readLegacySources(process.cwd()),
  readFile('content/compendium/identities.json', 'utf8').then(JSON.parse),
  loadCuration(process.cwd()),
]);
registry.aliases = { ...registry.aliases, ...curation.aliases.identities };
const catalog = resolveCatalog(normalizeSources([...legacy, ...json], registry), curation);
const find = (kind: string, name: string) =>
  catalog.entries.find((e) => e.kind === kind && e.name === name)!;
const groups = (name: string) =>
  catalog.choices.filter((g) => g.ownerRevisionId === find('classe', name).ref.revisionId);

function classDraft(name: string, level = 1) {
  const { draft, species, background } = fixture();
  const scoped = { ...catalog, entries: [...catalog.entries, species, background] };
  draft.abilities.external = { for: 14, des: 14, con: 14, int: 14, sab: 14, car: 14 };
  draft.classes[0].classRef = find('classe', name).ref;
  draft.classes[0].level = level;
  draft.levels = Array.from({ length: level }, (_, i) => ({
    ...draft.levels[0],
    totalLevel: i + 1,
  }));
  return { draft, scoped };
}

// Keep the imported class rules intact; fixture species/background avoid unrelated origin decisions.
function completedClass(name: string, level = 1) {
  const { draft, scoped } = classDraft(name, level);
  for (let pass = 0; pass < 8; pass++) {
    const active = resolveConcessions(scoped, draft).choices;
    for (const { group, instance, unavailableOptions } of active) {
      if (draft.choices.some((s) => s.groupId === group.id && s.sourceInstanceId === instance.id))
        continue;
      const options = group.options.filter((o) => !unavailableOptions?.[o.id]);
      const preferred = options.find((o) => ['Guardião', 'Defesa'].includes(o.name));
      draft.choices.push({
        sourceInstanceId: instance.id,
        groupId: group.id,
        values: (preferred ? [preferred] : options.slice(0, group.minimum)).map((o) => ({
          type: 'option',
          optionId: o.id,
        })),
      });
    }
  }
  const equipment = scoped.equipmentOptions.find(
    (o) => o.ownerRevisionId === draft.classes[0].classRef.revisionId && o.key === 'B',
  );
  if (equipment)
    draft.equipmentOptions.push({
      ownerRevisionId: equipment.ownerRevisionId,
      optionId: equipment.id,
    });
  for (const row of resolveSpellcasting(scoped, draft).profiles) {
    const definition = scoped.castingProfiles.find(
      (p) => p.ownerRevisionId === row.ownerRevisionId && row.id.endsWith(':' + p.id),
    )!;
    const fixed = new Set(
      definition.spells.filter((s) => s.level <= level).map((s) => s.spellRef.revisionId),
    );
    const available = scoped.entries.filter(
      (e) =>
        e.kind === 'magia' &&
        !fixed.has(e.ref.revisionId) &&
        e.data.circle <= row.maximumCircle &&
        e.data.classRefs.some((r) => row.listClassRevisionIds?.includes(r.revisionId)),
    );
    const cantrips = available
      .filter((e) => e.kind === 'magia' && e.data.circle === 0)
      .slice(0, row.cantrips);
    const spells = available
      .filter((e) => e.kind === 'magia' && e.data.circle > 0)
      .slice(0, row.prepared ?? 0);
    for (const e of [...cantrips, ...spells])
      draft.spellSelections.push({ profileId: row.id, spellRef: e.ref, prepared: true });
  }
  return { draft, scoped };
}

test('Erudito offers one expertise at Wizard2 and3 restricted to the six source skills already trained', () => {
  for (const level of [2, 3]) {
    const { draft, scoped } = classDraft('Mago', level);
    let active = resolveConcessions(scoped, draft).choices;
    const initial = active.find((a) => a.group.key === 'pericias')!;
    const selected = initial.group.options.filter((o) =>
      ['historia', 'investigacao'].includes(
        scoped.proficiencies.find((p) => p.id === o.proficiencyId)?.skill ?? '',
      ),
    );
    draft.choices.push({
      sourceInstanceId: initial.instance.id,
      groupId: initial.group.id,
      values: selected.map((o) => ({ type: 'option', optionId: o.id })),
    });
    active = resolveConcessions(scoped, draft).choices;
    const scholar = active.find((a) => a.group.key === 'erudito')!;
    assert.ok(scholar, 'Wizard must expose its permanent Erudito decision');
    assert.deepEqual(
      [scholar.group.minimum, scholar.group.maximum, scholar.group.level],
      [1, 1, 2],
    );
    assert.deepEqual(
      scholar.group.options
        .map((o) => scoped.proficiencies.find((p) => p.id === o.proficiencyId)?.skill)
        .sort(),
      ['arcanismo', 'historia', 'investigacao', 'medicina', 'natureza', 'religiao'],
    );
    const history = scholar.group.options.find(
      (o) => scoped.proficiencies.find((p) => p.id === o.proficiencyId)?.skill === 'historia',
    )!;
    const medicine = scholar.group.options.find(
      (o) => scoped.proficiencies.find((p) => p.id === o.proficiencyId)?.skill === 'medicina',
    )!;
    assert.ok(!scholar.unavailableOptions?.[history.id]);
    assert.ok(scholar.unavailableOptions?.[medicine.id]);
    draft.choices.push({
      sourceInstanceId: scholar.instance.id,
      groupId: scholar.group.id,
      values: [{ type: 'option', optionId: history.id }],
    });
    assert.ok(
      resolveConcessions(scoped, draft).proficiencyGrants.some(
        (p) => p.proficiencyId === history.proficiencyId && p.degree === 'especializacao',
      ),
    );
    draft.choices.at(-1)!.values = [{ type: 'option', optionId: medicine.id }];
    assert.ok(
      resolveConcessions(scoped, draft).problems.some(
        (p) => p.code === 'EXPERTISE_REQUIRES_PROFICIENCY',
      ),
    );
  }
});

test('Druid1 completes with automatic Druidic and Herbalism on the projected sheet', () => {
  const { draft, scoped } = completedClass('Druida');
  const result = resolveCreation(scoped, draft);
  assert.deepEqual(result.problems, []);
  assert.ok(result.sheet);
  assert.equal(result.sheet.idiomas.filter((l) => l.nome === 'Druídico').length, 1);
  assert.match(result.sheet.treinamento.ferramentas, /Kit de Herbalismo/);
  assert.ok(result.sheet.magias.some((s) => s.nome === 'Falar com Animais' && s.preparada));
});

for (const [name, level, spell, uses, quota] of [
  ['Paladino', 2, 'Golpe Divino', 1, 3],
  ['Patrulheiro', 1, 'Marca do Predador', 2, 2],
] as const)
  test(`${name} always prepares ${spell} outside its quota with long-rest free uses`, () => {
    const cls = find('classe', name);
    const fixed = catalog.castingProfiles
      .find((p) => p.ownerRevisionId === cls.ref.revisionId && p.key === 'classe')
      ?.spells.find((s) => s.spellRef.revisionId === find('magia', spell)?.ref.revisionId);
    assert.ok(fixed, 'class casting profile must grant its named spell');
    assert.deepEqual(
      [fixed.level, fixed.alwaysPrepared, fixed.usesSlots, fixed.ownUses, fixed.recovery],
      [level, true, true, uses, 'longo'],
    );
    const { draft, scoped } = completedClass(name, level);
    const result = resolveCreation(scoped, draft);
    assert.deepEqual(result.problems, []);
    assert.ok(result.sheet);
    assert.ok(result.sheet.magias.some((s) => s.nome === spell && s.preparada));
    assert.equal(result.sheet.magias.filter((s) => s.circulo > 0).length, quota + 1);
    assert.ok(
      result.sheet.recursos.some(
        (r) => r.nome.startsWith(spell) && r.maximo === uses && r.recuperacao === 'longo',
      ),
    );
  });

test('Favored Enemy free uses follow the source progression with one current grant per spell', () => {
  for (const [level, uses] of [
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ]) {
    const { draft, scoped } = classDraft('Patrulheiro', level);
    const state = resolveState(scoped, draft);
    const instance = state.concessions.instances.find((i) => i.entry.kind === 'classe')!;
    const profile = scoped.castingProfiles.find(
      (p) => p.ownerRevisionId === instance.entry.ref.revisionId && p.key === 'classe',
    )!;
    const granted = profileGrantedSpells(scoped, state, instance, profile).filter(
      (s) => s.spellRef.revisionId === find('magia', 'Marca do Predador').ref.revisionId,
    );
    assert.equal(granted.length, 1);
    assert.equal(granted[0].ownUses, uses, 'Ranger level ' + level);
  }
});

test('Etherforge firearms use ranged classification and do not enter Barbarian melee masteries', () => {
  for (const name of [
    'Bacamarte de Éter',
    'Canhão de Impacto Etérico',
    'Mosquete de Precisão Etérico',
    'Repetidora de Éter',
  ]) {
    const weapon = find('equipamento', name);
    assert.ok(weapon.kind === 'equipamento' && weapon.data.weapon?.rangeType === 'distancia', name);
    assert.ok(
      groups('Bárbaro')
        .filter((g) => g.key.startsWith('maestrias-'))
        .every((g) => !g.options.some((o) => o.targetRef?.revisionId === weapon.ref.revisionId)),
    );
  }
  const dagger = find('equipamento', 'Adaga');
  assert.ok(
    dagger.kind === 'equipamento' && dagger.data.weapon?.rangeType === 'corpo-a-corpo',
    'thrown melee weapons remain melee',
  );
  const blunderbuss = find('equipamento', 'Bacamarte de Éter');
  assert.ok(blunderbuss.kind === 'equipamento' && blunderbuss.data.weapon?.longRangeFeet === 30);
});

test('damage range and repelling invocations require a recorded cantrip target without granting it', () => {
  for (const name of ['Rajada Agonizante', 'Lança Mística', 'Rajada Repulsora']) {
    const inv = find('caracteristica', name);
    assert.ok(inv.kind === 'caracteristica' && inv.data.spellPrerequisite);
    const group = catalog.choices.find(
      (g) => g.ownerRevisionId === inv.ref.revisionId && g.key === 'truque-afetado',
    );
    assert.ok(group, name);
    assert.deepEqual([group.minimum, group.maximum], [1, 1]);
    assert.ok(group.options.length > 20);
    assert.ok(
      group.options.every(
        (o) =>
          o.type === 'magia-alvo' &&
          o.value === null &&
          catalog.entries.some(
            (e) =>
              e.ref.revisionId === o.targetRef?.revisionId &&
              e.kind === 'magia' &&
              e.data.circle === 0,
          ),
      ),
    );
  }
});
