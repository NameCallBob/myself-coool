import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BORDER,
  DEFAULT_ELEVATION,
  DEFAULT_RADIUS,
  MAX_LAYERS,
  buildElevation,
  collapseCorners,
  formatBorder,
  formatCss,
  formatLayer,
  formatRadius,
  formatShadow,
  parseRgba,
  parseShadow,
  stackedOpacity,
  toHex8,
  toRgbaString,
  type Layer,
  type Radius,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance: number, what = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what} expected ${expected} ± ${tolerance}, got ${actual}`
  );

const layer = (patch: Partial<Layer> = {}): Layer => ({
  x: 0,
  y: 2,
  blur: 4,
  spread: 0,
  color: { r: 0, g: 0, b: 0, a: 0.2 },
  inset: false,
  ...patch,
});

/* ── Colours ──────────────────────────────── */

test('colours parse from every form a shadow is written in', () => {
  assert.deepEqual(parseRgba('#000'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseRgba('#ffffff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseRgba('black'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseRgba('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseRgba('rgb(10 20 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseRgba('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseRgba('rgb(10 20 30 / 25%)'), { r: 10, g: 20, b: 30, a: 0.25 });
  near(parseRgba('#00000080')!.a, 128 / 255, 1e-12);
  near(parseRgba('#0008')!.a, 0x88 / 255, 1e-12);
  const hsl = parseRgba('hsl(0 100% 50%)');
  assert.ok(hsl);
  near(hsl.r, 255, 1e-9);
  near(hsl.g, 0, 1e-9);
});

test('unparseable colours return null rather than black', () => {
  for (const bad of ['', '  ', 'nope', '#12345', 'rgb(1 2)', 'lab(50 0 0)', 'url(#x)']) {
    assert.equal(parseRgba(bad), null, JSON.stringify(bad));
  }
});

test('colour output keeps alpha only when there is some', () => {
  assert.equal(toHex8({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
  assert.equal(toHex8({ r: 255, g: 128, b: 0, a: 0.5 }), '#ff800080');
  assert.equal(toRgbaString({ r: 0, g: 0, b: 0, a: 1 }), 'rgb(0 0 0)');
  assert.equal(toRgbaString({ r: 0, g: 0, b: 0, a: 0.2 }), 'rgb(0 0 0 / 0.2)');
  // Out-of-range channels are clamped rather than written out as nonsense.
  assert.equal(toRgbaString({ r: 300, g: -5, b: 0, a: 2 }), 'rgb(255 0 0)');
});

/* ── Formatting one layer ─────────────────── */

test('a layer is written offsets-first, colour-last, spread only when set', () => {
  assert.equal(formatLayer(layer()), '0 2px 4px rgb(0 0 0 / 0.2)');
  assert.equal(formatLayer(layer({ spread: 2 })), '0 2px 4px 2px rgb(0 0 0 / 0.2)');
  assert.equal(formatLayer(layer({ spread: -1 })), '0 2px 4px -1px rgb(0 0 0 / 0.2)');
  assert.equal(formatLayer(layer({ inset: true })), 'inset 0 2px 4px rgb(0 0 0 / 0.2)');
  // A zero length is written bare, the way CSS is normally typed.
  assert.equal(formatLayer(layer({ x: 0, y: 0, blur: 0 })), '0 0 0 rgb(0 0 0 / 0.2)');
  // Slider output must not leak trailing zeros.
  assert.equal(formatLayer(layer({ y: 2.5, blur: 4.0 })), '0 2.5px 4px rgb(0 0 0 / 0.2)');
});

test('an empty stack is `none`, and several layers join with commas', () => {
  assert.equal(formatShadow([]), 'none');
  assert.equal(
    formatShadow([layer(), layer({ y: 8, blur: 16 })]),
    '0 2px 4px rgb(0 0 0 / 0.2), 0 8px 16px rgb(0 0 0 / 0.2)'
  );
  assert.ok(formatShadow([layer(), layer()], true).includes(',\n  '));
});

/* ── Parsing a shadow back ────────────────── */

test('a formatted stack parses back to the values it came from', () => {
  const stack = [
    layer({ x: 1, y: 2, blur: 3, spread: 4, color: { r: 10, g: 20, b: 30, a: 0.5 } }),
    layer({ inset: true, x: 0, y: 0, blur: 0, spread: 1, color: { r: 0, g: 0, b: 0, a: 1 } }),
  ];
  const result = parseShadow(formatShadow(stack));
  assert.ok(result.ok);
  assert.equal(result.layers.length, 2);
  assert.deepEqual(result.layers[0], stack[0]);
  assert.deepEqual(result.layers[1], stack[1]);
});

test('the shapes real stylesheets are written in all parse', () => {
  const cases: [string, Partial<Layer>][] = [
    ['0 1px 2px rgba(0,0,0,.2)', { x: 0, y: 1, blur: 2, spread: 0 }],
    ['0 1px 2px 0 #0003', { x: 0, y: 1, blur: 2, spread: 0 }],
    ['inset 0 0 0 1px #000', { inset: true, spread: 1 }],
    ['2px 4px #000', { x: 2, y: 4, blur: 0, spread: 0 }],
    ['#000 2px 4px', { x: 2, y: 4 }],
    ['-2px -4px 8px -2px rgb(0 0 0 / 30%)', { x: -2, y: -4, blur: 8, spread: -2 }],
    ['0 .5px 1.5px #000', { y: 0.5, blur: 1.5 }],
  ];
  for (const [input, expected] of cases) {
    const result = parseShadow(input);
    assert.ok(result.ok, `${input}: ${result.ok ? '' : result.error}`);
    assert.equal(result.layers.length, 1, input);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(
        (result.layers[0] as unknown as Record<string, unknown>)[key],
        value,
        `${input} → ${key}`
      );
    }
  }
});

test('a comma inside rgb() does not split a layer in two', () => {
  const result = parseShadow('0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)');
  assert.ok(result.ok);
  assert.equal(result.layers.length, 2);
  near(result.layers[0].color.a, 0.2, 1e-12);
  near(result.layers[1].color.a, 0.1, 1e-12);
});

test('`none` and empty input mean no layers, not an error', () => {
  for (const input of ['', '   ', 'none', 'NONE']) {
    const result = parseShadow(input);
    assert.ok(result.ok, input);
    assert.deepEqual(result.layers, []);
  }
});

test('an omitted colour falls back to black and says nothing clever', () => {
  const result = parseShadow('0 2px 4px');
  assert.ok(result.ok);
  assert.deepEqual(result.layers[0].color, { r: 0, g: 0, b: 0, a: 1 });
});

test('bad input is reported with the layer it is in', () => {
  const cases: [string, RegExp][] = [
    ['0 1px 2px 3px 4px #000', /four lengths/],
    ['0 1em 2px #000', /only px/],
    ['0 1rem 2px #000', /only px/],
    ['0 50% 2px #000', /only px/],
    ['5 10 #000', /needs a unit/],
    ['0 1px 2px #000 #fff', /two colours/],
    ['inset inset 0 1px #000', /inset given twice/],
    ['0 1px 2px wibble', /not a colour/],
    ['#000', /at least an x and a y/],
    ['0 1px', /^$|/],
  ];
  for (const [input, pattern] of cases) {
    const result = parseShadow(input);
    if (input === '0 1px') {
      assert.ok(result.ok, 'two lengths is the legal minimum');
      continue;
    }
    assert.ok(!result.ok, `${input} should fail`);
    assert.match(result.error, pattern, input);
  }
  const second = parseShadow('0 1px 2px #000, 0 1em 2px #000');
  assert.ok(!second.ok);
  assert.equal(second.layer, 1, 'the index points at the offending layer');
});

test('too many layers is refused rather than silently truncated', () => {
  const many = Array.from({ length: MAX_LAYERS + 1 }, () => '0 1px 2px #000').join(', ');
  const result = parseShadow(many);
  assert.ok(!result.ok);
  assert.match(result.error, /more than 8 layers/);
  const exactly = Array.from({ length: MAX_LAYERS }, () => '0 1px 2px #000').join(', ');
  assert.ok(parseShadow(exactly).ok);
});

/* ── Elevation ────────────────────────────── */

test('an elevation stack has the layer count it was asked for', () => {
  for (const layers of [1, 2, 4, MAX_LAYERS]) {
    assert.equal(buildElevation({ ...DEFAULT_ELEVATION, layers }).length, layers);
  }
  assert.equal(buildElevation({ ...DEFAULT_ELEVATION, layers: 0 }).length, 1);
  assert.equal(buildElevation({ ...DEFAULT_ELEVATION, layers: 99 }).length, MAX_LAYERS);
});

test('the largest layer lands exactly at the distance, and offsets double', () => {
  const stack = buildElevation({ ...DEFAULT_ELEVATION, layers: 4, distance: 16 });
  assert.deepEqual(stack.map((s) => s.y), [2, 4, 8, 16]);
  assert.deepEqual(stack.map((s) => s.blur), [4, 8, 16, 32]);
  const single = buildElevation({ ...DEFAULT_ELEVATION, layers: 1, distance: 10 });
  assert.equal(single[0].y, 10);
});

test('the layer opacities sum to the total, whatever the layer count', () => {
  for (const layers of [1, 3, 5, 8]) {
    const stack = buildElevation({ ...DEFAULT_ELEVATION, layers, alpha: 0.3 });
    const sum = stack.reduce((n, s) => n + s.color.a, 0);
    near(sum, 0.3, 0.001, `${layers} layers`);
  }
});

test('opacity decays away from the object, and falloff controls how fast', () => {
  const slow = buildElevation({ ...DEFAULT_ELEVATION, layers: 4, falloff: 0.9 });
  const fast = buildElevation({ ...DEFAULT_ELEVATION, layers: 4, falloff: 0.3 });
  for (const stack of [slow, fast]) {
    for (let i = 1; i < stack.length; i += 1) {
      assert.ok(stack[i].color.a <= stack[i - 1].color.a, 'each layer fainter than the last');
    }
  }
  // A fast falloff concentrates the shadow in the tight layer.
  assert.ok(fast[0].color.a > slow[0].color.a);
  // Out-of-range falloff is bounded, not division by zero.
  assert.ok(buildElevation({ ...DEFAULT_ELEVATION, falloff: 0 }).every((s) => Number.isFinite(s.color.a)));
  assert.ok(buildElevation({ ...DEFAULT_ELEVATION, falloff: 5 }).every((s) => Number.isFinite(s.color.a)));
});

test('an elevation stack survives a round trip through the parser', () => {
  const stack = buildElevation(DEFAULT_ELEVATION);
  const result = parseShadow(formatShadow(stack));
  assert.ok(result.ok);
  assert.equal(result.layers.length, stack.length);
  stack.forEach((original, i) => {
    near(result.layers[i].y, original.y, 0.01);
    near(result.layers[i].blur, original.blur, 0.01);
    near(result.layers[i].color.a, original.color.a, 0.004, `alpha of layer ${i}`);
  });
});

test('composited opacity is what compositing gives, not the sum', () => {
  // Two layers at 0.5 leave a quarter of the background showing, so the stack
  // reads as 0.75 — not 1.0, which is what adding would claim.
  near(
    stackedOpacity([
      layer({ color: { r: 0, g: 0, b: 0, a: 0.5 } }),
      layer({ color: { r: 0, g: 0, b: 0, a: 0.5 } }),
    ]),
    0.75,
    1e-12
  );
  assert.equal(stackedOpacity([]), 0);
  assert.equal(stackedOpacity([layer({ color: { r: 0, g: 0, b: 0, a: 1 } })]), 1);
  assert.ok(stackedOpacity(buildElevation(DEFAULT_ELEVATION)) < DEFAULT_ELEVATION.alpha + 1e-9);
});

/* ── Radius ───────────────────────────────── */

test('corner collapsing follows the CSS rule at every arrangement', () => {
  const c = (v: [number, number, number, number]) => collapseCorners(v, 'px');
  assert.equal(c([8, 8, 8, 8]), '8px');
  // Two values: the first is top-left and bottom-right.
  assert.equal(c([8, 4, 8, 4]), '8px 4px');
  // Three: the fourth repeats the second.
  assert.equal(c([8, 4, 2, 4]), '8px 4px 2px');
  assert.equal(c([8, 4, 2, 1]), '8px 4px 2px 1px');
  // Not collapsible to two even though two pairs match — the pairs are wrong.
  assert.equal(c([8, 8, 4, 4]), '8px 8px 4px 4px');
  assert.equal(c([0, 0, 0, 0]), '0');
  assert.equal(c([0, 8, 0, 8]), '0 8px');
  assert.equal(collapseCorners([50, 50, 50, 50], '%'), '50%');
  assert.equal(collapseCorners([1.5, 1.5, 1.5, 1.5], 'rem'), '1.5rem');
});

test('an elliptical radius writes the slash form only when the halves differ', () => {
  const radius: Radius = { ...DEFAULT_RADIUS, elliptical: true };
  assert.equal(formatRadius(radius), '8px', 'equal halves collapse to one');
  assert.equal(
    formatRadius({ ...radius, tl2: 16, tr2: 16, br2: 16, bl2: 16 }),
    '8px / 16px'
  );
  assert.equal(
    formatRadius({ ...radius, tl: 20, tl2: 40 }),
    // [20, 8, 8, 8] collapses to three values, because the fourth repeats the
    // second — which is exactly the rule that is easy to get wrong by hand.
    '20px 8px 8px / 40px 8px 8px'
  );
  // Switching it off ignores the second set entirely.
  assert.equal(formatRadius({ ...radius, elliptical: false, tl2: 99 }), '8px');
});

/* ── Border ───────────────────────────────── */

test('the border shorthand is written, or is honestly `none`', () => {
  assert.equal(formatBorder(DEFAULT_BORDER), '1px solid rgb(26 23 20 / 0.13)');
  assert.equal(formatBorder({ ...DEFAULT_BORDER, enabled: false }), 'none');
  assert.equal(formatBorder({ ...DEFAULT_BORDER, style: 'none' }), 'none');
  assert.equal(formatBorder({ ...DEFAULT_BORDER, width: 0 }), 'none');
  assert.equal(formatBorder({ ...DEFAULT_BORDER, width: 2, style: 'dashed' }), '2px dashed rgb(26 23 20 / 0.13)');
});

/* ── The whole declaration ────────────────── */

test('the CSS block carries only the properties that are switched on', () => {
  const css = formatCss({
    layers: [layer()],
    radius: DEFAULT_RADIUS,
    border: DEFAULT_BORDER,
  });
  assert.deepEqual(css.split('\n'), [
    'border: 1px solid rgb(26 23 20 / 0.13);',
    'border-radius: 8px;',
    'box-shadow: 0 2px 4px rgb(0 0 0 / 0.2);',
  ]);

  const noBorder = formatCss({
    layers: [],
    radius: { ...DEFAULT_RADIUS, tl: 0, tr: 0, br: 0, bl: 0 },
    border: { ...DEFAULT_BORDER, enabled: false },
  });
  assert.deepEqual(noBorder.split('\n'), ['border-radius: 0;', 'box-shadow: none;']);
});

test('a multi-layer block breaks the shadow across lines', () => {
  const css = formatCss({
    layers: buildElevation(DEFAULT_ELEVATION),
    radius: DEFAULT_RADIUS,
    border: { ...DEFAULT_BORDER, enabled: false },
  });
  assert.ok(css.includes(',\n  '), 'four layers on one line is unreadable');
  // And the result is still parseable, which is the real test of the output.
  const value = css.slice(css.indexOf('box-shadow:') + 'box-shadow:'.length, -1);
  assert.ok(parseShadow(value).ok);
});
