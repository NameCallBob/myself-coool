import type { CSSProperties } from 'react';
import { PROJECT_PERIODS } from '../../../content/periods';
import { endOf, startOf, type TraceSpan } from '../../../content/timeline';

/**
 * One project's slice of the shared axis.
 *
 * Server-rendered: the position is data, not behaviour, so it is in the HTML
 * before any JavaScript runs and is correct for a crawler and with scripting
 * off. The only thing the client adds is the draw-in.
 */
/**
 * The bar itself, from raw values.
 *
 * Separate from `SpanTrack` because /about draws experience spans, which have
 * no project slug — the geometry is the same, the lookup is not.
 */
export function AxisTrack({
  from,
  to,
  extent,
  ongoing,
  soft,
  openStart,
  label,
}: {
  from: number;
  to: number;
  extent: { from: number; to: number };
  ongoing?: boolean;
  soft?: boolean;
  openStart?: boolean;
  label?: string;
}) {
  const total = extent.to - extent.from;
  const left = openStart ? 0 : ((from - extent.from) / total) * 100;
  const right = ((to - extent.from) / total) * 100;
  const style = {
    '--from': `${Math.max(0, left).toFixed(2)}%`,
    '--to': `${Math.min(100, right).toFixed(2)}%`,
  } as CSSProperties;

  return (
    <span className="flex items-center gap-3">
      <span className="flex-1">
        <span
          className="span-track"
          style={style}
          data-ongoing={ongoing ? 'true' : undefined}
          data-soft={soft || openStart ? 'true' : undefined}
          aria-hidden="true"
        />
      </span>
      {label ? <span className="span-label">{label}</span> : null}
    </span>
  );
}

export function SpanTrack({
  slug,
  extent,
  now,
  label,
  l,
}: {
  slug: string;
  extent: { from: number; to: number };
  now: number;
  label?: boolean;
  l: 'zh' | 'en';
}) {
  const period = PROJECT_PERIODS[slug];
  const total = extent.to - extent.from;

  if (!period) {
    return (
      <span
        className="span-track"
        data-undated="true"
        aria-label={l === 'zh' ? '時間未記載' : 'no dates recorded'}
      />
    );
  }

  const from = startOf(period.start);
  const to = period.end === 'present' ? now : endOf(period.end);
  const style = {
    '--from': `${(((from - extent.from) / total) * 100).toFixed(2)}%`,
    '--to': `${(((to - extent.from) / total) * 100).toFixed(2)}%`,
  } as CSSProperties;

  const text =
    period.end === 'present'
      ? `${period.start} → ${l === 'zh' ? '至今' : 'now'}`
      : period.start === period.end
        ? period.start
        : `${period.start} → ${period.end}`;

  return (
    <>
      <span
        className="span-track"
        style={style}
        data-ongoing={period.end === 'present' ? 'true' : undefined}
        data-soft={period.precision !== 'day' ? 'true' : undefined}
        aria-hidden="true"
      />
      {label ? <span className="span-label">{text}</span> : null}
    </>
  );
}

/** The dates as text beside the bar, or an honest blank when there are none. */
export function SpanTrackLabel({ slug, l }: { slug: string; l: 'zh' | 'en' }) {
  const period = PROJECT_PERIODS[slug];
  if (!period) {
    return <span className="span-label">{l === 'zh' ? '時間未記載' : 'not recorded'}</span>;
  }
  const text =
    period.end === 'present'
      ? `${period.start} → ${l === 'zh' ? '至今' : 'now'}`
      : period.start === period.end
        ? period.start
        : `${period.start} → ${period.end}`;
  return (
    <span className="span-label" title={period.source}>
      {text}
    </span>
  );
}

/** The dates as text, for places that want the value rather than the bar. */
export function spanText(span: TraceSpan, l: 'zh' | 'en'): string {
  const start = Number.isFinite(span.start)
    ? new Date(span.start).toISOString().slice(0, 7)
    : l === 'zh'
      ? '未記載'
      : 'unrecorded';
  const end = span.ongoing
    ? l === 'zh'
      ? '至今'
      : 'now'
    : new Date(span.end).toISOString().slice(0, 7);
  return `${start} → ${end}`;
}
