import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATS,
  FORMAT_EXT,
  FORMAT_LABEL,
  PIXEL_CEILING,
  QUALITY_CEILING,
  QUALITY_FLOOR,
  QUALITY_SEARCH_ROUNDS,
  advanceQualitySearch,
  bitsPerPixel,
  clampQuality,
  decodedBytes,
  dropsAlpha,
  isLossy,
  isSilentFallback,
  megapixels,
  outputSize,
  pixels,
  renameFor,
  scaleBy,
  sizeDelta,
  startQualitySearch,
  withinCeiling,
  type ImageFormat,
  type QualitySearch,
} from './logic.ts';

test('the format table covers every format exactly once', () => {
  assert.deepEqual([...FORMATS], ['image/webp', 'image/avif', 'image/jpeg', 'image/png']);
  assert.equal(new Set(FORMATS).size, FORMATS.length);
  for (const format of FORMATS) {
    assert.equal(typeof FORMAT_LABEL[format], 'string');
    assert.match(FORMAT_EXT[format], /^[a-z]+$/);
  }
  assert.equal(FORMAT_LABEL['image/jpeg'], 'JPEG');
  // .jpg rather than .jpeg: the extension people actually have on disk.
  assert.equal(FORMAT_EXT['image/jpeg'], 'jpg');
  assert.equal(FORMAT_EXT['image/avif'], 'avif');
});

test('quality applies to the lossy formats only', () => {
  assert.equal(isLossy('image/jpeg'), true);
  assert.equal(isLossy('image/webp'), true);
  assert.equal(isLossy('image/avif'), true);
  assert.equal(isLossy('image/png'), false);
});

test('only JPEG loses the alpha channel', () => {
  assert.equal(dropsAlpha('image/jpeg'), true);
  for (const format of FORMATS.filter((f) => f !== 'image/jpeg')) {
    assert.equal(dropsAlpha(format), false);
  }
});

test('scaleBy keeps whole pixels and never reaches zero', () => {
  assert.deepEqual(scaleBy({ width: 1920, height: 1080 }, 0.5), { width: 960, height: 540 });
  // 1 px tall scaled to a tenth still has to be a pixel.
  assert.deepEqual(scaleBy({ width: 100, height: 1 }, 0.1), { width: 10, height: 1 });
  // Half-pixel rounding: 3 * 0.5 = 1.5 rounds up, 1 * 0.5 = 0.5 clamps to 1.
  assert.deepEqual(scaleBy({ width: 3, height: 1 }, 0.5), { width: 2, height: 1 });
  assert.deepEqual(scaleBy({ width: 100, height: 100 }, 2), { width: 200, height: 200 });
  assert.throws(() => scaleBy({ width: 10, height: 10 }, 0), RangeError);
  assert.throws(() => scaleBy({ width: 10, height: 10 }, -1), RangeError);
  assert.throws(() => scaleBy({ width: 10, height: 10 }, Number.NaN), RangeError);
});

test('outputSize: none passes the source through, rounded', () => {
  assert.deepEqual(outputSize({ width: 800, height: 600 }, 'none', 0), { width: 800, height: 600 });
  assert.deepEqual(outputSize({ width: 800.4, height: 599.5 }, 'none', 0), { width: 800, height: 600 });
});

test('outputSize: longest side, hand-checked', () => {
  // 1920x1080 to a 800 px long side: 1080 * (800/1920) = 450 exactly.
  assert.deepEqual(outputSize({ width: 1920, height: 1080 }, 'longest', 800), { width: 800, height: 450 });
  // Portrait: the long side is the height, so that is the one pinned.
  assert.deepEqual(outputSize({ width: 1080, height: 1920 }, 'longest', 800), { width: 450, height: 800 });
  // 4:3 phone photo, 4032x3024 to 1600: 3024 * (1600/4032) = 1200.
  assert.deepEqual(outputSize({ width: 4032, height: 3024 }, 'longest', 1600), { width: 1600, height: 1200 });
});

