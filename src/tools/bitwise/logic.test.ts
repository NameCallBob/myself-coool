import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT,
  OPS,
  SYMBOL,
  WIDTHS,
  applyOp,
  bitList,
  bitsOf,
  decimalDigits,
  decodeFloat,
  exactDecimal,
  floatFromBits,
  highestBit,
  isShift,
  maskOf,
  notOf,
  parseFloat754,
  parseInteger,
  popcount,
  roundTrips,
  signBit,
  signedOf,
  toBinary,
  toBytes,
  toRadix,
  trailingZeros,
  ulpOf,
  wrap,
  type Width,
} from './logic.ts';

const big = (n: number | string) => BigInt(n);

/* ── Widths and masks ─────────────────────── */

test('masks and sign bits are right at every width', () => {
  assert.deepEqual(WIDTHS, [8, 16, 32, 64]);
  assert.equal(maskOf(8), big(0xff));
  assert.equal(maskOf(16), big(0xffff));
  assert.equal(maskOf(32), big(0xffffffff));
  assert.equal(maskOf(64), big('18446744073709551615'));
  assert.equal(signBit(8), big(0x80));
  assert.equal(signBit(64), big('9223372036854775808'));
});

test('wrapping a negative value gives its two-complement pattern', () => {
  assert.equal(wrap(big(-1), 8), big(255));
  assert.equal(wrap(big(-128), 8), big(128));
  assert.equal(wrap(big(-1), 64), maskOf(64));
  assert.equal(wrap(big(256), 8), big(0));
  assert.equal(wrap(big(257), 8), big(1));
});

test('the signed reading flips exactly at the sign bit', () => {
  assert.equal(signedOf(big(127), 8), big(127));
  assert.equal(signedOf(big(128), 8), big(-128));
  assert.equal(signedOf(big(255), 8), big(-1));
  assert.equal(signedOf(maskOf(32), 32), big(-1));
  assert.equal(signedOf(big('9223372036854775808'), 64), big('-9223372036854775808'));
  assert.equal(signedOf(big(0), 8), big(0));
});

test('popcount, highest bit and trailing zeros agree with hand counts', () => {
  assert.equal(popcount(big(0)), 0);
  assert.equal(popcount(big(0b1011)), 3);
  assert.equal(popcount(maskOf(64)), 64);
  assert.equal(popcount(big(-1)), 1); // magnitude of -1 is 1
  assert.equal(highestBit(big(0)), -1);
  assert.equal(highestBit(big(1)), 0);
  assert.equal(highestBit(big(0x80)), 7);
  assert.equal(highestBit(maskOf(64)), 63);
  assert.equal(trailingZeros(big(0)), -1);
  assert.equal(trailingZeros(big(1)), 0);
  assert.equal(trailingZeros(big(0b1000)), 3);
  assert.equal(trailingZeros(big(0x100)), 8);
});

/* ── Parsing ──────────────────────────────── */

test('the four notations parse to the same value', () => {
  for (const text of ['255', '0xFF', '0xff', '0b11111111', '0o377']) {
    const parsed = parseInteger(text, 8);
    assert.ok(parsed, text);
    assert.equal(parsed.value, big(255), text);
  }
  assert.equal(parseInteger('0xFF', 8)?.radix, 16);
  assert.equal(parseInteger('0b1010', 8)?.radix, 2);
  assert.equal(parseInteger('0o17', 8)?.radix, 8);
  assert.equal(parseInteger('17', 8)?.radix, 10);
});

test('separators inside a literal are ignored', () => {
  assert.equal(parseInteger('0b1111_0000', 8)?.value, big(0xf0));
  assert.equal(parseInteger('0b1111 0000', 8)?.value, big(0xf0));
  assert.equal(parseInteger('1,000', 16)?.value, big(1000));
});

