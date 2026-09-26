import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InspectError,
  MAX_DER_BYTES,
  MAX_DER_DEPTH,
  MAX_DER_NODES,
  MAX_PEM_BLOCKS,
  TAG,
  bitLength,
  certFingerprints,
  decodePem,
  describeValidity,
  integerToDecimal,
  nodeBytes,
  oidName,
  oidToString,
  parseAsn1String,
  parseAsn1Time,
  parseCertificate,
  parseDer,
  parsePemCertificates,
  parseSshPublicKey,
  sshFingerprint,
  toHexColon,
  toHexPlain,
} from './logic.ts';

/*
 * The certificate vectors are real: generated with OpenSSL 3.6.2, and every
 * expectation below is what `openssl x509 -text -fingerprint` printed for them.
 * The SSH vectors are real ssh-keygen keys, and the fingerprints are what
 * `ssh-keygen -lf` printed. Nothing here is this parser checking itself.
 */

/** RSA-2048, self-signed, serial 0x0badc0de0badc0de, six SANs. */
const RSA_PEM = `-----BEGIN CERTIFICATE-----
MIIEIjCCAwqgAwIBAgIIC63A3gutwN4wDQYJKoZIhvcNAQELBQAwZjELMAkGA1UE
BhMCVFcxDzANBgNVBAgMBlRhaXBlaTEbMBkGA1UECgwSSW5zdHJ1bWVudCBDYWJp
bmV0MQ4wDAYDVQQLDAVUb29sczEZMBcGA1UEAwwQdG9vbHMuZXhhbXBsZS50dzAe
Fw0yNDAxMTUwOTAwMDBaFw0zNDAxMTIwOTAwMDBaMGYxCzAJBgNVBAYTAlRXMQ8w
DQYDVQQIDAZUYWlwZWkxGzAZBgNVBAoMEkluc3RydW1lbnQgQ2FiaW5ldDEOMAwG
A1UECwwFVG9vbHMxGTAXBgNVBAMMEHRvb2xzLmV4YW1wbGUudHcwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDNE/FdkrRSr6+6NwbTdVr8/8LGQtvGFjhZ
WmdMZcdVw3x4uTxY+RN2oCtPBPW3tJH9awx0fAnJFa9mz7Y/3tMpY6wAy4T3kUyk
QC6WAu/8b/eyZ4k1nkRrBj2IO6Uqb56xz3rHqUhhwlxZx0g9mwedjEIjP9Zi2Uox
S6uByON/fhjOcFlchWUoKU7OLhCasl6FsK+KKNT+WGppPKJn4p5NM35D1xucaU6n
NIGF45dM54RJUEtLLC2CedHvQ/YQe69vdHZWefLTYgK+a2JrfEL09H7sEo09U/3F
a1Sx/Wwem8FP21OQs3dSONYIFVnsbk2FqIHgFE+ERjLTSL85knrhAgMBAAGjgdMw
gdAwDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCBaAwHQYDVR0lBBYwFAYIKwYB
BQUHAwEGCCsGAQUFBwMCMHIGA1UdEQRrMGmCEHRvb2xzLmV4YW1wbGUudHeCEiou
dG9vbHMuZXhhbXBsZS50d4cEwAACCocQIAENuAAAAAAAAAAAAAAAAYEOb3BzQGV4
YW1wbGUudHeGGWh0dHBzOi8vdG9vbHMuZXhhbXBsZS50dy8wHQYDVR0OBBYEFMpo
gAXo99tIi/S+XJeiEX6027/xMA0GCSqGSIb3DQEBCwUAA4IBAQA4omIeZPtfbm3/
3pKnmtS4ImZcVmqWPckFLAnOznyFbHj8FecdQAC5Ci/f5TdPnQJHz9H9XYLTg6BU
1xpK6uzLiENOcvSieg9NazZQSj2iijwkPK1Tw+I9Kj6FUxmwv9cWeTWFxTksJB5+
cia0dehCu8KPrHE1Zkbllz7sdLxSm+FqoZ1fkMRhLk6OG+Vj0azRi4MUl+VuImwY
HJK8MyodWudRxrrvH+46Q9u3kciazhkHOLy15Z+//0ls8W4osY4grcIiRRoLuj5L
ABp+/8AlgdTkQtADkbu6F5tGqL76abeUCAoDFZBHKqPyfJSnfzM8Q3qePKY8mqW1
PEHOcLnw
-----END CERTIFICATE-----`;

