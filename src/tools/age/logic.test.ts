import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsClamped,
  ageOn,
  anniversaryIn,
  civilFromDayNumber,
  dayNumber,
  daysInMonth,
  diffYmd,
  formatIso,
  isLeapYear,
  milestones,
  parseIso,
  spanBetween,
  upcomingBirthdays,
  weekdayOf,
} from './logic.ts';

const d = (iso: string) => {
  const day = parseIso(iso);
  assert.notEqual(day, null, iso);
  return day as number;
};

test('date plumbing round trips', () => {
  assert.equal(dayNumber(1970, 1, 1), 0);
  assert.equal(formatIso(d('2026-09-26')), '2026-09-26');
  assert.deepEqual(civilFromDayNumber(d('2024-02-29')), { year: 2024, month: 2, day: 29 });
  assert.equal(parseIso('2023-02-29'), null);
  assert.equal(parseIso('2026-9-5'), dayNumber(2026, 9, 5));
  assert.equal(parseIso('nope'), null);
  assert.equal(isLeapYear(2024), true);
  assert.equal(daysInMonth(2023, 2), 28);
  assert.equal(weekdayOf(d('2026-09-26')), 6);
});

test('the year/month/day difference borrows from the month before the end', () => {
  // The textbook cases, all hand-checked.
  assert.deepEqual(diffYmd(d('2000-03-01'), d('2001-02-28')), { years: 0, months: 11, days: 27 });
  assert.deepEqual(diffYmd(d('2024-01-31'), d('2024-03-01')), { years: 0, months: 1, days: 1 });
  // 31 Jan + 1 month clamps to 29 Feb, so that is exactly one month.
  assert.deepEqual(diffYmd(d('2024-01-31'), d('2024-02-29')), { years: 0, months: 1, days: 0 });
  assert.deepEqual(diffYmd(d('2024-02-29'), d('2025-02-28')), { years: 1, months: 0, days: 0 });
  assert.deepEqual(diffYmd(d('1990-05-15'), d('2026-09-26')), { years: 36, months: 4, days: 11 });
  assert.deepEqual(diffYmd(d('2026-09-26'), d('2026-09-26')), { years: 0, months: 0, days: 0 });
  assert.deepEqual(diffYmd(d('2026-09-26'), d('2026-09-25')), { years: 0, months: 0, days: -1 });
});

test('adding the reported difference back lands on the end date', () => {
  const pairs: [string, string][] = [
    ['2024-01-31', '2024-03-01'],
    ['2000-03-01', '2001-02-28'],
    ['1990-05-15', '2026-09-26'],
    ['2024-02-29', '2025-02-28'],
    ['2026-01-01', '2026-01-01'],
    ['2019-12-31', '2020-02-29'],
  ];
  for (const [from, to] of pairs) {
    const ymd = diffYmd(d(from), d(to));
    const rebuilt = addMonthsClamped(d(from), ymd.years * 12 + ymd.months) + ymd.days;
    assert.equal(formatIso(rebuilt), to, `${from}→${to}`);
  }
  assert.equal(formatIso(addMonthsClamped(d('2026-01-31'), 1)), '2026-02-28');
  assert.equal(formatIso(addMonthsClamped(d('2026-03-31'), -1)), '2026-02-28');
  assert.equal(formatIso(addMonthsClamped(d('2026-01-15'), 24)), '2028-01-15');
});

test('when the difference is under a month it equals the plain day count', () => {
  for (const [from, to] of [
    ['2024-01-31', '2024-02-29'],
    ['2026-02-28', '2026-03-05'],
    ['2026-12-25', '2027-01-03'],
  ] as const) {
    const ymd = diffYmd(d(from), d(to));
    if (ymd.years === 0 && ymd.months === 0) assert.equal(ymd.days, d(to) - d(from), `${from}→${to}`);
  }
});

test('29 February birthdays are a policy, not a guess', () => {
  const leapBorn = d('2000-02-29');
  assert.equal(formatIso(anniversaryIn(leapBorn, 2024, 'mar01')), '2024-02-29');
  assert.equal(formatIso(anniversaryIn(leapBorn, 2023, 'mar01')), '2023-03-01');
  assert.equal(formatIso(anniversaryIn(leapBorn, 2023, 'feb28')), '2023-02-28');
  // On 28 February 2023 the two policies give different ages, by one year.
  assert.equal(ageOn(leapBorn, d('2023-02-28'), 'feb28').years, 23);
  assert.equal(ageOn(leapBorn, d('2023-02-28'), 'mar01').years, 22);
  assert.equal(ageOn(leapBorn, d('2023-03-01'), 'mar01').years, 23);
  // Ordinary birthdays are untouched by the switch.
  assert.equal(anniversaryIn(d('1990-05-15'), 2026, 'feb28'), d('2026-05-15'));
});

