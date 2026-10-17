import { useState } from 'react';
import type {
  CreationSnapshot,
  CompendiumRepository,
} from '../../../../packages/contracts/character-creation';
import type { CompendiumEntry } from '../../../../packages/contracts/compendium';
import { EntryDetails } from '../Compendium';
export function CreationHistory({
  snapshot,
  repository,
}: {
  snapshot: CreationSnapshot | undefined;
  repository: CompendiumRepository;
}) {
  const [entry, setEntry] = useState<CompendiumEntry | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  if (!snapshot) return null;
  return (
    <details className="form-section creation-history">
      <summary>Histórico da criação guiada</summary>
      <p className="muted">
        As origens abaixo registram a criação inicial. Os campos da ficha podem ter sido editados
        depois; o histórico não reaplica benefícios.
      </p>
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
      <ul>
        {snapshot.contributions.map((c) => (
          <li key={c.id}>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={async () => {
                setBusy(c.id);
                setError('');
                try {
                  const context = await repository.getContext({
                    recordId:
                      c.sourceRecordId ??
                      (snapshot.draft.speciesRef?.revisionId === c.sourceRevisionId
                        ? snapshot.draft.speciesRef.recordId
                        : ''),
                    revisionId: c.sourceRevisionId,
                  });
                  const e = context.entries.find((e) => e.ref.revisionId === c.sourceRevisionId);
                  if (e) setEntry(e);
                  else throw Error();
                } catch {
                  setError(
                    'Esta origem não está disponível neste compêndio. Os valores e descrições da ficha foram preservados para edição manual.',
                  );
                } finally {
                  setBusy('');
                }
              }}
            >
              {c.name}
              {busy === c.id ? ' · Consultando…' : ''}
            </button>
          </li>
        ))}
      </ul>
      {entry && (
        <EntryDetails entry={entry} repository={repository} onClose={() => setEntry(null)} />
      )}
    </details>
  );
}
