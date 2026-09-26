/**
 * Cron parsing, reading, and the next few firing times.
 *
 * Two things make cron strings worth a tool rather than a memory aid.
 *
 * The first is that "cron" is not one language. Vixie cron takes five fields
 * and numbers Sunday 0 (accepting 7 as well); Quartz takes six or seven,
 * numbers Sunday 1, and adds `?`, `L` and `#`. The same six characters mean
 * different days in the two dialects, so the dialect is an explicit input here
 * rather than something guessed from the field count alone.
 *
 * The second is the day-of-month / day-of-week rule. When both fields are
 * restricted, cron fires when *either* matches — a union, not an intersection.
 * `0 0 1 * MON` is the first of the month and every Monday, which is roughly
 * five times as often as most people reading it expect. That rule is
 * implemented in `dayMatches` and stated in the notes, because it is the single
 * most common way a cron line does something other than what it says.
 *
 * Search is day-first: candidate days are tested with cheap calendar
 * arithmetic, and only a matching day has its times enumerated. That keeps
 * "29 February" — eight years of candidates — a few thousand cheap tests
 * instead of four million minute steps.
 */

/** Locale tag, declared locally so this file imports nothing. */
export type Loc = 'zh' | 'en';

const tr = (l: Loc, zh: string, en: string): string => (l === 'en' ? en : zh);

export type Dialect = 'unix' | 'quartz';
export type FieldName = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow' | 'year';

export type FieldSpec = {
  name: FieldName;
  /** Exactly as written, for echoing back next to the reading. */
  raw: string;
  /** Allowed values, ascending and unique. Day-of-week is normalised to 0=Sunday. */
  values: number[];
  /** `*` or Quartz `?` — the field places no restriction. */
  wildcard: boolean;
  /** Quartz `L` in day-of-month: the last day, whatever length the month is. */
  lastDay?: boolean;
  /** Quartz `5L`: the last of that weekday in the month. Normalised 0=Sunday. */
  lastWeekday?: number;
  /** Quartz `6#3`: the nth such weekday in the month. */
  nth?: { weekday: number; n: number };
  /** A range written high-to-low, e.g. `FRI-SUN`. Vixie cron rejects these. */
  wrapped?: boolean;
};

export type Cron = {
  dialect: Dialect;
  /** Which fields the expression actually carried, in order. */
  present: FieldName[];
  fields: Record<FieldName, FieldSpec>;
  /** Set when the input was a `@macro`; the fields are its expansion. */
  macro?: string;
  /** `@reboot` has no schedule at all — it is an event, not a time. */
  reboot?: boolean;
};

/** Reason codes, so the component owns the wording in both languages. */
export type CronErrorCode =
  | 'empty'
  | 'field-count'
  | 'unknown-macro'
  | 'empty-field'
  | 'bad-value'
  | 'out-of-range'
  | 'bad-step'
  | 'quartz-only'
  | 'question-placement'
  | 'unsupported'
  | 'list-with-special';

export class CronError extends Error {
  readonly code: CronErrorCode;
  readonly field: FieldName | null;
  readonly token: string;

  constructor(code: CronErrorCode, field: FieldName | null, token: string) {
    super(`${code}${field ? ` in ${field}` : ''}${token ? `: ${token}` : ''}`);
    this.name = 'CronError';
    this.code = code;
    this.field = field;
    this.token = token;
  }
}

/* ── Field vocabulary ─────────────────────── */

/** Normalised inclusive bounds. Day-of-week is 0=Sunday after normalisation. */
const LIMITS: Record<FieldName, [number, number]> = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
  year: [1970, 2099],
};

