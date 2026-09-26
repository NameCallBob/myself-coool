import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  LIMITS,
  IDLE,
  clampConfig,
  elapsed,
  formatClock,
  isIsoDate,
  logToCsv,
  pause,
  phaseAt,
  planCycle,
  recentDays,
  recordWork,
  sanitiseLog,
  setLength,
  shiftIsoDate,
  start,
  streak,
  tallyFor,
  totals,
  trimLog,
  type Log,
} from './logic.ts';

test('the default cycle is work, break, work, break, long break every fourth', () => {
  const kinds = planCycle(DEFAULT_CONFIG, 16).map((phase) => phase.kind);
  assert.deepEqual(kinds, [
    'work', 'short', 'work', 'short', 'work', 'short', 'work', 'long',
    'work', 'short', 'work', 'short', 'work', 'short', 'work', 'long',
  ]);
  assert.deepEqual(
    planCycle(DEFAULT_CONFIG, 8).map((phase) => phase.minutes),
    [25, 5, 25, 5, 25, 5, 25, 15]
  );
});

test('rounds are numbered so a break knows which block it follows', () => {
  assert.deepEqual(phaseAt(0, DEFAULT_CONFIG), { index: 0, kind: 'work', minutes: 25, ms: 1_500_000, round: 1 });
  assert.equal(phaseAt(1, DEFAULT_CONFIG).round, 1);
  assert.equal(phaseAt(2, DEFAULT_CONFIG).round, 2);
  assert.equal(phaseAt(7, DEFAULT_CONFIG).round, 4);
  assert.equal(phaseAt(8, DEFAULT_CONFIG).round, 5);
  assert.throws(() => phaseAt(-1, DEFAULT_CONFIG), RangeError);
  assert.throws(() => phaseAt(1.5, DEFAULT_CONFIG), RangeError);
});

test('a different long-break interval moves the long break', () => {
  const config = { ...DEFAULT_CONFIG, longEvery: 2 };
  assert.deepEqual(
    planCycle(config, 8).map((phase) => phase.kind),
    ['work', 'short', 'work', 'long', 'work', 'short', 'work', 'long']
  );
  assert.equal(setLength(config), (25 + 5 + 25 + 15) * 60_000);
  assert.equal(setLength(DEFAULT_CONFIG), (25 * 4 + 5 * 3 + 15) * 60_000);
});

test('nonsense settings are clamped instead of trusted', () => {
  assert.deepEqual(clampConfig({ work: 0, short: -5, long: 900, longEvery: 1 }), {
    work: 1,
    short: 1,
    long: 180,
    longEvery: 2,
  });
  assert.deepEqual(clampConfig({ work: 25.4, short: 5.6, long: 15, longEvery: 4.2 }), {
    work: 25,
    short: 6,
    long: 15,
    longEvery: 4,
  });
  assert.deepEqual(clampConfig({ work: NaN, short: NaN, long: NaN, longEvery: NaN }), DEFAULT_CONFIG);
  assert.deepEqual(clampConfig({ work: 1e9, short: 1, long: 1, longEvery: 99 }), {
    work: LIMITS.maxMinutes,
    short: LIMITS.minMinutes,
    long: LIMITS.minMinutes,
    longEvery: LIMITS.maxEvery,
  });
  // Clamping is applied before the schedule is read, so a bad config cannot
  // produce a zero-length phase.
  assert.ok(phaseAt(0, { work: 0, short: 0, long: 0, longEvery: 0 }).ms > 0);
});

test('the timer measures by subtraction and survives a pause', () => {
  const running = start(IDLE, 10_000);
  assert.equal(elapsed(running, 10_000), 0);
  assert.equal(elapsed(running, 70_000), 60_000);
  const paused = pause(running, 70_000);
  assert.equal(elapsed(paused, 999_999), 60_000);
  assert.equal(elapsed(start(paused, 100_000), 130_000), 90_000);
  assert.equal(start(running, 50_000), running);
  assert.equal(pause(paused, 50_000), paused);
  assert.equal(elapsed(running, 0), 0);
});

test('the clock is padded and signs overtime', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(1_500_000), '25:00');
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(-5000), '-00:05');
  assert.equal(formatClock(3_600_000), '60:00');
});

test('ISO date arithmetic does not go near a timezone', () => {
  assert.equal(isIsoDate('2026-09-26'), true);
  assert.equal(isIsoDate('2026-9-26'), false);
  assert.equal(shiftIsoDate('2026-09-26', 1), '2026-09-27');
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftIsoDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftIsoDate('2026-01-01', -1), '2025-12-31');
  assert.throws(() => shiftIsoDate('nope', 1), RangeError);
});

test('finished blocks accumulate per day and stay sorted', () => {
  let log: Log = [];
  log = recordWork(log, '2026-09-26', 25);
  log = recordWork(log, '2026-09-26', 25);
  log = recordWork(log, '2026-09-24', 50);
  assert.deepEqual(log, [
    { date: '2026-09-24', completed: 1, minutes: 50 },
    { date: '2026-09-26', completed: 2, minutes: 50 },
  ]);
  assert.deepEqual(totals(log), { completed: 3, minutes: 100, days: 2 });
  assert.deepEqual(tallyFor(log, '2026-09-25'), { date: '2026-09-25', completed: 0, minutes: 0 });
  assert.throws(() => recordWork(log, '26/09/2026', 25), RangeError);
});

