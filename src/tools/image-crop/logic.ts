/**
 * Crop, rotate, flip and resize — the geometry, with no canvas in sight.
 *
 * The pipeline is fixed, and the order matters: **crop in source pixels →
 * rotate in quarter turns → flip what you now see → scale to the output
 * size**. Every function here belongs to exactly one of those stages, and
 * `index.tsx` does nothing but feed a bitmap through them.
 *
 * Two decisions worth stating.
 *
 * A selection is whole pixels, always. A crop box of 100.4 px does not
 * describe anything a decoder can hand back, so every rectangle that leaves
 * this file is integral and at least 1x1 — a zero-width crop is not an empty
 * image, it is a bug that surfaces three steps later as a blank canvas.
 *
 * A locked ratio is honoured to the pixel, not beyond it. 16:9 inside a
 * 1000 px box is 1000x562.5, and there is no such rectangle; the code rounds
 * and says so here rather than pretending the output is exactly 16:9. Where
 * the rounding lands is documented per function, because "off by one pixel"
 * in a profile-picture crop is the difference between a circle and an oval.
 */

export type Dim = { width: number; height: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Clockwise quarter turns. Anything else is an arbitrary rotation, which
 *  needs resampling and a background fill and is a different tool. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type Flip = { horizontal: boolean; vertical: boolean };

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Same ceiling as the converter: a decoded frame is 4 bytes per pixel, and
 *  an accidental "output 40000 px wide" must not take the tab with it. */
export const PIXEL_CEILING = 40_000_000;

/** Ratio presets, as width/height. Labels stay in the UI — these are the
 *  numbers, and `1` is here so a square is a preset and not a typing job. */
export const RATIO_PRESETS: readonly { key: string; ratio: number }[] = [
  { key: '1:1', ratio: 1 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '3:2', ratio: 3 / 2 },
  { key: '16:9', ratio: 16 / 9 },
  { key: '3:4', ratio: 3 / 4 },
  { key: '2:3', ratio: 2 / 3 },
  { key: '9:16', ratio: 9 / 16 },
];

function whole(n: number): number {
  return Math.round(n);
}

/** Integral, non-negative-width form of a rectangle. A drag that went up and
 *  to the left arrives here with negative extents; it leaves as a rectangle. */
export function normalizeRect(rect: Rect): Rect {
  if (![rect.x, rect.y, rect.width, rect.height].every((n) => Number.isFinite(n))) {
    throw new RangeError('rect must be finite');
  }
  const x1 = whole(Math.min(rect.x, rect.x + rect.width));
  const y1 = whole(Math.min(rect.y, rect.y + rect.height));
  const x2 = whole(Math.max(rect.x, rect.x + rect.width));
  const y2 = whole(Math.max(rect.y, rect.y + rect.height));
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

/**
 * Push a rectangle inside `bounds`.
 *
 * Position gives way before size: a box that hangs off the right edge slides
 * left, and only shrinks once it is flush at x = 0. That is what dragging a
 * selection against the edge should feel like, and it keeps a locked ratio
 * intact in the common case.
 */
export function clampRect(rect: Rect, bounds: Dim): Rect {
  const limitW = Math.max(1, whole(bounds.width));
  const limitH = Math.max(1, whole(bounds.height));
  const base = normalizeRect(rect);
  const width = Math.min(base.width, limitW);
  const height = Math.min(base.height, limitH);
  const x = Math.min(Math.max(0, base.x), limitW - width);
  const y = Math.min(Math.max(0, base.y), limitH - height);
  return { x, y, width, height };
}

/** The rectangle spanned by two corners — the raw output of a drag. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return normalizeRect({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
}

/** Translate without resizing, staying inside the image. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Dim): Rect {
  const base = normalizeRect(rect);
  return clampRect({ x: base.x + whole(dx), y: base.y + whole(dy), width: base.width, height: base.height }, bounds);
}

/**
 * Force a rectangle to `ratio` (width / height) with its top-left pinned.
 *
 * Width leads; height follows. When the derived height would leave the image,
 * the height leads instead, and when that still does not fit the box shrinks
 * to whatever room is left. Both sides are rounded at the end, so the result
 * can be up to half a pixel off the requested ratio — unavoidable, since most
 * ratios have no integral rectangle at a given width.
 */
export function applyRatio(rect: Rect, ratio: number, bounds: Dim): Rect {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError('ratio must be a positive number');
  const base = clampRect(rect, bounds);
  const roomX = Math.max(1, whole(bounds.width) - base.x);
  const roomY = Math.max(1, whole(bounds.height) - base.y);

  let width = base.width;
  let height = width / ratio;
  if (height > roomY) {
    height = roomY;
    width = height * ratio;
  }
  if (width > roomX) {
    width = roomX;
    height = width / ratio;
  }
  return clampRect(
    { x: base.x, y: base.y, width: Math.max(1, whole(width)), height: Math.max(1, whole(height)) },
    bounds
  );
}

/** The largest rectangle of `ratio` that fits `bounds`, centred.
 *  Odd leftovers go to the right/bottom, because `Math.round` does. */
export function centeredRect(bounds: Dim, ratio: number): Rect {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError('ratio must be a positive number');
  const limitW = Math.max(1, whole(bounds.width));
  const limitH = Math.max(1, whole(bounds.height));
  let width = limitW;
  let height = width / ratio;
  if (height > limitH) {
    height = limitH;
    width = height * ratio;
  }
  const w = Math.max(1, Math.min(limitW, whole(width)));
  const h = Math.max(1, Math.min(limitH, whole(height)));
  return { x: whole((limitW - w) / 2), y: whole((limitH - h) / 2), width: w, height: h };
}

/**
 * Drag one corner, with the opposite corner nailed down.
 *
 * With `ratio` locked the box grows to *contain* the pointer rather than
 * following whichever axis moved more — dragging diagonally then feels like
 * one motion instead of the selection snapping between two interpretations.
 * Running out of room in one direction shrinks both sides together, so a
 * locked ratio survives the edge of the image (to within the pixel rounding).
 */
export function resizeRect(
  rect: Rect,
  corner: Corner,
  point: Point,
  bounds: Dim,
  ratio: number | null
): Rect {
  if (ratio !== null && (!Number.isFinite(ratio) || ratio <= 0)) {
    throw new RangeError('ratio must be a positive number or null');
  }
  const base = normalizeRect(rect);
  const anchorX = corner === 'nw' || corner === 'sw' ? base.x + base.width : base.x;
  const anchorY = corner === 'nw' || corner === 'ne' ? base.y + base.height : base.y;
  const dirX = point.x >= anchorX ? 1 : -1;
  const dirY = point.y >= anchorY ? 1 : -1;

  let width = Math.abs(point.x - anchorX);
  let height = Math.abs(point.y - anchorY);
  if (ratio !== null) {
    const side = Math.max(width, height * ratio);
    width = side;
    height = side / ratio;
  }

  const roomX = dirX > 0 ? Math.max(1, whole(bounds.width) - anchorX) : anchorX;
  const roomY = dirY > 0 ? Math.max(1, whole(bounds.height) - anchorY) : anchorY;
  if (width > roomX) {
    width = roomX;
    if (ratio !== null) height = width / ratio;
  }
  if (height > roomY) {
    height = roomY;
    if (ratio !== null) width = height * ratio;
  }

  const w = Math.max(1, whole(width));
  const h = Math.max(1, whole(height));
  return clampRect(
    { x: dirX > 0 ? anchorX : anchorX - w, y: dirY > 0 ? anchorY : anchorY - h, width: w, height: h },
    bounds
  );
}

/** Dimensions after `turns` quarter turns: odd turns swap the sides. */
export function rotateDim(dim: Dim, turns: QuarterTurns): Dim {
  const width = Math.max(1, whole(dim.width));
  const height = Math.max(1, whole(dim.height));
  return turns % 2 === 1 ? { width: height, height: width } : { width, height };
}

/** `"16:9"`, `"16/9"`, `"1.78"` → a number. Anything else → null.
 *  Zero and negatives are rejected: they are not ratios, they are typos. */
export function parseRatio(text: string): number | null {
  const cleaned = text.trim();
  if (cleaned === '') return null;
  const parts = cleaned.split(/[:/]/);
  if (parts.length === 2) {
    const w = Number(parts[0]!.trim());
    const h = Number(parts[1]!.trim());
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return w / h;
  }
  if (parts.length === 1) {
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }
  return null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(whole(a));
  let y = Math.abs(whole(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x === 0 ? 1 : x;
}

/** Smallest integer pair with the same ratio. `reduceRatio(1920, 1080)` is
 *  `[16, 9]`. Non-integral input is rounded first — there is no exact answer
 *  for 100.5:3 and pretending otherwise would print a 200-digit fraction. */
export function reduceRatio(width: number, height: number): [number, number] {
  const w = Math.max(1, whole(width));
  const h = Math.max(1, whole(height));
  const d = gcd(w, h);
  return [w / d, h / d];
}

/**
 * A ratio a person can read. `16:9` when the reduced pair is small enough to
 * mean something, `1.78:1` when it is not — `1000:563` is true and useless.
 */
export function describeRatio(width: number, height: number): string {
  const [w, h] = reduceRatio(width, height);
  if (w <= 64 && h <= 64) return `${w}:${h}`;
  const value = Math.max(1, whole(width)) / Math.max(1, whole(height));
  return `${value.toFixed(2)}:1`;
}

/** A 2D affine transform in canvas order: `setTransform(a, b, c, d, e, f)`,
 *  so `x' = a·x + c·y + e` and `y' = b·x + d·y + f`. */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function applyMatrix(m: Matrix, point: Point): Point {
  return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f };
}

/** Signed zero is arithmetically fine and visually not: a matrix printed with
 *  `-0` in it reads as a bug. Multiplying a flip by a rotation produces them. */
function unsign(n: number): number {
  return n === 0 ? 0 : n;
}

/** `second ∘ first`: apply `first`, then `second`. */
function compose(second: Matrix, first: Matrix): Matrix {
  return {
    a: unsign(second.a * first.a + second.c * first.b),
    b: unsign(second.b * first.a + second.d * first.b),
    c: unsign(second.a * first.c + second.c * first.d),
    d: unsign(second.b * first.c + second.d * first.d),
    e: unsign(second.a * first.e + second.c * first.f + second.e),
    f: unsign(second.b * first.e + second.d * first.f + second.f),
  };
}

/**
 * The transform that puts a `draw` sized image onto the output canvas rotated
 * and flipped.
 *
 * `draw` is the size the cropped image is painted at *before* rotation, so the
 * canvas is `rotateDim(draw, turns)`. Rotation is clockwise; the flips are
 * applied afterwards, in the space the viewer sees — "flip horizontally"
 * has to mean the picture in front of them, not the pre-rotation buffer, or
 * the buttons stop making sense the moment anything is rotated.
 */
export function transformFor(draw: Dim, turns: QuarterTurns, flip: Flip): Matrix {
  const dw = Math.max(1, whole(draw.width));
  const dh = Math.max(1, whole(draw.height));

  // Corners of the draw box land on the corners of the canvas.
  const rotation: Matrix =
    turns === 1
      ? { a: 0, b: 1, c: -1, d: 0, e: dh, f: 0 }
      : turns === 2
        ? { a: -1, b: 0, c: 0, d: -1, e: dw, f: dh }
        : turns === 3
          ? { a: 0, b: -1, c: 1, d: 0, e: 0, f: dw }
          : IDENTITY;

  const out = rotateDim({ width: dw, height: dh }, turns);
  let matrix = rotation;
  if (flip.horizontal) {
    matrix = compose({ a: -1, b: 0, c: 0, d: 1, e: out.width, f: 0 }, matrix);
  }
  if (flip.vertical) {
    matrix = compose({ a: 1, b: 0, c: 0, d: -1, e: 0, f: out.height }, matrix);
  }
  return matrix;
}

export type OutputRequest = { width: number | null; height: number | null };

/**
 * The final output size.
 *
 * Neither side given: the crop's own size. One side: the other follows the
 * crop's ratio. Both sides with `allowDistort` false: the largest box of the
 * crop's ratio that fits inside what was asked for — so a 4:3 crop asked for
 * 1000x1000 comes out 1000x750 rather than squashed. Both sides with
 * `allowDistort` true: exactly what was asked for, stretched.
 */
export function resolveOutput(crop: Dim, request: OutputRequest, allowDistort: boolean): Dim {
  const cw = Math.max(1, whole(crop.width));
  const ch = Math.max(1, whole(crop.height));
  const wanted = (value: number | null) =>
    value !== null && Number.isFinite(value) && value >= 1 ? whole(value) : null;
  const w = wanted(request.width);
  const h = wanted(request.height);

  if (w === null && h === null) return { width: cw, height: ch };
  if (w !== null && h === null) return { width: w, height: Math.max(1, whole((ch * w) / cw)) };
  if (w === null && h !== null) return { width: Math.max(1, whole((cw * h) / ch)), height: h };
  if (allowDistort) return { width: w!, height: h! };

  const factor = Math.min(w! / cw, h! / ch);
  return { width: Math.max(1, whole(cw * factor)), height: Math.max(1, whole(ch * factor)) };
}

export function pixels(dim: Dim): number {
  return Math.max(1, whole(dim.width)) * Math.max(1, whole(dim.height));
}

export function withinCeiling(dim: Dim): boolean {
  return pixels(dim) <= PIXEL_CEILING;
}

/** Scale from the displayed size back to real pixels. Both axes, because a
 *  container with a fractional layout width does not scale them identically. */
export function scaleFactor(from: Dim, to: Dim): Point {
  return {
    x: Math.max(1, whole(to.width)) / Math.max(1, from.width),
    y: Math.max(1, whole(to.height)) / Math.max(1, from.height),
  };
}

/**
 * A pointer position on the displayed image, in image pixels.
 *
 * `offset` is relative to the element's top-left, `box` is its rendered CSS
 * size, `image` the natural size. Results are clamped to the image, so a drag
 * that leaves the element pins to the edge instead of selecting thin air.
 */
export function pointToImage(offset: Point, box: Dim, image: Dim): Point {
  const factor = scaleFactor(box, image);
  const limitX = Math.max(1, whole(image.width));
  const limitY = Math.max(1, whole(image.height));
  return {
    x: Math.min(limitX, Math.max(0, whole(offset.x * factor.x))),
    y: Math.min(limitY, Math.max(0, whole(offset.y * factor.y))),
  };
}

/**
 * Output formats for the cropped result.
 *
 * Deliberately a separate, shorter list from the converter's: this tool is
 * about geometry, and someone cropping a screenshot wants PNG to stay PNG.
 * AVIF is left out on purpose — encoding it is slow, patchily supported, and
 * choosing a codec is what `/tools/image-convert` is for.
 */
export type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['image/png', 'image/jpeg', 'image/webp'];

export const OUTPUT_LABEL: Readonly<Record<OutputFormat, string>> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

export const OUTPUT_EXT: Readonly<Record<OutputFormat, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function isLossy(format: OutputFormat): boolean {
  return format !== 'image/png';
}

/**
 * Did the canvas hand back a different type than the one requested?
 *
 * `toBlob` and `convertToBlob` are specified to fall back to `image/png` for a
 * format they cannot encode, and they do it silently — so a WebP output on a
 * browser with no WebP encoder is a PNG named `.webp`. Comparing the blob's
 * own type against the request is the only way to notice. Parameters are
 * stripped because a browser may answer `image/jpeg;charset=binary`.
 */
export function isSilentFallback(requested: string, produced: string): boolean {
  const clean = (value: string) => value.split(';')[0]!.trim().toLowerCase();
  return clean(requested) !== clean(produced);
}

/** JPEG has no alpha, so a transparent crop has to be flattened first. */
export function dropsAlpha(format: OutputFormat): boolean {
  return format === 'image/jpeg';
}

/** `photo.png` → `photo-crop.jpg`. The suffix is there because the output
 *  lands in the same folder as the input often enough to matter. */
export function cropName(name: string, format: OutputFormat): string {
  const trimmed = name.trim() === '' ? 'image' : name.trim();
  const dot = trimmed.lastIndexOf('.');
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${stem}-crop.${OUTPUT_EXT[format]}`;
}
