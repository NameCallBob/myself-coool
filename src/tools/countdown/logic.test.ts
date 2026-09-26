import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDLE,
  MAX_DURATION_MS,
  addLap,
  elapsed,
  formatDuration,
  lapStats,
  lapsToCsv,
  parseDuration,
  pause,
  progress,
  remaining,
  reset,
  start,
  toggle,
} from './logic.ts';

test('an idle timer reads zero whatever the clock says', () => {
  assert.equal(elapsed(IDLE, 0), 0);
  assert.equal(elapsed(IDLE, 1_000_000), 0);
});

test('elapsed time is a subtraction, so a throttled tick cannot lose it', () => {
  const running = start(IDLE, 1000);
  assert.equal(elapsed(running, 1000), 0);
  assert.equal(elapsed(running, 4000), 3000);
  // One single tick after five minutes in a background tab: still exact.
  assert.equal(elapsed(running, 1000 + 300_000), 300_000);
  // A clock that jumped backwards must not produce a negative reading.
  assert.equal(elapsed(running, 500), 0);
});

test('pause banks the time and resume adds to it', () => {
  const first = pause(start(IDLE, 1000), 4000);
  assert.equal(first.running, false);
  assert.equal(first.banked, 3000);
  assert.equal(elapsed(first, 999_999), 3000);
  const second = start(first, 10_000);
  assert.equal(elapsed(second, 12_000), 5000);
  assert.equal(elapsed(pause(second, 12_000), 0), 5000);
});

test('redundant starts and pauses change nothing', () => {
  const running = start(IDLE, 1000);
  assert.equal(start(running, 5000), running);
  const paused = pause(running, 4000);
  assert.equal(pause(paused, 9000), paused);
  assert.deepEqual(reset(), IDLE);
  assert.equal(elapsed(reset(), 5000), 0);
});

test('toggle alternates, keeping the total', () => {
  const a = toggle(IDLE, 0);
  assert.equal(a.running, true);
  const b = toggle(a, 2000);
  assert.equal(b.running, false);
  assert.equal(elapsed(b, 9000), 2000);
  const c = toggle(b, 3000);
  assert.equal(elapsed(c, 4000), 3000);
});

test('remaining goes negative to report overtime', () => {
  const running = start(IDLE, 0);
  assert.equal(remaining(running, 60_000, 0), 60_000);
  assert.equal(remaining(running, 60_000, 60_000), 0);
  assert.equal(remaining(running, 60_000, 75_000), -15_000);
  assert.equal(progress(running, 60_000, 30_000), 0.5);
  assert.equal(progress(running, 60_000, 90_000), 1);
  assert.equal(progress(running, 0, 0), 1);
});

test('laps record their own split and the running total', () => {
  let laps = addLap([], 10_000);
  laps = addLap(laps, 25_000);
  laps = addLap(laps, 30_000);
  assert.deepEqual(laps, [
    { index: 1, at: 10_000, split: 10_000 },
    { index: 2, at: 25_000, split: 15_000 },
    { index: 3, at: 30_000, split: 5000 },
  ]);
  const stats = lapStats(laps);
  assert.deepEqual(stats, { fastest: 5000, slowest: 15_000, mean: 10_000, total: 30_000 });
  assert.equal(lapStats([]), null);
});

test('lap CSV has a header and one row per lap', () => {
  const laps = addLap(addLap([], 10_000), 25_500);
  assert.equal(lapsToCsv(laps), 'lap,split,total\n1,00:10.0,00:10.0\n2,00:15.5,00:25.5');
  assert.equal(lapsToCsv([]), 'lap,split,total');
});

test('durations are read in every shape a timer box accepts', () => {
  assert.equal(parseDuration('25'), 25 * 60_000);
  assert.equal(parseDuration('0.5'), 30_000);
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('25m'), 25 * 60_000);
  assert.equal(parseDuration('1h'), 3_600_000);
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('1h 30m 5s'), 5_405_000);
  assert.equal(parseDuration('30m1h'), 5_400_000);
  assert.equal(parseDuration('1:30'), 90_000);
  assert.equal(parseDuration('1:30:00'), 5_400_000);
  assert.equal(parseDuration('0:00:05'), 5000);
  assert.equal(parseDuration('12:34.5'), 754_500);
  assert.equal(parseDuration(' 25M '), 25 * 60_000);
});

test('anything else is refused rather than half-read', () => {
  for (const bad of ['', '   ', 'soon', '1h junk', '1:30:00:00', '1:75', '1:30:70', 'h', '--5', '1h1h', '7000', '10h 1s x']) {
    assert.equal(parseDuration(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseDuration('100:00:01'), null);
  assert.equal(parseDuration(String(MAX_DURATION_MS)), null);
  assert.equal(parseDuration('99:59:59'), 359_999_000);
});

test('duration formatting pads, drops the empty hour, and marks overtime', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(5000), '00:05');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_600_000), '1:00:00');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatDuration(-15_000), '-00:15');
  assert.equal(formatDuration(1500, true), '00:01.5');
  assert.equal(formatDuration(-1500, true), '-00:01.5');
  assert.equal(formatDuration(999, true), '00:00.9');
});

test('a spaced unit form reads the same as a packed one', () => {
  // The whitespace between number and unit is part of the match, so counting
  // raw match lengths against a space-stripped input used to reject the spaced
  // form while accepting `1h 30m`.
  assert.equal(parseDuration('1 h 30 m'), parseDuration('1h30m'));
  assert.equal(parseDuration('1 h'), 3_600_000);
  assert.equal(parseDuration('90 s'), 90_000);
  assert.equal(parseDuration('  2 h  15 m  30 s '), 2 * 3_600_000 + 15 * 60_000 + 30_000);
  // Still strict about anything that is not a unit group.
  assert.equal(parseDuration('1 h junk'), null);
  assert.equal(parseDuration('1 h 1 h'), null);
  assert.equal(parseDuration('h'), null);
});
