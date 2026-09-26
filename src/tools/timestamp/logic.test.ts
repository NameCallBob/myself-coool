import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MS,
  breakdown,
  daysInMonth,
  elapsed,
  fieldsOf,
  formatIso,
  formatRfc2822,
  formatUnix,
  guessUnit,
  inRange,
  isLeapYear,
  isoWeek,
  parseAny,
  parseIso8601,
  parseRfc2822,
  parseUnix,
} from './logic.ts';

/**
 * The instant RFC 9562 uses for its UUID examples, which is convenient because
 * it is exact to the second in every unit: 2022-02-22T19:22:22Z.
 */
const REF_MS = 1645557742000;

/* ── Unit guessing ────────────────────────── */

test('the unit is guessed from magnitude, with the boundaries stated', () => {
  assert.equal(guessUnit(1645557742), 's');
  assert.equal(guessUnit(1645557742000), 'ms');
  assert.equal(guessUnit(1645557742000000), 'us');
  assert.equal(guessUnit(1645557742000000000), 'ns');
  assert.equal(guessUnit(0), 's');
  assert.equal(guessUnit(-1645557742), 's');
  assert.equal(guessUnit(-1645557742000), 'ms');
});

test('parsing a bare epoch number lands on the same instant in every unit', () => {
  assert.equal(parseUnix('1645557742', 'auto').ms, REF_MS);
  assert.equal(parseUnix('1645557742000', 'auto').ms, REF_MS);
  assert.equal(parseUnix('1645557742000000', 'auto').ms, REF_MS);
  assert.equal(parseUnix('1645557742000000000', 'auto').ms, REF_MS);
});

test('an explicit unit overrides the guess', () => {
  // The same ten digits read as milliseconds is 1970, not 2022.
  const asMillis = parseUnix('1645557742', 'ms');
  assert.equal(asMillis.ms, 1645557742);
  assert.equal(new Date(asMillis.ms).toISOString(), '1970-01-20T01:05:57.742Z');
  assert.ok(!asMillis.notes.includes('unit-guessed'));
  assert.ok(parseUnix('1645557742', 'auto').notes.includes('unit-guessed'));
});

test('fractional seconds are kept, including below the millisecond', () => {
  const parsed = parseUnix('1645557742.123456789', 's');
  assert.equal(parsed.ms, 1645557742123);
  assert.equal(parsed.subMs, 456789);
  assert.ok(parsed.notes.includes('sub-millisecond-dropped'));
  assert.equal(parseUnix('1645557742.5', 's').ms, 1645557742500);
  assert.equal(parseUnix('1645557742.5', 's').subMs, 0);
});

test('nanosecond input keeps the digits a Date cannot hold', () => {
  const parsed = parseUnix('1645557742123456789', 'ns');
  assert.equal(parsed.ms, 1645557742123);
  assert.equal(parsed.subMs, 456789);
  assert.ok(parsed.notes.includes('sub-millisecond-dropped'));
});

test('separators pasted along with the number are tolerated', () => {
  assert.equal(parseUnix('1_645_557_742', 's').ms, REF_MS);
  assert.equal(parseUnix('1,645,557,742', 's').ms, REF_MS);
  assert.equal(parseUnix('  1645557742  ', 's').ms, REF_MS);
});

test('the epoch and negative times work', () => {
  assert.equal(parseUnix('0', 's').ms, 0);
  assert.equal(formatIso(0, 'utc'), '1970-01-01T00:00:00.000Z');
  const moon = parseUnix('-14182940', 's');
  assert.equal(formatIso(moon.ms, 'utc'), '1969-07-20T20:17:40.000Z');
});

test('what is not a number is not read as one', () => {
  for (const bad of ['', 'abc', '12ab', '1.2.3', '0x1f', '1e9', '--5']) {
    assert.equal(parseUnix(bad, 'auto').kind, 'none', bad);
  }
});

/* ── Unix formatting ──────────────────────── */

