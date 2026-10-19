import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hash, normalizeName } from './identity';
import type { ImportedSource, SourceRecord } from './model';

export interface ClassFeatureInput {
  name: string;
  description: string;
  level?: number | null;
}
export interface SubclassInput {
  name: string;
  description: string;
  book?: string;
  feats: ClassFeatureInput[];
}
export interface ClassInput {
  name: string;
  name_pt: string;
  book: string;
  img: string;
  description: string;
  primary_ability: string[];
  hit_die: string;
  saving_throws: string[];
  skills: string[];
  weapons: string[];
  armor: string[];
  tools: string[];
  equipment: string;
  feats: ClassFeatureInput[];
  subclasses: SubclassInput[];
  tags: string[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');
const feature = (v: unknown): v is ClassFeatureInput =>
  object(v) &&
  typeof v.name === 'string' &&
  !!v.name.trim() &&
  typeof v.description === 'string' &&
  (v.level == null || (Number.isInteger(v.level) && Number(v.level) >= 1 && Number(v.level) <= 20));
export const escapeClassHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/** Source prose contains plain-text tables; keep them readable without accepting executable HTML. */
export function classTextHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      const first = lines.findIndex((line) => line.includes('|'));
      if (first < 0) return '<p>' + escapeClassHtml(block).replace(/\n/g, '<br>') + '</p>';
      return (
        (first ? '<p>' + escapeClassHtml(lines.slice(0, first).join('\n')) + '</p>' : '') +
        '<table>' +
        lines
          .slice(first)
          .map(
            (line, i) =>
              '<tr>' +
              line
                .split('|')
                .map(
                  (s) =>
                    '<' +
                    (i ? 'td' : 'th') +
                    '>' +
                    escapeClassHtml(s.trim()) +
                    '</' +
                    (i ? 'td' : 'th') +
                    '>',
                )
                .join('') +
              '</tr>',
          )
          .join('') +
        '</table>'
      );
    })
    .join('');
}
/** Invocation titles occupy short, punctuation-free lines in the authored list. */
function invocationOptions(text: string): ClassFeatureInput[] {
  const options: ClassFeatureInput[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const [title, ...body] = block.split('\n');
    if (title.length < 85 && !/[.:;!?•|]/.test(title))
      options.push({ name: title.trim(), description: body.join('\n') });
    else if (options.length) options.at(-1)!.description += '\n\n' + block;
  }
  return options;
}
export async function readClassJsonSource(root: string, commit = ''): Promise<ImportedSource> {
  const file = 'data/classes.json';
  let raw: string, rows: unknown;
  try {
    raw = await readFile(path.join(root, file), 'utf8');
    rows = JSON.parse(raw);
  } catch {
    throw Error('Não foi possível ler a fonte JSON: ' + file);
  }
  if (!Array.isArray(rows)) throw Error('Fonte JSON deve ser uma lista: ' + file);
  const records: SourceRecord[] = [];
  for (const [index, row] of rows.entries()) {
    if (
      !object(row) ||
      !['name', 'name_pt', 'book', 'description', 'equipment'].every(
        (k) => typeof row[k] === 'string',
      ) ||
      !String(row.name_pt).trim() ||
      !/^d(?:6|8|10|12)$/.test(String(row.hit_die)) ||
      !['primary_ability', 'saving_throws', 'skills', 'weapons', 'armor', 'tools', 'tags'].every(
        (k) => strings(row[k]),
      ) ||
      !Array.isArray(row.feats) ||
      !row.feats.every(feature) ||
      !Array.isArray(row.subclasses) ||
      !row.subclasses.every(
        (s) =>
          object(s) &&
          typeof s.name === 'string' &&
          !!s.name.trim() &&
          typeof s.description === 'string' &&
          (s.book === undefined || typeof s.book === 'string') &&
          Array.isArray(s.feats) &&
          s.feats.every(feature),
      )
    )
      throw Error('Fonte JSON inválida: ' + file + ' /' + index);
    const input = row as unknown as ClassInput;
    const key = 'classe:json:' + normalizeName(input.name);
    const publisher =
      /homebrew/i.test(input.book) || input.tags.some((t) => /homebrew/i.test(t))
        ? 'WEIRS - Homebrew'
        : 'Fonte indicada no JSON';
    const label = (title: string, value: string) =>
      '<p><strong>' + title + ':</strong> ' + escapeClassHtml(value) + '</p>';
    const html =
      classTextHtml(input.description) +
      label('Dado de Vida', input.hit_die) +
      label('Atributos Principais', input.primary_ability.join(', ')) +
      label('Salvaguardas', input.saving_throws.join(', ')) +
      label('Perícias', input.skills.join(', ')) +
      label('Proficiências em Armas', input.weapons.join(', ')) +
      label('Proficiências em Armaduras', input.armor.join(', ')) +
      label('Proficiências em Ferramentas', input.tools.join(', ')) +
      label('Equipamento Inicial', input.equipment);
    records.push({
      key,
      kind: 'classe',
      name: input.name_pt,
      originalName: input.name,
      description: input.description + '\n\nDado de Vida: ' + input.hit_die,
      descriptionHtml: html,
      book: input.book,
      publisher,
      pointer: '/' + index,
      anchor: '',
      payload: { type: 'class', input },
    });
    const addFeatures = (
      items: ClassFeatureInput[],
      parentKey: string,
      pointer: string,
      book: string,
    ) => {
      const seen = new Map<string, number>();
      for (const [i, f] of items.entries()) {
        const base = parentKey + ':feature:' + normalizeName(f.name);
        const occurrence = (seen.get(base) ?? 0) + 1;
        seen.set(base, occurrence);
        records.push({
          key: base + (occurrence > 1 ? ':' + occurrence : ''),
          parentKey,
          kind: 'caracteristica',
          name: f.name,
          originalName: f.name,
          description: f.description,
          descriptionHtml: classTextHtml(f.description),
          book,
          publisher,
          pointer: pointer + '/feats/' + i,
          anchor: '',
          ...(f.level != null ? { level: f.level } : {}),
          payload: { type: 'class-feature', input: f },
        });
        if (f.level == null && normalizeName(f.name) === 'opcoes-de-invocacao-mistica')
          for (const option of invocationOptions(f.description))
            records.push({
              key: parentKey + ':option:' + normalizeName(option.name),
              parentKey,
              kind: 'caracteristica',
              name: option.name,
              originalName: option.name,
              description: option.description,
              descriptionHtml: classTextHtml(option.description),
              book,
              publisher,
              pointer: pointer + '/feats/' + i + '/description',
              anchor: normalizeName(option.name),
              payload: { type: 'class-feature', input: option, option: true },
            });
      }
    };
    addFeatures(input.feats, key, '/' + index, input.book);
    input.subclasses.forEach((sub, i) => {
      const subkey = key + ':subclass:' + normalizeName(sub.name);
      records.push({
        key: subkey,
        parentKey: key,
        kind: 'subclasse',
        name: sub.name,
        originalName: sub.name,
        description: sub.description,
        descriptionHtml: classTextHtml(sub.description),
        book: sub.book ?? input.book,
        publisher,
        pointer: '/' + index + '/subclasses/' + i,
        anchor: '',
        payload: { type: 'subclass', input: sub },
      });
      addFeatures(sub.feats, subkey, '/' + index + '/subclasses/' + i, sub.book ?? input.book);
    });
  }
  if (new Set(records.map((r) => r.key)).size !== records.length)
    throw Error('Identidade repetida na fonte JSON: ' + file);
  return { path: file, hash: hash(raw!), commit, format: 'json', records };
}
