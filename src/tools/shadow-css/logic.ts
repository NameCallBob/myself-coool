/**
 * box-shadow, border-radius and border, as text you can paste back in.
 *
 * Two things here are more than string building. The first is that a single
 * shadow layer never looks like a shadow: real penumbrae fall off gradually,
 * and one `0 4px 8px rgba(0,0,0,.2)` has a hard shoulder where the blur ends.
 * Stacking several layers whose offsets grow and whose opacities decay
 * approximates the falloff, and `buildElevation` does exactly that with the
 * ratios exposed rather than hidden.
 *
 * The second is the shorthand. `border-radius` collapses four corners to one,
 * two or three values by a rule that is easy to get subtly wrong, and getting
 * it wrong produces CSS that is valid and draws a different shape. The
 * collapsing is done here, with tests against every arrangement.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

export type Layer = {
  /** Offsets, blur and spread, in px. */
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: Rgba;
  inset: boolean;
};

export const MAX_LAYERS = 8;

/* ── Colours ──────────────────────────────── */

const clampByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const clampUnit = (v: number) => Math.min(1, Math.max(0, v));

export function toHex8(color: Rgba): string {
  const h = (v: number) => clampByte(v).toString(16).padStart(2, '0');
  const base = `#${h(color.r)}${h(color.g)}${h(color.b)}`;
  return color.a >= 1 ? base : base + h(clampUnit(color.a) * 255);
}

/** `rgb(r g b / a)`, the form that reads clearly in a shadow list. */
export function toRgbaString(color: Rgba): string {
  const a = clampUnit(color.a);
  const alpha = a >= 1 ? '' : ` / ${Number(a.toFixed(3))}`;
  return `rgb(${clampByte(color.r)} ${clampByte(color.g)} ${clampByte(color.b)}${alpha})`;
}

const NAMES: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  transparent: [0, 0, 0],
  currentcolor: [0, 0, 0],
};