/** EC P-256, ecdsa-with-SHA256, serial 42, one-year validity. */
const EC_PEM = `-----BEGIN CERTIFICATE-----
MIICjzCCAjWgAwIBAgIBKjAKBggqhkjOPQQDAjBmMQswCQYDVQQGEwJUVzEPMA0G
A1UECAwGVGFpcGVpMRswGQYDVQQKDBJJbnN0cnVtZW50IENhYmluZXQxDjAMBgNV
BAsMBVRvb2xzMRkwFwYDVQQDDBB0b29scy5leGFtcGxlLnR3MB4XDTI1MDMwMTAw
MDAwMFoXDTI2MDMwMTAwMDAwMFowZjELMAkGA1UEBhMCVFcxDzANBgNVBAgMBlRh
aXBlaTEbMBkGA1UECgwSSW5zdHJ1bWVudCBDYWJpbmV0MQ4wDAYDVQQLDAVUb29s
czEZMBcGA1UEAwwQdG9vbHMuZXhhbXBsZS50dzBZMBMGByqGSM49AgEGCCqGSM49
AwEHA0IABKybPT1oGcsPcC1EXsG2WySluPGQfwLYQ87nkNa7vEYGHvLQflJ1GHdy
nbY6QqWmoyU77khyJ7P/wukGTkGCgj2jgdMwgdAwDAYDVR0TAQH/BAIwADAOBgNV
HQ8BAf8EBAMCBaAwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMHIGA1Ud
EQRrMGmCEHRvb2xzLmV4YW1wbGUudHeCEioudG9vbHMuZXhhbXBsZS50d4cEwAAC
CocQIAENuAAAAAAAAAAAAAAAAYEOb3BzQGV4YW1wbGUudHeGGWh0dHBzOi8vdG9v
bHMuZXhhbXBsZS50dy8wHQYDVR0OBBYEFGfmuyUofB399CIiV/pf6wzuDFieMAoG
CCqGSM49BAMCA0gAMEUCIE+rRCkcl991FW4vEeZ6So6kv7bkE0vWF/mTFNXo6pTl
AiEAgaoohbMFu+ukd9D5cq+2Oy1iVN007m5dF6DbboHfloA=
-----END CERTIFICATE-----`;

const ED25519_LINE =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOcWiepWenxLqQygKMhGPqzUa3atPFPp7zRYyP3MZ7C4 binbin@bench';
const RSA_SSH_LINE =
  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDd1xIgu65tNoekqCZW5Uoo3n3tR3FSPKpSHvGLuR0FoLBhtIrKJcTlhDc5eR61y0r12QTnfCTWwbagxQo3zb2p/tYKWaT0HE+YVV125j50YchAOkP+xQbIIDPS4EcVgIhSrkzeIPmb2a0GZ9GDODODy+/P+/Q0FryWSpQrwhyaxBX0aqeIpXu11b/saOjwqooOEp3i0KSeC3nrfPvmwlithSa1gr+WuWH7eUdkNElodlYFw7MdFBGb+w87RIJeh7Qvev8L7Y2YkdfLkSzdmmlEu+sXmVjpacPa1FERNdwZxiDklEL77jOHZLcSxg7s+CAnjvWnNp6X12e+s7c97PsT ops@gate';
const ECDSA_LINE =
  'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBKgfzRaGYJz3ic8VYMyM93P1F3Y9JsDcKIP3atJbgezmMCW4qdqs7hf8mn6o5tihtP6d9itRs17vXUa8VRr8mA8= ec@bench';

/* ── helpers ───────────────────────────────── */

const der = (hex: string) => Uint8Array.from(hex.replace(/\s+/g, '').match(/../g)!.map((b) => Number.parseInt(b, 16)));

const b64 = (data: Uint8Array) => {
  let raw = '';
  for (const byte of data) raw += String.fromCharCode(byte);
  return btoa(raw);
};

