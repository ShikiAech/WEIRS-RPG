import type {
  AbilityScores,
  CreationCatalog,
  CreationDraft,
  CreationProblem,
} from '../contracts/character-creation';
import type { Ability } from '../contracts/sheets';
export const abilities: Ability[] = ['for', 'des', 'con', 'int', 'sab', 'car'];
export const modifier = (score: number) => Math.floor((score - 10) / 2);
export function resolveAbilities(catalog: CreationCatalog, draft: CreationDraft) {
  const base: Partial<AbilityScores> = {},
    totals: Partial<AbilityScores> = {},
    problems: CreationProblem[] = [];
  const problem = (code: string, field: string, message: string) =>
    problems.push({ code, field, message });
  const a = draft.abilities;
  if (a.mode === 'rolls') {
    if (
      a.sets.length !== 2 ||
      a.sets.some(
        (set) => set.length !== 6 || set.some((n) => !Number.isInteger(n) || n < 3 || n > 18),
      )
    )
      problem(
        'INVALID_SETS',
        'abilities.sets',
        'Gere os dois conjuntos de seis resultados de 4d6.',
      );
    if (a.selectedSet !== 0 && a.selectedSet !== 1)
      problem('SET_REQUIRED', 'abilities.selectedSet', 'Escolha um dos dois conjuntos.');
    const used = new Set<number>();
    for (const ability of abilities) {
      const index = a.assignment[ability];
      if (index === undefined || !Number.isInteger(index) || index < 0 || index > 5)
        problem(
          'ASSIGNMENT_REQUIRED',
          `abilities.${ability}`,
          'Distribua um resultado para cada atributo.',
        );
      else if (used.has(index))
        problem(
          'DUPLICATE_ROLL',
          `abilities.${ability}`,
          'Um resultado só pode ser usado em um atributo.',
        );
      else {
        used.add(index);
        const value = a.selectedSet === null ? undefined : a.sets[a.selectedSet]?.[index];
        if (value !== undefined) base[ability] = value;
      }
    }
  } else if (a.mode === 'external') {
    for (const ability of abilities) {
      const value = a.external[ability];
      if (value === undefined || !Number.isInteger(value) || value < 1 || value > 30)
        problem(
          'ABILITY_REQUIRED',
          `abilities.${ability}`,
          'Preencha um valor inteiro entre 1 e 30.',
        );
      else base[ability] = value;
    }
  } else problem('INVALID_MODE', 'abilities.mode', 'Escolha um método de atributos.');
  const bg = catalog.entries.find(
    (e) => e.ref.revisionId === draft.backgroundRef?.revisionId && e.kind === 'antecedente',
  );
  const values = Object.values(a.backgroundBonuses)
    .filter((v) => v !== 0)
    .sort();
  if (bg?.kind === 'antecedente') {
    const validPattern =
      bg.data.distribution === 'nenhuma'
        ? values.length === 0
        : bg.data.distribution === 'personalizada'
          ? values.every((v) => Number.isInteger(v) && v! >= 0 && v! <= 2) &&
            values.reduce((s, n) => s + n!, 0) === 3
          : JSON.stringify(values) === '[1,2]' || JSON.stringify(values) === '[1,1,1]';
    if (
      !validPattern ||
      Object.entries(a.backgroundBonuses).some(
        ([k, v]) => !bg.data.abilities.includes(k as Ability) && v !== 0,
      )
    )
      problem(
        'BACKGROUND_BONUS',
        'abilities.backgroundBonuses',
        'Distribua +2 e +1, ou três bônus de +1, entre os atributos permitidos pelo antecedente.',
      );
  } else if (values.length)
    problem(
      'BACKGROUND_REQUIRED',
      'backgroundRef',
      'Escolha o antecedente antes de distribuir seus bônus.',
    );
  for (const ability of abilities) {
    const value = base[ability];
    if (value === undefined) continue;
    const bonus = a.backgroundBonuses[ability] ?? 0;
    totals[ability] = value + (Number.isInteger(bonus) ? bonus : 0);
    if (bg?.kind === 'antecedente' && bonus > 0 && totals[ability]! > bg.data.abilityLimit)
      problem(
        'ABILITY_LIMIT',
        `abilities.${ability}`,
        `O bônus do antecedente não pode ultrapassar ${bg.data.abilityLimit}.`,
      );
  }
  return { base, totals, problems };
}
