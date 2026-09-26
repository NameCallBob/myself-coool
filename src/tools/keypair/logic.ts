/**
 * Key pairs from WebCrypto, exported into the formats other tools expect.
 *
 * Generation is `crypto.subtle.generateKey` — the browser's own
 * implementation, using the platform CSPRNG. What this file adds is the
 * paperwork around it, which is where the confusion actually lives:
 *
 *  - **PEM is not a format, it is a wrapper.** The bytes inside a
 *    `-----BEGIN PUBLIC KEY-----` block are DER-encoded SubjectPublicKeyInfo;
 *    inside `-----BEGIN PRIVATE KEY-----` they are PKCS#8. The older
 *    `BEGIN RSA PRIVATE KEY` header means something different (PKCS#1, no
 *    algorithm identifier), which is why a key that "looks like a PEM" can
 *    still be rejected by the tool you paste it into. The label is emitted
 *    and checked rather than ignored.
 *  - **A fingerprint is a hash of a specific encoding.** The SHA-256 you see
 *    in an SSH client is over the SSH wire format of the public key; the one
 *    openssl prints is over the DER SubjectPublicKeyInfo. Those two differ
 *    for the same key, so both are shown, each labelled with what it hashed.
 *  - **A JWK thumbprint (RFC 7638) is neither of those.** It hashes a
 *    canonical JSON object containing only the required members, in
 *    lexicographic order, with no whitespace — which is the only way two
 *    implementations agree on a JSON hash.
 *
 * The private key exists in this page's memory and nowhere else: nothing is
 * stored, and a reload loses it. That is the honest property of a browser
 * tool, and also the reason to treat what it produces as disposable unless
 * you save it deliberately.
 */

export type RsaKind = {
  family: 'rsa';
  algorithm: 'RSASSA-PKCS1-v1_5' | 'RSA-PSS' | 'RSA-OAEP';
  modulusBits: number;
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
};

export type EcKind = {
  family: 'ec';
  algorithm: 'ECDSA' | 'ECDH';
  curve: 'P-256' | 'P-384' | 'P-521';
};

export type EdKind = { family: 'ed25519'; algorithm: 'Ed25519' };

export type KeyKind = RsaKind | EcKind | EdKind;

export const RSA_SIZES = [2048, 3072, 4096];
export const EC_CURVES: EcKind['curve'][] = ['P-256', 'P-384', 'P-521'];

/** 65537: the standard public exponent, and the only one worth offering. */
const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);

export class UnsupportedKey extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedKey';
  }
}

export class BadPem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadPem';
  }
}

/* ── Bytes ────────────────────────────────── */
/** Local copies — the test runner does not resolve the `@/` alias. */

export function toBase64(data: Uint8Array): string {
  let raw = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) raw += String.fromCharCode(...data.subarray(i, i + CHUNK));
  return btoa(raw);
}

