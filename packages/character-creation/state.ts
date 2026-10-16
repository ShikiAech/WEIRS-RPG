import type { CreationCatalog, CreationDraft } from '../contracts/character-creation';
import { resolveAbilities } from './abilities';
import { resolveConcessions } from './concessions';
export function resolveState(catalog: CreationCatalog, draft: CreationDraft) {
  const scores = resolveAbilities(catalog, draft),
    concessions = resolveConcessions(catalog, draft);
  const totals = { ...scores.totals };
  const problems = [...scores.problems, ...concessions.problems];
  for (const b of concessions.abilityBonuses)
    if (totals[b.ability] !== undefined) {
      const next = totals[b.ability]! + b.amount;
      if (next > b.limit)
        problems.push({
          code: 'ABILITY_LIMIT',
          field: `abilities.${b.ability}`,
          message: `O aumento de atributo não pode ultrapassar ${b.limit}.`,
          sourceRevisionId: b.instance.entry.ref.revisionId,
        });
      else totals[b.ability] = next;
    }
  const level = draft.classes.reduce((s, c) => s + c.level, 0),
    proficiency = 2 + Math.floor((Math.max(1, level) - 1) / 4);
  return { base: scores.base, totals, concessions, problems, level, proficiency };
}
export type CreationState = ReturnType<typeof resolveState>;
