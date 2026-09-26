/**
 * A timesheet, kept as immutable records with an explicit "still running" state.
 *
 * Two decisions are worth stating because they are where timesheets usually go
 * wrong. First, an entry that crosses midnight is counted on the day it
 * *started*: splitting it would make the row you typed disappear into two rows
 * you did not, and nobody reconciles that against their memory of the evening.
 * Second, billing rounding is applied to each entry and never to the total,
 * because rounding the total and rounding the parts give different invoices and
 * only one of them matches the lines on the page.
 *
 * Overlaps are detected rather than prevented. Starting a second task without
 * stopping the first is something people actually do, and a tool that silently
 * discards one of the two hours is worse than one that says "these two overlap".
 */

export type Entry = {
  id: string;
  project: string;
  note: string;
  /** Epoch milliseconds. */
  start: number;
  /** Null while the clock is still running. */
  end: number | null;
};

export const MAX_ENTRIES = 2000;

/* ── Durations ────────────────────────────── */

export function durationOf(entry: Entry, now: number): number {
  const end = entry.end ?? now;
  return Math.max(0, end - entry.start);
}

export function isRunning(entry: Entry): boolean {
  return entry.end === null;
}

/** `3h 25m`, and `0m` rather than an empty string. */
export function formatHm(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

/** Decimal hours, the unit an invoice line is in. */
export function formatHours(ms: number, digits = 2): string {
  return (ms / 3_600_000).toFixed(digits);
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DD` in this device's zone, which is the day the person worked. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type RoundMode = 'exact' | 'nearest' | 'up';

/**
 * Billing rounding, per entry.
 *
 * `nearest` uses round-half-up, which is what every rate card means by "to the
 * nearest six minutes". `up` is the one agencies bill with. `exact` is the
 * truth, and it is the default.
 */
export function billable(ms: number, mode: RoundMode, granularityMinutes: number): number {
  if (mode === 'exact') return ms;
  const step = Math.max(1, Math.round(granularityMinutes)) * 60_000;
  if (ms <= 0) return 0;
  return mode === 'up' ? Math.ceil(ms / step) * step : Math.round(ms / step) * step;
}

/* ── Editing the list ─────────────────────── */

/** Ids are content-free and only need to be unique within this device. */
export function makeId(now: number, salt: number): string {
  return `${now.toString(36)}-${Math.abs(Math.trunc(salt)).toString(36)}`;
}

/** Starts a new entry, stopping whatever was running first. */
export function startEntry(
  entries: readonly Entry[],
  input: { project: string; note: string; now: number; id: string }
): Entry[] {
  const stopped = entries.map((entry) => (isRunning(entry) ? { ...entry, end: input.now } : entry));
  const next: Entry = {
    id: input.id,
    project: input.project.trim() === '' ? '—' : input.project.trim(),
    note: input.note.trim(),
    start: input.now,
    end: null,
  };
  return trimEntries([...stopped, next]);
}

export function stopEntry(entries: readonly Entry[], id: string, now: number): Entry[] {
  return entries.map((entry) =>
    entry.id === id && isRunning(entry) ? { ...entry, end: Math.max(entry.start, now) } : entry
  );
}

export function stopAll(entries: readonly Entry[], now: number): Entry[] {
  return entries.map((entry) => (isRunning(entry) ? { ...entry, end: Math.max(entry.start, now) } : entry));
}

export function removeEntry(entries: readonly Entry[], id: string): Entry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function updateEntry(entries: readonly Entry[], id: string, patch: Partial<Omit<Entry, 'id'>>): Entry[] {
  return entries.map((entry) => {
    if (entry.id !== id) return entry;
    const merged = { ...entry, ...patch };
    // An end before the start is not an entry; clamp rather than store it.
    if (merged.end !== null && merged.end < merged.start) merged.end = merged.start;
    return merged;
  });
}

/** Newest last, and never more than `MAX_ENTRIES` — oldest are dropped. */
export function trimEntries(entries: readonly Entry[]): Entry[] {
  return entries.slice().sort((a, b) => a.start - b.start).slice(-MAX_ENTRIES);
}

export function sanitiseEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return [];
  const out: Entry[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Partial<Entry>;
    if (typeof row.id !== 'string' || !Number.isFinite(row.start)) continue;
    const start = Number(row.start);
    const end = row.end === null || row.end === undefined ? null : Number(row.end);
    if (end !== null && !Number.isFinite(end)) continue;
    out.push({
      id: row.id,
      project: typeof row.project === 'string' && row.project !== '' ? row.project : '—',
      note: typeof row.note === 'string' ? row.note : '',
      start,
      end: end === null ? null : Math.max(start, end),
    });
  }
  return trimEntries(out);
}

/* ── Summaries ────────────────────────────── */

export type Group = { key: string; ms: number; billableMs: number; entries: number };

function summarise(
  entries: readonly Entry[],
  now: number,
  keyOf: (entry: Entry) => string,
  mode: RoundMode,
  granularity: number
): Group[] {
  const map = new Map<string, Group>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const ms = durationOf(entry, now);
    const found = map.get(key) ?? { key, ms: 0, billableMs: 0, entries: 0 };
    found.ms += ms;
    // Rounded per entry, then summed: rounding the sum would not match the rows.
    found.billableMs += billable(ms, mode, granularity);
    found.entries += 1;
    map.set(key, found);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function dailyTotals(
  entries: readonly Entry[],
  now: number,
  mode: RoundMode = 'exact',
  granularity = 6,
  dateKey: (ms: number) => string = localDateKey
): Group[] {
  return summarise(entries, now, (entry) => dateKey(entry.start), mode, granularity);
}

export function projectTotals(
  entries: readonly Entry[],
  now: number,
  mode: RoundMode = 'exact',
  granularity = 6
): Group[] {
  return summarise(entries, now, (entry) => entry.project, mode, granularity).sort(
    (a, b) => b.ms - a.ms || a.key.localeCompare(b.key)
  );
}

export function grandTotal(
  entries: readonly Entry[],
  now: number,
  mode: RoundMode = 'exact',
  granularity = 6
): { ms: number; billableMs: number; entries: number; running: number } {
  return {
    ms: entries.reduce((sum, entry) => sum + durationOf(entry, now), 0),
    billableMs: entries.reduce((sum, entry) => sum + billable(durationOf(entry, now), mode, granularity), 0),
    entries: entries.length,
    running: entries.filter(isRunning).length,
  };
}

export type Overlap = { a: Entry; b: Entry; ms: number };

/** Pairs whose times intersect. Quadratic, but the list is capped. */
export function findOverlaps(entries: readonly Entry[], now: number): Overlap[] {
  const sorted = entries.slice().sort((a, b) => a.start - b.start);
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    const aEnd = a.end ?? now;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (b.start >= aEnd) break; // sorted by start: nothing later can overlap
      const shared = Math.min(aEnd, b.end ?? now) - b.start;
      if (shared > 0) out.push({ a, b, ms: shared });
    }
  }
  return out;
}

/* ── CSV ──────────────────────────────────── */

/** RFC 4180 quoting. A lone carriage return counts: Excel and most parsers
 *  treat a bare CR inside an unquoted field as the end of the row, which
 *  silently shifted every later column by one. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(
  entries: readonly Entry[],
  now: number,
  mode: RoundMode = 'exact',
  granularity = 6,
  dateKey: (ms: number) => string = localDateKey
): string {
  const header = ['date', 'project', 'start', 'end', 'hours', 'billable_hours', 'note'];
  const rows = entries.map((entry) => {
    const ms = durationOf(entry, now);
    return [
      dateKey(entry.start),
      entry.project,
      formatClock(entry.start),
      entry.end === null ? '' : formatClock(entry.end),
      formatHours(ms),
      formatHours(billable(ms, mode, granularity)),
      entry.note,
    ]
      .map(csvField)
      .join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
