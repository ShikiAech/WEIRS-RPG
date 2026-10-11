import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { ChatCommand, RollMode, SheetAction } from '../../../../packages/contracts/chat';
import { supabase } from '../../lib/supabase';
import { createChatRepository, chatError } from '../../lib/chat';
import { DicePanel, useDice3D } from '../dice/Dice3D';

type ActionRequest = { entrada: string; acao: SheetAction; modo: RollMode };
const context = createContext<{
  disabled: boolean;
  pending: boolean;
  roll: (action: ActionRequest) => void;
} | null>(null);

export function SheetChat({
  record,
  disabled,
  children,
}: {
  record: SheetRecord | null;
  disabled: boolean;
  children: ReactNode;
}) {
  const dice = useDice3D();
  const repository = useMemo(() => (supabase ? createChatRepository(supabase) : null), []);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<{ id: string; command: ChatCommand } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    const guard = (e: Event) => {
      if (busy.current) {
        e.preventDefault();
        setError('Aguarde a confirmação da ação antes de sair desta ficha.');
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (busy.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('weirs:before-navigation', guard);
    window.addEventListener('weirs:before-account-change', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('weirs:before-navigation', guard);
      window.removeEventListener('weirs:before-account-change', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  async function roll(action?: ActionRequest) {
    if (!record || !repository || busy.current || disabled) return;
    const next =
      attempt ||
      (action
        ? {
            id: crypto.randomUUID(),
            command: {
              tipo: 'acao',
              ficha_id: record.id,
              versao: record.versao,
              entrada_id: action.entrada,
              acao: action.acao,
              modo: action.modo,
            } as ChatCommand,
          }
        : null);
    if (!next) return;
    busy.current = true;
    setPending(true);
    setAttempt(next);
    setMessage('');
    setError('');
    try {
      const row = await repository.send(record.campanha_id, next.id, next.command);
      if (mounted.current) {
        dice.show(row);
        setAttempt(null);
        setMessage('Ação enviada ao chat.');
      }
    } catch (e) {
      if (mounted.current) {
        const failure = chatError(e);
        setError(failure.message);
        if (['WC002', 'WC003', 'WC004', 'WC005', 'SESSAO'].includes(failure.code)) setAttempt(null);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <context.Provider
      value={
        record && repository
          ? {
              disabled: disabled || !!attempt,
              pending,
              roll: (action) => {
                void roll(action);
              },
            }
          : null
      }
    >
      {record && repository && (
        <div className="sheet-chat-feedback">
          <DicePanel />
          <p className="muted">
            {disabled
              ? 'Salve as alterações antes de usar os dados da ficha.'
              : 'Botões de ataque e magia enviam ações ao chat usando esta versão salva.'}{' '}
            <a href={'#/chat/' + record.campanha_id}>Ver no chat</a>
          </p>
          {pending && <p aria-live="polite">Enviando ação…</p>}
          {message && <p aria-live="polite">{message}</p>}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {attempt && !pending && (
            <div className="retry-command">
              <button className="button secondary" disabled={disabled} onClick={() => void roll()}>
                Reenviar mesma ação
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setAttempt(null);
                  setError('');
                }}
              >
                Liberar nova ação
              </button>
              <small>
                Consulte o chat antes de rolar novamente. Reenviar recupera o mesmo resultado.
              </small>
            </div>
          )}
        </div>
      )}
      {children}
    </context.Provider>
  );
}

export function SheetActionButtons({
  path,
  entry,
}: {
  path: string;
  entry: Record<string, unknown>;
}) {
  const data = useContext(context);
  const [mode, setMode] = useState<RollMode>('normal');
  if (!data || !['ataques', 'magias'].includes(path)) return null;
  const spell = path === 'magias';
  const hasRoll = spell ? Boolean(entry.perfilId) : entry.tipo === 'bonus';
  const label = String(entry.nome || (spell ? 'Magia' : 'Ataque'));
  function button(action: SheetAction, text: string, aria: string, rollMode: RollMode = 'normal') {
    return (
      <button
        type="button"
        className="button secondary"
        aria-label={aria + ': ' + label}
        disabled={data!.disabled || data!.pending}
        onClick={() => data!.roll({ entrada: String(entry.id), acao: action, modo: rollMode })}
      >
        {text}
      </button>
    );
  }
  return (
    <div className="sheet-roll-actions">
      {hasRoll && (
        <label>
          Modo da rolagem: {label}
          <select
            value={mode}
            disabled={data.disabled || data.pending}
            onChange={(e) => setMode(e.target.value as RollMode)}
          >
            <option value="normal">Normal</option>
            <option value="vantagem">Vantagem</option>
            <option value="desvantagem">Desvantagem</option>
          </select>
        </label>
      )}
      {spell ? (
        <>
          {button('magia', 'Conjurar no chat', 'Conjurar magia')}
          {hasRoll && button('magia_ataque', 'Rolar ataque', 'Rolar ataque de magia', mode)}
          {Boolean(String(entry.dano || '').trim()) &&
            button('magia_dano', 'Rolar dano', 'Rolar dano de magia')}
        </>
      ) : (
        <>
          {button(
            'ataque',
            hasRoll ? 'Rolar ataque' : 'Anunciar CD',
            hasRoll ? 'Rolar ataque' : 'Anunciar CD',
            hasRoll ? mode : 'normal',
          )}
          {Boolean(String(entry.dano).trim()) && button('dano', 'Rolar dano', 'Rolar dano')}
        </>
      )}
    </div>
  );
}
