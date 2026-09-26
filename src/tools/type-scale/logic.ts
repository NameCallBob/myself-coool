/**
 * A type scale, its line heights, and the fluid version of both.
 *
 * A scale is one multiplication repeated: each step is the previous size times
 * a ratio. The ratios worth using are the simple musical intervals, because
 * they are the ones whose successive sizes stay distinguishable without
 * drifting apart — a 1.067 scale needs eight steps to double, a 1.618 scale
 * needs two, and which you want depends on how many distinct sizes the design
 * actually has.
 *
 * Line height is the part most generators get wrong by making it a constant
 * multiplier. Leading is what the reader sees — the gap between one line's
 * descenders and the next line's ascenders — and a constant multiplier makes
 * that gap grow with the type, so a 48px heading at 1.5 gets 24px of air it
 * does not need. Holding the *leading* roughly constant instead gives a ratio
 * that falls as the size rises, which is what hand-set type does.
 *
 * The fluid part is a line, not a curve: `clamp(min, intercept + slope·vw, max)`
 * where the slope and intercept come from two (viewport, size) points. Solving
 * it is two lines of algebra and it is worth doing exactly, because the usual
 * hand-tuned `calc(1rem + 1vw)` hits neither of the sizes it was aiming at.
 */

export type RatioName =
  | 'minor-second'
  | 'major-second'
  | 'minor-third'
  | 'major-third'
  | 'perfect-fourth'
  | 'augmented-fourth'
  | 'perfect-fifth'
  | 'golden';

/**
 * The musical intervals, as the frequency ratios they are named after.
 * The augmented fourth is √2 and the golden ratio is (1+√5)/2 — both are
 * computed rather than typed, so they are exact.
 */
export const RATIOS: Record<RatioName, number> = {
  'minor-second': 16 / 15,
  'major-second': 9 / 8,
  'minor-third': 6 / 5,
  'major-third': 5 / 4,
  'perfect-fourth': 4 / 3,
  'augmented-fourth': Math.SQRT2,
  'perfect-fifth': 3 / 2,
  golden: (1 + Math.sqrt(5)) / 2,
};

export type Rounding = 'none' | 'quarter' | 'half' | 'whole';

export type Options = {
  /** Body size in px at the smaller viewport. */
  base: number;
  ratio: number;
  /** How many steps above and below the base. */
  up: number;
  down: number;
  rounding: Rounding;
  /** Extra space added to every line, in px. Held constant across the scale. */
  leading: number;
  /** Bounds on the resulting ratio, so neither end becomes unreadable. */
  minLineHeight: number;
  maxLineHeight: number;
  /** Root font size, for converting px to rem. */
  rootPx: number;
  /** Name the steps sm/base/lg/xl, or number them. */
  namedSteps: boolean;
};

export const DEFAULTS: Options = {
  base: 16,
  ratio: RATIOS['major-third'],
  up: 5,
  down: 2,
  rounding: 'half',
  leading: 10,
  minLineHeight: 1.05,
  maxLineHeight: 1.75,
  rootPx: 16,
  namedSteps: true,
};

export const MAX_STEPS = 12;

function roundTo(value: number, rounding: Rounding): number {
  switch (rounding) {
    case 'whole':
      return Math.round(value);
    case 'half':
      return Math.round(value * 2) / 2;
    case 'quarter':
      return Math.round(value * 4) / 4;
    case 'none':
      return Number(value.toFixed(4));
  }
}

const UP_NAMES = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl', '10xl', '11xl'];
const DOWN_NAMES = ['sm', 'xs', '2xs', '3xs', '4xs', '5xs', '6xs', '7xs', '8xs', '9xs', '10xs', '11xs'];

/** `base`, `lg`, `2xl`, `sm` … or a signed step number. */
export function stepName(step: number, named: boolean): string {
  if (!named) return step === 0 ? '0' : step > 0 ? `+${step}` : String(step);
  if (step === 0) return 'base';
  const list = step > 0 ? UP_NAMES : DOWN_NAMES;
  return list[Math.abs(step) - 1] ?? `${step > 0 ? '+' : ''}${step}`;
}

