'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { gsap } from 'gsap';
import { Link } from '@/i18n/navigation';
import {
  buildTimeline,
  concurrentAt,
  packRows,
  timeExtent,
  uncertainAt,
  type TraceSpan,
} from '../../../content/timeline';
import {
  DAY,
  clamp,
  hit,
  pan,
  stamp,
  ticks,
  toTime,
  toX,
  unitFor,
  zoomAt,
  type Range,
  type Rect,
} from './geometry';

/**
 * The home page.
 *
 * A list of sixteen systems says "here are sixteen systems". A waterfall says
 * they were running at the same time, which is the part that is hard to do and
 * the part a list cannot show. Every bar's dates come from a sentence in the
 * case study it links to — see content/periods.ts, where each entry quotes its
 * source.
 *
 * The chart is drawn on a canvas; the same spans are also in the DOM as an
 * ordered list, which is what crawlers and screen readers read and what the
 * page falls back to under 720px.
 */

const ROW = 30;
const ROW_GAP = 6;
const AXIS = 34;
const PADDING = 12;
const HOUR = 3_600_000;

/** Hour-granular so the snapshot is stable across renders. */
const nowStore = {
  subscribe: () => () => {},
  get: () => Math.floor(Date.now() / HOUR) * HOUR,
  server: () => Date.UTC(2026, 8, 26),
};

function useNow(): number {
  return useSyncExternalStore(nowStore.subscribe, nowStore.get, nowStore.server);
}

type Palette = {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  rule: string;
  accent: string;
  accentDim: string;
  teal: string;
  slate: string;
  surface: string;
};

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: read('--fg', '#1a1714'),
    muted: read('--fg-muted', '#5e574e'),
    faint: read('--fg-faint', '#726a5d'),
    line: read('--border-1', 'rgba(0,0,0,.07)'),
    rule: read('--border-3', 'rgba(0,0,0,.22)'),
    accent: read('--accent', '#a31621'),
    accentDim: read('--accent-dim', 'rgba(163,22,33,.12)'),
    teal: read('--data-teal', '#2a7d7f'),
    slate: read('--data-slate', '#5a6478'),
    surface: read('--bg-raised', '#fff'),
  };
}

/**
 * Colour carries the kind, not the project.
 *
 * Plain projects are drawn in muted ink rather than full ink: at sixteen bars
 * the page was a wall of black, and the two colours that mean something — the
 * job in accent, the programmes in teal — stopped reading as different.
 */
const KIND_COLOUR = (span: TraceSpan, palette: Palette) => {
  if (span.kind === 'role') return palette.accent;
  if (span.kind === 'study') return palette.slate;
  if (span.kind === 'program') return palette.teal;
  if (span.kind === 'rework') return palette.faint;
  return palette.muted;
};

