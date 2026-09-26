import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RAMP,
  HARMONY_OFFSETS,
  MAX_STEPS,
  anchorIndex,
  buildHarmony,
  buildRamp,
  clip,
  contrastRatio,
  inGamut,
  maxChromaFor,
  oklabToRgb,
  oklchToRgb,
  parseColor,
  render,
  rgbToOklab,
  rgbToOklch,
  slugify,
  toGamut,
  toHex,
  type HarmonyId,
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

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/* ── Colour plumbing ──────────────────────── */

test('OKLCH agrees with the published values and inverts', () => {
  const red = rgbToOklch(rgb('#ff0000'));
  near(red.l, 0.62796, 1e-4, 'red L');
  near(red.c, 0.25768, 1e-4, 'red C');
  near(red.h, 29.234, 0.02, 'red h');
  near(rgbToOklab({ r: 1, g: 1, b: 1 }).l, 1, 1e-5, 'white L');
  for (const hex of ['#ff0000', '#3366cc', '#808080', '#000000', '#ffffff']) {
    const start = rgb(hex);
    const back = oklchToRgb(rgbToOklch(start));
    near(Math.max(Math.abs(back.r - start.r), Math.abs(back.g - start.g), Math.abs(back.b - start.b)), 0, 1e-6, hex);
    const viaLab = oklabToRgb(rgbToOklab(start));
    near(Math.abs(viaLab.g - start.g), 0, 1e-6, `oklab ${hex}`);
  }
});

test('parsing covers the notations this tool takes and rejects the rest', () => {
  assert.equal(toHex(rgb('#3366cc')), '#3366cc');
  assert.equal(toHex(rgb('3366cc')), '#3366cc');
  assert.equal(toHex(rgb('#36c')), '#3366cc');
  assert.equal(toHex(rgb('rgb(51 102 204)')), '#3366cc');
  assert.equal(toHex(rgb('hsl(220 60% 50%)')), '#3366cc');
  assert.equal(toHex(rgb('white')), '#ffffff');
  assert.equal(toHex(rgb('oklch(0.5 0.1 250)')), toHex(toGamut({ l: 0.5, c: 0.1, h: 250 })));
  for (const bad of ['', '#12', 'rgb(1 2)', 'lab(50 0 0)', 'nope', '#1234567']) {
    assert.equal(parseColor(bad), null, JSON.stringify(bad));
  }
});

test('clip and the WCAG ratio hit their landmarks', () => {
  assert.deepEqual(clip({ r: -1, g: 0.25, b: 2 }), { r: 0, g: 0.25, b: 1 });
  near(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }), 21, 1e-9);
  near(contrastRatio(rgb('#767676'), { r: 1, g: 1, b: 1 }), 4.5422, 0.001);
});

/* ── The gamut boundary ───────────────────── */

test('maxChromaFor finds a boundary that is real on both sides', () => {
  for (const h of [0, 29.23, 90, 142.5, 200, 264, 330]) {
    for (const l of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const c = maxChromaFor(l, h);
      assert.ok(inGamut(oklchToRgb({ l, c, h })), `inside at L=${l} h=${h} C=${c}`);
      assert.ok(!inGamut(oklchToRgb({ l, c: c + 0.01, h })), `outside just past it at L=${l} h=${h}`);
    }
  }
});

test('maxChromaFor never claims more than the primary at that hue holds', () => {
  for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff']) {
    const lch = rgbToOklch(rgb(hex));
    const boundary = maxChromaFor(lch.l, lch.h);
    assert.ok(boundary <= lch.c + 0.001, `${hex}: ${boundary} should not exceed ${lch.c}`);
  }
  // Red and green sit on it; the ray out from grey reaches them without
  // leaving the cube.
  for (const hex of ['#ff0000', '#00ff00']) {
    const lch = rgbToOklch(rgb(hex));
    near(maxChromaFor(lch.l, lch.h), lch.c, 0.001, hex);
  }
});

test('the sRGB gamut is not star-shaped in OKLCH, and bisection is honest about it', () => {
  // At blue's hue and lightness the ray out from grey leaves the cube near
  // C 0.265 and only touches it again exactly at the #0000ff vertex, C 0.313.
  // A bisecting boundary search must return the first crossing — anything else
  // would hand back a chroma whose neighbours below it are not displayable.
  const blue = rgbToOklch(rgb('#0000ff'));
  const boundary = maxChromaFor(blue.l, blue.h);
  assert.ok(boundary < blue.c - 0.02, `expected a first crossing well below ${blue.c}`);
  assert.ok(inGamut(oklchToRgb({ l: blue.l, c: boundary, h: blue.h })));
  assert.ok(!inGamut(oklchToRgb({ l: blue.l, c: 0.29, h: blue.h })), 'the gap is real');
  assert.ok(inGamut(oklchToRgb({ l: blue.l, c: blue.c, h: blue.h })), 'and it closes again');
});

