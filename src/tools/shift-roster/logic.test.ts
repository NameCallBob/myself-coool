import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PATTERN,
  DEFAULT_SHIFTS,
  LIMITS,
  OFF_CODE,
  RosterTooBig,
  civilFromDayNumber,
  dayNumber,
  escapeIcsText,
  foldIcsLine,
  formatIso,
  generate,
  isValidZone,
  parseIso,
  parsePattern,
  parsePeople,
  parseShiftTable,
  restGaps,
  serializeShiftTable,
  shiftOf,
  statsFor,
  toCsv,
  toIcs,
  weekdayOf,
  zonedTimeToUtc,
} from './logic.ts';

const START = dayNumber(2026, 9, 28); // a Monday
const STAMP = Date.UTC(2026, 8, 26, 0, 0, 0);

const base = {
  people: ['甲', '乙', '丙', '丁'],
  shifts: DEFAULT_SHIFTS,
  pattern: DEFAULT_PATTERN,
  startDay: START,
  days: 8,
};

test('dates round trip and the start day really is a Monday', () => {
  assert.equal(weekdayOf(START), 1);
  assert.equal(formatIso(START), '2026-09-28');
  assert.equal(parseIso('2026-09-28'), START);
  assert.equal(parseIso('2026-02-30'), null);
  assert.deepEqual(civilFromDayNumber(START), { year: 2026, month: 9, day: 28 });
});

test('the pattern rotates by person and repeats by cycle length', () => {
  const roster = generate(base);
  assert.equal(roster.stagger, 2); // 8 slots / 4 people
  assert.deepEqual(roster.cells[0], ['D', 'E', 'N', 'X']);
  assert.deepEqual(roster.cells[1], ['D', 'E', 'N', 'X']);
  assert.deepEqual(roster.cells[2], ['E', 'N', 'X', 'D']);
  // Day 8 is the start of the next cycle, identical to day 0.
  const long = generate({ ...base, days: 9 });
  assert.deepEqual(long.cells[8], long.cells[0]);
  // Every shift is covered on every day, which is the point of the stagger.
  for (const row of long.cells) assert.equal(new Set(row).size, 4);
});

test('an explicit stagger overrides the default', () => {
  const roster = generate({ ...base, stagger: 1 });
  assert.deepEqual(roster.cells[0], ['D', 'D', 'E', 'E']);
  assert.equal(roster.stagger, 1);
  // A stagger of zero or a fraction falls back to the computed one.
  assert.equal(generate({ ...base, stagger: 0 }).stagger, 2);
  assert.equal(generate({ ...base, stagger: 1.5 }).stagger, 2);
});

test('impossible rosters are refused with a reason', () => {
  assert.throws(() => generate({ ...base, people: [] }), RangeError);
  assert.throws(() => generate({ ...base, pattern: [] }), RangeError);
  assert.throws(() => generate({ ...base, pattern: ['D', 'Z'] }), /undefined shift: Z/);
  assert.throws(() => generate({ ...base, days: 0 }), RosterTooBig);
  assert.throws(() => generate({ ...base, days: LIMITS.maxDays + 1 }), RosterTooBig);
  assert.throws(
    () => generate({ ...base, people: Array.from({ length: LIMITS.maxPeople + 1 }, (_, i) => `p${i}`) }),
    RosterTooBig
  );
  assert.throws(
    () => generate({ ...base, pattern: Array.from({ length: LIMITS.maxPattern + 1 }, () => 'D') }),
    RosterTooBig
  );
});

test('per-person totals add up to the whole roster', () => {
  const roster = generate({ ...base, days: 8 });
  const stats = statsFor(roster);
  assert.equal(stats.length, 4);
  for (const person of stats) {
    // Eight days of the eight-slot pattern: six worked, two off, 48 hours.
    assert.equal(person.workDays, 6);
    assert.equal(person.offDays, 2);
    assert.equal(person.hours, 48);
    assert.equal(person.byCode[OFF_CODE], 2);
  }
  assert.equal(
    stats.reduce((sum, person) => sum + person.workDays, 0),
    roster.cells.flat().filter((code) => shiftOf(roster, code).hours > 0).length
  );
  // Six consecutive working days is the pattern's worst case, but an
  // eight-day window starting mid-cycle splits it for the middle two people.
  assert.deepEqual(stats.map((person) => person.longestStretch), [6, 4, 4, 6]);
  const twoCycles = statsFor(generate({ ...base, days: 16 }));
  assert.deepEqual(twoCycles.map((person) => person.longestStretch), [6, 6, 6, 6]);
});

