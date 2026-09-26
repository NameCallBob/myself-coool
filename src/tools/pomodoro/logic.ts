/**
 * The pomodoro cycle as a pure function of an index.
 *
 * Storing "which phase are we in" as a mutable machine is how these things
 * drift: a missed tick or a reload and the sequence is out of step with the
 * count of finished work blocks. Here the whole schedule is `phaseAt(n)` — even
 * indices are work, odd ones are breaks, and the long break lands on every
 * n-th break by division rather than by a counter that can fall behind.
 *
 * Elapsed time is measured by subtracting timestamps, never by accumulating
 * interval callbacks, because background tabs are clamped to roughly one
 * callback a second and an accumulating timer simply runs slow.
 */

export type PhaseKind = 'work' | 'short' | 'long';

export type Config = {
  /** Minutes. */
  work: number;
  short: number;
  long: number;
  /** A long break replaces every n-th short break. */
  longEvery: number;
};

export const DEFAULT_CONFIG: Config = { work: 25, short: 5, long: 15, longEvery: 4 };

export const LIMITS = { minMinutes: 1, maxMinutes: 180, minEvery: 2, maxEvery: 12 } as const;

export function clampConfig(config: Config): Config {
  const minutes = (value: number, fallback: number) =>
    Number.isFinite(value)
      ? Math.min(LIMITS.maxMinutes, Math.max(LIMITS.minMinutes, Math.round(value)))
      : fallback;
  return {
    work: minutes(config.work, DEFAULT_CONFIG.work),
    short: minutes(config.short, DEFAULT_CONFIG.short),
    long: minutes(config.long, DEFAULT_CONFIG.long),
    longEvery: Number.isFinite(config.longEvery)
      ? Math.min(LIMITS.maxEvery, Math.max(LIMITS.minEvery, Math.round(config.longEvery)))
      : DEFAULT_CONFIG.longEvery,
  };
}

export type Phase = {
  index: number;
  kind: PhaseKind;
  minutes: number;
  ms: number;
  /** Which work block this is, or which one just finished for a break. */
  round: number;
};

/** Phase 0 is the first work block. */
export function phaseAt(index: number, config: Config): Phase {
  if (!Number.isInteger(index) || index < 0) throw new RangeError('phase index must be a non-negative integer');
  const safe = clampConfig(config);
  const isWork = index % 2 === 0;
  if (isWork) {
    return { index, kind: 'work', minutes: safe.work, ms: safe.work * 60_000, round: index / 2 + 1 };
  }
  const breakNumber = (index + 1) / 2;
  const long = breakNumber % safe.longEvery === 0;
  const minutes = long ? safe.long : safe.short;
  return { index, kind: long ? 'long' : 'short', minutes, ms: minutes * 60_000, round: breakNumber };
}

export function planCycle(config: Config, howMany: number): Phase[] {
  return Array.from({ length: Math.max(0, howMany) }, (_, index) => phaseAt(index, config));
}

/** Milliseconds of one full set: `longEvery` work blocks and their breaks. */
export function setLength(config: Config): number {
  const safe = clampConfig(config);
  return planCycle(safe, safe.longEvery * 2).reduce((sum, phase) => sum + phase.ms, 0);
}

/* ── Timer ────────────────────────────────── */

export type TimerState = { running: boolean; startedAt: number; banked: number };

export const IDLE: TimerState = { running: false, startedAt: 0, banked: 0 };

export function elapsed(state: TimerState, now: number): number {
  return state.banked + (state.running ? Math.max(0, now - state.startedAt) : 0);
}

export function start(state: TimerState, now: number): TimerState {
  return state.running ? state : { running: true, startedAt: now, banked: state.banked };
}

export function pause(state: TimerState, now: number): TimerState {
  return state.running ? { running: false, startedAt: 0, banked: elapsed(state, now) } : state;
}

