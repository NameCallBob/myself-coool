import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytes, count, fixed, ms, utf8Length } from './format.ts';

/** Readings use a narrow no-break space; the tests compare on plain spaces. */
const plain = (value: string) => value.replace(/ /g, ' ');

test('bytes() switches unit at the right thresholds', () => {
  assert.equal(plain(bytes(0)), '0 B');
  assert.equal(plain(bytes(1023)), '1023 B');
  assert.equal(plain(bytes(1024)), '1.00 KB');
  assert.equal(plain(bytes(1024 * 1023)), '1023.0 KB');
  assert.equal(plain(bytes(1024 * 1024)), '1.00 MB');
  assert.equal(plain(bytes(-1)), '—');
  assert.equal(plain(bytes(Number.NaN)), '—');
});

test('ms() keeps sub-millisecond readings legible', () => {
  assert.equal(plain(ms(0.125)), '0.13 ms');
  assert.equal(plain(ms(9.5)), '9.50 ms');
  assert.equal(plain(ms(120)), '120.0 ms');
  assert.equal(plain(ms(2500)), '2.50 s');
  assert.equal(plain(ms(Number.POSITIVE_INFINITY)), '—');
});

test('count() and fixed() group digits', () => {
  assert.equal(count(1234567), '1,234,567');
  assert.equal(fixed(1234.5), '1,234.50');
  assert.equal(fixed(0.005, 4), '0.0050');
  assert.equal(fixed(Number.NaN), '—');
});

test('utf8Length() matches TextEncoder, including surrogate pairs', () => {
  const encoder = new TextEncoder();
  for (const text of ['', 'abc', 'café', '中文', '\u{1F9EA}\u{1F52C}', 'a\u{1F9EA}b中', '\u{10FFFF}']) {
    assert.equal(utf8Length(text), encoder.encode(text).length, text);
  }
});