/** Raw bounds, before day-of-week normalisation. Unix takes 7 as Sunday too. */
function rawLimits(name: FieldName, dialect: Dialect): [number, number] {
  if (name !== 'dow') return LIMITS[name];
  return dialect === 'quartz' ? [1, 7] : [0, 7];
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Raw token → number, resolving three-letter names. No normalisation yet. */
function readRaw(token: string, name: FieldName, dialect: Dialect): number {
  const text = token.trim();
  if (text === '') throw new CronError('bad-value', name, token);
  const upper = text.toUpperCase();

  if (name === 'month') {
    const index = MONTH_NAMES.indexOf(upper);
    if (index !== -1) return index + 1;
  }
  if (name === 'dow') {
    const index = DAY_NAMES.indexOf(upper);
    // Names are dialect-independent, so they are returned already normalised
    // and marked by the +100 offset the caller strips. Quartz numbers Sunday 1
    // and Unix numbers it 0; a name must not pick up either offset.
    if (index !== -1) return index + 100;
  }
  if (!/^\d+$/.test(text)) throw new CronError('bad-value', name, token);

  const value = Number(text);
  const [lo, hi] = rawLimits(name, dialect);
  if (value < lo || value > hi) throw new CronError('out-of-range', name, token);
  return value;
}

/** Raw value → normalised value. Only day-of-week differs between dialects. */
function normalise(raw: number, name: FieldName, dialect: Dialect): number {
  if (name !== 'dow') return raw;
  if (raw >= 100) return raw - 100; // came from a name, already 0=Sunday
  if (dialect === 'quartz') return raw - 1; // Quartz: 1=Sunday
  return raw % 7; // Unix: 0 and 7 are both Sunday
}

/* ── Field parsing ────────────────────────── */

function parseField(raw: string, name: FieldName, dialect: Dialect): FieldSpec {
  const text = raw.trim();
  if (text === '') throw new CronError('empty-field', name, '');
  const [lo, hi] = LIMITS[name];
  const spec: FieldSpec = { name, raw: text, values: [], wildcard: false };

  if (text === '?') {
    if (dialect !== 'quartz') throw new CronError('quartz-only', name, '?');
    if (name !== 'dom' && name !== 'dow') throw new CronError('question-placement', name, '?');
    spec.wildcard = true;
    spec.values = span(lo, hi);
    return spec;
  }

  // Jenkins' `H` is not cron: it hashes the job name to spread load, so the
  // firing time depends on which job it belongs to. Nothing here can compute it.
  if (/^H(\/|$|\()/i.test(text)) throw new CronError('unsupported', name, 'H');
  // `W` (nearest weekday) and `LW` need a definition of "working day" that
  // Quartz only approximates and that no calendar here has; refusing beats
  // guessing. WED is stripped first — it is the only legitimate W in cron.
  if (/W/.test(text.toUpperCase().replace(/WED/g, ''))) {
    throw new CronError('unsupported', name, 'W');
  }

  // `L` is only a modifier in the two day fields, and only as the whole token —
  // otherwise JUL and APR-JUL would be mistaken for one. `#` never appears
  // anywhere else, so its presence alone is enough.
  const special =
    text.includes('#') ||
    ((name === 'dom' || name === 'dow') && /^(\d+)?L$/i.test(text)) ||
    ((name === 'dom' || name === 'dow') && text.toUpperCase().includes('L,')) ||
    ((name === 'dom' || name === 'dow') && text.toUpperCase().includes(',L'));
  if (special) {
    if (dialect !== 'quartz') throw new CronError('quartz-only', name, text);
    if (text.includes(',')) throw new CronError('list-with-special', name, text);

    const hash = text.indexOf('#');
    if (hash !== -1) {
      if (name !== 'dow') throw new CronError('unsupported', name, '#');
      const weekday = normalise(readRaw(text.slice(0, hash), name, dialect), name, dialect);
      const nth = Number(text.slice(hash + 1));
      if (!/^\d+$/.test(text.slice(hash + 1)) || nth < 1 || nth > 5) {
        throw new CronError('out-of-range', name, text);
      }
      spec.nth = { weekday, n: nth };
      spec.values = [weekday];
      return spec;
    }

    if (name === 'dom') {
      if (text.toUpperCase() !== 'L') throw new CronError('unsupported', name, text);
      spec.lastDay = true;
      spec.values = span(lo, hi);
      return spec;
    }
    if (name === 'dow') {
      if (text.toUpperCase() === 'L') {
        // Quartz: a bare L in day-of-week is simply Saturday.
        spec.values = [6];
        return spec;
      }
      const weekday = normalise(readRaw(text.slice(0, -1), name, dialect), name, dialect);
      spec.lastWeekday = weekday;
      spec.values = [weekday];
      return spec;
    }
    throw new CronError('unsupported', name, text);
  }

  const values = new Set<number>();
  let wildcard = false;
  let wrapped = false;

  for (const item of text.split(',')) {
    const piece = item.trim();
    if (piece === '') throw new CronError('empty-field', name, text);

    const slash = piece.indexOf('/');
    const base = slash === -1 ? piece : piece.slice(0, slash);
    const stepText = slash === -1 ? null : piece.slice(slash + 1);

    let step = 1;
    if (stepText !== null) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) {
        throw new CronError('bad-step', name, piece);
      }
      step = Number(stepText);
    }

    if (base === '*') {
      if (stepText === null) wildcard = true;
      for (let v = lo; v <= hi; v += step) values.add(v);
      continue;
    }

    const dash = base.indexOf('-', 1);
    const [rawLo, rawHi] = rawLimits(name, dialect);
    const from = readRaw(dash > 0 ? base.slice(0, dash) : base, name, dialect);
    const to = dash > 0 ? readRaw(base.slice(dash + 1), name, dialect) : from;

    // A day name resolves to a normalised value marked with +100 (raw weekday
    // numbers never reach 100). Stepping has to happen in one consistent space,
    // so names are converted back to the dialect's own numbering here.
    const fromName = name === 'dow' && from >= 100;
    const toName = name === 'dow' && to >= 100;
    const denameLo = fromName ? toRawDow(from - 100, dialect) : from;
    // `5/15` means "from 5, then every 15 to the end of the field" — the form
    // Quartz documents and most modern crons accept.
    const denameHi =
      dash <= 0 && stepText !== null ? rawHi : toName ? toRawDow(to - 100, dialect) : to;

    if (denameLo <= denameHi) {
      for (let v = denameLo; v <= denameHi; v += step) {
        values.add(normalise(v, name, dialect));
      }
    } else {
      // A high-to-low range wraps through the end of the field. Vixie cron
      // rejects this outright; Quartz and several modern crons accept it, so it
      // is honoured here and flagged in the notes.
      wrapped = true;
      const width = rawHi - rawLo + 1;
      for (let offset = 0; offset <= (denameHi - denameLo + width) % width; offset += step) {
        values.add(normalise(rawLo + ((denameLo - rawLo + offset) % width), name, dialect));
      }
    }
  }

  spec.wildcard = wildcard;
  spec.wrapped = wrapped || undefined;
  spec.values = Array.from(values).sort((a, b) => a - b);
  if (spec.values.length === 0) throw new CronError('bad-value', name, text);
  return spec;
}

