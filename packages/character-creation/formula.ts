import type { NumericFormula } from '../contracts/compendium';
import type { AbilityScores } from '../contracts/character-creation';
import { modifier } from './abilities';
export interface FormulaContext {
  abilities: Partial<AbilityScores>;
  level: number;
  classLevel: number;
  proficiency: number;
}
export function evaluateFormula(
  formula: NumericFormula | null,
  c: FormulaContext,
  depth = 0,
): number {
  if (!formula || depth > 16) return 0;
  if (formula.op === 'constant') return formula.value;
  if (formula.op === 'ability_score') return c.abilities[formula.ability] ?? 0;
  if (formula.op === 'ability_modifier') return modifier(c.abilities[formula.ability] ?? 10);
  if (formula.op === 'level') return c.level;
  if (formula.op === 'class_level') return c.classLevel;
  if (formula.op === 'proficiency') return c.proficiency;
  if (!('args' in formula)) return 0;
  const args = formula.args.map((f) => evaluateFormula(f, c, depth + 1));
  let result = 0;
  switch (formula.op) {
    case 'add':
      result = args.reduce((s, n) => s + n, 0);
      break;
    case 'subtract':
      result = args.slice(1).reduce((s, n) => s - n, args[0] ?? 0);
      break;
    case 'multiply':
      result = args.reduce((s, n) => s * n, 1);
      break;
    case 'floor':
      result = Math.floor(args[0] ?? 0);
      break;
    case 'ceil':
      result = Math.ceil(args[0] ?? 0);
      break;
    case 'minimum':
      result = Math.min(...args);
      break;
    case 'maximum':
      result = Math.max(...args);
      break;
  }
  if (!Number.isFinite(result) || Math.abs(result) > 1000000)
    throw new Error('Fórmula fora dos limites.');
  return result;
}
