/**
 * Base64, written out instead of handed to btoa/atob.
 *
 * `btoa` only speaks latin-1: it throws on anything above U+00FF, so every
 * wrapper around it starts by smuggling UTF-8 bytes through a string of
 * char codes, and every bug report about "Base64 breaks Chinese" traces back
 * to a missing step in that smuggling. Encoding from a `Uint8Array` removes
 * the question entirely — bytes in, characters out.
 *
 * `atob` is worse for this tool's purpose: it rejects the URL-safe alphabet,
 * silently accepts some non-canonical tails, and when it does throw it says
 * only "InvalidCharacterError" with no position. A tool whose job is to tell
 * you why a token will not decode has to do its own scanning.
 */

export type Variant = 'standard' | 'urlsafe';

/** RFC 4648 §4 (standard) and §5 (URL and filename safe). */
export const ALPHABETS: Record<Variant, string> = {
  standard: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  urlsafe: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
};

/** MIME (RFC 2045) wraps at 76; PEM (RFC 7468) at 64. */
export const WRAP_MIME = 76;
export const WRAP_PEM = 64;

export class Base64Error extends Error {
  /** 0-based offset into the string that was handed in, for a caret. */
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = 'Base64Error';
    this.index = index;
  }
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f', '\v']);

/**
 * char code → 6-bit value, with both alphabets in one table.
 *
 * Accepting `-_` and `+/` interchangeably on decode is deliberate: a JWT
 * segment and a MIME body are the same bytes, and asking which variant you
 * pasted before agreeing to read it is a question with no useful answer.
 */
const DECODE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < 64; i += 1) {
    table[ALPHABETS.standard.charCodeAt(i)] = i;
    table[ALPHABETS.urlsafe.charCodeAt(i)] = i;
  }
  return table;
})();

export type EncodeOptions = {
  variant?: Variant;
  /** Trailing `=`. Defaults to on for standard, off for URL-safe (JWT style). */
  pad?: boolean;
  /** Insert a newline every n characters. 0 disables. */
  wrap?: number;
  newline?: string;
};

export function wrapLines(text: string, width: number, newline = '\n'): string {
  if (width <= 0 || text.length <= width) return text;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += width) parts.push(text.slice(i, i + width));
  return parts.join(newline);
}

export function encodeBase64(data: Uint8Array, options: EncodeOptions = {}): string {
  const variant = options.variant ?? 'standard';
  const pad = options.pad ?? variant === 'standard';
  const table = ALPHABETS[variant];
  let out = '';

  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i];
    const has1 = i + 1 < data.length;
    const has2 = i + 2 < data.length;
    const b1 = has1 ? data[i + 1] : 0;
    const b2 = has2 ? data[i + 2] : 0;

    out += table[b0 >> 2];
    out += table[((b0 & 0b11) << 4) | (b1 >> 4)];
    if (has1) out += table[((b1 & 0b1111) << 2) | (b2 >> 6)];
    else if (pad) out += '=';
    if (has2) out += table[b2 & 0b111111];
    else if (pad) out += '=';
  }

  return wrapLines(out, options.wrap ?? 0, options.newline ?? '\n');
}

export type DecodeOptions = {
  /**
   * Reject a tail whose unused bits are not zero. `atob` accepts both "Zg=="
   * and "Zh==" as the byte 0x66, which means two different strings decode to
   * the same bytes — fine for reading, wrong for anything that compares or
   * re-encodes tokens.
   */
  strict?: boolean;
};

/** Number of bytes `n` base64 characters carry, ignoring padding. */
export function decodedLength(chars: number): number {
  return Math.floor((chars * 3) / 4);
}

export function decodeBase64(text: string, options: DecodeOptions = {}): Uint8Array {
  const values: number[] = [];
  let padding = 0;
  let lastIndex = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (WHITESPACE.has(ch)) continue;
    if (ch === '=') {
      padding += 1;
      if (padding > 2) throw new Base64Error('more than two padding characters', i);
      continue;
    }
    if (padding > 0) {
      throw new Base64Error(`data character "${ch}" after padding`, i);
    }
    const code = ch.charCodeAt(0);
    const value = code < 128 ? DECODE[code] : -1;
    if (value < 0) {
      throw new Base64Error(`"${ch}" is not a base64 character`, i);
    }
    values.push(value);
    lastIndex = i;
  }

  const remainder = values.length % 4;
  if (remainder === 1) {
    // Four characters carry three bytes; one left over carries six bits, which
    // is not a whole byte and not a legal tail in any variant.
    throw new Base64Error('length leaves a single leftover character (6 bits)', Math.max(lastIndex, 0));
  }

  if (options.strict) {
    if (padding > 0 && (values.length + padding) % 4 !== 0) {
      throw new Base64Error('padding does not bring the length to a multiple of four', text.length - 1);
    }
    const unusedBits = remainder === 2 ? 4 : remainder === 3 ? 2 : 0;
    if (unusedBits > 0 && lastIndex >= 0) {
      const tail = values[values.length - 1];
      if ((tail & ((1 << unusedBits) - 1)) !== 0) {
        throw new Base64Error(
          `non-canonical tail: the last character carries ${unusedBits} bits that are not zero`,
          lastIndex
        );
      }
    }
  }

  const out = new Uint8Array(decodedLength(values.length));
  let o = 0;
  for (let i = 0; i + 1 < values.length; i += 4) {
    const v0 = values[i];
    const v1 = values[i + 1];
    const v2 = values[i + 2];
    const v3 = values[i + 3];
    out[o] = (v0 << 2) | (v1 >> 4);
    o += 1;
    if (v2 !== undefined) {
      out[o] = ((v1 & 0b1111) << 4) | (v2 >> 2);
      o += 1;
    }
    if (v3 !== undefined) {
      out[o] = ((v2 & 0b11) << 6) | v3;
      o += 1;
    }
  }
  return out;
}

