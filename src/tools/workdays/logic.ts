/**
 * Working-day arithmetic over an editable calendar.
 *
 * There is no correct built-in answer to "how many working days", because the
 * answer is a policy: which weekdays are off, which public holidays your
 * office observes, and — in Taiwan specifically — which Saturdays are worked
 * to pay back a bridged holiday. So the calendar is data, the data is text the
 * user can edit, and everything here is arithmetic over day numbers rather
 * than over `Date` objects, which keeps daylight saving and local midnight
 * entirely out of the problem.
 */

export type EntryKind = 'holiday' | 'workday';

export type CalendarEntry = {
  /** Days since 1970-01-01. */
  day: number;
  iso: string;
  name: string;
  kind: EntryKind;
};

export type ParseProblem = { line: number; text: string; reason: 'date' | 'empty' | 'duplicate' };

export type ParsedTable = {
  entries: CalendarEntry[];
  problems: ParseProblem[];
};

/** Longest span the counter will walk, so a typo cannot spin the tab. */
export const MAX_SPAN_DAYS = 36_600; // just over a century
/** Longest search when stepping N working days out. */
export const MAX_STEP_DAYS = 20_000;

export class SpanTooLong extends Error {
  readonly days: number;

  constructor(days: number) {
    super(`span of ${days} days exceeds ${MAX_SPAN_DAYS}`);
    this.name = 'SpanTooLong';
    this.days = days;
  }
}

export class StepTooFar extends Error {
  constructor() {
    super(`no result within ${MAX_STEP_DAYS} days — every day in range is a holiday`);
    this.name = 'StepTooFar';
  }
}

/* ── Civil date arithmetic ────────────────── */

