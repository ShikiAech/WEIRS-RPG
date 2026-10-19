import { useId, useState } from 'react';
import {
  ATRIBUTOS,
  PERICIAS,
  novaEntrada,
  limparReferencias,
} from '../../../../packages/sheets/modelo.js';
import { calcularFicha } from '../../../../packages/sheets/calculos.js';
import type { SheetContent, SheetSpell } from '../../../../packages/contracts/sheets';
import type { CompendiumSummary } from '../../../../packages/contracts/compendium';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import { identity, combat, story, training, lists, number, attributeOptions } from './fields';
import type { FieldSpec, ListSpec } from './fields';
import { SheetActionButtons } from './SheetChat';
import { InventoryEditor } from './InventoryEditor';
import { SpellEditor } from './SpellEditor';
import { sincronizarEquipamentos } from '../../../../packages/sheets/equipamentos.js';
import { sincronizarMagias, formulasMagia } from '../../../../packages/sheets/magias.js';
import { SpellDamageEditor } from './SpellDamageEditor';

type Tree = Record<string, unknown>;
function get(content: SheetContent, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Tree)[key], content);
}
function set(content: SheetContent, path: string, value: unknown): SheetContent {
  const next = structuredClone(content);
  const keys = path.split('.');
  const target = keys
    .slice(0, -1)
    .reduce<unknown>((node, key) => (node as Tree)[key], next) as Tree;
  target[keys.at(-1)!] = value;
  return next;
}
const signed = (value: number) => (value >= 0 ? '+' + value : String(value));

