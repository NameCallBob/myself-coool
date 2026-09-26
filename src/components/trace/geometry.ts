/**
 * The maths behind the waterfall: time to pixels, and the tick marks.
 *
 * Kept apart from the canvas so it can be tested. Everything a trace viewer
 * gets wrong is in here — a tick spacing that changes unit at the wrong zoom,
 * a scale that drifts when you zoom at the pointer, a hit test that is one
 * row off — and none of that is visible in a screenshot.
 */

export type Range = { from: number; to: number };

export const DAY = 86_400_000;
export const MONTH = DAY * 30.4375;
export const YEAR = DAY * 365.25;

/** Clamped linear map from time to x. */
export function toX(at: number, view: Range, width: number): number {
  return ((at - view.from) / (view.to - view.from)) * width;
}

export function toTime(x: number, view: Range, width: number): number {
  return view.from + (x / width) * (view.to - view.from);
}

/**
 * Zooms about a fixed pixel, so the date under the pointer stays under it.
 *
 * The naive version scales around the view's centre, which makes the content
 * slide away from the cursor and is the difference between a chart that feels
 * like a map and one that feels like a toy.
 */
export function zoomAt(view: Range, width: number, pixel: number, factor: number, limits: Range): Range {
  const anchor = toTime(pixel, view, width);
  const span = (view.to - view.from) * factor;
  const minSpan = DAY * 2;
  const maxSpan = (limits.to - limits.from) * 1.4;
  const clamped = Math.min(Math.max(span, minSpan), maxSpan);
  const ratio = pixel / width;
  return clamp({ from: anchor - clamped * ratio, to: anchor + clamped * (1 - ratio) }, limits);
}

/** Keeps the view inside the data, with a margin so bars are never flush. */
export function clamp(view: Range, limits: Range): Range {
  const margin = (limits.to - limits.from) * 0.04;
  const min = limits.from - margin;
  const max = limits.to + margin;
  const span = view.to - view.from;

  if (span >= max - min) return { from: min, to: min + span };
  let { from, to } = view;
  if (from < min) {
    from = min;
    to = min + span;
  }
  if (to > max) {
    to = max;
    from = max - span;
  }
  return { from, to };
}

export function pan(view: Range, width: number, dx: number, limits: Range): Range {
  const shift = (dx / width) * (view.to - view.from);
  return clamp({ from: view.from - shift, to: view.to - shift }, limits);
}

/* ── Ticks ────────────────────────────────── */

export type TickUnit = 'year' | 'quarter' | 'month' | 'week' | 'day';
export type Tick = { at: number; label: string; unit: TickUnit; major: boolean };

/**
 * Picks the unit that gives a readable number of labels at this zoom.
 *
 * The thresholds are in visible duration rather than pixels-per-tick because
 * the answer should not change when the window is resized — a chart that
 * relabels itself on resize reads as unstable.
 */
export function unitFor(view: Range): TickUnit {
  const span = view.to - view.from;
  if (span > YEAR * 6) return 'year';
  if (span > YEAR * 1.5) return 'quarter';
  if (span > DAY * 75) return 'month';
  if (span > DAY * 10) return 'week';
  return 'day';
}

const pad = (value: number) => String(value).padStart(2, '0');

export function ticks(view: Range, locale: 'zh' | 'en'): Tick[] {
  const unit = unitFor(view);
  const out: Tick[] = [];
  const start = new Date(view.from);
  const year = start.getUTCFullYear();

  const push = (at: number, label: string, major: boolean) => {
    if (at >= view.from && at <= view.to) out.push({ at, label, unit, major });
  };

  if (unit === 'year' || unit === 'quarter') {
    const step = unit === 'year' ? 12 : 3;
    for (let y = year - 1; y <= new Date(view.to).getUTCFullYear() + 1; y += 1) {
      for (let m = 0; m < 12; m += step) {
        const at = Date.UTC(y, m, 1);
        const major = m === 0;
        const label = major ? String(y) : `Q${Math.floor(m / 3) + 1}`;
        push(at, label, major);
      }
    }
    return out;
  }

  if (unit === 'month') {
    for (let y = year - 1; y <= new Date(view.to).getUTCFullYear() + 1; y += 1) {
      for (let m = 0; m < 12; m += 1) {
        const at = Date.UTC(y, m, 1);
        const major = m === 0;
        push(at, major ? String(y) : locale === 'zh' ? `${m + 1}月` : `${pad(m + 1)}`, major);
      }
    }
    return out;
  }

  // Week and day both step in days; the week unit simply labels fewer of them.
  const step = unit === 'week' ? 7 * DAY : DAY;
  const first = Math.floor(view.from / step) * step;
  for (let at = first; at <= view.to + step; at += step) {
    const date = new Date(at);
    const major = date.getUTCDate() === 1;
    const label = major
      ? locale === 'zh'
        ? `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`
        : `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
      : `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
    push(at, label, major);
  }
  return out;
}

/* ── Hit testing ──────────────────────────── */

export type Rect = { x: number; y: number; width: number; height: number };

export function hit(rects: readonly { id: string; rect: Rect }[], x: number, y: number): string | null {
  // Last match wins: later rows are drawn on top, so they should also win the
  // pointer when two bars overlap by a pixel.
  let found: string | null = null;
  for (const entry of rects) {
    const { rect } = entry;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      found = entry.id;
    }
  }
  return found;
}

/** Formats an instant for the playhead readout. */
export function stamp(at: number, unit: TickUnit, locale: 'zh' | 'en'): string {
  const date = new Date(at);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (unit === 'year') return String(y);
  if (unit === 'quarter') return locale === 'zh' ? `${y} 年 Q${Math.floor((m - 1) / 3) + 1}` : `${y} Q${Math.floor((m - 1) / 3) + 1}`;
  if (unit === 'month') return locale === 'zh' ? `${y} 年 ${m} 月` : `${y}-${pad(m)}`;
  return locale === 'zh' ? `${y}/${pad(m)}/${pad(d)}` : `${y}-${pad(m)}-${pad(d)}`;
}
