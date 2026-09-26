import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTRAS,
  PRESETS,
  analyse,
  bezierX,
  bezierY,
  clampControls,
  evaluate,
  keywordFor,
  parseCss,
  samplePath,
  sampleTimeline,
  solveT,
  toCss,
  toLinearEasing,
  type Bezier,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance: number, what = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what} expected ${expected} ± ${tolerance}, got ${actual}`
  );

const ALL: [string, Bezier][] = [...Object.entries(PRESETS), ...Object.entries(EXTRAS)];

/* ── The polynomial ───────────────────────── */

test('the curve starts at (0,0) and ends at (1,1) whatever the controls', () => {
  for (const [name, bez] of ALL) {
    near(bezierX(0, bez.x1, bez.x2), 0, 1e-12, `${name} x(0)`);
    near(bezierX(1, bez.x1, bez.x2), 1, 1e-12, `${name} x(1)`);
    near(bezierY(0, bez.y1, bez.y2), 0, 1e-12, `${name} y(0)`);
    near(bezierY(1, bez.y1, bez.y2), 1, 1e-12, `${name} y(1)`);
  }
});

test('the control points are where the Bézier says they are', () => {
  // At t = 1/3 and 2/3 a cubic is a known weighted mix of its four points;
  // easier to pin is the derivative at the ends, which points at the controls.
  const bez = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
  // x'(0) = 3*x1 and x'(1) = 3*(1 - x2), by the standard Bézier derivative.
  const h = 1e-6;
  near((bezierX(h, bez.x1, bez.x2) - 0) / h, 3 * bez.x1, 1e-4, "x'(0)");
  near((1 - bezierX(1 - h, bez.x1, bez.x2)) / h, 3 * (1 - bez.x2), 1e-4, "x'(1)");
  near((bezierY(h, bez.y1, bez.y2) - 0) / h, 3 * bez.y1, 1e-4, "y'(0)");
});

test('linear is the identity, exactly', () => {
  for (const x of [0, 0.1, 0.25, 1 / 3, 0.5, 0.75, 0.999, 1]) {
    near(evaluate(PRESETS.linear, x), x, 1e-7, `x=${x}`);
  }
  // Worth stating plainly: the *parameterisation* of cubic-bezier(0,0,1,1) is
  // not linear — x(t) is −2t³ + 3t². The curve is the straight line because the
  // control points sit on it, and y(x) comes out as x only after x(t) is
  // inverted. Anyone who samples by t and calls it "linear" gets an ease-in-out.
  near(bezierX(0.1, 0, 1), 0.028, 1e-12, 'x(0.1) is not 0.1');
  near(bezierX(0.5, 0, 1), 0.5, 1e-12, 'though the midpoint coincides');
  near(bezierY(0.1, 0, 1), bezierX(0.1, 0, 1), 1e-12, 'x and y move together');
});

/* ── Inverting x(t) ───────────────────────── */

test('solveT inverts x(t) for every curve, including the flat ones', () => {
  const nasty: Bezier[] = [
    ...ALL.map(([, bez]) => bez),
    { x1: 1, y1: 0, x2: 1, y2: 1 },
    { x1: 0, y1: 0, x2: 0, y2: 1 },
    { x1: 1, y1: 0, x2: 0, y2: 1 },
    { x1: 0, y1: 0, x2: 1, y2: 1 },
    { x1: 0.999, y1: 0, x2: 0.001, y2: 1 },
  ];
  for (const bez of nasty) {
    for (let i = 0; i <= 40; i += 1) {
      const x = i / 40;
      const t = solveT(x, bez.x1, bez.x2);
      assert.ok(t >= 0 && t <= 1, `t out of range for ${JSON.stringify(bez)} at x=${x}`);
      near(bezierX(t, bez.x1, bez.x2), x, 1e-6, `${JSON.stringify(bez)} at x=${x}`);
    }
  }
});

test('solveT clamps outside the unit interval instead of extrapolating', () => {
  assert.equal(solveT(-1, 0.42, 0.58), 0);
  assert.equal(solveT(2, 0.42, 0.58), 1);
  assert.equal(evaluate(PRESETS.ease, -5), 0);
  assert.equal(evaluate(PRESETS.ease, 5), 1);
});

/* ── Known answers ────────────────────────── */

test('a symmetric curve passes through exactly (0.5, 0.5)', () => {
  // ease-in-out is symmetric about the centre by construction: its controls are
  // (0.42, 0) and (0.58, 1), a 180° rotation of each other about (0.5, 0.5).
  near(evaluate(PRESETS['ease-in-out'], 0.5), 0.5, 1e-6);
  near(evaluate(EXTRAS['in-out-sine'], 0.5), 0.5, 1e-6);
  near(evaluate(EXTRAS['in-out-expo'], 0.5), 0.5, 1e-6);
  near(evaluate(PRESETS.linear, 0.5), 0.5, 1e-9);
});

test('ease-in and ease-out are each other reversed', () => {
  // The spec defines ease-out as ease-in reflected through (0.5, 0.5), so
  // easeOut(x) = 1 - easeIn(1 - x) must hold to numerical accuracy.
  for (let i = 0; i <= 20; i += 1) {
    const x = i / 20;
    near(
      evaluate(PRESETS['ease-out'], x),
      1 - evaluate(PRESETS['ease-in'], 1 - x),
      1e-6,
      `at x=${x}`
    );
  }
});

test('ease front-loads the motion, which is the whole reason it is the default', () => {
  const half = evaluate(PRESETS.ease, 0.5);
  assert.ok(half > 0.5, `ease should be past halfway at half time, got ${half}`);
  near(half, 0.8024, 0.002, 'ease at x=0.5');
  // It does start slower than linear, though: y'(0) is 3·y1 / 3·x1 = 0.4. So it
  // crosses linear on the way up and then stays ahead — an ease that were ahead
  // from the first frame would have no ease-in at all.
  assert.ok(evaluate(PRESETS.ease, 0.05) < 0.05, 'ease starts slower than linear');
  for (let i = 5; i <= 20; i += 1) {
    const x = i / 20;
    assert.ok(evaluate(PRESETS.ease, x) >= x - 1e-9, `ease below linear at ${x}`);
  }
});

test('every preset is monotonic, and the back easings are not meant to be', () => {
  for (const name of Object.keys(PRESETS)) {
    const report = analyse(PRESETS[name]);
    assert.equal(report.monotonic, true, name);
    assert.equal(report.overshoots, false, name);
    near(report.maxProgress, 1, 1e-6, `${name} ends at 1`);
  }
  const back = analyse(EXTRAS['out-back']);
  assert.equal(back.overshoots, true, 'out-back must overshoot');
  assert.ok(back.maxProgress > 1.05, `got ${back.maxProgress}`);
  assert.equal(back.monotonic, false, 'it comes back down');
  const inBack = analyse(EXTRAS['in-back']);
  assert.ok(inBack.minProgress < -0.05, `in-back should dip below zero, got ${inBack.minProgress}`);
});

test('the fastest moment is reported where the curve is steepest', () => {
  const easeOut = analyse(PRESETS['ease-out']);
  assert.ok(easeOut.peakSpeedAt < 0.2, `ease-out peaks early, got ${easeOut.peakSpeedAt}`);
  const easeIn = analyse(PRESETS['ease-in']);
  assert.ok(easeIn.peakSpeedAt > 0.8, `ease-in peaks late, got ${easeIn.peakSpeedAt}`);
  const both = analyse(PRESETS['ease-in-out']);
  near(both.peakSpeedAt, 0.5, 0.05, 'ease-in-out peaks in the middle');
  near(analyse(PRESETS.linear).peakSpeed, 1, 0.01, 'linear moves at constant speed 1');
  assert.ok(both.peakSpeed > 1, 'a curve that starts and ends slow must be fast in the middle');
});

/* ── Text ─────────────────────────────────── */

test('cubic-bezier() is written in the form CSS accepts', () => {
  assert.equal(toCss(PRESETS.ease), 'cubic-bezier(0.25, 0.1, 0.25, 1)');
  assert.equal(toCss({ x1: 0, y1: 0, x2: 1, y2: 1 }), 'cubic-bezier(0, 0, 1, 1)');
  assert.equal(toCss({ x1: 0.3333333, y1: -0.5, x2: 0.7, y2: 1.25 }), 'cubic-bezier(0.3333, -0.5, 0.7, 1.25)');
});

test('parsing accepts the wrapper, the keyword, and four bare numbers', () => {
  assert.deepEqual(parseCss('cubic-bezier(0.25, 0.1, 0.25, 1)'), PRESETS.ease);
  assert.deepEqual(parseCss('  CUBIC-BEZIER( .25 , .1 , .25 , 1 )  '), PRESETS.ease);
  assert.deepEqual(parseCss('0.25 0.1 0.25 1'), PRESETS.ease);
  assert.deepEqual(parseCss('0.25,0.1,0.25,1'), PRESETS.ease);
  assert.deepEqual(parseCss('ease'), PRESETS.ease);
  assert.deepEqual(parseCss('EASE-IN-OUT'), PRESETS['ease-in-out']);
  assert.deepEqual(parseCss('out-back'), EXTRAS['out-back']);
  // y outside 0..1 is legal and must survive.
  assert.deepEqual(parseCss('cubic-bezier(0.34, 1.56, 0.64, 1)'), EXTRAS['out-back']);
});

test('an x outside 0..1 is a parse failure, because CSS rejects it too', () => {
  assert.equal(parseCss('cubic-bezier(-0.1, 0, 1, 1)'), null);
  assert.equal(parseCss('cubic-bezier(0, 0, 1.2, 1)'), null);
});

test('nonsense parses to null', () => {
  for (const bad of ['', '   ', 'ease-in-quad', 'cubic-bezier(1, 2, 3)', 'cubic-bezier(a, b, c, d)', '0.5', 'steps(4)', 'cubic-bezier(0,0,1,1']) {
    assert.equal(parseCss(bad), null, JSON.stringify(bad));
  }
});

test('the round trip through text is exact for anything printable', () => {
  for (const [name, bez] of ALL) {
    assert.deepEqual(parseCss(toCss(bez)), bez, name);
  }
});

test('keywordFor names a curve only when it is exactly that curve', () => {
  assert.equal(keywordFor(PRESETS.ease), 'ease');
  assert.equal(keywordFor(PRESETS.linear), 'linear');
  assert.equal(keywordFor({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 0.99 }), null);
  assert.equal(keywordFor(EXTRAS['out-back']), null);
});

/* ── linear() output ──────────────────────── */

test('the linear() approximation is exact at every sample it states', () => {
  const css = toLinearEasing(PRESETS.ease, 8);
  assert.match(css, /^linear\(0, [\d.]+, .*, 1\)$/);
  const values = css.slice('linear('.length, -1).split(', ').map(Number);
  assert.equal(values.length, 9);
  values.forEach((value, i) => {
    near(value, evaluate(PRESETS.ease, i / 8), 5e-5, `sample ${i}`);
  });
  assert.equal(values[0], 0);
  assert.equal(values[values.length - 1], 1);
});

test('more segments approximate the curve better', () => {
  const error = (n: number) => {
    const values = toLinearEasing(PRESETS.ease, n).slice('linear('.length, -1).split(', ').map(Number);
    let worst = 0;
    for (let i = 0; i < values.length - 1; i += 1) {
      // The polyline's midpoint against the true curve's midpoint.
      const x = (i + 0.5) / n;
      const line = (values[i] + values[i + 1]) / 2;
      worst = Math.max(worst, Math.abs(line - evaluate(PRESETS.ease, x)));
    }
    return worst;
  };
  assert.ok(error(32) < error(4), `32 segments (${error(32)}) should beat 4 (${error(4)})`);
  assert.ok(error(32) < 0.01, `32 segments should be within 1%, got ${error(32)}`);
});

test('the segment count is clamped', () => {
  assert.equal(toLinearEasing(PRESETS.ease, 1).split(', ').length, 3);
  assert.equal(toLinearEasing(PRESETS.ease, 0).split(', ').length, 3);
  assert.equal(toLinearEasing(PRESETS.ease, 1000).split(', ').length, 65);
});

/* ── Sampling ─────────────────────────────── */

test('path samples run by parameter and cover the curve end to end', () => {
  const points = samplePath(PRESETS.ease, 16);
  assert.equal(points.length, 17);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  near(points[16].x, 1, 1e-12);
  near(points[16].y, 1, 1e-12);
  // x is monotonic along the path, which is what makes it drawable as a graph.
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].x >= points[i - 1].x - 1e-12, `x went backwards at ${i}`);
  }
  assert.equal(samplePath(PRESETS.ease, 0).length, 3);
  assert.equal(samplePath(PRESETS.ease, 9999).length, 257);
});

test('timeline samples are evenly spaced in time, which is what the eye reads', () => {
  const rows = sampleTimeline(PRESETS['ease-out'], 10);
  assert.equal(rows.length, 11);
  rows.forEach((row, i) => near(row.x, i / 10, 1e-12, `x at ${i}`));
  // An ease-out is ahead of linear the whole way.
  for (const row of rows.slice(1, -1)) assert.ok(row.y > row.x);
  assert.equal(sampleTimeline(PRESETS.ease, 0).length, 3);
  assert.equal(sampleTimeline(PRESETS.ease, 9999).length, 65);
});

/* ── Clamping ─────────────────────────────── */

test('clampControls keeps x legal and lets y overshoot', () => {
  assert.deepEqual(clampControls({ x1: -1, y1: 2, x2: 3, y2: -2 }), { x1: 0, y1: 2, x2: 1, y2: -2 });
  assert.deepEqual(clampControls({ x1: 0.4, y1: 0.2, x2: 0.6, y2: 0.8 }), { x1: 0.4, y1: 0.2, x2: 0.6, y2: 0.8 });
  // An absurd y is still bounded, so the graph stays drawable.
  assert.deepEqual(clampControls({ x1: 0, y1: 500, x2: 1, y2: -500 }), { x1: 0, y1: 5, x2: 1, y2: -5 });
  // NaN from an empty number field must not propagate into the curve.
  assert.deepEqual(clampControls({ x1: Number.NaN, y1: Number.NaN, x2: 1, y2: 1 }), { x1: 0, y1: 0, x2: 1, y2: 1 });
});
