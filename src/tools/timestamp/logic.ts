/**
 * Timestamp conversion, with the units and the assumptions made explicit.
 *
 * Almost every bug in this area is one of three things, and all three are
 * handled by name here rather than papered over:
 *
 *  1. Wrong unit. `1645557742` and `1645557742000` differ by a factor of a
 *     thousand and both look like "a timestamp"; read the wrong way one lands in
 *     1970 and the other in the year 54000. The unit is detected by magnitude,
 *     the detection is stated in the output, and it can be overridden.
 *
 *  2. Missing offset. ISO 8601 says a date-time with no offset is local time.
 *     `Date.parse` disagrees with itself — `2024-01-01` is treated as UTC while
 *     `2024-01-01T00:00` is treated as local — which is why this file has its
 *     own parser and takes the assumption as an argument.
 *
 *  3. Precision loss. A JavaScript `Date` holds milliseconds. Microsecond and
 *     nanosecond inputs are common (Postgres, Prometheus, Go) and their extra
 *     digits cannot survive; they are kept separately and reported rather than
 *     silently truncated.
 */

export type Zone = 'local' | 'utc';

export type Unit = 'auto' | 's' | 'ms' | 'us' | 'ns';

export type ParseKind = 'unix' | 'iso8601' | 'rfc2822' | 'none';

export type ParseNote =
  | 'assumed-zone'
  | 'unit-guessed'
  | 'leap-second'
  | 'sub-millisecond-dropped'
  | 'two-digit-year'
  | 'obsolete-zone'
  | 'date-only'
  | 'out-of-range';

export type Parsed = {
  kind: ParseKind;
  /** Unix milliseconds. Exactly what a `Date` can hold, and no more. */
  ms: number;
  /** Nanoseconds below the millisecond that a `Date` cannot represent. */
  subMs: number;
  /** The unit the input was read in, once resolved. */
  unit: Exclude<Unit, 'auto'> | null;
  /** True when the text itself stated a UTC offset. */
  hadOffset: boolean;
  notes: ParseNote[];
};

const NONE: Parsed = {
  kind: 'none',
  ms: Number.NaN,
  subMs: 0,
  unit: null,
  hadOffset: false,
  notes: [],
};

/** The outer limits of a JavaScript Date: ±100 000 000 days from the epoch. */
export const MAX_MS = 8.64e15;

export function inRange(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_MS;
}

/* ── Unix epoch numbers ───────────────────── */

/**
 * Magnitude thresholds for guessing the unit.
 *
 * A seconds value of 1e11 would be the year 5138 and a millisecond value below
 * 1e11 would be before March 1973, so the boundaries are unambiguous for every
 * date anyone is actually working with. Outside that — a timestamp from the year
 * 6000, say — the guess is wrong and the unit has to be stated.
 */
const SECONDS_CEILING = 1e11;
const MILLIS_CEILING = 1e14;
const MICROS_CEILING = 1e17;

export function guessUnit(value: number): Exclude<Unit, 'auto'> {
  const magnitude = Math.abs(value);
  if (magnitude < SECONDS_CEILING) return 's';
  if (magnitude < MILLIS_CEILING) return 'ms';
  if (magnitude < MICROS_CEILING) return 'us';
  return 'ns';
}

/** Decimal digits of nanosecond below one of each unit. */
const NS_DIGITS: Record<Exclude<Unit, 'auto'>, number> = { s: 9, ms: 6, us: 3, ns: 0 };

const NS_PER_MS = BigInt(1_000_000);

/**
 * A bare epoch number. Accepts a decimal point (fractional seconds are common
 * in Python and in log formats) and thousands separators, since both turn up in
 * pasted data.
 *
 * The conversion runs on the digit string through BigInt rather than on a
 * double. `Number('1645557742123456789')` is already wrong in its last two
 * digits — 19 significant figures do not fit in a float64 — and losing the tail
 * of a nanosecond timestamp is exactly the failure this tool exists to avoid.
 */
