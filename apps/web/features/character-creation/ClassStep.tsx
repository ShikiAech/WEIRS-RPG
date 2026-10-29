import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel } from './ChoicePanel';
import { clearOrigins } from './origins';
import { commitClassLevels } from './class-levels';
import type { StepProps } from './types';
import type { CompendiumRef } from '../../../../packages/contracts/compendium';
import type { CreationClass } from '../../../../packages/contracts/character-creation';
export function ClassStep(props: StepProps) {
  const { draft, catalog, onChange, repository, classLevelInputs, preview } = props;
  const rows = draft.classes.length
    ? draft.classes
    : [{ id: '', classRef: null, subclassRef: null, level: 1 }];
  function choose(index: number, ref: CompendiumRef | null) {
    const old = draft.classes[index];
    const clean = clearOrigins(
      draft,
      old ? [`class:${old.id}`, `subclass:${old.id}`] : [],
      old ? [old.classRef.revisionId, old.subclassRef?.revisionId ?? ''] : [],
      catalog,
    );
    const classes = [...clean.classes],
      levels = clean.levels.filter((l) => l.classEntryId !== old?.id);
    if (!ref) {
      classes.splice(index, 1);
    } else {
      const row: CreationClass = {
        id: old?.id ?? crypto.randomUUID(),
        classRef: ref,
        subclassRef: null,
        level: 1,
      };
      classes[index] = row;
      const oldPosition = old
        ? draft.levels.findIndex((l) => l.classEntryId === old.id)
        : levels.length;
      levels.splice(Math.max(0, oldPosition), 0, {
        totalLevel: 0,
        classEntryId: row.id,
        hitPointMethod: 'fixed',
        hitPointRoll: null,
      });
    }
    onChange({ ...clean, classes, levels: levels.map((l, i) => ({ ...l, totalLevel: i + 1 })) });
  }
  function level(index: number, value: string) {
    const cls = draft.classes[index];
    const inputs = { ...classLevelInputs, [cls.id]: value };
    onChange(commitClassLevels(draft, catalog, { [cls.id]: value }), inputs);
  }
  return (
    <section>
      <h2>Classes e progressão</h2>
      <p>
        A primeira classe na ordem de aquisição define os benefícios iniciais. Cada nível conserva
        sua classe e resultado de vida.
      </p>
      {rows.map((row, index) => {
        const entry = row.classRef
          ? catalog.entries.find((e) => e.ref.revisionId === row.classRef?.revisionId)
          : null;
        const sub = catalog.entries.find((e) => e.ref.revisionId === row.subclassRef?.revisionId);
        const levelId = `creation-class-level-${row.id}`;
        const levelError = preview.problems.find(
          (problem) => problem.field === `classes.${row.id}.level`,
        );
        return (
          <fieldset className="creation-class" key={row.id || 'empty'}>
            <legend>{index === 0 ? 'Classe inicial' : `Multiclasse ${index}`}</legend>
            <CatalogSelect
              label={index === 0 ? 'Classe' : `Classe ${index + 1}`}
              searchLabel={index === 0 ? 'Buscar classe' : `Buscar classe ${index + 1}`}
              kind="classe"
              value={row.classRef}
              valueName={entry?.name}
              repository={repository}
              onChange={(ref) => choose(index, ref)}
            />
            {row.classRef && (
              <>
                <div className="field">
                  <label htmlFor={levelId}>Níveis em {entry?.name ?? 'classe'}</label>
                  <input
                    id={levelId}
                    type="number"
                    min="1"
                    max="20"
                    required
                    aria-invalid={!!levelError}
                    aria-describedby={levelError ? `${levelId}-error` : undefined}
                    value={classLevelInputs?.[row.id] ?? row.level}
                    onChange={(e) =>
                      onChange(draft, { ...classLevelInputs, [row.id]: e.target.value })
                    }
                    onBlur={(e) => level(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                  <small className="muted">O nível é aplicado ao sair do campo.</small>
                  {levelError && (
                    <small className="field-error" id={`${levelId}-error`} role="alert">
                      {levelError.message}
                    </small>
                  )}
                </div>
                {entry?.kind === 'classe' &&
                  entry.data.subclassLevel !== undefined &&
                  row.level >= entry.data.subclassLevel && (
                    <CatalogSelect
                      label={`Subclasse de ${entry?.name ?? 'classe'}`}
                      searchLabel={`Buscar subclasse de ${entry?.name ?? 'classe'}`}
                      kind="subclasse"
                      parentRevisionId={row.classRef.revisionId}
                      value={row.subclassRef}
                      valueName={sub?.name}
                      repository={repository}
                      onChange={(ref) =>
                        onChange({
                          ...clearOrigins(
                            draft,
                            [`subclass:${row.id}`],
                            [row.subclassRef?.revisionId ?? ''],
                            catalog,
                          ),
                          classes: draft.classes.map((c, i) =>
                            i === index ? { ...c, subclassRef: ref } : c,
                          ),
                        })
                      }
                    />
                  )}
                {entry?.kind === 'classe' && (
                  <p className="muted">
                    Dado de vida: d{entry.data.hitDie} · PV fixos posteriores:{' '}
                    {entry.data.fixedHitPoints} + CON
                  </p>
                )}
              </>
            )}
            {index > 0 && (
              <button className="button secondary" onClick={() => choose(index, null)}>
                Remover esta classe
              </button>
            )}
          </fieldset>
        );
      })}
      {draft.classes.length > 0 && draft.classes.length < 20 && (
        <CatalogSelect
          label="Adicionar multiclasse"
          searchLabel="Buscar nova classe"
          kind="classe"
          value={null}
          repository={repository}
          onChange={(ref) => {
            if (ref) choose(draft.classes.length, ref);
          }}
        />
      )}
      <ChoicePanel equipment="omit" {...props} prefixes={['class:', 'subclass:']} />
      <p>
        Os kits e moedas da classe inicial estão em{' '}
        <button
          type="button"
          disabled={!draft.classes.length}
          onClick={() => props.onGoToStep?.(4)}
        >
          5 · Vida e defesas
        </button>
        .
      </p>
      {draft.levels.length > 1 && (
        <details>
          <summary>Ordem de aquisição dos níveis</summary>
          <ol className="creation-level-order">
            {draft.levels.map((level, index) => {
              const cls = draft.classes.find((c) => c.id === level.classEntryId),
                entry = catalog.entries.find((e) => e.ref.revisionId === cls?.classRef.revisionId);
              return (
                <li key={index}>
                  {entry?.name} · nível total {index + 1}
                  {index > 0 && draft.levels[index - 1].classEntryId !== level.classEntryId && (
                    <button
                      className="button secondary"
                      aria-label={`Antecipar nível ${index + 1}`}
                      onClick={() => {
                        const levels = [...draft.levels];
                        [levels[index - 1], levels[index]] = [levels[index], levels[index - 1]];
                        onChange({
                          ...draft,
                          levels: levels.map((l, i) => ({
                            ...l,
                            totalLevel: i + 1,
                            ...(i === 0
                              ? { hitPointMethod: 'fixed' as const, hitPointRoll: null }
                              : {}),
                          })),
                        });
                      }}
                    >
                      ↑
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
