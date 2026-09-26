/**
 * Age, anniversaries, and the span between two dates.
 *
 * All of it is day-number arithmetic, which is the only way to get the
 * month-end cases right. "One month after 31 January" has no answer in the
 * calendar, so the borrow has to be defined explicitly: the difference carries
 * from the month *before the end date*, which is the rule spreadsheets and
 * dateutil both use, and which guarantees that adding the reported years,
 * months and days back onto the start date lands on the end date.
 *
 * The 29 February birthday is a policy, not a fact — Taiwanese civil law and
 * most software disagree — so it is a switch rather than a hidden default.
 */

export type LeapPolicy = 'mar01' | 'feb28';

export type Ymd = { years: number; months: number; days: number };

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

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function formatIso(day: number): string {
  const { year, month, day: d } = civilFromDayNumber(day);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseIso(value: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return dayNumber(year, month, day);
}

/* ── Calendar differences ─────────────────── */

/**
 * Months added with the end of the month clamped: 31 January plus one month is
 * 29 February in a leap year and 28 February otherwise, because there is no
 * 31 February to land on. Every month-difference below is defined in terms of
 * this, which is what makes the difference reversible.
 */
export function addMonthsClamped(day: number, months: number): number {
  const a = civilFromDayNumber(day);
  const total = a.year * 12 + (a.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return dayNumber(year, month, Math.min(a.day, daysInMonth(year, month)));
}

/**
 * Years, months and days between two dates.
 *
 * Defined as "the most whole months that still fit, then the leftover days",
 * so adding the answer back onto the start date always lands exactly on the
 * end date. That is the property a naive field-by-field subtraction loses:
 * 31 Jan → 1 Mar is one month and one day, not two months minus thirty days.
 */
export function diffYmd(from: number, to: number): Ymd {
  if (to < from) {
    const flipped = diffYmd(to, from);
    // `-0` is a real value in JavaScript and it reads as "-0 years" in a UI.
    const negate = (n: number) => (n === 0 ? 0 : -n);
    return { years: negate(flipped.years), months: negate(flipped.months), days: negate(flipped.days) };
  }
  const a = civilFromDayNumber(from);
  const b = civilFromDayNumber(to);

  let months = (b.year - a.year) * 12 + (b.month - a.month);
  if (addMonthsClamped(from, months) > to) months -= 1;
  const days = to - addMonthsClamped(from, months);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** Where a birthday falls in a given year, once the 29 February case is decided. */
export function anniversaryIn(birth: number, year: number, policy: LeapPolicy): number {
  const b = civilFromDayNumber(birth);
  if (b.month === 2 && b.day === 29 && !isLeapYear(year)) {
    return policy === 'feb28' ? dayNumber(year, 2, 28) : dayNumber(year, 3, 1);
  }
  return dayNumber(year, b.month, b.day);
}

export type Age = {
  /** Completed years, the number that goes on a form. */
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  weekdayBorn: number;
  /** 虛歲, by calendar-year difference. Approximate on purpose — see the note. */
  nominal: number;
  /** The most recent birthday at or before the reference day. */
  lastBirthday: number;
  nextBirthday: number;
  daysToNext: number;
  turningNext: number;
};

export function ageOn(birth: number, on: number, policy: LeapPolicy = 'mar01'): Age {
  if (on < birth) throw new RangeError('the reference date is before the birth date');
  const birthYear = civilFromDayNumber(birth).year;
  const onYear = civilFromDayNumber(on).year;

  let years = onYear - birthYear;
  if (on < anniversaryIn(birth, onYear, policy)) years -= 1;

  const lastBirthday = years <= 0 ? birth : anniversaryIn(birth, birthYear + years, policy);
  const remainder = diffYmd(lastBirthday, on);
  // A 29 February birth under the 1 March policy can leave a remainder of a
  // whole year plus nothing; capping the months at eleven reports it as
  // "11 months and 30 days" instead of a second year that the age line
  // already accounts for.
  const spareMonths = Math.min(11, remainder.years * 12 + remainder.months);
  const spareDays = on - addMonthsClamped(lastBirthday, spareMonths);
  const nextBirthday = anniversaryIn(birth, birthYear + years + 1, policy);

  return {
    years: Math.max(0, years),
    months: spareMonths,
    days: spareDays,
    totalDays: on - birth,
    totalWeeks: Math.floor((on - birth) / 7),
    weekdayBorn: weekdayOf(birth),
    nominal: onYear - birthYear + 1,
    lastBirthday,
    nextBirthday,
    daysToNext: nextBirthday - on,
    turningNext: years + 1,
  };
}

export type Anniversary = { day: number; iso: string; turning: number; weekday: number; daysAway: number };

/** The next `howMany` birthdays, with the weekday each falls on. */
export function upcomingBirthdays(
  birth: number,
  from: number,
  policy: LeapPolicy = 'mar01',
  howMany = 6
): Anniversary[] {
  const birthYear = civilFromDayNumber(birth).year;
  const fromYear = civilFromDayNumber(from).year;
  const out: Anniversary[] = [];
  let year = fromYear;
  while (out.length < howMany && year < fromYear + 200) {
    const day = anniversaryIn(birth, year, policy);
    if (day >= from && year > birthYear) {
      out.push({
        day,
        iso: formatIso(day),
        turning: year - birthYear,
        weekday: weekdayOf(day),
        daysAway: day - from,
      });
    }
    year += 1;
  }
  return out;
}

export type Milestone = { label: string; day: number; iso: string; daysAway: number };

/**
 * The round numbers worth a message: thousand-day marks and decade birthdays.
 * Only future ones, because a milestone already passed is not a reminder.
 */
export function milestones(
  birth: number,
  from: number,
  policy: LeapPolicy = 'mar01',
  howMany = 6
): Milestone[] {
  const lived = from - birth;
  const out: Milestone[] = [];

  for (const step of [1000, 5000, 10_000, 20_000, 25_000, 30_000]) {
    if (step > lived) out.push({ label: `${step} d`, day: birth + step, iso: formatIso(birth + step), daysAway: birth + step - lived - birth });
  }
  // The next thousand-day mark, which is usually not in the list above.
  const nextThousand = (Math.floor(lived / 1000) + 1) * 1000;
  if (!out.some((entry) => entry.label === `${nextThousand} d`)) {
    out.push({
      label: `${nextThousand} d`,
      day: birth + nextThousand,
      iso: formatIso(birth + nextThousand),
      daysAway: birth + nextThousand - from,
    });
  }

  const birthYear = civilFromDayNumber(birth).year;
  const currentAge = ageOn(birth, from, policy).years;
  for (let age = Math.ceil((currentAge + 1) / 10) * 10; age <= currentAge + 40; age += 10) {
    const day = anniversaryIn(birth, birthYear + age, policy);
    if (day > from) out.push({ label: `${age} y`, day, iso: formatIso(day), daysAway: day - from });
  }

  return out
    .map((entry) => ({ ...entry, daysAway: entry.day - from }))
    .filter((entry) => entry.daysAway > 0)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, howMany);
}

export type Span = {
  days: number;
  ymd: Ymd;
  weeks: number;
  weekRemainder: number;
  totalMonths: number;
  hours: number;
  minutes: number;
  /** Working days assuming Saturday and Sunday off — a rough figure, no holidays. */
  weekdays: number;
  backwards: boolean;
};

/** Everything about the gap between two dates, in both directions. */
export function spanBetween(a: number, b: number): Span {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const days = to - from;
  const ymd = diffYmd(from, to);

  let weekdays = 0;
  // Whole weeks contribute five each; only the remainder needs counting.
  const wholeWeeks = Math.floor(days / 7);
  weekdays += wholeWeeks * 5;
  for (let day = from + wholeWeeks * 7; day < to; day += 1) {
    const weekday = weekdayOf(day);
    if (weekday !== 0 && weekday !== 6) weekdays += 1;
  }

  return {
    days,
    ymd,
    weeks: Math.floor(days / 7),
    weekRemainder: days % 7,
    totalMonths: ymd.years * 12 + ymd.months,
    hours: days * 24,
    minutes: days * 1440,
    weekdays,
    backwards: b < a,
  };
}