/** Normalised day-of-week back into the dialect's own numbering. */
function toRawDow(normalised: number, dialect: Dialect): number {
  return dialect === 'quartz' ? normalised + 1 : normalised;
}

function span(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v += 1) out.push(v);
  return out;
}

/* ── Expression parsing ───────────────────── */

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/** Field count only, for the dialect the UI should preselect. */
export function detectDialect(text: string): Dialect {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 6 ? 'quartz' : 'unix';
}

const UNIX_ORDER: FieldName[] = ['minute', 'hour', 'dom', 'month', 'dow'];
const QUARTZ_ORDER: FieldName[] = ['second', 'minute', 'hour', 'dom', 'month', 'dow'];

export function parseCron(text: string, dialect: Dialect): Cron {
  const trimmed = text.trim();
  if (trimmed === '') throw new CronError('empty', null, '');

  if (trimmed.startsWith('@')) {
    const key = trimmed.toLowerCase();
    if (key === '@reboot') {
      const cron = parseCron('0 0 * * *', 'unix');
      return { ...cron, macro: '@reboot', reboot: true };
    }
    const expansion = MACROS[key];
    if (!expansion) throw new CronError('unknown-macro', null, trimmed);
    return { ...parseCron(expansion, 'unix'), macro: key };
  }

  const parts = trimmed.split(/\s+/);
  const order =
    dialect === 'unix'
      ? UNIX_ORDER
      : parts.length === 7
        ? [...QUARTZ_ORDER, 'year' as FieldName]
        : QUARTZ_ORDER;

  if (parts.length !== order.length) {
    throw new CronError('field-count', null, String(parts.length));
  }

  const fields = {} as Record<FieldName, FieldSpec>;
  order.forEach((name, index) => {
    fields[name] = parseField(parts[index], name, dialect);
  });

  // Fields the dialect does not carry still need a value for the matcher: an
  // absent seconds field means "at second zero", an absent year means any year.
  if (!fields.second) {
    fields.second = { name: 'second', raw: '0', values: [0], wildcard: false };
  }
  if (!fields.year) {
    fields.year = { name: 'year', raw: '*', values: span(1970, 2099), wildcard: true };
  }

  return { dialect, present: order, fields };
}

