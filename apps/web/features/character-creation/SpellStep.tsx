import { useState } from 'react';
import type { StepProps } from './types';
import { useSpellOptions } from './useSpellOptions';
import { additionalCantripConflict } from '../../../../packages/character-creation/additional-cantrips';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import type { SpellcastingBreakdown } from '../../../../packages/contracts/character-creation';
function Profile(props: StepProps & { profile: SpellcastingBreakdown['profiles'][number] }) {
  const { draft, catalog, profile, onChange, repository } = props;
  const [query, setQuery] = useState(''),
    [chosenCircle, setCircle] = useState<number | null>(null);
  const definition = catalog.castingProfiles.find((p) => profile.id.endsWith(`:${p.id}`));
  const owner = catalog.entries.find((e) => e.ref.revisionId === profile.ownerRevisionId);
  const instance = resolveConcessions(catalog, draft).instances.find(
    (instance) => profile.id === `${instance.id}/casting:${definition?.id}`,
  );
  const progress = definition?.progression.find((row) => row.level === instance?.level);
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
      const entry = catalog.entries.find(
        (e) =>
          e.ref.revisionId === selection.spellRef.revisionId &&
          e.ref.recordId === selection.spellRef.recordId,
      );
      const fixed = definition?.spells.some(
        (spell) =>
          spell.spellRef.revisionId === entry?.ref.revisionId &&
          spell.level <= (instance?.level ?? 0),
      );
      const valid =
        entry?.kind === 'magia' &&
        !additionalCantripConflict(catalog, draft, profile.id, selection.spellRef) &&
        (fixed ||
          (entry.data.circle <= profile.maximumCircle &&
            (entry.data.circle !== 0 || profile.cantrips > 0) &&
            entry.data.classRefs.some((ref) => lists.includes(ref.revisionId))));
      return { selection, entry, fixed, valid };
    });
  const counted = selections.filter((s) => s.valid && !s.fixed);
  const cantrips = counted.filter(
    (s) => s.entry?.kind === 'magia' && s.entry.data.circle === 0,
  ).length;
  const spells = counted.filter((s) => s.entry?.kind === 'magia' && s.entry.data.circle > 0);
  const prepared = spells.filter((s) => s.selection.prepared).length;
  const knownLimit = progress?.known;
  const preparedLimit = progress?.prepared;
  const guidance = [
    cantrips < profile.cantrips
      ? `Escolha mais ${profile.cantrips - cantrips} truques.`
      : cantrips > profile.cantrips
        ? `Remova ${cantrips - profile.cantrips} truques.`
        : '',
    knownLimit != null && spells.length < knownLimit
      ? `Adicione mais ${knownLimit - spells.length} ${definition?.method === 'grimorio' ? 'magias ao grimório' : 'magias conhecidas'}.`
      : knownLimit != null && spells.length > knownLimit
        ? `Remova ${spells.length - knownLimit} magias ${definition?.method === 'grimorio' ? 'do grimório' : 'conhecidas'}.`
        : '',
    preparedLimit != null && prepared < preparedLimit
      ? `Prepare mais ${preparedLimit - prepared} magias.`
      : preparedLimit != null && prepared > preparedLimit
        ? `Desmarque ${prepared - preparedLimit} preparações.`
        : '',
  ].filter(Boolean);
  const problems = props.preview.spellcasting.problems.filter(
    (p) => p.field === profile.id || p.field === `castingAbilities.${profile.id}`,
  );
  const results = useSpellOptions(
    repository,
    {
      ruleSetId: draft.ruleSetId,
      kind: 'magia',
      query,
      circle,
    },
    profile.selectable && !listRequired ? lists : [],
  );
  return (
    <fieldset className="creation-casting">
      <legend>{owner?.name ?? 'Conjuração'}</legend>
      <p>
        Truques: {cantrips}/{profile.cantrips}
        {knownLimit != null &&
          ` · ${definition?.method === 'grimorio' ? 'Grimório' : 'Conhecidas'}: ${spells.length}/${knownLimit}`}
        {preparedLimit != null && ` · Preparadas: ${prepared}/${preparedLimit}`}
        {' · '}círculo máximo {profile.maximumCircle}
      </p>
      {profile.selectable && guidance.length > 0 && <p className="notice">{guidance.join(' ')}</p>}
      {definition?.method === 'grimorio' && (
        <p>
          Adicione magias ao grimório. As primeiras são preparadas até a cota; ajuste as caixas
          Preparar abaixo.
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
        <label>
          Atributo de conjuração de {owner?.name}
          <select
            value={profile.ability ?? ''}
            onChange={(e) =>
              onChange({
                ...draft,
                castingAbilities: [
                  ...draft.castingAbilities.filter((a) => a.profileId !== profile.id),
                  { profileId: profile.id, ability: e.target.value as 'int' },
                ],
              })
            }
          >
            <option value="">Escolha…</option>
            {definition?.abilities.map((a) => (
              <option key={a} value={a}>
                {ATRIBUTOS[a]}
              </option>
            ))}
          </select>
        </label>
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
          <div className="creation-fields">
            <label>
              Buscar magias de {owner?.name}
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              Círculo para {owner?.name}
              <select value={circle} onChange={(e) => setCircle(Number(e.target.value))}>
                {circles.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Truques' : `Círculo ${n}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {results.error && (
            <div role="alert">
              {results.error}
              <button onClick={results.retry}>Tentar novamente</button>
            </div>
          )}
          {results.loading && <p role="status">Consultando magias…</p>}
          <div className="creation-options">
            {results.entries.map((e) => {
              const selected = draft.spellSelections.some(
                (s) => s.profileId === profile.id && s.spellRef.recordId === e.ref.recordId,
              );
              const granted = definition?.spells.some(
                (s) => s.spellRef.recordId === e.ref.recordId && s.level <= (instance?.level ?? 0),
              );
              const duplicateCantrip = additionalCantripConflict(catalog, draft, profile.id, e.ref);
              return (
                <label key={e.ref.recordId}>
                  <input
                    type="checkbox"
                    checked={selected || granted}
                    disabled={granted || (!selected && duplicateCantrip)}
                    onChange={() =>
                      onChange({
                        ...draft,
                        spellSelections: selected
                          ? draft.spellSelections.filter(
                              (s) =>
                                s.profileId !== profile.id ||
                                s.spellRef.recordId !== e.ref.recordId,
                            )
                          : [
                              ...draft.spellSelections,
                              {
                                profileId: profile.id,
                                spellRef: e.ref,
                                prepared:
                                  definition?.method !== 'grimorio' ||
                                  preparedLimit == null ||
                                  prepared < preparedLimit,
                              },
                            ],
                      })
                    }
                  />
                  {e.name}
                  {granted && <small> Concedida automaticamente; não conta na cota.</small>}
                  {duplicateCantrip && (
                    <small> Já conhecido pela classe; escolha outro truque.</small>
                  )}
                </label>
              );
            })}
          </div>
          {!results.loading && !results.error && results.entries.length === 0 && (
            <p role="status">
              Nenhuma magia encontrada nesta lista e círculo. Ajuste a busca ou o círculo.
            </p>
          )}
          {results.nextCursor && (
            <button className="button secondary" disabled={results.loading} onClick={results.more}>
              Mostrar mais magias
            </button>
          )}
        </>
      )}
      <ul>
        {selections.map(({ selection: s, entry, valid }) => (
          <li key={s.spellRef.recordId}>
            {entry?.name ?? 'Carregando seleção…'}{' '}
            {!valid && (
              <strong>
                Indisponível para esta origem e nível. Remova esta seleção ou revise a lista na
                origem.{' '}
              </strong>
            )}
            {definition?.method === 'grimorio' &&
              catalog.entries.some(
                (e) =>
                  e.ref.revisionId === s.spellRef.revisionId &&
                  e.kind === 'magia' &&
                  e.data.circle > 0,
              ) && (
                <label style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={s.prepared}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        spellSelections: draft.spellSelections.map((v) =>
                          v === s ? { ...v, prepared: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                  Preparar{' '}
                  {catalog.entries.find((e) => e.ref.revisionId === s.spellRef.revisionId)?.name}
                </label>
              )}
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...draft,
                  spellSelections: draft.spellSelections.filter((v) => v !== s),
                })
              }
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
export function SpellStep(props: StepProps) {
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
        <Profile {...props} profile={profile} key={profile.id} />
      ))}
    </section>
  );
}