export function formatClock(ms: number): string {
  const negative = ms < 0;
  const total = Math.abs(ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${negative ? '-' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* ── The tally ────────────────────────────── */

export type DayTally = {
  /** `YYYY-MM-DD`, local date — a pomodoro belongs to the day you did it. */
  date: string;
  completed: number;
  /** Focused minutes actually recorded, which is not rounds × length if the
   *  block length was changed halfway through the day. */
  minutes: number;
};

export type Log = DayTally[];

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Adds one finished work block. Same-day entries merge; the log stays sorted. */
export function recordWork(log: Log, date: string, minutes: number): Log {
  if (!isIsoDate(date)) throw new RangeError(`not an ISO date: ${date}`);
  const rounded = Math.max(0, Math.round(minutes));
  const existing = log.find((entry) => entry.date === date);
  const next = existing
    ? log.map((entry) =>
        entry.date === date
          ? { date, completed: entry.completed + 1, minutes: entry.minutes + rounded }
          : entry
      )
    : [...log, { date, completed: 1, minutes: rounded }];
  return next.slice().sort((a, b) => a.date.localeCompare(b.date));
}

/** Keeps a log from growing without limit; the newest `days` entries survive. */
export function trimLog(log: Log, days = 120): Log {
  return log.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

/**
 * Reads back whatever is in storage without trusting its shape.
 *
 * Rows for the same date are merged rather than kept side by side. A log with
 * two rows for one day made `totals()` count it as two days while `tallyFor()`
 * showed only the first row's count — two numbers on the same screen
 * disagreeing about the same day.
 */
export function sanitiseLog(value: unknown): Log {
  if (!Array.isArray(value)) return [];
  const byDate = new Map<string, DayTally>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as Partial<DayTally>;
    if (typeof row.date !== 'string' || !isIsoDate(row.date)) continue;
    const completed = Number.isFinite(row.completed) ? Math.max(0, Math.round(row.completed as number)) : 0;
    const minutes = Number.isFinite(row.minutes) ? Math.max(0, Math.round(row.minutes as number)) : 0;
    const found = byDate.get(row.date);
    if (found) {
      found.completed += completed;
      found.minutes += minutes;
    } else {
      byDate.set(row.date, { date: row.date, completed, minutes });
    }
  }
  return trimLog([...byDate.values()]);
}

export function totals(log: Log): { completed: number; minutes: number; days: number } {
  return {
    completed: log.reduce((sum, entry) => sum + entry.completed, 0),
    minutes: log.reduce((sum, entry) => sum + entry.minutes, 0),
    days: log.filter((entry) => entry.completed > 0).length,
  };
}

export function tallyFor(log: Log, date: string): DayTally {
  return log.find((entry) => entry.date === date) ?? { date, completed: 0, minutes: 0 };
}

/**
 * Day arithmetic on ISO strings, so no timezone enters the tally.
 *
 * Done with integer day numbers rather than `Date.UTC`, because `Date.UTC`
 * maps a year of 0–99 onto 1900–1999: `shiftIsoDate('0099-12-31', 1)` came
 * back as `2000-01-01`. Nothing in a tally should depend on that quirk.
 */
export function shiftIsoDate(date: string, days: number): string {
  if (!isIsoDate(date)) throw new RangeError(`not an ISO date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new RangeError(`not an ISO date: ${date}`);
  const shifted = civilFromDayNumber(dayNumber(year, month, day) + Math.trunc(days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(shifted.year).padStart(4, '0')}-${pad(shifted.month)}-${pad(shifted.day)}`;
}

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). */
function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDayNumber(days: number): { year: number; month: number; day: number } {
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

/**
 * Consecutive days ending today that have at least one finished block. Today
 * counts only if it has one; a streak is not broken by a day still in progress,
 * so an empty today falls back to the run ending yesterday.
 */
export function streak(log: Log, today: string): number {
  const active = new Set(log.filter((entry) => entry.completed > 0).map((entry) => entry.date));
  let cursor = active.has(today) ? today : shiftIsoDate(today, -1);
  let run = 0;
  while (active.has(cursor) && run < 4000) {
    run += 1;
    cursor = shiftIsoDate(cursor, -1);
  }
  return run;
}

/** The last `days` days, oldest first, zero-filled so the row is a strip. */
export function recentDays(log: Log, today: string, days = 7): DayTally[] {
  return Array.from({ length: days }, (_, offset) => tallyFor(log, shiftIsoDate(today, offset - days + 1)));
}

export function logToCsv(log: Log): string {
  return ['date,completed,minutes', ...log.map((entry) => `${entry.date},${entry.completed},${entry.minutes}`)].join('\n');
}
