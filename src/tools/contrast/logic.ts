/**
 * Contrast, by both of the measures in use.
 *
 * WCAG 2.x contrast is a ratio of two relative luminances with a +0.05 flare
 * term. It is the number that is normative, it is what an audit will cite, and
 * it is also known to be wrong in places — it over-rewards dark backgrounds
 * and it treats a saturated blue as if it were as legible as a grey of the same
 * luminance. APCA is the replacement candidate: a perceptual estimate of
 * lightness *difference* rather than a ratio, with separate exponents for each
 * polarity because dark-on-light and light-on-dark do not behave the same way.
 *
 * Both are computed here. Neither is presented as the answer on its own:
 * WCAG is what you have to pass, APCA is what tells you whether passing it
 * actually helped.
 *
 * The colour maths is duplicated per tool on purpose — a tool is one folder of
 * three files, so its chunk carries only what it uses (see the author guide).
 */

export type Rgb = { r: number; g: number; b: number };
export type Lch = { l: number; c: number; h: number };
export type Color = { rgb: Rgb; alpha: number };

/* ── sRGB, OKLab, and just enough parsing ── */

export function srgbToLinear(c: number): number {
  const sign = c < 0 ? -1 : 1;
  const x = Math.abs(c);
  return x <= 0.04045 ? c / 12.92 : sign * ((x + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const sign = c < 0 ? -1 : 1;
  const x = Math.abs(c);
  return x <= 0.0031308 ? c * 12.92 : sign * (1.055 * x ** (1 / 2.4) - 0.055);
}

type M3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

function apply(m: M3, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

const LIN_TO_LMS: M3 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_OKLAB: M3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const OKLAB_TO_LMS: M3 = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LMS_TO_LIN: M3 = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

export function rgbToOklab(rgb: Rgb): { l: number; a: number; b: number } {
  const lms = apply(LIN_TO_LMS, [srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b)]);
  const [l, a, b] = apply(LMS_TO_OKLAB, [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])]);
  return { l, a, b };
}

export function oklabToRgb(lab: { l: number; a: number; b: number }): Rgb {
  const lms = apply(OKLAB_TO_LMS, [lab.l, lab.a, lab.b]);
  const [r, g, b] = apply(LMS_TO_LIN, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]);
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
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

