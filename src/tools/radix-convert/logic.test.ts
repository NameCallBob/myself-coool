import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGITS,
  MAX_BASE,
  MAX_INPUT,
  MIN_BASE,
  RadixError,
  bitLength,
  convertRadix,
  defaultGroupSize,
  digitValue,
  fractionTerminates,
  groupDigits,
  parseRadix,
  renderRadix,
} from './logic.ts';

const to = (text: string, from: number, target: number, frac = 32) =>
  convertRadix(text, from, target, frac).text;

test('DIGITS covers every base and nothing more', () => {
  assert.equal(DIGITS.length, MAX_BASE);
  assert.equal(MIN_BASE, 2);
  assert.equal(new Set(DIGITS).size, MAX_BASE);
});

test('digitValue only accepts single characters', () => {
  assert.equal(digitValue('0'), 0);
  assert.equal(digitValue('9'), 9);
  assert.equal(digitValue('a'), 10);
  assert.equal(digitValue('Z'), 35);
  assert.equal(digitValue('!'), -1);
  assert.equal(digitValue(''), -1);
  // "01" is a substring of the digit table; it must not read as a digit.
  assert.equal(digitValue('01'), -1);
});

test('the textbook conversions come out right', () => {
  assert.equal(to('255', 10, 16), 'ff');
  assert.equal(to('ff', 16, 10), '255');
  assert.equal(to('11111111', 2, 10), '255');
  assert.equal(to('255', 10, 2), '11111111');
  assert.equal(to('777', 8, 10), '511');
  assert.equal(to('zz', 36, 10), '1295');
  assert.equal(to('1295', 10, 36), 'zz');
  assert.equal(to('0', 10, 2), '0');
  assert.equal(to('0', 2, 36), '0');
  assert.equal(to('1', 10, 10), '1');
});

test('uppercase input and the usual separators are accepted', () => {
  assert.equal(to('FF', 16, 10), '255');
  assert.equal(to('DEAD_BEEF', 16, 10), '3735928559');
  assert.equal(to('1010 1100', 2, 16), 'ac');
  assert.equal(to("1'000'000", 10, 16), 'f4240');
  assert.equal(to('  42  ', 10, 16), '2a');
});

test('a base prefix is stripped only when it agrees with the base', () => {
  assert.equal(to('0xff', 16, 10), '255');
  assert.equal(to('0b1011', 2, 10), '11');
  assert.equal(to('0o17', 8, 10), '15');
  // In base 16 "0b11" is a perfectly good hexadecimal number: 0×16³+b×16²+…
  assert.equal(to('0b11', 16, 10), '2833');
  // In base 36 "0x" is two digits, not a prefix.
  assert.equal(to('0x', 36, 10), '33');
});

test('negative numbers keep their sign, and negative zero does not exist', () => {
  assert.equal(to('-255', 10, 16), '-ff');
  assert.equal(to('-0', 10, 16), '0');
  assert.equal(to('+255', 10, 16), 'ff');
  assert.equal(to('-1010', 2, 10), '-10');
});

test('values past 2^53 survive, which is the whole point', () => {
  // parseInt/Number.toString round here; BigInt does not.
  assert.equal(to('ffffffffffffffff', 16, 10), '18446744073709551615');
  assert.equal(to('18446744073709551615', 10, 16), 'ffffffffffffffff');
  // 2^64 + 1 — the low bit is exactly what a double loses.
  assert.equal(to('18446744073709551617', 10, 16), '10000000000000001');
  const big = '9'.repeat(80);
  assert.equal(to(to(big, 10, 36), 36, 10), big);
});

test('fractions convert exactly when they terminate', () => {
  assert.equal(to('0.5', 10, 2), '0.1');
  assert.equal(to('0.25', 10, 2), '0.01');
  assert.equal(to('0.75', 10, 16), '0.c');
  assert.equal(to('1010.101', 2, 10), '10.625');
  assert.equal(to('0.1', 16, 10), '0.0625');
  assert.equal(to('-3.5', 10, 2), '-11.1');
  assert.equal(to('0.13', 6, 10), '0.25');
});

test('a repeating fraction is cut at the budget and says so', () => {
  const tenth = convertRadix('0.1', 10, 2, 16);
  // 0.1 decimal is 0.0001100110011… in binary, forever.
  assert.equal(tenth.text, '0.0001100110011001');
  assert.equal(tenth.truncated, true);
  assert.equal(tenth.fracDigits, 16);

  const third = convertRadix('0.1', 3, 10, 8);
  assert.equal(third.text, '0.33333333');
  assert.equal(third.truncated, true);

  const exact = convertRadix('0.5', 10, 2, 16);
  assert.equal(exact.truncated, false);
  assert.equal(exact.fracDigits, 1);
});

test('a zero fraction budget drops the fraction and reports the loss', () => {
  const cut = convertRadix('10.5', 10, 10, 0);
  assert.equal(cut.text, '10');
  assert.equal(cut.truncated, true);
  const whole = convertRadix('10', 10, 10, 0);
  assert.equal(whole.truncated, false);
});

test('trailing zeros in the source do not change the value', () => {
  assert.equal(to('0.50', 10, 2), '0.1');
  assert.equal(to('00255', 10, 16), 'ff');
  assert.equal(to('1.000', 10, 2), '1');
});

test('parseRadix keeps the fraction as an exact rational', () => {
  const parsed = parseRadix('1010.11', 2);
  assert.equal(parsed.int, 10n);
  assert.equal(parsed.frac, 3n);
  assert.equal(parsed.fracDen, 4n);
  assert.equal(parsed.fracDigits, 2);
  assert.equal(parsed.negative, false);

  const negative = parseRadix('-0.1', 10);
  assert.equal(negative.negative, true);
  assert.equal(negative.int, 0n);
  assert.equal(negative.frac, 1n);
  assert.equal(negative.fracDen, 10n);
});

