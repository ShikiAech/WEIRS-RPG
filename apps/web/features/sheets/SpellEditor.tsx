import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SheetContent } from '../../../../packages/contracts/sheets';
import type { ContentSummary } from '../../../../packages/contracts/content';
import { novaEntrada } from '../../../../packages/sheets/modelo.js';
import { normalize } from '../../lib/paths';
import { number } from './fields';
import type { RenderField } from './InventoryEditor';
import { SpellPicker } from './SpellPicker';

export function SpellEditor({
  content: c,
  onChange,
  catalog,
  field,
  renderSpell,
}: {
  content: SheetContent;
  onChange: (c: SheetContent) => void;
  catalog: ContentSummary[];
  field: RenderField;
  renderSpell: (i: number) => ReactNode;
}) {
  const [picker, setPicker] = useState(false);
  const prefix = useId();
  const pickerButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [newCircle, setNewCircle] = useState(1);
  const active = c.conjuracao.espacos
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.ativo || slot.total > 0);
  const available = c.conjuracao.espacos.filter((slot) => !slot.ativo && slot.total === 0);
  const circle = available.some((s) => s.circulo === newCircle)
    ? newCircle
    : available[0]?.circulo || 1;
  const spells = c.magias
    .map((spell, i) => ({ spell, i }))
    .filter(({ spell }) => normalize(spell.nome).includes(normalize(query)));
  return (
    <>
      <section className="form-section spell-slots">
        <div className="section-heading">
          <div>
            <h3>Espaços de magia</h3>
            <p className="muted">
              Adicione os círculos que seu personagem usa. Gastos e espaços de pacto são controlados
              separadamente.
            </p>
          </div>
        </div>
        <div className="slot-add-row">
          <div className="field">
            <label htmlFor={prefix + '-novo-circulo'}>Novo círculo de espaços</label>
            <select
              id={prefix + '-novo-circulo'}
              value={circle}
              disabled={!available.length}
              onChange={(e) => setNewCircle(Number(e.target.value))}
            >
              {available.map((s) => (
                <option key={s.circulo} value={s.circulo}>
                  Círculo {s.circulo}
                </option>
              ))}
              {!available.length && <option value="1">Todos adicionados</option>}
            </select>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={!available.length}
            onClick={() => {
              const next = structuredClone(c);
              next.conjuracao.espacos[circle - 1].ativo = true;
              onChange(next);
            }}
          >
            Adicionar espaços
          </button>
        </div>
        {!active.length && (
          <p className="empty-line">
            Nenhum círculo configurado. Truques não precisam de espaços de magia.
          </p>
        )}
        <div className="slot-grid">
          {active.map(({ slot, i }) => (
            <fieldset key={slot.circulo}>
              <legend>Círculo {slot.circulo}</legend>
              <p className="slot-remaining">
                {slot.total - slot.gastos} de {slot.total} disponíveis
              </p>
              {field(number(`conjuracao.espacos.${i}.total`, `Círculo ${slot.circulo}: total`))}
              {field(number(`conjuracao.espacos.${i}.gastos`, `Círculo ${slot.circulo}: gastos`))}
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  if (
                    slot.total > 0 &&
                    !window.confirm(
                      `Remover os espaços do círculo ${slot.circulo}? As magias desse círculo permanecerão na ficha.`,
                    )
                  )
                    return;
                  const next = structuredClone(c);
                  next.conjuracao.espacos[i] = {
                    circulo: slot.circulo,
                    total: 0,
                    gastos: 0,
                    ativo: false,
                  };
                  onChange(next);
                }}
              >
                Remover espaços do círculo {slot.circulo}
              </button>
            </fieldset>
          ))}
        </div>
        <details className="pact-slots" open>
          <summary>
            Espaços de pacto
            {c.conjuracao.pacto.total > 0
              ? ` · ${c.conjuracao.pacto.total - c.conjuracao.pacto.gastos}/${c.conjuracao.pacto.total} disponíveis`
              : ' · configurar'}
          </summary>
          <div className="field-grid">
            {field(number('conjuracao.pacto.circulo', 'Círculo dos espaços de pacto', 1, 9))}
            {field(number('conjuracao.pacto.total', 'Espaços de pacto: total'))}
            {field(number('conjuracao.pacto.gastos', 'Espaços de pacto: gastos'))}
          </div>
        </details>
      </section>
      <section className="form-section spell-book">
        <div className="section-heading">
          <div>
            <h3>Truques e magias</h3>
            <p className="muted">Organizadas por círculo, com criação manual para homebrew.</p>
          </div>
          <div className="entry-actions">
            <button
              type="button"
              className="button secondary"
              disabled={!catalog.some((e) => e.kind === 'magia')}
              ref={pickerButton}
              onClick={() => setPicker(true)}
            >
              Buscar magias no compêndio
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const next = structuredClone(c);
                next.magias.push(novaEntrada('magias'));
                setQuery('');
                onChange(next);
              }}
            >
              Adicionar magia
            </button>
          </div>
        </div>
        {!catalog.some((e) => e.kind === 'magia') && (
          <p className="muted">
            O compêndio ainda não está disponível. Você pode adicionar magias manualmente.
          </p>
        )}
        {c.magias.length > 0 && (
          <label className="field equipment-search">
            Buscar na ficha
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome da magia…"
            />
          </label>
        )}
        {!spells.length && (
          <p className="empty-line">
            {query
              ? 'Nenhuma magia na ficha com esse nome.'
              : 'Adicione magias do compêndio ou crie uma magia manualmente.'}
          </p>
        )}
        {Array.from({ length: 10 }, (_, circle) => {
          const group = spells.filter(({ spell }) => spell.circulo === circle);
          if (!group.length) return null;
          return (
            <section className="spell-circle" key={circle}>
              <h4>
                {circle === 0 ? 'Truques' : `Círculo ${circle}`} · {group.length}{' '}
                {circle === 0
                  ? group.length === 1
                    ? 'truque'
                    : 'truques'
                  : group.length === 1
                    ? 'magia'
                    : 'magias'}
              </h4>
              {group.map(({ i }) => renderSpell(i))}
            </section>
          );
        })}
        {spells.some(
          ({ spell }) => !Number.isInteger(spell.circulo) || spell.circulo < 0 || spell.circulo > 9,
        ) && (
          <section className="spell-circle">
            <h4>Corrigir círculo</h4>
            <p className="notice">Escolha um círculo de 0 (truque) a 9 para estas magias.</p>
            {spells
              .filter(
                ({ spell }) =>
                  !Number.isInteger(spell.circulo) || spell.circulo < 0 || spell.circulo > 9,
              )
              .map(({ i }) => renderSpell(i))}
          </section>
        )}
      </section>
      {picker && (
        <SpellPicker
          content={c}
          catalog={catalog}
          onChange={onChange}
          onClose={() => {
            setPicker(false);
            pickerButton.current?.focus();
          }}
        />
      )}
    </>
  );
}
