import { useEffect, useId, useRef, useState } from 'react';
import type {
  CompendiumKind,
  CompendiumRef,
  CompendiumSummary,
} from '../../../../packages/contracts/compendium';
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
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLLIElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompendiumSummary | null>(null);
  const results = useCompendium(repository, {
    ruleSetId: 'dnd-5e-2024',
    kind,
    parentRevisionId,
    query: query ?? '',
  });
  const name = value
    ? valueName ||
      (selected?.ref.revisionId === value.revisionId ? selected.name : '') ||
      results.entries.find((entry) => entry.ref.revisionId === value.revisionId)?.name ||
      'Seleção atual'
    : '';
  const active = results.entries.find((entry) => entry.ref.revisionId === activeId);
  const listId = `${id}-options`;

  useEffect(() => {
    setQuery(null);
    setActiveId(null);
    setOpen(false);
  }, [value?.revisionId, parentRevisionId]);

  useEffect(() => {
    if (open) activeOption.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId, open]);

  function close() {
    setOpen(false);
    setQuery(null);
    setActiveId(null);
  }

  function choose(entry: CompendiumSummary) {
    setSelected(entry);
    input.current?.focus();
    close();
    if (entry.ref.revisionId !== value?.revisionId) onChange(entry.ref);
  }

  return (
    <div
      className="catalog-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="catalog-input">
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active ? `${id}-${active.ref.revisionId}` : undefined}
          value={query ?? name}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveId(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const entries = results.entries;
              if (!entries.length) return;
              const index = open
                ? entries.findIndex((entry) => entry.ref.revisionId === activeId)
                : -1;
              const next =
                event.key === 'ArrowDown'
                  ? (index + 1) % entries.length
                  : index < 0
                    ? entries.length - 1
                    : (index - 1 + entries.length) % entries.length;
              setActiveId(entries[next].ref.revisionId);
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active && !results.loading && !results.error) choose(active);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          placeholder={`${searchLabel}…`}
        />
        {(value || query) && (
          <button
            className="catalog-input-action"
            type="button"
            aria-label={`Limpar ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSelected(null);
              setQuery(null);
              setActiveId(null);
              input.current?.focus();
              setOpen(true);
              if (value) onChange(null);
            }}
          >
            Limpar
          </button>
        )}
        <button
          className="catalog-input-action"
          type="button"
          tabIndex={-1}
          aria-label={`${open ? 'Fechar' : 'Mostrar'} opções de ${label}`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            input.current?.focus();
            if (open) close();
            else setOpen(true);
          }}
        >
          Opções
        </button>
      </div>
      {open && (
        <div className="catalog-dropdown">
          <ul id={listId} role="listbox" aria-label={label} aria-busy={results.loading}>
            {results.entries.map((entry) => (
              <li
                key={entry.ref.revisionId}
                id={`${id}-${entry.ref.revisionId}`}
                ref={activeId === entry.ref.revisionId ? activeOption : undefined}
                role="option"
                aria-label={`${entry.name} · ${entry.sourceTitle}`}
                aria-selected={value?.revisionId === entry.ref.revisionId}
                className={
                  activeId === entry.ref.revisionId ? 'catalog-option active' : 'catalog-option'
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(entry)}
              >
                <span>{entry.name}</span>
                <small>{entry.sourceTitle}</small>
              </li>
            ))}
          </ul>
          <div className="catalog-feedback">
            <small role="status">
              {results.loading
                ? 'Carregando opções…'
                : results.error
                  ? ''
                  : results.entries.length
                    ? `${results.entries.length} ${results.entries.length === 1 ? 'opção encontrada' : 'opções encontradas'}. Use as setas e Enter para selecionar.`
                    : 'Nenhuma opção encontrada. Experimente outro nome.'}
            </small>
            {results.error && (
              <div role="alert">
                {results.error}
                <button className="button secondary" type="button" onClick={results.retry}>
                  Tentar novamente
                </button>
              </div>
            )}
            {results.nextCursor && (
              <button
                className="button secondary"
                type="button"
                disabled={results.loading}
                onClick={() => {
                  input.current?.focus();
                  results.more();
                }}
              >
                Carregar mais opções de {label.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
