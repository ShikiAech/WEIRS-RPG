import { useRef, useState } from 'react';
import type { MapCommand, MapResponse, TokenRecord } from '../../../../packages/contracts/tabletop';
import type { useTabletop } from './useTabletop';
import { WallTools } from './WallTools';
import { LayerTools } from './LayerTools';
import { PlayerTokenTools } from './PlayerTokenTools';
export function MapAdministration({
  map,
  master,
  spectator,
  selectedTokens,
  operate,
  visionPreview,
  onVisionPreview,
  onDraw,
}: {
  map: ReturnType<typeof useTabletop>;
  master: boolean;
  spectator: boolean;
  selectedTokens: TokenRecord[];
  operate: (command: MapCommand) => Promise<MapResponse | false>;
  visionPreview: boolean;
  onVisionPreview: (value: boolean) => void;
  onDraw: () => void;
}) {
  const { scene, tokens, records } = map;
  const adminScroll = useRef(0),
    [adminOpen, setAdminOpen] = useState(false);
  return (
    <>
      {' '}
      {!master && !spectator && scene && (
        <PlayerTokenTools scene={scene} records={records} disabled={map.locked} operate={operate} />
      )}
      {scene?.modo_visao === 'automatica' &&
        !master &&
        (!map.snapshot || map.snapshot.sem_fonte) && (
          <div className="map-vision-notice" role="status">
            {spectator
              ? 'O mestre precisa atribuir um jogador para você acompanhar a visão.'
              : 'Sem token próprio com visão nesta cena. Aguarde o mestre ou adicione seu personagem.'}
          </div>
        )}
      {master && scene && map.snapshot && (
        <details
          className="map-administration"
          ref={(node) => {
            if (node) node.scrollTop = adminScroll.current;
          }}
          onScroll={(e) => {
            adminScroll.current = e.currentTarget.scrollTop;
          }}
          open={adminOpen}
          onToggle={(e) => setAdminOpen(e.currentTarget.open)}
        >
          <summary>Camadas, visão e participantes</summary>
          <LayerTools
            snapshot={map.snapshot}
            selected={selectedTokens}
            members={map.members}
            disabled={map.locked}
            operate={operate}
          />
          <label>
            <input
              type="checkbox"
              checked={visionPreview}
              onChange={(e) => onVisionPreview(e.target.checked)}
            />
            Prévia da visão dos tokens selecionados
          </label>
          <WallTools
            scene={scene}
            walls={map.snapshot.paredes}
            tokens={tokens}
            disabled={map.locked}
            operate={operate}
            onDraw={() => {
              setAdminOpen(false);
              onDraw();
            }}
          />
        </details>
      )}
    </>
  );
}
