import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VALUES,
  formatStat,
  freedmanDiaconisBins,
  histogram,
  kahanSum,
  parseSeries,
  quantile,
  sturgesBins,
  summarise,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance = 1e-9, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

/** The worked example throughout: mean 5, population SD exactly 2. */
const SAMPLE = [2, 4, 4, 4, 5, 5, 7, 9];

test('parseSeries reads a column however it was pasted', () => {
  assert.deepEqual(parseSeries('1\n2\n3').values, [1, 2, 3]);
  assert.deepEqual(parseSeries('1, 2, 3').values, [1, 2, 3]);
  assert.deepEqual(parseSeries('1\t2\t3').values, [1, 2, 3]);
  assert.deepEqual(parseSeries('1;2|3').values, [1, 2, 3]);
  assert.deepEqual(parseSeries('  1   2  ').values, [1, 2]);
  assert.deepEqual(parseSeries('-1.5\n+2\n.5\n1e3').values, [-1.5, 2, 0.5, 1000]);
  assert.deepEqual(parseSeries('').values, []);
});

test('parseSeries normalises full-width digits and strips currency', () => {
  assert.deepEqual(parseSeries('１２３\n４５').values, [123, 45]);
  assert.deepEqual(parseSeries('１．５').values, [1.5]);
  assert.deepEqual(parseSeries('$100\n¥250').values, [100, 250]);
  assert.deepEqual(parseSeries("1'234\n1_000").values, [1234, 1000]);
  assert.deepEqual(parseSeries('12%\n30%').values, [12, 30]);
});

test('parseSeries reports what it ignored instead of hiding it', () => {
  const result = parseSeries('銷售額\n100\nn/a\n200');
  assert.deepEqual(result.values, [100, 200]);
  assert.deepEqual(result.skipped, ['銷售額', 'n/a']);
  assert.equal(result.truncated, false);
});

test('parseSeries stops at the value ceiling and says so', () => {
  const many = Array.from({ length: MAX_VALUES + 10 }, (_, i) => i).join('\n');
  const result = parseSeries(many);
  assert.equal(result.values.length, MAX_VALUES);
  assert.equal(result.truncated, true);
});

test('kahanSum survives a column where naive addition loses digits', () => {
  // 1e16 + ten 1s: plain accumulation keeps none of the ones.
  const values = [1e16, ...Array.from({ length: 10 }, () => 1)];
  assert.equal(kahanSum(values), 1e16 + 10);
  assert.equal(kahanSum([]), 0);
  assert.equal(kahanSum([0.1, 0.2, 0.3]), 0.6);
  assert.equal(kahanSum([1, -1, 1, -1]), 0);
});

test('the two quartile conventions disagree, and both are the published ones', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
  // R type 7 / Excel PERCENTILE.INC.
  near(quantile(sorted, 0.25, 'inclusive'), 2.75);
  near(quantile(sorted, 0.5, 'inclusive'), 4.5);
  near(quantile(sorted, 0.75, 'inclusive'), 6.25);
  // R type 6 / Excel QUARTILE.EXC / Minitab.
  near(quantile(sorted, 0.25, 'exclusive'), 2.25);
  near(quantile(sorted, 0.5, 'exclusive'), 4.5);
  near(quantile(sorted, 0.75, 'exclusive'), 6.75);
});

test('quantile handles the ends and the degenerate sizes', () => {
  assert.ok(Number.isNaN(quantile([], 0.5, 'inclusive')));
  assert.equal(quantile([7], 0.25, 'inclusive'), 7);
  assert.equal(quantile([7], 0.25, 'exclusive'), 7);
  assert.equal(quantile([1, 2, 3], 0, 'inclusive'), 1);
  assert.equal(quantile([1, 2, 3], 1, 'inclusive'), 3);
  // With n = 3 the exclusive rule asks for a position outside the data.
  assert.equal(quantile([1, 2, 3], 0.25, 'exclusive'), 1);
  assert.equal(quantile([1, 2, 3], 0.75, 'exclusive'), 3);
  near(quantile([1, 2], 0.5, 'inclusive'), 1.5);
});

