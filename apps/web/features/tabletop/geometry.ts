export const CELL = 64;
export type Point = { x: number; y: number };
export type Camera = Point & { zoom: number };
const MIN_ZOOM = 0.03;
const finite = (n: number) => (Number.isFinite(n) ? n : 0);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function gridPoint(point: Point, camera: Camera): Point {
  return {
    x: (point.x - camera.x) / (CELL * camera.zoom),
    y: (point.y - camera.y) / (CELL * camera.zoom),
  };
}
export function snapToken(
  point: Point,
  size: number,
  width: number,
  height: number,
  snap = true,
): Point {
  const value = (n: number, bound: number) =>
    clamp(
      snap ? Math.round(finite(n)) : Math.round(finite(n) * 100) / 100,
      0,
      Math.max(0, bound - size),
    );
  return { x: value(point.x, width), y: value(point.y, height) };
}
export function zoomCamera(camera: Camera, pivot: Point, value: number): Camera {
  const zoom = clamp(value, MIN_ZOOM, 3),
    scale = zoom / camera.zoom;
  return {
    zoom,
    x: pivot.x - (pivot.x - camera.x) * scale,
    y: pivot.y - (pivot.y - camera.y) * scale,
  };
}
export function fitCamera(
  width: number,
  height: number,
  cellsWide: number,
  cellsHigh: number,
): Camera {
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(
      1,
      (Math.max(100, width) - 64) / (cellsWide * CELL),
      (Math.max(100, height) - 64) / (cellsHigh * CELL),
    ),
  );
  return {
    zoom,
    x: (width - cellsWide * CELL * zoom) / 2,
    y: (height - cellsHigh * CELL * zoom) / 2,
  };
}
export function distance(a: Point, b: Point, unit: number): number {
  return Math.round(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * unit * 10) / 10;
}
export function revealRectangle(a: Point, b: Point, width: number, height: number) {
  const x = clamp(Math.floor(Math.min(a.x, b.x)), 0, width - 1),
    y = clamp(Math.floor(Math.min(a.y, b.y)), 0, height - 1);
  return {
    x,
    y,
    w: Math.max(1, clamp(Math.ceil(Math.max(a.x, b.x)), x + 1, width) - x),
    h: Math.max(1, clamp(Math.ceil(Math.max(a.y, b.y)), y + 1, height) - y),
  };
}
