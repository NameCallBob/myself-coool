/**
 * Byte arrays in and out of every base people actually paste at each other.
 *
 * The important distinction is between the two families. Hex, Base32 and
 * Base64 are *bit-group* encodings: they slice the byte stream into 4-, 5- or
 * 6-bit pieces, so a leading zero byte is just another byte and encoding is
 * linear. Base58 is a *radix* conversion on one enormous integer, which means a
 * leading zero byte carries no information at all — Bitcoin patches that by
 * writing one `1` per leading zero byte, and any implementation that forgets
 * loses those bytes silently. It also means Base58 is quadratic in the input
 * length, which is why it has a size ceiling here and the others do not.
 */

export type Format =
  | 'hex'
  | 'base32'
  | 'base32hex'
  | 'base32crockford'
  | 'base58'
  | 'base64'
  | 'base64url'
  | 'decimal'
  | 'binary'
  | 'utf8';

export class BaseError extends Error {
  /** 0-based offset into the input, or -1 when the fault is the whole string. */
  readonly index: number;

  constructor(message: string, index = -1) {
    super(message);
    this.name = 'BaseError';
    this.index = index;
  }
}

const B32_RFC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** RFC 4648 §7: hex-extended, so the sort order matches the byte order. */
const B32_HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
/** Crockford: no I, L, O or U, so a human can read it aloud without ambiguity. */
const B32_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B58_BTC = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const ALPHABETS: Partial<Record<Format, string>> = {
  base32: B32_RFC,
  base32hex: B32_HEX,
  base32crockford: B32_CROCKFORD,
  base58: B58_BTC,
  base64: B64_STD,
  base64url: B64_URL,
};

/**
 * Base58 is O(n²): every output digit divides the whole remaining number.
 * A megabyte would take minutes, so it is refused with a message instead.
 */
export const BASE58_CEILING = 4096;

/* ── Bit-group codecs ─────────────────────── */

function groupEncode(data: Uint8Array, alphabet: string, bits: number, pad: boolean): string {
  const mask = (1 << bits) - 1;
  let acc = 0;
  let held = 0;
  let out = '';
  for (const byte of data) {
    acc = (acc << 8) | byte;
    held += 8;
    while (held >= bits) {
      held -= bits;
      out += alphabet[(acc >> held) & mask];
    }
  }
  // The tail is left-aligned: the spare low bits are zero, which is what makes
  // a canonical encoding canonical.
  if (held > 0) out += alphabet[(acc << (bits - held)) & mask];
  if (pad) {
    const block = bits === 5 ? 8 : 4;
    while (out.length % block !== 0) out += '=';
  }
  return out;
}

function reverseTable(alphabet: string, extra: Record<string, number> = {}): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) {
    map.set(alphabet[i], i);
    map.set(alphabet[i].toLowerCase(), i);
  }
  for (const [ch, value] of Object.entries(extra)) map.set(ch, value);
  return map;
}