test('a night shift followed by a day shift is reported as too little rest', () => {
  const shifts = [
    { code: 'N', label: 'night', start: 0, hours: 8 },
    { code: 'D', label: 'day', start: 8 * 60, hours: 8 },
    { code: 'X', label: 'off', start: 0, hours: 0 },
  ];
  // N ends 08:00 on day 0, D starts 08:00 on day 1 — a 24 hour gap, fine.
  const fine = generate({ people: ['a'], shifts, pattern: ['N', 'D'], startDay: START, days: 2, stagger: 1 });
  assert.deepEqual(restGaps(fine, 11), []);
  // D ends 16:00 on day 0, N starts 00:00 on day 1 — eight hours, not enough.
  const tight = generate({ people: ['a'], shifts, pattern: ['D', 'N'], startDay: START, days: 2, stagger: 1 });
  const gaps = restGaps(tight, 11);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], {
    person: 'a',
    personIndex: 0,
    dayIndex: 0,
    iso: '2026-09-28',
    from: 'D',
    to: 'N',
    hours: 8,
  });
  // A day off between them resets the comparison.
  const spaced = generate({ people: ['a'], shifts, pattern: ['D', 'X', 'N'], startDay: START, days: 3, stagger: 1 });
  assert.deepEqual(restGaps(spaced, 11), []);
  // The threshold is a parameter, not a constant.
  assert.equal(restGaps(tight, 8).length, 0);
  assert.equal(restGaps(tight, 24).length, 1);
});

test('the default eight-day rotation has one tight changeover per cycle', () => {
  const roster = generate({ ...base, days: 8 });
  const gaps = restGaps(roster, 11);
  // E ends at 24:00 and N starts at 00:00 — zero rest, and it is real.
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every((gap) => gap.from === 'E' && gap.to === 'N'));
  assert.equal(gaps[0].hours, 0);
});

test('the shift table parses, defaults and rejects duplicates', () => {
  const parsed = parseShiftTable(
    ['# code, name, start, hours', 'D, 白班, 08:00, 8', 'N, 大夜, 0, 8', 'X, 休, , 0', 'D, 重複, 8, 8', 'nope'].join('\n')
  );
  assert.deepEqual(
    parsed.shifts.map((shift) => [shift.code, shift.label, shift.start, shift.hours]),
    [
      ['D', '白班', 480, 8],
      ['N', '大夜', 0, 8],
      ['X', '休', 0, 0],
    ]
  );
  assert.deepEqual(parsed.problems, [5, 6]);
  assert.equal(parseShiftTable('D, x, 25:00, 8').problems.length, 1);
  assert.equal(parseShiftTable('D, x, 8, 30').problems.length, 1);
  assert.equal(parseShiftTable(serializeShiftTable(DEFAULT_SHIFTS)).shifts.length, 4);
  assert.deepEqual(parseShiftTable(serializeShiftTable(DEFAULT_SHIFTS)).shifts, DEFAULT_SHIFTS);
});

test('patterns and people lists are read loosely, as typed', () => {
  assert.deepEqual(parsePattern('D D E E N N X X'), ['D', 'D', 'E', 'E', 'N', 'N', 'X', 'X']);
  assert.deepEqual(parsePattern('D,D , E'), ['D', 'D', 'E']);
  assert.deepEqual(parsePattern('D>E>N'), ['D', 'E', 'N']);
  assert.deepEqual(parsePattern('   '), []);
  assert.deepEqual(parsePeople('甲\n乙\n\n丙 # 註解'), ['甲', '乙', '丙']);
  assert.deepEqual(parsePeople('a, b, c'), ['a', 'b', 'c']);
});

test('CSV has a header, a weekday column and quotes what needs it', () => {
  const roster = generate({ ...base, people: ['甲', 'Smith, John'], days: 2 });
  const lines = toCsv(roster).split('\n');
  assert.equal(lines[0], 'date,weekday,甲,"Smith, John"');
  assert.equal(lines[1], `2026-09-28,Mon,${roster.cells[0][0]},${roster.cells[0][1]}`);
  assert.equal(lines.length, 3);
});

test('ICS text escaping follows RFC 5545', () => {
  assert.equal(escapeIcsText('a,b'), 'a\\,b');
  assert.equal(escapeIcsText('a;b'), 'a\\;b');
  assert.equal(escapeIcsText('a\\b'), 'a\\\\b');
  assert.equal(escapeIcsText('a\nb'), 'a\\nb');
  assert.equal(escapeIcsText('a\r\nb'), 'a\\nb');
  assert.equal(escapeIcsText('白班'), '白班');
});