export type Inspection = {
  /** Characters that count towards the data, padding and whitespace excluded. */
  dataChars: number;
  whitespace: number;
  padding: number;
  /** Characters only the standard alphabet has (`+` `/`). */
  standardOnly: number;
  /** Characters only the URL-safe alphabet has (`-` `_`). */
  urlSafeOnly: number;
  /** First offending character, if any. */
  invalid: { index: number; char: string } | null;
  /** Bytes a successful decode would produce. */
  expectedBytes: number;
  /** Both `+/` and `-_` present: two variants spliced together. */
  mixedAlphabet: boolean;
};

/**
 * Describes a candidate string without deciding whether it is legal.
 *
 * Errors alone are a poor explanation. "This has 3 spaces, 2 padding
 * characters and one `-`, so it is a URL-safe token" is what someone staring
 * at a broken JWT actually needs.
 */
export function inspectBase64(text: string): Inspection {
  let dataChars = 0;
  let whitespace = 0;
  let padding = 0;
  let standardOnly = 0;
  let urlSafeOnly = 0;
  let invalid: { index: number; char: string } | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (WHITESPACE.has(ch)) {
      whitespace += 1;
      continue;
    }
    if (ch === '=') {
      padding += 1;
      continue;
    }
    if (ch === '+' || ch === '/') standardOnly += 1;
    else if (ch === '-' || ch === '_') urlSafeOnly += 1;
    const code = ch.charCodeAt(0);
    if (code >= 128 || DECODE[code] < 0) {
      if (!invalid) invalid = { index: i, char: ch };
      continue;
    }
    dataChars += 1;
  }

  return {
    dataChars,
    whitespace,
    padding,
    standardOnly,
    urlSafeOnly,
    invalid,
    expectedBytes: decodedLength(dataChars),
    mixedAlphabet: standardOnly > 0 && urlSafeOnly > 0,
  };
}

/* ── UTF-8 bridge ─────────────────────────── */

export function toUtf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Decodes as UTF-8, or returns null when the bytes are not valid UTF-8. */
export function fromUtf8Bytes(data: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

const HEX = '0123456789abcdef';

/** Lowercase hex, space-separated per byte, truncated for a preview pane. */
export function toHex(data: Uint8Array, limit = data.length): string {
  const end = Math.min(limit, data.length);
  const parts: string[] = [];
  for (let i = 0; i < end; i += 1) parts.push(HEX[data[i] >> 4] + HEX[data[i] & 15]);
  return parts.join(' ');
}

/* ── Data URI ─────────────────────────────── */

export type DataUri = {
  mime: string;
  /** `;key=value` pairs after the MIME type, `charset` most commonly. */
  params: { key: string; value: string }[];
  base64: boolean;
  data: Uint8Array;
};

/** Unreserved set of RFC 3986, for the non-base64 form of a data URI. */
const URI_SAFE = /[A-Za-z0-9\-_.!~*'()]/;

function percentEncode(data: Uint8Array): string {
  let out = '';
  for (const byte of data) {
    const ch = String.fromCharCode(byte);
    out += URI_SAFE.test(ch) ? ch : `%${HEX[byte >> 4].toUpperCase()}${HEX[byte & 15].toUpperCase()}`;
  }
  return out;
}

function percentDecode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '%') {
      const pair = text.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
        throw new Base64Error(`"%${pair}" is not a percent escape`, i);
      }
      out.push(Number.parseInt(pair, 16));
      i += 2;
    } else {
      // A raw non-ASCII character inside a URI is already illegal, but
      // browsers read it as UTF-8, so the same is done here.
      const bytes = new TextEncoder().encode(text[i]);
      for (const byte of bytes) out.push(byte);
    }
  }
  return new Uint8Array(out);
}

export function buildDataUri(
  mime: string,
  data: Uint8Array,
  options: { base64?: boolean; charset?: string } = {}
): string {
  const base64 = options.base64 ?? true;
  const type = mime.trim() || 'application/octet-stream';
  const charset = options.charset ? `;charset=${options.charset}` : '';
  const body = base64 ? encodeBase64(data, { variant: 'standard', pad: true }) : percentEncode(data);
  return `data:${type}${charset}${base64 ? ';base64' : ''},${body}`;
}

export function parseDataUri(text: string): DataUri {
  const trimmed = text.trim();
  if (!/^data:/i.test(trimmed)) throw new Base64Error('does not start with "data:"', 0);
  const comma = trimmed.indexOf(',');
  if (comma === -1) throw new Base64Error('a data URI needs a comma before its payload', trimmed.length - 1);

  const meta = trimmed.slice(5, comma).split(';');
  let base64 = false;
  const params: { key: string; value: string }[] = [];
  // `;base64` is a flag, not a parameter, and it is only meaningful last.
  const head = meta.shift() ?? '';
  for (const part of meta) {
    if (part.toLowerCase() === 'base64') {
      base64 = true;
      continue;
    }
    const eq = part.indexOf('=');
    if (eq === -1) params.push({ key: part, value: '' });
    else params.push({ key: part.slice(0, eq), value: part.slice(eq + 1) });
  }

  const payload = trimmed.slice(comma + 1);
  return {
    // RFC 2397: an omitted type means text/plain;charset=US-ASCII.
    mime: head || 'text/plain',
    params: head ? params : [{ key: 'charset', value: 'US-ASCII' }, ...params],
    base64,
    data: base64 ? decodeBase64(payload) : percentDecode(payload),
  };
}