test('outputSize: pinning one side', () => {
  assert.deepEqual(outputSize({ width: 1000, height: 600 }, 'width', 300), { width: 300, height: 180 });
  assert.deepEqual(outputSize({ width: 1000, height: 600 }, 'height', 300), { width: 500, height: 300 });
  // 1999 -> 500 is 0.25012…, so the other side rounds rather than truncates.
  assert.deepEqual(outputSize({ width: 1999, height: 999 }, 'width', 500), { width: 500, height: 250 });
});

test('outputSize: scale is a percentage', () => {
  assert.deepEqual(outputSize({ width: 1000, height: 500 }, 'scale', 40), { width: 400, height: 200 });
  assert.deepEqual(outputSize({ width: 1000, height: 500 }, 'scale', 33), { width: 330, height: 165 });
  assert.deepEqual(outputSize({ width: 10, height: 10 }, 'scale', 150, true), { width: 15, height: 15 });
});

test('outputSize refuses to enlarge unless asked, and never skews when it declines', () => {
  const source = { width: 800, height: 600 };
  assert.deepEqual(outputSize(source, 'longest', 2000), source);
  assert.deepEqual(outputSize(source, 'width', 1600), source);
  assert.deepEqual(outputSize(source, 'height', 1600), source);
  assert.deepEqual(outputSize(source, 'scale', 200), source);
  // Equal to the source is a no-op either way.
  assert.deepEqual(outputSize(source, 'longest', 800), source);
  assert.deepEqual(outputSize(source, 'scale', 100), source);
  // With upscale allowed the ratio is still held.
  assert.deepEqual(outputSize(source, 'longest', 1600, true), { width: 1600, height: 1200 });
  assert.deepEqual(outputSize(source, 'height', 1200, true), { width: 1600, height: 1200 });
});

test('outputSize rejects a non-positive target', () => {
  assert.throws(() => outputSize({ width: 10, height: 10 }, 'width', 0), RangeError);
  assert.throws(() => outputSize({ width: 10, height: 10 }, 'scale', -5), RangeError);
  assert.throws(() => outputSize({ width: 10, height: 10 }, 'longest', Number.NaN), RangeError);
  // 'none' ignores value entirely, so a nonsense value is not an error there.
  assert.deepEqual(outputSize({ width: 10, height: 10 }, 'none', -5), { width: 10, height: 10 });
});

test('pixel counts, megapixels and RGBA footprint', () => {
  assert.equal(pixels({ width: 1920, height: 1080 }), 2_073_600);
  assert.equal(megapixels({ width: 1920, height: 1080 }), 2.0736);
  assert.equal(megapixels({ width: 4000, height: 3000 }), 12);
  // 4 bytes per pixel is what a decoded frame actually costs.
  assert.equal(decodedBytes({ width: 1000, height: 1000 }), 4_000_000);
  assert.equal(withinCeiling({ width: 8000, height: 5000 }), true);
  assert.equal(pixels({ width: 8000, height: 5000 }), 40_000_000);
  assert.equal(PIXEL_CEILING, 40_000_000);
  assert.equal(withinCeiling({ width: 8001, height: 5000 }), false);
});

test('clampQuality snaps to the encoder grid and survives nonsense', () => {
  assert.equal(clampQuality(0.8), 0.8);
  assert.equal(clampQuality(0.756), 0.76);
  assert.equal(clampQuality(0.754), 0.75);
  assert.equal(clampQuality(5), QUALITY_CEILING);
  assert.equal(clampQuality(0), QUALITY_FLOOR);
  assert.equal(clampQuality(-1), QUALITY_FLOOR);
  assert.equal(clampQuality(Number.NaN), 0.8);
  assert.equal(clampQuality(Number.POSITIVE_INFINITY), 0.8);
  assert.equal(QUALITY_FLOOR, 0.05);
  assert.equal(QUALITY_CEILING, 1);
});