export function TraceWaterfall({ locale }: { locale: string }) {
  const l = locale === 'en' ? 'en' : 'zh';
  const now = useNow();

  const spans = useMemo(() => buildTimeline(now), [now]);
  const limits = useMemo<Range>(() => timeExtent(spans), [spans]);
  const rows = useMemo(() => packRows(spans, DAY * 20), [spans]);

  const frame = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<Range>(limits);
  const rects = useRef<{ id: string; rect: Rect }[]>([]);
  const size = useRef({ width: 0, height: 0 });
  const reveal = useRef({ value: 0 });
  const dragging = useRef<{ x: number; moved: boolean } | null>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [isDragging, setDragging] = useState(false);
  /**
   * The visible duration lives in state, not only in the ref: the readout's
   * precision follows it, so it is something the UI renders from. The ref
   * stays because the draw loop needs the value without waiting for a commit.
   */
  const [visible, setVisible] = useState(() => limits.to - limits.from);

  const height = rows.length * (ROW + ROW_GAP) + AXIS + PADDING * 2;

  const at = playhead ?? now;
  const running = useMemo(() => concurrentAt(spans, at), [spans, at]);
  const uncertain = useMemo(() => uncertainAt(spans, at), [spans, at]);

  /* ── Drawing ────────────────────────────── */

  const draw = useCallback(() => {
    const surface = canvas.current;
    const box = frame.current;
    if (!surface || !box) return;
    const context = surface.getContext('2d');
    if (!context) return;

    const { width } = size.current;
    if (width === 0) return;

    const palette = readPalette(box);
    const v = view.current;
    const progress = reveal.current.value;

    context.clearRect(0, 0, width, height);

    /* Axis */
    const marks = ticks(v, l);
    context.font = '11px ui-monospace, monospace';
    context.textBaseline = 'alphabetic';
    for (const mark of marks) {
      const x = Math.round(toX(mark.at, v, width)) + 0.5;
      context.strokeStyle = mark.major ? palette.rule : palette.line;
      context.beginPath();
      context.moveTo(x, mark.major ? AXIS - 10 : AXIS - 5);
      context.lineTo(x, height - PADDING);
      context.stroke();
      if (mark.major || marks.length < 26) {
        context.fillStyle = mark.major ? palette.muted : palette.faint;
        context.fillText(mark.label, x + 4, AXIS - 12);
      }
    }

    /* Bars */
    const collected: { id: string; rect: Rect }[] = [];
    rows.forEach((row, rowIndex) => {
      const y = AXIS + PADDING + rowIndex * (ROW + ROW_GAP);
      row.forEach((span, indexInRow) => {
        const openLeft = !Number.isFinite(span.start);
        const rawX = openLeft ? -20 : toX(span.start, v, width);
        const endX = toX(span.end, v, width);
        // Bars grow from their own start as the reveal runs.
        const grown = rawX + (endX - rawX) * progress;
        const x = Math.min(rawX, grown);
        const w = Math.max(2, Math.abs(grown - rawX));
        if (x > width || x + w < 0) return;

        const colour = KIND_COLOUR(span, palette);
        const isHovered = hovered === span.id;
        const h = ROW - 10;
        const top = y + 5;

        context.save();
        context.globalAlpha = isHovered ? 1 : 0.88;
        context.fillStyle = colour;

        // Precision and certainty are drawn, not written.
        //
        //  - known only to the year  → both ends fade
        //  - no recorded start       → the left end fades off the canvas
        //  - no recorded end         → the bar trails off: the work stopped,
        //                              we just do not know when, and a bar
        //                              reaching today would say otherwise
        if (span.unrecorded) {
          const fade = context.createLinearGradient(x, 0, x + w, 0);
          fade.addColorStop(0, colour);
          fade.addColorStop(0.1, colour);
          fade.addColorStop(0.55, `${colour}33`);
          fade.addColorStop(1, `${colour}00`);
          context.fillStyle = fade;
        } else if (span.precision === 'year' || openLeft || span.ongoing) {
          const fade = context.createLinearGradient(x, 0, x + w, 0);
          const soft = span.precision === 'year' || openLeft;
          fade.addColorStop(0, soft ? `${colour}55` : colour);
          fade.addColorStop(0.12, colour);
          fade.addColorStop(0.88, colour);
          fade.addColorStop(1, span.ongoing || span.precision === 'year' ? `${colour}55` : colour);
          context.fillStyle = fade;
        }
        context.fillRect(x, top, w, h);

        // Still maintained after the build finished: a hairline to today. The
        // six-day build stays six days wide, and the fact that it is still
        // someone's problem is drawn separately from how long it took.
        if (span.maintained && !span.ongoing && !span.unrecorded) {
          const nowX = toX(now, v, width);
          if (nowX > x + w) {
            context.save();
            context.globalAlpha = 0.55;
            context.fillStyle = colour;
            context.fillRect(x + w, top + h / 2 - 0.5, (nowX - (x + w)) * progress, 1);
            context.restore();
          }
        }

        if (isHovered) {
          context.strokeStyle = palette.ink;
          context.lineWidth = 1;
          context.strokeRect(x - 0.5, top - 0.5, w + 1, h + 1);
        }
        context.restore();

        /*
         * Label placement.
         *
         * A short bar puts its label to the right, which is where the next bar
         * in the same row starts — so the room available is measured first and
         * the text is trimmed to fit. Without this, a one-week bar's name runs
         * straight through the bar beside it and both become unreadable.
         */
        const text = span.label[l];
        context.font = '12px system-ui, -apple-system, "PingFang TC", sans-serif';
        const textWidth = context.measureText(text).width;
        const inside = w > textWidth + 16;
        const next = row[indexInRow + 1];
        const nextX = next ? toX(next.start, v, width) : width;
        // Never off the left edge: the open-left bar starts outside the canvas.
        const labelX = Math.max(4, inside ? x + 8 : x + w + 8);
        const room = (inside ? x + w : nextX) - labelX - 8;

        if (labelX < width && room > 24) {
          context.fillStyle = inside ? palette.surface : palette.muted;
          context.textBaseline = 'middle';
          context.save();
          context.beginPath();
          context.rect(labelX, top, room, h);
          context.clip();
          context.fillText(text, labelX, top + h / 2 + 0.5);
          context.restore();

          // A trimmed label needs to say it was trimmed.
          if (textWidth > room) {
            context.fillStyle = palette.faint;
            context.fillText('…', labelX + room, top + h / 2 + 0.5);
          }
        }

        collected.push({ id: span.id, rect: { x, y: top, width: Math.max(w, 6), height: h } });
      });
    });
    rects.current = collected;

    /* Now and playhead */
    const drawMarker = (time: number, colour: string, dashed: boolean) => {
      const x = Math.round(toX(time, v, width)) + 0.5;
      if (x < 0 || x > width) return;
      context.save();
      context.strokeStyle = colour;
      context.lineWidth = 1;
      if (dashed) context.setLineDash([3, 3]);
      context.beginPath();
      context.moveTo(x, AXIS - 14);
      context.lineTo(x, height - PADDING);
      context.stroke();
      context.restore();
    };
    drawMarker(now, palette.accent, true);
    if (playhead !== null) drawMarker(playhead, palette.ink, false);
  }, [height, hovered, l, now, playhead, rows]);

  /* ── Sizing ─────────────────────────────── */

  useEffect(() => {
    const box = frame.current;
    const surface = canvas.current;
    if (!box || !surface) return;

    const resize = () => {
      const width = box.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { width, height };
      surface.width = Math.round(width * dpr);
      surface.height = Math.round(height * dpr);
      surface.style.height = `${height}px`;
      const context = surface.getContext('2d');
      if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [draw, height]);

  /* ── Entrance ───────────────────────────── */

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      reveal.current.value = 1;
      draw();
      return;
    }
    // GSAP drives one number; the canvas reads it. Animating the bars
    // individually would mean twenty tweens fighting over one draw call.
    const tween = gsap.to(reveal.current, {
      value: 1,
      duration: 1.1,
      ease: 'expo.out',
      onUpdate: draw,
    });
    return () => {
      tween.kill();
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* ── Interaction ────────────────────────── */

  /** Moves the view: the ref for drawing, the state for the readout. */
  const applyView = useCallback((next: Range) => {
    view.current = next;
    setVisible(next.to - next.from);
    draw();
  }, [draw]);

  const pointerAt = (event: React.PointerEvent | React.MouseEvent) => {
    const box = frame.current;
    if (!box) return { x: 0, y: 0 };
    const rect = box.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = pointerAt(event);
    const drag = dragging.current;
    if (drag) {
      const dx = x - drag.x;
      if (Math.abs(dx) > 2) drag.moved = true;
      applyView(pan(view.current, size.current.width, dx, limits));
      drag.x = x;
      return;
    }
    setHovered(hit(rects.current, x, y));
    setPlayhead(toTime(x, view.current, size.current.width));
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    const { x } = pointerAt(event);
    const factor = Math.exp(event.deltaY * 0.0015);
    applyView(zoomAt(view.current, size.current.width, x, factor, limits));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const width = size.current.width;
    const step = (view.current.to - view.current.from) * 0.12;
    const pixelsPerMs = (view.current.to - view.current.from) / width;
    const keys: Record<string, () => Range> = {
      ArrowLeft: () => pan(view.current, width, step / pixelsPerMs, limits),
      ArrowRight: () => pan(view.current, width, -step / pixelsPerMs, limits),
      '+': () => zoomAt(view.current, width, width / 2, 0.7, limits),
      '=': () => zoomAt(view.current, width, width / 2, 0.7, limits),
      '-': () => zoomAt(view.current, width, width / 2, 1.4, limits),
      '0': () => clamp(limits, limits),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    applyView(action());
  };

  const reset = () => applyView(clamp(limits, limits));

  const zoomTo = (span: TraceSpan) => {
    const pad = Math.max((span.end - span.start) * 0.5, DAY * 10);
    applyView(clamp({ from: span.start - pad, to: span.end + pad }, limits));
  };

  const unit = unitFor({ from: 0, to: visible });
  const busiest = running.length;

  return (
    <div className="trace">
      <div
        ref={frame}
        className="trace-frame"
        data-dragging={isDragging ? 'true' : undefined}
        tabIndex={0}
        role="application"
        aria-label={
          l === 'zh'
            ? '時間軸圖表:可用方向鍵平移、加減號縮放、0 重設'
            : 'Timeline chart: arrow keys pan, plus and minus zoom, 0 resets'
        }
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          dragging.current = { x: pointerAt(event).x, moved: false };
          setDragging(true);
        }}
        onPointerUp={() => {
          dragging.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          dragging.current = null;
          setDragging(false);
          setHovered(null);
          setPlayhead(null);
          draw();
        }}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvas} className="trace-canvas" aria-hidden="true" />
      </div>

      <div className="trace-readout" aria-live="polite">
        <span>
          {stamp(at, unit, l)}
          {playhead === null ? (l === 'zh' ? ' · 此刻' : ' · now') : ''}
        </span>
        <span>
          <b>{busiest}</b> {l === 'zh' ? '件同時在跑' : 'running at once'}
        </span>
        {uncertain.length > 0 ? (
          <span>
            {l === 'zh'
              ? `另有 ${uncertain.length} 件結束時間未記載`
              : `${uncertain.length} more with no recorded end`}
          </span>
        ) : null}
        <span className="trace-readout-names">
          {running
            .slice(0, 4)
            .map((span) => span.label[l])
            .join(l === 'zh' ? '、' : ', ')}
          {running.length > 4 ? (l === 'zh' ? ` 等 ${running.length} 件` : ` and ${running.length - 4} more`) : ''}
        </span>
      </div>

      <div className="trace-controls">
        <button type="button" className="trace-btn" onClick={reset}>
          {l === 'zh' ? '全部' : 'fit all'}
        </button>
        {spans
          .filter((span) => span.precision === 'day')
          .map((span) => (
            <button key={span.id} type="button" className="trace-btn" onClick={() => zoomTo(span)}>
              {l === 'zh'
                ? `${Math.round((span.end - span.start) / DAY)} 天:${span.label.zh}`
                : `${Math.round((span.end - span.start) / DAY)} days: ${span.label.en}`}
            </button>
          ))}
        <span className="trace-hint">
          {l === 'zh' ? '拖曳平移 · 滾輪縮放 · 方向鍵可操作' : 'drag to pan · wheel to zoom · arrow keys work'}
        </span>
      </div>

      {/* The same spans, in the DOM. This is what a crawler and a screen
          reader read, and what the page shows below 720px. */}
      <div className="trace-list-wrap">
        <ol className="trace-list">
          {spans.map((span) => (
            <li key={span.id}>
              <time dateTime={Number.isFinite(span.start) ? new Date(span.start).toISOString() : undefined}>
                {Number.isFinite(span.start)
                  ? new Date(span.start).toISOString().slice(0, 7)
                  : l === 'zh'
                    ? '起始未標註'
                    : 'start not recorded'}
                {' → '}
                {span.ongoing
                  ? l === 'zh'
                    ? '至今'
                    : 'now'
                  : span.unrecorded
                    ? l === 'zh'
                      ? '之後未記載'
                      : 'end not recorded'
                    : new Date(span.end).toISOString().slice(0, 7)}
                {span.maintained && !span.ongoing
                  ? l === 'zh'
                    ? ' · 仍在維護'
                    : ' · still maintained'
                  : ''}
              </time>
              {span.href ? (
                <Link href={span.href}>{span.label[l]}</Link>
              ) : (
                <span data-label>{span.label[l]}</span>
              )}
              <em>{span.detail[l]}</em>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
