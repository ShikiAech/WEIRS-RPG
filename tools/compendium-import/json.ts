import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hash, normalizeName } from './identity';
import { readClassJsonSource } from './json-classes';
import { readSpellJsonSource } from './json-spells';
import type {
  BackgroundInput,
  FeatInput,
  ImportedSource,
  LineageInput,
  RaceInput,
  SourceRecord,
  TraitInput,
} from './model';

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validTraits(value: unknown): value is TraitInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        object(item) &&
        typeof item.name === 'string' &&
        item.name.trim() &&
        typeof item.description === 'string',
    )
  );
}
function validLineage(value: unknown): value is LineageInput {
  return (
    object(value) &&
    typeof value.name_pt === 'string' &&
    Boolean(value.name_pt.trim()) &&
    validTraits(value.traits)
  );
}
function parseRecord(
  value: unknown,
  kind: 'background' | 'feats' | 'races',
  file: string,
  index: number,
) {
  const invalid = () => new Error('Fonte JSON inválida: ' + file + ' /' + index);
  if (
    !object(value) ||
    typeof value.name_pt !== 'string' ||
    !value.name_pt.trim() ||
    typeof value.book !== 'string' ||
    typeof value.description !== 'string'
  )
    throw invalid();
  if (kind === 'background') {
    if (
      typeof value.name !== 'string' ||
      typeof value.publisher !== 'string' ||
      !strings(value.ability_scores) ||
      typeof value.feat !== 'string' ||
      !strings(value.skill_proficiencies) ||
      !strings(value.tool_proficiencies) ||
      !object(value.equipment) ||
      !strings(value.equipment.option_a) ||
      !strings(value.equipment.option_b) ||
      !strings(value.tags)
    )
      throw invalid();
    return value as unknown as BackgroundInput;
  }
  if (kind === 'feats') {
    if (
      typeof value.name !== 'string' ||
      typeof value.publisher !== 'string' ||
      typeof value.type !== 'string' ||
      !strings(value.tags) ||
      (value.prerequisite !== undefined && typeof value.prerequisite !== 'string') ||
      (value.ability_scores !== undefined && !strings(value.ability_scores))
    )
      throw invalid();
    return value as unknown as FeatInput;
  }
  if (
    typeof value.type !== 'string' ||
    typeof value.size !== 'string' ||
    typeof value.speed !== 'string' ||
    typeof value.age !== 'string' ||
    !validTraits(value.traits) ||
    !strings(value.tags) ||
    (value.subraces !== undefined &&
      (!Array.isArray(value.subraces) || !value.subraces.every(validLineage)))
  )
    throw invalid();
  return value as unknown as RaceInput;
}
export async function readJsonSources(root: string, commit = ''): Promise<ImportedSource[]> {
  const sources: ImportedSource[] = [];
  for (const [base, kind] of [
    ['background', 'antecedente'],
    ['feats', 'talento'],
    ['races', 'especie'],
  ] as const) {
    const file = 'data/' + base + '.json';
    let raw: string, rows: unknown;
    try {
      raw = await readFile(path.join(root, file), 'utf8');
      rows = JSON.parse(raw);
    } catch {
      throw Error('Não foi possível ler a fonte JSON: ' + file);
    }
    if (!Array.isArray(rows)) throw Error('Fonte JSON deve ser uma lista: ' + file);
    const records: SourceRecord[] = [];
    for (const [index, item] of rows.entries()) {
      const input = parseRecord(item, base, file, index);
      const original = 'name' in input ? input.name : input.name_pt;
      const key =
        kind === 'especie'
          ? 'especie:weirs:' + normalizeName(input.name_pt)
          : kind + ':json:' + normalizeName(input.book) + ':' + normalizeName(original);
      const book = input.book,
        publisher = 'publisher' in input ? input.publisher : 'WEIRS - Homebrew';
      const record: SourceRecord = {
        key,
        kind,
        name: input.name_pt,
        originalName: original,
        description:
          base === 'background'
            ? backgroundDescription(input as BackgroundInput)
            : input.description,
        descriptionHtml: '',
        book,
        publisher,
        pointer: '/' + index,
        anchor: '',
        payload:
          base === 'background'
            ? { type: 'background', input: input as BackgroundInput }
            : base === 'feats'
              ? { type: 'feat', input: input as FeatInput }
              : { type: 'species', input: input as RaceInput },
      };
      records.push(record);
      if (base !== 'races') continue;
      const race = input as RaceInput;
      const traits = (items: TraitInput[], parentKey: string, pointer: string) => {
        items.forEach((trait, i) =>
          records.push({
            key: parentKey + ':trait:' + normalizeName(trait.name),
            parentKey,
            kind: 'caracteristica',
            name: trait.name,
            originalName: trait.name,
            description: trait.description,
            descriptionHtml: '',
            book,
            publisher,
            pointer: pointer + '/traits/' + i,
            anchor: '',
            payload: { type: 'trait', input: trait },
          }),
        );
      };
      traits(race.traits, key, '/' + index);
      (race.subraces ?? []).forEach((lineage, i) => {
        const lineageKey = key + ':lineage:' + normalizeName(lineage.name_pt);
        records.push({
          key: lineageKey,
          parentKey: key,
          kind: 'linhagem',
          name: lineage.name_pt,
          originalName: lineage.name_pt,
          description: lineage.description ?? '',
          descriptionHtml: '',
          book,
          publisher,
          pointer: '/' + index + '/subraces/' + i,
          anchor: '',
          payload: { type: 'lineage', input: lineage },
        });
        traits(lineage.traits, lineageKey, '/' + index + '/subraces/' + i);
      });
    }
    if (new Set(records.map((r) => r.key)).size !== records.length)
      throw Error('Identidade repetida na fonte JSON: ' + file);
    sources.push({ path: file, hash: hash(raw!), commit, format: 'json', records });
  }
  sources.push(
    ...(await Promise.all([readClassJsonSource(root, commit), readSpellJsonSource(root, commit)])),
  );
  return sources;
}

function backgroundDescription(input: BackgroundInput): string {
  return [
    input.description,
    `Atributos: ${input.ability_scores.join(', ')}`,
    `Perícias: ${input.skill_proficiencies.join(', ')}`,
    `Ferramentas: ${input.tool_proficiencies.join(', ')}`,
    `Talento: ${input.feat}`,
    `Equipamento — opção A: ${input.equipment.option_a.join('; ')}`,
    `Equipamento — opção B: ${input.equipment.option_b.join('; ')}`,
  ].join('\n\n');
}