test('formatting to each unit is exact, nanoseconds included', () => {
  assert.equal(formatUnix(REF_MS, 0, 's'), '1645557742');
  assert.equal(formatUnix(REF_MS, 0, 'ms'), '1645557742000');
  assert.equal(formatUnix(REF_MS, 0, 'us'), '1645557742000000');
  // Past 2^53: multiplying in floating point would round the tail away.
  assert.equal(formatUnix(REF_MS, 0, 'ns'), '1645557742000000000');
  assert.equal(formatUnix(1645557742123, 456789, 'ns'), '1645557742123456789');
  assert.equal(formatUnix(1645557742123, 456789, 'us'), '1645557742123456');
});

test('formatting round-trips through parsing at nanosecond precision', () => {
  const text = '1645557742123456789';
  const parsed = parseUnix(text, 'ns');
  assert.equal(formatUnix(parsed.ms, parsed.subMs, 'ns'), text);
});

test('negative instants format correctly rather than by string concatenation', () => {
  const parsed = parseUnix('-1500000500', 'ns');
  assert.equal(parsed.ms, -1501);
  assert.equal(formatUnix(parsed.ms, parsed.subMs, 'ns'), '-1500000500');
});

test('out-of-range instants report a dash instead of a fake date', () => {
  assert.equal(formatUnix(MAX_MS + 1, 0, 'ms'), '—');
  assert.equal(formatIso(Number.NaN, 'utc'), '—');
  assert.equal(formatRfc2822(MAX_MS * 2, 'utc'), '—');
  assert.equal(inRange(MAX_MS), true);
  assert.equal(inRange(MAX_MS + 1), false);
  assert.equal(breakdown(Number.NaN, 'utc'), null);
});

/* ── ISO 8601 ─────────────────────────────── */

test('an ISO string with an offset is read at that offset', () => {
  assert.equal(parseIso8601('2022-02-22T19:22:22Z', 'utc').ms, REF_MS);
  assert.equal(parseIso8601('2022-02-22T19:22:22+00:00', 'utc').ms, REF_MS);
  assert.equal(parseIso8601('2022-02-22T14:22:22-05:00', 'utc').ms, REF_MS);
  assert.equal(parseIso8601('2022-02-23T04:22:22+09:00', 'utc').ms, REF_MS);
  // Offsets without the colon are the basic form of the same thing.
  assert.equal(parseIso8601('2022-02-22T14:22:22-0500', 'utc').ms, REF_MS);
  assert.ok(parseIso8601('2022-02-22T19:22:22Z', 'utc').hadOffset);
});

test('an ISO string without an offset uses the stated assumption', () => {
  const asUtc = parseIso8601('2022-02-22T19:22:22', 'utc');
  assert.equal(asUtc.ms, REF_MS);
  assert.equal(asUtc.hadOffset, false);
  assert.ok(asUtc.notes.includes('assumed-zone'));

  // Local depends on the machine, but must agree with the platform's own
  // interpretation of the same wall-clock fields.
  const asLocal = parseIso8601('2022-02-22T19:22:22', 'local');
  assert.equal(asLocal.ms, new Date(2022, 1, 22, 19, 22, 22).getTime());
});

test('a date with no time is midnight, and says it had no time', () => {
  const parsed = parseIso8601('2022-02-22', 'utc');
  assert.equal(parsed.ms, Date.UTC(2022, 1, 22));
  assert.ok(parsed.notes.includes('date-only'));
});

test('fractional seconds are read to nanosecond depth', () => {
  assert.equal(parseIso8601('2022-02-22T19:22:22.5Z', 'utc').ms, REF_MS + 500);
  assert.equal(parseIso8601('2022-02-22T19:22:22.123Z', 'utc').ms, REF_MS + 123);
  const nano = parseIso8601('2022-02-22T19:22:22.123456789Z', 'utc');
  assert.equal(nano.ms, REF_MS + 123);
  assert.equal(nano.subMs, 456789);
  // A comma is the ISO 8601 decimal sign too, and appears in European data.
  assert.equal(parseIso8601('2022-02-22T19:22:22,250Z', 'utc').ms, REF_MS + 250);
});

test('the basic form without separators parses', () => {
  assert.equal(parseIso8601('20220222T192222Z', 'utc').ms, REF_MS);
  assert.equal(parseIso8601('20220222', 'utc').ms, Date.UTC(2022, 1, 22));
});

test('a space instead of T is accepted, because logs write it that way', () => {
  assert.equal(parseIso8601('2022-02-22 19:22:22Z', 'utc').ms, REF_MS);
});

