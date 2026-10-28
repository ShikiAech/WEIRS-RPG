import { useEffect, useState } from 'react';
import type { Point } from './geometry';
import { CELL, cumulativeDistances } from './geometry';
import { heightDistance } from '../../../../packages/tabletop/vision-geometry';
export type Ruler = { points: Point[]; b: Point };
export type RulerStyle = { cor: string; espessura: number; tracejada: boolean };
export function usePinnedRulers(scene: string) {
  const [pinned, setPinned] = useState<(Ruler & RulerStyle)[]>([]);
  useEffect(() => {
    try {
      setPinned(JSON.parse(sessionStorage.getItem('weirs:reguas:' + scene) || '[]'));
    } catch {
      setPinned([]);
    }
  }, [scene]);
  const update = (rows: (Ruler & RulerStyle)[]) => {
    setPinned(rows);
    try {
      sessionStorage.setItem('weirs:reguas:' + scene, JSON.stringify(rows));
    } catch {
      /* Browser may block session storage. */
    }
  };
  return {
    pinned,
    pin: (r: Ruler & RulerStyle) => update([...pinned, r].slice(-20)),
    remove: () => update(pinned.slice(0, -1)),
  };
}
export function RulerLines({
  ruler,
  style,
  zoom,
  unit,
}: {
  ruler: Ruler;
  style: RulerStyle;
  zoom: number;
  unit: number;
}) {
  const points = [...ruler.points, ruler.b];
  return (
    <g pointerEvents="none" aria-label="Régua fixada">
      <polyline
        points={points.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
        fill="none"
        stroke={style.cor}
        strokeWidth={style.espessura / zoom}
        strokeDasharray={style.tracejada ? `${8 / zoom} ${5 / zoom}` : undefined}
      />
      <text
        x={ruler.b.x * CELL}
        y={ruler.b.y * CELL - 10 / zoom}
        fontSize={14 / zoom}
        fill={style.cor}
      >
        {cumulativeDistances(points, unit).at(-1)} pés
      </text>
    </g>
  );
}
export function RulerTools({
  style,
  onStyle,
  ruler,
  onPin,
  onDelete,
  onCancel,
  movement,
  onMovement,
  unit,
}: {
  style: RulerStyle;
  onStyle: (s: RulerStyle) => void;
  ruler: Ruler | null;
  onPin: () => void;
  onDelete: () => void;
  onCancel: () => void;
  movement: boolean;
  onMovement: (v: boolean) => void;
  unit: number;
}) {
  const [height, setHeight] = useState(false),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0);
  const result =
    ruler && height ? heightDistance(ruler.points[0], ruler.b, unit, start, end) : null;
  return (
    <div
      className="map-ruler-options"
      aria-label="Opções da régua"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <label>
        Cor
        <input
          type="color"
          value={style.cor}
          onChange={(e) => onStyle({ ...style, cor: e.target.value })}
        />
      </label>
      <label>
        Espessura
        <input
          type="number"
          min={1}
          max={8}
          value={style.espessura}
          onChange={(e) =>
            onStyle({ ...style, espessura: Math.max(1, Math.min(8, Number(e.target.value))) })
          }
        />
      </label>
      <label>
        Estilo
        <select
          value={style.tracejada ? 'tracejada' : 'continua'}
          onChange={(e) => onStyle({ ...style, tracejada: e.target.value === 'tracejada' })}
        >
          <option value="continua">Contínua</option>
          <option value="tracejada">Tracejada</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={movement} onChange={(e) => onMovement(e.target.checked)} />
        Medir movimento
      </label>
      <label>
        <input type="checkbox" checked={height} onChange={(e) => setHeight(e.target.checked)} />
        Medir altura (distância euclidiana)
      </label>
      {height && (
        <>
          <label>
            Altura inicial (pés)
            <input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} />
          </label>
          <label>
            Altura final (pés)
            <input type="number" value={end} onChange={(e) => setEnd(Number(e.target.value))} />
          </label>
        </>
      )}
      {result && (
        <output>
          Horizontal: {result.horizontal} pés · Altura: {result.height} pés · Hipotenusa:{' '}
          {result.total} pés
        </output>
      )}
      <button className="button secondary" type="button" disabled={!ruler} onClick={onPin}>
        Fixar régua
      </button>
      <button className="button secondary" type="button" onClick={onDelete}>
        Excluir régua
      </button>
    </div>
  );
}
