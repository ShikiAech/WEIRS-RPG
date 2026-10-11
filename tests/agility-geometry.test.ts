import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupDelta,
  selectionBounds,
  areaGeometry,
} from '../apps/web/features/tabletop/agility-geometry';

test('group movement preserves spacing and clips the whole formation, including large tokens', () => {
  const tokens = [
    { x: 2, y: 1, tamanho: 1 },
    { x: 8, y: 4, tamanho: 2 },
  ];
  assert.deepEqual(groupDelta(tokens, { x: 3, y: -4 }, 10, 8), { x: 0, y: -1 });
  assert.deepEqual(groupDelta(tokens, { x: -6, y: 2.4 }, 10, 8, false), { x: -2, y: 2 });
  assert.deepEqual(selectionBounds({ x: 9, y: 3 }, { x: 1, y: 8 }), { x: 1, y: 3, w: 8, h: 5 });
});

test('spell geometries distinguish radius, cube side, cone length, and line width', () => {
  const circle = areaGeometry('circulo', 3, 1);
  assert.equal(circle.radius, 3);
  assert.equal(circle.points, undefined);
  assert.deepEqual(areaGeometry('quadrado', 3, 1).points, [
    [-1.5, -1.5],
    [1.5, -1.5],
    [1.5, 1.5],
    [-1.5, 1.5],
  ]);
  assert.deepEqual(areaGeometry('cone', 6, 1).points, [
    [0, 0],
    [6, -3],
    [6, 3],
  ]);
  assert.deepEqual(areaGeometry('linha', 12, 2).points, [
    [0, -1],
    [12, -1],
    [12, 1],
    [0, 1],
  ]);
});
