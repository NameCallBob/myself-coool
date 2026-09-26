/**
 * The arithmetic behind re-encoding an image, with none of the canvas.
 *
 * Everything a browser can do — decode a file into pixels, hand those pixels
 * to an encoder — lives in `index.tsx`, because it needs `ImageBitmap` and a
 * canvas and neither exists under `node --test`. What is left here is the part
 * that is easy to get quietly wrong: which target sizes preserve the aspect
 * ratio, what "70% smaller" actually means, and how to find the highest
 * quality that still fits a byte budget.
 *
 * Two honesty rules shaped this file.
 *
 * First, a browser canvas silently substitutes PNG when it cannot encode the
 * format you asked for — `toBlob(cb, 'image/avif')` in a browser without an
 * AVIF encoder hands back a PNG, usually several times *larger* than the
 * source, with no error anywhere. `isSilentFallback` exists so the UI can
 * catch that and say so instead of presenting the PNG as an AVIF.
 *
 * Second, the target-size search below bisects on quality assuming that a
 * higher quality never produces a smaller file. That holds for JPEG, WebP and
 * AVIF in practice but is not guaranteed by anything, so the search never
 * *predicts* a size: it only ever reports a quality whose byte count was
 * actually measured (`best.bytes`). A budget we could not reach comes back as
 * `best: null` rather than as a near miss dressed up as a hit.
 */

/** The four raster formats a browser canvas may be able to encode. */
export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export const FORMATS: readonly ImageFormat[] = ['image/webp', 'image/avif', 'image/jpeg', 'image/png'];

export const FORMAT_LABEL: Readonly<Record<ImageFormat, string>> = {
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
};

export const FORMAT_EXT: Readonly<Record<ImageFormat, string>> = {
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Whether the `quality` argument means anything for this format.
 *
 *  PNG is lossless, so canvas ignores quality for it entirely — a UI that
 *  leaves the slider enabled there is lying about what the number does. */
export function isLossy(format: ImageFormat): boolean {
  return format !== 'image/png';
}

/** Whether the format discards alpha. JPEG has no alpha channel, so a
 *  transparent source has to be flattened onto something first. */
export function dropsAlpha(format: ImageFormat): boolean {
  return format === 'image/jpeg';
}

export type Dim = { width: number; height: number };

export type ResizeMode = 'none' | 'longest' | 'width' | 'height' | 'scale';

/** Decoded pixels cost 4 bytes each, so a 40 MP image is already 160 MB of
 *  RGBA before an encoder has copied anything. Past this we refuse rather
 *  than let the tab die holding several of those at once. */
export const PIXEL_CEILING = 40_000_000;

export const QUALITY_FLOOR = 0.05;
export const QUALITY_CEILING = 1;
/** Seven halvings of 0..1 land within 0.01, which is finer than any encoder's
 *  quality knob actually resolves. */
export const QUALITY_SEARCH_ROUNDS = 7;

/** A dimension is a whole number of pixels, and zero pixels is not an image. */
function px(n: number): number {
  return Math.max(1, Math.round(n));
}

/** Scale `source` by `factor`, keeping both sides whole.
 *
 *  Rounding each side independently changes the ratio by up to half a pixel,
 *  which is the smallest error available: there is no whole-pixel pair that
 *  holds an arbitrary ratio exactly. */
export function scaleBy(source: Dim, factor: number): Dim {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('factor must be a positive number');
  return { width: px(source.width * factor), height: px(source.height * factor) };
}

/**
 * The output dimensions for one resize setting.
 *
 * `value` is pixels for `longest`/`width`/`height` and percent for `scale`.
 * With `allowUpscale` false — the default in the UI, because enlarging never
 * adds detail — a request bigger than the source returns the source untouched
 * rather than clamping one side and skewing the ratio.
 */
export function outputSize(
  source: Dim,
  mode: ResizeMode,
  value: number,
  allowUpscale = false
): Dim {
  const width = px(source.width);
  const height = px(source.height);
  const base = { width, height };
  if (mode === 'none') return base;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('value must be a positive number');

  if (mode === 'scale') {
    const factor = value / 100;
    if (!allowUpscale && factor >= 1) return base;
    return scaleBy(base, factor);
  }

  const side = mode === 'longest' ? Math.max(width, height) : mode === 'width' ? width : height;
  if (!allowUpscale && value >= side) return base;
  return scaleBy(base, value / side);
}

export function pixels(dim: Dim): number {
  return px(dim.width) * px(dim.height);
}

export function megapixels(dim: Dim): number {
  return pixels(dim) / 1_000_000;
}

/** RGBA bytes a decoded frame of this size occupies. The ceiling check and
 *  the memory warning both read this. */
export function decodedBytes(dim: Dim): number {
  return pixels(dim) * 4;
}

export function withinCeiling(dim: Dim): boolean {
  return pixels(dim) <= PIXEL_CEILING;
}

export function clampQuality(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(QUALITY_CEILING, Math.max(QUALITY_FLOOR, Math.round(value * 100) / 100));
}

export type SizeDelta = {
  /** Positive when the output is smaller than the source. */
  savedBytes: number;
  /** Share of the source removed, 0..1. Negative when the output grew. */
  savedRatio: number;
  /** Output as a share of the source. 0.3 means "30% of the original". */
  remainingRatio: number;
  verdict: 'smaller' | 'larger' | 'same';
};

/**
 * Before/after in the three shapes people mean by "compression rate".
 *
 * "Compressed 70%" is ambiguous — it can mean the output is 70% of the source
 * or 30% of it — so both numbers are returned and the UI labels each.
 */
export function sizeDelta(before: number, after: number): SizeDelta {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) {
    throw new RangeError('sizes must be non-negative finite numbers');
  }
  const savedBytes = before - after;
  const savedRatio = before === 0 ? 0 : savedBytes / before;
  const remainingRatio = before === 0 ? 0 : after / before;
  const verdict = after < before ? 'smaller' : after > before ? 'larger' : 'same';
  return { savedBytes, savedRatio, remainingRatio, verdict };
}

