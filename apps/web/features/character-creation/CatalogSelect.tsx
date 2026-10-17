import { useId, useState } from 'react';
import type { CompendiumKind, CompendiumRef } from '../../../../packages/contracts/compendium';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import { useCompendium } from '../../lib/use-compendium';
export function CatalogSelect({
  label,
  searchLabel,
  kind,
  value,
  valueName,
  parentRevisionId,
  repository,
  onChange,
}: {
  label: string;
  searchLabel: string;
  kind: CompendiumKind;
  value: CompendiumRef | null;
  valueName?: string;
  parentRevisionId?: string;
  repository: CompendiumRepository;
  onChange: (ref: CompendiumRef | null) => void;
}) {
  const id = useId(),
    [query, setQuery] = useState('');
  const results = useCompendium(repository, {
    ruleSetId: 'dnd-5e-2024',
    kind,
    parentRevisionId,
    query,
  });
  return (
    <div className="catalog-select">
      <label>
        {searchLabel}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite um nome…"
        />
      </label>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value?.revisionId ?? ''}
        onChange={(e) =>
          onChange(results.entries.find((r) => r.ref.revisionId === e.target.value)?.ref ?? null)
        }
      >
        <option value="">Selecione…</option>
        {value && !results.entries.some((e) => e.ref.revisionId === value.revisionId) && (
          <option value={value.revisionId}>{valueName || 'Seleção atual'}</option>
        )}
        {results.entries.map((e) => (
          <option key={e.ref.revisionId} value={e.ref.revisionId}>
            {e.name} · {e.sourceTitle}
          </option>
        ))}
      </select>
      {results.loading && <small role="status">Carregando opções…</small>}
      {results.error && (
        <div role="alert">
          {results.error}
          <button type="button" onClick={results.retry}>
            Tentar novamente
          </button>
        </div>
      )}
      {results.nextCursor && (
        <button
          className="button secondary"
          type="button"
          disabled={results.loading}
          onClick={results.more}
        >
          Carregar mais opções de {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
