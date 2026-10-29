import { cellRuns } from '../../../../packages/tabletop/vision-geometry';
import { CELL } from './geometry';
import type { MapSnapshot, SceneRecord } from '../../../../packages/contracts/tabletop';
export function VisionClip({ id, cells }: { id: string; cells: string[] }) {
  return (
    <clipPath id={id}>
      {cellRuns(cells).map((r) => (
        <rect
          key={`${r.x},${r.y}`}
          x={r.x * CELL}
          y={r.y * CELL}
          width={r.w * CELL}
          height={CELL}
        />
      ))}
    </clipPath>
  );
}
export function VisionFog({
  scene,
  snapshot,
  id,
}: {
  scene: SceneRecord;
  snapshot: MapSnapshot | null;
  id: string;
}) {
  const current = cellRuns(snapshot?.atual || []),
    explored = cellRuns(snapshot?.explorada || []);
  return (
    <g pointerEvents="none" aria-label="Névoa de visão">
      <defs>
        <mask id={id}>
          <rect width={scene.largura * CELL} height={scene.altura * CELL} fill="white" />
          {explored.map((r) => (
            <rect
              key={`e${r.x},${r.y}`}
              x={r.x * CELL}
              y={r.y * CELL}
              width={r.w * CELL}
              height={CELL}
              fill="#777"
            />
          ))}
          {current.map((r) => (
            <rect
              key={`c${r.x},${r.y}`}
              x={r.x * CELL}
              y={r.y * CELL}
              width={r.w * CELL}
              height={CELL}
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <rect
        width={scene.largura * CELL}
        height={scene.altura * CELL}
        fill="#080b12"
        mask={`url(#${id})`}
      />
    </g>
  );
}
