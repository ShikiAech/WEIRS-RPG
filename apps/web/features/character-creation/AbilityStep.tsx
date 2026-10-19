import { abilities, modifier } from '../../../../packages/character-creation/abilities';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
import type { StepProps } from './types';
import { Dropdown } from '../../components/Dropdown';
function die() {
  const n = new Uint8Array(1);
  do {
    crypto.getRandomValues(n);
  } while (n[0] >= 252);
  return (n[0] % 6) + 1;
}
export function AbilityStep({ draft, preview, onChange }: StepProps) {
  const a = draft.abilities;
  const patch = (next: Partial<typeof a>) => onChange({ ...draft, abilities: { ...a, ...next } });
  function generate() {
    const sets = Array.from({ length: 2 }, () =>
      Array.from({ length: 6 }, () => {
        const dice = Array.from({ length: 4 }, die).sort((a, b) => a - b);
        return dice.slice(1).reduce((n, d) => n + d, 0);
      }),
    );
    patch({ sets, selectedSet: null, assignment: {} });
  }
  return (
    <section>
      <h2>Atributos</h2>
      <p>Escolha seu método. Os campos de valores externos começam vazios.</p>
      <div className="creation-methods">
        <label>
          <input
            type="radio"
            name="ability-method"
            checked={a.mode === 'external'}
            onChange={() => patch({ mode: 'external' })}
          />
          Preencher valores externos
        </label>
        <label>
          <input
            type="radio"
            name="ability-method"
            checked={a.mode === 'rolls'}
            onChange={() => patch({ mode: 'rolls' })}
          />
          Gerar atributos com 4d6
        </label>
      </div>
      {a.mode === 'rolls' && (
        <>
          <p>
            Dois conjuntos independentes. Cada resultado soma os três maiores dados de 4d6; você
            escolhe qual conjunto usar.
          </p>
          {!a.sets.length && (
            <button className="button" onClick={generate}>
              Gerar dois conjuntos
            </button>
          )}
          <div data-testid="ability-sets" className="ability-sets">
            {a.sets.map((set, i) => (
              <label className="roll-set" key={i}>
                <input
                  type="radio"
                  name="ability-set"
                  aria-label={`Usar conjunto ${i + 1}`}
                  checked={a.selectedSet === i}
                  onChange={() => patch({ selectedSet: i, assignment: {} })}
                />
                <strong>Conjunto {i + 1}</strong>
                <span>{set.join(' · ')}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="creation-abilities">
        {abilities.map((ability) => (
          <div key={ability}>
            {a.mode === 'external' ? (
              <label>
                {ATRIBUTOS[ability]}: valor base
                <input
                  aria-label={`${ATRIBUTOS[ability]}: valor base`}
                  type="number"
                  min="1"
                  max="30"
                  value={a.external[ability] ?? ''}
                  onChange={(e) => {
                    const external = { ...a.external };
                    if (e.target.value === '') delete external[ability];
                    else external[ability] = Number(e.target.value);
                    patch({ external });
                  }}
                />
              </label>
            ) : (
              <Dropdown
                label={`${ATRIBUTOS[ability]}: valor base`}
                value={a.assignment[ability] === undefined ? null : String(a.assignment[ability])}
                disabled={a.selectedSet === null}
                searchable={false}
                placeholder="Distribuir…"
                onSelect={(value) => {
                  const assignment = { ...a.assignment };
                  assignment[ability] = Number(value);
                  patch({ assignment });
                }}
                onClear={() => {
                  const assignment = { ...a.assignment };
                  delete assignment[ability];
                  patch({ assignment });
                }}
                options={(a.sets[a.selectedSet ?? -1] ?? []).map((n, i) => {
                  const assigned = Object.entries(a.assignment).some(
                    ([key, index]) => key !== ability && index === i,
                  );
                  return {
                    value: String(i),
                    label: `${n} · resultado ${i + 1}`,
                    disabled: assigned,
                    disabledReason: assigned ? 'Este resultado já foi distribuído.' : undefined,
                  };
                })}
              />
            )}
            <small>
              Total: {preview.abilities[ability] ?? '—'} · Modificador:{' '}
              {preview.abilities[ability] === undefined
                ? '—'
                : modifier(preview.abilities[ability]!) >= 0
                  ? `+${modifier(preview.abilities[ability]!)}`
                  : modifier(preview.abilities[ability]!)}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
