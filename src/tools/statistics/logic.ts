/**
 * Descriptive statistics over a pasted column of numbers.
 *
 * Two decisions in here are the whole reason this file is longer than a
 * one-liner.
 *
 * The first is quartiles. There is no single definition: R's default and
 * Excel's PERCENTILE.INC interpolate at (n−1)p, Excel's QUARTILE.EXC and
 * Minitab at (n+1)p, and on the same eight numbers those two give different
 * answers. A tool that silently picks one and prints "Q1" is telling the reader
 * something they cannot reproduce, so both are implemented and the choice is
 * surfaced.
 *
 * The second is the sample-versus-population divisor. Dividing the sum of
 * squares by n describes the numbers you have; dividing by n−1 estimates the
 * spread of the population they came from. The gap is large on small n — on
 * five values the sample SD is 12% bigger — so both are reported rather than
 * one being labelled "the" standard deviation.
 *
 * Sums use a two-pass mean and a compensated accumulation. A single-pass
 * E[x²] − E[x]² is one subtraction of two nearly equal large numbers, which on
 * a column of values around 1e6 loses most of the significant digits and can
 * even return a negative variance.
 */

/** Values accepted. Past this, sorting and rendering stop being instant. */
export const MAX_VALUES = 100_000;

/** Characters of input accepted, so a dropped file cannot lock the tab. */
export const MAX_INPUT = 2_000_000;

export type ParseResult = {
  values: number[];
  /** Tokens that were not numbers, kept so the UI can show what it ignored. */
  skipped: string[];
  /** Input was cut at MAX_VALUES. */
  truncated: boolean;
};

/**
 * Splits input on anything that is not part of a number and reads each piece.
 *
 * Separators are deliberately generous — newlines, commas, tabs, semicolons and
 * spaces all appear in pasted columns — and non-numeric tokens are collected
 * rather than dropped, because a column pasted with its header should report
 * "ignored: 銷售額" instead of quietly computing over one fewer row.
 */
export function parseSeries(text: string): ParseResult {
  const source = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text;
  const normalised = source
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[．。]/g, '.')
    .replace(/[，、]/g, ',');

  const values: number[] = [];
  const skipped: string[] = [];
  let truncated = text.length > MAX_INPUT;

  for (const raw of normalised.split(/[\s,;|]+/)) {
    if (raw === '') continue;
    if (values.length >= MAX_VALUES) {
      truncated = true;
      break;
    }
    // Thousands separators only survive when they are not the separator: a
    // comma has already split the token, so what is left is 1 234 or 1'234.
    const token = raw.replace(/[_'’]/g, '').replace(/^[$¥￥€£]/, '').replace(/%$/, '');
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(token)) {
      values.push(Number(token));
    } else {
      if (skipped.length < 50) skipped.push(raw);
    }
  }

  return { values, skipped, truncated };
}

export type QuartileMethod = 'inclusive' | 'exclusive';

/**
 * Quantile of an ascending array.
 *
 * `inclusive` is R type 7 / Excel PERCENTILE.INC: position (n−1)p, so the
 * quartiles of a sample always lie between its own values.
 * `exclusive` is R type 6 / Excel QUARTILE.EXC: position (n+1)p, which treats
 * the sample as a draw from something wider and therefore spreads the
 * quartiles further apart. It is undefined near the ends for small n, where it
 * falls back to the extreme value.
 */
export function quantile(sorted: readonly number[], p: number, method: QuartileMethod): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0];
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];

  if (method === 'inclusive') {
    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, n - 1);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }

  const h = (n + 1) * p;
  if (h <= 1) return sorted[0];
  if (h >= n) return sorted[n - 1];
  const lo = Math.floor(h);
  const frac = h - lo;
  return sorted[lo - 1] + frac * (sorted[lo] - sorted[lo - 1]);
}

/** Neumaier compensated summation: the running error is kept and added back. */
export function kahanSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const next = sum + value;
    if (Math.abs(sum) >= Math.abs(value)) {
      compensation += sum - next + value;
    } else {
      compensation += value - next + sum;
    }
    sum = next;
  }
  return sum + compensation;
}

export type Summary = {
  n: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  range: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  /** Divisor n — describes these numbers. */
  variancePopulation: number;
  sdPopulation: number;
  /** Divisor n−1 — estimates the population they came from. NaN when n < 2. */
  varianceSample: number;
  sdSample: number;
  /** Standard error of the mean, from the sample SD. */
  sem: number;
  /** Coefficient of variation: sample SD over mean. NaN when the mean is 0. */
  cv: number;
  /** Mean absolute deviation from the mean. */
  mad: number;
  /** Fisher–Pearson sample skewness (g1). NaN when n < 3 or SD is 0. */
  skewness: number;
  /** Excess kurtosis (g2). NaN when n < 4 or SD is 0. */
  kurtosis: number;
  /** Geometric mean. NaN unless every value is positive. */
  geometricMean: number;
  /** Harmonic mean. NaN unless every value is non-zero and same-signed. */
  harmonicMean: number;
  /** Most frequent values, when any value repeats at all. */
  modes: number[];
  modeCount: number;
  /** Values outside Q1 − 1.5·IQR … Q3 + 1.5·IQR, Tukey's rule. */
  outliers: number[];
  sorted: number[];
};

