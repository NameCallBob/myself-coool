import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AWAKE_FROM,
  AWAKE_UNTIL,
  DEFAULT_PEOPLE,
  bestSlots,
  buildGrid,
  dayNumber,
  formatMinutes,
  gridToCsv,
  isValidZone,
  parseHour,
  parseIsoDate,
  parsePeople,
  runsOf,
  serializePeople,
  statusOf,
  zoneOffset,
  zoneParts,
  zonedTimeToUtc,
  type Person,
} from './logic.ts';

const person = (name: string, zone: string, start = 9, end = 18): Person => ({
  name,
  zone,
  start: start * 60,
  end: end * 60,
});

test('zone plumbing agrees with published offsets', () => {
  assert.equal(isValidZone('Asia/Taipei'), true);
  assert.equal(isValidZone('Nowhere/Nothing'), false);
  assert.equal(zoneOffset(Date.UTC(2026, 8, 28, 12), 'Asia/Taipei'), 480);
  assert.equal(zoneOffset(Date.UTC(2026, 8, 28, 12), 'Europe/Berlin'), 120); // CEST
  assert.equal(zoneOffset(Date.UTC(2026, 11, 28, 12), 'Europe/Berlin'), 60); // CET
  assert.equal(zoneParts(Date.UTC(2026, 8, 28, 1), 'Asia/Taipei').hour, 9);
  assert.equal(zoneParts(Date.UTC(2026, 8, 27, 16), 'Asia/Taipei').day, 28);
});

test('local midnight resolves to a real instant, clock changes included', () => {
  assert.equal(
    zonedTimeToUtc({ year: 2026, month: 9, day: 28, hour: 0, minute: 0, second: 0 }, 'Asia/Taipei'),
    Date.UTC(2026, 8, 27, 16)
  );
  // Sao Paulo has no DST any more, but Berlin's autumn change is a real case:
  // 2026-10-25 02:00 CEST becomes 02:00 CET one hour later.
  const beforeChange = zonedTimeToUtc(
    { year: 2026, month: 10, day: 25, hour: 0, minute: 0, second: 0 },
    'Europe/Berlin'
  );
  assert.equal(zoneParts(beforeChange, 'Europe/Berlin').hour, 0);
  // A skipped hour still produces a usable moment rather than NaN.
  const skipped = zonedTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
    'America/New_York'
  );
  assert.ok(Number.isFinite(skipped));
  assert.equal(zoneParts(skipped, 'America/New_York').hour, 3);
});

test('dates and hours are read strictly', () => {
  assert.deepEqual(parseIsoDate('2026-09-28'), { year: 2026, month: 9, day: 28 });
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('2026-9-8'), null);
  assert.equal(parseHour('9'), 540);
  assert.equal(parseHour('09:30'), 570);
  assert.equal(parseHour('9.5'), 570);
  assert.equal(parseHour('24'), 1440);
  assert.equal(parseHour('25'), null);
  assert.equal(parseHour('9:75'), null);
  assert.equal(parseHour('nine'), null);
  assert.equal(formatMinutes(570), '09:30');
  assert.equal(formatMinutes(0), '00:00');
  assert.equal(formatMinutes(1425), '23:45');
  assert.equal(dayNumber(1970, 1, 1), 0);
});

