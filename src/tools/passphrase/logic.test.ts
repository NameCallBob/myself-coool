import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SIZE,
  ImpossibleOptions,
  MAX_DIGITS,
  MAX_WORDS,
  MIN_WORDS,
  SEPARATORS,
  SYMBOLS,
  WORDS,
  bitsPerWord,
  entropyBreakdown,
  generatePassphrase,
  guessTime,
  listFor,
  normalizeWordlist,
  strengthOf,
  typedLength,
  type Options,
} from './logic.ts';

const base: Options = {
  words: 6,
  separator: 'hyphen',
  capitalize: 'none',
  digits: 0,
  symbol: false,
};
const opts = (over: Partial<Options> = {}): Options => ({ ...base, ...over });

/** Deterministic index source, so a generated passphrase is reproducible. */
function sequence(values: number[]) {
  let i = 0;
  return (max: number) => values[i++ % values.length] % max;
}

/* ── The wordlist ──────────────────────────── */

test('the built-in list is exactly 2048 distinct words', () => {
  assert.equal(WORDS.length, BUILT_IN_SIZE);
  assert.equal(WORDS.length, 2048);
  assert.equal(new Set(WORDS).size, WORDS.length, 'a repeated word would shrink the real keyspace');
});

test('every word is plain lower-case ASCII of a typable length', () => {
  for (const word of WORDS) {
    assert.match(word, /^[a-z]{2,9}$/, word);
  }
});

test('the list is sorted, so it can be audited by eye', () => {
  assert.deepEqual(WORDS, [...WORDS].sort());
});

test('2048 words is exactly 11 bits each', () => {
  assert.equal(bitsPerWord(WORDS), 11);
  assert.equal(bitsPerWord(['a', 'b']), 1);
  assert.equal(bitsPerWord(['only']), 0);
  assert.equal(bitsPerWord([]), 0);
});

test('a pasted list is cleaned, de-duplicated and sorted', () => {
  assert.deepEqual(normalizeWordlist('Beta alpha  beta\nGAMMA'), ['alpha', 'beta', 'gamma']);
  // The EFF files are `11116<tab>acid`; the dice column must not become a word.
  assert.deepEqual(normalizeWordlist('11116\tacid\n11121\tacorn'), ['acid', 'acorn']);
  assert.deepEqual(normalizeWordlist('1. apple\n2. banana'), ['apple', 'banana']);
  assert.deepEqual(normalizeWordlist('a,b;c'), ['a', 'b', 'c']);
  assert.deepEqual(normalizeWordlist('   \n  '), []);
});

test('listFor falls back to the built-in list rather than producing nothing', () => {
  assert.equal(listFor(opts()), WORDS);
  assert.equal(listFor(opts({ list: [] })), WORDS);
  const custom = ['one', 'two', 'three'];
  assert.equal(listFor(opts({ list: custom })), custom);
});

test('the symbol set has no repeats', () => {
  assert.equal(new Set(SYMBOLS).size, SYMBOLS.length);
  assert.ok(!SYMBOLS.includes('"'));
  assert.ok(!SYMBOLS.includes('\\'));
});

/* ── Entropy ───────────────────────────────── */

test('entropy is words × bits-per-word and nothing more', () => {
  assert.equal(entropyBreakdown(opts({ words: 6 })).total, 66);
  assert.equal(entropyBreakdown(opts({ words: 4 })).total, 44);
  assert.equal(entropyBreakdown(opts({ words: 10 })).total, 110);
  assert.equal(entropyBreakdown(opts({ words: 0 })).total, 0);
});

test('capitalising every word adds nothing, because it is a fixed pattern', () => {
  const plain = entropyBreakdown(opts({ capitalize: 'none' }));
  const each = entropyBreakdown(opts({ capitalize: 'each' }));
  assert.equal(each.capitalization, 0);
  assert.equal(each.total, plain.total);
});

test('capitalising one random word adds log2(words) bits, which is barely any', () => {
  const one = entropyBreakdown(opts({ words: 6, capitalize: 'one-random' }));
  assert.ok(Math.abs(one.capitalization - Math.log2(6)) < 1e-12);
  assert.ok(Math.abs(one.total - (66 + Math.log2(6))) < 1e-12);
  // Less than a quarter of one extra word. That is the lesson.
  assert.ok(one.capitalization < bitsPerWord(WORDS) / 4);
  // With a single word there is nothing to choose between.
  assert.equal(entropyBreakdown(opts({ words: 1, capitalize: 'one-random' })).capitalization, 0);
});

test('digits and a symbol are counted at their real value', () => {
  const digits = entropyBreakdown(opts({ digits: 4 }));
  assert.ok(Math.abs(digits.digits - 4 * Math.log2(10)) < 1e-12);
  assert.equal(entropyBreakdown(opts({ digits: 0 })).digits, 0);

  const symbol = entropyBreakdown(opts({ symbol: true }));
  assert.ok(Math.abs(symbol.symbol - Math.log2(SYMBOLS.length)) < 1e-12);
  assert.equal(entropyBreakdown(opts({ symbol: false })).symbol, 0);

  // Four digits and a symbol together are worth less than two more words.
  const decorated = entropyBreakdown(opts({ digits: 4, symbol: true }));
  const twoMoreWords = entropyBreakdown(opts({ words: 8 }));
  assert.ok(decorated.total < twoMoreWords.total);
});