const EMPTY_SUMMARY: Summary = {
  n: 0,
  sum: 0,
  mean: Number.NaN,
  min: Number.NaN,
  max: Number.NaN,
  range: Number.NaN,
  median: Number.NaN,
  q1: Number.NaN,
  q3: Number.NaN,
  iqr: Number.NaN,
  variancePopulation: Number.NaN,
  sdPopulation: Number.NaN,
  varianceSample: Number.NaN,
  sdSample: Number.NaN,
  sem: Number.NaN,
  cv: Number.NaN,
  mad: Number.NaN,
  skewness: Number.NaN,
  kurtosis: Number.NaN,
  geometricMean: Number.NaN,
  harmonicMean: Number.NaN,
  modes: [],
  modeCount: 0,
  outliers: [],
  sorted: [],
};

export function summarise(
  values: readonly number[],
  method: QuartileMethod = 'inclusive'
): Summary {
  const n = values.length;
  if (n === 0) return { ...EMPTY_SUMMARY };

  const sorted = values.slice().sort((a, b) => a - b);
  const sum = kahanSum(values);
  const mean = sum / n;

  // Two passes: the deviations are computed against a mean that is already
  // known, so no large-minus-large cancellation happens.
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  let absolute = 0;
  for (const value of values) {
    const d = value - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
    absolute += Math.abs(d);
  }

  const variancePopulation = m2 / n;
  const sdPopulation = Math.sqrt(variancePopulation);
  const varianceSample = n > 1 ? m2 / (n - 1) : Number.NaN;
  const sdSample = n > 1 ? Math.sqrt(varianceSample) : Number.NaN;

  const q1 = quantile(sorted, 0.25, method);
  const median = quantile(sorted, 0.5, method);
  const q3 = quantile(sorted, 0.75, method);
  const iqr = q3 - q1;

  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const outliers = sorted.filter((value) => value < lowFence || value > highFence);

  // Frequencies. A "mode" is only reported when something actually repeats —
  // on continuous measurements every value is its own mode, which is noise.
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let modeCount = 0;
  for (const c of counts.values()) if (c > modeCount) modeCount = c;
  const modes =
    modeCount > 1
      ? [...counts.entries()]
          .filter(([, c]) => c === modeCount)
          .map(([value]) => value)
          .sort((a, b) => a - b)
      : [];

  const allPositive = sorted[0] > 0;
  const geometricMean = allPositive
    ? Math.exp(kahanSum(values.map((value) => Math.log(value))) / n)
    : Number.NaN;
  const sameSign = sorted[0] > 0 || sorted[n - 1] < 0;
  const harmonicMean = sameSign ? n / kahanSum(values.map((value) => 1 / value)) : Number.NaN;

  // g1 and g2 with the usual small-sample corrections (SAS/SPSS definitions,
  // which is what Excel's SKEW and KURT also use).
  const skewness =
    n > 2 && sdSample > 0
      ? ((n / ((n - 1) * (n - 2))) * m3) / sdSample ** 3
      : Number.NaN;
  const kurtosis =
    n > 3 && sdSample > 0
      ? ((n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * sdSample ** 4)) -
        (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
      : Number.NaN;

  return {
    n,
    sum,
    mean,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    median,
    q1,
    q3,
    iqr,
    variancePopulation,
    sdPopulation,
    varianceSample,
    sdSample,
    sem: n > 1 ? sdSample / Math.sqrt(n) : Number.NaN,
    cv: mean !== 0 && n > 1 ? sdSample / Math.abs(mean) : Number.NaN,
    mad: absolute / n,
    skewness,
    kurtosis,
    geometricMean,
    harmonicMean,
    modes,
    modeCount,
    outliers,
    sorted,
  };
}

export type Bin = { from: number; to: number; count: number };

/**
 * Sturges' rule, the textbook default: ceil(log2 n) + 1.
 *
 * It under-bins heavily skewed data, so the UI lets the number be overridden;
 * Freedman–Diaconis is offered next to it because it reacts to spread rather
 * than only to count.
 */
export function sturgesBins(n: number): number {
  if (n < 2) return 1;
  return Math.max(1, Math.min(60, Math.ceil(Math.log2(n)) + 1));
}

/** Freedman–Diaconis: bin width 2·IQR/∛n, expressed as a bin count. */
export function freedmanDiaconisBins(summary: Summary): number {
  if (summary.n < 2 || !Number.isFinite(summary.iqr) || summary.iqr <= 0) {
    return sturgesBins(summary.n);
  }
  const width = (2 * summary.iqr) / Math.cbrt(summary.n);
  if (width <= 0) return sturgesBins(summary.n);
  return Math.max(1, Math.min(60, Math.ceil(summary.range / width)));
}

/**
 * Equal-width bins over [min, max].
 *
 * The last bin includes its upper edge; every other bin is half-open. Without
 * that the maximum value falls outside every bin and the counts do not add up
 * to n — a histogram that loses exactly one observation, always the largest.
 */
export function histogram(values: readonly number[], bins: number): Bin[] {
  const n = values.length;
  if (n === 0 || bins < 1) return [];

  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === max) return [{ from: min, to: max, count: n }];

  const wanted = Math.min(Math.trunc(bins), 200);
  const width = (max - min) / wanted;
  const out: Bin[] = Array.from({ length: wanted }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));

  for (const value of values) {
    let index = Math.floor((value - min) / width);
    if (index >= wanted) index = wanted - 1;
    if (index < 0) index = 0;
    out[index].count += 1;
  }

  return out;
}

/**
 * Statistic formatting: six significant digits, which is more than the input
 * usually deserves and few enough that float noise stays hidden.
 */
export function formatStat(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e12 || abs < 1e-6) return value.toExponential(4);
  if (Number.isInteger(value) && abs < 1e12) return value.toLocaleString('en-US');
  const text = Number(value.toPrecision(digits));
  return text.toLocaleString('en-US', { maximumFractionDigits: 10 });
}