export function deltaEOK(a: Rgb, b: Rgb): number {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

/** Hold lightness and hue, bisect chroma until it fits — CSS Color 4 §13.2,
 *  trimmed to what a suggestion engine needs. */
export function toGamut(lch: Lch): Rgb {
  const direct = oklchToRgb(lch);
  if (inGamut(direct)) return clip(direct);
  if (lch.l >= 1) return { r: 1, g: 1, b: 1 };
  if (lch.l <= 0) return { r: 0, g: 0, b: 0 };
  let min = 0;
  let max = lch.c;
  let best = clip(direct);
  while (max - min > 0.0002) {
    const c = (min + max) / 2;
    const candidate = oklchToRgb({ l: lch.l, c, h: lch.h });
    if (inGamut(candidate)) {
      min = c;
      best = clip(candidate);
    } else {
      max = c;
    }
  }
  return best;
}

export function toHex(rgb: Rgb): string {
  const hex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

const SHORT_NAMES: Record<string, string> = {
  black: '000000',
  white: 'ffffff',
  red: 'ff0000',
  lime: '00ff00',
  blue: '0000ff',
  grey: '808080',
  gray: '808080',
  silver: 'c0c0c0',
};

/** hex, rgb(), hsl(), oklch(), oklab(), and a few names. The full CSS colour
 *  vocabulary lives in H01; this reads what people paste into a contrast check. */
export function parseColor(input: string): Color | null {
  const text = input.trim();
  if (text === '') return null;
  const lower = text.toLowerCase();
  if (lower === 'transparent') return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };

  const hexOf = (raw: string): Color | null => {
    const h = raw.replace(/^#/, '');
    if (!/^[0-9a-f]+$/i.test(h)) return null;
    const dup = (s: string) => Number.parseInt(s + s, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        rgb: { r: dup(h[0]) / 255, g: dup(h[1]) / 255, b: dup(h[2]) / 255 },
        alpha: h.length === 4 ? dup(h[3]) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      const at = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
      return { rgb: { r: at(0), g: at(2), b: at(4) }, alpha: h.length === 8 ? at(6) : 1 };
    }
    return null;
  };

  if (SHORT_NAMES[lower]) return hexOf(SHORT_NAMES[lower]);
  if (text.startsWith('#')) return hexOf(text);

  const fn = /^([a-z]+)\(([^()]*)\)$/.exec(lower);
  if (!fn) return /^[0-9a-f]{3,8}$/i.test(text) ? hexOf(text) : null;

  const [, name, inner] = fn;
  const slash = inner.indexOf('/');
  const head = slash === -1 ? inner : inner.slice(0, slash);
  let alphaToken = slash === -1 ? undefined : inner.slice(slash + 1).trim();
  const parts = head.replace(/,/g, ' ').trim().split(/\s+/).filter((s) => s !== '');
  if (alphaToken === undefined && parts.length === 4) alphaToken = parts.pop();
  if (parts.length !== 3) return null;

  const num = (token: string, ref: number): number | null => {
    if (token === 'none') return 0;
    if (token.endsWith('%')) {
      const v = Number(token.slice(0, -1));
      return Number.isFinite(v) ? (v / 100) * ref : null;
    }
    const v = Number(token);
    return Number.isFinite(v) ? v : null;
  };
  const angle = (token: string): number | null => {
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/.exec(token);
    if (!m) return token === 'none' ? 0 : null;
    const v = Number(m[1]);
    if (m[2] === 'grad') return v * 0.9;
    if (m[2] === 'rad') return (v * 180) / Math.PI;
    if (m[2] === 'turn') return v * 360;
    return v;
  };
  const alpha = (() => {
    if (alphaToken === undefined) return 1;
    const v = num(alphaToken, 1);
    return v === null ? 1 : Math.min(1, Math.max(0, v));
  })();

  if (name === 'rgb' || name === 'rgba') {
    const v = parts.map((p) => num(p, 255));
    if (v.some((x) => x === null)) return null;
    const [r, g, b] = v as number[];
    return { rgb: { r: r / 255, g: g / 255, b: b / 255 }, alpha };
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = angle(parts[0]);
    const s = num(parts[1], 100);
    const li = num(parts[2], 100);
    if (h === null || s === null || li === null) return null;
    const hue = ((h % 360) + 360) % 360;
    const sat = s / 100;
    const lig = li / 100;
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      const a = sat * Math.min(lig, 1 - lig);
      return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return { rgb: { r: f(0), g: f(8), b: f(4) }, alpha };
  }
  if (name === 'oklch') {
    const li = num(parts[0], 1);
    const c = num(parts[1], 0.4);
    const h = angle(parts[2]);
    if (li === null || c === null || h === null) return null;
    return { rgb: toGamut({ l: li, c, h }), alpha };
  }
  if (name === 'oklab') {
    const li = num(parts[0], 1);
    const a = num(parts[1], 0.4);
    const b = num(parts[2], 0.4);
    if (li === null || a === null || b === null) return null;
    // The rectangular form of the same colour, so it goes down the same route
    // as oklch(): reduce chroma, do not clip. Clipping an out-of-gamut value
    // moves the hue and the lightness, and then the ratio printed on screen
    // belongs to a colour nobody asked about.
    const c = Math.hypot(a, b);
    const h = c < 1e-7 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    return { rgb: toGamut({ l: li, c, h }), alpha };
  }
  return null;
}

/**
 * Flattens a translucent colour onto its backdrop.
 *
 * Contrast is a property of what lands on the retina, so a text colour at 60%
 * alpha has to be composited before it is measured. Browsers composite in
 * gamma-encoded sRGB, so that is where this does it — compositing in linear
 * light would give a different, and for this purpose wrong, answer.
 */
export function compositeOver(top: Color, bottom: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, top.alpha));
  return {
    r: top.rgb.r * a + bottom.r * (1 - a),
    g: top.rgb.g * a + bottom.g * (1 - a),
    b: top.rgb.b * a + bottom.b * (1 - a),
  };
}

