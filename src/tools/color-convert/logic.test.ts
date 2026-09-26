import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAMED_COLORS,
  clip,
  deltaEOK,
  describe as describeColor,
  formatColor,
  gamutMapOklch,
  hslToRgb,
  hwbToRgb,
  inGamut,
  labToLch,
  labToRgb,
  lchToLab,
  lchToRgb,
  linearToSrgb,
  nameOf,
  oklabToRgb,
  oklchToRgb,
  p3ToXyz,
  parseColor,
  rgbToHsl,
  rgbToHwb,
  rgbToLab,
  rgbToLch,
  rgbToOklab,
  rgbToOklch,
  rgbToXyz,
  srgbToLinear,
  toGamut,
  toHex,
  toP3Gamut,
  xyzToP3,
  xyzToRgb,
  type Rgb,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance: number, what = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what} expected ${expected} ± ${tolerance}, got ${actual}`
  );

const rgb = (hex: string): Rgb => {
  const parsed = parseColor(hex);
  assert.ok(parsed, `${hex} should parse`);
  return parsed.rgb;
};

/* ── Transfer functions ───────────────────── */

test('the sRGB transfer function round-trips and keeps its landmarks', () => {
  near(srgbToLinear(0.5), 0.21404, 1e-5, 'mid grey to linear');
  near(srgbToLinear(1), 1, 1e-12);
  near(srgbToLinear(0), 0, 1e-12);
  // 1e-7 rather than floating point, because sRGB's own two thresholds are
  // not exact inverses: 0.04045 / 12.92 is 0.00313080…, a hair above the
  // 0.0031308 the other direction branches on, so a value sitting exactly on
  // the join comes back off by about 3e-8. That is the standard, not a bug.
  for (const v of [-0.3, 0, 0.001, 0.04045, 0.2, 0.5, 0.99, 1, 1.4]) {
    near(linearToSrgb(srgbToLinear(v)), v, 1e-7, `round trip at ${v}`);
  }
});

/* ── Known answers, from the CSS Color 4 sample values ── */

test('OKLCH matches the published values for the sRGB primaries', () => {
  const red = rgbToOklch(rgb('#ff0000'));
  near(red.l, 0.62796, 5e-5, 'red L');
  near(red.c, 0.25768, 5e-5, 'red C');
  near(red.h, 29.234, 0.01, 'red h');

  const green = rgbToOklch(rgb('#00ff00'));
  near(green.l, 0.86644, 5e-5, 'green L');
  near(green.c, 0.29483, 5e-5, 'green C');
  near(green.h, 142.495, 0.01, 'green h');

  const blue = rgbToOklch(rgb('#0000ff'));
  near(blue.l, 0.45201, 5e-5, 'blue L');
  near(blue.c, 0.31321, 5e-5, 'blue C');
  near(blue.h, 264.052, 0.01, 'blue h');
});

test('white is OKLab L=1 and black is L=0, both achromatic', () => {
  const white = rgbToOklab(rgb('#ffffff'));
  near(white.l, 1, 1e-6);
  near(Math.hypot(white.a, white.b), 0, 1e-6);
  const black = rgbToOklab(rgb('#000000'));
  near(black.l, 0, 1e-9);
});

test('CIE Lab is D50-referenced, as CSS lab() requires', () => {
  // W3C CSS Color 4 gives red as lab(54.2917% 80.8125 69.8851).
  const red = rgbToLab(rgb('#ff0000'));
  near(red.l, 54.2917, 0.01, 'red L*');
  near(red.a, 80.8125, 0.02, 'red a*');
  near(red.b, 69.8851, 0.02, 'red b*');

  // 50% grey: a D65 white point would put L* here at 53.39, not 53.59.
  const grey = rgbToLab(rgb('#808080'));
  near(grey.l, 53.5851, 0.01, 'grey L*');
  // Neutral, to within the rounding of the published Bradford matrix.
  near(grey.a, 0, 1e-5);
  near(grey.b, 0, 1e-5);

  const white = rgbToLab(rgb('#ffffff'));
  near(white.l, 100, 1e-4, 'white L*');
  near(Math.hypot(white.a, white.b), 0, 5e-5, 'white is neutral');
});

test('Lab and OKLab invert exactly enough to survive a round trip', () => {
  for (const hex of ['#ff0000', '#3366cc', '#808080', '#000000', '#ffffff', '#12ab7f']) {
    const start = rgb(hex);
    // Lab goes through the Bradford adaptation, whose two directions are
    // published as separately rounded matrices rather than exact inverses —
    // so the round trip closes to about 2e-6, a fifth of a thousandth of a
    // byte. The D65 spaces have no adaptation and close to floating point.
    near(toHexDistance(labToRgb(rgbToLab(start)), start), 0, 2e-6, `lab ${hex}`);
    near(toHexDistance(oklabToRgb(rgbToOklab(start)), start), 0, 1e-6, `oklab ${hex}`);
    near(toHexDistance(oklchToRgb(rgbToOklch(start)), start), 0, 1e-6, `oklch ${hex}`);
    near(toHexDistance(lchToRgb(rgbToLch(start)), start), 0, 2e-6, `lch ${hex}`);
    near(toHexDistance(xyzToRgb(rgbToXyz(start)), start), 0, 1e-6, `xyz ${hex}`);
    near(toHexDistance(xyzToP3(p3ToXyz(start)), start), 0, 1e-6, `p3 ${hex}`);
  }
});

function toHexDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

test('polar and rectangular forms agree, and hue is dropped when achromatic', () => {
  const lch = labToLch({ l: 50, a: 3, b: 4 });
  near(lch.c, 5, 1e-12);
  near(lch.h, 53.13010, 1e-4);
  const back = lchToLab(lch);
  near(back.a, 3, 1e-12);
  near(back.b, 4, 1e-12);
  assert.equal(labToLch({ l: 50, a: 0, b: 0 }).h, 0);
  // Negative b* must land in the fourth quadrant, not at a negative angle.
  near(labToLch({ l: 50, a: 1, b: -1 }).h, 315, 1e-9);
});

/* ── HSL and HWB ──────────────────────────── */

test('HSL matches the values a browser reports', () => {
  assert.deepEqual(roundHsl(rgbToHsl(rgb('#ff0000'))), { h: 0, s: 100, l: 50 });
  assert.deepEqual(roundHsl(rgbToHsl(rgb('#00ffff'))), { h: 180, s: 100, l: 50 });
  assert.deepEqual(roundHsl(rgbToHsl(rgb('#663399'))), { h: 270, s: 50, l: 40 });
  assert.deepEqual(roundHsl(rgbToHsl(rgb('#ffffff'))), { h: 0, s: 0, l: 100 });
  assert.deepEqual(roundHsl(rgbToHsl(rgb('#000000'))), { h: 0, s: 0, l: 0 });
});

function roundHsl(h: { h: number; s: number; l: number }) {
  return { h: Math.round(h.h), s: Math.round(h.s), l: Math.round(h.l) };
}

test('HSL round-trips through every hue sixth, including the boundaries', () => {
  for (let h = 0; h < 360; h += 15) {
    for (const s of [0, 25, 100]) {
      for (const l of [0, 10, 50, 90, 100]) {
        const back = rgbToHsl(hslToRgb({ h, s, l }));
        near(back.l, l, 1e-9, `l at ${h}/${s}/${l}`);
        // Saturation and hue are undefined at the poles; only check inside.
        if (l > 0 && l < 100 && s > 0) {
          near(back.s, s, 1e-9, `s at ${h}/${s}/${l}`);
          near(((back.h % 360) + 360) % 360, h, 1e-6, `h at ${h}/${s}/${l}`);
        }
      }
    }
  }
});

test('HWB covers the tint, shade and degenerate cases', () => {
  assert.deepEqual(hwbToRgb({ h: 0, w: 0, b: 0 }), { r: 1, g: 0, b: 0 });
  assert.deepEqual(hwbToRgb({ h: 0, w: 100, b: 0 }), { r: 1, g: 1, b: 1 });
  assert.deepEqual(hwbToRgb({ h: 0, w: 0, b: 100 }), { r: 0, g: 0, b: 0 });
  // w + b over 100% is legal CSS and resolves to grey at their ratio.
  assert.deepEqual(hwbToRgb({ h: 120, w: 60, b: 60 }), { r: 0.5, g: 0.5, b: 0.5 });
  const back = rgbToHwb(rgb('#8ce633'));
  near(back.h, 90, 0.5);
  near(back.w, 20, 0.5);
  near(back.b, 10, 0.5);
});

/* ── Parsing ──────────────────────────────── */

test('hex parses in all four lengths, with and without the hash', () => {
  assert.deepEqual(parseColor('#f00'), { rgb: { r: 1, g: 0, b: 0 }, alpha: 1 });
  assert.deepEqual(parseColor('f00'), { rgb: { r: 1, g: 0, b: 0 }, alpha: 1 });
  assert.deepEqual(parseColor('#FF0000'), { rgb: { r: 1, g: 0, b: 0 }, alpha: 1 });
  assert.equal(parseColor('#aabbcc')!.rgb.r, 0xaa / 255);
  near(parseColor('#ff000080')!.alpha, 128 / 255, 1e-12);
  near(parseColor('#f008')!.alpha, 0x88 / 255, 1e-12);
});

test('every functional notation parses back to the same colour', () => {
  const cases: [string, string][] = [
    ['rgb(255 0 0)', '#ff0000'],
    ['rgb(100% 0% 0%)', '#ff0000'],
    ['rgba(255, 0, 0, 1)', '#ff0000'],
    ['hsl(0 100% 50%)', '#ff0000'],
    ['hsl(0deg, 100%, 50%)', '#ff0000'],
    ['hsl(0.5turn 100% 50%)', '#00ffff'],
    ['hsl(200grad 100% 50%)', '#00ffff'],
    ['hwb(0 0% 0%)', '#ff0000'],
    ['lab(54.2917% 80.8125 69.8851)', '#ff0000'],
    ['lch(54.2917% 106.8390 40.8526)', '#ff0000'],
    ['oklab(0.62796 0.22486 0.12585)', '#ff0000'],
    ['oklch(0.62796 0.25768 29.234)', '#ff0000'],
    ['color(srgb 1 0 0)', '#ff0000'],
    ['color(srgb-linear 1 0 0)', '#ff0000'],
    ['red', '#ff0000'],
    ['REBECCAPURPLE', '#663399'],
  ];
  for (const [input, hex] of cases) {
    const parsed = parseColor(input);
    assert.ok(parsed, `${input} should parse`);
    assert.equal(toHex({ rgb: toGamut(parsed.rgb), alpha: 1 }), hex, input);
  }
});

test('alpha is read from both the slash form and the legacy fourth argument', () => {
  near(parseColor('rgb(255 0 0 / 50%)')!.alpha, 0.5, 1e-12);
  near(parseColor('rgba(255, 0, 0, 0.25)')!.alpha, 0.25, 1e-12);
  near(parseColor('oklch(0.6 0.2 30 / 0.1)')!.alpha, 0.1, 1e-12);
  assert.equal(parseColor('transparent')!.alpha, 0);
  // Out-of-range alpha clamps rather than producing an impossible colour.
  assert.equal(parseColor('rgb(0 0 0 / 200%)')!.alpha, 1);
  assert.equal(parseColor('rgb(0 0 0 / -1)')!.alpha, 0);
});

test('color(display-p3 …) is not mistaken for a four-argument legacy form', () => {
  // The fourth token here is blue, not alpha — the bug this guards.
  const parsed = parseColor('color(display-p3 1 0 0)');
  assert.ok(parsed);
  assert.equal(parsed.alpha, 1);
  assert.ok(!inGamut(parsed.rgb), 'P3 red is outside sRGB');
  const p3 = xyzToP3(rgbToXyz(parsed.rgb));
  near(p3.r, 1, 1e-9);
  near(p3.g, 0, 1e-9);
  near(p3.b, 0, 1e-9);
});

test('nonsense returns null instead of a wrong colour', () => {
  for (const bad of [
    '',
    '   ',
    '#',
    '#12',
    '#1234567',
    'rgb(1 2)',
    'rgb(1 2 3 4 5)',
    'hsl(nope 1% 2%)',
    'oklch(0.5 0.1)',
    'color(rec2020 1 0 0)',
    'notacolour',
    'rgb(1,2,3',
    'url(#x)',
    '色',
  ]) {
    assert.equal(parseColor(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

test('`none` is accepted as the zero it resolves to', () => {
  assert.deepEqual(parseColor('rgb(none none none)'), { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 });
  near(parseColor('oklch(0.5 none 30)')!.rgb.r, parseColor('oklch(0.5 0 30)')!.rgb.r, 1e-12);
});

/* ── Gamut ────────────────────────────────── */

test('in-gamut colours pass through gamut mapping untouched', () => {
  for (const hex of ['#ff0000', '#000000', '#ffffff', '#3366cc']) {
    const start = rgb(hex);
    const mapped = toGamut(start);
    near(toHexDistance(mapped, start), 0, 1e-9, hex);
  }
});

test('gamut mapping holds hue and lightness while it gives up chroma', () => {
  const wanted = { l: 0.7, c: 0.4, h: 150 };
  const mapped = gamutMapOklch(wanted);
  assert.ok(inGamut(mapped), 'result must be displayable');
  const got = rgbToOklch(mapped);
  // The tolerances are a just-noticeable difference, not rounding error: the
  // algorithm's last step is a clip taken once clipping is imperceptible.
  near(got.l, wanted.l, 0.02, 'lightness held');
  near(got.h, wanted.h, 5, 'hue held');
  assert.ok(got.c < wanted.c, 'chroma must come down');
});

test('gamut mapping beats per-channel clipping at what it is for', () => {
  // Clipping is often *closer* in raw OKLab distance, which is exactly why
  // raw distance is the wrong objective: it buys that closeness by moving the
  // hue. A yellow-green at h=90 clips to something near h=49 — a different
  // colour — while the chroma search lands within a few degrees.
  for (const wanted of [
    { l: 0.6, c: 0.35, h: 90 },
    { l: 0.7, c: 0.4, h: 150 },
    { l: 0.8, c: 0.25, h: 270 },
    { l: 0.5, c: 0.3, h: 30 },
  ]) {
    const ideal = oklchToRgb(wanted);
    const mapped = rgbToOklch(gamutMapOklch(wanted));
    const clipped = rgbToOklch(clip(ideal));
    const hueError = (h: number) => {
      const d = Math.abs(h - wanted.h) % 360;
      return d > 180 ? 360 - d : d;
    };
    assert.ok(
      hueError(mapped.h) <= hueError(clipped.h) + 1e-9,
      `h=${wanted.h}: mapped drifted ${hueError(mapped.h)}°, clipping ${hueError(clipped.h)}°`
    );
    assert.ok(
      Math.abs(mapped.l - wanted.l) <= Math.abs(clipped.l - wanted.l) + 1e-9,
      `h=${wanted.h}: lightness should be held at least as well as clipping`
    );
  }
});

test('the extremes of lightness map to white and black', () => {
  assert.deepEqual(gamutMapOklch({ l: 1.2, c: 0.3, h: 200 }), { r: 1, g: 1, b: 1 });
  assert.deepEqual(gamutMapOklch({ l: -0.2, c: 0.3, h: 200 }), { r: 0, g: 0, b: 0 });
});

test('deltaEOK is zero for a colour against itself and grows with distance', () => {
  const a = rgb('#3366cc');
  assert.equal(deltaEOK(a, a), 0);
  assert.ok(deltaEOK(a, rgb('#3366cd')) < deltaEOK(a, rgb('#3366ff')));
  assert.ok(deltaEOK(rgb('#000000'), rgb('#ffffff')) > 0.9);
});

test('inGamut and clip agree about the boundary', () => {
  assert.ok(inGamut({ r: 0, g: 1, b: 0.5 }));
  assert.ok(!inGamut({ r: -0.01, g: 0, b: 0 }));
  assert.ok(!inGamut({ r: 1.01, g: 0, b: 0 }));
  assert.deepEqual(clip({ r: -1, g: 0.5, b: 2 }), { r: 0, g: 0.5, b: 1 });
});

/* ── Formatting ───────────────────────────── */

test('formatting omits alpha when it is 1 and includes it otherwise', () => {
  const opaque = parseColor('#ff8000')!;
  assert.equal(formatColor(opaque, 'hex'), '#ff8000');
  assert.equal(formatColor(opaque, 'rgb'), 'rgb(255 128 0)');
  const translucent = parseColor('rgb(255 128 0 / 0.5)')!;
  assert.equal(formatColor(translucent, 'rgb'), 'rgb(255 128 0 / 0.5)');
  assert.equal(formatColor(translucent, 'hex'), '#ff800080');
});

test('formatting never prints a negative zero', () => {
  for (const space of ['lab', 'lch', 'oklab', 'oklch', 'hsl', 'hwb'] as const) {
    assert.ok(!formatColor(parseColor('#ffffff')!, space).includes('-0'), space);
    assert.ok(!formatColor(parseColor('#808080')!, space).includes('-0'), space);
  }
});

test('the screen notations are gamut-mapped and the perceptual ones are not', () => {
  const wide = parseColor('oklch(0.7 0.4 150)')!;
  assert.equal(formatColor(wide, 'oklch'), 'oklch(0.7 0.4 150)');
  const hex = formatColor(wide, 'hex');
  assert.match(hex, /^#[0-9a-f]{6}$/);
  assert.ok(inGamut(parseColor(hex)!.rgb));
});

/* ── Names and the report ─────────────────── */

test('the named-colour table is complete and self-consistent', () => {
  assert.equal(Object.keys(NAMED_COLORS).length, 148);
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    assert.match(hex, /^[0-9a-f]{6}$/, name);
    assert.ok(parseColor(name), name);
  }
  assert.equal(NAMED_COLORS.rebeccapurple, '663399');
  assert.equal(NAMED_COLORS.transparent, undefined);
});

test('nameOf finds an exact match and nothing else', () => {
  assert.equal(nameOf(rgb('#663399')), 'rebeccapurple');
  assert.equal(nameOf(rgb('#ffffff')), 'white');
  assert.equal(nameOf(rgb('#123457')), null);
});

test('describe reports every notation and both gamut verdicts', () => {
  const srgb = describeColor(parseColor('#3366cc')!);
  assert.equal(srgb.outOfSrgb, false);
  assert.equal(srgb.outOfP3, false);
  assert.equal(srgb.notations.length, 9);
  assert.ok(srgb.notations.every((n) => n.value.length > 0));

  const p3only = describeColor(parseColor('color(display-p3 0 1 0)')!);
  assert.equal(p3only.outOfSrgb, true);
  assert.equal(p3only.outOfP3, false);

  const beyond = describeColor(parseColor('oklch(0.7 0.4 150)')!);
  assert.equal(beyond.outOfSrgb, true);
  assert.equal(beyond.outOfP3, true);
});

/* ── Regressions found while reading this file for the notes ── */

test('the Display-P3 row is mapped into P3, not printed as channels no screen has', () => {
  // oklch(0.7 0.4 150) is outside P3 as well as sRGB. Printing the raw
  // transform gave color(display-p3 -0.419 0.8201 -0.2103): three numbers that
  // are not a colour, in the one row that is supposed to be a screen space.
  const beyond = parseColor('oklch(0.7 0.4 150)')!;
  const printed = formatColor(beyond, 'p3');
  const match = /^color\(display-p3 (\S+) (\S+) (\S+)\)$/.exec(printed);
  assert.ok(match, printed);
  for (const raw of match.slice(1)) {
    const v = Number(raw);
    assert.ok(v >= 0 && v <= 1, `${printed} has a channel outside 0..1`);
  }
  // Mapped the way the other screen rows are mapped: chroma comes down, hue
  // and lightness stay. Clipping the channels would move the hue instead.
  const p3 = { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  const got = rgbToOklch(xyzToRgb(p3ToXyz(p3)));
  near(got.h, 150, 5, 'hue held through the P3 mapping');
  near(got.l, 0.7, 0.02, 'lightness held through the P3 mapping');
});

test('a colour that fits P3 is printed exactly, mapping or not', () => {
  // P3 green is outside sRGB but is a colour a P3 screen shows; it must survive
  // untouched, which is why this cannot be the sRGB gamut mapping.
  assert.equal(formatColor(parseColor('color(display-p3 0 1 0)')!, 'p3'), 'color(display-p3 0 1 0)');
  assert.equal(formatColor(parseColor('color(display-p3 1 0 0)')!, 'p3'), 'color(display-p3 1 0 0)');
  assert.equal(formatColor(parseColor('#ffffff')!, 'p3'), 'color(display-p3 1 1 1)');
  const red = formatColor(parseColor('#ff0000')!, 'p3');
  assert.equal(red, 'color(display-p3 0.9175 0.2003 0.1386)');
});

test('toP3Gamut only moves a colour that does not fit P3', () => {
  const inside = toP3Gamut(rgb('#3366cc'));
  assert.ok(inGamut(inside));
  near(toHexDistance(inside, xyzToP3(rgbToXyz(rgb('#3366cc')))), 0, 1e-9, 'untouched inside P3');
  const outside = toP3Gamut(oklchToRgb({ l: 0.7, c: 0.4, h: 150 }));
  assert.ok(inGamut(outside), 'a colour beyond P3 comes back displayable');
  assert.ok(!inGamut(xyzToP3(rgbToXyz(oklchToRgb({ l: 0.7, c: 0.4, h: 150 })))), 'and it did need mapping');
});

test('a gamut-mapped colour is not labelled with the name it happened to land on', () => {
  // oklch(0.8 0.4 72) is far outside sRGB and maps onto exactly #ffa500, so the
  // report used to call it "orange" — a colour the user never typed.
  const wide = describeColor(parseColor('oklch(0.8 0.4 72)')!);
  assert.equal(wide.outOfSrgb, true);
  assert.equal(wide.notations.find((n) => n.space === 'hex')!.value, '#ffa500');
  assert.equal(wide.name, null, 'no name for a colour that had to be mapped');
  // The colour actually named orange still gets its name.
  assert.equal(describeColor(parseColor('#ffa500')!).name, 'orange');
  assert.equal(describeColor(parseColor('rebeccapurple')!).name, 'rebeccapurple');
});

test('nameOf answers from a reverse table and agrees with a scan of every name', () => {
  const entries = Object.entries(NAMED_COLORS);
  // 148 names, 139 hexes: nine hexes have two spellings.
  assert.equal(new Set(entries.map(([, hex]) => hex)).size, 139);
  for (const [name, hex] of entries) {
    // Several names share a hex (aqua/cyan, gray/grey); the first spelling in
    // the table is the answer, as it was when this was a linear scan.
    const first = entries.find(([, v]) => v === hex)![0];
    assert.equal(nameOf(parseColor(`#${hex}`)!.rgb), first, name);
  }
  assert.equal(nameOf(rgb('#00ffff')), 'aqua');
  assert.equal(nameOf(rgb('#808080')), 'gray');
  assert.equal(nameOf({ r: 0.1, g: 0.2, b: 0.3 }), null);
});
