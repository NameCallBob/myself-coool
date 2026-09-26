import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABETS,
  BASE58_CEILING,
  BaseError,
  convert,
  decodeBase58,
  decodeBytes,
  encodeBase58,
  encodeBytes,
  expansion,
  guessFormat,
  type Format,
} from './logic.ts';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const hex = (s: string) => decodeBytes(s, 'hex');

const RFC_WORDS = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'];

test('RFC 4648 section 10: base16', () => {
  const expected = ['', '66', '666f', '666f6f', '666f6f62', '666f6f6261', '666f6f626172'];
  RFC_WORDS.forEach((word, i) => {
    assert.equal(encodeBytes(ascii(word), 'hex'), expected[i], word);
    assert.deepEqual(decodeBytes(expected[i], 'hex'), ascii(word), expected[i]);
  });
});

test('RFC 4648 section 10: base32', () => {
  const expected = ['', 'MY======', 'MZXQ====', 'MZXW6===', 'MZXW6YQ=', 'MZXW6YTB', 'MZXW6YTBOI======'];
  RFC_WORDS.forEach((word, i) => {
    assert.equal(encodeBytes(ascii(word), 'base32'), expected[i], word);
    assert.deepEqual(decodeBytes(expected[i], 'base32'), ascii(word), expected[i]);
  });
});

test('RFC 4648 section 10: base32 with the hex-extended alphabet', () => {
  const expected = ['', 'CO======', 'CPNG====', 'CPNMU===', 'CPNMUOG=', 'CPNMUOJ1', 'CPNMUOJ1E8======'];
  RFC_WORDS.forEach((word, i) => {
    assert.equal(encodeBytes(ascii(word), 'base32hex'), expected[i], word);
    assert.deepEqual(decodeBytes(expected[i], 'base32hex'), ascii(word), expected[i]);
  });
});

test('RFC 4648 section 10: base64', () => {
  const expected = ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'];
  RFC_WORDS.forEach((word, i) => {
    assert.equal(encodeBytes(ascii(word), 'base64'), expected[i], word);
    assert.deepEqual(decodeBytes(expected[i], 'base64'), ascii(word), expected[i]);
  });
});

