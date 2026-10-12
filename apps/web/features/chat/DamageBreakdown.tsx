import type { RollResult } from '../../../../packages/contracts/chat';
export function DamageBreakdown({ parts }: { parts: RollResult['parcelas'] }) {
  if (!parts?.length) return null;
  return (
    <dl className="damage-type-breakdown" aria-label="Dano por tipo">
      {parts.map((part, i) => (
        <div key={part.id + ':' + i}>
          <dt>
            <strong>{part.tipo || 'Sem tipo'}</strong>
            <code>{part.expressao}</code>
          </dt>
          <dd>{part.total}</dd>
        </div>
      ))}
    </dl>
  );
}