export function parseUnix(text: string, unit: Unit): Parsed {
  const clean = text.trim().replace(/[_,\s]/g, '');
  const shape = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!shape) return NONE;
  const [, sign, whole, fraction = ''] = shape;

  const resolved = unit === 'auto' ? guessUnit(Number(clean)) : unit;
  const scale = NS_DIGITS[resolved];
  // Below a nanosecond nothing can be represented, so extra digits go.
  const scaled = fraction.slice(0, scale).padEnd(scale, '0');
  const nanos = BigInt(`${sign === '-' ? '-' : ''}${whole}${scaled}`);

  // BigInt division truncates toward zero; Unix time needs a floor, so that a
  // negative instant's sub-millisecond part stays a positive remainder.
  let msBig = nanos / NS_PER_MS;
  let remainder = nanos % NS_PER_MS;
  if (remainder < BigInt(0)) {
    msBig -= BigInt(1);
    remainder += NS_PER_MS;
  }

  const ms = Number(msBig);
  const notes: ParseNote[] = [];
  if (unit === 'auto') notes.push('unit-guessed');
  if (remainder !== BigInt(0)) notes.push('sub-millisecond-dropped');
  if (!inRange(ms)) notes.push('out-of-range');

  return { kind: 'unix', ms, subMs: Number(remainder), unit: resolved, hadOffset: true, notes };
}

/**
 * The Unix number in the requested unit, as text.
 *
 * Computed with BigInt rather than multiplication: the current instant in
 * nanoseconds is around 1.8 × 10^18, past the 2^53 exact-integer range of a
 * double, so `ms * 1e6` would quietly round the last two digits away — which is
 * precisely the tail someone converting nanosecond timestamps came here for.
 */
export function formatUnix(ms: number, subMs: number, unit: Exclude<Unit, 'auto'>): string {
  if (!inRange(ms)) return '—';
  if (unit === 's') return String(Math.floor(ms / 1000));
  if (unit === 'ms') return String(ms);
  const scale = BigInt(unit === 'us' ? 1000 : 1_000_000);
  const sub = BigInt(unit === 'us' ? Math.floor(subMs / 1000) : subMs);
  return (BigInt(ms) * scale + sub).toString();
}

/* ── ISO 8601 ─────────────────────────────── */

const ISO_EXTENDED =
  /^(-?\d{4,6})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;
const ISO_BASIC =
  /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:(\d{2})(?:[.,](\d{1,9}))?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;

function offsetMinutes(text: string | undefined): number | null {
  if (text === undefined || text === '') return null;
  if (text === 'Z' || text === 'z') return 0;
  const sign = text[0] === '-' ? -1 : 1;
  const digits = text.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Strict ISO 8601, with the zone assumption as an argument.
 *
 * `Date.parse` is not used because its two rules contradict each other: a
 * date-only string is UTC, a date-time without an offset is local. Anything that
 * converts timestamps for a living has to be explicit about which it means.
 */
export function parseIso8601(text: string, assume: Zone): Parsed {
  const input = text.trim();
  const found = ISO_EXTENDED.exec(input) ?? ISO_BASIC.exec(input);
  if (!found) return NONE;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zoneText] =
    found;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);

  if (month < 1 || month > 12) return NONE;
  if (day < 1 || day > daysInMonth(year, month)) return NONE;
  // 24:00 is a legal ISO 8601 spelling of midnight ending the day, but only
  // with zero minutes and seconds.
  if (hour > 24 || (hour === 24 && (minute !== 0 || second !== 0))) return NONE;
  if (minute > 59) return NONE;
  if (second > 60) return NONE;

  const notes: ParseNote[] = [];
  if (second === 60) notes.push('leap-second');
  if (hourText === undefined) notes.push('date-only');

  // Nine digits of fraction is nanoseconds; pad so '.5' means 500 ms, not 5 ns.
  const nanos = fractionText === undefined ? 0 : Number(fractionText.padEnd(9, '0'));
  const millis = Math.floor(nanos / 1e6);
  const subMs = nanos % 1e6;
  if (subMs !== 0) notes.push('sub-millisecond-dropped');

  const stated = offsetMinutes(zoneText);
  const hadOffset = stated !== null;
  if (!hadOffset) notes.push('assumed-zone');

  let ms: number;
  if (hadOffset) {
    ms = Date.UTC(year, month - 1, day, hour, minute, second, millis) - stated * 60_000;
  } else if (assume === 'utc') {
    ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  } else {
    const local = new Date(year, month - 1, day, hour, minute, second, millis);
    // Years 0–99 are remapped to 1900–1999 by this constructor; setFullYear
    // puts them back where the text said.
    if (year >= 0 && year < 100) local.setFullYear(year);
    ms = local.getTime();
  }

  // A date the syntax accepts but a Date cannot hold is a magnitude problem, not
  // a syntax one — the same thing parseUnix reports for a too-large number, and
  // it gets the same answer here. Returning NONE would make the screen say
  // "cannot be read" about a string that was read perfectly well.
  if (!inRange(ms)) notes.push('out-of-range');
  return { kind: 'iso8601', ms, subMs, unit: null, hadOffset, notes };
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

