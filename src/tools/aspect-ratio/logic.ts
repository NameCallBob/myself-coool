/**
 * Aspect ratio arithmetic.
 *
 * Two different questions hide behind "what ratio is this?". For a pair of
 * integers there is an exact answer: divide both by their greatest common
 * divisor, which Euclid's algorithm finds in a handful of steps. 1920×1080
 * reduces to 16:9 and that is the end of it. But 1366×768 reduces to 683:384,
 * which is exact and useless — nobody designs against 683:384, they want to
 * hear "it is 16:9, off by 0.06%". That second question is a different
 * problem: the closest ratio whose terms stay small, which is a bounded
 * denominator rational approximation, solved by the continued fraction of the
 * decimal value rather than by any amount of dividing.
 *
 * So both are computed and both are reported, because rounding the first into
 * the second silently is how a layout ends up one pixel short of the viewport.
 */

/** A ratio, or a pixel size — same shape, and the arithmetic does not care. */
export type Ratio = { w: number; h: number };

/** A rational approximation of a decimal ratio. `error` is relative. */
export type Approx = { w: number; h: number; value: number; error: number; exact: boolean };

export type Orientation = 'landscape' | 'portrait' | 'square';

export type Report = {
  /** w / h. */
  value: number;
  orientation: Orientation;
  /** Exact reduction by GCD. Only defined when both sides are integers. */
  exact: Ratio | null;
  /** Closest ratio with both terms inside the requested bound. */
  nearest: Approx;
  /** A name from COMMON_RATIOS, when the value is within tolerance of one. */
  name: string | null;
  pixels: number;
};

/** Ten million pixels on a side is 846 metres of paper at 300 dpi. The real
 *  reason for the ceiling is that w*h has to stay exact in a double, and
 *  1e7 x 1e7 = 1e14 is comfortably inside 2^53. */
export const MAX_DIM = 1e7;
/** Continued fraction terms are capped: 64 is far past the point where a
 *  double has any information left to contribute. */
const MAX_CF_TERMS = 64;
/** The largest denominator bound worth offering. Beyond this the "nearest
 *  simple ratio" is just the value again. */
export const MAX_TERM_BOUND = 100000;

function isSize(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_DIM;
}

/* ── Exact side: Euclid ───────────────────── */

/**
 * Greatest common divisor by Euclid's algorithm. Non-negative integers only;
 * gcd(n, 0) is n, and gcd(0, 0) is 0.
 */
export function gcd(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    throw new RangeError('gcd takes non-negative integers');
  }
  let x = a;
  let y = b;
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Exact integer ratio: both sides divided by their GCD. Integers only — for
 * anything else there is no exact integer ratio and `nearestRatio` is the
 * honest answer.
 */
export function reduceRatio(w: number, h: number): Ratio {
  if (!Number.isInteger(w) || !Number.isInteger(h) || !isSize(w) || !isSize(h)) {
    throw new RangeError('reduceRatio takes positive integers no larger than MAX_DIM');
  }
  const d = gcd(w, h);
  return { w: w / d, h: h / d };
}

/* ── Approximate side: continued fractions ── */

function closer(value: number, a: Ratio, b: Ratio): Ratio {
  return Math.abs(a.w / a.h - value) <= Math.abs(b.w / b.h - value) ? a : b;
}

/**
 * The closest ratio to `value` whose denominator does not exceed `maxTerm`.
 *
 * Walks the continued fraction expansion of the value. Each convergent is the
 * best approximation for its size of denominator; when the next one would
 * overshoot the bound, the largest allowed semiconvergent is built from the
 * same recurrence and the closer of the two is returned — the convergent alone
 * is not always the best answer inside a bound: for 1.3 with maxTerm 2 the next
 * convergent 4/3 is out of bounds, and the semiconvergent 3/2 beats the
 * convergent 1/1 the expansion had reached.
 */
