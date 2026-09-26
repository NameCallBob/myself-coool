/**
 * BMI, resting metabolism, and daily energy expenditure.
 *
 * Every number here is an estimate from a population regression, and the
 * honest error bars are wide: the standard deviation on a BMR prediction is
 * around ±10% even for the equation that fits best, which on a 1600 kcal
 * estimate is ±160 kcal — more than a meal. So the tool computes several
 * equations rather than one, and shows the spread, because the spread *is* the
 * answer's precision.
 *
 * Adults only. BMI for children and teenagers is read against age- and
 * sex-specific percentile curves, not fixed cut-offs, and that table is not
 * here — see the note on the page.
 */

export type Sex = 'male' | 'female';

/* ── Units ────────────────────────────────── */

export const LB_PER_KG = 2.2046226218487757;
export const CM_PER_INCH = 2.54;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function inchToCm(inch: number): number {
  return inch * CM_PER_INCH;
}

export function cmToInch(cm: number): number {
  return cm / CM_PER_INCH;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return inchToCm(feet * 12 + inches);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = cmToInch(cm);
  const feet = Math.floor(total / 12);
  return { feet, inches: total - feet * 12 };
}

/* ── BMI ──────────────────────────────────── */

/** Weight in kg over height in metres squared. Null for impossible input. */
export function bmi(kg: number, cm: number): number | null {
  if (!Number.isFinite(kg) || !Number.isFinite(cm)) return null;
  if (kg <= 0 || cm <= 0) return null;
  const metres = cm / 100;
  return kg / (metres * metres);
}

export type Band = {
  id: string;
  /** Inclusive. */
  min: number;
  /** Exclusive. Infinity on the last band. */
  max: number;
};

/**
 * 衛生福利部國民健康署 adult categories. These are *not* the WHO cut-offs: the
 * overweight threshold is 24 rather than 25 and obesity starts at 27 rather
 * than 30, following the evidence that cardiometabolic risk rises at a lower
 * BMI in Asian populations. A tool that quietly applies the WHO numbers in
 * Taiwan will tell a sizeable group of people they are in the healthy range
 * when the domestic guidance says otherwise.
 *
 * Source: 國民健康署「成人肥胖防治」建議, table current as of 2025-09.
 */
export const TW_BANDS: Band[] = [
  { id: 'underweight', min: 0, max: 18.5 },
  { id: 'healthy', min: 18.5, max: 24 },
  { id: 'overweight', min: 24, max: 27 },
  { id: 'obese-1', min: 27, max: 30 },
  { id: 'obese-2', min: 30, max: 35 },
  { id: 'obese-3', min: 35, max: Number.POSITIVE_INFINITY },
];

/** WHO's international cut-offs, for comparison. */
export const WHO_BANDS: Band[] = [
  { id: 'underweight', min: 0, max: 18.5 },
  { id: 'healthy', min: 18.5, max: 25 },
  { id: 'overweight', min: 25, max: 30 },
  { id: 'obese-1', min: 30, max: 35 },
  { id: 'obese-2', min: 35, max: 40 },
  { id: 'obese-3', min: 40, max: Number.POSITIVE_INFINITY },
];

/** Lower bound inclusive, upper bound exclusive — so exactly 24 is overweight. */
export function bandFor(value: number, bands: readonly Band[] = TW_BANDS): Band | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return bands.find((band) => value >= band.min && value < band.max) ?? null;
}

/** The weight range that puts this height in the `healthy` band. */
export function healthyWeightRange(
  cm: number,
  bands: readonly Band[] = TW_BANDS
): { min: number; max: number } | null {
  if (!Number.isFinite(cm) || cm <= 0) return null;
  const band = bands.find((entry) => entry.id === 'healthy');
  if (!band) return null;
  const metres = cm / 100;
  return { min: band.min * metres * metres, max: band.max * metres * metres };
}

/* ── Waist ────────────────────────────────── */

/**
 * 國民健康署's abdominal-obesity thresholds: 90 cm for men, 80 cm for women.
 * Again lower than the figures used in Europe and North America, for the same
 * reason. Source: 國民健康署代謝症候群判定標準.
 */
export const WAIST_LIMIT: Record<Sex, number> = { male: 90, female: 80 };

export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!Number.isFinite(waistCm) || !Number.isFinite(heightCm)) return null;
  if (waistCm <= 0 || heightCm <= 0) return null;
  return waistCm / heightCm;
}

/**
 * Waist-to-height ratio, banded. The 0.5 line ("keep your waist under half
 * your height") predicts cardiometabolic risk at least as well as BMI and needs
 * no sex-specific table, which is why it is here alongside BMI rather than
 * instead of it.
 */
export function waistBand(ratio: number): 'low' | 'ok' | 'raised' | 'high' | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (ratio < 0.4) return 'low';
  if (ratio < 0.5) return 'ok';
  if (ratio < 0.6) return 'raised';
  return 'high';
}

/* ── Resting metabolism ───────────────────── */

export type BmrEquation = 'mifflin' | 'harris' | 'katch';

/**
 * Mifflin–St Jeor (1990). The equation most dietetic guidance now recommends
 * for people of ordinary body composition: 10·kg + 6.25·cm − 5·age, then +5 for
 * men and −161 for women.
 */
