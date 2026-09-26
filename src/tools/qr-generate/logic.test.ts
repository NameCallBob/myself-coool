import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EC_LEVELS,
  MAX_VERSION,
  QrError,
  QrTooLong,
  applyMask,
  buildDataCodewords,
  buildVCard,
  buildWifi,
  capacityBytes,
  countBits,
  dataCodewords,
  ecSpec,
  encodeBytes,
  encodeText,
  escapeVCard,
  escapeWifi,
  formatBits,
  gfExp,
  gfMul,
  interleave,
  maskCondition,
  moduleAt,
  normalizeUrl,
  penaltyScore,
  polyEval,
  remainderBits,
  rsEncode,
  rsGenerator,
  sizeOf,
  smallestVersion,
  toAsciiArt,
  toPathData,
  toSvg,
  totalCodewords,
  versionBits,
  type EcLevel,
  type QrSymbol,
} from './logic.ts';

/* ── An independent reader ─────────────────────────────────────────────
 * The encoder is only trustworthy if something else can read what it wrote.
 * The helpers below re-derive the function-pattern map, the codeword path and
 * the format information from the standard rather than calling into logic.ts,
 * so a layout mistake shows up as a decode failure instead of cancelling out.
 * ─────────────────────────────────────────────────────────────────────── */

/** ISO 18004 Table E.1, written out again on purpose. */
const ALIGNMENT: number[][] = [
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

function functionMap(version: number): Uint8Array {
  const size = version * 4 + 17;
  const map = new Uint8Array(size * size);
  const mark = (row: number, col: number) => {
    if (row >= 0 && col >= 0 && row < size && col < size) map[row * size + col] = 1;
  };

  // Finder patterns with separators: an 8×8 block in three corners.
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      mark(r, c);
      mark(r, size - 1 - c);
      mark(size - 1 - r, c);
    }
  }
  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }
  // Alignment patterns, skipping the finder corners.
  const positions = ALIGNMENT[version - 1];
  for (const row of positions) {
    for (const col of positions) {
      const topLeft = row <= 8 && col <= 8;
      const topRight = row <= 8 && col >= size - 9;
      const bottomLeft = row >= size - 9 && col <= 8;
      if (topLeft || topRight || bottomLeft) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) mark(row + dr, col + dc);
      }
    }
  }
  // Format information, both copies, plus the always-dark module.
  for (let i = 0; i < 9; i += 1) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(b, a);
      mark(a, b);
    }
  }
  return map;
}

/** Polynomial remainder modulo the format-information generator, x^10+x^8+x^5+x^4+x^2+x+1. */
function mod537(value: number): number {
  let rem = value;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return rem;
}

/** Remainder modulo the version-information generator. */
function mod1f25(value: number): number {
  let rem = value;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return rem;
}

/** ISO 18004 Table 12: the two-bit error-correction level indicator. */
const LEVEL_FROM_INDICATOR: EcLevel[] = ['M', 'L', 'H', 'Q'];

function readFormat(symbol: QrSymbol, copy: 0 | 1): { level: EcLevel; mask: number } {
  const size = symbol.size;
  const read = (row: number, col: number) => moduleAt({ size, modules: symbol.modules, reserved: symbol.modules }, row, col);
  let bits = 0;
  if (copy === 0) {
    for (let i = 0; i <= 5; i += 1) bits |= read(i, 8) << i;
    bits |= read(7, 8) << 6;
    bits |= read(8, 8) << 7;
    bits |= read(8, 7) << 8;
    for (let i = 9; i < 15; i += 1) bits |= read(8, 14 - i) << i;
  } else {
    for (let i = 0; i < 8; i += 1) bits |= read(8, size - 1 - i) << i;
    for (let i = 8; i < 15; i += 1) bits |= read(size - 15 + i, 8) << i;
  }
  const unmasked = bits ^ 0x5412;
  assert.equal(mod537(unmasked), 0, `format information copy ${copy} is not a valid BCH codeword`);
  const data = unmasked >>> 10;
  return { level: LEVEL_FROM_INDICATOR[data >>> 3], mask: data & 7 };
}

