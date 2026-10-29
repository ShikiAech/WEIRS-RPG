/** Coordinates are quantized to 1/10000 cell. A closed segment includes both
 * endpoints: touching a wall or travelling along one blocks the ray. */
export type Point = { x: number; y: number };
export type VisionWall = { x1: number; y1: number; x2: number; y2: number; aberta: boolean };
export type SightSource = Point & { range: number };
const q = (n: number) => Math.round(n * 10000) / 10000;
export function cellCenter(p: Point, width: number, height: number): Point {
  const center = (v: number, bound: number) =>
    Math.max(0, Math.min(bound - 1, Math.floor(Number.isFinite(v) ? v : 0))) + 0.5;
  return { x: center(p.x, width), y: center(p.y, height) };
}
export function movementAnchor(t: Point & { tamanho: number }, width: number, height: number) {
  return cellCenter({ x: t.x + t.tamanho / 2, y: t.y + t.tamanho / 2 }, width, height);
}
export function heightDistance(a: Point, b: Point, unit: number, start: number, end: number) {
  const horizontal = Math.hypot(b.x - a.x, b.y - a.y) * unit,
    height = Math.abs(end - start);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    horizontal: round(horizontal),
    height: round(height),
    total: round(Math.hypot(horizontal, height)),
  };
}
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const pts = [a, b, c, d].map((p) => ({ x: q(p.x), y: q(p.y) }));
  [a, b, c, d] = pts;
  const cross = (p: Point, r: Point, s: Point) =>
    (r.x - p.x) * (s.y - p.y) - (r.y - p.y) * (s.x - p.x);
  const on = (p: Point, r: Point, s: Point) =>
    Math.abs(cross(p, r, s)) < 1e-8 &&
    s.x >= Math.min(p.x, r.x) &&
    s.x <= Math.max(p.x, r.x) &&
    s.y >= Math.min(p.y, r.y) &&
    s.y <= Math.max(p.y, r.y);
  const x = cross(a, b, c),
    y = cross(a, b, d),
    z = cross(c, d, a),
    w = cross(c, d, b);
  return (
    (((x > 0 && y < 0) || (x < 0 && y > 0)) && ((z > 0 && w < 0) || (z < 0 && w > 0))) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function visibleCells(
  width: number,
  height: number,
  unit: number,
  sources: SightSource[],
  walls: VisionWall[],
): string[] {
  const visible = new Set<string>();
  const quantizedWalls = walls.map((w) => ({
    ...w,
    x1: q(w.x1),
    y1: q(w.y1),
    x2: q(w.x2),
    y2: q(w.y2),
  }));
  for (const source of sources) {
    const s = { x: q(source.x), y: q(source.y) },
      r = source.range / unit;
    const blockers = quantizedWalls.filter(
      (w) =>
        !w.aberta &&
        Math.max(w.x1, w.x2) >= s.x - r &&
        Math.min(w.x1, w.x2) <= s.x + r &&
        Math.max(w.y1, w.y2) >= s.y - r &&
        Math.min(w.y1, w.y2) <= s.y + r,
    );
    for (
      let y = Math.max(0, Math.ceil(s.y - r - 0.5));
      y <= Math.min(height - 1, Math.floor(s.y + r - 0.5));
      y++
    )
      for (
        let x = Math.max(0, Math.ceil(s.x - r - 0.5));
        x <= Math.min(width - 1, Math.floor(s.x + r - 0.5));
        x++
      ) {
        const key = `${x},${y}`,
          p = { x: x + 0.5, y: y + 0.5 };
        if (visible.has(key) || Math.hypot(p.x - s.x, p.y - s.y) > r + 1e-9) continue;
        if (
          !blockers.some((w) => segmentsIntersect(s, p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }))
        )
          visible.add(key);
      }
  }
  return [...visible].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number),
      [bx, by] = b.split(',').map(Number);
    return ay - by || ax - bx;
  });
}
export function resizeExplored(cells: string[], width: number, height: number) {
  return cells.filter((cell) => {
    const [x, y] = cell.split(',').map(Number);
    return x >= 0 && y >= 0 && x < width && y < height;
  });
}
export function cellRuns(cells: readonly string[]) {
  const points = cells
    .map((v) => v.split(',').map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const runs: { x: number; y: number; w: number; h: number }[] = [];
  for (const [x, y] of points) {
    const last = runs.at(-1);
    if (last && last.y === y && last.x + last.w === x) last.w++;
    else runs.push({ x, y, w: 1, h: 1 });
  }
  return runs;
}
function rectangle(x: number, y: number, padding = 0): Point[] {
  return [
    { x: x - padding, y: y - padding },
    { x: x + 1 + padding, y: y - padding },
    { x: x + 1 + padding, y: y + 1 + padding },
    { x: x - padding, y: y + 1 + padding },
  ];
}
function polygonContains(points: Point[], p: Point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
export function areaCoversCell(
  a: { forma: string; x: number; y: number; tamanho: number; largura: number; angulo: number },
  x: number,
  y: number,
) {
  if (a.forma === 'circulo')
    return (
      Math.hypot(
        a.x - Math.max(x, Math.min(x + 1, a.x)),
        a.y - Math.max(y, Math.min(y + 1, a.y)),
      ) <= a.tamanho
    );
  const n = a.tamanho,
    w = a.largura;
  const local =
    a.forma === 'cone'
      ? [
          [0, 0],
          [n, -n / 2],
          [n, n / 2],
        ]
      : a.forma === 'linha'
        ? [
            [0, -w / 2],
            [n, -w / 2],
            [n, w / 2],
            [0, w / 2],
          ]
        : [
            [-n / 2, -n / 2],
            [n / 2, -n / 2],
            [n / 2, n / 2],
            [-n / 2, n / 2],
          ];
  const rad = (a.angulo * Math.PI) / 180,
    poly = local.map(([dx, dy]) => ({
      x: a.x + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: a.y + dx * Math.sin(rad) + dy * Math.cos(rad),
    })),
    rect = rectangle(x, y);
  return (
    poly.some((p) => p.x >= x && p.x <= x + 1 && p.y >= y && p.y <= y + 1) ||
    rect.some((p) => polygonContains(poly, p)) ||
    poly.some((p, i) =>
      rect.some((r, j) => segmentsIntersect(p, poly[(i + 1) % poly.length], r, rect[(j + 1) % 4])),
    )
  );
}
export function drawingCoversCell(points: Point[], x: number, y: number) {
  const rect = rectangle(x, y, 3 / 128);
  return (
    points.some(
      (p) => p.x >= rect[0].x && p.x <= rect[2].x && p.y >= rect[0].y && p.y <= rect[2].y,
    ) ||
    points.some(
      (p, i) =>
        i > 0 && rect.some((r, j) => segmentsIntersect(points[i - 1], p, r, rect[(j + 1) % 4])),
    )
  );
}
