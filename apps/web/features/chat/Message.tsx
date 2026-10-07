import type { ChatMessage } from '../../../../packages/contracts/chat';

const actionNames = {
  ataque: 'Ataque',
  dano: 'Dano',
  magia: 'Conjuração',
  magia_ataque: 'Ataque de magia',
};
export function Message({ message }: { message: ChatMessage }) {
  const result = message.resultado;
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
      {message.tipo === 'texto' ? (
        <p className="chat-text">{message.texto}</p>
      ) : (
        <>
          <div className="roll-heading">
            <div>
              <span className="eyebrow">
                {result?.origem ? actionNames[result.origem.acao] : 'Rolagem livre'}
              </span>
              <h3>{message.rotulo || 'Dados'}</h3>
            </div>
            {result?.total !== undefined && (
              <div className="roll-total">
                <small>Total</small>
                <strong>{result.total}</strong>
              </div>
            )}
          </div>
          {result?.expressao && <code className="roll-expression">{result.expressao}</code>}
          {result?.cd !== undefined && (
            <p>
              CD de resistência: <strong>{result.cd}</strong>
            </p>
          )}
          {result?.termos && (
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
          {result?.origem && (
            <p className="muted roll-source">
              Ficha salva · versão {result.origem.versao}
              {result.origem.modo !== 'normal' && ' · ' + result.origem.modo}
            </p>
          )}
          {result?.origem?.acao === 'magia' && (
            <p className="muted">Espaços e recursos permanecem sob controle da mesa.</p>
          )}
        </>
      )}
    </article>
  );
}