function groupDecode(
  text: string,
  table: Map<string, number>,
  bits: number,
  label: string,
  strip: RegExp
): Uint8Array {
  let acc = 0;
  let held = 0;
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (strip.test(ch)) continue;
    if (ch === '=') continue; // padding carries no bits
    const value = table.get(ch);
    if (value === undefined) {
      throw new BaseError(`"${ch}" is not a ${label} character`, i);
    }
    acc = (acc << bits) | value;
    held += bits;
    if (held >= 8) {
      held -= 8;
      out.push((acc >> held) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/* ── Base58 ───────────────────────────────── */

/**
 * Bitcoin's base58, implemented as repeated long division on a byte buffer.
 *
 * The obvious implementation builds one huge `BigInt` and takes it apart, and
 * that is what the first draft did. Long division over a `Uint8Array` is the
 * form the reference implementation uses, it needs no arbitrary-precision type,
 * and it makes the leading-zero rule explicit rather than a special case bolted
 * onto the end: the zero bytes are counted off the front *before* any
 * arithmetic, because an integer simply cannot represent them.
 */
export function encodeBase58(data: Uint8Array): string {
  if (data.length > BASE58_CEILING) {
    throw new BaseError(
      `base58 is quadratic in length; ${data.length} bytes is over the ${BASE58_CEILING}-byte ceiling`
    );
  }
  let zeros = 0;
  while (zeros < data.length && data[zeros] === 0) zeros += 1;

  // log(256)/log(58) ≈ 1.365, rounded up: the most digits the rest can need.
  const size = Math.floor(((data.length - zeros) * 138) / 100) + 1;
  const digits = new Uint8Array(size);
  let used = 0;

  for (let i = zeros; i < data.length; i += 1) {
    let carry = data[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < used) && k >= 0; k -= 1, j += 1) {
      carry += 256 * digits[k];
      digits[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    used = j;
  }

  let at = size - used;
  while (at < size && digits[at] === 0) at += 1;

  let out = B58_BTC[0].repeat(zeros);
  for (; at < size; at += 1) out += B58_BTC[digits[at]];
  return out;
}

export function decodeBase58(text: string): Uint8Array {
  const clean = text.replace(/\s/g, '');
  if (clean.length > BASE58_CEILING * 2) {
    throw new BaseError(`input is too long for base58 (${clean.length} characters)`);
  }

  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === B58_BTC[0]) zeros += 1;

  // log(58)/log(256) ≈ 0.733, rounded up.
  const size = Math.floor(((clean.length - zeros) * 733) / 1000) + 1;
  const buffer = new Uint8Array(size);
  let used = 0;

  for (let i = zeros; i < clean.length; i += 1) {
    const value = B58_BTC.indexOf(clean[i]);
    if (value === -1) {
      const hint = /[0OIl]/.test(clean[i]) ? ' (base58 leaves out 0, O, I and l on purpose)' : '';
      throw new BaseError(`"${clean[i]}" is not a base58 character${hint}`, i);
    }
    let carry = value;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < used) && k >= 0; k -= 1, j += 1) {
      carry += 58 * buffer[k];
      buffer[k] = carry & 0xff;
      carry >>= 8;
    }
    used = j;
  }

  let at = size - used;
  while (at < size && buffer[at] === 0) at += 1;

  const out = new Uint8Array(zeros + (size - at));
  for (let o = zeros; at < size; at += 1, o += 1) out[o] = buffer[at];
  return out;
}

/* ── Numeric list forms ───────────────────── */

function encodeDecimal(data: Uint8Array): string {
  return [...data].join(' ');
}

function encodeBinary(data: Uint8Array): string {
  return [...data].map((b) => b.toString(2).padStart(8, '0')).join(' ');
}

function decodeNumberList(text: string, radix: 2 | 10, label: string): Uint8Array {
  const tokens = text.split(/[\s,;[\]]+/).filter((token) => token !== '');
  const out = new Uint8Array(tokens.length);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].replace(/^0[bB]/, '').replace(/^0[xX]/, '');
    if (!(radix === 2 ? /^[01]+$/ : /^[0-9]+$/).test(token)) {
      throw new BaseError(`"${tokens[i]}" is not a ${label} number`);
    }
    const value = Number.parseInt(token, radix);
    if (value > 255) throw new BaseError(`${tokens[i]} does not fit in one byte`);
    out[i] = value;
  }
  return out;
}

/* ── Public conversion ────────────────────── */

const HEX_DIGITS = '0123456789abcdef';

export function encodeBytes(data: Uint8Array, format: Format, options: { pad?: boolean } = {}): string {
  const pad = options.pad ?? true;
  switch (format) {
    case 'hex':
      return [...data].map((b) => HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 15]).join('');
    case 'base32':
      return groupEncode(data, B32_RFC, 5, pad);
    case 'base32hex':
      return groupEncode(data, B32_HEX, 5, pad);
    case 'base32crockford':
      // Crockford's specification has no padding at all.
      return groupEncode(data, B32_CROCKFORD, 5, false);
    case 'base58':
      return encodeBase58(data);
    case 'base64':
      return groupEncode(data, B64_STD, 6, pad);
    case 'base64url':
      return groupEncode(data, B64_URL, 6, false);
    case 'decimal':
      return encodeDecimal(data);
    case 'binary':
      return encodeBinary(data);
    case 'utf8':
      return new TextDecoder('utf-8').decode(data);
    default:
      throw new BaseError(`unknown format ${String(format)}`);
  }
}