/**
 * Line height as a ratio, derived from a constant leading.
 *
 * `size + leading` is the line box a typesetter would set; dividing back out
 * gives the CSS unitless number. The clamp at both ends matters: at very large
 * sizes the formula tends to 1.0, which sets solid, and at very small sizes it
 * would ask for 2.5, which reads as a list rather than a paragraph.
 */
export function lineHeightFor(size: number, options: Options): number {
  if (size <= 0) return options.maxLineHeight;
  const raw = (size + options.leading) / size;
  const bounded = Math.min(options.maxLineHeight, Math.max(options.minLineHeight, raw));
  return Number(bounded.toFixed(3));
}

export type Step = {
  step: number;
  name: string;
  px: number;
  rem: number;
  lineHeight: number;
  /** The line box in px, which is what a baseline grid is checked against. */
  lineBoxPx: number;
  /** Size relative to the base, for sanity-checking the ratio. */
  timesBase: number;
};

/** Smallest step first, which is the order a scale is read in a stylesheet. */
export function buildScale(options: Options): Step[] {
  const up = Math.max(0, Math.min(MAX_STEPS, Math.round(options.up)));
  const down = Math.max(0, Math.min(MAX_STEPS, Math.round(options.down)));
  const ratio = options.ratio > 0 ? options.ratio : 1;
  const out: Step[] = [];

  for (let step = -down; step <= up; step += 1) {
    const px = roundTo(options.base * ratio ** step, options.rounding);
    const lineHeight = lineHeightFor(px, options);
    out.push({
      step,
      name: stepName(step, options.namedSteps),
      px,
      rem: Number((px / options.rootPx).toFixed(4)),
      lineHeight,
      lineBoxPx: Number((px * lineHeight).toFixed(2)),
      timesBase: Number((px / options.base).toFixed(3)),
    });
  }
  return out;
}

/* ── The fluid half ───────────────────────── */

export type FluidOptions = {
  /** Viewport width, in px, at which the small scale is exact. */
  minViewport: number;
  /** Viewport width at which the large scale is exact. */
  maxViewport: number;
  /** Options for the small end. The large end reuses them with these two. */
  maxBase: number;
  maxRatio: number;
};

export const FLUID_DEFAULTS: FluidOptions = {
  minViewport: 360,
  maxViewport: 1280,
  maxBase: 18,
  maxRatio: RATIOS['perfect-fourth'],
};

export type Fluid = {
  minRem: number;
  maxRem: number;
  /** The `Xrem` term: the size the line would have at a viewport of zero. */
  interceptRem: number;
  /** The `Xvw` term. */
  vw: number;
};

/**
 * The exact line through two (viewport, size) points.
 *
 * `1vw` is a hundredth of the viewport, so a slope in px-per-px of viewport
 * becomes a vw coefficient by multiplying by 100. The intercept is then
 * whatever makes the line pass through the first point, which is generally not
 * a round number — and rounding it is how a hand-written `calc(1rem + 1vw)`
 * ends up missing both of its targets.
 */
export function solveFluid(
  minSize: number,
  maxSize: number,
  minViewport: number,
  maxViewport: number,
  rootPx: number
): Fluid {
  const span = maxViewport - minViewport;
  // A zero or negative span has no line through it; hold the smaller size.
  if (!(span > 0) || rootPx <= 0) {
    return {
      minRem: Number((minSize / Math.max(1, rootPx)).toFixed(4)),
      maxRem: Number((minSize / Math.max(1, rootPx)).toFixed(4)),
      interceptRem: Number((minSize / Math.max(1, rootPx)).toFixed(4)),
      vw: 0,
    };
  }
  const slope = (maxSize - minSize) / span;
  const interceptPx = minSize - slope * minViewport;
  return {
    minRem: Number((Math.min(minSize, maxSize) / rootPx).toFixed(4)),
    maxRem: Number((Math.max(minSize, maxSize) / rootPx).toFixed(4)),
    interceptRem: Number((interceptPx / rootPx).toFixed(4)),
    vw: Number((slope * 100).toFixed(4)),
  };
}

