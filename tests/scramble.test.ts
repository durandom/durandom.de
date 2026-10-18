import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrambleFrame } from '../src/scramble.ts';

test('scrambleFrame resolves fully at progress 1', () => {
  assert.equal(scrambleFrame('GitHub', 1), 'GitHub');
});

test('scrambleFrame keeps length and spaces, emits hex for unresolved chars', () => {
  const out = scrambleFrame('web b4mad', 0, () => 0.99);
  assert.equal(out, 'fff fffff');
});

test('scrambleFrame resolves left to right', () => {
  assert.equal(scrambleFrame('abcd', 0.5, () => 0), 'ab00');
});
