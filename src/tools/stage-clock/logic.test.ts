import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDLE,
  MAX_DURATION_MS,
  clockFields,
  elapsed,
  formatBig,
  formatClockFields,
  parseDuration,
  pause,
  phaseFor,
  start,
  usedFraction,
} from './logic.ts';

const M = 60_000;

test('phases change at the thresholds, inclusive, and overtime needs a negative', () => {
  const warn = 5 * M;
  const danger = M;
  assert.equal(phaseFor(20 * M, warn, danger), 'calm');
  assert.equal(phaseFor(5 * M + 1, warn, danger), 'calm');
  assert.equal(phaseFor(5 * M, warn, danger), 'warn');
  assert.equal(phaseFor(M + 1, warn, danger), 'warn');
  assert.equal(phaseFor(M, warn, danger), 'danger');
  // Exactly on time is still on time.
  assert.equal(phaseFor(0, warn, danger), 'danger');
  assert.equal(phaseFor(-1, warn, danger), 'over');
  assert.equal(phaseFor(-10 * M, warn, danger), 'over');
  // Thresholds may be switched off by setting them to zero.
  assert.equal(phaseFor(1, 0, 0), 'calm');
  assert.equal(phaseFor(0, 0, 0), 'danger');
});

test('the timer is a subtraction and survives sleep', () => {
  const running = start(IDLE, 1000);
  assert.equal(elapsed(running, 1000), 0);
  assert.equal(elapsed(running, 1000 + 45 * M), 45 * M);
  const paused = pause(running, 1000 + 10 * M);
  assert.equal(elapsed(paused, 10 ** 12), 10 * M);
  assert.equal(elapsed(start(paused, 0), 5 * M), 15 * M);
  assert.equal(start(running, 9999), running);
  assert.equal(pause(paused, 9999), paused);
});

test('talk lengths are read in the shapes a programme uses', () => {
  assert.equal(parseDuration('45'), 45 * M);
  assert.equal(parseDuration('45m'), 45 * M);
  assert.equal(parseDuration('1h30m'), 90 * M);
  assert.equal(parseDuration('90s'), 90_000);
  assert.equal(parseDuration('45:00'), 45 * M);
  assert.equal(parseDuration('1:30:00'), 90 * M);
  assert.equal(parseDuration('0:20'), 20_000);
  assert.equal(parseDuration('7.5'), 7.5 * M);
  for (const bad of ['', 'soon', '1:70', '1:2:3:4', '45m junk', '2h2h', '2000', '25:00:00']) {
    assert.equal(parseDuration(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseDuration('24:00:00'), MAX_DURATION_MS);
});

test('the big digits pad, drop an empty hour and count overtime upwards', () => {
  assert.equal(formatBig(45 * M), '45:00');
  assert.equal(formatBig(90 * M), '1:30:00');
  assert.equal(formatBig(5000), '00:05');
  assert.equal(formatBig(0), '00:00');
  assert.equal(formatBig(45 * M, false), '45');
  assert.equal(formatBig(90 * M, false), '1:30');
  // Just under time still shows zero rather than a stray minus sign.
  assert.equal(formatBig(-400), '00:00');
  assert.equal(formatBig(-1000), '-00:01');
  assert.equal(formatBig(-65_000), '-01:05');
  assert.equal(formatBig(-3_600_000), '-1:00:00');
  // Partial seconds truncate, so 59.9 s left reads 00:59 and never 01:00.
  assert.equal(formatBig(59_900), '00:59');
});

test('the wall clock splits into fields, with a twelve-hour option', () => {
  const noon = new Date(2026, 8, 26, 12, 5, 9).getTime();
  assert.deepEqual(clockFields(noon), { hour: 12, minute: 5, second: 9, suffix: '' });
  assert.deepEqual(clockFields(noon, true), { hour: 12, minute: 5, second: 9, suffix: 'PM' });
  const midnight = new Date(2026, 8, 26, 0, 30, 0).getTime();
  assert.deepEqual(clockFields(midnight, true), { hour: 12, minute: 30, second: 0, suffix: 'AM' });
  assert.equal(clockFields(midnight).hour, 0);
  const evening = new Date(2026, 8, 26, 21, 4, 5).getTime();
  assert.deepEqual(clockFields(evening, true), { hour: 9, minute: 4, second: 5, suffix: 'PM' });
  assert.equal(formatClockFields(clockFields(evening)), '21:04:05');
  assert.equal(formatClockFields(clockFields(evening), false), '21:04');
  assert.equal(formatClockFields(clockFields(evening, true)), '09:04:05 PM');
  assert.equal(formatClockFields(clockFields(midnight, true), false), '12:30 AM');
});

test('the used fraction is clamped and safe at zero', () => {
  assert.equal(usedFraction(0, 10 * M), 0);
  assert.equal(usedFraction(5 * M, 10 * M), 0.5);
  assert.equal(usedFraction(20 * M, 10 * M), 1);
  assert.equal(usedFraction(-5, 10 * M), 0);
  assert.equal(usedFraction(5, 0), 1);
});

test('a spaced unit form reads the same as a packed one', () => {
  assert.equal(parseDuration('1 h 30 m'), parseDuration('1h30m'));
  assert.equal(parseDuration('45 m'), 45 * 60_000);
  assert.equal(parseDuration('1 h junk'), null);
  assert.equal(parseDuration('m'), null);
});