test('the people list parses, defaults and reports its bad lines', () => {
  const parsed = parsePeople(
    ['# comment', '', 'Me, Asia/Taipei, 9-18', 'Nepal, Asia/Kathmandu', 'Bad, Nowhere/Nothing, 9-18', 'Broken, Asia/Tokyo, 18-9', 'Half, Asia/Kolkata, 09:30-17:30'].join('\n')
  );
  assert.deepEqual(
    parsed.people.map((p) => [p.name, p.zone, p.start, p.end]),
    [
      ['Me', 'Asia/Taipei', 540, 1080],
      ['Nepal', 'Asia/Kathmandu', 540, 1080],
      ['Half', 'Asia/Kolkata', 570, 1050],
    ]
  );
  assert.deepEqual(
    parsed.problems.map((problem) => [problem.line, problem.reason]),
    [
      [5, 'zone'],
      [6, 'hours'],
    ]
  );
  assert.equal(parsePeople('Only one field').problems[0].reason, 'shape');
  assert.equal(parsePeople(DEFAULT_PEOPLE).problems.length, 0);
  assert.equal(parsePeople(DEFAULT_PEOPLE).people.length, 4);
  assert.equal(
    serializePeople(parsePeople('Me, Asia/Taipei, 9-18').people),
    'Me, Asia/Taipei, 09:00-18:00'
  );
});

test('status bands are working hours, awake, asleep', () => {
  const me = person('me', 'Asia/Taipei', 9, 18);
  assert.equal(statusOf(9 * 60, me), 'work');
  assert.equal(statusOf(17 * 60 + 59, me), 'work');
  assert.equal(statusOf(18 * 60, me), 'awake');
  assert.equal(statusOf(22 * 60, me), 'awake');
  assert.equal(statusOf(23 * 60, me), 'asleep');
  assert.equal(statusOf(3 * 60, me), 'asleep');
  assert.equal(statusOf(AWAKE_FROM, me), 'awake');
  assert.equal(statusOf(AWAKE_FROM - 1, me), 'asleep');
  assert.equal(statusOf(AWAKE_UNTIL - 1, me), 'awake');
  assert.equal(statusOf(AWAKE_UNTIL, me), 'asleep');
});

test('Taipei and Berlin overlap exactly three hours in September', () => {
  const date = { year: 2026, month: 9, day: 28 };
  const people = [person('me', 'Asia/Taipei', 9, 18), person('de', 'Europe/Berlin', 9, 18)];
  const grid = buildGrid(date, 'Asia/Taipei', people);
  assert.equal(grid.length, 24);
  const shared = grid.filter((slot) => slot.everyone).map((slot) => slot.label);
  // Berlin is six hours behind Taipei in CEST, so 15:00–18:00 Taipei is
  // 09:00–12:00 Berlin.
  assert.deepEqual(shared, ['15:00', '16:00', '17:00']);
  const run = runsOf(grid, (slot) => slot.everyone)[0];
  assert.equal(run.length, 3);
  assert.equal(run.label, '15:00–18:00');
});

test('the same pair gains an hour once Berlin leaves summer time', () => {
  const people = [person('me', 'Asia/Taipei', 9, 18), person('de', 'Europe/Berlin', 9, 18)];
  const winter = buildGrid({ year: 2026, month: 11, day: 30 }, 'Asia/Taipei', people);
  const shared = winter.filter((slot) => slot.everyone).map((slot) => slot.label);
  // Seven hours apart in CET: 16:00–18:00 Taipei is 09:00–11:00 Berlin.
  assert.deepEqual(shared, ['16:00', '17:00']);
});

test('Taipei and Los Angeles have no shared working hour at all', () => {
  const people = [person('me', 'Asia/Taipei', 9, 18), person('la', 'America/Los_Angeles', 9, 18)];
  const grid = buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', people);
  assert.equal(grid.filter((slot) => slot.everyone).length, 0);
  assert.deepEqual(runsOf(grid, (slot) => slot.everyone), []);
  // The best available row still has one person working, and the ranking says so.
  assert.equal(bestSlots(grid, 1)[0].workCount, 1);
  // Someone is awake for a good stretch even so.
  assert.ok(runsOf(grid, (slot) => slot.awakeCount === 2).length > 0);
});

test('date rollover is reported per person', () => {
  const people = [person('me', 'Asia/Taipei'), person('la', 'America/Los_Angeles')];
  const grid = buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', people);
  const nine = grid.find((slot) => slot.label === '09:00');
  assert.equal(nine?.cells[0].dayShift, 0);
  assert.equal(nine?.cells[1].dayShift, -1); // still the 27th in California
  assert.equal(nine?.cells[1].label, '18:00');
});