test('chroma runs out at both ends of the lightness range', () => {
  assert.equal(maxChromaFor(0, 30), 0);
  assert.equal(maxChromaFor(1, 30), 0);
  assert.ok(maxChromaFor(0.02, 30) < maxChromaFor(0.5, 30));
  assert.ok(maxChromaFor(0.98, 30) < maxChromaFor(0.5, 30));
  // Nothing in sRGB exceeds roughly 0.37 chroma; the bracket must be safe.
  for (const h of [0, 60, 120, 180, 240, 300]) assert.ok(maxChromaFor(0.6, h) < 0.4);
});

test('toGamut returns something displayable without moving hue much', () => {
  const mapped = toGamut({ l: 0.7, c: 0.4, h: 150 });
  assert.ok(inGamut(mapped));
  near(rgbToOklch(mapped).h, 150, 2);
  assert.deepEqual(toGamut({ l: 1.4, c: 0.3, h: 30 }), { r: 1, g: 1, b: 1 });
  assert.deepEqual(toGamut({ l: -0.4, c: 0.3, h: 30 }), { r: 0, g: 0, b: 0 });
  // An already-displayable colour comes back unchanged.
  const inside = toGamut({ l: 0.5, c: 0.05, h: 200 });
  near(rgbToOklch(inside).c, 0.05, 1e-3);
});

/* ── Ramps ────────────────────────────────── */

