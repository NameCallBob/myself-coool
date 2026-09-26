/**
 * CSS gradients, interpolated where they should be.
 *
 * A gradient from blue to yellow in sRGB passes through grey. That is not a
 * rendering bug, it is what averaging the channels does: the midpoint of
 * #0000ff and #ffff00 is #808080, because red and green meet in the middle and
 * so do blue and its absence. Chroma collapses in the middle of any pair of
 * roughly opposite hues. Interpolating in OKLCH instead moves along the hue
 * circle at roughly constant chroma, so the middle stays a colour.
 *
 * The other half of the work is the midpoint hint. `linear-gradient(red, 30%,
 * blue)` is not "a stop at 30%" — it reweights the whole transition so that the
 * 50/50 mix lands at 30%, with an exponent of ln(0.5)/ln(0.3). That formula is
 * from CSS Images 3 §3.4.2 and it is reproduced here so the preview matches
 * what the browser will draw.
 *
 * Colour maths is per-tool by design: one folder, three files, its own chunk.
 */

export type Rgb = { r: number; g: number; b: number };
export type Lch = { l: number; c: number; h: number };
export type Lab = { l: number; a: number; b: number };

/* ── sRGB ↔ OKLab ─────────────────────────── */

function srgbToLinear(c: number): number {
  const sign = c < 0 ? -1 : 1;
  const x = Math.abs(c);
  return x <= 0.04045 ? c / 12.92 : sign * ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const sign = c < 0 ? -1 : 1;
  const x = Math.abs(c);
  return x <= 0.0031308 ? c * 12.92 : sign * (1.055 * x ** (1 / 2.4) - 0.055);
}

export function rgbToOklab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const lp = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mp = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sp = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp,
    a: 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp,
    b: 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp,
  };
}

export function oklabToRgb(lab: Lab): Rgb {
  const lp = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const mp = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const sp = (lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp),
    g: linearToSrgb(-1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp),
    b: linearToSrgb(-0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp),
  };
}

export function rgbToOklch(rgb: Rgb): Lch {
  const lab = rgbToOklab(rgb);
  const c = Math.hypot(lab.a, lab.b);
  if (c < 1e-7) return { l: lab.l, c: 0, h: 0 };
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h };
}

export function oklchToRgb(lch: Lch): Rgb {
  const rad = (lch.h * Math.PI) / 180;
  return oklabToRgb({ l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) });
}

export function inGamut(rgb: Rgb, epsilon = 1e-5): boolean {
  const ok = (v: number) => v >= -epsilon && v <= 1 + epsilon;
  return ok(rgb.r) && ok(rgb.g) && ok(rgb.b);
}

export function clip(rgb: Rgb): Rgb {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return { r: c(rgb.r), g: c(rgb.g), b: c(rgb.b) };
}

/** Hold L and h, bisect chroma until the colour exists. */
export function toGamut(lch: Lch): Rgb {
  const direct = oklchToRgb(lch);
  if (inGamut(direct)) return clip(direct);
  if (lch.l >= 1) return { r: 1, g: 1, b: 1 };
  if (lch.l <= 0) return { r: 0, g: 0, b: 0 };
  let lo = 0;
  let hi = lch.c;
  while (hi - lo > 0.0002) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ l: lch.l, c: mid, h: lch.h }))) lo = mid;
    else hi = mid;
  }
  return clip(oklchToRgb({ l: lch.l, c: lo, h: lch.h }));
}

