import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';
import {
  loadCuration,
  resolveCatalog,
  parsePrerequisites,
  parseMovement,
  distanceFeet,
} from '../tools/compendium-import/resolve';
import { validateCatalog } from '../tools/compendium-import/validate';

const root = process.cwd();
const imported = Promise.all([
  readJsonSources(root),
  readLegacySources(root),
  readFile('content/compendium/identities.json', 'utf8'),
]).then(([json, legacy, registry]) => normalizeSources([...legacy, ...json], JSON.parse(registry)));
const resolved = imported.then(async (data) => resolveCatalog(data, await loadCuration(root)));
test('pré-requisito preserva nível E (Força OU Destreza), sem aceitar fragmentos desconhecidos', () => {
  const result = parsePrerequisites('Nível 4+, Força ou Destreza 13+', 'owner');
  assert.equal(result.unsupported.length, 0);
  const nodes = result.requirements;
  const root = nodes.find((n) => n.parentId === null)!;
  assert.equal(root.operator, 'todos');
  assert.ok(nodes.some((n) => n.parentId === root.id && n.operator === 'nivel' && n.minimum === 4));
  const or = nodes.find((n) => n.operator === 'qualquer')!;
  assert.equal(or.parentId, root.id);
  assert.deepEqual(
    nodes.filter((n) => n.parentId === or.id).map((n) => [n.ability, n.minimum]),
    [
      ['for', 13],
      ['des', 13],
    ],
  );
  assert.ok(
    parsePrerequisites('Nível 4+, Proficiência com Armaduras Pesadas', 'owner').unsupported.length,
  );
});
test('distância de jogo conserva a unidade original e distingue modos e formas', () => {
  assert.equal(distanceFeet(9, 'metros'), 30);
  assert.equal(distanceFeet(30, 'pes'), 30);
  const movements = parseMovement('9 metros (Terrestre); 9 metros (Voo Inato)', 'owner');
  assert.deepEqual(
    movements.map((m) => [m.mode, m.distance, m.unit]),
    [
      ['terrestre', 9, 'metros'],
      ['voo', 9, 'metros'],
    ],
  );
  const form = parseMovement('9 metros (forma natural); 12 metros (exotraje)', 'owner');
  assert.equal(form[1].form, 'exotraje');
});
test('antecedente relaciona talento, perícias e kits com quantidades e moedas', async () => {
  const c = await resolved;
  const entry = c.entries.find(
    (e) => e.kind === 'antecedente' && e.name === 'Acólito' && e.originalName === 'Acolyte',
  )!;
  assert.equal(entry.kind, 'antecedente');
  if (entry.kind !== 'antecedente') return;
  assert.deepEqual(entry.data.abilities, ['int', 'sab', 'car']);
  const options = c.equipmentOptions.filter((o) => o.ownerRevisionId === entry.ref.revisionId);
  assert.equal(options.length, 2);
  const packages = options.map((o) =>
    c.entries.find((e) => e.ref.revisionId === o.packageRef.revisionId)!,
  );
  assert.ok(packages.every((e) => e.kind === 'pacote'));
  const a = packages[0];
  const b = packages[1];
  if (a.kind !== 'pacote' || b.kind !== 'pacote') return;
  const names = (e: typeof a) =>
    e.data.items.map((i) => [
      c.entries.find((e) => e.ref.revisionId === (i.equipmentRef ?? i.currencyRef)?.revisionId)
        ?.name,
      i.quantity,
    ]);
  assert.ok(names(a).some(([name, qty]) => String(name).startsWith('Pergaminho') && qty === 10));
  assert.ok(names(a).some(([name, qty]) => name === 'Peça de Ouro' && qty === 8));
  assert.deepEqual(names(b), [['Peça de Ouro', 50]]);
  const magic = c.grants.find(
    (g) => g.ownerRevisionId === entry.ref.revisionId && g.kind === 'talento',
  )!;
  assert.equal(
    c.entries.find((e) => e.ref.revisionId === magic.targetRef?.revisionId)?.originalName,
    'Magic Initiate',
  );
  assert.ok(
    c.choices.some(
      (g) =>
        g.ownerRevisionId === entry.ref.revisionId && g.options.some((o) => o.value === 'clerigo'),
    ),
  );
});
test('alias aprovado resolve Mancha e a ausência da decisão deixa uma pendência', async () => {
  const data = await imported,
    curation = await loadCuration(root);
  const c = resolveCatalog(data, curation);
  const stain = c.entries.find((e) => e.name === 'Mancha' && e.kind === 'caracteristica')!;
  const grant = c.grants.find(
    (g) => g.ownerRevisionId === stain.ref.revisionId && g.kind === 'talento',
  )!;
  assert.equal(
    c.entries.find((e) => e.ref.revisionId === grant.targetRef?.revisionId)?.name,
    'Espírito Manchado',
  );
  const without = resolveCatalog(data, {
    ...curation,
    aliases: { ...curation.aliases, names: [] },
  });
  const unlinked = without.entries.find((e) => e.key === stain.key)!;
  assert.notEqual(unlinked.ref.revisionId, stain.ref.revisionId);
  assert.ok(
    without.issues.some(
      (i) => i.revisionId === unlinked.ref.revisionId && i.code === 'UNRESOLVED_REFERENCE',
    ),
  );
  assert.ok(
    !without.grants.some(
      (g) => g.ownerRevisionId === unlinked.ref.revisionId && g.kind === 'talento',
    ),
  );
  assert.equal(
    c.entries.filter((e) => e.name === 'Luta Cega' && e.kind === 'talento' && e.legacyIds.length)
      .length,
    2,
  );
});
test('efeito Cranori é fórmula de CA alternativa, sem armadura e permitindo escudo', async () => {
  const c = await resolved;
  const trait = c.entries.find((e) => e.name === 'Carapaça Óssea')!;
  const effect = c.effects.find(
    (e) => e.ownerRevisionId === trait.ref.revisionId && e.type === 'ca_formula',
  )!;
  assert.deepEqual(effect.formula, {
    op: 'add',
    args: [
      { op: 'constant', value: 13 },
      { op: 'ability_modifier', ability: 'con' },
    ],
  });
  assert.equal(effect.stacking, 'alternativa');
  assert.deepEqual(effect.defenses, [{ damageType: null, unarmored: true, permitsShield: true }]);
});
test('cobertura não confunde texto importado com revisão 2024 ou mecânica automatizada', async () => {
  const c = await resolved;
  assert.equal(c.entries.filter((e) => e.kind === 'classe').length, 17);
  assert.equal(c.entries.filter((e) => e.kind === 'magia').length, 477);
  assert.ok(
    c.entries
      .filter((e) => e.kind === 'magia')
      .every(
        (e) =>
          e.kind === 'magia' &&
          new Set(e.data.classRefs.map((r) => r.revisionId)).size === e.data.classRefs.length,
      ),
  );
  assert.ok(c.entries.some((e) => e.kind === 'especie' && e.name === 'Neflins'));
  assert.ok(c.entries.some((e) => e.automation === 'manual' && !e.reviewed2024));
  assert.ok(
    c.entries
      .filter((e) => e.kind === 'classe')
      .every((e) => e.kind === 'classe' && e.data.levels.length === 20),
  );
  assert.ok(!validateCatalog(c).some((i) => i.code === 'INVALID_SOURCE'));
  const categories = c.entries.filter(
    (e) => e.kind === 'talento' && e.data.category === 'dom-sombrio',
  );
  assert.ok(categories.length > 0);
});