/**
 * The clamp() declaration, with the signs where CSS wants them.
 *
 * A steep scale — small on a phone, much larger on a desktop — has a negative
 * intercept, and `clamp(1rem, -0.17rem + 5.2vw, 4rem)` leads with a negative
 * dimension. Putting the positive term first avoids that entirely, so the
 * expression is written `5.2vw - 0.17rem`. The whitespace around the operator
 * is not decoration either: CSS maths requires it, and `1rem+2vw` does not
 * parse.
 */
export function formatFluid(fluid: Fluid): string {
  if (fluid.vw === 0) return `${fluid.minRem}rem`;
  const rem = { value: fluid.interceptRem, unit: 'rem' };
  const vw = { value: fluid.vw, unit: 'vw' };
  // Whichever term is not negative leads. Both cannot be negative: the size at
  // the smaller viewport is intercept + slope·viewport, and that is positive.
  const lead = rem.value >= 0 ? rem : vw;
  const tail = lead === rem ? vw : rem;
  const operator = tail.value < 0 ? '-' : '+';
  const expression = `${lead.value}${lead.unit} ${operator} ${Math.abs(tail.value)}${tail.unit}`;
  return `clamp(${fluid.minRem}rem, ${expression}, ${fluid.maxRem}rem)`;
}

/**
 * What the browser will compute for a given viewport, in px.
 *
 * Exists so the formula can be tested against the sizes it was asked for
 * rather than against itself.
 */
export function fluidAt(fluid: Fluid, viewport: number, rootPx: number): number {
  const preferred = fluid.interceptRem * rootPx + (fluid.vw / 100) * viewport;
  return Math.min(fluid.maxRem * rootPx, Math.max(fluid.minRem * rootPx, preferred));
}

export type FluidStep = Step & {
  /** The same step computed at the larger viewport. */
  maxPx: number;
  fluid: Fluid;
  css: string;
};

/**
 * Pairs each step of the small scale with the matching step of the large one.
 *
 * The two scales can use different ratios, which is the point: a phone wants a
 * flatter scale than a desktop, because on a small screen a 3× heading is not a
 * heading, it is an obstacle.
 */
export function buildFluidScale(options: Options, fluid: FluidOptions): FluidStep[] {
  const small = buildScale(options);
  const large = buildScale({ ...options, base: fluid.maxBase, ratio: fluid.maxRatio });
  return small.map((step, index) => {
    const maxPx = large[index]?.px ?? step.px;
    const solved = solveFluid(
      step.px,
      maxPx,
      fluid.minViewport,
      fluid.maxViewport,
      options.rootPx
    );
    return { ...step, maxPx, fluid: solved, css: formatFluid(solved) };
  });
}

/* ── Output ───────────────────────────────── */

export type Format = 'static' | 'fluid' | 'both' | 'tailwind';

function safeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'step' : cleaned;
}

export function renderCss(
  steps: readonly FluidStep[],
  format: Format,
  prefix = 'text'
): string {
  const slug = safeName(prefix);
  if (format === 'tailwind') {
    // Tailwind v4 reads its theme from CSS custom properties, so a type scale
    // is a @theme block and not a JavaScript config file any more.
    return [
      '@theme {',
      ...steps.map(
        (step) =>
          `  --${slug}-${safeName(step.name)}: ${step.css};\n  --${slug}-${safeName(step.name)}--line-height: ${step.lineHeight};`
      ),
      '}',
    ].join('\n');
  }
  const lines: string[] = [':root {'];
  for (const step of steps) {
    const key = `--${slug}-${safeName(step.name)}`;
    if (format === 'static' || format === 'both') lines.push(`  ${key}: ${step.rem}rem;`);
    if (format === 'fluid') lines.push(`  ${key}: ${step.css};`);
    if (format === 'both') lines.push(`  ${key}-fluid: ${step.css};`);
    lines.push(`  ${key}-lh: ${step.lineHeight};`);
  }
  lines.push('}');
  return lines.join('\n');
}
