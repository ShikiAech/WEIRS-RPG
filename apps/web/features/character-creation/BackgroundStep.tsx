import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel } from './ChoicePanel';
import { clearOrigins } from './origins';
import type { StepProps } from './types';
export function BackgroundStep(props: StepProps) {
  const { draft, catalog, preview, onChange, repository } = props;
  const entry = catalog.entries.find((e) => e.ref.revisionId === draft.backgroundRef?.revisionId);
  const bonuses = draft.abilities.backgroundBonuses;
  const distributed = Object.values(bonuses).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return (
    <section>
      <h2>Antecedente</h2>
      <p>
        Sua vida antes da aventura concede atributos, treinamento, talento e equipamento conforme a
        fonte selecionada.
      </p>
      <CatalogSelect
        label="Antecedente"
        searchLabel="Buscar antecedente"
        kind="antecedente"
        value={draft.backgroundRef}
        valueName={entry?.name}
        repository={repository}
        onChange={(ref) =>
          onChange({
            ...clearOrigins(
              draft,
              ['background'],
              [draft.backgroundRef?.revisionId ?? ''],
              catalog,
            ),
            backgroundRef: ref,
            abilities: { ...draft.abilities, backgroundBonuses: {} },
          })
        }
      />
      {entry?.kind === 'antecedente' && (
        <>
          <p className="notice">
            {entry.source.title}
            {entry.data.distribution === 'nenhuma'
              ? ' · Esta versão não concede aumentos de atributos.'
              : ' · Distribua +2 e +1, ou +1 em três atributos.'}
          </p>
          {entry.data.distribution !== 'nenhuma' && (
            <>
              <p className="creation-selection-count" role="status">
                Distribuídos: {distributed}/3
              </p>
              <div className="creation-abilities">
                {entry.data.abilities.map((ability) => {
                  const current = bonuses[ability];
                  const base = preview.baseAbilities[ability];
                  const limit =
                    base === undefined ? 2 : Math.max(0, entry.data.abilityLimit - base);
                  const maximum = Math.max(0, Math.min(2, 3 - distributed + (current ?? 0), limit));
                  const hintId = `background-bonus-${ability}-hint`;
                  return (
                    <label key={ability}>
                      {ATRIBUTOS[ability]}: bônus do antecedente
                      <input
                        aria-label={`${ATRIBUTOS[ability]}: bônus do antecedente`}
                        aria-describedby={hintId}
                        type="number"
                        min="0"
                        max={maximum}
                        step="1"
                        disabled={maximum === 0 && current === undefined}
                        value={current ?? ''}
                        onChange={(e) => {
                          const backgroundBonuses = { ...bonuses };
                          if (e.target.value === '') delete backgroundBonuses[ability];
                          else {
                            const value = Number(e.target.value);
                            if (!Number.isFinite(value)) return;
                            backgroundBonuses[ability] = Math.max(
                              0,
                              Math.min(maximum, Math.floor(value)),
                            );
                          }
                          onChange({
                            ...draft,
                            abilities: { ...draft.abilities, backgroundBonuses },
                          });
                        }}
                      />
                      <small id={hintId}>
                        {limit === 0
                          ? `Atributo no limite de ${entry.data.abilityLimit}.`
                          : maximum === 0
                            ? 'Os 3 pontos já foram distribuídos.'
                            : `Até +${maximum} · limite do atributo: ${entry.data.abilityLimit}`}
                      </small>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <details className="creation-accordion">
            <summary>Benefícios e descrição de {entry.name}</summary>
            <p className="creation-description">{entry.description}</p>
          </details>
        </>
      )}
      <ChoicePanel equipment="omit" {...props} prefixes={['background']} />
      <p>
        Escolha os kits e moedas do antecedente em{' '}
        <button
          type="button"
          disabled={!draft.classes.length}
          onClick={() => props.onGoToStep?.(4)}
        >
          5 · Vida e defesas
        </button>
        .
      </p>
    </section>
  );
}