function readVersionInfo(symbol: QrSymbol): number {
  const size = symbol.size;
  let bits = 0;
  for (let i = 0; i < 18; i += 1) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    bits |= symbol.modules[b * size + a] << i;
    assert.equal(
      symbol.modules[b * size + a],
      symbol.modules[a * size + b],
      'the two version-information copies disagree'
    );
  }
  assert.equal(mod1f25(bits), 0, 'version information is not a valid BCH codeword');
  return bits >>> 12;
}

type Decoded = { version: number; level: EcLevel; mask: number; payload: Uint8Array };

/** Read a symbol back to its payload, checking the error correction on the way. */
function decode(symbol: QrSymbol): Decoded {
  const size = symbol.size;
  assert.equal((size - 17) % 4, 0, 'symbol size is not 4v+17');
  const version = (size - 17) / 4;
  const first = readFormat(symbol, 0);
  const second = readFormat(symbol, 1);
  assert.deepEqual(first, second, 'the two format-information copies disagree');
  const { level, mask } = first;
  if (version >= 7) assert.equal(readVersionInfo(symbol), version, 'version information disagrees with the size');

  const map = functionMap(version);
  assert.equal(
    symbol.modules[(size - 8) * size + 8],
    1,
    'the module at (4v+9, 8) must always be dark'
  );

  // Undo the mask on every non-function module.
  const plain = Uint8Array.from(symbol.modules);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (map[row * size + col] === 1) continue;
      if (maskCondition(mask, row, col)) plain[row * size + col] ^= 1;
    }
  }

  // Walk the interleaved codeword path.
  const total = totalCodewords(version);
  const bitsOut: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (map[row * size + col] === 1) continue;
        bitsOut.push(plain[row * size + col]);
      }
    }
  }
  assert.equal(bitsOut.length, total * 8 + remainderBits(version), 'wrong number of data modules');
  const codewords = new Uint8Array(total);
  for (let i = 0; i < total * 8; i += 1) {
    if (bitsOut[i]) codewords[i >>> 3] |= 0x80 >>> (i & 7);
  }
  for (let i = total * 8; i < bitsOut.length; i += 1) {
    assert.equal(bitsOut[i], 0, 'remainder bits must be light');
  }

  // De-interleave, then check each block against the Reed-Solomon roots.
  const spec = ecSpec(version, level);
  const blockSizes: number[] = [];
  for (const group of spec.groups) {
    for (let i = 0; i < group.blocks; i += 1) blockSizes.push(group.dataPerBlock);
  }
  const dataBlocks = blockSizes.map((length) => new Uint8Array(length));
  const ecBlocks = blockSizes.map(() => new Uint8Array(spec.ecPerBlock));
  let at = 0;
  const longest = Math.max(...blockSizes);
  for (let i = 0; i < longest; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) {
      if (i < blockSizes[b]) dataBlocks[b][i] = codewords[at++];
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) ecBlocks[b][i] = codewords[at++];
  }
  assert.equal(at, total, 'de-interleaving did not consume every codeword');

  for (let b = 0; b < blockSizes.length; b += 1) {
    const full = new Uint8Array(blockSizes[b] + spec.ecPerBlock);
    full.set(dataBlocks[b]);
    full.set(ecBlocks[b], blockSizes[b]);
    for (let k = 0; k < spec.ecPerBlock; k += 1) {
      assert.equal(polyEval(full, gfExp(k)), 0, `block ${b} does not vanish at alpha^${k}`);
    }
  }

  // Parse the bit stream: byte mode only.
  const stream: number[] = [];
  for (const block of dataBlocks) {
    for (const byte of block) {
      for (let i = 7; i >= 0; i -= 1) stream.push((byte >>> i) & 1);
    }
  }
  const take = (offset: number, width: number) => {
    let value = 0;
    for (let i = 0; i < width; i += 1) value = (value << 1) | stream[offset + i];
    return value;
  };
  assert.equal(take(0, 4), 0b0100, 'mode indicator must be byte mode');
  const width = countBits(version);
  const length = take(4, width);
  const payload = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) payload[i] = take(4 + width + i * 8, 8);
  return { version, level, mask, payload };
}