/** hex (3/4/6/8), rgb(), rgba() and a few names. Enough for shadow colours. */
export function parseRgba(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMES[text]) {
    const [r, g, b] = NAMES[text];
    return { r, g, b, a: 1 };
  }

  const hex = text.replace(/^#/, '');
  if (/^[0-9a-f]+$/.test(hex) && (text.startsWith('#') || [3, 4, 6, 8].includes(hex.length))) {
    const dup = (s: string) => Number.parseInt(s + s, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: dup(hex[0]),
        g: dup(hex[1]),
        b: dup(hex[2]),
        a: hex.length === 4 ? dup(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const at = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
      return {
        r: at(0),
        g: at(2),
        b: at(4),
        a: hex.length === 8 ? at(6) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/.exec(text);
  if (!fn) return null;
  const slash = fn[2].indexOf('/');
  const head = slash === -1 ? fn[2] : fn[2].slice(0, slash);
  let alphaToken = slash === -1 ? undefined : fn[2].slice(slash + 1).trim();
  const parts = head.replace(/,/g, ' ').trim().split(/\s+/).filter((s) => s !== '');
  if (alphaToken === undefined && parts.length === 4) alphaToken = parts.pop();
  if (parts.length !== 3) return null;

  const value = (token: string, ref: number): number | null => {
    if (token === 'none') return 0;
    const v = token.endsWith('%') ? (Number(token.slice(0, -1)) / 100) * ref : Number(token);
    return Number.isFinite(v) ? v : null;
  };
  const a = (() => {
    if (alphaToken === undefined) return 1;
    const v = value(alphaToken, 1);
    return v === null ? 1 : clampUnit(v);
  })();

  if (fn[1] === 'rgb' || fn[1] === 'rgba') {
    const v = parts.map((p) => value(p, 255));
    if (v.some((x) => x === null)) return null;
    const [r, g, b] = v as number[];
    return { r, g, b, a };
  }

  const h = value(parts[0].replace(/deg$/, ''), 360);
  const s = value(parts[1], 100);
  const li = value(parts[2], 100);
  if (h === null || s === null || li === null) return null;
  const hue = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const amp = (s / 100) * Math.min(li / 100, 1 - li / 100);
    return (li / 100 - amp * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return { r: f(0), g: f(8), b: f(4), a };
}

/* ── Lengths ──────────────────────────────── */

/** Drops the trailing zeros a slider produces: `2px`, not `2.00px`. */
function px(n: number): string {
  const v = Number(n.toFixed(2));
  return v === 0 ? '0' : `${v}px`;
}

/* ── One shadow list ──────────────────────── */

/**
 * One layer in the canonical order.
 *
 * Offsets come first and the colour last, which is the order every stylesheet
 * writes even though CSS allows the colour anywhere. `spread` is written only
 * when it is not zero, because `0 1px 2px 0 black` is noise.
 */
export function formatLayer(layer: Layer): string {
  const parts: string[] = [];
  if (layer.inset) parts.push('inset');
  parts.push(px(layer.x), px(layer.y), px(layer.blur));
  if (Number(layer.spread.toFixed(2)) !== 0) parts.push(px(layer.spread));
  parts.push(toRgbaString(layer.color));
  return parts.join(' ');
}

export function formatShadow(layers: readonly Layer[], multiline = false): string {
  if (layers.length === 0) return 'none';
  const list = layers.map(formatLayer);
  return multiline ? list.join(',\n  ') : list.join(', ');
}

/** Splits a comma-separated value without cutting inside `rgb(…)`. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** Splits on whitespace, but not inside `rgb(…)` — where the modern syntax
 *  puts spaces and slashes that are part of a single token. */
function tokenize(chunk: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of chunk) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && /\s/.test(ch)) {
      if (current !== '') out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current !== '') out.push(current);
  return out;
}

export type ParseResult =
  | { ok: true; layers: Layer[] }
  | { ok: false; error: string; layer: number };

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+))(px)?$/;

/**
 * Reads a `box-shadow` value back into layers.
 *
 * Only px lengths are accepted. em, rem and other relative units are legal CSS
 * but their pixel value depends on where the rule lands, and an editor with
 * numeric sliders cannot honestly represent one — so they are rejected with a
 * message instead of being silently converted at some assumed root size.
 */
export function parseShadow(input: string): ParseResult {
  const text = input.trim();
  if (text === '' || text.toLowerCase() === 'none') return { ok: true, layers: [] };

  const layers: Layer[] = [];
  const chunks = splitTopLevel(text);
  if (chunks.length > MAX_LAYERS) {
    return { ok: false, error: `more than ${MAX_LAYERS} layers`, layer: MAX_LAYERS };
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const tokens = tokenize(chunks[index]);
    let inset = false;
    const lengths: number[] = [];
    let color: Rgba | null = null;

    for (const token of tokens) {
      if (token.toLowerCase() === 'inset') {
        if (inset) return { ok: false, error: 'inset given twice', layer: index };
        inset = true;
        continue;
      }
      const length = LENGTH.exec(token);
      if (length) {
        if (length[2] === undefined && Number(length[1]) !== 0) {
          return { ok: false, error: `“${token}” needs a unit`, layer: index };
        }
        if (lengths.length === 4) return { ok: false, error: 'more than four lengths', layer: index };
        lengths.push(Number(length[1]));
        continue;
      }
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:r?em|%|pt|vh|vw|ch|ex)$/i.test(token)) {
        return {
          ok: false,
          error: `“${token}”: only px is supported here`,
          layer: index,
        };
      }
      const parsed = parseRgba(token);
      if (!parsed) return { ok: false, error: `“${token}” is not a colour`, layer: index };
      if (color) return { ok: false, error: 'two colours in one layer', layer: index };
      color = parsed;
    }

    if (lengths.length < 2) {
      return { ok: false, error: 'a layer needs at least an x and a y offset', layer: index };
    }
    layers.push({
      x: lengths[0],
      y: lengths[1],
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      // An omitted colour means `currentColor` in CSS; black is the honest
      // stand-in for an editor that has no surrounding text colour to read.
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
      inset,
    });
  }
  return { ok: true, layers };
}

/* ── Elevation ────────────────────────────── */

export type Elevation = {
  /** How many layers to stack, 1 to MAX_LAYERS. */
  layers: number;
  /** Vertical offset of the largest layer, px. */
  distance: number;
  /** Blur as a multiple of each layer's own offset. */
  blurRatio: number;
  /** Total opacity: the layer opacities sum to this. */
  alpha: number;
  /** How fast opacity decays from the nearest layer to the furthest, 0..1. */
  falloff: number;
  color: Rgba;
  spread: number;
};

export const DEFAULT_ELEVATION: Elevation = {
  layers: 4,
  distance: 16,
  blurRatio: 2,
  alpha: 0.24,
  falloff: 0.62,
  color: { r: 20, g: 18, b: 14, a: 1 },
  spread: 0,
};

/**
 * A stack that approximates a penumbra instead of drawing a fog bank.
 *
 * Each layer's offset doubles, so the set spans a factor of 2^(n−1) and the
 * largest one lands exactly at `distance`. Opacity decays geometrically the
 * other way — the tight layer nearest the object is the strongest — and the
 * opacities are normalised so they sum to the total you asked for, which keeps
 * the darkness of the shadow independent of how many layers you use.
 *
 * It is an empirical recipe, not optics: a real penumbra depends on the size
 * and distance of the light source, neither of which CSS lets you state.
 */
