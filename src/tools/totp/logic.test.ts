import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  InvalidSecret,
  MAX_DIGITS,
  MIN_DIGITS,
  OTP_ALGOS,
  base32Decode,
  base32Encode,
  buildOtpauth,
  counterBytes,
  groupSecret,
  hotp,
  parseOtpauth,
  secondsLeft,
  stepOf,
  totp,
  totpWindow,
  truncate,
} from './logic.ts';

const ascii = (text: string) => new TextEncoder().encode(text);

/** The RFC 6238 seeds: 20, 32 and 64 bytes of the repeating digit string. */
const SEED_SHA1 = ascii('12345678901234567890');
const SEED_SHA256 = ascii('12345678901234567890123456789012');
const SEED_SHA512 = ascii('1234567890'.repeat(7)).subarray(0, 64);

/* ── Base32 ────────────────────────────────── */

test('RFC 4648 base32 vectors, both directions', () => {
  const cases: [string, string][] = [
    ['', ''],
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======'],
  ];
  for (const [plain, encoded] of cases) {
    assert.equal(base32Encode(ascii(plain), true), encoded, plain);
    assert.deepEqual(base32Decode(encoded), ascii(plain), encoded);
    // Unpadded is what services print, and must decode identically.
    assert.deepEqual(base32Decode(encoded.replace(/=+$/, '')), ascii(plain));
  }
});

test('the RFC 6238 seed is the familiar GEZDGNBV… secret', () => {
  assert.equal(base32Encode(SEED_SHA1), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), SEED_SHA1);
});

test('secrets decode however they were printed', () => {
  const canonical = base32Decode('MZXW6YTB');
  assert.deepEqual(base32Decode('mzxw6ytb'), canonical);
  assert.deepEqual(base32Decode('MZXW 6YTB'), canonical);
  assert.deepEqual(base32Decode('MZXW-6YTB'), canonical);
  assert.deepEqual(base32Decode('  MZXW6YTB  '), canonical);
});

test('a character outside the alphabet is an error, not a dropped byte', () => {
  assert.throws(() => base32Decode('MZXW6YT1'), InvalidSecret);
  assert.throws(() => base32Decode('MZXW6YT8'), /not a base32 character/);
  assert.throws(() => base32Decode('MZXW6YT0'), InvalidSecret);
  assert.throws(() => base32Decode('secret!'), InvalidSecret);
});

test('a secret cut off mid-character is reported as truncated', () => {
  // 'MB' carries 10 bits: one byte plus two non-zero leftover bits.
  assert.throws(() => base32Decode('MB'), /truncated/);
  // Whereas 'MY' is one byte plus zero padding, which is legal.
  assert.deepEqual(base32Decode('MY'), ascii('f'));
});

test('base32 round-trips arbitrary bytes at every length modulo 5', () => {
  for (let length = 0; length <= 12; length += 1) {
    const data = new Uint8Array(length).map((_, i) => (i * 61 + 3) % 256);
    assert.deepEqual(base32Decode(base32Encode(data)), data, `length ${length}`);
  }
});

test('groupSecret() breaks a secret into readable fours', () => {
  assert.equal(groupSecret('GEZDGNBVGY3TQOJQ'), 'GEZD GNBV GY3T QOJQ');
  assert.equal(groupSecret('ABC'), 'ABC');
  assert.equal(groupSecret(''), '');
});

/* ── Counter and truncation ────────────────── */

test('the counter is 8 bytes big-endian, past 2^32 too', () => {
  assert.deepEqual(counterBytes(0), new Uint8Array(8));
  assert.deepEqual(counterBytes(1), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]));
  assert.deepEqual(counterBytes(0x0102030405), new Uint8Array([0, 0, 0, 1, 2, 3, 4, 5]));
  assert.deepEqual(counterBytes(0xffffffff), new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]));
  assert.deepEqual(counterBytes(0x100000000), new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]));
});

