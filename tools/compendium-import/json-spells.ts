import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SpellDefinition } from '../../packages/contracts/compendium';
import { hash, normalizeName, stableId } from './identity';
import type { ImportedSource, SourceRecord } from './model';

export interface SpellInput {
  name: string;
  name_pt: string;
  circle: number;
  type: string;
  classes: string[];
  casting_time: string;
  range: string;
  components: string[];
  duration: string;
  description: string;
  upcasting: string[];
  source: string;
}

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());

export function spellDescription(input: SpellInput): string {
  return [input.description, ...input.upcasting].filter(Boolean).join('\n\n');
}

export function spellDescriptionHtml(input: SpellInput): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  return spellDescription(input)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function readSpellJsonSource(root: string, commit = ''): Promise<ImportedSource> {
  const file = 'data/spells.json';
  let raw: string, rows: unknown;
  try {
    raw = await readFile(path.join(root, file), 'utf8');
    rows = JSON.parse(raw);
  } catch {
    throw Error('Não foi possível ler a fonte JSON: ' + file);
  }
  if (!Array.isArray(rows)) throw Error('Fonte JSON deve ser uma lista: ' + file);
  const keys = new Map<string, number>();
  const records: SourceRecord[] = rows.map((value, index) => {
    const invalid = () => Error(`Fonte JSON inválida: ${file} /${index}`);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const row = value as Record<string, unknown>;
    for (const key of [
      'name',
      'name_pt',
      'type',
      'casting_time',
      'range',
      'duration',
      'description',
      'source',
    ])
      if (typeof row[key] !== 'string' || !row[key].trim()) throw invalid();
    if (
      !Number.isInteger(row.circle) ||
      Number(row.circle) < 0 ||
      Number(row.circle) > 9 ||
      !stringList(row.classes) ||
      !stringList(row.components) ||
      !stringList(row.upcasting)
    )
      throw invalid();
    const input = value as SpellInput;
    const base = `magia:json:${normalizeName(input.source)}:${normalizeName(input.name)}`;
    const variant = (keys.get(base) ?? 0) + 1;
    keys.set(base, variant);
    return {
      key: base + (variant === 1 ? '' : `:variant:${variant}`),
      kind: 'magia',
      name: input.name_pt,
      originalName: input.name,
      description: spellDescription(input),
      descriptionHtml: spellDescriptionHtml(input),
      book: input.source,
      publisher: /^homebrew\b/i.test(input.source) ? input.source : 'Fonte indicada no JSON',
      pointer: '/' + index,
      anchor: '',
      payload: { type: 'spell', input },
    };
  });
  return { path: file, hash: hash(raw!), commit, format: 'json', records };
}

type Warning = (message: string) => void;
const numeric = (text: string) =>
  Number(text.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));

function rangeFeet(range: string, warn: Warning): number | null {
  if (/^(?:pessoal|toque)\b/i.test(range)) return 0;
  const feet = /\[([\d,.]+)\s*(?:pés|pes|feet|foot|ft\.?)\]/i.exec(range);
  const miles = /\[([\d,.]+)\s*miles?\]/i.exec(range);
  const metric = /^([\d,.]+)\s*(metros?|quil[oô]metros?)/i.exec(range);
  const meterValue = metric ? numeric(metric[1]) * (/^quilo/i.test(metric[2]) ? 1000 : 1) : null;
  if (feet) {
    const value = Number(feet[1].replace(/,/g, ''));
    if (meterValue !== null && Math.abs(meterValue / 0.3 - value) > 1)
      warn('Alcance contém unidades divergentes; o valor explícito em pés foi preservado.');
    return value;
  }
  if (miles) return numeric(miles[1]) * 5280;
  if (meterValue !== null) return Math.round((meterValue / 0.3) * 1000) / 1000;
  return null;
}

function durationSeconds(duration: string): number | null {
  const text = duration.replace(/^concentração,?\s*/i, '').replace(/^até\s*/i, '');
  if (/^instantânea(?:\s*\(.*\))?$/i.test(text)) return 0;
  const value = /^(\d+)\s*(rodadas?|minutos?|horas?|dias?)$/i.exec(text);
  if (!value) return null;
  const unit = value[2].toLowerCase();
  return (
    Number(value[1]) *
    (unit.startsWith('rodada')
      ? 6
      : unit.startsWith('minuto')
        ? 60
        : unit.startsWith('hora')
          ? 3600
          : 86400)
  );
}

