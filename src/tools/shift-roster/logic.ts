/**
 * Rotating rosters, and the two file formats a roster has to leave in.
 *
 * The roster itself is a modulo: person *i* on day *d* works
 * `pattern[(d + i × stagger) mod pattern.length]`. Written that way the whole
 * schedule is addressable — any cell can be computed without generating the
 * ones before it — and the rotation is guaranteed to stay in step no matter how
 * far out you scroll.
 *
 * The part worth checking is the rest gap. A pattern that looks balanced on a
 * grid can still put a night shift ending at 08:00 next to a day shift starting
 * at 08:00, and nobody notices until someone works sixteen hours. So the gap
 * between consecutive shifts is computed in real minutes, across midnight, and
 * anything under the threshold is reported.
 *
 * ICS output follows RFC 5545 where it matters and says so where it does not:
 * times are written as UTC instants, converted through the browser's own zone
 * database, because a TZID reference without an accompanying VTIMEZONE block is
 * the single most common way a calendar file lands an hour off.
 */

export type Shift = {
  /** Single token used in the pattern. */
  code: string;
  label: string;
  /** Minutes from midnight. Ignored when `hours` is 0. */
  start: number;
  /** Length in hours. Zero means a day off. */
  hours: number;
};

export type Roster = {
  people: string[];
  shifts: Shift[];
  pattern: string[];
  startDay: number;
  days: number;
  stagger: number;
  /** `cells[dayIndex][personIndex]` is a shift code. */
  cells: string[][];
};

export const LIMITS = {
  maxPeople: 60,
  maxDays: 366,
  maxPattern: 60,
} as const;

export class RosterTooBig extends Error {
  readonly what: 'people' | 'days' | 'pattern';

  constructor(what: 'people' | 'days' | 'pattern') {
    super(`too many ${what}`);
    this.name = 'RosterTooBig';
    this.what = what;
  }
}

/* ── Dates ────────────────────────────────── */

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

export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function formatIso(day: number): string {
  const { year, month, day: d } = civilFromDayNumber(day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseIso(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const n = dayNumber(year, month, day);
  const back = civilFromDayNumber(n);
  if (back.month !== month || back.day !== day) return null;
  return n;
}

/* ── Zones, for the calendar file ─────────── */

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

function zoneOffset(instant: number, timeZone: string): number {
  const found: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(found.year),
    Number(found.month) - 1,
    Number(found.day),
    Number(found.hour) % 24,
    Number(found.minute),
    Number(found.second)
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** Local wall clock in a zone → UTC instant, clock changes handled. */
export function zonedTimeToUtc(day: number, minutes: number, timeZone: string): number {
  const { year, month, day: d } = civilFromDayNumber(day);
  const naive = Date.UTC(year, month - 1, d) + minutes * 60_000;
  const before = zoneOffset(naive - 86_400_000, timeZone);
  const after = zoneOffset(naive + 86_400_000, timeZone);
  const offsets = before === after ? [before] : [before, after];
  const candidates = offsets.map((offset) => naive - offset * 60_000);
  const exact = candidates.filter((instant) => {
    const back: Record<string, string> = {};
    for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
      if (part.type !== 'literal') back[part.type] = part.value;
    }
    const local = (Number(back.hour) % 24) * 60 + Number(back.minute);
    return local === ((minutes % 1440) + 1440) % 1440;
  });
  return exact.length > 0 ? Math.min(...exact) : Math.max(...candidates);
}

/* ── Shifts ───────────────────────────────── */

export const OFF_CODE = 'X';

/** Seed set: a common three-shift rotation plus a day off. Editable in the UI. */
export const DEFAULT_SHIFTS: Shift[] = [
  { code: 'D', label: '白班', start: 8 * 60, hours: 8 },
  { code: 'E', label: '小夜', start: 16 * 60, hours: 8 },
  { code: 'N', label: '大夜', start: 0, hours: 8 },
  { code: OFF_CODE, label: '休', start: 0, hours: 0 },
];

export const DEFAULT_PATTERN = ['D', 'D', 'E', 'E', 'N', 'N', 'X', 'X'];

export function parseShiftTable(text: string): { shifts: Shift[]; problems: number[] } {
  const shifts: Shift[] = [];
  const problems: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const stripped = raw.replace(/#.*$/, '').trim();
    if (stripped === '') return;
    const fields = stripped.split(',').map((field) => field.trim());
    if (fields.length < 2) {
      problems.push(index + 1);
      return;
    }
    const [code, label, startText, hoursText] = fields;
    if (!/^[A-Za-z0-9]{1,3}$/.test(code)) {
      problems.push(index + 1);
      return;
    }
    const hours = hoursText === undefined || hoursText === '' ? 0 : Number(hoursText);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      problems.push(index + 1);
      return;
    }
    let start = 0;
    if (startText !== undefined && startText !== '') {
      const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(startText);
      if (!match || Number(match[1]) > 23 || Number(match[2] ?? 0) > 59) {
        problems.push(index + 1);
        return;
      }
      start = Number(match[1]) * 60 + Number(match[2] ?? 0);
    }
    if (shifts.some((shift) => shift.code === code)) {
      problems.push(index + 1);
      return;
    }
    shifts.push({ code, label: label === '' ? code : label, start, hours });
  });
  return { shifts, problems };
}

