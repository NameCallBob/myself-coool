import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_ZONES,
  allZones,
  civilFromDayNumber,
  dayNumber,
  dayShift,
  formatCivil,
  formatIsoDate,
  formatOffset,
  isDaylight,
  isValidZone,
  nextTransition,
  parseLocalInput,
  readZones,
  resolveZoned,
  weekdayOf,
  zoneAbbrev,
  zoneOffset,
  zoneParts,
  zonedTimeToUtc,
} from './logic.ts';

const JAN = Date.UTC(2024, 0, 15, 12, 0, 0);
const JUL = Date.UTC(2024, 6, 15, 12, 0, 0);

test('day numbers match known anchors and invert', () => {
  assert.equal(dayNumber(1970, 1, 1), 0);
  assert.equal(dayNumber(2000, 3, 1), 11017);
  assert.equal(dayNumber(2024, 2, 29) + 1, dayNumber(2024, 3, 1));
  for (const days of [-100000, -1, 0, 1, 19000, 100000]) {
    const civil = civilFromDayNumber(days);
    assert.equal(dayNumber(civil.year, civil.month, civil.day), days);
  }
});

test('weekday matches the calendar', () => {
  assert.equal(weekdayOf(1970, 1, 1), 4); // Thursday
  assert.equal(weekdayOf(2000, 1, 1), 6); // Saturday
  assert.equal(weekdayOf(2026, 9, 26), 6); // Saturday
  assert.equal(weekdayOf(2024, 2, 29), 4); // Thursday
});

test('zone validity is decided by the engine, not a list', () => {
  assert.equal(isValidZone('Asia/Taipei'), true);
  assert.equal(isValidZone('UTC'), true);
  assert.equal(isValidZone('Mars/Olympus'), false);
  assert.equal(isValidZone(''), false);
  assert.equal(isValidZone('   '), false);
});

test('offsets match published zone rules', () => {
  assert.equal(zoneOffset(JAN, 'UTC'), 0);
  assert.equal(zoneOffset(JAN, 'Asia/Taipei'), 480);
  assert.equal(zoneOffset(JUL, 'Asia/Taipei'), 480);
  assert.equal(zoneOffset(JAN, 'Asia/Kolkata'), 330);
  assert.equal(zoneOffset(JAN, 'Asia/Kathmandu'), 345);
  assert.equal(zoneOffset(JAN, 'America/New_York'), -300);
  assert.equal(zoneOffset(JUL, 'America/New_York'), -240);
  assert.equal(zoneOffset(JAN, 'Europe/London'), 0);
  assert.equal(zoneOffset(JUL, 'Europe/London'), 60);
  assert.equal(zoneOffset(JAN, 'Australia/Sydney'), 660);
  assert.equal(zoneOffset(JUL, 'Australia/Sydney'), 600);
  assert.equal(zoneOffset(JAN, 'Pacific/Chatham'), 825);
});

test('offset formatting keeps the sign and the odd half hours', () => {
  assert.equal(formatOffset(0), '+00:00');
  assert.equal(formatOffset(480), '+08:00');
  assert.equal(formatOffset(-300), '-05:00');
  assert.equal(formatOffset(345), '+05:45');
  assert.equal(formatOffset(-210), '-03:30');
});

test('wall clock is read in the target zone', () => {
  const p = zoneParts(Date.UTC(2026, 8, 26, 16, 5, 9), 'Asia/Taipei');
  assert.deepEqual(p, { year: 2026, month: 9, day: 27, hour: 0, minute: 5, second: 9, weekday: 0 });
  // Midnight must read as hour 0, not 24 — some engines disagree under h23.
  assert.equal(zoneParts(Date.UTC(2026, 8, 26, 16, 0, 0), 'Asia/Taipei').hour, 0);
});

test('daylight saving is flagged in both hemispheres and nowhere else', () => {
  assert.equal(isDaylight(JUL, 'America/New_York'), true);
  assert.equal(isDaylight(JAN, 'America/New_York'), false);
  assert.equal(isDaylight(JAN, 'Australia/Sydney'), true);
  assert.equal(isDaylight(JUL, 'Australia/Sydney'), false);
  assert.equal(isDaylight(JAN, 'Asia/Taipei'), false);
  assert.equal(isDaylight(JUL, 'Asia/Taipei'), false);
  assert.equal(isDaylight(JUL, 'UTC'), false);
});

test('abbreviations come from the engine', () => {
  assert.match(zoneAbbrev(JAN, 'America/New_York'), /EST|GMT-5/);
  assert.notEqual(zoneAbbrev(JAN, 'Asia/Taipei'), '');
});

test('wall clock to instant round trips in every shortlisted zone', () => {
  const wall = { year: 2026, month: 6, day: 15, hour: 9, minute: 30, second: 0 };
  for (const { zone } of CITY_ZONES) {
    const instant = zonedTimeToUtc(wall, zone);
    const back = zoneParts(instant, zone);
    assert.equal(formatCivil(back, true), formatCivil(wall, true), zone);
  }
});

