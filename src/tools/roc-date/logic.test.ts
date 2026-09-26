import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  civilFromDayNumber,
  dayFromIsoWeek,
  dayFromOrdinal,
  dayNumber,
  daysInMonth,
  factsFor,
  formatIso,
  formatIsoWeek,
  formatRoc,
  formatRocCompact,
  fromRoc,
  isLeapYear,
  isValidYmd,
  isoWeekOf,
  isoWeekOneMonday,
  isoWeekday,
  ordinalDay,
  parseAny,
  toRoc,
  versionStamps,
  weekdayOf,
  weeksInIsoYear,
} from './logic.ts';

const g = (year: number, month: number, day: number) => dayNumber(year, month, day);

test('civil conversion round trips and hits known anchors', () => {
  assert.equal(g(1970, 1, 1), 0);
  assert.equal(formatIso(g(2026, 9, 26)), '2026-09-26');
  assert.deepEqual(civilFromDayNumber(g(1911, 10, 10)), { year: 1911, month: 10, day: 10 });
  for (const day of [-200000, -1, 0, 12345, 20000]) {
    const civil = civilFromDayNumber(day);
    assert.equal(dayNumber(civil.year, civil.month, civil.day), day);
  }
});

test('leap years and month lengths follow the Gregorian rule', () => {
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 9), 30);
  assert.equal(isValidYmd(2024, 2, 29), true);
  assert.equal(isValidYmd(2026, 2, 29), false);
  assert.equal(isValidYmd(2026, 13, 1), false);
  assert.equal(isValidYmd(2026, 1, 0), false);
  assert.equal(isValidYmd(2026.5, 1, 1), false);
});

test('ROC years offset by 1911 with no year zero', () => {
  assert.deepEqual(toRoc(1912, 1, 1), { era: 'roc', year: 1, month: 1, day: 1 });
  assert.deepEqual(toRoc(2026, 9, 26), { era: 'roc', year: 115, month: 9, day: 26 });
  // 1911 is 民國前 1 年, not 民國 0 年.
  assert.deepEqual(toRoc(1911, 10, 10), { era: 'before', year: 1, month: 10, day: 10 });
  assert.deepEqual(toRoc(1898, 1, 1), { era: 'before', year: 14, month: 1, day: 1 });
  assert.equal(formatRoc(toRoc(2026, 9, 26)), '民國115年9月26日');
  assert.equal(formatRoc(toRoc(1911, 10, 10)), '民國前1年10月10日');
  assert.equal(formatRocCompact(toRoc(2026, 9, 26)), '1150926');
  assert.equal(formatRocCompact(toRoc(1912, 1, 1)), '0010101');
  assert.equal(formatRocCompact(toRoc(1911, 1, 1)), '—');
});

test('ROC dates convert back, and impossible ones refuse', () => {
  assert.equal(fromRoc({ era: 'roc', year: 115, month: 9, day: 26 }), g(2026, 9, 26));
  assert.equal(fromRoc({ era: 'before', year: 1, month: 10, day: 10 }), g(1911, 10, 10));
  assert.equal(fromRoc({ era: 'roc', year: 0, month: 1, day: 1 }), null);
  assert.equal(fromRoc({ era: 'roc', year: 113, month: 2, day: 30 }), null);
  assert.equal(fromRoc({ era: 'roc', year: 113, month: 2, day: 29 }), g(2024, 2, 29));
});

test('ISO weekday numbers Monday first', () => {
  assert.equal(isoWeekday(g(2026, 9, 21)), 1); // Monday
  assert.equal(isoWeekday(g(2026, 9, 27)), 7); // Sunday
  assert.equal(weekdayOf(g(2026, 9, 27)), 0);
});

test('ordinal day counts from the first of January', () => {
  assert.equal(ordinalDay(g(2026, 1, 1)), 1);
  assert.equal(ordinalDay(g(2026, 9, 26)), 269);
  assert.equal(ordinalDay(g(2024, 12, 31)), 366);
  assert.equal(ordinalDay(g(2026, 12, 31)), 365);
  assert.equal(dayFromOrdinal(2024, 366), g(2024, 12, 31));
  assert.equal(dayFromOrdinal(2026, 366), null);
  assert.equal(dayFromOrdinal(2026, 0), null);
  assert.equal(dayFromOrdinal(2026, 269), g(2026, 9, 26));
});

test('ISO weeks match the published boundary cases', () => {
  // Week 1 is the week containing 4 January; a week belongs to the year of its
  // Thursday, which is what makes these four dates the standard test set.
  assert.equal(formatIsoWeek(isoWeekOf(g(2026, 1, 1))), '2026-W01-4');
  assert.equal(formatIsoWeek(isoWeekOf(g(2021, 1, 1))), '2020-W53-5');
  assert.equal(formatIsoWeek(isoWeekOf(g(2020, 12, 31))), '2020-W53-4');
  assert.equal(formatIsoWeek(isoWeekOf(g(2024, 12, 30))), '2025-W01-1');
  assert.equal(formatIsoWeek(isoWeekOf(g(2016, 1, 3))), '2015-W53-7');
  assert.equal(formatIsoWeek(isoWeekOf(g(2026, 9, 26))), '2026-W39-6');
  assert.equal(formatIsoWeek(isoWeekOf(g(1977, 1, 1))), '1976-W53-6');
  assert.equal(formatIsoWeek(isoWeekOf(g(1977, 12, 31))), '1977-W52-6');
});

