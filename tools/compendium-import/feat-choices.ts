import type {
  ChoiceGroupDefinition,
  SpellcastingProfileDefinition,
} from '../../packages/contracts/compendium';
import type { CuratedContext } from './curated-context';
import type { ResolvedCatalog, ResolvedEntry } from './resolved';
import { normalizeName, stableId } from './identity';

/** Run after every curator: later racial/class groups need the same category choices. */
export function populateFeatChoices(c: ResolvedCatalog) {
  for (const group of c.choices) {
    if (!group.featCategory || group.options.length) continue;
    for (const feat of c.entries) {
      if (
        feat.kind !== 'talento' ||
        feat.data.category !== group.featCategory ||
        feat.sourcePath !== 'data/feats.json'
      )
        continue;
      group.options.push({
        id: stableId(group.id + ':' + feat.key),
        groupId: group.id,
        name: feat.name,
        type: 'talento',
        targetRef: feat.ref,
        ability: null,
        proficiencyId: null,
        value: null,
        quantity: 1,
      });
    }
  }
}

/** Explicit permanent decisions from the twelve source feats; combat triggers stay textual. */
export function curateFeatChoices(ctx: CuratedContext) {
  const { catalog: c } = ctx;
  const feat = (name: string) =>
    c.entries.find(
      (e) => e.kind === 'talento' && e.name === name && e.sourcePath === 'data/feats.json',
    );
  const option = (
    g: ChoiceGroupDefinition,
    name: string,
    fields: Partial<ChoiceGroupDefinition['options'][number]>,
  ) => {
    g.options.push({
      id: stableId(g.id + ':' + normalizeName(name)),
      groupId: g.id,
      name,
      type: 'caracteristica',
      targetRef: null,
      ability: null,
      proficiencyId: null,
      value: null,
      quantity: 1,
      ...fields,
    });
  };
  const feature = (
    owner: ResolvedEntry,
    key: string,
    name: string,
    description: string,
    manual = false,
  ) => {
    const entry = ctx.synthetic(
      ctx.raw.get(owner.key)!,
      owner.key + ':feat:' + key,
      'caracteristica',
      name,
      { category: 'beneficio-talento', manualDecision: manual, parentRef: owner.ref },
    );
    entry.description = description;
    entry.descriptionHtml = '';
    return entry;
  };
  const skills: Record<string, string> = {
    acrobacia: 'Acrobacia',
    adestrarAnimais: 'Adestrar Animais',
    arcanismo: 'Arcanismo',
    atletismo: 'Atletismo',
    atuacao: 'Atuação',
    enganacao: 'Enganação',
    furtividade: 'Furtividade',
    historia: 'História',
    intimidacao: 'Intimidação',
    intuicao: 'Intuição',
    investigacao: 'Investigação',
    medicina: 'Medicina',
    natureza: 'Natureza',
    percepcao: 'Percepção',
    persuasao: 'Persuasão',
    prestidigitacao: 'Prestidigitação',
    religiao: 'Religião',
    sobrevivencia: 'Sobrevivência',
  };
  const skillChoice = (
    owner: ResolvedEntry,
    name: string,
    count: number,
    keys = Object.keys(skills),
    expertise = false,
  ) => {
    const g = ctx.group(owner, normalizeName(name), name, count, count);
    for (const key of keys)
      option(g, skills[key], {
        type: expertise ? 'especializacao' : 'proficiencia',
        proficiencyId: ctx.proficiency(
          owner,
          normalizeName(name) + ':' + key,
          { type: 'pericia', skill: key },
          'ambas',
          false,
        ),
      });
  };
  // Both official PHB language tables, checked against Basic Rules 2024:
  // https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character
  // Keep official English labels where this repository supplies no Portuguese translation.
  const languageNames: [string, string][] = [
    ['Common', 'Comum'],
    ['Common Sign Language', 'Comum — Língua de Sinais'],
    ['Draconic', 'Dracônico'],
    ['Dwarvish', 'Dwarvish'],
    ['Elvish', 'Elvish'],
    ['Giant', 'Giant'],
    ['Gnomish', 'Gnomish'],
    ['Goblin', 'Goblin'],
    ['Halfling', 'Halfling'],
    ['Orc', 'Orc'],
    ['Abyssal', 'Abissal'],
    ['Celestial', 'Celestial'],
    ['Deep Speech', 'Deep Speech'],
    ['Druidic', 'Druidic'],
    ['Infernal', 'Infernal'],
    ['Primordial', 'Primordial'],
    ['Sylvan', 'Silvestre'],
    ['Thieves’ Cant', 'Thieves’ Cant'],
    ['Undercommon', 'Undercommon'],
  ];
  const language = (owner: ResolvedEntry, original: string, name: string) => {
    const existing = c.entries.find(
      (e) => e.kind === 'idioma' && (e.name === name || e.originalName === original),
    );
    if (existing) return existing;
    const e = ctx.synthetic(
      ctx.raw.get(owner.key)!,
      'idioma:phb-2024:' + normalizeName(original),
      'idioma',
      name,
      { category: 'idioma-phb-2024', origin: 'Player’s Handbook (2024)' },
    );
    e.originalName = original;
    e.description = `${original} — tabela de idiomas do Player’s Handbook (2024).`;
    return e;
  };
  const languageChoice = (owner: ResolvedEntry, name: string) => {
    const g = ctx.group(owner, normalizeName(name), name);
    for (const [original, label] of languageNames) {
      const target = language(owner, original, label);
      option(g, target.name, {
        type: 'proficiencia',
        proficiencyId: ctx.proficiency(
          owner,
          normalizeName(name) + ':' + original,
          { type: 'idioma', language: target.ref },
          'ambas',
          false,
        ),
      });
    }
  };
  const spell = (owner: ResolvedEntry, original: string) => {
    const e = c.entries.find(
      (e) => e.kind === 'magia' && normalizeName(e.originalName) === normalizeName(original),
    );
    if (!e)
      c.issues.push({
        code: 'UNRESOLVED_REFERENCE',
        severity: 'error',
        path: owner.sourcePath,
        pointer: owner.pointer,
        revisionId: owner.ref.revisionId,
        message: 'Magia de talento não encontrada: ' + original,
      });
    return e;
  };
  const profile = (owner: ResolvedEntry, fixed: [string, number | null][], ability = true) => {
    const p: SpellcastingProfileDefinition = {
      id: stableId(owner.ref.revisionId + ':feat-casting'),
      ownerRevisionId: owner.ref.revisionId,
      key: 'magias-talento',
      type: 'concedida',
      method: 'fixas',
      contributionNumerator: 0,
      contributionDenominator: 1,
      rounding: 'baixo',
      firstLevel: 1,
      abilities: ability ? ['int', 'sab', 'car'] : [],
      progression: [],
      slots: [],
      spells: [],
    };
    for (const [original, uses] of fixed) {
      const target = spell(owner, original);
      if (!target) continue;
      p.spells.push({
        spellRef: target.ref,
        level: 1,
        alwaysPrepared: true,
        usesSlots: target.kind === 'magia' && target.data.circle > 0,
        ownUses: uses,
        recovery: uses ? 'longo' : null,
      });
    }
    c.castingProfiles.push(p);
  };
  const darkNames = [
    'Anatomia Aberrante',
    'Alma Ecoante',
    'Sussurros Reunidos',
    'Sombra Viva',
    'Andarilho das Brumas',
    'Segunda Pele',
    'Ser Simbiótico',
    'Toque da Morte',
    'Observadores',
  ];
  for (const name of darkNames) {
    const owner = feat(name);
    if (
      !owner ||
      owner.kind !== 'talento' ||
      owner.data.prerequisiteText !== 'Campanha de Ravenloft'
    )
      continue;
    // Only the exact narrative prerequisite is curated; other unknown prerequisites stay blocked.
    owner.data.requirementsComplete = true;
    const context = feature(
      owner,
      'contexto-ravenloft',
      'Contexto: Campanha de Ravenloft',
      'Este Dom Sombrio pertence a uma Campanha de Ravenloft. Confirme o contexto narrativo com o Mestre.',
      true,
    );
    ctx.grant(owner, context, 'contexto-ravenloft');
  }
  const pacts = ['Pacto Feérico', 'Pacto Infernal', 'Pacto das Sombras'].flatMap((name) => {
    const e = feat(name);
    return e ? [e] : [];
  });
  for (const owner of pacts) {
    if (
      owner.kind !== 'talento' ||
      owner.data.prerequisiteText !== 'Não pode ter outro talento de Pacto Planar'
    )
      continue;
    const root = stableId(owner.ref.revisionId + ':pacto-exclusivo');
    const node = (
      id: string,
      operator: 'todos' | 'ausente',
      parentId: string | null,
      targetRef: ResolvedEntry['ref'] | null,
    ) =>
      c.requirements.push({
        id,
        ownerRevisionId: owner.ref.revisionId,
        parentId,
        operator,
        targetRef,
        ability: null,
        minimum: null,
        choiceKey: null,
        proficiencyId: null,
      });
    node(root, 'todos', null, null);
    for (const other of pacts)
      if (other !== owner) node(stableId(root + ':' + other.key), 'ausente', root, other.ref);
    owner.data.requirementsComplete = pacts.length === 3;
  }
  const anatomy = feat('Anatomia Aberrante');
  if (anatomy) {
    const id = ctx.proficiency(anatomy, 'percepcao', { type: 'pericia', skill: 'percepcao' });
    c.effects.push({
      id: stableId(anatomy.ref.revisionId + ':expertise'),
      ownerRevisionId: anatomy.ref.revisionId,
      key: 'percepcao-especializacao',
      type: 'proficiencia',
      formula: null,
      requirementId: null,
      level: 1,
      stacking: 'maximo',
      condition: '',
      abilities: [],
      defenses: [],
      resources: [],
      proficiencies: [{ proficiencyId: id, degree: 'especializacao' }],
    });
  }
  const echo = feat('Alma Ecoante');
  if (echo) {
    skillChoice(echo, 'Proeza Canalizada: perícias', 2);
    skillChoice(echo, 'Proeza Canalizada: especialização', 1, Object.keys(skills), true);
    languageChoice(echo, 'Idiomas Inerentes');
  }
  const symbiotic = feat('Ser Simbiótico');
  if (symbiotic) {
    skillChoice(symbiotic, 'Segunda Mente: perícia', 1, [
      'arcanismo',
      'enganacao',
      'historia',
      'intimidacao',
      'intuicao',
      'investigacao',
      'natureza',
      'religiao',
      'percepcao',
      'persuasao',
    ]);
    languageChoice(symbiotic, 'Segunda Mente: idioma');
  }
  for (const [name, spells, ability] of [
    [
      'Sussurros Reunidos',
      [
        ['message', null],
        ['augury', 1],
      ],
      true,
    ],
    ['Sombra Viva', [['mage hand', null]], true],
    ['Segunda Pele', [['alter self', 1]], true],
    ['Toque da Morte', [['chill touch', null]], true],
    [
      'Observadores',
      [
        ['beast sense', 1],
        ['speak with animals', 1],
      ],
      false,
    ],
  ] as [string, [string, number | null][], boolean][]) {
    const owner = feat(name);
    if (owner) profile(owner, spells, ability);
  }
  const skin = feat('Segunda Pele');
  if (skin) {
    const g = ctx.group(skin, 'catalisador-mudanca', 'Catalisador da Mudança');
    for (const [index, name] of [
      'Ver uma fase específica da lua',
      'Sentir o perfume de um certo tipo de flor',
      'Ouvir sinos de templo tocando',
      'Ouvir uma melodia específica',
      'Tocar prata pura com sua pele nua',
      'Ver alguém que se parece com um indivíduo específico',
    ].entries()) {
      const target = feature(
        skin,
        'catalisador-' + (index + 1),
        name,
        `Catalisador da Mudança (resultado ${index + 1} no d6): ${name}. Quando ocorre, aplique Mudança Involuntária do talento Segunda Pele.`,
      );
      option(g, name, { targetRef: target.ref });
    }
  }
  const fey = feat('Pacto Feérico');
  if (fey) {
    ctx.proficiency(fey, 'natureza', { type: 'pericia', skill: 'natureza' });
    const sylvan = language(fey, 'Sylvan', 'Silvestre');
    ctx.proficiency(fey, 'silvestre', { type: 'idioma', language: sylvan.ref });
    profile(fey, [['druidcraft', null]]);
    const g = ctx.group(fey, 'truques-feericos', 'Truques Feéricos');
    for (const target of c.entries) {
      if (
        target.kind === 'magia' &&
        target.data.circle === 0 &&
        ['adivinhacao', 'encantamento'].includes(normalizeName(target.data.school)) &&
        normalizeName(target.originalName) !== 'druidcraft'
      )
        option(g, target.name, { type: 'magia', targetRef: target.ref });
    }
  }
  const infernal = feat('Pacto Infernal');
  if (infernal) {
    ctx.proficiency(infernal, 'enganacao', { type: 'pericia', skill: 'enganacao' });
    const g = ctx.group(infernal, 'resistencia-infernal', 'Resistência Infernal');
    for (const name of ['Fogo', 'Veneno']) {
      const target = feature(
        infernal,
        'resistencia-' + name,
        name,
        `Você tem Resistência a dano de ${name}.`,
      );
      if (target.kind === 'caracteristica')
        target.data.formEffects = { form: '', resistances: [name] };
      option(g, name, { targetRef: target.ref });
    }
  }
}
