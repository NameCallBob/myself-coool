/**
 * Dichromacy simulation — what a palette looks like to someone missing one
 * cone type.
 *
 * The model is Brettel, Viénot & Mollon (1997) / Viénot, Brettel & Mollon
 * (1999). A dichromat's colour space is a surface, not a volume: with two cone
 * types instead of three, every colour collapses onto the plane spanned by the
 * two wavelengths the person can still distinguish plus the neutral axis. So
 * the simulation is a projection, and a projection is a matrix.
 *
 * Protanopia and deuteranopia get one matrix each, because Viénot showed a
 * single plane is adequate for the L and M cases. Tritanopia needs two: the
 * S-cone case is not well approximated by one plane, so the space is split
 * along the neutral axis and each half gets its own projection. The halves
 * agree exactly on the boundary — both preserve greys — so there is no seam.
 *
 * Every matrix here operates on *linear* RGB. Applying them to gamma-encoded
 * values is the most common way to get this wrong, and the result looks
 * plausible while being wrong by a large margin in the midtones.
 *
 * What this does NOT model: anomalous trichromacy (protanomaly, deuteranomaly,
 * tritanomaly), which is a shifted cone response rather than a missing one, and
 * is what most people with a colour vision deficiency actually have. The
 * severity control below interpolates towards the dichromat result, which is a
 * common approximation and not a validated one — see `limits`.
 */

export type Rgb = { r: number; g: number; b: number };
export type Deficiency = 'protan' | 'deutan' | 'tritan';

export const DEFICIENCIES: readonly Deficiency[] = ['protan', 'deutan', 'tritan'];

/** Roughly how common each is among people of northern European descent. */
export const PREVALENCE: Record<Deficiency, { zh: string; en: string }> = {
  protan: { zh: '約 1% 男性(紅錐缺失)', en: 'about 1% of men (no L cone)' },
  deutan: { zh: '約 1% 男性(綠錐缺失);連同綠弱約 6%', en: 'about 1% of men (no M cone); with deuteranomaly, about 6%' },
  tritan: { zh: '極少見,約 1/10000,不分性別', en: 'rare, about 1 in 10,000, not sex-linked' },
};

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

/**
 * Viénot, Brettel & Mollon (1999), table 1, expressed in linear sRGB.
 *
 * Two properties make these checkable rather than magic: each row sums to 1, so
 * greys map to themselves exactly; and the first two rows are identical, which
 * makes the matrix idempotent — applying it twice is applying it once, as a
 * projection must be. Both are asserted in the tests.
 */
const SINGLE_PLANE: Record<'protan' | 'deutan', M3> = {
  protan: [
    [0.11238, 0.88762, 0.0],
    [0.11238, 0.88762, 0.0],
    [0.00401, -0.00401, 1.0],
  ],
  deutan: [
    [0.29275, 0.70725, 0.0],
    [0.29275, 0.70725, 0.0],
    [-0.02234, 0.02234, 1.0],
  ],
};

/**
 * Brettel (1997) for tritanopia, as two half-space projections in linear sRGB.
 *
 * `normal` defines the dividing plane; the sign of its dot product with the
 * colour picks the matrix. Note that within the RGB cube that plane meets the
 * gamut only along the neutral axis — `normal · (1,1,1)` is zero — and both
 * matrices preserve greys, so the two halves join continuously.
 */
const TRITAN = {
  normal: [0.03901, -0.02788, -0.01113] as const,
  positive: [
    [1.01354, 0.14268, -0.15622],
    [-0.01181, 0.87561, 0.13619],
    [0.07707, 0.81208, 0.11085],
  ] as M3,
  negative: [
    [0.93337, 0.19999, -0.13336],
    [0.05809, 0.82565, 0.11626],
    [-0.37923, 1.13825, 0.24098],
  ] as M3,
};

/* ── Transfer ─────────────────────────────── */

export function srgbToLinear(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
}

/** The matrix for one deficiency at one point in linear RGB. */
function matrixFor(type: Deficiency, linear: readonly [number, number, number]): M3 {
  if (type !== 'tritan') return SINGLE_PLANE[type];
  const side =
    TRITAN.normal[0] * linear[0] + TRITAN.normal[1] * linear[1] + TRITAN.normal[2] * linear[2];
  return side >= 0 ? TRITAN.positive : TRITAN.negative;
}

/**
 * One colour as a dichromat of the given type would see it.
 *
 * `severity` blends between the original (0) and the full dichromat result (1)
 * in linear RGB. It is an approximation of anomalous trichromacy, offered
 * because a severity of 1 is not what most affected people have — but it is
 * interpolation, not a cone-response model, so treat the midpoints as
 * indicative rather than as measurements.
 */
export function simulate(rgb: Rgb, type: Deficiency, severity = 1): Rgb {
  const s = Math.min(1, Math.max(0, severity));
  const linear: [number, number, number] = [
    srgbToLinear(rgb.r),
    srgbToLinear(rgb.g),
    srgbToLinear(rgb.b),
  ];
  const projected = apply(matrixFor(type, linear), linear);
  const mixed = projected.map((v, i) => linear[i] * (1 - s) + v * s);
  return {
    r: linearToSrgb(mixed[0]),
    g: linearToSrgb(mixed[1]),
    b: linearToSrgb(mixed[2]),
  };
}

/* ── Hex in, hex out ──────────────────────── */

