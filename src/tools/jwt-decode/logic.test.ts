import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JwtError,
  algFamily,
  decodeJwt,
  decodeSecret,
  fromBase64Url,
  inspectClaims,
  normalizeToken,
  pemToDer,
  secretStrength,
  toBase64Url,
  type SecretEncoding,
  verify,
} from './logic.ts';

/**
 * The example token from RFC 7519 §3.1 / jwt.io's default, which is the only
 * HS256 vector with a published secret that everyone can check by hand.
 */
const RFC_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const RFC_SECRET = 'your-256-bit-secret';

const subtle = globalThis.crypto.subtle;

/* ── base64url ────────────────────────────── */

test('base64url round-trips arbitrary bytes', () => {
  for (const length of [0, 1, 2, 3, 17, 64, 255]) {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) data[i] = (i * 37 + 11) & 0xff;
    assert.deepEqual(fromBase64Url(toBase64Url(data)), data);
  }
});

test('base64url never emits padding or the URL-hostile characters', () => {
  const encoded = toBase64Url(new Uint8Array([251, 255, 190, 0]));
  assert.ok(!/[+/=]/.test(encoded));
  assert.deepEqual(fromBase64Url(encoded), new Uint8Array([251, 255, 190, 0]));
});

test('padding is tolerated on input even though JWS forbids it', () => {
  assert.deepEqual(fromBase64Url('YQ=='), new Uint8Array([97]));
  assert.deepEqual(fromBase64Url('YQ'), new Uint8Array([97]));
});

test('non-base64url characters are rejected instead of silently dropped', () => {
  assert.throws(() => fromBase64Url('abc!def'), JwtError);
  assert.throws(() => fromBase64Url('ab+cd'), JwtError);
  assert.throws(() => fromBase64Url('a'), JwtError); // length 1 mod 4 is impossible
});

/* ── Normalising ──────────────────────────── */

test('a pasted Authorization header is stripped down to the token', () => {
  assert.equal(normalizeToken(`Bearer ${RFC_TOKEN}`), RFC_TOKEN);
  assert.equal(normalizeToken(`authorization: Bearer ${RFC_TOKEN}`), RFC_TOKEN);
  assert.equal(normalizeToken(`"${RFC_TOKEN}"`), RFC_TOKEN);
  // Wrapped by a terminal or a log viewer; JWS itself contains no whitespace.
  assert.equal(normalizeToken(RFC_TOKEN.replace('.', '.\n  ')), RFC_TOKEN);
});

/* ── Decoding ─────────────────────────────── */

test('the RFC example decodes to its documented header and claims', () => {
  const jwt = decodeJwt(RFC_TOKEN);
  assert.deepEqual(jwt.header.value, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(jwt.payload.value, { sub: '1234567890', name: 'John Doe', iat: 1516239022 });
  assert.equal(jwt.alg, 'HS256');
  assert.equal(jwt.typ, 'JWT');
  assert.equal(jwt.kid, null);
  assert.equal(jwt.segmentCount, 3);
  assert.equal(jwt.encrypted, false);
  assert.equal(jwt.unsecured, false);
  // HS256 is a 32-byte MAC.
  assert.equal(jwt.signature.bits, 256);
  assert.equal(jwt.signingInput, RFC_TOKEN.slice(0, RFC_TOKEN.lastIndexOf('.')));
});

test('the wrong number of segments is refused', () => {
  assert.throws(() => decodeJwt('a.b'), (error: unknown) => {
    assert.ok(error instanceof JwtError);
    assert.equal(error.code, 'segment-count');
    return true;
  });
  assert.throws(() => decodeJwt('a.b.c.d'), JwtError);
  assert.throws(() => decodeJwt(''), (error: unknown) => {
    assert.ok(error instanceof JwtError);
    assert.equal(error.code, 'empty');
    return true;
  });
});

test('five segments are read as JWE, with no pretence of a payload', () => {
  const jwe = decodeJwt(`${toBase64Url(new TextEncoder().encode('{"alg":"RSA-OAEP","enc":"A256GCM"}'))}.aaaa.bbbb.cccc.dddd`);
  assert.equal(jwe.encrypted, true);
  assert.equal(jwe.segmentCount, 5);
  assert.equal(jwe.payload.value, null);
  assert.equal(jwe.header.value?.enc, 'A256GCM');
});

test('a JWE payload is flagged as encrypted, not as broken JSON', () => {
  // The ciphertext is not malformed JSON — nobody tried to parse it. Calling it
  // bad-json tells the reader the token is broken when it is merely encrypted.
  const header = toBase64Url(new TextEncoder().encode('{"alg":"RSA-OAEP","enc":"A256GCM"}'));
  const jwe = decodeJwt(`${header}.aaaa.bbbb.cccc.dddd`);
  assert.equal(jwe.payload.problem, 'encrypted');
  assert.equal(jwe.payload.value, null);
  assert.equal(jwe.payload.raw, 'cccc');
});

test('an unsecured token is decodable and marked as such', () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"none"}'));
  const payload = toBase64Url(new TextEncoder().encode('{"admin":true}'));
  const jwt = decodeJwt(`${header}.${payload}.`);
  assert.equal(jwt.unsecured, true);
  assert.equal(jwt.signature.bits, 0);
  assert.deepEqual(jwt.payload.value, { admin: true });
});