/** Length-prefixed SSH strings, the wire format of a public-key blob. */
const sshBlob = (parts: (string | Uint8Array)[]) => {
  const chunks = parts.map((part) =>
    typeof part === 'string' ? Uint8Array.from(part, (c) => c.charCodeAt(0)) : part
  );
  const total = chunks.reduce((n, chunk) => n + 4 + chunk.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out[at] = (chunk.length >>> 24) & 0xff;
    out[at + 1] = (chunk.length >>> 16) & 0xff;
    out[at + 2] = (chunk.length >>> 8) & 0xff;
    out[at + 3] = chunk.length & 0xff;
    out.set(chunk, at + 4);
    at += 4 + chunk.length;
  }
  return out;
};

const code = (expected: string) => (error: unknown) => {
  assert.ok(error instanceof InspectError, `expected InspectError, got ${String(error)}`);
  assert.equal(error.code, expected);
  return true;
};

/* ── hex ───────────────────────────────────── */

test('hex helpers print the two forms certificates are quoted in', () => {
  assert.equal(toHexColon(der('00ff0a')), '00:FF:0A');
  assert.equal(toHexColon(new Uint8Array(0)), '');
  assert.equal(toHexPlain(der('00ff0a')), '00ff0a');
  assert.equal(toHexPlain(new Uint8Array(0)), '');
});

/* ── DER ───────────────────────────────────── */

test('parseDer reads a nested SEQUENCE and reports every offset', () => {
  // SEQUENCE { INTEGER 1, SEQUENCE { NULL }, OCTET STRING 'ab' }
  const node = parseDer(der('30 0b 02 01 01 30 02 05 00 04 02 61 62'));
  assert.equal(node.cls, 'universal');
  assert.equal(node.tag, TAG.sequence);
  assert.equal(node.constructed, true);
  assert.equal(node.headerLength, 2);
  assert.equal(node.children.length, 3);
  assert.equal(integerToDecimal(node.children[0].content), '1');
  assert.equal(node.children[1].children[0].tag, TAG.null);
  assert.equal(node.children[1].children[0].content.length, 0);
  assert.deepEqual(Array.from(node.children[2].content), [0x61, 0x62]);
  assert.equal(node.children[2].offset, 9);
});

test('parseDer reads long-form lengths and context tags', () => {
  // OCTET STRING of 200 bytes: 04 81 c8 ...
  const body = new Uint8Array(200).fill(0x41);
  const bytes = new Uint8Array(3 + 200);
  bytes.set([0x04, 0x81, 0xc8]);
  bytes.set(body, 3);
  const node = parseDer(bytes);
  assert.equal(node.content.length, 200);
  assert.equal(node.headerLength, 3);

  // [0] EXPLICIT INTEGER 2 — the version field of a v3 certificate.
  const context = parseDer(der('a0 03 02 01 02'));
  assert.equal(context.cls, 'context');
  assert.equal(context.tag, 0);
  assert.equal(integerToDecimal(context.children[0].content), '2');

  // High tag number form: [31] primitive, empty.
  const high = parseDer(der('9f 1f 00'));
  assert.equal(high.cls, 'context');
  assert.equal(high.tag, 31);
});

test('parseDer refuses the encodings that hide a wrong reading', () => {
  assert.throws(() => parseDer(new Uint8Array(0)), code('empty'));
  assert.throws(() => parseDer(der('30 80 05 00 00 00')), code('indefinite-length'));
  assert.throws(() => parseDer(der('04 ff 00')), code('reserved-length'));
  assert.throws(() => parseDer(der('04 85 01 01 01 01 01')), code('length-too-long'));
  assert.throws(() => parseDer(der('04 05 61 62')), code('truncated'));
  assert.throws(() => parseDer(der('30')), code('truncated'));
  assert.throws(() => parseDer(der('05 00 05 00')), code('trailing-bytes'));
  // A child that runs past its parent is truncation, not a sibling.
  assert.throws(() => parseDer(der('30 03 04 05 61 62 63')), code('truncated'));
  // Tag number spread over more than four continuation bytes.
  assert.throws(() => parseDer(der('9f ff ff ff ff 7f 00')), code('tag-too-long'));
});

