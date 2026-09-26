/**
 * Colour conversion between the spaces CSS actually has.
 *
 * Two things make this more than matrix multiplication. First, the spaces do
 * not share a white point: CSS `lab()` and `lch()` are defined against D50,
 * while `oklab()`, `oklch()` and sRGB are D65, so going between them needs a
 * chromatic adaptation and not just a rotation — skipping it shifts a
 * mid-grey by more than a just-noticeable difference. Second, OKLCH is larger
 * than any screen: most (L, C, h) triples name a colour no monitor can show,
 * and the honest answer is not to clip the channels but to walk the chroma
 * down until the colour fits, which is what CSS Color 4 specifies.
 *
 * All matrices and constants below are from CSS Color 4 (W3C) so that the
 * numbers this tool prints match what a browser computes for the same input.
 */

/** Gamma-encoded sRGB, 0..1 per channel. Values may fall outside 0..1 when a
 *  colour from a wider space has not been gamut-mapped yet. */
export type Rgb = { r: number; g: number; b: number };
/** CIE XYZ, unit-scaled (Y = 1 for the white point). */
export type Xyz = { x: number; y: number; z: number };
/** Rectangular perceptual coordinates: Lab (L 0..100) or OKLab (L 0..1). */
export type Lab = { l: number; a: number; b: number };
/** Polar form of the above. `h` in degrees, 0..360. */
export type Lch = { l: number; c: number; h: number };
export type Hsl = { h: number; s: number; l: number };
export type Hwb = { h: number; w: number; b: number };

export type Color = { rgb: Rgb; alpha: number };

export type Space = 'hex' | 'rgb' | 'hsl' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'p3';

/* ── Matrix plumbing ──────────────────────── */

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

const LIN_SRGB_TO_XYZ: M3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];

const XYZ_TO_LIN_SRGB: M3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const LIN_P3_TO_XYZ: M3 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.22897456404974849, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

const XYZ_TO_LIN_P3: M3 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];

