import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apcaBand,
  apcaLc,
  apcaY,
  clip,
  compositeOver,
  contrastRatio,
  deltaEOK,
  inGamut,
  linearToSrgb,
  measure,
  nearestPassing,
  oklabToRgb,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToOklab,
  rgbToOklch,
  srgbToLinear,
  toGamut,
  toHex,
  wcagVerdict,
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
  return parsed.rgb;
};

const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/* ── Colour plumbing ──────────────────────── */

test('the sRGB transfer function round-trips', () => {
  for (const v of [0, 0.01, 0.2, 0.5, 1]) near(linearToSrgb(srgbToLinear(v)), v, 1e-7, `${v}`);
  near(srgbToLinear(0.5), 0.21404, 1e-5);
});

test('this tool agrees with the published OKLCH values', () => {
  // Same numbers as H01, via Ottosson's direct sRGB matrices rather than the
  // XYZ route — if these two ever disagree, one of them is wrong.
  const red = rgbToOklch(rgb('#ff0000'));
  near(red.l, 0.62796, 1e-4, 'red L');
  near(red.c, 0.25768, 1e-4, 'red C');
  near(red.h, 29.234, 0.02, 'red h');
  near(rgbToOklab(WHITE).l, 1, 1e-5, 'white L');
  near(rgbToOklch(rgb('#0000ff')).h, 264.052, 0.02, 'blue h');
});

test('OKLab and OKLCH invert', () => {
  for (const hex of ['#ff0000', '#3366cc', '#808080', '#000000', '#ffffff']) {
    const start = rgb(hex);
    const viaLab = oklabToRgb(rgbToOklab(start));
    const viaLch = oklchToRgb(rgbToOklch(start));
    near(Math.max(Math.abs(viaLab.r - start.r), Math.abs(viaLab.g - start.g), Math.abs(viaLab.b - start.b)), 0, 1e-6, hex);
    near(Math.max(Math.abs(viaLch.r - start.r), Math.abs(viaLch.g - start.g), Math.abs(viaLch.b - start.b)), 0, 1e-6, hex);
  }
});

test('gamut mapping returns something displayable and keeps hue', () => {
  const mapped = toGamut({ l: 0.7, c: 0.4, h: 150 });
  assert.ok(inGamut(mapped));
  near(rgbToOklch(mapped).h, 150, 5);
  assert.deepEqual(toGamut({ l: 1.5, c: 0.2, h: 30 }), WHITE);
  assert.deepEqual(toGamut({ l: -1, c: 0.2, h: 30 }), BLACK);
  assert.deepEqual(clip({ r: 2, g: -1, b: 0.5 }), { r: 1, g: 0, b: 0.5 });
});

test('deltaEOK is a metric on identical and opposite colours', () => {
  assert.equal(deltaEOK(WHITE, WHITE), 0);
  assert.ok(deltaEOK(WHITE, BLACK) > 0.9);
});

test('hex formatting round-trips through parsing', () => {
  for (const hex of ['#000000', '#ffffff', '#3366cc', '#0a0b0c']) {
    assert.equal(toHex(rgb(hex)), hex);
  }
});

/* ── Parsing ──────────────────────────────── */

test('the notations a contrast check actually receives all parse', () => {
  const cases: [string, string][] = [
    ['#fff', '#ffffff'],
    ['fff', '#ffffff'],
    ['#FFFFFF', '#ffffff'],
    ['rgb(255 255 255)', '#ffffff'],
    ['rgb(100%, 100%, 100%)', '#ffffff'],
    ['hsl(0 0% 100%)', '#ffffff'],
    ['oklch(1 0 0)', '#ffffff'],
    ['oklab(1 0 0)', '#ffffff'],
    ['white', '#ffffff'],
    ['#336699', '#336699'],
    ['hsl(210 50% 40%)', '#336699'],
  ];
  for (const [input, hex] of cases) assert.equal(toHex(rgb(input)), hex, input);
});