test('summarise matches the hand-computed figures for the worked example', () => {
  const s = summarise(SAMPLE);
  assert.equal(s.n, 8);
  assert.equal(s.sum, 40);
  assert.equal(s.mean, 5);
  assert.equal(s.min, 2);
  assert.equal(s.max, 9);
  assert.equal(s.range, 7);
  near(s.median, 4.5);
  near(s.q1, 4);
  near(s.q3, 5.5);
  near(s.iqr, 1.5);
  // Σd² = 32, so population variance is 4 exactly and sample variance 32/7.
  near(s.variancePopulation, 4);
  near(s.sdPopulation, 2);
  near(s.varianceSample, 32 / 7);
  near(s.sdSample, 2.138089935299395);
  near(s.sem, 0.7559289460184544);
  near(s.cv, 0.427617987059879);
  near(s.mad, 1.5);
  near(s.skewness, 0.8184875533567996, 1e-12);
  near(s.kurtosis, 0.940625, 1e-10);
  assert.deepEqual(s.modes, [4]);
  assert.equal(s.modeCount, 3);
  assert.deepEqual(s.sorted, [2, 4, 4, 4, 5, 5, 7, 9]);
});

test('the quartile method changes the quartiles and the fences', () => {
  const inclusive = summarise(SAMPLE, 'inclusive');
  const exclusive = summarise(SAMPLE, 'exclusive');
  near(inclusive.q3, 5.5);
  near(exclusive.q3, 6.5);
  near(exclusive.iqr, 2.5);
  assert.notEqual(inclusive.iqr, exclusive.iqr);
  // Same data, same mean — only the order statistics move.
  assert.equal(inclusive.mean, exclusive.mean);
});

test('population and sample spread are both reported and differ', () => {
  const s = summarise([1, 2, 3, 4, 5]);
  near(s.mean, 3);
  near(s.variancePopulation, 2);
  near(s.varianceSample, 2.5);
  near(s.sdPopulation, Math.sqrt(2));
  near(s.sdSample, Math.sqrt(2.5));
  // The gap is 12% on five values, which is why one number is not enough.
  assert.ok(s.sdSample / s.sdPopulation > 1.1);
});

test('summarise degrades honestly on one value and on none', () => {
  const one = summarise([42]);
  assert.equal(one.n, 1);
  assert.equal(one.mean, 42);
  assert.equal(one.median, 42);
  assert.equal(one.variancePopulation, 0);
  assert.ok(Number.isNaN(one.varianceSample), 'n−1 is zero, so there is no estimate');
  assert.ok(Number.isNaN(one.sdSample));
  assert.ok(Number.isNaN(one.skewness));
  assert.ok(Number.isNaN(one.kurtosis));
  assert.deepEqual(one.modes, [], 'one value is not a mode');

  const none = summarise([]);
  assert.equal(none.n, 0);
  assert.ok(Number.isNaN(none.mean));
  assert.deepEqual(none.sorted, []);
  assert.deepEqual(none.outliers, []);
});

test('all-identical values have zero spread and no shape', () => {
  const s = summarise([3, 3, 3, 3, 3]);
  assert.equal(s.sdPopulation, 0);
  assert.equal(s.sdSample, 0);
  assert.equal(s.iqr, 0);
  assert.ok(Number.isNaN(s.skewness), 'skewness needs a non-zero SD');
  assert.ok(Number.isNaN(s.kurtosis));
  assert.deepEqual(s.modes, [3]);
  assert.deepEqual(s.outliers, []);
});

test("Tukey's 1.5·IQR rule finds the far values", () => {
  const s = summarise([10, 11, 12, 13, 14, 15, 16, 100]);
  assert.deepEqual(s.outliers, [100]);
  const clean = summarise([10, 11, 12, 13, 14]);
  assert.deepEqual(clean.outliers, []);
  // Both tails.
  const both = summarise([-500, 10, 11, 12, 13, 14, 15, 500]);
  assert.deepEqual(both.outliers, [-500, 500]);
});

test('modes only appear when something actually repeats', () => {
  assert.deepEqual(summarise([1, 2, 3, 4]).modes, [], 'continuous data has no mode');
  assert.deepEqual(summarise([1, 1, 2, 2, 3]).modes, [1, 2], 'bimodal');
  assert.equal(summarise([1, 1, 2, 2, 3]).modeCount, 2);
  assert.deepEqual(summarise([5, 5, 5]).modes, [5]);
});

