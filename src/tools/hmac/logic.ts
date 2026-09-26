/**
 * HMAC, for the afternoon when a webhook keeps answering 401.
 *
 * The MAC itself is `crypto.subtle.sign` — the platform's own HMAC, which is
 * constant-time and needs no algorithm written here. Everything in this file
 * exists because the bug is almost never in the HMAC:
 *
 *  - The key is not what you think it is. A key printed as hex is 32 bytes;
 *    pasted as text it is 64 bytes of ASCII, and the MAC is wrong with no
 *    error anywhere. So the key's encoding is explicit and the decoded byte
 *    length is displayed.
 *  - The message is not what you think it is. Signatures are computed over
 *    the raw request body, and a body that has been through a JSON
 *    pretty-printer, or gained a trailing newline from a shell heredoc, is a
 *    different message. So the byte length is displayed, and CRLF is not
 *    normalised away.
 *  - The published value is not plain hex. GitHub sends `sha256=<hex>`,
 *    Stripe sends `t=…,v1=<hex>`, some senders use base64. All three can be
 *    pasted whole.
 *
 * Comparison is length-then-XOR over the whole digest rather than `===`, for
 * the same reason a verifier should be: not because a timing attack on a
 * debugging tool matters, but because this is the code people copy.
 */

export type MacAlgo = 'sha256' | 'sha384' | 'sha512' | 'sha1';

export const MAC_ALGOS: MacAlgo[] = ['sha256', 'sha384', 'sha512', 'sha1'];

export const MAC_LABEL: Record<MacAlgo, string> = {
  sha256: 'HMAC-SHA256',
  sha384: 'HMAC-SHA384',
  sha512: 'HMAC-SHA512',
  sha1: 'HMAC-SHA1',
};

/** WebCrypto's spelling of the hash. */
export const SUBTLE_HASH: Record<MacAlgo, string> = {
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
  sha1: 'SHA-1',
};

/**
 * SHA-1's collision weakness does not carry over to HMAC-SHA1 — HMAC needs
 * the hash to be a good PRF, not collision-resistant, and no attack on
 * HMAC-SHA1 exists. It stays on the list because a lot of live webhooks still
 * sign with it; it is marked legacy so nobody picks it for something new.
 */
export const LEGACY: MacAlgo[] = ['sha1'];

export type Encoding = 'utf8' | 'hex' | 'base64';

export class InvalidInput extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'InvalidInput';
    this.field = field;
  }
}

/* ── Bytes ────────────────────────────────── */
/** Local conversions: logic.ts is imported by the test runner directly, which
 *  does not resolve the `@/` alias, so these few lines stay in the folder. */

const HEX = '0123456789abcdef';

export function toHex(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 1) out += HEX[data[i] >> 4] + HEX[data[i] & 15];
  return out;
}

export function toBase64(data: Uint8Array): string {
  let raw = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    raw += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(raw);
}

/**
 * Decodes one of the three shapes a key or message arrives in.
 *
 * Whitespace is stripped from hex and base64 (people paste wrapped values)
 * but never from text: a trailing newline in the body is exactly the kind of
 * difference this tool exists to find.
 */
export function decodeInput(text: string, encoding: Encoding, field: string): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(text);

  if (encoding === 'hex') {
    const clean = text.replace(/[\s:_-]/g, '').toLowerCase();
    if (clean === '') return new Uint8Array();
    if (clean.length % 2 !== 0) throw new InvalidInput(field, 'hex needs an even number of characters');
    if (!/^[0-9a-f]+$/.test(clean)) throw new InvalidInput(field, 'hex contains a character that is not 0-9a-f');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  let b64 = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (b64 === '') return new Uint8Array();
  const pad = b64.length % 4;
  if (pad === 1) throw new InvalidInput(field, 'not a valid base64 length');
  if (pad) b64 += '='.repeat(4 - pad);
  let raw: string;
  try {
    raw = atob(b64);
  } catch {
    throw new InvalidInput(field, 'not valid base64');
  }
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/* ── The MAC ──────────────────────────────── */

export async function hmac(algo: MacAlgo, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    'raw',
    // A zero-length key is legal HMAC (RFC 2104 pads it), but WebCrypto
    // refuses an empty buffer, so it becomes one block of zeros — which is
    // what the padding would have produced anyway.
    key.length === 0 ? new Uint8Array(blockBytes(algo)) : (key as Uint8Array<ArrayBuffer>),
    { name: 'HMAC', hash: { name: SUBTLE_HASH[algo] } },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', imported, message as Uint8Array<ArrayBuffer>);
  return new Uint8Array(signature);
}

/** HMAC's block size, which is the hash's: 128 bytes above SHA-256. */
export function blockBytes(algo: MacAlgo): number {
  return algo === 'sha384' || algo === 'sha512' ? 128 : 64;
}

/**
 * A key longer than the block gets hashed down to one digest before use, so
 * past that length extra key material adds nothing. Worth saying out loud,
 * because "longer key = stronger" stops being true at 64 or 128 bytes.
 */
export function keyIsFolded(algo: MacAlgo, keyLength: number): boolean {
  return keyLength > blockBytes(algo);
}

/* ── Comparison ───────────────────────────── */

/**
 * Pulls the MAC out of a signature header.
 *
 * `sha256=abc…` (GitHub), `t=1699…,v1=abc…` (Stripe), `v1=abc…`, or the bare
 * value. The last `key=value` pair whose value looks like a digest wins,
 * because Stripe puts the timestamp first.
 */
export function extractSignature(header: string): string {
  const text = header.trim();
  if (text === '') return '';
  const pairs = [...text.matchAll(/([A-Za-z0-9_-]+)\s*=\s*([A-Za-z0-9+/=_-]+)/g)];
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    const value = pairs[i][2].replace(/=+$/, '');
    if (value.length >= 20) return pairs[i][2];
  }
  return text.replace(/\s+/g, '');
}

/** Equal length, then XOR over every byte — no early exit on the first diff. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type Comparison =
  | { kind: 'empty' }
  | { kind: 'match'; form: 'hex' | 'base64' }
  | { kind: 'mismatch' }
  | { kind: 'unreadable' };

/**
 * Compares a pasted signature against the computed MAC.
 *
 * Both hex and base64 are tried, because senders differ and the person
 * debugging should not have to know which one they are looking at.
 */
export function compareSignature(pasted: string, mac: Uint8Array): Comparison {
  const value = extractSignature(pasted);
  if (value === '') return { kind: 'empty' };

  const expectedHex = toHex(mac);
  const cleanedHex = value.replace(/[\s:]/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(cleanedHex)) {
    if (cleanedHex.length === expectedHex.length) {
      return equalBytesFromHex(cleanedHex, mac) ? { kind: 'match', form: 'hex' } : { kind: 'mismatch' };
    }
  }

  try {
    const decoded = decodeInput(value, 'base64', 'signature');
    if (decoded.length === mac.length) {
      return equalBytes(decoded, mac) ? { kind: 'match', form: 'base64' } : { kind: 'mismatch' };
    }
    return { kind: 'mismatch' };
  } catch {
    return { kind: 'unreadable' };
  }
}

function equalBytesFromHex(hex: string, mac: Uint8Array): boolean {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return equalBytes(bytes, mac);
}