test('long lines fold at 75 octets and never split a character', () => {
  assert.equal(foldIcsLine('short'), 'short');
  const ascii = `SUMMARY:${'a'.repeat(100)}`;
  const folded = ascii.split('\r\n');
  assert.equal(foldIcsLine(ascii).split('\r\n')[0].length, 75);
  assert.ok(foldIcsLine(ascii).split('\r\n')[1].startsWith(' '));
  assert.equal(
    foldIcsLine(ascii)
      .split('\r\n')
      .map((line, index) => (index === 0 ? line : line.slice(1)))
      .join(''),
    ascii
  );
  assert.equal(folded.length, 1);
  // Chinese: each character is three octets, so the fold must land between them.
  const chinese = `SUMMARY:${'白'.repeat(40)}`;
  const parts = foldIcsLine(chinese).split('\r\n');
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(!part.includes('�'));
    let octets = 0;
    for (const ch of part) octets += (ch.codePointAt(0) ?? 0) < 0x80 ? 1 : 3;
    assert.ok(octets <= 75, `${octets} octets`);
  }
  assert.equal(
    parts.map((part, index) => (index === 0 ? part : part.slice(1))).join(''),
    chinese
  );
});

test('a shift at a known local time converts to the right UTC instant', () => {
  assert.equal(isValidZone('Asia/Taipei'), true);
  // 08:00 Taipei on 2026-09-28 is 00:00 UTC the same day.
  assert.equal(zonedTimeToUtc(START, 8 * 60, 'Asia/Taipei'), Date.UTC(2026, 8, 28, 0, 0, 0));
  assert.equal(zonedTimeToUtc(START, 0, 'Asia/Taipei'), Date.UTC(2026, 8, 27, 16, 0, 0));
  // New York in October is on EDT (−04:00).
  assert.equal(zonedTimeToUtc(dayNumber(2026, 10, 1), 8 * 60, 'America/New_York'), Date.UTC(2026, 9, 1, 12, 0, 0));
  // And on EST (−05:00) after the change.
  assert.equal(zonedTimeToUtc(dayNumber(2026, 11, 10), 8 * 60, 'America/New_York'), Date.UTC(2026, 10, 10, 13, 0, 0));
});

test('the calendar file is well formed and carries every worked shift', () => {
  const roster = generate({ ...base, days: 8 });
  const ics = toIcs(roster, { timeZone: 'Asia/Taipei', name: '輪班表', stamp: STAMP });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  // RFC 5545 wants a CRLF after the last content line too.
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('\r\n'));
  assert.ok(!ics.includes('\n\n'));
  const events = ics.split('BEGIN:VEVENT').length - 1;
  const worked = roster.cells.flat().filter((code) => shiftOf(roster, code).hours > 0).length;
  assert.equal(events, worked);
  assert.equal(ics.split('END:VEVENT').length - 1, worked);
  assert.ok(ics.includes(`DTSTAMP:${'20260926T000000Z'}`));
  // Day 0, person 0 is the 08:00 day shift in Taipei.
  assert.ok(ics.includes('DTSTART:20260928T000000Z'));
  assert.ok(ics.includes('DTEND:20260928T080000Z'));
  assert.ok(ics.includes('UID:2026-09-28-0-D@shift-roster.tools'));
  // Every UID is unique, which is what stops a re-import duplicating events.
  const uids = ics.split('\r\n').filter((line) => line.startsWith('UID:'));
  assert.equal(new Set(uids).size, uids.length);
  // Days off produce no events at all.
  assert.ok(!ics.includes('休 ·'));
});

test('the calendar can be filtered to one person, and an unknown zone falls back', () => {
  const roster = generate({ ...base, days: 8 });
  const mine = toIcs(roster, { timeZone: 'Asia/Taipei', name: 'x', stamp: STAMP, onlyPerson: 0 });
  const events = mine.split('BEGIN:VEVENT').length - 1;
  assert.equal(events, statsFor(roster)[0].workDays);
  assert.ok(mine.includes('甲'));
  assert.ok(!mine.includes('· 乙'));
  const fallback = toIcs(roster, { timeZone: 'Nowhere/Nothing', name: 'x', stamp: STAMP, onlyPerson: 0 });
  assert.ok(fallback.includes('X-WR-TIMEZONE:UTC'));
  assert.ok(fallback.includes('DTSTART:20260928T080000Z'));
});

