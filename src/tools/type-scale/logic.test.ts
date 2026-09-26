import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  FLUID_DEFAULTS,
  MAX_STEPS,
  RATIOS,
  buildFluidScale,
  buildScale,
  fluidAt,
  formatFluid,
  lineHeightFor,
  renderCss,
  solveFluid,
  stepName,
  type Options,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance: number, what = '') =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what} expected ${expected} ± ${tolerance}, got ${actual}`
  );

/* ── Ratios ───────────────────────────────── */

test('the named ratios are the intervals they claim to be', () => {
  near(RATIOS['minor-second'], 1.0667, 1e-4);
  near(RATIOS['major-second'], 1.125, 1e-12);
  near(RATIOS['minor-third'], 1.2, 1e-12);
  near(RATIOS['major-third'], 1.25, 1e-12);
  near(RATIOS['perfect-fourth'], 1.3333, 1e-4);
  near(RATIOS['augmented-fourth'], 1.41421356, 1e-8);
  near(RATIOS['perfect-fifth'], 1.5, 1e-12);
  near(RATIOS.golden, 1.61803399, 1e-8);
  // A perfect fifth up twice is a major ninth, ratio 9/4 — the intervals
  // compose, which is the reason to use them.
  near(RATIOS['perfect-fifth'] ** 2, 2.25, 1e-12);
  // The augmented fourth doubles in exactly two steps.
  near(RATIOS['augmented-fourth'] ** 2, 2, 1e-12);
});

/* ── Step names ───────────────────────────── */

test('steps are named the way design systems name them', () => {
  assert.equal(stepName(0, true), 'base');
  assert.equal(stepName(1, true), 'lg');
  assert.equal(stepName(2, true), 'xl');
  assert.equal(stepName(3, true), '2xl');
  assert.equal(stepName(-1, true), 'sm');
  assert.equal(stepName(-2, true), 'xs');
  assert.equal(stepName(-3, true), '2xs');
  assert.equal(stepName(0, false), '0');
  assert.equal(stepName(4, false), '+4');
  assert.equal(stepName(-4, false), '-4');
  // Past the end of the name list it falls back to a number rather than
  // producing `undefined` as a custom-property name.
  assert.equal(stepName(40, true), '+40');
});

/* ── The scale, against hand arithmetic ───── */

test('a major-third scale from 16px is the sequence you can work out by hand', () => {
  const steps = buildScale({ ...DEFAULTS, rounding: 'none', up: 4, down: 2 });
  // 16 × 1.25^n for n = -2 … 4: 10.24, 12.8, 16, 20, 25, 31.25, 39.0625
  assert.deepEqual(
    steps.map((s) => s.px),
    [10.24, 12.8, 16, 20, 25, 31.25, 39.0625]
  );
  assert.deepEqual(steps.map((s) => s.name), ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl']);
  assert.deepEqual(steps.map((s) => s.step), [-2, -1, 0, 1, 2, 3, 4]);
  near(steps[2].rem, 1, 1e-12, 'the base is 1rem at a 16px root');
  near(steps[3].rem, 1.25, 1e-12);
  // `timesBase` is reported to three decimals, which is all a sanity check needs.
  near(steps[4].timesBase, 1.5625, 0.001);
});

test('rounding does what each mode says and nothing more', () => {
  const at = (rounding: Options['rounding']) =>
    buildScale({ ...DEFAULTS, rounding, up: 3, down: 1 }).map((s) => s.px);
  assert.deepEqual(at('none'), [12.8, 16, 20, 25, 31.25]);
  assert.deepEqual(at('quarter'), [12.75, 16, 20, 25, 31.25]);
  assert.deepEqual(at('half'), [13, 16, 20, 25, 31.5]);
  assert.deepEqual(at('whole'), [13, 16, 20, 25, 31]);
});

test('the step count is bounded and a zero-step scale is just the base', () => {
  assert.equal(buildScale({ ...DEFAULTS, up: 0, down: 0 }).length, 1);
  assert.equal(buildScale({ ...DEFAULTS, up: 0, down: 0 })[0].name, 'base');
  assert.equal(buildScale({ ...DEFAULTS, up: 99, down: 99 }).length, MAX_STEPS * 2 + 1);
  assert.equal(buildScale({ ...DEFAULTS, up: -5, down: -5 }).length, 1);
});

test('a ratio of 1 or less does not produce a decreasing or exploding scale', () => {
  const flat = buildScale({ ...DEFAULTS, ratio: 1, rounding: 'none' });
  assert.ok(flat.every((s) => s.px === DEFAULTS.base), 'ratio 1 is a flat scale');
  const guarded = buildScale({ ...DEFAULTS, ratio: 0, rounding: 'none' });
  assert.ok(guarded.every((s) => s.px === DEFAULTS.base), 'ratio 0 falls back to flat');
  assert.ok(guarded.every((s) => Number.isFinite(s.px)));
  const negative = buildScale({ ...DEFAULTS, ratio: -1.5, rounding: 'none' });
  assert.ok(negative.every((s) => s.px > 0), 'no negative font sizes');
});

test('sizes increase monotonically for any ratio above 1', () => {
  for (const ratio of Object.values(RATIOS)) {
    const steps = buildScale({ ...DEFAULTS, ratio, rounding: 'none', up: 6, down: 3 });
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(steps[i].px > steps[i - 1].px, `ratio ${ratio} at step ${i}`);
    }
  }
});

/* ── Line height ──────────────────────────── */

test('line height falls as size rises, because the leading is held constant', () => {
  const options = { ...DEFAULTS, leading: 10, minLineHeight: 1.05, maxLineHeight: 1.75 };
  // 16 + 10 = 26, so 26/16 = 1.625.
  near(lineHeightFor(16, options), 1.625, 1e-3);
  near(lineHeightFor(20, options), 1.5, 1e-3);
  near(lineHeightFor(40, options), 1.25, 1e-3);
  near(lineHeightFor(100, options), 1.1, 1e-3);
  // And the line box grows by exactly the leading, whatever the size.
  for (const size of [12, 16, 24, 48]) {
    near(size * lineHeightFor(size, { ...options, minLineHeight: 1, maxLineHeight: 5 }), size + 10, 0.05, `${size}px`);
  }
});

test('the line-height bounds hold at both extremes', () => {
  const options = { ...DEFAULTS, leading: 10, minLineHeight: 1.2, maxLineHeight: 1.6 };
  assert.equal(lineHeightFor(4, options), 1.6, 'tiny type is capped, not set at 3.5');
  assert.equal(lineHeightFor(400, options), 1.2, 'huge type does not set solid');
  assert.equal(lineHeightFor(0, options), 1.6, 'a zero size does not divide by zero');
  assert.equal(lineHeightFor(-10, options), 1.6);
});

test('a scale carries a line box that a baseline grid can be checked against', () => {
  const steps = buildScale({ ...DEFAULTS, rounding: 'whole', leading: 8, up: 2, down: 0 });
  for (const step of steps) {
    near(step.lineBoxPx, step.px * step.lineHeight, 0.01, step.name);
  }
});

/* ── The fluid line, against hand algebra ── */

test('solveFluid passes exactly through both of the points it was given', () => {
  // 16px at 320 and 20px at 1280, root 16. Slope is 4/960 px per px of
  // viewport, so the vw coefficient is 100 × 4/960 = 0.41667, and the
  // intercept is 16 − 320 × 4/960 = 14.6667px = 0.91667rem.
  const fluid = solveFluid(16, 20, 320, 1280, 16);
  near(fluid.vw, 0.4167, 1e-4, 'vw coefficient');
  near(fluid.interceptRem, 0.9167, 1e-4, 'intercept');
  near(fluid.minRem, 1, 1e-9);
  near(fluid.maxRem, 1.25, 1e-9);
  near(fluidAt(fluid, 320, 16), 16, 0.01, 'exact at the small viewport');
  near(fluidAt(fluid, 1280, 16), 20, 0.01, 'exact at the large viewport');
  near(fluidAt(fluid, 800, 16), 18, 0.02, 'and linear in between');
});

test('the clamp holds the size outside the two viewports', () => {
  const fluid = solveFluid(16, 24, 400, 1200, 16);
  near(fluidAt(fluid, 200, 16), 16, 0.01, 'below the range it holds the min');
  near(fluidAt(fluid, 4000, 16), 24, 0.01, 'above it holds the max');
  near(fluidAt(fluid, 400, 16), 16, 0.01);
  near(fluidAt(fluid, 1200, 16), 24, 0.01);
});

test('a negative intercept is written as a subtraction, which CSS needs', () => {
  // A steep step — small on mobile, much larger on desktop — puts the line's
  // zero-viewport value below zero. `calc(-1rem + 5vw)` is legal but
  // `Xrem - Yvw` spacing matters: CSS requires whitespace around the operator.
  const steep = solveFluid(16, 64, 360, 1280, 16);
  assert.ok(steep.interceptRem < 0, `expected a negative intercept, got ${steep.interceptRem}`);
  const css = formatFluid(steep);
  // The vw term leads, so the declaration never starts with a negative length.
  assert.match(css, /^clamp\([\d.]+rem, [\d.]+vw - [\d.]+rem, [\d.]+rem\)$/);
  near(fluidAt(steep, 360, 16), 16, 0.02);
  near(fluidAt(steep, 1280, 16), 64, 0.02);
});

test('a positive intercept is written as an addition', () => {
  const css = formatFluid(solveFluid(16, 20, 320, 1280, 16));
  assert.equal(css, 'clamp(1rem, 0.9167rem + 0.4167vw, 1.25rem)');
});

test('a degenerate viewport range collapses to a fixed size instead of dividing by zero', () => {
  for (const [minVw, maxVw] of [[600, 600], [1200, 400], [0, 0]]) {
    const fluid = solveFluid(16, 24, minVw, maxVw, 16);
    assert.equal(fluid.vw, 0, `${minVw}→${maxVw}`);
    assert.equal(formatFluid(fluid), '1rem');
    assert.ok(Number.isFinite(fluidAt(fluid, 800, 16)));
    near(fluidAt(fluid, 800, 16), 16, 1e-9);
  }
});

test('a size that shrinks as the viewport grows still clamps the right way round', () => {
  // Unusual but legal: min and max are assigned by value, not by argument
  // order, or clamp() would refuse to produce anything.
  const shrinking = solveFluid(24, 16, 360, 1280, 16);
  near(shrinking.minRem, 1, 1e-9);
  near(shrinking.maxRem, 1.5, 1e-9);
  assert.ok(shrinking.vw < 0);
  near(fluidAt(shrinking, 360, 16), 24, 0.02);
  near(fluidAt(shrinking, 1280, 16), 16, 0.02);
});

test('a non-16px root is honoured throughout', () => {
  const fluid = solveFluid(20, 30, 400, 1200, 10);
  near(fluid.minRem, 2, 1e-9);
  near(fluid.maxRem, 3, 1e-9);
  near(fluidAt(fluid, 400, 10), 20, 0.01);
  near(fluidAt(fluid, 1200, 10), 30, 0.01);
  const scale = buildScale({ ...DEFAULTS, rootPx: 10, rounding: 'none', up: 1, down: 0 });
  near(scale[0].rem, 1.6, 1e-9, '16px is 1.6rem at a 10px root');
});

/* ── The fluid scale ──────────────────────── */

test('the fluid scale pairs each step with the same step of the larger scale', () => {
  const steps = buildFluidScale(
    { ...DEFAULTS, rounding: 'none', up: 3, down: 1 },
    { ...FLUID_DEFAULTS, maxBase: 18, maxRatio: RATIOS['perfect-fourth'] }
  );
  assert.equal(steps.length, 5);
  // Small end: 16 × 1.25^n. Large end: 18 × (4/3)^n.
  near(steps[1].px, 16, 1e-9, 'base, small');
  near(steps[1].maxPx, 18, 1e-9, 'base, large');
  near(steps[2].px, 20, 1e-9);
  near(steps[2].maxPx, 24, 1e-9);
  for (const step of steps) {
    near(fluidAt(step.fluid, FLUID_DEFAULTS.minViewport, DEFAULTS.rootPx), step.px, 0.02, `${step.name} small`);
    near(fluidAt(step.fluid, FLUID_DEFAULTS.maxViewport, DEFAULTS.rootPx), step.maxPx, 0.02, `${step.name} large`);
    assert.equal(step.css, formatFluid(step.fluid));
  }
});

test('a flatter scale on the small end is the whole reason for two ratios', () => {
  const steps = buildFluidScale(
    { ...DEFAULTS, base: 16, ratio: RATIOS['major-second'], rounding: 'none', up: 4, down: 0 },
    { ...FLUID_DEFAULTS, maxBase: 16, maxRatio: RATIOS['perfect-fifth'] }
  );
  const top = steps[steps.length - 1];
  // Reported to four decimals, which is the `none` rounding mode's precision.
  near(top.px, 16 * 1.125 ** 4, 1e-4, 'phone heading stays sane');
  near(top.maxPx, 16 * 1.5 ** 4, 1e-4, 'desktop heading is much larger');
  assert.ok(top.maxPx / top.px > 3, 'the two ends differ by more than 3×');
  assert.ok(top.fluid.vw > 0);
});

/* ── Output ───────────────────────────────── */

test('the static output is custom properties in rem with line heights', () => {
  const steps = buildFluidScale({ ...DEFAULTS, up: 1, down: 1, rounding: 'whole' }, FLUID_DEFAULTS);
  const css = renderCss(steps, 'static');
  assert.deepEqual(css.split('\n'), [
    ':root {',
    '  --text-sm: 0.8125rem;',
    '  --text-sm-lh: 1.75;',
    '  --text-base: 1rem;',
    '  --text-base-lh: 1.625;',
    '  --text-lg: 1.25rem;',
    '  --text-lg-lh: 1.5;',
    '}',
  ]);
});

test('the fluid output uses clamp and the both output carries each separately', () => {
  const steps = buildFluidScale({ ...DEFAULTS, up: 0, down: 0 }, FLUID_DEFAULTS);
  const fluid = renderCss(steps, 'fluid');
  assert.match(fluid, /--text-base: clamp\(/);
  assert.ok(!fluid.includes('-fluid:'));

  const both = renderCss(steps, 'both');
  assert.match(both, /--text-base: [\d.]+rem;/);
  assert.match(both, /--text-base-fluid: clamp\(/);
  assert.match(both, /--text-base-lh: [\d.]+;/);
});

test('the Tailwind output is a @theme block, which is where v4 reads a scale', () => {
  const steps = buildFluidScale({ ...DEFAULTS, up: 1, down: 0 }, FLUID_DEFAULTS);
  const css = renderCss(steps, 'tailwind');
  assert.ok(css.startsWith('@theme {'));
  assert.ok(css.endsWith('}'));
  assert.match(css, /--text-base: clamp\(/);
  assert.match(css, /--text-base--line-height: [\d.]+;/);
  assert.match(css, /--text-lg--line-height: [\d.]+;/);
});

test('the prefix is sanitised into something that is a legal identifier', () => {
  const steps = buildFluidScale({ ...DEFAULTS, up: 0, down: 0 }, FLUID_DEFAULTS);
  assert.match(renderCss(steps, 'static', 'Body Text'), /--body-text-base:/);
  assert.match(renderCss(steps, 'static', '  --Font__2 '), /--font-2-base:/);
  assert.match(renderCss(steps, 'static', '字級'), /--step-base:/);
  assert.match(renderCss(steps, 'static', ''), /--step-base:/);
});

test('numbered steps produce legal property names too', () => {
  const steps = buildFluidScale({ ...DEFAULTS, up: 1, down: 1, namedSteps: false }, FLUID_DEFAULTS);
  const css = renderCss(steps, 'static');
  // A leading "+" or "-" is stripped, so +1 and -1 do not collide as "1".
  assert.match(css, /--text-0: /);
  assert.ok(css.includes('--text-1: '), css);
  assert.equal((css.match(/--text-1: /g) ?? []).length, 2, 'both ±1 land on the same name');
});