/* ── WCAG 2.2 ─────────────────────────────── */

/** WCAG relative luminance: linearise, then weight by the sRGB Y row. */
export function relativeLuminance(rgb: Rgb): number {
  const c = clip(rgb);
  return (
    0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b)
  );
}

/**
 * The WCAG ratio, 1:1 to 21:1.
 *
 * The 0.05 added to both luminances models veiling flare — stray light in the
 * room and inside the eye. It is also why the measure is generous to dark
 * themes: near black the flare term dominates, so two dark colours score much
 * further apart than they look.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = 'fail' | 'AA' | 'AAA';

export type WcagVerdict = {
  ratio: number;
  /** Body text: 1.4.3 needs 4.5, 1.4.6 needs 7. */
  normal: WcagLevel;
  /** 18pt / 24px, or 14pt / 18.66px bold: 3 and 4.5. */
  large: WcagLevel;
  /** 1.4.11 non-text contrast — icons, borders, focus rings: 3, no AAA. */
  nonText: boolean;
};

export function wcagVerdict(ratio: number): WcagVerdict {
  const level = (aa: number, aaa: number): WcagLevel =>
    ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'fail';
  return {
    ratio,
    normal: level(4.5, 7),
    large: level(3, 4.5),
    nonText: ratio >= 3,
  };
}

/* ── APCA 0.1.9 ───────────────────────────── */

const APCA = {
  trc: 2.4,
  r: 0.2126729,
  g: 0.7151522,
  b: 0.072175,
  blackThreshold: 0.022,
  blackClamp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  normBg: 0.56,
  normText: 0.57,
  revBg: 0.65,
  revText: 0.62,
  offset: 0.027,
  loClip: 0.1,
  deltaYMin: 0.0005,
} as const;

/** APCA's own luminance: a single 2.4 exponent, no piecewise toe, then a soft
 *  clamp that keeps very dark colours from reading as infinitely separable. */
export function apcaY(rgb: Rgb): number {
  const c = clip(rgb);
  const y =
    APCA.r * c.r ** APCA.trc + APCA.g * c.g ** APCA.trc + APCA.b * c.b ** APCA.trc;
  return y < APCA.blackThreshold ? y + (APCA.blackThreshold - y) ** APCA.blackClamp : y;
}

/**
 * APCA lightness contrast, Lc. Positive for dark text on light ground,
 * negative for light on dark; the sign carries the polarity, so its absolute
 * value is the number to read against a threshold.
 *
 * The two polarities get different exponents because they are not symmetric:
 * light text on a dark ground blooms and appears heavier than the same
 * separation the other way round, which is the effect WCAG's single ratio
 * cannot represent.
 */
export function apcaLc(text: Rgb, background: Rgb): number {
  const yText = apcaY(text);
  const yBg = apcaY(background);
  if (Math.abs(yBg - yText) < APCA.deltaYMin) return 0;
  if (yBg > yText) {
    const sapc = (yBg ** APCA.normBg - yText ** APCA.normText) * APCA.scaleBoW;
    return sapc < APCA.loClip ? 0 : (sapc - APCA.offset) * 100;
  }
  const sapc = (yBg ** APCA.revBg - yText ** APCA.revText) * APCA.scaleWoB;
  return sapc > -APCA.loClip ? 0 : (sapc + APCA.offset) * 100;
}

export type ApcaBand =
  | 'invisible'
  | 'discernible'
  | 'non-text'
  | 'large-only'
  | 'sub-body'
  | 'body-min'
  | 'body-preferred';

/**
 * Which of APCA's usage bands an Lc falls in.
 *
 * These are guidance from the APCA documentation, not a conformance test —
 * APCA's real interface is a lookup table over font size and weight, and
 * quoting a band is an honest summary of it rather than a pretend verdict.
 *
 * The thresholds are the six levels APCA publishes, and the two at the bottom
 * are easy to run together and must not be: Lc 30 is the absolute minimum for
 * any text at all (placeholder, disabled) and also the minimum for solid,
 * semantic non-text such as an icon that has to be understood. Lc 15 is only
 * the floor for non-text that has to be *discernible and differentiable* and is
 * at least 5px in its smallest dimension; below it a designer should treat the
 * element as invisible. So Lc 15–30 carries no content of any kind, which is
 * why it gets its own band instead of being folded into the non-text one.
 */