export function nearestRatio(value: number, maxTerm = 64): Approx {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('nearestRatio takes a positive finite ratio');
  }
  if (!Number.isInteger(maxTerm) || maxTerm < 1 || maxTerm > MAX_TERM_BOUND) {
    throw new RangeError(`maxTerm must be an integer in 1..${MAX_TERM_BOUND}`);
  }

  // Ratios below 1 are approximated upside down, so the bound applies to the
  // larger term either way and 9:16 comes back as cleanly as 16:9.
  if (value < 1) {
    const flipped = nearestRatio(1 / value, maxTerm);
    return {
      w: flipped.h,
      h: flipped.w,
      value: flipped.h / flipped.w,
      error: Math.abs(flipped.h / flipped.w - value) / value,
      exact: flipped.h / flipped.w === value,
    };
  }

  let pPrev = 0;
  let qPrev = 1;
  let p = 1;
  let q = 0;
  let v = value;

  for (let i = 0; i < MAX_CF_TERMS; i += 1) {
    const a = Math.floor(v);
    const pNext = a * p + pPrev;
    const qNext = a * q + qPrev;

    if (q === 0) {
      // First term. qNext is 1, so only an enormous value can bust the bound,
      // and for that the simplest honest ratio is n:1.
      if (pNext > MAX_TERM_BOUND) return finish(value, { w: Math.round(value), h: 1 });
    } else if (qNext > maxTerm || pNext > MAX_TERM_BOUND) {
      const room = Math.floor((maxTerm - qPrev) / q);
      const semi: Ratio = { w: room * p + pPrev, h: room * q + qPrev };
      const best = closer(value, { w: p, h: q }, semi);
      return finish(value, best);
    }

    pPrev = p;
    qPrev = q;
    p = pNext;
    q = qNext;

    const frac = v - a;
    // Nothing left to expand: the value is this convergent, to double precision.
    if (frac <= 0) break;
    v = 1 / frac;
  }

  return finish(value, { w: p, h: q });
}

function finish(value: number, r: Ratio): Approx {
  const got = r.w / r.h;
  return { w: r.w, h: r.h, value: got, error: Math.abs(got - value) / value, exact: got === value };
}

/* ── Parsing and printing ─────────────────── */

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const RATIO_RE = new RegExp(`^(${NUMBER})(?:[:/x×*,](${NUMBER}))?$`);

/**
 * Reads `16:9`, `16/9`, `1920x1080`, `2.39:1`, or a bare decimal like `1.85`
 * (taken as `1.85:1`). Returns null rather than guessing.
 */
export function parseRatio(text: string): Ratio | null {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, '');
  if (cleaned === '') return null;
  const m = RATIO_RE.exec(cleaned);
  if (!m) return null;
  const w = Number(m[1]);
  const h = m[2] === undefined ? 1 : Number(m[2]);
  if (!isSize(w) || !isSize(h)) return null;
  return { w, h };
}

function trimNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(4)));
}

/** `16:9`. Non-integer terms keep up to four decimals. */
export function formatRatio(r: Ratio): string {
  return `${trimNumber(r.w)}:${trimNumber(r.h)}`;
}

/* ── Scaling ──────────────────────────────── */

/** Height that pairs with `w` at this ratio. Exact — rounding is the caller's
 *  decision, and `snap` is how it gets made. */
export function heightFor(ratio: Ratio, w: number): number {
  if (!isSize(ratio.w) || !isSize(ratio.h) || !isSize(w)) {
    throw new RangeError('heightFor takes positive finite sizes');
  }
  return (w * ratio.h) / ratio.w;
}

/** Width that pairs with `h` at this ratio. Exact. */
export function widthFor(ratio: Ratio, h: number): number {
  if (!isSize(ratio.w) || !isSize(ratio.h) || !isSize(h)) {
    throw new RangeError('widthFor takes positive finite sizes');
  }
  return (h * ratio.w) / ratio.h;
}

/**
 * Nearest multiple of `multiple`, never below it. Half rounds up.
 * Video encoders want even numbers; chroma-subsampled 4:2:0 wants them on
 * both axes, and some hardware wants multiples of 8 or 16.
 */
