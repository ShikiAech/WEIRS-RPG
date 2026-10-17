import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJsonSources } from '../tools/compendium-import/json';
import { readLegacySources, readLiteralDataset } from '../tools/compendium-import/legacy';
import { normalizeSources } from '../tools/compendium-import/normalize';

const root = path.resolve(import.meta.dirname, '..');

async function temporarySources(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(path.join(tmpdir(), 'weirs-compendium-'));
  try {
    await mkdir(path.join(folder, 'data'));
    for (const file of ['background.json', 'feats.json', 'races.json'])
      await writeFile(path.join(folder, 'data', file), '[]');
    await run(folder);
  } finally {
    if (
      path.dirname(path.resolve(folder)) !== path.resolve(tmpdir()) ||
      !path.basename(folder).startsWith('weirs-compendium-')
    )
      throw Error('Diretório temporário inválido');
    await rm(folder, { recursive: true, force: true });
  }
}

test('ingestão lê os três JSONs e separa traços e linhagens sem modificar as fontes', async () => {
  const before = await readFile(path.join(root, 'data/races.json'), 'utf8');
  const sources = await readJsonSources(root);
  const records = sources.flatMap((s) => s.records);
  const count = (kind: string) => records.filter((r) => r.kind === kind).length;
  assert.equal(sources.length, 3);
  assert.equal(count('antecedente'), 71);
  assert.equal(count('talento'), 204);
  assert.equal(count('especie'), 30);
  assert.equal(count('linhagem'), 18);
  assert.equal(count('caracteristica'), 173);
  const human = records.find((r) => r.kind === 'especie' && r.name === 'Humanos')!;
  const marked = records.find((r) => r.kind === 'linhagem' && r.name === 'Manchados')!;
  assert.equal(marked.parentKey, human.key);
  const stain = records.find((r) => r.parentKey === marked.key && r.name === 'Mancha')!;
  assert.match(stain.description, /Mancha Espiritual/);
  assert.equal(before, await readFile(path.join(root, 'data/races.json'), 'utf8'));
});

test('extração complementar mantém Neflins, classes, magias e variantes do legado', async () => {
  const sources = await readLegacySources(root);
  const records = sources.flatMap((s) => s.records);
  assert.ok(records.some((r) => r.kind === 'especie' && r.name === 'Neflins'));
  assert.equal(records.filter((r) => r.kind === 'classe').length, 17);
  assert.equal(records.filter((r) => r.kind === 'magia').length, 477);
  assert.equal(records.filter((r) => r.kind === 'talento' && r.name === 'Luta Cega').length, 2);
  assert.ok(records.some((r) => r.kind === 'subclasse' && /Campeão/.test(r.name)));
  assert.ok(records.some((r) => r.kind === 'equipamento' && /Adaga/.test(r.name)));
  assert.ok(records.some((r) => r.kind === 'idioma' && /Comum/.test(r.name)));
  assert.ok(sources.every((s) => !/\/(?:teste|teste-racas)\.html$/.test(s.path)));
  const combined = normalizeSources(sources, { records: {} });
  assert.ok(combined.records.some((r) => r.kind === 'especie' && r.name === 'Neflins'));
  assert.equal(new Set(combined.records.map((r) => r.id)).size, combined.records.length);
});

test('identidade não muda quando nome traduzido ou descrição da mesma origem muda', async () => {
  await temporarySources(async (folder) => {
    const file = path.join(folder, 'data/feats.json');
    const feat = {
      name: 'Alert',
      name_pt: 'Alerta',
      book: "Player's Handbook (2024)",
      publisher: 'Wizards of the Coast',
      type: 'Origem',
      description: 'Descrição inicial.',
      tags: [],
    };
    await writeFile(file, JSON.stringify([feat]));
    const firstSources = await readJsonSources(folder);
    const first = normalizeSources(firstSources, { records: {} });
    await writeFile(
      file,
      JSON.stringify([{ ...feat, name_pt: 'Vigilância', description: 'Descrição revisada.' }]),
    );
    const secondSources = await readJsonSources(folder);
    const second = normalizeSources(secondSources, first.identityRegistry);
    assert.equal(first.records[0].id, second.records[0].id);
    assert.notEqual(firstSources[1].hash, secondSources[1].hash);
    assert.notEqual(first.records[0].revisionId, second.records[0].revisionId);
    assert.equal(second.records[0].name, 'Vigilância');
  });
});

test('JSON inválido informa a fonte e não vira catálogo vazio', async () => {
  await temporarySources(async (folder) => {
    await writeFile(path.join(folder, 'data/background.json'), '[ inválido');
    await assert.rejects(readJsonSources(folder), /data[\\/]background\.json/);
  });
});