test('impossible dates are rejected rather than rolled over', () => {
  // Date.UTC would turn these into 1 March and 1 May respectively.
  assert.equal(parseIso8601('2023-02-29T00:00:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-04-31T00:00:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-13-01T00:00:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-00-10T00:00:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-02-22T25:00:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-02-22T19:61:00Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('not a date', 'utc').kind, 'none');
});

test('an ISO date past the Date range says out of range, not unreadable', () => {
  // parseUnix answers a too-large *number* with kind 'unix' plus an
  // out-of-range note. The same instant written as ISO has to be reported the
  // same way; saying "cannot be read" instead blames the syntax for a
  // magnitude problem.
  const far = parseIso8601('275760-09-14T00:00:00Z', 'utc');
  assert.equal(far.kind, 'iso8601');
  assert.ok(far.notes.includes('out-of-range'));
  assert.equal(inRange(far.ms), false);

  const early = parseIso8601('-271821-04-19T00:00:00Z', 'utc');
  assert.equal(early.kind, 'iso8601');
  assert.ok(early.notes.includes('out-of-range'));

  // A year so large the arithmetic itself gives up is still out of range, not
  // unparseable.
  const absurd = parseIso8601('999999-12-31T00:00:00Z', 'utc');
  assert.equal(absurd.kind, 'iso8601');
  assert.ok(absurd.notes.includes('out-of-range'));

  // The boundaries themselves are in range and carry no note.
  const edge = parseIso8601('275760-09-13T00:00:00Z', 'utc');
  assert.equal(edge.kind, 'iso8601');
  assert.equal(edge.ms, MAX_MS);
  assert.ok(!edge.notes.includes('out-of-range'));

  // Nonsense is still nonsense: only the magnitude case changed.
  assert.equal(parseIso8601('2023-02-29T00:00:00Z', 'utc').kind, 'none');
  assert.equal(parseAny('275760-09-14T00:00:00Z', 'auto', 'utc').kind, 'iso8601');
});

test('29 February is accepted in a leap year', () => {
  assert.equal(parseIso8601('2024-02-29T00:00:00Z', 'utc').ms, Date.UTC(2024, 1, 29));
});

test('24:00 is the legal spelling of midnight ending a day, and only that', () => {
  assert.equal(parseIso8601('2022-02-22T24:00:00Z', 'utc').ms, Date.UTC(2022, 1, 23));
  assert.equal(parseIso8601('2022-02-22T24:00:01Z', 'utc').kind, 'none');
  assert.equal(parseIso8601('2022-02-22T24:30:00Z', 'utc').kind, 'none');
});

test('a leap second is accepted and flagged', () => {
  const parsed = parseIso8601('2016-12-31T23:59:60Z', 'utc');
  assert.ok(parsed.notes.includes('leap-second'));
  // JavaScript has no leap seconds, so it becomes the following second.
  assert.equal(parsed.ms, Date.UTC(2017, 0, 1, 0, 0, 0));
});

test('ISO output is the round trip of ISO input', () => {
  for (const text of [
    '2022-02-22T19:22:22.000Z',
    '1970-01-01T00:00:00.000Z',
    '2024-02-29T23:59:59.999Z',
  ]) {
    assert.equal(formatIso(parseIso8601(text, 'utc').ms, 'utc'), text);
  }
});

test('local ISO output carries the machine offset and re-parses to the same instant', () => {
  const text = formatIso(REF_MS, 'local');
  assert.equal(parseIso8601(text, 'utc').ms, REF_MS);
  assert.match(text, /(Z|[+-]\d{2}:\d{2})$/);
});

/* ── RFC 2822 ─────────────────────────────── */

test('an RFC 2822 date with a numeric offset parses', () => {
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 19:22:22 +0000').ms, REF_MS);
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 14:22:22 -0500').ms, REF_MS);
  assert.equal(parseRfc2822('22 Feb 2022 19:22:22 +0000').ms, REF_MS);
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 19:22 +0000').ms, Date.UTC(2022, 1, 22, 19, 22));
});

test('GMT and the obsolete alphabetic zones are honoured and flagged', () => {
  const gmt = parseRfc2822('Tue, 22 Feb 2022 19:22:22 GMT');
  assert.equal(gmt.ms, REF_MS);
  assert.ok(gmt.notes.includes('obsolete-zone'));
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 14:22:22 EST').ms, REF_MS);
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 11:22:22 PST').ms, REF_MS);
  // RFC 5322 §4.3: an unknown alphabetic zone means -0000, offset unknown.
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 19:22:22 XYZ').ms, REF_MS);
});

test('a two-digit year follows the RFC 5322 window', () => {
  const near = parseRfc2822('22 Feb 22 19:22:22 +0000');
  assert.equal(near.ms, REF_MS);
  assert.ok(near.notes.includes('two-digit-year'));
  assert.equal(parseRfc2822('01 Jan 99 00:00:00 +0000').ms, Date.UTC(1999, 0, 1));
  assert.equal(parseRfc2822('01 Jan 50 00:00:00 +0000').ms, Date.UTC(1950, 0, 1));
  assert.equal(parseRfc2822('01 Jan 49 00:00:00 +0000').ms, Date.UTC(2049, 0, 1));
});

test('a trailing parenthesised comment is ignored, as mail headers carry one', () => {
  assert.equal(parseRfc2822('Tue, 22 Feb 2022 19:22:22 +0000 (UTC)').ms, REF_MS);
});

test('malformed RFC 2822 is rejected', () => {
  assert.equal(parseRfc2822('Tue, 30 Feb 2022 19:22:22 +0000').kind, 'none');
  assert.equal(parseRfc2822('Tue, 22 Foo 2022 19:22:22 +0000').kind, 'none');
  assert.equal(parseRfc2822('22 Feb 2022 25:00:00 +0000').kind, 'none');
  assert.equal(parseRfc2822('22 Feb 2022').kind, 'none');
  assert.equal(parseRfc2822('').kind, 'none');
});

test('RFC 2822 output re-parses to the same instant', () => {
  const utc = formatRfc2822(REF_MS, 'utc');
  assert.equal(utc, 'Tue, 22 Feb 2022 19:22:22 GMT');
  assert.equal(parseRfc2822(utc).ms, REF_MS);
  const local = formatRfc2822(REF_MS, 'local');
  assert.equal(parseRfc2822(local).ms, REF_MS);
});

/* ── parseAny ─────────────────────────────── */

test('parseAny recognises each shape and reports which', () => {
  assert.equal(parseAny('1645557742', 'auto', 'utc').kind, 'unix');
  assert.equal(parseAny('2022-02-22T19:22:22Z', 'auto', 'utc').kind, 'iso8601');
  assert.equal(parseAny('Tue, 22 Feb 2022 19:22:22 GMT', 'auto', 'utc').kind, 'rfc2822');
  assert.equal(parseAny('   ', 'auto', 'utc').kind, 'none');
  assert.equal(parseAny('nonsense', 'auto', 'utc').kind, 'none');
});

test('a bare digit run is a Unix number, not an ISO basic date', () => {
  // 20220222 as ISO basic would be a date; as a log field it is epoch seconds.
  const parsed = parseAny('20220222', 'auto', 'utc');
  assert.equal(parsed.kind, 'unix');
  assert.equal(parsed.ms, 20220222000);
});

/* ── Calendar readings ────────────────────── */

test('field extraction matches the platform in both zones', () => {
  const utc = fieldsOf(REF_MS, 'utc');
  assert.deepEqual(
    [utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second, utc.weekday, utc.offset],
    [2022, 2, 22, 19, 22, 22, 2, 0]
  );
  const local = fieldsOf(REF_MS, 'local');
  const date = new Date(REF_MS);
  assert.equal(local.year, date.getFullYear());
  assert.equal(local.hour, date.getHours());
  // The sign is the ISO one: east of Greenwich is positive.
  assert.equal(local.offset, -date.getTimezoneOffset());
});

test('ISO week numbers match the published edge cases', () => {
  // 2021-01-01 is a Friday, so it belongs to week 53 of 2020.
  assert.deepEqual(isoWeek(2021, 1, 1), { week: 53, year: 2020 });
  // 2020-12-31 likewise.
  assert.deepEqual(isoWeek(2020, 12, 31), { week: 53, year: 2020 });
  // 2019-12-30 is a Monday and starts week 1 of 2020.
  assert.deepEqual(isoWeek(2019, 12, 30), { week: 1, year: 2020 });
  // 2022-01-03 is the Monday starting week 1 of 2022.
  assert.deepEqual(isoWeek(2022, 1, 3), { week: 1, year: 2022 });
  // 2022-01-02 is the Sunday closing week 52 of 2021.
  assert.deepEqual(isoWeek(2022, 1, 2), { week: 52, year: 2021 });
  assert.deepEqual(isoWeek(2026, 12, 31), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek(2022, 2, 22), { week: 8, year: 2022 });
});

test('leap years follow the century rule', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2023), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(2100), false);
});