test('parseDer caps depth and node count instead of freezing', () => {
  const wrap = (times: number) => {
    let bytes = der('05 00');
    for (let i = 0; i < times; i += 1) {
      const next = new Uint8Array(bytes.length + 2);
      next.set([0x30, bytes.length]);
      next.set(bytes, 2);
      bytes = next;
    }
    return bytes;
  };
  assert.equal(parseDer(wrap(MAX_DER_DEPTH - 1)).tag, TAG.sequence);
  assert.throws(() => parseDer(wrap(MAX_DER_DEPTH + 2)), code('too-deep'));

  // A SEQUENCE of one NULL per two bytes: cheap to write, unbounded to walk.
  const count = MAX_DER_NODES + 5;
  const body = new Uint8Array(count * 2);
  for (let i = 0; i < count; i += 1) body[i * 2] = 0x05;
  const bytes = new Uint8Array(4 + body.length);
  bytes.set([0x30, 0x82, (body.length >> 8) & 0xff, body.length & 0xff]);
  bytes.set(body, 4);
  assert.throws(() => parseDer(bytes), code('too-many-nodes'));

  assert.throws(() => parseDer(new Uint8Array(MAX_DER_BYTES + 1)), code('too-large'));
});

test('nodeBytes returns the value with its header, which is what gets hashed', () => {
  const bytes = der('30 05 04 03 61 62 63');
  const node = parseDer(bytes);
  assert.deepEqual(Array.from(nodeBytes(bytes, node)), Array.from(bytes));
  assert.deepEqual(Array.from(nodeBytes(bytes, node.children[0])), [0x04, 0x03, 0x61, 0x62, 0x63]);
});

/* ── primitives ────────────────────────────── */

test('integerToDecimal handles two complement and serials past 2^53', () => {
  assert.equal(integerToDecimal(der('00')), '0');
  assert.equal(integerToDecimal(der('01')), '1');
  assert.equal(integerToDecimal(der('7f')), '127');
  assert.equal(integerToDecimal(der('0080')), '128');
  assert.equal(integerToDecimal(der('ff')), '-1');
  assert.equal(integerToDecimal(der('80')), '-128');
  assert.equal(integerToDecimal(der('ff7f')), '-129');
  // The RSA vector's serial, as openssl prints it.
  assert.equal(integerToDecimal(der('0badc0de0badc0de')), '841540765299359966');
  assert.equal(integerToDecimal(der('00' + 'ff'.repeat(16))), (2n ** 128n - 1n).toString());
  assert.throws(() => integerToDecimal(new Uint8Array(0)), code('bad-integer'));
});

test('bitLength measures a modulus the way a key size is quoted', () => {
  assert.equal(bitLength(new Uint8Array(0)), 0);
  assert.equal(bitLength(der('00')), 0);
  assert.equal(bitLength(der('01')), 1);
  assert.equal(bitLength(der('ff')), 8);
  assert.equal(bitLength(der('0100')), 9);
  // A 2048-bit modulus is 257 bytes on the wire: a zero pad plus 256.
  assert.equal(bitLength(new Uint8Array([0, ...new Uint8Array(256).fill(0xff)])), 2048);
});

test('oidToString decodes the arcs, including the first packed pair', () => {
  assert.equal(oidToString(der('2a864886f70d01010b')), '1.2.840.113549.1.1.11');
  assert.equal(oidToString(der('551d11')), '2.5.29.17');
  assert.equal(oidToString(der('2b06010505070301')), '1.3.6.1.5.5.7.3.1');
  assert.equal(oidToString(der('2a8648ce3d030107')), '1.2.840.10045.3.1.7');
  assert.equal(oidToString(der('2b6570')), '1.3.101.112');
  // Arc 0 and arc 1 both live under 40; 2.999 needs the multi-byte form.
  assert.equal(oidToString(der('00')), '0.0');
  assert.equal(oidToString(der('27')), '0.39');
  assert.equal(oidToString(der('28')), '1.0');
  assert.equal(oidToString(der('8837')), '2.999');
  assert.throws(() => oidToString(new Uint8Array(0)), code('bad-oid'));
  assert.throws(() => oidToString(der('2a86')), code('bad-oid'));
  assert.throws(() => oidToString(new Uint8Array(20).fill(0x80)), code('bad-oid'));
});

