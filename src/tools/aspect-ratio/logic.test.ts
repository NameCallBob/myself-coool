import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMON_RATIOS,
  MAX_DIM,
  MAX_TERM_BOUND,
  PRESETS,
  PRESET_VERSION,
  analyse,
  fitBox,
  formatRatio,
  gcd,
  heightFor,
  namedRatio,
  nearestRatio,
  parseRatio,
  reduceRatio,
  snap,
  widthFor,
} from './logic.ts';

/** Brute force best rational with bounded denominator, to check the
 *  continued fraction against something with no cleverness in it. */
function bruteForce(value: number, maxTerm: number) {
  let best = { w: 1, h: 1, error: Infinity };
  for (let h = 1; h <= maxTerm; h += 1) {
    const w = Math.max(1, Math.round(value * h));
    const error = Math.abs(w / h - value);
    if (error < best.error - 1e-15) best = { w, h, error };
  }
  return best;
}

test('gcd follows Euclid, including the zero cases', () => {
  assert.equal(gcd(1920, 1080), 120);
  assert.equal(gcd(1080, 1920), 120);
  assert.equal(gcd(17, 5), 1);
  assert.equal(gcd(12, 0), 12);
  assert.equal(gcd(0, 12), 12);
  assert.equal(gcd(0, 0), 0);
  assert.equal(gcd(270, 192), 6);
  assert.throws(() => gcd(-4, 2), RangeError);
  assert.throws(() => gcd(4.5, 2), RangeError);
});

test('reduceRatio gives the exact ratio, however ugly', () => {
  assert.deepEqual(reduceRatio(1920, 1080), { w: 16, h: 9 });
  assert.deepEqual(reduceRatio(3840, 2160), { w: 16, h: 9 });
  assert.deepEqual(reduceRatio(1080, 1920), { w: 9, h: 16 });
  // The point of keeping exact and nearest apart: this really is 683:384.
  assert.deepEqual(reduceRatio(1366, 768), { w: 683, h: 384 });
  assert.deepEqual(reduceRatio(3440, 1440), { w: 43, h: 18 });
  assert.deepEqual(reduceRatio(2560, 1080), { w: 64, h: 27 });
  assert.deepEqual(reduceRatio(1080, 1080), { w: 1, h: 1 });
  assert.deepEqual(reduceRatio(1080, 1350), { w: 4, h: 5 });
  assert.deepEqual(reduceRatio(1, 1), { w: 1, h: 1 });
  assert.throws(() => reduceRatio(0, 9), RangeError);
  assert.throws(() => reduceRatio(16, -9), RangeError);
  assert.throws(() => reduceRatio(16.5, 9), RangeError);
  assert.throws(() => reduceRatio(MAX_DIM + 1, 9), RangeError);
});

test('nearestRatio hits the textbook approximations', () => {
  // 22/7 is the classic bounded-denominator approximation of pi.
  const pi = nearestRatio(Math.PI, 7);
  assert.deepEqual([pi.w, pi.h], [22, 7]);
  assert.equal(nearestRatio(Math.PI, 200).w, 355);
  assert.equal(nearestRatio(Math.PI, 200).h, 113);
  // The semiconvergent case: convergent 4/3 is out of bounds at maxTerm 2.
  assert.deepEqual([nearestRatio(1.3, 2).w, nearestRatio(1.3, 2).h], [3, 2]);
  // 1366x768 is what everyone calls 16:9.
  const laptop = nearestRatio(1366 / 768, 64);
  assert.deepEqual([laptop.w, laptop.h], [16, 9]);
  assert.ok(laptop.error < 0.0005 && laptop.error > 0.0004, `error ${laptop.error}`);
  assert.equal(laptop.exact, false);
});

test('nearestRatio is exact when the value is a small rational', () => {
  for (const [w, h] of [
    [16, 9],
    [4, 3],
    [21, 9],
    [1, 1],
    [43, 18],
  ]) {
    const got = nearestRatio(w / h, 64);
    const want = reduceRatio(w, h);
    assert.equal(got.exact, true, `${w}:${h} should land exactly`);
    assert.equal(got.error, 0);
    assert.deepEqual([got.w, got.h], [want.w, want.h], `${w}:${h} reduced wrong`);
  }
});

test('nearestRatio matches brute force across a sweep', () => {
  // Landscape only: brute force bounds the denominator, and below 1 the tool
  // flips the value so the bound lands on the numerator instead. Portrait is
  // checked against its own flipped result in the next test.
  for (const maxTerm of [2, 5, 9, 16, 64]) {
    for (let k = 0; k <= 60; k += 1) {
      const value = 1 + k * 0.05;
      const got = nearestRatio(value, maxTerm);
      const want = bruteForce(value, maxTerm);
      const gotError = Math.abs(got.w / got.h - value);
      assert.ok(got.h <= maxTerm, `bound ${maxTerm} broken by ${got.w}:${got.h}`);
      assert.ok(
        gotError <= want.error + 1e-12,
        `value ${value} bound ${maxTerm}: got ${got.w}:${got.h} (${gotError}), brute ${want.w}:${want.h} (${want.error})`
      );
    }
  }
});