test('geometric and harmonic means refuse the inputs they are undefined on', () => {
  near(summarise([1, 2, 4, 8]).geometricMean, 2.82842712474619);
  near(summarise([1, 2, 4]).harmonicMean, 1.7142857142857142);
  assert.ok(Number.isNaN(summarise([1, 0, 4]).geometricMean), 'a zero kills the product');
  assert.ok(Number.isNaN(summarise([1, -2, 4]).geometricMean));
  assert.ok(Number.isNaN(summarise([1, 0, 4]).harmonicMean), 'a zero has no reciprocal');
  assert.ok(Number.isNaN(summarise([-1, 2]).harmonicMean), 'mixed signs cancel to nonsense');
  // All negative is well defined for the harmonic mean.
  near(summarise([-1, -2, -4]).harmonicMean, -1.7142857142857142);
});

test('variance stays accurate on large values where the naive formula fails', () => {
  // E[x²] − E[x]² on these loses every significant digit and can go negative.
  const values = [1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16];
  const s = summarise(values);
  near(s.mean, 1e9 + 10, 1e-6);
  near(s.varianceSample, 30, 1e-6);
  assert.ok(s.variancePopulation > 0, 'variance must never come out negative');
});

test('histogram bins cover the range and the counts add up', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const bins = histogram(values, 5);
  assert.equal(bins.length, 5);
  assert.equal(
    bins.reduce((sum, bin) => sum + bin.count, 0),
    values.length,
    'a histogram that drops an observation is wrong'
  );
  near(bins[0].from, 1);
  near(bins[4].to, 10);
  // The maximum belongs to the last bin, not to a bin past the end.
  assert.ok(bins[4].count >= 1);
});

test('histogram handles the degenerate shapes', () => {
  assert.deepEqual(histogram([], 5), []);
  assert.deepEqual(histogram([3, 3, 3], 5), [{ from: 3, to: 3, count: 3 }]);
  assert.deepEqual(histogram([1, 2], 0), []);
  assert.equal(histogram([1, 2, 3], 1).length, 1);
  assert.equal(histogram([1, 2, 3], 1)[0].count, 3);
  // A silly bin request is capped rather than allocating a huge array.
  assert.ok(histogram([1, 2, 3], 10_000).length <= 200);
});

test('histogram counts add up on a skewed column too', () => {
  const values = [1, 1, 1, 2, 2, 3, 50];
  for (const bins of [2, 3, 7, 20]) {
    const result = histogram(values, bins);
    assert.equal(
      result.reduce((sum, bin) => sum + bin.count, 0),
      values.length,
      `bins=${bins}`
    );
  }
});

test('bin-count suggestions are sane and bounded', () => {
  assert.equal(sturgesBins(0), 1);
  assert.equal(sturgesBins(1), 1);
  assert.equal(sturgesBins(8), 4, 'ceil(log2 8) + 1');
  assert.equal(sturgesBins(100), 8);
  assert.ok(sturgesBins(1e9) <= 60);

  const spread = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const fd = freedmanDiaconisBins(spread);
  assert.ok(fd >= 1 && fd <= 60);
  // With no spread at all it falls back rather than dividing by zero.
  assert.equal(freedmanDiaconisBins(summarise([5, 5, 5, 5])), sturgesBins(4));
  assert.equal(freedmanDiaconisBins(summarise([])), sturgesBins(0));
});

test('formatStat keeps figures readable without inventing precision', () => {
  assert.equal(formatStat(0), '0');
  assert.equal(formatStat(5), '5');
  assert.equal(formatStat(1234567), '1,234,567');
  assert.equal(formatStat(2.138089935299395), '2.13809');
  assert.equal(formatStat(1 / 3), '0.333333');
  assert.equal(formatStat(Number.NaN), '—');
  assert.equal(formatStat(-4.5), '-4.5');
  assert.ok(formatStat(1e15).includes('e+'));
  assert.ok(formatStat(1e-9).includes('e-'));
});

test('a large column still summarises', () => {
  // 50 000 values: the sort and the two passes must stay linear-ish.
  const values = Array.from({ length: 50_000 }, (_, i) => (i % 997) - 498);
  const s = summarise(values);
  assert.equal(s.n, 50_000);
  assert.ok(Number.isFinite(s.sdSample));
  assert.equal(s.sorted.length, 50_000);
  assert.equal(
    histogram(values, 40).reduce((sum, bin) => sum + bin.count, 0),
    50_000
  );
});
