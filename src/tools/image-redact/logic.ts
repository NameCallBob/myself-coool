/**
 * Redaction that destroys pixels.
 *
 * The distinction this file exists to enforce: drawing a black rectangle *over*
 * an image in a PDF, a slide or an SVG leaves the original pixels underneath,
 * one "remove object" away from being read back. Here the marks are applied to
 * the RGBA buffer itself and the buffer is re-encoded, so the output file has no
 * layer to peel and no earlier version of those pixels in it.
 *
 * Two mark kinds, and they are not equally safe:
 *
 *  - `solid` writes one colour over every pixel in the rectangle. The original
 *    values are gone; nothing about them survives except the rectangle's shape.
 *  - `mosaic` replaces each block with the alpha-weighted mean of that block,
 *    written opaque for the same reason as above. That is a real
 *    loss of information — a mean is not invertible — but it is a *reduction*,
 *    not an erasure: the block means are still there, and for short, known-font
 *    text with a small block size an attacker can render candidate strings,
 *    average them the same way and compare. Solid is the honest choice for text.
 *    The UI says so; this comment is why.
 *
 * Everything here is pure: it takes an RGBA byte array and returns a new one, so
 * the same functions run in the browser and in the tests with no canvas.
 */

/** 40 megapixels: beyond this, a redraw per pointer move stops being smooth. */
export const MAX_PIXELS = 40_000_000;
/** A drag shorter than this in image pixels is treated as a click, not a mark. */
export const MIN_RECT = 3;
/** Mosaic block size default, in image pixels. */
export const DEFAULT_BLOCK = 12;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type MarkKind = 'solid' | 'mosaic';

export type Mark = {
  kind: MarkKind;
  rect: Rect;
  /** Solid fill colour as `#rrggbb`. Ignored by mosaic marks. */
  color?: string;
  /** Mosaic block size in image pixels. Ignored by solid marks. */
  block?: number;
};

/** A box on screen, in the coordinates `getBoundingClientRect` hands back. */
export type Box = { left: number; top: number; width: number; height: number };

/**
 * The rectangle between two drag points, in whole pixels.
 *
 * Dragging up or left is normal, so the corners are sorted rather than assumed;
 * `Math.round` rather than `floor` keeps the mark where the cursor looked.
 */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x1 = Math.round(Math.min(a.x, b.x));
  const y1 = Math.round(Math.min(a.y, b.y));
  const x2 = Math.round(Math.max(a.x, b.x));
  const y2 = Math.round(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * The part of a rectangle that is inside the image, or null if none of it is.
 *
 * Every pixel loop in this file runs over a clamped rectangle, which is what
 * makes a drag that leaves the canvas harmless instead of an out-of-bounds
 * write into the next row.
 */
export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x1 = Math.max(0, Math.min(Math.round(rect.x), width));
  const y1 = Math.max(0, Math.min(Math.round(rect.y), height));
  const x2 = Math.max(0, Math.min(Math.round(rect.x + rect.w), width));
  const y2 = Math.max(0, Math.min(Math.round(rect.y + rect.h), height));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return null;
  return { x: x1, y: y1, w, h };
}

/**
 * A pointer position in client coordinates → a position in image pixels.
 *
 * The canvas is displayed at whatever width the column gives it, so the
 * displayed box and the pixel grid are different sizes; marks must be stored in
 * image pixels, or they would move when the window is resized.
 */
export function mapToImage(point: Point, box: Box, width: number, height: number): Point {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  const x = ((point.x - box.left) / box.width) * width;
  const y = ((point.y - box.top) / box.height) * height;
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  };
}

/** `#rrggbb` or `#rgb` → three channel values. Throws on anything else. */
export function parseHexColor(color: string): [number, number, number] {
  const text = color.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(text);
  if (short) {
    const [r, g, b] = [...short[1]].map((c) => Number.parseInt(c + c, 16));
    return [r, g, b];
  }
  const full = /^#([0-9a-f]{6})$/.exec(text);
  if (!full) throw new Error(`not a #rrggbb colour: ${JSON.stringify(color)}`);
  return [
    Number.parseInt(full[1].slice(0, 2), 16),
    Number.parseInt(full[1].slice(2, 4), 16),
    Number.parseInt(full[1].slice(4, 6), 16),
  ];
}

/** Writes one opaque colour over the rectangle. In place. */
export function applySolid(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  color: string
): number {
  const area = clampRect(rect, width, height);
  if (!area) return 0;
  const [r, g, b] = parseHexColor(color);
  for (let y = area.y; y < area.y + area.h; y += 1) {
    let at = (y * width + area.x) * 4;
    for (let x = 0; x < area.w; x += 1) {
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
      // Opaque on purpose: a semi-transparent mask over a transparent PNG would
      // leave the original showing through whatever is composited behind it.
      pixels[at + 3] = 255;
      at += 4;
    }
  }
  return area.w * area.h;
}