/* ── Calendar ─────────────────────────────── */

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type Zone = 'local' | 'utc';

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsOf(ms: number, zone: Zone): Parts & { dow: number } {
  const date = new Date(ms);
  return zone === 'utc'
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        dow: date.getUTCDay(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        dow: date.getDay(),
      };
}

/**
 * Parts → epoch milliseconds, or null when that local time does not exist.
 *
 * On a spring-forward day 02:30 local is not a real instant; the Date
 * constructor silently returns 03:30 instead. Round-tripping catches that, so
 * the tool reports one fewer run rather than a time that never happens.
 *
 * The autumn case is deliberately *not* symmetric. Where the clock falls back,
 * 01:30 local happens twice — two distinct instants an hour apart — and this
 * returns only the first, so the schedule lists one firing rather than two.
 * That is what Vixie cron does with a fixed time inside the repeated hour, and
 * it is also the only answer a round-trip through `Date` can give: the second
 * occurrence is unreachable from wall-clock fields alone. The UI says so under
 * the run list, and the notes say so in prose — it is a limit, not an oversight.
 */
function instantOf(parts: Parts, zone: Zone): number | null {
  if (zone === 'utc') {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() + 1 !== parts.month ||
    date.getDate() !== parts.day ||
    date.getHours() !== parts.hour ||
    date.getMinutes() !== parts.minute ||
    date.getSeconds() !== parts.second
  ) {
    return null;
  }
  return date.getTime();
}

/**
 * The first wall-clock second-of-day on this date that can still land after
 * `fromMs`. Everything below it is provably in the past.
 *
 * An instant is `utcMidnight + secondOfDay - offset`, so the *largest* instant a
 * given wall time can have is the one computed with the *smallest* offset the
 * zone uses that day. A local offset changes at most once in a day, so the
 * offsets at 00:00 and at 23:59:59 bracket every offset in play — taking the
 * smaller of the two makes the bound conservative: on a DST day the cutoff can
 * be an hour early, which costs a little wasted work and can never skip a real
 * firing time. `at > fromMs` in the caller stays the authority either way.
 */
function firstSecondOfDay(
  date: { year: number; month: number; day: number },
  fromMs: number,
  zone: Zone
): number {
  const base = Date.UTC(date.year, date.month - 1, date.day);
  let offsetMs = 0;
  if (zone === 'local') {
    const opening = -new Date(date.year, date.month - 1, date.day, 0, 0, 0).getTimezoneOffset();
    const closing = -new Date(date.year, date.month - 1, date.day, 23, 59, 59).getTimezoneOffset();
    offsetMs = Math.min(opening, closing) * 60_000;
  }
  return Math.floor((fromMs - base + offsetMs) / 1000) + 1;
}

function domHit(spec: FieldSpec, year: number, month: number, day: number): boolean {
  if (spec.lastDay) return day === daysInMonth(year, month);
  return spec.values.includes(day);
}

function dowHit(spec: FieldSpec, year: number, month: number, day: number, dow: number): boolean {
  if (spec.lastWeekday !== undefined) {
    return dow === spec.lastWeekday && day + 7 > daysInMonth(year, month);
  }
  if (spec.nth) {
    return dow === spec.nth.weekday && Math.floor((day - 1) / 7) + 1 === spec.nth.n;
  }
  return spec.values.includes(dow);
}

/**
 * The union rule. When both day fields are restricted, cron fires if *either*
 * matches; when one is `*` (or Quartz `?`), only the other one applies. This is
 * historical behaviour, not an oversight, and it is the usual reason a line
 * fires more often than its author intended.
 */