/** Encoded bits per pixel — the size reading that survives a resize.
 *  Comparing raw file sizes across different output dimensions says nothing
 *  about how hard the encoder worked; this does. */
export function bitsPerPixel(byteCount: number, dim: Dim): number {
  if (!Number.isFinite(byteCount) || byteCount < 0) throw new RangeError('byteCount must be non-negative');
  return (byteCount * 8) / pixels(dim);
}

/** The name to save as: original stem, extension of the chosen format.
 *  A stem with dots keeps all but the last segment; a dotfile keeps its name. */
export function renameFor(name: string, format: ImageFormat): string {
  const ext = FORMAT_EXT[format];
  const trimmed = name.trim() === '' ? 'image' : name.trim();
  const dot = trimmed.lastIndexOf('.');
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${stem}.${ext}`;
}

/**
 * Did the canvas hand back something other than what we asked for?
 *
 * `HTMLCanvasElement.toBlob` and `OffscreenCanvas.convertToBlob` are both
 * specified to fall back to `image/png` for a type they cannot encode, and
 * neither signals it. Comparing the blob's own reported type against the
 * request is the only detection available. Parameters are stripped because a
 * browser may answer `image/jpeg;charset=utf-8`-style strings.
 */
export function isSilentFallback(requested: string, produced: string): boolean {
  const clean = (s: string) => s.split(';')[0]!.trim().toLowerCase();
  return clean(requested) !== clean(produced);
}

export type QualitySearch = {
  /** Quality to encode at next. Meaningful only while `done` is false. */
  quality: number;
  /** Highest quality already measured as fitting the budget (0 = none yet). */
  lo: number;
  /** Lowest quality already measured as overshooting the budget. */
  hi: number;
  /** Best measured fit so far. `null` means nothing fit — including the floor. */
  best: { quality: number; bytes: number } | null;
  /** Encodes already spent. */
  rounds: number;
  done: boolean;
};

/** Start a budget search. 0.8 is the first probe because most photos land
 *  near it, so the common case converges in two or three encodes. */
export function startQualitySearch(first = 0.8): QualitySearch {
  return {
    quality: clampQuality(first),
    lo: 0,
    hi: QUALITY_CEILING,
    best: null,
    rounds: 0,
    done: false,
  };
}

/**
 * Fold one measured encode into the search and say what to try next.
 *
 * Bisection on quality, assuming size grows with quality. When that
 * assumption misbehaves the search still cannot lie: `best` only ever holds a
 * quality whose byte count was handed in here, so a reported hit is always a
 * measured hit. `best: null` on a finished search means the budget was not
 * reachable at this size — the caller should offer a resize, not a rounder
 * number.
 */
export function advanceQualitySearch(
  state: QualitySearch,
  measuredBytes: number,
  budgetBytes: number,
  maxRounds = QUALITY_SEARCH_ROUNDS
): QualitySearch {
  if (state.done) return state;
  if (!Number.isFinite(measuredBytes) || measuredBytes < 0) {
    throw new RangeError('measuredBytes must be non-negative');
  }
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) {
    throw new RangeError('budgetBytes must be positive');
  }

  const fits = measuredBytes <= budgetBytes;
  const best =
    fits && (state.best === null || state.quality > state.best.quality)
      ? { quality: state.quality, bytes: measuredBytes }
      : state.best;
  const lo = fits ? Math.max(state.lo, state.quality) : state.lo;
  const hi = fits ? state.hi : Math.min(state.hi, state.quality);
  const rounds = state.rounds + 1;

  // Bisect in whole percent. Halving the floats instead puts the midpoint of
  // 0.30 and 0.35 at 0.32499999999999996, which rounds to 0.32 and loses the
  // 0.33 that would have fit — an off-by-one the user would see as a slightly
  // worse image for no reason.
  const loPct = Math.round(lo * 100);
  const hiPct = Math.round(hi * 100);
  const next = clampQuality(Math.round((loPct + hiPct) / 2) / 100);

  // Stop when the bracket is narrower than the encoder can resolve, when the
  // bisection would re-measure the quality we just measured, or when the
  // round budget runs out. Any of the three means further encodes are waste.
  //
  // `hi` starts at 1 as an *unmeasured* bound, so a budget nothing overshoots
  // converges to 0.99 rather than 1: the search will not claim the ceiling it
  // never tried. Someone who wants a straight quality-1 encode turns the
  // budget off.
  const done = rounds >= maxRounds || hiPct - loPct <= 2 || next === state.quality;

  return { quality: next, lo, hi, best, rounds, done };
}
