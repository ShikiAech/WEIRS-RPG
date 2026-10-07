import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { importContent } from './index';

const bundle = await importContent(process.cwd());
const output = path.resolve('content/generated');
await mkdir(path.join(output, 'entries'), { recursive: true });
const index = bundle.entries.map(({ descriptionHtml, ...entry }) => entry);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const seed = `-- Gerado pelo importador a partir das páginas originais. Executar como administrador após a migração.\n-- Não altera nomes já cadastrados e não concede acesso a nenhuma conta.\nINSERT INTO public.campanhas (id,nome) VALUES\n${bundle.campaigns.map((c) => `  (${quote(c.id)},${quote(c.name)})`).join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`;
await Promise.all([
  writeFile(path.join(output, 'index.json'), JSON.stringify(index)),
  writeFile(path.join(output, 'campaigns.json'), JSON.stringify(bundle.campaigns)),
  writeFile(path.join(output, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2)),
  writeFile('supabase/seed.sql', seed),
  ...bundle.entries.map((entry) =>
    writeFile(path.join(output, 'entries', `${entry.id}.json`), JSON.stringify(entry)),
  ),
]);
const expected = new Set(bundle.entries.map((e) => e.id + '.json'));
const entriesDirectory = path.join(output, 'entries');
for (const filename of await readdir(entriesDirectory)) {
  if (!/^[a-f\d-]{36}\.json$/.test(filename) || expected.has(filename)) continue;
  const target = path.resolve(entriesDirectory, filename);
  if (path.dirname(target) !== entriesDirectory)
    throw Error('Caminho inesperado no catálogo gerado.');
  await unlink(target);
}
console.log(
  `Importação concluída: ${index.length} registros, ${bundle.campaigns.length} campanhas. Fontes preservadas; ${bundle.manifest.warnings.length} avisos no manifesto.`,
);
