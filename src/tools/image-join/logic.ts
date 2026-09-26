/**
 * Joining images is a layout problem, not a pixel problem: once you know the
 * canvas size and where each image lands, the drawing is three lines of canvas
 * calls. So all the arithmetic lives here, where it can be pinned by tests,
 * and `index.tsx` only decodes files and calls `drawImage`.
 *
 * Vocabulary used throughout: the **main axis** is the direction images are
 * laid along (downwards when vertical), the **cross axis** is the other one.
 * A vertical join therefore stacks heights and aligns widths.
 */

export type Size = { width: number; height: number };

export type Orientation = 'vertical' | 'horizontal';

/** Where a narrower image sits inside the cross-axis extent. */
export type Align = 'start' | 'center' | 'end';

/**
 * What to do when the images disagree on the cross axis.
 *  - `none`: leave every image at its own size; background shows through.
 *  - `min`:  scale everything down to the narrowest (shortest) one.
 *  - `max`:  scale everything up to the widest (tallest) one.
 */
export type CrossFit = 'none' | 'min' | 'max';

export type JoinOptions = {
  orientation: Orientation;
  /** Space between neighbours, in pixels. */
  gap: number;
  /** Border around the whole sheet, in pixels. */
  padding: number;
  align: Align;
  fit: CrossFit;
};

export type Placement = {
  /** Index into the input list, so the caller can keep its own order. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type JoinLayout = {
  canvas: Size;
  placements: Placement[];
  /** True when at least one image is drawn at a size other than its own. */
  scaled: boolean;
};

/**
 * What a canvas is realistically allowed to be.
 *
 * These are not the spec's numbers — the spec has none. Chrome tolerates very
 * long strips, Safari on iOS has historically refused anything past roughly
 * 16 777 216 pixels of area and hands back a blank bitmap rather than an
 * error, which is the worst possible failure for a tool like this. So the
 * numbers below are a warning threshold, not a hard gate: the UI states them
 * and lets the user decide.
 */
export const CANVAS_LIMITS = { maxSide: 16384, maxArea: 33_554_432 } as const;

export type LayoutCheck = {
  pixels: number;
  /** `side` — one dimension is too long; `area` — too many pixels overall. */
  exceeded: ('side' | 'area')[];
};

function assertSize(size: Size, where: string): void {
  for (const key of ['width', 'height'] as const) {
    const v = size[key];
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`${where}: ${key} must be a finite positive number, got ${String(v)}`);
    }
  }
}