export function SheetForm({
  content,
  onChange,
  catalog,
  compendium,
  readOnly = false,
  errors = [],
}: {
  content: SheetContent;
  onChange: (c: SheetContent) => void;
  catalog: CompendiumSummary[];
  compendium: CompendiumRepository;
  readOnly?: boolean;
  errors?: { campo: string; mensagem: string }[];
}) {
  const [tab, setTab] = useState(0);
  const prefix = useId();
  const change = (next: SheetContent) => onChange(sincronizarMagias(sincronizarEquipamentos(next)));
  const tabs = [
    'Personagem',
    'Atributos e perícias',
    'Combate',
    'Características',
    'Magias',
    'Inventário',
  ];
  const calc = calcularFicha(content);
  const update = (path: string, value: unknown) => change(set(content, path, value));
  function options(spec: FieldSpec): [string, string][] {
    if (spec.options) return spec.options;
    const source =
      spec.key === 'classeId'
        ? 'classes'
        : spec.key === 'perfilId'
          ? 'conjuracao.perfis'
          : 'inventario.itens';
    const rows = get(content, source) as Tree[];
    return [
      ['', 'Origem personalizada'],
      ...rows.map((row, i): [string, string] => [
        String(row.id),
        String(row.nome || `Entrada ${i + 1}`),
      ]),
    ];
  }
  function field(spec: FieldSpec, path = spec.key) {
    const value = get(content, path);
    const id = prefix + '-field-' + path.replace(/\./g, '-');
    const label = spec.label;
    const error = errors.find((e) => e.campo === path)?.mensagem;
    const accessibility = {
      'aria-invalid': Boolean(error) || undefined,
      'aria-describedby':
        [error ? id + '-error' : '', spec.hint ? id + '-hint' : ''].filter(Boolean).join(' ') ||
        undefined,
    };
    const suggestions = spec.suggestions
      ? [...new Set(catalog.filter((e) => e.kind === spec.suggestions).map((e) => e.name))]
      : [];
    return (
      <div
        className={`field ${spec.type === 'textarea' ? 'field-wide' : ''} ${spec.type === 'checkbox' ? 'check-field' : ''}`}
        key={path}
      >
        {spec.type === 'checkbox' ? (
          <label htmlFor={id}>
            <input
              id={id}
              {...accessibility}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => update(path, e.target.checked)}
            />
            {label}
          </label>
        ) : (
          <>
            <label htmlFor={id}>{label}</label>
            {spec.type === 'textarea' ? (
              <textarea
                id={id}
                {...accessibility}
                rows={4}
                maxLength={10000}
                value={String(value ?? '')}
                onChange={(e) => update(path, e.target.value)}
              />
            ) : spec.type === 'select' ? (
              <select
                {...accessibility}
                id={id}
                value={String(value ?? '')}
                onChange={(e) => update(path, e.target.value)}
              >
                {options(spec).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                {...accessibility}
                type={spec.type === 'number' ? 'number' : 'text'}
                min={spec.min}
                max={spec.max}
                step={spec.step || '1'}
                maxLength={spec.type === 'number' ? undefined : (spec.maxLength ?? 120)}
                list={spec.suggestions ? id + '-suggestions' : undefined}
                value={String(value ?? '')}
                onChange={(e) =>
                  update(
                    path,
                    spec.type === 'number'
                      ? spec.nullable && e.target.value === ''
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
            {spec.suggestions && (
              <datalist id={id + '-suggestions'}>
                {suggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </>
        )}
        {spec.hint && (
          <small className="field-hint" id={id + '-hint'}>
            {spec.hint}
          </small>
        )}
        {error && (
          <span className="field-error" id={id + '-error'}>
            {error}
          </span>
        )}
      </div>
    );
  }
  function repeated(spec: ListSpec, onlyIndex?: number) {
    const rows = get(content, spec.path) as Tree[];
    return (
      <section
        className={onlyIndex === undefined ? 'form-section' : 'spell-entry-editor'}
        key={onlyIndex === undefined ? spec.path : String(rows[onlyIndex]?.id)}
      >
        {onlyIndex === undefined && (
          <div className="section-heading">
            <h3>{spec.title}</h3>
            <button
              className="button secondary"
              type="button"
              disabled={
                spec.path === 'inventario.sintonizados' &&
                rows.length >= content.inventario.limiteSintonizacao
              }
              onClick={() => update(spec.path, [...rows, novaEntrada(spec.path)])}
            >
              {spec.add}
            </button>
          </div>
        )}
        {!rows.length && (
          <p className="empty-line">Nenhuma entrada. Adicione o que seu personagem precisa.</p>
        )}
        {rows.map(
          (row, i) =>
            (onlyIndex === undefined || onlyIndex === i) &&
            !(spec.path === 'ataques' && row.itemId && onlyIndex === undefined) && (
              <fieldset className="repeat-entry" key={String(row.id)}>
                <legend>{String(row.nome || `${spec.title} · ${i + 1}`)}</legend>
                <div className="field-grid">
                  {spec.fields
                    .filter((_, n) => spec.path !== 'magias' || n < 4)
                    .map((item) => field(item, `${spec.path}.${i}.${item.key}`))}
                </div>
                {spec.path === 'magias' && (
                  <SpellDamageEditor
                    spell={row as unknown as SheetSpell}
                    attributes={calc.atributos}
                    path={spec.path + '.' + i}
                    errors={errors}
                    onChange={(spell) => {
                      const next = structuredClone(content);
                      next.magias[i] = spell;
                      change(next);
                    }}
                  />
                )}
                {spec.path === 'magias' && (
                  <section className="spell-metadata">
                    <h4>Conjuração e descrição</h4>
                    <div className="field-grid">
                      {spec.fields
                        .slice(4)
                        .map((item) => field(item, `${spec.path}.${i}.${item.key}`))}
                    </div>
                  </section>
                )}
                <SheetActionButtons path={spec.path} entry={row} />
                {spec.path === 'conjuracao.perfis' && (
                  <p className="calculation">
                    Atributo {signed(calc.perfis[String(row.id)]?.modificador || 0)} · CD de
                    salvaguarda {calc.perfis[String(row.id)]?.cd} · Ataque{' '}
                    {signed(calc.perfis[String(row.id)]?.ataque || 0)}
                  </p>
                )}
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() =>
                    change(
                      limparReferencias(
                        set(
                          content,
                          spec.path,
                          rows.filter((_, j) => j !== i),
                        ),
                      ),
                    )
                  }
                >
                  Remover {spec.title.toLowerCase()} {i + 1}
                </button>
              </fieldset>
            ),
        )}
      </section>
    );
  }
  return (
    <>
      <div className="sheet-stats">
        <div>
          <span>Nível total</span>
          <strong>{calc.nivel}</strong>
        </div>
        <div>
          <span>Proficiência</span>
          <strong data-testid="proficiency">{signed(calc.proficiencia)}</strong>
        </div>
        <div>
          <span>Iniciativa</span>
          <strong>{signed(calc.iniciativa)}</strong>
        </div>
        <div>
          <span>Percepção passiva</span>
          <strong>{calc.percepcaoPassiva}</strong>
        </div>
      </div>
      <div
        className="sheet-tabs"
        role="tablist"
        aria-label="Seções da ficha"
        onKeyDown={(e) => {
          const current = Number((e.target as HTMLElement).dataset.tab);
          let next = current;
          if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
          else if (e.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = tabs.length - 1;
          else return;
          e.preventDefault();
          setTab(next);
          document.getElementById(prefix + '-tab-' + next)?.focus();
        }}
      >
        {tabs.map((label, i) => (
          <button
            key={label}
            id={prefix + '-tab-' + i}
            data-tab={i}
            role="tab"
            aria-selected={tab === i}
            aria-controls={prefix + '-panel-' + i}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset
        disabled={readOnly}
        className="tab-panel sheet-body"
        role="tabpanel"
        id={prefix + '-panel-' + tab}
        aria-labelledby={prefix + '-tab-' + tab}
      >
        {tab === 0 && (
          <>
            <section className="form-section">
              <h3>Identidade</h3>
              <div className="field-grid">{identity.map((spec) => field(spec))}</div>
            </section>
            {repeated(lists.classes)}
            <section className="form-section">
              <h3>História e personalidade</h3>
              <div className="field-grid">{story.map((spec) => field(spec))}</div>
            </section>
          </>
        )}
        {tab === 1 && (
          <>
            <section className="form-section">
              <h3>Atributos e resistências</h3>
              <div className="ability-grid">
                {Object.entries(ATRIBUTOS).map(([key, label]) => (
                  <fieldset className="ability" key={key}>
                    <legend>{label}</legend>
                    <strong data-testid={'mod-' + key}>{signed(calc.atributos[key])}</strong>
                    {field(number(`atributos.${key}.valor`, `${label}: valor`, 1, 99))}
                    {field(
                      number(`atributos.${key}.ajusteModificador`, `${label}: ajuste`, -99, 99),
                    )}
                    {field({
                      key: `atributos.${key}.resistenciaProficiente`,
                      label: `${label}: resistência proficiente`,
                      type: 'checkbox',
                    })}
                    {field(
                      number(
                        `atributos.${key}.ajusteResistencia`,
                        `${label}: ajuste de resistência`,
                        -99,
                        99,
                      ),
                    )}
                    <p>Resistência: {signed(calc.resistencias[key])}</p>
                  </fieldset>
                ))}
              </div>
              {field(number('combate.ajusteProficiencia', 'Ajuste de proficiência', -99, 99))}
            </section>
            <section className="form-section">
              <h3>Perícias</h3>
              <div className="skill-list">
                {Object.entries(PERICIAS).map(([key, [label]]) => (
                  <fieldset key={key} className="skill">
                    <legend>{label}</legend>
                    <strong>{signed(calc.pericias[key])}</strong>
                    <div className="field-grid">
                      {field({
                        key: `pericias.${key}.atributo`,
                        label: `${label}: atributo`,
                        type: 'select',
                        options: attributeOptions,
                      })}
                      {field({
                        key: `pericias.${key}.grau`,
                        label: `${label}: proficiência`,
                        type: 'select',
                        options: [
                          ['nenhuma', 'Sem proficiência'],
                          ['meia', 'Meia proficiência'],
                          ['proficiente', 'Proficiente'],
                          ['especializacao', 'Especialização'],
                        ],
                      })}
                      {field(number(`pericias.${key}.ajuste`, `${label}: ajuste`, -99, 99))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === 2 && (
          <>
            <section className="form-section">
              <h3>Defesa e vitalidade</h3>
              <div className="field-grid">{combat.map((spec) => field(spec))}</div>
            </section>
            <section className="form-section combat-spells">
              <div className="section-heading">
                <h3>Magias de combate</h3>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setTab(4);
                    document.getElementById(prefix + '-tab-4')?.focus();
                  }}
                >
                  Editar magias
                </button>
              </div>
              <p className="muted">
                As magias cadastradas na aba Magias já estão disponíveis aqui. Configure o dano uma
                vez e use as mesmas ações durante a sessão.
              </p>
              {!content.magias.length && (
                <p className="empty-line">
                  Adicione uma magia na aba Magias para usar seus dados em combate.
                </p>
              )}
              {[...content.magias]
                .sort((a, b) => a.circulo - b.circulo)
                .map((spell) => (
                  <article className="play-entry" key={spell.id}>
                    <strong>{spell.nome || 'Magia sem nome'}</strong>
                    <p>
                      {spell.circulo === 0 ? 'Truque' : 'Círculo ' + spell.circulo}
                      {spell.perfilId && calc.perfis[spell.perfilId]
                        ? ' · Ataque ' +
                          signed(calc.perfis[spell.perfilId].ataque) +
                          ' · CD ' +
                          calc.perfis[spell.perfilId].cd
                        : ''}
                    </p>
                    <ul className="spell-damage-summary">
                      {formulasMagia(spell, calc.atributos).map((d) => (
                        <li key={d.id}>
                          {d.formula} {d.tipo || 'Sem tipo'}
                        </li>
                      ))}
                    </ul>
                    <SheetActionButtons path="magias" entry={spell as unknown as Tree} />
                  </article>
                ))}
            </section>
            {[lists.hitDice, lists.speeds, lists.conditions, lists.attacks, lists.resources].map(
              (spec) => repeated(spec),
            )}
            {content.ataques.some((a) => a.itemId) && (
              <section className="form-section">
                <h3>Ataques de equipamentos</h3>
                <p className="muted">Edite a arma e seus danos na aba Inventário.</p>
                {content.ataques
                  .filter((a) => a.itemId)
                  .map((a) => (
                    <div className="play-entry" key={a.id}>
                      <strong>{a.nome}</strong>
                      <p className="calculation">
                        Acerto {signed(a.valor)} · Dano {a.dano || 'Sem fórmula'} · Crítico{' '}
                        {a.critico ?? 20}–20
                      </p>
                      <SheetActionButtons path="ataques" entry={a as unknown as Tree} />
                    </div>
                  ))}
              </section>
            )}
          </>
        )}
        {tab === 3 && (
          <>
            {[lists.features, lists.traits, lists.feats].map((spec) => repeated(spec))}
            <section className="form-section">
              <h3>Treinamento</h3>
              <div className="field-grid">{training.map((spec) => field(spec))}</div>
            </section>
            {repeated(lists.languages)}
          </>
        )}
        {tab === 4 && (
          <>
            {repeated(lists.profiles)}
            <SpellEditor
              content={content}
              onChange={change}
              catalog={catalog}
              compendium={compendium}
              field={field}
              renderSpell={(i) => repeated(lists.spells, i)}
            />
          </>
        )}
        {tab === 5 && (
          <>
            <section className="form-section">
              <h3>Moedas</h3>
              <div className="field-grid">
                {[
                  ['pc', 'Cobre'],
                  ['pp', 'Prata'],
                  ['pe', 'Electro'],
                  ['po', 'Ouro'],
                  ['pl', 'Platina'],
                ].map(([key, label]) =>
                  field(number('inventario.moedas.' + key, label, 0, 999999999)),
                )}
              </div>
            </section>
            <InventoryEditor
              content={content}
              onChange={change}
              field={field}
              readOnly={readOnly}
            />
            <details className="equipment-legacy">
              <summary>Sintonia personalizada e opções da mesa</summary>
              {field(number('inventario.limiteSintonizacao', 'Limite de sintonização'))}
              {repeated(lists.attuned)}
            </details>
          </>
        )}
      </fieldset>
    </>
  );
}