test('a negative literal is its two-complement, not an error', () => {
  const minusOne = parseInteger('-1', 8);
  assert.equal(minusOne?.value, big(255));
  assert.equal(minusOne?.negative, true);
  assert.equal(minusOne?.wrapped, false);
  assert.equal(parseInteger('-128', 8)?.value, big(128));
  assert.equal(parseInteger('-128', 8)?.wrapped, false);
  // One past the signed minimum genuinely does not fit.
  assert.equal(parseInteger('-129', 8)?.wrapped, true);
});

test('an oversized literal wraps and says so', () => {
  const over = parseInteger('256', 8);
  assert.equal(over?.value, big(0));
  assert.equal(over?.wrapped, true);
  assert.equal(parseInteger('255', 8)?.wrapped, false);
  assert.equal(parseInteger('0x1FF', 8)?.value, big(0xff));
  assert.equal(parseInteger('0x1FF', 8)?.wrapped, true);
});

test('64-bit literals past 2^53 stay exact', () => {
  const parsed = parseInteger('18446744073709551615', 64);
  assert.equal(parsed?.value, maskOf(64));
  assert.equal(parsed?.wrapped, false);
  assert.equal(parseInteger('0xDEADBEEFDEADBEEF', 64)?.value, big('0xDEADBEEFDEADBEEF'));
});

test('what is not a literal is refused', () => {
  for (const bad of ['', '   ', 'ff', '0x', '0b', '0b102', '0o8', '12ab', '1.5', '-', '+', '0xg']) {
    assert.equal(parseInteger(bad, 32), null, bad);
  }
});

/* ── Rendering ────────────────────────────── */

test('each radix pads to the natural width', () => {
  assert.equal(toRadix(big(0x0f), 8, 16), '0f');
  assert.equal(toRadix(big(0x0f), 32, 16), '0000000f');
  assert.equal(toRadix(big(255), 8, 2), '11111111');
  assert.equal(toRadix(big(255), 8, 10), '255');
  assert.equal(toRadix(big(255), 8, 8), '377');
  assert.equal(toRadix(big(-1), 16, 16), 'ffff');
});

test('binary output is grouped and full width', () => {
  assert.equal(toBinary(big(1), 8), '00000001');
  assert.equal(toBinary(big(0xf0f0), 16), '11110000 11110000');
  assert.equal(toBinary(big(1), 16, 4), '0000 0000 0000 0001');
  assert.equal(toBinary(big(1), 8, 0), '00000001');
});

test('the bit list is least-significant first and the right length', () => {
  const bits = bitList(big(0b1010), 8);
  assert.equal(bits.length, 8);
  assert.deepEqual(bits.slice(0, 4), [false, true, false, true]);
  assert.equal(bitList(big(-1), 64).every(Boolean), true);
});

test('bytes come out big-endian at the chosen width', () => {
  assert.deepEqual(toBytes(big(0x0102), 16), [0x01, 0x02]);
  assert.deepEqual(toBytes(big(0xdeadbeef), 32), [0xde, 0xad, 0xbe, 0xef]);
  assert.deepEqual(toBytes(big(1), 8), [1]);
  assert.equal(toBytes(big(-1), 64).length, 8);
});

/* ── Operations ───────────────────────────── */

test('the boolean operations match hand-computed truth tables', () => {
  const a = big(0b1100);
  const b = big(0b1010);
  assert.equal(applyOp('and', a, b, 8), big(0b1000));
  assert.equal(applyOp('or', a, b, 8), big(0b1110));
  assert.equal(applyOp('xor', a, b, 8), big(0b0110));
  assert.equal(applyOp('nand', a, b, 8), big(0b11110111));
  assert.equal(applyOp('nor', a, b, 8), big(0b11110001));
  assert.equal(applyOp('xnor', a, b, 8), big(0b11111001));
  assert.equal(applyOp('andnot', a, b, 8), big(0b0100));
});

test('the complement is taken at the width, not at infinity', () => {
  assert.equal(notOf(big(0), 8), big(255));
  assert.equal(notOf(big(0xf0), 8), big(0x0f));
  assert.equal(notOf(big(0), 64), maskOf(64));
});

