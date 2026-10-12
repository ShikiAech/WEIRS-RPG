import test from 'node:test';
import assert from 'node:assert/strict';
import { importContent, safeHtml, stableId } from '../tools/content-import/index.ts';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { load } from 'cheerio';

test('importa o acervo real inteiro, preservando narrativas e identidade dos registros', async () => {
  const first = await importContent(process.cwd());
  const second = await importContent(process.cwd());
  const counts = Object.fromEntries(
    ['magia', 'talento', 'antecedente', 'classe', 'especie'].map((kind) => [
      kind,
      first.entries.filter((e) => e.kind === kind).length,
    ]),
  );
  assert.deepEqual(counts, { magia: 477, talento: 203, antecedente: 61, classe: 17, especie: 31 });
  assert.equal(first.campaigns.flatMap((c) => c.sessions).length, 16);
  assert.equal(first.campaigns.flatMap((c) => c.biographies).length, 19);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.entries.map((e) => e.id)).size, first.entries.length);
  const newSpecies = [
    ['Anansis', 'anansis', 'anansi.png'],
    ['Fenrirs', 'fenrirs', 'fenrir.jpg'],
    ['Kinect', 'kinects', 'kinect.jpg'],
    ['Malteanos', 'malteanos', 'malteano.png'],
    ['N0-V4', 'n0-v4', 'n0v4.png'],
    ['Nanuks', 'nanuks', 'nanuk.jpg'],
    ['Nemeios', 'nemeios', 'nemeio.jpg'],
    ['Norlock', 'norlocks', 'norlock.jpg'],
    ['Yokais', 'yokais', 'yokai.png'],
    ['Zoldyanos', 'zoldyanos', 'zoldyano.png'],
    ['Zonuianos', 'zonuianos', 'zonuiano.png'],
    ['Zorak', 'zoraks', 'zorak.png'],
  ];
  for (const [name, file, image] of newSpecies) {
    const sourcePath = `pages/races/${file}.html`;
    const entries = first.entries.filter(
      (e) => e.kind === 'especie' && e.sourcePath === sourcePath,
    );
    assert.equal(entries.length, 1, `Espécie importada uma vez: ${sourcePath}`);
    const entry = entries[0];
    assert.equal(entry.name, name);
    assert.equal(entry.sourceUrl, `/WEIRS-RPG/${sourcePath}`);
    const $ = load(entry.descriptionHtml);
    assert.equal($('h2').first().text(), name);
    assert.match($.text(), /Habilidades Raciais/);
    assert.doesNotMatch($.text(), /^\s*(?:<{7}|={7}|>{7})/m, sourcePath);
    assert.equal($('img').first().attr('src'), `/WEIRS-RPG/img/${image}`);
    assert.ok(first.manifest.sources.some((source) => source.path === `img/${image}`));
  }
  const newFeats = [
    ['Espírito Manchado', 'origem', 'Humano Manchado', 'Aumento de Potencial'],
    ['Mancha Superior da Manifestação Energética', 'geral', 'Nível 4+', 'Especialidade Inata'],
    ['Mancha Superior do Deslocamento Aumentado', 'geral', 'Nível 4+', 'Movimento Etéreo'],
    ['Mancha Superior do Corpo Potente', 'geral', 'Nível 4+', 'Resistência Fantasma'],
    ['Mancha Suprema', 'geral', 'Nível 12+', 'Último de Pé'],
  ];
  for (const [name, type, prerequisite, feature] of newFeats) {
    const entries = first.entries.filter((e) => e.kind === 'talento' && e.name === name);
    assert.equal(entries.length, 1, `Talento importado uma vez: ${name}`);
    const entry = entries[0];
    assert.equal(entry.sourcePath, 'pages/talentos.html');
    assert.equal(entry.metadata.tipo, type);
    const description = load(entry.descriptionHtml).text();
    assert.ok(description.includes(prerequisite), `Pré-requisito preservado: ${name}`);
    assert.ok(description.includes(feature), `Habilidade preservada: ${name}`);
  }
  assert.ok(!first.entries.some((e) => e.metadata.nome === 'nome-do-talento'));
  assert.equal(
    first.entries.find((e) => e.kind === 'especie' && e.name === 'N0-V4')!.id,
    'f03ab1f8-a660-83c4-a848-9e66ffb52dcd',
  );
  assert.equal(
    first.entries.find((e) => e.kind === 'talento' && e.name === 'Espírito Manchado')!.id,
    '08e965bb-0454-888c-abab-190a070407c9',
  );
  const spell = first.entries.find((e) => e.metadata.original === 'calm emotions')!;
  assert.equal(spell.name, 'Acalmar Emoções');
  assert.equal(spell.metadata.concentracao, 'true');
  assert.equal(spell.id, '707d404f-c95a-87f0-a795-df42270004bc');
  assert.match(spell.metadata.duracao || '', /Até 1 minuto/i);
  assert.match(spell.descriptionHtml, /hostil/);
  const othans = first.campaigns.find((c) => c.slug === 'othans')!;
  assert.equal(othans.name, 'Crônicas de Othans');
  assert.match(first.campaigns.find((c) => c.slug === 'epm')!.name, /Escola/);
  assert.equal(othans.sessions.length, 14);
  assert.ok(othans.sessions[0].descriptionHtml.length > othans.sessions[0].preview.length);
  assert.ok(first.manifest.sources.some((s) => s.path === 'img/weirs2.logo.png'));
});

test('reordenar cartões não troca a identidade das variantes com nomes repetidos', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'weirs-import-'));
  try {
    for (const source of ['index.html', 'pages', 'css', 'javascript', 'img'])
      await cp(path.join(process.cwd(), source), path.join(directory, source), { recursive: true });
    const file = path.join(directory, 'pages/talentos.html');
    const $ = load(await readFile(file, 'utf8'));
    const cards = $('.card-talento').toArray();
    const parent = $(cards[0]).parent();
    for (const card of cards.reverse()) parent.append(card);
    await writeFile(file, $.html());
    const [original, reordered] = await Promise.all([
      importContent(process.cwd()),
      importContent(directory),
    ]);
    for (const entry of original.entries) {
      const same = reordered.entries.find(
        (e) =>
          e.sourcePath === entry.sourcePath &&
          e.name === entry.name &&
          e.descriptionHtml === entry.descriptionHtml,
      )!;
      assert.equal(same.id, entry.id, entry.name);
    }
  } finally {
    // A remoção só pode alcançar o diretório temporário específico desta fixture.
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith('weirs-import-')
    )
      throw Error('Diretório de teste inesperado');
    await rm(directory, { recursive: true, force: true });
  }
});

test('HTML importado retém tabelas e links locais sem executar conteúdo ou permitir URLs perigosas', () => {
  const result = safeHtml(
    '<script>alert(1)</script><p onclick="alert(1)">Ímpio</p><a href="javascript:alert(1)">ruim</a><a href="../talentos.html#alerta">Alerta</a><table><tr><td>1d8</td></tr></table><img src="x" onerror="alert(1)">',
    'pages/classes/mago.html',
  );
  assert.doesNotMatch(result, /script|onclick|onerror|javascript:/);
  assert.match(result, /<table>/);
  assert.match(result, /href="\/WEIRS-RPG\/pages\/talentos.html#alerta"/);
  assert.equal(stableId('magia:teste'), stableId('magia:teste'));
  assert.notEqual(stableId('magia:teste'), stableId('talento:teste'));
});