test('sizeDelta reports both readings of "compression rate"', () => {
  const smaller = sizeDelta(1_000_000, 250_000);
  assert.equal(smaller.savedBytes, 750_000);
  assert.equal(smaller.savedRatio, 0.75);
  assert.equal(smaller.remainingRatio, 0.25);
  assert.equal(smaller.verdict, 'smaller');

  // Re-encoding can grow a file — a PNG fallback for AVIF, or JPEG to PNG.
  const larger = sizeDelta(1000, 1200);
  assert.equal(larger.savedBytes, -200);
  assert.equal(larger.savedRatio, -0.2);
  assert.equal(larger.remainingRatio, 1.2);
  assert.equal(larger.verdict, 'larger');

  const same = sizeDelta(500, 500);
  assert.equal(same.savedRatio, 0);
  assert.equal(same.verdict, 'same');

  // An empty source must not divide by zero.
  const empty = sizeDelta(0, 0);
  assert.deepEqual(empty, { savedBytes: 0, savedRatio: 0, remainingRatio: 0, verdict: 'same' });

  assert.throws(() => sizeDelta(-1, 10), RangeError);
  assert.throws(() => sizeDelta(10, Number.NaN), RangeError);
});

test('bitsPerPixel is the size reading that survives a resize', () => {
  // 120 000 bytes over a megapixel: 960 000 bits / 1 000 000 px.
  assert.equal(bitsPerPixel(120_000, { width: 1000, height: 1000 }), 0.96);
  // Uncompressed 24-bit: 3 bytes per pixel is 24 bits per pixel.
  assert.equal(bitsPerPixel(300, { width: 10, height: 10 }), 24);
  assert.equal(bitsPerPixel(0, { width: 10, height: 10 }), 0);
  assert.throws(() => bitsPerPixel(-1, { width: 10, height: 10 }), RangeError);
});

test('renameFor swaps the extension and leaves the stem alone', () => {
  assert.equal(renameFor('photo.HEIC', 'image/webp'), 'photo.webp');
  assert.equal(renameFor('scan.jpeg', 'image/jpeg'), 'scan.jpg');
  assert.equal(renameFor('a.b.c.png', 'image/jpeg'), 'a.b.c.jpg');
  assert.equal(renameFor('noextension', 'image/png'), 'noextension.png');
  // A leading dot is part of the name, not an extension.
  assert.equal(renameFor('.gitignore', 'image/png'), '.gitignore.png');
  assert.equal(renameFor('   ', 'image/avif'), 'image.avif');
  assert.equal(renameFor('', 'image/avif'), 'image.avif');
  // Unicode, CJK and emoji stems pass through untouched.
  assert.equal(renameFor('照片 2024.jpg', 'image/webp'), '照片 2024.webp');
  assert.equal(renameFor('🐟.png', 'image/webp'), '🐟.webp');
  assert.equal(renameFor(' spaced.png ', 'image/webp'), 'spaced.webp');
});

test('isSilentFallback catches a canvas substituting PNG', () => {
  // The case this exists for: asked for AVIF, given PNG, told nothing.
  assert.equal(isSilentFallback('image/avif', 'image/png'), true);
  assert.equal(isSilentFallback('image/webp', 'image/png'), true);
  assert.equal(isSilentFallback('image/png', 'image/png'), false);
  // Parameters and case come from the browser, not from us.
  assert.equal(isSilentFallback('image/jpeg', 'image/jpeg;charset=binary'), false);
  assert.equal(isSilentFallback('IMAGE/PNG', 'image/png '), false);
  // An empty blob type is not the type we asked for.
  assert.equal(isSilentFallback('image/webp', ''), true);
});

test('startQualitySearch opens the bracket at 0.8', () => {
  const state = startQualitySearch();
  assert.equal(state.quality, 0.8);
  assert.equal(state.lo, 0);
  assert.equal(state.hi, 1);
  assert.equal(state.best, null);
  assert.equal(state.rounds, 0);
  assert.equal(state.done, false);
  assert.equal(startQualitySearch(0.4).quality, 0.4);
  assert.equal(startQualitySearch(9).quality, QUALITY_CEILING);
  assert.equal(QUALITY_SEARCH_ROUNDS, 7);
});

/** A stand-in encoder: bytes rise linearly with quality, as they do in
 *  practice for JPEG/WebP/AVIF. Used to drive the search to a known answer. */
