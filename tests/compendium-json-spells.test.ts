import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  readSpellJsonSource,
  spellDefinition,
  spellDescription,
  spellDescriptionHtml,
  type SpellInput,
} from '../tools/compendium-import/json-spells';
import { readLegacySources } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';

const root = process.cwd();
const input = (extra: Partial<SpellInput> = {}): SpellInput => ({
  name: 'Test Spell',
  name_pt: 'Magia de Teste',
  circle: 1,
  type: 'Evocação',
  classes: ['Mago'],
  casting_time: 'Uma Ação',
  range: '18 metros [60 pés]',
  components: ['V', 'S'],
  duration: 'Instantânea',
  description: 'O alvo sofre 2d6 de dano de Fogo.',
  upcasting: [],
  source: "Player's Handbook",
  ...extra,
});

test('spell JSON retains every source row and conflicting book variants without changing the file', async () => {
  const before = await readFile(path.join(root, 'data/spells.json'), 'utf8');
  const source = await readSpellJsonSource(root, 'commit-test');
  assert.equal(source.path, 'data/spells.json');
  assert.equal(source.format, 'json');
  assert.equal(source.commit, 'commit-test');
  assert.equal(source.records.length, 656);
  assert.equal(new Set(source.records.map((r) => r.key)).size, 656);
  const nystul = source.records.filter((r) => r.originalName === "Nystul's Magic Aura");
  assert.equal(nystul.length, 2);
  assert.notEqual(nystul[0].key, nystul[1].key);
  assert.equal(
    nystul[0].pointer,
    '/' +
      (JSON.parse(before) as SpellInput[]).findIndex(
        (spell) => spell.name === "Nystul's Magic Aura",
      ),
  );
  const negative = source.records.filter((r) => r.originalName === 'Negative Energy Flood');
  assert.equal(negative.length, 2);
  assert.notEqual(negative[0].book, negative[1].book);
  assert.equal(before, await readFile(path.join(root, 'data/spells.json'), 'utf8'));
});

test('spell JSON rejects malformed mechanics with the exact file and row', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'weirs-spells-'));
  try {
    await mkdir(path.join(folder, 'data'));
    for (const invalid of [
      input({ circle: 10 }),
      input({ classes: [''] }),
      { ...input(), components: 'V, S' },
    ]) {
      await writeFile(path.join(folder, 'data/spells.json'), JSON.stringify([input(), invalid]));
      await assert.rejects(readSpellJsonSource(folder), /data\/spells\.json.*\/1/);
    }
  } finally {
    assert.equal(path.dirname(folder), path.resolve(tmpdir()));
    assert.ok(path.basename(folder).startsWith('weirs-spells-'));
    await rm(folder, { recursive: true, force: true });
  }
});

test('legacy book page citations resolve the correct JSON spell variant without combining different books', async () => {
  const [legacy, json, manifest] = await Promise.all([
    readLegacySources(root),
    readSpellJsonSource(root),
    readFile('content/compendium/identities.json', 'utf8'),
  ]);
  const old = legacy
    .flatMap((source) => source.records)
    .find(
      (record) =>
        record.kind === 'magia' && record.originalName.toLowerCase() === 'negative energy flood',
    )!;
  assert.match(old.book, /Xanathar.*p\.\s*\d+/i);
  const catalog = normalizeSources([...legacy, json], JSON.parse(manifest));
  const flood = catalog.records.filter(
    (record) =>
      record.kind === 'magia' && record.originalName.toLowerCase() === 'negative energy flood',
  );
  assert.equal(flood.length, 2);
  const xanathar = flood.find((record) => record.book === "Xanathar's Guide to Everything")!;
  const arcana = flood.find((record) => record.book === 'Arcana Unleashed')!;
  assert.equal(xanathar.sourcePath, 'data/spells.json');
  assert.ok(xanathar.legacyIds.includes(old.legacyId!));
  assert.ok(
    xanathar.alternatives.some((alternative) => alternative.sourcePath === 'pages/magias.html'),
  );
  assert.notEqual(xanathar.id, arcana.id);
});

test('JSON Divine Smite reuses its previously published curated concept identity', async () => {
  const [json, manifest] = await Promise.all([
    readSpellJsonSource(root),
    readFile('content/compendium/identities.json', 'utf8'),
  ]);
  const registry = JSON.parse(manifest);
  const previousId = registry.records['magia:curated:divine-smite-2024'];
  assert.equal(previousId, '601bb1f2-c5c9-853c-a328-e36986885030');
  const catalog = normalizeSources([json], registry);
  const smite = catalog.records.filter(
    (record) => record.kind === 'magia' && record.originalName === 'Divine Smite',
  );
  assert.equal(smite.length, 1);
  assert.equal(smite[0].id, previousId);
  assert.equal(smite[0].name, 'Golpe Divina');
  assert.equal(smite[0].sourcePath, 'data/spells.json');
});

