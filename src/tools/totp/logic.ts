/**
 * TOTP — the six digits an authenticator app shows.
 *
 * The algorithm (RFC 6238) is small: take the Unix time divided by the step,
 * HMAC that counter with the shared secret, and read a number out of the
 * result. Three details are where implementations go wrong, so they are
 * spelled out here:
 *
 *  - **Base32, not base64.** Secrets are printed in RFC 4648 base32, upper
 *    case, often with the padding dropped and spaces inserted every four
 *    characters to be readable. `1` and `8` are not in the alphabet at all,
 *    so a secret that "looks fine" may contain a character that cannot be
 *    decoded — worth an error message rather than a wrong code.
 *  - **Dynamic truncation.** The offset comes from the low nibble of the
 *    last byte of the MAC, and the 31-bit value read from there is taken
 *    modulo 10^digits. Truncating the hex string instead produces plausible
 *    codes that never verify.
 *  - **Clock skew.** The code depends on this device's clock. If the phone
 *    and the server disagree by more than the step, every code is rejected,
 *    so the neighbouring steps are shown too and the offset is adjustable.
 *
 * Nothing is stored. The secret lives in this page's memory until the tab is
 * closed or reloaded — this is not a replacement for an authenticator app, it
 * is a bench instrument for when you need to see what the app should be
 * showing.
 */

export type OtpAlgo = 'sha1' | 'sha256' | 'sha512';

export const OTP_ALGOS: OtpAlgo[] = ['sha1', 'sha256', 'sha512'];

const SUBTLE_HASH: Record<OtpAlgo, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512',
};

export const DEFAULT_PERIOD = 30;
export const DEFAULT_DIGITS = 6;

export class InvalidSecret extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSecret';
  }
}

/* ── Base32 (RFC 4648) ────────────────────── */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decodes a secret as printed by the service that issued it.
 *
 * Tolerates lower case, missing padding, and the spaces or hyphens that get
 * inserted to make a long secret readable. Refuses anything else, loudly:
 * a silently-dropped character gives codes that are wrong forever.
 */
export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (clean === '') return new Uint8Array();

  const bits: number[] = [];
  for (const character of clean) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) {
      throw new InvalidSecret(
        `"${character}" is not a base32 character — the alphabet is A-Z and 2-7, with no 0, 1, 8 or 9`
      );
    }
    bits.push(index);
  }

  const out = new Uint8Array(Math.floor((bits.length * 5) / 8));
  let buffer = 0;
  let held = 0;
  let written = 0;
  for (const value of bits) {
    buffer = (buffer << 5) | value;
    held += 5;
    if (held >= 8) {
      held -= 8;
      out[written] = (buffer >> held) & 0xff;
      written += 1;
    }
  }
  // Leftover bits must be zero padding. Anything else means the secret was
  // truncated mid-character, which is worth reporting rather than guessing.
  if (held > 0 && (buffer & ((1 << held) - 1)) !== 0) {
    throw new InvalidSecret('the secret ends mid-way through a character — it looks truncated');
  }
  return out;
}

export function base32Encode(data: Uint8Array, pad = false): string {
  let out = '';
  let buffer = 0;
  let held = 0;
  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    held += 8;
    while (held >= 5) {
      held -= 5;
      out += ALPHABET[(buffer >> held) & 31];
    }
  }
  if (held > 0) out += ALPHABET[(buffer << (5 - held)) & 31];
  if (pad) while (out.length % 8 !== 0) out += '=';
  return out;
}

/** Groups of four, the way secrets are printed for typing. */
export function groupSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(' ');
}

/* ── HOTP and TOTP ────────────────────────── */

/** The 8-byte big-endian counter HOTP signs. */
export function counterBytes(counter: number): Uint8Array {
  const out = new Uint8Array(8);
  let high = Math.floor(counter / 0x100000000);
  let low = counter % 0x100000000;
  for (let i = 7; i >= 4; i -= 1) {
    out[i] = low & 0xff;
    low = Math.floor(low / 256);
  }
  for (let i = 3; i >= 0; i -= 1) {
    out[i] = high & 0xff;
    high = Math.floor(high / 256);
  }
  return out;
}

/**
 * RFC 4226 dynamic truncation: the low nibble of the last byte picks a
 * 4-byte window, the top bit of that window is cleared, and the remaining
 * 31-bit number is taken modulo 10^digits.
 */
export function truncate(mac: Uint8Array, digits: number): string {
  const offset = mac[mac.length - 1] & 0x0f;
  const value =
    (((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]) >>> 0;
  return String(value % 10 ** digits).padStart(digits, '0');
}

export const MIN_DIGITS = 6;
export const MAX_DIGITS = 10;

export async function hotp(
  secret: Uint8Array,
  counter: number,
  digits = DEFAULT_DIGITS,
  algo: OtpAlgo = 'sha1'
): Promise<string> {
  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new RangeError(`digits must be between ${MIN_DIGITS} and ${MAX_DIGITS}`);
  }
  if (secret.length === 0) throw new InvalidSecret('the secret is empty');
  const key = await crypto.subtle.importKey(
    'raw',
    secret as Uint8Array<ArrayBuffer>,
    { name: 'HMAC', hash: { name: SUBTLE_HASH[algo] } },
    false,
    ['sign']
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counterBytes(counter) as Uint8Array<ArrayBuffer>)
  );
  return truncate(mac, digits);
}

