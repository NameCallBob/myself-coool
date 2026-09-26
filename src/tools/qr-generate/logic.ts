/**
 * A QR encoder, written out rather than imported.
 *
 * Scope is deliberate and stated in the UI: **byte mode only**, versions 1–10.
 * Byte mode encodes any UTF-8 text at 8 bits per byte, so it is the one mode
 * that is never wrong — numeric and alphanumeric modes would only make the
 * symbol smaller for a narrow class of input, and a wrong mode indicator
 * produces a code that scans as garbage. Versions stop at 10 because every
 * version needs its own error-correction block table and alignment-pattern
 * coordinates, and a table entry that is subtly wrong yields a symbol that
 * looks like a QR code and does not decode. Ten versions that are verified
 * beat forty that are guessed; 10-L still holds 271 bytes.
 *
 * Everything that has a published constant (total codewords, block splits,
 * byte capacities, format and version bit strings) is cross-checked in
 * logic.test.ts against that published value, and the Reed–Solomon step is
 * checked against its defining property — the codeword polynomial vanishing at
 * the generator's roots — rather than against a remembered vector.
 *
 * References: ISO/IEC 18004 §6 (encoding), §7 (symbol structure),
 * §8.5 (masking and penalty scores), Annex C (format/version information).
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export const EC_LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H'];

/** Fraction of codewords each level can lose and still decode (nominal). */
export const EC_RECOVERY: Record<EcLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

export const MIN_VERSION = 1;
export const MAX_VERSION = 10;

/** Two-bit level indicator that goes into the format information. */
const EC_INDICATOR: Record<EcLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };

/** Total codewords (data + error correction) per version. ISO 18004 Table 1. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/** Bits left over after the last whole codeword. ISO 18004 Table 1. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

/** Alignment pattern centre coordinates per version. ISO 18004 Table E.1. */
const ALIGNMENT_POSITIONS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export type EcBlockGroup = { blocks: number; dataPerBlock: number };
export type EcSpec = { ecPerBlock: number; groups: EcBlockGroup[] };

/**
 * Error-correction characteristics, ISO 18004 Table 13–16, versions 1–10.
 *
 * Each entry: error-correction codewords per block, then the block groups.
 * The test asserts every row against two independent published quantities —
 * the version's total codeword count and its byte-mode character capacity —
 * so a transcription slip here fails the suite instead of shipping.
 */
