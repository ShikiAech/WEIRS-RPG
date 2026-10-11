import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('dist/content/generated/manifest.json', 'utf8'));
for (const source of manifest.sources) {
  const current = await readFile(source.path);
  const published = await readFile(`dist/${source.path}`);
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  if (hash(current) !== source.sha256 || hash(published) !== source.sha256)
    throw Error(`Fonte alterada ou ausente no build: ${source.path}`);
}
console.log(
  `Integridade confirmada: ${manifest.sources.length} arquivos originais idênticos no build.`,
);
const index = JSON.parse(await readFile('dist/content/generated/index.json', 'utf8'));
const entryFiles = await readdir('dist/content/generated/entries');
if (index.length !== entryFiles.length || index.some((e) => !entryFiles.includes(e.id + '.json')))
  throw Error('Catálogo publicado incompleto ou com registros órfãos.');
