import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STOPS,
  applyMidpoint,
  clip,
  defaultGradient,
  inGamut,
  measureChroma,
  mix,
  normalize,
  oklabToRgb,
  oklchToRgb,
  parseColor,
  resample,
  resolveHue,
  rgbToOklab,
  rgbToOklch,
  sample,
  toCss,
  toCssBlock,
  toCssFallback,
  toGamut,
  toHex,
  type Gradient,
  type HueArc,
  type Rgb,
  type Space,
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

const two = (a: string, b: string, patch: Partial<Gradient> = {}): Gradient => ({
  ...defaultGradient(),
  ...patch,
  stops: [
    { color: rgb(a), position: 0, midpoint: 0.5 },
    { color: rgb(b), position: 100, midpoint: 0.5 },
  ],
});

/* ── Colour plumbing ──────────────────────── */

test('OKLCH matches the published primaries and inverts', () => {
  const red = rgbToOklch(rgb('#ff0000'));
  near(red.l, 0.62796, 1e-4, 'red L');
  near(red.c, 0.25768, 1e-4, 'red C');
  near(red.h, 29.234, 0.02, 'red h');
  for (const hex of ['#ff0000', '#3366cc', '#808080', '#ffffff', '#000000']) {
    const start = rgb(hex);
    const back = oklchToRgb(rgbToOklch(start));
    near(Math.abs(back.r - start.r) + Math.abs(back.g - start.g) + Math.abs(back.b - start.b), 0, 1e-6, hex);
    const lab = oklabToRgb(rgbToOklab(start));
    near(Math.abs(lab.b - start.b), 0, 1e-6, `oklab ${hex}`);
  }
});