export function bmrMifflin(sex: Sex, kg: number, cm: number, age: number): number | null {
  if (![kg, cm, age].every(Number.isFinite) || kg <= 0 || cm <= 0 || age < 0) return null;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Harris–Benedict as revised by Roza & Shizgal (1984). Older, and known to run
 * about 5% high for most people, which is exactly why it is worth showing next
 * to Mifflin: the gap between the two is a fair picture of the uncertainty.
 */
export function bmrHarrisBenedict(sex: Sex, kg: number, cm: number, age: number): number | null {
  if (![kg, cm, age].every(Number.isFinite) || kg <= 0 || cm <= 0 || age < 0) return null;
  return sex === 'male'
    ? 88.362 + 13.397 * kg + 4.799 * cm - 5.677 * age
    : 447.593 + 9.247 * kg + 3.098 * cm - 4.33 * age;
}

export function leanMass(kg: number, bodyFatPercent: number): number | null {
  if (!Number.isFinite(kg) || !Number.isFinite(bodyFatPercent)) return null;
  if (kg <= 0 || bodyFatPercent < 0 || bodyFatPercent >= 100) return null;
  return kg * (1 - bodyFatPercent / 100);
}

/**
 * Katch–McArdle: 370 + 21.6 × lean body mass in kg. It ignores height, age and
 * sex entirely, because lean mass is what actually burns the energy — which
 * makes it the best of the three *if* you have a real body-fat measurement, and
 * the worst if you have a guess.
 */
export function bmrKatchMcArdle(leanKg: number): number | null {
  if (!Number.isFinite(leanKg) || leanKg <= 0) return null;
  return 370 + 21.6 * leanKg;
}

/* ── Activity ─────────────────────────────── */

export type Activity = { id: string; factor: number };

/**
 * The Harris–Benedict activity multipliers, which is where every calculator's
 * "sedentary / lightly active / …" list comes from. They are coarse by
 * construction: one step on this list is 150–250 kcal, which is larger than
 * most people's idea of the difference between two of the labels.
 */
export const ACTIVITIES: Activity[] = [
  { id: 'sedentary', factor: 1.2 },
  { id: 'light', factor: 1.375 },
  { id: 'moderate', factor: 1.55 },
  { id: 'active', factor: 1.725 },
  { id: 'very-active', factor: 1.9 },
];

export function tdee(bmrValue: number, factor: number): number | null {
  if (!Number.isFinite(bmrValue) || !Number.isFinite(factor)) return null;
  if (bmrValue <= 0 || factor <= 0) return null;
  return bmrValue * factor;
}

/* ── Weight change ────────────────────────── */

/**
 * The "7700 kcal per kilogram" rule of thumb — the energy density of adipose
 * tissue, about 7700 kcal/kg once the water and protein in it are accounted
 * for. It is a fair estimate for the first few weeks and then progressively
 * wrong: as body mass falls so does the energy cost of moving it, so a fixed
 * deficit produces a shrinking rate of loss rather than a straight line.
 */
export const KCAL_PER_KG = 7700;

/** Daily energy deficit or surplus needed for a given change per week. */
export function dailyForWeeklyChange(kgPerWeek: number): number {
  return (kgPerWeek * KCAL_PER_KG) / 7;
}

/** The linear-model weekly change implied by a daily deficit or surplus. */
export function weeklyFromDaily(kcalPerDay: number): number {
  return (kcalPerDay * 7) / KCAL_PER_KG;
}

/* ── Rounding for display ─────────────────── */

/** Calories to the nearest 10: the input precision does not justify more. */
export function roundCalories(value: number): number {
  return Math.round(value / 10) * 10;
}

export type Summary = {
  bmi: number | null;
  band: Band | null;
  whoBand: Band | null;
  healthy: { min: number; max: number } | null;
  bmr: Partial<Record<BmrEquation, number>>;
  tdee: Partial<Record<BmrEquation, number>>;
  /** Lowest and highest TDEE across the equations that produced a value. */
  spread: { low: number; high: number } | null;
};

export function summarise(input: {
  sex: Sex;
  kg: number;
  cm: number;
  age: number;
  factor: number;
  bodyFatPercent: number | null;
}): Summary {
  const value = bmi(input.kg, input.cm);
  const bmrs: Partial<Record<BmrEquation, number>> = {};
  const mifflin = bmrMifflin(input.sex, input.kg, input.cm, input.age);
  if (mifflin !== null && mifflin > 0) bmrs.mifflin = mifflin;
  const harris = bmrHarrisBenedict(input.sex, input.kg, input.cm, input.age);
  if (harris !== null && harris > 0) bmrs.harris = harris;
  if (input.bodyFatPercent !== null) {
    const lean = leanMass(input.kg, input.bodyFatPercent);
    const katch = lean === null ? null : bmrKatchMcArdle(lean);
    if (katch !== null) bmrs.katch = katch;
  }

  const totals: Partial<Record<BmrEquation, number>> = {};
  for (const [key, bmrValue] of Object.entries(bmrs) as [BmrEquation, number][]) {
    const total = tdee(bmrValue, input.factor);
    if (total !== null) totals[key] = total;
  }

  const values = Object.values(totals);
  return {
    bmi: value,
    band: value === null ? null : bandFor(value, TW_BANDS),
    whoBand: value === null ? null : bandFor(value, WHO_BANDS),
    healthy: healthyWeightRange(input.cm, TW_BANDS),
    bmr: bmrs,
    tdee: totals,
    spread: values.length === 0 ? null : { low: Math.min(...values), high: Math.max(...values) },
  };
}