test('dynamic truncation reads the RFC 4226 example', () => {
  // The worked example from RFC 4226 §5.4: this MAC truncates to 872921.
  const mac = new Uint8Array([
    0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16, 0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e,
    0x94, 0x5b, 0x55, 0x5a,
  ]);
  // The offset is 0xa, the 31-bit window is 0x50ef7f19 = 1357872921, and the
  // RFC's own answer is its last six digits.
  assert.equal(truncate(mac, 6), '872921');
  assert.equal(truncate(mac, 8), '57872921');
  assert.equal(truncate(mac, 10), '1357872921');
});

/* ── HOTP ──────────────────────────────────── */

test('RFC 4226 HOTP vectors for counters 0 to 9', async () => {
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  for (let counter = 0; counter < expected.length; counter += 1) {
    assert.equal(await hotp(SEED_SHA1, counter, 6, 'sha1'), expected[counter], `counter ${counter}`);
  }
});

test('hotp() refuses an empty secret and an unreasonable digit count', async () => {
  await assert.rejects(() => hotp(new Uint8Array(), 0), InvalidSecret);
  await assert.rejects(() => hotp(SEED_SHA1, 0, 4), RangeError);
  await assert.rejects(() => hotp(SEED_SHA1, 0, 11), RangeError);
  await assert.rejects(() => hotp(SEED_SHA1, 0, 6.5), RangeError);
  assert.equal((await hotp(SEED_SHA1, 0, MIN_DIGITS)).length, MIN_DIGITS);
  assert.equal((await hotp(SEED_SHA1, 0, MAX_DIGITS)).length, MAX_DIGITS);
});

/* ── TOTP ──────────────────────────────────── */

test('RFC 6238 vectors for all three hashes', async () => {
  const table: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [time, sha1, sha256, sha512] of table) {
    assert.equal(await totp(SEED_SHA1, time, { digits: 8, algo: 'sha1' }), sha1, `sha1 at ${time}`);
    assert.equal(await totp(SEED_SHA256, time, { digits: 8, algo: 'sha256' }), sha256, `sha256 at ${time}`);
    assert.equal(await totp(SEED_SHA512, time, { digits: 8, algo: 'sha512' }), sha512, `sha512 at ${time}`);
  }
});

test('the code is constant inside a step and changes across the boundary', async () => {
  const at = (seconds: number) => totp(SEED_SHA1, seconds, { digits: 8 });
  assert.equal(await at(30), await at(59));
  assert.notEqual(await at(59), await at(60));
  assert.equal(stepOf(59), 1);
  assert.equal(stepOf(60), 2);
  assert.equal(stepOf(59, 60), 0);
});

test('secondsLeft counts down to the next step', () => {
  assert.equal(secondsLeft(0), 30);
  assert.equal(secondsLeft(1), 29);
  assert.equal(secondsLeft(29), 1);
  assert.equal(secondsLeft(30), 30);
  assert.equal(secondsLeft(1699999999.7), 30 - (1699999999 % 30));
  assert.equal(secondsLeft(10, 60), 50);
  assert.equal(DEFAULT_PERIOD, 30);
  assert.equal(DEFAULT_DIGITS, 6);
});

test('totp() rejects a nonsense period', async () => {
  await assert.rejects(() => totp(SEED_SHA1, 0, { period: 0 }), RangeError);
  await assert.rejects(() => totp(SEED_SHA1, 0, { period: 2.5 }), RangeError);
});

test('the window brackets the current step and the codes line up with TOTP', async () => {
  const codes = await totpWindow(SEED_SHA1, 1111111111, { digits: 8 });
  assert.deepEqual(
    codes.map((entry) => entry.offset),
    [-1, 0, 1]
  );
  assert.equal(codes[1].code, '14050471');
  assert.equal(codes[0].code, await totp(SEED_SHA1, 1111111111 - 30, { digits: 8 }));
  assert.equal(codes[2].code, await totp(SEED_SHA1, 1111111111 + 30, { digits: 8 }));
  assert.equal(codes[1].step, stepOf(1111111111));

  const wide = await totpWindow(SEED_SHA1, 1111111111, { back: 2, forward: 0 });
  assert.deepEqual(
    wide.map((entry) => entry.offset),
    [-2, -1, 0]
  );
});

