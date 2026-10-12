import type { ChatCommand, RollMode, SheetAction } from '../../../../packages/contracts/chat';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';
import { calcularFicha } from '../../../../packages/sheets/calculos.js';
import { temDanoMagia } from '../../../../packages/sheets/magias.js';
export type FavoriteReference = { acao: SheetAction; entrada_id: string };
export type ActionOption = FavoriteReference & {
  label: string;
  normal: boolean;
  unavailable: boolean;
};
export const FAVORITE_LIMIT = 12;
const actions = new Set<SheetAction>([
  'ataque',
  'dano',
  'magia',
  'magia_ataque',
  'atributo',
  'resistencia',
  'pericia',
  'iniciativa',
  'morte',
  'magia_dano',
  'dado_vida',
]);
export const sameFavorite = (a: FavoriteReference, b: FavoriteReference) =>
  a.acao === b.acao && a.entrada_id === b.entrada_id;
export const favoriteKey = (user: string, campaign: string, sheet: string) =>
  'weirs:action-favorites:' + JSON.stringify([user, campaign, sheet]);
export function parseFavorites(raw: string | null): FavoriteReference[] {
  if (!raw || raw.length > 32768) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const list: FavoriteReference[] = [];
    for (const entry of value) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !actions.has(entry.acao) ||
        typeof entry.entrada_id !== 'string' ||
        !entry.entrada_id ||
        entry.entrada_id.length > 120
      )
        continue;
      const reference = { acao: entry.acao as SheetAction, entrada_id: entry.entrada_id };
      if (!list.some((r) => sameFavorite(r, reference))) list.push(reference);
      if (list.length >= FAVORITE_LIMIT) break;
    }
    return list;
  } catch {
    return [];
  }
}
export function toggleFavorite(
  list: FavoriteReference[],
  reference: FavoriteReference,
): FavoriteReference[] {
  if (list.some((r) => sameFavorite(r, reference)))
    return list.filter((r) => !sameFavorite(r, reference));
  return list.length >= FAVORITE_LIMIT
    ? list
    : [...list, { acao: reference.acao, entrada_id: reference.entrada_id }];
}
type Entry = {
  id: string;
  nome: string;
  dano?: string;
  tipo?: string;
  perfilId?: string;
  dado?: string;
  gastos?: number;
  maximo?: number;
};
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
export function actionCatalog(record: SheetRecord): ActionOption[] {
  const c = record.conteudo,
    calc = calcularFicha(c),
    list: ActionOption[] = [];
  const add = (
    acao: SheetAction,
    entrada_id: string,
    label: string,
    normal = false,
    unavailable = false,
  ) => list.push({ acao, entrada_id, label, normal, unavailable });
  add('iniciativa', 'iniciativa', `Iniciativa ${sign(calc.iniciativa)}`, false);
  for (const [id, name] of Object.entries(ATRIBUTOS)) {
    add('atributo', id, `${name} ${sign((calc.atributos as Record<string, number>)[id])}`);
    add(
      'resistencia',
      id,
      `Resistência: ${name} ${sign((calc.resistencias as Record<string, number>)[id])}`,
    );
  }
  for (const [id, [name]] of Object.entries(PERICIAS))
    add('pericia', id, `${name} ${sign((calc.pericias as Record<string, number>)[id])}`);
  add(
    'morte',
    'morte',
    'Rolar teste de morte',
    true,
    c.combate.pvAtuais !== 0 || c.combate.sucessosMorte >= 3 || c.combate.falhasMorte >= 3,
  );
  for (const e of c.ataques as Entry[]) {
    add(
      'ataque',
      e.id,
      e.tipo === 'cd' ? `Anunciar CD: ${e.nome}` : `Ataque: ${e.nome}`,
      e.tipo === 'cd',
    );
    if (e.dano) add('dano', e.id, `Dano: ${e.nome}`, true);
  }
  for (const e of c.magias) {
    add('magia', e.id, `Conjurar: ${e.nome}`, true);
    if (e.perfilId)
      add(
        'magia_ataque',
        e.id,
        `Ataque de magia: ${e.nome}`,
        false,
        !c.conjuracao.perfis.some((p) => p.id === e.perfilId),
      );
    if (temDanoMagia(e)) add('magia_dano', e.id, `Dano de magia: ${e.nome}`, true);
  }
  for (const e of c.combate.dadosVida as Entry[])
    add(
      'dado_vida',
      e.id,
      `Gastar e rolar ${e.dado}`,
      true,
      (e.gastos || 0) >= (e.maximo || 0) || !['d6', 'd8', 'd10', 'd12'].includes(e.dado || ''),
    );
  return list;
}
export function buildFavoriteCommand(
  record: SheetRecord,
  reference: FavoriteReference,
  mode: RollMode,
): Extract<ChatCommand, { tipo: 'acao' }> | null {
  const action = actionCatalog(record).find((a) => sameFavorite(a, reference));
  if (!action || action.unavailable) return null;
  return {
    tipo: 'acao',
    ficha_id: record.id,
    versao: record.versao,
    entrada_id: action.entrada_id,
    acao: action.acao,
    modo: action.normal ? 'normal' : mode,
  };
}
