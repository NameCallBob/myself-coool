// Explicit .ts specifiers: this module has unit tests, and Node's test runner
// resolves real filenames rather than the bundler's extensionless lookup.
import type { Localized } from './projects.ts';
import { PROJECTS } from './projects.ts';
import { EXPERIENCE } from './experience.ts';
import { PROJECT_PERIODS, REWORK_PERIODS, type Precision } from './periods.ts';

/**
 * The home page's data: everything that was running, and when.
 *
 * The argument this page makes is not "here are sixteen systems" — a list does
 * that. It is that they overlapped: a degree, a job, and a dozen systems in
 * production at the same time. Overlap is invisible in a list and unavoidable
 * in a waterfall, which is why the page is a waterfall.
 *
 * Every span's dates come from `periods.ts`, and every entry there names the
 * sentence it was read from. Nothing here is estimated.
 */

export type SpanKind = 'role' | 'study' | 'program' | 'project' | 'rework';

export type TraceSpan = {
  id: string;
  kind: SpanKind;
  label: Localized;
  detail: Localized;
  /** Milliseconds. `end` is the last instant the work covered. */
  start: number;
  end: number;
  precision: Precision;
  /**
   * Still being worked on. Not the same as the system still being up: several
   * of these run in production with nobody touching them.
   */
  ongoing: boolean;
  /** Still being worked on today, even if the build finished long ago. */
  maintained?: boolean;
  /** The system is live, whether or not it is being worked on. */
  live?: boolean;
  /** Work has stopped, but no end date is written down anywhere. */
  unrecorded?: boolean;
  /**
   * The start is not stated anywhere, so the bar has no left-hand edge either.
   * Used by the enrolment span: "在學" has no recorded start date in the
   * content, and picking one would be inventing it.
   */
  openStart?: boolean;
  href?: string;
  /** Where the dates came from, shown on inspection. */
  source: string;
};

