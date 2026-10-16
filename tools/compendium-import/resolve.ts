import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import type { Ability } from '../../packages/contracts/sheets';
import type {
  CompendiumKind,
  CompendiumRef,
  CompendiumPayloadMap,
  MovementDefinition,
  RequirementDefinition,
  ChoiceGroupDefinition,
  ProficiencyDefinition,
  EffectDefinition,
  SpellcastingProfileDefinition,
} from '../../packages/contracts/compendium';
import { normalizeName, stableId, revisionId, hash, canonical, conceptId } from './identity';
import { plainHtml } from './legacy';
import { linkRequirements } from './requirements';
import type { CatalogDraftRecord, ImportedCatalog, JsonObject } from './model';
import type { CompendiumCuration, ResolvedCatalog, ResolvedEntry } from './resolved';
export type { CompendiumCuration, ResolvedCatalog } from './resolved';

const abilities: Record<string, Ability> = {
  forca: 'for',
  destreza: 'des',
  constituicao: 'con',
  inteligencia: 'int',
  sabedoria: 'sab',
  carisma: 'car',
};
const abilityCodes = (text: string) => [
  ...new Set(
    Object.entries(abilities)
      .filter(([name]) => normalizeName(text).includes(name))
      .map(([, code]) => code),
  ),
];
const number = (s: unknown): number | null => {
  const match = String(s ?? '').match(/-?\d[\d.]*(?:,\d+)?/);
  return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : null;
};
const ref = (e: ResolvedEntry): CompendiumRef => e.ref;
const labels = (html: string) => {
  const $ = load(html),
    result: Record<string, string> = {};
  $('li,p').each((_, el) => {
    const strong = $(el).children('strong,b').first();
    if (!strong.length) return;
    const key = normalizeName(strong.text().replace(/:$/, ''));
    if (!result[key]) result[key] = $(el).text().slice(strong.text().length).trim();
  });
  $('tr').each((_, el) => {
    const cells = $(el).children('td,th');
    if (cells.length === 2) {
      const key = normalizeName(cells.first().text().replace(/:$/, ''));
      if (!result[key]) result[key] = cells.last().text().replace(/\s+/g, ' ').trim();
    }
  });
  return result;
};
export async function loadCuration(root: string): Promise<CompendiumCuration> {
  const [aliases, requirements, effects, progressions, spellLists] = await Promise.all(
    ['aliases', 'requirements', 'effects', 'progressions', 'spell-lists'].map(async (name) =>
      JSON.parse(await readFile(path.join(root, 'content/compendium', name + '.json'), 'utf8')),
    ),
  );
  return { aliases, requirements, effects, progressions, spellLists };
}
/** D&D's grid conversion, rather than the physical 0.3048 conversion. */
export const distanceFeet = (value: number, unit: 'pes' | 'metros') =>
  Math.round((unit === 'metros' ? value / 0.3 : value) * 1000) / 1000;
