import type { RollResult } from '../../../../packages/contracts/chat';
export type HpAction = 'dano' | 'cura' | 'temporarios' | 'temporarios_definir';
export function validHpExpression(value: string): boolean {
  const expression = value.toLowerCase().replace(/\s/g, '');
  return (
    value.length <= 120 &&
    /^[+-]?(\d{1,3}d\d{1,4}(k[hl]\d{1,3})?|\d{1,4})([+-](\d{1,3}d\d{1,4}(k[hl]\d{1,3})?|\d{1,4}))*$/.test(
      expression,
    )
  );
}
export function HitPointExpression({
  value,
  onChange,
  onApply,
  disabled,
  label = 'Quantidade de PV',
  result,
  temporary = true,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: (action: HpAction) => void;
  disabled: boolean;
  label?: string;
  result?: RollResult | null;
  temporary?: boolean;
  labels?: Partial<Record<HpAction, string>>;
}) {
  return (
    <div className="hp-expression">
      <label>
        {label}
        <input
          type="text"
          value={value}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="8 + 4, 12 - 3, 2d8 + 3"
        />
      </label>
      <small>
        Use soma, subtração e dados: 8 + 4, 12 - 3, 2d8 + 3. O resultado aparece após aplicar.
      </small>
      <div className="play-actions">
        {(
          [
            'dano',
            'cura',
            ...(temporary ? ['temporarios', 'temporarios_definir'] : []),
          ] as HpAction[]
        ).map((action) => (
          <button
            key={action}
            type="button"
            className="play-roll"
            disabled={disabled || !validHpExpression(value)}
            onClick={() => onApply(action)}
          >
            {labels?.[action] ??
              {
                dano: 'Aplicar dano',
                cura: 'Curar',
                temporarios: 'Conceder PV temporários',
                temporarios_definir: 'Definir PV temporários',
              }[action]}
          </button>
        ))}
      </div>
      {temporary && (
        <small>
          Conceder mantém o maior valor. Definir substitui o valor atual, incluindo redução ou zero.
        </small>
      )}
      {result && (
        <output aria-live="polite">
          {result.expressao} = {result.total}
          {result.termos?.some((t) => t.dados)
            ? ' · Dados: ' +
              result.termos
                .filter((t) => t.dados)
                .map((t) => t.dados!.join(', '))
                .join('; ')
            : ''}
        </output>
      )}
    </div>
  );
}
