/**
 * The four ways a date gets written on Taiwanese paperwork, and the two ways
 * it gets written in a build system.
 *
 * ROC (民國) years are a plain offset: 民國 1 is 1912, so year − 1911. The only
 * subtlety is that there is no year zero — 1911 is 民國前 1 年 — which is the
 * same off-by-one the Gregorian/BC boundary has, and the same one every naive
 * `year - 1911` implementation gets wrong.
 *
 * ISO week numbers are the genuinely tricky part, because an ISO week belongs
 * to the year containing its Thursday. That means 2020-12-31 is in week 53 of
 * 2020 while 2024-12-30 is already in week 1 of *2025*, so the week year is a
 * separate number from the calendar year and has to be reported as such.
 */

export type Era = 'roc' | 'before';

export type RocDate = { era: Era; year: number; month: number; day: number };

export type IsoWeek = {
  /** The week-numbering year, which is not always the calendar year. */
  year: number;
  week: number;
  /** 1 = Monday … 7 = Sunday, as ISO 8601 numbers them. */
  weekday: number;
};

export type DateFacts = {
  /** Days since 1970-01-01 — the canonical form everything converts through. */
  day: number;
  year: number;
  month: number;
  dayOfMonth: number;
  iso: string;
  roc: RocDate;
  rocText: string;
  rocCompact: string;
  /** 0 = Sunday, for weekday name lookup. */
  weekday: number;
  /** Day of the year, 1-366. */
  ordinal: number;
  isoWeek: IsoWeek;
  isoWeekText: string;
  leap: boolean;
  quarter: number;
  daysInMonth: number;
  daysInYear: number;
  weeksInIsoYear: number;
};

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

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function formatIso(day: number): string {
  const { year, month, day: d } = civilFromDayNumber(day);
  const sign = year < 0 ? '-' : '';
  return `${sign}${String(Math.abs(year)).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* ── ROC years ────────────────────────────── */

/** 1912 → 民國 1. 1911 → 民國前 1 (there is no year zero). */
export function toRoc(year: number, month: number, day: number): RocDate {
  return year >= 1912
    ? { era: 'roc', year: year - 1911, month, day }
    : { era: 'before', year: 1912 - year, month, day };
}

export function fromRoc(roc: RocDate): number | null {
  if (!Number.isInteger(roc.year) || roc.year < 1) return null;
  const year = roc.era === 'roc' ? roc.year + 1911 : 1912 - roc.year;
  if (!isValidYmd(year, roc.month, roc.day)) return null;
  return dayNumber(year, roc.month, roc.day);
}

export function formatRoc(roc: RocDate): string {
  const prefix = roc.era === 'before' ? '民國前' : '民國';
  return `${prefix}${roc.year}年${roc.month}月${roc.day}日`;
}

/** `1150926` — the seven-digit stamp used on forms and file names. */
export function formatRocCompact(roc: RocDate): string {
  if (roc.era === 'before') return '—';
  return `${String(roc.year).padStart(3, '0')}${String(roc.month).padStart(2, '0')}${String(roc.day).padStart(2, '0')}`;
}

/* ── ISO weeks and ordinals ───────────────── */

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: number): number {
  const sunday = weekdayOf(day);
  return sunday === 0 ? 7 : sunday;
}

export function ordinalDay(day: number): number {
  const { year } = civilFromDayNumber(day);
  return day - dayNumber(year, 1, 1) + 1;
}

/** Day number of the Monday of ISO week 1 of a week-numbering year. */
export function isoWeekOneMonday(weekYear: number): number {
  const jan4 = dayNumber(weekYear, 1, 4);
  // Week 1 is the week containing 4 January, by definition.
  return jan4 - (isoWeekday(jan4) - 1);
}

export function weeksInIsoYear(weekYear: number): number {
  const start = isoWeekOneMonday(weekYear);
  const next = isoWeekOneMonday(weekYear + 1);
  return (next - start) / 7;
}

export function isoWeekOf(day: number): IsoWeek {
  const { year } = civilFromDayNumber(day);
  // The week year can be the calendar year, the one before, or the one after.
  let weekYear = year;
  if (day < isoWeekOneMonday(year)) weekYear = year - 1;
  else if (day >= isoWeekOneMonday(year + 1)) weekYear = year + 1;
  const week = Math.floor((day - isoWeekOneMonday(weekYear)) / 7) + 1;
  return { year: weekYear, week, weekday: isoWeekday(day) };
}

export function formatIsoWeek(week: IsoWeek): string {
  return `${week.year}-W${String(week.week).padStart(2, '0')}-${week.weekday}`;
}

export function dayFromIsoWeek(weekYear: number, week: number, weekday = 1): number | null {
  if (!Number.isInteger(week) || week < 1 || week > weeksInIsoYear(weekYear)) return null;
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
  return isoWeekOneMonday(weekYear) + (week - 1) * 7 + (weekday - 1);
}

export function dayFromOrdinal(year: number, ordinal: number): number | null {
  const length = isLeapYear(year) ? 366 : 365;
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > length) return null;
  return dayNumber(year, 1, 1) + ordinal - 1;
}

/* ── Everything about one day ─────────────── */

export function factsFor(day: number): DateFacts {
  const { year, month, day: dayOfMonth } = civilFromDayNumber(day);
  const roc = toRoc(year, month, dayOfMonth);
  const isoWeek = isoWeekOf(day);
  return {
    day,
    year,
    month,
    dayOfMonth,
    iso: formatIso(day),
    roc,
    rocText: formatRoc(roc),
    rocCompact: formatRocCompact(roc),
    weekday: weekdayOf(day),
    ordinal: ordinalDay(day),
    isoWeek,
    isoWeekText: formatIsoWeek(isoWeek),
    leap: isLeapYear(year),
    quarter: Math.floor((month - 1) / 3) + 1,
    daysInMonth: daysInMonth(year, month),
    daysInYear: isLeapYear(year) ? 366 : 365,
    weeksInIsoYear: weeksInIsoYear(isoWeek.year),
  };
}

/* ── Reading whatever was pasted ──────────── */

export type ParseHit = {
  day: number;
  /** Which shape matched, so the UI can say how it was read. */
  format:
    | 'iso'
    | 'iso-compact'
    | 'roc'
    | 'roc-compact'
    | 'roc-chinese'
    | 'chinese'
    | 'iso-week'
    | 'ordinal';
};

const FULLWIDTH_DIGITS = /[\uff10-\uff19]/g;

/**
 * Separators that mean "dash", "slash" or "dot" but are not the ASCII
 * character. Dates on Taiwanese paperwork are usually copied out of Word, a PDF
 * or a full-width IME, which is where the full-width forms and the typographic
 * dashes come from. Folding them here is what lets `２０２６－０９－２６` read the
 * same as `2026-09-26` instead of being refused as an unknown shape.
 */
const SEPARATORS: Record<string, string> = {
  '\uff0d': '-', // full-width hyphen-minus
  '\u2010': '-', // hyphen
  '\u2011': '-', // non-breaking hyphen
  '\u2012': '-', // figure dash
  '\u2013': '-', // en dash
  '\u2014': '-', // em dash
  '\u2015': '-', // horizontal bar
  '\u2212': '-', // minus sign
  '\uff0f': '/', // full-width solidus
  '\uff0e': '.', // full-width full stop
  '\u3002': '.', // ideographic full stop
  '\u30fb': '.', // katakana middle dot
};

function normalise(input: string): string {
  return input
    .trim()
    .replace(FULLWIDTH_DIGITS, (ch) => String(ch.codePointAt(0)! - 0xff10))
    .replace(/[\uff0d\u2010-\u2015\u2212\uff0f\uff0e\u3002\u30fb]/g, (ch) => SEPARATORS[ch])
    .replace(/\s+/g, '');
}

/**
 * Reads the shapes people actually type, in an order chosen so nothing is
 * ambiguous: four-digit leading years are Gregorian, one-to-three-digit ones
 * are ROC, seven digits are a ROC stamp and eight are a Gregorian one.
 */
export function parseAny(input: string): ParseHit | null {
  const text = normalise(input);
  if (text === '') return null;

  // 民國前 2 年 1 月 1 日 / 民國115年9月26日 / 115年9月26日
  const chinese = /^(民國前|民前|民國)?(\d{1,4})年(\d{1,2})月(\d{1,2})日?$/.exec(text);
  if (chinese) {
    const marker = chinese[1] ?? '';
    const year = Number(chinese[2]);
    const month = Number(chinese[3]);
    const dayOfMonth = Number(chinese[4]);
    if (marker === '民國前' || marker === '民前') {
      const day = fromRoc({ era: 'before', year, month, day: dayOfMonth });
      return day === null ? null : { day, format: 'roc-chinese' };
    }
    if (marker === '民國' || year < 1000) {
      const day = fromRoc({ era: 'roc', year, month, day: dayOfMonth });
      return day === null ? null : { day, format: 'roc-chinese' };
    }
    if (!isValidYmd(year, month, dayOfMonth)) return null;
    return { day: dayNumber(year, month, dayOfMonth), format: 'chinese' };
  }

  // 2026-W39-6 / 2026W39
  const week = /^(\d{4})-?W(\d{1,2})(?:-?(\d))?$/i.exec(text);
  if (week) {
    const day = dayFromIsoWeek(Number(week[1]), Number(week[2]), week[3] ? Number(week[3]) : 1);
    return day === null ? null : { day, format: 'iso-week' };
  }

  // 2026-269 (ordinal). Requires the dash, so it cannot eat 2026-09.
  const ordinal = /^(\d{4})-(\d{3})$/.exec(text);
  if (ordinal) {
    const day = dayFromOrdinal(Number(ordinal[1]), Number(ordinal[2]));
    return day === null ? null : { day, format: 'ordinal' };
  }

  // 2026-09-26 / 2026/9/26 / 115/09/26 / 115.9.26
  const parts = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (parts) {
    const lead = Number(parts[1]);
    const month = Number(parts[2]);
    const dayOfMonth = Number(parts[3]);
    if (parts[1].length === 4) {
      if (!isValidYmd(lead, month, dayOfMonth)) return null;
      return { day: dayNumber(lead, month, dayOfMonth), format: 'iso' };
    }
    const day = fromRoc({ era: 'roc', year: lead, month, day: dayOfMonth });
    return day === null ? null : { day, format: 'roc' };
  }

  // 20260926 (Gregorian stamp) / 1150926 (ROC stamp)
  const compact = /^(\d{7,8})$/.exec(text);
  if (compact) {
    const digits = compact[1];
    if (digits.length === 8) {
      const year = Number(digits.slice(0, 4));
      const month = Number(digits.slice(4, 6));
      const dayOfMonth = Number(digits.slice(6, 8));
      if (!isValidYmd(year, month, dayOfMonth)) return null;
      return { day: dayNumber(year, month, dayOfMonth), format: 'iso-compact' };
    }
    const day = fromRoc({
      era: 'roc',
      year: Number(digits.slice(0, 3)),
      month: Number(digits.slice(3, 5)),
      day: Number(digits.slice(5, 7)),
    });
    return day === null ? null : { day, format: 'roc-compact' };
  }

  return null;
}

/**
 * Stamps for version numbers and file names, which is the other half of why
 * anyone converts a date at all.
 */
export function versionStamps(facts: DateFacts): { label: string; value: string }[] {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return [
    { label: 'YYYYMMDD', value: `${facts.year}${pad(facts.month)}${pad(facts.dayOfMonth)}` },
    { label: 'YYYY.MM.DD', value: `${facts.year}.${pad(facts.month)}.${pad(facts.dayOfMonth)}` },
    { label: 'YY.MM', value: `${pad(facts.year % 100)}.${pad(facts.month)}` },
    { label: 'ROC YYYMMDD', value: facts.rocCompact },
    { label: 'YYYY-Www', value: `${facts.isoWeek.year}-W${pad(facts.isoWeek.week)}` },
    { label: 'YYYYDDD', value: `${facts.year}${pad(facts.ordinal, 3)}` },
    { label: 'YYDDD', value: `${pad(facts.year % 100)}${pad(facts.ordinal, 3)}` },
  ];
}
