import { useState } from 'react';
import type { MapCommand, SceneRecord } from '../../../../packages/contracts/tabletop';
export function PlayerTokenTools({
  scene,
  records,
  disabled,
  operate,
}: {
  scene: SceneRecord;
  records: { id: string; nome: string }[];
  disabled: boolean;
  operate: (c: MapCommand) => unknown;
}) {
  const [sheet, setSheet] = useState('');
  return (
    <details className="map-player-token">
      <summary>Adicionar meu personagem</summary>
      <label>
        Personagem
        <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
          <option value="">Escolha seu personagem</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button secondary"
        type="button"
        disabled={disabled || !sheet}
        onClick={() =>
          operate({
            tipo: 'token_criar',
            cena_id: scene.id,
            ficha_id: sheet,
            nome: records.find((r) => r.id === sheet)?.nome || 'Personagem',
            x: 0,
            y: 0,
            tamanho: 1,
            cor: '#d4af37',
          })
        }
      >
        Adicionar token
      </button>
    </details>
  );
}
