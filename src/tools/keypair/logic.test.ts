import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BadPem,
  EC_CURVES,
  PRIVATE_LABEL,
  PUBLIC_LABEL,
  RSA_SIZES,
  UnsupportedKey,
  canonicalJwk,
  describeKind,
  equivalentBits,
  exportPair,
  fromBase64,
  generatePair,
  jwkThumbprint,
  pemDecode,
  pemEncode,
  sshWireFormat,
  toBase64,
  toBase64Url,
  toHex,
  webCryptoParams,
  type KeyKind,
} from './logic.ts';

/** 2048-bit RSA throughout: 4096 generation would add seconds per case and
 *  exercises no different code path. */
const RSA: KeyKind = { family: 'rsa', algorithm: 'RSASSA-PKCS1-v1_5', modulusBits: 2048, hash: 'SHA-256' };
const EC: KeyKind = { family: 'ec', algorithm: 'ECDSA', curve: 'P-256' };

/* ── PEM ──────────────────────────────────── */

test('PEM wraps at 64 columns and round-trips', () => {
  for (const length of [0, 1, 47, 48, 49, 300, 1200]) {
    const der = new Uint8Array(length).map((_, i) => (i * 11) % 256);
    const pem = pemEncode(PUBLIC_LABEL, der);
    const lines = pem.split('\n');
    assert.equal(lines[0], `-----BEGIN ${PUBLIC_LABEL}-----`);
    assert.equal(lines[lines.length - 1], `-----END ${PUBLIC_LABEL}-----`);
    for (const line of lines.slice(1, -1)) assert.ok(line.length <= 64, `line of ${line.length}`);
    assert.deepEqual(pemDecode(pem).der, der, `length ${length}`);
  }
});

test('a PEM block is found inside surrounding noise, CRLF included', () => {
  const der = new Uint8Array([1, 2, 3, 4]);
  const pem = pemEncode(PRIVATE_LABEL, der);
  assert.deepEqual(pemDecode(`some notes\n\n${pem}\n\nmore notes`).der, der);
  assert.deepEqual(pemDecode(pem.replace(/\n/g, '\r\n')).der, der);
  assert.equal(pemDecode(pem).label, PRIVATE_LABEL);
});

test('the PEM label is reported and can be required', () => {
  const pkcs1 = pemEncode('RSA PRIVATE KEY', new Uint8Array([9]));
  assert.equal(pemDecode(pkcs1).label, 'RSA PRIVATE KEY');
  assert.throws(() => pemDecode(pkcs1, PRIVATE_LABEL), BadPem);
  assert.throws(() => pemDecode(pkcs1, PRIVATE_LABEL), /not "PRIVATE KEY"/);
  assert.throws(() => pemDecode('nothing here'), /no -----BEGIN/);
  assert.throws(() => pemDecode('-----BEGIN PUBLIC KEY-----\n!!!!\n-----END PUBLIC KEY-----'), /not valid base64/);
});

test('base64 and hex helpers behave at the edges', () => {
  assert.equal(toBase64(new Uint8Array()), '');
  assert.equal(toBase64(new Uint8Array([251, 255])), '+/8=');
  assert.equal(toBase64Url(new Uint8Array([251, 255])), '-_8');
  assert.deepEqual(fromBase64('-_8'), new Uint8Array([251, 255]));
  assert.equal(toHex(new Uint8Array([0, 15, 255])), '000fff');
  assert.equal(toHex(new Uint8Array([222, 173]), ':'), 'de:ad');
  const big = new Uint8Array(0x8000 * 2 + 3).map((_, i) => i % 251);
  assert.deepEqual(fromBase64(toBase64(big)), big);
});

/* ── Parameters ───────────────────────────── */

test('WebCrypto parameters and usages match the algorithm', () => {
  const rsa = webCryptoParams(RSA);
  assert.deepEqual(rsa.usages, ['sign', 'verify']);
  assert.equal((rsa.params as RsaHashedKeyGenParams).modulusLength, 2048);
  assert.deepEqual([...(rsa.params as RsaHashedKeyGenParams).publicExponent], [1, 0, 1]);

  assert.deepEqual(
    webCryptoParams({ family: 'rsa', algorithm: 'RSA-OAEP', modulusBits: 2048, hash: 'SHA-256' }).usages,
    ['encrypt', 'decrypt']
  );
  assert.deepEqual(webCryptoParams({ family: 'ec', algorithm: 'ECDH', curve: 'P-384' }).usages, [
    'deriveKey',
    'deriveBits',
  ]);
  assert.deepEqual(webCryptoParams({ family: 'ed25519', algorithm: 'Ed25519' }).usages, ['sign', 'verify']);
  assert.throws(
    () => webCryptoParams({ family: 'rsa', algorithm: 'RSA-PSS', modulusBits: 1024, hash: 'SHA-256' }),
    UnsupportedKey
  );
});

