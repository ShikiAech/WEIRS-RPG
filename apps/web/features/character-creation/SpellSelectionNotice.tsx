import { useEffect, useId, useRef } from 'react';
import type { SpellSelectionChange } from '../../../../packages/character-creation/reconcile-spells';

export function SpellSelectionNotice({
  changes,
  onClose,
}: {
  changes: SpellSelectionChange[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const acknowledge = useRef<HTMLButtonElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    dialog.current?.showModal();
    acknowledge.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="creation-spell-notice"
      aria-labelledby={title}
      aria-describedby={description}
      onClose={onClose}
    >
      <h2 id={title}>Magias ajustadas</h2>
      <p id={description}>
        Atualizamos suas magias para as regras das escolhas atuais. Confira o que mudou e por quê.
      </p>
      <ul>
        {changes.map((change, index) => (
          <li
            key={`${change.selection.profileId}:${change.selection.spellRef.revisionId}:${index}`}
          >
            <strong>{change.name}</strong> · {change.origin}
            <p>
              {change.action === 'unprepared' ? 'Despreparada' : 'Removida da seleção'}:{' '}
              {change.reason}
            </p>
          </li>
        ))}
      </ul>
      <button
        ref={acknowledge}
        type="button"
        className="button"
        onClick={() => dialog.current?.close()}
      >
        Entendi
      </button>
    </dialog>
  );
}