function roundTrip(text: string, level: EcLevel, options?: { version?: number; mask?: number }) {
  const symbol = encodeText(text, level, options);
  const decoded = decode(symbol);
  assert.equal(new TextDecoder().decode(decoded.payload), text);
  assert.equal(decoded.level, level);
  assert.equal(decoded.mask, symbol.mask);
  assert.equal(decoded.version, symbol.version);
  return symbol;
}

/* ── The field ─────────────────────────────── */

test('GF(256) uses the reduction polynomial the standard names', () => {
  // x^8 reduces to x^4+x^3+x^2+1 = 0b11101 = 29.
  assert.equal(gfExp(8), 29);
  assert.equal(gfMul(2, 128), 29);
  assert.equal(gfExp(0), 1);
  assert.equal(gfExp(255), 1, 'the multiplicative order is 255');
  assert.equal(gfMul(0, 123), 0);
  assert.equal(gfMul(123, 0), 0);
  assert.equal(gfMul(1, 200), 200);
  // Every non-zero element has an inverse, so every product is non-zero.
  for (let a = 1; a < 256; a += 1) assert.notEqual(gfMul(a, gfExp(255 - 1)), 0);
});

test('the generator polynomial is monic with the right degree', () => {
  for (const count of [7, 10, 13, 17, 18, 20, 22, 24, 26, 28, 30]) {
    const gen = rsGenerator(count);
    assert.equal(gen.length, count + 1);
    assert.equal(gen[0], 1);
    // Its defining property: the roots are alpha^0 .. alpha^(count-1).
    for (let i = 0; i < count; i += 1) {
      assert.equal(polyEval(gen, gfExp(i)), 0, `generator for ${count} has no root at alpha^${i}`);
    }
  }
  assert.throws(() => rsGenerator(0), QrError);
});

test('the 7-codeword generator matches the published coefficient list', () => {
  // ISO 18004 Annex A: alpha exponents 0 87 229 146 149 238 102 21.
  const expected = [0, 87, 229, 146, 149, 238, 102, 21].map((exponent) => gfExp(exponent));
  assert.deepEqual(Array.from(rsGenerator(7)), expected);
});

test('Reed-Solomon output vanishes at every root of the generator', () => {
  const data = Uint8Array.from({ length: 19 }, (_, i) => (i * 37 + 11) & 0xff);
  const ec = rsEncode(data, 7);
  assert.equal(ec.length, 7);
  const full = new Uint8Array(data.length + ec.length);
  full.set(data);
  full.set(ec, data.length);
  for (let i = 0; i < 7; i += 1) assert.equal(polyEval(full, gfExp(i)), 0);
  // Systematic: the data codewords come through untouched.
  assert.deepEqual(Array.from(full.subarray(0, 19)), Array.from(data));
  // Zero in, zero out — the remainder of the zero polynomial.
  assert.deepEqual(Array.from(rsEncode(new Uint8Array(13), 13)), Array.from(new Uint8Array(13)));
});

test('a single corrupted codeword changes the syndrome', () => {
  const data = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
  const ec = rsEncode(data, 10);
  const full = new Uint8Array([...data, ...ec]);
  full[3] ^= 0x01;
  const syndromes = Array.from({ length: 10 }, (_, k) => polyEval(full, gfExp(k)));
  assert.ok(
    syndromes.some((value) => value !== 0),
    'a flipped bit must show up in the syndromes'
  );
});

/* ── Tables ────────────────────────────────── */

test('every block table row adds up to the version total codeword count', () => {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    for (const level of EC_LEVELS) {
      const spec = ecSpec(version, level);
      const sum = spec.groups.reduce(
        (total, group) => total + group.blocks * (group.dataPerBlock + spec.ecPerBlock),
        0
      );
      assert.equal(
        sum,
        totalCodewords(version),
        `version ${version}-${level}: blocks sum to ${sum}, not ${totalCodewords(version)}`
      );
      // Group sizes differ by at most one codeword, per ISO 18004 §7.5.1.
      if (spec.groups.length === 2) {
        assert.equal(spec.groups[1].dataPerBlock - spec.groups[0].dataPerBlock, 1);
      }
      assert.ok(spec.groups.length <= 2);
    }
  }
});