test('a segment that is not JSON is reported, not thrown away', () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"HS256"}'));
  const junk = toBase64Url(new TextEncoder().encode('not json at all'));
  const jwt = decodeJwt(`${header}.${junk}.zzzz`);
  assert.equal(jwt.payload.problem, 'bad-json');
  assert.equal(jwt.payload.text, 'not json at all');
});

test('a JSON array payload is not an object and says so', () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"HS256"}'));
  const list = toBase64Url(new TextEncoder().encode('[1,2,3]'));
  assert.equal(decodeJwt(`${header}.${list}.zzzz`).payload.problem, 'not-object');
});

test('invalid UTF-8 in a segment is reported rather than mojibake', () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"HS256"}'));
  // 0xff is not a legal UTF-8 lead byte anywhere.
  const bad = toBase64Url(new Uint8Array([0x7b, 0xff, 0x7d]));
  assert.equal(decodeJwt(`${header}.${bad}.zzzz`).payload.problem, 'bad-utf8');
});

test('Unicode claims survive decoding intact', () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"HS256"}'));
  const payload = toBase64Url(new TextEncoder().encode('{"name":"林小明 🙂"}'));
  const jwt = decodeJwt(`${header}.${payload}.zzzz`);
  assert.equal(jwt.payload.value?.name, '林小明 🙂');
});

/* ── Claims ───────────────────────────────── */

const NOW = Date.parse('2026-06-01T00:00:00Z');

test('exp in the past reads as expired, with the gap in seconds', () => {
  const report = inspectClaims({ exp: NOW / 1000 - 3600 }, NOW);
  assert.equal(report.expired, true);
  assert.equal(report.secondsToExpiry, -3600);
});

test('exp in the future reads as live', () => {
  const report = inspectClaims({ exp: NOW / 1000 + 120 }, NOW);
  assert.equal(report.expired, false);
  assert.equal(report.secondsToExpiry, 120);
});

test('the boundary second counts as expired', () => {
  assert.equal(inspectClaims({ exp: NOW / 1000 }, NOW).expired, true);
});

test('no exp is null, not false', () => {
  const report = inspectClaims({ sub: 'x' }, NOW);
  assert.equal(report.expired, null);
  assert.equal(report.secondsToExpiry, null);
  assert.equal(report.notYetValid, null);
});

test('nbf in the future means not yet valid', () => {
  assert.equal(inspectClaims({ nbf: NOW / 1000 + 60 }, NOW).notYetValid, true);
  assert.equal(inspectClaims({ nbf: NOW / 1000 - 60 }, NOW).notYetValid, false);
});

test('iat is only flagged beyond a minute of clock skew', () => {
  assert.equal(inspectClaims({ iat: NOW / 1000 + 30 }, NOW).issuedInFuture, false);
  assert.equal(inspectClaims({ iat: NOW / 1000 + 600 }, NOW).issuedInFuture, true);
});

test('a millisecond exp is named as a bug rather than rendered as the year 56000', () => {
  const report = inspectClaims({ exp: NOW }, NOW); // NOW is in milliseconds
  const exp = report.times.find((claim) => claim.name === 'exp');
  assert.ok(exp);
  assert.equal(exp.looksLikeMillis, true);
  // Interpreted as the milliseconds it obviously is, so the verdict is sane.
  assert.equal(report.expired, true);
  assert.equal(inspectClaims({ exp: NOW / 1000 }, NOW).times[0].looksLikeMillis, false);
});

