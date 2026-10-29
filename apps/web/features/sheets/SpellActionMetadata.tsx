import type { Ability, SheetSpell } from '../../../../packages/contracts/sheets';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
export function SpellActionMetadata({
  spell,
  onChange,
}: {
  spell: SheetSpell;
  onChange: (spell: SheetSpell) => void;
}) {
  const update = (
    key: 'bonusAtaque' | 'cd' | 'salvaguardaAtributo',
    value: number | Ability | undefined,
  ) => {
    const next = { ...spell };
    if (value === undefined) delete next[key];
    else Object.assign(next, { [key]: value });
    onChange(next);
  };
  return (
    <fieldset>
      <legend>Ataque e salvaguarda da magia</legend>
      <small>
        Valores opcionais. Em branco, usa o perfil de conjuração. Informe somente o atributo de
        salvaguarda descrito na magia.
      </small>
      <label>
        Bônus de ataque da magia
        <input
          type="number"
          min={-9999}
          max={9999}
          value={spell.bonusAtaque ?? ''}
          onChange={(e) =>
            update('bonusAtaque', e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      </label>
      <label>
        CD de salvaguarda da magia
        <input
          type="number"
          min={0}
          max={9999}
          value={spell.cd ?? ''}
          onChange={(e) => update('cd', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </label>
      <label>
        Atributo de salvaguarda da magia
        <select
          value={spell.salvaguardaAtributo ?? ''}
          onChange={(e) =>
            update('salvaguardaAtributo', (e.target.value || undefined) as Ability | undefined)
          }
        >
          <option value="">Não informado</option>
          {Object.entries(ATRIBUTOS).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