test('parsing and formatting round-trip, and nonsense is rejected', () => {
  for (const hex of ['#000000', '#ffffff', '#3366cc']) assert.equal(toHex(rgb(hex)), hex);
  assert.equal(toHex(rgb('#36c')), '#3366cc');
  assert.equal(toHex(rgb('rgb(51 102 204)')), '#3366cc');
  assert.equal(toHex(rgb('hsl(220 60% 50%)')), '#3366cc');
  assert.equal(toHex(rgb('white')), '#ffffff');
  assert.ok(inGamut(rgb('oklch(0.7 0.4 150)')), 'an out-of-gamut request is mapped in');
  for (const bad of ['', '#12', 'rgb(1 2)', 'nope', 'lab(50 0 0)']) {
    assert.equal(parseColor(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(clip({ r: 2, g: -1, b: 0.5 }), { r: 1, g: 0, b: 0.5 });
  assert.ok(inGamut(toGamut({ l: 0.7, c: 0.4, h: 150 })));
});

/* ── Hue arcs, against the spec's own definition ── */

test('the four hue interpolation methods pick the arcs CSS defines', () => {
  // shorter: never travel more than 180°.
  assert.equal(resolveHue(20, 340, 'shorter'), -20);
  assert.equal(resolveHue(340, 20, 'shorter'), 380);
  assert.equal(resolveHue(0, 90, 'shorter'), 90);
  // longer: always take the other way round.
  assert.equal(resolveHue(0, 90, 'longer'), -270);
  assert.equal(resolveHue(20, 340, 'longer'), 340);
  // increasing / decreasing: fix the direction regardless of distance.
  assert.equal(resolveHue(340, 20, 'increasing'), 380);
  assert.equal(resolveHue(20, 340, 'increasing'), 340);
  assert.equal(resolveHue(20, 340, 'decreasing'), -20);
  assert.equal(resolveHue(340, 20, 'decreasing'), 20);
  // Angles outside 0..360 are normalised first.
  assert.equal(resolveHue(380, 450, 'shorter'), 90);
});

test('shorter and longer arcs never agree except where they cannot differ', () => {
  for (const arc of ['shorter', 'longer', 'increasing', 'decreasing'] as HueArc[]) {
    const travelled = Math.abs(resolveHue(30, 200, arc) - 30);
    assert.ok(travelled > 0 && travelled <= 360, arc);
  }
  assert.ok(Math.abs(resolveHue(30, 200, 'shorter') - 30) <= 180);
  assert.ok(Math.abs(resolveHue(30, 200, 'longer') - 30) >= 180);
});

/* ── Midpoints, against the CSS Images formula ── */

test('a midpoint of 0.5 is the identity, and the ends are fixed', () => {
  for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) near(applyMidpoint(t, 0.5), t, 1e-12, `t=${t}`);
  for (const m of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    assert.equal(applyMidpoint(0, m), 0, `start at m=${m}`);
    assert.equal(applyMidpoint(1, m), 1, `end at m=${m}`);
  }
});

test('the 50/50 mix lands exactly on the midpoint', () => {
  // This is the definition, from CSS Images 3 §3.4.2: at the hint position the
  // weighting is 0.5, whatever the hint is.
  for (const m of [0.1, 0.25, 0.3, 0.5, 0.75, 0.9]) {
    near(applyMidpoint(m, m), 0.5, 1e-12, `hint at ${m}`);
  }
  // And the reweighting is monotonic, or the gradient would fold back on itself.
  for (const m of [0.2, 0.8]) {
    let previous = -1;
    for (let t = 0; t <= 1.00001; t += 0.05) {
      const v = applyMidpoint(Math.min(1, t), m);
      assert.ok(v >= previous - 1e-12, `monotonic at m=${m}, t=${t}`);
      previous = v;
    }
  }
});

test('an out-of-range midpoint is bounded instead of producing Infinity', () => {
  for (const m of [-1, 0, 1, 2, Number.NaN]) {
    const v = applyMidpoint(0.5, m);
    assert.ok(Number.isFinite(v), `m=${m} gave ${v}`);
    assert.ok(v >= 0 && v <= 1, `m=${m} gave ${v}`);
  }
});

/* ── Mixing ───────────────────────────────── */

test('mixing hits both endpoints exactly in every space', () => {
  const from = rgb('#3366cc');
  const to = rgb('#ffcc00');
  for (const space of ['srgb', 'srgb-linear', 'oklab', 'oklch'] as Space[]) {
    near(Math.abs(mix(from, to, 0, space, 'shorter').r - from.r), 0, 1e-6, `${space} start`);
    near(Math.abs(mix(from, to, 1, space, 'shorter').b - to.b), 0, 1e-6, `${space} end`);
  }
});

test('sRGB interpolation greys out the middle and OKLCH does not', () => {
  // The headline claim of this tool, as a number. Blue to yellow in sRGB has a
  // midpoint of #808080 by construction: the channels meet in the middle.
  const grey = mix({ r: 0, g: 0, b: 1 }, { r: 1, g: 1, b: 0 }, 0.5, 'srgb', 'shorter');
  assert.equal(toHex(grey), '#808080');
  near(rgbToOklch(grey).c, 0, 1e-6, 'sRGB midpoint is neutral');

  const kept = mix({ r: 0, g: 0, b: 1 }, { r: 1, g: 1, b: 0 }, 0.5, 'oklch', 'shorter');
  assert.ok(rgbToOklch(kept).c > 0.1, `OKLCH should hold chroma, got ${rgbToOklch(kept).c}`);
});

test('mixing stays inside the gamut even when the straight line does not', () => {
  for (const space of ['oklab', 'oklch'] as Space[]) {
    for (let t = 0; t <= 1; t += 0.05) {
      const out = mix(rgb('#00ff00'), rgb('#0000ff'), t, space, 'shorter');
      assert.ok(inGamut(out), `${space} at t=${t}: ${JSON.stringify(out)}`);
    }
  }
});

test('a neutral stop borrows the hue of the other end rather than turning red', () => {
  // atan2(0, 0) is 0, and 0° is red. Fading a blue to white must not detour
  // through pink, so the achromatic stop takes the chromatic stop's hue.
  const blue = rgb('#3366cc');
  const hue = rgbToOklch(blue).h;
  for (const t of [0.25, 0.5, 0.75]) {
    const step = rgbToOklch(mix(blue, { r: 1, g: 1, b: 1 }, t, 'oklch', 'shorter'));
    near(step.h, hue, 1e-4, `to white at ${t}`);
    const down = rgbToOklch(mix({ r: 0, g: 0, b: 0 }, blue, t, 'oklch', 'shorter'));
    near(down.h, hue, 1e-4, `from black at ${t}`);
  }
});

/* ── Stops ────────────────────────────────── */

test('normalize sorts, clamps and never returns fewer than two stops', () => {
  const messy = normalize([
    { color: rgb('#fff'), position: 150, midpoint: 5 },
    { color: rgb('#000'), position: -20, midpoint: -1 },
  ]);
  assert.deepEqual(messy.map((s) => s.position), [0, 100]);
  assert.equal(toHex(messy[0].color), '#000000');
  assert.ok(messy.every((s) => s.midpoint > 0 && s.midpoint < 1));

  const single = normalize([{ color: rgb('#f00'), position: 40, midpoint: 0.5 }]);
  assert.equal(single.length, 2);
  assert.deepEqual(single.map((s) => s.position), [0, 100]);
  assert.equal(normalize([]).length, 2);
  assert.ok(MAX_STOPS >= 2);
});

test('sampling holds flat outside the stops, as CSS does', () => {
  const gradient: Gradient = {
    ...defaultGradient(),
    stops: [
      { color: rgb('#ff0000'), position: 25, midpoint: 0.5 },
      { color: rgb('#0000ff'), position: 75, midpoint: 0.5 },
    ],
  };
  assert.equal(toHex(sample(gradient, 0)), '#ff0000');
  assert.equal(toHex(sample(gradient, 25)), '#ff0000');
  assert.equal(toHex(sample(gradient, 75)), '#0000ff');
  assert.equal(toHex(sample(gradient, 100)), '#0000ff');
  // Out-of-range input is clamped rather than extrapolated.
  assert.equal(toHex(sample(gradient, -50)), '#ff0000');
  assert.equal(toHex(sample(gradient, 500)), '#0000ff');
});

test('two stops at the same position are a hard edge', () => {
  const gradient: Gradient = {
    ...defaultGradient(),
    stops: [
      { color: rgb('#ff0000'), position: 0, midpoint: 0.5 },
      { color: rgb('#ff0000'), position: 50, midpoint: 0.5 },
      { color: rgb('#0000ff'), position: 50, midpoint: 0.5 },
      { color: rgb('#0000ff'), position: 100, midpoint: 0.5 },
    ],
  };
  assert.equal(toHex(sample(gradient, 49.9)), '#ff0000');
  assert.equal(toHex(sample(gradient, 50)), '#0000ff');
  assert.equal(toHex(sample(gradient, 80)), '#0000ff');
});

test('a midpoint moves the halfway colour to where it says', () => {
  const skewed = two('#000000', '#ffffff', {});
  skewed.stops[0].midpoint = 0.25;
  const halfway = sample(skewed, 25);
  const even = sample(two('#000000', '#ffffff'), 50);
  // At 25% of a gradient hinted at 25%, the colour equals the unhinted middle.
  near(halfway.r, even.r, 1e-9);
  assert.ok(sample(skewed, 50).r > even.r, 'the second half is lighter throughout');
});

test('sampling a three-stop gradient uses the right segment', () => {
  const gradient: Gradient = {
    ...defaultGradient(),
    space: 'srgb',
    stops: [
      { color: { r: 0, g: 0, b: 0 }, position: 0, midpoint: 0.5 },
      { color: { r: 1, g: 0, b: 0 }, position: 50, midpoint: 0.5 },
      { color: { r: 1, g: 1, b: 1 }, position: 100, midpoint: 0.5 },
    ],
  };
  assert.equal(toHex(sample(gradient, 25)), '#800000');
  assert.equal(toHex(sample(gradient, 50)), '#ff0000');
  assert.equal(toHex(sample(gradient, 75)), '#ff8080');
});

/* ── Resampling ───────────────────────────── */

test('resampling reproduces the gradient at its own sample points', () => {
  const gradient = two('#0000ff', '#ffff00');
  const stops = resample(gradient, 17);
  assert.equal(stops.length, 17);
  for (const stop of stops) {
    assert.equal(toHex(stop.color), toHex(sample(gradient, stop.position)));
    assert.equal(stop.midpoint, 0.5, 'a resampled stop carries no hint of its own');
  }
  near(stops[0].position, 0, 1e-12);
  near(stops[16].position, 100, 1e-12);
});

test('resampling is clamped to a sane count', () => {
  const gradient = two('#0000ff', '#ffff00');
  assert.equal(resample(gradient, 1).length, 2);
  assert.equal(resample(gradient, 0).length, 2);
  assert.equal(resample(gradient, -5).length, 2);
  assert.equal(resample(gradient, 1000).length, 64);
});

test('resampling keeps the stop positions when they do not span the whole line', () => {
  const gradient: Gradient = {
    ...defaultGradient(),
    stops: [
      { color: rgb('#ff0000'), position: 20, midpoint: 0.5 },
      { color: rgb('#0000ff'), position: 60, midpoint: 0.5 },
    ],
  };
  const stops = resample(gradient, 5);
  assert.deepEqual(stops.map((s) => s.position), [20, 30, 40, 50, 60]);
});

/* ── CSS output ───────────────────────────── */

test('the modern declaration names the space and the arc only when it must', () => {
  assert.equal(
    toCss(two('#0000ff', '#ffff00')),
    'linear-gradient(90deg in oklch, #0000ff 0%, #ffff00 100%)'
  );
  assert.equal(
    toCss(two('#0000ff', '#ffff00', { arc: 'longer' })),
    'linear-gradient(90deg in oklch longer hue, #0000ff 0%, #ffff00 100%)'
  );
  assert.equal(
    toCss(two('#0000ff', '#ffff00', { space: 'oklab' })),
    'linear-gradient(90deg in oklab, #0000ff 0%, #ffff00 100%)'
  );
  // srgb is still stated: leaving it out would mean "unspecified", not "srgb".
  assert.equal(
    toCss(two('#0000ff', '#ffff00', { space: 'srgb', angle: 45 })),
    'linear-gradient(45deg in srgb, #0000ff 0%, #ffff00 100%)'
  );
});

test('a radial gradient writes its shape and centre', () => {
  assert.equal(
    toCss(two('#000000', '#ffffff', { kind: 'radial', shape: 'ellipse', cx: 30, cy: 70 })),
    'radial-gradient(ellipse at 30% 70% in oklch, #000000 0%, #ffffff 100%)'
  );
});

test('a midpoint is written as a CSS colour hint, not as an extra colour', () => {
  const gradient = two('#000000', '#ffffff');
  gradient.stops[0].midpoint = 0.3;
  const css = toCss(gradient);
  assert.equal(css, 'linear-gradient(90deg in oklch, #000000 0%, 30%, #ffffff 100%)');
  // A hint at the default position is not written at all.
  gradient.stops[0].midpoint = 0.5;
  assert.ok(!toCss(gradient).includes('50%,'), 'no redundant hint');
});

test('the fallback is plain sRGB stops with no interpolation keyword', () => {
  const css = toCssFallback(two('#0000ff', '#ffff00'), 5);
  assert.equal(css.startsWith('linear-gradient(90deg, '), true);
  assert.ok(!css.includes('oklch'), 'a fallback that mentions oklch is not a fallback');
  assert.equal((css.match(/#[0-9a-f]{6}/g) ?? []).length, 5);
  assert.ok(css.includes('#0000ff 0%'));
  assert.ok(css.includes('#ffff00 100%'));
});

test('the block declares the fallback first and the modern form under @supports', () => {
  const block = toCssBlock(two('#0000ff', '#ffff00'), 5);
  const lines = block.split('\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith('background: linear-gradient(90deg, '));
  assert.ok(lines[1].startsWith('@supports '));
  assert.ok(lines[2].includes('in oklch'));
  assert.equal(lines[3], '}');
  // The property is settable, for border-image and mask cases.
  assert.ok(toCssBlock(two('#000', '#fff'), 3, 'mask-image').startsWith('mask-image: '));
});

test('positions print without trailing zeros', () => {
  const gradient: Gradient = {
    ...defaultGradient(),
    stops: [
      { color: rgb('#000000'), position: 0, midpoint: 0.5 },
      { color: rgb('#ffffff'), position: 33.333333, midpoint: 0.5 },
    ],
  };
  assert.ok(toCss(gradient).includes('#ffffff 33.33%'));
  assert.ok(toCss(two('#000', '#fff')).includes('0%'));
});

/* ── The measurement ──────────────────────── */

test('the chroma dip is measured, and it is what separates the two spaces', () => {
  const srgb = measureChroma(two('#0000ff', '#ffff00', { space: 'srgb' }));
  const oklch = measureChroma(two('#0000ff', '#ffff00', { space: 'oklch' }));
  near(srgb.minChroma, 0, 0.002, 'sRGB dips to neutral');
  assert.ok(srgb.minChromaAt > 30 && srgb.minChromaAt < 70, 'and it dips in the middle');
  assert.ok(oklch.minChroma > 0.1, `OKLCH should not dip, got ${oklch.minChroma}`);
  // Two stops of the same hue have no dip to find in either space.
  const flat = measureChroma(two('#3366cc', '#3366cc'));
  near(flat.minChroma, rgbToOklch(rgb('#3366cc')).c, 1e-6);
});