export function snap(value: number, multiple: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('snap takes a positive finite value');
  }
  if (!Number.isInteger(multiple) || multiple < 1) {
    throw new RangeError('multiple must be a positive integer');
  }
  const steps = Math.max(1, Math.round(value / multiple));
  return steps * multiple;
}

/**
 * Snaps a value that is one float step from a whole number back onto it.
 * Without this, 9 x (1000/9) comes out as 1000.0000000000001 and a `cover`
 * fit reports 1001 px for a box that is 1000 px tall.
 */
function settle(x: number): number {
  const r = Math.round(x);
  return Math.abs(x - r) < 1e-9 ? r : x;
}

export type Fit = { w: number; h: number; scale: number };

/**
 * Largest size at `ratio` that fits inside `box` (`contain`), or smallest that
 * covers it (`cover`). Integers: contain floors so it never overflows, cover
 * ceils so it never leaves a gap. `scale` is the unrounded factor.
 */
export function fitBox(ratio: Ratio, box: Ratio, mode: 'contain' | 'cover'): Fit {
  if (!isSize(ratio.w) || !isSize(ratio.h) || !isSize(box.w) || !isSize(box.h)) {
    throw new RangeError('fitBox takes positive finite sizes');
  }
  const sw = box.w / ratio.w;
  const sh = box.h / ratio.h;
  const scale = mode === 'contain' ? Math.min(sw, sh) : Math.max(sw, sh);
  const round = mode === 'contain' ? Math.floor : Math.ceil;
  return {
    w: Math.max(1, round(settle(ratio.w * scale))),
    h: Math.max(1, round(settle(ratio.h * scale))),
    scale,
  };
}

/* ── Naming ───────────────────────────────── */

/**
 * Ratios that have names people use. `21:9` is listed twice on purpose: the
 * marketing name covers two different shapes, and 3440×1440 is 43:18 while
 * 2560×1080 is 64:27. Printing one name for both is how a design ends up
 * letterboxed on the monitor it was drawn for.
 */
export const COMMON_RATIOS: { name: string; w: number; h: number }[] = [
  { name: '1:1', w: 1, h: 1 },
  { name: '5:4', w: 5, h: 4 },
  { name: '4:3', w: 4, h: 3 },
  { name: '3:2', w: 3, h: 2 },
  { name: '16:10', w: 16, h: 10 },
  { name: '16:9', w: 16, h: 9 },
  { name: '1.85:1', w: 1.85, h: 1 },
  { name: '64:27 (21:9)', w: 64, h: 27 },
  { name: '43:18 (21:9)', w: 43, h: 18 },
  { name: '2.39:1', w: 2.39, h: 1 },
  { name: '32:9', w: 32, h: 9 },
  { name: '4:5', w: 4, h: 5 },
  { name: '3:4', w: 3, h: 4 },
  { name: '2:3', w: 2, h: 3 },
  { name: '9:16', w: 9, h: 16 },
  { name: '9:19.5', w: 9, h: 19.5 },
  { name: '9:20', w: 9, h: 20 },
];

/**
 * The name of the closest common ratio within `tolerance` relative error,
 * or null. Default 0.5% — tight enough that 16:9 and 16:10 never trade places,
 * loose enough that 1366×768 still reads as 16:9.
 */
export function namedRatio(value: number, tolerance = 0.005): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  let best: { name: string; error: number } | null = null;
  for (const candidate of COMMON_RATIOS) {
    const error = Math.abs(candidate.w / candidate.h - value) / value;
    if (error <= tolerance && (best === null || error < best.error)) {
      best = { name: candidate.name, error };
    }
  }
  return best === null ? null : best.name;
}

/* ── One pass over a size ─────────────────── */

/**
 * Everything worth saying about one width×height pair. `maxTerm` bounds the
 * simple ratio; the exact GCD reduction is separate and is only present when
 * both sides are whole pixels.
 */