test('non-time claims are listed with values stringified for display', () => {
  const report = inspectClaims(
    { sub: 'abc', roles: ['a', 'b'], n: 3, flag: true, nested: { x: 1 }, none: null },
    NOW
  );
  const map = new Map(report.other.map((entry) => [entry.key, entry.value]));
  assert.equal(map.get('sub'), 'abc');
  assert.equal(map.get('roles'), '["a","b"]');
  assert.equal(map.get('n'), '3');
  assert.equal(map.get('flag'), 'true');
  assert.equal(map.get('nested'), '{"x":1}');
  assert.equal(map.get('none'), 'null');
});

test('a null payload yields an empty report without throwing', () => {
  const report = inspectClaims(null, NOW);
  assert.deepEqual(report.times, []);
  assert.deepEqual(report.other, []);
  assert.equal(report.expired, null);
});

test('a string exp is not treated as a date', () => {
  const report = inspectClaims({ exp: '1735689600' }, NOW);
  assert.deepEqual(report.times, []);
  assert.equal(report.expired, null);
  assert.equal(report.other[0].key, 'exp');
});

/* ── Algorithm names ──────────────────────── */

test('algorithm families are recognised, including none and nonsense', () => {
  assert.equal(algFamily('HS256'), 'HS');
  assert.equal(algFamily('hs512'), 'HS');
  assert.equal(algFamily('RS384'), 'RS');
  assert.equal(algFamily('PS256'), 'PS');
  assert.equal(algFamily('ES512'), 'ES');
  assert.equal(algFamily('none'), 'none');
  assert.equal(algFamily('NONE'), 'none');
  assert.equal(algFamily('EdDSA'), 'unknown');
  assert.equal(algFamily('HS255'), 'unknown');
  assert.equal(algFamily(null), 'unknown');
});

test('secret strength is measured against the hash size', () => {
  assert.deepEqual(secretStrength('short', 'HS256'), {
    bytes: 5,
    required: 32,
    weak: true,
    problem: null,
  });
  assert.deepEqual(secretStrength('x'.repeat(32), 'HS256'), {
    bytes: 32,
    required: 32,
    weak: false,
    problem: null,
  });
  assert.deepEqual(secretStrength('x'.repeat(32), 'HS512'), {
    bytes: 32,
    required: 64,
    weak: true,
    problem: null,
  });
  // Byte length, not character count: CJK is three bytes each in UTF-8.
  assert.equal(secretStrength('中'.repeat(11), 'HS256').bytes, 33);
});

/** A 32-byte key and the two textual spellings of it people actually paste. */
const RAW_KEY = new Uint8Array(32).map((_unused, index) => (index * 7 + 11) & 0xff);
const KEY_BASE64 = Buffer.from(RAW_KEY).toString('base64');
const KEY_HEX = Buffer.from(RAW_KEY).toString('hex');

