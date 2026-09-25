import { test } from 'node:test';
import assert from 'node:assert/strict';
import { below, between, entropyBits, sample, shuffle } from './random.ts';

/**
 * The bias test is the point of this file. `% n` on a uniform 32-bit value
 * skews the low buckets whenever n does not divide 2^32, and the skew is far
 * too small to spot by eye in generated passwords — so it gets measured.
 */
test('below() stays in range and rejects bad bounds', () => {
  for (let i = 0; i < 500; i += 1) {
    const value = below(7);
    assert.ok(value >= 0 && value < 7, `${value} out of range`);
  }
  assert.equal(below(1), 0);
  assert.throws(() => below(0), RangeError);
  assert.throws(() => below(-3), RangeError);
  assert.throws(() => below(1.5), RangeError);
});

test('below() is uniform enough that a chi-square does not object', () => {
  const buckets = new Array(62).fill(0);
  const draws = 62 * 400;
  for (let i = 0; i < draws; i += 1) buckets[below(62)] += 1;

  const expected = draws / 62;
  const chi = buckets.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
  // 61 degrees of freedom: the 99.9th percentile is about 112. A
  // modulo-biased sampler over this alphabet lands well above it.
  assert.ok(chi < 112, `chi-square ${chi.toFixed(1)} suggests a biased sampler`);
});

test('between() covers both ends inclusively', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 400; i += 1) seen.add(between(3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('shuffle() keeps every element and leaves the input alone', () => {
  const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
  const out = shuffle(input);
  assert.deepEqual(
    out.slice().sort((a, b) => a - b),
    [...input]
  );
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('sample() returns distinct items and refuses to over-draw', () => {
  const pool = ['a', 'b', 'c', 'd'];
  const drawn = sample(pool, 3);
  assert.equal(drawn.length, 3);
  assert.equal(new Set(drawn).size, 3);
  assert.throws(() => sample(pool, 5), RangeError);
});

test('entropyBits() matches the textbook figures', () => {
  assert.equal(entropyBits(2, 8), 8);
  assert.ok(Math.abs(entropyBits(62, 12) - 71.45) < 0.01);
  assert.equal(entropyBits(1, 10), 0);
  assert.equal(entropyBits(62, 0), 0);
});
