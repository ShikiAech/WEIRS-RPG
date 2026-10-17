import type {
  ChoiceGroupDefinition,
  SpellcastingProfileDefinition,
} from '../../packages/contracts/compendium';
import type { Ability } from '../../packages/contracts/sheets';
import type { CuratedContext } from './curated-context';
import type { ResolvedEntry } from './resolved';
import { hash, normalizeName, stableId } from './identity';

/** Explicit source-backed class decisions; no narrative activation is automated here. */
export function curateClassChoices(ctx: CuratedContext) {
  const { catalog: c, group, proficiency, synthetic, raw } = ctx;
  const cls = (name: string) => c.entries.find((e) => e.kind === 'classe' && e.name === name);
  const children = (owner: ResolvedEntry) =>
    c.entries.filter(
      (e) => e.kind === 'caracteristica' && e.data.parentRef?.revisionId === owner.ref.revisionId,
    );
  const allSkills = [
    ...new Set(c.proficiencies.flatMap((p) => (p.type === 'pericia' && p.skill ? [p.skill] : []))),
  ].sort();
  const option = (g: ChoiceGroupDefinition, target: ResolvedEntry, type: string = target.kind) => {
    g.options.push({
      id: stableId(g.id + ':' + target.key),
      groupId: g.id,
      name: target.name,
      type,
      targetRef: target.ref,
      ability: null,
      proficiencyId: null,
      value: null,
      quantity: 1,
    });
  };
  const skillGroup = (
    owner: ResolvedEntry,
    key: string,
    name: string,
    count: number,
    level: number,
    skills = allSkills,
    type = 'proficiencia',
  ) => {
    const g = group(owner, key, name, count, count, level);
    g.options = skills.map((skill) => ({
      id: stableId(g.id + ':' + skill),
      groupId: g.id,
      name: skill,
      type,
      targetRef: null,
      ability: null,
      proficiencyId: proficiency(
        owner,
        key + ':' + skill,
        { type: 'pericia', skill },
        'ambas',
        false,
      ),
      value: null,
      quantity: 1,
    }));
    return g;
  };
  const toolGroup = (
    owner: ResolvedEntry,
    key: string,
    name: string,
    count: number,
    level: number,
    categories: string[],
  ) => {
    const g = group(owner, key, name, count, count, level);
    for (const tool of c.entries) {
      const payload = raw.get(tool.key)?.payload;
      if (
        tool.kind !== 'equipamento' ||
        payload?.type !== 'equipment' ||
        !categories.includes(payload.category)
      )
        continue;
      g.options.push({
        id: stableId(g.id + ':' + tool.key),
        groupId: g.id,
        name: tool.name,
        type: 'proficiencia',
        targetRef: null,
        ability: null,
        proficiencyId: proficiency(
          owner,
          key + ':' + tool.key,
          { type: 'equipamento', equipment: tool.ref },
          'inicial',
          false,
        ),
        value: null,
        quantity: 1,
      });
    }
    return g;
  };
  const feature = (owner: ResolvedEntry, key: string, name: string, description: string) => {
    const parent = raw.get(owner.key)!;
    const f = synthetic(parent, owner.key + ':curated:' + key, 'caracteristica', name, {
      category: 'escolha-classe',
      manualDecision: false,
      parentRef: owner.ref,
      optional: true,
    });
    f.description = description;
    f.descriptionHtml = '<p>' + description + '</p>';
    return f;
  };
  const profile = (
    owner: ResolvedEntry,
    key: string,
    ability: Ability,
    cantrips: number,
    list?: ResolvedEntry,
  ): SpellcastingProfileDefinition => {
    const p: SpellcastingProfileDefinition = {
      id: stableId(owner.ref.revisionId + ':casting:' + key),
      ownerRevisionId: owner.ref.revisionId,
      key,
      type: 'concedida',
      method: 'fixas',
      contributionNumerator: 0,
      contributionDenominator: 1,
      rounding: 'baixo',
      firstLevel: 1,
      abilities: [ability],
      progression: cantrips
        ? Array.from({ length: 20 }, (_, i) => ({
            level: i + 1,
            cantrips,
            prepared: 0,
            known: 0,
            maximumCircle: 0,
          }))
        : [],
      slots: [],
      spells: [],
      ...(list ? { listClassRefs: [list.ref] } : {}),
    };
    c.castingProfiles.push(p);
    return p;
  };
  const bard = cls('Bardo');
  if (bard) {
    toolGroup(bard, 'instrumentos', 'Instrumentos musicais da classe inicial', 3, 1, [
      'ferramenta:instrumento',
    ]).acquisition = 'inicial';
    for (const level of [2, 9])
      skillGroup(
        bard,
        'especializacao-' + level,
        'Perícia Especialista do nível ' + level,
        2,
        level,
        allSkills,
        'especializacao',
      );
  }
  const rogue = cls('Ladino');
  const wizard = cls('Mago');
  if (wizard)
    skillGroup(
      wizard,
      'erudito',
      'Erudito — especialização',
      1,
      2,
      ['arcanismo', 'historia', 'investigacao', 'medicina', 'natureza', 'religiao'],
      'especializacao',
    );
  if (rogue) {
    for (const level of [1, 6])
      skillGroup(
        rogue,
        'especializacao-' + level,
        'Expertise do nível ' + level,
        2,
        level,
        allSkills,
        'especializacao',
      );
    const g = group(rogue, 'maestrias-1', 'Maestrias em armas do nível 1', 2, 2, 1);
    const trained =
      rogue.kind === 'classe'
        ? rogue.data.proficiencies.flatMap((p) =>
            c.proficiencies.filter((x) => x.id === p.proficiencyId),
          )
        : [];
    for (const w of c.entries)
      if (
        w.kind === 'equipamento' &&
        w.data.weapon?.masteryRef &&
        trained.some(
          (p) => p.category === w.data.category || p.equipment?.revisionId === w.ref.revisionId,
        )
      )
        option(g, w, 'maestria-arma');
  }
  const monk = cls('Monge');
  if (monk)
    toolGroup(
      monk,
      'ferramenta-instrumento',
      'Ferramenta de artesão ou instrumento musical',
      1,
      1,
      ['ferramenta:artesao', 'ferramenta:instrumento'],
    ).acquisition = 'inicial';
  const barbarian = cls('Bárbaro');
  if (barbarian) {
    const base = c.choices.find(
      (g) => g.ownerRevisionId === barbarian.ref.revisionId && g.key === 'pericias',
    );
    skillGroup(
      barbarian,
      'conhecimento-primitivo',
      'Conhecimento Primitivo — perícia adicional',
      1,
      3,
      base?.options.flatMap(
        (o) => c.proficiencies.find((p) => p.id === o.proficiencyId)?.skill ?? [],
      ) ?? [],
      'proficiencia-nova',
    );
    for (const g of c.choices.filter(
      (g) => g.ownerRevisionId === barbarian.ref.revisionId && g.key.startsWith('maestrias-'),
    ))
      g.options = g.options.filter((o) => {
        const w = c.entries.find((e) => e.ref.revisionId === o.targetRef?.revisionId);
        return w?.kind === 'equipamento' && w.data.weapon?.rangeType === 'corpo-a-corpo';
      });
  }
  const master = c.entries.find((e) => e.kind === 'subclasse' && e.name === 'Mestre de Batalha');
  if (master) {
    const maneuvers = children(master).filter(
      (e) => e.kind === 'caracteristica' && e.data.optional,
    );
    for (const [level, count] of [
      [3, 3],
      [7, 2],
      [10, 2],
      [15, 2],
    ]) {
      const g = group(
        master,
        'manobras-' + level,
        'Manobras do nível ' + level,
        count,
        count,
        level,
      );
      for (const m of maneuvers) option(g, m);
    }
    const fighter = cls('Guerreiro');
    const base = c.choices.find(
      (g) => g.ownerRevisionId === fighter?.ref.revisionId && g.key === 'pericias',
    );
    skillGroup(
      master,
      'estudante-pericia',
      'Estudante da Guerra — perícia',
      1,
      3,
      base?.options.flatMap(
        (o) => c.proficiencies.find((p) => p.id === o.proficiencyId)?.skill ?? [],
      ) ?? [],
      'proficiencia-nova',
    );
    toolGroup(master, 'estudante-ferramenta', 'Estudante da Guerra — ferramenta de artesão', 1, 3, [
      'ferramenta:artesao',
    ]);
  }
  const sorcerer = cls('Feiticeiro');
  if (sorcerer) {
    const metas = children(sorcerer).filter(
      (e) => e.kind === 'caracteristica' && e.data.optional && e.name.startsWith('Magia '),
    );
    for (const level of [2, 10, 17]) {
      const g = group(sorcerer, 'metamagia-' + level, 'Metamagia do nível ' + level, 2, 2, level);
      for (const m of metas) option(g, m);
    }
  }
  const warlock = cls('Bruxo');
  if (warlock) {
    const invocations = children(warlock).filter(
      (e) => e.kind === 'caracteristica' && e.data.optional,
    );
    let known = 0;
    const cells = c.progressionCells
      .filter(
        (x) =>
          x.ownerRevisionId === warlock.ref.revisionId &&
          normalizeName(x.heading) === 'invocacoes-misticas' &&
          /^\d+$/.test(x.value),
      )
      .sort((a, b) => a.row - b.row);
    for (const cell of cells) {
      const total = Number(cell.value),
        count = total - known;
      if (count <= 0) continue;
      known = total;
      const g = group(
        warlock,
        'invocacoes-' + cell.row,
        'Invocações Místicas do nível ' + cell.row,
        count,
        count,
        cell.row,
      );
      for (const inv of invocations) {
        option(g, inv);
        if (/repet[ií]vel|repeatable/i.test(inv.description)) {
          const first = g.options.at(-1)!;
          for (let occurrence = 2; occurrence <= count; occurrence++)
            g.options.push({
              ...first,
              id: stableId(first.id + ':occurrence:' + occurrence),
              name: `${inv.name} (${occurrence}ª aquisição)`,
            });
        }
      }
    }
    for (const inv of invocations) {
      if (inv.kind !== 'caracteristica') continue;
      const requirement = (
        inv.description.match(/(?:Nível\s+\d+\+\s+de Bruxo|Sem pré-requisito)[\s\S]*$/i)?.[0] ?? ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      const addRequirement = (
        operator: 'nivel-classe' | 'caracteristica',
        target: ResolvedEntry,
        minimum: number | null,
      ) =>
        c.requirements.push({
          id: stableId(inv.ref.revisionId + ':curated:req:' + operator),
          ownerRevisionId: inv.ref.revisionId,
          parentId: null,
          operator,
          targetRef: target.ref,
          minimum,
          ability: null,
          choiceKey: null,
          proficiencyId: null,
        });
      const min = /Nível\s+(\d+)\+\s+de Bruxo/i.exec(requirement);
      if (min) addRequirement('nivel-classe', warlock, Number(min[1]));
      const dependency = /Invocação\s+([^•]+)/i.exec(requirement)?.[1]?.trim();
      const target = dependency ? invocations.find((e) => e.name === dependency) : null;
      if (target) addRequirement('caracteristica', target, null);
      if (/truque de Bruxo/i.test(requirement))
        inv.data.spellPrerequisite = {
          classRef: warlock.ref,
          circle: 0,
          ...(/causa dano/i.test(requirement) ? { dealsDamage: true as const } : {}),
          ...(/rolagem de ataque/i.test(requirement) ? { requiresAttackRoll: true as const } : {}),
          ...(inv.name === 'Lança Mística' ? { minimumRangeFeet: 10 } : {}),
        };
      if (['Rajada Agonizante', 'Lança Mística', 'Rajada Repulsora'].includes(inv.name)) {
        const g = group(inv, 'truque-afetado', 'Truque beneficiado por ' + inv.name, 1, 1, 1);
        for (const spell of c.entries)
          if (spell.kind === 'magia' && spell.data.circle === 0) option(g, spell, 'magia-alvo');
      }
      if (inv.name === 'Pacto do Tomo') {
        for (const [key, name, count, circle] of [
          ['truques', 'Truques do Livro das Sombras', 3, 0],
          ['rituais', 'Rituais do Livro das Sombras', 2, 1],
        ] as const) {
          const g = group(inv, 'tomo-' + key, name, count, count, 1);
          for (const spell of c.entries)
            if (
              spell.kind === 'magia' &&
              spell.data.circle === circle &&
              (circle === 0 || spell.data.ritual)
            ) {
              option(g, spell, 'magia');
              g.options.at(-1)!.value = 'nao-preparada';
            }
        }
        profile(inv, 'livro-das-sombras', 'car', 0);
      }
      if (inv.name === 'Lições dos Primogênitos') {
        const g = group(inv, 'talento-origem', 'Talento de Origem');
        g.optionKind = 'talento';
        g.featCategory = 'origem';
        for (const feat of c.entries)
          if (
            feat.kind === 'talento' &&
            feat.data.category === 'origem' &&
            feat.sourcePath === 'data/feats.json'
          )
            option(g, feat);
      }
    }
  }
  for (const [className, key, casting, martial, armor, skills] of [
    [
      'Clérigo',
      'ordem-divina',
      'Taumaturgo',
      'Protetor',
      'armadura-pesada',
      ['arcanismo', 'religiao'],
    ],
    [
      'Druida',
      'ordem-primitiva',
      'Magista',
      'Guardião',
      'armadura-media',
      ['arcanismo', 'natureza'],
    ],
  ] as const) {
    const owner = cls(className);
    if (!owner) continue;
    const g = group(owner, key, className === 'Clérigo' ? 'Ordem Divina' : 'Ordem Primitiva');
    const caster = feature(
      owner,
      key + '-conjurador',
      casting,
      'Você conhece um truque adicional da lista de ' +
        className +
        ' e recebe seu modificador de Sabedoria (mínimo +1) nos testes das perícias indicadas.',
    );
    if (caster.kind === 'caracteristica')
      caster.data.skillBonuses = [{ skills: [...skills], ability: 'sab', minimum: 1 }];
    profile(caster, key, 'sab', 1, owner);
    option(g, caster);
    const warrior = feature(
      owner,
      key + '-marcial',
      martial,
      'Proficiência em armas marciais e treinamento em ' +
        armor.replace('armadura-', 'armaduras ') +
        '.',
    );
    proficiency(warrior, 'arma-marcial', { type: 'categoria', category: 'arma-marcial' });
    proficiency(warrior, armor, { type: 'categoria', category: armor });
    option(g, warrior);
  }
  const druid = cls('Druida');
  if (druid) {
    const herb = ctx.find('equipamento', 'Kit de Herbalismo');
    if (herb)
      proficiency(druid, 'kit-herbalismo', { type: 'equipamento', equipment: herb.ref }, 'inicial');
    const language =
      ctx.find('idioma', 'Druídico') ??
      synthetic(raw.get(druid.key)!, 'idioma:curated:druidico', 'idioma', 'Druídico', {
        category: 'secreto',
        origin: 'Druida',
      });
    const id = proficiency(
      druid,
      'druidico',
      { type: 'idioma', language: language.ref },
      'ambas',
      false,
    );
    c.effects.push({
      id: stableId(druid.ref.revisionId + ':idioma:druidico'),
      ownerRevisionId: druid.ref.revisionId,
      key: 'idioma-druidico',
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
    const spell = ctx.find('magia', 'Falar com Animais');
    const p = c.castingProfiles.find(
      (p) => p.ownerRevisionId === druid.ref.revisionId && p.key === 'classe',
    );
    if (spell && p)
      p.spells.push({
        spellRef: spell.ref,
        level: 1,
        alwaysPrepared: true,
        usesSlots: true,
        ownUses: null,
        recovery: null,
      });
  }
  const paladin = cls('Paladino');
  if (paladin) {
    let smite = ctx.find('magia', 'Golpe Divino');
    if (!smite) {
      // The local Paladin source names this spell, but the legacy spell cards omit it.
      // Verified primary source (2026-10-17), PHB2024 p.265:
      const url = 'https://www.dndbeyond.com/spells/2618833-divine-smite';
      const description =
        'Logo após acertar um ataque com arma corpo a corpo ou golpe desarmado, use uma ação bônus. ' +
        'O alvo recebe 2d8 de dano Radiante adicional; contra Ínferos ou Mortos-Vivos, acrescente 1d8. ' +
        'Cada círculo do espaço acima do primeiro acrescenta mais 1d8 ao dano.';
      const sourceHash = hash(url + ':2024:1:evocation:self:V:instantaneous:' + description);
      const source = {
        ...paladin.source,
        id: stableId('fonte:curated:divine-smite-2024'),
        title: "Player's Handbook (2024) — Divine Smite",
        edition: '2024',
        language: 'en',
        origin: 'oficial' as const,
        author: 'Wizards of the Coast; tradução editorial Weirs',
        referenceUrl: url,
        attribution: 'Dados de regras conferidos no D&D Beyond; nome em português da classe local.',
        path: 'tools/compendium-import/class-choices.ts#divine-smite-2024',
        hash: sourceHash,
      };
      c.sources.push(source);
      smite = synthetic(
        {
          ...raw.get(paladin.key)!,
          sourceId: source.id,
          book: source.title,
          sourcePath: source.path,
          sourceHash,
          revisionId: sourceHash,
        },
        'magia:curated:divine-smite-2024',
        'magia',
        'Golpe Divino',
        {
          circle: 1,
          school: 'evocacao',
          castingTime:
            'Ação bônus, imediatamente após acertar com arma corpo a corpo ou golpe desarmado',
          range: 'Pessoal',
          rangeFeet: 0,
          duration: 'Instantânea',
          durationSeconds: 0,
          concentration: false,
          ritual: false,
          components: {
            verbal: true,
            somatic: false,
            material: '',
            costCopper: null,
            consumed: false,
          },
          classRefs: [paladin.ref],
          damages: [
            {
              id: stableId('magia:curated:divine-smite-2024:damage'),
              order: 0,
              dice: '2d8',
              damageType: 'radiante',
            },
          ],
          scales: Array.from({ length: 8 }, (_, i) => ({
            level: i + 2,
            basis: 'circulo' as const,
            dice: `${i + 3}d8`,
          })),
        },
      );
      smite.originalName = 'Divine Smite';
      smite.description = description;
      smite.descriptionHtml = '<p>' + description + '</p>';
      smite.reviewed2024 = true;
    }
    const p = c.castingProfiles.find(
      (p) => p.ownerRevisionId === paladin.ref.revisionId && p.key === 'classe',
    );
    if (p)
      p.spells.push({
        spellRef: smite.ref,
        level: 2,
        alwaysPrepared: true,
        usesSlots: true,
        ownUses: 1,
        recovery: 'longo',
      });
  }
  const ranger = cls('Patrulheiro');
  if (ranger) {
    // The local class calls Hunter's Mark “Marca do Caçador”; its spell card uses
    // “Marca do Predador”. Match the exact original title, retaining that card's name.
    const mark = c.entries.find(
      (e) => e.kind === 'magia' && e.originalName.toLowerCase() === "hunter's mark",
    );
    const p = c.castingProfiles.find(
      (p) => p.ownerRevisionId === ranger.ref.revisionId && p.key === 'classe',
    );
    if (mark && p)
      for (const [level, ownUses] of [
        [1, 2],
        [5, 3],
        [9, 4],
        [13, 5],
        [17, 6],
      ])
        p.spells.push({
          spellRef: mark.ref,
          level,
          alwaysPrepared: true,
          usesSlots: true,
          ownUses,
          recovery: 'longo',
        });
  }
  for (const [className, style, listName, ability] of [
    ['Paladino', 'Guerreiro Abençoado', 'Clérigo', 'car'],
    ['Patrulheiro', 'Guerreiro Druídico', 'Druida', 'sab'],
  ] as const) {
    const owner = cls(className),
      list = cls(listName);
    if (!owner || !list) continue;
    const styleFeature = children(owner).find((e) => e.name === 'Estilo de Luta');
    const g = c.choices.find(
      (g) => g.ownerRevisionId === styleFeature?.ref.revisionId && g.key === 'estilo-luta',
    );
    if (!g) continue;
    // This choice has two kinds: a fighting-style feat or a class feature.
    g.optionKind = null;
    g.featCategory = null;
    const f = feature(
      styleFeature!,
      normalizeName(style),
      style,
      'Você aprende dois truques de ' + listName + '.',
    );
    profile(f, 'truques-estilo', ability, 2, list);
    option(g, f);
  }
}