test('a streak counts back from today, and an empty today does not break it', () => {
  const log: Log = [
    { date: '2026-09-22', completed: 1, minutes: 25 },
    { date: '2026-09-24', completed: 2, minutes: 50 },
    { date: '2026-09-25', completed: 1, minutes: 25 },
    { date: '2026-09-26', completed: 3, minutes: 75 },
  ];
  assert.equal(streak(log, '2026-09-26'), 3);
  // Nothing done yet today: the run up to yesterday still stands.
  assert.equal(streak(log, '2026-09-27'), 3);
  // Two blank days and the streak is gone.
  assert.equal(streak(log, '2026-09-28'), 0);
  assert.equal(streak([], '2026-09-26'), 0);
  assert.equal(streak([{ date: '2026-09-26', completed: 0, minutes: 0 }], '2026-09-26'), 0);
});

test('the recent strip is zero-filled and ends today', () => {
  const log: Log = [{ date: '2026-09-26', completed: 2, minutes: 50 }];
  const strip = recentDays(log, '2026-09-26', 7);
  assert.equal(strip.length, 7);
  assert.equal(strip[0].date, '2026-09-20');
  assert.equal(strip[6].date, '2026-09-26');
  assert.equal(strip[6].completed, 2);
  assert.equal(strip[0].completed, 0);
});

test('a stored log is sanitised rather than trusted', () => {
  assert.deepEqual(sanitiseLog(null), []);
  assert.deepEqual(sanitiseLog('nope'), []);
  assert.deepEqual(
    sanitiseLog([
      { date: '2026-09-26', completed: 2, minutes: 50 },
      { date: 'garbage', completed: 9, minutes: 9 },
      { date: '2026-09-25', completed: '3', minutes: null },
      42,
      null,
    ]),
    [
      { date: '2026-09-25', completed: 0, minutes: 0 },
      { date: '2026-09-26', completed: 2, minutes: 50 },
    ]
  );
  const long = Array.from({ length: 200 }, (_, i) => ({
    date: shiftIsoDate('2026-01-01', i),
    completed: 1,
    minutes: 25,
  }));
  assert.equal(trimLog(long).length, 120);
  assert.equal(trimLog(long)[0].date, shiftIsoDate('2026-01-01', 80));
  assert.equal(trimLog(long, 5).length, 5);
});

test('the log exports as CSV with a header', () => {
  assert.equal(
    logToCsv([{ date: '2026-09-26', completed: 2, minutes: 50 }]),
    'date,completed,minutes\n2026-09-26,2,50'
  );
  assert.equal(logToCsv([]), 'date,completed,minutes');
});

test('ISO day arithmetic does not fall into the two-digit-year trap', () => {
  // Date.UTC maps years 0-99 onto 1900-1999, which silently teleported any
  // early-year log entry by nineteen centuries.
  assert.equal(shiftIsoDate('0099-12-31', 1), '0100-01-01');
  assert.equal(shiftIsoDate('0050-01-01', -1), '0049-12-31');
  assert.equal(shiftIsoDate('0001-01-01', 0), '0001-01-01');
  // And the ordinary cases still hold, including leap days and month ends.
  assert.equal(shiftIsoDate('2026-09-26', 1), '2026-09-27');
  assert.equal(shiftIsoDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftIsoDate('2025-02-28', 1), '2025-03-01');
  assert.equal(shiftIsoDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftIsoDate('2026-03-01', -366), '2025-02-28');
  // Round trip over a year of offsets.
  for (let offset = -400; offset <= 400; offset += 37) {
    assert.equal(shiftIsoDate(shiftIsoDate('2026-06-15', offset), -offset), '2026-06-15');
  }
  assert.throws(() => shiftIsoDate('2026-13-01', 1), RangeError);
  assert.throws(() => shiftIsoDate('26-01-01', 1), RangeError);
});

test('duplicate dates in a stored log are merged, not kept side by side', () => {
  // Two rows for one day made totals() report two days while tallyFor() showed
  // only the first row — the same day with two different numbers on screen.
  const log = sanitiseLog([
    { date: '2026-09-26', completed: 2, minutes: 50 },
    { date: '2026-09-26', completed: 3, minutes: 75 },
    { date: '2026-09-25', completed: 1, minutes: 25 },
  ]);
  assert.equal(log.length, 2);
  assert.deepEqual(tallyFor(log, '2026-09-26'), { date: '2026-09-26', completed: 5, minutes: 125 });
  assert.deepEqual(totals(log), { completed: 6, minutes: 150, days: 2 });
  // Sum of the rows equals the grand total, which is the invariant that broke.
  assert.equal(
    log.reduce((sum, entry) => sum + entry.completed, 0),
    totals(log).completed
  );
  assert.equal(streak(log, '2026-09-26'), 2);
});
