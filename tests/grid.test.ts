import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTSIDE, insideRoundedRect, luminance, normalize, sampleLuminance } from '../src/grid.ts';

/** Builds an RGBA image from a function of (x, y) returning a grey value 0..255. */
function image(width: number, height: number, grey: (x: number, y: number) => number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      px[p] = px[p + 1] = px[p + 2] = grey(x, y);
      px[p + 3] = 255;
    }
  }
  return px;
}

test('luminance spans 0..1', () => {
  assert.equal(luminance(0, 0, 0), 0);
  assert.ok(Math.abs(luminance(255, 255, 255) - 1) < 1e-9);
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
});

test('insideRoundedRect cuts corners only', () => {
  assert.ok(insideRoundedRect(0.5, 0.5, 0.2));
  assert.ok(insideRoundedRect(0.5, 0, 0.2));
  assert.ok(!insideRoundedRect(0.01, 0.01, 0.2));
  assert.ok(insideRoundedRect(0.01, 0.01, 0));
  assert.ok(!insideRoundedRect(1.1, 0.5, 0));
});

test('sampleLuminance box-filters into cells', () => {
  // Left half black, right half white.
  const px = image(8, 4, (x) => (x < 4 ? 0 : 255));
  const grid = sampleLuminance(px, 8, 4, 2, 2);
  assert.deepEqual(Array.from(grid).map((v) => Math.round(v)), [0, 1, 0, 1]);
});

test('sampleLuminance handles non-square cells and grids larger than the image', () => {
  const px = image(2, 2, (x, y) => (x + y) * 60);
  const grid = sampleLuminance(px, 2, 2, 4, 3);
  assert.equal(grid.length, 12);
  assert.ok(grid.every((v) => v >= 0 && v <= 1));
});

test('sampleLuminance masks rounded corners', () => {
  const px = image(10, 10, () => 128);
  const grid = sampleLuminance(px, 10, 10, 10, 10, 0.3);
  assert.equal(grid[0], OUTSIDE);
  assert.equal(grid[9], OUTSIDE);
  assert.equal(grid[99], OUTSIDE);
  assert.notEqual(grid[55], OUTSIDE);
});

test('normalize stretches inside cells to 0..1 and keeps OUTSIDE', () => {
  const out = normalize(new Float32Array([OUTSIDE, 0.4, 0.5, 0.6]), 0, 1);
  assert.equal(out[0], OUTSIDE);
  assert.equal(out[1], 0);
  assert.equal(out[3], 1);
  assert.ok(Math.abs(out[2] - 0.5) < 1e-6);
});

test('normalize survives a flat or empty grid', () => {
  assert.deepEqual(Array.from(normalize(new Float32Array([0.3, 0.3]))), [0, 0]);
  assert.deepEqual(Array.from(normalize(new Float32Array([OUTSIDE]))), [OUTSIDE]);
});
