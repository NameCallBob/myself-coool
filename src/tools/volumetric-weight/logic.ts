/**
 * Dimensional (volumetric) weight, and the chargeable weight that comes out of
 * comparing it with the actual weight.
 *
 * The arithmetic is one division. Everything that makes shipping quotes
 * surprising lives in the constants: which divisor the service uses, whether
 * it is expressed per cubic centimetre or per cubic inch, and how the result is
 * rounded up. A 40×30×20 cm box is 4.8 kg on a 5000 divisor and 4.0 kg on a
 * 6000 divisor, and after rounding it can be charged as 5.0 kg either way — so
 * the divisor and the rounding step are both inputs here, both editable, and
 * neither is presented as a fact about any particular carrier's current tariff.
 */

export type LengthUnit = 'cm' | 'in';
export type MassUnit = 'kg' | 'lb';

export type Dimensions = { length: number; width: number; height: number };

export const CM_PER_INCH = 2.54;
export const LB_PER_KG = 2.2046226218487757;

/* ── Conversions ──────────────────────────── */

export function toCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH;
}

export function fromCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value / CM_PER_INCH;
}

export function toKg(value: number, unit: MassUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

export function fromKg(value: number, unit: MassUnit): number {
  return unit === 'kg' ? value : value * LB_PER_KG;
}

export function dimsTo(dims: Dimensions, from: LengthUnit, to: LengthUnit): Dimensions {
  if (from === to) return { ...dims };
  return {
    length: fromCm(toCm(dims.length, from), to),
    width: fromCm(toCm(dims.width, from), to),
    height: fromCm(toCm(dims.height, from), to),
  };
}

/* ── Divisors ─────────────────────────────── */

export type Divisor = {
  id: string;
  /** Cubic centimetres per kilogram, or cubic inches per pound. */
  value: number;
  length: LengthUnit;
  mass: MassUnit;
};

/**
 * The divisors in common use, with the unit each one is defined in. A divisor
 * is only meaningful together with its units: 5000 cm³/kg and 139 in³/lb are
 * within a percent of each other, and 139 cm³/kg would be absurd.
 *
 * Reviewed 2025-09 against the carriers' published terms. These change, and a
 * negotiated account can have its own — which is why "custom" exists and why
 * the page says to check the quote rather than trusting this list.
 */
export const DIVISORS: Divisor[] = [
  { id: 'express-5000', value: 5000, length: 'cm', mass: 'kg' },
  { id: 'air-6000', value: 6000, length: 'cm', mass: 'kg' },
  { id: 'economy-4000', value: 4000, length: 'cm', mass: 'kg' },
  { id: 'us-139', value: 139, length: 'in', mass: 'lb' },
  { id: 'us-166', value: 166, length: 'in', mass: 'lb' },
];

/** Volume in the cube of `unit`. */
export function volume(dims: Dimensions, unit: LengthUnit): number | null {
  const values = [dims.length, dims.width, dims.height];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  const cm = values.map((value) => toCm(value, unit));
  const cubicCm = cm[0] * cm[1] * cm[2];
  return unit === 'cm' ? cubicCm : cubicCm / CM_PER_INCH ** 3;
}

/**
 * Dimensional weight, in `want`.
 *
 * The dimensions are converted into the divisor's own length unit before
 * dividing, and the result out of the divisor's own mass unit afterwards. Doing
 * it in that order is what makes "cm box, US divisor" come out right; dividing
 * centimetres by 139 does not.
 */
export function volumetricWeight(
  dims: Dimensions,
  unit: LengthUnit,
  divisor: Divisor,
  want: MassUnit = 'kg'
): number | null {
  if (!Number.isFinite(divisor.value) || divisor.value <= 0) return null;
  const converted = dimsTo(dims, unit, divisor.length);
  const cube = volume(converted, divisor.length);
  if (cube === null) return null;
  const inDivisorMass = cube / divisor.value;
  return fromKg(toKg(inDivisorMass, divisor.mass), want);
}

/* ── Rounding ─────────────────────────────── */

/** Rounding step in the display mass unit. 0 means no rounding. */
export const ROUNDING_STEPS = [0, 0.1, 0.5, 1];

/**
 * Carriers round chargeable weight *up*, never to nearest: a 4.01 kg parcel on
 * a 0.5 kg step is billed at 4.5 kg. The epsilon guards the case where the
 * value is already on a step and floating-point noise would push it to the next
 * one — 4.5 / 0.5 can come out as 8.999999999999998.
 */
export function roundUpTo(value: number, step: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (step <= 0) return value;
  const steps = Math.ceil(value / step - 1e-9);
  return Number((steps * step).toFixed(6));
}

export type Verdict = {
  actual: number;
  volumetric: number;
  /** Before rounding. */
  greater: number;
  chargeable: number;
  /** Which figure won. 'tie' when they are equal to the rounding precision. */
  basis: 'actual' | 'volumetric' | 'tie';
};

export function chargeableWeight(
  actual: number,
  volumetric: number,
  step: number
): Verdict | null {
  if (!Number.isFinite(actual) || !Number.isFinite(volumetric)) return null;
  if (actual < 0 || volumetric < 0) return null;
  const greater = Math.max(actual, volumetric);
  const basis =
    Math.abs(actual - volumetric) < 1e-9 ? 'tie' : actual > volumetric ? 'actual' : 'volumetric';
  return { actual, volumetric, greater, chargeable: roundUpTo(greater, step), basis };
}

/**
 * The density at which the two weights are equal: below it the box is charged
 * by volume, above it by mass. Expressed in kg per cubic metre so it can be
 * compared with something familiar — water is 1000.
 */
export function breakEvenDensity(divisor: Divisor): number {
  const perCubicMetre =
    divisor.length === 'cm' ? 1_000_000 : 1_000_000 / CM_PER_INCH ** 3;
  return toKg(perCubicMetre / divisor.value, divisor.mass);
}

/* ── Size limits ──────────────────────────── */

/** Longest side plus twice the girth of the other two — the usual oversize test. */
export function lengthPlusGirth(dims: Dimensions): number | null {
  const values = [dims.length, dims.width, dims.height];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[0] + 2 * (sorted[1] + sorted[2]);
}

/** Length + width + height, which is what Taiwanese domestic couriers class on. */
export function sumOfSides(dims: Dimensions): number | null {
  const values = [dims.length, dims.width, dims.height];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return null;
  return values[0] + values[1] + values[2];
}

export type SizeClass = { limit: number; label: string; maxKg: number | null };

/**
 * The three-sides-added size ladder Taiwanese domestic couriers price on. The
 * *steps* (60/80/100/120/140/160 cm) are the common ones; the weight cap on
 * each step and the price are per-carrier and per-contract, so they start empty
 * and are typed in from whatever the carrier actually published.
 */
export const SIZE_CLASSES: SizeClass[] = [
  { limit: 60, label: '60cm', maxKg: null },
  { limit: 80, label: '80cm', maxKg: null },
  { limit: 100, label: '100cm', maxKg: null },
  { limit: 120, label: '120cm', maxKg: null },
  { limit: 140, label: '140cm', maxKg: null },
  { limit: 160, label: '160cm', maxKg: null },
];

/** First class whose limit the parcel fits inside, or null when it is oversize. */
export function classFor(sumCm: number, classes: readonly SizeClass[] = SIZE_CLASSES): SizeClass | null {
  if (!Number.isFinite(sumCm) || sumCm <= 0) return null;
  return [...classes].sort((a, b) => a.limit - b.limit).find((entry) => sumCm <= entry.limit) ?? null;
}

/** `limit:label:maxKg` per line; maxKg may be blank. `#` starts a comment. */
export function parseSizeClasses(text: string): SizeClass[] {
  const out: SizeClass[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [limitText, labelText, maxText] = trimmed.split(':');
    const limit = Number((limitText ?? '').trim());
    if (!Number.isFinite(limit) || limit <= 0) continue;
    const rawMax = (maxText ?? '').trim();
    const maxKg = rawMax === '' ? null : Number(rawMax);
    out.push({
      limit,
      label: (labelText ?? '').trim() || `${limit}cm`,
      maxKg: maxKg !== null && Number.isFinite(maxKg) && maxKg > 0 ? maxKg : null,
    });
  }
  return out.sort((a, b) => a.limit - b.limit);
}

export function formatSizeClasses(classes: readonly SizeClass[]): string {
  return classes.map((entry) => `${entry.limit}:${entry.label}:${entry.maxKg ?? ''}`).join('\n');
}

/* ── Sea freight ──────────────────────────── */

/** Cubic metres. LCL sea freight is quoted per CBM. */
export function cubicMetres(dims: Dimensions, unit: LengthUnit): number | null {
  const cube = volume(dims, unit);
  if (cube === null) return null;
  const cubicCm = unit === 'cm' ? cube : cube * CM_PER_INCH ** 3;
  return cubicCm / 1_000_000;
}

/**
 * Weight-or-measure: LCL sea freight charges whichever is greater, one tonne or
 * one cubic metre, both counted as one "revenue ton". So the break-even density
 * is 1000 kg/m³ — the density of water, which is not a coincidence.
 */
export function revenueTons(cbm: number, kg: number): number | null {
  if (!Number.isFinite(cbm) || !Number.isFinite(kg)) return null;
  if (cbm < 0 || kg < 0) return null;
  return Math.max(cbm, kg / 1000);
}

/* ── Batch ────────────────────────────────── */

export type Parcel = { dims: Dimensions; weight: number; quantity: number };

export const BATCH_LIMIT = 500;

/**
 * One parcel per line: `L×W×H weight [×quantity]`. The separator may be any of
 * × x * , or whitespace, because that is how people actually type box sizes.
 */
export function parseParcels(text: string): { parcels: Parcel[]; bad: string[]; truncated: boolean } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const truncated = lines.length > BATCH_LIMIT;
  const parcels: Parcel[] = [];
  const bad: string[] = [];

  for (const line of lines.slice(0, BATCH_LIMIT)) {
    // Quantity, when present, is a trailing `*n` / `xn` after a space.
    const quantityMatch = /[\s,](?:x|×|\*)\s*(\d+)\s*$/i.exec(line);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const body = quantityMatch ? line.slice(0, quantityMatch.index) : line;
    const numbers = body.match(/\d+(?:\.\d+)?/g) ?? [];
    if (numbers.length < 3) {
      bad.push(line);
      continue;
    }
    const [length, width, height] = numbers.slice(0, 3).map(Number);
    const weight = numbers.length >= 4 ? Number(numbers[3]) : 0;
    if ([length, width, height].some((value) => value <= 0)) {
      bad.push(line);
      continue;
    }
    parcels.push({ dims: { length, width, height }, weight, quantity: quantity > 0 ? quantity : 1 });
  }
  return { parcels, bad, truncated };
}

export type BatchTotals = {
  count: number;
  actual: number;
  volumetric: number;
  chargeable: number;
};

/**
 * Per-parcel chargeable weights, added up. Rounding is applied per parcel,
 * because that is how carriers bill a multi-piece shipment — rounding the total
 * instead understates it, sometimes by several kilograms.
 */
export function batchTotals(
  parcels: readonly Parcel[],
  unit: LengthUnit,
  divisor: Divisor,
  mass: MassUnit,
  step: number
): BatchTotals {
  let actual = 0;
  let volumetric = 0;
  let chargeable = 0;
  let count = 0;
  for (const parcel of parcels) {
    const dim = volumetricWeight(parcel.dims, unit, divisor, mass) ?? 0;
    const verdict = chargeableWeight(parcel.weight, dim, step);
    count += parcel.quantity;
    actual += parcel.weight * parcel.quantity;
    volumetric += dim * parcel.quantity;
    chargeable += (verdict?.chargeable ?? 0) * parcel.quantity;
  }
  return { count, actual, volumetric, chargeable };
}