export function fromBase64(text: string): Uint8Array {
  let b64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 1) throw new BadPem('not a valid base64 length');
  if (pad) b64 += '='.repeat(4 - pad);
  let raw: string;
  try {
    raw = atob(b64);
  } catch {
    throw new BadPem('the body is not valid base64');
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function toBase64Url(data: Uint8Array): string {
  return toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toHex(data: Uint8Array, separator = ''): string {
  const digits = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < data.length; i += 1) {
    out += digits[data[i] >> 4] + digits[data[i] & 15];
    if (separator && i < data.length - 1) out += separator;
  }
  return out;
}

/* ── PEM ──────────────────────────────────── */

/** RFC 7468: 64-character lines between `-----BEGIN label-----` markers. */
export function pemEncode(label: string, der: Uint8Array): string {
  const body = toBase64(der).replace(/(.{64})/g, '$1\n').trimEnd();
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

/**
 * Reads a PEM block. The label is returned rather than assumed: handing
 * PKCS#1 bytes to something expecting PKCS#8 is the commonest key-import
 * failure, and it is only diagnosable if the label was read.
 */
export function pemDecode(text: string, expectedLabel?: string): { label: string; der: Uint8Array } {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text.trim());
  if (!match) throw new BadPem('no -----BEGIN … ----- block found');
  const label = match[1].trim();
  if (expectedLabel && label !== expectedLabel) {
    throw new BadPem(`this block is "${label}", not "${expectedLabel}"`);
  }
  return { label, der: fromBase64(match[2]) };
}

export const PUBLIC_LABEL = 'PUBLIC KEY';
export const PRIVATE_LABEL = 'PRIVATE KEY';

/* ── Generation ───────────────────────────── */

type Params = { params: Algorithm | RsaHashedKeyGenParams | EcKeyGenParams; usages: KeyUsage[] };

export function webCryptoParams(kind: KeyKind): Params {
  if (kind.family === 'rsa') {
    if (!RSA_SIZES.includes(kind.modulusBits)) {
      throw new UnsupportedKey(`RSA ${kind.modulusBits} is not offered — use ${RSA_SIZES.join(', ')}`);
    }
    return {
      params: {
        name: kind.algorithm,
        modulusLength: kind.modulusBits,
        publicExponent: PUBLIC_EXPONENT,
        hash: kind.hash,
      } as RsaHashedKeyGenParams,
      usages: kind.algorithm === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'],
    };
  }
  if (kind.family === 'ec') {
    return {
      params: { name: kind.algorithm, namedCurve: kind.curve } as EcKeyGenParams,
      usages: kind.algorithm === 'ECDH' ? ['deriveKey', 'deriveBits'] : ['sign', 'verify'],
    };
  }
  return { params: { name: 'Ed25519' }, usages: ['sign', 'verify'] };
}

export async function generatePair(kind: KeyKind): Promise<CryptoKeyPair> {
  const { params, usages } = webCryptoParams(kind);
  try {
    // Extractable: the whole point is to export it. A key you cannot export
    // is the right default everywhere else, and wrong here.
    return (await crypto.subtle.generateKey(params, true, usages)) as CryptoKeyPair;
  } catch (problem) {
    if (kind.family === 'ed25519') {
      throw new UnsupportedKey(
        'this browser does not implement Ed25519 in WebCrypto — pick ECDSA P-256 instead'
      );
    }
    throw new UnsupportedKey(problem instanceof Error ? problem.message : String(problem));
  }
}

/* ── Export ───────────────────────────────── */

export type Exported = {
  publicPem: string;
  privatePem: string;
  publicJwk: string;
  privateJwk: string;
  spki: Uint8Array;
  pkcs8: Uint8Array;
  /** SHA-256 over the DER SubjectPublicKeyInfo, the way openssl prints it. */
  spkiSha256: Uint8Array;
  /** RFC 7638 thumbprint of the public JWK. */
  thumbprint: string;
  /** OpenSSH `authorized_keys` line, where the key type has one. */
  openssh: string | null;
  /** SHA-256 over the SSH wire format, as `ssh-keygen -l` prints it. */
  sshFingerprint: string | null;
};

export async function exportPair(pair: CryptoKeyPair, comment = ''): Promise<Exported> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const privateJwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;

  const spkiSha256 = new Uint8Array(await crypto.subtle.digest('SHA-256', spki as Uint8Array<ArrayBuffer>));
  const wire = sshWireFormat(publicJwk);

  return {
    publicPem: pemEncode(PUBLIC_LABEL, spki),
    privatePem: pemEncode(PRIVATE_LABEL, pkcs8),
    publicJwk: JSON.stringify(publicJwk, null, 2),
    privateJwk: JSON.stringify(privateJwk, null, 2),
    spki,
    pkcs8,
    spkiSha256,
    thumbprint: await jwkThumbprint(publicJwk),
    openssh: wire ? `${wire.type} ${toBase64(wire.blob)}${comment ? ` ${comment}` : ''}` : null,
    sshFingerprint: wire
      ? `SHA256:${toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', wire.blob as Uint8Array<ArrayBuffer>)))}`
      : null,
  };
}

/* ── RFC 7638 thumbprint ──────────────────── */

/**
 * The canonical JSON a thumbprint hashes: only the members RFC 7638 lists as
 * required for the key type, sorted by code point, no whitespace. Anything
 * else — `alg`, `kid`, `ext`, `key_ops` — is excluded by the spec, because
 * otherwise two copies of the same key would thumbprint differently.
 */