test('alpha is read from every form it comes in', () => {
  near(parseColor('#ffffff80')!.alpha, 128 / 255, 1e-12);
  near(parseColor('#fff8')!.alpha, 0x88 / 255, 1e-12);
  near(parseColor('rgb(0 0 0 / 40%)')!.alpha, 0.4, 1e-12);
  near(parseColor('rgba(0,0,0,0.4)')!.alpha, 0.4, 1e-12);
  assert.equal(parseColor('transparent')!.alpha, 0);
  assert.equal(parseColor('#fff')!.alpha, 1);
});

test('unreadable input returns null rather than a guess', () => {
  for (const bad of ['', '  ', '#12', 'rgb(1 2)', 'hsl(x 1% 2%)', 'lab(50 0 0)', 'nope', '#1234567']) {
    assert.equal(parseColor(bad), null, JSON.stringify(bad));
  }
});

/* ── WCAG, against hand-checked landmarks ── */

test('relative luminance hits its defined endpoints', () => {
  assert.equal(relativeLuminance(WHITE), 1);
  assert.equal(relativeLuminance(BLACK), 0);
  near(relativeLuminance({ r: 0.5, g: 0.5, b: 0.5 }), 0.21404, 1e-5);
  // The green channel carries three quarters of the weight.
  near(relativeLuminance({ r: 0, g: 1, b: 0 }), 0.7152, 1e-9);
  near(relativeLuminance({ r: 0, g: 0, b: 1 }), 0.0722, 1e-9);
});

test('the WCAG ratio matches the values an auditing tool reports', () => {
  near(contrastRatio(BLACK, WHITE), 21, 1e-9, 'black on white');
  assert.equal(contrastRatio(WHITE, BLACK), contrastRatio(BLACK, WHITE));
  near(contrastRatio(WHITE, WHITE), 1, 1e-12, 'a colour against itself');
  // #767676 is the canonical darkest grey that still passes AA on white, and
  // #757575 is the one below it that does not.
  near(contrastRatio(rgb('#767676'), WHITE), 4.54, 0.01);
  assert.equal(wcagVerdict(contrastRatio(rgb('#767676'), WHITE)).normal, 'AA');
  assert.equal(wcagVerdict(contrastRatio(rgb('#777777'), WHITE)).normal, 'fail');
  // The mirror on black: #757575 is the darkest grey that still passes there,
  // and #747474 is the one below it that does not.
  near(contrastRatio(rgb('#757575'), BLACK), 4.5578, 0.01);
  assert.equal(wcagVerdict(contrastRatio(rgb('#757575'), BLACK)).normal, 'AA');
  assert.equal(wcagVerdict(contrastRatio(rgb('#747474'), BLACK)).normal, 'fail');
  near(contrastRatio(rgb('#0000ff'), WHITE), 8.59, 0.01, 'blue on white');
});

test('the AA and AAA thresholds land on the right side of each boundary', () => {
  assert.deepEqual(wcagVerdict(21), { ratio: 21, normal: 'AAA', large: 'AAA', nonText: true });
  assert.deepEqual(wcagVerdict(7), { ratio: 7, normal: 'AAA', large: 'AAA', nonText: true });
  assert.deepEqual(wcagVerdict(6.99), { ratio: 6.99, normal: 'AA', large: 'AAA', nonText: true });
  assert.deepEqual(wcagVerdict(4.5), { ratio: 4.5, normal: 'AA', large: 'AAA', nonText: true });
  assert.deepEqual(wcagVerdict(4.49), { ratio: 4.49, normal: 'fail', large: 'AA', nonText: true });
  assert.deepEqual(wcagVerdict(3), { ratio: 3, normal: 'fail', large: 'AA', nonText: true });
  assert.deepEqual(wcagVerdict(2.99), { ratio: 2.99, normal: 'fail', large: 'fail', nonText: false });
  assert.deepEqual(wcagVerdict(1), { ratio: 1, normal: 'fail', large: 'fail', nonText: false });
});

/* ── APCA, against the published reference values ── */