test('byte-mode capacities match the published character capacity table', () => {
  // ISO 18004 Table 7, 8-bit byte mode, versions 1-10.
  const published: Record<EcLevel, number[]> = {
    L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
    M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
    Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151],
    H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119],
  };
  for (const level of EC_LEVELS) {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      assert.equal(
        capacityBytes(version, level),
        published[level][version - 1],
        `version ${version}-${level}`
      );
    }
  }
});

test('the codeword total agrees with the number of free modules', () => {
  // Independent of the table: count what the layout actually leaves over.
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const size = version * 4 + 17;
    const map = functionMap(version);
    let free = 0;
    for (let i = 0; i < map.length; i += 1) if (map[i] === 0) free += 1;
    assert.equal(size, sizeOf(version));
    assert.equal(
      free,
      totalCodewords(version) * 8 + remainderBits(version),
      `version ${version} has ${free} free modules`
    );
  }
});

test('version and level bounds are enforced', () => {
  assert.throws(() => ecSpec(0, 'L'), QrError);
  assert.throws(() => ecSpec(11, 'L'), QrError);
  assert.throws(() => ecSpec(1.5, 'L'), QrError);
  assert.throws(() => versionBits(6), QrError);
  assert.throws(() => formatBits('L', 8), QrError);
  assert.throws(() => maskCondition(9, 0, 0), QrError);
  assert.equal(countBits(9), 8);
  assert.equal(countBits(10), 16);
  assert.equal(dataCodewords(1, 'L'), 19);
  assert.equal(totalCodewords(1) - dataCodewords(1, 'L'), 7);
});

test('smallestVersion picks the first version that fits', () => {
  assert.equal(smallestVersion(0, 'L'), 1);
  assert.equal(smallestVersion(17, 'L'), 1);
  assert.equal(smallestVersion(18, 'L'), 2);
  assert.equal(smallestVersion(7, 'H'), 1);
  assert.equal(smallestVersion(8, 'H'), 2);
  assert.equal(smallestVersion(271, 'L'), 10);
  assert.equal(smallestVersion(272, 'L'), null);
});

/* ── Format and version information ────────── */

test('format information matches the published bit string and stays a valid codeword', () => {
  // ISO 18004 Table C.1, level L with mask 0.
  assert.equal(formatBits('L', 0).toString(2).padStart(15, '0'), '111011111000100');
  const all: number[] = [];
  for (const level of EC_LEVELS) {
    for (let mask = 0; mask < 8; mask += 1) {
      const bits = formatBits(level, mask);
      assert.ok(bits >= 0 && bits < 0x8000);
      assert.equal(mod537(bits ^ 0x5412), 0, `${level}/${mask} is not a BCH codeword`);
      all.push(bits);
    }
  }
  assert.equal(new Set(all).size, 32, 'all 32 format strings must be distinct');
  // BCH(15,5) has minimum distance 7; that is what lets a reader recover the
  // header from a scuffed corner.
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      let distance = 0;
      let diff = all[i] ^ all[j];
      while (diff !== 0) {
        distance += diff & 1;
        diff >>>= 1;
      }
      assert.ok(distance >= 7, `format strings ${i} and ${j} differ in only ${distance} bits`);
    }
  }
});

