import { useEffect } from 'react';
import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel } from './ChoicePanel';
import { clearOrigins } from './origins';
import type { StepProps } from './types';
export function SpeciesStep(props: StepProps) {
  const { draft, catalog, onChange, repository } = props;
  const species = catalog.entries.find((e) => e.ref.revisionId === draft.speciesRef?.revisionId);
  const lineage = catalog.entries.find((e) => e.ref.revisionId === draft.lineageRef?.revisionId);
  useEffect(() => {
    if (species?.kind === 'especie' && draft.size === null) {
      const s = species.data.sizes.find((s) => s.default) ?? species.data.sizes[0];
      if (s) onChange({ ...draft, size: s.code, form: s.form });
    }
  }, [species?.ref.revisionId]);
  const sizes = species?.kind === 'especie' ? species.data.sizes : [];
  return (
    <section>
      <h2>Espécie e linhagem</h2>
      <p>As opções vêm do compêndio da mesa. Confira a fonte e os traços da espécie escolhida.</p>
      <CatalogSelect
        label="Espécie"
        searchLabel="Buscar espécie"
        kind="especie"
        value={draft.speciesRef}
        valueName={species?.name}
        repository={repository}
        onChange={(ref) =>
          onChange({
            ...clearOrigins(
              draft,
              ['species', 'lineage'],
              [draft.speciesRef?.revisionId ?? '', draft.lineageRef?.revisionId ?? ''],
              catalog,
            ),
            speciesRef: ref,
            lineageRef: null,
            size: null,
            form: '',
          })
        }
      />
      {species?.kind === 'especie' && (
        <>
          <p className="notice">
            {species.name} · Tipo: {species.data.creatureType} · {species.source.title}
          </p>
          <div className="creation-fields">
            <label>
              Forma
              <select
                aria-label="Forma"
                value={draft.form}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    form: e.target.value,
                    size: sizes.find((s) => s.form === e.target.value)?.code ?? null,
                  })
                }
              >
                {[...new Set(sizes.map((s) => s.form))].map((form) => (
                  <option key={form} value={form}>
                    {form || 'Padrão'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tamanho
              <select
                aria-label="Tamanho"
                value={draft.size ?? ''}
                onChange={(e) => onChange({ ...draft, size: e.target.value || null })}
              >
                <option value="">Escolha…</option>
                {sizes
                  .filter((s) => !s.form || s.form === draft.form)
                  .map((s) => (
                    <option key={s.code + s.form} value={s.code}>
                      {s.code}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <CatalogSelect
            label="Linhagem (quando houver)"
            searchLabel="Buscar linhagem"
            kind="linhagem"
            parentRevisionId={species.ref.revisionId}
            value={draft.lineageRef}
            valueName={lineage?.name}
            repository={repository}
            onChange={(ref) =>
              onChange({
                ...clearOrigins(draft, ['lineage'], [draft.lineageRef?.revisionId ?? '']),
                lineageRef: ref,
              })
            }
          />
          <details>
            <summary>Descrição da espécie</summary>
            <p className="creation-description">{species.description}</p>
          </details>
        </>
      )}
      <ChoicePanel {...props} prefixes={['species', 'lineage']} />
    </section>
  );
}