export function dayMatches(cron: Cron, year: number, month: number, day: number, dow: number): boolean {
  const dom = cron.fields.dom;
  const week = cron.fields.dow;
  if (dom.wildcard && week.wildcard) return true;
  if (dom.wildcard) return dowHit(week, year, month, day, dow);
  if (week.wildcard) return domHit(dom, year, month, day);
  return domHit(dom, year, month, day) || dowHit(week, year, month, day, dow);
}

/** Both day fields restricted, so the union rule is in play. */
export function unionInEffect(cron: Cron): boolean {
  return !cron.fields.dom.wildcard && !cron.fields.dow.wildcard;
}

/** Eight years of candidate days: enough to reach the next 29 February. */
export const MAX_DAYS = 366 * 8;

/**
 * The next `n` firing times strictly after `fromMs`.
 *
 * Returns fewer than `n` when the search window runs out — `0 0 29 2 *` in a
 * century with no leap February would be the honest empty answer, and a
 * schedule restricted to past years returns nothing at all.
 */
export function nextRuns(cron: Cron, fromMs: number, n: number, zone: Zone): number[] {
  if (cron.reboot) return [];
  const out: number[] = [];
  const start = partsOf(fromMs, zone);
  const { second, minute, hour, month, year } = cron.fields;

  let cursor = { year: start.year, month: start.month, day: start.day };

  for (let dayIndex = 0; dayIndex < MAX_DAYS && out.length < n; dayIndex += 1) {
    if (dayIndex > 0) {
      // Step one calendar day without touching clock time, so DST cannot move
      // the cursor onto the wrong date.
      const stepped = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1));
      cursor = {
        year: stepped.getUTCFullYear(),
        month: stepped.getUTCMonth() + 1,
        day: stepped.getUTCDate(),
      };
    }
    if (cursor.year > 2099) break;
    if (!year.values.includes(cursor.year)) continue;
    if (!month.values.includes(cursor.month)) continue;

    const dow = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay();
    if (!dayMatches(cron, cursor.year, cursor.month, cursor.day, dow)) continue;

    // Only the first candidate day can hold times at or before `fromMs`, and on
    // that day the whole run before it is dead weight: `* * * * *` would build
    // and discard up to 1439 instants, and a Quartz per-second expression up to
    // 86 399, on every keystroke. The cutoff below is the same filter, applied
    // before the arithmetic instead of after it.
    const floor = dayIndex === 0 ? firstSecondOfDay(cursor, fromMs, zone) : 0;

    for (const h of hour.values) {
      if (out.length >= n) break;
      if (h * 3600 + 3599 < floor) continue;
      for (const mi of minute.values) {
        if (out.length >= n) break;
        if (h * 3600 + mi * 60 + 59 < floor) continue;
        for (const s of second.values) {
          if (out.length >= n) break;
          if (h * 3600 + mi * 60 + s < floor) continue;
          const at = instantOf({ ...cursor, hour: h, minute: mi, second: s }, zone);
          if (at === null) continue; // local time skipped by a DST jump
          if (at > fromMs) out.push(at);
        }
      }
    }
  }

  return out;
}

/* ── Reading it out loud ──────────────────── */

