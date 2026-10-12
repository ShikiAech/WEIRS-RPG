import { useEffect, useId, useRef, useState } from 'react';
import type { ContentEntry, ContentSummary } from '../../../../packages/contracts/content';
import type { SheetContent, SheetSpell } from '../../../../packages/contracts/sheets';
import { novaEntrada } from '../../../../packages/sheets/modelo.js';
import { asset, normalize } from '../../lib/paths';

export function SpellPicker({
  content,
  catalog,
  onChange,
  onClose,
}: {
  content: SheetContent;
  catalog: ContentSummary[];
  onChange: (c: SheetContent) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const [query, setQuery] = useState('');
  const [circle, setCircle] = useState('');
  const [profile, setProfile] = useState(content.conjuracao.perfis[0]?.id || '');
  const [limit, setLimit] = useState(24);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    search.current?.focus();
    return () => controller.current?.abort();
  }, []);
  const spells = catalog.filter(
    (e) =>
      e.kind === 'magia' &&
      (circle === '' || Number(e.metadata.nivel || 0) === Number(circle)) &&
      normalize(`${e.name} ${e.metadata.original || ''}`).includes(normalize(query)),
  );
  const present = (e: ContentSummary) =>
    content.magias.some(
      (s) =>
        s.compendioId === e.id ||
        (normalize(s.nome) === normalize(e.name) && s.circulo === Number(e.metadata.nivel || 0)),
    );
  async function add(entry: ContentSummary) {
    if (busyRef.current || present(entry)) return;
    busyRef.current = true;
    setBusy(entry.id);
    setError('');
    controller.current = new AbortController();
    try {
      const response = await fetch(asset(`content/generated/entries/${entry.id}.json`), {
        signal: controller.current.signal,
      });
      if (!response.ok) throw Error();
      const detail: ContentEntry = await response.json();
      if (detail.id !== entry.id || detail.kind !== 'magia') throw Error();
      const doc = new DOMParser().parseFromString(detail.descriptionHtml, 'text/html');
      doc.querySelectorAll('p,li,h2,h3,h4').forEach((node) => node.append('\n\n'));
      doc.querySelectorAll('th,td').forEach((node) => node.append(' | '));
      doc.querySelectorAll('tr').forEach((node) => node.append('\n'));
      doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
      const components = detail.metadata.componentes || '';
      const spell: SheetSpell = {
        ...novaEntrada('magias'),
        nome: detail.name,
        compendioId: detail.id,
        circulo: Number(detail.metadata.nivel || 0),
        perfilId: profile,
        tempo: (detail.metadata.tempo || '').slice(0, 120),
        alcance: (detail.metadata.alcance || '').slice(0, 120),
        duracao: (detail.metadata.duracao || '').slice(0, 120),
        concentracao: detail.metadata.concentracao === 'true',
        ritual: detail.metadata.ritual === 'true',
        verbal: /\bV\b/i.test(components),
        somatico: /\bS\b/i.test(components),
        material: /\bM\b/i.test(components)
          ? components.match(/\(([^]*)\)/)?.[1] || 'Componente material'
          : '',
        descricao: (doc.body.textContent || '').trim().slice(0, 10000),
        observacoes: detail.sourceLabel || '',
      };
      const next = structuredClone(content);
      next.magias.push(spell);
      onChange(next);
      setMessage(`${entry.name} adicionada à ficha.`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
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
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (!busyRef.current) dialog.current?.close();
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
        Marque uma magia para adicioná-la com sua descrição. As magias já presentes ficam indicadas
        na lista.
      </p>
      <div className="spell-picker-filters">
        <label>
          Buscar magias
          <input
            ref={search}
            type="search"
            placeholder="Nome em português ou inglês…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
          />
        </label>
        <div className="field">
          <label htmlFor={titleId + '-circulo'}>Filtrar por círculo</label>
          <select
            id={titleId + '-circulo'}
            value={circle}
            onChange={(e) => {
              setCircle(e.target.value);
              setLimit(24);
            }}
          >
            <option value="">Todos</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Truques' : `Círculo ${i}`}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={titleId + '-perfil'}>Perfil para novas magias</label>
          <select
            id={titleId + '-perfil'}
            value={profile}
            disabled={!!busy}
            onChange={(e) => setProfile(e.target.value)}
          >
            <option value="">Origem personalizada</option>
            {content.conjuracao.perfis.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.nome || `Perfil ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="muted" role="status">
        {busy
          ? 'Carregando a descrição da magia…'
          : message || `${spells.length} magia(s) encontrada(s).`}
      </p>
      <div className="spell-picker-results">
        {spells.slice(0, limit).map((e) => (
          <label className="spell-picker-option" key={e.id}>
            <input
              type="checkbox"
              checked={present(e) || busy === e.id}
              disabled={!!busy || present(e)}
              aria-label={e.name}
              onChange={() => void add(e)}
            />
            <span>
              <strong>{e.name}</strong>
              <small>
                {Number(e.metadata.nivel || 0) === 0 ? 'Truque' : `Círculo ${e.metadata.nivel}`} ·{' '}
                {e.metadata.escola}
                {e.metadata.original ? ` · ${e.metadata.original}` : ''}
              </small>
            </span>
            {present(e) && <span className="spell-present">Na ficha</span>}
          </label>
        ))}
      </div>
      {!spells.length && (
        <p className="notice">
          Nenhuma magia encontrada. Busque outro nome ou adicione uma magia manualmente na ficha.
        </p>
      )}
      {spells.length > limit && (
        <button
          type="button"
          className="button secondary more"
          onClick={() => setLimit(limit + 24)}
        >
          Mostrar mais magias
        </button>
      )}
    </dialog>
  );
}
