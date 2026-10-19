import { useId } from 'react';
import type { CreationChoiceValue } from '../../../../packages/contracts/character-creation';
import type { ActiveChoice } from '../../../../packages/character-creation/concessions';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';
import type { StepProps } from './types';
import { Dropdown } from '../../components/Dropdown';
import { CompendiumTooltip } from './CompendiumTooltip';
import { optionSelected, scoresBeforeAbilityChoice } from './choice-constraints';
function Choice({
  instance,
  group,
  unavailableOptions,
  draft,
  catalog,
  repository,
  onChange,
}: ActiveChoice & Pick<StepProps, 'draft' | 'catalog' | 'repository' | 'onChange'>) {
  const id = useId();
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
    .filter((option) => {
      const target = catalog.entries.find(
        (entry) => entry.ref.revisionId === option.targetRef?.revisionId,
      );
      // Unavailable skills remain visible so their training state is understandable.
      // A selected feat remains available for deselection if an earlier decision changes.
      const unavailable = unavailableOptions?.[option.id];
      return (
        !unavailable ||
        (target?.kind !== 'talento' && unavailable !== 'Requisitos ainda não atendidos.') ||
        values.some((value) => optionSelected(value, option))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const selectedIds = options
    .filter((option) => values.some((value) => optionSelected(value, option)))
    .map((option) => option.id);
  const optionName = (name: string) => (PERICIAS as Record<string, string[]>)[name]?.[0] ?? name;
  const reason = (optionId: string) =>
    unavailableOptions?.[optionId] ||
    (values.length >= group.maximum && group.maximum !== 1
      ? 'Limite de escolhas atingido.'
      : undefined);
  function toggle(optionId: string) {
    const option = options.find((option) => option.id === optionId);
    if (!option) return;
    const checked = values.some((value) => optionSelected(value, option));
    if (checked) set(values.filter((value) => !optionSelected(value, option)));
    else if (!reason(optionId))
      set(
        group.maximum === 1
          ? [{ type: 'option', optionId }]
          : [...values, { type: 'option', optionId }],
      );
  }
  const points = values.reduce(
    (total, value) => total + (value.type === 'ability' ? value.amount : 0),
    0,
  );
  const beforeScores =
    group.abilityPoints !== null
      ? scoresBeforeAbilityChoice(catalog, draft, { instance, group })
      : {};
  return (
    <fieldset className="creation-choice">
      <legend>{group.name}</legend>
      <p className="muted">
        {instance.selectionLabel ?? instance.entry.name} · Escolha{' '}
        {group.minimum === group.maximum ? group.minimum : `de ${group.minimum} a ${group.maximum}`}
        .
      </p>
      {group.abilityPoints !== null ? (
        <>
          <p className="creation-ability-budget" role="status">
            {points}/{group.abilityPoints} pontos distribuídos · Limite por atributo:{' '}
            {group.abilityLimit ?? 20}
          </p>
          <div className="creation-abilities">
            {group.options
              .filter((o) => o.ability)
              .map((o) => {
                const value = values.find(
                  (value) => value.type === 'ability' && value.ability === o.ability,
                );
                const current = value?.type === 'ability' ? value.amount : 0;
                const score = beforeScores[o.ability!];
                const maximum = Math.max(
                  0,
                  Math.min(
                    group.abilityPoints! - points + current,
                    score === undefined ? group.abilityPoints! : (group.abilityLimit ?? 20) - score,
                  ),
                );
                const disabled = maximum === 0 && current === 0;
                const disabledReason =
                  score !== undefined && score >= (group.abilityLimit ?? 20)
                    ? 'Este atributo já atingiu o limite.'
                    : 'Todos os pontos disponíveis foram distribuídos.';
                return (
                  <label key={o.id} className={disabled ? 'creation-option-disabled' : undefined}>
                    {ATRIBUTOS[o.ability!]}: aumento
                    <input
                      aria-label={`${ATRIBUTOS[o.ability!]}: aumento`}
                      aria-describedby={disabled ? `${id}-${o.id}-reason` : undefined}
                      type="number"
                      min="0"
                      step="1"
                      max={maximum}
                      disabled={disabled}
                      value={current || ''}
                      onChange={(e) => {
                        const amount =
                          e.target.value === ''
                            ? 0
                            : Math.max(0, Math.min(maximum, Math.trunc(Number(e.target.value))));
                        if (!Number.isFinite(amount)) return;
                        set([
                          ...values.filter((v) => v.type !== 'ability' || v.ability !== o.ability),
                          ...(amount > 0
                            ? [
                                {
                                  type: 'ability' as const,
                                  ability: o.ability!,
                                  amount,
                                },
                              ]
                            : []),
                        ]);
                      }}
                    />
                    {disabled && (
                      <small id={`${id}-${o.id}-reason`} className="creation-option-reason">
                        {disabledReason}
                      </small>
                    )}
                  </label>
                );
              })}
          </div>
        </>
      ) : (
        <>
          <Dropdown
            label={`Buscar em ${group.name}`}
            popupLabel={`Opções de ${group.name}`}
            multiple
            closeOnSelect={group.maximum === 1}
            selectedValues={selectedIds}
            options={options.map((option) => {
              const target = catalog.entries.find(
                (entry) => entry.ref.revisionId === option.targetRef?.revisionId,
              );
              return {
                value: option.id,
                label: optionName(option.name),
                disabled: !selectedIds.includes(option.id) && !!reason(option.id),
                disabledReason: !selectedIds.includes(option.id) ? reason(option.id) : undefined,
                accessory:
                  target && (target.kind === 'talento' || target.kind === 'magia') ? (
                    <CompendiumTooltip summary={target} entry={target} repository={repository} />
                  ) : undefined,
              };
            })}
            onSelect={toggle}
            onClear={() => set([])}
            clearLabel={`Limpar ${group.name}`}
            placeholder="Digite para buscar ou abra as opções…"
            summary={
              <span role="status">
                {selectedIds.length}/{group.maximum}{' '}
                {group.maximum === 1 ? 'selecionado' : 'selecionados'}
                {selectedIds.length > 0 &&
                  ` · ${options
                    .filter((option) => selectedIds.includes(option.id))
                    .map((option) => optionName(option.name))
                    .join(', ')}`}
              </span>
            }
          />
          {!group.options.length && (
            <p className="notice">Este grupo ainda precisa de opções cadastradas no compêndio.</p>
          )}
          {group.options.length > 0 && !options.length && (
            <p className="notice">Nenhuma opção disponível para as escolhas e o nível atuais.</p>
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
            catalog={props.catalog}
            repository={props.repository}
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
          <div className="creation-kit" key={node.id}>
            <Dropdown
              label={`Equipamento de ${node.entry.name}`}
              searchable={false}
              placeholder="Escolha um kit ou moedas…"
              value={
                draft.equipmentOptions.find((o) => o.ownerRevisionId === node.entry.ref.revisionId)
                  ?.optionId ?? null
              }
              onSelect={(optionId) =>
                onChange({
                  ...draft,
                  equipmentOptions: [
                    ...draft.equipmentOptions.filter(
                      (o) => o.ownerRevisionId !== node.entry.ref.revisionId,
                    ),
                    { ownerRevisionId: node.entry.ref.revisionId, optionId },
                  ],
                })
              }
              onClear={() =>
                onChange({
                  ...draft,
                  equipmentOptions: draft.equipmentOptions.filter(
                    (o) => o.ownerRevisionId !== node.entry.ref.revisionId,
                  ),
                })
              }
              options={options.map((o) => {
                const pack = catalog.entries.find(
                  (e) => e.ref.revisionId === o.packageRef.revisionId,
                );
                return {
                  value: o.id,
                  label: `${o.name} · ${pack?.kind === 'pacote' ? pack.data.notes : (pack?.name ?? '')}`,
                };
              })}
            />
          </div>
        );
      })}
    </>
  );
}
