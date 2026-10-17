import { CatalogSelect } from './CatalogSelect';
import { ChoicePanel, EquipmentChoices } from './ChoicePanel';
import { clearOrigins } from './origins';
import type { StepProps } from './types';
import type { CompendiumRef } from '../../../../packages/contracts/compendium';
import type { CreationClass } from '../../../../packages/contracts/character-creation';
export function ClassStep(props: StepProps) {
  const { draft, catalog, onChange, repository } = props;
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
  function level(index: number, n: number) {
    if (!Number.isInteger(n) || n < 1 || n > 20) return;
    const cls = draft.classes[index],
      subclass = catalog.entries.find((e) => e.ref.revisionId === cls.subclassRef?.revisionId),
      classes = draft.classes.map((c, i) =>
        i === index
          ? {
              ...c,
              level: n,
              subclassRef:
                subclass?.kind === 'subclasse' && n < subclass.data.acquisitionLevel
                  ? null
                  : c.subclassRef,
            }
          : c,
      ),
      existing = draft.levels.filter((l) => l.classEntryId === cls.id),
      removed = new Set(existing.slice(n));
    const levels = draft.levels.filter((l) => !removed.has(l));
    for (let i = existing.length; i < n; i++)
      levels.push({
        totalLevel: 0,
        classEntryId: cls.id,
        hitPointMethod: 'fixed',
        hitPointRoll: null,
      });
    onChange({ ...draft, classes, levels: levels.map((l, i) => ({ ...l, totalLevel: i + 1 })) });
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
                <label>
                  Níveis em {entry?.name ?? 'classe'}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={row.level}
                    onChange={(e) => level(index, Number(e.target.value))}
                  />
                </label>
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
      <ChoicePanel {...props} prefixes={['class:', 'subclass:']} />
      <EquipmentChoices {...props} prefixes={['class:', 'subclass:']} />
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
                  {index > 0 && (
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