test('spell description keeps upcasting and renders source text as escaped HTML', () => {
  const spell = input({
    description: '<script>alert("x")</script> & texto',
    upcasting: ['Mais dano <b>extra</b>.'],
  });
  assert.equal(
    spellDescription(spell),
    '<script>alert("x")</script> & texto\n\nMais dano <b>extra</b>.',
  );
  const html = spellDescriptionHtml(spell);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>'));
});

test('spell mechanics retain revised damage, school, class-independent metadata and cantrip scales', async () => {
  const source = JSON.parse(await readFile('data/spells.json', 'utf8')) as SpellInput[];
  const chill = source.find((s) => s.name === 'Chill Touch')!;
  const d = spellDefinition(chill, 'revision-test');
  assert.equal(d.range, 'Toque');
  assert.equal(d.school, 'Necromancia');
  assert.equal(d.circle, 0);
  assert.deepEqual(d.classRefs, []);
  assert.deepEqual(
    d.damages.map((v) => [v.dice, v.damageType]),
    [['1d10', 'necrotico']],
  );
  assert.deepEqual(d.scales, [
    { level: 5, basis: 'personagem', dice: '2d10' },
    { level: 11, basis: 'personagem', dice: '3d10' },
    { level: 17, basis: 'personagem', dice: '4d10' },
  ]);
  assert.deepEqual(spellDefinition(chill, 'revision-test'), d);
  assert.notEqual(spellDefinition(chill, 'revision-next').damages[0].id, d.damages[0].id);
  assert.equal(
    spellDefinition(
      source.find((s) => s.name === 'Cure Wounds')!,
      'cure',
    ).damages.length,
    0,
  );
});

test('ritual, concentration, material costs and consumption come from JSON text', () => {
  const d = spellDefinition(
    input({
      casting_time: '1 hora ou Ritual',
      duration: 'Concentração, até 10 minutos',
      components: ['V', 'M (pó de diamante que valha 1.500+ PO, que a magia consome)'],
    }),
    'owner',
  );
  assert.equal(d.ritual, true);
  assert.equal(d.concentration, true);
  assert.equal(d.durationSeconds, 600);
  assert.equal(d.rangeFeet, 60);
  assert.deepEqual(d.components, {
    verbal: true,
    somatic: false,
    material: 'pó de diamante que valha 1.500+ PO, que a magia consome',
    costCopper: 150000,
    consumed: true,
  });
  assert.equal(
    spellDefinition(input({ range: '300 metros [1,000 feet]' }), 'owner').rangeFeet,
    1000,
  );
  assert.equal(
    spellDefinition(input({ range: '1,5 quilômetro [1 mile]' }), 'owner').rangeFeet,
    5280,
  );
  assert.equal(
    spellDefinition(input({ range: 'Pessoal (cone de 9 metros [30 pés])' }), 'owner').rangeFeet,
    0,
  );
  assert.equal(
    spellDefinition(input({ duration: 'Instantânea ou 1 hora' }), 'owner').durationSeconds,
    null,
  );
  assert.equal(
    spellDefinition(input({ components: ['M (um anel de 25 PO que não é consumido)'] }), 'owner')
      .components.consumed,
    false,
  );
  assert.equal(
    spellDefinition(
      input({ components: ['M (um anel de 25 PO que a magia não consome)'] }),
      'owner',
    ).components.consumed,
    false,
  );
});

test('simple spell slot scaling increments base damage and uses database damage codes', () => {
  const d = spellDefinition(
    input({
      circle: 3,
      description: 'O alvo sofre 8d6 de dano de Força.',
      upcasting: ['O dano aumenta em 1d6 para cada nível de espaço de magia acima do 3º.'],
    }),
    'owner',
  );
  assert.equal(d.damages[0].damageType, 'energetico');
  assert.equal(d.scales[0].level, 4);
  assert.equal(d.scales[0].dice, '9d6');
  assert.equal(d.scales.at(-1)?.dice, '14d6');
  assert.equal(
    spellDefinition(input({ description: 'O alvo sofre 1d8 de dano Contundente.' }), 'owner')
      .damages[0].damageType,
    'concussao',
  );
});

