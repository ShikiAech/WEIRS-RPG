import { useEffect, useId, useRef, useState } from 'react';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import type { CompendiumEntry, CompendiumSummary } from '../../../../packages/contracts/compendium';
import { Icon } from '../../components/Icon';

export function CompendiumTooltip({
  summary,
  entry,
  repository,
}: {
  summary: CompendiumSummary;
  entry?: CompendiumEntry;
  repository: CompendiumRepository;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 16, left: 16, width: 360, maxHeight: 360 });
  const [detail, setDetail] = useState(entry);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reveal = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, window.innerWidth - 32);
    const height = Math.min(360, window.innerHeight - 32);
    const top =
      window.innerHeight - rect.bottom < 240
        ? Math.max(16, rect.top - height - 8)
        : rect.bottom + 8;
    setPosition({
      top,
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      width,
      maxHeight: window.innerHeight - top - 16,
    });
    setVisible(true);
  };
  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    window.addEventListener('resize', dismiss);
    const onScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[role="tooltip"]')) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (rect && rect.bottom >= 0 && rect.top <= window.innerHeight) reveal();
      else dismiss();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [visible]);
  useEffect(() => {
    if (!visible || detail) return;
    const controller = new AbortController();
    setError(false);
    repository
      .get(summary.ref, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [visible, detail, repository, summary.ref.recordId, summary.ref.revisionId, attempt]);
  return (
    <span
      className="creation-tooltip-trigger"
      onMouseEnter={reveal}
      onMouseLeave={() => {
        dismissTimer.current = setTimeout(() => setVisible(false), 200);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="creation-info-button"
        aria-label={`Sobre ${summary.name}`}
        aria-describedby={visible ? id : undefined}
        onFocus={reveal}
        onClick={reveal}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setVisible(false);
          }
        }}
      >
        <Icon name="info" />
      </button>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="creation-tooltip"
          style={{ ...position, position: 'fixed', overflowY: 'auto' }}
        >
          <strong>{summary.name}</strong>
          {detail?.kind === 'magia' && (
            <small>
              {detail.data.castingTime} · {detail.data.range} · {detail.data.duration}
            </small>
          )}
          {detail ? (
            <span>{detail.description || 'Descrição não disponível.'}</span>
          ) : error ? (
            <span>
              Não foi possível carregar a descrição.{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Tentar novamente
              </button>
            </span>
          ) : (
            <span className="creation-loading" role="status">
              <span className="creation-spinner" aria-hidden="true" />
              Carregando descrição…
            </span>
          )}
        </span>
      )}
    </span>
  );
}