test('parseAsn1String decodes each string type X.509 uses', () => {
  const text = (hex: string) => parseAsn1String(parseDer(der(hex)));
  assert.equal(text('13 04 54 65 73 74'), 'Test'); // PrintableString
  assert.equal(text('16 03 61 40 62'), 'a@b'); // IA5String
  assert.equal(text('0c 09 e5 8f b0 e5 8c 97 e5 b8 82'), '台北市'); // UTF8String
  assert.equal(text('0c 04 f0 9f 99 88'), '\u{1f648}'); // emoji, four bytes
  assert.equal(text('1e 04 53 f0 53 17'), '台北'); // BMPString, UTF-16BE
  assert.equal(text('1c 04 00 01 f6 00'), '\u{1f600}'); // UniversalString, UTF-32BE
  assert.equal(text('14 03 41 e9 42'), 'AéB'); // T61String read as Latin-1
  assert.throws(() => text('0c 02 c3 28'), code('bad-string')); // invalid UTF-8
  assert.throws(() => text('1e 03 53 f0 53'), code('bad-string')); // odd BMPString
  assert.throws(() => text('02 01 05'), code('bad-string')); // INTEGER is not text
});

test('parseAsn1Time normalises both time types to UTC', () => {
  const time = (hex: string) => parseAsn1Time(parseDer(der(hex)));
  // UTCTime 240115090000Z — the RSA vector's notBefore.
  assert.equal(time('17 0d 323430313135303930303030 5a').iso, '2024-01-15T09:00:00Z');
  assert.equal(time('17 0d 323430313135303930303030 5a').epochMs, Date.UTC(2024, 0, 15, 9, 0, 0));
  // RFC 5280 §4.1.2.5.1: 50-99 is the 1900s.
  assert.equal(time('17 0d 393530313031303030303030 5a').iso, '1995-01-01T00:00:00Z');
  assert.equal(time('17 0d 343930313031303030303030 5a').iso, '2049-01-01T00:00:00Z');
  // Seconds are optional in UTCTime, and an offset is normalised away.
  assert.equal(time('17 0b 32343031313530393030 5a').iso, '2024-01-15T09:00:00Z');
  assert.equal(time('17 11 323430313135303930303030 2b 30383030').iso, '2024-01-15T01:00:00Z');
  // GeneralizedTime, with and without a fraction.
  assert.equal(time('18 0f 3230323430313135303930303030 5a').iso, '2024-01-15T09:00:00Z');
  assert.equal(time('18 13 3230323430313135303930303030 2e 353030 5a').iso, '2024-01-15T09:00:00Z');
  assert.equal(time('18 0f 3230393930313031303030303030'.replace(' ', '') + '5a').iso, '2099-01-01T00:00:00Z');
  // February 30th is not an instant, and Date.UTC would happily roll it over.
  assert.throws(() => time('17 0d 323430323330303930303030 5a'), code('bad-time'));
  assert.throws(() => time('17 0d 323430313135303930303030 58'), code('bad-time')); // 'X' zone
  assert.throws(() => time('17 05 3234303131'), code('bad-time'));
  assert.throws(() => time('04 0d 323430313135303930303030 5a'), code('unexpected-tag'));
});

test('oidName answers for the table and stays quiet outside it', () => {
  assert.equal(oidName('1.2.840.113549.1.1.11'), 'sha256WithRSAEncryption');
  assert.equal(oidName('2.5.29.17'), 'subjectAltName');
  assert.equal(oidName('1.3.101.112'), 'Ed25519');
  assert.equal(oidName('1.2.3.4.5.6.7.8'), '');
});

/* ── PEM ───────────────────────────────────── */

test('decodePem takes every block in order', () => {
  const blocks = decodePem(`noise before\n${RSA_PEM}\nnoise between\n${EC_PEM}\ntrailing`);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((block) => block.label), ['CERTIFICATE', 'CERTIFICATE']);
  assert.equal(blocks[0].der.length, 1062);
  assert.equal(blocks[1].der.length, 659);
});

