/**
 * Identifier generation, and — the part people actually need — reading one back.
 *
 * All four formats here are 128-ish bits with a layout, not opaque blobs, and
 * the layout is the whole point: v4 is 122 random bits and tells you nothing,
 * while v7 and ULID carry a millisecond timestamp in their leading bits so they
 * sort chronologically as text and cluster in a B-tree index instead of
 * scattering writes across it. Being able to look at an ID you found in a log
 * and say "this row was created at 14:02" is why the decoder exists.
 *
 * Randomness is injected rather than imported. `logic.ts` never touches
 * `crypto` directly, so the generators are deterministic under test and the
 * component supplies `crypto.getRandomValues` via src/lib/tools/random.
 */

/**
 * BigInt constants written with the constructor, not the `0n` literal.
 * tsconfig targets ES2017, where that literal syntax does not exist — and the
 * 60-bit v1 clock and the 130-bit base32 range both exceed what a double can
 * hold exactly, so BigInt itself is not optional here.
 */
const B0 = BigInt(0);
const B5 = BigInt(5);
const B8 = BigInt(8);
const B12 = BigInt(12);
const B28 = BigInt(28);
const B31 = BigInt(31);
const B32 = BigInt(32);
const B48 = BigInt(48);
const B128 = BigInt(128);
const B255 = BigInt(255);
const B_TICKS_PER_MS = BigInt(10000);
const B_TIME_LOW_MASK = BigInt(0x0fff);

/* ── Crockford base32 ─────────────────────── */

/**
 * Crockford's alphabet: I, L, O and U are absent. The first three because they
 * are unreadable next to 1 and 0 on a receipt or over a phone, the fourth to
 * keep accidental obscenities out of generated identifiers.
 */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CROCKFORD_VALUE = (() => {
  const map = new Map<string, number>();
  for (let i = 0; i < CROCKFORD.length; i += 1) {
    map.set(CROCKFORD[i], i);
    map.set(CROCKFORD[i].toLowerCase(), i);
  }
  // Decoding is forgiving about the characters the alphabet omits, which is
  // half the reason to use it: a hand-copied I becomes 1, an O becomes 0.
  for (const [ch, value] of [
    ['I', 1],
    ['i', 1],
    ['L', 1],
    ['l', 1],
    ['O', 0],
    ['o', 0],
  ] as [string, number][]) {
    map.set(ch, value);
  }
  return map;
})();

/** Big-endian base32 of an integer, left-padded to `chars`. */
export function encodeBase32(value: bigint, chars: number): string {
  if (value < B0) throw new RangeError('encodeBase32 needs a non-negative value');
  let rest = value;
  let out = '';
  for (let i = 0; i < chars; i += 1) {
    out = CROCKFORD[Number(rest & B31)] + out;
    rest >>= B5;
  }
  if (rest !== B0) throw new RangeError(`value does not fit in ${chars} base32 characters`);
  return out;
}

export function decodeBase32(text: string): bigint {
  let value = B0;
  for (const ch of text) {
    const digit = CROCKFORD_VALUE.get(ch);
    if (digit === undefined) throw new RangeError(`not a Crockford base32 character: ${ch}`);
    value = value * B32 + BigInt(digit);
  }
  return value;
}

function bytesToBigInt(data: Uint8Array): bigint {
  let value = B0;
  for (let i = 0; i < data.length; i += 1) value = (value << B8) | BigInt(data[i]);
  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let rest = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(rest & B255);
    rest >>= B8;
  }
  return out;
}

const HEX = '0123456789abcdef';

export function hexOf(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 1) out += HEX[data[i] >> 4] + HEX[data[i] & 15];
  return out;
}

/* ── UUID ─────────────────────────────────── */

export type Bytes = (n: number) => Uint8Array;

