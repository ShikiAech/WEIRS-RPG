import { HitPointExpression, type HpAction } from '../session/HitPointExpression';
import type { RollResult } from '../../../../packages/contracts/chat';
import { useState } from 'react';
import type { TokenRecord } from '../../../../packages/contracts/tabletop';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type {
  Combatant,
  SessionCommand,
  SessionState,
} from '../../../../packages/contracts/session';
import type { ChatCommand, RollMode } from '../../../../packages/contracts/chat';
import { FavoriteActions } from '../session/FavoriteActions';
import { tokenAccess, tokenHpCommand } from '../session/token-actions';

const conditions = [
  'Agarrado',
  'Amedrontado',
  'Atordoado',
  'Caído',
  'Cego',
  'Enfeitiçado',
  'Envenenado',
  'Impedido',
  'Incapacitado',
  'Inconsciente',
  'Invisível',
  'Paralisado',
  'Petrificado',
  'Surdo',
];

export function TokenActions({
  token,
  record,
  participant,
  mesa,
  userId,
  role,
  disabled,
  onOpenSheet,
  onRoll,
  operate,
  hpResult,
}: {
  token: TokenRecord;
  record?: SheetRecord;
  participant?: Combatant;
  mesa?: SessionState | null;
  userId: string;
  role: string;
  disabled: boolean;
  onOpenSheet?: (id: string) => void;
  onRoll: (command: ChatCommand) => void;
  operate: (command: SessionCommand) => Promise<boolean>;
  hpResult?: RollResult | null;
}) {
  const [amount, setAmount] = useState('1'),
    [condition, setCondition] = useState(''),
    [mode, setMode] = useState<RollMode>('normal');
  const access = tokenAccess(token, record, participant, mesa || undefined, userId, role);
  const locked = disabled || !access.editable;
  const pv = access.record?.conteudo.combate;
  const applyHp = (action: HpAction) => {
    if (locked) return;
    const command = tokenHpCommand(access, action, amount);
    if (command) void operate(command);
  };
  const changeCondition = async (name: string, active: boolean) => {
    if (locked || !access.record || !name.trim()) return false;
    return operate({
      tipo: 'condicao',
      ficha_id: access.record.id,
      versao: access.record.versao,
      nome: name.trim(),
      ativa: active,
    });
  };
  return (
    <div className="token-actions" role="region" aria-label="Ações do token">
      {access.record && onOpenSheet && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => onOpenSheet(access.record!.id)}
        >
          Ficha do token
        </button>
      )}
      {token.oculto && (
        <p className="action-help">
          Revele o token para usar ações rápidas. Alterações de PV e condições aparecem no chat.
        </p>
      )}
      {!token.ficha_id && !access.participant && role === 'mestre' && (
        <p className="action-help">
          Vincule uma ficha ou um NPC do combate em Editar token para controlar PV.
        </p>
      )}
      {(access.record || access.participant) && (
        <details className="token-vitals-actions">
          <summary>{access.record ? 'PV e condições' : 'PV do NPC'}</summary>
          <fieldset disabled={locked}>
            <HitPointExpression
              value={amount}
              onChange={setAmount}
              disabled={locked}
              onApply={applyHp}
              label="Quantidade de PV do token"
              labels={{ dano: 'Aplicar dano no token', cura: 'Curar token' }}
              result={
                hpResult?.alvo_id === (access.record?.id ?? access.participant?.id)
                  ? hpResult
                  : null
              }
            />
            {pv || access.participant ? (
              <p className="action-help">
                PV temporários: {pv?.pvTemporarios ?? access.participant?.pvTemporarios ?? 0}. Dano
                os absorve primeiro.
              </p>
            ) : null}
            {access.record && (
              <>
                <form
                  className="token-condition-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (await changeCondition(condition, true)) setCondition('');
                  }}
                >
                  <label>
                    Condição do token
                    <input
                      value={condition}
                      maxLength={120}
                      required
                      list={'token-conditions-' + token.id}
                      onChange={(event) => setCondition(event.target.value)}
                      placeholder="Condição ou homebrew"
                    />
                  </label>
                  <datalist id={'token-conditions-' + token.id}>
                    {conditions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <button className="play-roll" disabled={locked}>
                    Aplicar condição no token
                  </button>
                </form>
                <div className="token-condition-chips">
                  {((pv?.condicoes as { id: string; nome: string }[]) || []).map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className="play-roll"
                      title={'Remover condição ' + entry.nome}
                      aria-label={'Remover condição ' + entry.nome}
                      onClick={() => void changeCondition(entry.nome, false)}
                    >
                      {entry.nome} ×
                    </button>
                  ))}
                </div>
                {pv?.concentracaoAtiva && (
                  <div className="token-concentration">
                    <span>Concentração: {pv.concentracaoAtiva}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (!locked && access.record)
                          void operate({
                            tipo: 'concentracao',
                            ficha_id: access.record.id,
                            versao: access.record.versao,
                            nome: '',
                          });
                      }}
                    >
                      Encerrar concentração no token
                    </button>
                  </div>
                )}
              </>
            )}
          </fieldset>
          <p className="action-help">
            Registra a alteração no chat. Ajuste o valor por resistências e regras da mesa.
          </p>
        </details>
      )}
      {access.record && (
        <details className="token-favorite-actions">
          <summary>Ações rápidas</summary>
          <label>
            Modo das ações rápidas
            <select
              value={mode}
              disabled={locked}
              onChange={(event) => setMode(event.target.value as RollMode)}
            >
              <option value="normal">Normal</option>
              <option value="vantagem">Vantagem</option>
              <option value="desvantagem">Desvantagem</option>
            </select>
          </label>
          <FavoriteActions
            record={access.record}
            userId={userId}
            disabled={locked}
            mode={mode}
            onRoll={onRoll}
            compact
          />
        </details>
      )}
    </div>
  );
}