test('formas de N0-V4 e escolhas de atributo do talento permanecem estruturadas', async () => {
  const c = await resolved,
    nova = c.entries.find((e) => e.name === 'N0-V4' && e.kind === 'especie')!;
  if (nova.kind !== 'especie') return;
  assert.deepEqual(
    nova.data.movements.map((m) => [m.form, m.distance]),
    [
      ['natural', 20],
      ['exotraje', 30],
    ],
  );
  assert.deepEqual(
    nova.data.sizes.map((s) => [s.form, s.code]),
    [
      ['natural', 'pequeno'],
      ['exotraje', 'medio'],
    ],
  );
  const actor = c.entries.find((e) => e.originalName === 'Actor' && e.kind === 'talento')!;
  assert.deepEqual(
    c.choices
      .find((g) => g.ownerRevisionId === actor.ref.revisionId && g.key === 'aumento-atributo')
      ?.options.map((o) => o.ability),
    ['car'],
  );
  const improvement = c.entries.find((e) => e.originalName === 'Ability Score Improvement')!;
  const increase = c.choices.find(
    (g) => g.ownerRevisionId === improvement.ref.revisionId && g.key === 'aumento-atributo',
  )!;
  assert.equal(increase.abilityPoints, 2);
  assert.equal(increase.abilityLimit, 20);
  assert.equal(
    c.choices.find(
      (g) => g.ownerRevisionId === improvement.ref.revisionId && g.key === 'aumento-atributo',
    )?.maximum,
    2,
  );
});
test('opções sem nível não são todas concedidas automaticamente e a classe inclui perícias iniciais', async () => {
  const c = await resolved;
  const optional = c.origins.filter(
    (r) => r.kind === 'caracteristica' && r.payload.type === 'section' && r.level === undefined,
  );
  const optionalIds = new Set(
    optional.map((r) => c.entries.find((e) => e.key === r.key)?.ref.revisionId),
  );
  assert.ok(!c.grants.some((g) => g.targetRef && optionalIds.has(g.targetRef.revisionId)));
  const fighter = c.entries.find((e) => e.kind === 'classe' && e.name === 'Guerreiro')!;
  assert.ok(
    c.choices.some(
      (g) =>
        g.ownerRevisionId === fighter.ref.revisionId &&
        g.key === 'pericias' &&
        g.minimum === 2 &&
        g.acquisition === 'inicial',
    ),
  );
  assert.ok(
    c.proficiencies.some(
      (p) => p.ownerRevisionId === fighter.ref.revisionId && p.category === 'armadura-pesada',
    ),
  );
});
test('bloco do Defensor de Aço vira criatura relacionada e conserva a fórmula variável', async () => {
  const c = await resolved,
    defender = c.entries.find((e) => e.kind === 'criatura' && e.name === 'Defensor de Aço')!;
  assert.ok(defender);
  if (defender.kind !== 'criatura') return;
  assert.equal(defender.data.creatureType, 'construto');
  assert.deepEqual(defender.data.abilities, { for: 14, des: 12, con: 14, int: 4, sab: 10, car: 6 });
  assert.match(defender.data.hitPointFormula!, /cinco vezes seu nível de Artífice/);
  assert.equal(defender.data.armorClass, null);
  assert.ok(defender.data.actions.some((a) => a.name === 'Garra Energizada'));
  assert.ok(
    c.grants.some(
      (g) => g.kind === 'criatura' && g.targetRef?.revisionId === defender.ref.revisionId,
    ),
  );
});
test('instrumentos e jogos possuem variantes próprias para escolhas de proficiência', async () => {
  const c = await resolved,
    entertainer = c.entries.find(
      (e) => e.kind === 'antecedente' && e.originalName === 'Entertainer',
    )!;
  const options = c.choices.find(
    (g) => g.ownerRevisionId === entertainer.ref.revisionId && g.key === 'ferramenta',
  )!.options;
  assert.equal(options.length, 10);
  assert.ok(options.some((o) => o.name === 'Alaúde'));
  const lute = c.entries.find((e) => e.kind === 'equipamento' && e.name === 'Alaúde')!;
  if (lute.kind !== 'equipamento') return;
  assert.equal(lute.data.cost, 35);
  assert.equal(lute.data.weight, 1);
  assert.equal(
    c.entries.find((e) => e.ref.revisionId === lute.data.variantOf?.revisionId)?.name,
    'Instrumento Musical',
  );
});

