/**
 * Timing that survives a background tab.
 *
 * The naive stopwatch adds a fixed step on every interval callback, and it is
 * wrong the moment the tab loses focus: browsers clamp background timers to
 * about one callback a second, so a 50 ms ticker silently loses most of its
 * ticks and the clock runs slow. Everything here is derived from wall-clock
 * timestamps instead — the state holds *when* it started and how much time was
 * banked before that, and the elapsed value is a subtraction. Throttling then
 * costs display smoothness and nothing else.
 */

export type TimerState = {
  running: boolean;
  /** Timestamp of the last start. Meaningless while paused. */
  startedAt: number;
  /** Time banked by earlier runs, in milliseconds. */
  banked: number;
};

export const IDLE: TimerState = { running: false, startedAt: 0, banked: 0 };

export function elapsed(state: TimerState, now: number): number {
  const live = state.running ? Math.max(0, now - state.startedAt) : 0;
  return state.banked + live;
}

export function start(state: TimerState, now: number): TimerState {
  if (state.running) return state;
  return { running: true, startedAt: now, banked: state.banked };
}

export function pause(state: TimerState, now: number): TimerState {
  if (!state.running) return state;
  return { running: false, startedAt: 0, banked: elapsed(state, now) };
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.running ? pause(state, now) : start(state, now);
}

export function reset(): TimerState {
  return IDLE;
}

/** Remaining time against a target. Negative means the clock ran over. */
export function remaining(state: TimerState, target: number, now: number): number {
  return target - elapsed(state, now);
}

/** 0 to 1, clamped, for a progress bar. */
export function progress(state: TimerState, target: number, now: number): number {
  if (target <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed(state, now) / target));
}

/* ── Laps ─────────────────────────────────── */

export type Lap = {
  index: number;
  /** Total elapsed time when the lap was taken. */
  at: number;
  /** Time since the previous lap. */
  split: number;
};

export function addLap(laps: readonly Lap[], at: number): Lap[] {
  const previous = laps.length > 0 ? laps[laps.length - 1].at : 0;
  return [...laps, { index: laps.length + 1, at, split: Math.max(0, at - previous) }];
}

export type LapStats = { fastest: number; slowest: number; mean: number; total: number };

export function lapStats(laps: readonly Lap[]): LapStats | null {
  if (laps.length === 0) return null;
  const splits = laps.map((lap) => lap.split);
  const total = splits.reduce((sum, split) => sum + split, 0);
  return {
    fastest: Math.min(...splits),
    slowest: Math.max(...splits),
    mean: total / splits.length,
    total,
  };
}

/* ── Reading and writing durations ────────── */

export const MAX_DURATION_MS = 100 * 3600 * 1000; // a hundred hours

/**
 * Reads the shapes people type into a timer box:
 * `25` (minutes, which is what a bare number means on a timer),
 * `90s`, `1h30m`, `1h 30m 5s`, `1:30` (mm:ss) and `1:30:00` (h:mm:ss).
 * Returns null rather than guessing at anything else.
 */
export function parseDuration(text: string): number | null {
  const input = text.trim().toLowerCase();
  if (input === '') return null;

  // Colon form. Two fields are mm:ss, three are h:mm:ss — the convention on
  // every stopwatch, and the reason `1:30` is ninety seconds, not an hour.
  if (input.includes(':')) {
    const fields = input.split(':');
    if (fields.length > 3) return null;
    if (!fields.every((field) => /^\d{1,3}(\.\d+)?$/.test(field))) return null;
    const numbers = fields.map(Number);
    const [hours, minutes, seconds] =
      numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
    if (numbers.length === 3 && (minutes >= 60 || seconds >= 60)) return null;
    if (numbers.length === 2 && seconds >= 60) return null;
    const total = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    return total > MAX_DURATION_MS ? null : Math.round(total);
  }

  // Bare number: minutes.
  if (/^\d+(\.\d+)?$/.test(input)) {
    const total = Number(input) * 60_000;
    return total > MAX_DURATION_MS ? null : Math.round(total);
  }

  // Unit form, in any order, each unit at most once.
  const units: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000 };
  const pattern = /(\d+(?:\.\d+)?)\s*([hms])/g;
  const seen = new Set<string>();
  let total = 0;
  let consumed = 0;
  for (const match of input.matchAll(pattern)) {
    if (seen.has(match[2])) return null;
    seen.add(match[2]);
    total += Number(match[1]) * units[match[2]];
    // Counted without the whitespace the pattern swallowed between number and
    // unit, so `1 h 30 m` accounts for every character the same way `1h30m`
    // does. Comparing raw match lengths against a space-stripped input made
    // the two disagree and rejected the spaced form.
    consumed += match[0].replace(/\s+/g, '').length;
  }
  // Every character has to have been part of a unit group, so "1h junk" fails.
  if (seen.size === 0 || consumed !== input.replace(/\s+/g, '').length) return null;
  return total > MAX_DURATION_MS ? null : Math.round(total);
}

/** `01:23:45.6`, dropping the hour field when it is zero. */
export function formatDuration(value: number, tenths = false): string {
  const negative = value < 0;
  const total = Math.abs(value);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes);
  const body = `${head}:${pad(seconds)}`;
  const tail = tenths ? `.${Math.floor((total % 1000) / 100)}` : '';
  return `${negative ? '-' : ''}${body}${tail}`;
}

/** CSV of the laps, for pasting into a sheet. */
export function lapsToCsv(laps: readonly Lap[]): string {
  const rows = laps.map((lap) => `${lap.index},${formatDuration(lap.split, true)},${formatDuration(lap.at, true)}`);
  return ['lap,split,total', ...rows].join('\n');
}
