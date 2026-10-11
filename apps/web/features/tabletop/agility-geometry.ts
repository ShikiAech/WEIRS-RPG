import type { AreaShape } from '../../../../packages/contracts/tabletop';
import type { Point } from './geometry';

export function groupDelta(
  tokens: { x: number; y: number; tamanho: number }[],
  delta: Point,
  width: number,
  height: number,
  snap = true,
): Point {
  if (!tokens.length) return { x: 0, y: 0 };
  const limit = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
  const round = (value: number) => (snap ? Math.round(value) : Math.round(value * 100) / 100);
  return {
    x: limit(
      round(delta.x),
      -Math.min(...tokens.map((t) => t.x)),
      width - Math.max(...tokens.map((t) => t.x + t.tamanho)),
    ),
    y: limit(
      round(delta.y),
      -Math.min(...tokens.map((t) => t.y)),
      height - Math.max(...tokens.map((t) => t.y + t.tamanho)),
    ),
  };
}
export function selectionBounds(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
export function areaGeometry(
  shape: AreaShape,
  size: number,
  width: number,
): { radius?: number; points?: number[][] } {
  if (shape === 'circulo') return { radius: size };
  if (shape === 'cone')
    return {
      points: [
        [0, 0],
        [size, -size / 2],
        [size, size / 2],
      ],
    };
  if (shape === 'linha')
    return {
      points: [
        [0, -width / 2],
        [size, -width / 2],
        [size, width / 2],
        [0, width / 2],
      ],
    };
  return {
    points: [
      [-size / 2, -size / 2],
      [size / 2, -size / 2],
      [size / 2, size / 2],
      [-size / 2, size / 2],
    ],
  };
}
