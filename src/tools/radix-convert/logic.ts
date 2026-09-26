/**
 * Base conversion on exact arithmetic.
 *
 * `parseInt(text, 36)` and `Number.prototype.toString(36)` exist, and both go
 * through a double: past 2^53 they round, so a 64-bit hex value pasted from a
 * log comes back with a wrong tail and nothing says so. Everything here runs
 * on BigInt for the integer part and on an exact rational for the fraction, so
 * the only lossy step is the one the caller asks for — a digit limit on a
 * fraction that repeats forever in the target base.
 *
 * The fraction is held as numerator over base^k rather than as a float for the
 * same reason: 0.1 decimal is 0.0001100110011… in binary, and the interesting
 * thing about that number is exactly the part a double throws away.
 */

export const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

export const MIN_BASE = 2;
export const MAX_BASE = 36;

/**
 * Digits of input accepted.
 *
 * The ceiling exists because rendering an integer is repeated division, which
 * is quadratic in the digit count: converting a 4 096-digit decimal to binary
 * is a few million BigInt limb operations (fine), and ten times that is a
 * visibly frozen tab (not fine).
 */
export const MAX_INPUT = 4096;

/** Fraction digits produced for a value that does not terminate. */
export const MAX_FRAC_DIGITS = 500;

export class RadixError extends Error {
  /** Assigned in the body: Node's type-stripping runner rejects parameter
   *  properties, and this class is constructed inside the test run. */
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = 'RadixError';
    this.index = index;
  }
}

export type Parsed = {
  negative: boolean;
  /** Integer part, exact. */
  int: bigint;
  /** Fraction numerator over `fracDen`, exact. Zero when there is no point. */
  frac: bigint;
  /** `base ** (number of fraction digits)`. One when there is no fraction. */
  fracDen: bigint;
  /** Fraction digits as written, including trailing zeros. */
  fracDigits: number;
};

/** Value of one digit character, or -1. Only single characters are digits —
 *  `indexOf` would happily match the substring "01" otherwise. */
export function digitValue(character: string): number {
  if (character.length !== 1) return -1;
  return DIGITS.indexOf(character.toLowerCase());
}

function checkBase(base: number, label: string): void {
  if (!Number.isInteger(base) || base < MIN_BASE || base > MAX_BASE) {
    throw new RadixError(`${label} base must be an integer from ${MIN_BASE} to ${MAX_BASE}`, -1);
  }
}

/**
 * Reads one number written in `base`.
 *
 * Separators people type to stay sane — spaces, underscores, apostrophes and
 * the `0x`/`0b`/`0o` prefixes when they match the chosen base — are accepted
 * and ignored. A digit that does not exist in the base is an error carrying its
 * position, so the UI can say which character is wrong rather than "invalid".
 */
