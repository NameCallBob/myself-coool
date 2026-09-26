import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_IDS,
  buildReport,
  caveatsFor,
  gcd,
  megapixels,
  orientationOf,
  physicalPixels,
  ratioOf,
  supportedCount,
  type Facts,
} from './logic.ts';

const base: Facts = {
  screenWidth: 1920,
  screenHeight: 1080,
  availWidth: 1920,
  availHeight: 1040,
  colorDepth: 24,
  viewportWidth: 1280,
  viewportHeight: 720,
  dpr: 2,
  cores: 8,
  memoryGiB: 8,
  maxTouchPoints: 0,
  languages: ['zh-TW', 'en'],
  timeZone: 'Asia/Taipei',
  gamut: 'p3',
  colorScheme: 'dark',
  reducedMotion: false,
  pointer: 'fine',
  hover: true,
  online: true,
  cookieEnabled: true,
  userAgent: 'Mozilla/5.0 (test)',
  features: [
    { id: 'WebAssembly', ok: true },
    { id: 'WebGPU', ok: false },
    { id: 'Web Bluetooth', ok: false },
  ],
};

const facts = (over: Partial<Facts> = {}): Facts => ({ ...base, ...over });

/* ── gcd and ratios ───────────────────────── */

test('gcd', () => {
  assert.equal(gcd(1920, 1080), 120);
  assert.equal(gcd(7, 13), 1);
  assert.equal(gcd(0, 5), 5);
  assert.equal(gcd(5, 0), 5);
  assert.equal(gcd(0, 0), 0);
  assert.equal(gcd(-12, 18), 6);
});

test('common screen ratios reduce to what people call them', () => {
  assert.equal(ratioOf(1920, 1080), '16:9');
  assert.equal(ratioOf(3840, 2160), '16:9');
  assert.equal(ratioOf(2560, 1600), '16:10');
  assert.equal(ratioOf(1440, 900), '16:10', '8:5 is normalised to 16:10');
  assert.equal(ratioOf(2048, 1536), '4:3');
  assert.equal(ratioOf(2256, 1504), '3:2');
  assert.equal(ratioOf(3440, 1440), '43:18', 'an ultrawide that really is 43:18');
  assert.equal(ratioOf(1080, 1920), '9:16', 'portrait keeps its order');
  assert.equal(ratioOf(1000, 1000), '1:1');
});

test('a ratio that reduces to nothing useful falls back to the nearest common one', () => {
  // The iPhone 14 Pro's 1179×2556 has no small exact ratio.
  assert.equal(ratioOf(393, 852), '131:284');
  // 1366×768 is 683:384, which is within 2% of 16:9.
  assert.equal(ratioOf(1366, 768), '≈16:9');
});

test('ratioOf refuses nonsense instead of dividing by zero', () => {
  assert.equal(ratioOf(0, 1080), '—');
  assert.equal(ratioOf(1920, 0), '—');
  assert.equal(ratioOf(-1920, 1080), '—');
  assert.equal(ratioOf(Number.NaN, 1080), '—');
  assert.equal(ratioOf(Number.POSITIVE_INFINITY, 1080), '—');
});

/* ── Pixels ───────────────────────────────── */

test('physical pixels multiply by the device pixel ratio', () => {
  assert.deepEqual(physicalPixels(390, 844, 3), [1170, 2532]);
  assert.deepEqual(physicalPixels(1512, 982, 2), [3024, 1964]);
  assert.deepEqual(physicalPixels(1280, 800, 1), [1280, 800]);
});

test('a fractional ratio rounds rather than producing a fractional pixel', () => {
  assert.deepEqual(physicalPixels(412, 915, 2.625), [1082, 2402]);
});

test('physicalPixels survives a missing or absurd ratio', () => {
  assert.deepEqual(physicalPixels(100, 200, 0), [100, 200]);
  assert.deepEqual(physicalPixels(100, 200, Number.NaN), [100, 200]);
  assert.deepEqual(physicalPixels(100, 200, -2), [100, 200]);
});

