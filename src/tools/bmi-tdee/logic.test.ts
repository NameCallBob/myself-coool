import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  KCAL_PER_KG,
  TW_BANDS,
  WAIST_LIMIT,
  WHO_BANDS,
  bandFor,
  bmi,
  bmrHarrisBenedict,
  bmrKatchMcArdle,
  bmrMifflin,
  cmToFeetInches,
  cmToInch,
  dailyForWeeklyChange,
  feetInchesToCm,
  healthyWeightRange,
  inchToCm,
  kgToLb,
  lbToKg,
  leanMass,
  roundCalories,
  summarise,
  tdee,
  waistBand,
  waistToHeight,
  weeklyFromDaily,
} from './logic.ts';

const near = (actual: number | null, expected: number, tolerance = 0.01, message?: string) => {
  assert.notEqual(actual, null, message);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`
  );
};

/* ── Units ────────────────────────────────── */

test('pounds and kilograms, against the exact definition', () => {
  // 1 lb is 0.45359237 kg by definition.
  near(lbToKg(1), 0.45359237, 1e-9);
  near(kgToLb(1), 2.20462262, 1e-8);
  near(lbToKg(154), 69.85, 0.01);
});

test('inches, feet and centimetres', () => {
  near(inchToCm(1), 2.54, 1e-9);
  near(cmToInch(2.54), 1, 1e-9);
  near(feetInchesToCm(5, 10), 177.8, 1e-9);
  const { feet, inches } = cmToFeetInches(177.8);
  assert.equal(feet, 5);
  near(inches, 10, 1e-9);
});

test('length and mass conversions round-trip', () => {
  for (const kg of [0.5, 55, 68.4, 120]) near(lbToKg(kgToLb(kg)), kg, 1e-9);
  for (const cm of [150, 165.5, 190]) near(cmToInch(inchToCm(cmToInch(cm))), cmToInch(cm), 1e-9);
  for (const cm of [150, 165.5, 190]) {
    const { feet, inches } = cmToFeetInches(cm);
    near(feetInchesToCm(feet, inches), cm, 1e-9);
  }
});

/* ── BMI ──────────────────────────────────── */

test('BMI is kilograms over metres squared', () => {
  // 70 / 1.75² = 70 / 3.0625 = 22.857…
  near(bmi(70, 175), 22.857, 0.001);
  near(bmi(50, 160), 19.531, 0.001);
  near(bmi(100, 200), 25, 1e-9);
  near(bmi(45, 150), 20, 1e-9);
});

test('BMI refuses impossible input instead of returning Infinity or NaN', () => {
  assert.equal(bmi(0, 175), null);
  assert.equal(bmi(70, 0), null);
  assert.equal(bmi(-70, 175), null);
  assert.equal(bmi(70, -175), null);
  assert.equal(bmi(Number.NaN, 175), null);
  assert.equal(bmi(70, Number.POSITIVE_INFINITY), null);
});

/* ── Bands, boundary by boundary ──────────── */

test("the Taiwan bands are the HPA's, not the WHO's", () => {
  assert.equal(bandFor(18.4, TW_BANDS)?.id, 'underweight');
  assert.equal(bandFor(18.5, TW_BANDS)?.id, 'healthy', 'the lower bound is inclusive');
  assert.equal(bandFor(23.9, TW_BANDS)?.id, 'healthy');
  assert.equal(bandFor(24, TW_BANDS)?.id, 'overweight', 'and the upper bound is exclusive');
  assert.equal(bandFor(26.9, TW_BANDS)?.id, 'overweight');
  assert.equal(bandFor(27, TW_BANDS)?.id, 'obese-1');
  assert.equal(bandFor(30, TW_BANDS)?.id, 'obese-2');
  assert.equal(bandFor(35, TW_BANDS)?.id, 'obese-3');
  assert.equal(bandFor(80, TW_BANDS)?.id, 'obese-3');
});

test('the same BMI can land in different bands under the two standards', () => {
  assert.equal(bandFor(24.5, TW_BANDS)?.id, 'overweight');
  assert.equal(bandFor(24.5, WHO_BANDS)?.id, 'healthy');
  assert.equal(bandFor(28, TW_BANDS)?.id, 'obese-1');
  assert.equal(bandFor(28, WHO_BANDS)?.id, 'overweight');
});

test('both band tables are contiguous, ordered, and end at infinity', () => {
  for (const bands of [TW_BANDS, WHO_BANDS]) {
    assert.equal(bands[0].min, 0);
    for (let i = 1; i < bands.length; i += 1) {
      assert.equal(bands[i].min, bands[i - 1].max, 'no gap and no overlap');
    }
    assert.equal(bands[bands.length - 1].max, Number.POSITIVE_INFINITY);
  }
});

test('bandFor rejects nonsense', () => {
  assert.equal(bandFor(0), null);
  assert.equal(bandFor(-5), null);
  assert.equal(bandFor(Number.NaN), null);
});

test('the healthy weight range inverts the BMI formula', () => {
  const range = healthyWeightRange(170, TW_BANDS);
  // 18.5 × 1.7² = 53.465, 24 × 1.7² = 69.36.
  near(range?.min ?? null, 53.465, 0.001);
  near(range?.max ?? null, 69.36, 0.001);
  // And the endpoints reproduce the band edges.
  near(bmi(range!.min, 170), 18.5, 1e-9);
  near(bmi(range!.max, 170), 24, 1e-9);
  assert.equal(healthyWeightRange(0), null);
});

test('the WHO range for the same height is wider at the top', () => {
  const tw = healthyWeightRange(170, TW_BANDS)!;
  const who = healthyWeightRange(170, WHO_BANDS)!;
  assert.equal(tw.min, who.min);
  assert.ok(who.max > tw.max);
});

/* ── Waist ────────────────────────────────── */

test('the HPA waist thresholds', () => {
  assert.equal(WAIST_LIMIT.male, 90);
  assert.equal(WAIST_LIMIT.female, 80);
});

test('waist-to-height ratio and its bands', () => {
  near(waistToHeight(80, 170), 0.4706, 0.0001);
  assert.equal(waistBand(0.39), 'low');
  assert.equal(waistBand(0.4), 'ok');
  assert.equal(waistBand(0.49), 'ok');
  assert.equal(waistBand(0.5), 'raised');
  assert.equal(waistBand(0.59), 'raised');
  assert.equal(waistBand(0.6), 'high');
  assert.equal(waistToHeight(0, 170), null);
  assert.equal(waistBand(0), null);
});

/* ── BMR, hand-computed ───────────────────── */

test('Mifflin–St Jeor, worked by hand', () => {
  // Male, 70 kg, 175 cm, 30: 700 + 1093.75 − 150 + 5 = 1648.75.
  near(bmrMifflin('male', 70, 175, 30), 1648.75, 1e-9);
  // Female, 55 kg, 160 cm, 25: 550 + 1000 − 125 − 161 = 1264.
  near(bmrMifflin('female', 55, 160, 25), 1264, 1e-9);
});

test('Harris–Benedict (Roza & Shizgal), worked by hand', () => {
  // Male, 70 kg, 175 cm, 30:
  // 88.362 + 937.79 + 839.825 − 170.31 = 1695.667.
  near(bmrHarrisBenedict('male', 70, 175, 30), 1695.667, 0.001);
  // Female, 55 kg, 160 cm, 25:
  // 447.593 + 508.585 + 495.68 − 108.25 = 1343.608.
  near(bmrHarrisBenedict('female', 55, 160, 25), 1343.608, 0.001);
});

test('Harris–Benedict runs higher than Mifflin, which is why both are shown', () => {
  for (const [sex, kg, cm, age] of [
    ['male', 70, 175, 30],
    ['female', 55, 160, 25],
    ['male', 90, 180, 45],
  ] as [import('./logic.ts').Sex, number, number, number][]) {
    const m = bmrMifflin(sex, kg, cm, age)!;
    const h = bmrHarrisBenedict(sex, kg, cm, age)!;
    assert.ok(h > m, `${sex} ${kg}/${cm}/${age}: ${h} should exceed ${m}`);
    assert.ok((h - m) / m < 0.1, 'but not by more than 10%');
  }
});

test('BMR equations refuse impossible input', () => {
  assert.equal(bmrMifflin('male', 0, 175, 30), null);
  assert.equal(bmrMifflin('male', 70, 0, 30), null);
  assert.equal(bmrMifflin('male', 70, 175, -1), null);
  assert.equal(bmrHarrisBenedict('female', Number.NaN, 160, 25), null);
});

test('lean mass and Katch–McArdle', () => {
  near(leanMass(80, 20), 64, 1e-9);
  near(leanMass(80, 0), 80, 1e-9);
  assert.equal(leanMass(80, 100), null, 'nobody is all fat');
  assert.equal(leanMass(80, -1), null);
  assert.equal(leanMass(0, 20), null);
  // 370 + 21.6 × 64 = 1752.4.
  near(bmrKatchMcArdle(64), 1752.4, 1e-9);
  assert.equal(bmrKatchMcArdle(0), null);
});

/* ── Activity and TDEE ────────────────────── */

test('the activity multipliers are the published ladder', () => {
  assert.deepEqual(
    ACTIVITIES.map((entry) => entry.factor),
    [1.2, 1.375, 1.55, 1.725, 1.9]
  );
  assert.equal(new Set(ACTIVITIES.map((entry) => entry.id)).size, ACTIVITIES.length);
});

test('TDEE multiplies', () => {
  near(tdee(1648.75, 1.55), 2555.5625, 1e-9);
  assert.equal(tdee(0, 1.55), null);
  assert.equal(tdee(1600, 0), null);
  assert.equal(tdee(Number.NaN, 1.2), null);
});

/* ── Weight change ────────────────────────── */

test('the 7700 kcal per kilogram rule, both directions', () => {
  assert.equal(KCAL_PER_KG, 7700);
  // Half a kilo a week is 3850 kcal over seven days, i.e. 550 a day.
  near(dailyForWeeklyChange(0.5), 550, 1e-9);
  near(dailyForWeeklyChange(-0.5), -550, 1e-9);
  near(weeklyFromDaily(550), 0.5, 1e-9);
  near(weeklyFromDaily(0), 0, 1e-9);
  // Round trip.
  for (const rate of [-1, -0.25, 0, 0.25, 1]) near(weeklyFromDaily(dailyForWeeklyChange(rate)), rate, 1e-9);
});

test('calories round to the nearest ten', () => {
  assert.equal(roundCalories(1648.75), 1650);
  assert.equal(roundCalories(1644), 1640);
  assert.equal(roundCalories(1645), 1650);
  assert.equal(roundCalories(0), 0);
});

/* ── The summary ──────────────────────────── */

test('summarise fills in everything that can be computed', () => {
  const result = summarise({
    sex: 'male',
    kg: 70,
    cm: 175,
    age: 30,
    factor: 1.55,
    bodyFatPercent: null,
  });
  near(result.bmi, 22.857, 0.001);
  assert.equal(result.band?.id, 'healthy');
  assert.equal(result.whoBand?.id, 'healthy');
  near(result.healthy?.min ?? null, 56.66, 0.01);
  assert.deepEqual(Object.keys(result.bmr).sort(), ['harris', 'mifflin']);
  assert.equal(result.tdee.katch, undefined, 'no body fat given, so no Katch–McArdle');
  assert.ok(result.spread!.high > result.spread!.low);
  near(result.tdee.mifflin ?? null, 1648.75 * 1.55, 1e-6);
});

test('a body-fat figure adds the third equation', () => {
  const result = summarise({
    sex: 'male',
    kg: 80,
    cm: 180,
    age: 35,
    factor: 1.2,
    bodyFatPercent: 20,
  });
  assert.deepEqual(Object.keys(result.bmr).sort(), ['harris', 'katch', 'mifflin']);
  near(result.bmr.katch ?? null, 370 + 21.6 * 64, 1e-9);
});

test('summarise on unusable input gives nulls rather than NaN', () => {
  const result = summarise({ sex: 'female', kg: 0, cm: 0, age: 0, factor: 1.2, bodyFatPercent: null });
  assert.equal(result.bmi, null);
  assert.equal(result.band, null);
  assert.equal(result.healthy, null);
  assert.deepEqual(result.bmr, {});
  assert.equal(result.spread, null);
});

test('a BMI right on a boundary lands in the band the guidance says', () => {
  // 24 × 1.7² = 69.36 kg at 170 cm is exactly the overweight threshold.
  const result = summarise({
    sex: 'female',
    kg: 69.36,
    cm: 170,
    age: 40,
    factor: 1.2,
    bodyFatPercent: null,
  });
  near(result.bmi, 24, 1e-9);
  assert.equal(result.band?.id, 'overweight');
  assert.equal(result.whoBand?.id, 'healthy');
});