/**
 * Replaces each block inside the rectangle with that block's mean colour.
 *
 * The grid is aligned to the image origin, not to the rectangle, so two marks
 * that overlap produce one continuous mosaic rather than a visible seam. Cells
 * are clipped to the rectangle, so the mean never draws on colours from outside
 * the area the user selected.
 *
 * Alpha is written 255, exactly as `applySolid` does, and for the same two
 * reasons. A half-transparent block changes brightness against whatever it is
 * composited on, and — worse for a redaction tool — an averaged alpha channel
 * still carries the transparent/opaque boundary that was inside the mark, so the
 * shape survives the mean that was supposed to destroy it.
 *
 * The colour mean is therefore weighted by alpha: a fully transparent pixel
 * carries RGB that was never visible (canvas hands back zeroes), and letting it
 * into an unweighted mean would drag the block toward black for no reason. A
 * block where nothing was visible at all has no weights to use, so it falls back
 * to the plain mean — still opaque, because a transparent hole left in the
 * middle of a mosaic is the shape clue again.
 */
export function applyMosaic(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  block: number
): number {
  const area = clampRect(rect, width, height);
  if (!area) return 0;
  const size = Math.max(2, Math.floor(block));
  const startX = Math.floor(area.x / size) * size;
  const startY = Math.floor(area.y / size) * size;
  for (let cellY = startY; cellY < area.y + area.h; cellY += size) {
    for (let cellX = startX; cellX < area.x + area.w; cellX += size) {
      const x1 = Math.max(cellX, area.x);
      const y1 = Math.max(cellY, area.y);
      const x2 = Math.min(cellX + size, area.x + area.w);
      const y2 = Math.min(cellY + size, area.y + area.h);
      if (x2 <= x1 || y2 <= y1) continue;
      // Weighted sums for the alpha-aware mean, plain sums for the fallback.
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = y1; y < y2; y += 1) {
        let at = (y * width + x1) * 4;
        for (let x = x1; x < x2; x += 1) {
          const alpha = pixels[at + 3];
          wr += pixels[at] * alpha;
          wg += pixels[at + 1] * alpha;
          wb += pixels[at + 2] * alpha;
          sa += alpha;
          sr += pixels[at];
          sg += pixels[at + 1];
          sb += pixels[at + 2];
          at += 4;
        }
      }
      const n = (x2 - x1) * (y2 - y1);
      const r = sa === 0 ? Math.round(sr / n) : Math.round(wr / sa);
      const g = sa === 0 ? Math.round(sg / n) : Math.round(wg / sa);
      const b = sa === 0 ? Math.round(sb / n) : Math.round(wb / sa);
      for (let y = y1; y < y2; y += 1) {
        let at = (y * width + x1) * 4;
        for (let x = x1; x < x2; x += 1) {
          pixels[at] = r;
          pixels[at + 1] = g;
          pixels[at + 2] = b;
          pixels[at + 3] = 255;
          at += 4;
        }
      }
    }
  }
  return area.w * area.h;
}

/** Applies marks in order to a copy, leaving the source buffer untouched. */
export function redactedCopy(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  marks: Mark[]
): Uint8Array {
  if (pixels.length < width * height * 4) {
    throw new Error(`buffer holds ${pixels.length} bytes, ${width}×${height} RGBA needs ${width * height * 4}`);
  }
  const out = new Uint8Array(width * height * 4);
  out.set(pixels.subarray(0, out.length));
  for (const mark of marks) {
    if (mark.kind === 'solid') applySolid(out, width, height, mark.rect, mark.color ?? '#000000');
    else applyMosaic(out, width, height, mark.rect, mark.block ?? DEFAULT_BLOCK);
  }
  return out;
}

/**
 * How many distinct pixels the marks cover.
 *
 * Summing the areas would double-count overlaps and overstate the coverage, and
 * this number is the readout the user judges the result by, so it is counted
 * with a one-byte-per-pixel mask instead.
 */
export function coveredPixels(width: number, height: number, marks: Mark[]): number {
  if (width <= 0 || height <= 0) return 0;
  const mask = new Uint8Array(width * height);
  for (const mark of marks) {
    const area = clampRect(mark.rect, width, height);
    if (!area) continue;
    for (let y = area.y; y < area.y + area.h; y += 1) {
      mask.fill(1, y * width + area.x, y * width + area.x + area.w);
    }
  }
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) total += mask[i];
  return total;
}

/** `shot.png` → `shot.redacted.png`, and the extension follows the encoder. */
export function outputName(name: string, extension: 'png' | 'jpg'): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.redacted.${extension}`;
}

/** Guard for the decode step: a megapixel count no laptop should be asked for. */
export function tooLarge(width: number, height: number): boolean {
  return width * height > MAX_PIXELS;
}