test('month lengths are right', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2023, 2), 28);
  assert.equal(daysInMonth(2023, 4), 30);
  assert.equal(daysInMonth(2023, 12), 31);
});

test('the breakdown reports day of year, quarter and week together', () => {
  const read = breakdown(REF_MS, 'utc');
  assert.ok(read);
  assert.equal(read.dayOfYear, 53); // 31 January days + 22
  assert.equal(read.quarter, 1);
  assert.equal(read.isoWeek, 8);
  assert.equal(read.isoWeekYear, 2022);
  assert.equal(read.leapYear, false);
  assert.equal(read.daysInMonth, 28);
  assert.equal(read.secondOfDay, 19 * 3600 + 22 * 60 + 22);
  assert.equal(read.offsetMinutes, 0);
});

test('day of year is right on both sides of a leap day', () => {
  assert.equal(breakdown(Date.UTC(2024, 11, 31), 'utc')?.dayOfYear, 366);
  assert.equal(breakdown(Date.UTC(2023, 11, 31), 'utc')?.dayOfYear, 365);
  assert.equal(breakdown(Date.UTC(2024, 0, 1), 'utc')?.dayOfYear, 1);
  assert.equal(breakdown(Date.UTC(2024, 2, 1), 'utc')?.dayOfYear, 61);
});

