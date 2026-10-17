import { useState } from 'react';
import type { CreationChoiceValue } from '../../../../packages/contracts/character-creation';
import type { ActiveChoice } from '../../../../packages/character-creation/concessions';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';
import { normalize } from '../../lib/paths';
import type { StepProps } from './types';
function Choice({
  instance,
  group,
  unavailableOptions,
  draft,
  onChange,
}: ActiveChoice & Pick<StepProps, 'draft' | 'onChange'>) {
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(24);
  const values =
    draft.choices.find((c) => c.sourceInstanceId === instance.id && c.groupId === group.id)
      ?.values ?? [];
  const set = (values: CreationChoiceValue[]) =>
    onChange({
      ...draft,
      choices: [
        ...draft.choices.filter(
          (c) => !(c.sourceInstanceId === instance.id && c.groupId === group.id),
        ),
        { groupId: group.id, sourceInstanceId: instance.id, values },
      ],
    });
  const options = group.options
    .filter((o) => normalize(o.name).includes(normalize(query)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return (
    <fieldset className="creation-choice">
      <legend>{group.name}</legend>
      <p className="muted">
        {instance.selectionLabel ?? instance.entry.name} · Escolha{' '}
        {group.minimum === group.maximum ? group.minimum : `de ${group.minimum} a ${group.maximum}`}
        .
      </p>
      {group.abilityPoints !== null ? (
        <div className="creation-abilities">
          {group.options
            .filter((o) => o.ability)
            .map((o) => (
              <label key={o.id}>
                {ATRIBUTOS[o.ability!]}: aumento
                <input
                  type="number"
                  min="0"
                  max={group.abilityPoints!}
                  value={
                    values.find((v) => v.type === 'ability' && v.ability === o.ability)?.type ===
                    'ability'
                      ? (
                          values.find((v) => v.type === 'ability' && v.ability === o.ability) as {
                            amount: number;
                          }
                        ).amount
                      : 0
                  }
                  onChange={(e) =>
                    set([
                      ...values.filter((v) => v.type !== 'ability' || v.ability !== o.ability),
                      ...(Number(e.target.value) > 0
                        ? [
                            {
                              type: 'ability' as const,
                              ability: o.ability!,
                              amount: Number(e.target.value),
                            },
                          ]
                        : []),
                    ])
                  }
                />
              </label>
            ))}
        </div>
      ) : (
        <>
          {group.options.length > 24 && (
            <label>
              Buscar em {group.name}
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(24);
                }}
              />
            </label>
          )}
          <div className="creation-options">
            {options.slice(0, limit).map((o) => {
              const checked = values.some((v) => v.type === 'option' && v.optionId === o.id);
              const unavailable = unavailableOptions?.[o.id];
              return (
                <label key={o.id}>
                  <input
                    type={group.maximum === 1 ? 'radio' : 'checkbox'}
                    name={`${instance.id}:${group.id}`}
                    checked={checked}
                    disabled={
                      !checked &&
                      (!!unavailable || (values.length >= group.maximum && group.maximum !== 1))
                    }
                    onChange={() =>
                      set(
                        group.maximum === 1
                          ? [{ type: 'option', optionId: o.id }]
                          : checked
                            ? values.filter((v) => v.type !== 'option' || v.optionId !== o.id)
                            : [...values, { type: 'option', optionId: o.id }],
                      )
                    }
                  />
                  {(PERICIAS as Record<string, string[]>)[o.name]?.[0] ?? o.name}
                  {unavailable && <small className="muted"> {unavailable}</small>}
                </label>
              );
            })}
          </div>
          {options.length > limit && (
            <button className="button secondary" onClick={() => setLimit((n) => n + 24)}>
              Mostrar mais escolhas
            </button>
          )}
          {!group.options.length && (
            <p className="notice">Este grupo ainda precisa de opções cadastradas no compêndio.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
export function ChoicePanel(props: StepProps & { prefixes: string[] }) {
  const resolved = resolveConcessions(props.catalog, props.draft);
  return (
    <>
      {resolved.choices
        .filter((c) => props.prefixes.some((prefix) => c.instance.id.startsWith(prefix)))
        .map((c) => (
          <Choice
            key={`${c.instance.id}:${c.group.id}`}
            {...c}
            draft={props.draft}
            onChange={props.onChange}
          />
        ))}
    </>
  );
}
export function EquipmentChoices({
  draft,
  catalog,
  onChange,
  prefixes,
}: StepProps & { prefixes: string[] }) {
  const nodes = resolveConcessions(catalog, draft).instances.filter((i) =>
    prefixes.some((p) => i.id.startsWith(p)),
  );
  return (
    <>
      {nodes.map((node) => {
        const options = catalog.equipmentOptions.filter(
          (o) =>
            o.ownerRevisionId === node.entry.ref.revisionId &&
            (o.acquisition === 'ambas' || o.acquisition === node.acquisition),
        );
        if (!options.length) return null;
        return (
          <label className="creation-kit" key={node.id}>
            Equipamento de {node.entry.name}
            <select
              aria-label={`Equipamento de ${node.entry.name}`}
              value={
                draft.equipmentOptions.find((o) => o.ownerRevisionId === node.entry.ref.revisionId)
                  ?.optionId ?? ''
              }
              onChange={(e) =>
                onChange({
                  ...draft,
                  equipmentOptions: [
                    ...draft.equipmentOptions.filter(
                      (o) => o.ownerRevisionId !== node.entry.ref.revisionId,
                    ),
                    ...(e.target.value
                      ? [{ ownerRevisionId: node.entry.ref.revisionId, optionId: e.target.value }]
                      : []),
                  ],
                })
              }
            >
              <option value="">Escolha um kit ou moedas…</option>
              {options.map((o) => {
                const pack = catalog.entries.find(
                  (e) => e.ref.revisionId === o.packageRef.revisionId,
                );
                return (
                  <option key={o.id} value={o.id}>
                    {o.name} · {pack?.kind === 'pacote' ? pack.data.notes : pack?.name}
                  </option>
                );
              })}
            </select>
          </label>
        );
      })}
    </>
  );
}