test('roster CSV quotes a lone carriage return in a name', () => {
  const roster = generate({
    people: ['a,b', 'c"d', 'e\rf', 'plain'],
    shifts: [{ code: 'D', label: 'd', start: 0, hours: 8 }],
    pattern: ['D'],
    startDay: 0,
    days: 1,
  });
  const header = toCsv(roster).split('\n')[0];
  assert.ok(header.includes('"a,b"'), header);
  assert.ok(header.includes('"c""d"'), header);
  assert.ok(header.includes('"e\rf"'), header);
  assert.ok(header.endsWith(',plain'), header);
});

test('a shift starting in a skipped or repeated hour still lands on a real instant', () => {
  // Berlin clocks jump 02:00 -> 03:00 on 2026-03-29, so a shift nominally
  // starting at 02:00 has no such local time. The result has to be a real
  // instant rather than NaN or an hour in the wrong direction.
  const gapDay = dayNumber(2026, 3, 29);
  const started = zonedTimeToUtc(gapDay, 2 * 60, 'Europe/Berlin');
  assert.ok(Number.isFinite(started));
  // 01:00 UTC is the instant the clocks moved, which reads as 03:00 local.
  assert.equal(started, Date.UTC(2026, 2, 29, 1, 0, 0));

  // And on the way back, 02:30 local happens twice on 2026-10-25. The earlier
  // (summer) occurrence is taken, so the shift is not silently an hour late.
  const twiceDay = dayNumber(2026, 10, 25);
  const back = zonedTimeToUtc(twiceDay, 2 * 60 + 30, 'Europe/Berlin');
  assert.equal(back, Date.UTC(2026, 9, 25, 0, 30, 0));

  // Eight real hours later is still eight real hours, which is what the ICS
  // writes as DTEND — the reason absolute UTC instants are used at all.
  const ics = toIcs(
    generate({
      people: ['a'],
      shifts: [{ code: 'D', label: 'day', start: 2 * 60, hours: 8 }],
      pattern: ['D'],
      startDay: gapDay,
      days: 1,
    }),
    { timeZone: 'Europe/Berlin', name: 'x', stamp: 0 }
  );
  const stamps = ics.split('\r\n').filter((line) => /^DT(START|END):/.test(line));
  assert.deepEqual(stamps, ['DTSTART:20260329T010000Z', 'DTEND:20260329T090000Z']);

  // A shift that is a full day wide is a full day of real time.
  const full = toIcs(
    generate({
      people: ['a'],
      shifts: [{ code: 'L', label: 'long', start: 0, hours: 24 }],
      pattern: ['L'],
      startDay: dayNumber(2026, 9, 26),
      days: 1,
    }),
    { timeZone: 'Asia/Taipei', name: 'x', stamp: 0 }
  );
  assert.deepEqual(
    full.split('\r\n').filter((line) => /^DT(START|END):/.test(line)),
    ['DTSTART:20260925T160000Z', 'DTEND:20260926T160000Z']
  );
});

test('a shift longer than the gap to the next one reports negative rest', () => {
  // Twenty hours on, four hours off, on again: the gap is real and negative
  // rest is reported as such rather than clamped to zero, because a roster that
  // overlaps itself is a roster somebody has to fix.
  const roster = generate({
    people: ['a'],
    shifts: [{ code: 'L', label: 'long', start: 6 * 60, hours: 20 }],
    pattern: ['L'],
    startDay: dayNumber(2026, 9, 26),
    days: 3,
  });
  const gaps = restGaps(roster, 11);
  assert.equal(gaps.length, 2);
  // Ends 02:00 the next day, next one starts 06:00 that day: four hours.
  assert.equal(gaps[0].hours, 4);
  const overlapping = generate({
    people: ['a'],
    shifts: [{ code: 'X', label: 'over', start: 6 * 60, hours: 24 }],
    pattern: ['X'],
    startDay: dayNumber(2026, 9, 26),
    days: 3,
  });
  assert.equal(restGaps(overlapping, 11)[0].hours, 0);
  const tooLong = generate({
    people: ['a'],
    shifts: [{ code: 'Y', label: 'over', start: 6 * 60, hours: 23 }],
    pattern: ['Y'],
    startDay: dayNumber(2026, 9, 26),
    days: 2,
  });
  assert.equal(restGaps(tooLong, 11)[0].hours, 1);
});
