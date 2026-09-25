import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIGUOUS,
  CHARSETS,
  ImpossibleOptions,
  alphabetFor,
  crackTime,
  entropyOf,
  generate,
  satisfactionProbability,
  satisfies,
  strengthOf,
  type Options,
  type SetId,
} from './logic.ts';

const base: Options = { length: 16, sets: ['lower', 'upper', 'digit'], requireEach: false, avoidAmbiguous: false };
const opts = (over: Partial<Options> = {}): Options => ({ ...base, ...over });

/** Deterministic index source, so a generated password is reproducible. */
function sequence(values: number[]) {
  let i = 0;
  return (max: number) => values[i++ % values.length] % max;
}

/**
 * A plain LCG, only for the tests: rejection sampling needs a source that
 * spreads over the alphabet, and a short repeating list can cycle forever
 * without ever satisfying the constraints. (Numerical Recipes parameters.)
 */
function lcg(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % max;
  };
}

test('the alphabet is the union of the chosen sets', () => {
  assert.equal(alphabetFor(opts({ sets: ['digit'] })), CHARSETS.digit);
  assert.equal(alphabetFor(opts()).length, 26 + 26 + 10);
  // No selection is a broken UI state, not a crash: fall back to lowercase.
  assert.equal(alphabetFor(opts({ sets: [] })), CHARSETS.lower);
});

test('avoiding ambiguity removes every look-alike from the alphabet', () => {
  const alphabet = alphabetFor(opts({ avoidAmbiguous: true }));
  for (const ch of AMBIGUOUS) assert.ok(!alphabet.includes(ch), `${ch} survived`);
  assert.ok(alphabet.length < alphabetFor(opts()).length);
});

test('generated passwords have the requested length and stay in the alphabet', () => {
  const alphabet = alphabetFor(opts());
  const password = generate(opts(), sequence([3, 17, 41, 8, 0, 25, 60, 12]));
  assert.equal(password.length, 16);
  for (const ch of password) assert.ok(alphabet.includes(ch), ch);
});

test('requireEach is actually satisfied by what comes out', () => {
  const options = opts({ length: 12, sets: ['lower', 'upper', 'digit', 'symbol'], requireEach: true });
  for (let seed = 1; seed <= 40; seed += 1) {
    const password = generate(options, lcg(seed));
    assert.equal(password.length, options.length);
    assert.ok(satisfies(password, options), password);
  }
});

test('impossible options are refused, not silently truncated', () => {
  const tooShort = opts({ length: 3, sets: ['lower', 'upper', 'digit', 'symbol'], requireEach: true });
  assert.throws(() => generate(tooShort, sequence([1])), ImpossibleOptions);
});

test('satisfaction probability matches a brute-force count on a tiny case', () => {
  // Two sets of one character each, length 3: of 2^3 = 8 strings, the two
  // uniform ones fail, so 6/8.
  const tiny: Options = { length: 3, sets: ['lower', 'upper'], requireEach: true, avoidAmbiguous: false };
  const sets = [CHARSETS.lower, CHARSETS.upper];
  const alphabet = sets.join('');
  let valid = 0;
  let total = 0;
  const walk = (prefix: string) => {
    if (prefix.length === tiny.length) {
      total += 1;
      if (sets.every((set) => [...prefix].some((ch) => set.includes(ch)))) valid += 1;
      return;
    }
    for (const ch of alphabet) walk(prefix + ch);
  };
  walk('');
  assert.ok(Math.abs(satisfactionProbability(tiny) - valid / total) < 1e-12);
});

test('requireEach lowers the reported entropy rather than leaving it flattering', () => {
  const free = opts({ length: 8, sets: ['lower', 'upper', 'digit', 'symbol'] });
  const constrained = opts({ length: 8, sets: ['lower', 'upper', 'digit', 'symbol'], requireEach: true });
  assert.ok(entropyOf(constrained) < entropyOf(free));
  // And the unconstrained figure is the textbook one.
  assert.ok(Math.abs(entropyOf(free) - 8 * Math.log2(alphabetFor(free).length)) < 1e-9);
});

test('entropy grows with length and with alphabet size', () => {
  assert.ok(entropyOf(opts({ length: 20 })) > entropyOf(opts({ length: 10 })));
  assert.ok(
    entropyOf(opts({ sets: ['lower', 'upper', 'digit', 'symbol'] })) >
      entropyOf(opts({ sets: ['lower'] }))
  );
  assert.equal(entropyOf(opts({ length: 0 })), 0);
});

test('strength bands sit where the comments claim', () => {
  assert.equal(strengthOf(40), 'weak');
  assert.equal(strengthOf(59.9), 'weak');
  assert.equal(strengthOf(60), 'fair');
  assert.equal(strengthOf(80), 'strong');
  assert.equal(strengthOf(128), 'excessive');
});

test('crack time reads sensibly across the range', () => {
  assert.equal(crackTime(0), 'instantly');
  assert.equal(crackTime(20), 'instantly');
  assert.match(crackTime(60), /year|day|hour/);
  assert.match(crackTime(128), /^1e\d+ years$/);
});

test('every charset is free of duplicates', () => {
  for (const [id, set] of Object.entries(CHARSETS) as [SetId, string][]) {
    assert.equal(new Set(set).size, set.length, `${id} has a repeated character`);
  }
  // And the sets do not overlap, which inclusion–exclusion depends on.
  const all = Object.values(CHARSETS).join('');
  assert.equal(new Set(all).size, all.length, 'charsets overlap');
});