export function apcaBand(lc: number): ApcaBand {
  const v = Math.abs(lc);
  if (v >= 90) return 'body-preferred';
  if (v >= 75) return 'body-min';
  if (v >= 60) return 'sub-body';
  if (v >= 45) return 'large-only';
  if (v >= 30) return 'non-text';
  if (v >= 15) return 'discernible';
  return 'invisible';
}

/* ── Suggestions ──────────────────────────── */

export type Target = 3 | 4.5 | 7;

export type Suggestion = {
  rgb: Rgb;
  hex: string;
  ratio: number;
  lc: number;
  /** OKLab distance from the colour you asked about. Smaller is less of a
   *  change to the design. */
  deltaE: number;
  direction: 'darker' | 'lighter';
};

/**
 * Moves one side's OKLCH lightness the smallest distance that reaches a ratio.
 *
 * Lightness, not the hex channels: dropping every channel by the same amount
 * changes the hue and the chroma as well, and a suggestion a designer will not
 * accept is the same as no suggestion. Chroma and hue are held, and the result
 * is gamut-mapped, so the answer is a colour that exists.
 */
function searchLightness(
  moving: Rgb,
  fixed: Rgb,
  target: number,
  direction: 'darker' | 'lighter'
): Suggestion | null {
  const base = rgbToOklch(moving);
  const bound = direction === 'darker' ? 0 : 1;
  const at = (l: number) => toGamut({ l, c: base.c, h: base.h });
  if (contrastRatio(at(bound), fixed) < target) return null;

  let fail = base.l;
  let pass = bound;
  for (let i = 0; i < 48; i += 1) {
    const mid = (fail + pass) / 2;
    if (contrastRatio(at(mid), fixed) >= target) pass = mid;
    else fail = mid;
  }
  const rgb = at(pass);
  const ratio = contrastRatio(rgb, fixed);
  // The bisection is on a function that gamut mapping makes only nearly
  // monotonic, so the result is verified rather than assumed.
  if (ratio < target) return null;
  return {
    rgb,
    hex: toHex(rgb),
    ratio,
    lc: 0,
    deltaE: deltaEOK(rgb, moving),
    direction,
  };
}

/**
 * The nearest colours that reach `target`, one in each direction, ordered by
 * how little they change the original. Empty when the fixed side is too
 * mid-grey for anything to pass — which is itself the finding.
 */
export function nearestPassing(
  moving: Rgb,
  fixed: Rgb,
  target: number,
  /** Which side `moving` is, so the Lc is signed the right way round. */
  movingIsText: boolean
): Suggestion[] {
  // Already passing means there is nothing to suggest. Returning the input
  // back as a "suggestion" would read as a required change that is not one.
  if (contrastRatio(moving, fixed) >= target) return [];
  const found: Suggestion[] = [];
  for (const direction of ['darker', 'lighter'] as const) {
    const hit = searchLightness(moving, fixed, target, direction);
    if (!hit) continue;
    hit.lc = movingIsText ? apcaLc(hit.rgb, fixed) : apcaLc(fixed, hit.rgb);
    found.push(hit);
  }
  return found.sort((a, b) => a.deltaE - b.deltaE);
}

/* ── One measurement ──────────────────────── */

export type Measurement = {
  text: Rgb;
  background: Rgb;
  ratio: number;
  wcag: WcagVerdict;
  lc: number;
  band: ApcaBand;
  /** True when the text colour was composited because it is translucent. */
  composited: boolean;
};

export function measure(text: Color, background: Color, page: Rgb): Measurement {
  // The background itself may be translucent; it lands on the page colour.
  const bg = compositeOver(background, page);
  const fg = compositeOver(text, bg);
  const ratio = contrastRatio(fg, bg);
  const lc = apcaLc(fg, bg);
  return {
    text: fg,
    background: bg,
    ratio,
    wcag: wcagVerdict(ratio),
    lc,
    band: apcaBand(lc),
    composited: text.alpha < 1 || background.alpha < 1,
  };
}