test('APCA reproduces its two documented anchor readings', () => {
  // Black text on white is Lc 106.0; white text on black is Lc -107.9. Those
  // two numbers are the sanity check every APCA implementation is judged on,
  // and their asymmetry is the whole point of the measure.
  near(apcaLc(BLACK, WHITE), 106.04, 0.05, 'black on white');
  near(apcaLc(WHITE, BLACK), -107.88, 0.05, 'white on black');
});

test('APCA luminance soft-clamps near black and leaves white alone', () => {
  // 1 to within the rounding of APCA's own published coefficients, which sum
  // to 1.0000001 rather than exactly 1.
  near(apcaY(WHITE), 1, 1e-6);
  near(apcaY(BLACK), 0.022 ** 1.414, 1e-12, 'pure black is lifted off zero');
  // Without the clamp, two near-blacks would report an unbounded difference.
  assert.ok(apcaY({ r: 0.01, g: 0.01, b: 0.01 }) > 0.004);
});

test('APCA is zero when there is nothing to see', () => {
  assert.equal(apcaLc(WHITE, WHITE), 0);
  assert.equal(apcaLc(rgb('#808080'), rgb('#808080')), 0);
  // Below the clip threshold the answer is 0, not a small number: APCA
  // deliberately refuses to report contrast it considers unusable.
  assert.equal(apcaLc(rgb('#808080'), rgb('#848484')), 0);
});

test('APCA and WCAG disagree where they are known to disagree', () => {
  // Mid grey on black scores comfortably under WCAG but is thin for APCA;
  // this asymmetry is the reason both are shown side by side.
  const wcagDark = contrastRatio(rgb('#8f8f8f'), BLACK);
  const wcagLight = contrastRatio(rgb('#707070'), WHITE);
  assert.ok(wcagDark > 4.5 && wcagLight > 4.5, 'both pass WCAG AA');
  const lcDark = Math.abs(apcaLc(rgb('#8f8f8f'), BLACK));
  const lcLight = Math.abs(apcaLc(rgb('#707070'), WHITE));
  assert.ok(lcDark < lcLight, `APCA should rate the dark pair lower (${lcDark} vs ${lcLight})`);
});

test('the APCA bands are ordered and cover the whole range', () => {
  assert.equal(apcaBand(0), 'invisible');
  assert.equal(apcaBand(14.9), 'invisible');
  assert.equal(apcaBand(15), 'discernible');
  assert.equal(apcaBand(30), 'non-text');
  assert.equal(apcaBand(-45), 'large-only');
  assert.equal(apcaBand(60), 'sub-body');
  assert.equal(apcaBand(75), 'body-min');
  assert.equal(apcaBand(-106), 'body-preferred');
});

/* ── Compositing ──────────────────────────── */

test('a translucent colour is flattened before it is measured', () => {
  const half = compositeOver({ rgb: BLACK, alpha: 0.5 }, WHITE);
  assert.deepEqual(half, { r: 0.5, g: 0.5, b: 0.5 });
  assert.deepEqual(compositeOver({ rgb: BLACK, alpha: 0 }, WHITE), WHITE);
  assert.deepEqual(compositeOver({ rgb: BLACK, alpha: 1 }, WHITE), BLACK);
  // 50% black on white must not measure as 21:1.
  near(contrastRatio(half, WHITE), 3.9767, 0.001);
});

test('measure composites both layers onto the page colour', () => {
  const opaque = measure(parseColor('#000')!, parseColor('#fff')!, WHITE);
  near(opaque.ratio, 21, 1e-9);
  assert.equal(opaque.composited, false);
  assert.equal(opaque.wcag.normal, 'AAA');
  assert.equal(opaque.band, 'body-preferred');

  const translucent = measure(parseColor('#00000080')!, parseColor('#fff')!, WHITE);
  assert.equal(translucent.composited, true);
  assert.ok(translucent.ratio < 21, 'alpha must lower the ratio');

  // A translucent background lands on the page colour, not on nothing.
  const layered = measure(parseColor('#000')!, parseColor('rgb(255 255 255 / 0.5)')!, BLACK);
  near(layered.background.r, 0.5, 1e-9);
});

/* ── Suggestions ──────────────────────────── */

