import { useEffect, useRef, useState } from 'react';
import type {
  ContentEntry,
  ContentKind,
  ContentSummary,
} from '../../../packages/contracts/content';
import { asset, legacyHtml, legacyUrl, normalize } from '../lib/paths';

const kinds: [ContentKind | '', string][] = [
  ['', 'Tudo'],
  ['magia', 'Magias'],
  ['classe', 'Classes'],
  ['especie', 'Espécies'],
  ['talento', 'Talentos'],
  ['antecedente', 'Antecedentes'],
];
export function Compendium() {
  const [entries, setEntries] = useState<ContentSummary[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ContentKind | ''>('');
  const [limit, setLimit] = useState(24);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ContentSummary | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(asset('content/generated/index.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setEntries)
      .catch((e) => {
        if (e.name !== 'AbortError')
          setError('Não foi possível carregar o compêndio. Recarregue a página.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, []);
  const filtered = entries.filter(
    (e) =>
      (!kind || e.kind === kind) &&
      normalize(`${e.name} ${e.metadata.original || ''}`).includes(normalize(query)),
  );
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">O saber de Weirs</p>
        <h1>Compêndio</h1>
        <p>Regras, magia e possibilidades para escrever o seu próximo capítulo.</p>
      </div>
      <div className="search-row">
        <label>
          Buscar no compêndio
          <input
            type="search"
            placeholder="Nome em português ou inglês…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
          />
        </label>
        <span className="result-count">{filtered.length} registros</span>
      </div>
      <div className="filters" aria-label="Tipos de conteúdo">
        {kinds.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setLimit(24);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!ready && <p role="status">Abrindo o compêndio…</p>}
      {ready && !error && !filtered.length && (
        <p className="notice">Nenhum registro encontrado. Experimente outro nome.</p>
      )}
      <div className="content-grid">
        {filtered.slice(0, limit).map((entry) => (
          <article className="content-card" key={entry.id}>
            <span className="eyebrow">
              {kinds.find(([key]) => key === entry.kind)?.[1]}
              {entry.metadata.nivel && ` · Círculo ${entry.metadata.nivel}`}
            </span>
            <h2>
              <button onClick={() => setSelected(entry)}>{entry.name}</button>
            </h2>
            <p>
              {entry.metadata.original ||
                entry.metadata.categoria ||
                entry.metadata.escola ||
                'Compêndio de Weirs'}
            </p>
            <div className="card-tags">
              {entry.metadata.ritual === 'true' && <span>Ritual</span>}
              {entry.metadata.concentracao === 'true' && <span>Concentração</span>}
            </div>
            <a href={legacyUrl(entry.sourceUrl)}>Ver no compêndio original ↗</a>
          </article>
        ))}
      </div>
      {filtered.length > limit && (
        <button className="button secondary more" onClick={() => setLimit(limit + 24)}>
          Mostrar mais registros
        </button>
      )}
      {selected && <EntryDetails entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
function EntryDetails({ entry, onClose }: { entry: ContentSummary; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<ContentEntry | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(asset(`content/generated/entries/${entry.id}.json`), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== 'AbortError') setError('Não foi possível abrir este registro.');
      });
    return () => controller.abort();
  }, [entry.id]);
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="detail-title">
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Compêndio de Weirs</p>
          <h2 id="detail-title">{entry.name}</h2>
        </div>
        <button className="button secondary" onClick={() => dialog.current?.close()}>
          Fechar detalhes
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!detail && !error && <p role="status">Carregando descrição…</p>}
      {detail && (
        <>
          <p className="muted">
            {detail.metadata.escola}
            {detail.metadata.alcance && ` · ${detail.metadata.alcance}`}
          </p>
          <div
            className="rich-text"
            dangerouslySetInnerHTML={{ __html: legacyHtml(detail.descriptionHtml) }}
          />
          {detail.sourceLabel && <p className="source-label">{detail.sourceLabel}</p>}
        </>
      )}
    </dialog>
  );
}
