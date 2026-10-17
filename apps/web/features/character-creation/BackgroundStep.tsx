import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel, EquipmentChoices } from './ChoicePanel';
import { clearOrigins } from './origins';
import type { StepProps } from './types';
export function BackgroundStep(props: StepProps) {
  const { draft, catalog, onChange, repository } = props;
  const entry = catalog.entries.find((e) => e.ref.revisionId === draft.backgroundRef?.revisionId);
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
          <div className="creation-abilities">
            {entry.data.abilities.map((ability) => (
              <label key={ability}>
                {ATRIBUTOS[ability]}: bônus do antecedente
                <input
                  type="number"
                  min="0"
                  max="2"
                  value={draft.abilities.backgroundBonuses[ability] ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      abilities: {
                        ...draft.abilities,
                        backgroundBonuses: {
                          ...draft.abilities.backgroundBonuses,
                          [ability]: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <details>
            <summary>Benefícios e descrição de {entry.name}</summary>
            <p className="creation-description">{entry.description}</p>
          </details>
        </>
      )}
      <ChoicePanel {...props} prefixes={['background']} />
      <EquipmentChoices {...props} prefixes={['background']} />
    </section>
  );
}
