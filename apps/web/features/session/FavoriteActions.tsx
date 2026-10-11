import type { ChatCommand, RollMode } from '../../../../packages/contracts/chat';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import { actionCatalog, buildFavoriteCommand, sameFavorite } from './action-favorites';
import { useActionFavorites } from './useActionFavorites';

export function FavoriteActions({
  record,
  userId,
  disabled,
  mode,
  onRoll,
  compact = false,
}: {
  record: SheetRecord;
  userId: string;
  disabled: boolean;
  mode: RollMode;
  onRoll: (command: ChatCommand) => void;
  compact?: boolean;
}) {
  const favorites = useActionFavorites(userId, record.campanha_id, record.id),
    catalog = actionCatalog(record);
  return (
    <div
      className={'favorite-actions' + (compact ? ' compact-favorites' : '')}
      role="region"
      aria-label="Ações favoritas"
    >
      {!compact && (
        <strong className="favorite-heading">
          ★ Favoritos <span>{favorites.references.length}/12</span>
        </strong>
      )}
      {!favorites.references.length && (
        <p className="action-help">
          Marque ★ ao lado de um teste, ataque ou magia na ficha para usar aqui.
        </p>
      )}
      <div className="favorite-list">
        {favorites.references.map((reference) => {
          const action = catalog.find((a) => sameFavorite(a, reference));
          const label = action?.label || 'Ação removida da ficha';
          return (
            <div className="favorite-entry" key={reference.acao + ':' + reference.entrada_id}>
              <button
                type="button"
                className="play-roll"
                disabled={disabled || !action || action.unavailable}
                title={
                  action?.unavailable
                    ? 'Esta ação está indisponível no estado atual da ficha.'
                    : label
                }
                onClick={() => {
                  const command = buildFavoriteCommand(record, reference, mode);
                  if (command) onRoll(command);
                }}
              >
                {label}
              </button>
              <button
                type="button"
                className="favorite-star"
                aria-label={'Remover favorito ' + label}
                title={'Remover favorito ' + label}
                onClick={() => favorites.toggle(reference)}
              >
                ★
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
