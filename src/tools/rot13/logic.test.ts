import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGLISH_FREQ,
  SAMPLE_LIMIT,
  atbash,
  breakCaesar,
  letterCounts,
  letterTotal,
  rot,
  rot13,
  rot18,
  rot47,
  rot5,
  scoreEnglish,
} from './logic.ts';

test('ROT13 matches the canonical example and is its own inverse', () => {
  assert.equal(rot13('Hello, World!'), 'Uryyb, Jbeyq!');
  assert.equal(rot13('Uryyb, Jbeyq!'), 'Hello, World!');
  assert.equal(rot13(rot13('The quick brown fox')), 'The quick brown fox');
  assert.equal(rot13('abcdefghijklmnopqrstuvwxyz'), 'nopqrstuvwxyzabcdefghijklm');
  assert.equal(rot13('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'NOPQRSTUVWXYZABCDEFGHIJKLM');
});

test('a shift of any size wraps, in both directions', () => {
  assert.equal(rot('abc', 1), 'bcd');
  assert.equal(rot('xyz', 3), 'abc');
  assert.equal(rot('abc', -1), 'zab');
  assert.equal(rot('abc', 0), 'abc');
  assert.equal(rot('abc', 26), 'abc');
  assert.equal(rot('abc', 27), 'bcd');
  assert.equal(rot('abc', -27), 'zab');
  assert.equal(rot('abc', 1.9), 'bcd'); // truncated, not rounded
  for (let n = -60; n <= 60; n += 1) {
    assert.equal(rot(rot('Sample Text', n), -n), 'Sample Text', `shift ${n}`);
  }
});

test('only the Latin alphabet moves', () => {
  assert.equal(rot13('台北 101 — café 😀'), '台北 101 — pnsé 😀');
  assert.equal(rot13('0123456789'), '0123456789');
  assert.equal(rot13('!@#$%^&*()'), '!@#$%^&*()');
  assert.equal(rot13(''), '');
  // A shift on the accented letter would give ò, which no Caesar cipher means.
  assert.equal(rot13('é'), 'é');
  assert.equal(rot13('Ω'), 'Ω');
});

test('ROT5 and ROT18 handle the digits', () => {
  assert.equal(rot5('0123456789'), '5678901234');
  assert.equal(rot5(rot5('9876543210')), '9876543210');
  assert.equal(rot5('abc'), 'abc');
  assert.equal(rot18('abc 123'), 'nop 678');
  assert.equal(rot18(rot18('Order A-1024')), 'Order A-1024');
});

test('ROT47 covers the printable ASCII range and is self-inverse', () => {
  assert.equal(rot47('Hello'), 'w6==@');
  assert.equal(rot47('w6==@'), 'Hello');
  assert.equal(rot47(rot47('https://example.com/a?b=1')), 'https://example.com/a?b=1');
  // The space and the newline are outside the range, so they stay put.
  assert.equal(rot47(' '), ' ');
  assert.equal(rot47('\n\t'), '\n\t');
  assert.equal(rot47('台北'), '台北');
  // The whole 94-character block round-trips.
  const printable = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('');
  assert.equal(rot47(rot47(printable)), printable);
  assert.notEqual(rot47(printable), printable);
});

test('Atbash reflects the alphabet and is its own inverse', () => {
  assert.equal(atbash('abc'), 'zyx');
  assert.equal(atbash('ABC'), 'ZYX');
  assert.equal(atbash('zyx'), 'abc');
  assert.equal(atbash(atbash('Attack at dawn')), 'Attack at dawn');
  assert.equal(atbash('AZ az'), 'ZA za');
  assert.equal(atbash('台北 123'), '台北 123');
  assert.equal(atbash(''), '');
  // The middle of the alphabet swaps with itself across the mirror.
  assert.equal(atbash('mn'), 'nm');
});

test('the English frequency table is a distribution with E and T on top', () => {
  const total = Object.values(ENGLISH_FREQ).reduce((n, v) => n + v, 0);
  assert.ok(Math.abs(total - 100) < 0.5, `frequencies sum to ${total}`);
  assert.equal(Object.keys(ENGLISH_FREQ).length, 26);
  const ranked = Object.entries(ENGLISH_FREQ).sort((x, y) => y[1] - x[1]);
  assert.deepEqual(
    ranked.slice(0, 3).map(([letter]) => letter),
    ['E', 'T', 'A']
  );
  assert.deepEqual(ranked.at(-1)?.[0], 'Z');
});

test('letter counting ignores case and everything that is not a letter', () => {
  const counts = letterCounts('aA bB! 123 台');
  assert.equal(counts[0], 2);
  assert.equal(counts[1], 2);
  assert.equal(counts[2], 0);
  assert.equal(letterTotal('aA bB! 123 台'), 4);
  assert.equal(letterTotal(''), 0);
  assert.equal(letterTotal('台北 101'), 0);
});

test('the English score prefers English and refuses to guess on nothing', () => {
  const english = 'the quick brown fox jumps over the lazy dog again and again';
  assert.ok(scoreEnglish(english) < scoreEnglish(rot13(english)));
  assert.equal(scoreEnglish(''), Number.POSITIVE_INFINITY);
  assert.equal(scoreEnglish('台北 101'), Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(scoreEnglish('a')));
});

test('breaking a Caesar names the shift, which is the point of the tool', () => {
  const plain =
    'it was the best of times it was the worst of times it was the age of wisdom ' +
    'it was the age of foolishness it was the epoch of belief';
  for (const shift of [1, 5, 13, 21, 25]) {
    const encoded = rot(plain, shift);
    const best = breakCaesar(encoded)[0];
    assert.equal(best.shift, (26 - shift) % 26, `shift ${shift} not recovered`);
    assert.equal(best.text, plain, `shift ${shift} text wrong`);
  }
});

test('breaking returns all 26 candidates, sorted, with shift 0 included', () => {
  const candidates = breakCaesar('Uryyb, Jbeyq!');
  assert.equal(candidates.length, 26);
  assert.deepEqual(
    [...candidates].map((entry) => entry.shift).sort((x, y) => x - y),
    Array.from({ length: 26 }, (_, i) => i)
  );
  for (let i = 1; i < candidates.length; i += 1) {
    assert.ok(candidates[i].score >= candidates[i - 1].score, `unsorted at ${i}`);
  }
  // Every candidate really is that shift applied to the input.
  for (const entry of candidates) {
    assert.equal(entry.text, rot('Uryyb, Jbeyq!', entry.shift));
  }
});

test('breaking something with no letters ranks everything equally badly', () => {
  const candidates = breakCaesar('台北 101 — 沒有字母');
  assert.equal(candidates.length, 26);
  assert.ok(candidates.every((entry) => entry.score === Number.POSITIVE_INFINITY));
  // Ties break on the shift, so the output is at least stable.
  assert.equal(candidates[0].shift, 0);
});

test('a long input is scored on a sample but transformed in full', () => {
  const long = 'the quick brown fox jumps over the lazy dog '.repeat(500);
  assert.ok(long.length > SAMPLE_LIMIT);
  const best = breakCaesar(rot(long, 13))[0];
  assert.equal(best.shift, 13);
  assert.equal(best.text.length, long.length);
  assert.equal(best.text, long);
});