test('a suggestion reaches the target and is verified, not assumed', () => {
  const failing = rgb('#999999');
  for (const target of [3, 4.5, 7] as const) {
    const options = nearestPassing(failing, WHITE, target, true);
    assert.ok(options.length > 0, `something should pass at ${target}`);
    for (const option of options) {
      assert.ok(option.ratio >= target - 1e-9, `${option.hex} claims ${option.ratio} at ${target}`);
      assert.equal(toHex(option.rgb), option.hex);
      assert.ok(inGamut(option.rgb));
    }
  }
});

test('suggestions hold hue and chroma, and come back sorted by how little they move', () => {
  // A red that fails AA on white (about 3.3:1) — the everyday case.
  const start = rgb('#e74c3c');
  const options = nearestPassing(start, WHITE, 4.5, true);
  assert.ok(options.length >= 1);
  const base = rgbToOklch(start);
  for (const option of options) {
    const got = rgbToOklch(option.rgb);
    // Hue is what a designer will notice; it must survive.
    const dh = Math.abs(got.h - base.h) % 360;
    assert.ok(Math.min(dh, 360 - dh) < 6, `hue moved ${dh}° for ${option.hex}`);
    assert.ok(option.deltaE > 0, 'a suggestion different from the input');
    assert.ok(option.lc !== 0, 'the Lc of the suggestion is reported');
  }
  for (let i = 1; i < options.length; i += 1) {
    assert.ok(options[i - 1].deltaE <= options[i].deltaE, 'sorted by deltaE');
  }
});

test('both directions are offered when both work, and neither is invented', () => {
  // Against mid grey, 7:1 is unreachable in either direction — the honest
  // result is an empty list, not a colour that does not pass.
  assert.deepEqual(nearestPassing(rgb('#808080'), rgb('#808080'), 7, true), []);
  // Against a mid grey background, 3:1 is reachable both darker and lighter.
  const both = nearestPassing(rgb('#808080'), rgb('#808080'), 3, true);
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((o) => o.direction).sort(), ['darker', 'lighter']);
  // On white only darker can work.
  const onWhite = nearestPassing(rgb('#eeeeee'), WHITE, 4.5, true);
  assert.deepEqual(onWhite.map((o) => o.direction), ['darker']);
});

test('the sign of a suggestion Lc follows the polarity it produces', () => {
  const textMoved = nearestPassing(rgb('#bbbbbb'), WHITE, 4.5, true)[0];
  assert.equal(textMoved.direction, 'darker');
  assert.ok(textMoved.lc > 0, 'dark text on a light ground is a positive Lc');

  // White text that fails on a mid grey: the background has to get darker,
  // and the reading stays in the light-on-dark polarity, so Lc is negative.
  const bgMoved = nearestPassing(rgb('#999999'), WHITE, 4.5, false)[0];
  assert.equal(bgMoved.direction, 'darker');
  assert.ok(bgMoved.lc < 0, `light-on-dark should be negative, got ${bgMoved.lc}`);
});

test('a colour that already passes gets no suggestions', () => {
  assert.deepEqual(nearestPassing(BLACK, WHITE, 7, true), []);
  assert.deepEqual(nearestPassing(rgb('#767676'), WHITE, 4.5, true), []);
  // One step below the boundary there is work to do again.
  assert.ok(nearestPassing(rgb('#777777'), WHITE, 4.5, true).length > 0);
});

/* ── Regressions found while reading this file for the notes ── */

test('an out-of-gamut oklab() is chroma-reduced, like oklch(), not clipped', () => {
  // oklab(0.7 -0.3464 0.2) is oklch(0.7 0.4 150) written rectangularly, so the
  // two branches have to agree. Clipping the channels instead landed on
  // #00d600: lightness 0.759 and hue 142.5, a different colour whose ratio
  // against white (1.98) is not the ratio of the colour that was typed (2.47).
  const viaLab = parseColor('oklab(0.7 -0.3464 0.2)')!.rgb;
  const viaLch = parseColor('oklch(0.7 0.4 150)')!.rgb;
  assert.equal(toHex(viaLab), toHex(viaLch), 'the same colour either way round');

  const got = rgbToOklch(viaLab);
  near(got.l, 0.7, 0.01, 'lightness held');
  near(got.h, 150, 1, 'hue held');

  const clipped = clip(oklabToRgb({ l: 0.7, a: -0.3464, b: 0.2 }));
  assert.ok(
    Math.abs(rgbToOklch(clipped).h - 150) > 5,
    'the clipping this replaces really did move the hue'
  );
  assert.ok(
    Math.abs(contrastRatio(clipped, WHITE) - contrastRatio(viaLab, WHITE)) > 0.3,
    'and it really did change the measurement'
  );
});

