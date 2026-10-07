import type { RollResult } from '../../../../packages/contracts/chat';

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
export type VisualDie = { type: DieType; value: number; kept: boolean };
export type DicePlan = {
  dice: VisualDie[];
  groups: string[];
  omitted: number;
  unsupported: number;
};

// Limite visual: o chat continua mostrando TODOS os dados e modificadores.
export function dicePlan(result: RollResult, limit = 20): DicePlan {
  const plan: DicePlan = { dice: [], groups: [], omitted: 0, unsupported: 0 };
  for (const term of result.termos || []) {
    if (!term.faces || !term.dados?.length) continue;
    const supported = [4, 6, 8, 10, 12, 20, 100].includes(term.faces);
    plan.groups.push(
      `d${term.faces}: ` +
        term.dados
          .map(
            (value, i) =>
              String(value) + (term.selecionados?.includes(i + 1) === false ? ' (descartado)' : ''),
          )
          .join(', '),
    );
    for (const [index, value] of term.dados.entries()) {
      if (!Number.isInteger(value) || value < 1 || value > term.faces) continue;
      if (!supported) {
        plan.unsupported++;
        continue;
      }
      const kept = term.selecionados?.includes(index + 1) ?? true;
      const pair: VisualDie[] =
        term.faces === 100
          ? [
              { type: 'd100', value: value === 100 ? 0 : Math.floor(value / 10) * 10, kept },
              { type: 'd10', value: value % 10 || 10, kept },
            ]
          : [{ type: `d${term.faces}` as DieType, value, kept }];
      if (plan.dice.length + pair.length > limit) plan.omitted++;
      else plan.dice.push(...pair);
    }
  }
  return plan;
}