test('version information matches the published bit string', () => {
  // ISO 18004 Table D.1, version 7.
  assert.equal(versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  for (let version = 7; version <= MAX_VERSION; version += 1) {
    const bits = versionBits(version);
    assert.equal(mod1f25(bits), 0, `version ${version} is not a BCH codeword`);
    assert.equal(bits >>> 12, version);
  }
});

/* ── Masking and scoring ───────────────────── */

test('mask conditions match the table at hand-checked positions', () => {
  // ISO 18004 Table 10, spot-checked by hand.
  assert.equal(maskCondition(0, 0, 0), true);
  assert.equal(maskCondition(0, 0, 1), false);
  assert.equal(maskCondition(1, 2, 5), true);
  assert.equal(maskCondition(1, 3, 5), false);
  assert.equal(maskCondition(2, 4, 6), true);
  assert.equal(maskCondition(2, 4, 7), false);
  assert.equal(maskCondition(3, 1, 2), true);
  assert.equal(maskCondition(4, 0, 0), true);
  assert.equal(maskCondition(4, 2, 0), false);
  assert.equal(maskCondition(5, 1, 1), false);
  assert.equal(maskCondition(5, 0, 5), true);
  assert.equal(maskCondition(6, 1, 1), true);
  assert.equal(maskCondition(7, 1, 3), true);
  assert.equal(maskCondition(7, 1, 1), false);
  assert.equal(maskCondition(7, 1, 2), false);
});

test('applying a mask twice restores the matrix', () => {
  const size = 21;
  const matrix = {
    size,
    modules: Uint8Array.from({ length: size * size }, (_, i) => (i * 7) % 3 === 0 ? 1 : 0),
    reserved: Uint8Array.from({ length: size * size }, (_, i) => (i % 17 === 0 ? 1 : 0)),
  };
  const before = Uint8Array.from(matrix.modules);
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(matrix, mask);
    assert.notDeepEqual(Array.from(matrix.modules), Array.from(before));
    applyMask(matrix, mask);
    assert.deepEqual(Array.from(matrix.modules), Array.from(before));
  }
});

test('the penalty score of an all-light 21x21 grid is the hand-computed value', () => {
  const size = 21;
  const matrix = { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
  const score = penaltyScore(matrix);
  // Rule 1: 42 lines, each one run of 21 modules -> 3 + 16 = 19 each.
  assert.equal(score.runs, 42 * 19);
  // Rule 2: 20x20 same-colour 2x2 blocks -> 3 each.
  assert.equal(score.blocks, 400 * 3);
  // Rule 3: the finder-like pattern needs dark modules.
  assert.equal(score.finderLike, 0);
  // Rule 4: 0% dark -> floor(50/5) * 10.
  assert.equal(score.balance, 100);
  assert.equal(score.total, 798 + 1200 + 0 + 100);
});

test('the finder-like rule fires on both orientations of the 11-module pattern', () => {
  const size = 11;
  const make = (bits: string) => {
    const modules = new Uint8Array(size * size);
    for (let i = 0; i < size; i += 1) modules[i] = bits[i] === '1' ? 1 : 0;
    return { size, modules, reserved: new Uint8Array(size * size) };
  };
  const leading = penaltyScore(make('10111010000'));
  const trailing = penaltyScore(make('00001011101'));
  assert.equal(leading.finderLike, 40);
  assert.equal(trailing.finderLike, 40);
  assert.equal(penaltyScore(make('10101010101')).finderLike, 0);
});

test('an even balance of dark modules costs nothing under rule 4', () => {
  const size = 10;
  const modules = new Uint8Array(size * size);
  for (let i = 0; i < 50; i += 1) modules[i * 2] = 1;
  assert.equal(penaltyScore({ size, modules, reserved: new Uint8Array(size * size) }).balance, 0);
});

/* ── The bit stream ────────────────────────── */

test('the data codewords carry the mode, the count, the payload and the standard padding', () => {
  const codewords = buildDataCodewords(new Uint8Array([0x41, 0x42]), 1, 'L');
  assert.equal(codewords.length, 19);
  // 0100 | 00000010 | 01000001 | 01000010 | 0000 ...
  assert.equal(codewords[0], 0x40 | 0x00);
  assert.equal(codewords[1], 0x24);
  assert.equal(codewords[2], 0x14);
  assert.equal(codewords[3], 0x20);
  // 4 + 8 + 16 payload bits + the 4-bit terminator land exactly on a codeword
  // boundary, so the alternating pad codewords start at index 4.
  assert.equal(codewords[4], 0xec);
  assert.equal(codewords[5], 0x11);
  assert.equal(codewords[6], 0xec);
  assert.equal(codewords[18], 0xec);
});

test('a full payload leaves no room for padding and still terminates', () => {
  const payload = Uint8Array.from({ length: 17 }, (_, i) => i + 1);
  const codewords = buildDataCodewords(payload, 1, 'L');
  assert.equal(codewords.length, 19);
  // 12 header bits + 136 payload bits = 148 of 152; the terminator is the
  // remaining 4 bits, so nothing is truncated.
  assert.equal(codewords[18] & 0x0f, 0);
  assert.equal(decode(encodeBytes(payload, 'L')).payload.length, 17);
  assert.throws(() => buildDataCodewords(new Uint8Array(18), 1, 'L'), QrTooLong);
});

test('a 16-bit count field is used from version 10', () => {
  const payload = Uint8Array.from({ length: 200 }, (_, i) => i & 0xff);
  const symbol = encodeBytes(payload, 'L', { version: 10 });
  assert.equal(symbol.version, 10);
  assert.deepEqual(Array.from(decode(symbol).payload), Array.from(payload));
});

test('interleaving produces exactly the version total and is reversible', () => {
  const data = buildDataCodewords(new Uint8Array(60), 5, 'Q');
  const woven = interleave(data, 5, 'Q');
  assert.equal(woven.length, totalCodewords(5));
  // Version 5-Q splits into 2x15 + 2x16 data codewords, so the first four
  // codewords out are the first codeword of each of the four blocks.
  const spec = ecSpec(5, 'Q');
  assert.equal(spec.groups.reduce((sum, group) => sum + group.blocks, 0), 4);
  assert.equal(woven[0], data[0]);
  assert.equal(woven[1], data[15]);
  assert.equal(woven[2], data[30]);
  assert.equal(woven[3], data[46]);
});

/* ── Whole symbols ─────────────────────────── */

test('a symbol reads back to the text that went in', () => {
  const symbol = roundTrip('HELLO WORLD', 'Q');
  assert.equal(symbol.version, 1);
  assert.equal(symbol.size, 21);
  assert.equal(symbol.payloadBytes, 11);
  assert.equal(symbol.capacityBytes, 11);
  assert.equal(symbol.dataCodewords, 13);
  assert.equal(symbol.ecCodewords, 13);
  assert.equal(symbol.blocks, 1);
  assert.equal(symbol.maskScores.length, 8);
  assert.equal(symbol.penalty.total, Math.min(...symbol.maskScores));
});

test('every level and every version round-trips', () => {
  for (const level of EC_LEVELS) {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      const room = capacityBytes(version, level);
      const text = 'x'.repeat(room);
      const symbol = encodeText(text, level, { version });
      const decoded = decode(symbol);
      assert.equal(decoded.version, version);
      assert.equal(decoded.level, level);
      assert.equal(new TextDecoder().decode(decoded.payload), text);
    }
  }
});

