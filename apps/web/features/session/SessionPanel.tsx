import type { ChatCommand, ChatMessage } from '../../../../packages/contracts/chat';
import { SheetPlay } from './SheetPlay';
import { CombatPanel } from './CombatPanel';
import { ShopDialog } from './ShopDialog';
import { useSession } from './useSession';
import { useEffect } from 'react';
export function SessionPanel({
  campaign,
  userId,
  role,
  kind,
  chatDisabled,
  onClose,
  onRoll,
  onMessage,
  onBusy,
  selectedSheetId,
}: {
  campaign: string;
  userId: string;
  role: string;
  kind: string;
  chatDisabled: boolean;
  onClose: () => void;
  onRoll: (c: ChatCommand) => void;
  onMessage: (m: ChatMessage) => void;
  onBusy: (b: boolean) => void;
  selectedSheetId?: string;
}) {
  const session = useSession(campaign, onMessage, onBusy);
  useEffect(() => {
    if (selectedSheetId && session.records.some((r) => r.id === selectedSheetId))
      session.setSelected(selectedSheetId);
  }, [selectedSheetId, session.records]);
  const { mesa } = session;
  const authorizedRecords = session.records.filter(
    (r) =>
      role === 'mestre' ||
      ((role === 'jogador' || role === 'espectador') && r.proprietario_id === userId),
  );
  const record = authorizedRecords.find((r) => r.id === session.selected);
  const master = role === 'mestre',
    readonly = role === 'espectador';
  const disabled =
    chatDisabled ||
    session.loading ||
    session.pending ||
    Boolean(session.attempt) ||
    session.denied;
  const editable = !!record && !readonly && (master || record.proprietario_id === userId);
  const common = (
    <>
      {session.loading && <p>Atualizando a mesa…</p>}
      {session.error && (
        <div className="notice error" role="alert">
          {session.error}
          <button
            className="text-button"
            onClick={() => {
              session.clearError();
              void session.refresh();
            }}
          >
            Atualizar mesa
          </button>
        </div>
      )}
      {session.pending && <p aria-live="polite">Confirmando operação…</p>}
      {session.attempt && !session.pending && (
        <div className="retry-command">
          <button
            className="button"
            disabled={session.denied}
            onClick={() => void session.operate()}
          >
            Reenviar operação
          </button>
          <button className="text-button" onClick={session.release}>
            Liberar nova operação
          </button>
          <small>A operação pode já estar no chat. Reenvie para recuperar a confirmação.</small>
        </div>
      )}
      {kind !== 'combate' && (
        <label>
          Ficha na sessão
          <select
            value={session.selected}
            disabled={disabled}
            onChange={(e) => session.setSelected(e.target.value)}
          >
            <option value="" disabled>
              Selecione uma ficha
            </option>
            {authorizedRecords.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {!session.loading && !session.denied && !session.records.length && kind !== 'combate' && (
        <p>
          Crie uma ficha salva nesta campanha para jogar. <a href="#/fichas/nova">Criar ficha</a>
        </p>
      )}
    </>
  );
  if (kind === 'loja')
    return (
      <ShopDialog
        mesa={mesa}
        record={record}
        master={master}
        disabled={disabled || readonly}
        locked={session.pending || !!session.attempt || chatDisabled}
        onClose={onClose}
        operate={(c) => session.operate(c)}
      >
        {common}
      </ShopDialog>
    );
  return (
    <aside
      className="session-panel"
      aria-label={kind === 'ficha' ? 'Ficha durante a sessão' : 'Combate da campanha'}
    >
      <div className="session-panel-heading">
        <h2>{kind === 'ficha' ? 'Ficha do jogador' : 'Combate'}</h2>
        <button
          className="text-button"
          disabled={session.pending || !!session.attempt || chatDisabled}
          onClick={onClose}
        >
          Fechar painel
        </button>
      </div>
      {common}
      {kind === 'ficha' && record && !session.denied && (
        <SheetPlay
          hpResult={session.hpResult}
          key={record.id}
          record={record}
          userId={userId}
          disabled={disabled || !editable}
          onRoll={onRoll}
          operate={(c) => session.operate(c)}
        />
      )}
      {kind === 'combate' && mesa && !session.denied && (
        <CombatPanel
          hpResult={session.hpResult}
          mesa={mesa}
          master={master}
          disabled={disabled || readonly}
          operate={(c) => session.operate(c)}
        />
      )}
    </aside>
  );
}
