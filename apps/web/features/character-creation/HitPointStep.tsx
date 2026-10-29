import { ChoicePanel, EquipmentChoices } from './ChoicePanel';
import type { StepProps } from './types';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import { Dropdown } from '../../components/Dropdown';
export function HitPointStep(props: StepProps) {
  const { draft, catalog, preview, onChange } = props;
  const nodes = resolveConcessions(catalog, draft).instances;
  const equipment = nodes.flatMap((i) =>
    i.entry.kind === 'equipamento'
      ? [i.entry.ref]
      : i.entry.kind === 'pacote'
        ? i.entry.data.items.flatMap((item) => (item.equipmentRef ? [item.equipmentRef] : []))
        : [],
  );
  const equippable = [...new Map(equipment.map((ref) => [ref.revisionId, ref])).values()].flatMap(
    (ref) => {
      const entry = catalog.entries.find((entry) => entry.ref.revisionId === ref.revisionId);
      return entry?.kind === 'equipamento' &&
        (entry.data.armor || entry.data.shield || entry.data.weapon)
        ? [{ ref, label: entry.name }]
        : [];
    },
  );
  return (
    <section>
      <h2>Vida e defesas</h2>
      <p>
        O primeiro nível total usa o máximo do dado. Nos demais níveis, escolha o valor fixo ou
        registre uma rolagem. Cada dado pode ser rolado uma única vez por nível; mudar Constituição
        recalcula o total mantendo o resultado.
      </p>
      <p className="creation-total">PV máximos: {preview.hitPoints.total}</p>
      <div className="creation-hp">
        {draft.levels.map((level, index) => {
          const row = preview.hitPoints.levels.find((l) => l.totalLevel === index + 1);
          const cls = draft.classes.find((c) => c.id === level.classEntryId),
            entry = catalog.entries.find((e) => e.ref.revisionId === cls?.classRef.revisionId);
          const rolled = level.hitPointMethod === 'roll' && level.hitPointRoll !== null;
          return (
            <fieldset key={index}>
              <legend>
                Nível {index + 1} · {entry?.name}
              </legend>
              {index === 0 ? (
                <p>Máximo do dado: {row?.die ?? '—'}</p>
              ) : (
                <>
                  <Dropdown
                    label={`Método de PV do nível ${index + 1}`}
                    disabled={rolled}
                    searchable={false}
                    value={level.hitPointMethod}
                    onSelect={(value) => {
                      if (rolled) return;
                      const method = value as typeof level.hitPointMethod;
                      onChange({
                        ...draft,
                        levels: draft.levels.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                hitPointMethod: method,
                                hitPointRoll: method === 'roll' ? null : l.hitPointRoll,
                              }
                            : l,
                        ),
                      });
                    }}
                    options={[
                      { value: 'fixed', label: 'Valor fixo' },
                      { value: 'roll', label: 'Rolar dado' },
                      { value: 'external', label: 'Resultado externo' },
                    ]}
                  />
                  {level.hitPointMethod !== 'fixed' && (
                    <div className="creation-roll">
                      <label>
                        Resultado de PV do nível {index + 1}
                        <input
                          type="number"
                          min="1"
                          max={row?.die ?? 12}
                          disabled={level.hitPointMethod === 'roll'}
                          value={level.hitPointRoll ?? ''}
                          onChange={(e) => {
                            if (level.hitPointMethod !== 'external') return;
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
                            });
                          }}
                        />
                      </label>
                      {level.hitPointMethod === 'roll' && (
                        <button
                          className="button secondary"
                          disabled={rolled}
                          onClick={() => {
                            if (rolled) return;
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
                      {rolled && (
                        <small className="creation-selection-count" role="status">
                          Rolagem registrada: {level.hitPointRoll}. Resultado e método confirmados.
                        </small>
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
      <h3 id="creation-starting-equipment">Equipamentos iniciais</h3>
      <p>
        Escolha os kits ou moedas da classe inicial e do antecedente. Classes adicionais não
        concedem um novo kit.
      </p>
      <EquipmentChoices {...props} prefixes={['class:', 'background']} />
      <ChoicePanel {...props} prefixes={['class:', 'background']} equipment="only" />
      <h3>Equipar itens recebidos</h3>
      {!equippable.length && <p>Nenhum item recebido pode ser equipado nesta etapa.</p>}
      <Dropdown
        label="Buscar equipamentos iniciais"
        popupLabel="Armaduras, escudos e armas iniciais"
        multiple
        placeholder="Busque armaduras, escudos e armas…"
        emptyText="Nenhum equipamento inicial encontrado."
        selectedValues={equippable
          .filter(({ ref }) =>
            draft.equippedRefs?.some((item) => item.revisionId === ref.revisionId),
          )
          .map(({ ref }) => ref.revisionId)}
        options={equippable.map(({ ref, label }) => ({ value: ref.revisionId, label }))}
        onSelect={(revisionId) => {
          const equipment = equippable.find(({ ref }) => ref.revisionId === revisionId);
          if (!equipment) return;
          const checked = draft.equippedRefs?.some((ref) => ref.revisionId === revisionId);
          onChange({
            ...draft,
            equippedRefs: checked
              ? draft.equippedRefs?.filter((ref) => ref.revisionId !== revisionId)
              : [...(draft.equippedRefs ?? []), equipment.ref],
          });
        }}
        onClear={() =>
          onChange({
            ...draft,
            equippedRefs: (draft.equippedRefs ?? []).filter(
              (ref) => !equippable.some((item) => item.ref.revisionId === ref.revisionId),
            ),
          })
        }
        clearLabel="Limpar equipamentos iniciais"
      />
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