function components(input: string[], warn: Warning): SpellDefinition['components'] {
  const material = input
    .filter((part) => /^M(?:\s|\(|$)/i.test(part))
    .map((part) => part.replace(/^M\s*/i, '').replace(/^\(([\s\S]*)\)$/, '$1'))
    .join('; ');
  const amounts = [
    ...material.matchAll(
      /(\d[\d.,]*)\s*\+?\s*(PC|PP|PE|PO|PL|peças? de (?:cobre|prata|electro|ouro|platina)|moedas? de (?:cobre|prata|ouro|platina))\b/gi,
    ),
  ];
  let costCopper: number | null = null;
  if (amounts.length === 1 && !/\bcada\b/i.test(material)) {
    const code = normalizeName(amounts[0][2]);
    const multiplier =
      code === 'pc' || code.endsWith('cobre')
        ? 1
        : code === 'pp' || code.endsWith('prata')
          ? 10
          : code === 'pe' || code.endsWith('electro')
            ? 50
            : code === 'po' || code.endsWith('ouro')
              ? 100
              : 1000;
    costCopper = numeric(amounts[0][1]) * multiplier;
  } else if (amounts.length) warn('Custo dos componentes exige revisão manual das quantidades.');
  const consumed =
    /consom|consumid/i.test(material) &&
    !/não\s+(?:é\s+|são\s+)?(?:consumid|consom)/i.test(material);
  return {
    verbal: input.some((part) => /^V$/i.test(part.trim())),
    somatic: input.some((part) => /^S$/i.test(part.trim())),
    material,
    costCopper,
    consumed,
  };
}

const damageTypes: Record<string, string> = {
  acido: 'acido',
  contundente: 'concussao',
  concussao: 'concussao',
  cortante: 'cortante',
  eletrico: 'eletrico',
  forca: 'energetico',
  energetico: 'energetico',
  fogo: 'fogo',
  frio: 'frio',
  necrotico: 'necrotico',
  perfurante: 'perfurante',
  psiquico: 'psiquico',
  radiante: 'radiante',
  trovejante: 'trovejante',
  veneno: 'veneno',
};

function damage(input: SpellInput, owner: string, warn: Warning): SpellDefinition['damages'] {
  const matches = [
    ...input.description.matchAll(
      /\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:pontos?\s+)?de\s+dano\s+(?:de\s+)?([\p{L}]+)/giu,
    ),
  ].filter((match) => damageTypes[normalizeName(match[2])]);
  const allDamage = [
    ...input.description.matchAll(
      /\b\d+(?:d\d+)?(?:\s*[+-]\s*\d+)*\s+(?:pontos?\s+)?de\s+dano\b/gi,
    ),
  ];
  const match = matches[0];
  const tail = match ? input.description.slice(match.index! + match[0].length) : '';
  const previous = match ? input.description.slice(0, match.index) : '';
  const sentence = match
    ? input.description.slice(
        previous.lastIndexOf('.') + 1,
        input.description.indexOf('.', match.index) < 0
          ? undefined
          : input.description.indexOf('.', match.index),
      )
    : '';
  const choice =
    /^\s*(?:,|ou\b)\s*(?:Ácido|Contundente|Concussão|Cortante|Elétrico|Força|Energético|Fogo|Frio|Necrótico|Perfurante|Psíquico|Radiante|Trovejante|Veneno)\b/i.test(
      tail,
    );
  const creatureStats =
    /bloco de estatísticas|classe de armadura:|estatísticas do [^.]*manual dos monstros/i.test(
      input.description,
    );
  const indirect =
    /\bvocê (?:sofre|recebe|se corta)|dano[\s\S]{0,35}a você|você e[\s\S]{0,120}sofrem|teletransportando|expost[oa] ao fogo|mestre rerola/i.test(
      sentence,
    );
  const partialFormula = /\d+d\d+\s*[+-]\s*$/.test(previous);
  // Separate hits, alternate dice and delayed effects are not additive damage components.
  if (
    matches.length !== 1 ||
    allDamage.length !== 1 ||
    choice ||
    creatureStats ||
    indirect ||
    partialFormula ||
    /se o alvo se mover|sofre[^.]*em vez|dano[^.]*à sua escolha/i.test(input.description)
  ) {
    if (
      matches.length ||
      /\d+d\d+[^.]{0,80}\bdano\b|\bdano\b[^.]{0,80}\d+d\d+/i.test(input.description)
    )
      warn('Dano condicional, múltiplo ou variável preservado no texto para resolução manual.');
    return [];
  }
  return [
    {
      id: stableId(owner + ':spell-damage:0'),
      order: 0,
      dice: match[1].replace(/\s/g, ''),
      damageType: damageTypes[normalizeName(match[2])],
    },
  ];
}

function scales(
  input: SpellInput,
  damages: SpellDefinition['damages'],
  warn: Warning,
): SpellDefinition['scales'] {
  if (!input.upcasting.length) return [];
  const text = input.upcasting.join('\n');
  if (input.circle === 0 && /\bdano\b/i.test(text)) {
    const levels = [...text.matchAll(/\b(5|11|17)(?:º)?(?:\s+n[ií]vel)?\s*\((\d+d\d+)\)/gi)];
    if (levels.length === 3 && new Set(levels.map((value) => value[1])).size === 3)
      return levels.map((value) => ({
        level: Number(value[1]),
        basis: 'personagem',
        dice: value[2],
      }));
  }
  const increase =
    /\bdano(?:\s+inicial|\s+da magia)?\s+aumenta\s+em\s+(\d+)d(\d+)\s+para cada n[ií]vel de espa[çc]o de magia acima do\s+(\d+)(?:º|o)?/i.exec(
      text,
    );
  const base = damages.length === 1 ? /^(\d+)d(\d+)([+-]\d+)?$/.exec(damages[0].dice) : null;
  if (increase && base && Number(increase[3]) === input.circle && increase[2] === base[2])
    return Array.from({ length: 9 - input.circle }, (_, index) => ({
      level: input.circle + index + 1,
      basis: 'circulo' as const,
      dice: `${Number(base[1]) + Number(increase[1]) * (index + 1)}d${base[2]}${base[3] ?? ''}`,
    }));
  warn('Progressão da magia preservada integralmente no texto; aplicação manual necessária.');
  return [];
}

/** Class references are resolved by the catalog after all classes have been imported. */
export function spellDefinition(
  input: SpellInput,
  ownerRevisionId: string,
  warn: Warning = () => {},
): SpellDefinition {
  const damages = damage(input, ownerRevisionId, warn);
  return {
    circle: input.circle,
    school: input.type,
    castingTime: input.casting_time,
    range: input.range,
    rangeFeet: rangeFeet(input.range, warn),
    duration: input.duration,
    durationSeconds: durationSeconds(input.duration),
    concentration: /^concentração\b/i.test(input.duration),
    ritual: /\britual\b/i.test(input.casting_time),
    components: components(input.components, warn),
    classRefs: [],
    damages,
    scales: scales(input, damages, warn),
  };
}
