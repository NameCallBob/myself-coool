/**
 * The clock for the monitor facing the speaker.
 *
 * Everything about this tool is a colour decision, so the colour decision is
 * the part that is pure and tested. `phaseFor` maps remaining time to one of
 * four states with the thresholds given as data, and the boundary rule is
 * stated once here rather than re-guessed in the component: a threshold is
 * reached when the remaining time is *at or below* it, and overtime begins the
 * moment the remainder goes negative — not when it hits zero, because zero is
 * still on time.
 *
 * As everywhere else in this drawer, elapsed time is a subtraction of
 * timestamps. A talk clock that loses a minute because the laptop slept is
 * worse than no clock.
 */

export type Phase = 'calm' | 'warn' | 'danger' | 'over';

export function phaseFor(remaining: number, warnMs: number, dangerMs: number): Phase {
  if (remaining < 0) return 'over';
  if (remaining <= dangerMs) return 'danger';
  if (remaining <= warnMs) return 'warn';
  return 'calm';
}

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

export const MAX_DURATION_MS = 24 * 3600 * 1000;

/** `45`, `45m`, `1h30m`, `45:00`, `1:30:00`. A bare number is minutes. */
export function parseDuration(text: string): number | null {
  const input = text.trim().toLowerCase();
  if (input === '') return null;

  if (input.includes(':')) {
    const fields = input.split(':');
    if (fields.length > 3 || !fields.every((field) => /^\d{1,3}$/.test(field))) return null;
    const numbers = fields.map(Number);
    const [hours, minutes, seconds] = numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
    if (seconds >= 60 || (numbers.length === 3 && minutes >= 60)) return null;
    const total = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    return total > MAX_DURATION_MS ? null : total;
  }

  if (/^\d+(\.\d+)?$/.test(input)) {
    const total = Math.round(Number(input) * 60_000);
    return total > MAX_DURATION_MS ? null : total;
  }

  const units: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000 };
  const seen = new Set<string>();
  let total = 0;
  let consumed = 0;
  for (const match of input.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/g)) {
    if (seen.has(match[2])) return null;
    seen.add(match[2]);
    total += Number(match[1]) * units[match[2]];
    // Whitespace the pattern swallowed does not count, so `1 h 30 m` reads the
    // same as `1h30m`; comparing raw lengths against a space-stripped input
    // rejected the spaced form.
    consumed += match[0].replace(/\s+/g, '').length;
  }
  if (seen.size === 0 || consumed !== input.replace(/\s+/g, '').length) return null;
  return total > MAX_DURATION_MS ? null : Math.round(total);
}

/**
 * `12:34` / `1:02:03`, and with a leading minus once it is overtime. The hour
 * field appears only when there is one, so a twenty-minute talk gets the whole
 * width for the digits that matter.
 */
export function formatBig(ms: number, withSeconds = true): string {
  const negative = ms < 0;
  // Overtime counts up from zero: -0.4 s should read 00:00, not -00:00.
  const total = Math.floor(Math.abs(negative ? Math.ceil(ms / 1000) * 1000 : ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const body = withSeconds
    ? hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`
    : hours > 0
      ? `${hours}:${pad(minutes)}`
      : `${pad(minutes)}`;
  return `${negative && total > 0 ? '-' : ''}${body}`;
}

export type ClockFields = { hour: number; minute: number; second: number; suffix: string };

/** Local wall clock, split so the renderer never formats a date itself. */
export function clockFields(instant: number, hour12 = false): ClockFields {
  const d = new Date(instant);
  const hour24 = d.getHours();
  if (!hour12) return { hour: hour24, minute: d.getMinutes(), second: d.getSeconds(), suffix: '' };
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, minute: d.getMinutes(), second: d.getSeconds(), suffix: hour24 < 12 ? 'AM' : 'PM' };
}

export function formatClockFields(fields: ClockFields, withSeconds = true): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const body = withSeconds
    ? `${pad(fields.hour)}:${pad(fields.minute)}:${pad(fields.second)}`
    : `${pad(fields.hour)}:${pad(fields.minute)}`;
  return fields.suffix === '' ? body : `${body} ${fields.suffix}`;
}

/** Fraction of the allotted time used, clamped to 1. */
export function usedFraction(elapsedMs: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / total));
}