/** An HS token signed over key *bytes*, which is what a real issuer does. */
async function signHs(secret: Uint8Array, payload: string): Promise<string> {
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toBase64Url(new TextEncoder().encode(payload));
  const copy = new ArrayBuffer(secret.length);
  new Uint8Array(copy).set(secret);
  const material = await subtle.importKey('raw', copy, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(
    await subtle.sign('HMAC', material, new TextEncoder().encode(`${header}.${body}`))
  );
  return `${header}.${body}.${toBase64Url(signature)}`;
}

test('a secret can be given as text, base64 or hex', () => {
  const utf8 = decodeSecret('abc', 'utf8');
  assert.ok(utf8.ok && utf8.bytes.length === 3);
  const base64 = decodeSecret(KEY_BASE64, 'base64');
  assert.ok(base64.ok);
  assert.deepEqual(base64.ok && base64.bytes, RAW_KEY);
  const hex = decodeSecret(KEY_HEX, 'hex');
  assert.deepEqual(hex.ok && hex.bytes, RAW_KEY);
  // A key pasted out of a config file wraps, and base64url is just as common.
  assert.deepEqual(
    decodeSecret(`${KEY_BASE64.slice(0, 20)}\n ${KEY_BASE64.slice(20)}`, 'base64').ok &&
      decodeSecret(`${KEY_BASE64.slice(0, 20)}\n ${KEY_BASE64.slice(20)}`, 'base64'),
    { ok: true, bytes: RAW_KEY }
  );
  assert.deepEqual(
    decodeSecret(toBase64Url(RAW_KEY), 'base64'),
    { ok: true, bytes: RAW_KEY }
  );
  assert.deepEqual(decodeSecret(`0x${KEY_HEX.toUpperCase()}`, 'hex'), { ok: true, bytes: RAW_KEY });
});

test('a secret that is not the encoding it claims is named, not silently hashed', () => {
  assert.deepEqual(decodeSecret('not base64!!', 'base64'), { ok: false, problem: 'bad-base64' });
  assert.deepEqual(decodeSecret('abc', 'hex'), { ok: false, problem: 'bad-hex' });
  assert.deepEqual(decodeSecret('zz', 'hex'), { ok: false, problem: 'bad-hex' });
  assert.equal(secretStrength('not base64!!', 'HS256', 'base64').problem, 'bad-base64');
  assert.equal(secretStrength('not base64!!', 'HS256', 'base64').bytes, 0);
});

test('a base64 secret is sized by its bytes, not by the length of its text', () => {
  // The whole point: 44 characters of base64 are 32 bytes of key. Measuring the
  // text would call a 24-byte key "long enough" for HS256.
  assert.equal(KEY_BASE64.length, 44);
  assert.deepEqual(secretStrength(KEY_BASE64, 'HS256', 'base64'), {
    bytes: 32,
    required: 32,
    weak: false,
    problem: null,
  });
  assert.equal(secretStrength(KEY_BASE64, 'HS256', 'utf8').bytes, 44);
  const short = Buffer.from(new Uint8Array(24)).toString('base64');
  assert.equal(secretStrength(short, 'HS256', 'base64').weak, true);
  assert.equal(secretStrength(short, 'HS256', 'utf8').weak, false);
  assert.equal(secretStrength(KEY_HEX, 'HS256', 'hex').bytes, 32);
  assert.equal(secretStrength(KEY_HEX, 'HS256', 'utf8').bytes, 64);
});

test('a token signed with binary key bytes verifies once the encoding is stated', async () => {
  const token = await signHs(RAW_KEY, '{"sub":"binary"}');
  const jwt = decodeJwt(token);
  for (const [encoding, text] of [
    ['base64', KEY_BASE64],
    ['hex', KEY_HEX],
  ] as [SecretEncoding, string][]) {
    assert.deepEqual(await verify(jwt, 'HS256', text, subtle, encoding), { status: 'valid' });
  }
  // Read as text, the same key is 44 (or 64) different bytes and cannot match.
  assert.deepEqual(await verify(jwt, 'HS256', KEY_BASE64, subtle, 'utf8'), { status: 'invalid' });
  // And a text secret still defaults to text, so nothing already working moves.
  assert.deepEqual(await verify(decodeJwt(RFC_TOKEN), 'HS256', RFC_SECRET, subtle), {
    status: 'valid',
  });
});

test('an undecodable secret is a key error rather than a wrong verdict', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  const outcome = await verify(jwt, 'HS256', 'not base64!!', subtle, 'base64');
  assert.equal(outcome.status, 'key-error');
  assert.ok(outcome.status === 'key-error' && /base64/.test(outcome.reason));
});

/* ── Verification ─────────────────────────── */

test('the RFC example verifies with its published secret', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  assert.deepEqual(await verify(jwt, 'HS256', RFC_SECRET, subtle), { status: 'valid' });
});

test('a wrong secret is invalid, not an error', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  assert.deepEqual(await verify(jwt, 'HS256', `${RFC_SECRET}!`, subtle), { status: 'invalid' });
});

test('a tampered payload breaks the signature', async () => {
  const parts = RFC_TOKEN.split('.');
  const tampered = decodeJwt(
    `${parts[0]}.${toBase64Url(new TextEncoder().encode('{"sub":"admin"}'))}.${parts[2]}`
  );
  assert.deepEqual(await verify(tampered, 'HS256', RFC_SECRET, subtle), { status: 'invalid' });
});

test('verifying with the wrong hash size fails rather than passing', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  assert.deepEqual(await verify(jwt, 'HS384', RFC_SECRET, subtle), { status: 'invalid' });
});

test('alg none is never reported as valid', async () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"none"}'));
  const payload = toBase64Url(new TextEncoder().encode('{"admin":true}'));
  const jwt = decodeJwt(`${header}.${payload}.`);
  const outcome = await verify(jwt, 'none', '', subtle);
  assert.equal(outcome.status, 'unsupported');
});

test('an empty key is a key error, not a verdict', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  const outcome = await verify(jwt, 'HS256', '   ', subtle);
  assert.equal(outcome.status, 'key-error');
});

test('an unknown algorithm is refused rather than guessed', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  const outcome = await verify(jwt, 'EdDSA', 'whatever', subtle);
  assert.equal(outcome.status, 'unsupported');
});