export function toHex(rgb: Rgb): string {
  const hex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`;
}

/** hex (3 or 6), rgb() and a couple of names — this tool takes palettes. */
export function parseColor(input: string): Rgb | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;
  if (text === 'white') return { r: 1, g: 1, b: 1 };
  if (text === 'black') return { r: 0, g: 0, b: 0 };
  const hex = text.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(hex)) {
    const dup = (s: string) => Number.parseInt(s + s, 16) / 255;
    return { r: dup(hex[0]), g: dup(hex[1]), b: dup(hex[2]) };
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    const at = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return { r: at(0), g: at(2), b: at(4) };
  }
  const fn = /^rgba?\(([^()]*)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[1].replace(/[,/]/g, ' ').trim().split(/\s+/).filter((s) => s !== '');
  if (parts.length < 3) return null;
  const v = parts.slice(0, 3).map((p) => {
    const n = p.endsWith('%') ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p);
    return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) / 255 : null;
  });
  if (v.some((x) => x === null)) return null;
  const [r, g, b] = v as number[];
  return { r, g, b };
}

/**
 * Pulls every hex or rgb() colour out of pasted text.
 *
 * Designers paste a CSS block, a JSON theme or a column out of a spreadsheet,
 * and asking them to reformat it first is work the tool can do.
 */
export function extractPalette(text: string, limit = 64): { hex: string; rgb: Rgb }[] {
  const found: { hex: string; rgb: Rgb }[] = [];
  const seen = new Set<string>();
  const pattern = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^()]*\)/g;
  for (const match of text.match(pattern) ?? []) {
    const rgb = parseColor(match);
    if (!rgb) continue;
    const hex = toHex(rgb);
    if (seen.has(hex)) continue;
    seen.add(hex);
    found.push({ hex, rgb });
    if (found.length >= limit) break;
  }
  return found;
}

/* ── Telling colours apart ────────────────── */

function oklab(rgb: Rgb): { l: number; a: number; b: number } {
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

/** Perceptual distance in OKLab. 0.02 is about one just-noticeable step. */
export function deltaEOK(a: Rgb, b: Rgb): number {
  const x = oklab(a);
  const y = oklab(b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}

/** WCAG relative luminance, for the lightness-only fallback check. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

export type Collision = {
  a: number;
  b: number;
  hexA: string;
  hexB: string;
  /** Distance between the two colours as drawn. */
  before: number;
  /** Distance after the simulation. */
  after: number;
  /** Ratio of the WCAG luminances — what survives when hue does not. */
  luminanceRatio: number;
};

/** Below this OKLab distance two swatches are not reliably distinguishable
 *  side by side, let alone as a legend and a line on a chart. */
export const COLLISION_THRESHOLD = 0.06;

/**
 * Pairs that stop being distinguishable under one deficiency.
 *
 * This is the actual question behind "don't rely on colour alone": not whether
 * the palette shifts — it always shifts — but whether two colours that carried
 * different meanings collapse onto each other. The luminance ratio is reported
 * alongside, because a pair that still differs in lightness survives being
 * printed in greyscale and is the cheapest fix available.
 */
export function collisions(
  palette: readonly Rgb[],
  type: Deficiency,
  severity = 1,
  threshold = COLLISION_THRESHOLD
): Collision[] {
  const simulated = palette.map((rgb) => simulate(rgb, type, severity));
  const out: Collision[] = [];
  for (let i = 0; i < palette.length; i += 1) {
    for (let j = i + 1; j < palette.length; j += 1) {
      const after = deltaEOK(simulated[i], simulated[j]);
      if (after > threshold) continue;
      const la = luminance(palette[i]);
      const lb = luminance(palette[j]);
      out.push({
        a: i,
        b: j,
        hexA: toHex(palette[i]),
        hexB: toHex(palette[j]),
        before: deltaEOK(palette[i], palette[j]),
        after,
        luminanceRatio: (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05),
      });
    }
  }
  // The pairs that were furthest apart before are the ones most likely to have
  // been carrying meaning, so they come first.
  return out.sort((x, y) => y.before - x.before);
}

/* ── Images ───────────────────────────────── */

/** Above this many pixels, decline rather than lock the tab up. */
export const MAX_PIXELS = 16_000_000;

/**
 * Transforms RGBA pixel data in place.
 *
 * Alpha is left exactly as it was: a deficiency changes which colours are
 * confusable, not which pixels are drawn. Working on the buffer rather than on
 * objects matters at these sizes — a 4000×4000 image is 16 million pixels, and
 * allocating three numbers per pixel is the difference between a redraw and a
 * stall.
 */
export function simulateImageData(
  data: Uint8ClampedArray,
  type: Deficiency,
  severity = 1
): Uint8ClampedArray {
  const s = Math.min(1, Math.max(0, severity));
  // A 256-entry table: the transfer function is the expensive part and there
  // are only 256 possible inputs per channel.
  const toLinear = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) toLinear[i] = srgbToLinear(i / 255);

  for (let i = 0; i < data.length; i += 4) {
    const r = toLinear[data[i]];
    const g = toLinear[data[i + 1]];
    const b = toLinear[data[i + 2]];
    const m = matrixFor(type, [r, g, b]);
    const pr = m[0][0] * r + m[0][1] * g + m[0][2] * b;
    const pg = m[1][0] * r + m[1][1] * g + m[1][2] * b;
    const pb = m[2][0] * r + m[2][1] * g + m[2][2] * b;
    data[i] = Math.round(linearToSrgb(r * (1 - s) + pr * s) * 255);
    data[i + 1] = Math.round(linearToSrgb(g * (1 - s) + pg * s) * 255);
    data[i + 2] = Math.round(linearToSrgb(b * (1 - s) + pb * s) * 255);
  }
  return data;
}
