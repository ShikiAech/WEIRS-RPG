import type {
  ChoiceGroupDefinition,
  FeatureDefinition,
  MovementDefinition,
} from '../../packages/contracts/compendium';
import type { Ability } from '../../packages/contracts/sheets';
import type { CuratedContext } from './curated-context';
import type { ResolvedEntry } from './resolved';
import { stableId, normalizeName } from './identity';

/** Explicit source curation: no condition text is interpreted as an active rule. */
export function curateSpeciesChoices(ctx: CuratedContext) {
  const { catalog: c } = ctx;
  const species = (name: string) => c.entries.find((e) => e.kind === 'especie' && e.name === name);
  const child = (parent: ResolvedEntry | undefined, name: string) =>
    parent &&
    c.entries.find(
      (e) =>
        e.kind === 'caracteristica' &&
        e.name === name &&
        e.data.parentRef?.revisionId === parent.ref.revisionId,
    );
  const lineage = (parent: ResolvedEntry | undefined, name: string) =>
    parent &&
    c.entries.find(
      (e) =>
        e.kind === 'linhagem' &&
        e.name === name &&
        e.data.speciesRef.revisionId === parent.ref.revisionId,
    );
  const option = (
    g: ChoiceGroupDefinition,
    name: string,
    extra: Partial<ChoiceGroupDefinition['options'][number]>,
  ) =>
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
      ...extra,
    });
  const synthetic = (
    owner: ResolvedEntry,
    name: string,
    description: string,
    data: Partial<FeatureDefinition> = {},
  ) => {
    const raw = ctx.raw.get(owner.key)!;
    const e = ctx.synthetic(
      raw,
      owner.key + ':selection:' + normalizeName(name),
      'caracteristica',
      name,
      { category: 'traco', manualDecision: false, parentRef: owner.ref, ...data },
    );
    e.description = description;
    e.descriptionHtml = '';
    return e;
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
    owner: ResolvedEntry | undefined,
    name: string,
    count = 1,
    keys = Object.keys(skills),
    expertise = false,
  ) => {
    if (!owner) return;
    const g = ctx.group(owner, normalizeName(name), name, count, count);
    for (const key of keys) {
      const p = ctx.proficiency(
        owner,
        'choice:' + normalizeName(name) + ':' + key,
        { type: 'pericia', skill: key },
        'ambas',
        false,
      );
      option(g, skills[key], {
        type: expertise
          ? 'especializacao'
          : name === 'Conhecimento Proibido: perícias'
            ? 'proficiencia-nova'
            : 'proficiencia',
        proficiencyId: p,
      });
    }
  };
  const featChoice = (owner: ResolvedEntry | undefined) => {
    if (!owner) return;
    const g = ctx.group(owner, 'talento-origem', owner.name);
    g.optionKind = 'talento';
    g.featCategory = 'origem';
  };
  const movement = (
    owner: ResolvedEntry,
    mode: MovementDefinition['mode'],
    feet: number,
    form = '',
    hover = false,
  ): MovementDefinition => ({
    id: stableId(owner.ref.revisionId + ':' + mode + ':' + form),
    mode,
    distance: feet,
    unit: 'pes',
    form,
    condition: '',
    hover,
  });
  const choices = (
    owner: ResolvedEntry | undefined,
    name: string,
    values: { name: string; description: string; effects?: FeatureDefinition['formEffects'] }[],
  ) => {
    if (!owner) return [];
    const g = ctx.group(owner, normalizeName(name), name);
    return values.map((v) => {
      const e = synthetic(owner, v.name, v.description, { formEffects: v.effects });
      option(g, v.name, { targetRef: e.ref });
      return e;
    });
  };
  const resistance = (
    owner: ResolvedEntry | undefined,
    name: string,
    damages: string[],
    form = '',
  ) =>
    choices(
      owner,
      name,
      damages.map((d) => ({
        name: d,
        description: `${name}: você possui Resistência a dano de ${d}${form ? ' enquanto estiver utilizando seu Exotraje' : ''}.`,
        effects: { form, resistances: [d] },
      })),
    );
  const humans = species('Humanos'),
    elves = species('Elfos'),
    yun = species("Yun'kais"),
    oni = species('Onis'),
    nova = species('N0-V4'),
    kinect = species('Kinect');
  for (const e of [humans, elves]) if (e?.kind === 'especie') e.data.lineageRequired = false;
  skillChoice(child(humans, 'Hábil'), 'Hábil');
  featChoice(child(humans, 'Versátil'));
  featChoice(child(lineage(elves, 'Meio-Elfo'), 'Dádiva Herdada'));
  for (const e of [elves, yun])
    skillChoice(child(e, 'Sentidos Aguçados'), 'Sentidos Aguçados', 1, [
      'intuicao',
      'percepcao',
      'sobrevivencia',
    ]);
  const marked = lineage(humans, 'Marcados');
  const body = child(marked, 'Corpo Marcado');
  choices(
    body,
    'Corpo Marcado',
    ['Anfíbio', 'Ágil (nimble)', 'Tática de Matilha', 'Ancestral Feérico'].map((name) => ({
      name,
      description: `Corpo Marcado — ${name}. ${body?.description ?? ''}`,
    })),
  );
  skillChoice(child(marked, 'Conhecimento Proibido'), 'Conhecimento Proibido: perícias', 2);
  skillChoice(
    child(marked, 'Conhecimento Proibido'),
    'Conhecimento Proibido: especialização',
    1,
    undefined,
    true,
  );
  resistance(child(kinect, 'Núcleo Elemental'), 'Núcleo Elemental', [
    'Ácido',
    'Elétrico',
    'Fogo',
    'Frio',
    'Trovão',
  ]);
  resistance(child(yun, 'Proteção Lunar'), 'Proteção Lunar', ['Radiante', 'Necrótico']);
  const fixedResistance = (owner: ResolvedEntry | undefined, damage: string) => {
    if (owner?.kind !== 'caracteristica') return;
    owner.data.formEffects = {
      ...owner.data.formEffects,
      form: '',
      resistances: [...new Set([...(owner.data.formEffects?.resistances ?? []), damage])],
    };
  };
  // WEIRS source tables: these resistances belong to the selected lineage itself.
  // Namyrian metal charges activate separate abilities, not the clan's resistance.
  // Source elemental labels Ígneo/Gélido/Venenoso use the catalog's Fogo/Frio/Veneno.
  for (const [name, damage] of [
    ['Belial', 'Fogo'],
    ['Asmodeus', 'Necrótico'],
    ['Beelzebub', 'Veneno'],
  ])
    fixedResistance(child(lineage(oni, name), 'Legado de ' + name), damage);
  const namyrians = species('Namyrianos');
  for (const [name, damage] of [
    ['Montanha', 'Contundente'],
    ['Trovão', 'Elétrico'],
    ['Chamas', 'Fogo'],
    ['Gélido', 'Frio'],
  ])
    fixedResistance(child(lineage(namyrians, name), `Afinidade Elemental (${name})`), damage);
  const draconians = species('Draconianos');
  for (const [name, damage] of [
    ['Elétrico', 'Elétrico'],
    ['Gélido', 'Frio'],
    ['Ígneo', 'Fogo'],
    ['Ácido', 'Ácido'],
    ['Venenoso', 'Veneno'],
  ])
    fixedResistance(child(lineage(draconians, name), `Herança Elemental (${name})`), damage);
  // Fixed senses use the explicit named source trait and its stated distance only.
  for (const e of c.entries.filter((e) => e.kind === 'especie')) {
    if (e.kind !== 'especie') continue;
    const trait = child(e, 'Visão no Escuro Superior') ?? child(e, 'Visão no Escuro');
    if (!trait) continue;
    const feet = trait.description.match(/(\d+)\s*(?:ft|pés)/i),
      meters = trait.description.match(/(\d+)\s*metros/i);
    const distance = feet ? Number(feet[1]) : meters ? (Number(meters[1]) * 10) / 3 : null;
    if (distance !== null)
      e.data.senses = [{ type: trait.name, distanceFeet: distance, condition: '' }];
  }
  const fairies = species('Fadas');
  if (fairies?.kind === 'especie')
    fairies.data.movements.push(movement(fairies, 'voo', 30, '', true));
  if (kinect?.kind === 'especie') kinect.data.movements.push(movement(kinect, 'natacao', 40));
  if (nova?.kind === 'especie') {
    nova.data.formRules = [
      { form: 'natural', armorClass: 10, permitsShield: false, hitPointMultiplier: 0.5 },
      { form: 'exotraje', armorClass: 16, permitsShield: true, falseLifeMultiplier: 2 },
    ];
    nova.data.movements = [
      movement(nova, 'terrestre', 20, 'natural'),
      movement(nova, 'escalada', 20, 'natural'),
      movement(nova, 'terrestre', 30, 'exotraje'),
    ];
    choices(
      child(nova, 'Sistema de Mobilidade'),
      'Sistema de Mobilidade',
      [
        ['Terrestre Aprimorado', 'terrestre', 40],
        ['Escalador', 'escalada', 30],
        ['Aquático', 'natacao', 40],
        ['Propulsor', 'voo', 30],
      ].map(([name, mode, feet]) => ({
        name: String(name),
        description: `${name}: seu Exotraje possui deslocamento de ${mode} de ${feet} pés.`,
        effects: {
          form: 'exotraje',
          movements: [movement(nova, mode as MovementDefinition['mode'], Number(feet), 'exotraje')],
        },
      })),
    );
    const modules = choices(child(nova, 'Módulo Especializado'), 'Módulo Especializado', [
      {
        name: 'Módulo Defensivo',
        description: 'Enquanto estiver utilizando o traje, você recebe +1 de bônus na CA.',
        effects: { form: 'exotraje', armorClassBonus: 1 },
      },
      {
        name: 'Módulo de Armamento',
        description:
          'Arma marcial à distância integrada ao Exotraje: 1d8 Energia, alcance 12/36 m, munição ilimitada. Usa Destreza para ataque e dano.',
        effects: {
          form: 'exotraje',
          attack: {
            name: 'Módulo de Armamento',
            ability: 'des',
            dice: '1d8',
            damageType: 'Energia',
            normalRangeFeet: 40,
            longRangeFeet: 120,
            category: 'marcial',
          },
        },
      },
      {
        name: 'Módulo Utilitário',
        description:
          'Ferramenta integrada ao Exotraje: você recebe proficiência e +1 em testes com essa ferramenta enquanto usa o traje.',
        effects: {
          form: 'exotraje',
        },
      },
    ]);
    const utility = modules[2];
    if (utility) {
      const g = ctx.group(utility, 'ferramenta-integrada', 'Ferramenta integrada');
      for (const tool of c.entries.filter((e) => e.kind === 'equipamento' && e.data.tool)) {
        const p = ctx.proficiency(
          utility,
          'tool:' + tool.ref.recordId,
          { type: 'equipamento', equipment: tool.ref },
          'ambas',
          false,
        );
        option(g, tool.name, { type: 'proficiencia', proficiencyId: p });
      }
    }
    resistance(
      child(nova, 'Blindagem Adaptativa'),
      'Blindagem Adaptativa',
      ['Ácido', 'Elétrico', 'Fogo', 'Frio'],
      'exotraje',
    );
  }
  const innate = (
    owner: ResolvedEntry | undefined,
    abilities: Ability[],
    spells: [string, number, number?][],
  ) => {
    if (!owner) return;
    const resolved = spells.flatMap(([original, level, uses]) => {
      const spell = c.entries.find(
        (e) => e.kind === 'magia' && normalizeName(e.originalName) === normalizeName(original),
      );
      if (!spell) {
        c.issues.push({
          code: 'UNRESOLVED_REFERENCE',
          severity: 'error',
          path: owner.sourcePath,
          pointer: owner.pointer,
          message: 'Magia racial não encontrada: ' + original,
          revisionId: owner.ref.revisionId,
        });
        return [];
      }
      return [
        {
          spellRef: spell.ref,
          level,
          alwaysPrepared: true,
          usesSlots: !!uses,
          ownUses: uses ?? null,
          recovery: uses ? ('longo' as const) : null,
        },
      ];
    });
    c.castingProfiles.push({
      id: stableId(owner.ref.revisionId + ':racial-inata'),
      ownerRevisionId: owner.ref.revisionId,
      key: 'racial-inata',
      type: 'concedida',
      method: 'fixas',
      contributionNumerator: 0,
      contributionDenominator: 1,
      rounding: 'baixo',
      firstLevel: 1,
      abilities,
      progression: [],
      slots: [],
      spells: resolved,
    });
  };
  innate(
    child(elves, 'Familiaridade Arcana'),
    [],
    [
      ['message', 1],
      ['detect magic', 1, 1],
      ['counterspell', 3, 1],
    ],
  );
  innate(
    child(yun, 'Proteção Lunar'),
    ['int', 'sab', 'car'],
    [
      ['eldritch blast', 1],
      ['misty step', 3, 1],
      ['moonbeam', 5, 1],
    ],
  );
  innate(
    child(lineage(species('Namyrianos'), 'Gélido'), 'Proteção Gélida / Raio de Gelo'),
    ['int', 'sab', 'car'],
    [['ray of frost', 1]],
  );
  for (const [name, spells] of [
    [
      'Belial',
      [
        ['fire bolt', 1],
        ['hellish rebuke', 3, 1],
        ['darkness', 5, 1],
      ],
    ],
    [
      'Beelzebub',
      [
        ['poison spray', 1],
        ['ray of sickness', 3, 1],
        ['hold person', 5, 1],
      ],
    ],
    [
      'Asmodeus',
      [
        ['chill touch', 1],
        ['false life', 3, 1],
        ['ray of enfeeblement', 5, 1],
      ],
    ],
  ] as [string, [string, number, number?][]][])
    innate(
      child(lineage(oni, name), 'Legado de ' + name),
      ['int', 'sab', 'car'],
      [['thaumaturgy', 1], ...spells],
    );
}