export function formatUuid(data: Uint8Array): string {
  if (data.length !== 16) throw new RangeError('a UUID is 16 bytes');
  const hex = hexOf(data);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Accepts the hyphenated form, bare hex, braces, and the `urn:uuid:` prefix. */
export function parseUuid(text: string): Uint8Array | null {
  const clean = text
    .trim()
    .replace(/^urn:uuid:/i, '')
    .replace(/^[{(]|[)}]$/g, '')
    .replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(clean)) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Writes the RFC 9562 version nibble and the two-bit `10` variant in place. */
function stampVersion(data: Uint8Array, version: number): Uint8Array {
  data[6] = (data[6] & 0x0f) | (version << 4);
  data[8] = (data[8] & 0x3f) | 0x80;
  return data;
}

/** UUID v4: 122 random bits, six fixed. Carries no time and no ordering. */
export function uuidV4(random: Bytes): string {
  return formatUuid(stampVersion(random(16), 4));
}

export const MAX_V7_MS = 2 ** 48 - 1;

/**
 * UUID v7: 48-bit big-endian Unix milliseconds, then version, 12 random bits,
 * the variant, and 62 more random bits.
 *
 * The timestamp is in the leading bytes precisely so that lexicographic order
 * on the hex string is chronological order — the property v4 lacks and the
 * reason inserting v4 primary keys fragments an index.
 */
export function uuidV7(ms: number, random: Bytes): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_V7_MS) {
    throw new RangeError(`a v7 timestamp must be 0..${MAX_V7_MS} ms`);
  }
  const data = new Uint8Array(16);
  const stamp = BigInt(ms);
  for (let i = 0; i < 6; i += 1) {
    data[i] = Number((stamp >> BigInt(8 * (5 - i))) & B255);
  }
  data.set(random(10), 6);
  return formatUuid(stampVersion(data, 7));
}

/* ── ULID ─────────────────────────────────── */

export const MAX_ULID_MS = 2 ** 48 - 1;

/**
 * ULID: 10 base32 characters of millisecond timestamp, 16 of randomness.
 *
 * 48 bits of time in base32 is exactly 10 characters and 80 bits of randomness
 * exactly 16, so the encoding is lossless with no padding — which is why a ULID
 * is 26 characters and why sorting the strings sorts the timestamps.
 */
export function ulid(ms: number, random: Bytes): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_ULID_MS) {
    throw new RangeError(`a ULID timestamp must be 0..${MAX_ULID_MS} ms`);
  }
  return encodeBase32(BigInt(ms), 10) + encodeBase32(bytesToBigInt(random(10)), 16);
}

/* ── NanoID ───────────────────────────────── */

export const NANOID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
export const NANOID_URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const NANOID_NUMBERS = '0123456789';
export const NANOID_HEX = '0123456789abcdef';

/**
 * NanoID: `size` characters drawn uniformly from `alphabet`.
 *
 * `below` must be an unbiased uniform source — the point of taking it as an
 * argument is that `% alphabet.length` on a random byte is *not* one, and with a
 * 64-character alphabet the bias is invisible in the output while quietly
 * costing entropy the tool would still be claiming.
 */
export function nanoid(size: number, alphabet: string, below: (max: number) => number): string {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const unique = Array.from(new Set(alphabet.split('')));
  if (unique.length < 2) throw new RangeError('an alphabet needs at least two distinct characters');
  let out = '';
  for (let i = 0; i < size; i += 1) out += unique[below(unique.length)];
  return out;
}

/** log2(alphabet) × length, in bits. The honest figure for a uniform draw. */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize <= 1 || length <= 0) return 0;
  return Math.log2(alphabetSize) * length;
}

/**
 * How many identifiers you can mint before the chance of any collision reaches
 * `probability`, by the birthday bound n ≈ sqrt(2·N·ln(1/(1−p))).
 *
 * Returned as a float because the answer is an order of magnitude, not a count:
 * "about 2.6 × 10^16" is the useful reading, and rounding it to an integer
 * would imply a precision the approximation does not have.
 */
export function idsBeforeCollision(bits: number, probability = 0.01): number {
  if (bits <= 0 || probability <= 0 || probability >= 1) return 0;
  return Math.sqrt(2 * 2 ** bits * Math.log(1 / (1 - probability)));
}

/* ── Decoding ─────────────────────────────── */

export type IdKind = 'uuid' | 'ulid' | 'nanoid' | 'unknown';

export type DecodeNote =
  | 'nil'
  | 'max'
  | 'non-rfc-variant'
  | 'time-ordered'
  | 'not-time-based'
  | 'gregorian-epoch'
  | 'name-based'
  | 'unknown-version'
  | 'alphabet-guess'
  | 'ambiguous-length';

