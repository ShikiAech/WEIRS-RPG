import type {
  AbilityScores,
  CreationCatalog,
  CreationDraft,
} from '../contracts/character-creation';
export interface RequirementContext {
  level: number;
  classLevels: Map<string, number>;
  abilities: Partial<AbilityScores>;
  records: Set<string>;
  proficiencies: Set<string>;
  choices: CreationDraft['choices'];
  repetitions: Map<string, number>;
}
export function requirementMet(
  catalog: CreationCatalog,
  id: string | null,
  context: RequirementContext,
  seen = new Set<string>(),
): boolean {
  if (!id) return true;
  if (seen.has(id) || seen.size > 100) return false;
  const r = catalog.requirements.find((r) => r.id === id);
  if (!r) return false;
  const next = new Set(seen).add(id),
    children = catalog.requirements.filter((c) => c.parentId === id);
  const target = r.targetRef?.revisionId ?? '';
  switch (r.operator) {
    case 'todos':
      return children.every((c) => requirementMet(catalog, c.id, context, next));
    case 'qualquer':
      return (
        children.length > 0 && children.some((c) => requirementMet(catalog, c.id, context, next))
      );
    case 'nivel':
      return context.level >= (r.minimum ?? Infinity);
    case 'nivel-classe':
      return (context.classLevels.get(target) ?? 0) >= (r.minimum ?? Infinity);
    case 'atributo':
      return !!r.ability && (context.abilities[r.ability] ?? 0) >= (r.minimum ?? Infinity);
    case 'proficiencia':
      return !!r.proficiencyId && context.proficiencies.has(r.proficiencyId);
    case 'especie':
    case 'linhagem':
    case 'caracteristica':
    case 'talento':
      return context.records.has(target);
    case 'repeticoes':
      return (context.repetitions.get(target) ?? 0) >= (r.minimum ?? Infinity);
    case 'escolha':
      return context.choices.some((c) => c.groupId === r.choiceKey && c.values.length > 0);
    default:
      return false;
  }
}
