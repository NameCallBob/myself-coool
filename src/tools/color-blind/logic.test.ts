import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLISION_THRESHOLD,
  DEFICIENCIES,
  MAX_PIXELS,
  PREVALENCE,
  collisions,
  deltaEOK,
  extractPalette,
  linearToSrgb,
  luminance,
  parseColor,
  simulate,
  simulateImageData,
  srgbToLinear,
  toHex,
  type Deficiency,
  type Rgb,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance: number, what = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what} expected ${expected} ± ${tolerance}, got ${actual}`
  );

const rgb = (text: string): Rgb => {
  const parsed = parseColor(text);
  assert.ok(parsed, `${text} should parse`);
  return parsed;
};

/* ── Transfer ─────────────────────────────── */

test('the transfer functions invert and clamp', () => {
  for (const v of [0, 0.01, 0.2, 0.5, 1]) near(linearToSrgb(srgbToLinear(v)), v, 1e-7, `${v}`);
  near(srgbToLinear(0.5), 0.21404, 1e-5);
  assert.equal(srgbToLinear(-1), 0, 'out of range clamps rather than going imaginary');
  near(linearToSrgb(2), 1, 1e-9);
});

/* ── The projections, validated by their own properties ── */

test('greys map to themselves exactly, for every deficiency', () => {
  // Every matrix row sums to 1, so the neutral axis is fixed. If a constant
  // here were mistyped, this is the test that would catch it.
  for (const type of DEFICIENCIES) {
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const out = simulate({ r: v, g: v, b: v }, type);
      // 1e-4, because the published matrix rows sum to 1 only to five decimals.
      near(out.r, v, 1e-4, `${type} grey ${v} r`);
      near(out.g, v, 1e-4, `${type} grey ${v} g`);
      near(out.b, v, 1e-4, `${type} grey ${v} b`);
    }
  }
});

test('simulating twice is the same as simulating once — it is a projection', () => {
  // A dichromat's colour space is a surface; a colour already on that surface
  // must not move again. This is the strongest structural check available.
  const samples = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#3366cc', '#c0392b', '#7d6b5d'];
  for (const type of DEFICIENCIES) {
    for (const hex of samples) {
      const once = simulate(rgb(hex), type);
      const twice = simulate(once, type);
      // Measured perceptually rather than per channel, and looser for
      // tritanopia: its projection of a saturated primary lands outside sRGB,
      // the clamp moves it back in, and the second pass then starts from a
      // colour that is not quite on the projected surface. A JND is 0.02.
      const slack = type === 'tritan' ? 0.03 : 0.005;
      assert.ok(
        deltaEOK(once, twice) < slack,
        `${type} ${hex}: second pass moved it by ${deltaEOK(once, twice)}`
      );
    }
  }
});

test('protanopia and deuteranopia collapse red and green onto one yellow axis', () => {
  // With no L or no M cone, the red–green axis is gone: the simulated red and
  // green channels come out equal, which is what makes red and green confusable.
  for (const type of ['protan', 'deutan'] as Deficiency[]) {
    for (const hex of ['#ff0000', '#00ff00', '#ff8800', '#3366cc']) {
      const out = simulate(rgb(hex), type);
      near(out.r, out.g, 1e-6, `${type} ${hex} collapses r and g`);
    }
  }
});

test('the classic confusions come out the way they are described', () => {
  // Protanopia: red is very dark, green is bright yellow.
  const protanRed = simulate(rgb('#ff0000'), 'protan');
  const protanGreen = simulate(rgb('#00ff00'), 'protan');
  assert.ok(luminance(protanRed) < 0.12, `protan red should be dark, got ${luminance(protanRed)}`);
  assert.ok(luminance(protanGreen) > 0.6, `protan green should be bright, got ${luminance(protanGreen)}`);
  assert.ok(
    luminance(protanGreen) / luminance(protanRed) > 5,
    'and the two must be far apart in lightness, which is why protanopes read red as dark'
  );

  // Deuteranopia: both become yellows of similar lightness — the pair most
  // often used for pass/fail, and the reason that choice fails.
  const deutanRed = simulate(rgb('#ff0000'), 'deutan');
  const deutanGreen = simulate(rgb('#00ff00'), 'deutan');
  assert.ok(deltaEOK(deutanRed, deutanGreen) < deltaEOK(rgb('#ff0000'), rgb('#00ff00')) / 2);

  // Tritanopia: red stays nearly itself, blue swings towards cyan.
  const tritanRed = simulate(rgb('#ff0000'), 'tritan');
  assert.ok(deltaEOK(tritanRed, rgb('#ff0000')) < 0.1, 'tritan red barely moves');
  const tritanBlue = simulate(rgb('#0000ff'), 'tritan');
  assert.ok(tritanBlue.g > tritanBlue.r, 'tritan blue picks up green');
});

test('the two tritan half-planes join without a seam', () => {
  // The dividing plane meets the RGB cube only along the neutral axis, and both
  // matrices fix it, so crossing the boundary cannot produce a discontinuity.
  for (const v of [0.2, 0.5, 0.8]) {
    const below = simulate({ r: v - 1e-6, g: v, b: v }, 'tritan');
    const above = simulate({ r: v + 1e-6, g: v, b: v }, 'tritan');
    near(below.r, above.r, 1e-3, `r at ${v}`);
    near(below.g, above.g, 1e-3, `g at ${v}`);
    near(below.b, above.b, 1e-3, `b at ${v}`);
  }
});

test('severity 0 is the identity and severity 1 is the full simulation', () => {
  for (const type of DEFICIENCIES) {
    for (const hex of ['#ff0000', '#3366cc', '#ffcc00']) {
      const original = rgb(hex);
      const none = simulate(original, type, 0);
      near(deltaEOK(none, original), 0, 1e-6, `${type} ${hex} at severity 0`);
      const full = simulate(original, type, 1);
      const half = simulate(original, type, 0.5);
      // A partial severity lies between, and monotonically so.
      assert.ok(deltaEOK(half, original) < deltaEOK(full, original) + 1e-9, `${type} ${hex}`);
      assert.ok(deltaEOK(half, full) < deltaEOK(none, full) + 1e-9, `${type} ${hex}`);
    }
  }
});

test('severity is clamped rather than extrapolated', () => {
  const original = rgb('#ff0000');
  assert.deepEqual(simulate(original, 'protan', -1), simulate(original, 'protan', 0));
  assert.deepEqual(simulate(original, 'protan', 5), simulate(original, 'protan', 1));
});

test('the output is always a displayable colour', () => {
  for (const type of DEFICIENCIES) {
    for (let r = 0; r <= 1; r += 0.25) {
      for (let g = 0; g <= 1; g += 0.25) {
        for (let b = 0; b <= 1; b += 0.25) {
          const out = simulate({ r, g, b }, type);
          for (const channel of [out.r, out.g, out.b]) {
            assert.ok(channel >= 0 && channel <= 1, `${type} ${r},${g},${b} → ${channel}`);
          }
        }
      }
    }
  }
});

/* ── Parsing ──────────────────────────────── */

test('palette colours parse from the forms people paste', () => {
  assert.equal(toHex(rgb('#3366cc')), '#3366cc');
  assert.equal(toHex(rgb('3366cc')), '#3366cc');
  assert.equal(toHex(rgb('#36c')), '#3366cc');
  assert.equal(toHex(rgb('rgb(51 102 204)')), '#3366cc');
  assert.equal(toHex(rgb('rgba(51, 102, 204, 0.5)')), '#3366cc', 'alpha is dropped, not applied');
  assert.equal(toHex(rgb('white')), '#ffffff');
  for (const bad of ['', '#12', 'oklch(0.5 0.1 200)', 'nope', 'rgb(1 2)']) {
    assert.equal(parseColor(bad), null, JSON.stringify(bad));
  }
});

test('a palette is pulled out of whatever was pasted', () => {
  const css = `:root {
    --brand: #3366cc;   /* blue */
    --warn: #FFCC00;
    --ok: rgb(42 125 127);
    --same: #36c;
  }`;
  const palette = extractPalette(css);
  assert.deepEqual(palette.map((p) => p.hex), ['#3366cc', '#ffcc00', '#2a7d7f']);
  assert.equal(palette.length, 3, 'duplicates collapse, whatever notation they used');
  assert.deepEqual(extractPalette('no colours here'), []);
  assert.deepEqual(extractPalette('#ff0000 #00ff00 #0000ff', 2).map((p) => p.hex), ['#ff0000', '#00ff00']);
});

test('a bare word that looks like hex is not mistaken for one', () => {
  // `beaded` is six letters in the hex alphabet; it is also a word. The pattern
  // requires a leading # precisely so prose does not become a palette.
  assert.deepEqual(extractPalette('the beaded facade'), []);
  assert.deepEqual(extractPalette('#beaded').map((p) => p.hex), ['#beaded']);
});

/* ── Collisions ───────────────────────────── */

test('the red/green pair is flagged for deuteranopia and not for tritanopia', () => {
  const palette = [rgb('#d62728'), rgb('#2ca02c')];
  const deutan = collisions(palette, 'deutan');
  assert.equal(deutan.length, 1, 'a red and a green of similar lightness collide');
  assert.equal(deutan[0].hexA, '#d62728');
  assert.equal(deutan[0].hexB, '#2ca02c');
  assert.ok(deutan[0].after < deutan[0].before, 'the pair got closer');
  assert.ok(deutan[0].after <= COLLISION_THRESHOLD);
  assert.deepEqual(collisions(palette, 'tritan'), [], 'tritanopia keeps red and green apart');
});

test('a palette separated by lightness survives every deficiency', () => {
  // The standard fix: vary lightness, not only hue.
  const palette = [rgb('#f7f4ec'), rgb('#a8a296'), rgb('#5e574e'), rgb('#1a1714')];
  for (const type of DEFICIENCIES) {
    assert.deepEqual(collisions(palette, type), [], type);
  }
});

test('collisions report the luminance ratio, because that is the cheap fix', () => {
  const palette = [rgb('#d62728'), rgb('#2ca02c')];
  const [pair] = collisions(palette, 'deutan');
  const expected =
    (Math.max(luminance(palette[0]), luminance(palette[1])) + 0.05) /
    (Math.min(luminance(palette[0]), luminance(palette[1])) + 0.05);
  near(pair.luminanceRatio, expected, 1e-12);
  assert.ok(pair.luminanceRatio < 1.5, 'these two are also close in lightness, which is the problem');
});

test('every pair is considered once, and the indices point back at the palette', () => {
  const palette = [rgb('#000000'), rgb('#000001'), rgb('#000002'), rgb('#ffffff')];
  const found = collisions(palette, 'protan');
  // The three near-blacks collide with each other: three pairs, not six.
  assert.equal(found.length, 3);
  for (const pair of found) {
    assert.ok(pair.a < pair.b, 'each pair appears in one order only');
    assert.equal(pair.hexA, toHex(palette[pair.a]));
    assert.equal(pair.hexB, toHex(palette[pair.b]));
  }
  assert.deepEqual(collisions([], 'protan'), []);
  assert.deepEqual(collisions([rgb('#ff0000')], 'protan'), []);
});

test('collisions come back with the most surprising ones first', () => {
  // Two collisions with very different origins: a red and a green that used to
  // be far apart, and two mid-greys that never were.
  const palette = [rgb('#d62728'), rgb('#2ca02c'), rgb('#808080'), rgb('#818181')];
  const found = collisions(palette, 'deutan');
  assert.ok(found.length >= 2);
  for (let i = 1; i < found.length; i += 1) {
    assert.ok(found[i - 1].before >= found[i].before, 'sorted by how far apart they used to be');
  }
  assert.equal(found[0].hexA, '#d62728', 'the pair that lost the most is first');
});

test('a lower severity flags fewer collisions', () => {
  const palette = [rgb('#d62728'), rgb('#2ca02c')];
  assert.equal(collisions(palette, 'deutan', 1).length, 1);
  assert.equal(collisions(palette, 'deutan', 0).length, 0, 'no deficiency, no collision');
});

/* ── Images ───────────────────────────────── */

test('image data is transformed to the same values as the per-colour path', () => {
  const colours = [rgb('#ff0000'), rgb('#00ff00'), rgb('#0000ff'), rgb('#808080'), rgb('#3366cc')];
  for (const type of DEFICIENCIES) {
    const data = new Uint8ClampedArray(colours.length * 4);
    colours.forEach((colour, i) => {
      data[i * 4] = Math.round(colour.r * 255);
      data[i * 4 + 1] = Math.round(colour.g * 255);
      data[i * 4 + 2] = Math.round(colour.b * 255);
      data[i * 4 + 3] = 128;
    });
    simulateImageData(data, type);
    colours.forEach((colour, i) => {
      const expected = simulate(colour, type);
      // Both round to 8 bits, so one count of rounding slack is the tolerance.
      near(data[i * 4], Math.round(expected.r * 255), 1, `${type} pixel ${i} r`);
      near(data[i * 4 + 1], Math.round(expected.g * 255), 1, `${type} pixel ${i} g`);
      near(data[i * 4 + 2], Math.round(expected.b * 255), 1, `${type} pixel ${i} b`);
      assert.equal(data[i * 4 + 3], 128, 'alpha is not a colour and must not change');
    });
  }
});

test('image data at severity 0 comes back byte-identical', () => {
  const data = new Uint8ClampedArray([12, 34, 56, 78, 255, 0, 128, 90]);
  const copy = new Uint8ClampedArray(data);
  simulateImageData(data, 'deutan', 0);
  assert.deepEqual(Array.from(data), Array.from(copy));
});

test('an empty buffer is handled, and the pixel ceiling is a real number', () => {
  const empty = new Uint8ClampedArray(0);
  assert.equal(simulateImageData(empty, 'protan').length, 0);
  assert.ok(MAX_PIXELS > 1_000_000 && MAX_PIXELS < 100_000_000);
});

test('every deficiency has a prevalence note, so the UI cannot show a blank', () => {
  for (const type of DEFICIENCIES) {
    assert.ok(PREVALENCE[type].zh.length > 0, type);
    assert.ok(PREVALENCE[type].en.length > 0, type);
  }
  assert.equal(DEFICIENCIES.length, 3);
});