test('alternative or subsequent damage stays manual, and range conflicts are visible warnings', () => {
  const warnings: string[] = [];
  const d = spellDefinition(
    input({
      range: '45 metros [500 pés]',
      description:
        'O alvo sofre 1d8 de dano Necrótico. Se estiver ferido, em vez disso sofre 1d12 de dano Necrótico.',
      upcasting: ['No nível 5, causa 2d8 ou 2d12 de dano.'],
    }),
    'owner',
    (message) => warnings.push(message),
  );
  assert.equal(d.rangeFeet, 500);
  assert.deepEqual(d.damages, []);
  assert.deepEqual(d.scales, []);
  assert.ok(warnings.some((message) => /dano/i.test(message)));
  assert.ok(warnings.some((message) => /alcance/i.test(message)));
  assert.ok(warnings.some((message) => /progressão/i.test(message)));
});

test('revised real spell alternatives, summoned attacks and delayed damage are never summed into a cast', async () => {
  const source = JSON.parse(await readFile('data/spells.json', 'utf8')) as SpellInput[];
  for (const name of [
    'Witch Bolt',
    'Fire Shield',
    'Toll the Dead',
    'Booming Blade',
    'Summon Beast',
    'Summon Undead',
    'Giant Insect',
    'Wish',
    'Contact Other Plane',
    'Dimension Door',
    'Teleport',
    'Meld into Stone',
    'Create Homunculus',
    'Web',
    'Glyph of Warding',
    'Forbiddance',
    'Illusory Dragon',
  ]) {
    const warnings: string[] = [];
    const d = spellDefinition(
      source.find((s) => s.name === name)!,
      name,
      (message) => warnings.push(message),
    );
    assert.deepEqual(d.damages, [], name);
    assert.ok(
      warnings.some((message) => /dano/i.test(message)),
      name,
    );
  }
  for (const name of ['Guidance', 'Resistance', 'Blade Ward', 'Cure Wounds'])
    assert.deepEqual(
      spellDefinition(
        source.find((s) => s.name === name)!,
        name,
      ).damages,
      [],
      name,
    );
});

test('spell metadata retains explicit source saves and optional attack/CD without guessing unrelated attributes', () => {
  const explicit = spellDefinition(
    input({ save_ability: 'des', attack_bonus: 7, save_dc: 15 } as any),
    'revision',
  );
  assert.equal(explicit.saveAbility, 'des');
  assert.equal(explicit.attackBonus, 7);
  assert.equal(explicit.saveDc, 15);
  const prose = spellDefinition(
    input({
      description:
        'O alvo faz uma salvaguarda de Destreza. O dano usa seu modificador de Inteligência.',
    }),
    'revision',
  );
  assert.equal(prose.saveAbility, 'des');
  assert.equal(
    spellDefinition(input({ description: 'A criatura ganha Força e recebe dano.' }), 'revision')
      .saveAbility,
    undefined,
  );
});

test('primary spell save ignores ambiguous alternatives, save benefits and actual summoned stat blocks', async (t) => {
  for (const description of [
    'O alvo faz uma salvaguarda de Força ou Destreza, à escolha dele.',
    'O alvo deve obter sucesso em uma salvaguarda de Força ou Constituição, à escolha dele.',
    'Você tem vantagem em salvaguardas de Sabedoria.',
    'O alvo tem vantagem em salvaguardas de Sabedoria.',
    'O alvo faz uma salvaguarda de Sabedoria com vantagem.',
    'O alvo faz uma salvaguarda de Força, Destreza ou Constituição, à escolha dele.',
    'Bloco de estatísticas de Espírito. A criatura faz uma salvaguarda de Força.',
  ])
    await t.test(description, () => {
      assert.equal(spellDefinition(input({ description }), 'revision').saveAbility, undefined);
    });
  const source = JSON.parse(
    await readFile(path.join(root, 'data/spells.json'), 'utf8'),
  ) as SpellInput[];
  const dinosaur = source.find((spell) => spell.name === 'Summon Dinosaur')!;
  assert.match(dinosaur.description, /Robusto[\s\S]*salvaguarda de Força ou Constituição/);
  await t.test('actual Summon Dinosaur Robusto bonus is not an imposed spell save', () => {
    assert.equal(spellDefinition(dinosaur, 'dinosaur-revision').saveAbility, undefined);
  });
  assert.equal(
    spellDefinition(
      source.find((spell) => spell.name === 'Acid Splash')!,
      'acid-revision',
    ).saveAbility,
    'des',
  );
  assert.equal(
    spellDefinition(
      source.find((spell) => spell.name === 'Hold Person')!,
      'hold-revision',
    ).saveAbility,
    'sab',
  );
  assert.equal(
    spellDefinition(
      input({ description: dinosaur.description, save_ability: 'con' }),
      'explicit-revision',
    ).saveAbility,
    'con',
  );
});
