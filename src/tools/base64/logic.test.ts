import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABETS,
  Base64Error,
  WRAP_MIME,
  WRAP_PEM,
  buildDataUri,
  decodeBase64,
  decodedLength,
  encodeBase64,
  fromUtf8Bytes,
  inspectBase64,
  parseDataUri,
  toHex,
  toUtf8Bytes,
  wrapLines,
} from './logic.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

test('RFC 4648 section 10 test vectors, every length class', () => {
  const vectors: [string, string][] = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];
  for (const [plain, encoded] of vectors) {
    assert.equal(encodeBase64(ascii(plain)), encoded, `encode ${JSON.stringify(plain)}`);
    assert.deepEqual(decodeBase64(encoded), ascii(plain), `decode ${encoded}`);
  }
});

test('alphabets are the two RFC 4648 tables and differ only in the last two slots', () => {
  assert.equal(ALPHABETS.standard.length, 64);
  assert.equal(ALPHABETS.urlsafe.length, 64);
  assert.equal(ALPHABETS.standard.slice(0, 62), ALPHABETS.urlsafe.slice(0, 62));
  assert.equal(ALPHABETS.standard.slice(62), '+/');
  assert.equal(ALPHABETS.urlsafe.slice(62), '-_');
});

test('UTF-8 goes through unharmed, which is what btoa cannot do', () => {
  assert.equal(encodeBase64(toUtf8Bytes('你好')), '5L2g5aW9');
  assert.equal(encodeBase64(toUtf8Bytes('😀')), '8J+YgA==');
  assert.equal(encodeBase64(toUtf8Bytes('😀'), { variant: 'urlsafe' }), '8J-YgA');
  for (const sample of ['', 'a', '中文 with ASCII', '😀 flag', ' ', 'x'.repeat(1000)]) {
    assert.equal(fromUtf8Bytes(decodeBase64(encodeBase64(toUtf8Bytes(sample)))), sample);
  }
});

test('URL-safe output has no padding by default and no plus or slash', () => {
  const data = new Uint8Array([0xfb, 0xff, 0xbf]);
  assert.equal(encodeBase64(data), '+/+/');
  assert.equal(encodeBase64(data, { variant: 'urlsafe' }), '-_-_');
  assert.equal(encodeBase64(ascii('f'), { variant: 'urlsafe' }), 'Zg');
  assert.equal(encodeBase64(ascii('f'), { variant: 'urlsafe', pad: true }), 'Zg==');
});

test('decode accepts either alphabet and ignores whitespace', () => {
  assert.deepEqual(decodeBase64('-_-_'), new Uint8Array([0xfb, 0xff, 0xbf]));
  assert.deepEqual(decodeBase64('+/+/'), new Uint8Array([0xfb, 0xff, 0xbf]));
  assert.deepEqual(decodeBase64('Zm9v\r\nYmFy'), ascii('foobar'));
  assert.deepEqual(decodeBase64('  Zm9vYmFy  '), ascii('foobar'));
  // Unpadded, the JWT shape.
  assert.deepEqual(decodeBase64('Zm9vYmE'), ascii('fooba'));
});

test('illegal input reports the offset of the character that broke it', () => {
  assert.throws(() => decodeBase64('Zm9v*mFy'), (error: unknown) => {
    assert.ok(error instanceof Base64Error);
    assert.equal(error.index, 4);
    return true;
  });
  // Five data characters: one 6-bit leftover, not a byte.
  assert.throws(() => decodeBase64('Zm9vY'), Base64Error);
  assert.throws(() => decodeBase64('Zm9v=Ymfy'), Base64Error);
  assert.throws(() => decodeBase64('Zg==='), Base64Error);
  assert.throws(() => decodeBase64('Zm9v中'), Base64Error);
});

test('strict mode rejects a tail whose spare bits are set', () => {
  // atob() reads both of these as the single byte 0x66.
  assert.deepEqual(decodeBase64('Zh=='), new Uint8Array([0x66]));
  assert.deepEqual(decodeBase64('Zg=='), new Uint8Array([0x66]));
  assert.throws(() => decodeBase64('Zh==', { strict: true }), Base64Error);
  assert.doesNotThrow(() => decodeBase64('Zg==', { strict: true }));
  // Three characters carry two bytes and leave two spare bits; '9' sets them.
  assert.deepEqual(decodeBase64('Zm9'), new Uint8Array([0x66, 0x6f]));
  assert.throws(() => decodeBase64('Zm9', { strict: true }), Base64Error);
  assert.doesNotThrow(() => decodeBase64('Zm8', { strict: true }));
});

test('strict mode passes every canonical vector', () => {
  for (const sample of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', ' ÿ']) {
    const encoded = encodeBase64(toUtf8Bytes(sample));
    assert.deepEqual(decodeBase64(encoded, { strict: true }), toUtf8Bytes(sample));
  }
});