test('Crockford base32 drops the ambiguous letters and the padding', () => {
  assert.equal(ALPHABETS.base32crockford, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  for (const letter of ['I', 'L', 'O', 'U']) {
    assert.equal(ALPHABETS.base32crockford?.includes(letter), false, letter);
  }
  const expected = ['', 'CR', 'CSQG', 'CSQPY', 'CSQPYRG', 'CSQPYRK1', 'CSQPYRK1E8'];
  RFC_WORDS.forEach((word, i) => {
    assert.equal(encodeBytes(ascii(word), 'base32crockford'), expected[i], word);
    assert.deepEqual(decodeBytes(expected[i], 'base32crockford'), ascii(word), expected[i]);
  });
});

test('Crockford decoding forgives the confusions its alphabet was designed around', () => {
  // O reads as zero; I and L read as one; hyphens are decoration.
  assert.deepEqual(decodeBytes('CSQPYRK1', 'base32crockford'), decodeBytes('csqpyrkl', 'base32crockford'));
  assert.deepEqual(decodeBytes('CSQPYRK1', 'base32crockford'), decodeBytes('CSQP-YRK-I', 'base32crockford'));
  assert.deepEqual(decodeBytes('0', 'base32crockford'), decodeBytes('O', 'base32crockford'));
});

test('base58 matches the published Bitcoin vectors', () => {
  const vectors: [string, string][] = [
    ['', ''],
    ['61', '2g'],
    ['626262', 'a3gV'],
    ['516b6fcd0f', 'ABnLTmg'],
    ['00', '1'],
    ['0000', '11'],
    ['0000287fb4cd', '11233QC4'],
  ];
  for (const [hexIn, expected] of vectors) {
    const data = hexIn === '' ? new Uint8Array() : hex(hexIn);
    assert.equal(encodeBase58(data), expected, hexIn);
    assert.deepEqual(decodeBase58(expected), data, expected);
  }
  assert.equal(encodeBase58(ascii('Hello World!')), '2NEpo7TZRRrLZSi2U');
  assert.equal(
    encodeBase58(ascii('The quick brown fox jumps over the lazy dog.')),
    'USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z'
  );
});

test('base58 keeps leading zero bytes, which the integer cannot', () => {
  // The failure this guards against: 0x00 0x01 and 0x01 encoding identically.
  assert.notEqual(encodeBase58(hex('0001')), encodeBase58(hex('01')));
  assert.deepEqual(decodeBase58(encodeBase58(hex('000000ff'))), hex('000000ff'));
  assert.deepEqual(decodeBase58('1111'), hex('00000000'));
});

test('base58 refuses the characters it deliberately omits, and says why', () => {
  for (const bad of ['0', 'O', 'I', 'l']) {
    assert.throws(() => decodeBase58(`abc${bad}`), (error: unknown) => {
      assert.ok(error instanceof BaseError);
      assert.match(error.message, /leaves out/);
      return true;
    }, bad);
  }
  assert.throws(() => decodeBase58('ab+cd'), BaseError);
});

test('base58 has a ceiling instead of a quadratic hang', () => {
  assert.doesNotThrow(() => encodeBase58(new Uint8Array(BASE58_CEILING)));
  assert.throws(() => encodeBase58(new Uint8Array(BASE58_CEILING + 1)), (error: unknown) => {
    assert.ok(error instanceof BaseError);
    assert.match(error.message, /quadratic/);
    return true;
  });
});

test('base64url uses the other two characters and no padding', () => {
  const data = hex('fbffbf');
  assert.equal(encodeBytes(data, 'base64'), '+/+/');
  assert.equal(encodeBytes(data, 'base64url'), '-_-_');
  assert.equal(encodeBytes(ascii('f'), 'base64url'), 'Zg');
  // Either alphabet decodes, because a token does not say which it used.
  assert.deepEqual(decodeBytes('-_-_', 'base64'), data);
  assert.deepEqual(decodeBytes('+/+/', 'base64url'), data);
});

test('padding can be switched off for the formats that have it', () => {
  assert.equal(encodeBytes(ascii('f'), 'base32', { pad: false }), 'MY');
  assert.equal(encodeBytes(ascii('f'), 'base64', { pad: false }), 'Zg');
  assert.deepEqual(decodeBytes('MY', 'base32'), ascii('f'));
});

test('decimal and binary lists survive every separator people use', () => {
  const data = ascii('Hi!');
  assert.equal(encodeBytes(data, 'decimal'), '72 105 33');
  assert.equal(encodeBytes(data, 'binary'), '01001000 01101001 00100001');
  assert.deepEqual(decodeBytes('72 105 33', 'decimal'), data);
  assert.deepEqual(decodeBytes('72, 105, 33', 'decimal'), data);
  assert.deepEqual(decodeBytes('[72, 105, 33]', 'decimal'), data);
  assert.deepEqual(decodeBytes('0x48 0x69 0x21', 'hex'), data);
  assert.deepEqual(decodeBytes('01001000,01101001,00100001', 'binary'), data);
  assert.deepEqual(decodeBytes('', 'decimal'), new Uint8Array());
});

test('a byte value out of range is refused, not truncated', () => {
  assert.throws(() => decodeBytes('256', 'decimal'), BaseError);
  assert.throws(() => decodeBytes('12 abc', 'decimal'), BaseError);
  assert.throws(() => decodeBytes('012345678', 'binary'), BaseError);
});

test('hex complains about an odd digit count and points at the end', () => {
  assert.throws(() => decodeBytes('abc', 'hex'), (error: unknown) => {
    assert.ok(error instanceof BaseError);
    assert.match(error.message, /even number/);
    return true;
  });
  assert.throws(() => decodeBytes('zz', 'hex'), BaseError);
  assert.deepEqual(decodeBytes('de:ad-be ef', 'hex'), hex('deadbeef'));
  assert.deepEqual(decodeBytes('DEADBEEF', 'hex'), hex('deadbeef'));
});

test('utf8 is a format like any other, so text goes in and bytes come out', () => {
  assert.equal(encodeBytes(decodeBytes('台北', 'utf8'), 'hex'), 'e58fb0e58c97');
  assert.equal(convert('台北', 'utf8', 'base64'), '5Y+w5Yy X'.replace(' ', ''));
  assert.equal(convert('5Y+w5Yy X'.replace(' ', ''), 'base64', 'utf8'), '台北');
  assert.equal(convert('😀', 'utf8', 'hex'), 'f09f9880');
});

test('convert is total across every pair of formats', () => {
  const formats: Format[] = [
    'hex',
    'base32',
    'base32hex',
    'base32crockford',
    'base58',
    'base64',
    'base64url',
    'decimal',
    'binary',
  ];
  const samples = [new Uint8Array(), hex('00'), hex('ff'), ascii('foobar'), hex('000102fdfeff')];
  for (const data of samples) {
    for (const from of formats) {
      const encoded = encodeBytes(data, from);
      for (const to of formats) {
        const round = decodeBytes(convert(encoded, from, to), to);
        assert.deepEqual(round, data, `${from} to ${to}: ${encodeBytes(data, 'hex')}`);
      }
    }
  }
});

test('an unpadded bit-group tail decodes to the same bytes', () => {
  for (const format of ['base32', 'base32hex', 'base64'] as const) {
    for (const word of RFC_WORDS) {
      const padded = encodeBytes(ascii(word), format);
      const bare = padded.replace(/=+$/, '');
      assert.deepEqual(decodeBytes(bare, format), ascii(word), `${format} ${word}`);
    }
  }
});

test('guessFormat picks something sensible and admits when it cannot', () => {
  assert.equal(guessFormat('01001000 01101001')?.format, 'binary');
  assert.equal(guessFormat('72 105 33')?.format, 'decimal');
  assert.equal(guessFormat('deadbeef')?.format, 'hex');
  assert.equal(guessFormat('MZXW6YTBOI======')?.format, 'base32');
  assert.equal(guessFormat('8J-YgA')?.format, 'base64url');
  assert.equal(guessFormat('Zm9vYmFy')?.format, 'base64');
  assert.equal(guessFormat('2NEpo7TZRRrLZSi2U')?.format, 'base58');
  assert.equal(guessFormat(''), null);
  assert.equal(guessFormat('台北 not any base'), null);
  // Every guess carries the reason, because the guess can be wrong.
  assert.ok((guessFormat('deadbeef')?.reason.length ?? 0) > 0);
});

test('expansion reports the real cost of each format', () => {
  assert.equal(expansion('hex'), 2);
  assert.equal(expansion('base64'), 4 / 3);
  assert.equal(expansion('base32'), 8 / 5);
  assert.ok(expansion('base58') > 1.36 && expansion('base58') < 1.37);
  assert.equal(expansion('binary'), 9);
  assert.equal(expansion('utf8'), 1);
  // Measured against the encoders: base64 of 300 bytes is 400 characters.
  assert.equal(encodeBytes(new Uint8Array(300), 'base64').length, 400);
  assert.equal(encodeBytes(new Uint8Array(300), 'hex').length, 600);
});

test('a hundred kilobytes is fine in every format that is linear', () => {
  const big = new Uint8Array(100_000);
  for (let i = 0; i < big.length; i += 1) big[i] = i & 0xff;
  for (const format of ['hex', 'base32', 'base64', 'base64url', 'decimal', 'binary'] as const) {
    assert.deepEqual(decodeBytes(encodeBytes(big, format), format), big, format);
  }
});
