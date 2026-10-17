import type { StepProps } from './types';
export function ReviewStep({ preview, catalog }: StepProps) {
  return (
    <section>
      <h2>Revisar personagem</h2>
      <p>
        Confira os valores e as origens antes de criar a ficha. Depois, você poderá editar os campos
        manualmente.
      </p>
      {preview.problems.length ? (
        <div className="notice error" role="alert">
          <h3>Pendências obrigatórias</h3>
          <ul>
            {preview.problems.map((p, i) => (
              <li key={`${p.field}:${i}`}>
                {p.message}
                {p.sourceRevisionId &&
                  ` (${catalog.entries.find((e) => e.ref.revisionId === p.sourceRevisionId)?.name ?? 'origem não disponível'})`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="notice success">Nenhuma pendência obrigatória.</p>
      )}
      <h3>Benefícios por origem</h3>
      <div className="creation-origins">
        {preview.contributions.map((c) => {
          const e = catalog.entries.find((e) => e.ref.revisionId === c.sourceRevisionId);
          return (
            <details key={c.id}>
              <summary>
                {c.name}
                <span>{e?.sourceTitle}</span>
              </summary>
              <p className="creation-description">{e?.description}</p>
              {e?.automation !== 'completa' && (
                <p className="muted">
                  Confira na mesa os efeitos descritos que exigem acompanhamento manual.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