export function canonicalJwk(jwk: JsonWebKey): string {
  const required: Record<string, string[]> = {
    RSA: ['e', 'kty', 'n'],
    EC: ['crv', 'kty', 'x', 'y'],
    OKP: ['crv', 'kty', 'x'],
    oct: ['k', 'kty'],
  };
  const members = required[jwk.kty ?? ''];
  if (!members) throw new UnsupportedKey(`cannot thumbprint a "${jwk.kty}" key`);
  const parts = members.map((name) => {
    const value = (jwk as unknown as Record<string, unknown>)[name];
    if (typeof value !== 'string') throw new UnsupportedKey(`the JWK is missing "${name}"`);
    return `${JSON.stringify(name)}:${JSON.stringify(value)}`;
  });
  return `{${parts.join(',')}}`;
}

export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const canonical = new TextEncoder().encode(canonicalJwk(jwk));
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', canonical as Uint8Array<ArrayBuffer>)));
}

/* ── SSH wire format ──────────────────────── */

function sshString(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = (data.length >>> 24) & 0xff;
  out[1] = (data.length >>> 16) & 0xff;
  out[2] = (data.length >>> 8) & 0xff;
  out[3] = data.length & 0xff;
  out.set(data, 4);
  return out;
}

/**
 * An SSH mpint: big-endian, minimal length, and a leading zero byte when the
 * top bit is set — otherwise the value would read as negative.
 */
function sshMpint(value: Uint8Array): Uint8Array {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start += 1;
  const trimmed = value.subarray(start);
  if (trimmed.length > 0 && (trimmed[0] & 0x80) !== 0) {
    const padded = new Uint8Array(trimmed.length + 1);
    padded.set(trimmed, 1);
    return sshString(padded);
  }
  return sshString(trimmed);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string) => new TextEncoder().encode(text);

/**
 * The public key in SSH wire format, for the key types OpenSSH accepts.
 *
 * Returns null for the rest — an RSA-OAEP key is a perfectly good key that
 * has no `authorized_keys` representation, and inventing one would be worse
 * than saying so.
 */
export function sshWireFormat(jwk: JsonWebKey): { type: string; blob: Uint8Array } | null {
  if (jwk.kty === 'RSA' && jwk.n && jwk.e) {
    const type = 'ssh-rsa';
    return {
      type,
      blob: concat([sshString(ascii(type)), sshMpint(fromBase64(jwk.e)), sshMpint(fromBase64(jwk.n))]),
    };
  }
  if (jwk.kty === 'EC' && jwk.crv && jwk.x && jwk.y) {
    const curve = { 'P-256': 'nistp256', 'P-384': 'nistp384', 'P-521': 'nistp521' }[jwk.crv];
    if (!curve) return null;
    const type = `ecdsa-sha2-${curve}`;
    const x = fromBase64(jwk.x);
    const y = fromBase64(jwk.y);
    // Uncompressed point: 0x04 || X || Y, each coordinate at the curve's
    // full width, which is what the JWK already guarantees.
    const point = concat([new Uint8Array([0x04]), x, y]);
    return { type, blob: concat([sshString(ascii(type)), sshString(ascii(curve)), sshString(point)]) };
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && jwk.x) {
    const type = 'ssh-ed25519';
    return { type, blob: concat([sshString(ascii(type)), sshString(fromBase64(jwk.x))]) };
  }
  return null;
}

/* ── Describing a key ─────────────────────── */

export function describeKind(kind: KeyKind): string {
  if (kind.family === 'rsa') return `${kind.algorithm} ${kind.modulusBits}-bit (${kind.hash})`;
  if (kind.family === 'ec') return `${kind.algorithm} ${kind.curve}`;
  return 'Ed25519';
}

/**
 * Comparable strength, in the symmetric-equivalent bits NIST SP 800-57 uses.
 * The point of the table is that RSA-3072 and P-256 are the same security
 * level while the RSA key is twelve times the size.
 */
export function equivalentBits(kind: KeyKind): number {
  if (kind.family === 'ed25519') return 128;
  if (kind.family === 'ec') return { 'P-256': 128, 'P-384': 192, 'P-521': 256 }[kind.curve];
  if (kind.modulusBits >= 15360) return 256;
  if (kind.modulusBits >= 7680) return 192;
  if (kind.modulusBits >= 3072) return 128;
  return 112;
}