test('bad digits throw with the position of the offending character', () => {
  assert.throws(() => parseRadix('12', 2), (error: unknown) => {
    assert.ok(error instanceof RadixError);
    assert.equal(error.index, 1);
    assert.match(error.message, /not a digit in base 2/);
    return true;
  });
  assert.throws(() => parseRadix('1.2z', 8), (error: unknown) => {
    assert.ok(error instanceof RadixError);
    assert.equal(error.index, 3);
    return true;
  });
  assert.throws(() => parseRadix('g', 16), RadixError);
  assert.throws(() => parseRadix('', 10), /nothing to convert/);
  assert.throws(() => parseRadix('   ', 10), /nothing to convert/);
  assert.throws(() => parseRadix('1.2.3', 10), /more than one radix point/);
});

test('an out-of-range base is refused rather than guessed', () => {
  assert.throws(() => parseRadix('1', 1), /source base/);
  assert.throws(() => parseRadix('1', 37), /source base/);
  assert.throws(() => parseRadix('1', 10.5), /source base/);
  assert.throws(() => renderRadix(parseRadix('1', 10), 0), /target base/);
  assert.throws(() => renderRadix(parseRadix('1', 10), 40), /target base/);
});

test('input longer than the ceiling is refused, not ground through', () => {
  const tooLong = '1'.repeat(MAX_INPUT + 1);
  assert.throws(() => parseRadix(tooLong, 10), /longer than/);
  // Exactly at the ceiling still works.
  assert.equal(parseRadix('1'.repeat(MAX_INPUT), 10).int.toString().length, MAX_INPUT);
});

test('every base round-trips through every other base', () => {
  const samples = ['0', '1', '35', '1000', '123456789'];
  for (let from = MIN_BASE; from <= MAX_BASE; from += 1) {
    for (const decimal of samples) {
      // Write the sample in `from`, then walk it through every target base.
      const source = convertRadix(decimal, 10, from).text;
      for (let target = MIN_BASE; target <= MAX_BASE; target += 1) {
        const there = convertRadix(source, from, target).text;
        const back = convertRadix(there, target, 10).text;
        assert.equal(back, decimal, `${decimal}: 10→${from}→${target}→10`);
      }
    }
  }
});

test('fractionTerminates distinguishes repeating from merely long', () => {
  assert.equal(fractionTerminates(parseRadix('0.5', 10), 2), true);
  assert.equal(fractionTerminates(parseRadix('0.1', 10), 2), false);
  assert.equal(fractionTerminates(parseRadix('0.1', 10), 10), true);
  // 1/8 terminates in base 6: 0.13₆.
  assert.equal(fractionTerminates(parseRadix('0.125', 10), 6), true);
  // 1/3 never terminates in base 10 but does in base 3 and base 6.
  assert.equal(fractionTerminates(parseRadix('0.1', 3), 10), false);
  assert.equal(fractionTerminates(parseRadix('0.1', 3), 6), true);
  // No fraction at all trivially terminates.
  assert.equal(fractionTerminates(parseRadix('42', 10), 7), true);
  // A fraction written with trailing zeros reduces before the test.
  assert.equal(fractionTerminates(parseRadix('0.500', 10), 2), true);
});

test('groupDigits counts outward from the radix point', () => {
  assert.equal(groupDigits('10101100', 4), '1010 1100');
  assert.equal(groupDigits('1234567', 3, ','), '1,234,567');
  assert.equal(groupDigits('101100.110011', 4), '10 1100.1100 11');
  assert.equal(groupDigits('-1234', 3, ','), '-1,234');
  assert.equal(groupDigits('1', 4), '1');
  assert.equal(groupDigits('0.5', 3), '0.5');
  // Size 0 means "do not group", not "group by nothing".
  assert.equal(groupDigits('1234', 0), '1234');
  assert.equal(groupDigits('', 4), '');
});

test('defaultGroupSize follows the convention for each base', () => {
  assert.equal(defaultGroupSize(2), 8);
  assert.equal(defaultGroupSize(16), 4);
  assert.equal(defaultGroupSize(8), 3);
  assert.equal(defaultGroupSize(10), 3);
  assert.equal(defaultGroupSize(7), 0);
  assert.equal(defaultGroupSize(36), 0);
});

test('bitLength matches the magnitude, ignoring the sign', () => {
  assert.equal(bitLength(0n), 0);
  assert.equal(bitLength(1n), 1);
  assert.equal(bitLength(255n), 8);
  assert.equal(bitLength(256n), 9);
  assert.equal(bitLength(-255n), 8);
  assert.equal(bitLength(2n ** 64n - 1n), 64);
  assert.equal(bitLength(2n ** 64n), 65);
  assert.equal(bitLength(2n ** 1000n), 1001);
  // Cross-check against the binary rendering for a spread of values.
  for (const value of [3n, 17n, 1023n, 1024n, 12345678901234567890n]) {
    assert.equal(bitLength(value), value.toString(2).length);
  }
});

test('renderRadix leaves the source untouched so a table can reuse it', () => {
  const parsed = parseRadix('1010.11', 2);
  const first = renderRadix(parsed, 10);
  const second = renderRadix(parsed, 16);
  assert.equal(first.text, '10.75');
  assert.equal(second.text, 'a.c');
  assert.equal(parsed.frac, 3n, 'renderRadix mutated its input');
});