function assertSpacing(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0, got ${String(value)}`);
  }
  return Math.round(value);
}

const crossOf = (size: Size, orientation: Orientation): number =>
  orientation === 'vertical' ? size.width : size.height;

const mainOf = (size: Size, orientation: Orientation): number =>
  orientation === 'vertical' ? size.height : size.width;

const roundSize = (size: Size): Size => ({
  width: Math.max(1, Math.round(size.width)),
  height: Math.max(1, Math.round(size.height)),
});

/**
 * Resize so the cross-axis extent becomes `target`, keeping the aspect ratio.
 *
 * Both sides are rounded to whole pixels and floored at 1: a 2000×30 banner
 * scaled to 40 px wide would otherwise come out 0 px tall and vanish.
 */
export function scaleToCross(size: Size, target: number, orientation: Orientation): Size {
  assertSize(size, 'scaleToCross');
  if (!Number.isFinite(target) || target <= 0) {
    throw new RangeError(`scaleToCross: target must be a finite positive number, got ${String(target)}`);
  }
  const cross = crossOf(size, orientation);
  const main = mainOf(size, orientation);
  const factor = target / cross;
  const newCross = Math.max(1, Math.round(target));
  const newMain = Math.max(1, Math.round(main * factor));
  return orientation === 'vertical'
    ? { width: newCross, height: newMain }
    : { width: newMain, height: newCross };
}

/**
 * The cross-axis extent every image is scaled to, or `null` for `fit: 'none'`
 * (each image keeps its own size).
 */
export function crossTarget(sizes: Size[], fit: CrossFit, orientation: Orientation): number | null {
  if (fit === 'none' || sizes.length === 0) return null;
  sizes.forEach((size, i) => assertSize(size, `crossTarget[${i}]`));
  const values = sizes.map((size) => crossOf(size, orientation));
  const target = fit === 'min' ? Math.min(...values) : Math.max(...values);
  return Math.max(1, Math.round(target));
}

/**
 * Offset of an image inside the leftover cross-axis space.
 *
 * `center` floors rather than rounds, so an odd leftover puts the extra pixel
 * on the far side instead of pushing the image past the canvas edge.
 */
export function alignOffset(free: number, align: Align): number {
  if (!Number.isFinite(free) || free <= 0) return 0;
  if (align === 'start') return 0;
  if (align === 'end') return Math.round(free);
  return Math.floor(free / 2);
}

/**
 * Work out the sheet size and every image's box.
 *
 * An empty list gives a 0×0 canvas rather than a padding-sized empty sheet:
 * there is nothing to join, and a blank rectangle would be a lie.
 */
export function planJoin(sizes: Size[], options: JoinOptions): JoinLayout {
  const gap = assertSpacing(options.gap, 'gap');
  const padding = assertSpacing(options.padding, 'padding');
  const { orientation, align, fit } = options;

  if (sizes.length === 0) {
    return { canvas: { width: 0, height: 0 }, placements: [], scaled: false };
  }
  sizes.forEach((size, i) => assertSize(size, `planJoin[${i}]`));

  const target = crossTarget(sizes, fit, orientation);
  const placed = sizes.map((size) =>
    target === null ? roundSize(size) : scaleToCross(size, target, orientation)
  );

  const crossExtent = Math.max(...placed.map((size) => crossOf(size, orientation)));
  const mainExtent =
    placed.reduce((sum, size) => sum + mainOf(size, orientation), 0) + gap * (placed.length - 1);

  const canvas =
    orientation === 'vertical'
      ? { width: crossExtent + padding * 2, height: mainExtent + padding * 2 }
      : { width: mainExtent + padding * 2, height: crossExtent + padding * 2 };

  const placements: Placement[] = [];
  let cursor = padding;
  placed.forEach((size, index) => {
    const offset = padding + alignOffset(crossExtent - crossOf(size, orientation), align);
    placements.push(
      orientation === 'vertical'
        ? { index, x: offset, y: cursor, width: size.width, height: size.height }
        : { index, x: cursor, y: offset, width: size.width, height: size.height }
    );
    cursor += mainOf(size, orientation) + gap;
  });

  const scaled = placed.some((size, i) => {
    const original = roundSize(sizes[i]);
    return size.width !== original.width || size.height !== original.height;
  });

  return { canvas, placements, scaled };
}

/** Pixel count and which of the practical canvas ceilings this layout passes. */
export function checkLayout(
  layout: JoinLayout,
  limits: { maxSide: number; maxArea: number } = CANVAS_LIMITS
): LayoutCheck {
  const { width, height } = layout.canvas;
  const pixels = width * height;
  const exceeded: ('side' | 'area')[] = [];
  if (width > limits.maxSide || height > limits.maxSide) exceeded.push('side');
  if (pixels > limits.maxArea) exceeded.push('area');
  return { pixels, exceeded };
}

/**
 * Move one item in a list, returning a new list.
 *
 * Reordering is the other half of joining images — nobody gets the file picker
 * order right first time — and off-by-one mistakes here silently swap pages of
 * a screenshot, so it is a tested function rather than inline splices.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const target = Math.min(items.length - 1, Math.max(0, to));
  if (target === from) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * A normalised `#rrggbb` string, or `null` if it is not one.
 *
 * Only the six-digit hex form is accepted: the value goes straight into
 * `ctx.fillStyle`, where anything unparseable is silently ignored and the
 * background would come out transparent black without a word of warning.
 */
export function normalizeHexColor(input: string): string | null {
  const text = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
  return null;
}