const EC_TABLE: Record<EcLevel, EcSpec[]> = {
  L: [
    { ecPerBlock: 7, groups: [{ blocks: 1, dataPerBlock: 19 }] },
    { ecPerBlock: 10, groups: [{ blocks: 1, dataPerBlock: 34 }] },
    { ecPerBlock: 15, groups: [{ blocks: 1, dataPerBlock: 55 }] },
    { ecPerBlock: 20, groups: [{ blocks: 1, dataPerBlock: 80 }] },
    { ecPerBlock: 26, groups: [{ blocks: 1, dataPerBlock: 108 }] },
    { ecPerBlock: 18, groups: [{ blocks: 2, dataPerBlock: 68 }] },
    { ecPerBlock: 20, groups: [{ blocks: 2, dataPerBlock: 78 }] },
    { ecPerBlock: 24, groups: [{ blocks: 2, dataPerBlock: 97 }] },
    { ecPerBlock: 30, groups: [{ blocks: 2, dataPerBlock: 116 }] },
    {
      ecPerBlock: 18,
      groups: [
        { blocks: 2, dataPerBlock: 68 },
        { blocks: 2, dataPerBlock: 69 },
      ],
    },
  ],
  M: [
    { ecPerBlock: 10, groups: [{ blocks: 1, dataPerBlock: 16 }] },
    { ecPerBlock: 16, groups: [{ blocks: 1, dataPerBlock: 28 }] },
    { ecPerBlock: 26, groups: [{ blocks: 1, dataPerBlock: 44 }] },
    { ecPerBlock: 18, groups: [{ blocks: 2, dataPerBlock: 32 }] },
    { ecPerBlock: 24, groups: [{ blocks: 2, dataPerBlock: 43 }] },
    { ecPerBlock: 16, groups: [{ blocks: 4, dataPerBlock: 27 }] },
    { ecPerBlock: 18, groups: [{ blocks: 4, dataPerBlock: 31 }] },
    {
      ecPerBlock: 22,
      groups: [
        { blocks: 2, dataPerBlock: 38 },
        { blocks: 2, dataPerBlock: 39 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { blocks: 3, dataPerBlock: 36 },
        { blocks: 2, dataPerBlock: 37 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { blocks: 4, dataPerBlock: 43 },
        { blocks: 1, dataPerBlock: 44 },
      ],
    },
  ],
  Q: [
    { ecPerBlock: 13, groups: [{ blocks: 1, dataPerBlock: 13 }] },
    { ecPerBlock: 22, groups: [{ blocks: 1, dataPerBlock: 22 }] },
    { ecPerBlock: 18, groups: [{ blocks: 2, dataPerBlock: 17 }] },
    { ecPerBlock: 26, groups: [{ blocks: 2, dataPerBlock: 24 }] },
    {
      ecPerBlock: 18,
      groups: [
        { blocks: 2, dataPerBlock: 15 },
        { blocks: 2, dataPerBlock: 16 },
      ],
    },
    { ecPerBlock: 24, groups: [{ blocks: 4, dataPerBlock: 19 }] },
    {
      ecPerBlock: 18,
      groups: [
        { blocks: 2, dataPerBlock: 14 },
        { blocks: 4, dataPerBlock: 15 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { blocks: 4, dataPerBlock: 18 },
        { blocks: 2, dataPerBlock: 19 },
      ],
    },
    {
      ecPerBlock: 20,
      groups: [
        { blocks: 4, dataPerBlock: 16 },
        { blocks: 4, dataPerBlock: 17 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { blocks: 6, dataPerBlock: 19 },
        { blocks: 2, dataPerBlock: 20 },
      ],
    },
  ],
  H: [
    { ecPerBlock: 17, groups: [{ blocks: 1, dataPerBlock: 9 }] },
    { ecPerBlock: 28, groups: [{ blocks: 1, dataPerBlock: 16 }] },
    { ecPerBlock: 22, groups: [{ blocks: 2, dataPerBlock: 13 }] },
    { ecPerBlock: 16, groups: [{ blocks: 4, dataPerBlock: 9 }] },
    {
      ecPerBlock: 22,
      groups: [
        { blocks: 2, dataPerBlock: 11 },
        { blocks: 2, dataPerBlock: 12 },
      ],
    },
    { ecPerBlock: 28, groups: [{ blocks: 4, dataPerBlock: 15 }] },
    {
      ecPerBlock: 26,
      groups: [
        { blocks: 4, dataPerBlock: 13 },
        { blocks: 1, dataPerBlock: 14 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { blocks: 4, dataPerBlock: 14 },
        { blocks: 2, dataPerBlock: 15 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { blocks: 4, dataPerBlock: 12 },
        { blocks: 4, dataPerBlock: 13 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { blocks: 6, dataPerBlock: 15 },
        { blocks: 2, dataPerBlock: 16 },
      ],
    },
  ],
};

export class QrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrError';
  }
}

/** Input does not fit any version this encoder implements. */
export class QrTooLong extends Error {
  /** Assigned in the body: Node's type-stripping runner rejects parameter properties. */
  readonly byteLength: number;
  readonly limit: number;

  constructor(byteLength: number, limit: number) {
    super(`payload is ${byteLength} bytes, over the ${limit}-byte limit of version ${MAX_VERSION}`);
    this.name = 'QrTooLong';
    this.byteLength = byteLength;
    this.limit = limit;
  }
}

function checkVersion(version: number): void {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new QrError(`version must be an integer ${MIN_VERSION}–${MAX_VERSION}, got ${version}`);
  }
}

/* ── GF(256) ───────────────────────────────── */

/**
 * The field the standard specifies: bytes modulo x^8 + x^4 + x^3 + x^2 + 1,
 * with 2 as the generator. Built once; the tables are 256 bytes each.
 */
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  EXP[255] = EXP[0];
})();

/** Multiplication in GF(256). Zero is absorbing, which the log table cannot say. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a & 0xff] + LOG[b & 0xff]) % 255];
}

/** α^n, wrapping at the field's 255-element multiplicative order. */
export function gfExp(n: number): number {
  return EXP[((n % 255) + 255) % 255];
}

/**
 * Generator polynomial for `count` error-correction codewords:
 * (x − α^0)(x − α^1)…(x − α^(count−1)), highest degree first, monic.
 */
export function rsGenerator(count: number): Uint8Array {
  if (!Number.isInteger(count) || count < 1) throw new QrError('ec codeword count must be >= 1');
  let poly = new Uint8Array([1]);
  for (let i = 0; i < count; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/**
 * The `count` error-correction codewords for one data block: the remainder of
 * data·x^count divided by the generator polynomial. Systematic, so the data
 * codewords are transmitted unchanged.
 */
export function rsEncode(data: Uint8Array, count: number): Uint8Array {
  const gen = rsGenerator(count);
  const work = new Uint8Array(data.length + count);
  work.set(data);
  for (let i = 0; i < data.length; i += 1) {
    const factor = work[i];
    if (factor === 0) continue;
    for (let j = 1; j <= count; j += 1) {
      work[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return work.slice(data.length);
}

/** Evaluate a codeword polynomial (highest degree first) at α^k. Used by tests. */
export function polyEval(coefficients: Uint8Array, at: number): number {
  let value = 0;
  for (let i = 0; i < coefficients.length; i += 1) {
    value = gfMul(value, at) ^ coefficients[i];
  }
  return value;
}

/* ── Capacity ──────────────────────────────── */

export function ecSpec(version: number, level: EcLevel): EcSpec {
  checkVersion(version);
  return EC_TABLE[level][version - 1];
}

export function totalCodewords(version: number): number {
  checkVersion(version);
  return TOTAL_CODEWORDS[version - 1];
}

export function remainderBits(version: number): number {
  checkVersion(version);
  return REMAINDER_BITS[version - 1];
}

/** Data codewords available to the bit stream, header included. */
export function dataCodewords(version: number, level: EcLevel): number {
  const spec = ecSpec(version, level);
  return spec.groups.reduce((sum, group) => sum + group.blocks * group.dataPerBlock, 0);
}

/** Character-count indicator width for byte mode. 8 bits up to version 9. */
export function countBits(version: number): number {
  checkVersion(version);
  return version < 10 ? 8 : 16;
}

/** Payload bytes that fit, after the 4-bit mode indicator and the count field. */
export function capacityBytes(version: number, level: EcLevel): number {
  const bits = dataCodewords(version, level) * 8 - 4 - countBits(version);
  return Math.floor(bits / 8);
}

/** Module count along one edge. */
export function sizeOf(version: number): number {
  checkVersion(version);
  return version * 4 + 17;
}

/** Smallest version holding `byteLength` bytes at this level, or null if none does. */
export function smallestVersion(byteLength: number, level: EcLevel): number | null {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    if (capacityBytes(version, level) >= byteLength) return version;
  }
  return null;
}

/* ── Bit stream ────────────────────────────── */

/**
 * Mode indicator, character count, payload, terminator, padding.
 *
 * Padding is the alternating 0xEC 0x11 the standard names, not zeros: a
 * zero-filled tail is legal but every real encoder emits these, and matching
 * them is what lets a comparison against another encoder's output mean
 * anything.
 */
export function buildDataCodewords(payload: Uint8Array, version: number, level: EcLevel): Uint8Array {
  const capacity = capacityBytes(version, level);
  if (payload.length > capacity) throw new QrTooLong(payload.length, capacity);

  const total = dataCodewords(version, level);
  const out = new Uint8Array(total);
  let bitPosition = 0;

  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      if (bitPosition >= total * 8) throw new QrError('bit stream overran the data capacity');
      if ((value >>> i) & 1) out[bitPosition >>> 3] |= 0x80 >>> (bitPosition & 7);
      bitPosition += 1;
    }
  };

  push(0b0100, 4); // byte mode
  push(payload.length, countBits(version));
  for (const byte of payload) push(byte, 8);

  // Terminator: four zero bits, or fewer if the stream is nearly full.
  const terminator = Math.min(4, total * 8 - bitPosition);
  push(0, terminator);
  // Round up to the codeword boundary, then alternate the pad codewords.
  if (bitPosition % 8 !== 0) push(0, 8 - (bitPosition % 8));
  let pad = 0xec;
  while (bitPosition < total * 8) {
    push(pad, 8);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return out;
}

/**
 * Split into blocks, error-correct each, then interleave.
 *
 * Interleaving is what makes the error correction worth having: a coffee stain
 * covers adjacent modules, and spreading each block's codewords across the
 * symbol turns one large burst into a few recoverable errors per block.
 */
export function interleave(data: Uint8Array, version: number, level: EcLevel): Uint8Array {
  const spec = ecSpec(version, level);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const group of spec.groups) {
    for (let i = 0; i < group.blocks; i += 1) {
      const block = data.subarray(offset, offset + group.dataPerBlock);
      offset += group.dataPerBlock;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  }

  const out = new Uint8Array(totalCodewords(version));
  let at = 0;
  const longest = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out[at++] = block[i];
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) out[at++] = block[i];
  }
  return out;
}

/* ── Format and version information ────────── */

/**
 * 15-bit format information: 5 data bits (level + mask) with a BCH(15,5)
 * remainder, XORed with 0x5412 so an all-light symbol is not a valid header.
 */
export function formatBits(level: EcLevel, mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) throw new QrError(`mask must be 0–7, got ${mask}`);
  const data = (EC_INDICATOR[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | (rem & 0x3ff)) ^ 0x5412) & 0x7fff;
}

/** 18-bit version information (version 7 and up): 6 data bits + BCH(18,6). */
export function versionBits(version: number): number {
  checkVersion(version);
  if (version < 7) throw new QrError('versions below 7 carry no version information');
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return ((version << 12) | (rem & 0xfff)) & 0x3ffff;
}

/* ── Matrix ────────────────────────────────── */

export type Matrix = {
  size: number;
  /** Row-major, one byte per module: 1 dark, 0 light. */
  modules: Uint8Array;
  /** Row-major flags: 1 where a function pattern owns the module. */
  reserved: Uint8Array;
};

function blank(size: number): Matrix {
  return { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
}

function set(matrix: Matrix, row: number, col: number, dark: boolean, functionModule: boolean): void {
  const at = row * matrix.size + col;
  matrix.modules[at] = dark ? 1 : 0;
  if (functionModule) matrix.reserved[at] = 1;
}

export function moduleAt(matrix: Matrix, row: number, col: number): number {
  if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return 0;
  return matrix.modules[row * matrix.size + col];
}

function isReserved(matrix: Matrix, row: number, col: number): boolean {
  return matrix.reserved[row * matrix.size + col] === 1;
}

/** Finder pattern with its separator, anchored at a corner. */
function drawFinder(matrix: Matrix, row: number, col: number): void {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= matrix.size || c >= matrix.size) continue;
      // Concentric 7×7 rings: dark, light, dark core. Chebyshev distance from
      // the centre says which ring a module is in.
      const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      set(matrix, r, c, d !== 2 && d <= 3, true);
    }
  }
}