export type Decoded = {
  kind: IdKind;
  /** Normalised form: lower-case hyphenated UUID, upper-case ULID, as typed otherwise. */
  canonical: string;
  bytes: Uint8Array | null;
  version: number | null;
  variant: string | null;
  /** Unix milliseconds, when the format carries a timestamp. */
  timestampMs: number | null;
  /** Sub-millisecond remainder for the 100-nanosecond v1/v6 clock. */
  timestampSub100ns: number | null;
  /** Bits in the identifier that are random, as far as the layout says. */
  randomBits: number;
  /** Total bits the identifier occupies. */
  totalBits: number;
  /** The random part in hex, for eyeballing two IDs from the same millisecond. */
  randomHex: string | null;
  /** Layout, field by field, for the table. */
  parts: { label: string; value: string }[];
  notes: DecodeNote[];
};

/**
 * 100-nanosecond intervals between 1582-10-15 (the Gregorian reform, which the
 * UUID spec chose as its epoch) and 1970-01-01.
 */
export const GREGORIAN_OFFSET_100NS = BigInt('122192928000000000');

function decodeGregorian(ticks: bigint): { ms: number; sub: number } {
  const unix100ns = ticks - GREGORIAN_OFFSET_100NS;
  const ms = Number(unix100ns / B_TICKS_PER_MS);
  const sub = Number(((unix100ns % B_TICKS_PER_MS) + B_TICKS_PER_MS) % B_TICKS_PER_MS);
  return { ms, sub };
}

function decodeUuid(data: Uint8Array): Decoded {
  const version = data[6] >> 4;
  const variantBits = data[8] >> 5;
  const variant =
    (data[8] & 0xc0) === 0x80
      ? 'RFC 9562 (10x)'
      : (data[8] & 0x80) === 0x00
        ? 'NCS (0xx)'
        : (data[8] & 0xe0) === 0xc0
          ? 'Microsoft (110)'
          : 'reserved (111)';

  const notes: DecodeNote[] = [];
  if ((data[8] & 0xc0) !== 0x80) notes.push('non-rfc-variant');

  const allZero = data.every((byte) => byte === 0);
  const allOnes = data.every((byte) => byte === 0xff);
  if (allZero) notes.push('nil');
  if (allOnes) notes.push('max');

  let timestampMs: number | null = null;
  let sub: number | null = null;
  let randomBits = 0;
  let randomHex: string | null = null;
  const parts: { label: string; value: string }[] = [];

  if (version === 1 || version === 6) {
    const high = bytesToBigInt(data.subarray(0, 4));
    const mid = bytesToBigInt(data.subarray(4, 6));
    const low = bytesToBigInt(data.subarray(6, 8)) & B_TIME_LOW_MASK;
    // v1 stores the 60-bit clock little-end first; v6 reorders it so that the
    // most significant bits come first, which is the whole reason v6 exists.
    const ticks =
      version === 1 ? (low << B48) | (mid << B32) | high : (high << B28) | (mid << B12) | low;
    const decoded = decodeGregorian(ticks);
    timestampMs = decoded.ms;
    sub = decoded.sub;
    notes.push('gregorian-epoch');
    if (version === 6) notes.push('time-ordered');
    const clockSeq = ((data[8] & 0x3f) << 8) | data[9];
    const node = hexOf(data.subarray(10, 16));
    randomBits = 0;
    parts.push(
      { label: 'clock_seq', value: String(clockSeq) },
      { label: 'node', value: node },
      { label: 'multicast', value: (data[10] & 0x01) === 1 ? 'yes' : 'no' }
    );
    randomHex = node;
  } else if (version === 7) {
    const ms = Number(bytesToBigInt(data.subarray(0, 6)));
    timestampMs = ms;
    randomBits = 74; // 12 bits rand_a + 62 bits rand_b
    randomHex = hexOf(data.subarray(6, 16));
    notes.push('time-ordered');
    parts.push(
      { label: 'unix_ts_ms', value: String(ms) },
      { label: 'rand_a (12b)', value: String(((data[6] & 0x0f) << 8) | data[7]) },
      { label: 'rand_b (62b)', value: hexOf(data.subarray(8, 16)) }
    );
  } else if (version === 4) {
    randomBits = 122;
    randomHex = hexOf(data);
    notes.push('not-time-based');
  } else if (version === 3 || version === 5) {
    randomBits = 0;
    randomHex = hexOf(data);
    notes.push('name-based', 'not-time-based');
    parts.push({ label: 'hash', value: version === 3 ? 'MD5' : 'SHA-1' });
  } else if (version === 8) {
    randomBits = 0;
    randomHex = hexOf(data);
    parts.push({ label: 'custom', value: 'vendor-defined layout' });
  } else {
    notes.push('unknown-version');
    randomHex = hexOf(data);
  }

  return {
    kind: 'uuid',
    canonical: formatUuid(data),
    bytes: data,
    version: allZero || allOnes ? null : version,
    variant: `${variant} (bits ${variantBits.toString(2).padStart(3, '0')})`,
    timestampMs,
    timestampSub100ns: sub,
    randomBits,
    totalBits: 128,
    randomHex,
    parts,
    notes,
  };
}