export function stepOf(unixSeconds: number, period = DEFAULT_PERIOD): number {
  return Math.floor(unixSeconds / period);
}

export function secondsLeft(unixSeconds: number, period = DEFAULT_PERIOD): number {
  return period - (Math.floor(unixSeconds) % period);
}

export async function totp(
  secret: Uint8Array,
  unixSeconds: number,
  options: { period?: number; digits?: number; algo?: OtpAlgo } = {}
): Promise<string> {
  const period = options.period ?? DEFAULT_PERIOD;
  if (!Number.isInteger(period) || period < 1) throw new RangeError('the period must be a positive integer');
  return hotp(secret, stepOf(unixSeconds, period), options.digits ?? DEFAULT_DIGITS, options.algo ?? 'sha1');
}

export type WindowCode = { offset: number; step: number; code: string };

/**
 * The current code plus its neighbours.
 *
 * Servers accept a step either side to absorb clock drift, so showing the
 * same window is what makes "the code is rejected" diagnosable: if the
 * previous step's code is the one being accepted, this device's clock is
 * running fast.
 */
export async function totpWindow(
  secret: Uint8Array,
  unixSeconds: number,
  options: { period?: number; digits?: number; algo?: OtpAlgo; back?: number; forward?: number } = {}
): Promise<WindowCode[]> {
  const period = options.period ?? DEFAULT_PERIOD;
  const step = stepOf(unixSeconds, period);
  const back = options.back ?? 1;
  const forward = options.forward ?? 1;
  const out: WindowCode[] = [];
  for (let offset = -back; offset <= forward; offset += 1) {
    out.push({
      offset,
      step: step + offset,
      code: await hotp(secret, step + offset, options.digits ?? DEFAULT_DIGITS, options.algo ?? 'sha1'),
    });
  }
  return out;
}

/* ── otpauth:// URIs ──────────────────────── */

export type OtpUri = {
  secret: string;
  issuer: string | null;
  account: string | null;
  algo: OtpAlgo;
  digits: number;
  period: number;
  /** Fields present in the URI that this tool ignores, reported rather than hidden. */
  ignored: string[];
};

/**
 * Parses the URI behind a QR code. Only `otpauth://totp/` is accepted —
 * `hotp` is a counter-based scheme, not a clock-based one, and quietly
 * treating it as TOTP would produce codes that never work.
 */
export function parseOtpauth(uri: string): OtpUri {
  const text = uri.trim();
  const match = /^otpauth:\/\/([a-z]+)\/([^?]*)(?:\?(.*))?$/i.exec(text);
  if (!match) throw new InvalidSecret('not an otpauth:// URI');
  if (match[1].toLowerCase() !== 'totp') {
    throw new InvalidSecret(`this is an otpauth://${match[1].toLowerCase()} URI — only totp is supported here`);
  }

  const label = decodeURIComponent(match[2]);
  const params = new URLSearchParams(match[3] ?? '');
  const secret = params.get('secret');
  if (!secret) throw new InvalidSecret('the URI carries no secret= parameter');
  // Validate now, so a bad secret is reported against the paste rather than
  // showing up later as a code that does not work.
  base32Decode(secret);

  const labelIssuer = label.includes(':') ? label.slice(0, label.indexOf(':')).trim() : null;
  const account = label.includes(':') ? label.slice(label.indexOf(':') + 1).trim() : label.trim() || null;

  const algoParam = (params.get('algorithm') ?? 'SHA1').toLowerCase().replace('-', '');
  const algo = OTP_ALGOS.find((candidate) => candidate === algoParam);
  if (!algo) throw new InvalidSecret(`unsupported algorithm=${params.get('algorithm')}`);

  const digits = Number(params.get('digits') ?? DEFAULT_DIGITS);
  if (!Number.isInteger(digits) || digits < MIN_DIGITS || digits > MAX_DIGITS) {
    throw new InvalidSecret(`unsupported digits=${params.get('digits')}`);
  }
  const period = Number(params.get('period') ?? DEFAULT_PERIOD);
  if (!Number.isInteger(period) || period < 1) {
    throw new InvalidSecret(`unsupported period=${params.get('period')}`);
  }

  const known = new Set(['secret', 'issuer', 'algorithm', 'digits', 'period']);
  const ignored = [...params.keys()].filter((key) => !known.has(key));

  return {
    secret: secret.replace(/\s/g, ''),
    issuer: params.get('issuer') ?? labelIssuer,
    account,
    algo,
    digits,
    period,
    ignored,
  };
}

export function buildOtpauth(config: {
  secret: string;
  issuer?: string | null;
  account?: string | null;
  algo?: OtpAlgo;
  digits?: number;
  period?: number;
}): string {
  const issuer = config.issuer?.trim() || null;
  const account = config.account?.trim() || 'account';
  const label = issuer ? `${issuer}:${account}` : account;
  const params = new URLSearchParams();
  params.set('secret', config.secret.replace(/\s/g, '').toUpperCase());
  if (issuer) params.set('issuer', issuer);
  params.set('algorithm', (config.algo ?? 'sha1').toUpperCase());
  params.set('digits', String(config.digits ?? DEFAULT_DIGITS));
  params.set('period', String(config.period ?? DEFAULT_PERIOD));
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