test('nearestRatio keeps portrait values the right way up', () => {
  const portrait = nearestRatio(1080 / 1920, 64);
  assert.deepEqual([portrait.w, portrait.h], [9, 16]);
  assert.equal(portrait.exact, true);
  const third = nearestRatio(1 / 3, 64);
  assert.deepEqual([third.w, third.h], [1, 3]);
  const tall = nearestRatio(1080 / 2400, 64);
  assert.ok(tall.w < tall.h);
  assert.ok(Math.abs(tall.w / tall.h - 1080 / 2400) / (1080 / 2400) < 1e-9);
});

test('nearestRatio rejects nonsense and absurd bounds', () => {
  assert.throws(() => nearestRatio(0), RangeError);
  assert.throws(() => nearestRatio(-2), RangeError);
  assert.throws(() => nearestRatio(Number.NaN), RangeError);
  assert.throws(() => nearestRatio(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => nearestRatio(1.5, 0), RangeError);
  assert.throws(() => nearestRatio(1.5, 2.5), RangeError);
  assert.throws(() => nearestRatio(1.5, MAX_TERM_BOUND + 1), RangeError);
});

test('nearestRatio survives a value too large to have a small ratio', () => {
  const huge = nearestRatio(9_999_999, 64);
  assert.equal(huge.h, 1);
  assert.equal(huge.w, 9_999_999);
});

test('parseRatio reads the notations people type', () => {
  assert.deepEqual(parseRatio('16:9'), { w: 16, h: 9 });
  assert.deepEqual(parseRatio('16/9'), { w: 16, h: 9 });
  assert.deepEqual(parseRatio(' 1920 x 1080 '), { w: 1920, h: 1080 });
  assert.deepEqual(parseRatio('1920X1080'), { w: 1920, h: 1080 });
  assert.deepEqual(parseRatio('1920×1080'), { w: 1920, h: 1080 });
  assert.deepEqual(parseRatio('2.39:1'), { w: 2.39, h: 1 });
  assert.deepEqual(parseRatio('1.85'), { w: 1.85, h: 1 });
  assert.deepEqual(parseRatio('.5'), { w: 0.5, h: 1 });
  assert.deepEqual(parseRatio('16,9'), { w: 16, h: 9 });
});

test('parseRatio returns null instead of guessing', () => {
  for (const bad of ['', '   ', '16:', ':9', '16::9', 'abc', '16:0', '0:9', '-16:9', '1e3:9', '16:9:3', '½']) {
    assert.equal(parseRatio(bad), null, `${bad} should not parse`);
  }
  assert.equal(parseRatio(`${MAX_DIM + 1}:9`), null);
});

test('formatRatio prints integers plainly and decimals short', () => {
  assert.equal(formatRatio({ w: 16, h: 9 }), '16:9');
  assert.equal(formatRatio({ w: 2.39, h: 1 }), '2.39:1');
  assert.equal(formatRatio({ w: 1 / 3, h: 1 }), '0.3333:1');
  assert.equal(formatRatio({ w: 683, h: 384 }), '683:384');
});

test('heightFor and widthFor are exact inverses', () => {
  const r = { w: 16, h: 9 };
  assert.equal(heightFor(r, 1920), 1080);
  assert.equal(widthFor(r, 1080), 1920);
  assert.equal(heightFor(r, widthFor(r, 720)), 720);
  assert.equal(heightFor({ w: 1.85, h: 1 }, 1920), 1920 / 1.85);
  assert.equal(widthFor({ w: 9, h: 16 }, 1920), 1080);
  assert.throws(() => heightFor(r, 0), RangeError);
  assert.throws(() => widthFor({ w: 16, h: 0 }, 100), RangeError);
});

test('snap rounds to a multiple and never to zero', () => {
  assert.equal(snap(1038.9, 1), 1039);
  assert.equal(snap(1039, 2), 1040);
  assert.equal(snap(1080, 16), 1088);
  assert.equal(snap(1080, 8), 1080);
  assert.equal(snap(0.4, 1), 1);
  assert.equal(snap(3, 16), 16);
  assert.equal(snap(1080.5, 1), 1081);
  assert.throws(() => snap(0, 2), RangeError);
  assert.throws(() => snap(100, 0), RangeError);
  assert.throws(() => snap(100, 1.5), RangeError);
});

test('fitBox contains without overflowing and covers without gaps', () => {
  assert.deepEqual(fitBox({ w: 16, h: 9 }, { w: 1000, h: 1000 }, 'contain'), {
    w: 1000,
    h: 562,
    scale: 62.5,
  });
  const cover = fitBox({ w: 16, h: 9 }, { w: 1000, h: 1000 }, 'cover');
  assert.equal(cover.h, 1000);
  assert.equal(cover.w, 1778);
  // Same ratio as the box: both modes land on the box exactly.
  assert.deepEqual(fitBox({ w: 16, h: 9 }, { w: 1920, h: 1080 }, 'contain'), {
    w: 1920,
    h: 1080,
    scale: 120,
  });
  assert.deepEqual(fitBox({ w: 16, h: 9 }, { w: 1920, h: 1080 }, 'cover'), {
    w: 1920,
    h: 1080,
    scale: 120,
  });
  const tall = fitBox({ w: 9, h: 16 }, { w: 1000, h: 1000 }, 'contain');
  assert.deepEqual([tall.w, tall.h], [562, 1000]);
  const tiny = fitBox({ w: 16, h: 9 }, { w: 1, h: 1 }, 'contain');
  assert.deepEqual([tiny.w, tiny.h], [1, 1]);
  assert.throws(() => fitBox({ w: 16, h: 9 }, { w: 0, h: 10 }, 'contain'), RangeError);
});

test('namedRatio names only what is genuinely close', () => {
  assert.equal(namedRatio(16 / 9), '16:9');
  assert.equal(namedRatio(1366 / 768), '16:9');
  assert.equal(namedRatio(1920 / 1200), '16:10');
  assert.equal(namedRatio(1), '1:1');
  assert.equal(namedRatio(1080 / 1920), '9:16');
  assert.equal(namedRatio(1080 / 1350), '4:5');
  assert.equal(namedRatio(2.35), null, '2.35:1 is not 2.39:1');
  assert.equal(namedRatio(1.5), '3:2');
  assert.equal(namedRatio(1.62), null);
  assert.equal(namedRatio(0), null);
  assert.equal(namedRatio(Number.NaN), null);
  // 16:10 and 16:9 must never trade places at the default tolerance.
  assert.equal(namedRatio(1.6), '16:10');
  assert.equal(namedRatio(1.7778), '16:9');
});

test('analyse reports exact and nearest separately', () => {
  const fhd = analyse(1920, 1080);
  assert.deepEqual(fhd.exact, { w: 16, h: 9 });
  assert.deepEqual([fhd.nearest.w, fhd.nearest.h], [16, 9]);
  assert.equal(fhd.name, '16:9');
  assert.equal(fhd.orientation, 'landscape');
  assert.equal(fhd.pixels, 2_073_600);

  const laptop = analyse(1366, 768);
  assert.deepEqual(laptop.exact, { w: 683, h: 384 });
  assert.deepEqual([laptop.nearest.w, laptop.nearest.h], [16, 9]);
  assert.ok(laptop.nearest.error > 0);

  const square = analyse(1080, 1080);
  assert.equal(square.orientation, 'square');
  const portrait = analyse(1080, 1920);
  assert.equal(portrait.orientation, 'portrait');

  // Fractional input has no exact integer ratio, and says so.
  const film = analyse(1920, 1920 / 2.39);
  assert.equal(film.exact, null);
  assert.equal(film.name, '2.39:1');

  assert.equal(analyse(1920, 1080, 4).nearest.h <= 4, true);
  assert.throws(() => analyse(0, 100), RangeError);
  assert.throws(() => analyse(100, MAX_DIM * 2), RangeError);
});

test('the common ratio table is self-consistent', () => {
  assert.ok(COMMON_RATIOS.length > 10);
  const names = new Set<string>();
  for (const row of COMMON_RATIOS) {
    assert.ok(row.w > 0 && row.h > 0, `${row.name} has a non-positive term`);
    assert.equal(names.has(row.name), false, `duplicate name ${row.name}`);
    names.add(row.name);
    // Every listed ratio must be findable by its own value.
    assert.equal(typeof namedRatio(row.w / row.h), 'string', `${row.name} names nothing`);
  }
});

test('the preset table is versioned and every row is a usable size', () => {
  assert.match(PRESET_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(PRESETS.length >= 20);
  const seen = new Set<string>();
  for (const preset of PRESETS) {
    const key = `${preset.group}/${preset.label}`;
    assert.equal(seen.has(key), false, `duplicate preset ${key}`);
    seen.add(key);
    assert.ok(Number.isInteger(preset.w) && Number.isInteger(preset.h), `${key} is not whole pixels`);
    assert.ok(preset.w > 0 && preset.h > 0 && preset.w <= MAX_DIM && preset.h <= MAX_DIM);
    // Every row must survive the same analysis the UI runs on it.
    assert.ok(analyse(preset.w, preset.h).pixels > 0);
  }
  // Spot-check the rows that are arithmetic rather than a copied figure:
  // ISO 216 A-series at 300 dpi, rounded to whole pixels.
  const a4 = PRESETS.find((p) => p.label === 'A4 @300dpi');
  assert.deepEqual([a4?.w, a4?.h], [Math.round((210 / 25.4) * 300), Math.round((297 / 25.4) * 300)]);
  const a3 = PRESETS.find((p) => p.label === 'A3 @300dpi');
  assert.deepEqual([a3?.w, a3?.h], [Math.round((297 / 25.4) * 300), Math.round((420 / 25.4) * 300)]);
  // And the display standards that have a known exact ratio.
  const fhd = PRESETS.find((p) => p.label === 'FHD / 1080p');
  assert.deepEqual(reduceRatio(fhd!.w, fhd!.h), { w: 16, h: 9 });
});