/** Which of the well-known NanoID alphabets a string is consistent with. */
export function guessAlphabet(text: string): { name: string; size: number } {
  const chars = new Set(text.split(''));
  const fits = (alphabet: string) => [...chars].every((ch) => alphabet.includes(ch));
  if (fits(NANOID_NUMBERS)) return { name: 'digits', size: 10 };
  if (fits(NANOID_HEX)) return { name: 'hex', size: 16 };
  if (fits(CROCKFORD)) return { name: 'Crockford base32', size: 32 };
  if (fits(NANOID_URL_SAFE)) return { name: 'URL-safe 64', size: 64 };
  return { name: 'unknown', size: chars.size };
}

/** The highest millisecond a 48-bit ULID timestamp can hold: year 10889. */
export const ULID_MAX_TIME = 281474976710655;

export function decodeId(input: string): Decoded {
  const text = input.trim();
  if (text === '') {
    return {
      kind: 'unknown',
      canonical: '',
      bytes: null,
      version: null,
      variant: null,
      timestampMs: null,
      timestampSub100ns: null,
      randomBits: 0,
      totalBits: 0,
      randomHex: null,
      parts: [],
      notes: [],
    };
  }

  const uuid = parseUuid(text);
  if (uuid) return decodeUuid(uuid);

  // A ULID is 26 Crockford characters, and its first character cannot exceed 7:
  // 8 or above would make the 48-bit timestamp overflow into a 27th character's
  // worth of value. That check is what stops a 26-character NanoID being read
  // as a ULID and given a nonsense creation date.
  if (text.length === 26 && /^[0-9A-Za-z]{26}$/.test(text)) {
    let value: bigint | null = null;
    try {
      value = decodeBase32(text);
    } catch {
      value = null;
    }
    if (value !== null && value >> B128 === B0) {
      const timeChars = text.slice(0, 10);
      const ms = Number(decodeBase32(timeChars));
      if (ms <= ULID_MAX_TIME) {
        const randomness = decodeBase32(text.slice(10));
        const canonical = text.toUpperCase();
        return {
          kind: 'ulid',
          canonical,
          bytes: bigIntToBytes(value, 16),
          version: null,
          variant: null,
          timestampMs: ms,
          timestampSub100ns: null,
          randomBits: 80,
          totalBits: 128,
          randomHex: hexOf(bigIntToBytes(randomness, 10)),
          parts: [
            { label: 'time (10 chars)', value: canonical.slice(0, 10) },
            { label: 'random (16 chars)', value: canonical.slice(10) },
          ],
          notes: ['time-ordered'],
        };
      }
    }
  }

  const alphabet = guessAlphabet(text);
  const notes: DecodeNote[] = ['alphabet-guess', 'not-time-based'];
  if (text.length === 26) notes.push('ambiguous-length');
  return {
    kind: 'nanoid',
    canonical: text,
    bytes: null,
    version: null,
    variant: null,
    timestampMs: null,
    timestampSub100ns: null,
    randomBits: Math.round(entropyBits(alphabet.size, text.length)),
    totalBits: Math.round(entropyBits(alphabet.size, text.length)),
    randomHex: null,
    parts: [
      { label: 'length', value: String(text.length) },
      { label: 'alphabet', value: `${alphabet.name} (${alphabet.size})` },
    ],
    notes,
  };
}
