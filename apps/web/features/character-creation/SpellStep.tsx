import { useState } from 'react';
import type { StepProps } from './types';
import { useCompendium } from '../../lib/use-compendium';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import type { SpellcastingBreakdown } from '../../../../packages/contracts/character-creation';
function Profile(props: StepProps & { profile: SpellcastingBreakdown['profiles'][number] }) {
  const { draft, catalog, profile, onChange, repository } = props;
  const [query, setQuery] = useState(''),
    [circle, setCircle] = useState(0);
  const definition = catalog.castingProfiles.find((p) => profile.id.endsWith(`:${p.id}`));
  const owner = catalog.entries.find((e) => e.ref.revisionId === profile.ownerRevisionId);
  const classEntry = draft.classes.find(
    (c) => profile.id.startsWith(`class:${c.id}/`) || profile.id.startsWith(`subclass:${c.id}/`),
  );
  const results = useCompendium(repository, {
    ruleSetId: draft.ruleSetId,
    kind: 'magia',
    query,
    circle,
    classRevisionId: profile.listClassRevisionIds?.[0],
  });
  return (
    <fieldset className="creation-casting">
      <legend>{owner?.name ?? 'Conjuração'}</legend>
      <p>
        {profile.cantrips} truques · até {profile.prepared} preparadas · até {profile.known}{' '}
        conhecidas · círculo máximo {profile.maximumCircle}
      </p>
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
                {Array.from({ length: profile.maximumCircle + 1 }, (_, n) => (
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
              return (
                <label key={e.ref.recordId}>
                  <input
                    type="checkbox"
                    checked={selected}
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
                              { profileId: profile.id, spellRef: e.ref, prepared: true },
                            ],
                      })
                    }
                  />
                  {e.name}
                </label>
              );
            })}
          </div>
          {results.nextCursor && (
            <button className="button secondary" disabled={results.loading} onClick={results.more}>
              Mostrar mais magias
            </button>
          )}
        </>
      )}
      <ul>
        {draft.spellSelections
          .filter((s) => s.profileId === profile.id)
          .map((s) => (
            <li key={s.spellRef.recordId}>
              {catalog.entries.find((e) => e.ref.revisionId === s.spellRef.revisionId)?.name ??
                'Carregando seleção…'}{' '}
              {definition?.method === 'grimorio' &&
                catalog.entries.some(
                  (e) =>
                    e.ref.revisionId === s.spellRef.revisionId &&
                    e.kind === 'magia' &&
                    e.data.circle > 0,
                ) && (
                  <label>
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
