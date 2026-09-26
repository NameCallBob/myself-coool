/**
 * Ramps and harmony sets, built in OKLCH.
 *
 * A ramp built by mixing towards white and black — the way HSL invites you to
 * do it — is not evenly spaced to the eye. HSL's L is a channel average, so
 * `hsl(60 100% 50%)` (a bright yellow) and `hsl(240 100% 50%)` (a dark blue)
 * claim the same lightness while differing by more than half the visible
 * range. Spacing a ramp on OKLCH's L instead gives steps that step evenly,
 * and holding the hue angle means step 900 is recognisably the same colour as
 * step 100 rather than drifting.
 *
 * The part that cannot be wished away is the gamut. sRGB holds far less
 * chroma near white and near black than it does in the middle, so a ramp with
 * constant chroma is not producible: the ends would clip, and clipping shifts
 * hue. So chroma is shaped down towards both ends and then every step is
 * checked against the real gamut boundary, which this file finds by bisection.
 *
 * Colour maths is per-tool by design — one folder, three files, its own chunk.
 */

export type Rgb = { r: number; g: number; b: number };
export type Lch = { l: number; c: number; h: number };

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

export function rgbToOklab(rgb: Rgb): { l: number; a: number; b: number } {
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

export function oklabToRgb(lab: { l: number; a: number; b: number }): Rgb {
  const lp = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mp = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sp = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const lc = lp ** 3;
  const mc = mp ** 3;
  const sc = sp ** 3;
  return {
    r: linearToSrgb(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    g: linearToSrgb(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    b: linearToSrgb(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
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

export function toHex(rgb: Rgb): string {
  const hex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

/**
 * The sRGB gamut boundary: the largest chroma this (L, h) can hold.
 *
 * There is no closed form — the boundary is the surface of a cube seen through
 * two nonlinear transforms — so this bisects. 0.5 is a safe upper bracket:
 * nothing in sRGB exceeds about 0.37 chroma in OKLCH.
 */
export function maxChromaFor(l: number, h: number, epsilon = 0.0002): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.5;
  while (hi - lo > epsilon) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Hold L and h, take chroma down until the colour exists. */
export function toGamut(lch: Lch): Rgb {
  const direct = oklchToRgb(lch);
  if (inGamut(direct)) return clip(direct);
  if (lch.l >= 1) return { r: 1, g: 1, b: 1 };
  if (lch.l <= 0) return { r: 0, g: 0, b: 0 };
  return clip(oklchToRgb({ l: lch.l, c: maxChromaFor(lch.l, lch.h), h: lch.h }));
}

/* ── Parsing, the short form ──────────────── */

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
    const v = token.endsWith('%') ? Number(token.slice(0, -1)) / 100 * ref : Number(token);
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

/* ── Ramps ────────────────────────────────── */

export type RampOptions = {
  /** How many steps, 2 to 24. */
  steps: number;
  /** OKLCH lightness of the lightest step, 0..1. */
  lightest: number;
  /** OKLCH lightness of the darkest step, 0..1. */
  darkest: number;
  /**
   * Fraction of the base chroma taken off at both ends of the ramp, 0..1.
   * 0 asks for constant chroma and lets the gamut do all the limiting; 1 makes
   * the lightest and darkest steps neutral grey. The shape between is
   * quadratic, so the middle of the ramp keeps the colour you picked.
   */
  chromaFalloff: number;
  /** Total degrees of hue rotation across the ramp, from the lightest step to
   *  the darkest. Positive rotates the dark end forward. */
  hueShift: number;
  /** Label the steps 50/100/…/950 instead of 1..n, when the count allows. */
  scaleNames: boolean;
};

export const DEFAULT_RAMP: RampOptions = {
  steps: 11,
  lightest: 0.97,
  darkest: 0.18,
  chromaFalloff: 0.55,
  hueShift: 0,
  scaleNames: true,
};

export const MAX_STEPS = 24;

export type Swatch = {
  name: string;
  rgb: Rgb;
  hex: string;
  oklch: Lch;
  /** True when the requested chroma did not fit and had to come down. */
  clamped: boolean;
  /** WCAG 2.2 ratio against white and against black, because that is the
   *  question you ask of every step in a UI ramp. */
  onWhite: number;
  onBlack: number;
};

/** Tailwind's numbering, which most design systems have converged on. */
const SCALE_11 = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

function stepName(index: number, total: number, useScale: boolean): string {
  if (useScale && total === 11) return SCALE_11[index];
  if (useScale && total === 10) return SCALE_11.slice(0, 10)[index];
  if (useScale && total === 9) return SCALE_11.slice(1, 10)[index];
  return String(index + 1);
}

function luminance(rgb: Rgb): number {
  const c = clip(rgb);
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * One swatch, with the requested chroma reduced to what the display holds.
 *
 * The direct value is tried first rather than always bisecting, because the
 * sRGB gamut is not star-shaped in OKLCH: at blue's hue the ray out from grey
 * leaves the cube around C 0.265 and only touches it again exactly at the
 * #0000ff vertex, C 0.313. Bisection finds the first crossing, which is the
 * right answer for a ramp — but it would also refuse to reproduce a primary
 * the user typed in. So an in-gamut request is honoured as it stands.
 */
function describe(name: string, l: number, h: number, wanted: number): Swatch {
  if (wanted > 0 && inGamut(oklchToRgb({ l, c: wanted, h }))) {
    const exact = clip(oklchToRgb({ l, c: wanted, h }));
    return {
      name,
      rgb: exact,
      hex: toHex(exact),
      oklch: { l, c: wanted, h },
      clamped: false,
      onWhite: contrastRatio(exact, { r: 1, g: 1, b: 1 }),
      onBlack: contrastRatio(exact, { r: 0, g: 0, b: 0 }),
    };
  }
  const ceiling = maxChromaFor(l, h);
  const c = Math.max(0, Math.min(wanted, ceiling));
  const rgb = clip(oklchToRgb({ l, c, h }));
  return {
    name,
    rgb,
    hex: toHex(rgb),
    oklch: { l, c, h },
    clamped: wanted - c > 0.001,
    onWhite: contrastRatio(rgb, { r: 1, g: 1, b: 1 }),
    onBlack: contrastRatio(rgb, { r: 0, g: 0, b: 0 }),
  };
}

/**
 * A ramp from one colour: even in OKLCH lightness, constant in hue apart from
 * any shift you ask for, and never claiming a chroma the display cannot hold.
 *
 * Runs light to dark, the order a design system lists them in.
 */
export function buildRamp(base: Rgb, options: RampOptions): Swatch[] {
  const steps = Math.max(2, Math.min(MAX_STEPS, Math.round(options.steps)));
  const top = Math.max(options.lightest, options.darkest);
  const bottom = Math.min(options.lightest, options.darkest);
  const baseLch = rgbToOklch(base);
  const out: Swatch[] = [];

  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const l = top + (bottom - top) * t;
    // Distance from the middle of the ramp, 0 at the centre and 1 at either
    // end — the shape chroma is tapered by.
    const fromMiddle = Math.abs(2 * t - 1);
    const falloff = Math.max(0, Math.min(1, options.chromaFalloff));
    const wanted = baseLch.c * (1 - falloff * fromMiddle ** 2);
    // Hue rotates from the light end to the dark end, so a warm→cool ramp is
    // one number rather than eleven hand-picked colours.
    const h = ((baseLch.h + options.hueShift * (t - 0.5)) % 360 + 360) % 360;
    out.push(describe(stepName(i, steps, options.scaleNames), l, h, wanted));
  }
  return out;
}

/**
 * The step of a ramp closest to the colour it grew from, so the UI can mark
 * where the input sits. Compared on OKLab distance, not on the label.
 */
export function anchorIndex(ramp: readonly Swatch[], base: Rgb): number {
  const target = rgbToOklab(base);
  let best = 0;
  let bestDistance = Infinity;
  ramp.forEach((swatch, index) => {
    const lab = rgbToOklab(swatch.rgb);
    const d = Math.hypot(lab.l - target.l, lab.a - target.a, lab.b - target.b);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}

/* ── Harmony ──────────────────────────────── */

export type HarmonyId =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split'
  | 'tetradic'
  | 'square';

/** Hue offsets in degrees, including 0 for the colour you started from. */
export const HARMONY_OFFSETS: Record<HarmonyId, number[]> = {
  complementary: [0, 180],
  analogous: [-30, 0, 30],
  triadic: [0, 120, 240],
  split: [0, 150, 210],
  tetradic: [0, 60, 180, 240],
  square: [0, 90, 180, 270],
};

/**
 * Rotates hue in OKLCH rather than in HSL.
 *
 * The difference is not cosmetic. An HSL rotation of 120° from a blue lands on
 * a yellow that is far lighter than the blue was, because HSL's hue circle is
 * not perceptually uniform; the set looks unbalanced and the fix is usually to
 * hand-adjust every swatch. Rotating in OKLCH holds lightness and chroma, so
 * the members of a set match in weight. Where a rotation asks for more chroma
 * than the display has at that hue, chroma comes down — noted per swatch.
 */
export function buildHarmony(base: Rgb, kind: HarmonyId): Swatch[] {
  const lch = rgbToOklch(base);
  return HARMONY_OFFSETS[kind].map((offset) => {
    const h = ((lch.h + offset) % 360 + 360) % 360;
    const name = `${offset >= 0 ? '+' : ''}${offset}°`;
    return describe(name, lch.l, h, lch.c);
  });
}

/* ── Output ───────────────────────────────── */

export type Format = 'css' | 'oklch' | 'hex' | 'json';

/** A CSS-safe identifier fragment from whatever the user typed as a name. */
export function slugify(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'colour' : cleaned;
}

export function render(swatches: readonly Swatch[], name: string, format: Format): string {
  const slug = slugify(name);
  switch (format) {
    case 'css':
      return [
        ':root {',
        ...swatches.map((s) => `  --${slug}-${slugify(s.name)}: ${s.hex};`),
        '}',
      ].join('\n');
    case 'oklch':
      return [
        ':root {',
        ...swatches.map(
          (s) =>
            `  --${slug}-${slugify(s.name)}: oklch(${s.oklch.l.toFixed(4)} ${s.oklch.c.toFixed(4)} ${s.oklch.h.toFixed(2)});`
        ),
        '}',
      ].join('\n');
    case 'hex':
      return swatches.map((s) => s.hex).join('\n');
    case 'json':
      return JSON.stringify(
        Object.fromEntries(swatches.map((s) => [s.name, s.hex])),
        null,
        2
      );
  }
}
