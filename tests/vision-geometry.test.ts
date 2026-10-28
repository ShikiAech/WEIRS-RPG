import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellCenter,
  movementAnchor,
  heightDistance,
  visibleCells,
  segmentsIntersect,
  cellRuns,
  resizeExplored,
} from '../packages/tabletop/vision-geometry';
test('ruler centers are bounded even without grid; even footprints choose positive center cell', () => {
  assert.deepEqual(cellCenter({ x: -1, y: 100 }, 10, 8), { x: 0.5, y: 7.5 });
  assert.deepEqual(cellCenter({ x: 2.99, y: 3.01 }, 10, 8), { x: 2.5, y: 3.5 });
  assert.deepEqual(movementAnchor({ x: 2, y: 3, tamanho: 2 }, 10, 8), { x: 3.5, y: 4.5 });
  assert.deepEqual(heightDistance({ x: 0.5, y: 0.5 }, { x: 3.5, y: 4.5 }, 5, 0, 12), {
    horizontal: 25,
    height: 12,
    total: 27.7,
  });
});
test('closed segments block tangencies, endpoints and collinear overlap; doors open', () => {
  assert.equal(
    segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }),
    true,
  );
  assert.equal(
    segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 2 }),
    true,
  );
  const source = { x: 0.5, y: 0.5, range: 60 };
  const wall = { x1: 2, y1: 0, x2: 2, y2: 4, aberta: false };
  const mask = visibleCells(4, 4, 5, [source], [wall]);
  assert.equal(mask.includes('3,0'), false);
  assert.equal(visibleCells(4, 4, 5, [source], [{ ...wall, aberta: true }]).length, 16);
  assert.deepEqual(visibleCells(4, 4, 5, [], []), []);
  assert.deepEqual(visibleCells(4, 4, 5, [{ ...source, range: 5 }], []), ['0,0', '1,0', '0,1']);
});
test('exploration keeps coordinates through resize; fog runs compress rows', () => {
  assert.deepEqual(resizeExplored(['0,0', '3,1', '8,8'], 4, 3), ['0,0', '3,1']);
  assert.deepEqual(cellRuns(['0,0', '1,0', '3,0', '0,1']), [
    { x: 0, y: 0, w: 2, h: 1 },
    { x: 3, y: 0, w: 1, h: 1 },
    { x: 0, y: 1, w: 1, h: 1 },
  ]);
});
import { areaCoversCell, drawingCoversCell } from '../packages/tabletop/vision-geometry';
test('entity coverage uses intersected cells rather than a broad bounding box or only cell centers', () => {
  assert.equal(
    areaCoversCell({ forma: 'circulo', x: 1, y: 1, tamanho: 0.25, largura: 1, angulo: 0 }, 0, 0),
    true,
  );
  assert.equal(
    areaCoversCell({ forma: 'circulo', x: 1, y: 1, tamanho: 0.25, largura: 1, angulo: 0 }, 2, 2),
    false,
  );
  assert.equal(
    areaCoversCell({ forma: 'cone', x: 0, y: 0, tamanho: 4, largura: 1, angulo: 0 }, 1, 2),
    false,
  );
  assert.equal(
    drawingCoversCell(
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ],
      0,
      3,
    ),
    false,
  );
  assert.equal(
    drawingCoversCell(
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ],
      2,
      2,
    ),
    true,
  );
});
