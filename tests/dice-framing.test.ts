import test from 'node:test';
import assert from 'node:assert/strict';
import { diceFrustum } from '../apps/web/features/dice/framing';

test('small rolls occupy the tray instead of inheriting a distant fixed camera', () => {
  for (const [width, height] of [
    [300, 150],
    [245, 125],
  ]) {
    const one = diceFrustum({ minX: -1, maxX: 1, minY: -1, maxY: 1 }, width, height);
    const diameter = (2 * height) / (one.top - one.bottom);
    assert.ok(diameter >= 100, `single die diameter: ${diameter}px`);
    const six = diceFrustum({ minX: -3.6, maxX: 3.6, minY: -2.3, maxY: 2.3 }, width, height);
    assert.ok((2 * height) / (six.top - six.bottom) >= 45, 'six dice stay legible');
  }
});

test('framing retains margins for moving dice and respects the canvas aspect ratio', () => {
  const bounds = { minX: -5.1, maxX: 3.6, minY: -2.3, maxY: 3.2 };
  for (const [width, height] of [
    [300, 150],
    [245, 125],
    [120, 250],
    [1, 1],
  ]) {
    const frame = diceFrustum(bounds, width, height);
    assert.ok(frame.left < bounds.minX && frame.right > bounds.maxX);
    assert.ok(frame.bottom < bounds.minY && frame.top > bounds.maxY);
    assert.ok(
      Math.abs((frame.right - frame.left) / (frame.top - frame.bottom) - width / height) < 1e-10,
    );
    assert.ok(Math.abs((frame.left + frame.right) / 2 - (bounds.minX + bounds.maxX) / 2) < 1e-10);
    assert.ok(Math.abs((frame.top + frame.bottom) / 2 - (bounds.minY + bounds.maxY) / 2) < 1e-10);
  }
});
