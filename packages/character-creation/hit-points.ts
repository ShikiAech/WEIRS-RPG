import type {
  CreationCatalog,
  CreationDraft,
  HitPointBreakdown,
} from '../contracts/character-creation';
import { resolveState, type CreationState } from './state';
import { modifier } from './abilities';
import { evaluateFormula } from './formula';
export function resolveHitPoints(
  catalog: CreationCatalog,
  draft: CreationDraft,
  state: CreationState = resolveState(catalog, draft),
): HitPointBreakdown {
  const result: HitPointBreakdown = { total: 0, levels: [], hitDice: [], problems: [] };
  const bad = (message: string) =>
    result.problems.push({ code: 'HIT_POINTS', field: 'levels', message });
  const con = modifier(state.totals.con ?? 10),
    counts = new Map<string, number>();
  if (draft.levels.length !== state.level)
    bad('Registre um resultado de vida para cada nível total.');
  for (const [index, level] of draft.levels.entries()) {
    const cls = draft.classes.find((c) => c.id === level.classEntryId),
      entry = catalog.entries.find((e) => e.ref.revisionId === cls?.classRef.revisionId);
    if (level.totalLevel !== index + 1 || !cls || entry?.kind !== 'classe') {
      bad('A ordem dos níveis ou a classe está inválida.');
      continue;
    }
    counts.set(cls.id, (counts.get(cls.id) ?? 0) + 1);
    const die = entry.data.hitDie;
    let roll =
      index === 0
        ? die
        : level.hitPointMethod === 'fixed'
          ? entry.data.fixedHitPoints
          : level.hitPointRoll;
    if (
      !['fixed', 'roll', 'external'].includes(level.hitPointMethod) ||
      roll === null ||
      !Number.isInteger(roll) ||
      roll < 1 ||
      roll > die ||
      (index === 0 && level.hitPointRoll !== null && level.hitPointRoll !== die)
    ) {
      bad(`O resultado de PV do nível ${index + 1} deve estar entre 1 e ${die}.`);
      roll = 0;
    }
    let bonus = 0;
    for (const { effect, instance } of state.concessions.effects.filter(
      (e) => e.effect.type === 'pv_por_nivel',
    ))
      bonus += evaluateFormula(effect.formula, {
        abilities: state.totals,
        level: state.level,
        classLevel: instance.level,
        proficiency: state.proficiency,
      });
    const gain = Math.max(1, roll! + con + bonus);
    result.levels.push({
      totalLevel: index + 1,
      classEntryId: cls.id,
      die,
      roll: roll!,
      constitution: con,
      bonus,
      gain,
    });
    result.total += gain;
    const dice = result.hitDice.find((d) => d.die === die);
    if (dice) dice.quantity++;
    else result.hitDice.push({ die, quantity: 1 });
  }
  for (const cls of draft.classes)
    if (counts.get(cls.id) !== cls.level)
      bad('A quantidade de níveis não corresponde à progressão das classes.');
  for (const { effect, instance } of state.concessions.effects.filter(
    (e) => e.effect.type === 'pv_bonus',
  ))
    result.total += evaluateFormula(effect.formula, {
      abilities: state.totals,
      level: state.level,
      classLevel: instance.level,
      proficiency: state.proficiency,
    });
  result.total = Math.max(1, result.total);
  return result;
}