test('the strength table says what NIST says', () => {
  assert.equal(equivalentBits(RSA), 112);
  assert.equal(equivalentBits({ ...RSA, modulusBits: 3072 } as KeyKind), 128);
  assert.equal(equivalentBits({ ...RSA, modulusBits: 4096 } as KeyKind), 128);
  assert.equal(equivalentBits(EC), 128);
  assert.equal(equivalentBits({ family: 'ec', algorithm: 'ECDSA', curve: 'P-384' }), 192);
  assert.equal(equivalentBits({ family: 'ec', algorithm: 'ECDSA', curve: 'P-521' }), 256);
  assert.equal(equivalentBits({ family: 'ed25519', algorithm: 'Ed25519' }), 128);
  assert.match(describeKind(RSA), /RSASSA-PKCS1-v1_5 2048-bit \(SHA-256\)/);
  assert.equal(describeKind(EC), 'ECDSA P-256');
  assert.equal(describeKind({ family: 'ed25519', algorithm: 'Ed25519' }), 'Ed25519');
  assert.deepEqual(RSA_SIZES, [2048, 3072, 4096]);
  assert.deepEqual(EC_CURVES, ['P-256', 'P-384', 'P-521']);
});

/* ── RFC 7638 ─────────────────────────────── */

test('the canonical JWK holds only the required members, in order', () => {
  const ec = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
    y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    d: 'jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI',
    ext: true,
    key_ops: ['sign'],
  } as JsonWebKey;
  assert.equal(
    canonicalJwk(ec),
    '{"crv":"P-256","kty":"EC","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}'
  );
  assert.equal(canonicalJwk({ kty: 'RSA', n: 'AQ', e: 'AQAB', d: 'secret' } as JsonWebKey), '{"e":"AQAB","kty":"RSA","n":"AQ"}');
  assert.equal(canonicalJwk({ kty: 'OKP', crv: 'Ed25519', x: 'AA' } as JsonWebKey), '{"crv":"Ed25519","kty":"OKP","x":"AA"}');
  assert.throws(() => canonicalJwk({ kty: 'nope' } as JsonWebKey), UnsupportedKey);
  assert.throws(() => canonicalJwk({ kty: 'RSA', n: 'AQ' } as JsonWebKey), /missing "e"/);
});

test('the thumbprint is SHA-256 of that canonical form, base64url without padding', async () => {
  const jwk = { kty: 'RSA', n: 'AQAB', e: 'AQAB' } as JsonWebKey;
  const canonical = canonicalJwk(jwk);
  const expected = createHash('sha256')
    .update(canonical)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert.equal(await jwkThumbprint(jwk), expected);
  assert.ok(!(await jwkThumbprint(jwk)).includes('='));
  // Private material and metadata must not change the thumbprint.
  assert.equal(
    await jwkThumbprint({ ...jwk, d: 'x', kid: 'k', alg: 'RS256', ext: true } as JsonWebKey),
    expected
  );
});

/* ── SSH wire format ──────────────────────── */