test('a skipped hour is reported as a gap, not silently moved', () => {
  // US clocks jump 02:00 -> 03:00 on 2024-03-10; 02:30 never happens.
  const gap = resolveZoned(
    { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 },
    'America/New_York'
  );
  assert.equal(gap.kind, 'gap');
  assert.equal(gap.instant, Date.UTC(2024, 2, 10, 7, 30));
  assert.deepEqual(zoneParts(gap.instant, 'America/New_York').hour, 3);
});

test('a repeated hour is reported as ambiguous and resolves to the first pass', () => {
  // Clocks go back 02:00 -> 01:00 on 2024-11-03; 01:30 happens twice.
  const twice = resolveZoned(
    { year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 },
    'America/New_York'
  );
  assert.equal(twice.kind, 'ambiguous');
  assert.equal(twice.offset, -240); // the EDT occurrence, the earlier instant
  assert.equal(twice.instant, Date.UTC(2024, 10, 3, 5, 30));
});

test('an ordinary hour is exact', () => {
  const exact = resolveZoned(
    { year: 2024, month: 5, day: 1, hour: 9, minute: 0, second: 0 },
    'Asia/Taipei'
  );
  assert.equal(exact.kind, 'exact');
  assert.equal(exact.offset, 480);
  assert.equal(exact.instant, Date.UTC(2024, 4, 1, 1, 0));
});

test('datetime-local input is parsed and impossible dates refused', () => {
  assert.deepEqual(parseLocalInput('2026-09-26T14:30'), {
    year: 2026,
    month: 9,
    day: 26,
    hour: 14,
    minute: 30,
    second: 0,
  });
  assert.equal(parseLocalInput('2026-09-26T14:30:45')?.second, 45);
  assert.equal(parseLocalInput('2024-02-29T00:00')?.day, 29);
  assert.equal(parseLocalInput('2023-02-29T00:00'), null);
  assert.equal(parseLocalInput('2026-13-01T00:00'), null);
  assert.equal(parseLocalInput('2026-09-26T24:00'), null);
  assert.equal(parseLocalInput('not a date'), null);
  assert.equal(parseLocalInput(''), null);
});

test('date rollover across zones is counted in days', () => {
  const instant = Date.UTC(2026, 8, 26, 16, 0, 0); // Taipei is already the 27th
  const taipei = zoneParts(instant, 'Asia/Taipei');
  const la = zoneParts(instant, 'America/Los_Angeles');
  assert.equal(dayShift(taipei, la), -1);
  assert.equal(dayShift(la, taipei), 1);
  assert.equal(dayShift(taipei, taipei), 0);
});

test('readZones sorts east to west and marks the rollover', () => {
  const instant = Date.UTC(2026, 8, 26, 16, 0, 0);
  const rows = readZones(instant, ['America/Los_Angeles', 'Asia/Taipei', 'UTC'], 'Asia/Taipei');
  assert.deepEqual(
    rows.map((row) => row.zone),
    ['Asia/Taipei', 'UTC', 'America/Los_Angeles']
  );
  assert.equal(rows[0].shift, 0);
  assert.equal(rows[2].shift, -1);
  // An unknown zone is dropped rather than throwing mid-render.
  assert.equal(readZones(instant, ['Nowhere/Nothing'], 'UTC').length, 0);
});

test('the next transition is found, and absent zones say so', () => {
  const before = Date.UTC(2024, 2, 1);
  const found = nextTransition(before, 'America/New_York');
  assert.equal(found, Date.UTC(2024, 2, 10, 7, 0, 0));
  assert.equal(nextTransition(before, 'Asia/Taipei'), null);
  assert.equal(nextTransition(before, 'UTC'), null);
  // Southern hemisphere, and a search that must step past one endpoint match.
  assert.equal(nextTransition(Date.UTC(2024, 0, 1), 'Australia/Sydney'), Date.UTC(2024, 3, 6, 16, 0, 0));
});

