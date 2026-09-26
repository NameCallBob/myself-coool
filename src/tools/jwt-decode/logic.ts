/**
 * JWT inspection, and signature verification that is actually verification.
 *
 * Decoding a JWT is base64url and JSON — trivial, and that triviality is the
 * problem. A decoder that shows you the payload has told you what the token
 * *claims*, not what is *true*: anyone can mint `{"admin":true}` and paste it
 * in. So this file draws a hard line between the two. `decodeJwt` never says
 * anything about trust, and `verify` is the only function that does, using
 * WebCrypto with a key you supply.
 *
 * Three specific traps are handled explicitly rather than glossed over:
 *
 *  - `alg: none`. A token with an empty signature is valid per RFC 7519 and
 *    worthless as authentication. It is reported as unverifiable, never as OK.
 *  - Five segments. That is JWE, not JWS: the payload is ciphertext and there
 *    is nothing to read. Guessing would print base64 noise as if it were data.
 *  - `exp` in milliseconds. RFC 7519 says NumericDate, i.e. seconds. A token
 *    with `exp: 1735689600000` is not valid until the year 56000, and a decoder
 *    that renders it without comment turns a real bug into a shrug.
 *
 * Nothing here persists. The tool is marked sensitive, so the secret and the
 * token exist only in the tab's memory for as long as the tab is open.
 */

/* ── base64url ────────────────────────────── */

const B64URL = /^[A-Za-z0-9_-]*$/;