function drawAlignment(matrix: Matrix, row: number, col: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      set(matrix, row + dr, col + dc, d !== 1, true);
    }
  }
}

/** Every function pattern except the format and version bits. */
function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const size = matrix.size;

  drawFinder(matrix, 0, 0);
  drawFinder(matrix, 0, size - 7);
  drawFinder(matrix, size - 7, 0);

  // Timing patterns: alternating modules along row 6 and column 6.
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    set(matrix, 6, i, dark, true);
    set(matrix, i, 6, dark, true);
  }

  const positions = ALIGNMENT_POSITIONS[version - 1];
  const last = positions.length - 1;
  for (let i = 0; i <= last; i += 1) {
    for (let j = 0; j <= last; j += 1) {
      // The three corners belong to the finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      drawAlignment(matrix, positions[i], positions[j]);
    }
  }

  // Reserve the format information strips so data placement skips them.
  // Index 6 is skipped in both: row 8 column 6 and row 6 column 8 belong to
  // the timing patterns, already drawn above — reserving them again would
  // blank the module the timing pattern needs dark.
  for (let i = 0; i < 9; i += 1) {
    if (i === 6) continue;
    set(matrix, 8, i, false, true);
    set(matrix, i, 8, false, true);
  }
  for (let i = 0; i < 8; i += 1) {
    set(matrix, 8, size - 1 - i, false, true);
    set(matrix, size - 1 - i, 8, false, true);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(matrix, b, a, false, true);
      set(matrix, a, b, false, true);
    }
  }
}

