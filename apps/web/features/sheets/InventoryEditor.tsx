import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { EquipmentItem, SheetContent } from '../../../../packages/contracts/sheets';
import { novaEntrada } from '../../../../packages/sheets/modelo.js';
import { calcularFicha } from '../../../../packages/sheets/calculos.js';
import {
  alterarSintonia,
  formulaDano,
  novoAtaqueEquipamento,
  novoDano,
  novoEquipamento,
  removerEquipamento,
  TIPOS_EQUIPAMENTO,
  validarFormulaDano,
} from '../../../../packages/sheets/equipamentos.js';
import { attributeOptions, number } from './fields';
import type { FieldSpec } from './fields';
import { SheetActionButtons, SheetDescriptionTitle } from './SheetChat';

export type RenderField = (spec: FieldSpec, path?: string) => ReactNode;
const text = (key: string, label: string, long = false): FieldSpec => ({
  key,
  label,
  type: long ? 'textarea' : 'text',
});
const select = (key: string, label: string, options: [string, string][]): FieldSpec => ({
  key,
  label,
  type: 'select',
  options,
});
const flag = (key: string, label: string): FieldSpec => ({ key, label, type: 'checkbox' });
const sign = (n: number) => (n >= 0 ? '+' : '') + n;
const base: FieldSpec[] = [
  text('nome', 'Nome do item'),
  select('tipo', 'Tipo de equipamento', Object.entries(TIPOS_EQUIPAMENTO)),
  number('quantidade', 'Quantidade'),
  { ...number('peso', 'Peso (kg)'), step: '0.01', hint: 'Peso unitário, em kg.' },
  flag('equipado', 'Item equipado'),
  text('descricao', 'Descrição do item', true),
];
const weapon: FieldSpec[] = [
  select('categoriaArma', 'Categoria da arma', [
    ['simples', 'Simples'],
    ['marcial', 'Marcial'],
  ]),
  select('alcanceArma', 'Alcance da arma', [
    ['corpo-a-corpo', 'Corpo a corpo'],
    ['distancia', 'Distância'],
  ]),
  {
    ...number('critico', 'Crítico a partir de', 1, 20),
    hint: 'Resultado natural mínimo no d20. Padrão: 20.',
  },
];
const armor: FieldSpec[] = [
  select('categoriaArmadura', 'Categoria da armadura', [
    ['leve', 'Leve'],
    ['media', 'Média'],
    ['pesada', 'Pesada'],
  ]),
  { ...number('forcaMinima', 'Força mínima', 0, 99), hint: '0 indica que não há requisito.' },
  number('caBase', 'CA base', 0, 99),
  {
    ...number('limiteDestreza', 'Limite do bônus de Destreza', 0, 99),
    nullable: true,
    hint: 'Deixe vazio para ilimitado.',
  },
  flag('adicionarDestreza', 'Adicionar Destreza à CA'),
  flag('desvantagemFurtividade', 'Desvantagem em Furtividade'),
];
const shield: FieldSpec[] = [
  number('bonusCa', 'Bônus de CA', -99, 99),
  number('outrosBonus', 'Outros bônus', -99, 99),
];

