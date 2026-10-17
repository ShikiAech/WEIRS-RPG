import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readJsonSources } from './json';
import { readLegacySources } from './legacy';
import { normalizeSources } from './normalize';
import { loadCuration, resolveCatalog } from './resolve';
import { coverageReport, generateSeed } from './sql';
import { exportPublishedSnapshot } from './snapshot';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.some((arg) => !['--check', '--seed'].includes(arg)))
  throw Error('Use --check ou --seed. Os comandos não acessam o banco remoto.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const [json, legacy, registry, curation] = await Promise.all([
  readJsonSources(root, commit),
  readLegacySources(root, commit),
  readFile(path.join(root, 'content/compendium/identities.json'), 'utf8').then(JSON.parse),
  loadCuration(root),
]);
for (const source of [...json, ...legacy])
  source.commit = execFileSync('git', ['log', '-1', '--format=%H', '--', source.path], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
registry.aliases={...registry.aliases,...curation.aliases.identities};
const imported = normalizeSources([...legacy, ...json], registry);
const resolved = resolveCatalog(imported, curation);
const report = coverageReport(resolved);
await writeFile(
  path.join(root, 'content/compendium/coverage.json'),
  JSON.stringify(report, null, 2) + '\n',
);
const errors = report.issues.filter((i) => i.severity === 'error');
console.log(
  JSON.stringify(
    {
      concepts: report.concepts,
      sourceElements: report.sourceElements,
      sources: report.sources,
      byKind: report.byKind,
      relations: report.relations,
      errors: errors.length,
      warnings: report.issues.length - errors.length,
    },
    null,
    2,
  ),
);
if (args.includes('--seed')) {
  await mkdir(path.join(root, 'public/compendium'), { recursive: true });
  await writeFile(
    path.join(root, 'public/compendium/demo.json'),
    JSON.stringify(exportPublishedSnapshot(resolved)) + '\n',
  );
  await writeFile(path.join(root, 'supabase/compendium-seed.sql'), generateSeed(resolved));
  await writeFile(
    path.join(root, 'content/compendium/identities.json'),
    JSON.stringify(imported.identityRegistry, null, 2) + '\n',
  );
  console.log('SQL gerado em supabase/compendium-seed.sql. Nenhuma conexão ao banco foi aberta.');
}
if (errors.length) {
  console.error(
    'Pendências obrigatórias registradas em content/compendium/coverage.json; as revisões afetadas permanecem em rascunho.',
  );
  process.exitCode = 1;
}