function fakeEncoder(quality: number): number {
  return Math.round(50_000 + quality * 450_000);
}

function runSearch(budget: number, encoder: (q: number) => number) {
  let state = startQualitySearch();
  const probes: number[] = [];
  while (!state.done) {
    probes.push(state.quality);
    state = advanceQualitySearch(state, encoder(state.quality), budget);
    if (state.rounds > 20) throw new Error('search did not terminate');
  }
  return { state, probes };
}

test('advanceQualitySearch bisects to the best measured fit', () => {
  const { state, probes } = runSearch(200_000, fakeEncoder);
  // Hand-traced: 0.8 (410k, over) → 0.4 (230k, over) → 0.2 (140k, fits)
  // → 0.3 (185k) → 0.35 (207.5k, over) → 0.33 (198.5k, fits), bracket 0.02.
  assert.deepEqual(probes, [0.8, 0.4, 0.2, 0.3, 0.35, 0.33]);
  assert.equal(state.done, true);
  assert.equal(state.rounds, 6);
  assert.deepEqual(state.best, { quality: 0.33, bytes: 198_500 });
  // The reported size was measured, and it is inside the budget.
  assert.ok(state.best !== null && state.best.bytes <= 200_000);
  // 0.34 would have overshot: 50 000 + 153 000 = 203 000.
  assert.ok(fakeEncoder(0.34) > 200_000);
});

test('advanceQualitySearch climbs to the top of the grid when the budget is generous', () => {
  const { state, probes } = runSearch(5_000_000, fakeEncoder);
  // Nothing overshoots, so it keeps asking for more quality: 0.8, 0.9, 0.95,
  // 0.98 — at which point the bracket against the unmeasured ceiling is two
  // percent wide and there is nothing left worth trying.
  assert.deepEqual(probes, [0.8, 0.9, 0.95, 0.98]);
  assert.deepEqual(state.best, { quality: 0.98, bytes: fakeEncoder(0.98) });
  assert.equal(state.hi, 1);
  assert.equal(state.done, true);
  assert.ok(state.best !== null && state.best.bytes <= 5_000_000);
});

test('advanceQualitySearch reports an unreachable budget as a miss, not a near miss', () => {
  // The floor of this encoder is 72 500 bytes; the budget is under that.
  const { state, probes } = runSearch(40_000, fakeEncoder);
  assert.equal(state.done, true);
  assert.equal(state.best, null);
  assert.deepEqual(probes, [0.8, 0.4, 0.2, 0.1, 0.05]);
});

test('advanceQualitySearch stops after the round budget on a stubborn encoder', () => {
  // Pathological: every quality sits just over the budget by a hair, so the
  // bracket never collapses from below. The round cap has to end it.
  let state: QualitySearch = startQualitySearch();
  let rounds = 0;
  while (!state.done) {
    state = advanceQualitySearch(state, 100_001, 100_000);
    rounds += 1;
    assert.ok(rounds <= QUALITY_SEARCH_ROUNDS + 1, 'must respect the round cap');
  }
  assert.equal(state.best, null);
});

test('advanceQualitySearch is a no-op once done, and validates its inputs', () => {
  const finished = advanceQualitySearch(
    { quality: 0.5, lo: 0.5, hi: 0.51, best: { quality: 0.5, bytes: 10 }, rounds: 3, done: true },
    999,
    1000
  );
  assert.equal(finished.rounds, 3);
  assert.deepEqual(finished.best, { quality: 0.5, bytes: 10 });

  const fresh = startQualitySearch();
  assert.throws(() => advanceQualitySearch(fresh, -1, 1000), RangeError);
  assert.throws(() => advanceQualitySearch(fresh, 10, 0), RangeError);
  assert.throws(() => advanceQualitySearch(fresh, 10, Number.NaN), RangeError);
});

test('a lossless target ignores quality entirely', () => {
  const png: ImageFormat = 'image/png';
  assert.equal(isLossy(png), false);
  // Which is why the UI must not offer a byte budget for PNG: the search
  // would probe qualities the encoder throws away.
  assert.equal(FORMAT_EXT[png], 'png');
});