test('an in-gamut oklab() is left exactly where it is', () => {
  for (const lab of [
    { l: 1, a: 0, b: 0 },
    { l: 0, a: 0, b: 0 },
    { l: 0.5, a: 0.05, b: -0.05 },
    { l: 0.7, a: -0.1, b: 0.08 },
  ]) {
    const direct = oklabToRgb(lab);
    assert.ok(inGamut(direct), `oklab(${lab.l} ${lab.a} ${lab.b}) should be inside sRGB`);
    const parsed = parseColor(`oklab(${lab.l} ${lab.a} ${lab.b})`)!;
    near(parsed.rgb.r, direct.r, 1e-9, 'r');
    near(parsed.rgb.g, direct.g, 1e-9, 'g');
    near(parsed.rgb.b, direct.b, 1e-9, 'b');
  }
  // Red written out to five decimals lands 5e-6 outside the gamut, so it does
  // take the mapping path — and must still come back as red, not as a visibly
  // desaturated red. This is the everyday case for a pasted oklab() value.
  assert.ok(!inGamut(oklabToRgb({ l: 0.62796, a: 0.22486, b: 0.12585 })));
  assert.equal(toHex(parseColor('oklab(0.62796 0.22486 0.12585)')!.rgb), '#ff0000');
});

test('the page colour is not a choice between two extremes', () => {
  // Real page grounds are #f5f5f5 and #111, and when both layers are
  // translucent the answer moves with the ground rather than being bracketed
  // usefully by white and black.
  const at = (text: string, bg: string, page: string) =>
    measure(parseColor(text)!, parseColor(bg)!, parseColor(page)!.rgb);

  // Light theme: four percent off white is enough to change the APCA band.
  const light = (page: string) => at('#00000080', '#e0e0e080', page);
  assert.equal(light('#ffffff').band, 'sub-body');
  assert.equal(light('#f5f5f5').band, 'large-only');

  // Dark theme: pure black says this pair passes AA, a realistic #111 says it
  // does not. Neither extreme can stand in for the ground you actually ship.
  const dark = (page: string) => at('#ffffffb3', '#ffffff4d', page);
  assert.equal(dark('#000000').wcag.normal, 'AA');
  assert.equal(dark('#111111').wcag.normal, 'fail');
  assert.ok(dark('#000000').ratio - dark('#111111').ratio > 0.5, 'and by a wide margin');

  // An opaque pair ignores the page colour entirely, which is why this only
  // matters when something is translucent.
  for (const page of ['#ffffff', '#f5f5f5', '#111111', '#000000']) {
    near(at('#767676', '#ffffff', page).ratio, 4.5422, 1e-3, page);
  }
});

test('Lc under 30 is not reported as good enough for a non-text element', () => {
  // APCA's own levels: Lc 30 is the absolute minimum for any text and the
  // minimum for solid, semantic non-text; Lc 15 is only the floor for
  // "discernible and differentiable" non-text no smaller than 5px, and below
  // that a designer should treat the element as invisible. Calling everything
  // from Lc 15 up "non-text" was one whole band more permissive than the
  // document it cites.
  assert.equal(apcaBand(29.9), 'discernible');
  assert.equal(apcaBand(-20), 'discernible');
  assert.equal(apcaBand(15), 'discernible');
  assert.equal(apcaBand(14.9), 'invisible');
  assert.equal(apcaBand(30), 'non-text');
  assert.equal(apcaBand(44.9), 'non-text');
  assert.equal(apcaBand(45), 'large-only');
});