test('a smaller pasted list gives a smaller figure, honestly', () => {
  const small = entropyBreakdown(opts({ words: 6, list: ['alpha', 'beta', 'gamma', 'delta'] }));
  assert.equal(small.words, 6 * 2);
  assert.equal(small.total, 12);
});

/* ── Generation ────────────────────────────── */

test('a passphrase has the requested words, joined by the chosen separator', () => {
  const phrase = generatePassphrase(opts({ words: 4 }), sequence([0, 1, 2, 3]));
  assert.equal(phrase.split('-').length, 4);
  for (const word of phrase.split('-')) assert.ok(WORDS.includes(word), word);

  for (const [id, separator] of Object.entries(SEPARATORS)) {
    const out = generatePassphrase(opts({ words: 3, separator: id }), sequence([5, 9, 40]));
    if (separator === '') {
      assert.ok(!out.includes('-'));
    } else {
      assert.equal(out.split(separator).length, 3, id);
    }
  }
});

test('every word comes from the list, drawn with replacement', () => {
  // The same index twice must produce the same word twice, not a shuffle.
  const phrase = generatePassphrase(opts({ words: 3 }), sequence([7]));
  const parts = phrase.split('-');
  assert.equal(new Set(parts).size, 1);
  assert.equal(parts[0], WORDS[7]);
});

test('capitalisation does what each mode claims', () => {
  const each = generatePassphrase(opts({ words: 3, capitalize: 'each' }), sequence([1, 2, 3]));
  for (const word of each.split('-')) assert.match(word, /^[A-Z][a-z]*$/, word);

  const one = generatePassphrase(opts({ words: 4, capitalize: 'one-random' }), sequence([1, 2, 3, 4, 2]));
  const capitals = one.split('-').filter((word) => /^[A-Z]/.test(word));
  assert.equal(capitals.length, 1, one);

  const none = generatePassphrase(opts({ words: 3, capitalize: 'none' }), sequence([1, 2, 3]));
  assert.equal(none, none.toLowerCase());
});

test('digits and a symbol land where the entropy assumed they would', () => {
  const phrase = generatePassphrase(opts({ words: 3, digits: 3, symbol: true }), sequence([1, 2, 3, 4, 5, 6, 7]));
  assert.match(phrase, /^[a-z]+-[a-z]+-[a-z]+-\d{3}./);
  assert.ok(SYMBOLS.includes(phrase[phrase.length - 1]), phrase);

  const noDigits = generatePassphrase(opts({ words: 3, digits: 0 }), sequence([1, 2, 3]));
  assert.ok(!/\d/.test(noDigits));
});

test('a custom list is used, and one-word lists are refused', () => {
  const list = ['alpha', 'beta'];
  const phrase = generatePassphrase(opts({ words: 3, list }), sequence([0, 1, 0]));
  assert.equal(phrase, 'alpha-beta-alpha');
  assert.throws(() => generatePassphrase(opts({ list: ['only'] }), sequence([0])), ImpossibleOptions);
});

test('options outside the stated range are refused rather than clamped', () => {
  assert.throws(() => generatePassphrase(opts({ words: MIN_WORDS - 1 }), sequence([0])), ImpossibleOptions);
  assert.throws(() => generatePassphrase(opts({ words: MAX_WORDS + 1 }), sequence([0])), /word count/);
  assert.throws(() => generatePassphrase(opts({ words: 4.5 }), sequence([0])), /word count/);
  assert.throws(() => generatePassphrase(opts({ digits: -1 }), sequence([0])), /digit count/);
  assert.throws(() => generatePassphrase(opts({ digits: MAX_DIGITS + 1 }), sequence([0])), /digit count/);
});

test('typedLength counts what the fingers have to do', () => {
  const phrase = generatePassphrase(opts({ words: 4 }), sequence([0, 1, 2, 3]));
  assert.equal(typedLength(phrase), phrase.length);
  // A four-word passphrase at 44 bits is longer to type than a 44-bit random
  // string — the trade this tool exists to make explicit.
  assert.ok(typedLength(phrase) > 10);
});

/* ── Reporting ─────────────────────────────── */

test('strength bands line up with the password generator', () => {
  assert.equal(strengthOf(44), 'weak');
  assert.equal(strengthOf(59.9), 'weak');
  assert.equal(strengthOf(66), 'fair');
  assert.equal(strengthOf(88), 'strong');
  assert.equal(strengthOf(132), 'excessive');
});

test('guess time reads sensibly across the range', () => {
  assert.equal(guessTime(0), 'instantly');
  assert.equal(guessTime(22), 'instantly');
  assert.match(guessTime(66), /year|day|hour|minute/);
  assert.match(guessTime(132), /^1e\d+ years$/);
  // Four words (44 bits) falls to an offline attack in minutes; six (66 bits)
  // takes years. That gap is the whole argument for the word count.
  assert.equal(guessTime(44, 1e11), '1.5 minutes');
  assert.match(guessTime(66, 1e11), /years?$/);
  assert.equal(guessTime(32, 1e9), '2.1 seconds');
});