/** base64url → bytes. Padding is optional, as JWS requires it to be absent. */
export function fromBase64Url(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  if (!B64URL.test(clean)) throw new JwtError('bad-base64', clean.slice(0, 24));
  if (clean.length % 4 === 1) throw new JwtError('bad-base64', clean.slice(0, 24));
  let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad !== 0) b64 += '='.repeat(4 - pad);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function toBase64Url(data: Uint8Array): string {
  let raw = '';
  for (let i = 0; i < data.length; i += 1) raw += String.fromCharCode(data[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ── Errors ───────────────────────────────── */

export type JwtErrorCode =
  | 'empty'
  | 'segment-count'
  | 'bad-base64'
  | 'bad-utf8'
  | 'bad-json'
  | 'not-object';

export class JwtError extends Error {
  readonly code: JwtErrorCode;
  readonly detail: string;

  constructor(code: JwtErrorCode, detail: string) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'JwtError';
    this.code = code;
    this.detail = detail;
  }
}

/* ── Decoding ─────────────────────────────── */

export type Segment = {
  raw: string;
  /** Pretty-printed JSON, or the raw text when it did not parse. */
  text: string;
  value: Record<string, unknown> | null;
  /** Failure code when this segment could not be read as JSON. */
  problem: JwtErrorCode | null;
  bytes: number;
};

export type Jwt = {
  header: Segment;
  payload: Segment;
  signature: { raw: string; bytes: Uint8Array | null; bits: number };
  /** Exactly the ASCII that was signed: `header.payload`, dot included. */
  signingInput: string;
  segmentCount: number;
  alg: string | null;
  typ: string | null;
  kid: string | null;
  /** Five segments: JWE. The payload is encrypted and cannot be shown. */
  encrypted: boolean;
  /** `alg: none` with an empty signature. Decodable, never trustworthy. */
  unsecured: boolean;
};

/** Strips an `Authorization: Bearer` wrapper and any wrapping whitespace. */
export function normalizeToken(text: string): string {
  return text
    .trim()
    .replace(/^authorization\s*:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    // Tokens copied out of a log or a header get wrapped; JWS has no whitespace.
    .replace(/\s+/g, '');
}

function readSegment(raw: string): Segment {
  if (raw === '') {
    return { raw, text: '', value: null, problem: 'bad-json', bytes: 0 };
  }
  const bytes = fromBase64Url(raw);
  const bytesCount = bytes.length;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { raw, text: '', value: null, problem: 'bad-utf8', bytes: bytesCount };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { raw, text, value: null, problem: 'bad-json', bytes: bytesCount };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { raw, text, value: null, problem: 'not-object', bytes: bytesCount };
  }
  return {
    raw,
    text: JSON.stringify(value, null, 2),
    value: value as Record<string, unknown>,
    problem: null,
    bytes: bytesCount,
  };
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function decodeJwt(input: string): Jwt {
  const token = normalizeToken(input);
  if (token === '') throw new JwtError('empty', '');

  const parts = token.split('.');
  if (parts.length !== 3 && parts.length !== 5) {
    throw new JwtError('segment-count', String(parts.length));
  }

  const header = readSegment(parts[0]);
  const encrypted = parts.length === 5;
  const alg = asString(header.value?.alg ?? null);

  // JWE's second segment is the encrypted key and the fourth is ciphertext;
  // there is no readable payload without the decryption key. Showing the
  // base64 as if it were the claims would be worse than saying so.
  const payload = encrypted
    ? { raw: parts[3], text: '', value: null, problem: 'bad-json' as JwtErrorCode, bytes: 0 }
    : readSegment(parts[1]);

  const signatureRaw = encrypted ? parts[4] : parts[2];
  let signatureBytes: Uint8Array | null = null;
  if (signatureRaw !== '') {
    try {
      signatureBytes = fromBase64Url(signatureRaw);
    } catch {
      signatureBytes = null;
    }
  }

  return {
    header,
    payload,
    signature: {
      raw: signatureRaw,
      bytes: signatureBytes,
      bits: signatureBytes ? signatureBytes.length * 8 : 0,
    },
    signingInput: `${parts[0]}.${parts[1]}`,
    segmentCount: parts.length,
    alg,
    typ: asString(header.value?.typ ?? null),
    kid: asString(header.value?.kid ?? null),
    encrypted,
    unsecured: !encrypted && (alg === null || alg.toLowerCase() === 'none') && signatureRaw === '',
  };
}

/* ── Claims ───────────────────────────────── */

/** RFC 7519 §4.1 NumericDate claims, plus the two OIDC ones people rely on. */
const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time', 'updated_at'];

export type TimeClaim = {
  name: string;
  seconds: number;
  ms: number;
  /** Value large enough to be milliseconds mistaken for seconds. */
  looksLikeMillis: boolean;
};

export type ClaimReport = {
  times: TimeClaim[];
  /** null when the token carries no `exp` at all — which is itself worth saying. */
  expired: boolean | null;
  /** Seconds until `exp`; negative once it has passed. */
  secondsToExpiry: number | null;
  notYetValid: boolean | null;
  issuedInFuture: boolean;
  /** Everything that is not a time claim, stringified for display. */
  other: { key: string; value: string }[];
};

/**
 * NumericDate values are seconds since the epoch. Anything past 1e11 would be
 * the year 5138 or later, which in practice always means the producer wrote
 * milliseconds — a bug worth naming rather than rendering as a date.
 */
const MILLIS_THRESHOLD = 1e11;

export function inspectClaims(payload: Record<string, unknown> | null, nowMs: number): ClaimReport {
  const times: TimeClaim[] = [];
  const other: { key: string; value: string }[] = [];

  if (payload) {
    for (const key of Object.keys(payload)) {
      const value = payload[key];
      if (TIME_CLAIMS.includes(key) && typeof value === 'number' && Number.isFinite(value)) {
        const looksLikeMillis = Math.abs(value) >= MILLIS_THRESHOLD;
        times.push({
          name: key,
          seconds: value,
          ms: looksLikeMillis ? value : value * 1000,
          looksLikeMillis,
        });
        continue;
      }
      other.push({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value) ?? String(value),
      });
    }
  }

  const find = (name: string) => times.find((claim) => claim.name === name) ?? null;
  const exp = find('exp');
  const nbf = find('nbf');
  const iat = find('iat');

  return {
    times,
    expired: exp === null ? null : exp.ms <= nowMs,
    secondsToExpiry: exp === null ? null : Math.round((exp.ms - nowMs) / 1000),
    notYetValid: nbf === null ? null : nbf.ms > nowMs,
    // One minute of slack: clock skew between two servers is normal and a
    // decoder that shouts about three seconds is a decoder people stop reading.
    issuedInFuture: iat !== null && iat.ms > nowMs + 60_000,
    other,
  };
}

/* ── Verification ─────────────────────────── */

export type AlgFamily = 'HS' | 'RS' | 'PS' | 'ES' | 'none' | 'unknown';

export function algFamily(alg: string | null): AlgFamily {
  if (alg === null) return 'unknown';
  const upper = alg.toUpperCase();
  if (upper === 'NONE') return 'none';
  if (/^HS(256|384|512)$/.test(upper)) return 'HS';
  if (/^RS(256|384|512)$/.test(upper)) return 'RS';
  if (/^PS(256|384|512)$/.test(upper)) return 'PS';
  if (/^ES(256|384|512)$/.test(upper)) return 'ES';
  return 'unknown';
}

const HASH_OF: Record<string, string> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
/** ES512 is P-521, not P-512. The names do not line up and it matters. */
const CURVE_OF: Record<string, string> = { '256': 'P-256', '384': 'P-384', '512': 'P-521' };

export type VerifyOutcome =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'unsupported'; reason: string }
  | { status: 'key-error'; reason: string };

/** PEM → DER. Accepts any label; the ASN.1 inside is what WebCrypto reads. */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-{2,}[^-]+-{2,}/g, '')
    .replace(/\s+/g, '');
  if (body === '') throw new Error('no base64 body between the PEM markers');
  const normalised = body.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/**
 * A plain `ArrayBuffer` copy. WebCrypto's `BufferSource` will not accept a view
 * whose backing buffer TypeScript cannot prove is an ArrayBuffer (it could be a
 * SharedArrayBuffer), and copying is cheaper than fighting the type.
 */
function asBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.length);
  new Uint8Array(copy).set(data);
  return copy;
}

/**
 * Verifies the signature with a key you supply.
 *
 * `key` is the shared secret for HS*, and a PEM-encoded SPKI public key for the
 * asymmetric families. `alg` is taken from the argument, not from the header:
 * trusting the header's `alg` to choose the algorithm is the classic JWT
 * confusion attack, and this function refuses to make that choice implicitly.
 */
export async function verify(
  token: Jwt,
  alg: string,
  key: string,
  subtle: SubtleCrypto
): Promise<VerifyOutcome> {
  const family = algFamily(alg);
  const size = alg.slice(2);
  const hash = HASH_OF[size];

  if (family === 'none') {
    return {
      status: 'unsupported',
      reason: 'alg none carries no signature, so there is nothing to verify',
    };
  }
  if (family === 'unknown' || hash === undefined) {
    return { status: 'unsupported', reason: `no verifier here for alg ${alg}` };
  }
  if (token.encrypted) {
    return { status: 'unsupported', reason: 'JWE (five segments) is encryption, not a signature' };
  }
  if (token.signature.bytes === null || token.signature.bytes.length === 0) {
    return { status: 'invalid' };
  }
  if (key.trim() === '') {
    return { status: 'key-error', reason: 'no key supplied' };
  }

  const data = asBuffer(utf8(token.signingInput));
  const signature = asBuffer(token.signature.bytes);

  try {
    if (family === 'HS') {
      const material = await subtle.importKey(
        'raw',
        asBuffer(utf8(key)),
        { name: 'HMAC', hash: { name: hash } },
        false,
        ['verify']
      );
      const ok = await subtle.verify('HMAC', material, signature, data);
      return { status: ok ? 'valid' : 'invalid' };
    }

    const der = pemToDer(key);
    if (family === 'RS' || family === 'PS') {
      const name = family === 'RS' ? 'RSASSA-PKCS1-v1_5' : 'RSA-PSS';
      const material = await subtle.importKey(
        'spki',
        asBuffer(der),
        { name, hash: { name: hash } },
        false,
        ['verify']
      );
      // RFC 7518 fixes the PSS salt length at the hash length.
      const params =
        family === 'PS' ? { name, saltLength: Number(size) / 8 } : ({ name } as AlgorithmIdentifier);
      const ok = await subtle.verify(params, material, signature, data);
      return { status: ok ? 'valid' : 'invalid' };
    }

    const curve = CURVE_OF[size];
    const material = await subtle.importKey(
      'spki',
      asBuffer(der),
      { name: 'ECDSA', namedCurve: curve },
      false,
      ['verify']
    );
    // JWS carries ECDSA signatures as raw r‖s, which is exactly WebCrypto's
    // format — no DER unwrapping, unlike OpenSSL's output.
    const ok = await subtle.verify(
      { name: 'ECDSA', hash: { name: hash } },
      material,
      signature,
      data
    );
    return { status: ok ? 'valid' : 'invalid' };
  } catch (error) {
    return { status: 'key-error', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Sizes a shared secret against the hash, per RFC 7518 §3.2. */
export function secretStrength(
  secret: string,
  alg: string
): { bytes: number; required: number; weak: boolean } {
  const bytes = utf8(secret).length;
  const required = { '256': 32, '384': 48, '512': 64 }[alg.slice(2)] ?? 32;
  return { bytes, required, weak: bytes < required };
}