export function serializeShiftTable(shifts: readonly Shift[]): string {
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return shifts.map((shift) => `${shift.code}, ${shift.label}, ${clock(shift.start)}, ${shift.hours}`).join('\n');
}

export function parsePattern(text: string): string[] {
  return text
    .split(/[\s,>-]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '');
}

export function parsePeople(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((name) => name.replace(/#.*$/, '').trim())
    .filter((name) => name !== '');
}

/* ── Generating ───────────────────────────── */

export function generate(input: {
  people: readonly string[];
  shifts: readonly Shift[];
  pattern: readonly string[];
  startDay: number;
  days: number;
  stagger?: number;
}): Roster {
  const { people, shifts, pattern, startDay, days } = input;
  if (people.length === 0) throw new RangeError('a roster needs at least one person');
  if (pattern.length === 0) throw new RangeError('a roster needs a pattern');
  if (people.length > LIMITS.maxPeople) throw new RosterTooBig('people');
  if (days < 1 || days > LIMITS.maxDays) throw new RosterTooBig('days');
  if (pattern.length > LIMITS.maxPattern) throw new RosterTooBig('pattern');

  const known = new Set(shifts.map((shift) => shift.code));
  const unknown = pattern.find((code) => !known.has(code));
  if (unknown !== undefined) throw new RangeError(`pattern uses an undefined shift: ${unknown}`);

  // Default stagger spreads the people evenly around the pattern, which is
  // what makes a rotation cover every shift on every day.
  const stagger =
    input.stagger !== undefined && Number.isInteger(input.stagger) && input.stagger > 0
      ? input.stagger
      : Math.max(1, Math.floor(pattern.length / people.length));

  const cells = Array.from({ length: days }, (_, dayIndex) =>
    people.map((_person, personIndex) => pattern[(dayIndex + personIndex * stagger) % pattern.length])
  );

  return {
    people: [...people],
    shifts: [...shifts],
    pattern: [...pattern],
    startDay,
    days,
    stagger,
    cells,
  };
}

export function shiftOf(roster: Roster, code: string): Shift {
  return roster.shifts.find((shift) => shift.code === code) ?? { code, label: code, start: 0, hours: 0 };
}

export type PersonStats = {
  name: string;
  byCode: Record<string, number>;
  workDays: number;
  offDays: number;
  hours: number;
  /** Longest run of consecutive working days. */
  longestStretch: number;
};

export function statsFor(roster: Roster): PersonStats[] {
  return roster.people.map((name, personIndex) => {
    const byCode: Record<string, number> = {};
    let workDays = 0;
    let hours = 0;
    let stretch = 0;
    let longest = 0;
    for (let day = 0; day < roster.days; day += 1) {
      const code = roster.cells[day][personIndex];
      byCode[code] = (byCode[code] ?? 0) + 1;
      const shift = shiftOf(roster, code);
      if (shift.hours > 0) {
        workDays += 1;
        hours += shift.hours;
        stretch += 1;
        longest = Math.max(longest, stretch);
      } else {
        stretch = 0;
      }
    }
    return { name, byCode, workDays, offDays: roster.days - workDays, hours, longestStretch: longest };
  });
}

export type RestGap = {
  person: string;
  personIndex: number;
  /** Day index of the earlier shift. */
  dayIndex: number;
  iso: string;
  from: string;
  to: string;
  hours: number;
};

/**
 * Gaps shorter than `minHours` between the end of one shift and the start of
 * the next, counted across midnight in local wall-clock minutes.
 */
export function restGaps(roster: Roster, minHours = 11): RestGap[] {
  const gaps: RestGap[] = [];
  roster.people.forEach((name, personIndex) => {
    let previousEnd: number | null = null;
    let previousCode = '';
    let previousDay = 0;
    for (let day = 0; day < roster.days; day += 1) {
      const code = roster.cells[day][personIndex];
      const shift = shiftOf(roster, code);
      if (shift.hours <= 0) {
        previousEnd = null;
        continue;
      }
      const start = day * 1440 + shift.start;
      const end = start + shift.hours * 60;
      if (previousEnd !== null) {
        const rest = (start - previousEnd) / 60;
        if (rest < minHours) {
          gaps.push({
            person: name,
            personIndex,
            dayIndex: previousDay,
            iso: formatIso(roster.startDay + previousDay),
            from: previousCode,
            to: code,
            hours: Number(rest.toFixed(2)),
          });
        }
      }
      previousEnd = end;
      previousCode = code;
      previousDay = day;
    }
  });
  return gaps;
}

/* ── CSV ──────────────────────────────────── */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** RFC 4180 quoting. A lone carriage return counts: Excel and most parsers
 *  treat a bare CR inside an unquoted field as the end of the row, which
 *  silently shifted every later column by one. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(roster: Roster): string {
  const header = ['date', 'weekday', ...roster.people].map(csvField).join(',');
  const rows = roster.cells.map((row, dayIndex) => {
    const day = roster.startDay + dayIndex;
    return [formatIso(day), WEEKDAY_SHORT[weekdayOf(day)], ...row].map(csvField).join(',');
  });
  return [header, ...rows].join('\n');
}

/* ── ICS ──────────────────────────────────── */

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function utf8Length(value: string): number {
  let total = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) total += 1;
    else if (code < 0x800) total += 2;
    else if (code < 0x10000) total += 3;
    else total += 4;
  }
  return total;
}