test('a default ramp is 11 steps, named the way design systems name them', () => {
  const ramp = buildRamp(rgb('#3366cc'), DEFAULT_RAMP);
  assert.equal(ramp.length, 11);
  assert.deepEqual(
    ramp.map((s) => s.name),
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  );
  for (const swatch of ramp) {
    assert.match(swatch.hex, /^#[0-9a-f]{6}$/);
    assert.ok(inGamut(swatch.rgb), `${swatch.name} must be displayable`);
    assert.equal(toHex(swatch.rgb), swatch.hex);
  }
});

test('lightness decreases monotonically and lands on the requested ends', () => {
  const ramp = buildRamp(rgb('#c0392b'), DEFAULT_RAMP);
  near(ramp[0].oklch.l, DEFAULT_RAMP.lightest, 1e-9, 'lightest end');
  near(ramp[ramp.length - 1].oklch.l, DEFAULT_RAMP.darkest, 1e-9, 'darkest end');
  for (let i = 1; i < ramp.length; i += 1) {
    assert.ok(ramp[i].oklch.l < ramp[i - 1].oklch.l, `step ${i} must be darker than ${i - 1}`);
  }
  // Even spacing is the whole point: every gap the same, to floating point.
  const gaps = ramp.slice(1).map((s, i) => ramp[i].oklch.l - s.oklch.l);
  for (const gap of gaps) near(gap, gaps[0], 1e-12, 'even spacing');
});

test('hue is held across a ramp unless a shift is asked for', () => {
  const base = rgb('#3366cc');
  const baseHue = rgbToOklch(base).h;
  for (const swatch of buildRamp(base, DEFAULT_RAMP)) {
    if (swatch.oklch.c > 0.002) near(hueGap(swatch.oklch.h, baseHue), 0, 1e-9, swatch.name);
  }
  const shifted = buildRamp(base, { ...DEFAULT_RAMP, hueShift: 40 });
  // The shift is the total across the ramp, centred on the middle step, so a
  // ramp keeps the hue you picked in the middle and drifts either side of it.
  near(shifted[shifted.length - 1].oklch.h - shifted[0].oklch.h, 40, 1e-9);
  near(hueGap(shifted[5].oklch.h, baseHue), 0, 1e-9, 'the middle keeps the original hue');
  near(shifted[0].oklch.h, baseHue - 20, 1e-9, 'the light end leads by half');
});

test('chroma falloff does what its two extremes say', () => {
  const base = rgb('#3366cc');
  const baseC = rgbToOklch(base).c;
  const flat = buildRamp(base, { ...DEFAULT_RAMP, chromaFalloff: 0 });
  // With no falloff the only thing reducing chroma is the gamut itself, and
  // the middle of the ramp can hold the original.
  near(flat[5].oklch.c, baseC, 0.001, 'middle keeps base chroma');
  const neutralEnds = buildRamp(base, { ...DEFAULT_RAMP, chromaFalloff: 1 });
  near(neutralEnds[0].oklch.c, 0, 1e-9, 'lightest end is neutral');
  near(neutralEnds[neutralEnds.length - 1].oklch.c, 0, 1e-9, 'darkest end is neutral');
  near(neutralEnds[5].oklch.c, baseC, 0.001, 'the middle is untouched');
  // Chroma is highest in the middle and falls away symmetrically.
  const mid = neutralEnds[5].oklch.c;
  for (const swatch of neutralEnds) assert.ok(swatch.oklch.c <= mid + 1e-12);
  // Symmetric as requested — but only where the gamut did not intervene, which
  // for a blue means the dark side gives some chroma back.
  if (!neutralEnds[3].clamped && !neutralEnds[7].clamped) {
    near(neutralEnds[3].oklch.c, neutralEnds[7].oklch.c, 1e-12, 'symmetric');
  }
  const muted = buildRamp(rgb('#7d6b5d'), { ...DEFAULT_RAMP, chromaFalloff: 1 });
  assert.ok(!muted.some((s) => s.clamped), 'a muted base fits at every step');
  near(muted[2].oklch.c, muted[8].oklch.c, 1e-12, 'symmetric when nothing clips');
});

test('a ramp reports where it had to give up chroma', () => {
  // A fully saturated primary asks for more chroma than the pale end of any
  // ramp can hold, so the light steps must be flagged rather than silently
  // clipped into a different hue.
  const ramp = buildRamp(rgb('#00ff00'), { ...DEFAULT_RAMP, chromaFalloff: 0 });
  assert.ok(ramp.some((s) => s.clamped), 'some step must be clamped');
  for (const swatch of ramp) {
    if (swatch.clamped) near(swatch.oklch.c, maxChromaFor(swatch.oklch.l, swatch.oklch.h), 0.001, swatch.name);
    assert.ok(inGamut(swatch.rgb));
  }
  // A low-chroma base fits everywhere and should flag nothing.
  assert.ok(!buildRamp(rgb('#5e574e'), DEFAULT_RAMP).some((s) => s.clamped));
});

test('a grey base produces a grey ramp, with no invented hue', () => {
  const ramp = buildRamp(rgb('#808080'), DEFAULT_RAMP);
  for (const swatch of ramp) {
    assert.equal(swatch.oklch.c, 0, swatch.name);
    const { r, g, b } = swatch.rgb;
    near(r, g, 1 / 255, swatch.name);
    near(g, b, 1 / 255, swatch.name);
  }
});

test('the step count is clamped, and tiny ramps still work', () => {
  assert.equal(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 2 }).length, 2);
  assert.equal(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 1 }).length, 2);
  assert.equal(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: -5 }).length, 2);
  assert.equal(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 999 }).length, MAX_STEPS);
  const two = buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 2 });
  assert.deepEqual(two.map((s) => s.name), ['1', '2']);
  // Nine and ten steps get the scale names too, offset the way a design
  // system drops 50 or 950 first.
  assert.deepEqual(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 9 })[0].name, '100');
  assert.deepEqual(buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 10 })[0].name, '50');
  assert.deepEqual(
    buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 11, scaleNames: false }).map((s) => s.name),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
  );
});

test('reversed lightness bounds are read as a range, not as an error', () => {
  const swapped = buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, lightest: 0.18, darkest: 0.97 });
  near(swapped[0].oklch.l, 0.97, 1e-9, 'still runs light to dark');
});

test('each step carries the contrast readings a UI ramp is chosen by', () => {
  const ramp = buildRamp(rgb('#3366cc'), DEFAULT_RAMP);
  for (const swatch of ramp) {
    near(swatch.onWhite, contrastRatio(swatch.rgb, { r: 1, g: 1, b: 1 }), 1e-12);
    near(swatch.onBlack, contrastRatio(swatch.rgb, { r: 0, g: 0, b: 0 }), 1e-12);
    // The two readings are constrained: a colour cannot be far from both ends.
    assert.ok(swatch.onWhite * swatch.onBlack <= 21 * 1.06, swatch.name);
  }
  assert.ok(ramp[0].onWhite < ramp[10].onWhite, 'dark steps contrast more on white');
  assert.ok(ramp[0].onBlack > ramp[10].onBlack, 'light steps contrast more on black');
});

test('anchorIndex finds the step nearest the colour the ramp grew from', () => {
  const base = rgb('#3366cc');
  const ramp = buildRamp(base, DEFAULT_RAMP);
  const index = anchorIndex(ramp, base);
  assert.ok(index >= 0 && index < ramp.length);
  const distance = (swatch: { rgb: Rgb }) => {
    const a = rgbToOklab(swatch.rgb);
    const b = rgbToOklab(base);
    return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
  };
  for (const swatch of ramp) assert.ok(distance(ramp[index]) <= distance(swatch) + 1e-12);
  // A step taken out of the ramp is its own nearest neighbour.
  assert.equal(anchorIndex(ramp, ramp[7].rgb), 7);
});