test('a JWE cannot be signature-verified and says why', async () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"RSA-OAEP"}'));
  const jwe = decodeJwt(`${header}.a.b.c.d`);
  const outcome = await verify(jwe, 'HS256', 'key', subtle);
  assert.equal(outcome.status, 'unsupported');
});

test('a missing signature is invalid for a signed algorithm', async () => {
  const header = toBase64Url(new TextEncoder().encode('{"alg":"HS256"}'));
  const payload = toBase64Url(new TextEncoder().encode('{"a":1}'));
  const jwt = decodeJwt(`${header}.${payload}.`);
  assert.deepEqual(await verify(jwt, 'HS256', 'key', subtle), { status: 'invalid' });
});

/** Builds a real token with WebCrypto so the asymmetric paths are exercised
 *  against a signature this process actually produced. */
async function signWith(
  alg: string,
  params: RsaHashedKeyGenParams | EcKeyGenParams,
  sign: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
  payload: string
): Promise<{ token: string; pem: string }> {
  const pair = (await subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg, typ: 'JWT' })));
  const body = toBase64Url(new TextEncoder().encode(payload));
  const input = new TextEncoder().encode(`${header}.${body}`);
  const signature = new Uint8Array(await subtle.sign(sign, pair.privateKey, input));
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
  const base64 = Buffer.from(spki).toString('base64').replace(/(.{64})/g, '$1\n');
  return {
    token: `${header}.${body}.${toBase64Url(signature)}`,
    pem: `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`,
  };
}

/**
 * Flips a byte of the signature.
 *
 * Editing the last base64url character does not reliably do this: a 2048-bit
 * signature is 256 bytes, which is 341 and a third base64 characters, so the
 * 342nd carries two significant bits and four the decoder discards. Changing
 * it can leave the decoded bytes identical, and the "tampered" token verifies
 * — which is how this test came to fail about half the time.
 */
function corrupt(token: string): string {
  const [header, payload, signature] = token.split('.');
  const bytes = Buffer.from(signature, 'base64url');
  bytes[0] ^= 0xff;
  return `${header}.${payload}.${bytes.toString('base64url')}`;
}

test('RS256 verifies against a PEM public key', async () => {
  const { token, pem } = await signWith(
    'RS256',
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    { name: 'RSASSA-PKCS1-v1_5' },
    '{"sub":"rs"}'
  );
  assert.deepEqual(await verify(decodeJwt(token), 'RS256', pem, subtle), { status: 'valid' });
  assert.equal((await verify(decodeJwt(corrupt(token)), 'RS256', pem, subtle)).status, 'invalid');
});

test('PS256 verifies with the RFC 7518 salt length', async () => {
  const { token, pem } = await signWith(
    'PS256',
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    { name: 'RSA-PSS', saltLength: 32 },
    '{"sub":"ps"}'
  );
  assert.deepEqual(await verify(decodeJwt(token), 'PS256', pem, subtle), { status: 'valid' });
});

test('ES256 verifies from the raw r||s form JWS uses', async () => {
  const { token, pem } = await signWith(
    'ES256',
    { name: 'ECDSA', namedCurve: 'P-256' },
    { name: 'ECDSA', hash: 'SHA-256' },
    '{"sub":"es"}'
  );
  const jwt = decodeJwt(token);
  // P-256 signatures are 64 bytes of r‖s, not DER.
  assert.equal(jwt.signature.bytes?.length, 64);
  assert.deepEqual(await verify(jwt, 'ES256', pem, subtle), { status: 'valid' });
});

test('ES512 uses P-521, which is the mismatch that catches people out', async () => {
  const { token, pem } = await signWith(
    'ES512',
    { name: 'ECDSA', namedCurve: 'P-521' },
    { name: 'ECDSA', hash: 'SHA-512' },
    '{"sub":"es512"}'
  );
  assert.deepEqual(await verify(decodeJwt(token), 'ES512', pem, subtle), { status: 'valid' });
});

test('a malformed key is a key error carrying the reason', async () => {
  const jwt = decodeJwt(RFC_TOKEN);
  const outcome = await verify(jwt, 'RS256', '-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----', subtle);
  assert.equal(outcome.status, 'key-error');
  assert.ok(outcome.status === 'key-error' && outcome.reason.length > 0);
});

test('PEM parsing strips the armour and tolerates wrapping', () => {
  const body = Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${body.slice(0, 4)}\n${body.slice(4)}\n-----END PUBLIC KEY-----\n`;
  assert.deepEqual(pemToDer(pem), new Uint8Array([1, 2, 3, 4, 5, 6]));
  assert.throws(() => pemToDer('-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----'), Error);
});
