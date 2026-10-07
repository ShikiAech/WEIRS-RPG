import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/content', { recursive: true });
for (const name of ['index.html', 'pages', 'css', 'javascript', 'img']) {
  await cp(name, `dist/${name}`, { recursive: true });
}
await cp('content/generated', 'dist/content/generated', { recursive: true });
console.log('Páginas, imagens e scripts originais preservados na publicação.');