test('pré-requisitos referenciam linhagem, treinamento, talento e característica', async () => {
  const c = await resolved;
  const stain = c.entries.find(
    (e) =>
      e.kind === 'talento' && e.name === 'Espírito Manchado' && e.sourcePath === 'data/feats.json',
  )!;
  const lineage = c.entries.find((e) => e.kind === 'linhagem' && e.name === 'Manchados')!;
  assert.equal(stain.kind === 'talento' && stain.data.requirementsComplete, true);
  assert.ok(
    c.requirements.some(
      (r) =>
        r.ownerRevisionId === stain.ref.revisionId &&
        r.operator === 'linhagem' &&
        r.targetRef?.revisionId === lineage.ref.revisionId,
    ),
  );
  const armor = c.origins.find(
    (r) =>
      r.payload.type === 'feat' &&
      r.payload.input.prerequisite === 'Nível 4+, Treinamento com Armadura Média',
  )!;
  const armorEntry = c.entries.find((e) => e.key === armor.key)!;
  const profReq = c.requirements.find(
    (r) => r.ownerRevisionId === armorEntry.ref.revisionId && r.operator === 'proficiencia',
  )!;
  assert.equal(
    c.proficiencies.find((p) => p.id === profReq?.proficiencyId)?.category,
    'armadura-media',
  );
  const warSource = c.origins.find(
    (r) =>
      r.payload.type === 'feat' &&
      r.payload.input.prerequisite === 'Nível 4+, Característica Conjuração ou Magia de Pacto',
  )!;
  const war = c.entries.find((e) => e.key === warSource.key)!;
  assert.ok(
    c.requirements.some(
      (r) =>
        r.ownerRevisionId === war.ref.revisionId && r.operator === 'caracteristica' && r.targetRef,
    ),
  );
  const featSource = c.origins.find(
    (r) =>
      r.payload.type === 'feat' &&
      r.payload.input.prerequisite === 'Nível 4+, Talento Iniciado em Magia (Magic Initiate)',
  )!;
  const feat = c.entries.find((e) => e.key === featSource.key)!;
  const gated = c.entries.find(
    (e) => e.kind === 'talento' && e.data.prerequisiteText.includes('Campanha de Eberron'),
  )!;
  assert.equal(gated.kind === 'talento' && gated.data.requirementsComplete, false);
  assert.ok(
    c.requirements.some(
      (r) =>
        r.ownerRevisionId === feat.ref.revisionId &&
        r.operator === 'talento' &&
        c.entries.find((e) => e.ref.revisionId === r.targetRef?.revisionId)?.originalName ===
          'Magic Initiate',
    ),
  );
});

