import { useState } from 'react';
import type {
  CompendiumKind,
  CompendiumRef,
  CompendiumSummary,
} from '../../../../packages/contracts/compendium';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import { useCompendium } from '../../lib/use-compendium';
import { Dropdown } from '../../components/Dropdown';

// Catalog loading and record references stay here; all interaction and presentation use Dropdown.
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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CompendiumSummary | null>(null);
  const results = useCompendium(repository, {
    ruleSetId: 'dnd-5e-2024',
    kind,
    parentRevisionId,
    query,
  });
  const name = value
    ? valueName ||
      (selected?.ref.revisionId === value.revisionId ? selected.name : '') ||
      results.entries.find((entry) => entry.ref.revisionId === value.revisionId)?.name ||
      'Seleção atual'
    : '';
  return (
    <Dropdown
      label={label}
      placeholder={`${searchLabel}…`}
      value={value?.revisionId ?? null}
      displayValue={name}
      query={query}
      onQueryChange={setQuery}
      filterOptions={false}
      resetKey={`${value?.revisionId ?? ''}:${parentRevisionId ?? ''}`}
      options={results.entries.map((entry) => ({
        value: entry.ref.revisionId,
        label: entry.name,
        ariaLabel: `${entry.name} · ${entry.sourceTitle}`,
        description: entry.sourceTitle,
      }))}
      onSelect={(revisionId) => {
        const entry = results.entries.find((entry) => entry.ref.revisionId === revisionId);
        if (!entry) return;
        setSelected(entry);
        if (revisionId !== value?.revisionId) onChange(entry.ref);
      }}
      onClear={() => {
        setSelected(null);
        setQuery('');
        if (value) onChange(null);
      }}
      loading={results.loading}
      error={results.error}
      onRetry={results.retry}
      hasMore={!!results.nextCursor}
      onMore={results.more}
      moreLabel={`Carregar mais opções de ${label.toLowerCase()}`}
    />
  );
}
