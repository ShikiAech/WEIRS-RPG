import { validHpExpression } from './HitPointExpression';
import type { TokenRecord } from '../../../../packages/contracts/tabletop';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type {
  Combatant,
  SessionCommand,
  SessionState,
} from '../../../../packages/contracts/session';
export type TokenAccess = {
  editable: boolean;
  record?: SheetRecord;
  participant?: Combatant;
  mesa?: SessionState;
};
export function tokenAccess(
  token: TokenRecord,
  record: SheetRecord | undefined,
  participant: Combatant | undefined,
  mesa: SessionState | undefined,
  userId: string,
  role: string,
): TokenAccess {
  const sheet =
    record?.id === token.ficha_id &&
    record?.campanha_id === token.campanha_id &&
    (role === 'mestre' ||
      ((role === 'jogador' || role === 'espectador') && record.proprietario_id === userId))
      ? record
      : undefined;
  const currentMesa = mesa?.campanha_id === token.campanha_id ? mesa : undefined;
  const npc =
    !token.ficha_id && participant?.id === token.combate_id
      ? currentMesa?.estado.combate.participantes.find(
          (p) => p.id === token.combate_id && !p.ficha_id,
        )
      : undefined;
  return {
    record: sheet,
    participant: npc,
    mesa: currentMesa,
    editable:
      !token.oculto &&
      (role === 'mestre'
        ? Boolean(sheet || npc)
        : role === 'jogador' && sheet?.proprietario_id === userId),
  };
}
export function tokenHpCommand(
  access: TokenAccess,
  action: 'dano' | 'cura' | 'temporarios' | 'temporarios_definir',
  amount: number | string,
): SessionCommand | null {
  if (!access.editable) return null;
  if (
    typeof amount === 'number'
      ? !Number.isSafeInteger(amount) || amount < 0 || amount > 9999
      : !validHpExpression(amount)
  )
    return null;
  const value = typeof amount === 'string' ? { expressao: amount } : { valor: amount };
  if (access.record)
    return {
      tipo: 'pv',
      ficha_id: access.record.id,
      versao: access.record.versao,
      acao: action,
      ...value,
    };
  if (!access.participant || !access.mesa) return null;
  return {
    tipo: 'combate',
    acao: action,
    id: access.participant.id,
    versao: access.mesa.versao,
    ...value,
  };
}