export function toHex(rgb: Rgb): string {
  const hex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

/** hex, rgb(), hsl() and oklch(). The full CSS vocabulary is in H01. */
export function parseColor(input: string): Rgb | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;
  const hexOf = (raw: string): Rgb | null => {
    const h = raw.replace(/^#/, '');
    if (!/^[0-9a-f]+$/.test(h)) return null;
    const dup = (s: string) => Number.parseInt(s + s, 16);
    if (h.length === 3) return { r: dup(h[0]) / 255, g: dup(h[1]) / 255, b: dup(h[2]) / 255 };
    if (h.length === 6) {
      const at = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
      return { r: at(0), g: at(2), b: at(4) };
    }
    return null;
  };
  if (text === 'white') return { r: 1, g: 1, b: 1 };
  if (text === 'black') return { r: 0, g: 0, b: 0 };
  if (text.startsWith('#')) return hexOf(text);

  const fn = /^([a-z]+)\(([^()]*)\)$/.exec(text);
  if (!fn) return /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(text) ? hexOf(text) : null;
  const parts = fn[2].replace(/[,/]/g, ' ').trim().split(/\s+/).filter((s) => s !== '');
  if (parts.length < 3) return null;
  const num = (token: string, ref: number): number | null => {
    if (token === 'none') return 0;
    const v = token.endsWith('%') ? (Number(token.slice(0, -1)) / 100) * ref : Number(token);
    return Number.isFinite(v) ? v : null;
  };
  if (fn[1] === 'rgb' || fn[1] === 'rgba') {
    const v = parts.slice(0, 3).map((p) => num(p, 255));
    if (v.some((x) => x === null)) return null;
    const [r, g, b] = v as number[];
    return clip({ r: r / 255, g: g / 255, b: b / 255 });
  }
  if (fn[1] === 'hsl' || fn[1] === 'hsla') {
    const h = num(parts[0].replace(/deg$/, ''), 360);
    const s = num(parts[1], 100);
    const li = num(parts[2], 100);
    if (h === null || s === null || li === null) return null;
    const hue = ((h % 360) + 360) % 360;
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      const a = (s / 100) * Math.min(li / 100, 1 - li / 100);
      return li / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return { r: f(0), g: f(8), b: f(4) };
  }
  if (fn[1] === 'oklch') {
    const li = num(parts[0], 1);
    const c = num(parts[1], 0.4);
    const h = num(parts[2].replace(/deg$/, ''), 360);
    if (li === null || c === null || h === null) return null;
    return toGamut({ l: li, c, h });
  }
  return null;
}

/* ── Interpolation ────────────────────────── */

export type Space = 'oklch' | 'oklab' | 'srgb' | 'srgb-linear';
/** CSS Color 4 hue interpolation methods. */
export type HueArc = 'shorter' | 'longer' | 'increasing' | 'decreasing';

/**
 * Picks which way round the hue circle to travel.
 *
 * `shorter` is the default and almost always what you want; `longer` is how you
 * get a rainbow out of two stops. The spec defines all four by adjusting the
 * second angle relative to the first, which is what this returns.
 */
export function resolveHue(from: number, to: number, arc: HueArc): number {
  const a = ((from % 360) + 360) % 360;
  let b = ((to % 360) + 360) % 360;
  const delta = b - a;
  switch (arc) {
    case 'shorter':
      if (delta > 180) b -= 360;
      else if (delta < -180) b += 360;
      return b;
    case 'longer':
      if (delta > 0 && delta < 180) b -= 360;
      else if (delta > -180 && delta <= 0) b += 360;
      return b;
    case 'increasing':
      if (delta < 0) b += 360;
      return b;
    case 'decreasing':
      if (delta > 0) b -= 360;
      return b;
  }
}

/**
 * CSS Images 3 §3.4.2: a colour hint at fraction `midpoint` of a segment
 * reweights the whole segment so the 50/50 mix lands there.
 */
export function applyMidpoint(t: number, midpoint: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // The exponent is undefined at 0 and 1, so the usable range is bounded here
  // rather than left to produce an Infinity somewhere downstream.
  const m = Number.isFinite(midpoint) ? Math.min(0.999, Math.max(0.001, midpoint)) : 0.5;
  if (Math.abs(m - 0.5) < 1e-9) return t;
  return t ** (Math.log(0.5) / Math.log(m));
}

/**
 * Two colours mixed at `t`, in the space asked for.
 *
 * In OKLCH a stop with zero chroma has no meaningful hue, so it borrows the
 * other stop's — otherwise fading a colour to white would swing through a hue
 * the designer never chose, because atan2(0, 0) is 0 and 0 is red.
 */
export function mix(from: Rgb, to: Rgb, t: number, space: Space, arc: HueArc): Rgb {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  if (space === 'srgb') {
    return { r: lerp(from.r, to.r), g: lerp(from.g, to.g), b: lerp(from.b, to.b) };
  }
  if (space === 'srgb-linear') {
    return {
      r: linearToSrgb(lerp(srgbToLinear(from.r), srgbToLinear(to.r))),
      g: linearToSrgb(lerp(srgbToLinear(from.g), srgbToLinear(to.g))),
      b: linearToSrgb(lerp(srgbToLinear(from.b), srgbToLinear(to.b))),
    };
  }
  if (space === 'oklab') {
    const a = rgbToOklab(from);
    const b = rgbToOklab(to);
    return toGamutFromLab({ l: lerp(a.l, b.l), a: lerp(a.a, b.a), b: lerp(a.b, b.b) });
  }
  const a = rgbToOklch(from);
  const b = rgbToOklch(to);
  const hueA = a.c < 1e-6 ? b.h : a.h;
  const hueB = b.c < 1e-6 ? hueA : resolveHue(hueA, b.h, arc);
  return toGamut({ l: lerp(a.l, b.l), c: lerp(a.c, b.c), h: lerp(hueA, hueB) });
}

function toGamutFromLab(lab: Lab): Rgb {
  const direct = oklabToRgb(lab);
  if (inGamut(direct)) return clip(direct);
  const c = Math.hypot(lab.a, lab.b);
  if (c < 1e-9) return clip(direct);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return toGamut({ l: lab.l, c, h });
}

/* ── Gradients ────────────────────────────── */

export type Stop = {
  color: Rgb;
  /** Percent along the gradient line, 0..100. */
  position: number;
  /** Where the 50/50 mix of this stop and the next one lands, 0..1 exclusive. */
  midpoint: number;
};

export type Kind = 'linear' | 'radial';

export type Gradient = {
  kind: Kind;
  /** Degrees, CSS convention: 0 points up, 90 points right. */
  angle: number;
  /** Radial only. */
  shape: 'circle' | 'ellipse';
  /** Radial centre, percent. */
  cx: number;
  cy: number;
  space: Space;
  arc: HueArc;
  stops: Stop[];
};

export const MAX_STOPS = 8;

export function defaultGradient(): Gradient {
  return {
    kind: 'linear',
    angle: 90,
    shape: 'circle',
    cx: 50,
    cy: 50,
    space: 'oklch',
    arc: 'shorter',
    // Blue to yellow: the pair that shows the grey middle most clearly.
    stops: [
      { color: { r: 0.2, g: 0.4, b: 0.8 }, position: 0, midpoint: 0.5 },
      { color: { r: 0.95, g: 0.85, b: 0.2 }, position: 100, midpoint: 0.5 },
    ],
  };
}

/** Sorted, clamped, and guaranteed to have at least two usable stops. */
export function normalize(stops: readonly Stop[]): Stop[] {
  const clean = stops
    .map((stop) => ({
      color: clip(stop.color),
      position: Math.min(100, Math.max(0, stop.position)),
      midpoint: Math.min(0.98, Math.max(0.02, stop.midpoint)),
    }))
    .sort((a, b) => a.position - b.position);
  if (clean.length === 0) return normalize(defaultGradient().stops);
  if (clean.length === 1) return [{ ...clean[0], position: 0 }, { ...clean[0], position: 100 }];
  return clean;
}

/**
 * The colour at `percent` along the gradient line.
 *
 * Before the first stop and after the last one the colour is held flat, which
 * is what CSS does — a gradient does not extrapolate.
 */
export function sample(gradient: Gradient, percent: number): Rgb {
  const stops = normalize(gradient.stops);
  const p = Math.min(100, Math.max(0, percent));
  if (p <= stops[0].position) return stops[0].color;
  const last = stops[stops.length - 1];
  if (p >= last.position) return last.color;

  // The first segment that ends strictly after p. Scanning for "ends after"
  // rather than "contains" is what makes two stops at the same position a hard
  // edge: at exactly that position the later stop wins, as CSS renders it.
  for (let i = 0; i < stops.length - 1; i += 1) {
    const to = stops[i + 1];
    if (to.position <= p) continue;
    const from = stops[i];
    const raw = (p - from.position) / (to.position - from.position);
    return mix(from.color, to.color, applyMidpoint(raw, from.midpoint), gradient.space, gradient.arc);
  }
  return last.color;
}

/**
 * Uniform sRGB stops that reproduce the gradient anywhere.
 *
 * This is both the fallback for browsers without `in oklch` and what the
 * preview uses — a preview drawn with the modern syntax would show OKLCH
 * interpolation only in browsers that already do it, which is the one case
 * where you do not need to be shown.
 */
export function resample(gradient: Gradient, count: number): Stop[] {
  const stops = normalize(gradient.stops);
  const first = stops[0].position;
  const last = stops[stops.length - 1].position;
  const n = Math.max(2, Math.min(64, Math.round(count)));
  if (last - first <= 0) return [stops[0], { ...stops[stops.length - 1] }];
  const out: Stop[] = [];
  for (let i = 0; i < n; i += 1) {
    const position = first + ((last - first) * i) / (n - 1);
    out.push({ color: sample(gradient, position), position, midpoint: 0.5 });
  }
  return out;
}

/* ── CSS output ───────────────────────────── */

/** Two decimals, with trailing zeros dropped: `50%` not `50.00%`. */
const round = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

function stopList(stops: readonly Stop[], withHints: boolean): string {
  const parts: string[] = [];
  stops.forEach((stop, i) => {
    parts.push(`${toHex(stop.color)} ${round(stop.position)}%`);
    const next = stops[i + 1];
    if (!withHints || !next) return;
    if (Math.abs(stop.midpoint - 0.5) < 1e-6) return;
    // A bare percentage between two colours is a CSS colour hint, which is
    // exactly the midpoint control — no extra colour stop needed.
    const hint = stop.position + (next.position - stop.position) * stop.midpoint;
    parts.push(`${round(hint)}%`);
  });
  return parts.join(', ');
}

function prelude(gradient: Gradient, space: Space | null): string {
  const method =
    space === null
      ? ''
      : space === 'oklch'
        ? ` in oklch${gradient.arc === 'shorter' ? '' : ` ${gradient.arc} hue`}`
        : ` in ${space}`;
  if (gradient.kind === 'linear') return `${round(gradient.angle)}deg${method}`;
  return `${gradient.shape} at ${round(gradient.cx)}% ${round(gradient.cy)}%${method}`;
}

/** The short, modern declaration: two stops and a named interpolation space. */
export function toCss(gradient: Gradient): string {
  const stops = normalize(gradient.stops);
  const fn = gradient.kind === 'linear' ? 'linear-gradient' : 'radial-gradient';
  return `${fn}(${prelude(gradient, gradient.space)}, ${stopList(stops, true)})`;
}

/** The same gradient as pre-computed sRGB stops, for everything else. */
export function toCssFallback(gradient: Gradient, count: number): string {
  const fn = gradient.kind === 'linear' ? 'linear-gradient' : 'radial-gradient';
  return `${fn}(${prelude(gradient, null)}, ${stopList(resample(gradient, count), false)})`;
}

/** Both forms as one declaration a browser can pick from. */
export function toCssBlock(gradient: Gradient, count: number, property = 'background'): string {
  return [
    `${property}: ${toCssFallback(gradient, count)};`,
    `@supports (background: linear-gradient(in oklch, red, blue)) {`,
    `  ${property}: ${toCss(gradient)};`,
    `}`,
  ].join('\n');
}

/* ── Measuring the middle ─────────────────── */

export type Comparison = {
  /** Lowest OKLCH chroma anywhere along the gradient, and where it happens. */
  minChroma: number;
  minChromaAt: number;
};

/**
 * How grey the greyest point of the gradient gets.
 *
 * This is the number that makes the case for OKLCH: the same two stops will
 * dip to near-zero chroma in sRGB and hold most of their chroma in OKLCH. 101
 * samples is enough to find the dip without pretending to more resolution than
 * a gradient bar has pixels.
 */
export function measureChroma(gradient: Gradient): Comparison {
  let minChroma = Infinity;
  let minChromaAt = 0;
  for (let i = 0; i <= 100; i += 1) {
    const c = rgbToOklch(sample(gradient, i)).c;
    if (c < minChroma) {
      minChroma = c;
      minChromaAt = i;
    }
  }
  return { minChroma, minChromaAt };
}
