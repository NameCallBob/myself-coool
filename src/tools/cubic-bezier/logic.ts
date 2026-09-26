/**
 * The easing curve CSS actually evaluates.
 *
 * `cubic-bezier(x1, y1, x2, y2)` is a curve from (0,0) to (1,1) with two
 * control points, and the browser needs y as a function of x — progress as a
 * function of time. A Bézier is parameterised by t, not by x, so there is no
 * formula for y(x): you have to invert x(t) first. This file does that the way
 * WebKit's UnitBezier does, with Newton's method and a bisection fallback for
 * the flat regions where the derivative is near zero and Newton wanders off.
 *
 * Both control points' x must sit in [0, 1] — outside it, x(t) stops being
 * monotonic and the curve would need time to run backwards. y has no such
 * limit, and y outside [0, 1] is how you get an overshoot.
 */

export type Bezier = { x1: number; y1: number; x2: number; y2: number };

/** Precomputed polynomial coefficients for one axis. */
type Axis = { a: number; b: number; c: number };

function axis(p1: number, p2: number): Axis {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  const a = 1 - c - b;
  return { a, b, c };
}

function at(k: Axis, t: number): number {
  return ((k.a * t + k.b) * t + k.c) * t;
}

function slope(k: Axis, t: number): number {
  return (3 * k.a * t + 2 * k.b) * t + k.c;
}

/** x at parameter t, for control x-coordinates x1 and x2. */
export function bezierX(t: number, x1: number, x2: number): number {
  return at(axis(x1, x2), t);
}

/** y at parameter t, for control y-coordinates y1 and y2. */
export function bezierY(t: number, y1: number, y2: number): number {
  return at(axis(y1, y2), t);
}

const NEWTON_ROUNDS = 8;
const EPSILON = 1e-7;
const BISECTION_ROUNDS = 60;

/**
 * The t whose x equals the given x.
 *
 * Newton converges in a couple of rounds over most of the curve, but a curve
 * like `cubic-bezier(1, 0, 1, 1)` is nearly flat in x near t = 0, and there
 * Newton's step is enormous and lands outside [0, 1]. So the derivative is
 * checked, and anything Newton cannot settle falls through to bisection, which
 * is slower and cannot fail — x(t) is monotonic for any x1, x2 in [0, 1].
 */
export function solveT(x: number, x1: number, x2: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const k = axis(x1, x2);

  let t = x;
  for (let i = 0; i < NEWTON_ROUNDS; i += 1) {
    const error = at(k, t) - x;
    if (Math.abs(error) < EPSILON) return t;
    const d = slope(k, t);
    if (Math.abs(d) < 1e-6) break;
    t -= error / d;
    if (t < 0 || t > 1) break;
  }

  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < BISECTION_ROUNDS; i += 1) {
    const value = at(k, t);
    if (Math.abs(value - x) < EPSILON) return t;
    if (value > x) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/** Progress at time fraction `x`, which is what an easing function means. */
export function evaluate(bezier: Bezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return bezierY(solveT(x, bezier.x1, bezier.x2), bezier.y1, bezier.y2);
}

/** x is clamped to the legal range; y is deliberately left alone, because a y
 *  outside 0..1 is a valid overshoot and not a mistake. */
export function clampControls(bezier: Bezier): Bezier {
  const unit = (v: number) => Math.min(1, Math.max(0, v));
  const sane = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    x1: unit(sane(bezier.x1)),
    y1: Math.min(5, Math.max(-5, sane(bezier.y1))),
    x2: unit(sane(bezier.x2)),
    y2: Math.min(5, Math.max(-5, sane(bezier.y2))),
  };
}

/* ── The CSS keywords ─────────────────────── */

/** The four keyword easings, with the values from the CSS Easing spec. */
export const PRESETS: Record<string, Bezier> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