export type Description = {
  summary: string;
  fields: { label: string; raw: string; reading: string }[];
  notes: string[];
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const MONTH_LABEL: Record<Loc, string[]> = {
  zh: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const DOW_LABEL: Record<Loc, string[]> = {
  zh: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** A readable list, abbreviated once it stops being readable. */
function listOf(values: readonly number[], l: Loc, label?: (v: number) => string, max = 8): string {
  const show = (v: number) => (label ? label(v) : String(v));
  const joiner = l === 'en' ? ', ' : '、';
  if (values.length <= max) return values.map(show).join(joiner);
  return `${values.slice(0, max).map(show).join(joiner)}${tr(l, ` …(共 ${values.length} 個)`, ` … (${values.length} values)`)}`;
}

/** A star-slash-step field such as star-slash-15 yields 15; anything else null. */
function everyN(raw: string): number | null {
  const found = /^\*\/(\d+)$/.exec(raw);
  return found ? Number(found[1]) : null;
}

function clockPhrase(cron: Cron, l: Loc): string {
  const { second, minute, hour } = cron.fields;
  const hasSecond = cron.present.includes('second');
  const secondEvery = hasSecond ? everyN(second.raw) : null;
  const minuteEvery = everyN(minute.raw);
  const hourEvery = everyN(hour.raw);

  let clock: string;
  if (hasSecond && second.wildcard && minute.wildcard && hour.wildcard) {
    return tr(l, '每一秒', 'every second');
  }
  if (secondEvery !== null && minute.wildcard && hour.wildcard) {
    return tr(l, `每 ${secondEvery} 秒`, `every ${secondEvery} seconds`);
  }
  if (minute.wildcard && hour.wildcard) {
    clock = tr(l, '每一分鐘', 'every minute');
  } else if (minuteEvery !== null && hour.wildcard) {
    clock = tr(l, `每 ${minuteEvery} 分鐘`, `every ${minuteEvery} minutes`);
  } else if (hourEvery !== null && minute.values.length === 1) {
    clock = tr(
      l,
      `每 ${hourEvery} 小時的第 ${minute.values[0]} 分`,
      `every ${hourEvery} hours at minute ${minute.values[0]}`
    );
  } else if (hour.wildcard) {
    clock = tr(
      l,
      `每小時的第 ${listOf(minute.values, l)} 分`,
      `at minute ${listOf(minute.values, l)} of every hour`
    );
  } else if (hour.values.length * minute.values.length <= 12) {
    const times: string[] = [];
    for (const h of hour.values) for (const mi of minute.values) times.push(`${pad2(h)}:${pad2(mi)}`);
    clock = tr(l, times.join('、'), `at ${times.join(', ')}`);
  } else {
    clock = tr(
      l,
      `${listOf(hour.values, l)} 時的第 ${listOf(minute.values, l)} 分`,
      `at minute ${listOf(minute.values, l)} of hour ${listOf(hour.values, l)}`
    );
  }

  const plainSecond = !hasSecond || (second.values.length === 1 && second.values[0] === 0);
  if (!plainSecond && second.wildcard) {
    clock += tr(l, '的每一秒', ', every second');
  } else if (!plainSecond && secondEvery !== null) {
    clock += tr(l, `,每 ${secondEvery} 秒一次`, `, every ${secondEvery} seconds`);
  } else if (!plainSecond) {
    clock += tr(l, `的第 ${listOf(second.values, l)} 秒`, `, second ${listOf(second.values, l)}`);
  }
  return clock;
}

function dayPhrase(cron: Cron, l: Loc): string {
  const dom = cron.fields.dom;
  const week = cron.fields.dow;
  const dowName = (v: number) => DOW_LABEL[l][v];

  const weekText = week.nth
    ? tr(
        l,
        `每月第 ${week.nth.n} 個${dowName(week.nth.weekday)}`,
        `the ${week.nth.n}${['st', 'nd', 'rd', 'th', 'th'][week.nth.n - 1]} ${dowName(week.nth.weekday)} of the month`
      )
    : week.lastWeekday !== undefined
      ? tr(
          l,
          `每月最後一個${dowName(week.lastWeekday)}`,
          `the last ${dowName(week.lastWeekday)} of the month`
        )
      : tr(l, `每${listOf(week.values, l, dowName, 7)}`, `every ${listOf(week.values, l, dowName, 7)}`);

  const domText = dom.lastDay
    ? tr(l, '每月最後一天', 'the last day of the month')
    : tr(l, `每月 ${listOf(dom.values, l)} 日`, `day ${listOf(dom.values, l)} of the month`);

  if (dom.wildcard && week.wildcard) return tr(l, '每天', 'every day');
  if (dom.wildcard) return weekText;
  if (week.wildcard) return domText;
  return tr(l, `${domText},或${weekText}`, `${domText}, or ${weekText}`);
}

export function describe(cron: Cron, l: Loc): Description {
  const { month, year } = cron.fields;
  const monthText = month.wildcard
    ? ''
    : tr(
        l,
        `限 ${listOf(month.values, l, (v) => MONTH_LABEL[l][v - 1], 12)}`,
        `in ${listOf(month.values, l, (v) => MONTH_LABEL[l][v - 1], 12)}`
      );
  const yearText =
    cron.present.includes('year') && !year.wildcard
      ? tr(l, `限 ${listOf(year.values, l, undefined, 6)} 年`, `in ${listOf(year.values, l, undefined, 6)}`)
      : '';

  const summary = cron.reboot
    ? tr(l, '開機後執行一次。@reboot 不是時刻,沒有「下一次」。', 'Runs once after boot. @reboot is an event, not a time — there is no next run.')
    : [dayPhrase(cron, l), monthText, yearText, clockPhrase(cron, l)]
        .filter(Boolean)
        .join(tr(l, ' ', ' '))
        .concat(tr(l, ' 執行', ''));

  const labels: Record<FieldName, [string, string]> = {
    second: ['秒', 'second'],
    minute: ['分', 'minute'],
    hour: ['時', 'hour'],
    dom: ['日', 'day of month'],
    month: ['月', 'month'],
    dow: ['週', 'day of week'],
    year: ['年', 'year'],
  };

  const reading = (spec: FieldSpec): string => {
    if (spec.wildcard) return tr(l, '不限', 'any');
    if (spec.lastDay) return tr(l, '當月最後一天', 'last day of month');
    if (spec.lastWeekday !== undefined) {
      return tr(l, `當月最後一個${DOW_LABEL[l][spec.lastWeekday]}`, `last ${DOW_LABEL[l][spec.lastWeekday]}`);
    }
    if (spec.nth) {
      return tr(
        l,
        `當月第 ${spec.nth.n} 個${DOW_LABEL[l][spec.nth.weekday]}`,
        `${DOW_LABEL[l][spec.nth.weekday]} #${spec.nth.n}`
      );
    }
    if (spec.name === 'month') return listOf(spec.values, l, (v) => MONTH_LABEL[l][v - 1], 12);
    if (spec.name === 'dow') return listOf(spec.values, l, (v) => DOW_LABEL[l][v], 7);
    return listOf(spec.values, l, undefined, 12);
  };

  const fields = cron.present.map((name) => ({
    label: tr(l, labels[name][0], labels[name][1]),
    raw: cron.fields[name].raw,
    reading: reading(cron.fields[name]),
  }));

  const notes: string[] = [];
  if (unionInEffect(cron)) {
    notes.push(
      tr(
        l,
        '日與週兩個欄位都指定了。cron 在這種情況下取聯集——只要其中一個成立就執行,不是兩個都要成立。這是歷史行為,不是這個工具的判斷。',
        'Both day fields are restricted. Cron fires when either one matches, not both — a union, not an intersection. That is historical cron behaviour, not this tool.'
      )
    );
    if (cron.dialect === 'quartz') {
      notes.push(
        tr(
          l,
          'Quartz 本身會拒絕日與週同時指定的寫法,要求其中一個寫 ?。這裡仍按聯集算給你看,但真的部署上去會直接報錯。',
          'Quartz itself rejects having both day fields specified and requires ? in one of them. The union is computed here anyway, but a real Quartz deployment will refuse the expression.'
        )
      );
    }
  }
  if (cron.dialect === 'quartz') {
    notes.push(
      tr(
        l,
        'Quartz 的週編號是 1=週日;Unix 是 0=週日(7 也算週日)。同一組數字在兩種方言指的是不同的日子。',
        'Quartz numbers Sunday 1; Unix numbers it 0 and also accepts 7. The same digits mean different days in the two dialects.'
      )
    );
  }
  for (const name of cron.present) {
    if (cron.fields[name].wrapped) {
      notes.push(
        tr(
          l,
          `${labels[name][0]} 欄位用了由大到小的區間(${cron.fields[name].raw})。這裡按環繞處理,但 Vixie cron(多數 Linux 的 /etc/crontab)會直接拒絕這種寫法。`,
          `The ${labels[name][1]} field uses a high-to-low range (${cron.fields[name].raw}). It is treated as wrapping here, but Vixie cron — what most Linux systems run — rejects it.`
        )
      );
    }
  }
  if (cron.macro && !cron.reboot) {
    notes.push(
      tr(
        l,
        `${cron.macro} 展開成 ${MACROS[cron.macro]}(五欄 Unix 格式)。`,
        `${cron.macro} expands to ${MACROS[cron.macro]} in five-field Unix form.`
      )
    );
  }

  return { summary, fields, notes };
}
