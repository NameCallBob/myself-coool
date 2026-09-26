/**
 * Bitwise arithmetic at a chosen width, and IEEE 754 taken apart.
 *
 * Everything here runs on BigInt with an explicit width mask, which is the point
 * rather than an implementation detail. JavaScript's own `&`, `|`, `^`, `<<` and
 * `>>` convert their operands to *signed 32-bit* integers first, so `1 << 32` is
 * 1 rather than zero (the shift count is masked to five bits) and any value
 * above 2^31 comes back negative. Neither behaviour matches C, Go, Rust, SQL or
 * a hardware register, which is usually what someone reaching for a bitwise
 * calculator is trying to reason about.
 *
 * All values are held as unsigned BigInts masked to the width; the signed
 * reading is derived on the way out. That keeps one representation in play
 * instead of two that disagree at the sign bit.
 *
 * BigInt constants are spelled with the constructor because tsconfig targets
 * ES2017, where the `0n` literal does not exist.
 */

const B0 = BigInt(0);
const B1 = BigInt(1);
const B5 = BigInt(5);

export type Width = 8 | 16 | 32 | 64;
export const WIDTHS: Width[] = [8, 16, 32, 64];

export function maskOf(width: Width): bigint {
  return (B1 << BigInt(width)) - B1;
}

export function signBit(width: Width): bigint {
  return B1 << BigInt(width - 1);
}

/**
 * Wraps any BigInt into the unsigned range of `width`, the way a register does.
 *
 * A single mask is enough even for negatives: BigInt bitwise operators work on
 * an infinite two's-complement representation, so `-1 & 0xFF` is already 255.
 */
export function wrap(value: bigint, width: Width): bigint {
  return value & maskOf(width);
}

/** The two's-complement signed reading of an unsigned value at that width. */
export function signedOf(value: bigint, width: Width): bigint {
  const unsigned = wrap(value, width);
  return unsigned >= signBit(width) ? unsigned - (B1 << BigInt(width)) : unsigned;
}

export function popcount(value: bigint): number {
  let rest = value < B0 ? -value : value;
  let bits = 0;
  while (rest > B0) {
    if ((rest & B1) === B1) bits += 1;
    rest >>= B1;
  }
  return bits;
}

/** Index of the highest set bit, or -1 for zero. */
export function highestBit(value: bigint): number {
  if (value <= B0) return -1;
  return value.toString(2).length - 1;
}

/** Number of trailing zero bits, or -1 for zero (where the answer is the width). */
export function trailingZeros(value: bigint): number {
  if (value === B0) return -1;
  let count = 0;
  let rest = value;
  while ((rest & B1) === B0) {
    count += 1;
    rest >>= B1;
  }
  return count;
}

/* ── Parsing ──────────────────────────────── */

export type IntParse = {
  /** Unsigned value at the chosen width. */
  value: bigint;
  radix: 2 | 8 | 10 | 16;
  /** The input did not fit in the width and was wrapped. */
  wrapped: boolean;
  /** The input was written with a minus sign. */
  negative: boolean;
};

/**
 * A literal in any of the four notations people write, wrapped to the width.
 *
 * `_` and spaces are stripped so nibble-grouped binary can be pasted straight
 * in. A negative literal becomes its two's complement at this width, which is
 * the only reading that makes `-1` and `0xFF` the same 8-bit value — as they are
 * in every machine.
 */