test('all eight masks produce a readable symbol', () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const symbol = roundTrip('https://example.com/a/b?c=1', 'M', { mask });
    assert.equal(symbol.mask, mask);
    assert.equal(symbol.maskScores.length, 1);
  }
});

test('the finder patterns, timing patterns and quiet module are where they belong', () => {
  const symbol = encodeText('layout', 'M');
  const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];
  for (const [row, col] of [
    [0, 0],
    [0, symbol.size - 7],
    [symbol.size - 7, 0],
  ]) {
    assert.equal(at(row, col), 1, 'finder outer ring');
    assert.equal(at(row + 1, col + 1), 0, 'finder light ring');
    assert.equal(at(row + 3, col + 3), 1, 'finder core');
    assert.equal(at(row + 6, col + 6), 1, 'finder far corner');
  }
  // Separators: the row and column just outside the top-left finder are light.
  for (let i = 0; i < 8; i += 1) {
    assert.equal(at(7, i), 0);
    assert.equal(at(i, 7), 0);
  }
  // Timing patterns alternate and start dark next to the separator.
  for (let i = 8; i < symbol.size - 8; i += 1) {
    assert.equal(at(6, i), i % 2 === 0 ? 1 : 0, `row 6 column ${i}`);
    assert.equal(at(i, 6), i % 2 === 0 ? 1 : 0, `column 6 row ${i}`);
  }
  assert.equal(at(symbol.size - 8, 8), 1, 'the module at (4v+9, 8) is always dark');
});