/** Both copies of the format information, plus the always-dark module. */
function drawFormat(matrix: Matrix, level: EcLevel, mask: number): void {
  const bits = formatBits(level, mask);
  const size = matrix.size;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) set(matrix, i, 8, bit(i), true);
  set(matrix, 7, 8, bit(6), true);
  set(matrix, 8, 8, bit(7), true);
  set(matrix, 8, 7, bit(8), true);
  for (let i = 9; i < 15; i += 1) set(matrix, 8, 14 - i, bit(i), true);

  for (let i = 0; i < 8; i += 1) set(matrix, 8, size - 1 - i, bit(i), true);
  for (let i = 8; i < 15; i += 1) set(matrix, size - 15 + i, 8, bit(i), true);

  set(matrix, size - 8, 8, true, true); // always dark
}

function drawVersion(matrix: Matrix, version: number): void {
  if (version < 7) return;
  const bits = versionBits(version);
  const size = matrix.size;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(matrix, b, a, dark, true);
    set(matrix, a, b, dark, true);
  }
}

/**
 * The zigzag: two-module columns from the right edge leftwards, direction
 * flipping each column, skipping column 6 because the timing pattern lives
 * there. Leftover modules stay light — that is what the remainder bits are.
 */
function drawCodewords(matrix: Matrix, codewords: Uint8Array): number {
  const size = matrix.size;
  let bit = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (isReserved(matrix, row, col)) continue;
        if (bit < totalBits) {
          const dark = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          set(matrix, row, col, dark, false);
          bit += 1;
        }
      }
    }
  }
  return bit;
}

