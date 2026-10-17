import type { StepProps } from './types';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
export function HitPointStep({ draft, catalog, preview, onChange }: StepProps) {
  const nodes = resolveConcessions(catalog, draft).instances;
  const equipment = nodes.flatMap((i) =>
    i.entry.kind === 'equipamento'
      ? [i.entry.ref]
      : i.entry.kind === 'pacote'
        ? i.entry.data.items.flatMap((item) => (item.equipmentRef ? [item.equipmentRef] : []))
        : [],
  );
  return (
    <section>
      <h2>Vida e defesas</h2>
      <p>
        O primeiro nível total usa o máximo do dado. Nos demais níveis, escolha o valor fixo ou
        registre uma rolagem; mudar Constituição recalcula o total sem rerrolar.
      </p>
      <p className="creation-total">PV máximos: {preview.hitPoints.total}</p>
      <div className="creation-hp">
        {draft.levels.map((level, index) => {
          const row = preview.hitPoints.levels.find((l) => l.totalLevel === index + 1);
          const cls = draft.classes.find((c) => c.id === level.classEntryId),
            entry = catalog.entries.find((e) => e.ref.revisionId === cls?.classRef.revisionId);
          return (
            <fieldset key={index}>
              <legend>
                Nível {index + 1} · {entry?.name}
              </legend>
              {index === 0 ? (
                <p>Máximo do dado: {row?.die ?? '—'}</p>
              ) : (
                <>
                  <label>
                    Método de PV do nível {index + 1}
                    <select
                      aria-label={`Método de PV do nível ${index + 1}`}
                      value={level.hitPointMethod}
                      onChange={(e) =>
                        onChange({
                          ...draft,
                          levels: draft.levels.map((l, i) =>
                            i === index
                              ? { ...l, hitPointMethod: e.target.value as typeof l.hitPointMethod }
                              : l,
                          ),
                        })
                      }
                    >
                      <option value="fixed">Valor fixo</option>
                      <option value="roll">Rolar dado</option>
                      <option value="external">Resultado externo</option>
                    </select>
                  </label>
                  {level.hitPointMethod !== 'fixed' && (
                    <div className="creation-roll">
                      <label>
                        Resultado de PV do nível {index + 1}
                        <input
                          type="number"
                          min="1"
                          max={row?.die ?? 12}
                          value={level.hitPointRoll ?? ''}
                          onChange={(e) =>
                            onChange({
                              ...draft,
                              levels: draft.levels.map((l, i) =>
                                i === index
                                  ? {
                                      ...l,
                                      hitPointRoll:
                                        e.target.value === '' ? null : Number(e.target.value),
                                    }
                                  : l,
                              ),
                            })
                          }
                        />
                      </label>
                      {level.hitPointMethod === 'roll' && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            const die = row?.die ?? 8;
                            const values = new Uint32Array(1);
                            crypto.getRandomValues(values);
                            onChange({
                              ...draft,
                              levels: draft.levels.map((l, i) =>
                                i === index ? { ...l, hitPointRoll: (values[0] % die) + 1 } : l,
                              ),
                            });
                          }}
                        >
                          Rolar d{row?.die ?? 8} para nível {index + 1}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              <small>
                {row
                  ? `${row.roll} + CON (${row.constitution}) + bônus (${row.bonus}) = ${row.gain} PV`
                  : 'Selecione a classe deste nível.'}
              </small>
            </fieldset>
          );
        })}
      </div>
      <h3>Equipar itens iniciais</h3>
      <div className="creation-options">
        {[...new Map(equipment.map((r) => [r.revisionId, r])).values()].map((ref) => {
          const e = catalog.entries.find((e) => e.ref.revisionId === ref.revisionId);
          if (e?.kind !== 'equipamento' || (!e.data.armor && !e.data.shield && !e.data.weapon))
            return null;
          const checked = draft.equippedRefs?.some((r) => r.revisionId === ref.revisionId) ?? false;
          return (
            <label key={ref.revisionId}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange({
                    ...draft,
                    equippedRefs: checked
                      ? draft.equippedRefs?.filter((r) => r.revisionId !== ref.revisionId)
                      : [...(draft.equippedRefs ?? []), ref],
                  })
                }
              />
              {e.name}
            </label>
          );
        })}
      </div>
      <p>
        Classe de armadura: <strong>{preview.defenses.armorClass}</strong> ·{' '}
        {preview.defenses.formula}
      </p>
      <p>
        {preview.defenses.movements.map((m) => `${m.mode}: ${m.meters} m`).join(' · ') ||
          'Nenhum deslocamento automático disponível.'}
      </p>
    </section>
  );
}
