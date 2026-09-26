/**
 * Overlapping working hours, computed on real instants.
 *
 * The tempting shortcut is to subtract UTC offsets and shift the hours. It is
 * wrong twice a year in every zone that observes summer time, and it is wrong
 * *by a whole hour on exactly the week people schedule things*, because the
 * northern and southern switch dates are weeks apart. So each cell here is a
 * genuine moment in time, converted to each person's wall clock by the
 * browser's own zone database. A row is a real hour someone can actually meet.
 *
 * Half-hour and quarter-hour zones (India, Nepal, Adelaide, Chatham) fall out
 * of this for free: their cells simply read :30 or :45, and their working hours
 * are compared in minutes rather than whole hours.
 */

export type Person = {
  name: string;
  zone: string;
  /** Minutes from local midnight. */
  start: number;
  end: number;
};

export type Status = 'work' | 'awake' | 'asleep';

/** Anything outside this band is treated as "asleep" rather than merely late. */
export const AWAKE_FROM = 7 * 60;
export const AWAKE_UNTIL = 23 * 60;

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  FORMATTERS.set(timeZone, made);
  return made;
}

export function isValidZone(timeZone: string): boolean {
  if (timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zoneParts(instant: number, timeZone: string): Wall {
  const found: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

export function zoneOffset(instant: number, timeZone: string): number {
  const p = zoneParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** Wall clock in a zone → instant. Both candidate offsets are checked, so a
 *  date that falls on a clock change still resolves to a real moment. */
export function zonedTimeToUtc(wall: Wall, timeZone: string): number {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const before = zoneOffset(naive - 86_400_000, timeZone);
  const after = zoneOffset(naive + 86_400_000, timeZone);
  const candidates = before === after ? [before] : [before, after];
  const instants = candidates.map((offset) => naive - offset * 60_000);
  const exact = instants.filter((instant) => {
    const back = zoneParts(instant, timeZone);
    return back.hour === wall.hour && back.minute === wall.minute && back.day === wall.day;
  });
  if (exact.length > 0) return Math.min(...exact);
  return Math.max(...instants);
}

export function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const n = dayNumber(year, month, day);
  const back = new Date(Date.UTC(1970, 0, 1 + n));
  if (back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) return null;
  return { year, month, day };
}

/* ── Working hours as text ────────────────── */

export type ParseProblem = { line: number; text: string; reason: 'zone' | 'hours' | 'shape' };

/**
 * `09:00` / `9` / `9.5` → minutes from midnight.
 *
 * `24:00` is accepted as end-of-day (1440) but nothing past it: `24:30` used to
 * return 1470, a time that does not exist on any clock, and a working day that
 * ran to it compared every local minute as "before the end".
 */
export function parseHour(value: string): number | null {
  const text = value.trim();
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 24 || minute > 59) return null;
    const minutes = hour * 60 + minute;
    return minutes > 1440 ? null : minutes;
  }
  if (!/^\d{1,2}(\.\d+)?$/.test(text)) return null;
  const hours = Number(text);
  if (hours > 24) return null;
  return Math.round(hours * 60);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * One person per line: `名字, 時區, 9-18`. The zone has to be an IANA name
 * because that is the only thing the browser can convert; a bad one is
 * reported with its line number rather than silently dropped.
 */
export function parsePeople(text: string): { people: Person[]; problems: ParseProblem[] } {
  const people: Person[] = [];
  const problems: ParseProblem[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const stripped = raw.replace(/#.*$/, '').trim();
    if (stripped === '') return;
    const fields = stripped.split(',').map((field) => field.trim());
    if (fields.length < 2) {
      problems.push({ line, text: raw, reason: 'shape' });
      return;
    }
    const [name, zone, hours] = fields;
    if (!isValidZone(zone)) {
      problems.push({ line, text: raw, reason: 'zone' });
      return;
    }
    let start = 9 * 60;
    let end = 18 * 60;
    if (hours !== undefined && hours !== '') {
      const parts = hours.split(/[-–~]/).map((part) => part.trim());
      if (parts.length !== 2) {
        problems.push({ line, text: raw, reason: 'hours' });
        return;
      }
      const from = parseHour(parts[0]);
      const to = parseHour(parts[1]);
      if (from === null || to === null || to <= from) {
        problems.push({ line, text: raw, reason: 'hours' });
        return;
      }
      start = from;
      end = to;
    }
    people.push({ name: name === '' ? zone : name, zone, start, end });
  });

  return { people, problems };
}

export function serializePeople(people: readonly Person[]): string {
  return people
    .map((person) => `${person.name}, ${person.zone}, ${formatMinutes(person.start)}-${formatMinutes(person.end)}`)
    .join('\n');
}

export const DEFAULT_PEOPLE = [
  '# 一行一個人:名字, IANA 時區, 上班時間',
  '我, Asia/Taipei, 9-18',
  'Tokyo, Asia/Tokyo, 10-19',
  'Berlin, Europe/Berlin, 9-17',
  'New York, America/New_York, 9-17',
].join('\n');

/* ── The grid ─────────────────────────────── */

export type Cell = {
  person: Person;
  hour: number;
  minute: number;
  /** Local minutes from midnight, which is what the comparison uses. */
  minutes: number;
  /** −1, 0 or +1 relative to the reference zone's date. */
  dayShift: number;
  status: Status;
  label: string;
};

export type Slot = {
  instant: number;
  /** Local time in the reference zone, the row's own label. */
  hour: number;
  minute: number;
  label: string;
  cells: Cell[];
  workCount: number;
  awakeCount: number;
  everyone: boolean;
};

export function statusOf(minutes: number, person: Person): Status {
  if (minutes >= person.start && minutes < person.end) return 'work';
  if (minutes >= AWAKE_FROM && minutes < AWAKE_UNTIL) return 'awake';
  return 'asleep';
}

/**
 * 24 hourly slots starting at local midnight in the reference zone.
 *
 * The step is a fixed hour of real time rather than "add one to the hour
 * field", so on the day clocks change the labels in the reference column skip
 * or repeat an hour — which is exactly what that day is like.
 */
export function buildGrid(
  date: { year: number; month: number; day: number },
  referenceZone: string,
  people: readonly Person[],
  hours = 24
): Slot[] {
  const midnight = zonedTimeToUtc(
    { year: date.year, month: date.month, day: date.day, hour: 0, minute: 0, second: 0 },
    referenceZone
  );
  const reference = dayNumber(date.year, date.month, date.day);

  return Array.from({ length: hours }, (_, step) => {
    const instant = midnight + step * 3_600_000;
    const here = zoneParts(instant, referenceZone);
    const cells = people.map((person) => {
      const there = zoneParts(instant, person.zone);
      const minutes = there.hour * 60 + there.minute;
      return {
        person,
        hour: there.hour,
        minute: there.minute,
        minutes,
        dayShift: dayNumber(there.year, there.month, there.day) - reference,
        status: statusOf(minutes, person),
        label: formatMinutes(minutes),
      };
    });
    const workCount = cells.filter((cell) => cell.status === 'work').length;
    return {
      instant,
      hour: here.hour,
      minute: here.minute,
      label: formatMinutes(here.hour * 60 + here.minute),
      cells,
      workCount,
      awakeCount: cells.filter((cell) => cell.status !== 'asleep').length,
      everyone: people.length > 0 && workCount === people.length,
    };
  });
}

export type Run = { from: number; to: number; length: number; label: string };

/** Maximal contiguous stretches where the predicate holds. */
export function runsOf(slots: readonly Slot[], predicate: (slot: Slot) => boolean): Run[] {
  const runs: Run[] = [];
  let openedAt = -1;
  slots.forEach((slot, index) => {
    if (predicate(slot)) {
      if (openedAt === -1) openedAt = index;
    } else if (openedAt !== -1) {
      runs.push(makeRun(slots, openedAt, index - 1));
      openedAt = -1;
    }
  });
  if (openedAt !== -1) runs.push(makeRun(slots, openedAt, slots.length - 1));
  return runs.sort((a, b) => b.length - a.length || a.from - b.from);
}

function makeRun(slots: readonly Slot[], from: number, to: number): Run {
  const startLabel = slots[from].label;
  // The run's end is the end of the last hour in it.
  const endMinutes = slots[to].hour * 60 + slots[to].minute + 60;
  const endLabel = formatMinutes(endMinutes % 1440);
  return { from, to, length: to - from + 1, label: `${startLabel}–${endLabel}` };
}

/** Rows ranked by how many people are at work, ties broken by earliest. */
export function bestSlots(slots: readonly Slot[], howMany = 5): Slot[] {
  return slots
    .slice()
    .sort((a, b) => b.workCount - a.workCount || b.awakeCount - a.awakeCount || a.instant - b.instant)
    .slice(0, howMany);
}

/** RFC 4180 quoting. Names come from the user, so a quote or a stray carriage
 *  return in one must not be able to break the shape of the file. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function gridToCsv(slots: readonly Slot[], referenceZone: string): string {
  if (slots.length === 0) return '';
  const header = [referenceZone, ...slots[0].cells.map((cell) => `${cell.person.name} (${cell.person.zone})`)];
  const rows = slots.map((slot) =>
    [
      slot.label,
      ...slot.cells.map(
        (cell) => `${cell.label}${cell.dayShift === 0 ? '' : cell.dayShift > 0 ? '+1d' : '-1d'} ${cell.status}`
      ),
    ]
      .map(csvField)
      .join(',')
  );
  return [header.map(csvField).join(','), ...rows].join('\n');
}