/** Mask condition for pattern `mask` at (row, col). ISO 18004 Table 10. */
export function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      throw new QrError(`mask must be 0–7, got ${mask}`);
  }
}

/** XOR the mask over every non-function module. Applying it twice undoes it. */
export function applyMask(matrix: Matrix, mask: number): void {
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (isReserved(matrix, row, col)) continue;
      if (maskCondition(mask, row, col)) {
        matrix.modules[row * matrix.size + col] ^= 1;
      }
    }
  }
}

/** Penalty weights N1–N4. ISO 18004 §8.5.2 Table 11. */
const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

export type Penalty = { runs: number; blocks: number; finderLike: number; balance: number; total: number };

/**
 * The four penalty rules, reported individually because a single total tells
 * you nothing when a symbol scans badly.
 *
 * Rule 3 is written as the literal 11-module sequence the standard gives —
 * the 1:1:3:1:1 finder ratio with four light modules on one side — scanned in
 * both orientations, which is what a decoder's finder search would trip over.
 */
export function penaltyScore(matrix: Matrix): Penalty {
  const size = matrix.size;
  const at = (row: number, col: number) => matrix.modules[row * size + col];

  let runs = 0;
  let finderLike = 0;

  const scanLine = (read: (i: number) => number) => {
    let runColor = read(0);
    let runLength = 1;
    for (let i = 1; i < size; i += 1) {
      const value = read(i);
      if (value === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) runs += N1 + (runLength - 5);
        runColor = value;
        runLength = 1;
      }
    }
    if (runLength >= 5) runs += N1 + (runLength - 5);

    // 1011101 0000 and 0000 1011101, as an 11-bit sliding window.
    let window = 0;
    for (let i = 0; i < size; i += 1) {
      window = ((window << 1) | read(i)) & 0x7ff;
      if (i >= 10 && (window === 0b10111010000 || window === 0b00001011101)) finderLike += N3;
    }
  };

  for (let row = 0; row < size; row += 1) scanLine((i) => at(row, i));
  for (let col = 0; col < size; col += 1) scanLine((i) => at(i, col));

  let blocks = 0;
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const value = at(row, col);
      if (value === at(row, col + 1) && value === at(row + 1, col) && value === at(row + 1, col + 1)) {
        blocks += N2;
      }
    }
  }

  let dark = 0;
  for (let i = 0; i < matrix.modules.length; i += 1) dark += matrix.modules[i];
  const percent = (dark * 100) / (size * size);
  const balance = Math.floor(Math.abs(percent - 50) / 5) * N4;

  return { runs, blocks, finderLike, balance, total: runs + blocks + finderLike + balance };
}

export type QrSymbol = {
  version: number;
  level: EcLevel;
  mask: number;
  size: number;
  /** Row-major modules, 1 dark. Quiet zone not included. */
  modules: Uint8Array;
  payloadBytes: number;
  capacityBytes: number;
  dataCodewords: number;
  ecCodewords: number;
  blocks: number;
  penalty: Penalty;
  /** Penalty total for each of the eight masks, in mask order. */
  maskScores: number[];
};

