import type { AreaRecord } from '../../../../packages/contracts/tabletop';
import { areaGeometry } from './agility-geometry';
import { CELL } from './geometry';

export function SpellAreas({
  areas,
  preview,
  zoom,
}: {
  areas: AreaRecord[];
  preview?: AreaRecord | null;
  zoom: number;
}) {
  return (
    <g className="spell-areas" pointerEvents="none">
      {[...areas.filter((a) => a.id !== preview?.id), ...(preview ? [preview] : [])].map((area) => {
        const geometry = areaGeometry(area.forma, area.tamanho, area.largura);
        return (
          <g
            key={area.id}
            className="map-area"
            data-area-id={area.id}
            aria-label={'Área ' + area.nome}
            transform={`translate(${area.x * CELL} ${area.y * CELL}) rotate(${area.angulo})`}
            fill={area.cor}
            fillOpacity={0.18}
            stroke={area.cor}
            strokeWidth={2 / zoom}
            strokeDasharray={preview?.id === area.id ? `${6 / zoom} ${4 / zoom}` : undefined}
          >
            {geometry.radius !== undefined ? (
              <circle r={geometry.radius * CELL} />
            ) : (
              <polygon
                points={geometry.points!.map((p) => p.map((n) => n * CELL).join(',')).join(' ')}
              />
            )}
            <circle r={3 / zoom} fillOpacity={1} stroke="none" />
          </g>
        );
      })}
    </g>
  );
}