export function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDayNumber(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** 0 = Sunday. */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function formatIso(day: number): string {
  const { year, month, day: d } = civilFromDayNumber(day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `2026-09-26`, rejecting anything that is not a real date. */
export function parseIso(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const n = dayNumber(year, month, day);
  const back = civilFromDayNumber(n);
  if (back.year !== year || back.month !== month || back.day !== day) return null;
  return n;
}

/* ── The editable table ───────────────────── */

/**
 * One entry per line: `2026-01-01 元旦`. A leading `+` marks the opposite —
 * a Saturday that is worked to bridge a holiday, which Taiwan's calendar has
 * several of every year and which no library knows about.
 * `#` starts a comment. Blank lines are ignored.
 */
export function parseTable(text: string): ParsedTable {
  const entries: CalendarEntry[] = [];
  const problems: ParseProblem[] = [];
  const seen = new Map<number, number>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const stripped = raw.replace(/#.*$/, '').trim();
    if (stripped === '') return;

    const workday = stripped.startsWith('+');
    const body = workday ? stripped.slice(1).trim() : stripped;
    // The date stops at the first separator, comma included, so both
    // `2026-01-01 元旦` and a CSV-ish `2026-01-01,元旦` read the same.
    const split = /^([^\s,]+)[\s,]*(.*)$/.exec(body);
    if (!split) {
      problems.push({ line, text: raw, reason: 'empty' });
      return;
    }
    const day = parseIso(split[1]);
    if (day === null) {
      problems.push({ line, text: raw, reason: 'date' });
      return;
    }
    const previous = seen.get(day);
    if (previous !== undefined) {
      problems.push({ line, text: raw, reason: 'duplicate' });
      // Later line wins: the point of an editable table is that your own
      // correction overrides the seed above it.
      entries[previous] = { day, iso: formatIso(day), name: split[2].trim(), kind: workday ? 'workday' : 'holiday' };
      return;
    }
    seen.set(day, entries.length);
    entries.push({
      day,
      iso: formatIso(day),
      name: split[2].trim(),
      kind: workday ? 'workday' : 'holiday',
    });
  });

  entries.sort((a, b) => a.day - b.day);
  return { entries, problems };
}

export function serializeTable(entries: readonly CalendarEntry[]): string {
  return entries
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((entry) => `${entry.kind === 'workday' ? '+' : ''}${entry.iso}${entry.name ? ` ${entry.name}` : ''}`)
    .join('\n');
}

export type Calendar = {
  /** Weekday indices that are off by default. */
  weekend: ReadonlySet<number>;
  holidays: ReadonlyMap<number, string>;
  /** Days that are worked despite falling on a weekend. */
  workdays: ReadonlyMap<number, string>;
};

export function buildCalendar(entries: readonly CalendarEntry[], weekend: readonly number[]): Calendar {
  const holidays = new Map<number, string>();
  const workdays = new Map<number, string>();
  for (const entry of entries) {
    if (entry.kind === 'workday') workdays.set(entry.day, entry.name);
    else holidays.set(entry.day, entry.name);
  }
  return { weekend: new Set(weekend), holidays, workdays };
}

export type DayKind = 'work' | 'weekend' | 'holiday' | 'makeup';

/**
 * What one day is. A makeup workday beats the weekend, and a listed holiday
 * beats everything — an office closed on 10 October does not open because the
 * 10th is a Monday.
 */
export function classify(day: number, calendar: Calendar): DayKind {
  if (calendar.holidays.has(day)) return 'holiday';
  if (calendar.workdays.has(day)) return calendar.weekend.has(weekdayOf(day)) ? 'makeup' : 'work';
  return calendar.weekend.has(weekdayOf(day)) ? 'weekend' : 'work';
}

export function isWorkday(day: number, calendar: Calendar): boolean {
  const kind = classify(day, calendar);
  return kind === 'work' || kind === 'makeup';
}

export type Tally = {
  total: number;
  work: number;
  weekend: number;
  holiday: number;
  makeup: number;
};

/** Inclusive of both ends, which is how a leave form counts. */
export function countWorkdays(from: number, to: number, calendar: Calendar): Tally {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const total = end - start + 1;
  if (total > MAX_SPAN_DAYS) throw new SpanTooLong(total);

  const tally: Tally = { total, work: 0, weekend: 0, holiday: 0, makeup: 0 };
  for (let day = start; day <= end; day += 1) {
    const kind = classify(day, calendar);
    if (kind === 'work') tally.work += 1;
    else if (kind === 'makeup') tally.makeup += 1;
    else if (kind === 'holiday') tally.holiday += 1;
    else tally.weekend += 1;
  }
  return tally;
}

/** Working days in the span, makeup Saturdays included. */
export function workdayCount(from: number, to: number, calendar: Calendar): number {
  const tally = countWorkdays(from, to, calendar);
  return tally.work + tally.makeup;
}

/**
 * N working days from `start`, not counting `start` itself.
 *
 * That is the convention every contract uses ("payment within 5 working days"
 * starts counting tomorrow), and the reason a negative N is allowed is that
 * deadlines are read backwards just as often: three working days *before*
 * the hearing.
 */
export function addWorkdays(start: number, n: number, calendar: Calendar): number {
  if (!Number.isInteger(n)) throw new TypeError('addWorkdays needs an integer');
  if (n === 0) return start;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let day = start;
  let walked = 0;
  while (remaining > 0) {
    day += step;
    walked += 1;
    if (walked > MAX_STEP_DAYS) throw new StepTooFar();
    if (isWorkday(day, calendar)) remaining -= 1;
  }
  return day;
}

/** The next working day at or after `day`. */
export function nextWorkday(day: number, calendar: Calendar): number {
  let cursor = day;
  let walked = 0;
  while (!isWorkday(cursor, calendar)) {
    cursor += 1;
    walked += 1;
    if (walked > MAX_STEP_DAYS) throw new StepTooFar();
  }
  return cursor;
}

export type DayRow = { day: number; iso: string; weekday: number; kind: DayKind; name: string };

/** Day-by-day listing, capped so a decade-long span cannot render forever. */
export function listDays(from: number, to: number, calendar: Calendar, limit = 400): DayRow[] {
  const start = Math.min(from, to);
  const end = Math.min(Math.max(from, to), start + limit - 1);
  const rows: DayRow[] = [];
  for (let day = start; day <= end; day += 1) {
    const kind = classify(day, calendar);
    rows.push({
      day,
      iso: formatIso(day),
      weekday: weekdayOf(day),
      kind,
      name: calendar.holidays.get(day) ?? calendar.workdays.get(day) ?? '',
    });
  }
  return rows;
}

/** Working days per calendar month across a span, for a billing sheet. */
export function monthlyTotals(
  from: number,
  to: number,
  calendar: Calendar
): { month: string; work: number; total: number }[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (end - start + 1 > MAX_SPAN_DAYS) throw new SpanTooLong(end - start + 1);
  const out: { month: string; work: number; total: number }[] = [];
  let current = '';
  for (let day = start; day <= end; day += 1) {
    const { year, month } = civilFromDayNumber(day);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key !== current) {
      out.push({ month: key, work: 0, total: 0 });
      current = key;
    }
    const bucket = out[out.length - 1];
    bucket.total += 1;
    if (isWorkday(day, calendar)) bucket.work += 1;
  }
  return out;
}

/**
 * Seed calendar for Taiwan. Read the header before trusting it.
 *
 * Version 2026-09-26. Contains the fixed-date national holidays (certain,
 * they are on the same calendar date every year) and the 2026 lunar-calendar
 * holidays. It deliberately does NOT contain the 調整放假 bridge days or the
 * 補班 makeup Saturdays: those are decided each year by 行政院人事行政總處 and
 * inventing them would be worse than leaving them out. Add them yourself from
 * the published calendar — a makeup Saturday is a line starting with `+`.
 */
export const TAIWAN_SEED = [
  '# 台灣行事曆種子表(版本 2026-09-26)',
  '# 固定日期的國定假日 + 2026 年農曆節日。',
  '# 未含調整放假(補假)與補班日,請依人事行政總處公告自行增修。',
  '# 格式:YYYY-MM-DD 名稱      行首 + 代表該日照上班(補班)',
  '2026-01-01 元旦',
  '2026-02-16 除夕',
  '2026-02-17 春節',
  '2026-02-18 春節',
  '2026-02-19 春節',
  '2026-02-28 和平紀念日',
  '2026-04-04 兒童節',
  '2026-04-05 清明節',
  '2026-05-01 勞動節',
  '2026-06-19 端午節',
  '2026-09-25 中秋節',
  '2026-10-10 國慶日',
  '2026-12-25 行憲紀念日',
  '# 2027 只列固定日期的部分,農曆節日請自行補上',
  '2027-01-01 元旦',
  '2027-02-28 和平紀念日',
  '2027-04-04 兒童節',
  '2027-05-01 勞動節',
  '2027-10-10 國慶日',
  '2027-12-25 行憲紀念日',
].join('\n');

export const TAIWAN_SEED_VERSION = '2026-09-26';