export type EncodeOptions = {
  /** Fix the version instead of picking the smallest that fits. */
  version?: number;
  /** Fix the mask instead of scoring all eight. */
  mask?: number;
};

/**
 * Encode bytes into a finished symbol, choosing the version and the mask.
 *
 * The mask is chosen the way the standard says: build all eight, score each
 * with the penalty rules, keep the lowest. It costs eight matrix passes on a
 * symbol of at most 57×57 modules, which is nothing, and it is the difference
 * between a code that scans across readers and one that only scans on the
 * phone it was tested with.
 */
export function encodeBytes(payload: Uint8Array, level: EcLevel, options: EncodeOptions = {}): QrSymbol {
  let version: number;
  if (options.version === undefined) {
    const found = smallestVersion(payload.length, level);
    if (found === null) throw new QrTooLong(payload.length, capacityBytes(MAX_VERSION, level));
    version = found;
  } else {
    checkVersion(options.version);
    version = options.version;
    if (payload.length > capacityBytes(version, level)) {
      throw new QrTooLong(payload.length, capacityBytes(version, level));
    }
  }

  const codewords = interleave(buildDataCodewords(payload, version, level), version, level);
  const spec = ecSpec(version, level);
  const blocks = spec.groups.reduce((sum, group) => sum + group.blocks, 0);

  const base = blank(sizeOf(version));
  drawFunctionPatterns(base, version);
  drawVersion(base, version);
  drawCodewords(base, codewords);

  const candidates: { mask: number; modules: Uint8Array; penalty: Penalty }[] = [];
  const masks = options.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [options.mask];
  if (options.mask !== undefined) maskCondition(options.mask, 0, 0); // validates the range
  for (const mask of masks) {
    const trial: Matrix = {
      size: base.size,
      modules: Uint8Array.from(base.modules),
      reserved: Uint8Array.from(base.reserved),
    };
    applyMask(trial, mask);
    drawFormat(trial, level, mask);
    candidates.push({ mask, modules: trial.modules, penalty: penaltyScore(trial) });
  }

  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.penalty.total < best.penalty.total) best = candidate;
  }

  return {
    version,
    level,
    mask: best.mask,
    size: base.size,
    modules: best.modules,
    payloadBytes: payload.length,
    capacityBytes: capacityBytes(version, level),
    dataCodewords: dataCodewords(version, level),
    ecCodewords: totalCodewords(version) - dataCodewords(version, level),
    blocks,
    penalty: best.penalty,
    maskScores: candidates.map((candidate) => candidate.penalty.total),
  };
}

/** UTF-8 encode, then encode as bytes. Text is never re-interpreted. */
export function encodeText(text: string, level: EcLevel, options: EncodeOptions = {}): QrSymbol {
  return encodeBytes(new TextEncoder().encode(text), level, options);
}

/* ── Content templates ─────────────────────── */

/**
 * Add a scheme when the text plainly lacks one.
 *
 * A bare `example.com` in a QR code is a coin toss: some readers prepend
 * http://, some search for it, some show the raw text. `mailto:`, `tel:` and
 * the rest are left exactly as typed — guessing at an existing scheme is how
 * you break a payload that was already correct.
 */
export function normalizeUrl(input: string): string {
  const text = input.trim();
  if (text === '') return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) return text;
  if (text.startsWith('//')) return `https:${text}`;
  return `https://${text}`;
}

export type WifiAuth = 'WPA' | 'WEP' | 'nopass';

export type WifiConfig = {
  ssid: string;
  password: string;
  auth: WifiAuth;
  hidden: boolean;
};

/** Escape for the WIFI: payload, where \ ; , : and " are structural. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * The `WIFI:` payload as Android and iOS read it.
 *
 * Not an ISO or IETF format — a de-facto one from the Android ZXing days that
 * iOS 11 adopted. Field order is kept conventional (T, S, P, H) because some
 * readers parse positionally rather than by key.
 */
