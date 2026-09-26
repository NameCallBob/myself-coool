import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_LIMIT,
  CM_PER_INCH,
  DIVISORS,
  ROUNDING_STEPS,
  SIZE_CLASSES,
  batchTotals,
  breakEvenDensity,
  chargeableWeight,
  classFor,
  cubicMetres,
  dimsTo,
  formatSizeClasses,
  fromCm,
  fromKg,
  lengthPlusGirth,
  parseParcels,
  parseSizeClasses,
  revenueTons,
  roundUpTo,
  sumOfSides,
  toCm,
  toKg,
  volume,
  volumetricWeight,
  type Divisor,
} from './logic.ts';

const near = (actual: number | null, expected: number, tolerance = 1e-6, message?: string) => {
  assert.notEqual(actual, null, message);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`
  );
};

const divisor = (id: string): Divisor => {
  const hit = DIVISORS.find((entry) => entry.id === id);
  if (!hit) throw new Error(id);
  return hit;
};

const box = (length: number, width: number, height: number) => ({ length, width, height });

/* ── Conversions ──────────────────────────── */

test('length and mass conversions', () => {
  near(toCm(1, 'in'), 2.54);
  near(toCm(5, 'cm'), 5);
  near(fromCm(2.54, 'in'), 1);
  near(toKg(1, 'lb'), 0.45359237, 1e-8);
  near(fromKg(1, 'lb'), 2.20462262, 1e-8);
  near(fromKg(3, 'kg'), 3);
});

test('dimension conversion round-trips', () => {
  const original = box(40, 30, 20);
  const there = dimsTo(original, 'cm', 'in');
  const back = dimsTo(there, 'in', 'cm');
  near(back.length, 40, 1e-9);
  near(back.width, 30, 1e-9);
  near(back.height, 20, 1e-9);
  assert.deepEqual(dimsTo(original, 'cm', 'cm'), original);
});

/* ── Volume ───────────────────────────────── */

test('volume is the product, in the cube of the unit given', () => {
  near(volume(box(40, 30, 20), 'cm'), 24000);
  near(volume(box(12, 12, 12), 'in'), 1728);
  // The same box measured either way is the same volume.
  near(volume(box(10 * CM_PER_INCH, 10 * CM_PER_INCH, 10 * CM_PER_INCH), 'cm'), 16387.064, 0.001);
  near(volume(box(10, 10, 10), 'in'), 1000, 1e-9);
});

test('volume refuses a missing or zero side', () => {
  assert.equal(volume(box(0, 30, 20), 'cm'), null);
  assert.equal(volume(box(40, -30, 20), 'cm'), null);
  assert.equal(volume(box(40, Number.NaN, 20), 'cm'), null);
});

/* ── Volumetric weight, against hand values ── */

test('a 40×30×20 cm box on each metric divisor', () => {
  // 24 000 cm³: /5000 = 4.8 kg, /6000 = 4.0 kg, /4000 = 6.0 kg.
  near(volumetricWeight(box(40, 30, 20), 'cm', divisor('express-5000')), 4.8, 1e-9);
  near(volumetricWeight(box(40, 30, 20), 'cm', divisor('air-6000')), 4, 1e-9);
  near(volumetricWeight(box(40, 30, 20), 'cm', divisor('economy-4000')), 6, 1e-9);
});

test('a 12-inch cube on the US divisors, in pounds', () => {
  // 1728 in³: /139 = 12.4317 lb, /166 = 10.4096 lb.
  near(volumetricWeight(box(12, 12, 12), 'in', divisor('us-139'), 'lb'), 1728 / 139, 1e-9);
  near(volumetricWeight(box(12, 12, 12), 'in', divisor('us-166'), 'lb'), 1728 / 166, 1e-9);
});

test('centimetres against a cubic-inch divisor convert before dividing, not after', () => {
  // 24 000 cm³ ÷ 2.54³ = 1464.5713 in³; ÷ 139 = 10.53647 lb = 4.77926 kg.
  const lb = volumetricWeight(box(40, 30, 20), 'cm', divisor('us-139'), 'lb');
  near(lb, 10.53647, 0.00001);
  const kg = volumetricWeight(box(40, 30, 20), 'cm', divisor('us-139'), 'kg');
  near(kg, 4.779264, 0.000001);
  // And it is close to the 5000 cm³/kg answer, because the two divisors agree.
  near(kg, volumetricWeight(box(40, 30, 20), 'cm', divisor('express-5000'))! , 0.03);
});

test('an invalid divisor gives null rather than Infinity', () => {
  assert.equal(
    volumetricWeight(box(40, 30, 20), 'cm', { id: 'x', value: 0, length: 'cm', mass: 'kg' }),
    null
  );
  assert.equal(
    volumetricWeight(box(40, 30, 20), 'cm', { id: 'x', value: -5, length: 'cm', mass: 'kg' }),
    null
  );
});

test('the shipped divisor list is coherent', () => {
  assert.equal(new Set(DIVISORS.map((entry) => entry.id)).size, DIVISORS.length);
  for (const entry of DIVISORS) {
    assert.ok(entry.value > 0);
    assert.ok(entry.length === 'cm' || entry.length === 'in');
    assert.ok(entry.mass === 'kg' || entry.mass === 'lb');
    // Every cm divisor is expressed per kg, every inch divisor per lb.
    assert.equal(entry.length === 'cm', entry.mass === 'kg');
  }
});

/* ── Rounding ─────────────────────────────── */

test('chargeable weight rounds up, never to nearest', () => {
  assert.equal(roundUpTo(4.01, 0.5), 4.5);
  assert.equal(roundUpTo(4.5, 0.5), 4.5, 'a value already on a step stays put');
  assert.equal(roundUpTo(4.51, 0.5), 5);
  assert.equal(roundUpTo(4.0001, 1), 5);
  assert.equal(roundUpTo(4, 1), 4);
  assert.equal(roundUpTo(4.24, 0.1), 4.3);
  assert.equal(roundUpTo(0, 0.5), 0);
  assert.equal(roundUpTo(4.8, 0), 4.8, 'step 0 means no rounding');
  assert.ok(Number.isNaN(roundUpTo(Number.NaN, 0.5)));
});

test('floating-point noise does not push a value onto the next step', () => {
  for (const value of [0.5, 1.5, 2.5, 4.5, 7.5, 13.5, 100.5]) {
    assert.equal(roundUpTo(value, 0.5), value, String(value));
  }
  for (const value of [0.1, 0.3, 0.7, 2.9]) {
    assert.equal(roundUpTo(value, 0.1), value, String(value));
  }
});

test('the rounding steps offered are sane', () => {
  assert.deepEqual(ROUNDING_STEPS, [0, 0.1, 0.5, 1]);
});

/* ── Chargeable ───────────────────────────── */

test('the greater of the two weights wins, and the winner is named', () => {
  const light = chargeableWeight(2, 4.8, 0.5)!;
  assert.equal(light.basis, 'volumetric');
  assert.equal(light.greater, 4.8);
  assert.equal(light.chargeable, 5);

  const heavy = chargeableWeight(9.2, 4.8, 0.5)!;
  assert.equal(heavy.basis, 'actual');
  assert.equal(heavy.chargeable, 9.5);

  const tie = chargeableWeight(4.8, 4.8, 0.5)!;
  assert.equal(tie.basis, 'tie');
  assert.equal(tie.chargeable, 5);
});

test('chargeable weight rejects negatives and non-numbers', () => {
  assert.equal(chargeableWeight(-1, 4, 0.5), null);
  assert.equal(chargeableWeight(1, -4, 0.5), null);
  assert.equal(chargeableWeight(Number.NaN, 4, 0.5), null);
});

test('a zero actual weight still gets charged by volume', () => {
  const result = chargeableWeight(0, 4.8, 1)!;
  assert.equal(result.basis, 'volumetric');
  assert.equal(result.chargeable, 5);
});

/* ── Break-even density ───────────────────── */

test('the break-even density is the divisor turned inside out', () => {
  // 5000 cm³/kg means 1 m³ is charged as 200 kg.
  near(breakEvenDensity(divisor('express-5000')), 200, 1e-9);
  near(breakEvenDensity(divisor('air-6000')), 1_000_000 / 6000, 1e-9);
  // 139 in³/lb lands within a couple of kg of the 5000 figure.
  near(breakEvenDensity(divisor('us-139')), 199.1, 0.2);
});

test('a box denser than the break-even point is charged by actual weight', () => {
  const dims = box(40, 30, 20); // 0.024 m³
  const density = breakEvenDensity(divisor('express-5000'));
  const heavier = density * 0.024 + 1;
  const lighter = density * 0.024 - 1;
  const dim = volumetricWeight(dims, 'cm', divisor('express-5000'))!;
  assert.equal(chargeableWeight(heavier, dim, 0)!.basis, 'actual');
  assert.equal(chargeableWeight(lighter, dim, 0)!.basis, 'volumetric');
});

/* ── Size limits ──────────────────────────── */

test('length plus girth uses the longest side whichever order it was typed', () => {
  // 100 + 2×(50+40) = 280, whatever order the numbers arrive in.
  near(lengthPlusGirth(box(100, 50, 40)), 280);
  near(lengthPlusGirth(box(40, 100, 50)), 280);
  near(lengthPlusGirth(box(50, 40, 100)), 280);
  assert.equal(lengthPlusGirth(box(0, 50, 40)), null);
});

test('sum of sides', () => {
  near(sumOfSides(box(30, 20, 10)), 60);
  assert.equal(sumOfSides(box(30, 20, 0)), null);
});

test('the size ladder picks the first class the parcel fits', () => {
  assert.equal(classFor(59.9)?.label, '60cm');
  assert.equal(classFor(60)?.label, '60cm', 'the limit is inclusive');
  assert.equal(classFor(60.1)?.label, '80cm');
  assert.equal(classFor(100)?.label, '100cm');
  assert.equal(classFor(161), null, 'oversize is null, not the largest class');
  assert.equal(classFor(0), null);
});

test('the shipped size ladder carries steps but no invented weight caps', () => {
  assert.deepEqual(
    SIZE_CLASSES.map((entry) => entry.limit),
    [60, 80, 100, 120, 140, 160]
  );
  for (const entry of SIZE_CLASSES) assert.equal(entry.maxKg, null);
});

test('the size ladder is editable and round-trips through its text form', () => {
  const text = formatSizeClasses(SIZE_CLASSES);
  assert.deepEqual(parseSizeClasses(text), SIZE_CLASSES);
  const custom = parseSizeClasses(['# mine', '90:90cm:10', '150:150cm:'].join('\n'));
  assert.deepEqual(custom, [
    { limit: 90, label: '90cm', maxKg: 10 },
    { limit: 150, label: '150cm', maxKg: null },
  ]);
  assert.equal(classFor(95, custom)?.label, '150cm');
});

test('the size-table parser drops rows it cannot use and sorts what it keeps', () => {
  const parsed = parseSizeClasses(['nonsense', '100:big:5', '-5:bad:', '60::', ''].join('\n'));
  assert.deepEqual(
    parsed.map((entry) => entry.limit),
    [60, 100]
  );
  assert.equal(parsed[0].label, '60cm', 'a blank label falls back to the limit');
});

/* ── Sea freight ──────────────────────────── */

test('cubic metres, from either unit', () => {
  near(cubicMetres(box(100, 100, 100), 'cm'), 1, 1e-9);
  near(cubicMetres(box(40, 30, 20), 'cm'), 0.024, 1e-9);
  // A 39.37-inch cube is a cubic metre.
  near(cubicMetres(box(39.3700787, 39.3700787, 39.3700787), 'in'), 1, 1e-6);
  assert.equal(cubicMetres(box(0, 1, 1), 'cm'), null);
});

test('weight-or-measure charges the greater, and breaks even at water density', () => {
  near(revenueTons(2, 1500), 2, 1e-9, 'volume wins');
  near(revenueTons(1, 2500), 2.5, 1e-9, 'weight wins');
  near(revenueTons(1, 1000), 1, 1e-9, 'exactly 1000 kg/m³ is the break-even');
  assert.equal(revenueTons(-1, 100), null);
  assert.equal(revenueTons(1, Number.NaN), null);
});

/* ── Batch ────────────────────────────────── */

test('parcels parse from the shapes people actually type', () => {
  const { parcels, bad } = parseParcels(
    ['40x30x20 5.5', '40×30×20 5.5', '40 * 30 * 20 5.5', '40,30,20,5.5'].join('\n')
  );
  assert.deepEqual(bad, []);
  assert.equal(parcels.length, 4);
  for (const parcel of parcels) {
    assert.deepEqual(parcel.dims, { length: 40, width: 30, height: 20 });
    near(parcel.weight, 5.5);
    assert.equal(parcel.quantity, 1);
  }
});

test('a trailing quantity is read as one', () => {
  const { parcels } = parseParcels('40x30x20 5.5 x3');
  assert.equal(parcels.length, 1);
  assert.equal(parcels[0].quantity, 3);
  near(parcels[0].weight, 5.5);
  assert.equal(parseParcels('30x20x10 2 ×12').parcels[0].quantity, 12);
});

test('a line with no weight is taken as dimensions only', () => {
  const { parcels } = parseParcels('40x30x20');
  assert.equal(parcels[0].weight, 0);
});

test('unusable lines are reported rather than silently dropped', () => {
  const { parcels, bad } = parseParcels(['40x30', 'hello', '# a comment', '', '40x30x0'].join('\n'));
  assert.equal(parcels.length, 0);
  assert.deepEqual(bad, ['40x30', 'hello', '40x30x0']);
});

test('the batch is capped', () => {
  const text = Array.from({ length: BATCH_LIMIT + 10 }, () => '40x30x20 5').join('\n');
  const { parcels, truncated } = parseParcels(text);
  assert.equal(parcels.length, BATCH_LIMIT);
  assert.equal(truncated, true);
});

test('batch totals round per parcel, not on the total', () => {
  const parcels = parseParcels(['40x30x20 2', '40x30x20 2', '40x30x20 2'].join('\n')).parcels;
  const totals = batchTotals(parcels, 'cm', divisor('express-5000'), 'kg', 0.5);
  assert.equal(totals.count, 3);
  near(totals.actual, 6);
  near(totals.volumetric, 14.4);
  // 4.8 rounds to 5.0 each, so 15.0 — not 14.5, which is what rounding the
  // total would give.
  near(totals.chargeable, 15);
});

test('quantity multiplies every total', () => {
  const parcels = parseParcels('40x30x20 2 x4').parcels;
  const totals = batchTotals(parcels, 'cm', divisor('express-5000'), 'kg', 0.5);
  assert.equal(totals.count, 4);
  near(totals.actual, 8);
  near(totals.chargeable, 20);
});

test('an empty batch totals zero', () => {
  assert.deepEqual(batchTotals([], 'cm', divisor('air-6000'), 'kg', 0.5), {
    count: 0,
    actual: 0,
    volumetric: 0,
    chargeable: 0,
  });
});