test('logical and arithmetic right shifts differ on a negative value', () => {
  // 0xF0 is -16 as an int8. Logical shift brings in zeros, arithmetic the sign.
  assert.equal(applyOp('shr', big(0xf0), big(2), 8), big(0b00111100));
  assert.equal(applyOp('sar', big(0xf0), big(2), 8), big(0b11111100));
  assert.equal(signedOf(applyOp('sar', big(0xf0), big(2), 8), 8), big(-4));
  // On a positive value they agree.
  assert.equal(applyOp('shr', big(0x70), big(2), 8), applyOp('sar', big(0x70), big(2), 8));
});

test('shifting left drops the bits that leave the width', () => {
  assert.equal(applyOp('shl', big(0b1000_0001), big(1), 8), big(0b0000_0010));
  assert.equal(applyOp('shl', big(1), big(7), 8), big(0x80));
  assert.equal(applyOp('shl', big(1), big(31), 32), big(0x80000000));
});

test('a shift at or past the width empties the value, unlike JavaScript', () => {
  // JavaScript says 1 << 32 === 1, because it masks the count to five bits.
  assert.equal(1 << 32, 1);
  assert.equal(applyOp('shl', big(1), big(32), 32), big(0));
  assert.equal(applyOp('shr', big(0xff), big(8), 8), big(0));
  assert.equal(applyOp('shl', big(1), big(64), 64), big(0));
  // An arithmetic shift saturates to the sign instead.
  assert.equal(applyOp('sar', big(0xff), big(8), 8), big(0xff));
  assert.equal(applyOp('sar', big(0x7f), big(8), 8), big(0));
});

test('rotation is modulo the width and loses nothing', () => {
  assert.equal(applyOp('rotl', big(0b1000_0001), big(1), 8), big(0b0000_0011));
  assert.equal(applyOp('rotr', big(0b0000_0001), big(1), 8), big(0b1000_0000));
  assert.equal(applyOp('rotl', big(0x12), big(8), 8), big(0x12));
  assert.equal(applyOp('rotl', big(0x12), big(0), 8), big(0x12));
  // Rotating all the way round in either direction returns the value.
  const value = big(0xdeadbeef);
  assert.equal(applyOp('rotr', applyOp('rotl', value, big(13), 32), big(13), 32), value);
  assert.equal(popcount(applyOp('rotl', value, big(7), 32)), popcount(value));
});

test('operands are wrapped to the width before the operation', () => {
  // 0x1FF & 0x0FF at 8 bits is 0xFF & 0xFF.
  assert.equal(applyOp('and', big(0x1ff), big(0x0ff), 8), big(0xff));
});

test('every operation is listed, symbolled, and classified', () => {
  assert.equal(OPS.length, 12);
  assert.equal(new Set(OPS).size, 12);
  for (const op of OPS) {
    assert.ok(SYMBOL[op], op);
    assert.equal(typeof applyOp(op, big(5), big(3), 8), 'bigint');
  }
  assert.deepEqual(OPS.filter(isShift), ['shl', 'shr', 'sar', 'rotl', 'rotr']);
});

test('operations are exact at 64 bits, where JavaScript numbers are not', () => {
  const a = big('0xFFFFFFFFFFFFFFFF');
  assert.equal(applyOp('xor', a, big(1), 64), big('0xFFFFFFFFFFFFFFFE'));
  assert.equal(applyOp('shr', a, big(63), 64), big(1));
  assert.equal(applyOp('and', a, big('0x00000000FFFFFFFF'), 64), big('0xFFFFFFFF'));
});

/* ── IEEE 754 ─────────────────────────────── */

test('the layouts are the ones the standard specifies', () => {
  assert.deepEqual(LAYOUT.f32, { bits: 32, exponentBits: 8, mantissaBits: 23, bias: 127 });
  assert.deepEqual(LAYOUT.f64, { bits: 64, exponentBits: 11, mantissaBits: 52, bias: 1023 });
});