type Fields = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millis: number;
  weekday: number;
  offset: number;
};

/** Calendar fields of an instant in the chosen zone, plus that zone's offset. */
export function fieldsOf(ms: number, zone: Zone): Fields {
  const date = new Date(ms);
  if (zone === 'utc') {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millis: date.getUTCMilliseconds(),
      weekday: date.getUTCDay(),
      offset: 0,
    };
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millis: date.getMilliseconds(),
    weekday: date.getDay(),
    // getTimezoneOffset is minutes to *add* to local to reach UTC, i.e. the
    // opposite sign from the one written in an ISO string.
    offset: -date.getTimezoneOffset(),
  };
}

function offsetText(minutes: number): string {
  if (minutes === 0) return 'Z';
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.trunc(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

export function formatIso(ms: number, zone: Zone): string {
  if (!inRange(ms)) return '—';
  const f = fieldsOf(ms, zone);
  const year = f.year < 0 ? `-${pad(f.year, 6)}` : pad(f.year, 4);
  return (
    `${year}-${pad(f.month)}-${pad(f.day)}T${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}` +
    `.${pad(f.millis, 3)}${offsetText(f.offset)}`
  );
}

/* ── RFC 2822 / 5322 ──────────────────────── */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The obsolete alphabetic zones from RFC 822, kept because they still appear in
 * mail headers. RFC 5322 §4.3 says every unrecognised alphabetic zone — and
 * every single-letter military zone — must be taken as `-0000`, meaning "the
 * offset is unknown", which is not the same as UTC even though the arithmetic
 * matches.
 */
const OBSOLETE_ZONES: Record<string, number> = {
  UT: 0,
  GMT: 0,
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
};

const RFC2822 =
  /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|[A-Za-z]{1,3})$/;

export function parseRfc2822(text: string): Parsed {
  const found = RFC2822.exec(text.trim().replace(/\s*\([^)]*\)\s*$/, ''));
  if (!found) return NONE;

  const [, , dayText, monthText, yearText, hourText, minuteText, secondText, zoneText] = found;
  const monthIndex = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === monthText.toLowerCase()
  );
  if (monthIndex === -1) return NONE;

  const notes: ParseNote[] = [];
  let year = Number(yearText);
  if (yearText.length === 2) {
    // RFC 5322 §4.3: two-digit years 00–49 are 2000–2049, 50–99 are 1950–1999.
    year = year < 50 ? 2000 + year : 1900 + year;
    notes.push('two-digit-year');
  } else if (yearText.length === 3) {
    year += 1900;
    notes.push('two-digit-year');
  }

  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (day < 1 || day > daysInMonth(year, monthIndex + 1)) return NONE;
  if (hour > 23 || minute > 59 || second > 60) return NONE;
  if (second === 60) notes.push('leap-second');

  let offset: number;
  if (/^[+-]/.test(zoneText)) {
    const sign = zoneText[0] === '-' ? -1 : 1;
    offset = sign * (Number(zoneText.slice(1, 3)) * 60 + Number(zoneText.slice(3, 5)));
  } else {
    const known = OBSOLETE_ZONES[zoneText.toUpperCase()];
    offset = known ?? 0;
    notes.push('obsolete-zone');
  }

  const ms = Date.UTC(year, monthIndex, day, hour, minute, second) - offset * 60_000;
  if (!inRange(ms)) return NONE;
  return { kind: 'rfc2822', ms, subMs: 0, unit: null, hadOffset: true, notes };
}