/* ── otpauth:// ────────────────────────────── */

test('a Google-Authenticator style URI parses into its parts', () => {
  const parsed = parseOtpauth(
    'otpauth://totp/GitHub:binbin%40example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub&algorithm=SHA1&digits=6&period=30'
  );
  assert.equal(parsed.secret, 'GEZDGNBVGY3TQOJQ');
  assert.equal(parsed.issuer, 'GitHub');
  assert.equal(parsed.account, 'binbin@example.com');
  assert.equal(parsed.algo, 'sha1');
  assert.equal(parsed.digits, 6);
  assert.equal(parsed.period, 30);
  assert.deepEqual(parsed.ignored, []);
});

test('the defaults fill in, and the issuer can come from the label alone', () => {
  const parsed = parseOtpauth('otpauth://totp/ACME%20Co:jane?secret=MZXW6YTB');
  assert.equal(parsed.issuer, 'ACME Co');
  assert.equal(parsed.account, 'jane');
  assert.equal(parsed.algo, 'sha1');
  assert.equal(parsed.digits, DEFAULT_DIGITS);
  assert.equal(parsed.period, DEFAULT_PERIOD);

  const bare = parseOtpauth('otpauth://totp/jane?secret=MZXW6YTB&algorithm=SHA-256&digits=8&period=60');
  assert.equal(bare.issuer, null);
  assert.equal(bare.account, 'jane');
  assert.equal(bare.algo, 'sha256');
  assert.equal(bare.digits, 8);
  assert.equal(bare.period, 60);
});

test('unusable URIs are refused with a reason', () => {
  assert.throws(() => parseOtpauth('https://example.com'), /not an otpauth/);
  assert.throws(() => parseOtpauth('otpauth://hotp/x?secret=MZXW6YTB&counter=1'), /only totp/);
  assert.throws(() => parseOtpauth('otpauth://totp/x'), /no secret/);
  assert.throws(() => parseOtpauth('otpauth://totp/x?secret=MZXW6YT1'), InvalidSecret);
  assert.throws(() => parseOtpauth('otpauth://totp/x?secret=MZXW6YTB&algorithm=MD5'), /algorithm/);
  assert.throws(() => parseOtpauth('otpauth://totp/x?secret=MZXW6YTB&digits=4'), /digits/);
  assert.throws(() => parseOtpauth('otpauth://totp/x?secret=MZXW6YTB&period=0'), /period/);
});

test('parameters this tool does not act on are reported rather than hidden', () => {
  const parsed = parseOtpauth('otpauth://totp/x?secret=MZXW6YTB&image=https%3A%2F%2Fa.example%2Ff.png&lock=true');
  assert.deepEqual(parsed.ignored.sort(), ['image', 'lock']);
});

test('buildOtpauth() and parseOtpauth() round-trip', () => {
  for (const algo of OTP_ALGOS) {
    const uri = buildOtpauth({
      secret: 'gezd gnbv gy3t qojq',
      issuer: 'ACME Co',
      account: 'jane@example.com',
      algo,
      digits: 8,
      period: 45,
    });
    const parsed = parseOtpauth(uri);
    assert.equal(parsed.secret, 'GEZDGNBVGY3TQOJQ');
    assert.equal(parsed.issuer, 'ACME Co');
    assert.equal(parsed.account, 'jane@example.com');
    assert.equal(parsed.algo, algo);
    assert.equal(parsed.digits, 8);
    assert.equal(parsed.period, 45);
  }
  // No issuer: the label is the account alone.
  assert.equal(parseOtpauth(buildOtpauth({ secret: 'MZXW6YTB' })).account, 'account');
});