export function buildWifi(config: WifiConfig): string {
  const parts = [`T:${config.auth}`, `S:${escapeWifi(config.ssid)}`];
  if (config.auth !== 'nopass') parts.push(`P:${escapeWifi(config.password)}`);
  if (config.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

export type VCardFields = {
  lastName: string;
  firstName: string;
  organization: string;
  title: string;
  phone: string;
  email: string;
  url: string;
  address: string;
  note: string;
};

/** Escape for a vCard text value: backslash, comma, semicolon, newline. */
export function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/**
 * vCard 3.0, CRLF-delimited.
 *
 * 3.0 rather than 4.0 because that is what phone contact importers actually
 * accept; 4.0 payloads are silently ignored by several of them. Empty fields
 * are dropped rather than emitted blank — a blank TEL line makes some
 * importers reject the whole card.
 */
export function buildVCard(fields: VCardFields): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const last = escapeVCard(fields.lastName.trim());
  const first = escapeVCard(fields.firstName.trim());
  lines.push(`N:${last};${first};;;`);
  const full = [fields.firstName.trim(), fields.lastName.trim()].filter(Boolean).join(' ');
  lines.push(`FN:${escapeVCard(full)}`);
  const add = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed !== '') lines.push(`${key}:${escapeVCard(trimmed)}`);
  };
  add('ORG', fields.organization);
  add('TITLE', fields.title);
  if (fields.phone.trim() !== '') lines.push(`TEL;TYPE=CELL:${escapeVCard(fields.phone.trim())}`);
  if (fields.email.trim() !== '') lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(fields.email.trim())}`);
  add('URL', fields.url);
  // ADR has seven semicolon-separated components; a one-line address goes in
  // the street field, which is where importers look for it.
  if (fields.address.trim() !== '') lines.push(`ADR;TYPE=WORK:;;${escapeVCard(fields.address.trim())};;;;`);
  add('NOTE', fields.note);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/* ── Output ────────────────────────────────── */

export type SvgOptions = {
  /** Module size in SVG user units. */
  scale?: number;
  /** Light modules around the symbol; the standard asks for 4. */
  quietZone?: number;
  dark?: string;
  light?: string;
  /** Emit no background rectangle, so the page shows through. */
  transparent?: boolean;
};

/**
 * Horizontal runs of dark modules, as SVG path commands.
 *
 * One rect per module is the obvious rendering and produces a file several
 * times larger that some editors then choke on. Merging each row's runs into
 * one path keeps a version-10 symbol in a couple of kilobytes.
 */
export function toPathData(symbol: QrSymbol, scale: number, offset: number): string {
  const parts: string[] = [];
  for (let row = 0; row < symbol.size; row += 1) {
    let col = 0;
    while (col < symbol.size) {
      if (symbol.modules[row * symbol.size + col] === 0) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < symbol.size && symbol.modules[row * symbol.size + col + run] === 1) run += 1;
      const x = (offset + col) * scale;
      const y = (offset + row) * scale;
      parts.push(`M${x} ${y}h${run * scale}v${scale}h${-run * scale}z`);
      col += run;
    }
  }
  return parts.join('');
}

export function toSvg(symbol: QrSymbol, options: SvgOptions = {}): string {
  const scale = options.scale ?? 8;
  const quiet = options.quietZone ?? 4;
  const dark = options.dark ?? '#000000';
  const light = options.light ?? '#ffffff';
  const span = (symbol.size + quiet * 2) * scale;
  const path = toPathData(symbol, scale, quiet);
  const background = options.transparent ? '' : `<rect width="${span}" height="${span}" fill="${light}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${span}" height="${span}" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img">`,
    background,
    `<path fill="${dark}" d="${path}"/>`,
    '</svg>',
  ].join('');
}

/** Plain-text rendering, two characters per module so it stays square. */
export function toAsciiArt(symbol: QrSymbol, quietZone = 2): string {
  const rows: string[] = [];
  const width = symbol.size + quietZone * 2;
  const blankRow = '  '.repeat(width);
  for (let i = 0; i < quietZone; i += 1) rows.push(blankRow);
  for (let row = 0; row < symbol.size; row += 1) {
    let line = '  '.repeat(quietZone);
    for (let col = 0; col < symbol.size; col += 1) {
      line += symbol.modules[row * symbol.size + col] === 1 ? '██' : '  ';
    }
    rows.push(line + '  '.repeat(quietZone));
  }
  for (let i = 0; i < quietZone; i += 1) rows.push(blankRow);
  return rows.join('\n');
}