test('decodePem refuses the inputs that are not ours to read', () => {
  assert.throws(() => decodePem('just some text'), code('no-pem'));
  assert.throws(
    () => decodePem('-----BEGIN CERTIFICATE-----\nAAAA\n-----END PUBLIC KEY-----'),
    code('label-mismatch')
  );
  assert.throws(
    () => decodePem('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'),
    code('private-key')
  );
  assert.throws(
    () => decodePem('-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----'),
    code('private-key')
  );
  assert.throws(
    () => decodePem('-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----'),
    code('bad-base64')
  );
  const many = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n'.repeat(MAX_PEM_BLOCKS + 1);
  assert.throws(() => decodePem(many), code('too-many-blocks'));
});

test('parsePemCertificates rejects a block that is not a certificate', () => {
  assert.throws(
    () => parsePemCertificates('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----'),
    code('not-a-certificate')
  );
  assert.equal(parsePemCertificates(`${RSA_PEM}\n${EC_PEM}`).length, 2);
});

/* ── certificates ──────────────────────────── */

test('the RSA certificate reads exactly as openssl prints it', () => {
  const [cert] = parsePemCertificates(RSA_PEM);
  assert.equal(cert.version, 3);
  assert.equal(cert.serialHex, '0B:AD:C0:DE:0B:AD:C0:DE');
  assert.equal(cert.serialDecimal, '841540765299359966');
  assert.equal(cert.signatureAlgorithm.oid, '1.2.840.113549.1.1.11');
  assert.equal(cert.signatureAlgorithm.name, 'sha256WithRSAEncryption');
  assert.equal(cert.tbsSignatureAlgorithm.oid, cert.signatureAlgorithm.oid);
  assert.equal(cert.signatureBits, 2048);
  assert.equal(
    cert.subject.text,
    'C=TW, ST=Taipei, O=Instrument Cabinet, OU=Tools, CN=tools.example.tw'
  );
  assert.equal(cert.issuer.text, cert.subject.text);
  assert.equal(cert.selfIssued, true);
  assert.deepEqual(
    cert.subject.rdns.map((rdn) => `${rdn.label}:${rdn.oid}`),
    ['C:2.5.4.6', 'ST:2.5.4.8', 'O:2.5.4.10', 'OU:2.5.4.11', 'CN:2.5.4.3']
  );
  assert.equal(cert.notBefore.iso, '2024-01-15T09:00:00Z');
  assert.equal(cert.notAfter.iso, '2034-01-12T09:00:00Z');
  assert.equal(cert.publicKey.name, 'rsaEncryption');
  assert.equal(cert.publicKey.bits, 2048);
  assert.equal(cert.publicKey.exponent, '65537');
  assert.equal(cert.publicKey.curve, null);
  assert.equal(cert.publicKey.spki.length, 294);
  assert.deepEqual(cert.sans, [
    { kind: 'dns', value: 'tools.example.tw' },
    { kind: 'dns', value: '*.tools.example.tw' },
    { kind: 'ip', value: '192.0.2.10' },
    { kind: 'ip', value: '2001:db8::1' },
    { kind: 'email', value: 'ops@example.tw' },
    { kind: 'uri', value: 'https://tools.example.tw/' },
  ]);
  assert.deepEqual(cert.basicConstraints, { ca: false, pathLen: null });
  assert.deepEqual(cert.keyUsage, ['digitalSignature', 'keyEncipherment']);
  assert.deepEqual(
    cert.extKeyUsage.map((purpose) => purpose.name),
    ['serverAuth', 'clientAuth']
  );
  assert.equal(cert.subjectKeyId, 'CA:68:80:05:E8:F7:DB:48:8B:F4:BE:5C:97:A2:11:7E:B4:DB:BF:F1');
  assert.equal(cert.authorityKeyId, null);
  assert.equal(cert.extensions.length, 5);
  assert.deepEqual(
    cert.extensions.map((extension) => [extension.name, extension.critical]),
    [
      ['basicConstraints', true],
      ['keyUsage', true],
      ['extKeyUsage', false],
      ['subjectAltName', false],
      ['subjectKeyIdentifier', false],
    ]
  );
});