test('long ISO years are the ones starting on a Thursday, or leap on a Wednesday', () => {
  assert.equal(weeksInIsoYear(2020), 53);
  assert.equal(weeksInIsoYear(2026), 53);
  assert.equal(weeksInIsoYear(2025), 52);
  assert.equal(weeksInIsoYear(2015), 53);
  assert.equal(weeksInIsoYear(2024), 52);
  assert.equal(isoWeekOneMonday(2026), g(2025, 12, 29));
  assert.equal(isoWeekOneMonday(2025), g(2024, 12, 30));
});

test('week to day and day to week invert each other', () => {
  for (let day = g(2019, 1, 1); day <= g(2031, 12, 31); day += 1) {
    const week = isoWeekOf(day);
    assert.equal(dayFromIsoWeek(week.year, week.week, week.weekday), day, formatIso(day));
  }
  assert.equal(dayFromIsoWeek(2026, 54, 1), null);
  assert.equal(dayFromIsoWeek(2025, 53, 1), null); // 2025 has 52 weeks
  assert.equal(dayFromIsoWeek(2026, 1, 8), null);
  assert.equal(dayFromIsoWeek(2026, 0, 1), null);
  assert.equal(dayFromIsoWeek(2026, 39), g(2026, 9, 21)); // defaults to Monday
});

test('everything about one day is consistent', () => {
  const facts = factsFor(g(2026, 9, 26));
  assert.equal(facts.iso, '2026-09-26');
  assert.equal(facts.rocText, '民國115年9月26日');
  assert.equal(facts.rocCompact, '1150926');
  assert.equal(facts.ordinal, 269);
  assert.equal(facts.isoWeekText, '2026-W39-6');
  assert.equal(facts.weekday, 6);
  assert.equal(facts.quarter, 3);
  assert.equal(facts.leap, false);
  assert.equal(facts.daysInMonth, 30);
  assert.equal(facts.daysInYear, 365);
  assert.equal(facts.weeksInIsoYear, 53);
  const leapDay = factsFor(g(2024, 2, 29));
  assert.equal(leapDay.leap, true);
  assert.equal(leapDay.quarter, 1);
  assert.equal(leapDay.daysInMonth, 29);
});

test('every shape people type is read, and read as the right shape', () => {
  const target = g(2026, 9, 26);
  const cases: [string, string][] = [
    ['2026-09-26', 'iso'],
    ['2026/9/26', 'iso'],
    ['2026.09.26', 'iso'],
    ['20260926', 'iso-compact'],
    ['115/09/26', 'roc'],
    ['115-9-26', 'roc'],
    ['1150926', 'roc-compact'],
    ['民國115年9月26日', 'roc-chinese'],
    ['115年9月26日', 'roc-chinese'],
    ['2026年9月26日', 'chinese'],
    ['2026-W39-6', 'iso-week'],
    ['2026W39-6', 'iso-week'],
    ['2026-269', 'ordinal'],
    [' 2026-09-26 ', 'iso'],
    ['２０２６-０９-２６', 'iso'],
  ];
  for (const [text, format] of cases) {
    const hit = parseAny(text);
    assert.notEqual(hit, null, text);
    assert.equal(hit?.day, target, text);
    assert.equal(hit?.format, format, text);
  }
});

test('民國前 and week-only input land where they should', () => {
  assert.equal(parseAny('民國前1年10月10日')?.day, g(1911, 10, 10));
  assert.equal(parseAny('民前1年10月10日')?.day, g(1911, 10, 10));
  assert.equal(parseAny('2026-W01')?.day, g(2025, 12, 29)); // Monday of week 1
});

test('nonsense is refused rather than guessed', () => {
  for (const bad of ['', '   ', 'today', '2026-02-30', '115/02/30', '2026-W54-1', '2026-400', '99999999', '2026-13-01', '0000000']) {
    assert.equal(parseAny(bad), null, bad);
  }
});

test('version stamps are padded and dated', () => {
  const stamps = new Map(versionStamps(factsFor(g(2026, 9, 26))).map((row) => [row.label, row.value]));
  assert.equal(stamps.get('YYYYMMDD'), '20260926');
  assert.equal(stamps.get('YYYY.MM.DD'), '2026.09.26');
  assert.equal(stamps.get('YY.MM'), '26.09');
  assert.equal(stamps.get('ROC YYYMMDD'), '1150926');
  assert.equal(stamps.get('YYYY-Www'), '2026-W39');
  assert.equal(stamps.get('YYYYDDD'), '2026269');
  assert.equal(stamps.get('YYDDD'), '26269');
  const early = new Map(versionStamps(factsFor(g(2026, 1, 2))).map((row) => [row.label, row.value]));
  assert.equal(early.get('YYYYDDD'), '2026002');
});

test('full-width punctuation pasted out of a document still reads', () => {
  // Full-width digits were normalised but full-width separators were not, so a
  // date copied out of Word or a PDF came back as unreadable.
  const target = dayNumber(2026, 9, 26);
  for (const shape of [
    '２０２６－０９－２６',
    '２０２６／０９／２６',
    '２０２６．０９．２６',
    '2026－09－26',
    '115／09／26',
    '2026‑09‑26', // U+2011 non-breaking hyphen
    '2026–09–26', // U+2013 en dash
    '2026−09−26', // U+2212 minus sign
  ]) {
    const hit = parseAny(shape);
    assert.ok(hit !== null, `${shape} should parse`);
    assert.equal(hit.day, target, shape);
  }
  // Full-width Chinese-form years too.
  assert.equal(parseAny('民國１１５年９月２６日')?.day, target);
  // And nothing new is let through: a bare dash string is still refused.
  assert.equal(parseAny('－－－'), null);
  assert.equal(parseAny('2026－09'), null);
});