/** Curves worth comparing against, with what each one is for. */
export const EXTRAS: Record<string, Bezier> = {
  'in-out-sine': { x1: 0.37, y1: 0, x2: 0.63, y2: 1 },
  'in-out-quad': { x1: 0.45, y1: 0, x2: 0.55, y2: 1 },
  'in-out-expo': { x1: 0.87, y1: 0, x2: 0.13, y2: 1 },
  'out-back': { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  'in-back': { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
};

/* ── Text in, text out ────────────────────── */

const trim = (n: number) => String(Number(n.toFixed(4)));

export function toCss(bezier: Bezier): string {
  return `cubic-bezier(${trim(bezier.x1)}, ${trim(bezier.y1)}, ${trim(bezier.x2)}, ${trim(bezier.y2)})`;
}

/** The keyword, when the curve is exactly one of them. */
export function keywordFor(bezier: Bezier): string | null {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (
      Math.abs(preset.x1 - bezier.x1) < 1e-9 &&
      Math.abs(preset.y1 - bezier.y1) < 1e-9 &&
      Math.abs(preset.x2 - bezier.x2) < 1e-9 &&
      Math.abs(preset.y2 - bezier.y2) < 1e-9
    ) {
      return name;
    }
  }
  return null;
}

/**
 * Reads `cubic-bezier(…)`, a keyword, or four bare numbers.
 *
 * Four bare numbers because that is what a design tool copies out, and typing
 * the wrapper again to paste it in is work the tool should do.
 */
export function parseCss(input: string): Bezier | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;
  if (PRESETS[text]) return { ...PRESETS[text] };
  if (EXTRAS[text]) return { ...EXTRAS[text] };

  const fn = /^cubic-bezier\(([^()]*)\)$/.exec(text);
  const body = fn ? fn[1] : text;
  const parts = body
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');
  if (parts.length !== 4) return null;
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  const [x1, y1, x2, y2] = values;
  // x outside 0..1 is not a legal cubic-bezier, so it is a parse failure and
  // not something to quietly clamp — the user typed something CSS will reject.
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return { x1, y1, x2, y2 };
}

/**
 * The same curve as a CSS `linear()` easing.
 *
 * `linear()` is a polyline, so this is a sampled approximation rather than a
 * translation — but it is the only way to express an easing in places that take
 * a stop list rather than a timing function, and it is exact at every sample.
 * Evenly spaced values need no percentages: `linear()` distributes them.
 */
export function toLinearEasing(bezier: Bezier, segments: number): string {
  const n = Math.max(2, Math.min(64, Math.round(segments)));
  const values: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    values.push(String(Number(evaluate(bezier, i / n).toFixed(4))));
  }
  return `linear(${values.join(', ')})`;
}

/* ── Sampling and analysis ────────────────── */

export type Point = { x: number; y: number };

/** Points along the curve by parameter, for drawing. Sampling by t rather than
 *  by x keeps the spacing even along the curve instead of along the axis. */
export function samplePath(bezier: Bezier, count: number): Point[] {
  const n = Math.max(2, Math.min(256, Math.round(count)));
  const out: Point[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push({ x: bezierX(t, bezier.x1, bezier.x2), y: bezierY(t, bezier.y1, bezier.y2) });
  }
  return out;
}

/** Progress at evenly spaced times — the rhythm, as numbers. */
export function sampleTimeline(bezier: Bezier, count: number): Point[] {
  const n = Math.max(2, Math.min(64, Math.round(count)));
  const out: Point[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = i / n;
    out.push({ x, y: evaluate(bezier, x) });
  }
  return out;
}

export type Analysis = {
  /** Progress at the halfway point in time. */
  midpoint: number;
  /** Highest and lowest progress the curve reaches. */
  maxProgress: number;
  minProgress: number;
  /** True when progress goes above 1 or below 0 — a deliberate overshoot. */
  overshoots: boolean;
  /** True when progress never goes backwards. A non-monotonic easing reverses
   *  mid-animation, which is occasionally wanted and usually a mistake. */
  monotonic: boolean;
  /** Steepest slope, and the time it happens at: where the motion is fastest. */
  peakSpeed: number;
  peakSpeedAt: number;
};

/**
 * Measures the curve at 200 samples in time.
 *
 * In time, not in parameter: what a viewer perceives is dy/dx, and an even
 * sweep of t bunches up wherever x(t) is flat, which is exactly where the
 * interesting slope is.
 */
export function analyse(bezier: Bezier): Analysis {
  const steps = 200;
  let maxProgress = 0;
  let minProgress = 0;
  let monotonic = true;
  let peakSpeed = 0;
  let peakSpeedAt = 0;
  let previous = 0;

  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const y = evaluate(bezier, x);
    if (y > maxProgress) maxProgress = y;
    if (y < minProgress) minProgress = y;
    if (i > 0) {
      if (y < previous - 1e-9) monotonic = false;
      const speed = (y - previous) * steps;
      if (speed > peakSpeed) {
        peakSpeed = speed;
        peakSpeedAt = x - 0.5 / steps;
      }
    }
    previous = y;
  }

  return {
    midpoint: evaluate(bezier, 0.5),
    maxProgress,
    minProgress,
    overshoots: maxProgress > 1 + 1e-6 || minProgress < -1e-6,
    monotonic,
    peakSpeed,
    peakSpeedAt,
  };
}