const MONTH_END = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysIn(year: number, month: number): number {
  if (month !== 2) return MONTH_END[month - 1];
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

/** 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' → the first instant it covers. */
export function startOf(value: string): number {
  const [year, month = '1', day = '1'] = value.split('-');
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * The last instant a partial date covers.
 *
 * A bare year means the whole year, not the first of January — treating
 * '2024' as a point would draw a one-day bar for a year of work.
 */
export function endOf(value: string): number {
  const parts = value.split('-');
  const year = Number(parts[0]);
  if (parts.length === 1) return Date.UTC(year, 11, 31, 23, 59, 59);
  const month = Number(parts[1]);
  if (parts.length === 2) return Date.UTC(year, month - 1, daysIn(year, month), 23, 59, 59);
  return Date.UTC(year, month - 1, Number(parts[2]), 23, 59, 59);
}

/**
 * Builds the spans. `now` is passed in rather than read from the clock so the
 * function stays pure — the component reads the clock through a store, and
 * the tests can pin it.
 */
export function buildTimeline(now: number): TraceSpan[] {
  const spans: TraceSpan[] = [];

  for (const entry of EXPERIENCE) {
    // '2025.06 — PRESENT', '2023', '— PRESENT'
    const period = entry.period.replace(/\s/g, '');
    const [rawStart, rawEnd] = period.split('—');
    const kind: SpanKind = /大學|NKUST/.test(entry.org.zh + entry.org.en) ? 'study' : /研究院|計畫|Program|DIGI/.test(entry.org.zh) ? 'program' : 'role';
    const ongoing = /PRESENT/i.test(rawEnd ?? '');
    // '— PRESENT' with nothing before the dash: the content never says when
    // this began. The bar runs off the left edge rather than claiming a date.
    const openStart = rawStart === '';
    const start = openStart ? Number.NEGATIVE_INFINITY : startOf(rawStart.replace('.', '-'));
    spans.push({
      id: `exp:${entry.org.en}`,
      kind,
      label: entry.org,
      detail: entry.role,
      start,
      end: ongoing ? now : endOf((rawEnd || rawStart).replace('.', '-')),
      precision: rawStart.includes('.') ? 'month' : 'year',
      ongoing,
      openStart,
      source: `experience.ts — ${entry.period}`,
    });
  }

  const add = (slug: string, kind: SpanKind, suffix: Localized | null) => {
    const table = kind === 'rework' ? REWORK_PERIODS : PROJECT_PERIODS;
    const period = table[slug];
    const project = PROJECTS.find((entry) => entry.slug === slug);
    if (!period || !project) return;
    const unrecorded = period.end === 'unrecorded';
    spans.push({
      id: `${kind}:${slug}`,
      kind,
      label: suffix
        ? { zh: `${project.title.zh} ${suffix.zh}`, en: `${project.title.en} ${suffix.en}` }
        : project.title,
      detail: project.scope,
      start: startOf(period.start),
      // An unrecorded end still needs somewhere to stop being drawn; the bar
      // is marked so the renderer can show the uncertainty rather than imply
      // the work is still going.
      end: period.end === 'present' || unrecorded ? now : endOf(period.end),
      precision: period.precision,
      ongoing: period.end === 'present',
      maintained: period.maintained ?? period.end === 'present',
      live: period.live,
      unrecorded,
      href: `/work/${slug}`,
      source: period.source,
    });
  };

  for (const slug of Object.keys(PROJECT_PERIODS)) add(slug, 'project', null);
  for (const slug of Object.keys(REWORK_PERIODS)) {
    add(slug, 'rework', { zh: '· 重整', en: '· rework' });
  }

  return spans.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * What is being worked on right now.
 *
 * Only spans that are actually ongoing. A span whose end is unrecorded is not
 * counted: the work stopped, the date just is not written down, and counting
 * it here would restate the mistake this function was added to fix.
 */
export function ongoingAt(spans: readonly TraceSpan[], at: number): TraceSpan[] {
  // `maintained` rather than `ongoing`: a build that finished in six days can
  // still be the thing you get paged about.
  return spans.filter((span) => (span.maintained || span.ongoing) && at >= span.start);
}

/**
 * How many spans were running at a given instant, and which.
 *
 * This is the readout the page exists for: drag the playhead to April 2026 and
 * the answer is a number, not an impression.
 */
export function concurrentAt(spans: readonly TraceSpan[], at: number): TraceSpan[] {
  // A span whose end is unrecorded covers nothing after its start: we do not
  // know when it stopped, and counting it would be a guess wearing a number.
  return spans.filter((span) => !span.unrecorded && at >= span.start && at <= span.end);
}

/**
 * Spans that had started by `at` but whose end is not written down.
 *
 * Reported beside the count rather than folded into it, so the uncertainty is
 * visible instead of being resolved in whichever direction flatters.
 */
export function uncertainAt(spans: readonly TraceSpan[], at: number): TraceSpan[] {
  return spans.filter((span) => span.unrecorded && at >= span.start);
}

/** The drawable time range, ignoring the open-left bar's infinity. */
export function timeExtent(spans: readonly TraceSpan[]): { from: number; to: number } {
  const starts = spans.map((span) => span.start).filter(Number.isFinite);
  const ends = spans.map((span) => span.end).filter(Number.isFinite);
  return { from: Math.min(...starts), to: Math.max(...ends) };
}

/** The busiest instant, and how many things were running then. */
export function peakConcurrency(spans: readonly TraceSpan[]): { at: number; count: number } {
  const edges = spans.map((span) => span.start).filter(Number.isFinite).sort((a, b) => a - b);
  let best = { at: edges[0] ?? 0, count: 0 };
  for (const at of edges) {
    const count = concurrentAt(spans, at).length;
    if (count > best.count) best = { at, count };
  }
  return best;
}

/** Rows for the packed layout: greedy first-fit, so bars never overlap in a row. */
export function packRows(spans: readonly TraceSpan[], gapMs: number): TraceSpan[][] {
  const rows: TraceSpan[][] = [];
  for (const span of spans) {
    const row = rows.find((entries) => entries[entries.length - 1].end + gapMs < span.start);
    if (row) row.push(span);
    else rows.push([span]);
  }
  return rows;
}