test('alignment patterns appear from version 2 and never over a finder', () => {
  const symbol = encodeText('x'.repeat(30), 'H'); // version 4 at H
  assert.equal(symbol.version, 4);
  const centre = 26;
  const at = (row: number, col: number) => symbol.modules[row * symbol.size + col];
  assert.equal(at(centre, centre), 1, 'alignment centre');
  assert.equal(at(centre - 1, centre), 0, 'alignment light ring');
  assert.equal(at(centre - 2, centre - 2), 1, 'alignment outer corner');
  assert.equal(encodeText('x', 'L').version, 1);
});

test('version 7 and up carry version information', () => {
  const symbol = encodeText('y'.repeat(150), 'L');
  assert.equal(symbol.version, 7);
  assert.equal(readVersionInfo(symbol), 7);
  roundTrip('y'.repeat(150), 'L');
});

test('Unicode, emoji, CRLF and control bytes survive the round trip', () => {
  roundTrip('中文字串測試', 'M');
  roundTrip('emoji 🧭🛠️ ok', 'Q');
  roundTrip('line\r\nbreak\ttab', 'L');
  roundTrip('', 'M');
  const zeroes = encodeBytes(new Uint8Array([0, 0, 0, 255, 254]), 'H');
  assert.deepEqual(Array.from(decode(zeroes).payload), [0, 0, 0, 255, 254]);
});

test('an empty payload still produces a valid symbol', () => {
  const symbol = encodeBytes(new Uint8Array(0), 'L');
  assert.equal(symbol.version, 1);
  assert.equal(decode(symbol).payload.length, 0);
});

test('a version is chosen by size, and too much data is refused by name', () => {
  assert.equal(encodeText('x'.repeat(17), 'L').version, 1);
  assert.equal(encodeText('x'.repeat(18), 'L').version, 2);
  assert.equal(encodeText('x'.repeat(271), 'L').version, 10);
  assert.throws(() => encodeText('x'.repeat(272), 'L'), QrTooLong);
  try {
    encodeText('x'.repeat(400), 'H');
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof QrTooLong);
    assert.equal(error.byteLength, 400);
    assert.equal(error.limit, 119);
  }
  // A fixed version that is too small is refused rather than silently grown.
  assert.throws(() => encodeText('x'.repeat(20), 'L', { version: 1 }), QrTooLong);
  // A three-byte character counts as three bytes, not one.
  assert.equal(encodeText('中'.repeat(6), 'L').version, 2);
});

test('higher error correction costs capacity, not correctness', () => {
  const text = 'https://example.com/order/1234567890';
  const versions = EC_LEVELS.map((level) => roundTrip(text, level).version);
  for (let i = 1; i < versions.length; i += 1) {
    assert.ok(versions[i] >= versions[i - 1], 'a stronger level never needs a smaller symbol');
  }
});

/* ── Content templates ─────────────────────── */

test('normalizeUrl adds a scheme only when one is missing', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('  example.com/a b '), 'https://example.com/a b');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeUrl('HTTP://example.com'), 'HTTP://example.com');
  assert.equal(normalizeUrl('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(normalizeUrl('tel:+886212345678'), 'tel:+886212345678');
  assert.equal(normalizeUrl('//cdn.example.com/x'), 'https://cdn.example.com/x');
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl('   '), '');
  assert.equal(normalizeUrl('中文.tw'), 'https://中文.tw');
});

test('the WiFi payload escapes the characters that would break the parse', () => {
  assert.equal(
    buildWifi({ ssid: 'Cafe', password: 'pw123456', auth: 'WPA', hidden: false }),
    'WIFI:T:WPA;S:Cafe;P:pw123456;;'
  );
  assert.equal(
    buildWifi({ ssid: 'a;b,c:d"e\\f', password: 'p;w', auth: 'WPA', hidden: true }),
    'WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;H:true;;'
  );
  // No password field at all when the network is open.
  assert.equal(
    buildWifi({ ssid: 'Open', password: 'ignored', auth: 'nopass', hidden: false }),
    'WIFI:T:nopass;S:Open;;'
  );
  assert.equal(escapeWifi('plain'), 'plain');
  assert.equal(escapeWifi(':;,"\\'), '\\:\\;\\,\\"\\\\');
  // Chinese SSIDs are left alone and ride in the UTF-8 payload.
  assert.ok(buildWifi({ ssid: '咖啡廳', password: 'x', auth: 'WEP', hidden: false }).includes('S:咖啡廳'));
});