test('age on a date is the completed years, with the remainder carried', () => {
  const age = ageOn(d('1990-05-15'), d('2026-09-26'));
  assert.equal(age.years, 36);
  assert.equal(age.months, 4);
  assert.equal(age.days, 11);
  assert.equal(age.totalDays, d('2026-09-26') - d('1990-05-15'));
  assert.equal(age.totalWeeks, Math.floor(age.totalDays / 7));
  assert.equal(formatIso(age.lastBirthday), '2026-05-15');
  assert.equal(formatIso(age.nextBirthday), '2027-05-15');
  assert.equal(age.daysToNext, d('2027-05-15') - d('2026-09-26'));
  assert.equal(age.turningNext, 37);
  assert.equal(age.weekdayBorn, weekdayOf(d('1990-05-15')));
});

test('the day before, of and after a birthday all read correctly', () => {
  const birth = d('2000-06-01');
  assert.equal(ageOn(birth, d('2026-05-31')).years, 25);
  const onTheDay = ageOn(birth, d('2026-06-01'));
  assert.equal(onTheDay.years, 26);
  assert.equal(onTheDay.months, 0);
  assert.equal(onTheDay.days, 0);
  assert.equal(onTheDay.daysToNext, 365);
  assert.equal(ageOn(birth, d('2026-06-02')).days, 1);
});

test('a newborn is zero years old and the nominal age is one', () => {
  const birth = d('2026-09-26');
  const age = ageOn(birth, birth);
  assert.equal(age.years, 0);
  assert.equal(age.totalDays, 0);
  assert.equal(age.nominal, 1);
  assert.equal(formatIso(age.nextBirthday), '2027-09-26');
  assert.equal(ageOn(birth, d('2027-01-01')).nominal, 2);
  assert.throws(() => ageOn(birth, d('2026-09-25')), RangeError);
});

test('upcoming birthdays are future, ordered, and know their weekday', () => {
  const list = upcomingBirthdays(d('1990-05-15'), d('2026-09-26'), 'mar01', 4);
  assert.deepEqual(
    list.map((entry) => [entry.iso, entry.turning]),
    [
      ['2027-05-15', 37],
      ['2028-05-15', 38],
      ['2029-05-15', 39],
      ['2030-05-15', 40],
    ]
  );
  assert.ok(list.every((entry) => entry.daysAway > 0));
  assert.equal(list[0].weekday, weekdayOf(d('2027-05-15')));
  // Today's own birthday counts as upcoming, with zero days away.
  const today = upcomingBirthdays(d('1990-09-26'), d('2026-09-26'), 'mar01', 1);
  assert.equal(today[0].iso, '2026-09-26');
  assert.equal(today[0].daysAway, 0);
  assert.equal(today[0].turning, 36);
  // A leap-day birthday under the 29 Feb policy still produces a real date.
  const leap = upcomingBirthdays(d('2000-02-29'), d('2026-09-26'), 'feb28', 3);
  assert.deepEqual(leap.map((entry) => entry.iso), ['2027-02-28', '2028-02-29', '2029-02-28']);
});

test('milestones are future only, sorted, and capped', () => {
  const from = d('2026-09-26');
  const birth = d('2000-01-01');
  const list = milestones(birth, from, 'mar01', 6);
  assert.equal(list.length, 6);
  assert.ok(list.every((entry) => entry.daysAway > 0));
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i].daysAway >= list[i - 1].daysAway);
  // 5000 days after 2000-01-01 is long past; 10000 is still ahead.
  assert.ok(!list.some((entry) => entry.label === '5000 d'));
  assert.ok(list.some((entry) => entry.label === '10000 d'));
  assert.ok(list.some((entry) => entry.label === '30 y'));
  const tenThousand = milestones(birth, from, 'mar01', 12).find((entry) => entry.label === '20000 d');
  assert.equal(tenThousand?.iso, formatIso(birth + 20_000));
  // A newborn has the small marks ahead of it.
  const babyMarks = milestones(from, from, 'mar01', 3);
  assert.equal(babyMarks[0].label, '1000 d');
});

test('a span reads the same both ways round, and flags the direction', () => {
  const forward = spanBetween(d('2026-01-01'), d('2026-12-25'));
  const backward = spanBetween(d('2026-12-25'), d('2026-01-01'));
  assert.equal(forward.days, backward.days);
  assert.deepEqual(forward.ymd, backward.ymd);
  assert.equal(forward.backwards, false);
  assert.equal(backward.backwards, true);
  assert.equal(forward.days, 358);
  assert.deepEqual(forward.ymd, { years: 0, months: 11, days: 24 });
  assert.equal(forward.weeks, 51);
  assert.equal(forward.weekRemainder, 1);
  assert.equal(forward.totalMonths, 11);
  assert.equal(forward.hours, 358 * 24);
  assert.equal(forward.minutes, 358 * 1440);
});

test('the weekday count in a span matches counting day by day', () => {
  const from = d('2026-01-01');
  for (const to of ['2026-01-01', '2026-01-02', '2026-01-08', '2026-03-17', '2027-02-14']) {
    let manual = 0;
    for (let day = from; day < d(to); day += 1) {
      const weekday = weekdayOf(day);
      if (weekday !== 0 && weekday !== 6) manual += 1;
    }
    assert.equal(spanBetween(from, d(to)).weekdays, manual, to);
  }
  assert.equal(spanBetween(from, from).days, 0);
  assert.equal(spanBetween(from, from).weekdays, 0);
});
