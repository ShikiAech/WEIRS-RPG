import type {
  CreationCatalog,
  CreationDraft,
} from '../../../../packages/contracts/character-creation';
import type { ChoiceOptionDefinition } from '../../../../packages/contracts/compendium';
import type { ActiveChoice } from '../../../../packages/character-creation/concessions';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import {
  orderedAbilityBonuses,
  resolveAbilities,
} from '../../../../packages/character-creation/abilities';

export function optionSelected(
  value: CreationDraft['choices'][number]['values'][number],
  option: ChoiceOptionDefinition,
) {
  return value.type === 'option'
    ? value.optionId === option.id
    : value.type === 'record'
      ? value.ref.revisionId === option.targetRef?.revisionId
      : value.type === 'proficiency'
        ? value.proficiencyId === option.proficiencyId
        : false;
}

export function scoresBeforeAbilityChoice(
  catalog: CreationCatalog,
  draft: CreationDraft,
  { instance, group }: ActiveChoice,
) {
  const withoutChoice = {
    ...draft,
    choices: draft.choices.filter(
      (choice) => choice.sourceInstanceId !== instance.id || choice.groupId !== group.id,
    ),
  };
  const scores = { ...resolveAbilities(catalog, withoutChoice).totals };
  const acquiredAt = instance.classEntryId
    ? Math.max(
        instance.acquiredAt,
        draft.levels.filter((level) => level.classEntryId === instance.classEntryId)[
          Math.max(0, group.level - 1)
        ]?.totalLevel ?? instance.acquiredAt,
      )
    : Math.max(instance.acquiredAt, group.level);
  for (const bonus of orderedAbilityBonuses(
    resolveConcessions(catalog, withoutChoice).abilityBonuses,
  )) {
    if (
      bonus.instance.acquiredAt > acquiredAt ||
      (bonus.instance.acquiredAt === acquiredAt && bonus.limit > (group.abilityLimit ?? 20))
    )
      continue;
    const score = scores[bonus.ability];
    if (score !== undefined && score + bonus.amount <= bonus.limit)
      scores[bonus.ability] = score + bonus.amount;
  }
  return scores;
}