const sshParts = (blob: Uint8Array) => {
  const parts: Uint8Array[] = [];
  let offset = 0;
  while (offset + 4 <= blob.length) {
    const length = (blob[offset] << 24) | (blob[offset + 1] << 16) | (blob[offset + 2] << 8) | blob[offset + 3];
    parts.push(blob.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  assert.equal(offset, blob.length, 'the blob is a whole number of ssh strings');
  return parts;
};

test('an RSA public key becomes a well-formed ssh-rsa blob', () => {
  // n with the top bit set, so the mpint must gain a leading zero.
  const wire = sshWireFormat({ kty: 'RSA', e: 'AQAB', n: toBase64Url(new Uint8Array([0xff, 0x01])) } as JsonWebKey);
  assert.ok(wire);
  assert.equal(wire.type, 'ssh-rsa');
  const parts = sshParts(wire.blob);
  assert.equal(new TextDecoder().decode(parts[0]), 'ssh-rsa');
  assert.deepEqual([...parts[1]], [0x01, 0x00, 0x01]);
  assert.deepEqual([...parts[2]], [0x00, 0xff, 0x01], 'a high bit gets a zero byte in front');

  // And a value without the top bit set keeps its minimal form.
  const low = sshWireFormat({ kty: 'RSA', e: 'AQAB', n: toBase64Url(new Uint8Array([0x00, 0x7f, 2])) } as JsonWebKey);
  assert.deepEqual([...sshParts(low!.blob)[2]], [0x7f, 2]);
});

test('an EC public key becomes an ecdsa-sha2-nistp… blob with an uncompressed point', () => {
  const x = new Uint8Array(32).fill(0x11);
  const y = new Uint8Array(32).fill(0x22);
  const wire = sshWireFormat({ kty: 'EC', crv: 'P-256', x: toBase64Url(x), y: toBase64Url(y) } as JsonWebKey);
  assert.ok(wire);
  assert.equal(wire.type, 'ecdsa-sha2-nistp256');
  const parts = sshParts(wire.blob);
  assert.equal(new TextDecoder().decode(parts[0]), 'ecdsa-sha2-nistp256');
  assert.equal(new TextDecoder().decode(parts[1]), 'nistp256');
  assert.equal(parts[2].length, 65);
  assert.equal(parts[2][0], 0x04);
  assert.deepEqual([...parts[2].subarray(1, 33)], [...x]);
  assert.deepEqual([...parts[2].subarray(33)], [...y]);
});

test('an Ed25519 public key becomes an ssh-ed25519 blob, and unsupported types are null', () => {
  const raw = new Uint8Array(32).fill(7);
  const wire = sshWireFormat({ kty: 'OKP', crv: 'Ed25519', x: toBase64Url(raw) } as JsonWebKey);
  assert.ok(wire);
  assert.equal(wire.type, 'ssh-ed25519');
  const parts = sshParts(wire.blob);
  assert.deepEqual([...parts[1]], [...raw]);

  assert.equal(sshWireFormat({ kty: 'OKP', crv: 'X25519', x: 'AA' } as JsonWebKey), null);
  assert.equal(sshWireFormat({ kty: 'oct', k: 'AA' } as JsonWebKey), null);
  assert.equal(sshWireFormat({ kty: 'EC', crv: 'P-224', x: 'AA', y: 'AA' } as JsonWebKey), null);
});

/* ── End to end ───────────────────────────── */

test('an RSA pair exports to PEM that WebCrypto reads back, and signs', async () => {
  const pair = await generatePair(RSA);
  const exported = await exportPair(pair, 'binbin@bench');

  const publicDer = pemDecode(exported.publicPem, PUBLIC_LABEL).der;
  const privateDer = pemDecode(exported.privatePem, PRIVATE_LABEL).der;
  assert.deepEqual(publicDer, exported.spki);
  assert.deepEqual(privateDer, exported.pkcs8);

  const reimportedPublic = await crypto.subtle.importKey(
    'spki',
    publicDer as Uint8Array<ArrayBuffer>,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify']
  );
  const reimportedPrivate = await crypto.subtle.importKey(
    'pkcs8',
    privateDer as Uint8Array<ArrayBuffer>,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const message = new TextEncoder().encode('bench test');
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', reimportedPrivate, message);
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', reimportedPublic, signature, message));

  assert.equal(exported.spkiSha256.length, 32);
  assert.match(exported.openssh ?? '', /^ssh-rsa [A-Za-z0-9+/=]+ binbin@bench$/);
  assert.match(exported.sshFingerprint ?? '', /^SHA256:[A-Za-z0-9_-]{43}$/);
  const jwk = JSON.parse(exported.publicJwk) as JsonWebKey;
  assert.equal(jwk.kty, 'RSA');
  assert.equal(await jwkThumbprint(jwk), exported.thumbprint);
  assert.ok(JSON.parse(exported.privateJwk).d, 'the private JWK carries d');
});

test('an EC pair exports and signs, and its fingerprints differ from the RSA shapes', async () => {
  const pair = await generatePair(EC);
  const exported = await exportPair(pair);
  const publicDer = pemDecode(exported.publicPem, PUBLIC_LABEL).der;
  const key = await crypto.subtle.importKey(
    'spki',
    publicDer as Uint8Array<ArrayBuffer>,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
  const message = new TextEncoder().encode('x');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, message);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, message));

  assert.match(exported.openssh ?? '', /^ecdsa-sha2-nistp256 /);
  // An EC SPKI is far shorter than an RSA one — the point of the strength table.
  assert.ok(exported.spki.length < 200, `spki was ${exported.spki.length} bytes`);
  // The SSH fingerprint hashes the wire format, the other hashes DER: different.
  assert.notEqual(exported.sshFingerprint, `SHA256:${toBase64Url(exported.spkiSha256)}`);
});

test('two generated pairs are different keys', async () => {
  const one = await exportPair(await generatePair(EC));
  const two = await exportPair(await generatePair(EC));
  assert.notEqual(one.thumbprint, two.thumbprint);
  assert.notEqual(one.publicPem, two.publicPem);
});

test('an RSA-OAEP key exports for encryption rather than signing', async () => {
  const pair = await generatePair({
    family: 'rsa',
    algorithm: 'RSA-OAEP',
    modulusBits: 2048,
    hash: 'SHA-256',
  });
  const exported = await exportPair(pair);
  // The key material is RSA, so OpenSSH's ssh-rsa form is still derivable —
  // what differs is that WebCrypto marked it for encryption, not signing.
  assert.ok(exported.openssh?.startsWith('ssh-rsa '));
  assert.equal(JSON.parse(exported.publicJwk).key_ops?.[0], 'encrypt');
});

test('Ed25519 works where the platform has it, and fails with advice where it does not', async () => {
  const kind: KeyKind = { family: 'ed25519', algorithm: 'Ed25519' };
  try {
    const exported = await exportPair(await generatePair(kind));
    assert.match(exported.openssh ?? '', /^ssh-ed25519 /);
    assert.equal(JSON.parse(exported.publicJwk).crv, 'Ed25519');
  } catch (problem) {
    assert.ok(problem instanceof UnsupportedKey, 'the failure must be the explained one');
    assert.match((problem as Error).message, /does not implement Ed25519/);
  }
});