test('the vCard is 3.0, CRLF-delimited, and drops empty fields', () => {
  const card = buildVCard({
    lastName: '陳',
    firstName: '小明',
    organization: 'Acme, Inc.',
    title: '',
    phone: '0912345678',
    email: 'a@b.c',
    url: '',
    address: '台北市信義路 1 段 1 號',
    note: 'line1\nline2',
  });
  const lines = card.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCARD');
  assert.equal(lines[1], 'VERSION:3.0');
  assert.equal(lines[2], 'N:陳;小明;;;');
  assert.equal(lines[3], 'FN:小明 陳');
  assert.ok(lines.includes('ORG:Acme\\, Inc.'));
  assert.ok(lines.includes('TEL;TYPE=CELL:0912345678'));
  assert.ok(lines.includes('EMAIL;TYPE=INTERNET:a@b.c'));
  assert.ok(lines.includes('ADR;TYPE=WORK:;;台北市信義路 1 段 1 號;;;;'));
  assert.ok(lines.includes('NOTE:line1\\nline2'));
  assert.ok(!lines.some((line) => line.startsWith('TITLE')));
  assert.ok(!lines.some((line) => line.startsWith('URL')));
  assert.equal(lines[lines.length - 2], 'END:VCARD');
  assert.equal(lines[lines.length - 1], '');
});

test('an empty vCard still has the mandatory properties', () => {
  const card = buildVCard({
    lastName: '',
    firstName: '',
    organization: '',
    title: '',
    phone: '',
    email: '',
    url: '',
    address: '',
    note: '',
  });
  assert.equal(card, 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:\r\nEND:VCARD\r\n');
  assert.equal(escapeVCard('a\\b,c;d\ne'), 'a\\\\b\\,c\\;d\\ne');
});

test('a vCard payload round-trips through a symbol unchanged', () => {
  const card = buildVCard({
    lastName: 'Chen',
    firstName: 'Ming',
    organization: 'Acme',
    title: 'Engineer',
    phone: '+886912345678',
    email: 'ming@example.com',
    url: 'https://example.com',
    address: 'Taipei',
    note: '',
  });
  roundTrip(card, 'M');
});

/* ── Output ────────────────────────────────── */

test('the SVG has the right geometry and no user text in it', () => {
  const symbol = encodeText('https://example.com', 'M');
  const svg = toSvg(symbol, { scale: 4, quietZone: 4 });
  const span = (symbol.size + 8) * 4;
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="0 0 ${span} ${span}"`));
  assert.ok(svg.includes(`width="${span}"`));
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(!svg.includes('example.com'), 'the payload must not leak into the markup');
  // Transparent output drops the background rectangle.
  assert.ok(!toSvg(symbol, { transparent: true }).includes('<rect'));
  assert.ok(toSvg(symbol, { dark: '#123456' }).includes('fill="#123456"'));
});

test('the path merges horizontal runs instead of emitting one rect per module', () => {
  const symbol = encodeText('x', 'L');
  const path = toPathData(symbol, 1, 0);
  const commands = path.split('M').length - 1;
  let dark = 0;
  for (let i = 0; i < symbol.modules.length; i += 1) dark += symbol.modules[i];
  assert.ok(commands > 0);
  assert.ok(commands < dark, `${commands} subpaths for ${dark} dark modules`);
  // The top-left finder's first row is a run of seven.
  assert.ok(path.startsWith('M0 0h7v1h-7z'));
  // Offsetting shifts every coordinate by the quiet zone.
  assert.ok(toPathData(symbol, 2, 4).startsWith('M8 8h14v2h-14z'));
});

test('the ASCII rendering is square and framed by a quiet zone', () => {
  const symbol = encodeText('x', 'L');
  const lines = toAsciiArt(symbol, 2).split('\n');
  assert.equal(lines.length, symbol.size + 4);
  for (const line of lines) assert.equal(line.length, (symbol.size + 4) * 2);
  assert.equal(lines[0].trim(), '');
  assert.equal(lines[lines.length - 1].trim(), '');
  assert.ok(lines[2].startsWith('    ██████████████'));
});