test('decodedLength matches what decode actually produces', () => {
  for (let n = 0; n < 40; n += 1) {
    const data = new Uint8Array(n).fill(0x5a);
    const encoded = encodeBase64(data, { variant: 'urlsafe' });
    assert.equal(decodedLength(encoded.length), n, `length for ${n} bytes`);
  }
});

test('wrapping is by count and leaves short input alone', () => {
  assert.equal(wrapLines('abcdef', 0), 'abcdef');
  assert.equal(wrapLines('abcdef', 10), 'abcdef');
  assert.equal(wrapLines('abcdef', 2), 'ab\ncd\nef');
  assert.equal(wrapLines('abcde', 2, '\r\n'), 'ab\r\ncd\r\ne');
  const long = encodeBase64(new Uint8Array(200), { wrap: WRAP_MIME });
  assert.ok(long.split('\n').every((line) => line.length <= WRAP_MIME));
  assert.equal(WRAP_PEM, 64);
  // Wrapping is cosmetic: decoding gives the bytes back.
  assert.equal(decodeBase64(long).length, 200);
});

test('inspect explains a string rather than only judging it', () => {
  const report = inspectBase64('Zm9v YmFy==');
  assert.equal(report.dataChars, 8);
  assert.equal(report.whitespace, 1);
  assert.equal(report.padding, 2);
  assert.equal(report.expectedBytes, 6);
  assert.equal(report.invalid, null);

  const mixed = inspectBase64('a-b+c_d/');
  assert.equal(mixed.mixedAlphabet, true);
  assert.equal(mixed.standardOnly, 2);
  assert.equal(mixed.urlSafeOnly, 2);

  const broken = inspectBase64('ab$cd');
  assert.deepEqual(broken.invalid, { index: 2, char: '$' });
  assert.equal(inspectBase64('').dataChars, 0);
});

test('fromUtf8Bytes returns null rather than mojibake on invalid UTF-8', () => {
  assert.equal(fromUtf8Bytes(new Uint8Array([0xff, 0xfe, 0x00])), null);
  assert.equal(fromUtf8Bytes(new Uint8Array([0xe4, 0xbd])), null);
  assert.equal(fromUtf8Bytes(toUtf8Bytes('ok 好')), 'ok 好');
  assert.equal(fromUtf8Bytes(new Uint8Array()), '');
});

test('hex preview is lowercase, space separated and truncatable', () => {
  assert.equal(toHex(new Uint8Array([0x00, 0x0f, 0xff])), '00 0f ff');
  assert.equal(toHex(new Uint8Array([1, 2, 3, 4]), 2), '01 02');
  assert.equal(toHex(new Uint8Array()), '');
});

test('data URIs round-trip in both base64 and percent form', () => {
  const data = toUtf8Bytes('hello, 世界');
  const b64 = buildDataUri('text/plain', data, { charset: 'utf-8' });
  assert.equal(b64, 'data:text/plain;charset=utf-8;base64,aGVsbG8sIOS4lueVjA==');
  const parsedB64 = parseDataUri(b64);
  assert.equal(parsedB64.base64, true);
  assert.equal(parsedB64.mime, 'text/plain');
  assert.deepEqual(parsedB64.params, [{ key: 'charset', value: 'utf-8' }]);
  assert.deepEqual(parsedB64.data, data);

  const plain = buildDataUri('text/plain', data, { base64: false });
  assert.ok(plain.includes('%E4%B8%96'));
  assert.deepEqual(parseDataUri(plain).data, data);
});

test('a data URI with no type means text/plain and US-ASCII', () => {
  const parsed = parseDataUri('data:,A%20brief%20note');
  assert.equal(parsed.mime, 'text/plain');
  assert.deepEqual(parsed.params, [{ key: 'charset', value: 'US-ASCII' }]);
  assert.equal(fromUtf8Bytes(parsed.data), 'A brief note');
});

test('a malformed data URI says what is missing', () => {
  assert.throws(() => parseDataUri('text/plain;base64,AAAA'), Base64Error);
  assert.throws(() => parseDataUri('data:text/plain;base64'), Base64Error);
  assert.throws(() => parseDataUri('data:text/plain,%zz'), Base64Error);
});

test('empty payloads are legal at both ends', () => {
  assert.equal(encodeBase64(new Uint8Array()), '');
  assert.deepEqual(decodeBase64(''), new Uint8Array());
  assert.equal(parseDataUri('data:text/plain;base64,').data.length, 0);
  assert.equal(buildDataUri('', new Uint8Array()), 'data:application/octet-stream;base64,');
});

test('a megabyte encodes without recursion or argument limits', () => {
  const big = new Uint8Array(1_000_000);
  for (let i = 0; i < big.length; i += 1) big[i] = i & 0xff;
  const encoded = encodeBase64(big);
  assert.equal(encoded.length, Math.ceil(big.length / 3) * 4);
  assert.deepEqual(decodeBase64(encoded), big);
});