test('the EC certificate reports its curve rather than a key size guess', () => {
  const [cert] = parsePemCertificates(EC_PEM);
  assert.equal(cert.serialDecimal, '42');
  assert.equal(cert.serialHex, '2A');
  assert.equal(cert.signatureAlgorithm.name, 'ecdsa-with-SHA256');
  assert.equal(cert.publicKey.name, 'id-ecPublicKey');
  assert.equal(cert.publicKey.curve, 'prime256v1 (P-256)');
  assert.equal(cert.publicKey.bits, 256);
  assert.equal(cert.publicKey.exponent, null);
  assert.equal(cert.notBefore.iso, '2025-03-01T00:00:00Z');
  assert.equal(cert.notAfter.iso, '2026-03-01T00:00:00Z');
  assert.equal(cert.subjectKeyId, '67:E6:BB:25:28:7C:1D:FD:F4:22:22:57:FA:5F:EB:0C:EE:0C:58:9E');
});

test('parseCertificate reports the field it choked on', () => {
  const [block] = decodePem(RSA_PEM);
  // A NULL is a complete DER value but not a Certificate.
  assert.throws(() => parseCertificate(der('05 00')), code('unexpected-tag'));
  // Two-field SEQUENCE: tbsCertificate without a signature.
  assert.throws(() => parseCertificate(der('30 06 30 02 05 00 05 00')), code('unexpected-tag'));
  // Truncated DER never reaches the field walk.
  assert.throws(() => parseCertificate(block.der.subarray(0, 400)), code('truncated'));
  // An OCTET STRING where the serial INTEGER belongs.
  const broken = Uint8Array.from(block.der);
  broken[13] = 0x04; // the serial's INTEGER tag
  assert.throws(() => parseCertificate(broken), code('unexpected-tag'));
});

test('describeValidity places a certificate against a clock the caller owns', () => {
  const [cert] = parsePemCertificates(EC_PEM);
  assert.deepEqual(describeValidity(cert, Date.UTC(2024, 0, 1)), {
    state: 'not-yet',
    days: 425,
    lifetimeDays: 365,
  });
  assert.deepEqual(describeValidity(cert, Date.UTC(2025, 2, 2)), {
    state: 'valid',
    days: 364,
    lifetimeDays: 365,
  });
  assert.deepEqual(describeValidity(cert, Date.UTC(2026, 2, 11)), {
    state: 'expired',
    days: 10,
    lifetimeDays: 365,
  });
  // The boundaries themselves are inside the window.
  assert.equal(describeValidity(cert, cert.notBefore.epochMs).state, 'valid');
  assert.equal(describeValidity(cert, cert.notAfter.epochMs).state, 'valid');
  assert.equal(describeValidity(cert, cert.notAfter.epochMs + 1).state, 'expired');
});

test('certFingerprints matches openssl -fingerprint and the pin-sha256 value', async () => {
  const [rsa] = parsePemCertificates(RSA_PEM);
  assert.deepEqual(await certFingerprints(rsa), {
    sha256: '8C:5F:2D:EF:7D:D4:A3:4E:85:36:BD:BD:0B:C4:81:FB:B1:8C:DB:E4:98:27:5A:24:D9:FE:75:B1:4B:23:9E:5C',
    sha1: 'B9:63:1E:00:C2:45:C3:19:BC:8F:F9:0A:B8:2C:CA:29:D1:4A:94:6A',
    spkiPin: 'WuIb166JKIMRFxQp64Oo+gQgWTp7jpbZsyKrXW1C77s=',
  });
  const [ec] = parsePemCertificates(EC_PEM);
  const ecPrints = await certFingerprints(ec);
  assert.equal(
    ecPrints.sha256,
    '0A:C1:0A:FC:83:5E:FE:BB:4B:31:C5:AF:E1:37:8B:26:57:F7:85:C3:67:04:B3:72:44:4B:41:72:83:78:EB:BB'
  );
  assert.equal(ecPrints.spkiPin, 'vlFrnYNymYuUmpZAxnMvG8HMlRp9SXb1yIfnvgrJSPc=');
});

/* ── SSH ───────────────────────────────────── */

