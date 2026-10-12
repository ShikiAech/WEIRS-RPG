import { useId, useState } from 'react';
import type { AttackDamage, SheetSpell } from '../../../../packages/contracts/sheets';
import { danosMagia } from '../../../../packages/sheets/magias.js';
import {
  formulaDano,
  novoDano,
  validarFormulaDano,
} from '../../../../packages/sheets/equipamentos.js';
import { attributeOptions } from './fields';

const types = [
  'Ácido',
  'Contundente',
  'Cortante',
  'Elétrico',
  'Energético',
  'Fogo',
  'Frio',
  'Necrótico',
  'Perfurante',
  'Psíquico',
  'Radiante',
  'Trovejante',
  'Veneno',
];
export function SpellDamageEditor({
  spell,
  attributes,
  path,
  errors,
  onChange,
}: {
  spell: SheetSpell;
  attributes: Record<string, number>;
  path: string;
  errors: { campo: string; mensagem: string }[];
  onChange: (next: SheetSpell) => void;
}) {
  const prefix = useId();
  const [legacyId] = useState(() => crypto.randomUUID());
  const parts = danosMagia(spell).map((d) =>
    !Array.isArray(spell.danos) ? { ...d, id: legacyId } : d,
  );
  function edit(change: (parts: AttackDamage[]) => void) {
    const next = structuredClone(parts);
    change(next);
    onChange({ ...spell, danos: next });
  }
  const aggregateError = errors.find((e) => e.campo === path + '.danos')?.mensagem;
  return (
    <section className="spell-damage-editor" aria-label={'Danos de ' + (spell.nome || 'magia')}>
      <h4>Dano da magia</h4>
      <p className="muted">
        Cadastre cada tipo separadamente. Ex.: 2d6 de fogo e 1d4 de frio. As parcelas são roladas
        juntas, com um subtotal por tipo.
      </p>
      {!parts.length && (
        <p className="empty-line">
          Sem dano configurado. Magias de utilidade podem ficar sem parcelas.
        </p>
      )}
      {parts.map((d, i) => {
        const id = prefix + '-' + i;
        const formulaError =
          errors.find((e) => e.campo === path + '.danos.' + i + '.dado')?.mensagem ||
          (d.dado.trim() ? validarFormulaDano(d.dado) : '');
        return (
          <fieldset className="spell-damage-part" key={d.id}>
            <legend>Dano {i + 1}</legend>
            <div className="field-grid">
              <div className="field">
                <label htmlFor={id + '-formula'}>Fórmula do dano da magia</label>
                <input
                  id={id + '-formula'}
                  value={d.dado}
                  maxLength={120}
                  placeholder="2d6+2"
                  aria-invalid={!!formulaError || undefined}
                  aria-describedby={id + '-hint' + (formulaError ? ' ' + id + '-error' : '')}
                  onChange={(e) =>
                    edit((parts) => {
                      parts[i].dado = e.target.value;
                    })
                  }
                />
                <small className="field-hint" id={id + '-hint'}>
                  Dados e bônus fixos. O atributo escolhido abaixo é somado à fórmula.
                </small>
                {formulaError && (
                  <span className="field-error" id={id + '-error'}>
                    {formulaError}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor={id + '-type'}>Tipo do dano da magia</label>
                <input
                  id={id + '-type'}
                  value={d.tipo}
                  maxLength={120}
                  list={prefix + '-types'}
                  placeholder="Fogo, frio ou homebrew"
                  onChange={(e) =>
                    edit((parts) => {
                      parts[i].tipo = e.target.value;
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor={id + '-ability'}>Atributo do dano da magia</label>
                <select
                  id={id + '-ability'}
                  value={d.atributo}
                  onChange={(e) =>
                    edit((parts) => {
                      parts[i].atributo = e.target.value as AttackDamage['atributo'];
                    })
                  }
                >
                  <option value="">Nenhum</option>
                  {attributeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="entry-actions">
              <span className="calculation">
                {formulaDano(d, attributes) || 'Sem fórmula'} {d.tipo}
              </span>
              <button
                type="button"
                className="text-button danger"
                onClick={() =>
                  edit((parts) => {
                    parts.splice(i, 1);
                  })
                }
              >
                Remover dano da magia {i + 1}
              </button>
            </div>
          </fieldset>
        );
      })}
      <datalist id={prefix + '-types'}>
        {types.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {aggregateError && (
        <p className="field-error" role="alert">
          {aggregateError}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={parts.length >= 20}
        onClick={() =>
          edit((parts) => {
            parts.push(novoDano());
          })
        }
      >
        Adicionar dano à magia
      </button>
    </section>
  );
}
