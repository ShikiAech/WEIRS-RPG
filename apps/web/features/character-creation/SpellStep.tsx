import { useEffect, useId, useRef, useState } from 'react';
import type { StepProps } from './types';
import { useSpellOptions } from './useSpellOptions';
import { Dropdown } from '../../components/Dropdown';
import { CompendiumTooltip } from './CompendiumTooltip';
import { additionalCantripConflict } from '../../../../packages/character-creation/additional-cantrips';
import { resolveState } from '../../../../packages/character-creation/state';
import { profileGrantedSpells } from '../../../../packages/character-creation/casting-grants';
import { reconcileSpellSelections } from '../../../../packages/character-creation/reconcile-spells';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import type { SpellcastingBreakdown } from '../../../../packages/contracts/character-creation';
import type { CompendiumEntry, CompendiumSummary } from '../../../../packages/contracts/compendium';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

function Profile(
  props: StepProps & {
    profile: SpellcastingBreakdown['profiles'][number];
    spellEntries: Map<string, CompendiumEntry>;
  },
) {
  const { draft, catalog, profile, onChange, repository } = props;
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [chosenCircle, setCircle] = useState<number | null>(null);
  // Retain verified spell details while the selected-entry catalog is refreshed.
  const selectedEntries = props.spellEntries;
  const [checking, setChecking] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const selectionRequest = useRef<AbortController | null>(null);
  useEffect(() => () => selectionRequest.current?.abort(), []);
  const spellCatalog = {
    ...catalog,
    entries: [
      ...catalog.entries,
      ...[...selectedEntries.values()].filter(
        (entry) => !catalog.entries.some((e) => e.ref.revisionId === entry.ref.revisionId),
      ),
    ],
  };
  const definition = catalog.castingProfiles.find((p) => profile.id.endsWith(`:${p.id}`));
  const owner = catalog.entries.find((e) => e.ref.revisionId === profile.ownerRevisionId);
  const creationState = resolveState(spellCatalog, draft);
  const instance = creationState.concessions.instances.find(
    (instance) => profile.id === `${instance.id}/casting:${definition?.id}`,
  );
  const progress = definition?.progression.find((row) => row.level === instance?.level);
  const grantedSpells = profileGrantedSpells(spellCatalog, creationState, instance, definition);
  const lists = profile.listClassRevisionIds ?? [];
  const listRequired = !!profile.selectable && !lists.length;
  const circles = Array.from({ length: profile.maximumCircle + 1 }, (_, n) => n).filter(
    (n) => n !== 0 || profile.cantrips > 0,
  );
  const circle =
    chosenCircle !== null && circles.includes(chosenCircle) ? chosenCircle : (circles[0] ?? 0);
  const selections = draft.spellSelections
    .filter((s) => s.profileId === profile.id)
    .map((selection) => {
      const entry = spellCatalog.entries.find(
        (e) =>
          e.ref.revisionId === selection.spellRef.revisionId &&
          e.ref.recordId === selection.spellRef.recordId,
      );
      const fixed = grantedSpells.some(
        (spell) =>
          spell.spellRef.revisionId === selection.spellRef.revisionId &&
          spell.level <= (instance?.level ?? 0),
      );
      const spellCircle = entry?.kind === 'magia' ? entry.data.circle : undefined;
      const valid =
        !additionalCantripConflict(spellCatalog, draft, profile.id, selection.spellRef) &&
        (fixed ||
          (spellCircle !== undefined &&
            spellCircle <= profile.maximumCircle &&
            (spellCircle !== 0 || profile.cantrips > 0) &&
            entry?.kind === 'magia' &&
            entry.data.classRefs.some((ref) => lists.includes(ref.revisionId))));
      return {
        selection,
        entry,
        summary: entry,
        circle: spellCircle,
        fixed,
        valid,
      };
    });
  const counted = selections.filter((s) => s.valid && !s.fixed);
  const pendingSelections =
    selections.some((selection) => !selection.summary || selection.circle === undefined) ||
    draft.spellSelections.some(
      (selection) =>
        !spellCatalog.entries.some(
          (entry) =>
            entry.ref.recordId === selection.spellRef.recordId &&
            entry.ref.revisionId === selection.spellRef.revisionId,
        ),
    );
  const cantrips = counted.filter((s) => s.circle === 0).length;
  const spells = counted.filter((s) => s.circle !== undefined && s.circle > 0);
  const prepared = spells.filter((s) => s.selection.prepared).length;
  const knownLimit = progress?.known;
  const preparedLimit = progress?.prepared;
  const guidance = [
    cantrips < profile.cantrips ? `Escolha mais ${profile.cantrips - cantrips} truques.` : '',
    knownLimit != null && spells.length < knownLimit
      ? `Adicione mais ${knownLimit - spells.length} ${definition?.method === 'grimorio' ? 'magias ao grimório' : 'magias conhecidas'}.`
      : '',
    preparedLimit != null && prepared < preparedLimit
      ? `Prepare mais ${preparedLimit - prepared} magias.`
      : '',
  ].filter(Boolean);
  const problems = props.preview.spellcasting.problems.filter(
    (p) =>
      p.code !== 'SPELL_SELECTION_REQUIRED' &&
      !(
        pendingSelections &&
        ['SPELL_NOT_AVAILABLE', 'SPELL_LIMIT', 'ADDITIONAL_CANTRIP_DUPLICATE'].includes(p.code)
      ) &&
      (p.field === profile.id || p.field === `castingAbilities.${profile.id}`),
  );
  const results = useSpellOptions(
    repository,
    { ruleSetId: draft.ruleSetId, kind: 'magia', query, circle },
    profile.selectable && !listRequired ? lists : [],
  );
  // Selected entries remain available to uncheck even when paginated.
  const options = [...results.entries];
  // Automatic grants can belong to a different class list than this profile.
  for (const grant of grantedSpells) {
    const entry = spellCatalog.entries.find(
      (entry) =>
        entry.ref.recordId === grant.spellRef.recordId &&
        entry.ref.revisionId === grant.spellRef.revisionId,
    );
    if (
      entry?.kind === 'magia' &&
      entry.ruleSetId === draft.ruleSetId &&
      entry.data.circle === circle &&
      (!query ||
        normalize([entry.name, entry.originalName, ...entry.aliases].join(' ')).includes(
          normalize(query),
        )) &&
      !options.some((option) => option.ref.recordId === entry.ref.recordId)
    )
      options.unshift(entry);
  }
  for (const selection of selections) {
    if (
      selection.summary &&
      (selection.circle === circle || !selection.valid) &&
      (!query || normalize(selection.summary.name).includes(normalize(query))) &&
      !options.some((e) => e.ref.recordId === selection.selection.spellRef.recordId)
    )
      options.unshift(selection.summary);
  }
  const changeCircle = (next: number) => {
    setCircle(next);
    setQuery('');
  };
  const optionState = (entry: CompendiumSummary) => {
    const chosen = selections.find(
      (selection) => selection.selection.spellRef.recordId === entry.ref.recordId,
    );
    const granted = grantedSpells.some(
      (spell) =>
        spell.spellRef.recordId === entry.ref.recordId && spell.level <= (instance?.level ?? 0),
    );
    const detail = spellCatalog.entries.find(
      (e) => e.ref.recordId === entry.ref.recordId && e.ref.revisionId === entry.ref.revisionId,
    );
    const prospective = chosen
      ? draft
      : {
          ...draft,
          spellSelections: [
            ...draft.spellSelections,
            {
              profileId: profile.id,
              spellRef: entry.ref,
              prepared: false,
            },
          ],
        };
    // Also protect a cantrip picked in the additional origin before the class pick.
    const duplicate =
      additionalCantripConflict(spellCatalog, prospective, profile.id, entry.ref) ||
      draft.spellSelections.some(
        (s) =>
          s.profileId !== profile.id &&
          s.spellRef.recordId === entry.ref.recordId &&
          additionalCantripConflict(spellCatalog, prospective, s.profileId, s.spellRef),
      );
    const spellCircle =
      detail?.kind === 'magia' ? detail.data.circle : (entry.circle ?? chosen?.circle ?? circle);
    const unavailable =
      entry.kind !== 'magia' || entry.ruleSetId !== draft.ruleSetId
        ? 'Esta opção não é uma magia deste conjunto de regras.'
        : spellCircle !== circle ||
            spellCircle > profile.maximumCircle ||
            (spellCircle === 0 && !profile.cantrips)
          ? 'Esta magia não está disponível neste círculo e nível.'
          : detail &&
              (detail.kind !== 'magia' ||
                !detail.data.classRefs.some((ref) => lists.includes(ref.revisionId)))
            ? 'Esta magia não pertence à lista permitida para esta origem.'
            : '';
    const atLimit =
      spellCircle === 0
        ? cantrips >= profile.cantrips
        : (knownLimit != null && spells.length >= knownLimit) ||
          (definition?.method !== 'grimorio' && preparedLimit != null && prepared >= preparedLimit);
    const disabled =
      granted ||
      (!chosen && (!!unavailable || duplicate || atLimit || pendingSelections || checking));
    const reason = granted
      ? 'Concedida automaticamente; não conta na cota.'
      : unavailable
        ? unavailable
        : duplicate
          ? 'Já conhecido pela classe ou pelo truque adicional; escolha outro truque.'
          : chosen && !chosen.valid
            ? 'Indisponível para esta origem e nível. Desmarque para ajustar a seleção.'
            : !chosen && (pendingSelections || checking)
              ? 'Atualizando seleções…'
              : !chosen && atLimit
                ? 'Limite de seleção atingido.'
                : '';
    return { chosen, granted, spellCircle, disabled, reason };
  };
  const toggleSpell = (recordId: string) => {
    const entry = options.find((option) => option.ref.recordId === recordId);
    if (!entry) return;
    const state = optionState(entry);
    if (state.disabled || selectionRequest.current) return;
    setSelectionError('');
    if (state.chosen) {
      onChange({
        ...draft,
        spellSelections: draft.spellSelections.filter(
          (selection) =>
            selection.profileId !== profile.id || selection.spellRef.recordId !== recordId,
        ),
      });
      return;
    }
    const apply = (detail: CompendiumEntry) => {
      if (
        detail.ref.recordId !== entry.ref.recordId ||
        detail.ref.revisionId !== entry.ref.revisionId
      ) {
        setSelectionError('A referência desta magia mudou. Atualize a busca e tente novamente.');
        return;
      }
      selectedEntries.set(detail.ref.revisionId, detail);
      if (
        detail.kind !== 'magia' ||
        detail.ruleSetId !== draft.ruleSetId ||
        detail.data.circle !== circle
      ) {
        setSelectionError(`${entry.name}: Esta opção não é uma magia permitida neste círculo.`);
        return;
      }
      // Apply to the latest draft, including other selections that completed while
      // this request was pending. Shared verified details cover catalogs in transit.
      onChange((current) => {
        if (
          current.spellSelections.some(
            (s) => s.profileId === profile.id && s.spellRef.recordId === entry.ref.recordId,
          )
        )
          return current;
        const selection = { profileId: profile.id, spellRef: entry.ref, prepared: true };
        const next = { ...current, spellSelections: [...current.spellSelections, selection] };
        const verifiedCatalog = {
          ...catalog,
          entries: [
            ...catalog.entries,
            ...[...selectedEntries.values()].filter(
              (entry) => !catalog.entries.some((e) => e.ref.revisionId === entry.ref.revisionId),
            ),
          ],
        };
        const reconciled = reconcileSpellSelections(verifiedCatalog, next);
        // A full preparation quota still allows adding an unprepared book spell.
        const rejection = reconciled.changes.find(
          (change) => change.selection !== selection || change.action !== 'unprepared',
        );
        if (rejection) {
          setSelectionError(`${entry.name}: ${rejection.reason}`);
          return current;
        }
        return reconciled.draft;
      });
    };
    const detail = spellCatalog.entries.find(
      (e) => e.ref.recordId === entry.ref.recordId && e.ref.revisionId === entry.ref.revisionId,
    );
    if (detail) {
      apply(detail);
      return;
    }
    const controller = new AbortController();
    selectionRequest.current = controller;
    setChecking(true);
    repository
      .get(entry.ref, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) apply(detail);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSelectionError(
            `Não foi possível verificar ${entry.name}. Tente selecionar novamente.`,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          selectionRequest.current = null;
          setChecking(false);
        }
      });
  };
  const chips = [
    ...selections.map((item) => ({
      ref: item.selection.spellRef,
      entry: item.entry,
      fixed: item.fixed,
      selection: item.selection,
      circle: item.circle,
    })),
    ...grantedSpells
      .filter(
        (grant) =>
          grant.level <= (instance?.level ?? 0) &&
          !selections.some((item) => item.selection.spellRef.recordId === grant.spellRef.recordId),
      )
      .map((grant) => {
        const entry = spellCatalog.entries.find(
          (e) =>
            e.ref.recordId === grant.spellRef.recordId &&
            e.ref.revisionId === grant.spellRef.revisionId,
        );
        return {
          ref: grant.spellRef,
          entry,
          fixed: true,
          selection: undefined,
          circle: entry?.kind === 'magia' ? entry.data.circle : undefined,
        };
      }),
  ];
  return (
    <fieldset className="creation-casting">
      <legend>{owner?.name ?? 'Conjuração'}</legend>
      <p className="creation-casting-counts" aria-live="polite">
        Truques: {cantrips}/{profile.cantrips}
        {knownLimit != null &&
          ` · ${definition?.method === 'grimorio' ? 'Grimório' : 'Conhecidas'}: ${spells.length}/${knownLimit}`}
        {preparedLimit != null && ` · Preparadas: ${prepared}/${preparedLimit}`}
        {' · '}círculo máximo {profile.maximumCircle}
      </p>
      <ul
        className="creation-spell-chips"
        aria-label={`Magias selecionadas de ${owner?.name ?? 'Conjuração'}`}
      >
        {chips.map((chip) => (
          <li
            className="creation-spell-chip"
            key={`${profile.id}:${chip.ref.recordId}:${chip.ref.revisionId}`}
          >
            <span>{chip.entry?.name ?? 'Carregando magia…'}</span>
            {chip.entry && (
              <CompendiumTooltip summary={chip.entry} entry={chip.entry} repository={repository} />
            )}
            {chip.fixed ? (
              <small>Concedida · fixa</small>
            ) : (
              <>
                {definition?.method === 'grimorio' && chip.selection && (chip.circle ?? 0) > 0 && (
                  <label className="creation-spell-prepare">
                    <input
                      type="checkbox"
                      aria-label={`Preparar ${chip.entry?.name ?? 'magia'}`}
                      checked={chip.selection.prepared}
                      disabled={
                        !chip.selection.prepared &&
                        (pendingSelections || (preparedLimit != null && prepared >= preparedLimit))
                      }
                      onChange={(event) => {
                        const checked = event.target.checked;
                        onChange((current) => ({
                          ...current,
                          spellSelections: current.spellSelections.map((selection) =>
                            selection.profileId === profile.id &&
                            selection.spellRef.recordId === chip.ref.recordId
                              ? { ...selection, prepared: checked }
                              : selection,
                          ),
                        }));
                      }}
                    />
                    Preparar
                  </label>
                )}
                <button
                  type="button"
                  className="creation-chip-remove"
                  aria-label={`Remover ${chip.entry?.name ?? 'magia'}`}
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      spellSelections: current.spellSelections.filter(
                        (selection) =>
                          selection.profileId !== profile.id ||
                          selection.spellRef.recordId !== chip.ref.recordId,
                      ),
                    }))
                  }
                >
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {profile.selectable && guidance.length > 0 && <p className="notice">{guidance.join(' ')}</p>}
      {definition?.method === 'grimorio' && (
        <p>
          Selecione as magias do grimório e use a caixa Preparar nas magias selecionadas para
          ajustar o preparo.
        </p>
      )}
      {problems.length > 0 && (
        <ul aria-label="Pendências desta origem">
          {problems.map((p, index) => (
            <li key={`${p.code}:${index}`}>{p.message}</li>
          ))}
        </ul>
      )}
      {definition?.abilities.length !== 0 && (
        <Dropdown
          label={`Atributo de conjuração de ${owner?.name}`}
          searchable={false}
          value={profile.ability}
          options={(definition?.abilities ?? []).map((ability) => ({
            value: ability,
            label: ATRIBUTOS[ability],
          }))}
          onSelect={(ability) =>
            onChange({
              ...draft,
              castingAbilities: [
                ...draft.castingAbilities.filter((selection) => selection.profileId !== profile.id),
                { profileId: profile.id, ability: ability as 'int' },
              ],
            })
          }
          onClear={() =>
            onChange({
              ...draft,
              castingAbilities: draft.castingAbilities.filter(
                (selection) => selection.profileId !== profile.id,
              ),
            })
          }
        />
      )}
      {!profile.selectable ? (
        <p>As magias e usos concedidos por esta origem serão incluídos automaticamente.</p>
      ) : listRequired ? (
        <p className="notice" role="status">
          Resolva a lista de magias no antecedente, classe ou espécie que concedeu esta origem antes
          de escolher magias.
        </p>
      ) : (
        <>
          <div
            className="creation-circle-tabs"
            role="tablist"
            aria-label={`Círculos de ${owner?.name}`}
            ref={tabs}
          >
            {circles.map((n, index) => (
              <button
                key={n}
                id={`${id}-tab-${n}`}
                type="button"
                role="tab"
                aria-selected={circle === n}
                aria-controls={`${id}-panel`}
                tabIndex={circle === n ? 0 : -1}
                onClick={() => changeCircle(n)}
                onKeyDown={(event) => {
                  const offset =
                    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                  const target =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? circles.length - 1
                        : offset
                          ? (index + offset + circles.length) % circles.length
                          : -1;
                  if (target < 0) return;
                  event.preventDefault();
                  changeCircle(circles[target]);
                  tabs.current
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [target]?.focus();
                }}
              >
                {n === 0 ? 'Truques' : `Círculo ${n}`}
              </button>
            ))}
          </div>
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${circle}`}>
            <Dropdown
              label={`Buscar magias de ${owner?.name}`}
              placeholder="Buscar e selecionar magias…"
              multiple
              query={query}
              onQueryChange={setQuery}
              filterOptions={false}
              showSelectedValue={false}
              resetQueryOnClose={false}
              resetKey={`${profile.id}:${circle}`}
              clearable={!!query}
              onClear={() => setQuery('')}
              clearLabel={`Limpar busca de magias de ${owner?.name}`}
              selectedValues={options
                .filter((entry) => {
                  const state = optionState(entry);
                  return state.chosen || state.granted;
                })
                .map((entry) => entry.ref.recordId)}
              onSelect={toggleSpell}
              loading={results.loading || pendingSelections || checking}
              loadingLabel={
                checking
                  ? 'Verificando magia…'
                  : pendingSelections
                    ? 'Atualizando seleções…'
                    : 'Consultando magias…'
              }
              error={results.error}
              onRetry={results.retry}
              hasMore={!!results.nextCursor}
              onMore={results.more}
              moreLabel="Mostrar mais magias"
              emptyText="Nenhuma magia encontrada nesta lista e círculo. Ajuste a busca ou o círculo."
              popupLabel={`Opções de magias de ${owner?.name}`}
              options={options.map((entry) => {
                const { chosen, granted, spellCircle, disabled, reason } = optionState(entry);
                const detail = catalog.entries.find(
                  (item) => item.ref.revisionId === entry.ref.revisionId,
                );
                const prepareDisabled =
                  !chosen?.selection.prepared &&
                  (pendingSelections || (preparedLimit != null && prepared >= preparedLimit));
                return {
                  value: entry.ref.recordId,
                  label: entry.name,
                  disabled,
                  disabledReason: reason,
                  accessory: (
                    <>
                      <CompendiumTooltip summary={entry} entry={detail} repository={repository} />
                    </>
                  ),
                };
              })}
            />
            {selectionError && (
              <p className="notice error" role="alert">
                {selectionError}
              </p>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}

export function SpellStep(props: StepProps) {
  const fallbackEntries = useRef(new Map<string, CompendiumEntry>());
  const s = props.preview.spellcasting;
  return (
    <section>
      <h2>Magias e conjuração</h2>
      <p>
        Os espaços disponíveis e o círculo de cada origem são calculados separadamente. Espaços
        superiores de multiclasse não liberam magias de círculos superiores.
      </p>
      {!s.profiles.length && (
        <p className="notice">Nenhum perfil de conjuração para as escolhas atuais.</p>
      )}
      <p>
        Espaços: {s.slots.map((v) => `${v.total} de ${v.circle}º`).join(' · ') || 'nenhum'}
        {s.pactSlots.length > 0 &&
          ` · Pacto: ${s.pactSlots.map((v) => `${v.total} de ${v.circle}º`).join(', ')}`}
      </p>
      {s.profiles.map((profile) => (
        <Profile
          {...props}
          spellEntries={props.spellEntries ?? fallbackEntries.current}
          profile={profile}
          key={profile.id}
        />
      ))}
    </section>
  );
}
