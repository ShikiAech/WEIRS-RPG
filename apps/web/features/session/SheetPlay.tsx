import { Fragment, useState } from 'react';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { ChatCommand, RollMode, SheetAction } from '../../../../packages/contracts/chat';
import type { SessionCommand } from '../../../../packages/contracts/session';
import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';
import { calcularFicha } from '../../../../packages/sheets/calculos.js';
import { FavoriteActions } from './FavoriteActions';
import { useActionFavorites } from './useActionFavorites';
import { FAVORITE_LIMIT } from './action-favorites';
import { TIPOS_EQUIPAMENTO } from '../../../../packages/sheets/equipamentos.js';

type Entry = {
  id: string;
  nome: string;
  tipo?: string;
  dano?: string;
  perfilId?: string;
  descricao?: string;
  concentracao?: boolean;
  circulo?: number;
  dado?: string;
  maximo: number;
  gastos: number;
  quantidade: number;
};
const entries = (value: unknown) => value as Entry[];
const sign = (n: number) => (n >= 0 ? '+' + n : String(n));
export function SheetPlay({
  record,
  userId,
  disabled,
  onRoll,
  operate,
}: {
  record: SheetRecord;
  userId: string;
  disabled: boolean;
  onRoll: (c: ChatCommand) => void;
  operate: (c: SessionCommand) => void;
}) {
  const [tab, setTab] = useState('Testes'),
    [mode, setMode] = useState<RollMode>('normal'),
    [amount, setAmount] = useState(1),
    [condition, setCondition] = useState(''),
    [hitDiceRecovery, setHitDiceRecovery] = useState('todos'),
    [concentration, setConcentration] = useState('');
  const c = record.conteudo,
    calc = calcularFicha(c);
  const favorites = useActionFavorites(userId, record.campanha_id, record.id);
  const change = (command: Record<string, unknown> & { tipo: string }) =>
    operate({ ...command, ficha_id: record.id, versao: record.versao });
  const roll = (acao: SheetAction, id: string, label: string, normal = false, blocked = false) => (
    <span className="sheet-roll-action">
      <button
        type="button"
        className="play-roll"
        disabled={disabled || blocked}
        onClick={() =>
          onRoll({
            tipo: 'acao',
            ficha_id: record.id,
            versao: record.versao,
            entrada_id: id,
            acao,
            modo: normal ? 'normal' : mode,
          })
        }
      >
        {label}
      </button>
      <button
        type="button"
        className="favorite-star"
        aria-pressed={favorites.has({ acao, entrada_id: id })}
        aria-label={
          (favorites.has({ acao, entrada_id: id }) ? 'Remover favorito ' : 'Favoritar ') + label
        }
        title={
          favorites.references.length >= FAVORITE_LIMIT && !favorites.has({ acao, entrada_id: id })
            ? 'Limite de 12 favoritos. Remova um para adicionar outro.'
            : 'Favorito para ações rápidas'
        }
        disabled={
          !favorites.has({ acao, entrada_id: id }) && favorites.references.length >= FAVORITE_LIMIT
        }
        onClick={() => favorites.toggle({ acao, entrada_id: id })}
      >
        {favorites.has({ acao, entrada_id: id }) ? '★' : '☆'}
      </button>
    </span>
  );
  return (
    <>
      <div className="play-controls">
        <div className="play-tabs" aria-label="Seções da ficha">
          {['Testes', 'Ações', 'Recursos', 'Inventário'].map((t) => (
            <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <label className="play-mode">
          Modo dos testes
          <select
            value={mode}
            disabled={disabled}
            onChange={(e) => setMode(e.target.value as RollMode)}
          >
            <option value="normal">Normal</option>
            <option value="vantagem">Vantagem</option>
            <option value="desvantagem">Desvantagem</option>
          </select>
        </label>
      </div>
      {favorites.references.length > 0 ? (
        <details className="sheet-favorites" open>
          <summary>Ações favoritas ({favorites.references.length})</summary>
          <FavoriteActions
            record={record}
            userId={userId}
            disabled={disabled}
            mode={mode}
            onRoll={onRoll}
            compact
          />
        </details>
      ) : (
        <p className="action-help sheet-favorites-help">
          Marque ☆ ao lado das ações para criar seus favoritos.
        </p>
      )}
      <div className="play-vitals">
        <strong>
          PV {c.combate.pvAtuais}/{c.combate.pvMaximos}
        </strong>
        <span>
          Temp. {c.combate.pvTemporarios} · CA {c.combate.ca}
          {c.combate.exaustao > 0 && ` · Exaustão ${c.combate.exaustao}`}
        </span>
      </div>
      <fieldset disabled={disabled} className="play-fields">
        <label>
          Quantidade de PV
          <input
            type="number"
            min="0"
            max="9999"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <div className="play-actions">
          {(['dano', 'cura', 'temporarios'] as const).map((action) => (
            <button
              key={action}
              type="button"
              className="button secondary"
              onClick={() => change({ tipo: 'pv', acao: action, valor: amount })}
            >
              {action === 'dano' ? 'Aplicar dano' : action === 'cura' ? 'Curar' : 'PV temporários'}
            </button>
          ))}
        </div>
        <small>
          Dano absorve PV temporários primeiro. Ajuste o valor por resistências e regras da mesa.
        </small>
      </fieldset>
      {tab === 'Testes' && (
        <div className="play-tests">
          {roll(
            'iniciativa',
            'iniciativa',
            `Iniciativa ${sign(calc.iniciativa)} · entrar no combate`,
          )}
          <h3>Atributos e resistências</h3>
          {Object.entries(ATRIBUTOS).map(([key, name]) => (
            <div className="play-actions" key={key}>
              {roll(
                'atributo',
                key,
                `${name} ${sign((calc.atributos as Record<string, number>)[key])}`,
              )}
              {roll(
                'resistencia',
                key,
                `Resistência: ${name} ${sign((calc.resistencias as Record<string, number>)[key])}`,
              )}
            </div>
          ))}
          <h3>Perícias</h3>
          {Object.entries(PERICIAS).map(([key, [name]]) => (
            <div key={key}>
              {roll(
                'pericia',
                key,
                `${name} ${sign((calc.pericias as Record<string, number>)[key])}`,
              )}
            </div>
          ))}
          <h3>Salvaguardas contra morte</h3>
          <p>
            Sucessos {c.combate.sucessosMorte}/3 · Falhas {c.combate.falhasMorte}/3
          </p>
          {c.combate.pvAtuais === 0 &&
            c.combate.sucessosMorte < 3 &&
            c.combate.falhasMorte < 3 &&
            roll('morte', 'morte', 'Rolar teste de morte', true)}
        </div>
      )}
      {tab === 'Ações' && (
        <>
          <h3>Ataques</h3>
          {c.ataques.map((e) => (
            <article className="play-entry" key={e.id}>
              <strong>{e.nome}</strong>
              <small>
                {e.tipo === 'cd' ? `CD ${e.valor}` : `Acerto ${sign(e.valor)}`}
                {e.itemId && ` · Crítico ${e.critico ?? 20}–20`}
              </small>
              {e.danos
                ?.filter((d) => d.dado.trim())
                .map((d) => (
                  <small key={d.id}>
                    {d.dado}
                    {d.atributo ? ` ${sign(calc.atributos[d.atributo])}` : ''} {d.tipo}
                  </small>
                ))}
              <div className="play-actions">
                {roll(
                  'ataque',
                  e.id,
                  e.tipo === 'cd' ? 'Anunciar CD' : `Ataque: ${e.nome}`,
                  e.tipo === 'cd',
                )}
                {e.dano && roll('dano', e.id, `Dano: ${e.nome}`, true)}
              </div>
            </article>
          ))}
          {!c.ataques.length && <p>Configure os ataques na ficha completa.</p>}
          <h3>Magias</h3>
          {c.conjuracao.perfis.map((p, i) => (
            <div className="play-entry" key={p.id}>
              <strong>{p.nome || `Perfil ${i + 1}`}</strong>
              <small>
                {ATRIBUTOS[p.atributo as keyof typeof ATRIBUTOS]}{' '}
                {sign(calc.perfis[p.id]?.modificador || 0)} · CD {calc.perfis[p.id]?.cd} · Ataque{' '}
                {sign(calc.perfis[p.id]?.ataque || 0)}
              </small>
            </div>
          ))}
          {[...c.magias]
            .sort((a, b) => (a.circulo || 0) - (b.circulo || 0))
            .map((e, i, list) => (
              <Fragment key={e.id}>
                {(i === 0 || list[i - 1].circulo !== e.circulo) && (
                  <h4 className="spell-circle-title">
                    {e.circulo === 0 ? 'Truques' : `Círculo ${e.circulo}`}
                  </h4>
                )}
                <article className="play-entry" key={e.id}>
                  <strong>
                    {e.nome} · {e.circulo === 0 ? 'Truque' : 'Círculo ' + e.circulo}
                  </strong>
                  <div className="play-actions">
                    {roll('magia', e.id, `Conjurar: ${e.nome}`, true)}
                    {e.perfilId && roll('magia_ataque', e.id, `Ataque de magia: ${e.nome}`)}
                    {e.dano && roll('magia_dano', e.id, `Dano de magia: ${e.nome}`, true)}
                    {e.concentracao && (
                      <button
                        type="button"
                        disabled={disabled}
                        className="play-roll"
                        onClick={() => change({ tipo: 'concentracao', nome: e.nome })}
                      >
                        Concentrar: {e.nome}
                      </button>
                    )}
                  </div>
                  {(e.descricao || e.material || e.tempo || e.duracao || e.alcance) && (
                    <details className="spell-play-details">
                      <summary>Detalhes de {e.nome}</summary>
                      <dl className="spell-play-meta">
                        {e.tempo && (
                          <>
                            <dt>Conjuração</dt>
                            <dd>{e.tempo}</dd>
                          </>
                        )}
                        {e.alcance && (
                          <>
                            <dt>Alcance</dt>
                            <dd>{e.alcance}</dd>
                          </>
                        )}
                        {e.duracao && (
                          <>
                            <dt>Duração</dt>
                            <dd>{e.duracao}</dd>
                          </>
                        )}
                        {(e.verbal || e.somatico || e.material) && (
                          <>
                            <dt>Componentes</dt>
                            <dd>
                              {[e.verbal ? 'V' : '', e.somatico ? 'S' : '', e.material ? 'M' : '']
                                .filter(Boolean)
                                .join(', ')}
                            </dd>
                          </>
                        )}
                      </dl>
                      {e.material && <p>Material: {e.material}</p>}
                      <p>{e.descricao}</p>
                    </details>
                  )}
                </article>
              </Fragment>
            ))}
          {!c.magias.length && <p>Adicione magias na ficha completa.</p>}
          <small>
            Use Recursos para gastar o espaço escolhido; rituais, truques e homebrew podem dispensar
            esse gasto.
          </small>
          <h3>Condições e concentração</h3>
          <fieldset disabled={disabled} className="play-fields">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                change({ tipo: 'condicao', nome: condition, ativa: true });
                setCondition('');
              }}
            >
              <label>
                Nova condição
                <input
                  maxLength={120}
                  required
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                />
              </label>
              <button className="button secondary">Aplicar condição</button>
            </form>
            {entries(c.combate.condicoes).map((e) => (
              <button
                type="button"
                className="play-roll"
                key={e.id}
                onClick={() => change({ tipo: 'condicao', nome: e.nome, ativa: false })}
              >
                Remover {e.nome}
              </button>
            ))}
            <p>Concentração: {c.combate.concentracaoAtiva || 'Nenhuma'}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                change({ tipo: 'concentracao', nome: concentration });
              }}
            >
              <label>
                Concentração ativa
                <input
                  maxLength={120}
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                />
              </label>
              <button className="button secondary">Atualizar concentração</button>
            </form>
            {c.combate.concentracaoAtiva && (
              <button
                type="button"
                className="play-roll"
                onClick={() => change({ tipo: 'concentracao', nome: '' })}
              >
                Encerrar concentração
              </button>
            )}
          </fieldset>
        </>
      )}
      {tab === 'Recursos' && (
        <fieldset disabled={disabled} className="play-fields">
          <h3>Espaços de magia</h3>
          {c.conjuracao.espacos
            .filter((e) => e.total > 0)
            .map((e) => (
              <div className="play-entry" key={e.circulo}>
                Círculo {e.circulo} · {e.total - e.gastos}/{e.total}
                <div className="play-actions">
                  <button
                    className="play-roll"
                    disabled={e.gastos >= e.total}
                    onClick={() =>
                      change({ tipo: 'gasto', caminho: 'espaco', circulo: e.circulo, delta: 1 })
                    }
                  >
                    Gastar espaço {e.circulo}
                  </button>
                  <button
                    className="play-roll"
                    disabled={e.gastos === 0}
                    onClick={() =>
                      change({ tipo: 'gasto', caminho: 'espaco', circulo: e.circulo, delta: -1 })
                    }
                  >
                    Recuperar espaço {e.circulo}
                  </button>
                </div>
              </div>
            ))}
          {c.conjuracao.pacto.total > 0 && (
            <div className="play-entry">
              Pacto · {c.conjuracao.pacto.total - c.conjuracao.pacto.gastos}/
              {c.conjuracao.pacto.total}
              <div className="play-actions">
                {[1, -1].map((delta) => (
                  <button
                    key={delta}
                    className="play-roll"
                    disabled={
                      delta === 1
                        ? c.conjuracao.pacto.gastos >= c.conjuracao.pacto.total
                        : c.conjuracao.pacto.gastos === 0
                    }
                    onClick={() => change({ tipo: 'gasto', caminho: 'pacto', delta })}
                  >
                    {delta === 1 ? 'Gastar pacto' : 'Recuperar pacto'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <h3>Recursos de classe e homebrew</h3>
          {entries(c.recursos).map((e) => (
            <div className="play-entry" key={e.id}>
              {e.nome} · {e.maximo - e.gastos}/{e.maximo}
              {c.recursos.find((r) => r.id === e.id)?.itemId && (
                <small>
                  Equipamento:{' '}
                  {c.inventario.itens.find(
                    (item) => item.id === c.recursos.find((r) => r.id === e.id)?.itemId,
                  )?.nome || 'Sem nome'}
                </small>
              )}
              <div className="play-actions">
                {[1, -1].map((delta) => (
                  <button
                    key={delta}
                    className="play-roll"
                    disabled={delta === 1 ? e.gastos >= e.maximo : e.gastos === 0}
                    onClick={() =>
                      change({ tipo: 'gasto', caminho: 'recurso', entrada_id: e.id, delta })
                    }
                  >
                    {delta === 1 ? 'Gastar' : 'Recuperar'} {e.nome}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <h3>Dados de vida e descansos</h3>
          {entries(c.combate.dadosVida).map((e) => (
            <div className="play-entry" key={e.id}>
              {e.dado} · {e.maximo - e.gastos}/{e.maximo}
              {roll('dado_vida', e.id, `Gastar e rolar ${e.dado}`, true, e.gastos >= e.maximo)}
            </div>
          ))}
          <div className="play-actions">
            <button
              className="button secondary"
              disabled={disabled || c.combate.pvAtuais <= 0 || c.combate.falhasMorte >= 3}
              onClick={() => change({ tipo: 'descanso', descanso: 'curto' })}
            >
              Descanso curto
            </button>
            <button
              className="button secondary"
              disabled={disabled || c.combate.pvAtuais <= 0 || c.combate.falhasMorte >= 3}
              onClick={() =>
                change({ tipo: 'descanso', descanso: 'longo', recuperacao_dados: hitDiceRecovery })
              }
            >
              Descanso longo
            </button>
          </div>
          <label>
            Dados de vida no descanso longo
            <select value={hitDiceRecovery} onChange={(e) => setHitDiceRecovery(e.target.value)}>
              <option value="todos">Todos (D&D 2024)</option>
              <option value="metade">Metade do total (D&D 2014)</option>
              <option value="nenhum">Nenhum (ajuste manual)</option>
            </select>
          </label>
          <small>
            Curto recupera recursos marcados e pacto. Longo recupera PV, espaços e dados de vida,
            remove PV temporários e reduz exaustão em 1. Use após o mestre confirmar o descanso;
            duração, interrupções e exceções homebrew são decididas pela mesa.
          </small>
        </fieldset>
      )}
      {tab === 'Inventário' && (
        <>
          <p>
            {Object.entries(c.inventario.moedas)
              .map(([key, value]) => `${value} ${key.toUpperCase()}`)
              .join(' · ')}
          </p>
          <p className="calculation">
            Sintonia {c.inventario.sintonizados.length}/{c.inventario.limiteSintonizacao} · Peso
            total{' '}
            {c.inventario.itens
              .reduce((sum, e) => sum + e.quantidade * e.peso, 0)
              .toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
            kg
          </p>
          {!c.inventario.itens.length && <p>Seu inventário está vazio.</p>}
          {c.inventario.itens.map((e) => (
            <article className="play-entry" key={e.id}>
              <strong>
                {e.nome} × {e.quantidade}
              </strong>
              <small>
                {TIPOS_EQUIPAMENTO[e.tipo || 'basico']} · {e.peso.toLocaleString('pt-BR')} kg/un.
                {e.equipado ? ' · Equipado' : ''}
                {c.inventario.sintonizados.some((s) => s.itemId === e.id) ? ' · Sintonizado' : ''}
              </small>
              <details className="equipment-play-details">
                <summary>Detalhes de {e.nome || 'equipamento'}</summary>
                {e.tipo === 'arma' && (
                  <p>
                    {e.categoriaArma === 'marcial' ? 'Marcial' : 'Simples'} ·{' '}
                    {e.alcanceArma === 'distancia' ? 'Distância' : 'Corpo a corpo'} · Crítico{' '}
                    {e.critico ?? 20}–20
                  </p>
                )}
                {e.tipo === 'armadura' && (
                  <>
                    <p>
                      Armadura {e.categoriaArmadura || 'leve'} · CA base {e.caBase ?? 10} · Força
                      mínima {e.forcaMinima || 0}
                    </p>
                    <p>
                      {e.adicionarDestreza !== false
                        ? `Adiciona Destreza (limite ${e.limiteDestreza ?? 'ilimitado'})`
                        : 'Sem bônus de Destreza'}
                      {e.desvantagemFurtividade ? ' · Desvantagem em Furtividade' : ''}
                    </p>
                  </>
                )}
                {e.tipo === 'escudo' && (
                  <p>
                    Bônus de CA {sign(e.bonusCa ?? 2)} · Outros bônus {sign(e.outrosBonus ?? 0)}
                  </p>
                )}
                {e.descricao && <p>{e.descricao}</p>}
                {e.observacoes && <p>{e.observacoes}</p>}
                {(e.cargasMaximas || 0) > 0 && (
                  <p>
                    Cargas {e.cargasMaximas - e.cargasGastas}/{e.cargasMaximas}
                  </p>
                )}
                {c.ataques
                  .filter((a) => a.itemId === e.id)
                  .map((a) => (
                    <div className="play-entry" key={a.id}>
                      <strong>{a.nome || 'Ataque'}</strong>
                      <small>
                        Acerto {sign(a.valor)} · {a.dano || 'Sem dano'} {a.tipoDano}
                      </small>
                      <div className="play-actions">
                        {roll('ataque', a.id, `Ataque: ${a.nome}`)}
                        {a.dano && roll('dano', a.id, `Dano: ${a.nome}`, true)}
                      </div>
                    </div>
                  ))}
                {c.recursos
                  .filter((r) => r.itemId === e.id)
                  .map((r) => (
                    <div className="play-entry" key={r.id}>
                      <strong>
                        {r.nome || 'Recurso'} · {r.maximo - r.gastos}/{r.maximo}
                      </strong>
                      <div className="play-actions">
                        {[1, -1].map((delta) => (
                          <button
                            type="button"
                            key={delta}
                            className="play-roll"
                            disabled={
                              disabled || (delta === 1 ? r.gastos >= r.maximo : r.gastos === 0)
                            }
                            onClick={() =>
                              change({ tipo: 'gasto', caminho: 'recurso', entrada_id: r.id, delta })
                            }
                          >
                            {delta === 1 ? 'Gastar' : 'Recuperar'} {r.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </details>
              <button
                className="play-roll"
                disabled={disabled || e.quantidade < 1}
                onClick={() =>
                  change({ tipo: 'gasto', caminho: 'item', entrada_id: e.id, delta: 1 })
                }
              >
                Consumir: {e.nome}
              </button>
            </article>
          ))}
        </>
      )}
      <a className="back-link" href={'#/fichas/' + record.id}>
        Editar ficha completa →
      </a>
    </>
  );
}