test('erro de origem aponta a revisão final para bloquear sua publicação', async () => {
  const data = structuredClone(await imported);
  const invalid = data.records.find((r) => r.payload.type === 'species')!;
  if (invalid.payload.type !== 'species') return;
  invalid.payload.input.speed = 'deslocamento a conferir';
  const c = resolveCatalog(data, await loadCuration(root));
  const entry = c.entries.find((e) => e.key === invalid.key)!;
  assert.ok(
    c.issues.some((i) => i.code === 'INVALID_SOURCE' && i.revisionId === entry.ref.revisionId),
  );
});

test('kits separam alternativas com ou, moeda GP e itens plurais com quantidade', async () => {
  const c = await resolved;
  const pugilist = c.entries.find((e) => e.kind === 'classe' && e.name === 'Pugilista')!;
  const options = c.equipmentOptions.filter((o) => o.ownerRevisionId === pugilist.ref.revisionId);
  assert.equal(options.length, 2);
  const gold = c.entries.find(
    (e) => e.ref.revisionId === options.find((o) => o.key === 'B')!.packageRef.revisionId,
  )!;
  assert.ok(
    gold.kind === 'pacote' && gold.data.items.some((i) => i.currencyRef && i.quantity === 50),
  );
  const criminal = c.entries.find(
    (e) => e.kind === 'antecedente' && e.originalName === 'Criminal',
  )!;
  const kit = c.equipmentOptions.find(
    (o) => o.ownerRevisionId === criminal.ref.revisionId && o.key === 'A',
  )!;
  const kitEntry = c.entries.find((e) => e.ref.revisionId === kit.packageRef.revisionId)!;
  assert.ok(
    kitEntry.kind === 'pacote' &&
      kitEntry.data.items.some(
        (i) =>
          i.quantity === 2 &&
          c.entries.find((e) => e.ref.revisionId === i.equipmentRef?.revisionId)?.name === 'Adaga',
      ),
  );
  const mystic = c.entries.find((e) => e.kind === 'classe' && e.name === 'Artífice')!;
  {
    const golds = c.equipmentOptions
      .filter((o) => o.ownerRevisionId === mystic.ref.revisionId)
      .map((o) => c.entries.find((e) => e.ref.revisionId === o.packageRef.revisionId)!);
    assert.ok(
      golds.some(
        (e) => e.kind === 'pacote' && e.data.items.some((i) => i.currencyRef && i.quantity === 150),
      ),
    );
  }
});

test('características opcionais conservam a classe ou subclasse de origem', async () => {
  const c = await resolved;
  const source = c.origins.find(
    (r) =>
      r.kind === 'caracteristica' &&
      r.payload.type === 'section' &&
      r.level === undefined &&
      r.parentKey,
  )!;
  const entry = c.entries.find((e) => e.key === source.key)!;
  const parent = c.entries.find((e) => e.key === source.parentKey)!;
  assert.ok(
    entry.kind === 'caracteristica' && entry.data.parentRef?.revisionId === parent.ref.revisionId,
  );
  assert.equal(entry.kind === 'caracteristica' && entry.data.optional, true);
});