test('1.0 has the bit pattern everyone memorises', () => {
  assert.equal(bitsOf(1, 'f64'), big('0x3FF0000000000000'));
  assert.equal(bitsOf(1, 'f32'), big('0x3F800000'));
  assert.equal(bitsOf(-2, 'f64'), big('0xC000000000000000'));
  assert.equal(floatFromBits(big('0x3FF0000000000000'), 'f64'), 1);
  assert.equal(floatFromBits(big('0x3F800000'), 'f32'), 1);
});

test('the fields of 1.0 as a double are the documented ones', () => {
  const parts = decodeFloat(bitsOf(1, 'f64'), 'f64');
  assert.equal(parts.sign, 0);
  assert.equal(parts.exponentRaw, 1023);
  assert.equal(parts.mantissaRaw, big(0));
  assert.equal(parts.classification, 'normal');
  // significand × 2^exponent, with the implicit leading bit restored.
  assert.equal(parts.significand, big(1) << big(52));
  assert.equal(parts.exponent, -52);
  assert.equal(parts.exact, '1');
  assert.equal(parts.value, 1);
});

test('0.1 as a double is exactly the long decimal it is famous for', () => {
  const parts = decodeFloat(bitsOf(0.1, 'f64'), 'f64');
  assert.equal(parts.bits, big('0x3FB999999999999A'));
  assert.equal(parts.exact, '0.1000000000000000055511151231257827021181583404541015625');
  assert.equal(parts.value, 0.1);
});

test('0.1 as a float32 is a different, shorter exact value', () => {
  const parts = decodeFloat(bitsOf(0.1, 'f32'), 'f32');
  assert.equal(parts.bits, big('0x3DCCCCCD'));
  assert.equal(parts.exact, '0.100000001490116119384765625');
});

test('zero, negative zero, infinity and NaN are classified', () => {
  assert.equal(decodeFloat(big(0), 'f64').classification, 'zero');
  assert.equal(decodeFloat(big(0), 'f64').exact, '0');
  const negativeZero = decodeFloat(bitsOf(-0, 'f64'), 'f64');
  assert.equal(negativeZero.sign, 1);
  assert.equal(negativeZero.classification, 'zero');
  assert.equal(negativeZero.exact, '-0');
  const infinity = decodeFloat(big('0x7FF0000000000000'), 'f64');
  assert.equal(infinity.classification, 'infinity');
  assert.equal(infinity.exact, 'Infinity');
  assert.equal(decodeFloat(big('0xFFF0000000000000'), 'f64').exact, '-Infinity');
  const nan = decodeFloat(big('0x7FF8000000000000'), 'f64');
  assert.equal(nan.classification, 'nan');
  assert.equal(nan.exact, 'NaN');
  assert.ok(Number.isNaN(nan.value));
});

test('the smallest subnormal double is 2^-1074, exactly', () => {
  const parts = decodeFloat(big(1), 'f64');
  assert.equal(parts.classification, 'subnormal');
  assert.equal(parts.significand, big(1));
  assert.equal(parts.exponent, -1074);
  assert.equal(parts.value, Number.MIN_VALUE);
  // 2^-1074 has 323 leading zeros after the point, then 4940656458412465...
  assert.ok(parts.exact.startsWith(`0.${'0'.repeat(323)}4940656458412465`));
  // Multiplying by 5^1074 leaves a trailing 5 and nothing after it.
  assert.ok(parts.exact.endsWith('5'));
});

test('the largest finite double round-trips through its bits', () => {
  const bits = bitsOf(Number.MAX_VALUE, 'f64');
  assert.equal(bits, big('0x7FEFFFFFFFFFFFFF'));
  assert.equal(floatFromBits(bits, 'f64'), Number.MAX_VALUE);
  assert.equal(decodeFloat(bits, 'f64').classification, 'normal');
});

test('the exact decimal of a power of two with a positive exponent is an integer', () => {
  const parts = decodeFloat(bitsOf(2 ** 53, 'f64'), 'f64');
  assert.equal(parts.exact, '9007199254740992');
  assert.equal(parts.exponent, 1);
  // The step at 2^53 is 2, which is why 2^53 + 1 is not representable.
  assert.equal(ulpOf(parts), '2');
  assert.equal(2 ** 53 + 1, 2 ** 53);
});