export function InventoryEditor({
  content: c,
  onChange,
  field,
  readOnly,
}: {
  content: SheetContent;
  onChange: (c: SheetContent) => void;
  field: RenderField;
  readOnly: boolean;
}) {
  const [query, setQuery] = useState('');
  const prefix = useId();
  const [notice, setNotice] = useState('');
  const calc = calcularFicha(c);
  const emit = (next: SheetContent) => {
    setNotice('');
    onChange(next);
  };
  const totalWeight = c.inventario.itens.reduce(
    (sum, item) => sum + item.peso * item.quantidade,
    0,
  );
  const attuned = c.inventario.sintonizados.length;
  const normalized = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const rows = c.inventario.itens
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => normalized(item.nome).includes(normalized(query)));
  function changeItemType(i: number, value: EquipmentItem['tipo']) {
    const next = structuredClone(c);
    next.inventario.itens[i] = { ...novoEquipamento(), ...next.inventario.itens[i], tipo: value };
    emit(next);
  }
  return (
    <section className="form-section equipment-editor">
      <div className="section-heading">
        <div>
          <h3>Equipamentos</h3>
          <p className="muted">Armas, defesas e recursos do seu personagem.</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const next = structuredClone(c);
            next.inventario.itens.push(novoEquipamento() as EquipmentItem);
            setQuery('');
            emit(next);
          }}
        >
          Adicionar item
        </button>
      </div>
      <div className="equipment-overview">
        <span>
          Peso total{' '}
          <strong>{totalWeight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg</strong>
        </span>
        <span role="status">
          Sintonia{' '}
          <strong>
            {attuned}/{c.inventario.limiteSintonizacao}
          </strong>
        </span>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {c.inventario.itens.length > 3 && (
        <label className="field equipment-search">
          Buscar equipamentos
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      {!rows.length && (
        <p className="empty-line">
          {query
            ? 'Nenhum equipamento com esse nome.'
            : 'Seu inventário está vazio. Adicione seu primeiro equipamento.'}
        </p>
      )}
      {rows.map(({ item, i }) => {
        const path = `inventario.itens.${i}`;
        const type = item.tipo || 'basico';
        const isAttuned = c.inventario.sintonizados.some((x) => x.itemId === item.id);
        const attacks = c.ataques
          .map((a, index) => ({ a, index }))
          .filter(({ a }) => a.itemId === item.id);
        const resources = c.recursos
          .map((r, index) => ({ r, index }))
          .filter(({ r }) => r.itemId === item.id);
        return (
          <details className="equipment-card" key={item.id} open>
            <summary>
              <span>
                <strong>{item.nome || `Equipamento ${i + 1}`}</strong>
                <small>
                  {TIPOS_EQUIPAMENTO[type]} · ×{item.quantidade} ·{' '}
                  {(item.peso * item.quantidade).toLocaleString('pt-BR', {
                    maximumFractionDigits: 2,
                  })}{' '}
                  kg{isAttuned ? ' · Sintonizado' : ''}
                </small>
              </span>
              <span className="equipment-edit-cue">Detalhes</span>
            </summary>
            <div className="equipment-card-body">
              <div className="field-grid">
                {base.map((spec) =>
                  spec.key === 'tipo' ? (
                    <div className="field" key="tipo">
                      <label htmlFor={`${prefix}-tipo-${item.id}`}>Tipo de equipamento</label>
                      <select
                        id={`${prefix}-tipo-${item.id}`}
                        value={type}
                        onChange={(e) => changeItemType(i, e.target.value as EquipmentItem['tipo'])}
                      >
                        {Object.entries(TIPOS_EQUIPAMENTO).map(([v, l]) => (
                          <option value={v} key={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    field(spec, `${path}.${spec.key}`)
                  ),
                )}
                <label className="field check-field">
                  <span>
                    <input
                      type="checkbox"
                      checked={isAttuned}
                      disabled={
                        readOnly || (!isAttuned && attuned >= c.inventario.limiteSintonizacao)
                      }
                      onChange={(e) => emit(alterarSintonia(c, item.id, e.target.checked))}
                    />{' '}
                    Item sintonizado
                  </span>
                </label>
              </div>
              {!isAttuned && attuned >= c.inventario.limiteSintonizacao && (
                <p className="muted">
                  Limite de sintonia atingido. Remova uma sintonia para liberar uma vaga.
                </p>
              )}
              {type === 'arma' && (
                <fieldset className="equipment-subsection">
                  <legend>Configuração da arma</legend>
                  <div className="field-grid">
                    {weapon.map((spec) => field(spec, `${path}.${spec.key}`))}
                  </div>
                  {attacks.map(({ a, index }, ai) => (
                    <fieldset className="equipment-attack" key={a.id}>
                      <legend>
                        <SheetDescriptionTitle
                          path="ataques"
                          entry={a as unknown as Record<string, unknown>}
                        >
                          {a.nome || `Ataque ${ai + 1}`}
                        </SheetDescriptionTitle>
                      </legend>
                      <div className="field-grid">
                        {field(text('nome', 'Nome do ataque'), `ataques.${index}.nome`)}
                        {field(
                          select('atributo', 'Atributo de acerto', attributeOptions),
                          `ataques.${index}.atributo`,
                        )}
                        {field(
                          number('bonus', 'Bônus de ataque', -99, 99),
                          `ataques.${index}.bonus`,
                        )}
                        {field(
                          flag('proficiente', 'Proficiente com a arma'),
                          `ataques.${index}.proficiente`,
                        )}
                      </div>
                      <p className="calculation">
                        Acerto <strong>{sign(a.valor)}</strong> · Crítico {item.critico ?? 20}–20
                      </p>
                      {validarFormulaDano(a.dano) && (
                        <p className="notice error" role="alert">
                          {validarFormulaDano(a.dano)}
                        </p>
                      )}
                      {(a.danos || []).map((d, di) => (
                        <fieldset className="equipment-damage" key={d.id}>
                          <legend>Dano {di + 1}</legend>
                          <div className="field-grid">
                            {field(
                              {
                                ...text('dado', 'Fórmula de dados'),
                                hint: 'Ex.: 1d8 ou 2d6+2. O atributo é somado à fórmula.',
                              },
                              `ataques.${index}.danos.${di}.dado`,
                            )}
                            {field(
                              select('atributo', 'Atributo do dano', [
                                ['', 'Nenhum'],
                                ...attributeOptions,
                              ]),
                              `ataques.${index}.danos.${di}.atributo`,
                            )}
                            {field(
                              text('tipo', 'Tipo de dano'),
                              `ataques.${index}.danos.${di}.tipo`,
                            )}
                          </div>
                          <div className="entry-actions">
                            <span className="calculation">
                              {formulaDano(d, calc.atributos) || 'Sem fórmula'} {d.tipo}
                            </span>
                            <button
                              type="button"
                              className="text-button danger"
                              onClick={() => {
                                const next = structuredClone(c);
                                next.ataques[index].danos?.splice(di, 1);
                                emit(next);
                              }}
                            >
                              Remover dano {di + 1}
                            </button>
                          </div>
                        </fieldset>
                      ))}
                      <div className="entry-actions">
                        <button
                          type="button"
                          className="button secondary"
                          disabled={(a.danos?.length || 0) >= 20}
                          onClick={() => {
                            const next = structuredClone(c);
                            (next.ataques[index].danos ||= []).push(novoDano());
                            emit(next);
                          }}
                        >
                          Adicionar dano
                        </button>
                        <button
                          type="button"
                          className="text-button danger"
                          onClick={() => {
                            const next = structuredClone(c);
                            next.ataques.splice(index, 1);
                            emit(next);
                          }}
                        >
                          Remover ataque {ai + 1}
                        </button>
                      </div>
                      <SheetActionButtons
                        path="ataques"
                        entry={a as unknown as Record<string, unknown>}
                      />
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      const next = structuredClone(c);
                      next.ataques.push(novoAtaqueEquipamento(item));
                      emit(next);
                    }}
                  >
                    Adicionar ataque à arma
                  </button>
                </fieldset>
              )}
              {type === 'armadura' && (
                <fieldset className="equipment-subsection">
                  <legend>Configuração da armadura</legend>
                  <div className="field-grid">
                    {armor.map((spec) => field(spec, `${path}.${spec.key}`))}
                  </div>
                  <p className="calculation">
                    CA desta armadura:{' '}
                    {(item.caBase ?? 10) +
                      (item.adicionarDestreza !== false
                        ? Math.min(calc.atributos.des, item.limiteDestreza ?? Infinity)
                        : 0)}
                    . A CA de combate é ajustada manualmente.
                  </p>
                  {(item.forcaMinima || 0) > c.atributos.for.valor && (
                    <p className="notice">
                      Força abaixo do requisito ({item.forcaMinima}). Confira a penalidade com o
                      mestre.
                    </p>
                  )}
                </fieldset>
              )}
              {type === 'escudo' && (
                <fieldset className="equipment-subsection">
                  <legend>Configuração do escudo</legend>
                  <div className="field-grid">
                    {shield.map((spec) => field(spec, `${path}.${spec.key}`))}
                  </div>
                  <p className="calculation">
                    Bônus total: {sign((item.bonusCa ?? 2) + (item.outrosBonus ?? 0))}. Ajuste a CA
                    de combate manualmente.
                  </p>
                </fieldset>
              )}
              {attacks.length > 0 && type !== 'arma' && (
                <p className="notice">
                  Este item tem {attacks.length} ataque(s) vinculado(s). Selecione Arma para editar
                  os ataques.
                </p>
              )}
              <fieldset className="equipment-subsection">
                <legend>Recursos personalizados</legend>
                {!resources.length && (
                  <p className="empty-line">
                    Adicione cargas, munições ou outro recurso deste item.
                  </p>
                )}
                {resources.map(({ r, index }, ri) => (
                  <fieldset className="equipment-resource" key={r.id}>
                    <legend>Recurso {ri + 1}</legend>
                    <div className="field-grid">
                      {field(text('nome', 'Nome do recurso'), `recursos.${index}.nome`)}
                      <label className="field">
                        Quantidade atual
                        <input
                          type="number"
                          min="0"
                          max={r.maximo}
                          value={r.maximo - r.gastos}
                          onChange={(e) => {
                            const next = structuredClone(c);
                            next.recursos[index].gastos = r.maximo - Number(e.target.value);
                            emit(next);
                          }}
                        />
                      </label>
                      {field(number('maximo', 'Quantidade máxima'), `recursos.${index}.maximo`)}
                    </div>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() => {
                        const next = structuredClone(c);
                        next.recursos.splice(index, 1);
                        emit(next);
                      }}
                    >
                      Remover recurso {ri + 1}
                    </button>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    const next = structuredClone(c);
                    next.recursos.push({ ...novaEntrada('recursos'), itemId: item.id });
                    emit(next);
                  }}
                >
                  Adicionar recurso ao item
                </button>
              </fieldset>
              <details className="equipment-legacy">
                <summary>Observações e cargas adicionais</summary>
                <div className="field-grid">
                  {field(number('cargasMaximas', 'Cargas: máximo'), `${path}.cargasMaximas`)}
                  {field(number('cargasGastas', 'Cargas: gastas'), `${path}.cargasGastas`)}
                  {field(text('observacoes', 'Observações do item', true), `${path}.observacoes`)}
                </div>
              </details>
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Excluir ${item.nome || 'este equipamento'}? Seus ataques, recursos e sintonia vinculados também serão removidos.`,
                    )
                  ) {
                    emit(removerEquipamento(c, item.id));
                    setNotice('Equipamento e vínculos removidos.');
                  }
                }}
              >
                Excluir equipamento {item.nome || i + 1}
              </button>
            </div>
          </details>
        );
      })}
    </section>
  );
}
