import { useEffect, useRef, useState } from 'react';
import type {
  CompendiumEntry,
  CompendiumKind,
  CompendiumSummary,
} from '../../../packages/contracts/compendium';
import type {
  CompendiumRepository,
  CreationCatalog,
} from '../../../packages/contracts/character-creation';
import { compendiumSource } from '../lib/compendium-source';
import { useCompendium } from '../lib/use-compendium';
import { legacyUrl } from '../lib/paths';

const kinds: [CompendiumKind | '', string][] = [
  ['', 'Tudo'],
  ['magia', 'Magias'],
  ['classe', 'Classes'],
  ['subclasse', 'Subclasses'],
  ['especie', 'Espécies'],
  ['linhagem', 'Linhagens'],
  ['talento', 'Talentos'],
  ['antecedente', 'Antecedentes'],
  ['equipamento', 'Equipamentos'],
  ['caracteristica', 'Características'],
  ['idioma', 'Idiomas'],
  ['criatura', 'Criaturas'],
  ['pacote', 'Pacotes'],
  ['maestria', 'Maestrias'],
  ['propriedade_arma', 'Propriedades de armas'],
  ['servico', 'Serviços'],
  ['moeda', 'Moedas'],
];
export function Compendium() {
  const { repository, demo } = compendiumSource(
    new URLSearchParams(location.hash.split('?')[1]).get('demo') === '1',
  );
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CompendiumKind | ''>('');
  const [sourceId, setSourceId] = useState<string>();
  const [selected, setSelected] = useState<CompendiumSummary | null>(null);
  const results = useCompendium(repository, {
    ruleSetId: 'dnd-5e-2024',
    query,
    kind: kind || undefined,
    sourceId,
  });
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">O saber de Weirs</p>
        <h1>Compêndio</h1>
        <p>Regras, magia e possibilidades para escrever o seu próximo capítulo.</p>
      </div>
      {demo && (
        <p className="notice">Catálogo de demonstração · cópia publicada para exploração local.</p>
      )}
      <div className="search-row">
        <label>
          Buscar no compêndio
          <input
            type="search"
            placeholder="Nome em português ou inglês…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="result-count">{results.entries.length} registros carregados</span>
      </div>
      <div className="filters" aria-label="Tipos de conteúdo">
        {kinds.map(([value, label]) => (
          <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>
            {label}
          </button>
        ))}
      </div>
      {sourceId && (
        <button className="button secondary" onClick={() => setSourceId(undefined)}>
          Todas as fontes
        </button>
      )}
      {results.error && (
        <div className="notice error" role="alert">
          {results.error}{' '}
          <button className="button secondary" onClick={results.retry}>
            Tentar novamente
          </button>
        </div>
      )}
      {results.loading && <p role="status">Consultando o compêndio…</p>}
      {!results.loading && !results.error && !results.entries.length && (
        <p className="notice">Nenhum registro encontrado. Experimente outro nome.</p>
      )}
      <div className="content-grid">
        {results.entries.map((entry) => (
          <article className="content-card" key={entry.ref.recordId}>
            <span className="eyebrow">
              {kinds.find(([key]) => key === entry.kind)?.[1]}
              {entry.circle !== undefined &&
                ` · ${entry.circle === 0 ? 'Truque' : `Círculo ${entry.circle}`}`}
            </span>
            <h2>
              <button onClick={() => setSelected(entry)}>{entry.name}</button>
            </h2>
            <p>{entry.originalName || entry.school || entry.sourceTitle}</p>
            <div className="card-tags">
              {entry.ritual && <span>Ritual</span>}
              {entry.concentration && <span>Concentração</span>}
              {!entry.reviewed2024 && <span>Revisão 2024 pendente</span>}
              {entry.origin === 'homebrew' && <span>Homebrew</span>}
            </div>
            <button className="text-button" onClick={() => setSourceId(entry.sourceId)}>
              {entry.sourceTitle}
            </button>
          </article>
        ))}
      </div>
      {results.nextCursor && (
        <button className="button secondary more" disabled={results.loading} onClick={results.more}>
          Mostrar mais registros
        </button>
      )}
      {selected && (
        <EntryDetails entry={selected} repository={repository} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
function facts(entry: CompendiumEntry, catalog: CreationCatalog): [string, string][] {
  const name = (id: string) => catalog.entries.find((e) => e.ref.revisionId === id)?.name || '';
  switch (entry.kind) {
    case 'magia': {
      const s = entry.data;
      return [
        ['Escola', s.school],
        ['Tempo de conjuração', s.castingTime],
        ['Alcance', s.range],
        ['Duração', s.duration],
        [
          'Dano',
          [...s.damages]
            .sort((a, b) => a.order - b.order)
            .map((damage) => [damage.dice, damage.damageType].filter(Boolean).join(' '))
            .join(', '),
        ],
        [
          'Componentes',
          [
            s.components.verbal && 'V',
            s.components.somatic && 'S',
            s.components.material && `M (${s.components.material})`,
          ]
            .filter(Boolean)
            .join(', '),
        ],
        ['Listas de classes', s.classRefs.map((r) => name(r.revisionId)).join(', ')],
      ];
    }
    case 'equipamento': {
      const d = entry.data;
      return [
        ['Categoria', d.category],
        ['Peso', d.weight === null ? '' : `${d.weight} ${d.weightUnit}`],
        [
          'Custo',
          d.cost === null ? '' : `${d.cost} ${d.currencyRef ? name(d.currencyRef.revisionId) : ''}`,
        ],
        ['Dano', d.weapon?.damages.map((v) => `${v.dice} ${v.damageType}`).join(', ') || ''],
        [
          'Classe de armadura',
          d.armor
            ? `${d.armor.baseAc}${d.armor.addDexterity ? ` + DES${d.armor.dexterityLimit !== null ? ` (máx. ${d.armor.dexterityLimit})` : ''}` : ''}`
            : d.shield
              ? `+${d.shield.acBonus}`
              : '',
        ],
      ];
    }
    case 'classe':
      return [
        ['Dado de vida', `d${entry.data.hitDie}`],
        ['PV fixos por nível', String(entry.data.fixedHitPoints)],
        ['Atributos principais', entry.data.primaryAbilities.join(', ').toUpperCase()],
      ];
    case 'especie':
      return [
        ['Tipo de criatura', entry.data.creatureType],
        [
          'Tamanhos',
          entry.data.sizes.map((s) => `${s.code}${s.form ? ` (${s.form})` : ''}`).join(', '),
        ],
        [
          'Deslocamentos',
          entry.data.movements
            .map((m) => `${m.mode}: ${m.distance} ${m.unit}${m.form ? ` (${m.form})` : ''}`)
            .join('; '),
        ],
      ];
    case 'talento':
      return [
        ['Categoria', entry.data.category],
        ['Pré-requisito', entry.data.prerequisiteText || 'Nenhum'],
        ['Repetível', entry.data.repeatable ? 'Sim' : 'Não'],
      ];
    case 'subclasse':
      return [
        ['Classe', name(entry.data.classRef.revisionId)],
        ['Nível de aquisição', String(entry.data.acquisitionLevel)],
      ];
    case 'linhagem':
      return [['Espécie', name(entry.data.speciesRef.revisionId)]];
    default:
      return [];
  }
}
export function EntryDetails({
  entry,
  repository,
  onClose,
}: {
  entry: CompendiumSummary;
  repository: CompendiumRepository;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [catalog, setCatalog] = useState<CreationCatalog | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    repository
      .getContext(entry.ref, controller.signal)
      .then(setCatalog)
      .catch(() => {
        if (!controller.signal.aborted) setError('Não foi possível abrir este registro.');
      });
    return () => controller.abort();
  }, [repository, entry.ref.revisionId, attempt]);
  const detail = catalog?.entries.find((e) => e.ref.revisionId === entry.ref.revisionId);
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
      {error && (
        <div role="alert">
          {error} <button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</button>
        </div>
      )}
      {!detail && !error && <p role="status">Carregando descrição…</p>}
      {detail && catalog && (
        <>
          <dl className="compendium-facts">
            {facts(detail, catalog)
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          <div className="rich-text compendium-description">
            {detail.description.split(/\n\s*\n/).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          <p className="source-label">
            {detail.source.title} · {detail.source.edition} ·{' '}
            {detail.reviewed2024 ? 'Revisado para 2024' : 'Compatibilidade 2024 em revisão'}
          </p>
          {detail.source.attribution && <p className="muted">{detail.source.attribution}</p>}
          {/^https?:\/\//.test(detail.source.referenceUrl) && (
            <p>
              <a href={detail.source.referenceUrl} target="_blank" rel="noreferrer">
                Consultar referência ↗
              </a>
            </p>
          )}
          {detail.source.path.endsWith('.html') && (
            <p>
              <a href={legacyUrl(detail.source.path)}>Ver no compêndio original ↗</a>
            </p>
          )}
        </>
      )}
    </dialog>
  );
}