test('the transition found is the NEXT one, not a later one a year out', () => {
  // The regression this guards: "is the offset still the starting one" is not
  // a monotone predicate over a year. It goes false at the first transition and
  // true again at the second, so a bisection over the whole horizon can land in
  // the second true stretch and report next year's change. Every case below has
  // its two transitions less than 200 days apart, which is what triggers it.

  // Sydney leaves DST on 2026-04-05 at 03:00 local (+11 -> +10).
  assert.equal(
    nextTransition(Date.UTC(2026, 3, 1), 'Australia/Sydney'),
    Date.UTC(2026, 3, 4, 16, 0, 0)
  );
  // Auckland leaves DST on 2026-04-05 at 03:00 local (+13 -> +12).
  assert.equal(
    nextTransition(Date.UTC(2026, 3, 1), 'Pacific/Auckland'),
    Date.UTC(2026, 3, 4, 14, 0, 0)
  );
  // Northern hemisphere hits it too: Berlin leaves DST on 2026-10-25 at 01:00 UTC.
  assert.equal(
    nextTransition(Date.UTC(2026, 9, 20), 'Europe/Berlin'),
    Date.UTC(2026, 9, 25, 1, 0, 0)
  );
  // London, same weekend, and read from a week earlier still.
  assert.equal(
    nextTransition(Date.UTC(2026, 9, 12), 'Europe/London'),
    Date.UTC(2026, 9, 25, 1, 0, 0)
  );
  // Whatever comes back is a real boundary: the offset differs one second either side.
  for (const zone of ['Australia/Sydney', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland']) {
    for (const from of [Date.UTC(2026, 0, 20), Date.UTC(2026, 3, 1), Date.UTC(2026, 6, 15), Date.UTC(2026, 9, 20)]) {
      const at = nextTransition(from, zone);
      assert.ok(at !== null, `${zone} should shift within a year of ${new Date(from).toISOString()}`);
      assert.notEqual(zoneOffset(at as number, zone), zoneOffset((at as number) - 1000, zone));
      // And nothing between the start and that instant changed offset, which is
      // what "next" means.
      const start = zoneOffset(from, zone);
      for (let probe = from; probe < (at as number); probe += 6 * 3_600_000) {
        assert.equal(zoneOffset(probe, zone), start, `${zone} changed before the reported transition`);
      }
    }
  }
});

test('formatting helpers pad and stay ISO-shaped', () => {
  const p = { year: 2026, month: 1, day: 2, hour: 3, minute: 4, second: 5 };
  assert.equal(formatCivil(p), '2026-01-02 03:04');
  assert.equal(formatCivil(p, true), '2026-01-02 03:04:05');
  assert.equal(formatIsoDate(p), '2026-01-02');
});

test('the shortlist is valid and the full list contains it', () => {
  const all = new Set(allZones());
  assert.ok(all.size >= CITY_ZONES.length);
  for (const { zone } of CITY_ZONES) {
    assert.equal(isValidZone(zone), true, zone);
    assert.ok(all.has(zone), zone);
  }
});

test('a half-hour clock change and a skipped whole day are handled like any other', () => {
  // Lord Howe Island shifts by thirty minutes, not an hour. A resolver that
  // assumes a one-hour DST step gets both of these wrong by half an hour.
  const gap = resolveZoned(
    { year: 2026, month: 10, day: 4, hour: 2, minute: 15, second: 0 },
    'Australia/Lord_Howe'
  );
  assert.equal(gap.kind, 'gap');
  // 02:00 -> 02:30, so 02:15 is pushed forward by the thirty-minute gap.
  assert.equal(zoneParts(gap.instant, 'Australia/Lord_Howe').hour, 2);
  assert.equal(zoneParts(gap.instant, 'Australia/Lord_Howe').minute, 45);
  assert.equal(gap.offset, 660);

  const twice = resolveZoned(
    { year: 2026, month: 4, day: 5, hour: 1, minute: 45, second: 0 },
    'Australia/Lord_Howe'
  );
  assert.equal(twice.kind, 'ambiguous');
  assert.equal(twice.offset, 660); // the summer occurrence, which is earlier
  assert.deepEqual(
    [zoneParts(twice.instant, 'Australia/Lord_Howe').hour, zoneParts(twice.instant, 'Australia/Lord_Howe').minute],
    [1, 45]
  );

  // Samoa skipped 30 December 2011 entirely when it crossed the date line.
  // A whole missing day is the same kind of gap as a missing hour.
  const missing = resolveZoned(
    { year: 2011, month: 12, day: 30, hour: 12, minute: 0, second: 0 },
    'Pacific/Apia'
  );
  assert.equal(missing.kind, 'gap');
  assert.equal(zoneParts(missing.instant, 'Pacific/Apia').day, 31);
  // The day before it still exists and is exact.
  assert.equal(
    resolveZoned({ year: 2011, month: 12, day: 29, hour: 12, minute: 0, second: 0 }, 'Pacific/Apia').kind,
    'exact'
  );

  // India's half hour is not a transition at all: no zone change, ever.
  assert.equal(zoneOffset(JAN, 'Asia/Kolkata'), 330);
  assert.equal(zoneOffset(JUL, 'Asia/Kolkata'), 330);
  assert.equal(nextTransition(JAN, 'Asia/Kolkata'), null);
  // Nepal's quarter hour survives the round trip.
  const nepal = resolveZoned({ year: 2026, month: 6, day: 1, hour: 9, minute: 0, second: 0 }, 'Asia/Kathmandu');
  assert.equal(nepal.kind, 'exact');
  assert.equal(nepal.offset, 345);
});