test('a gap under a second is reported in milliseconds, not as zero seconds', () => {
  // The rest of this tool argues about nanoseconds; "0 秒" for a 900 ms gap is
  // the one place it threw precision away.
  assert.deepEqual(elapsed(0, 900), [{ unit: 'millisecond', value: 900 }]);
  assert.deepEqual(elapsed(900, 0), [{ unit: 'millisecond', value: 900 }]);
  assert.deepEqual(elapsed(0, 1), [{ unit: 'millisecond', value: 1 }]);
  assert.deepEqual(elapsed(0, 1900), [
    { unit: 'second', value: 1 },
    { unit: 'millisecond', value: 900 },
  ]);
  // Sub-millisecond input is floored, not rounded up into a whole millisecond.
  assert.deepEqual(elapsed(0, 999.5), [{ unit: 'millisecond', value: 999 }]);
  // Two identical instants are zero seconds apart, which is worth saying plainly.
  assert.deepEqual(elapsed(0, 0), [{ unit: 'second', value: 0 }]);
  // Past a minute the millisecond tail is noise, so the old shape stands.
  assert.deepEqual(elapsed(0, 86_460_500), [
    { unit: 'day', value: 1 },
    { unit: 'minute', value: 1 },
  ]);
  assert.deepEqual(elapsed(0, 1000), [{ unit: 'second', value: 1 }]);
});

test('elapsed breaks a gap into whole units, largest first', () => {
  assert.deepEqual(elapsed(0, 1000), [{ unit: 'second', value: 1 }]);
  assert.deepEqual(elapsed(0, 0), [{ unit: 'second', value: 0 }]);
  assert.deepEqual(elapsed(0, 90_061_000), [
    { unit: 'day', value: 1 },
    { unit: 'hour', value: 1 },
    { unit: 'minute', value: 1 },
    { unit: 'second', value: 1 },
  ]);
  // Direction does not matter; the caller knows which way round it asked.
  assert.deepEqual(elapsed(1000, 0), [{ unit: 'second', value: 1 }]);
  // Zero components in the middle are dropped rather than printed as "0 hours".
  assert.deepEqual(elapsed(0, 86_460_000), [
    { unit: 'day', value: 1 },
    { unit: 'minute', value: 1 },
  ]);
});
