import type {
  AbilityScores,
  CreationCatalog,
  CreationDraft,
  CreationProblem,
  CreationContribution,
} from '../contracts/character-creation';
import type {
  ChoiceGroupDefinition,
  CompendiumEntry,
  CompendiumRef,
  EffectDefinition,
  GrantDefinition,
} from '../contracts/compendium';
import { resolveAbilities } from './abilities';
import { requirementMet, type RequirementContext } from './requirements';

export function instanceUuid(key: string) {
  const words = [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => {
      let value = seed;
      for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619);
      return (value >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
  return `${words.slice(0, 8)}-${words.slice(8, 12)}-4${words.slice(13, 16)}-8${words.slice(17, 20)}-${words.slice(20, 32)}`;
}
export interface CreationInstance {
  id: string;
  entry: CompendiumEntry;
  level: number;
  acquiredAt: number;
  acquisition: 'inicial' | 'multiclasse';
  classEntryId: string | null;
  grantId: string | null;
  ancestors: string[];
}
export interface ActiveChoice {
  instance: CreationInstance;
  group: ChoiceGroupDefinition;
}
export interface ActiveEffect {
  instance: CreationInstance;
  effect: EffectDefinition;
}
export interface ResolvedConcessions {
  instances: CreationInstance[];
  choices: ActiveChoice[];
  effects: ActiveEffect[];
  proficiencyGrants: {
    instance: CreationInstance;
    proficiencyId: string;
    degree: 'meia' | 'proficiente' | 'especializacao';
  }[];
  abilityBonuses: {
    instance: CreationInstance;
    ability: keyof AbilityScores;
    amount: number;
    limit: number;
  }[];
  contributions: CreationContribution[];
  problems: CreationProblem[];
}
export function resolveConcessions(
  catalog: CreationCatalog,
  draft: CreationDraft,
): ResolvedConcessions {
  const result: ResolvedConcessions = {
    instances: [],
    choices: [],
    effects: [],
    proficiencyGrants: [],
    abilityBonuses: [],
    contributions: [],
    problems: [],
  };
  const problem = (code: string, field: string, message: string, sourceRevisionId?: string) =>
    result.problems.push({ code, field, message, sourceRevisionId });
  const find = (ref: CompendiumRef | null) =>
    ref &&
    catalog.entries.find(
      (e) => e.ref.recordId === ref.recordId && e.ref.revisionId === ref.revisionId,
    );
  const totalLevel = draft.classes.reduce((n, c) => n + c.level, 0);
  const roots: CreationInstance[] = [];
  const root = (
    ref: CompendiumRef | null,
    id: string,
    kind: string,
    level = 1,
    acquisition: 'inicial' | 'multiclasse' = 'inicial',
    classEntryId: string | null = null,
    acquiredAt = 1,
  ) => {
    const entry = find(ref);
    if (!entry || entry.kind !== kind || entry.ruleSetId !== draft.ruleSetId) {
      problem('MISSING_REFERENCE', id, `Selecione um registro publicado de ${kind}.`);
      return;
    }
    roots.push({
      id,
      entry,
      level,
      acquisition,
      classEntryId,
      acquiredAt,
      grantId: null,
      ancestors: [],
    });
  };
  root(draft.speciesRef, 'species', 'especie');
  root(draft.backgroundRef, 'background', 'antecedente');
  if (draft.lineageRef) {
    root(draft.lineageRef, 'lineage', 'linhagem');
    const lineage = find(draft.lineageRef);
    if (
      lineage?.kind === 'linhagem' &&
      lineage.data.speciesRef.revisionId !== draft.speciesRef?.revisionId
    )
      problem('INVALID_LINEAGE', 'lineageRef', 'A linhagem não pertence à espécie selecionada.');
  }
  if (!draft.classes.length || totalLevel < 1 || totalLevel > 20 || !Number.isInteger(totalLevel))
    problem('INVALID_LEVEL', 'classes', 'O nível total deve estar entre 1 e 20.');
  if (
    new Set(draft.classes.map((c) => c.id)).size !== draft.classes.length ||
    new Set(draft.classes.map((c) => c.classRef.recordId)).size !== draft.classes.length
  )
    problem('DUPLICATE_CLASS', 'classes', 'Cada classe deve aparecer uma única vez.');
  const initialClass = draft.levels[0]?.classEntryId;
  for (const cls of draft.classes) {
    const acquiredAt = draft.levels.find((l) => l.classEntryId === cls.id)?.totalLevel ?? 1;
    root(
      cls.classRef,
      `class:${cls.id}`,
      'classe',
      cls.level,
      cls.id === initialClass ? 'inicial' : 'multiclasse',
      cls.id,
      acquiredAt,
    );
    const sub = find(cls.subclassRef);
    if (sub?.kind === 'subclasse') {
      if (
        sub.data.classRef.revisionId !== cls.classRef.revisionId ||
        cls.level < sub.data.acquisitionLevel
      )
        problem(
          'INVALID_SUBCLASS',
          `classes.${cls.id}`,
          'A subclasse não está disponível para esta classe e nível.',
        );
      else
        root(
          cls.subclassRef,
          `subclass:${cls.id}`,
          'subclasse',
          cls.level,
          cls.id === initialClass ? 'inicial' : 'multiclasse',
          cls.id,
          draft.levels.filter((l) => l.classEntryId === cls.id)[sub.data.acquisitionLevel - 1]
            ?.totalLevel ?? acquiredAt,
        );
    } else if (cls.subclassRef)
      problem(
        'MISSING_REFERENCE',
        `classes.${cls.id}.subclassRef`,
        'A revisão da subclasse não está disponível.',
      );
    const classEntry = find(cls.classRef);
    if (
      !cls.subclassRef &&
      catalog.entries.some(
        (e) =>
          e.kind === 'subclasse' &&
          e.data.classRef.revisionId === classEntry?.ref.revisionId &&
          cls.level >= e.data.acquisitionLevel,
      )
    )
      problem('SUBCLASS_REQUIRED', `classes.${cls.id}.subclassRef`, 'Escolha a subclasse.');
  }
  const base = resolveAbilities(catalog, draft).totals;
  function context(at: number): RequirementContext {
    const counts = new Map<string, number>();
    for (const level of draft.levels.filter((l) => l.totalLevel <= at)) {
      const cls = draft.classes.find((c) => c.id === level.classEntryId);
      if (cls) counts.set(cls.classRef.revisionId, (counts.get(cls.classRef.revisionId) ?? 0) + 1);
    }
    const owned = result.instances.filter((i) => i.acquiredAt <= at);
    const repetitions = new Map<string, number>();
    for (const i of owned)
      repetitions.set(i.entry.ref.revisionId, (repetitions.get(i.entry.ref.revisionId) ?? 0) + 1);
    const scores = { ...base };
    for (const b of result.abilityBonuses.filter((b) => b.instance.acquiredAt < at))
      if (scores[b.ability] !== undefined)
        scores[b.ability] = Math.min(b.limit, scores[b.ability]! + b.amount);
    return {
      level: at,
      classLevels: counts,
      abilities: scores,
      records: new Set(owned.map((i) => i.entry.ref.revisionId)),
      proficiencies: new Set(
        result.proficiencyGrants
          .filter((p) => p.instance.acquiredAt <= at)
          .map((p) => p.proficiencyId),
      ),
      choices: draft.choices,
      repetitions,
    };
  }
  const matchesAcquisition = (acquisition: string, node: CreationInstance) =>
    acquisition === 'ambas' || acquisition === node.acquisition;
  const atLevel = (node: CreationInstance, level: number) =>
    node.classEntryId
      ? (draft.levels.filter((l) => l.classEntryId === node.classEntryId)[Math.max(0, level - 1)]
          ?.totalLevel ?? node.acquiredAt)
      : node.acquiredAt;
  type Pending = {
    parent: CreationInstance;
    grant: GrantDefinition | null;
    ref: CompendiumRef;
    id: string;
    level: number;
    at: number;
  };
  const pending: Pending[] = [];
  const processed = new Set<string>();
  function process(node: CreationInstance) {
    if (processed.has(node.id)) return;
    processed.add(node.id);
    result.instances.push(node);
    if (node.entry.kind === 'classe')
      for (const p of node.entry.data.proficiencies.filter((p) =>
        matchesAcquisition(p.acquisition, node),
      ))
        result.proficiencyGrants.push({
          instance: node,
          proficiencyId: p.proficiencyId,
          degree: 'proficiente',
        });
    const skipTraits =
      node.id === 'species' &&
      find(draft.lineageRef)?.kind === 'linhagem' &&
      (find(draft.lineageRef) as CompendiumEntry<'linhagem'>).data.inheritTraits === false;
    if (skipTraits) return;
    for (const group of catalog.choices.filter(
      (g) =>
        g.ownerRevisionId === node.entry.ref.revisionId &&
        g.level <= node.level &&
        matchesAcquisition(g.acquisition, node),
    )) {
      if (!requirementMet(catalog, group.requirementId, context(atLevel(node, group.level))))
        continue;
      result.choices.push({ instance: node, group });
      const selected = draft.choices.filter(
        (c) => c.groupId === group.id && c.sourceInstanceId === node.id,
      );
      const values = selected[0]?.values ?? [];
      if (selected.length > 1 || values.length < group.minimum || values.length > group.maximum) {
        problem(
          'CHOICE_REQUIRED',
          `choices.${node.id}.${group.id}`,
          `Escolha de ${group.minimum} a ${group.maximum} opção(ões): ${group.name}.`,
          node.entry.ref.revisionId,
        );
        continue;
      }
      if (new Set(values.map((v) => JSON.stringify(v))).size !== values.length) {
        problem('INVALID_CHOICE', `choices.${group.id}`, 'Não repita uma opção no mesmo grupo.');
        continue;
      }
      let budget = 0;
      for (const value of values) {
        const option =
          value.type === 'option'
            ? group.options.find((o) => o.id === value.optionId)
            : value.type === 'ability'
              ? group.options.find((o) => o.ability === value.ability)
              : value.type === 'proficiency'
                ? group.options.find((o) => o.proficiencyId === value.proficiencyId)
                : value.type === 'record'
                  ? group.options.find((o) => o.targetRef?.revisionId === value.ref.revisionId)
                  : undefined;
        if (value.type === 'record' && !option && group.optionKind) {
          const e = find(value.ref);
          if (
            !e ||
            e.kind !== group.optionKind ||
            (group.featCategory && (e.kind !== 'talento' || e.data.category !== group.featCategory))
          ) {
            problem(
              'INVALID_CHOICE',
              `choices.${group.id}`,
              'O registro não pertence a este grupo.',
            );
            continue;
          }
        } else if (!option) {
          problem(
            'INVALID_CHOICE',
            `choices.${group.id}`,
            'A opção selecionada não pertence ao grupo.',
          );
          continue;
        }
        const ref = value.type === 'record' ? value.ref : option?.targetRef;
        if (ref)
          pending.push({
            parent: node,
            grant: null,
            ref,
            id: `${node.id}/choice:${group.id}:${option?.id ?? ref.recordId}`,
            level: 1,
            at: atLevel(node, group.level),
          });
        if (option?.proficiencyId)
          result.proficiencyGrants.push({
            instance: node,
            proficiencyId: option.proficiencyId,
            degree: 'proficiente',
          });
        if (option?.ability) {
          const amount = value.type === 'ability' ? value.amount : option.quantity;
          if (
            !Number.isInteger(amount) ||
            amount < 1 ||
            amount > (group.abilityPoints ?? option.quantity)
          )
            problem('INVALID_CHOICE', `choices.${group.id}`, 'Bônus de atributo inválido.');
          else {
            budget += amount;
            result.abilityBonuses.push({
              instance: { ...node, acquiredAt: atLevel(node, group.level) },
              ability: option.ability,
              amount,
              limit: group.abilityLimit ?? 20,
            });
          }
        }
      }
      if (group.abilityPoints !== null && budget !== group.abilityPoints)
        problem(
          'ABILITY_BUDGET',
          `choices.${group.id}`,
          `Distribua exatamente ${group.abilityPoints} ponto(s).`,
        );
    }
    for (const effect of catalog.effects.filter(
      (e) => e.ownerRevisionId === node.entry.ref.revisionId && e.level <= node.level,
    )) {
      if (!requirementMet(catalog, effect.requirementId, context(atLevel(node, effect.level))))
        continue;
      result.effects.push({ instance: node, effect });
      for (const b of effect.abilities)
        result.abilityBonuses.push({
          instance: { ...node, acquiredAt: atLevel(node, effect.level) },
          ability: b.ability,
          amount: b.increase,
          limit: b.limit,
        });
      for (const p of effect.proficiencies)
        result.proficiencyGrants.push({
          instance: node,
          proficiencyId: p.proficiencyId,
          degree: p.degree,
        });
    }
    for (const g of catalog.grants.filter(
      (g) =>
        g.ownerRevisionId === node.entry.ref.revisionId &&
        g.level <= node.level &&
        matchesAcquisition(g.acquisition, node),
    )) {
      if (!requirementMet(catalog, g.requirementId, context(atLevel(node, g.level)))) continue;
      if (g.targetRef)
        pending.push({
          parent: node,
          grant: g,
          ref: g.targetRef,
          id: `${node.id}/grant:${g.id}`,
          level: Math.max(1, node.level - g.level + 1),
          at: atLevel(node, g.level),
        });
      else if (!g.groupId)
        problem(
          'MISSING_REFERENCE',
          node.id,
          'Uma concessão obrigatória está sem referência.',
          node.entry.ref.revisionId,
        );
    }
    for (const option of catalog.equipmentOptions.filter(
      (o) =>
        o.ownerRevisionId === node.entry.ref.revisionId && matchesAcquisition(o.acquisition, node),
    )) {
      const selected = draft.equipmentOptions.filter(
        (o) => o.ownerRevisionId === option.ownerRevisionId,
      );
      if (selected.some((s) => s.optionId === option.id))
        pending.push({
          parent: node,
          grant: null,
          ref: option.packageRef,
          id: `${node.id}/equipment:${option.id}`,
          level: 1,
          at: node.acquiredAt,
        });
    }
    const equipmentOptions = catalog.equipmentOptions.filter(
      (o) =>
        o.ownerRevisionId === node.entry.ref.revisionId && matchesAcquisition(o.acquisition, node),
    );
    if (
      equipmentOptions.length &&
      draft.equipmentOptions.filter((s) =>
        equipmentOptions.some(
          (o) => o.id === s.optionId && o.ownerRevisionId === s.ownerRevisionId,
        ),
      ).length !== 1
    )
      problem(
        'EQUIPMENT_REQUIRED',
        `equipmentOptions.${node.entry.ref.revisionId}`,
        'Escolha um kit de equipamento ou moedas.',
        node.entry.ref.revisionId,
      );
  }
  roots.forEach(process);
  const errors = new Map<string, string>();
  for (let round = 0; round < 64 && pending.length; round++) {
    let progressed = false;
    for (let index = 0; index < pending.length;) {
      const p = pending[index],
        entry = find(p.ref);
      if (!entry) {
        errors.set(p.id, 'MISSING_REFERENCE');
        index++;
        continue;
      }
      if (
        p.parent.ancestors.includes(entry.ref.revisionId) ||
        p.parent.entry.ref.revisionId === entry.ref.revisionId ||
        result.instances.length > 1000
      ) {
        errors.set(p.id, 'CYCLIC_GRANT');
        index++;
        continue;
      }
      const ctx = context(p.at);
      if (entry.kind === 'talento') {
        if (!entry.data.requirementsComplete) {
          errors.set(p.id, 'INCOMPLETE_REQUIREMENTS');
          index++;
          continue;
        }
        if (
          !catalog.requirements
            .filter((r) => r.ownerRevisionId === entry.ref.revisionId && !r.parentId)
            .every((r) => requirementMet(catalog, r.id, ctx))
        ) {
          errors.set(p.id, 'REQUIREMENT_NOT_MET');
          index++;
          continue;
        }
        if (
          !entry.data.repeatable &&
          result.instances.some((i) => i.entry.ref.recordId === entry.ref.recordId)
        ) {
          errors.set(p.id, 'DUPLICATE_FEAT');
          index++;
          continue;
        }
      }
      pending.splice(index, 1);
      progressed = true;
      errors.delete(p.id);
      process({
        id: p.id,
        entry,
        level: p.level,
        acquiredAt: p.at,
        acquisition: p.parent.acquisition,
        classEntryId: p.parent.classEntryId,
        grantId: p.grant?.id ?? null,
        ancestors: [...p.parent.ancestors, p.parent.entry.ref.revisionId],
      });
    }
    if (!progressed) break;
  }
  for (const p of pending)
    problem(
      errors.get(p.id) ?? 'UNRESOLVED_GRANT',
      p.id,
      'A concessão depende de referência ou requisito ainda não resolvido.',
      p.ref.revisionId,
    );
  for (const node of result.instances) {
    result.contributions.push({
      id: instanceUuid(node.id),
      sourceRevisionId: node.entry.ref.revisionId,
      sourceInstanceId: node.id,
      grantId: node.grantId,
      target: node.entry.kind,
      name: node.entry.name,
      amount: null,
    });
  }
  return result;
}