/**
 * RFC 5545 §3.1: no content line may exceed 75 octets, and a continuation
 * begins with a single space. Counted in octets rather than characters, and
 * never split inside a multi-byte character — which is exactly what breaks
 * Chinese shift names in other exporters.
 */
export function foldIcsLine(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const out: string[] = [];
  let current = '';
  let budget = 75;
  for (const ch of line) {
    const size = utf8Length(ch);
    if (size > budget) {
      out.push(current);
      current = ch;
      // A continuation line spends one octet on its leading space.
      budget = 74 - size;
    } else {
      current += ch;
      budget -= size;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

function icsStamp(instant: number): string {
  const d = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export type IcsOptions = {
  timeZone: string;
  /** Calendar name, shown by most clients. */
  name: string;
  /** Fixed timestamp for DTSTAMP, passed in so the output is reproducible. */
  stamp: number;
  /** Only this person's shifts; omit for everyone. */
  onlyPerson?: number;
};

export function toIcs(roster: Roster, options: IcsOptions): string {
  const zone = isValidZone(options.timeZone) ? options.timeZone : 'UTC';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//manience.com//tools shift-roster//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(options.name)}`,
    `X-WR-TIMEZONE:${escapeIcsText(zone)}`,
  ];

  roster.cells.forEach((row, dayIndex) => {
    row.forEach((code, personIndex) => {
      if (options.onlyPerson !== undefined && options.onlyPerson !== personIndex) return;
      const shift = shiftOf(roster, code);
      if (shift.hours <= 0) return;
      const day = roster.startDay + dayIndex;
      const startInstant = zonedTimeToUtc(day, shift.start, zone);
      const endInstant = startInstant + shift.hours * 3_600_000;
      const person = roster.people[personIndex];
      lines.push(
        'BEGIN:VEVENT',
        `UID:${formatIso(day)}-${personIndex}-${code}@shift-roster.tools`,
        `DTSTAMP:${icsStamp(options.stamp)}`,
        `DTSTART:${icsStamp(startInstant)}`,
        `DTEND:${icsStamp(endInstant)}`,
        `SUMMARY:${escapeIcsText(`${shift.label} · ${person}`)}`,
        `DESCRIPTION:${escapeIcsText(`${code} ${shift.label} ${shift.hours}h — ${person}`)}`,
        'END:VEVENT'
      );
    });
  });

  lines.push('END:VCALENDAR');
  // RFC 5545 §3.1: every content line ends with CRLF, the last one included, and
  // every line is folded to 75 octets.
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