export function buildElevation(options: Elevation): Layer[] {
  const n = Math.max(1, Math.min(MAX_LAYERS, Math.round(options.layers)));
  const falloff = Math.min(0.99, Math.max(0.05, options.falloff));
  const weights = Array.from({ length: n }, (_, i) => falloff ** i);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const alpha = clampUnit(options.alpha);

  return weights.map((weight, i) => {
    const scale = 2 ** (i - (n - 1));
    const y = options.distance * scale;
    return {
      x: 0,
      y: Number(y.toFixed(2)),
      blur: Number((Math.abs(y) * options.blurRatio).toFixed(2)),
      spread: options.spread,
      color: { ...options.color, a: Number(((alpha * weight) / total).toFixed(4)) },
      inset: false,
    };
  });
}

/* ── Radius ───────────────────────────────── */

export type Unit = 'px' | '%' | 'rem';

export type Radius = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
  unit: Unit;
  /** Second radius per corner, for elliptical corners. */
  elliptical: boolean;
  tl2: number;
  tr2: number;
  br2: number;
  bl2: number;
};

export const DEFAULT_RADIUS: Radius = {
  tl: 8,
  tr: 8,
  br: 8,
  bl: 8,
  unit: 'px',
  elliptical: false,
  tl2: 8,
  tr2: 8,
  br2: 8,
  bl2: 8,
};

/**
 * CSS's four-to-one collapsing, which is not the same rule as `margin`'s.
 *
 * The order is top-left, top-right, bottom-right, bottom-left — clockwise from
 * the top left. Three values mean the fourth repeats the second; two mean the
 * third and fourth repeat the first and second. Getting this wrong yields
 * perfectly valid CSS that draws a different shape, which is why it is a
 * function with tests rather than a template string.
 */
export function collapseCorners(values: readonly [number, number, number, number], unit: Unit): string {
  const [tl, tr, br, bl] = values;
  const write = (n: number) => {
    const v = Number(n.toFixed(3));
    return v === 0 ? '0' : `${v}${unit}`;
  };
  if (tl === tr && tr === br && br === bl) return write(tl);
  if (tl === br && tr === bl) return `${write(tl)} ${write(tr)}`;
  if (tr === bl) return `${write(tl)} ${write(tr)} ${write(br)}`;
  return `${write(tl)} ${write(tr)} ${write(br)} ${write(bl)}`;
}

export function formatRadius(radius: Radius): string {
  const first = collapseCorners([radius.tl, radius.tr, radius.br, radius.bl], radius.unit);
  if (!radius.elliptical) return first;
  const second = collapseCorners([radius.tl2, radius.tr2, radius.br2, radius.bl2], radius.unit);
  // A slash-separated pair means "horizontal radii / vertical radii". Writing
  // it when both sides are equal would be a longer way of saying the same.
  return first === second ? first : `${first} / ${second}`;
}

/* ── Border ───────────────────────────────── */

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

export type Border = {
  enabled: boolean;
  width: number;
  style: BorderStyle;
  color: Rgba;
};

export const DEFAULT_BORDER: Border = {
  enabled: true,
  width: 1,
  style: 'solid',
  color: { r: 26, g: 23, b: 20, a: 0.13 },
};

export function formatBorder(border: Border): string {
  if (!border.enabled || border.style === 'none' || border.width <= 0) return 'none';
  return `${px(border.width)} ${border.style} ${toRgbaString(border.color)}`;
}

/* ── The whole declaration ────────────────── */

export type Design = {
  layers: Layer[];
  radius: Radius;
  border: Border;
};

/** The three properties, in the order a stylesheet reads best. */
export function formatCss(design: Design, multiline = true): string {
  const lines: string[] = [];
  if (design.border.enabled && design.border.style !== 'none' && design.border.width > 0) {
    lines.push(`border: ${formatBorder(design.border)};`);
  }
  lines.push(`border-radius: ${formatRadius(design.radius)};`);
  lines.push(`box-shadow: ${formatShadow(design.layers, multiline && design.layers.length > 1)};`);
  return lines.join('\n');
}

/**
 * Total opacity a stack lays down directly under the object.
 *
 * Layers composite, so the opacities do not add — each one covers a fraction of
 * what is left. This is the reading that tells you a stack is muddy: past about
 * 0.4 a shadow stops reading as depth and starts reading as dirt.
 */
export function stackedOpacity(layers: readonly Layer[]): number {
  const transparency = layers.reduce(
    (remaining, layer) => remaining * (1 - clampUnit(layer.color.a)),
    1
  );
  return 1 - transparency;
}