test('antecedentes JSON exibem a descrição e todos os benefícios no mesmo registro', async () => {
  const backgrounds = (await readJsonSources(root)).flatMap((s) => s.records);
  const acolyte = backgrounds.find((r) => r.name === 'Acólito')!;
  assert.match(acolyte.description, /Você se dedicou ao serviço em um templo/);
  for (const text of [
    'Atributos: Inteligência, Sabedoria, Carisma',
    'Perícias: Intuição, Religião',
    'Ferramentas: Suprimentos de Calígrafo',
    'Talento: Iniciado em Magia (Clérigo)',
    'Equipamento — opção A:',
    'Pergaminho (10 folhas)',
    '8 PO',
    'Equipamento — opção B: 50 PO',
  ])
    assert.ok(acolyte.description.includes(text), text);
  const knight = backgrounds.find((r) => r.name === 'Cavaleiro da Manopla')!;
  assert.match(knight.description, /Talento: Noviço da Manopla/);
  assert.match(knight.description, /Perícias: Atletismo, Medicina/);
});

test('antecedente HTML equivalente é consolidado no JSON e preserva procedência e referências', async () => {
  const sources = [...(await readLegacySources(root)), ...(await readJsonSources(root))];
  const registry = JSON.parse(
    await readFile(path.join(root, 'content/compendium/identities.json'), 'utf8'),
  );
  const c = normalizeSources(sources, registry);
  const acolytes = c.records.filter((r) => r.kind === 'antecedente' && r.name === 'Acólito');
  assert.equal(acolytes.length, 1);
  assert.equal(acolytes[0].sourcePath, 'data/background.json');
  assert.equal(
    acolytes[0].id,
    registry.records['antecedente:legacy:pages/antecedentes.html:acolito'],
  );
  assert.equal(acolytes[0].legacyIds.length, 1);
  assert.ok(acolytes[0].alternatives.some((a) => a.sourcePath === 'pages/antecedentes.html'));
  assert.ok(!c.records.some((r) => r.kind === 'antecedente' && r.name === 'Agente da Casa'));
  assert.ok(
    c.records.some(
      (r) => r.kind === 'antecedente' && r.name === 'Agente de Casa' && r.legacyIds.length === 1,
    ),
  );
});

test('consolidação não escolhe entre antecedentes homônimos de livros diferentes', async () => {
  const sources = [...(await readLegacySources(root)), ...(await readJsonSources(root))];
  const json = sources.find((s) => s.path === 'data/background.json')!;
  const acolyte = json.records.find((r) => r.name === 'Acólito')!;
  json.records.push({
    ...acolyte,
    key: 'antecedente:json:outro-livro:acolyte',
    book: 'Outro livro',
  });
  const c = normalizeSources(sources, { records: {} });
  assert.equal(c.records.filter((r) => r.kind === 'antecedente' && r.name === 'Acólito').length, 3);
});

test('datasets literais são extraídos sem executar scripts das páginas', () => {
  assert.deepEqual(
    readLiteralDataset(
      `const weaponsDataset = { simples: [
    { nome: 'Adaga', dano: '1d4', custo: 2, leve: true, extra: null }
  ] };`,
      'weaponsDataset',
    ),
    {
      simples: [{ nome: 'Adaga', dano: '1d4', custo: 2, leve: true, extra: null }],
    },
  );
  assert.throws(
    () =>
      readLiteralDataset(
        'const weaponsDataset = (() => { throw Error("executado"); })();',
        'weaponsDataset',
      ),
    /literal/i,
  );
  assert.throws(
    () => readLiteralDataset('const weaponsDataset = { ...external };', 'weaponsDataset'),
    /literal/i,
  );
});
test('confirmed identity alias preserves legacy UUID and original source variant', async () => {
  const sources = [...(await readLegacySources(root)), ...(await readJsonSources(root))];
  const curation = JSON.parse(
    await readFile(path.join(root, 'content/compendium/aliases.json'), 'utf8'),
  );
  const c = normalizeSources(sources, { records: {}, aliases: curation.identities });
  const records = c.records.filter((r) => r.kind === 'talento' && r.name === 'Espírito Manchado');
  assert.equal(records.length, 1);
  assert.equal(records[0].sourcePath, 'data/feats.json');
  assert.equal(records[0].legacyIds.length, 1);
  assert.equal(records[0].alternatives.length, 1);
  assert.equal(records[0].alternatives[0].sourcePath, 'pages/talentos.html');
  assert.ok(records[0].alternatives[0].sourceId);
});
