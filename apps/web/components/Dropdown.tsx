import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { normalize } from '../lib/paths';
import { useDropdownLayout } from './useDropdownLayout';
import { Icon } from './Icon';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  label: string;
  ariaLabel?: string;
  description?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  accessory?: ReactNode;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  value?: string | null;
  selectedValues?: string[];
  multiple?: boolean;
  closeOnSelect?: boolean;
  onSelect: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  clearable?: boolean;
  placeholder?: string;
  searchable?: boolean;
  displayValue?: string;
  showSelectedValue?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  filterOptions?: boolean;
  resetQueryOnClose?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  onRetry?: () => void;
  hasMore?: boolean;
  onMore?: () => void;
  moreLabel?: string;
  emptyText?: string;
  popupLabel?: string;
  summary?: ReactNode;
  selectedContent?: ReactNode;
  resetKey?: string;
}

export function Dropdown({
  label,
  options,
  value = null,
  selectedValues = [],
  multiple = false,
  closeOnSelect = !multiple,
  onSelect,
  onClear,
  clearLabel = `Limpar ${label}`,
  clearable,
  placeholder = 'Escolha…',
  searchable = true,
  displayValue,
  showSelectedValue = true,
  query,
  onQueryChange,
  filterOptions = true,
  resetQueryOnClose = true,
  disabled = false,
  loading = false,
  loadingLabel = 'Carregando opções…',
  error,
  onRetry,
  hasMore,
  onMore,
  moreLabel = 'Mostrar mais opções',
  emptyText = 'Nenhuma opção encontrada. Experimente outro nome.',
  popupLabel = multiple ? `Opções de ${label}` : label,
  summary,
  selectedContent,
  resetKey,
}: DropdownProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const currentQuery = query ?? search;
  const setQuery = (next: string) => {
    setSearch(next);
    onQueryChange?.(next);
  };
  const selected = multiple ? selectedValues : value === null ? [] : [value];
  const selectedDisplay =
    displayValue ??
    options
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
      .join(', ');
  const visible = options.filter(
    (o) => !searchable || !filterOptions || normalize(o.label).includes(normalize(currentQuery)),
  );
  const enabled = visible.filter((o) => !o.disabled);
  const layout = useDropdownLayout(open, container);
  const popupId = `${id}-options`;
  const optionId = (key: string) => `${id}-option-${encodeURIComponent(key)}`;
  const isDisabled = () => disabled || !!input.current?.matches(':disabled');
  const canClear = clearable ?? (selected.length > 0 || !!currentQuery);

  function close() {
    setOpen(false);
    setActive(null);
    if (resetQueryOnClose) setQuery('');
  }
  function choose(option: DropdownOption) {
    if (isDisabled() || option.disabled) return;
    onSelect(option.value);
    if (closeOnSelect) {
      input.current?.focus();
      close();
    }
  }
  function focusOption(last = false) {
    const focus = () => {
      const controls = popup.current?.querySelectorAll<HTMLInputElement>(
        'input[data-dropdown-primary]:not(:disabled)',
      );
      if (!controls?.length) return false;
      controls[last ? controls.length - 1 : 0].focus();
      return true;
    };
    if (!focus()) requestAnimationFrame(focus);
  }
  useEffect(() => {
    close();
  }, [resetKey]);
  useEffect(() => {
    if (open && active !== null)
      popup.current
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  return (
    <div
      ref={container}
      className="dropdown"
      data-dropdown
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          input.current?.focus();
          close();
        }
      }}
    >
      <label htmlFor={id} className="dropdown-label">
        {label}
      </label>
      <div className={`dropdown-control${selectedContent ? ' dropdown-control-multiple' : ''}`}>
        {selectedContent && (
          <div
            className="dropdown-selected"
            onMouseDown={(event) => {
              // Let labels forward clicks without blurring the search before their checkbox receives focus.
              if (event.target instanceof Element) {
                const control = event.target.closest('input,button,a,select,textarea,[tabindex]');
                if (!control || !event.currentTarget.contains(control)) event.preventDefault();
              }
            }}
          >
            {selectedContent}
          </div>
        )}
        <input
          ref={input}
          id={id}
          className="dropdown-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          readOnly={!searchable}
          data-value={multiple ? undefined : (value ?? '')}
          aria-autocomplete={searchable ? 'list' : 'none'}
          aria-haspopup={multiple ? 'dialog' : 'listbox'}
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          aria-activedescendant={
            open && !multiple && active !== null ? optionId(active) : undefined
          }
          aria-describedby={summary ? `${id}-summary` : undefined}
          placeholder={placeholder}
          value={
            !searchable
              ? selectedDisplay
              : open
                ? currentQuery
                : showSelectedValue
                  ? selectedDisplay
                  : currentQuery
          }
          onFocus={() => {
            if (!isDisabled()) setOpen(true);
          }}
          onClick={() => {
            if (!isDisabled()) setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || isDisabled()) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (multiple) focusOption(event.key === 'ArrowUp');
              else if (enabled.length) {
                const index = open ? enabled.findIndex((o) => o.value === active) : -1;
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                const next =
                  index < 0 && delta < 0
                    ? enabled.length - 1
                    : (index + delta + enabled.length) % enabled.length;
                setActive(enabled[next].value);
              }
            } else if (
              !searchable &&
              (event.key === 'Home' || event.key === 'End') &&
              open &&
              !multiple
            ) {
              event.preventDefault();
              setActive((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.value ?? null);
            } else if (event.key === 'Enter' || (!searchable && event.key === ' ')) {
              event.preventDefault();
              if (!open) setOpen(true);
              else if (multiple) focusOption();
              else {
                const option = enabled.find((o) => o.value === active);
                if (option) choose(option);
              }
            }
          }}
        />
        {onClear && (
          <button
            type="button"
            className="dropdown-clear"
            aria-label={clearLabel}
            disabled={disabled || !canClear}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isDisabled()) return;
              onClear();
              setQuery('');
              setActive(null);
              input.current?.focus();
              setOpen(true);
            }}
          >
            Limpar
          </button>
        )}
        <button
          type="button"
          className="dropdown-toggle"
          disabled={disabled}
          aria-label={`${open ? 'Fechar' : 'Mostrar'} opções de ${label}`}
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isDisabled()) return;
            input.current?.focus();
            if (open) close();
            else setOpen(true);
          }}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
      {summary && (
        <div id={`${id}-summary`} className="dropdown-summary">
          {summary}
        </div>
      )}
      {open && (
        <div
          id={popupId}
          ref={popup}
          className="dropdown-popup"
          style={layout}
          role={multiple ? 'dialog' : 'listbox'}
          aria-label={popupLabel}
          aria-busy={loading}
          onMouseDown={(event) => {
            // Keep the input focused until a label has forwarded its click to its checkbox.
            if (event.target instanceof Element) {
              const control = event.target.closest('input,button,a,select,textarea,[tabindex]');
              if (!control || !event.currentTarget.contains(control)) event.preventDefault();
            }
          }}
          onKeyDown={(event) => {
            if (!multiple || !(event.target instanceof HTMLInputElement)) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLInputElement>(
                  'input[data-dropdown-primary]:not(:disabled)',
                ),
              );
              const current = controls.indexOf(event.target);
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              controls[(current + delta + controls.length) % controls.length]?.focus();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              event.target.click();
            }
          }}
        >
          {loading && (
            <div className="dropdown-feedback" role="status">
              <span className="dropdown-loading-label">
                <span className="dropdown-spinner" aria-hidden="true" />
                {loadingLabel}
              </span>
            </div>
          )}
          {error && (
            <div className="dropdown-feedback" role="alert">
              {error}
              {onRetry && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    input.current?.focus();
                    onRetry();
                  }}
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}
          {visible.map((option) => {
            const checked = selected.includes(option.value);
            const reasonId = `${optionId(option.value)}-reason`;
            const text = (
              <span className="dropdown-option-text">
                <span>{option.label}</span>
                {option.description && (
                  <small className="dropdown-option-detail">{option.description}</small>
                )}
                {option.disabledReason && (
                  <small id={reasonId} className="dropdown-option-reason">
                    {option.disabledReason}
                  </small>
                )}
              </span>
            );
            return (
              <div
                key={option.value}
                id={optionId(option.value)}
                className="dropdown-option"
                role={multiple ? undefined : 'option'}
                data-value={option.value}
                data-selected={checked}
                data-active={active === option.value}
                data-disabled={!!option.disabled}
                aria-label={multiple ? undefined : (option.ariaLabel ?? option.label)}
                aria-selected={multiple ? undefined : checked}
                aria-disabled={multiple ? undefined : !!option.disabled}
                onClick={(event) => {
                  if (!multiple) {
                    choose(option);
                    return;
                  }
                  if (
                    event.target instanceof Element &&
                    event.target.closest(
                      'label,input,button,a,select,textarea,[role="tooltip"],.dropdown-option-accessory',
                    )
                  )
                    return;
                  if (!isDisabled())
                    event.currentTarget
                      .querySelector<HTMLInputElement>('input[data-dropdown-primary]')
                      ?.click();
                }}
              >
                {multiple ? (
                  <label className="dropdown-option-main">
                    <input
                      type="checkbox"
                      data-dropdown-primary
                      aria-label={option.ariaLabel ?? option.label}
                      aria-describedby={option.disabledReason ? reasonId : undefined}
                      checked={checked}
                      disabled={disabled || option.disabled}
                      onChange={() => choose(option)}
                    />
                    {text}
                  </label>
                ) : (
                  text
                )}
                {option.accessory && (
                  <div className="dropdown-option-accessory">{option.accessory}</div>
                )}
              </div>
            );
          })}
          {!loading && !error && !visible.length && (
            <p className="dropdown-feedback" role="status">
              {emptyText}
            </p>
          )}
          {hasMore && onMore && (
            <div className="dropdown-feedback">
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => {
                  input.current?.focus();
                  onMore();
                }}
              >
                {moreLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