export function parseRadix(text: string, base: number): Parsed {
  checkBase(base, 'source');
  if (text.length > MAX_INPUT) {
    throw new RadixError(`input longer than ${MAX_INPUT} characters`, MAX_INPUT);
  }

  let body = text.trim();
  let negative = false;
  if (body.startsWith('-')) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith('+')) {
    body = body.slice(1);
  }

  // A prefix is only stripped when it agrees with the selected base; `0b11` in
  // base 16 is a real hexadecimal number and must stay one.
  const prefixes: [string, number][] = [
    ['0x', 16],
    ['0b', 2],
    ['0o', 8],
  ];
  for (const [prefix, prefixBase] of prefixes) {
    if (body.toLowerCase().startsWith(prefix) && base === prefixBase) {
      body = body.slice(2);
      break;
    }
  }

  const cleaned = body.replace(/[\s_'’,]/g, '');
  if (cleaned === '') throw new RadixError('nothing to convert', 0);

  const point = cleaned.indexOf('.');
  if (cleaned.indexOf('.', point + 1) !== -1) {
    throw new RadixError('more than one radix point', cleaned.indexOf('.', point + 1));
  }
  const intText = point === -1 ? cleaned : cleaned.slice(0, point);
  const fracText = point === -1 ? '' : cleaned.slice(point + 1);

  const big = BigInt(base);
  let int = 0n;
  for (let i = 0; i < intText.length; i += 1) {
    const value = digitValue(intText[i]);
    if (value < 0 || value >= base) {
      throw new RadixError(`"${intText[i]}" is not a digit in base ${base}`, i);
    }
    int = int * big + BigInt(value);
  }

  let frac = 0n;
  let fracDen = 1n;
  for (let i = 0; i < fracText.length; i += 1) {
    const value = digitValue(fracText[i]);
    if (value < 0 || value >= base) {
      throw new RadixError(`"${fracText[i]}" is not a digit in base ${base}`, intText.length + 1 + i);
    }
    frac = frac * big + BigInt(value);
    fracDen *= big;
  }

  return { negative, int, frac, fracDen, fracDigits: fracText.length };
}

export type Rendered = {
  text: string;
  /** The fraction did not terminate within the digit budget. */
  truncated: boolean;
  /** Fraction digits actually emitted. */
  fracDigits: number;
};

/** Integer part of a BigInt in the given base, without a sign. */
function renderInt(value: bigint, base: number): string {
  if (value === 0n) return '0';
  const big = BigInt(base);
  let out = '';
  let rest = value;
  while (rest > 0n) {
    out = DIGITS[Number(rest % big)] + out;
    rest /= big;
  }
  return out;
}

/**
 * Writes a parsed number in `base`.
 *
 * The fraction is produced by repeatedly multiplying the remaining rational by
 * the target base and taking the integer part — long multiplication, the exact
 * mirror of the long division that reads it. It stops early when the remainder
 * hits zero (the value terminates in this base) and otherwise at the digit
 * budget, reporting that it did.
 */
export function renderRadix(parsed: Parsed, base: number, maxFracDigits = 32): Rendered {
  checkBase(base, 'target');
  const budget = Math.max(0, Math.min(maxFracDigits, MAX_FRAC_DIGITS));
  const big = BigInt(base);

  let out = renderInt(parsed.int, base);
  let digits = 0;
  let truncated = false;

  if (parsed.frac !== 0n && budget > 0) {
    let remainder = parsed.frac;
    let fraction = '';
    while (remainder !== 0n && digits < budget) {
      remainder *= big;
      const digit = remainder / parsed.fracDen;
      fraction += DIGITS[Number(digit)];
      remainder -= digit * parsed.fracDen;
      digits += 1;
    }
    truncated = remainder !== 0n;
    out += `.${fraction}`;
  } else if (parsed.frac !== 0n) {
    truncated = true;
  }

  const sign = parsed.negative && (parsed.int !== 0n || parsed.frac !== 0n) ? '-' : '';
  return { text: sign + out, truncated, fracDigits: digits };
}

export function convertRadix(
  text: string,
  fromBase: number,
  toBase: number,
  maxFracDigits = 32
): Rendered {
  return renderRadix(parseRadix(text, fromBase), toBase, maxFracDigits);
}

/** Digits per group for a base, by the convention people already read in. */
export function defaultGroupSize(base: number): number {
  if (base === 2) return 8;
  if (base === 16) return 4;
  if (base === 8) return 3;
  if (base === 10) return 3;
  return 0;
}

/**
 * Inserts a separator every `size` digits, counting outward from the radix
 * point in both directions — the integer part groups right-to-left and the
 * fraction left-to-right, which is what makes `1010 1100.1100 11` readable.
 */
export function groupDigits(text: string, size: number, separator = ' '): string {
  if (size <= 0) return text;

  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const point = body.indexOf('.');
  const whole = point === -1 ? body : body.slice(0, point);
  const fraction = point === -1 ? '' : body.slice(point + 1);

  const chunks: string[] = [];
  for (let end = whole.length; end > 0; end -= size) {
    chunks.unshift(whole.slice(Math.max(0, end - size), end));
  }
  let out = chunks.join(separator);

  if (point !== -1) {
    const fracChunks: string[] = [];
    for (let start = 0; start < fraction.length; start += size) {
      fracChunks.push(fraction.slice(start, start + size));
    }
    out += `.${fracChunks.join(separator)}`;
  }

  return (negative ? '-' : '') + out;
}

/** Bits needed for the magnitude of an integer. Zero needs none. */
export function bitLength(value: bigint): number {
  let magnitude = value < 0n ? -value : value;
  if (magnitude === 0n) return 0;
  let bits = 0;
  // Sixteen bits at a time: a 4 096-digit value is ~13 600 bits, and shifting
  // one bit at a time makes that measurably slower for no reason.
  while (magnitude >= 0x10000n) {
    magnitude >>= 16n;
    bits += 16;
  }
  while (magnitude > 0n) {
    magnitude >>= 1n;
    bits += 1;
  }
  return bits;
}

/**
 * Whether the fraction terminates in `base`, decided by factoring rather than
 * by trying: a fraction n/d terminates exactly when every prime factor of d
 * (after reduction) also divides the base. Useful because it distinguishes
 * "cut short by the digit budget" from "repeats forever".
 */
export function fractionTerminates(parsed: Parsed, base: number): boolean {
  if (parsed.frac === 0n) return true;
  // Reduce frac/fracDen.
  let a = parsed.frac;
  let b = parsed.fracDen;
  while (a !== 0n) {
    const next = b % a;
    b = a;
    a = next;
  }
  let denominator = parsed.fracDen / b;
  const big = BigInt(base);
  // Strip every factor the base shares with the denominator, repeatedly.
  for (;;) {
    let common = denominator;
    let other = big;
    while (common !== 0n) {
      const next = other % common;
      other = common;
      common = next;
    }
    if (other === 1n) break;
    denominator /= other;
  }
  return denominator === 1n;
}