export function parseInteger(text: string, width: Width): IntParse | null {
  const clean = text.trim().replace(/[_\s',]/g, '');
  if (clean === '') return null;
  const negative = clean.startsWith('-');
  const body = clean.replace(/^[+-]/, '');
  if (body === '') return null;

  let radix: 2 | 8 | 10 | 16;
  let digits: string;
  if (/^0x[0-9a-f]+$/i.test(body)) {
    radix = 16;
    digits = body.slice(2);
  } else if (/^0b[01]+$/i.test(body)) {
    radix = 2;
    digits = body.slice(2);
  } else if (/^0o[0-7]+$/i.test(body)) {
    radix = 8;
    digits = body.slice(2);
  } else if (/^\d+$/.test(body)) {
    radix = 10;
    digits = body;
  } else {
    return null;
  }

  let magnitude = B0;
  const base = BigInt(radix);
  for (const ch of digits.toLowerCase()) {
    const digit = '0123456789abcdef'.indexOf(ch);
    if (digit < 0 || digit >= radix) return null;
    magnitude = magnitude * base + BigInt(digit);
  }

  const raw = negative ? -magnitude : magnitude;
  const value = wrap(raw, width);
  // Wrapped only if the literal could not be told apart from its wrapped form:
  // a negative literal in range is a faithful two's complement, not an overflow.
  const fits = negative
    ? magnitude <= signBit(width)
    : magnitude <= maskOf(width);
  return { value, radix, wrapped: !fits, negative };
}

/* ── Rendering ────────────────────────────── */

export function toRadix(value: bigint, width: Width, radix: 2 | 8 | 10 | 16): string {
  const unsigned = wrap(value, width);
  if (radix === 10) return unsigned.toString(10);
  const digitsPerWidth = radix === 16 ? width / 4 : radix === 8 ? Math.ceil(width / 3) : width;
  return unsigned.toString(radix).padStart(digitsPerWidth, '0');
}

/** Bits most-significant first, grouped for reading. */
export function toBinary(value: bigint, width: Width, group = 8): string {
  const bits = wrap(value, width).toString(2).padStart(width, '0');
  if (group <= 0) return bits;
  const chunks: string[] = [];
  for (let i = 0; i < bits.length; i += group) chunks.push(bits.slice(i, i + group));
  return chunks.join(' ');
}

/** One entry per bit, index 0 being the least significant. */
export function bitList(value: bigint, width: Width): boolean[] {
  const unsigned = wrap(value, width);
  const out: boolean[] = [];
  for (let i = 0; i < width; i += 1) out.push(((unsigned >> BigInt(i)) & B1) === B1);
  return out;
}

/** Big-endian bytes of the value at this width, for a hex dump. */
export function toBytes(value: bigint, width: Width): number[] {
  const unsigned = wrap(value, width);
  const out: number[] = [];
  for (let i = width / 8 - 1; i >= 0; i -= 1) {
    out.push(Number((unsigned >> BigInt(i * 8)) & BigInt(0xff)));
  }
  return out;
}

/* ── Operations ───────────────────────────── */

export type Op =
  | 'and'
  | 'or'
  | 'xor'
  | 'nand'
  | 'nor'
  | 'xnor'
  | 'andnot'
  | 'shl'
  | 'shr'
  | 'sar'
  | 'rotl'
  | 'rotr';

export const OPS: Op[] = [
  'and',
  'or',
  'xor',
  'nand',
  'nor',
  'xnor',
  'andnot',
  'shl',
  'shr',
  'sar',
  'rotl',
  'rotr',
];

/** True when the second operand is a shift distance rather than a bit pattern. */
export function isShift(op: Op): boolean {
  return op === 'shl' || op === 'shr' || op === 'sar' || op === 'rotl' || op === 'rotr';
}

export const SYMBOL: Record<Op, string> = {
  and: 'a & b',
  or: 'a | b',
  xor: 'a ^ b',
  nand: '~(a & b)',
  nor: '~(a | b)',
  xnor: '~(a ^ b)',
  andnot: 'a & ~b',
  shl: 'a << n',
  shr: 'a >> n (logical)',
  sar: 'a >> n (arithmetic)',
  rotl: 'rotate left n',
  rotr: 'rotate right n',
};

export function notOf(value: bigint, width: Width): bigint {
  return wrap(~wrap(value, width), width);
}

/**
 * Applies the operation at the given width.
 *
 * Shift distances are *not* masked into the width the way JavaScript and x86
 * both do. Shifting a 32-bit value by 32 gives zero here, because that is what
 * the arithmetic says; `1 << 32 === 1` in JavaScript is an artefact of the shift
 * count being taken modulo 32, and reproducing that artefact in a calculator
 * meant for reasoning about other languages would be actively misleading.
 * Rotation is the one case where the distance genuinely is modulo the width.
 */
export function applyOp(op: Op, a: bigint, b: bigint, width: Width): bigint {
  const left = wrap(a, width);
  const right = wrap(b, width);

  switch (op) {
    case 'and':
      return left & right;
    case 'or':
      return left | right;
    case 'xor':
      return left ^ right;
    case 'nand':
      return wrap(~(left & right), width);
    case 'nor':
      return wrap(~(left | right), width);
    case 'xnor':
      return wrap(~(left ^ right), width);
    case 'andnot':
      return left & wrap(~right, width);
    default:
      break;
  }

  // A shift distance is a count, so it is read from the operand's plain
  // magnitude rather than its wrapped bit pattern.
  const distance = Number(right);
  if (op === 'rotl' || op === 'rotr') {
    const turn = ((distance % width) + width) % width;
    if (turn === 0) return left;
    const leftShift = op === 'rotl' ? turn : width - turn;
    return wrap((left << BigInt(leftShift)) | (left >> BigInt(width - leftShift)), width);
  }

  if (distance >= width) {
    // Everything has shifted out. For an arithmetic right shift the sign bit
    // keeps arriving, so the result saturates to all-ones for a negative value.
    if (op === 'sar') return signedOf(left, width) < B0 ? maskOf(width) : B0;
    return B0;
  }
  const shift = BigInt(distance);
  if (op === 'shl') return wrap(left << shift, width);
  if (op === 'shr') return left >> shift;
  return wrap(signedOf(left, width) >> shift, width);
}

/* ── IEEE 754 ─────────────────────────────── */

export type FloatKind = 'f32' | 'f64';

export type FloatLayout = { bits: number; exponentBits: number; mantissaBits: number; bias: number };

export const LAYOUT: Record<FloatKind, FloatLayout> = {
  f32: { bits: 32, exponentBits: 8, mantissaBits: 23, bias: 127 },
  f64: { bits: 64, exponentBits: 11, mantissaBits: 52, bias: 1023 },
};

export type FloatClass = 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';

export type FloatParts = {
  kind: FloatKind;
  /** The raw bit pattern, unsigned. */
  bits: bigint;
  sign: 0 | 1;
  exponentRaw: number;
  /** Unbiased exponent as used in value = significand × 2^exponent. */
  exponent: number;
  mantissaRaw: bigint;
  /** The significand including the implicit leading bit, when there is one. */
  significand: bigint;
  classification: FloatClass;
  /** The number the bits denote, exactly, in decimal. Every float is exact. */
  exact: string;
  /** The same value as a JavaScript number, for comparison. */
  value: number;
  hex: string;
  binary: string;
};

/** The raw bit pattern of a JavaScript number in the chosen format. */
export function bitsOf(value: number, kind: FloatKind): bigint {
  const view = new DataView(new ArrayBuffer(8));
  if (kind === 'f32') {
    view.setFloat32(0, value, false);
    return BigInt(view.getUint32(0, false));
  }
  view.setFloat64(0, value, false);
  return (BigInt(view.getUint32(0, false)) << BigInt(32)) | BigInt(view.getUint32(4, false));
}

export function floatFromBits(bits: bigint, kind: FloatKind): number {
  const view = new DataView(new ArrayBuffer(8));
  const masked = bits & ((B1 << BigInt(LAYOUT[kind].bits)) - B1);
  if (kind === 'f32') {
    view.setUint32(0, Number(masked), false);
    return view.getFloat32(0, false);
  }
  view.setUint32(0, Number(masked >> BigInt(32)), false);
  view.setUint32(4, Number(masked & BigInt(0xffffffff)), false);
  return view.getFloat64(0, false);
}

/**
 * The exact decimal value of `mantissa × 2^exponent`.
 *
 * Every binary float is an exact decimal, just usually a long one — 0.1 as a
 * double is 0.1000000000000000055511151231257827021181583404541015625. The trick
 * is that dividing by 2^n is multiplying by 5^n and shifting the decimal point n
 * places, so no rounding is involved anywhere.
 */
export function exactDecimal(mantissa: bigint, exponent: number, negative: boolean): string {
  const sign = negative ? '-' : '';
  if (mantissa === B0) return `${sign}0`;
  if (exponent >= 0) return `${sign}${(mantissa << BigInt(exponent)).toString(10)}`;

  const places = -exponent;
  let scaled = mantissa;
  // Repeated multiplication rather than `5n ** 1074n`, which some engines
  // refuse outright for large BigInt exponents.
  for (let i = 0; i < places; i += 1) scaled *= B5;
  const digits = scaled.toString(10).padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places).replace(/0+$/, '');
  return `${sign}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}

export function decodeFloat(bits: bigint, kind: FloatKind): FloatParts {
  const layout = LAYOUT[kind];
  const masked = bits & ((B1 << BigInt(layout.bits)) - B1);
  const sign = Number((masked >> BigInt(layout.bits - 1)) & B1) as 0 | 1;
  const exponentRaw = Number((masked >> BigInt(layout.mantissaBits)) & ((B1 << BigInt(layout.exponentBits)) - B1));
  const mantissaRaw = masked & ((B1 << BigInt(layout.mantissaBits)) - B1);
  const maxExponent = (1 << layout.exponentBits) - 1;

  let classification: FloatClass;
  let significand: bigint;
  let exponent: number;
  if (exponentRaw === maxExponent) {
    classification = mantissaRaw === B0 ? 'infinity' : 'nan';
    significand = mantissaRaw;
    exponent = 0;
  } else if (exponentRaw === 0) {
    classification = mantissaRaw === B0 ? 'zero' : 'subnormal';
    // Subnormals have no implicit leading 1, and their exponent is pinned one
    // above the smallest normal one — which is what keeps the spacing uniform
    // across the gap to zero.
    significand = mantissaRaw;
    exponent = 1 - layout.bias - layout.mantissaBits;
  } else {
    classification = 'normal';
    significand = (B1 << BigInt(layout.mantissaBits)) | mantissaRaw;
    exponent = exponentRaw - layout.bias - layout.mantissaBits;
  }

  const exact =
    classification === 'infinity'
      ? sign === 1
        ? '-Infinity'
        : 'Infinity'
      : classification === 'nan'
        ? 'NaN'
        : exactDecimal(significand, exponent, sign === 1);

  return {
    kind,
    bits: masked,
    sign,
    exponentRaw,
    exponent,
    mantissaRaw,
    significand,
    classification,
    exact,
    value: floatFromBits(masked, kind),
    hex: masked.toString(16).padStart(layout.bits / 4, '0'),
    binary: masked.toString(2).padStart(layout.bits, '0'),
  };
}

/**
 * Reads a float from either a decimal number or a raw bit pattern.
 *
 * `0x3ff0000000000000` is the bits of 1.0 and `1.0` is the number; both are
 * things people paste, and there is no way to tell them apart except by
 * notation, so the notation decides.
 */
export function parseFloat754(text: string, kind: FloatKind): FloatParts | null {
  const clean = text.trim().replace(/[_\s',]/g, '');
  if (clean === '') return null;

  if (/^0x[0-9a-f]+$/i.test(clean) || /^0b[01]+$/i.test(clean)) {
    const radix = clean[1].toLowerCase() === 'x' ? 16 : 2;
    let value = B0;
    for (const ch of clean.slice(2).toLowerCase()) {
      value = value * BigInt(radix) + BigInt('0123456789abcdef'.indexOf(ch));
    }
    return decodeFloat(value, kind);
  }

  if (/^-?(inf|infinity)$/i.test(clean)) {
    return decodeFloat(bitsOf(clean.startsWith('-') ? -Infinity : Infinity, kind), kind);
  }
  if (/^nan$/i.test(clean)) return decodeFloat(bitsOf(Number.NaN, kind), kind);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(clean)) return null;

  // A decimal too large for the format overflows to infinity. That is a real
  // IEEE 754 outcome worth showing, not an input error, so it is not filtered.
  return decodeFloat(bitsOf(Number(clean), kind), kind);
}

/**
 * The unit in the last place, exactly.
 *
 * This is the number that explains floating point. A value is held as an
 * integer significand times 2^exponent, so the distance to its neighbour is
 * exactly 2^exponent: about 2.2 × 10^-16 near 1.0, and exactly 2 at 2^53 —
 * which is why adding 1 to 2^53 as a double does nothing at all.
 */
export function ulpOf(parts: FloatParts): string {
  if (parts.classification === 'infinity' || parts.classification === 'nan') return '—';
  return exactDecimal(B1, parts.exponent, false);
}

/**
 * Decimal digits the format carries, as the C limits define them: `significant`
 * is how many decimal digits always survive a trip through the format (FLT_DIG,
 * DBL_DIG) and `roundTrip` is how many are needed to write a value out and read
 * it back bit-for-bit (DECIMAL_DIG).
 */
export function decimalDigits(kind: FloatKind): { significant: number; roundTrip: number } {
  const precision = LAYOUT[kind].mantissaBits + 1;
  const log10Of2 = Math.LN2 / Math.LN10;
  return {
    significant: Math.floor((precision - 1) * log10Of2),
    roundTrip: Math.ceil(precision * log10Of2 + 1),
  };
}

/** Whether the decimal text survives the round trip through `kind` unchanged. */
export function roundTrips(text: string, kind: FloatKind): boolean {
  const parsed = parseFloat754(text, kind);
  if (!parsed) return false;
  return Number(text) === parsed.value;
}
