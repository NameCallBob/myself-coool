import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeUtf8,
  encodeUtf8,
  equalBytes,
  fromBase64,
  fromHex,
  toBase64,
  toHex,
} from './bytes.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

test('hex round-trips and reports malformed input', () => {
  assert.equal(toHex(bytes(0, 15, 16, 255)), '000f10ff');
  assert.equal(toHex(bytes(222, 173), ':'), 'de:ad');
  assert.deepEqual(fromHex('000F10FF'), bytes(0, 15, 16, 255));
  assert.deepEqual(fromHex('de:ad be-ef'), bytes(222, 173, 190, 239));
  assert.throws(() => fromHex('abc'), /even/);
  assert.throws(() => fromHex('zz'), /non-hex/);
});

test('base64 handles padding, the URL-safe alphabet and empty input', () => {
  assert.equal(toBase64(encodeUtf8('a')), 'YQ==');
  assert.equal(toBase64(encodeUtf8('ab')), 'YWI=');
  assert.equal(toBase64(encodeUtf8('')), '');
  assert.equal(toBase64(bytes(251, 255)), '+/8=');
  assert.equal(toBase64(bytes(251, 255), true), '-_8');
  assert.deepEqual(fromBase64('-_8'), bytes(251, 255));
  assert.deepEqual(fromBase64('+/8='), bytes(251, 255));
  // Whitespace inside pasted base64 is normal and must not be an error.
  assert.deepEqual(fromBase64('YWI =\n'), encodeUtf8('ab'));
  assert.throws(() => fromBase64('YWIxY'), /length/);
});

test('base64 survives a payload larger than one chunk', () => {
  const big = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 251);
  assert.deepEqual(fromBase64(toBase64(big)), big);
});

test('utf-8 round-trips beyond the BMP', () => {
  for (const text of ['', 'ascii', 'CJK 中文', 'emoji \u{1F9EA}', 'a b']) {
    assert.equal(decodeUtf8(encodeUtf8(text)), text);
  }
  // A lone continuation byte: replaced by default, thrown when fatal.
  assert.equal(decodeUtf8(bytes(0x80)), '�');
  assert.throws(() => decodeUtf8(bytes(0x80), true));
});

test('equalBytes compares content, not identity', () => {
  assert.ok(equalBytes(bytes(1, 2, 3), bytes(1, 2, 3)));
  assert.ok(!equalBytes(bytes(1, 2, 3), bytes(1, 2, 4)));
  assert.ok(!equalBytes(bytes(1, 2), bytes(1, 2, 0)));
  assert.ok(equalBytes(bytes(), bytes()));
});