test('half-hour zones land on the half hour', () => {
  const people = [person('in', 'Asia/Kolkata', 9, 18), person('np', 'Asia/Kathmandu', 9, 18)];
  const grid = buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', people);
  const noon = grid.find((slot) => slot.label === '12:00');
  assert.equal(noon?.cells[0].label, '09:30');
  assert.equal(noon?.cells[1].label, '09:45');
  assert.equal(noon?.everyone, true);
});

test('runs are maximal, sorted longest first, and wrap nothing', () => {
  const people = [person('me', 'Asia/Taipei', 9, 12), person('you', 'Asia/Taipei', 14, 18)];
  const grid = buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', people);
  assert.deepEqual(runsOf(grid, (slot) => slot.everyone), []);
  const anyone = runsOf(grid, (slot) => slot.workCount > 0);
  assert.deepEqual(anyone.map((run) => run.label), ['14:00–18:00', '09:00–12:00']);
  // A run that touches the end of the day is still closed properly.
  const late = runsOf(grid, (slot) => slot.hour >= 22);
  assert.deepEqual(late, [{ from: 22, to: 23, length: 2, label: '22:00–00:00' }]);
});

test('the CSV carries the zone names and every cell', () => {
  const people = [person('me', 'Asia/Taipei'), person('jp', 'Asia/Tokyo', 10, 19)];
  const grid = buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', people);
  const csv = gridToCsv(grid, 'Asia/Taipei');
  const lines = csv.split('\n');
  assert.equal(lines.length, 25);
  assert.equal(lines[0], 'Asia/Taipei,me (Asia/Taipei),jp (Asia/Tokyo)');
  assert.equal(lines[1], '00:00,00:00 asleep,01:00 asleep');
  // A cell on the previous day carries the shift marker.
  assert.ok(gridToCsv(buildGrid({ year: 2026, month: 9, day: 28 }, 'Asia/Taipei', [person('la', 'America/Los_Angeles')]), 'Asia/Taipei').includes('-1d'));
  assert.equal(gridToCsv([], 'UTC'), '');
});

test('an hour past midnight is refused rather than stored as minute 1470', () => {
  assert.equal(parseHour('24:00'), 1440);
  assert.equal(parseHour('24:30'), null);
  assert.equal(parseHour('24:01'), null);
  assert.equal(parseHour('23:59'), 1439);
  assert.equal(parseHour('25:00'), null);
  assert.equal(parseHour('9.5'), 570);
  assert.equal(parseHour('24'), 1440);
  // A working day that ended at 24:30 counted every local minute as "before
  // the end", so every hour of the day read as working.
  const bad = parsePeople('X, Asia/Taipei, 9-24:30');
  assert.equal(bad.people.length, 0);
  assert.equal(bad.problems[0].reason, 'hours');
  const good = parsePeople('X, Asia/Taipei, 9-24:00');
  assert.equal(good.people.length, 1);
  assert.equal(good.people[0].end, 1440);
  assert.equal(statusOf(1439, good.people[0]), 'work');
});

test('the grid CSV quotes what a user-supplied name can contain', () => {
  const people = parsePeople('A"x, Asia/Taipei, 9-18').people;
  const csv = gridToCsv(buildGrid({ year: 2026, month: 9, day: 26 }, 'Asia/Taipei', people, 2), 'Asia/Taipei');
  const header = csv.split('\n')[0];
  assert.ok(header.includes('"A""x (Asia/Taipei)"'), header);
  // Ordinary cells stay unquoted so the file remains readable.
  assert.ok(csv.split('\n')[1].startsWith('00:00,'), csv);
  assert.equal(gridToCsv([], 'UTC'), '');
});
