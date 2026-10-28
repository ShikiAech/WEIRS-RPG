import { useEffect, useState } from 'react';
import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel } from './ChoicePanel';
import { clearOrigins } from './origins';
import type { StepProps } from './types';
import { Dropdown } from '../../components/Dropdown';
import { speciesControls } from './species-controls';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
export function SpeciesStep(props: StepProps) {
  const { draft, catalog, onChange, repository } = props;
  const species = catalog.entries.find((e) => e.ref.revisionId === draft.speciesRef?.revisionId);
  const lineage = catalog.entries.find((e) => e.ref.revisionId === draft.lineageRef?.revisionId);
  const controls =
    species?.kind === 'especie'
      ? speciesControls(species.data, draft.form, draft.size)
      : { forms: [], sizes: [], form: '', size: null };
  const [lineages, setLineages] = useState<{
    key: string;
    state: 'loading' | 'ready' | 'error';
    available: boolean;
  }>({ key: '', state: 'loading', available: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (
      species?.kind === 'especie' &&
      (draft.size !== controls.size || draft.form !== controls.form)
    )
      onChange({ ...draft, size: controls.size, form: controls.form });
  }, [species?.ref.revisionId, draft.size, draft.form]);
  useEffect(() => {
    if (species?.kind !== 'especie') return;
    const controller = new AbortController(),
      key = species.ref.revisionId;
    setLineages({ key, state: 'loading', available: false });
    repository
      .list(
        { ruleSetId: draft.ruleSetId, kind: 'linhagem', parentRevisionId: key, limit: 1 },
        controller.signal,
      )
      .then((page) => {
        if (!controller.signal.aborted)
          setLineages({ key, state: 'ready', available: page.entries.length > 0 });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLineages({ key, state: 'error', available: false });
      });
    return () => controller.abort();
  }, [species?.ref.revisionId, repository, draft.ruleSetId, attempt]);
  const sizes = controls.sizes;
  const traits = resolveConcessions(catalog, draft).instances.filter(
    (i) =>
      (i.id.startsWith('species/grant:') || i.id.startsWith('lineage/grant:')) &&
      i.entry.kind === 'caracteristica',
  );
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
            {controls.forms.length > 1 && (
              <Dropdown
                label="Forma"
                searchable={false}
                value={draft.form}
                onSelect={(form) =>
                  onChange({
                    ...draft,
                    form,
                    size: speciesControls(species.data, form, null).size,
                  })
                }
                options={controls.forms.map((form) => ({
                  value: form,
                  label: form || 'Padrão',
                }))}
              />
            )}
            {sizes.length > 1 && (
              <Dropdown
                label="Tamanho"
                searchable={false}
                placeholder="Escolha…"
                value={draft.size}
                onSelect={(size) => onChange({ ...draft, size })}
                onClear={() => onChange({ ...draft, size: null })}
                options={sizes
                  .filter((s) => !s.form || s.form === draft.form)
                  .map((s) => ({ value: s.code, label: s.code }))}
              />
            )}
          </div>
          {(lineages.key !== species.ref.revisionId || lineages.state === 'loading') && (
            <p role="status">Consultando linhagens…</p>
          )}
          {lineages.key === species.ref.revisionId && lineages.state === 'error' && (
            <p role="alert">
              Não foi possível consultar as linhagens.{' '}
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                Tentar novamente
              </button>
            </p>
          )}
          {lineages.key === species.ref.revisionId &&
            lineages.state === 'ready' &&
            lineages.available && (
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
            )}
          {lineages.key === species.ref.revisionId &&
            lineages.state === 'ready' &&
            !lineages.available &&
            species.data.lineageRequired && (
              <p role="alert">
                Esta espécie exige uma linhagem, mas nenhuma está disponível no compêndio.
              </p>
            )}
          <ChoicePanel {...props} prefixes={['species', 'lineage']} />
          {traits.length > 0 && (
            <div className="creation-species-traits">
              <h3>Traços da espécie</h3>
              {traits.map((trait) => (
                <details key={trait.id}>
                  <summary>{trait.entry.name}</summary>
                  <p className="creation-description">{trait.entry.description}</p>
                </details>
              ))}
            </div>
          )}
          <details>
            <summary>Descrição da espécie</summary>
            <p className="creation-description">{species.description}</p>
          </details>
        </>
      )}
    </section>
  );
}