test('megapixels', () => {
  assert.equal(megapixels(1920, 1080, 1), 2.0736);
  assert.equal(Number(megapixels(390, 844, 3).toFixed(3)), 2.962);
  assert.equal(megapixels(0, 0, 2), 0);
});

test('orientation', () => {
  assert.equal(orientationOf(1920, 1080), 'landscape');
  assert.equal(orientationOf(390, 844), 'portrait');
  assert.equal(orientationOf(800, 800), 'square');
});

/* ── Caveats ──────────────────────────────── */

test('a quantised memory figure always gets a footnote', () => {
  assert.ok(caveatsFor(facts()).includes('memory-quantised'));
  assert.ok(caveatsFor(facts({ memoryGiB: null })).includes('memory-missing'));
  assert.ok(!caveatsFor(facts({ memoryGiB: null })).includes('memory-quantised'));
});

test('a fractional device pixel ratio is flagged, an integer one is not', () => {
  assert.ok(caveatsFor(facts({ dpr: 2.625 })).includes('dpr-fractional'));
  assert.ok(!caveatsFor(facts({ dpr: 2 })).includes('dpr-fractional'));
  assert.ok(!caveatsFor(facts({ dpr: 0 })).includes('dpr-fractional'));
});

test('withheld core count is flagged', () => {
  assert.ok(caveatsFor(facts({ cores: null })).includes('cores-missing'));
  assert.ok(!caveatsFor(facts()).includes('cores-missing'));
});

test('a touchscreen laptop is flagged, because that combination breaks assumptions', () => {
  assert.ok(caveatsFor(facts({ maxTouchPoints: 10, pointer: 'fine' })).includes('touch-desktop'));
  assert.ok(!caveatsFor(facts({ maxTouchPoints: 10, pointer: 'coarse' })).includes('touch-desktop'));
});

test('a viewport wider than the screen means zoom or a scaled display', () => {
  assert.ok(
    caveatsFor(facts({ viewportWidth: 2400, screenWidth: 1920 })).includes('viewport-vs-screen')
  );
  assert.ok(!caveatsFor(facts()).includes('viewport-vs-screen'));
});

/* ── Feature list ─────────────────────────── */

test('the feature list has no duplicates', () => {
  assert.equal(new Set(FEATURE_IDS).size, FEATURE_IDS.length);
  assert.ok(FEATURE_IDS.length > 20);
});

test('supportedCount counts only the passes', () => {
  assert.equal(supportedCount(base.features), 1);
  assert.equal(supportedCount([]), 0);
});

/* ── Report ───────────────────────────────── */

test('the report states every figure and marks the quantised one', () => {
  const report = buildReport(facts());
  assert.match(report, /^User-Agent: Mozilla\/5\.0 \(test\)$/m);
  assert.match(report, /Screen: 1920×1080 CSS px \(16:9\), 3840×2160 device px/);
  assert.match(report, /Viewport: 1280×720 CSS px \(landscape\)/);
  assert.match(report, /Memory: 8 GiB or more \(quantised\)/);
  assert.match(report, /Cores: 8/);
  assert.match(report, /Unsupported of 3 checked: WebGPU, Web Bluetooth/);
  assert.match(report, /Time zone: Asia\/Taipei/);
});

test('the report says "not reported" rather than 0 or undefined', () => {
  const report = buildReport(facts({ cores: null, memoryGiB: null, languages: [], timeZone: '' }));
  assert.match(report, /Cores: not reported/);
  assert.match(report, /Memory: not reported/);
  assert.match(report, /Languages: not reported/);
  assert.match(report, /Time zone: not reported/);
});

test('a machine that supports everything says so', () => {
  const report = buildReport(
    facts({ features: [{ id: 'WebAssembly', ok: true }] })
  );
  assert.match(report, /Unsupported of 1 checked: none/);
});

test('the report is plain lines with no trailing blank', () => {
  const report = buildReport(facts());
  assert.equal(report.trim(), report);
  assert.equal(report.includes('\n\n'), false);
  assert.equal(report.split('\n').length, 14);
});