test('the step at 1.0 is 2^-52, exactly', () => {
  const parts = decodeFloat(bitsOf(1, 'f64'), 'f64');
  assert.equal(ulpOf(parts), '0.0000000000000002220446049250313080847263336181640625');
  assert.equal(Number(ulpOf(parts)), Number.EPSILON);
  assert.equal(ulpOf(decodeFloat(big('0x7FF0000000000000'), 'f64')), '—');
  assert.equal(ulpOf(decodeFloat(big('0x7FF8000000000000'), 'f64')), '—');
});

test('exactDecimal handles both directions and zero', () => {
  assert.equal(exactDecimal(big(3), 4, false), '48');
  assert.equal(exactDecimal(big(3), 4, true), '-48');
  assert.equal(exactDecimal(big(1), -1, false), '0.5');
  assert.equal(exactDecimal(big(1), -3, false), '0.125');
  assert.equal(exactDecimal(big(0), -100, false), '0');
  assert.equal(exactDecimal(big(0), 0, true), '-0');
  assert.equal(exactDecimal(big(5), 0, false), '5');
});

test('bits and decimals are both accepted as float input', () => {
  assert.equal(parseFloat754('1.0', 'f64')?.bits, big('0x3FF0000000000000'));
  assert.equal(parseFloat754('0x3FF0000000000000', 'f64')?.value, 1);
  assert.equal(parseFloat754('0b' + '0'.repeat(64), 'f64')?.classification, 'zero');
  assert.equal(parseFloat754('-1.5e3', 'f64')?.value, -1500);
  assert.equal(parseFloat754('.5', 'f64')?.value, 0.5);
  assert.equal(parseFloat754('Infinity', 'f64')?.classification, 'infinity');
  assert.equal(parseFloat754('-inf', 'f64')?.sign, 1);
  assert.equal(parseFloat754('NaN', 'f64')?.classification, 'nan');
  assert.equal(parseFloat754('', 'f64'), null);
  assert.equal(parseFloat754('hello', 'f64'), null);
  assert.equal(parseFloat754('1.2.3', 'f64'), null);
});

test('a decimal too large for the format overflows to infinity, as IEEE 754 says', () => {
  assert.equal(parseFloat754('1e400', 'f64')?.classification, 'infinity');
  assert.equal(parseFloat754('1e40', 'f32')?.classification, 'infinity');
  assert.equal(parseFloat754('1e40', 'f64')?.classification, 'normal');
});

test('the decimal digit counts are the C library constants', () => {
  assert.deepEqual(decimalDigits('f32'), { significant: 6, roundTrip: 9 });
  assert.deepEqual(decimalDigits('f64'), { significant: 15, roundTrip: 17 });
});

test('round-tripping shows which decimals a format can hold', () => {
  assert.equal(roundTrips('0.5', 'f32'), true);
  assert.equal(roundTrips('0.5', 'f64'), true);
  // 0.1 is not representable in either, but only f32 changes the double value.
  assert.equal(roundTrips('0.1', 'f64'), true);
  assert.equal(roundTrips('0.1', 'f32'), false);
  assert.equal(roundTrips('nonsense', 'f64'), false);
});

test('every width and float kind survives a bits round trip', () => {
  for (const width of WIDTHS as Width[]) {
    const value = maskOf(width) - BigInt(3);
    assert.equal(wrap(value, width), value);
    assert.equal(toBinary(value, width, 0).length, width);
  }
  for (const value of [0, 1, -1, 0.1, 1e300, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.equal(floatFromBits(bitsOf(value, 'f64'), 'f64'), value);
  }
  // f32 keeps only what f32 can hold, so the target is the rounded value —
  // which is exactly what Math.fround computes.
  for (const value of [0, 1, -1, 0.5, 0.1, 1e30]) {
    assert.equal(floatFromBits(bitsOf(value, 'f32'), 'f32'), Math.fround(value));
  }
});
