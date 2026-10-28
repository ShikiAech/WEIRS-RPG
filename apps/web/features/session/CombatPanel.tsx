import { HitPointExpression } from './HitPointExpression';
import type { RollResult } from '../../../../packages/contracts/chat';
import { useState } from 'react';
import type {
  Combatant,
  SessionCommand,
  SessionState,
} from '../../../../packages/contracts/session';
export function CombatPanel({
  mesa,
  master,
  disabled,
  operate,
  hpResult,
}: {
  mesa: SessionState;
  master: boolean;
  disabled: boolean;
  operate: (c: SessionCommand) => Promise<boolean>;
  hpResult?: RollResult | null;
}) {
  const [name, setName] = useState(''),
    [hp, setHp] = useState(10),
    [ca, setCa] = useState(10),
    [initiative, setInitiative] = useState(0),
    [expressions, setExpressions] = useState<Record<string, string>>({});
  const combat = mesa.estado.combate;
  const command = (c: Record<string, unknown>) =>
    operate({ tipo: 'combate', versao: mesa.versao, ...c });
  return (
    <>
      <p className="play-vitals">
        <strong>{combat.ativo ? 'Combate ativo' : 'Preparar encontro'}</strong>
        <span>Rodada {combat.rodada}</span>
      </p>
      <p>
        Os jogadores entram rolando Iniciativa na ficha. O mestre adiciona os demais combatentes.
      </p>
      {combat.participantes.map((p) => (
        <article
          className={'play-entry ' + (combat.turno === p.id ? 'current-turn' : '')}
          key={p.id}
        >
          <strong>
            {combat.turno === p.id ? '→ ' : ''}
            {p.nome}
          </strong>
          <p>
            Iniciativa {p.iniciativa} · CA {p.ca} · PV {p.pvAtuais}/{p.pvMaximos}
            {p.pvTemporarios ? ` (+${p.pvTemporarios})` : ''}
          </p>
          {p.condicoes?.length ? <p>{p.condicoes.map((c) => c.nome).join(', ')}</p> : null}
          {p.concentracao && <p>Concentração: {p.concentracao}</p>}
          {master && (
            <div className="play-actions">
              {!p.ficha_id && (
                <>
                  <button
                    className="play-roll"
                    disabled={disabled || p.pvAtuais === 0}
                    onClick={() => command({ acao: 'dano', id: p.id, valor: 1 })}
                  >
                    −1 PV: {p.nome}
                  </button>
                  <button
                    className="play-roll"
                    disabled={disabled || p.pvAtuais >= p.pvMaximos}
                    onClick={() =>
                      command({
                        acao: 'cura',
                        id: p.id,
                        valor: 1,
                      })
                    }
                  >
                    +1 PV: {p.nome}
                  </button>
                  <HitPointExpression
                    value={expressions[p.id] ?? '1'}
                    onChange={(value) => setExpressions((old) => ({ ...old, [p.id]: value }))}
                    disabled={disabled}
                    label={'Quantidade de PV de ' + p.nome}
                    result={hpResult?.alvo_id === p.id ? hpResult : null}
                    onApply={(acao) =>
                      void command({ acao, id: p.id, expressao: expressions[p.id] ?? '1' })
                    }
                  />
                  <NpcHP
                    participant={p}
                    version={mesa.versao}
                    disabled={disabled}
                    save={(pvAtuais, versao) =>
                      operate({ tipo: 'combate', versao, acao: 'ajustar', id: p.id, pvAtuais })
                    }
                  />
                </>
              )}
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => command({ acao: 'remover', id: p.id })}
              >
                Remover {p.nome}
              </button>
            </div>
          )}
        </article>
      ))}
      {master && (
        <fieldset disabled={disabled} className="play-fields">
          <div className="play-actions">
            <button
              className="button"
              onClick={() => command({ acao: combat.ativo ? 'avancar' : 'iniciar' })}
              disabled={disabled || !combat.participantes.length}
            >
              {combat.ativo ? 'Próximo turno' : 'Iniciar combate'}
            </button>
            {combat.ativo && (
              <button className="button secondary" onClick={() => command({ acao: 'encerrar' })}>
                Encerrar combate
              </button>
            )}
          </div>
          <h3>Adicionar NPC</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              command({
                acao: 'adicionar',
                nome: name,
                pvMaximos: hp,
                pvAtuais: hp,
                ca,
                iniciativa: initiative,
              });
              setName('');
            }}
          >
            <label>
              Nome do NPC
              <input
                value={name}
                maxLength={120}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              PV máximo do NPC
              <input
                type="number"
                min={1}
                max={999999}
                value={hp}
                onChange={(e) => setHp(Number(e.target.value))}
              />
            </label>
            <label>
              CA do NPC
              <input
                type="number"
                min={0}
                max={999}
                value={ca}
                onChange={(e) => setCa(Number(e.target.value))}
              />
            </label>
            <label>
              Iniciativa do NPC
              <input
                type="number"
                min={-999}
                max={999}
                value={initiative}
                onChange={(e) => setInitiative(Number(e.target.value))}
              />
            </label>
            <button className="button secondary">Adicionar ao encontro</button>
          </form>
        </fieldset>
      )}
    </>
  );
}

function NpcHP({
  participant,
  version,
  disabled,
  save,
}: {
  participant: Combatant;
  version: number;
  disabled: boolean;
  save: (hp: number, version: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ hp: number; version: number } | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save(draft?.hp ?? participant.pvAtuais, draft?.version ?? version))
          setDraft(null);
      }}
    >
      <label>
        PV de {participant.nome}
        <input
          name="pv"
          type="number"
          min={0}
          max={participant.pvMaximos}
          disabled={disabled}
          value={draft?.hp ?? participant.pvAtuais}
          onChange={(e) =>
            setDraft((old) => ({ hp: Number(e.target.value), version: old?.version ?? version }))
          }
        />
      </label>
      <button className="play-roll" disabled={disabled}>
        Definir PV
      </button>
      {draft && draft.version !== version && (
        <>
          <small>A mesa mudou durante a edição.</small>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => setDraft(null)}
          >
            Usar PV atual
          </button>
        </>
      )}
    </form>
  );
}
