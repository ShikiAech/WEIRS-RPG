import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  cumulativeDistances,
  fitCamera,
  gridPoint,
  revealRectangle,
  snapToken,
  zoomCamera,
} from '../apps/web/features/tabletop/geometry';

test('map positions remain inside the scene for large tokens and invalid pointer values', () => {
  assert.deepEqual(snapToken({ x: 9.8, y: -3 }, 2, 10, 8, true), { x: 8, y: 0 });
  assert.deepEqual(snapToken({ x: 2.25, y: 4.6 }, 1, 10, 8, false), { x: 2.25, y: 4.6 });
  assert.deepEqual(snapToken({ x: Infinity, y: NaN }, 1, 10, 8, true), { x: 0, y: 0 });
});

test('pointer-centered zoom keeps the same world point beneath the cursor', () => {
  const camera = { x: 30, y: -12, zoom: 0.75 };
  const pointer = { x: 380, y: 260 };
  const point = gridPoint(pointer, camera);
  assert.deepEqual(gridPoint(pointer, zoomCamera(camera, pointer, 1.5)), point);
  assert.equal(zoomCamera(camera, pointer, 100).zoom, 3);
});

test('fit centers the whole scene and measurements use D&D five-foot diagonals', () => {
  const camera = fitCamera(1000, 700, 20, 20);
  assert.ok(camera.zoom > 0 && camera.zoom < 1);
  assert.equal(camera.x + (20 * 64 * camera.zoom) / 2, 500);
  assert.equal(camera.y + (20 * 64 * camera.zoom) / 2, 350);
  assert.equal(distance({ x: 0.5, y: 0.5 }, { x: 3.5, y: 4.5 }, 5), 20);
});

test('largest supported scene fits on a mobile screen and can zoom out from that fit', () => {
  const camera = fitCamera(393, 550, 100, 100);
  assert.ok(camera.x >= 32);
  assert.ok(camera.y >= 32);
  assert.ok(camera.x + 100 * 64 * camera.zoom <= 393 - 32);
  const next = zoomCamera(camera, { x: 196.5, y: 275 }, camera.zoom * 0.9);
  assert.ok(next.zoom < camera.zoom);
});

test('fog rectangles normalize reversed drags and clip to scene edges', () => {
  assert.deepEqual(revealRectangle({ x: 8.6, y: 7.1 }, { x: -2, y: 2.2 }, 10, 8), {
    x: 0,
    y: 2,
    w: 9,
    h: 6,
  });
  assert.deepEqual(revealRectangle({ x: 2.3, y: 2.3 }, { x: 2.3, y: 2.3 }, 10, 10), {
    x: 2,
    y: 2,
    w: 1,
    h: 1,
  });
});

test('ruler adds each leg and shows cumulative distances at turns using the scene scale', () => {
  const points = [
    { x: 8, y: 10 },
    { x: 11, y: 10 },
    { x: 13, y: 8 },
    { x: 13, y: 11 },
  ];
  assert.deepEqual(cumulativeDistances(points, 5), [0, 15, 25, 40]);
  assert.deepEqual(cumulativeDistances(points, 10), [0, 30, 50, 80]);
  assert.deepEqual(cumulativeDistances([], 5), []);
  assert.deepEqual(
    cumulativeDistances(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      5,
    ),
    [0, 0],
  );
});

test('ruler rounds cumulative fractional distances without floating-point artifacts', () => {
  assert.deepEqual(
    cumulativeDistances(
      [
        { x: 0, y: 0 },
        { x: 0.02, y: 0 },
        { x: 0.06, y: 0 },
      ],
      5,
    ),
    [0, 0.1, 0.3],
  );
});