/* ── Harmony ──────────────────────────────── */

test('every harmony set rotates by the angles it claims', () => {
  const base = rgb('#3366cc');
  const baseLch = rgbToOklch(base);
  for (const kind of Object.keys(HARMONY_OFFSETS) as HarmonyId[]) {
    const set = buildHarmony(base, kind);
    assert.equal(set.length, HARMONY_OFFSETS[kind].length, kind);
    set.forEach((swatch, i) => {
      const wanted = ((baseLch.h + HARMONY_OFFSETS[kind][i]) % 360 + 360) % 360;
      near(hueGap(swatch.oklch.h, wanted), 0, 1e-9, `${kind} member ${i}`);
      assert.ok(inGamut(swatch.rgb), `${kind} member ${i} displayable`);
      near(swatch.oklch.l, baseLch.l, 1e-12, `${kind} holds lightness`);
    });
  }
});

test('the set always contains the colour you started from', () => {
  const base = rgb('#c0392b');
  for (const kind of Object.keys(HARMONY_OFFSETS) as HarmonyId[]) {
    const set = buildHarmony(base, kind);
    const zero = set.find((s) => s.name === '+0°');
    assert.ok(zero, `${kind} should include the original`);
    // Clamping plus the clip to the cube face moves the measured hue by a
    // few millionths of a degree; the stored angle is exact.
    near(rgbToOklch(zero.rgb).h, rgbToOklch(base).h, 1e-3, kind);
    near(zero.oklch.h, rgbToOklch(base).h, 1e-12, kind);
  }
});

test('a harmony rotation that overruns the gamut reports it', () => {
  // Rotating a saturated green 180° asks for a magenta chroma sRGB does not
  // have at that lightness. The honest result is a flagged swatch.
  const set = buildHarmony(rgb('#00ff00'), 'complementary');
  assert.equal(set.length, 2);
  assert.ok(set[1].clamped, 'the complement of a pure green has to be clamped');
  assert.ok(inGamut(set[1].rgb));
});

test('a grey has no harmony, and says so by staying grey', () => {
  for (const swatch of buildHarmony(rgb('#808080'), 'triadic')) {
    assert.equal(swatch.oklch.c, 0);
    assert.equal(swatch.hex, buildHarmony(rgb('#808080'), 'triadic')[0].hex);
  }
});

/* ── Output ───────────────────────────────── */

test('slugify produces usable custom-property names from anything', () => {
  assert.equal(slugify('Brand Blue'), 'brand-blue');
  assert.equal(slugify('  --Accent__2 '), 'accent-2');
  assert.equal(slugify('品牌藍'), 'colour');
  assert.equal(slugify(''), 'colour');
  assert.equal(slugify('50'), '50');
});

test('every output format is syntactically what it claims to be', () => {
  const ramp = buildRamp(rgb('#3366cc'), { ...DEFAULT_RAMP, steps: 3, scaleNames: false });
  const css = render(ramp, 'Brand Blue', 'css');
  assert.equal(css.split('\n').length, 5);
  assert.match(css, /^:root \{\n {2}--brand-blue-1: #[0-9a-f]{6};/);
  assert.ok(css.endsWith('}'));

  const oklch = render(ramp, 'brand', 'oklch');
  assert.match(oklch, /--brand-2: oklch\(0\.\d+ 0\.\d+ \d+\.\d+\);/);

  const hex = render(ramp, 'brand', 'hex');
  assert.deepEqual(hex.split('\n'), ramp.map((s) => s.hex));

  const json = JSON.parse(render(ramp, 'brand', 'json')) as Record<string, string>;
  assert.deepEqual(Object.keys(json), ['1', '2', '3']);
  assert.equal(json['1'], ramp[0].hex);
});

test('the oklch output re-parses to the colour it was printed from', () => {
  const ramp = buildRamp(rgb('#c0392b'), DEFAULT_RAMP);
  for (const line of render(ramp, 'x', 'oklch').split('\n').slice(1, -1)) {
    const value = line.slice(line.indexOf(':') + 1).replace(';', '').trim();
    const parsed = parseColor(value);
    assert.ok(parsed, value);
    const wanted = ramp.find((s) => s.hex === toHex(parsed))?.hex;
    assert.ok(wanted, `${value} should round-trip to one of the swatches, got ${toHex(parsed)}`);
  }
});
