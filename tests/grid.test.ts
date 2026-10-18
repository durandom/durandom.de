import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTSIDE, insideRoundedRect, luminance, normalize, sampleLuminance, sharpen } from '../src/grid.ts';

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

test('sharpen leaves a flat grid unchanged', () => {
  const out = sharpen(new Float32Array(9).fill(0.4), 3, 3, 2);
  assert.ok(out.every((v) => Math.abs(v - 0.4) < 1e-6));
});

test('sharpen overshoots on both sides of an edge', () => {
  // One row: dark | bright step between columns 1 and 2.
  const out = sharpen(new Float32Array([0.2, 0.2, 0.8, 0.8]), 4, 1, 1);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6, 'far from the edge stays put');
  assert.ok(out[1] < 0.2, 'dark side of the edge gets darker');
  assert.ok(out[2] > 0.8, 'bright side of the edge gets brighter');
  assert.ok(Math.abs(out[3] - 0.8) < 1e-6);
});

test('sharpen ignores OUTSIDE neighbours and keeps them OUTSIDE', () => {
  const out = sharpen(new Float32Array([OUTSIDE, 0.5, 0.5]), 3, 1, 3);
  assert.equal(out[0], OUTSIDE);
  assert.ok(Math.abs(out[1] - 0.5) < 1e-6);
});

test('sharpen with amount 0 is the identity', () => {
  const lum = new Float32Array([0.1, 0.9, 0.3, 0.6]);
  assert.deepEqual(Array.from(sharpen(lum, 2, 2, 0)), Array.from(lum));
});

test('sampleLuminance crop drops a light border', () => {
  // 20×20 black image with a 1px white frame.
  const px = image(20, 20, (x, y) => (x === 0 || y === 0 || x === 19 || y === 19 ? 255 : 0));
  const uncropped = sampleLuminance(px, 20, 20, 4, 4);
  assert.ok(uncropped[0] > 0, 'border bleeds into the edge cells without crop');
  const cropped = sampleLuminance(px, 20, 20, 4, 4, 0, 0.05);
  assert.ok(cropped.every((v) => v === 0), 'a 5% crop removes the 1px frame');
});

test('sampleLuminance crop samples only the inner region and keeps the mask on the grid', () => {
  // Left 25% white, rest black: a 25% crop leaves only black.
  const px = image(8, 8, (x) => (x < 2 ? 255 : 0));
  const grid = sampleLuminance(px, 8, 8, 4, 4, 0.5, 0.25);
  assert.equal(grid[0], OUTSIDE);
  assert.equal(grid[5], 0);
});
