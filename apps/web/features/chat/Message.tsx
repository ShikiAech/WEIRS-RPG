import type { ChatMessage } from '../../../../packages/contracts/chat';
import { useDice3D } from '../dice/Dice3D';
import { DamageBreakdown } from './DamageBreakdown';

const actionNames = {
  ataque: 'Ataque',
  dano: 'Dano',
  magia: 'Conjuração',
  magia_ataque: 'Ataque de magia',
  atributo: 'Teste de atributo',
  resistencia: 'Resistência',
  pericia: 'Perícia',
  iniciativa: 'Iniciativa',
  morte: 'Teste de morte',
  magia_dano: 'Dano de magia',
  dado_vida: 'Dado de vida',
};
export function Message({
  message,
  onReveal,
  revealing,
}: {
  message: ChatMessage;
  onReveal?: () => void;
  revealing?: boolean;
}) {
  const result = message.resultado;
  const concealed = useDice3D().hidden.has(message.id);
  return (
    <article className={'chat-message ' + (result ? 'chat-roll' : '')}>
      <header>
        <strong>{message.autor_nome}</strong>
        <time
          dateTime={message.criado_em}
          title={new Date(message.criado_em).toLocaleString('pt-BR')}
        >
          {new Date(message.criado_em).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </header>
      {message.secreta && !result ? (
        <p className="secret-roll-notice">
          <span aria-hidden="true">◈</span> <strong>Rolagem secreta</strong>
          <br />
          <small>O mestre realizou uma rolagem.</small>
        </p>
      ) : message.tipo === 'texto' ? (
        <p className="chat-text">{message.texto}</p>
      ) : (
        <>
          {message.secreta && <span className="secret-badge">Somente mestres</span>}
          <div className="roll-heading">
            <div>
              <span className="eyebrow">
                {result?.origem ? actionNames[result.origem.acao] : 'Rolagem livre'}
              </span>
              <h3>{message.rotulo || 'Dados'}</h3>
            </div>
            {!concealed && result?.total !== undefined && (
              <div className="roll-total">
                <small>Total</small>
                <strong>{result.total}</strong>
              </div>
            )}
          </div>
          {result?.expressao && <code className="roll-expression">{result.expressao}</code>}
          {concealed && <p className="dice-rolling">Rolando dados…</p>}
          {!concealed && result?.cd !== undefined && (
            <p>
              CD de resistência: <strong>{result.cd}</strong>
            </p>
          )}
          {!concealed && result?.termos && (
            <div className="dice-breakdown" aria-label="Detalhamento dos dados">
              {result.termos.map((term, i) => (
                <div className="dice-term" key={i}>
                  <span>
                    {term.sinal < 0 ? '−' : '+'}{' '}
                    {term.dados ? `${term.dados.length}d${term.faces}` : term.valor}
                  </span>
                  {term.dados?.map((value, j) => (
                    <span
                      key={j}
                      className={'die ' + (term.selecionados?.includes(j + 1) ? '' : 'discarded')}
                      aria-label={`Dado ${j + 1}: ${value}${term.selecionados?.includes(j + 1) ? '' : ' (descartado)'}`}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {!concealed && <DamageBreakdown parts={result?.parcelas} />}
          {result?.origem && (
            <p className="muted roll-source">
              Ficha salva · versão {result.origem.versao}
              {result.origem.modo !== 'normal' && ' · ' + result.origem.modo}
            </p>
          )}
          {result?.origem?.acao === 'magia' && (
            <p className="muted">Espaços e recursos permanecem sob controle da mesa.</p>
          )}
          {message.texto === 'Resultado revelado pelo mestre.' && (
            <small className="muted">Revelado pelo mestre</small>
          )}
          {message.secreta &&
            !concealed &&
            onReveal &&
            (message.revelada_id ? (
              <small className="muted">Resultado já revelado</small>
            ) : (
              <button
                type="button"
                className="text-button reveal-roll"
                disabled={revealing}
                onClick={onReveal}
              >
                {revealing ? 'Revelando…' : 'Revelar resultado'}
              </button>
            ))}
        </>
      )}
    </article>
  );
}
