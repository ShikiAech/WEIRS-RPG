import { useState } from 'react';
import { MapDraftInput } from './MapDraftInput';
import type {
  MapCommand,
  WallRecord,
  SceneRecord,
  TokenRecord,
} from '../../../../packages/contracts/tabletop';
export function WallTools({
  scene,
  walls,
  tokens,
  disabled,
  operate,
  onDraw,
}: {
  scene: SceneRecord;
  walls: WallRecord[];
  tokens: TokenRecord[];
  disabled: boolean;
  operate: (command: MapCommand) => unknown;
  onDraw: () => void;
}) {
  const [door, setDoor] = useState(false),
    [coords, setCoords] = useState([0, 0, 1, 1]);
  return (
    <fieldset disabled={disabled}>
      <legend>Visão, paredes e portas</legend>
      <label>
        Modo de visão
        <select
          value={scene.modo_visao || 'manual'}
          onChange={(e) =>
            operate({
              tipo: 'cena_atualizar',
              id: scene.id,
              versao: scene.versao,
              patch: { modo_visao: e.target.value as 'manual' | 'automatica' },
            })
          }
        >
          <option value="manual">Névoa manual</option>
          <option value="automatica">Visão automática</option>
        </select>
      </label>
      <p>
        A visão usa células e alcance em pés. Paredes bloqueiam visão; não impedem movimento. A
        imagem de fundo continua disponível no navegador.
      </p>
      <button className="button secondary" type="button" onClick={onDraw}>
        Desenhar parede no mapa
      </button>
      <div className="map-form-grid">
        {coords.map((v, i) => (
          <label key={i}>
            {['X inicial', 'Y inicial', 'X final', 'Y final'][i]} (células)
            <input
              type="number"
              min={0}
              max={i % 2 ? scene.altura : scene.largura}
              step="any"
              value={v}
              onChange={(e) =>
                setCoords(coords.map((n, j) => (j === i ? Number(e.target.value) : n)))
              }
            />
          </label>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={door} onChange={(e) => setDoor(e.target.checked)} />
        Porta
      </label>
      <button
        className="button secondary"
        type="button"
        onClick={() =>
          operate({
            tipo: 'parede_criar',
            cena_id: scene.id,
            x1: coords[0],
            y1: coords[1],
            x2: coords[2],
            y2: coords[3],
            porta: door,
          })
        }
      >
        Criar parede ou porta
      </button>
      <ul>
        {walls.map((w, i) => (
          <li key={w.id}>
            {w.porta ? 'Porta' : 'Parede'} {i + 1}{' '}
            {w.porta && (
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  operate({
                    tipo: 'parede_atualizar',
                    id: w.id,
                    versao: w.versao,
                    patch: { aberta: !w.aberta },
                  })
                }
              >
                {w.aberta ? 'Fechar porta' : 'Abrir porta'}
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={() => operate({ tipo: 'parede_excluir', id: w.id, versao: w.versao })}
            >
              Excluir {w.porta ? 'porta' : 'parede'} {i + 1}
            </button>
          </li>
        ))}
      </ul>
      {tokens.map((t) => (
        <div key={t.id}>
          <label>
            <input
              type="checkbox"
              checked={t.visao !== false}
              onChange={(e) =>
                operate({
                  tipo: 'token_atualizar',
                  id: t.id,
                  versao: t.versao,
                  patch: { visao: e.target.checked },
                })
              }
            />
            Visão de {t.nome}
          </label>
          <label>
            Alcance de {t.nome} (pés)
            <MapDraftInput
              type="number"
              min={0}
              max={1000}
              value={t.alcance_visao ?? 60}
              onCommit={(value) => {
                if (Number(value) !== (t.alcance_visao ?? 60))
                  return operate({
                    tipo: 'token_atualizar',
                    id: t.id,
                    versao: t.versao,
                    patch: { alcance_visao: Number(value) },
                  });
              }}
            />
          </label>
        </div>
      ))}
      <button
        className="button secondary"
        type="button"
        onClick={() => operate({ tipo: 'exploracao_limpar', cena_id: scene.id })}
      >
        Limpar exploração lembrada
      </button>
    </fieldset>
  );
}
