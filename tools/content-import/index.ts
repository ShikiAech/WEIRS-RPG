import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import type { ContentBundle, ContentEntry, ContentKind } from '../../packages/contracts/content';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const text = (value: string) => value.replace(/\s+/g, ' ').trim();
const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function stableId(key: string): string {
  const h = digest(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function safeHtml(html: string, sourcePath: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      's',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'img',
      'div',
      'span',
      'hr',
      'details',
      'summary',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'loading'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      '*': (tag, attrs) => {
        for (const key of ['href', 'src']) {
          const value = attrs[key];
          if (value && !/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith('//')) {
            const url = new URL(value, `https://weirs.invalid/WEIRS-RPG/${sourcePath}`);
            attrs[key] = url.pathname + url.search + url.hash;
          }
        }
        if (tag === 'img') attrs.loading = 'lazy';
        return { tagName: tag, attribs: attrs };
      },
    },
  });
}

async function files(root: string, folder: string): Promise<string[]> {
  const results: string[] = [];
  for (const item of await readdir(path.join(root, folder), { withFileTypes: true })) {
    const relative = path.posix.join(folder, item.name);
    if (item.isDirectory()) results.push(...(await files(root, relative)));
    else results.push(relative);
  }
  return results.sort();
}

export async function importContent(root: string): Promise<ContentBundle> {
  const bundle: ContentBundle = {
    entries: [],
    campaigns: [],
    manifest: { schemaVersion: 1, sources: [], warnings: [] },
  };
  const sourceFiles = [
    'index.html',
    ...(await files(root, 'pages')),
    ...(await files(root, 'css')),
    ...(await files(root, 'javascript')),
    ...(await files(root, 'img')),
  ].sort();
  for (const sourcePath of sourceFiles) {
    const raw = await readFile(path.join(root, sourcePath));
    bundle.manifest.sources.push({ path: sourcePath, sha256: digest(raw), bytes: raw.length });
  }
  async function cards(
    sourcePath: string,
    selector: string,
    kind: ContentKind,
    titleSelector: string,
  ) {
    const raw = await readFile(path.join(root, sourcePath), 'utf8');
    const $ = load(raw);
    $(selector).each((_, element) => {
      const card = $(element);
      const title = card.find(titleSelector).first().clone();
      title.find('.badge-tipo').remove();
      const name = text(title.text()) || text($('h2').first().text());
      const attributes = card.attr() || {};
      const metadata = Object.fromEntries(
        Object.entries(attributes)
          .filter(([key]) => key.startsWith('data-'))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key.slice(5), value]),
      );
      const sourceLabel = text(card.find('.magia-fonte').text());
      const descriptionHtml = safeHtml(
        (kind === 'magia' ? card.find('.magia-descricao').html() : card.html()) || '',
        sourcePath,
      );
      const key = `${kind}:${sourcePath}:${slug(name)}:${JSON.stringify(metadata)}:${sourceLabel}`;
      const id = stableId(key);
      const entry: ContentEntry = {
        id,
        slug: slug(name),
        kind,
        name,
        metadata,
        descriptionHtml,
        sourcePath,
        sourceUrl: `/WEIRS-RPG/${sourcePath}${attributes.id ? '#' + attributes.id : ''}`,
        sourceLabel,
        revision: digest(card.html() || ''),
        edition: 'revisao-pendente',
      };
      bundle.entries.push(entry);
    });
  }
  await cards('pages/magias.html', '.carta-magia', 'magia', '.magia-nome');
  await cards('pages/talentos.html', '.card-talento', 'talento', 'h4');
  await cards('pages/antecedentes.html', '.card-antecedente', 'antecedente', 'h3');
  for (const file of await files(root, 'pages/classes')) {
    if (file.endsWith('.html') && !/\/(classes|teste)\.html$/.test(file))
      await cards(file, '.container', 'classe', 'h2');
  }
  for (const file of await files(root, 'pages/races')) {
    if (file.endsWith('.html') && !/\/(racas|teste-racas)\.html$/.test(file))
      await cards(file, '.container', 'especie', 'h2');
  }
  const groups = new Map<string, ContentEntry[]>();
  for (const entry of bundle.entries)
    groups.set(entry.id, [...(groups.get(entry.id) || []), entry]);
  for (const [id, variants] of groups) {
    if (variants.length < 2) continue;
    bundle.manifest.warnings.push(
      `Nome repetido em ${variants[0].sourcePath}: ${variants[0].name}. Variantes diferenciadas pela descrição; revisar edição e origem antes de alterar esses textos.`,
    );
    for (const entry of variants) entry.id = stableId(id + ':' + digest(entry.descriptionHtml));
  }
  if (new Set(bundle.entries.map((e) => e.id)).size !== bundle.entries.length)
    throw Error(
      'Registros duplicados sem identidade distinta. Revise as fontes antes de importar.',
    );
  for (const campaignSlug of ['othans', 'epm', 'taverna-jungle-jack']) {
    const sourcePath = `pages/campaigns/${campaignSlug}.html`;
    const $ = load(await readFile(path.join(root, sourcePath), 'utf8'));
    const id = stableId('campanha:' + campaignSlug);
    const sessions = $('.camp-card')
      .toArray()
      .map((element) => {
        const card = $(element);
        const anchor = card.attr('data-modal') || '';
        const modal = $('[id]')
          .filter((_, el) => $(el).attr('id') === anchor)
          .first();
        if (!modal.length)
          bundle.manifest.warnings.push(`Sessão sem modal: ${sourcePath}#${anchor}`);
        return {
          id: stableId(`${id}:sessao:${anchor}`),
          title: text(card.find('h3').text()),
          preview: text(card.find('.camp-details-preview').text()),
          descriptionHtml: safeHtml(
            modal.find('.modal-desc').html() || modal.html() || '',
            sourcePath,
          ),
          sourceAnchor: anchor,
        };
      });
    const biographies = $('.card-pj')
      .toArray()
      .map((element) => {
        const card = $(element);
        const name = text(card.find('.nome-pj').text());
        return {
          id: stableId(`${id}:personagem:${name}`),
          name,
          descriptionHtml: safeHtml(card.html() || '', sourcePath),
        };
      });
    const name =
      text($('.header-campanha h1').first().text()) ||
      text($('h1,h2').first().text()) ||
      text($('title').text()).replace(/\s*[—–-]\s*Weirs RPG\s*$/i, '') ||
      campaignSlug;
    bundle.campaigns.push({
      id,
      slug: campaignSlug,
      name,
      sourceUrl: '/WEIRS-RPG/' + sourcePath,
      descriptionHtml: safeHtml($('.bloco-aviso').html() || '', sourcePath),
      sessions,
      biographies,
    });
  }
  bundle.manifest.warnings.push(
    'Edição e permissões de publicação devem ser revisadas por registro antes de automatizar regras ou ampliar a publicação.',
  );
  return bundle;
}
