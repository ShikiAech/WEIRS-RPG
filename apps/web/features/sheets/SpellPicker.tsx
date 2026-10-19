import { useEffect, useId, useRef, useState } from 'react';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import type { CompendiumSummary } from '../../../../packages/contracts/compendium';
import type { SheetContent } from '../../../../packages/contracts/sheets';
import { spellToSheet } from '../../../../packages/compendium/sheet-adapter';
import { nivelTotal } from '../../../../packages/sheets/calculos.js';
import { useCompendium } from '../../lib/use-compendium';
import { normalize } from '../../lib/paths';
export function SpellPicker({
  content,
  repository,
  onChange,
  onClose,
}: {
  content: SheetContent;
  repository: CompendiumRepository;
  onChange: (c: SheetContent) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null),
    busyRef = useRef(false);
  const [query, setQuery] = useState(''),
    [circle, setCircle] = useState('');
  const [profile, setProfile] = useState(content.conjuracao.perfis[0]?.id || '');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const titleId = useId();
  const results = useCompendium(repository, {
    ruleSetId: 'dnd-5e-2024',
    kind: 'magia',
    query,
    circle: circle === '' ? undefined : Number(circle),
  });
  useEffect(() => {
    dialog.current?.showModal();
    search.current?.focus();
    return () => controller.current?.abort();
  }, []);
  const present = (e: CompendiumSummary) =>
    content.magias.some(
      (s) =>
        (!s.origemCriacao || !!profile) &&
        s.perfilId === profile &&
        (s.compendioRef?.recordId === e.ref.recordId ||
          e.legacyIds?.includes(s.compendioId || '') ||
          s.compendioId === e.ref.recordId ||
          (!s.compendioRef &&
            !s.compendioId &&
            normalize(s.nome) === normalize(e.name) &&
            s.circulo === e.circle)),
    );
  async function add(entry: CompendiumSummary) {
    if (busyRef.current || present(entry)) return;
    busyRef.current = true;
    setBusy(entry.ref.recordId);
    setError('');
    controller.current = new AbortController();
    try {
      const detail = await repository.get(entry.ref, controller.current.signal);
      if (detail.kind !== 'magia') throw Error();
      const next = structuredClone(content);
      next.magias.push(
        spellToSheet(detail, profile, { characterLevel: nivelTotal(content.classes) }),
      );
      onChange(next);
      setMessage(`${entry.name} adicionada à ficha.`);
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(`Não foi possível carregar ${entry.name}. Tente novamente.`);
    } finally {
      busyRef.current = false;
      setBusy('');
      search.current?.focus();
    }
  }
  return (
    <dialog
      ref={dialog}
      className="spell-picker"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (!busyRef.current) dialog.current?.close();
        }
      }}
      onCancel={(e) => {
        if (busyRef.current) e.preventDefault();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Compêndio de Weirs</p>
          <h2 id={titleId}>Adicionar magias do compêndio</h2>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={!!busy}
          onClick={() => dialog.current?.close()}
        >
          Concluir seleção
        </button>
      </div>
      <p className="muted">
        Selecione o perfil de origem e marque as magias. Uma magia pode pertencer a perfis
        diferentes.
      </p>
      <div className="spell-picker-filters">
        <label>
          Buscar magias
          <input
            ref={search}
            type="search"
            placeholder="Nome em português ou inglês…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Filtrar por círculo
          <select value={circle} onChange={(e) => setCircle(e.target.value)}>
            <option value="">Todos</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Truques' : `Círculo ${i}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Perfil para novas magias
          <select value={profile} disabled={!!busy} onChange={(e) => setProfile(e.target.value)}>
            <option value="">Origem personalizada</option>
            {content.conjuracao.perfis.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.nome || `Perfil ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(error || results.error) && (
        <div className="notice error" role="alert">
          {error || results.error}
          {results.error && <button onClick={results.retry}>Tentar novamente</button>}
        </div>
      )}
      <p className="muted" role="status">
        {busy
          ? 'Carregando a descrição da magia…'
          : results.loading
            ? 'Consultando magias…'
            : message || `${results.entries.length} magia(s) encontrada(s).`}
      </p>
      <div className="spell-picker-results">
        {results.entries.map((e) => (
          <label className="spell-picker-option" key={e.ref.recordId}>
            <input
              type="checkbox"
              checked={present(e) || busy === e.ref.recordId}
              disabled={!!busy || present(e)}
              aria-label={e.name}
              onChange={() => void add(e)}
            />
            <span>
              <strong>{e.name}</strong>
              <small>
                {e.circle === 0 ? 'Truque' : `Círculo ${e.circle}`} · {e.school}
                {e.originalName && ` · ${e.originalName}`}
              </small>
            </span>
            {present(e) && <span className="spell-present">Na ficha</span>}
          </label>
        ))}
      </div>
      {!results.loading && !results.error && !results.entries.length && (
        <p className="notice">
          Nenhuma magia encontrada. Busque outro nome ou adicione uma magia manualmente na ficha.
        </p>
      )}
      {results.nextCursor && (
        <button
          type="button"
          className="button secondary more"
          disabled={results.loading}
          onClick={results.more}
        >
          Mostrar mais magias
        </button>
      )}
    </dialog>
  );
}