const HEX_TABLE = reverseTable('0123456789ABCDEF');
const B32_RFC_TABLE = reverseTable(B32_RFC);
const B32_HEX_TABLE = reverseTable(B32_HEX);
/** Crockford decodes O as zero and both I and L as one, and ignores hyphens. */
const B32_CROCKFORD_TABLE = reverseTable(B32_CROCKFORD, {
  O: 0,
  o: 0,
  I: 1,
  i: 1,
  L: 1,
  l: 1,
});
/** Both base64 alphabets in one table, so either variant decodes. */
const B64_TABLE = (() => {
  const map = new Map<string, number>();
  for (let i = 0; i < 64; i += 1) {
    map.set(B64_STD[i], i);
    map.set(B64_URL[i], i);
  }
  return map;
})();

const WS = /\s/;
const WS_OR_SEP = /[\s:_-]/;

export function decodeBytes(text: string, format: Format): Uint8Array {
  switch (format) {
    case 'hex': {
      // Tokenise before joining so a per-byte `0x` prefix — how a debugger or
      // a C array prints bytes — is dropped rather than read as a digit.
      const clean = text
        .split(/[\s:_,-]+/)
        .filter((token) => token !== '')
        .map((token) => token.replace(/^0[xX]/, ''))
        .join('');
      if (clean.length % 2 !== 0) {
        throw new BaseError('hex needs an even number of digits — one is missing', clean.length - 1);
      }
      return groupDecode(clean, HEX_TABLE, 4, 'hex', /$^/);
    }
    case 'base32':
      return groupDecode(text, B32_RFC_TABLE, 5, 'base32', WS);
    case 'base32hex':
      return groupDecode(text, B32_HEX_TABLE, 5, 'base32hex', WS);
    case 'base32crockford':
      return groupDecode(text, B32_CROCKFORD_TABLE, 5, 'Crockford base32', WS_OR_SEP);
    case 'base58':
      return decodeBase58(text);
    case 'base64':
    case 'base64url':
      return groupDecode(text, B64_TABLE, 6, 'base64', WS);
    case 'decimal':
      return decodeNumberList(text, 10, 'decimal');
    case 'binary':
      return decodeNumberList(text, 2, 'binary');
    case 'utf8':
      return new TextEncoder().encode(text);
    default:
      throw new BaseError(`unknown format ${String(format)}`);
  }
}

/** One conversion, any format to any other. */
export function convert(text: string, from: Format, to: Format, options: { pad?: boolean } = {}): string {
  return encodeBytes(decodeBytes(text, from), to, options);
}

export type Guess = { format: Format; reason: string };

/**
 * A guess at what was pasted, most specific first.
 *
 * Only ever a guess: `1234` is legal hex, legal decimal, legal base58 and
 * legal base32hex. The point is to pre-select something sensible, never to
 * decide silently — the tool always shows which format it is reading.
 */
export function guessFormat(text: string): Guess | null {
  const clean = text.trim();
  if (clean === '') return null;
  const compact = clean.replace(/\s/g, '');

  if (/^[01]{8}(\s+[01]{8})+$/.test(clean)) {
    return { format: 'binary', reason: 'groups of eight 0s and 1s' };
  }
  if (/^\d{1,3}([\s,]+\d{1,3})+$/.test(clean) && clean.split(/[\s,]+/).every((n) => Number(n) <= 255)) {
    return { format: 'decimal', reason: 'numbers, all under 256' };
  }
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    return { format: 'hex', reason: 'hex digits, even count' };
  }
  if (/^[A-Z2-7]+=*$/.test(compact) && compact.length % 8 === 0) {
    return { format: 'base32', reason: 'A–Z and 2–7, padded to a multiple of eight' };
  }
  if (/[-_]/.test(compact) && /^[A-Za-z0-9_-]+$/.test(compact)) {
    return { format: 'base64url', reason: 'contains - or _, which only base64url uses' };
  }
  if (/^[A-Za-z0-9+/]+=*$/.test(compact) && (compact.length % 4 === 0 || compact.includes('='))) {
    return { format: 'base64', reason: 'base64 alphabet, length a multiple of four' };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(compact)) {
    return { format: 'base58', reason: 'no 0, O, I or l anywhere' };
  }
  return null;
}

/** Ratio of output characters to input bytes, for the readout. */
export function expansion(format: Format): number {
  switch (format) {
    case 'hex':
      return 2;
    case 'base32':
    case 'base32hex':
    case 'base32crockford':
      return 8 / 5;
    case 'base58':
      return Math.log(256) / Math.log(58);
    case 'base64':
    case 'base64url':
      return 4 / 3;
    case 'binary':
      return 9;
    case 'decimal':
      return 4;
    default:
      return 1;
  }
}