export function parseMovement(text: string, owner: string): MovementDefinition[] {
  return text.split(/;|\/(?=\s*\d)/).flatMap((part, i) => {
    const match = /(\d+(?:[,.]\d+)?)\s*(metros?|m\b|pés|pes|ft\.?)/i.exec(part);
    if (!match) return [];
    const normalized = normalizeName(part);
    const mode = normalized.includes('voo')
      ? 'voo'
      : normalized.includes('natacao') || normalized.includes('nado')
        ? 'natacao'
        : normalized.includes('escalada')
          ? 'escalada'
          : normalized.includes('escavacao')
            ? 'escavacao'
            : 'terrestre';
    const form = normalized.includes('exotraje')
      ? 'exotraje'
      : normalized.includes('forma-natural')
        ? 'natural'
        : 'normal';
    return [
      {
        id: stableId(owner + ':movement:' + i),
        mode,
        distance: Number(match[1].replace(',', '.')),
        unit: /^(m|metro)/i.test(match[2]) ? 'metros' : 'pes',
        form,
        condition: part
          .replace(match[0], '')
          .trim()
          .replace(/^\(|\)$/g, ''),
        hover: /paira/i.test(part),
      },
    ];
  });
}
/** This importer accepts only the supported prerequisite grammar, with AND/OR intact. */
export function parsePrerequisites(
  text: string,
  ownerRevisionId: string,
): { requirements: RequirementDefinition[]; unsupported: string[] } {
  const requirements: RequirementDefinition[] = [],
    unsupported: string[] = [];
  const add = (
    operator: RequirementDefinition['operator'],
    parentId: string | null,
    fields: Partial<RequirementDefinition> = {},
  ) => {
    const node: RequirementDefinition = {
      id: stableId(ownerRevisionId + ':req:' + requirements.length),
      ownerRevisionId,
      parentId,
      operator,
      ability: null,
      targetRef: null,
      minimum: null,
      choiceKey: null,
      proficiencyId: null,
      ...fields,
    };
    requirements.push(node);
    return node.id;
  };
  const root = add('todos', null);
  text = text.replace(
    /(Força|Destreza|Constituição|Inteligência|Sabedoria|Carisma),\s*(?=Força|Destreza|Constituição|Inteligência|Sabedoria|Carisma)/gi,
    '$1 ou ',
  );
  for (const part of text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const level = /^(?:N[ií]vel|Level)\s+(\d+)\+?$/i.exec(part);
    if (level) {
      add('nivel', root, { minimum: Number(level[1]) });
      continue;
    }
    const ability = /^(.+?)\s+(\d+)\+?$/.exec(part);
    if (ability) {
      const names = ability[1]
        .split(/\s+(ou|e)\s+/i)
        .filter((s) => !['ou', 'e'].includes(s.toLowerCase()));
      const codes = names.map((s) => abilities[normalizeName(s)]);
      if (codes.every(Boolean)) {
        const parent =
          codes.length > 1 ? add(/\bou\b/i.test(ability[1]) ? 'qualquer' : 'todos', root) : root;
        codes.forEach((code) =>
          add('atributo', parent, { ability: code, minimum: Number(ability[2]) }),
        );
        continue;
      }
    }
    unsupported.push(part);
  }
  return { requirements, unsupported };
}
function featCategory(type: string, curation: CompendiumCuration): string {
  const alias = curation.aliases.categories.find((c) =>
    c.names.some((n) => normalizeName(n) === normalizeName(type)),
  );
  if (alias) return alias.code;
  const name = normalizeName(type);
  return name.includes('origem')
    ? 'origem'
    : name.includes('estilo')
      ? 'estilo-luta'
      : name.includes('epic') || name.includes('epic') || name.includes('bencao')
        ? 'dadiva-epica'
        : name.includes('marca')
          ? 'marca-dragao'
          : name.includes('pacto')
            ? 'pacto-planar'
            : 'geral';
}
function sizes(text: string): import('../../packages/contracts/compendium').SizeDefinition[] {
  if (text.includes('/'))
    return text.split('/').flatMap((part, i) =>
      sizes(part).map((s) => ({
        ...s,
        form: /exotraje/i.test(part) ? 'exotraje' : /natural/i.test(part) ? 'natural' : 'normal',
        default: i === 0 && s.default,
      })),
    );
  const names = ['minusculo', 'pequeno', 'medio', 'grande', 'enorme', 'imenso'];
  const normalized = normalizeName(text);
  return names
    .filter((name) => normalized.split('-').includes(name))
    .sort((a, b) => normalized.indexOf(a) - normalized.indexOf(b))
    .map((code, i) => ({ code, form: 'normal', default: i === 0 }));
}
export function resolveCatalog(
  input: ImportedCatalog,
  curation: CompendiumCuration,
): ResolvedCatalog {
  const c: ResolvedCatalog = {
    ruleSetId: 'dnd-5e-2024',
    entries: [],
    requirements: [],
    choices: [],
    grants: [],
    effects: [],
    proficiencies: [],
    castingProfiles: [],
    equipmentOptions: [],
    multiclassSlots: [],
    sources: structuredClone(input.sources),
    issues: structuredClone(input.issues),
    origins: input.records,
    progressionCells: [],
  };
  const byKey = new Map<string, ResolvedEntry>(),
    raw = new Map(input.records.map((r) => [r.key, r]));
  const issue = (
    r: CatalogDraftRecord,
    message: string,
    code:
      'UNRESOLVED_REFERENCE' | 'UNSUPPORTED_MECHANIC' | 'INVALID_SOURCE' = 'UNSUPPORTED_MECHANIC',
    severity: 'error' | 'warning' = 'warning',
  ) =>
    c.issues.push({
      code,
      severity,
      path: r.sourcePath,
      pointer: r.pointer,
      message,
      revisionId: byKey.get(r.key)?.ref.revisionId ?? version(r),
    });
  // Curation is part of a revision: a changed formula or alias cannot silently alter a pinned sheet.
  const version = (r: CatalogDraftRecord) =>
    revisionId(r.id, { sourceRevision: r.revisionId, curation, resolverVersion: 2 });
  const create = <K extends CompendiumKind>(
    r: CatalogDraftRecord,
    data: CompendiumPayloadMap[K],
  ): ResolvedEntry => {
    const source = c.sources.find((s) => s.id === r.sourceId)!;
    const entry = {
      key: r.key,
      ref: { recordId: r.id, revisionId: version(r) },
      kind: r.kind,
      slug: normalizeName(r.name) + '-' + r.id.slice(0, 8),
      name: r.name,
      originalName: r.originalName,
      sourceId: r.sourceId,
      sourceTitle: r.book,
      source,
      ruleSetId: c.ruleSetId,
      revision: 1,
      reviewed2024: false,
      automation: 'manual' as const,
      origin: source.origin,
      description: r.description,
      descriptionHtml: r.descriptionHtml,
      aliases: [],
      data,
      legacyIds: r.legacyIds,
      sourcePath: r.sourcePath,
      pointer: r.pointer,
      sourceHash: r.sourceHash,
    } as ResolvedEntry;
    c.entries.push(entry);
    byKey.set(r.key, entry);
    return entry;
  };
  const synthetic = <K extends CompendiumKind>(
    parent: CatalogDraftRecord,
    key: string,
    kind: K,
    name: string,
    data: CompendiumPayloadMap[K],
  ) => {
    const exists = byKey.get(key);
    if (exists) return exists;
    return create(
      {
        ...parent,
        id: conceptId(key, input.identityRegistry),
        revisionId: revisionId(parent.id, { key, data, source: parent.revisionId }),
        key,
        kind,
        name,
        originalName: name,
        description: '',
        descriptionHtml: '',
        parentKey: undefined,
        legacyIds: [],
        alternatives: [],
      },
      data,
    );
  };
  // Domain entities are built before their relations, so order in a source file is immaterial.
  for (const r of input.records) {
    const p = r.payload,
      meta = p.type === 'legacy' ? p.entry.metadata : {},
      l = labels(r.descriptionHtml);
    if (r.kind === 'classe') {
      const config = curation.progressions.classes[normalizeName(r.name)];
      const die = Number(
        /(?:Dado de Vida|Dados de Vida)\s*:?\s*1?d(6|8|10|12)/i.exec(r.description)?.[1],
      );
      if (![6, 8, 10, 12].includes(die)) {
        issue(r, 'Dado de vida não encontrado.', 'INVALID_SOURCE', 'error');
        continue;
      }
      create<'classe'>(r, {
        hitDie: die as 6 | 8 | 10 | 12,
        fixedHitPoints: die / 2 + 1,
        primaryAbilities: abilityCodes(l['atributos-principais'] ?? l['atributo-principal'] ?? ''),
        multiclassAbilities: (config?.abilities ?? []).map((ability) => ({
          ability,
          minimum: 13,
          alternativeGroup: config?.alternative ? 1 : 0,
        })),
        levels: Array.from({ length: 20 }, (_, i) => ({ level: i + 1 })),
        proficiencies: [],
      });
    } else if (r.kind === 'especie') {
      const data = p.type === 'species' ? p.input : null;
      const sizeOptions = sizes(data?.size ?? l.tamanho ?? '');
      const movement = parseMovement(
        data?.speed ?? l.deslocamento ?? l['deslocamento-terrestre'] ?? '',
        version(r),
      );
      if (!sizeOptions.length || !movement.length)
        issue(r, 'Tamanho ou deslocamento não interpretado.', 'INVALID_SOURCE', 'error');
      const type = normalizeName(data?.type ?? l['tipo-de-criatura'] ?? 'humanoide');
      create<'especie'>(r, {
        creatureType: type,
        defaultSize: sizeOptions[0]?.code ?? 'medio',
        sizes: sizeOptions,
        age: data?.age ?? l.idade ?? '',
        movements: movement,
        senses: [],
      });
    } else if (r.kind === 'antecedente')
      create<'antecedente'>(r, {
        abilities:
          p.type === 'background' ? p.input.ability_scores.flatMap((a) => abilityCodes(a)) : [],
        distribution: p.type === 'background' ? '2-1-ou-1-1-1' : 'nenhuma',
        abilityLimit: 20,
      });
    else if (r.kind === 'talento')
      create<'talento'>(r, {
        category: featCategory(p.type === 'feat' ? p.input.type : (meta.tipo ?? 'Geral'), curation),
        prerequisiteText:
          p.type === 'feat'
            ? (p.input.prerequisite ?? '')
            : (load(r.descriptionHtml)('p')
                .toArray()
                .map((el) => plainHtml(load(el).html()))
                .find((text) => /^Pr[ée]-requisitos?:/i.test(text))
                ?.replace(/^Pr[ée]-requisitos?:\s*/i, '') ?? ''),
        requirementsComplete: false,
        repeatable:
          /pode (?:selecionar|escolher|adquirir) (?:este|esse) talento mais de uma vez/i.test(
            r.description,
          ),
      });
    else if (r.kind === 'caracteristica')
      create<'caracteristica'>(r, {
        category: p.type === 'trait' ? 'traco' : 'classe',
        ...(r.parentKey && raw.has(r.parentKey)
          ? {
              parentRef: {
                recordId: raw.get(r.parentKey)!.id,
                revisionId: version(raw.get(r.parentKey)!),
              },
            }
          : {}),
        level: r.level ?? (p.type === 'trait' ? 1 : null),
        optional: p.type === 'section' && r.level === undefined,
        manualDecision: /escolh|escolh[ae]|à sua escolha/i.test(r.description),
      });
    else if (r.kind === 'magia') {
      const components = meta.componentes ?? '';
      const circle = Number(meta.nivel),
        range = /\[(\d+)\s*ft/.exec(meta.alcance ?? '');
      if (!Number.isInteger(circle) || circle < 0 || circle > 9)
        issue(r, 'Círculo de magia inválido.', 'INVALID_SOURCE', 'error');
      create<'magia'>(r, {
        circle,
        school: meta.escola ?? '',
        castingTime: meta.tempo ?? '',
        range: meta.alcance ?? '',
        rangeFeet: range ? Number(range[1]) : null,
        duration: meta.duracao ?? '',
        durationSeconds: null,
        concentration: meta.concentracao === 'true',
        ritual: meta.ritual === 'true',
        components: {
          verbal: /\bV\b/.test(components),
          somatic: /\bS\b/.test(components),
          material: /\bM\b/.test(components) ? components.replace(/.*?\bM\b/, '').trim() : '',
          costCopper: null,
          consumed: false,
        },
        classRefs: [],
        damages: [],
        scales: [],
      });
    } else if (r.kind === 'idioma') create<'idioma'>(r, { category: 'weirs', origin: r.book });
    else if (r.kind === 'criatura') {
      const $ = load(r.descriptionHtml),
        typeText = normalizeName($('em').first().text());
      const codes = [
        'aberracao',
        'besta',
        'celestial',
        'construto',
        'corruptor',
        'dragao',
        'elemental',
        'fada',
        'gigante',
        'humanoide',
        'limo',
        'monstruosidade',
        'morto-vivo',
        'planta',
      ];
      const scores: Partial<Record<Ability, number>> = {};
      $('table').each((_, el) => {
        const heads = $(el)
          .find('th')
          .map((_, cell) => normalizeName($(cell).text()))
          .get();
        if (heads.join(',') !== 'for,des,con,int,sab,car') return;
        $(el)
          .find('tbody tr')
          .first()
          .children('td')
          .each((i, cell) => {
            const score = number($(cell).text());
            if (score !== null) scores[heads[i] as Ability] = score;
          });
      });
      const actions: CompendiumPayloadMap['criatura']['actions'] = [];
      let actionType = 'traco';
      $('h4,p').each((i, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if ($(el).is('h4')) {
          actionType = /reaç/i.test(text)
            ? 'reacao'
            : /aç[õo]/i.test(text)
              ? 'acao'
              : /bônus/i.test(text)
                ? 'bonus'
                : 'traco';
          return;
        }
        const name = $(el)
          .children('strong')
          .first()
          .text()
          .replace(/[.:]\s*$/, '');
        if (
          !name ||
          !text ||
          /^(Imunidades|Sentidos|Idiomas|Nível de Desafio|Classe de Armadura|Pontos de Vida|Deslocamento)$/.test(
            name,
          )
        )
          return;
        actions.push({
          id: stableId(version(r) + ':action:' + i),
          name,
          type: actionType,
          description: text,
          attackBonus: null,
          saveDc: null,
        });
      });
      create<'criatura'>(r, {
        creatureType: codes.find((code) => typeText.includes(code)) ?? 'construto',
        size: sizes(typeText)[0]?.code ?? 'medio',
        armorClass: /^\d+$/.test(l['classe-de-armadura'] ?? '')
          ? Number(l['classe-de-armadura'])
          : null,
        armorClassText: l['classe-de-armadura'] ?? '',
        hitPointFormula: l['pontos-de-vida'] ?? null,
        abilities: scores,
        challenge: l['nivel-de-desafio'] ?? null,
        actions,
      });
    }
    // Child roots and equipment are resolved below, after their typed parents and currencies.
  }
  const firstSource = input.records[0];
  if (!firstSource) return c;
  const coreSource = {
    id: stableId('compendio:fonte:srd:5.2.1:' + hash(canonical(curation.progressions))),
    title: 'SRD 5.2.1 — núcleo 2024 (tradução do projeto)',
    edition: '2024',
    language: 'pt-BR',
    origin: 'oficial' as const,
    author: 'Wizards of the Coast; tradução editorial Weirs',
    referenceUrl: 'https://www.dndbeyond.com/srd',
    attribution: 'System Reference Document 5.2.1, CC BY 4.0. Tradução não oficial do projeto.',
    path: 'content/compendium/progressions.json',
    commit: '',
    hash: hash(canonical(curation.progressions)),
  };
  c.sources.push(coreSource);
  const parentSource = {
    ...firstSource,
    sourceId: coreSource.id,
    sourcePath: coreSource.path,
    sourceHash: coreSource.hash,
    book: coreSource.title,
    sourceFormat: 'json' as const,
    revisionId: coreSource.hash,
  };
  const coins = new Map<string, ResolvedEntry>();
  for (const [code, name, value] of [
    ['PC', 'Peça de Cobre', 1],
    ['PP', 'Peça de Prata', 10],
    ['PE', 'Peça de Electro', 50],
    ['PO', 'Peça de Ouro', 100],
    ['PL', 'Peça de Platina', 1000],
  ] as const) {
    coins.set(
      code,
      synthetic(parentSource, 'moeda:padrao:' + code, 'moeda', name, {
        code,
        symbol: code,
        copperValue: value,
      }),
    );
  }
  const money = (s: string) => {
    const m = /([\d.,]+)\s*(PC|PP|PE|PO|PL|GP|SP|CP|EP)\b/i.exec(s);
    const aliases: Record<string, string> = { GP: 'PO', SP: 'PP', CP: 'PC', EP: 'PE' };
    return m
      ? {
          cost: number(m[1])!,
          currencyRef: ref(coins.get(aliases[m[2].toUpperCase()] ?? m[2].toUpperCase())!),
        }
      : { cost: null, currencyRef: null };
  };
  for (const r of input.records) {
    const p = r.payload;
    if (r.kind === 'linhagem') {
      const parent = byKey.get(r.parentKey ?? '');
      if (!parent) {
        issue(r, 'Espécie da linhagem ausente.', 'UNRESOLVED_REFERENCE', 'error');
        continue;
      }
      create<'linhagem'>(r, {
        speciesRef: ref(parent),
        inheritTraits: true,
        sizes: [],
        movements: [],
      });
    }
    if (p.type !== 'equipment') continue;
    const item = p.input,
      cat = p.category;
    const str = (key: string) => String(item[key] ?? '');
    if (r.kind === 'servico') {
      const price = money(str('custo'));
      if (price.cost === null || !price.currencyRef) {
        issue(r, 'Custo variável do serviço requer revisão.', 'UNSUPPORTED_MECHANIC', 'error');
        continue;
      }
      create<'servico'>(r, {
        cost: price.cost,
        currencyRef: price.currencyRef,
        unit: str('tipo') || cat.split(':')[1],
      });
      continue;
    }
    let category = cat.startsWith('arma:')
      ? cat.includes('marciais') || cat.includes('eterforja')
        ? 'arma-marcial'
        : 'arma-simples'
      : cat.startsWith('armadura:')
        ? cat.endsWith(':leves')
          ? 'armadura-leve'
          : cat.endsWith(':medias')
            ? 'armadura-media'
            : cat.endsWith(':pesadas')
              ? 'armadura-pesada'
              : 'escudo'
        : cat.startsWith('ferramenta:')
          ? 'ferramenta'
          : cat.startsWith('magico:')
            ? 'magico'
            : cat.startsWith('veiculo:')
              ? 'veiculo'
              : 'basico';
    const data: CompendiumPayloadMap['equipamento'] = {
      category,
      ...(r.parentKey && byKey.get(r.parentKey)?.kind === 'equipamento'
        ? { variantOf: ref(byKey.get(r.parentKey)!) }
        : {}),
      weight: number(item.peso),
      weightUnit: 'kg',
      ...money(str('preco') || str('custo')),
      requiresAttunement: /sintonia/i.test(str('sintonia')) && !/não/i.test(str('sintonia')),
    };
    if (category.startsWith('arma-')) {
      const masteryName = str('maestria');
      const mastery = masteryName
        ? synthetic(r, 'maestria:weirs:' + normalizeName(masteryName), 'maestria', masteryName, {
            key: normalizeName(masteryName),
          })
        : null;
      const properties = str('props')
        .split(/,\s*(?![^()]*\))/)
        .filter((s) => s && s !== '—')
        .map((name) =>
          synthetic(r, 'propriedade:weirs:' + normalizeName(name), 'propriedade_arma', name, {
            key: normalizeName(name),
          }),
        );
      const ranges = /Alcance\s+([\d,.]+)\/([\d,.]+)/i.exec(str('props'));
      const damage = /^(\d+(?:d\d+)?)\s+(.+)/i.exec(str('dano'));
      const damages = damage
        ? [
            {
              dice: damage[1],
              damageType: normalizeName(damage[2])
                .replace('contundente', 'concussao')
                .replace('energia', 'energetico'),
              ability: null,
            },
          ]
        : [];
      if (!damages.length) issue(r, 'Dano não reconhecido.');
      data.weapon = {
        rangeType: cat.endsWith('_dist') ? 'distancia' : 'corpo-a-corpo',
        normalRangeFeet: ranges
          ? distanceFeet(Number(ranges[1].replace(',', '.')), 'metros')
          : null,
        longRangeFeet: ranges ? distanceFeet(Number(ranges[2].replace(',', '.')), 'metros') : null,
        masteryRef: mastery ? ref(mastery) : null,
        criticalMinimum: 20,
        propertyRefs: properties.map(ref),
        damages,
      };
    } else if (category.startsWith('armadura-')) {
      data.armor = {
        baseAc: number(item.ca) ?? 0,
        addDexterity: /destreza/i.test(str('ca')),
        dexterityLimit: /m[áa]x\s*\+?(\d+)/i.test(str('ca'))
          ? Number(/m[áa]x\s*\+?(\d+)/i.exec(str('ca'))![1])
          : null,
        strengthMinimum: number(item.str),
        stealthDisadvantage: /desvantagem/i.test(str('stealth')),
      };
    } else if (category === 'escudo') data.shield = { acBonus: number(item.ca) ?? 2 };
    else if (category === 'ferramenta')
      data.tool = {
        ability: abilityCodes(str('atributo'))[0] ?? null,
        usage: [str('usar'), str('fabricacao')].filter(Boolean).join('\n'),
      };
    else if (category === 'magico')
      data.magicItem = { rarity: str('raridade') || 'não informada', maximumCharges: null };
    else if (category === 'veiculo')
      data.vehicle = { capacityKg: number(item.carga), speedFeet: null, minimumCrew: null };
    create<'equipamento'>(r, data);
  }
  const find = (
    kind: CompendiumKind,
    name: string,
    preferJson = true,
  ): ResolvedEntry | undefined => {
    const alias = curation.aliases.names.find(
      (a) => a.kind === kind && normalizeName(a.name) === normalizeName(name),
    );
    name = alias?.target ?? name;
    const candidates = c.entries.filter(
      (e) =>
        e.kind === kind &&
        (normalizeName(e.name) === normalizeName(name) ||
          normalizeName(e.originalName) === normalizeName(name)),
    );
    const json = candidates.filter((e) => raw.get(e.key)?.sourceFormat === 'json');
    const preferred = preferJson && json.length ? json : candidates;
    const modern = preferred.filter((e) => raw.get(e.key)?.book.includes('(2024)'));
    return modern.length === 1 ? modern[0] : preferred.length === 1 ? preferred[0] : undefined;
  };
  const grant = (owner: ResolvedEntry, target: ResolvedEntry, key: string, level = 1) =>
    c.grants.push({
      id: stableId(owner.ref.revisionId + ':grant:' + key),
      ownerRevisionId: owner.ref.revisionId,
      key,
      kind: target.kind,
      targetRef: ref(target),
      groupId: null,
      requirementId: null,
      level,
      acquisition: 'ambas',
      quantity: 1,
    });
  const group = (
    owner: ResolvedEntry,
    key: string,
    name: string,
    min = 1,
    max = min,
    level = 1,
  ): ChoiceGroupDefinition => {
    const g: ChoiceGroupDefinition = {
      id: stableId(owner.ref.revisionId + ':choice:' + key),
      ownerRevisionId: owner.ref.revisionId,
      key,
      name,
      minimum: min,
      maximum: max,
      acquisition: 'ambas',
      abilityPoints: null,
      abilityLimit: null,
      optionKind: null,
      featCategory: null,
      requirementId: null,
      level,
      options: [],
    };
    c.choices.push(g);
    return g;
  };
  const proficiency = (
    owner: ResolvedEntry,
    key: string,
    data: Omit<ProficiencyDefinition, 'id' | 'ownerRevisionId'>,
    acquisition: 'inicial' | 'multiclasse' | 'ambas' = 'ambas',
    direct = true,
  ) => {
    const id = stableId(owner.ref.revisionId + ':prof:' + key);
    c.proficiencies.push({ id, ownerRevisionId: owner.ref.revisionId, ...data });
    if (!direct) return id;
    if (owner.kind === 'classe') owner.data.proficiencies.push({ proficiencyId: id, acquisition });
    else
      c.effects.push({
        id: stableId(id + ':effect'),
        ownerRevisionId: owner.ref.revisionId,
        key: 'prof:' + key,
        type: 'proficiencia',
        formula: null,
        requirementId: null,
        level: 1,
        stacking: 'maximo',
        condition: '',
        abilities: [],
        defenses: [],
        resources: [],
        proficiencies: [{ proficiencyId: id, degree: 'proficiente' }],
      });
    return id;
  };
  const equipment = (r: CatalogDraftRecord, name: string) => {
    const exact = find('equipamento', name);
    if (exact) return exact;
    const variants = c.entries.filter(
      (e) =>
        e.kind === 'equipamento' &&
        [
          e.name + 's',
          e.name.replace(/^\S+/, (word) => word + 's'),
          e.name
            .split(' ')
            .map((word) => (['de', 'do', 'da', 'e'].includes(word) ? word : word + 's'))
            .join(' '),
        ].some((plural) => normalizeName(plural) === normalizeName(name)),
    );
    if (variants.length === 1) return variants[0];
    return synthetic(r, 'equipamento:fonte:' + normalizeName(name), 'equipamento', name, {
      category: 'basico',
      weight: null,
      weightUnit: 'kg',
      cost: null,
      currencyRef: null,
      requiresAttunement: false,
    });
  };
  const packageFor = (
    r: CatalogDraftRecord,
    owner: ResolvedEntry,
    key: string,
    items: string[],
  ) => {
    const pkg = synthetic(r, owner.key + ':package:' + key, 'pacote', owner.name + ' — ' + key, {
      items: [],
      notes: items.join('; '),
    });
    if (pkg.kind !== 'pacote') throw Error('Tipo de pacote inválido');
    for (const [i, text] of items.entries()) {
      const price = money(text);
      if (/^\s*[\d.,]+\s*(PC|PP|PE|PO|PL|GP|SP|CP|EP)\s*$/i.test(text) && price.currencyRef) {
        pkg.data.items.push({
          id: stableId(pkg.ref.revisionId + ':item:' + i),
          equipmentRef: null,
          currencyRef: price.currencyRef,
          quantity: price.cost!,
        });
        continue;
      }
      if (/escolh|mesm[oa]s? escolhid|qualquer|\bou\b/i.test(text)) {
        issue(r, 'Equipamento requer escolha vinculada: ' + text, 'UNSUPPORTED_MECHANIC');
        continue;
      }
      const prefix = /^(\d+)\s+(.+)$/.exec(text),
        sheetCount = /\((\d+)\s+folhas?\)/i.exec(text);
      const quantity = prefix ? Number(prefix[1]) : sheetCount ? Number(sheetCount[1]) : 1;
      let name = prefix?.[2] ?? text;
      if (sheetCount) name = name.replace(sheetCount[0], '').trim();
      const item = equipment(r, name);
      pkg.data.items.push({
        id: stableId(pkg.ref.revisionId + ':item:' + i),
        equipmentRef: ref(item),
        currencyRef: null,
        quantity,
      });
    }
    c.equipmentOptions.push({
      id: stableId(owner.ref.revisionId + ':equipment:' + key),
      ownerRevisionId: owner.ref.revisionId,
      key,
      name: key,
      packageRef: ref(pkg),
      acquisition: 'inicial',
    });
  };
  for (const r of input.records) {
    const owner = byKey.get(r.key);
    if (!owner) continue;
    const p = r.payload;
    if (
      r.parentKey &&
      (r.kind === 'criatura' ||
        (r.kind === 'caracteristica' && (p.type === 'trait' || r.level !== undefined)))
    ) {
      const parent = byKey.get(r.parentKey);
      if (parent) grant(parent, owner, r.key, r.level ?? 1);
      else issue(r, 'Origem da característica não encontrada.', 'UNRESOLVED_REFERENCE', 'error');
    }
    if (p.type === 'background') {
      const name = p.input.feat;
      const english = /\(([^()]+)\)\s*(?:ou|$)/.exec(name)?.[1];
      const base = name.replace(/\s*\([^)]*\)/g, '').trim();
      const target = find('talento', english ?? base);
      const category = /Dom Sombrio|Dark Gift/.test(name)
        ? 'dom-sombrio'
        : /Pacto Planar|Planar Pact/.test(name)
          ? 'pacto-planar'
          : null;
      if (category && /escolha/i.test(name)) {
        const g = group(owner, 'talento', 'Talento do antecedente');
        g.optionKind = 'talento';
        g.featCategory = category;
        if (target)
          g.options.push({
            id: stableId(g.id + target.key),
            groupId: g.id,
            name: target.name,
            type: 'talento',
            targetRef: ref(target),
            ability: null,
            proficiencyId: null,
            value: null,
            quantity: 1,
          });
        c.grants.push({
          id: stableId(g.id + ':grant'),
          ownerRevisionId: owner.ref.revisionId,
          key: 'talento',
          kind: 'talento',
          targetRef: null,
          groupId: g.id,
          requirementId: null,
          level: 1,
          acquisition: 'ambas',
          quantity: 1,
        });
      } else if (target) grant(owner, target, 'talento');
      else
        issue(r, 'Talento de antecedente não resolvido: ' + name, 'UNRESOLVED_REFERENCE', 'error');
      const variant = /\((Clérigo|Druida|Mago)\)/.exec(name);
      if (target && variant) {
        const g = group(owner, 'iniciado-lista', 'Lista de Iniciado em Magia');
        g.options.push({
          id: stableId(g.id + ':' + variant[1]),
          groupId: g.id,
          name: variant[1],
          type: 'lista-magia',
          targetRef: null,
          ability: null,
          proficiencyId: null,
          value: normalizeName(variant[1]),
          quantity: 1,
        });
      }
      for (const skillName of p.input.skill_proficiencies) {
        const skill = curation.requirements.skillAliases[skillName];
        if (skill) proficiency(owner, skill, { type: 'pericia', skill });
        else issue(r, 'Perícia não resolvida: ' + skillName, 'UNRESOLVED_REFERENCE', 'error');
      }
      for (const toolName of p.input.tool_proficiencies) {
        if (/escolh/i.test(toolName)) {
          const candidates = c.entries.filter(
            (e) =>
              e.kind === 'equipamento' &&
              e.data.category === 'ferramenta' &&
              (!/musical/i.test(toolName) ||
                (raw.get(e.key)?.payload.type === 'equipment' &&
                  (raw.get(e.key)!.payload as { category: string }).category ===
                    'ferramenta:instrumento')) &&
              (!/artes[aã]o/i.test(toolName) ||
                (raw.get(e.key)?.payload.type === 'equipment' &&
                  (raw.get(e.key)!.payload as { category: string }).category ===
                    'ferramenta:artesao')) &&
              (!/jogos?/i.test(toolName) ||
                (raw.get(e.key)?.payload.type === 'equipment' &&
                  (raw.get(e.key)!.payload as { category: string }).category ===
                    'ferramenta:jogo')),
          );
          const g = group(owner, 'ferramenta', 'Proficiência: ' + toolName);
          g.optionKind = 'equipamento';
          g.options = candidates.map((e) => {
            const id = proficiency(
              owner,
              e.key,
              { type: 'equipamento', equipment: ref(e) },
              'ambas',
              false,
            );
            return {
              id: stableId(g.id + e.key),
              groupId: g.id,
              name: e.name,
              type: 'proficiencia',
              targetRef: null,
              ability: null,
              proficiencyId: id,
              value: null,
              quantity: 1,
            };
          });
        } else
          proficiency(owner, toolName, {
            type: 'equipamento',
            equipment: ref(equipment(r, toolName)),
          });
      }
      packageFor(r, owner, 'A', p.input.equipment.option_a);
      packageFor(r, owner, 'B', p.input.equipment.option_b);
    }
    if (owner.kind === 'talento') {
      const parsed = linkRequirements(
        parsePrerequisites(
          owner.data.prerequisiteText.replace(/[.;]\s*$/, ''),
          owner.ref.revisionId,
        ),
        {
          entries: c.entries,
          find: (kind, name) => find(kind, name),
          proficiency: (key, data) => proficiency(owner, key, data, 'ambas', false),
        },
      );
      c.requirements.push(...parsed.requirements);
      owner.data.requirementsComplete = parsed.unsupported.length === 0;
      if (parsed.unsupported.length)
        issue(r, 'Pré-requisito exige revisão: ' + parsed.unsupported.join('; '));
    }
    if (
      p.type === 'feat' &&
      (p.input.ability_scores?.length || r.originalName === 'Ability Score Improvement')
    ) {
      const allowed =
        r.originalName === 'Ability Score Improvement'
          ? Object.values(abilities)
          : p.input.ability_scores!.flatMap(abilityCodes);
      const g = group(
        owner,
        'aumento-atributo',
        'Aumento de atributo',
        1,
        r.originalName === 'Ability Score Improvement' ? 2 : 1,
      );
      g.abilityPoints = r.originalName === 'Ability Score Improvement' ? 2 : 1;
      const limit = /m[áa]ximo de (20|30)|acima de (20|30)/i.exec(r.description);
      g.abilityLimit = limit
        ? Number(limit[1] ?? limit[2])
        : owner.kind === 'talento' && owner.data.category === 'dadiva-epica'
          ? 30
          : 20;
      g.options = [...new Set(allowed)].map((ability) => ({
        id: stableId(g.id + ability),
        groupId: g.id,
        name: Object.keys(abilities).find((n) => abilities[n] === ability)!,
        type: 'atributo',
        targetRef: null,
        ability,
        proficiencyId: null,
        value: null,
        quantity: 1,
      }));
    }
    if (r.name === 'Mancha' && r.parentKey?.includes('manchados')) {
      const target = find('talento', 'Mancha Espiritual');
      if (target) grant(owner, target, 'talento-mancha');
      else
        issue(
          r,
          'Mancha Espiritual requer alias editorial confirmado.',
          'UNRESOLVED_REFERENCE',
          'error',
        );
    }
    for (const effect of curation.effects.entries) {
      const matches = effect.name
        ? r.name === effect.name &&
          (!effect.parent || raw.get(r.parentKey ?? '')?.name === effect.parent)
        : effect.originalName === r.originalName && r.sourceFormat === 'json';
      if (!matches) continue;
      const { name, originalName, parent, ...definition } = effect;
      c.effects.push({
        id: stableId(owner.ref.revisionId + ':effect:' + effect.key),
        ownerRevisionId: owner.ref.revisionId,
        formula: null,
        requirementId: null,
        level: 1,
        stacking: 'somar',
        condition: '',
        abilities: [],
        defenses: [],
        resources: [],
        proficiencies: [],
        ...definition,
      });
    }
    if (owner.kind === 'magia' && p.type === 'legacy') {
      const classes = (p.entry.metadata.classes ?? '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of classes) {
        const canonical =
          curation.spellLists.classAliases[name.toLowerCase()] ?? normalizeName(name);
        const target = c.entries.find(
          (e) => e.kind === 'classe' && normalizeName(e.name) === canonical,
        );
        if (target && !owner.data.classRefs.some((r) => r.revisionId === target.ref.revisionId))
          owner.data.classRefs.push(ref(target));
        else issue(r, 'Classe de magia não resolvida: ' + name, 'UNRESOLVED_REFERENCE');
      }
    }
    if (owner.kind === 'classe') {
      const l = labels(r.descriptionHtml);
      const classConfig = curation.progressions.classes[normalizeName(owner.name)];
      const armor = normalizeName(l['proficiencias-em-armaduras'] ?? ''),
        weapons = normalizeName(l['proficiencias-em-armas'] ?? '');
      const categories = [
        ...['leve', 'media', 'pesada']
          .filter((type) => armor.includes(type))
          .map((type) => 'armadura-' + type),
        ...(armor.includes('escudo') ? ['escudo'] : []),
        ...(weapons.includes('simples') ? ['arma-simples'] : []),
        ...(weapons.includes('marciais') ? ['arma-marcial'] : []),
      ];
      for (const category of categories)
        proficiency(
          owner,
          category,
          { type: 'categoria', category },
          classConfig?.multiclassProficiencies?.includes(category) ? 'ambas' : 'inicial',
        );
      const skillText = l.pericias ?? '',
        countWords: Record<string, number> = {
          uma: 1,
          um: 1,
          duas: 2,
          dois: 2,
          tres: 3,
          quatro: 4,
        };
      const countMatch = /escolha\s+(\d+|uma?|duas|dois|três|quatro)/i.exec(skillText);
      const skillCount = countMatch
        ? Number(countMatch[1]) || countWords[normalizeName(countMatch[1])]
        : 0;
      if (skillCount) {
        const allowed = Object.entries(curation.requirements.skillAliases)
          .filter(([name]) => normalizeName(skillText).includes(normalizeName(name)))
          .map(([, code]) => code);
        const skills = [
          ...new Set(
            allowed.length
              ? allowed
              : /qualquer|quaisquer/i.test(skillText)
                ? Object.values(curation.requirements.skillAliases)
                : [],
          ),
        ];
        const g = group(owner, 'pericias', 'Perícias da classe inicial', skillCount);
        g.acquisition = 'inicial';
        for (const skill of skills) {
          const id = proficiency(
            owner,
            'skill:' + skill,
            { type: 'pericia', skill },
            'inicial',
            false,
          );
          g.options.push({
            id: stableId(g.id + skill),
            groupId: g.id,
            name: skill,
            type: 'proficiencia',
            targetRef: null,
            ability: null,
            proficiencyId: id,
            value: null,
            quantity: 1,
          });
        }
        if (classConfig?.multiclassSkillCount) {
          const multi = group(
            owner,
            'pericias-multiclasse',
            'Perícia de entrada por multiclasse',
            classConfig.multiclassSkillCount,
          );
          multi.acquisition = 'multiclasse';
          multi.options = g.options.map((o) => ({
            ...o,
            id: stableId(multi.id + o.name),
            groupId: multi.id,
          }));
        }
      } else issue(r, 'Quantidade de perícias iniciais exige revisão.');
      const equipmentText = l['equipamento-inicial'] ?? '';
      const parts = [
        ...equipmentText.matchAll(/\(([A-Z])\)\s*([\s\S]*?)(?=;\s*(?:ou\s*)?\([A-Z]\)|$)/g),
      ];
      for (const part of parts)
        packageFor(
          r,
          owner,
          part[1],
          part[2]
            .replace(/[.;]\s*$/, '')
            .split(/,\s*(?![^()]*\))|\s+e\s+(?=\d+\s*(?:PO|PP|PC|GP|SP|CP|EP)\b)/),
        );
      for (const ability of abilityCodes(l['testes-de-resistencia'] ?? l.salvaguardas ?? ''))
        proficiency(owner, 'save:' + ability, { type: 'salvaguarda', ability }, 'inicial');
      const $ = load(r.descriptionHtml);
      $('table').each((t, table) => {
        const rows = $(table)
          .find('tr')
          .map((_, tr) => [
            $(tr)
              .find('th,td')
              .map((_, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
              .get(),
          ])
          .get();
        const heads = rows[0] ?? [];
        rows.slice(1).forEach((cells, row) =>
          cells.forEach((value, column) =>
            c.progressionCells.push({
              ownerRevisionId: owner.ref.revisionId,
              table: t,
              row: row + 1,
              column,
              heading: heads[column] ?? '',
              value,
            }),
          ),
        );
      });
      const config = curation.progressions.classes[normalizeName(owner.name)];
      if (config?.castingAbility) {
        const profile: SpellcastingProfileDefinition = {
          id: stableId(owner.ref.revisionId + ':casting'),
          ownerRevisionId: owner.ref.revisionId,
          key: 'classe',
          type: config.pact ? 'pacto' : 'conjuracao',
          method: owner.name === 'Mago' ? 'grimorio' : 'preparadas',
          contributionNumerator: config.denominator ? 1 : 0,
          contributionDenominator: (config.denominator || 1) as 1 | 2 | 3,
          rounding: config.rounding ?? 'baixo',
          firstLevel: 1,
          abilities: [config.castingAbility],
          progression: [],
          slots: [],
          spells: [],
        };
        const cells = c.progressionCells.filter(
          (cell) => cell.ownerRevisionId === owner.ref.revisionId,
        );
        for (let level = 1; level <= 20; level++) {
          const row = cells.filter((cell) =>
            cells.some(
              (first) =>
                first.table === cell.table &&
                first.row === cell.row &&
                first.column === 0 &&
                /^\d+[º°]?$/.test(first.value) &&
                number(first.value) === level,
            ),
          );
          const count = (heading: string) =>
            number(row.find((cell) => normalizeName(cell.heading) === heading)?.value) ?? 0;
          let slots: number[] = [];
          if (config.pact) {
            const circle = Math.min(5, Math.ceil(level / 2));
            slots = Array.from({ length: circle }, () => 0);
            slots[circle - 1] = level === 1 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4;
          } else {
            const casterLevel = config.denominator === 2 ? Math.ceil(level / 2) : level;
            slots = curation.progressions.multiclassSlots[casterLevel - 1] ?? [];
          }
          slots.forEach((total, i) => {
            if (total) profile.slots.push({ level, circle: i + 1, total });
          });
          profile.progression.push({
            level,
            cantrips: count('truques'),
            prepared: row.some((cell) => normalizeName(cell.heading) === 'magias-preparadas')
              ? count('magias-preparadas')
              : null,
            known: null,
            maximumCircle: slots.length,
          });
        }
        c.castingProfiles.push(profile);
      }
    }
  }
  for (const r of input.records.filter((r) => r.kind === 'subclasse')) {
    const parent = byKey.get(r.parentKey ?? '');
    if (!parent) {
      issue(r, 'Classe da subclasse ausente.', 'UNRESOLVED_REFERENCE', 'error');
      continue;
    }
    const levels = [
      ...new Set(
        input.records.filter((x) => x.parentKey === r.key && x.level).map((x) => x.level!),
      ),
    ].sort((a, b) => a - b);
    create<'subclasse'>(r, {
      classRef: ref(parent),
      acquisitionLevel: levels[0] ?? 3,
      levels: levels.map((level) => ({ level })),
    });
  }
  // Subclass feature relations depend on the newly created subclass roots.
  for (const r of input.records.filter(
    (r) => r.kind === 'caracteristica' && r.parentKey && raw.get(r.parentKey)?.kind === 'subclasse',
  )) {
    const owner = byKey.get(r.parentKey!),
      target = byKey.get(r.key);
    if (owner && target && r.level !== undefined) grant(owner, target, r.key, r.level);
    c.issues = c.issues.filter(
      (i) =>
        !(
          i.revisionId === target?.ref.revisionId &&
          i.message === 'Origem da característica não encontrada.'
        ),
    );
  }
  c.multiclassSlots = curation.progressions.multiclassSlots.flatMap((slots, i) =>
    slots.map((total, j) => ({ level: i + 1, circle: j + 1, total })),
  );
  const core = synthetic(
    parentSource,
    'caracteristica:regra:conjuracao-multiclasse-2024',
    'caracteristica',
    'Conjuração Multiclasse — 2024',
    { category: 'regra-criacao', manualDecision: false },
  );
  c.castingProfiles.push({
    id: stableId(core.ref.revisionId + ':profile'),
    ownerRevisionId: core.ref.revisionId,
    key: 'multiclasse',
    type: 'conjuracao',
    method: 'fixas',
    contributionNumerator: 0,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: [],
    progression: [],
    slots: c.multiclassSlots,
    spells: [],
  });
  for (const e of c.entries) {
    const r = raw.get(e.key);
    e.aliases = curation.aliases.names
      .filter((a) => a.kind === e.kind && normalizeName(a.target) === normalizeName(e.name))
      .map((a) => a.name);
    // A source saying 2024 is provenance, not by itself an editorial review.
    const related =
      c.grants.some((g) => g.ownerRevisionId === e.ref.revisionId) ||
      c.effects.some((g) => g.ownerRevisionId === e.ref.revisionId) ||
      ['magia', 'equipamento', 'especie', 'classe', 'linhagem', 'pacote'].includes(e.kind);
    e.automation = related ? 'parcial' : 'manual';
    if (r?.sourceFormat === 'html' && !['classe', 'magia', 'especie'].includes(e.kind))
      issue(r, 'Texto legado preservado; regras específicas aguardam curadoria.');
  }
  return c;
}
