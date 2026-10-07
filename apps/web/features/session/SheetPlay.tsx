import { useState } from 'react';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { ChatCommand, RollMode, SheetAction } from '../../../../packages/contracts/chat';
import type { SessionCommand } from '../../../../packages/contracts/session';
import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';
import { calcularFicha } from '../../../../packages/sheets/calculos.js';

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
  disabled,
  onRoll,
  operate,
}: {
  record: SheetRecord;
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
  const change = (command: Record<string, unknown> & { tipo: string }) =>
    operate({ ...command, ficha_id: record.id, versao: record.versao });
  const roll = (acao: SheetAction, id: string, label: string, normal = false, blocked = false) => (
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
  );
  return (
    <>
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
      <div className="play-tabs" aria-label="Seções da ficha">
        {['Testes', 'Ações', 'Recursos', 'Inventário'].map((t) => (
          <button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <label>
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
          {entries(c.ataques).map((e) => (
            <article className="play-entry" key={e.id}>
              <strong>{e.nome}</strong>
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
          {entries(c.magias).map((e) => (
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
              {e.descricao && (
                <details>
                  <summary>Descrição</summary>
                  <p>{e.descricao}</p>
                </details>
              )}
            </article>
          ))}
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
          {entries(c.inventario.itens).map((e) => (
            <article className="play-entry" key={e.id}>
              <strong>
                {e.nome} × {e.quantidade}
              </strong>
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