test('parseSshPublicKey reads the three key types in common use', () => {
  const ed = parseSshPublicKey(ED25519_LINE);
  assert.equal(ed.algorithm, 'ssh-ed25519');
  assert.equal(ed.blobAlgorithm, 'ssh-ed25519');
  assert.equal(ed.bits, 256);
  assert.equal(ed.curve, null);
  assert.equal(ed.comment, 'binbin@bench');
  assert.equal(ed.options, '');
  assert.deepEqual(ed.fields, [
    { name: 'algorithm', size: 11 },
    { name: 'key', size: 32 },
  ]);

  const rsa = parseSshPublicKey(RSA_SSH_LINE);
  assert.equal(rsa.bits, 2048);
  assert.equal(rsa.comment, 'ops@gate');
  assert.deepEqual(rsa.fields.map((field) => field.name), ['algorithm', 'e', 'n']);

  const ec = parseSshPublicKey(ECDSA_LINE);
  assert.equal(ec.bits, 256);
  assert.equal(ec.curve, 'nistp256');
  assert.equal(ec.comment, 'ec@bench');
});

test('parseSshPublicKey takes authorized_keys options and multi-word comments', () => {
  const key = parseSshPublicKey(`no-pty,no-agent-forwarding ${ED25519_LINE} extra words`);
  assert.equal(key.options, 'no-pty,no-agent-forwarding');
  assert.equal(key.comment, 'binbin@bench extra words');
  // Leading blank lines and trailing whitespace are normal in a pasted file.
  assert.equal(parseSshPublicKey(`\n\n  ${ED25519_LINE}  \n`).bits, 256);
});

test('parseSshPublicKey refuses a blob that is not what the line claims', () => {
  assert.throws(() => parseSshPublicKey(''), code('ssh-bad-line'));
  assert.throws(() => parseSshPublicKey('ssh-magic AAAA test'), code('ssh-bad-line'));
  assert.throws(() => parseSshPublicKey('ssh-ed25519'), code('ssh-bad-line'));

  // The line says RSA, the blob says Ed25519.
  const swapped = ED25519_LINE.replace('ssh-ed25519', 'ssh-rsa');
  assert.throws(() => parseSshPublicKey(swapped), code('ssh-blob-mismatch'));

  // A curve name that contradicts the algorithm.
  const wrongCurve = `ecdsa-sha2-nistp256 ${b64(sshBlob(['ecdsa-sha2-nistp256', 'nistp384', new Uint8Array(97)]))} x`;
  assert.throws(() => parseSshPublicKey(wrongCurve), code('ssh-blob-mismatch'));

  // A length prefix that runs past the end of the blob.
  const truncated = b64(Uint8Array.from([0, 0, 0, 11, ...Uint8Array.from('ssh-ed25519', (c) => c.charCodeAt(0)), 0, 0, 0, 32, 1, 2, 3]));
  assert.throws(() => parseSshPublicKey(`ssh-ed25519 ${truncated} x`), code('ssh-truncated'));

  // An Ed25519 key of the wrong size is not an Ed25519 key.
  const shortKey = b64(sshBlob(['ssh-ed25519', new Uint8Array(16)]));
  assert.throws(() => parseSshPublicKey(`ssh-ed25519 ${shortKey} x`), code('ssh-truncated'));

  assert.throws(() => parseSshPublicKey('ssh-ed25519 @@@@ x'), code('bad-base64'));
});

test('sshFingerprint matches ssh-keygen -lf', async () => {
  const ed = await sshFingerprint(parseSshPublicKey(ED25519_LINE).blob);
  assert.equal(ed.sha256, 'SHA256:4dbHkskXwQGLrzsX5qIDsy+5+YI2D+B/EpXf6Z8QH3g');
  const rsa = await sshFingerprint(parseSshPublicKey(RSA_SSH_LINE).blob);
  assert.equal(rsa.sha256, 'SHA256:xFk7lPuumYTtuNWlio+T/kNT7XYWqqPblJIOdVtTWKk');
  const ec = await sshFingerprint(parseSshPublicKey(ECDSA_LINE).blob);
  assert.equal(ec.sha256, 'SHA256:OedX2w4wQIuiKJiGrPcSSlst0XxuGgUZUZyF4jW6MUQ');
  // OpenSSH prints these unpadded; base64 of 32 and 64 bytes would both pad.
  assert.equal(ed.sha256.endsWith('='), false);
  assert.equal(ed.sha512.startsWith('SHA512:'), true);
  assert.equal(ed.sha512.endsWith('='), false);
});