export function analyse(w: number, h: number, maxTerm = 64): Report {
  if (!isSize(w) || !isSize(h)) {
    throw new RangeError('analyse takes positive finite sizes no larger than MAX_DIM');
  }
  const value = w / h;
  const whole = Number.isInteger(w) && Number.isInteger(h);
  return {
    value,
    orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square',
    exact: whole ? reduceRatio(w, h) : null,
    nearest: nearestRatio(value, maxTerm),
    name: namedRatio(value),
    pixels: w * h,
  };
}

/* ── Reference sizes ──────────────────────── */

export type PresetGroup = 'display' | 'web' | 'mobile' | 'print';

export type Preset = { group: PresetGroup; label: string; w: number; h: number };

/**
 * Compiled by hand on this date from vendor and platform documentation. It is
 * a starting point, not a source of truth: platform image sizes change without
 * notice and phone panels change every year, which is why every row in the UI
 * is editable and the version is printed next to the table.
 *
 * The display and print rows are standards and do not move — the print sizes
 * are ISO 216 paper at 300 dpi, computed rather than copied
 * (210 mm / 25.4 × 300 = 2480.31 → 2480 px).
 */
export const PRESET_VERSION = '2026-09-26';

export const PRESETS: Preset[] = [
  { group: 'display', label: '8K UHD', w: 7680, h: 4320 },
  { group: 'display', label: '5K', w: 5120, h: 2880 },
  { group: 'display', label: 'DCI 4K', w: 4096, h: 2160 },
  { group: 'display', label: '4K UHD / 2160p', w: 3840, h: 2160 },
  { group: 'display', label: 'UWQHD', w: 3440, h: 1440 },
  { group: 'display', label: 'WQXGA', w: 2560, h: 1600 },
  { group: 'display', label: 'QHD / 1440p', w: 2560, h: 1440 },
  { group: 'display', label: 'UW-FHD', w: 2560, h: 1080 },
  { group: 'display', label: 'WUXGA', w: 1920, h: 1200 },
  { group: 'display', label: 'FHD / 1080p', w: 1920, h: 1080 },
  { group: 'display', label: 'HD+', w: 1600, h: 900 },
  { group: 'display', label: 'WXGA (筆電常見)', w: 1366, h: 768 },
  { group: 'display', label: 'HD / 720p', w: 1280, h: 720 },
  { group: 'display', label: 'XGA', w: 1024, h: 768 },

  { group: 'web', label: 'Open Graph / 社群預覽', w: 1200, h: 630 },
  { group: 'web', label: 'YouTube 縮圖', w: 1280, h: 720 },
  { group: 'web', label: 'YouTube 頻道橫幅', w: 2560, h: 1440 },
  { group: 'web', label: 'Instagram 正方形', w: 1080, h: 1080 },
  { group: 'web', label: 'Instagram 直向', w: 1080, h: 1350 },
  { group: 'web', label: 'Instagram 限時 / Reels', w: 1080, h: 1920 },
  { group: 'web', label: 'X 貼文圖片', w: 1600, h: 900 },
  { group: 'web', label: 'favicon', w: 512, h: 512 },

  { group: 'mobile', label: 'iPhone 15/16 Pro Max', w: 1290, h: 2796 },
  { group: 'mobile', label: 'iPhone 15/16 Pro', w: 1179, h: 2556 },
  { group: 'mobile', label: 'iPhone SE (2/3 代)', w: 750, h: 1334 },
  { group: 'mobile', label: 'Android FHD+ 常見', w: 1080, h: 2400 },
  { group: 'mobile', label: 'iPad 9.7" Retina', w: 2048, h: 1536 },

  { group: 'print', label: 'A4 @300dpi', w: 2480, h: 3508 },
  { group: 'print', label: 'A5 @300dpi', w: 1748, h: 2480 },
  { group: 'print', label: 'A3 @300dpi', w: 3508, h: 4961 },
  { group: 'print', label: '4×6 吋 @300dpi', w: 1200, h: 1800 },
];