/** Bradford-adapted D65 → D50, the transform CSS uses to reach `lab()`. */
const D65_TO_D50: M3 = [
  [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
  [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
  [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];

const D50_TO_D65: M3 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

const XYZ_TO_LMS: M3 = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];

const LMS_TO_XYZ: M3 = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const LMS_TO_OKLAB: M3 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

const OKLAB_TO_LMS: M3 = [
  [1.0, 0.3963377921737679, 0.2158037580607588],
  [1.0, -0.1055613423236564, -0.0638541747717059],
  [1.0, -0.0894841820949658, -1.2914855378640917],
];

/** D50 reference white, as CSS defines it for `lab()`. */
const WHITE_D50: readonly [number, number, number] = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

/* ── Transfer functions ───────────────────── */

/** sRGB (and Display-P3) electro-optical transfer function. Sign-preserving,
 *  so out-of-range channels survive a round trip instead of folding to 0. */
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

/* ── sRGB ↔ XYZ ↔ Lab / OKLab ─────────────── */

export function rgbToXyz(rgb: Rgb): Xyz {
  const [x, y, z] = apply(LIN_SRGB_TO_XYZ, [
    srgbToLinear(rgb.r),
    srgbToLinear(rgb.g),
    srgbToLinear(rgb.b),
  ]);
  return { x, y, z };
}

export function xyzToRgb(xyz: Xyz): Rgb {
  const [r, g, b] = apply(XYZ_TO_LIN_SRGB, [xyz.x, xyz.y, xyz.z]);
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

export function p3ToXyz(rgb: Rgb): Xyz {
  const [x, y, z] = apply(LIN_P3_TO_XYZ, [
    srgbToLinear(rgb.r),
    srgbToLinear(rgb.g),
    srgbToLinear(rgb.b),
  ]);
  return { x, y, z };
}

export function xyzToP3(xyz: Xyz): Rgb {
  const [r, g, b] = apply(XYZ_TO_LIN_P3, [xyz.x, xyz.y, xyz.z]);
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;

/** CIE Lab, D50-referenced — the white point CSS `lab()` uses. */
export function rgbToLab(rgb: Rgb): Lab {
  const d65 = rgbToXyz(rgb);
  const [x, y, z] = apply(D65_TO_D50, [d65.x, d65.y, d65.z]);
  const f = (t: number) => (t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116);
  const fx = f(x / WHITE_D50[0]);
  const fy = f(y / WHITE_D50[1]);
  const fz = f(z / WHITE_D50[2]);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: Lab): Rgb {
  const fy = (lab.l + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;
  const x = fx ** 3 > LAB_E ? fx ** 3 : (116 * fx - 16) / LAB_K;
  const y = lab.l > LAB_K * LAB_E ? fy ** 3 : lab.l / LAB_K;
  const z = fz ** 3 > LAB_E ? fz ** 3 : (116 * fz - 16) / LAB_K;
  const [dx, dy, dz] = apply(D50_TO_D65, [
    x * WHITE_D50[0],
    y * WHITE_D50[1],
    z * WHITE_D50[2],
  ]);
  return xyzToRgb({ x: dx, y: dy, z: dz });
}

export function rgbToOklab(rgb: Rgb): Lab {
  const xyz = rgbToXyz(rgb);
  const lms = apply(XYZ_TO_LMS, [xyz.x, xyz.y, xyz.z]);
  const [l, a, b] = apply(LMS_TO_OKLAB, [
    Math.cbrt(lms[0]),
    Math.cbrt(lms[1]),
    Math.cbrt(lms[2]),
  ]);
  return { l, a, b };
}

export function oklabToRgb(lab: Lab): Rgb {
  const lms = apply(OKLAB_TO_LMS, [lab.l, lab.a, lab.b]);
  const [x, y, z] = apply(LMS_TO_XYZ, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]);
  return xyzToRgb({ x, y, z });
}

/* ── Rectangular ↔ polar ──────────────────── */

/** Chroma below this is treated as achromatic, so hue stops being meaningful
 *  noise amplified out of rounding error. */
const ACHROMATIC = 1e-6;

export function labToLch(lab: Lab): Lch {
  const c = Math.hypot(lab.a, lab.b);
  if (c < ACHROMATIC) return { l: lab.l, c: 0, h: 0 };
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h };
}

export function lchToLab(lch: Lch): Lab {
  const rad = (lch.h * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}

export function rgbToOklch(rgb: Rgb): Lch {
  return labToLch(rgbToOklab(rgb));
}

export function oklchToRgb(lch: Lch): Rgb {
  return oklabToRgb(lchToLab(lch));
}

export function rgbToLch(rgb: Rgb): Lch {
  return labToLch(rgbToLab(rgb));
}

export function lchToRgb(lch: Lch): Rgb {
  return labToRgb(lchToLab(lch));
}

/* ── sRGB ↔ HSL / HWB ─────────────────────── */

export function rgbToHsl(rgb: Rgb): Hsl {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rgb.r) h = ((rgb.g - rgb.b) / d) % 6;
  else if (max === rgb.g) h = (rgb.b - rgb.r) / d + 2;
  else h = (rgb.r - rgb.g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  // The CSS Color 4 reference formulation: one helper evaluated at three
  // hue offsets, which avoids the six-way branch the 1970s version needs.
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToHwb(rgb: Rgb): Hwb {
  const { h } = rgbToHsl(rgb);
  const w = Math.min(rgb.r, rgb.g, rgb.b);
  const b = 1 - Math.max(rgb.r, rgb.g, rgb.b);
  return { h, w: w * 100, b: b * 100 };
}

export function hwbToRgb(hwb: Hwb): Rgb {
  let w = hwb.w / 100;
  let b = hwb.b / 100;
  if (w + b >= 1) {
    // Degenerate: white and black together fill the colour, leaving grey.
    const grey = w / (w + b);
    return { r: grey, g: grey, b: grey };
  }
  w = Math.max(0, w);
  b = Math.max(0, b);
  const base = hslToRgb({ h: hwb.h, s: 100, l: 50 });
  const mix = (c: number) => c * (1 - w - b) + w;
  return { r: mix(base.r), g: mix(base.g), b: mix(base.b) };
}

/* ── Gamut ────────────────────────────────── */

export function inGamut(rgb: Rgb, epsilon = 1e-5): boolean {
  return (
    rgb.r >= -epsilon &&
    rgb.r <= 1 + epsilon &&
    rgb.g >= -epsilon &&
    rgb.g <= 1 + epsilon &&
    rgb.b >= -epsilon &&
    rgb.b <= 1 + epsilon
  );
}

export function clip(rgb: Rgb): Rgb {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return { r: c(rgb.r), g: c(rgb.g), b: c(rgb.b) };
}

/** Perceptual distance in OKLab. The JND used by CSS gamut mapping is 0.02. */
export function deltaEOK(a: Rgb, b: Rgb): number {
  const x = rgbToOklab(a);
  const y = rgbToOklab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

const JND = 0.02;
const GAMUT_EPSILON = 0.0001;

/**
 * CSS Color 4 §13.2 gamut mapping: hold lightness and hue, bisect chroma.
 *
 * Clipping each channel independently is the obvious thing and it is wrong —
 * it shifts hue (a too-saturated blue clips its red to zero and turns purple)
 * and it flattens whole regions of a ramp onto the same colour. Reducing
 * chroma instead keeps the hue and the lightness the designer asked for, and
 * the search stops as soon as clipping would be within a just-noticeable
 * difference of the reduced colour.
 */
export function gamutMapOklch(lch: Lch): Rgb {
  const direct = oklchToRgb(lch);
  if (inGamut(direct)) return clip(direct);
  if (lch.l >= 1) return { r: 1, g: 1, b: 1 };
  if (lch.l <= 0) return { r: 0, g: 0, b: 0 };

  let min = 0;
  let max = lch.c;
  let minInGamut = true;
  let best = clip(direct);

  while (max - min > GAMUT_EPSILON) {
    const chroma = (min + max) / 2;
    const candidate = oklchToRgb({ l: lch.l, c: chroma, h: lch.h });
    if (minInGamut && inGamut(candidate)) {
      min = chroma;
      best = clip(candidate);
      continue;
    }
    const clipped = clip(candidate);
    const error = deltaEOK(clipped, candidate);
    if (error < JND) {
      best = clipped;
      if (JND - error < GAMUT_EPSILON) return clipped;
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }
  return best;
}

/** Same guarantee for an arbitrary sRGB triple that may sit outside 0..1. */
export function toGamut(rgb: Rgb): Rgb {
  return inGamut(rgb) ? clip(rgb) : gamutMapOklch(rgbToOklch(rgb));
}

/* ── Named colours ────────────────────────── */

/**
 * The CSS named colours, as one string so the table costs a single literal in
 * the chunk rather than 148 object entries.
 */
const NAMES =
  'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc ' +
  'bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a ' +
  'burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 ' +
  'cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b ' +
  'darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 ' +
  'darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 ' +
  'darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f ' +
  'darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 ' +
  'darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 ' +
  'dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff ' +
  'gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 ' +
  'greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c ' +
  'indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 ' +
  'lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 ' +
  'lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 ' +
  'lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa ' +
  'lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de ' +
  'lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff ' +
  'maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 ' +
  'mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee ' +
  'mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 ' +
  'midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 ' +
  'navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 ' +
  'orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 ' +
  'paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 ' +
  'peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 ' +
  'rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 ' +
  'salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d ' +
  'silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 ' +
  'snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 ' +
  'tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff ' +
  'whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32';

export const NAMED_COLORS: Record<string, string> = (() => {
  const parts = NAMES.split(' ').filter((s) => s !== '');
  const out: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 2) out[parts[i]] = parts[i + 1];
  return out;
})();

/** Exact name for a colour, when one exists. Used to label the input. */
export function nameOf(rgb: Rgb): string | null {
  const hex = toHex({ rgb, alpha: 1 }).slice(1).toLowerCase();
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    if (value === hex) return name;
  }
  return null;
}

/* ── Parsing ──────────────────────────────── */

function toNumber(token: string, percentRef: number | null): number | null {
  const text = token.trim().toLowerCase();
  if (text === '' ) return null;
  if (text === 'none') return 0;
  if (text.endsWith('%')) {
    if (percentRef === null) return null;
    const v = Number(text.slice(0, -1));
    return Number.isFinite(v) ? (v / 100) * percentRef : null;
  }
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

/** CSS angle in any of its four units, normalised to degrees. */
function toAngle(token: string): number | null {
  const text = token.trim().toLowerCase();
  if (text === 'none') return 0;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/.exec(text);
  if (!match) return null;
  const v = Number(match[1]);
  switch (match[2]) {
    case 'grad':
      return v * 0.9;
    case 'rad':
      return (v * 180) / Math.PI;
    case 'turn':
      return v * 360;
    default:
      return v;
  }
}

function toAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const v = toNumber(token, 1);
  if (v === null) return 1;
  return Math.min(1, Math.max(0, v));
}

/**
 * Splits a functional notation's arguments, accepting both the legacy comma
 * form and the modern space form with `/ alpha`.
 *
 * `legacyAlpha` has to be switchable: in `rgba(r,g,b,a)` a fourth argument is
 * the alpha, but in `color(display-p3 r g b)` the fourth argument is blue and
 * the first is a colour-space name.
 */
function splitArgs(inner: string, legacyAlpha = true): { parts: string[]; alpha?: string } {
  const slash = inner.indexOf('/');
  const head = slash === -1 ? inner : inner.slice(0, slash);
  const tail = slash === -1 ? undefined : inner.slice(slash + 1).trim();
  const parts = head
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');
  if (tail !== undefined) return { parts, alpha: tail };
  if (legacyAlpha && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts };
}

function parseHex(text: string): Color | null {
  const hex = text.replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const expand = (s: string) => Number.parseInt(s.length === 1 ? s + s : s, 16);
  if (hex.length === 3 || hex.length === 4) {
    return {
      rgb: {
        r: expand(hex[0]) / 255,
        g: expand(hex[1]) / 255,
        b: expand(hex[2]) / 255,
      },
      alpha: hex.length === 4 ? expand(hex[3]) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      rgb: {
        r: Number.parseInt(hex.slice(0, 2), 16) / 255,
        g: Number.parseInt(hex.slice(2, 4), 16) / 255,
        b: Number.parseInt(hex.slice(4, 6), 16) / 255,
      },
      alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

/**
 * Any CSS colour this tool understands → sRGB plus alpha.
 *
 * Returns null rather than throwing: the input box reparses on every
 * keystroke, and half-typed text is the normal state, not an error.
 */
export function parseColor(input: string): Color | null {
  const text = input.trim();
  if (text === '') return null;

  const lower = text.toLowerCase();
  if (lower === 'transparent') return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  if (NAMED_COLORS[lower]) return parseHex(NAMED_COLORS[lower]);

  if (text.startsWith('#')) return parseHex(text);

  const fn = /^([a-z-]+)\(([^()]*)\)$/.exec(lower);
  if (!fn) {
    // A bare hex triple, which is what people paste out of design tools.
    return /^[0-9a-fA-F]{3,8}$/.test(text) ? parseHex(text) : null;
  }

  const [, name, inner] = fn;
  const { parts, alpha: alphaToken } = splitArgs(inner, name !== 'color');
  const alpha = toAlpha(alphaToken);

  if (name === 'rgb' || name === 'rgba') {
    if (parts.length !== 3) return null;
    const channels = parts.map((p) => toNumber(p, 255));
    if (channels.some((v) => v === null)) return null;
    const [r, g, b] = channels as number[];
    return { rgb: { r: r / 255, g: g / 255, b: b / 255 }, alpha };
  }

  if (name === 'hsl' || name === 'hsla') {
    if (parts.length !== 3) return null;
    const h = toAngle(parts[0]);
    const s = toNumber(parts[1], 100);
    const l = toNumber(parts[2], 100);
    if (h === null || s === null || l === null) return null;
    return { rgb: hslToRgb({ h, s, l }), alpha };
  }

  if (name === 'hwb') {
    if (parts.length !== 3) return null;
    const h = toAngle(parts[0]);
    const w = toNumber(parts[1], 100);
    const b = toNumber(parts[2], 100);
    if (h === null || w === null || b === null) return null;
    return { rgb: hwbToRgb({ h, w, b }), alpha };
  }

  if (name === 'lab' || name === 'oklab') {
    if (parts.length !== 3) return null;
    const ok = name === 'oklab';
    const l = toNumber(parts[0], ok ? 1 : 100);
    const a = toNumber(parts[1], ok ? 0.4 : 125);
    const b = toNumber(parts[2], ok ? 0.4 : 125);
    if (l === null || a === null || b === null) return null;
    const rgb = ok ? oklabToRgb({ l, a, b }) : labToRgb({ l, a, b });
    return { rgb, alpha };
  }

  if (name === 'lch' || name === 'oklch') {
    if (parts.length !== 3) return null;
    const ok = name === 'oklch';
    const l = toNumber(parts[0], ok ? 1 : 100);
    const c = toNumber(parts[1], ok ? 0.4 : 150);
    const h = toAngle(parts[2]);
    if (l === null || c === null || h === null) return null;
    const rgb = ok ? oklchToRgb({ l, c, h }) : lchToRgb({ l, c, h });
    return { rgb, alpha };
  }

  if (name === 'color') {
    if (parts.length !== 4) return null;
    const space = parts[0];
    const channels = parts.slice(1).map((p) => toNumber(p, 1));
    if (channels.some((v) => v === null)) return null;
    const [r, g, b] = channels as number[];
    if (space === 'srgb') return { rgb: { r, g, b }, alpha };
    if (space === 'srgb-linear') {
      return { rgb: { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) }, alpha };
    }
    if (space === 'display-p3') return { rgb: xyzToRgb(p3ToXyz({ r, g, b })), alpha };
    return null;
  }

  return null;
}

/* ── Formatting ───────────────────────────── */

/** Trailing zeros dropped: `0.5` not `0.5000`, and `12` not `12.00`.
 *  Negative zero is folded away — `lab(100% -0 0)` is not something to paste. */
function trim(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '0';
  const fixed = (n === 0 ? 0 : n).toFixed(digits);
  const short = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return short === '-0' ? '0' : short;
}

const byte = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);

export function toHex(color: Color): string {
  const hex = (c: number) => byte(c).toString(16).padStart(2, '0');
  const base = `#${hex(color.rgb.r)}${hex(color.rgb.g)}${hex(color.rgb.b)}`;
  if (color.alpha >= 1) return base;
  return base + Math.round(color.alpha * 255).toString(16).padStart(2, '0');
}

/**
 * One colour in one notation.
 *
 * Alpha is only written when it is not 1, because `rgb(0 0 0 / 1)` is noise in
 * a stylesheet. Out-of-gamut colours are printed as they are in the
 * perceptual spaces and gamut-mapped in the screen ones — that difference is
 * the point, so the caller can see which notation is lying.
 */
export function formatColor(color: Color, space: Space): string {
  const { alpha } = color;
  const mapped = toGamut(color.rgb);
  const a = alpha >= 1 ? '' : ` / ${trim(alpha, 3)}`;

  switch (space) {
    case 'hex':
      return toHex({ rgb: mapped, alpha });
    case 'rgb':
      return `rgb(${byte(mapped.r)} ${byte(mapped.g)} ${byte(mapped.b)}${a})`;
    case 'hsl': {
      const hsl = rgbToHsl(mapped);
      return `hsl(${trim(hsl.h, 2)} ${trim(hsl.s, 2)}% ${trim(hsl.l, 2)}%${a})`;
    }
    case 'hwb': {
      const hwb = rgbToHwb(mapped);
      return `hwb(${trim(hwb.h, 2)} ${trim(hwb.w, 2)}% ${trim(hwb.b, 2)}%${a})`;
    }
    case 'lab': {
      const lab = rgbToLab(color.rgb);
      return `lab(${trim(lab.l, 2)}% ${trim(lab.a, 2)} ${trim(lab.b, 2)}${a})`;
    }
    case 'lch': {
      const lch = rgbToLch(color.rgb);
      return `lch(${trim(lch.l, 2)}% ${trim(lch.c, 2)} ${trim(lch.h, 2)}${a})`;
    }
    case 'oklab': {
      const lab = rgbToOklab(color.rgb);
      return `oklab(${trim(lab.l, 4)} ${trim(lab.a, 4)} ${trim(lab.b, 4)}${a})`;
    }
    case 'oklch': {
      const lch = rgbToOklch(color.rgb);
      return `oklch(${trim(lch.l, 4)} ${trim(lch.c, 4)} ${trim(lch.h, 2)}${a})`;
    }
    case 'p3': {
      const p3 = xyzToP3(rgbToXyz(color.rgb));
      return `color(display-p3 ${trim(p3.r, 4)} ${trim(p3.g, 4)} ${trim(p3.b, 4)}${a})`;
    }
  }
}

export const SPACES: readonly Space[] = ['hex', 'rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lch', 'lab', 'p3'];

/** Everything the UI shows for one colour, computed once. */
export type Report = {
  color: Color;
  notations: { space: Space; value: string }[];
  oklch: Lch;
  lab: Lab;
  /** True when the colour as typed cannot be shown on an sRGB screen. */
  outOfSrgb: boolean;
  /** True when it is outside Display-P3 as well. */
  outOfP3: boolean;
  name: string | null;
};

export function describe(color: Color): Report {
  const p3 = xyzToP3(rgbToXyz(color.rgb));
  return {
    color,
    notations: SPACES.map((space) => ({ space, value: formatColor(color, space) })),
    oklch: rgbToOklch(color.rgb),
    lab: rgbToLab(color.rgb),
    outOfSrgb: !inGamut(color.rgb, 0.0005),
    outOfP3: !inGamut(p3, 0.0005),
    name: nameOf(toGamut(color.rgb)),
  };
}
