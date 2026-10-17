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
import { resolveAbilities, orderedAbilityBonuses } from './abilities';
import { requirementMet, proficiencyKey, type RequirementContext } from './requirements';
import { orderedCatalog } from './order';

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
  selectionLabel?: string;
}
export interface ActiveChoice {
  instance: CreationInstance;
  group: ChoiceGroupDefinition;
  unavailableOptions?: Record<string, string>;
}
export interface ActiveEffect {
  instance: CreationInstance;
  effect: EffectDefinition;
}
export interface ResolvedConcessions {
  masteries: { instance: CreationInstance; ref: CompendiumRef; id: string }[];
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
export function eligibleFeatureSpells(
  catalog: CreationCatalog,
  draft: CreationDraft,
  entry: CompendiumEntry,
  instances: CreationInstance[] = [],
): CompendiumRef[] {
  if (entry.kind !== 'caracteristica' || !entry.data.spellPrerequisite) return [];
  const prerequisite = entry.data.spellPrerequisite;
  const classes = draft.classes.filter(
    (c) => c.classRef.revisionId === prerequisite.classRef.revisionId,
  );
  const profileIds = classes.flatMap((c) =>
    catalog.castingProfiles
      .filter((p) => p.ownerRevisionId === c.classRef.revisionId)
      .map((p) => `class:${c.id}/casting:${p.id}`),
  );
  const classInstances = instances.filter((i) => classes.some((c) => c.id === i.classEntryId));
  const granted = new Set(
    classInstances.flatMap((i) => [
      ...(i.entry.kind === 'magia' ? [i.entry.ref.revisionId] : []),
      ...catalog.castingProfiles
        .filter((p) => p.ownerRevisionId === i.entry.ref.revisionId && p.firstLevel <= i.level)
        .flatMap((p) =>
          p.spells.filter((s) => s.level <= i.level).map((s) => s.spellRef.revisionId),
        ),
    ]),
  );
  const direct = draft.spellSelections
    .filter((s) => profileIds.includes(s.profileId))
    .map((s) => s.spellRef.revisionId);
  return catalog.entries
    .filter((e) => direct.includes(e.ref.revisionId) || granted.has(e.ref.revisionId))
    .filter((spell) => {
      if (
        spell?.kind !== 'magia' ||
        spell.data.circle !== prerequisite.circle ||
        (!granted.has(spell.ref.revisionId) &&
          !spell.data.classRefs.some((r) => r.revisionId === prerequisite.classRef.revisionId))
      )
        return false;
      if (
        prerequisite.minimumRangeFeet &&
        (spell.data.rangeFeet ?? 0) < prerequisite.minimumRangeFeet
      )
        return false;
      if (
        prerequisite.dealsDamage &&
        !spell.data.damages.length &&
        !/(?:\d+d\d+[\s\S]{0,100}(?:dano|damage)|(?:dano|damage)[\s\S]{0,100}\d+d\d+)/i.test(
          spell.description,
        )
      )
        return false;
      if (
        prerequisite.requiresAttackRoll &&
        !/(?:ataque[\s\S]{0,60}(?:magia|m[aá]gic)|(?:magia|m[aá]gic)[\s\S]{0,60}ataque|spell attack)/i.test(
          spell.description,
        )
      )
        return false;
      return true;
    })
    .map((spell) => spell.ref);
}
export function featureSpellPrerequisiteMet(
  catalog: CreationCatalog,
  draft: CreationDraft,
  entry: CompendiumEntry,
  instances: CreationInstance[] = [],
): boolean {
  return (
    entry.kind !== 'caracteristica' ||
    !entry.data.spellPrerequisite ||
    eligibleFeatureSpells(catalog, draft, entry, instances).length > 0
  );
}
export function resolveConcessions(
  catalog: CreationCatalog,
  draft: CreationDraft,
): ResolvedConcessions {
  catalog = orderedCatalog(catalog);
  const result: ResolvedConcessions = {
    masteries: [],
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
  root(draft.speciesRef, 'species', 'especie', Math.max(1, totalLevel));
  root(draft.backgroundRef, 'background', 'antecedente', Math.max(1, totalLevel));
  if (draft.lineageRef) {
    root(draft.lineageRef, 'lineage', 'linhagem', Math.max(1, totalLevel));
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
      ((classEntry?.kind === 'classe' &&
        classEntry.data.subclassLevel !== undefined &&
        cls.level >= classEntry.data.subclassLevel) ||
        catalog.entries.some(
          (e) =>
            e.kind === 'subclasse' &&
            e.data.classRef.revisionId === classEntry?.ref.revisionId &&
            cls.level >= e.data.acquisitionLevel,
        ))
    )
      problem('SUBCLASS_REQUIRED', `classes.${cls.id}.subclassRef`, 'Escolha a subclasse.');
  }
  const base = resolveAbilities(catalog, draft).totals;
  function context(at: number, excludedPrefix?: string): RequirementContext {
    const included = (instance: CreationInstance) =>
      !excludedPrefix || !instance.id.startsWith(excludedPrefix);
    const counts = new Map<string, number>();
    for (const level of draft.levels.filter((l) => l.totalLevel <= at)) {
      const cls = draft.classes.find((c) => c.id === level.classEntryId);
      if (cls) counts.set(cls.classRef.revisionId, (counts.get(cls.classRef.revisionId) ?? 0) + 1);
    }
    const owned = result.instances.filter((i) => i.acquiredAt <= at && included(i));
    const repetitions = new Map<string, number>();
    for (const i of owned)
      repetitions.set(i.entry.ref.revisionId, (repetitions.get(i.entry.ref.revisionId) ?? 0) + 1);
    const scores = { ...base };
    for (const b of orderedAbilityBonuses(result.abilityBonuses).filter(
      (b) => b.instance.acquiredAt < at && included(b.instance),
    ))
      if (scores[b.ability] !== undefined)
        scores[b.ability] = Math.min(b.limit, scores[b.ability]! + b.amount);
    return {
      level: at,
      classLevels: counts,
      abilities: scores,
      records: new Set(owned.map((i) => i.entry.ref.revisionId)),
      proficiencies: new Set(
        result.proficiencyGrants
          .filter((p) => p.instance.acquiredAt <= at && included(p.instance))
          .flatMap((p) => [p.proficiencyId, proficiencyKey(catalog, p.proficiencyId)]),
      ),
      choices: draft.choices,
      repetitions,
    };
  }
  const matchesAcquisition = (acquisition: string, node: CreationInstance) =>
    acquisition === 'ambas' || acquisition === node.acquisition;
  const atLevel = (node: CreationInstance, level: number) =>
    node.classEntryId
      ? Math.max(
          node.acquiredAt,
          draft.levels.filter((l) => l.classEntryId === node.classEntryId)[Math.max(0, level - 1)]
            ?.totalLevel ?? node.acquiredAt,
        )
      : Math.max(node.acquiredAt, level);
  type Pending = {
    parent: CreationInstance;
    grant: GrantDefinition | null;
    ref: CompendiumRef;
    id: string;
    level: number;
    at: number;
    label?: string;
  };
  const pending: Pending[] = [];
  const proficiencyChoices: {
    grant: ResolvedConcessions['proficiencyGrants'][number];
    type: string;
    field: string;
  }[] = [];
  const spellChoices: { ref: CompendiumRef; field: string; instance: CreationInstance }[] = [];
  const spellTargets: { ref: CompendiumRef; field: string; instance: CreationInstance }[] = [];
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
      let selected = draft.choices.filter(
        (c) => c.groupId === group.id && c.sourceInstanceId === node.id,
      );
      const ancestorChoice = result.choices
        .filter((c) => c.group.key === group.key && node.id.startsWith(c.instance.id + '/'))
        .reverse()
        .map((c) => ({
          group: c.group,
          choice: draft.choices.find(
            (s) => s.groupId === c.group.id && s.sourceInstanceId === c.instance.id,
          ),
        }))
        .find(
          (c) =>
            c.choice?.values.length ||
            (c.group.minimum >= group.minimum &&
              c.group.maximum <= group.maximum &&
              c.group.options.length > 0 &&
              c.group.options.every(
                (parentOption) =>
                  parentOption.targetRef &&
                  group.options.some(
                    (option) => option.targetRef?.revisionId === parentOption.targetRef!.revisionId,
                  ),
              )),
        );
      // The origin owns this decision even before a value has been selected.
      if (ancestorChoice && !ancestorChoice.choice?.values.length) continue;
      const inheritedValues = ancestorChoice?.choice?.values.flatMap((v) => {
        const old =
          v.type === 'option'
            ? ancestorChoice.group.options.find((o) => o.id === v.optionId)
            : null;
        const oldRef =
          old?.targetRef ??
          (old?.proficiencyId
            ? catalog.proficiencies.find((p) => p.id === old.proficiencyId)?.equipment
            : null);
        const option = oldRef
          ? group.options.find((o) => o.targetRef?.revisionId === oldRef.revisionId)
          : null;
        return option ? [{ type: 'option' as const, optionId: option.id }] : [];
      });
      if (
        inheritedValues &&
        inheritedValues.length >= group.minimum &&
        inheritedValues.length <= group.maximum
      ) {
        selected = [
          {
            groupId: group.id,
            sourceInstanceId: node.id,
            values: inheritedValues,
          },
        ];
      } else result.choices.push({ instance: node, group });
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
        if (ref && option?.type === 'maestria-arma') {
          if (
            result.masteries.some(
              (m) => m.instance.id === node.id && m.ref.recordId === ref.recordId,
            )
          )
            problem(
              'DUPLICATE_MASTERY',
              `choices.${group.id}`,
              'Escolha uma arma diferente para cada maestria da classe.',
            );
          else
            result.masteries.push({
              instance: node,
              ref,
              id: `${node.id}/mastery:${group.id}:${option.id}`,
            });
        }
        if (
          ref &&
          ![
            'lista-magia',
            'maestria-arma',
            'proficiencia',
            'proficiencia-nova',
            'especializacao',
            'magia-alvo',
          ].includes(option?.type ?? '')
        )
          pending.push({
            parent: node,
            grant: null,
            ref,
            id: `${node.id}/choice:${group.id}:${option?.id ?? ref.recordId}`,
            level: 1,
            at: atLevel(node, group.level),
            label: option?.name,
          });
        if (ref && option?.type === 'magia' && option.value === 'nao-preparada')
          spellChoices.push({ ref, field: `choices.${group.id}`, instance: node });
        if (ref && option?.type === 'magia-alvo')
          spellTargets.push({ ref, field: `choices.${group.id}`, instance: node });
        const activeForm =
          node.entry.kind !== 'caracteristica' ||
          !node.entry.data.formEffects?.form ||
          node.entry.data.formEffects.form === draft.form;
        if (option?.proficiencyId && activeForm) {
          const selectedGrant: ResolvedConcessions['proficiencyGrants'][number] = {
            instance: { ...node, acquiredAt: atLevel(node, group.level) },
            proficiencyId: option.proficiencyId,
            degree: option.type === 'especializacao' ? 'especializacao' : 'proficiente',
          };
          result.proficiencyGrants.push(selectedGrant);
          proficiencyChoices.push({
            grant: selectedGrant,
            type: option.type,
            field: `choices.${group.id}`,
          });
        }
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
      if (
        node.entry.kind === 'caracteristica' &&
        node.entry.data.formEffects?.form &&
        node.entry.data.formEffects.form !== draft.form
      )
        continue;
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
    pending.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
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
      const requirementContext =
        entry.kind === 'caracteristica' && entry.data.optional ? context(totalLevel) : ctx;
      if (
        !catalog.requirements
          .filter((r) => r.ownerRevisionId === entry.ref.revisionId && !r.parentId)
          .every((r) => requirementMet(catalog, r.id, requirementContext))
      ) {
        errors.set(p.id, 'REQUIREMENT_NOT_MET');
        index++;
        continue;
      }
      if (!featureSpellPrerequisiteMet(catalog, draft, entry, result.instances)) {
        errors.set(p.id, 'SPELL_PREREQUISITE');
        index++;
        continue;
      }
      if (
        entry.kind === 'caracteristica' &&
        entry.data.optional &&
        !/repet[ií]vel|repeatable/i.test(entry.description) &&
        result.instances.some((i) => i.entry.ref.recordId === entry.ref.recordId)
      ) {
        errors.set(p.id, 'DUPLICATE_FEATURE');
        index++;
        continue;
      }
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
        selectionLabel: p.label ?? p.parent.selectionLabel,
      });
    }
    if (!progressed) break;
  }
  for (const p of pending)
    problem(
      errors.get(p.id) ?? 'UNRESOLVED_GRANT',
      p.id,
      ['DUPLICATE_FEATURE', 'DUPLICATE_FEAT'].includes(errors.get(p.id) ?? '')
        ? 'Esta opção já foi escolhida. Escolha outra característica ou talento.'
        : 'A concessão depende de referência ou requisito ainda não resolvido.',
      p.ref.revisionId,
    );
  for (const choice of proficiencyChoices) {
    const key = proficiencyKey(catalog, choice.grant.proficiencyId);
    const others = result.proficiencyGrants.filter(
      (p) =>
        p !== choice.grant &&
        p.instance.acquiredAt <= choice.grant.instance.acquiredAt &&
        proficiencyKey(catalog, p.proficiencyId) === key,
    );
    if (choice.type === 'especializacao') {
      if (!others.some((p) => p.degree === 'proficiente'))
        problem(
          'EXPERTISE_REQUIRES_PROFICIENCY',
          choice.field,
          'Escolha uma perícia em que já tenha proficiência.',
        );
      if (others.some((p) => p.degree === 'especializacao'))
        problem(
          'DUPLICATE_EXPERTISE',
          choice.field,
          'Escolha uma perícia que ainda não tenha especialização.',
        );
    }
    if (choice.type === 'proficiencia-nova' && others.some((p) => p.degree !== 'especializacao'))
      problem(
        'NEW_PROFICIENCY_REQUIRED',
        choice.field,
        'Escolha uma perícia em que ainda não tenha proficiência.',
      );
  }
  const spellAlreadyPrepared = (ref: CompendiumRef, originId: string) =>
    draft.spellSelections.some((s) => s.prepared && s.spellRef.recordId === ref.recordId) ||
    result.instances.some(
      (i) =>
        i.id !== originId &&
        catalog.castingProfiles.some(
          (p) =>
            p.ownerRevisionId === i.entry.ref.revisionId &&
            p.spells.some(
              (s) => s.level <= i.level && s.alwaysPrepared && s.spellRef.recordId === ref.recordId,
            ),
        ),
    );
  for (const choice of spellChoices) {
    if (spellAlreadyPrepared(choice.ref, choice.instance.id))
      problem(
        'SPELL_ALREADY_PREPARED',
        choice.field,
        'Escolha uma magia que ainda não esteja preparada por outra origem.',
      );
  }
  for (const choice of spellTargets) {
    if (
      !eligibleFeatureSpells(catalog, draft, choice.instance.entry, result.instances).some(
        (r) => r.revisionId === choice.ref.revisionId && r.recordId === choice.ref.recordId,
      )
    )
      problem(
        'INVALID_SPELL_TARGET',
        choice.field,
        'Escolha um truque conhecido desta classe que atenda aos requisitos da invocação.',
      );
    if (
      spellTargets.some(
        (other) =>
          other !== choice &&
          other.instance.entry.ref.recordId === choice.instance.entry.ref.recordId &&
          other.instance.classEntryId === choice.instance.classEntryId &&
          other.ref.recordId === choice.ref.recordId,
      )
    )
      problem(
        'DUPLICATE_SPELL_TARGET',
        choice.field,
        'Ao repetir esta invocação, escolha um truque diferente.',
      );
  }
  for (const active of result.choices) {
    const unavailable: Record<string, string> = {};
    if (active.group.options.some((o) => o.type === 'magia-alvo')) {
      const eligible = eligibleFeatureSpells(
        catalog,
        draft,
        active.instance.entry,
        result.instances,
      );
      const selected = draft.choices.find(
        (c) => c.groupId === active.group.id && c.sourceInstanceId === active.instance.id,
      );
      active.group = {
        ...active.group,
        options: active.group.options.filter(
          (o) =>
            eligible.some((r) => r.revisionId === o.targetRef?.revisionId) ||
            selected?.values.some((v) => v.type === 'option' && v.optionId === o.id),
        ),
      };
      for (const o of active.group.options) {
        if (!eligible.some((r) => r.revisionId === o.targetRef?.revisionId))
          unavailable[o.id] = 'Este truque não atende aos requisitos da invocação.';
        else if (
          spellTargets.some(
            (c) =>
              c.instance.id !== active.instance.id &&
              c.instance.entry.ref.recordId === active.instance.entry.ref.recordId &&
              c.instance.classEntryId === active.instance.classEntryId &&
              c.ref.recordId === o.targetRef?.recordId,
          )
        )
          unavailable[o.id] = 'Outra escolha desta invocação já afeta este truque.';
      }
    }
    for (const option of active.group.options) {
      const target = option.targetRef ? find(option.targetRef) : null;
      // Replacing a radio removes its old choice; prerequisites must use that candidate state.
      // For multi-select groups, only this occurrence is excluded from duplicate checks.
      const excludedPrefix = `${active.instance.id}/choice:${active.group.id}:${active.group.maximum === 1 ? '' : option.id}`;
      const ctx = context(atLevel(active.instance, active.group.level), excludedPrefix);
      const current = context(totalLevel, excludedPrefix);
      const availableInstances = result.instances.filter((i) => !i.id.startsWith(excludedPrefix));
      if (
        option.type === 'magia' &&
        option.value === 'nao-preparada' &&
        option.targetRef &&
        spellAlreadyPrepared(option.targetRef, active.instance.id)
      )
        unavailable[option.id] = 'Esta magia já está preparada por outra origem.';
      const targetContext =
        target?.kind === 'caracteristica' && target.data.optional ? current : ctx;
      if (
        target &&
        (!catalog.requirements
          .filter((r) => r.ownerRevisionId === target.ref.revisionId && !r.parentId)
          .every((r) => requirementMet(catalog, r.id, targetContext)) ||
          !featureSpellPrerequisiteMet(catalog, draft, target, availableInstances))
      )
        unavailable[option.id] = 'Requisitos ainda não atendidos.';
      if (
        target?.kind === 'caracteristica' &&
        target.data.spellPrerequisite &&
        !featureSpellPrerequisiteMet(catalog, draft, target, availableInstances)
      )
        unavailable[option.id] =
          'Conheça um truque compatível pela classe ou pelo Livro das Sombras.';
      if (
        target &&
        ((target.kind === 'caracteristica' &&
          target.data.optional &&
          !/repet[ií]vel|repeatable/i.test(target.description)) ||
          (target.kind === 'talento' && !target.data.repeatable)) &&
        availableInstances.some((i) => i.entry.ref.recordId === target.ref.recordId)
      )
        unavailable[option.id] = 'Esta opção já foi escolhida em outra aquisição.';
      if (option.proficiencyId && ['especializacao', 'proficiencia-nova'].includes(option.type)) {
        const selected = proficiencyChoices
          .filter((c) => c.field === `choices.${active.group.id}`)
          .map((c) => c.grant);
        const same = result.proficiencyGrants.filter(
          (p) =>
            !selected.includes(p) &&
            p.instance.acquiredAt <= atLevel(active.instance, active.group.level) &&
            proficiencyKey(catalog, p.proficiencyId) ===
              proficiencyKey(catalog, option.proficiencyId!),
        );
        if (
          option.type === 'especializacao' &&
          (!same.some((p) => p.degree === 'proficiente') ||
            same.some((p) => p.degree === 'especializacao'))
        )
          unavailable[option.id] = 'Exige proficiência e não pode repetir especialização.';
        if (option.type === 'proficiencia-nova' && same.some((p) => p.degree !== 'especializacao'))
          unavailable[option.id] = 'Você já tem esta proficiência.';
      }
    }
    active.unavailableOptions = unavailable;
  }
  for (const node of result.instances) {
    result.contributions.push({
      id: instanceUuid(node.id),
      sourceRevisionId: node.entry.ref.revisionId,
      sourceRecordId: node.entry.ref.recordId,
      sourceInstanceId: node.id,
      grantId: node.grantId,
      target: node.entry.kind,
      name: node.entry.name,
      amount: null,
    });
  }
  for (const mastery of result.masteries) {
    const e = find(mastery.ref);
    if (e)
      result.contributions.push({
        id: instanceUuid(mastery.id),
        sourceRevisionId: e.ref.revisionId,
        sourceRecordId: e.ref.recordId,
        sourceInstanceId: mastery.id,
        grantId: null,
        target: 'maestria-arma',
        name: `Maestria: ${e.name}`,
        amount: null,
      });
  }
  return result;
}
