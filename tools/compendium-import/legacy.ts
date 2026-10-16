import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSync, type ESTree } from 'vite';
import { load } from 'cheerio';
import { importContent, safeHtml } from '../content-import/index';
import { hash, normalizeName } from './identity';
import type { ImportedSource, JsonObject, JsonValue, SourceRecord } from './model';

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
export function plainHtml(html: string): string {
  const $ = load(html);
  $('p,li,h2,h3,h4,h5,h6,tr').append('\n\n');
  $('th,td').append(' | ');
  $('br').replaceWith('\n');
  return $.root()
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/** Parse a literal syntax tree. Calls, getters, spreads and expressions are refused. */
export function readLiteralDataset(script: string, variableName: string): JsonValue {
  const parsed = parseSync('source.js', script, { sourceType: 'script' });
  if (parsed.errors.length) throw Error('Sintaxe do dataset literal inválida: ' + variableName);
  let initializer: ESTree.Node | undefined;
  function visit(node: ESTree.Node) {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === variableName
    ) {
      if (initializer) throw Error('Dataset literal ambíguo: ' + variableName);
      initializer = node.init ?? undefined;
    }
    for (const value of Object.values(node)) {
      const children: unknown[] = Array.isArray(value) ? value : [value];
      for (const child of children)
        if (
          child !== null &&
          typeof child === 'object' &&
          'type' in child &&
          typeof child.type === 'string'
        )
          visit(child as ESTree.Node);
    }
  }
  visit(parsed.program);
  if (!initializer) throw Error('Dataset literal não encontrado: ' + variableName);
  function literal(node: ESTree.Node, depth = 0): JsonValue {
    if (depth > 32) throw Error('Dataset literal muito profundo');
    if (
      node.type === 'Literal' &&
      (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))
    )
      return node.value as string | number | boolean | null;
    if (
      node.type === 'TemplateLiteral' &&
      !node.expressions.length &&
      node.quasis[0]?.value.cooked !== null
    )
      return node.quasis[0].value.cooked;
    if (
      node.type === 'UnaryExpression' &&
      (node.operator === '-' || node.operator === '+') &&
      node.argument.type === 'Literal' &&
      typeof node.argument.value === 'number'
    )
      return (node.operator === '-' ? -1 : 1) * node.argument.value;
    if (node.type === 'ArrayExpression')
      return node.elements.map((item) => {
        if (!item) throw Error('Lacuna em array literal');
        return literal(item, depth + 1);
      });
    if (node.type === 'ObjectExpression') {
      const result: JsonObject = {};
      for (const property of node.properties) {
        if (
          property.type !== 'Property' ||
          property.kind !== 'init' ||
          property.method ||
          property.shorthand ||
          property.computed ||
          !(
            property.key.type === 'Identifier' ||
            (property.key.type === 'Literal' &&
              ['string', 'number'].includes(typeof property.key.value))
          )
        )
          throw Error('Propriedade não literal em ' + variableName);
        const key =
          property.key.type === 'Identifier' ? property.key.name : String(property.key.value);
        if (Object.hasOwn(result, key)) throw Error('Chave literal repetida: ' + key);
        Object.defineProperty(result, key, {
          value: literal(property.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return result;
    }
    throw Error('Expressão não literal em ' + variableName);
  }
  return literal(initializer);
}

export async function readLegacySources(root: string, commit = ''): Promise<ImportedSource[]> {
  const bundle = await importContent(root);
  const sources = new Map<string, ImportedSource>();
  const keyCounts = new Map<string, number>();
  const unique = (key: string) => {
    const count = (keyCounts.get(key) ?? 0) + 1;
    keyCounts.set(key, count);
    return count === 1 ? key : key + ':variant:' + count;
  };
  const sourceFor = async (file: string) => {
    let source = sources.get(file);
    if (!source) {
      const raw = await readFile(path.join(root, file), 'utf8');
      source = { path: file, hash: hash(raw), commit, format: 'html', records: [] };
      sources.set(file, source);
    }
    return source;
  };
  for (const entry of bundle.entries) {
    const source = await sourceFor(entry.sourcePath);
    const key = unique(
      entry.kind === 'especie'
        ? 'especie:weirs:' + normalizeName(entry.name)
        : entry.kind + ':legacy:' + entry.sourcePath + ':' + entry.slug,
    );
    source.records.push({
      key,
      kind: entry.kind,
      name: entry.name,
      originalName: entry.metadata.original ?? entry.name,
      description: plainHtml(entry.descriptionHtml),
      descriptionHtml: entry.descriptionHtml,
      book: entry.sourceLabel || 'Acervo Weirs — fonte em revisão',
      publisher: entry.kind === 'especie' ? 'WEIRS - Homebrew' : 'WEIRS',
      pointer: entry.sourceUrl.split('#')[1] ?? entry.slug,
      anchor: entry.sourceUrl.split('#')[1] ?? '',
      legacyId: entry.id,
      payload: { type: 'legacy', entry },
    });
  }
  for (const source of [...sources.values()].filter((s) =>
    s.records.some((r) => r.kind === 'classe'),
  )) {
    const raw = await readFile(path.join(root, source.path), 'utf8'),
      $ = load(raw);
    const parent = source.records.find((r) => r.kind === 'classe')!;
    const panes = new Map<object, string>();
    const featureElements = new Map<object, string>();
    const section = (
      element: Parameters<typeof $>[0],
      kind: 'subclasse' | 'caracteristica' | 'criatura',
      key: string,
      name: string,
      parentKey: string,
      pointer: string,
      level?: number,
    ): SourceRecord => {
      const block = $(element),
        html = safeHtml(block.html() ?? '', source.path);
      return {
        key: unique(key),
        parentKey,
        kind,
        name,
        originalName: name,
        description: plainHtml(html),
        descriptionHtml: html,
        book: parent.book,
        publisher: parent.publisher,
        pointer,
        anchor: block.attr('id') ?? '',
        level,
        payload: {
          type: 'section',
          html,
          category: kind,
          tables: block
            .find('table')
            .map((_, table) => [
              $(table)
                .find('tr')
                .map((_, row) => [
                  $(row)
                    .find('th,td')
                    .map((_, cell) => clean($(cell).text()))
                    .get(),
                ])
                .get(),
            ])
            .get(),
        },
      };
    };
    $('.subclasses-container .tab-pane').each((i, element) => {
      const name = clean($(element).find('h3').first().text());
      if (!name) return;
      const anchor = $(element).attr('id') ?? $(element).attr('data-tab') ?? normalizeName(name);
      const record = section(
        element,
        'subclasse',
        parent.key + ':subclass:' + anchor,
        name,
        parent.key,
        '.tab-pane/' + i,
      );
      panes.set(element, record.key);
      source.records.push(record);
    });
    $('.recurso-card').each((i, element) => {
      const header = clean($(element).find('.recurso-nome').first().text());
      if (!header) return;
      const match = /^N[ií]vel\s+(\d+)\s*:\s*(.*)$/i.exec(header);
      const level = match ? Number(match[1]) : undefined,
        name = match?.[2] ?? header;
      const pane = $(element).closest('.tab-pane')[0];
      const statBlock =
        !match &&
        $(element)
          .find('table th')
          .map((_, cell) => clean($(cell).text()))
          .get()
          .join(',')
          .includes('FOR,DES,CON,INT,SAB,CAR');
      const outer = $(element).parents('.recurso-card').first()[0];
      const parentKey =
        (statBlock && outer && featureElements.get(outer)) ||
        (pane && panes.get(pane)) ||
        parent.key;
      const record = section(
        element,
        statBlock ? 'criatura' : 'caracteristica',
        parentKey +
          (statBlock ? ':creature:' : ':feature:') +
          (level ?? 'opcao') +
          ':' +
          normalizeName(name),
        name,
        parentKey,
        '.recurso-card/' + i,
        level,
      );
      featureElements.set(element, record.key);
      source.records.push(record);
    });
  }
  const datasets = [
    ['pages/itens/itens-armas.html', 'weaponsDataset', 'equipamento', 'arma'],
    ['pages/itens/itens-armaduras.html', 'armorsDataset', 'equipamento', 'armadura'],
    ['pages/itens/itens-ferramentas.html', 'toolsDataset', 'equipamento', 'ferramenta'],
    ['pages/itens/itens.aventura.html', 'listaEquipamentos', 'equipamento', 'basico'],
    ['pages/itens/itens-magicos.html', 'bancoMagicos', 'equipamento', 'magico'],
    ['pages/itens/itens-veiculos.html', 'bancoVeiculos', 'equipamento', 'veiculo'],
    ['pages/itens/itens-servicos.html', 'bancoServicos', 'servico', 'servico'],
  ] as const;
  for (const [file, variableName, kind, category] of datasets) {
    const source = await sourceFor(file),
      $ = load(await readFile(path.join(root, file), 'utf8'));
    const dataset = readLiteralDataset(
      $('script:not([src])')
        .map((_, e) => $(e).html() ?? '')
        .get()
        .join('\n'),
      variableName,
    );
    const groups = Array.isArray(dataset) ? { itens: dataset } : dataset;
    if (!groups || typeof groups !== 'object') throw Error('Dataset de itens inválido: ' + file);
    for (const [group, items] of Object.entries(groups)) {
      if (!Array.isArray(items)) throw Error('Categoria de itens inválida: ' + file + '/' + group);
      items.forEach((item, i) => {
        if (
          !item ||
          Array.isArray(item) ||
          typeof item !== 'object' ||
          typeof item.nome !== 'string'
        )
          throw Error('Item sem nome: ' + file + '/' + group + '/' + i);
        const description =
          typeof item.desc === 'string'
            ? item.desc
            : typeof item.descricao === 'string'
              ? item.descricao
              : '';
        const itemKey = unique(
          kind + ':legacy:' + file + ':' + group + ':' + normalizeName(item.nome),
        );
        source.records.push({
          key: itemKey,
          kind,
          name: item.nome,
          originalName: item.nome,
          description,
          descriptionHtml: '',
          book: 'Acervo Weirs — equipamentos',
          publisher: 'WEIRS',
          pointer: variableName + '/' + group + '/' + i,
          anchor: '',
          payload: { type: 'equipment', category: category + ':' + group, input: item },
        });
        if (category === 'ferramenta' && typeof item.variantes === 'string') {
          for (const [variantIndex, match] of [
            ...item.variantes.matchAll(/([^,(]+?)\s*\(([^)]+)\)(?:,\s*|$)/g),
          ].entries()) {
            const variantName = match[1].trim(),
              values = match[2].split(/,\s+(?=\d)/);
            const subtype = item.nome === 'Instrumento Musical' ? 'instrumento' : 'jogo';
            source.records.push({
              key: itemKey + ':variant:' + normalizeName(variantName),
              parentKey: itemKey,
              kind: 'equipamento',
              name: variantName,
              originalName: variantName,
              description: '',
              descriptionHtml: '',
              book: 'Acervo Weirs — equipamentos',
              publisher: 'WEIRS',
              pointer: variableName + '/' + group + '/' + i + '/variantes/' + variantIndex,
              anchor: '',
              payload: {
                type: 'equipment',
                category: 'ferramenta:' + subtype,
                input: {
                  ...item,
                  nome: variantName,
                  custo: values[0],
                  peso: values[1] ?? null,
                  variantes: null,
                },
              },
            });
          }
        }
      });
    }
  }
  const world = await sourceFor('pages/mundo.html'),
    $ = load(await readFile(path.join(root, world.path), 'utf8'));
  $('div[id^="lang-"]').each((_, element) => {
    const name = clean($(element).find('h4').first().text());
    if (!name) return;
    const anchor = $(element).attr('id')!,
      html = safeHtml($(element).html() ?? '', world.path);
    world.records.push({
      key: 'idioma:weirs:' + anchor,
      kind: 'idioma',
      name,
      originalName: name,
      description: plainHtml(html),
      descriptionHtml: html,
      book: 'Weirs — idiomas',
      publisher: 'WEIRS - Homebrew',
      pointer: '#' + anchor,
      anchor,
      payload: { type: 'section', html, category: 'idioma', tables: [] },
    });
  });
  return [...sources.values()];
}