export function formatRfc2822(ms: number, zone: Zone): string {
  if (!inRange(ms)) return '—';
  const f = fieldsOf(ms, zone);
  const offset =
    zone === 'utc'
      ? 'GMT'
      : `${f.offset < 0 ? '-' : '+'}${pad(Math.trunc(Math.abs(f.offset) / 60))}${pad(
          Math.abs(f.offset) % 60
        )}`;
  return (
    `${DAY_NAMES[f.weekday]}, ${pad(f.day)} ${MONTH_NAMES[f.month - 1]} ${pad(f.year, 4)} ` +
    `${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)} ${offset}`
  );
}

/* ── Anything at all ──────────────────────── */

/**
 * Tries each format in turn. Order matters: a bare number is tested first
 * because `Date.parse`-style parsers happily read `20240101` as a basic-format
 * ISO date, which is almost never what a naked number in a log means.
 */
export function parseAny(text: string, unit: Unit, assume: Zone): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return NONE;
  const asUnix = parseUnix(trimmed, unit);
  if (asUnix.kind !== 'none') return asUnix;
  const asIso = parseIso8601(trimmed, assume);
  if (asIso.kind !== 'none') return asIso;
  return parseRfc2822(trimmed);
}

/* ── Calendar readings ────────────────────── */

export type Breakdown = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millis: number;
  weekday: number;
  dayOfYear: number;
  isoWeek: number;
  isoWeekYear: number;
  quarter: number;
  leapYear: boolean;
  daysInMonth: number;
  offsetMinutes: number;
  /** Seconds since midnight in this zone — the form cron and crontab think in. */
  secondOfDay: number;
};

const DAY_MS = 86_400_000;

/**
 * ISO 8601 week number and week-year.
 *
 * The rule is stated in terms of Thursday: week 1 is the week containing the
 * first Thursday of January, so a date's week-year is the calendar year of the
 * Thursday in its own week. That is why 2021-01-01 belongs to week 53 of 2020.
 */
export function isoWeek(year: number, month: number, day: number): { week: number; year: number } {
  const date = Date.UTC(year, month - 1, day);
  const mondayIndex = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = date + (3 - mondayIndex) * DAY_MS;
  const weekYear = new Date(thursday).getUTCFullYear();
  const january1 = Date.UTC(weekYear, 0, 1);
  return { week: Math.floor((thursday - january1) / (7 * DAY_MS)) + 1, year: weekYear };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function breakdown(ms: number, zone: Zone): Breakdown | null {
  if (!inRange(ms)) return null;
  const f = fieldsOf(ms, zone);
  const startOfYear = Date.UTC(f.year, 0, 1);
  const thisDay = Date.UTC(f.year, f.month - 1, f.day);
  const week = isoWeek(f.year, f.month, f.day);
  return {
    ...f,
    dayOfYear: Math.round((thisDay - startOfYear) / DAY_MS) + 1,
    isoWeek: week.week,
    isoWeekYear: week.year,
    quarter: Math.floor((f.month - 1) / 3) + 1,
    leapYear: isLeapYear(f.year),
    daysInMonth: daysInMonth(f.year, f.month),
    offsetMinutes: f.offset,
    secondOfDay: f.hour * 3600 + f.minute * 60 + f.second,
  };
}

/**
 * Whole units between two instants, largest first. For "3 days 4 hours ago".
 *
 * Milliseconds are included only under a minute, and only when there are any.
 * Below a second they are the whole answer: this tool argues about nanoseconds
 * everywhere else, so rendering a 900 ms gap as "0 seconds" was the one place it
 * threw away precision it had. Past a minute the tail is noise and is dropped.
 * Anything finer than a millisecond is not here at all — these are two `Date`
 * milliseconds, and the sub-millisecond digits live in `Parsed.subMs`.
 */
export function elapsed(fromMs: number, toMs: number): { unit: string; value: number }[] {
  const total = Math.floor(Math.abs(toMs - fromMs));
  const parts: { unit: string; value: number }[] = [];
  let rest = Math.floor(total / 1000);
  for (const [unit, size] of [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ] as [string, number][]) {
    const value = Math.floor(rest / size);
    rest -= value * size;
    if (value > 0) parts.push({ unit, value });
  }
  const millis = total % 1000;
  if (millis > 0 && total < 60_000) parts.push({ unit: 'millisecond', value: millis });
  // Nothing at all means the two instants are the same, which reads better as
  // zero seconds than as an empty list.
  if (parts.length === 0) parts.push({ unit: 'second', value: 0 });
  return parts;
}
