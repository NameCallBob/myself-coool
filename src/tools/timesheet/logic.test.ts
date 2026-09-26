import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ENTRIES,
  formatClock,
  billable,
  dailyTotals,
  durationOf,
  findOverlaps,
  formatHm,
  formatHours,
  grandTotal,
  isRunning,
  localDateKey,
  makeId,
  projectTotals,
  removeEntry,
  sanitiseEntries,
  startEntry,
  stopAll,
  stopEntry,
  toCsv,
  trimEntries,
  updateEntry,
  type Entry,
} from './logic.ts';

const H = 3_600_000;
const M = 60_000;
const T0 = Date.UTC(2026, 8, 28, 1, 0, 0);
/** UTC date key, so the tests do not depend on the machine's zone. */
const utcKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const entry = (id: string, project: string, start: number, end: number | null, note = ''): Entry => ({
  id,
  project,
  note,
  start,
  end,
});

test('duration is the span, and a running entry measures up to now', () => {
  assert.equal(durationOf(entry('1', 'a', T0, T0 + H), 0), H);
  assert.equal(durationOf(entry('1', 'a', T0, null), T0 + 90 * M), 90 * M);
  assert.equal(isRunning(entry('1', 'a', T0, null)), true);
  assert.equal(isRunning(entry('1', 'a', T0, T0)), false);
  // A clock that went backwards must not produce negative time.
  assert.equal(durationOf(entry('1', 'a', T0, null), T0 - H), 0);
});

test('durations are formatted for a human and for an invoice', () => {
  assert.equal(formatHm(0), '0m');
  assert.equal(formatHm(59_000), '1m');
  assert.equal(formatHm(25 * M), '25m');
  assert.equal(formatHm(H + 25 * M), '1h 25m');
  assert.equal(formatHm(10 * H), '10h 00m');
  assert.equal(formatHours(H), '1.00');
  assert.equal(formatHours(90 * M), '1.50');
  assert.equal(formatHours(25 * M, 3), '0.417');
  // formatClock reads this device's zone, so it is checked against the same
  // Date fields rather than against a hard-coded string.
  const sample = new Date(2026, 8, 28, 9, 5).getTime();
  assert.equal(formatClock(sample), '09:05');
  assert.match(formatClock(T0), /^\d{2}:\d{2}$/);
});

test('billing rounding is per entry and matches the rate card', () => {
  assert.equal(billable(25 * M, 'exact', 6), 25 * M);
  // Six-minute increments: 25 minutes is nearer to 24 than to 30.
  assert.equal(billable(25 * M, 'nearest', 6), 24 * M);
  assert.equal(billable(27 * M, 'nearest', 6), 30 * M);
  assert.equal(billable(25 * M, 'up', 6), 30 * M);
  // Fifteen-minute increments, exactly on the half: round half up.
  assert.equal(billable(7.5 * M, 'nearest', 15), 15 * M);
  assert.equal(billable(7 * M, 'nearest', 15), 0);
  assert.equal(billable(1000, 'up', 15), 15 * M);
  assert.equal(billable(0, 'up', 15), 0);
  assert.equal(billable(-5, 'nearest', 15), 0);
  // A nonsense granularity degrades to one minute rather than dividing by zero.
  assert.equal(billable(90_000, 'up', 0), 2 * M);
});

test('starting a task stops the one that was running', () => {
  const first = startEntry([], { project: 'A', note: 'x', now: T0, id: '1' });
  assert.equal(first.length, 1);
  assert.equal(first[0].end, null);
  const second = startEntry(first, { project: 'B', note: '', now: T0 + H, id: '2' });
  assert.equal(second.length, 2);
  assert.equal(second[0].end, T0 + H);
  assert.equal(second[1].end, null);
  assert.equal(durationOf(second[0], T0 + 2 * H), H);
  // A blank project is labelled rather than left empty.
  assert.equal(startEntry([], { project: '   ', note: '', now: T0, id: '3' })[0].project, '—');
  assert.equal(startEntry([], { project: ' A ', note: ' n ', now: T0, id: '4' })[0].note, 'n');
});

test('stopping is idempotent and never records negative time', () => {
  const running = [entry('1', 'A', T0, null)];
  const stopped = stopEntry(running, '1', T0 + H);
  assert.equal(stopped[0].end, T0 + H);
  assert.equal(stopEntry(stopped, '1', T0 + 2 * H)[0].end, T0 + H);
  // Stopping "before" the start clamps to the start.
  assert.equal(stopEntry(running, '1', T0 - H)[0].end, T0);
  assert.equal(stopEntry(running, 'nope', T0 + H)[0].end, null);
  const many = stopAll([entry('1', 'A', T0, null), entry('2', 'B', T0, null)], T0 + H);
  assert.equal(many.filter(isRunning).length, 0);
});

test('entries can be edited and removed, with the times kept sane', () => {
  const list = [entry('1', 'A', T0, T0 + H, 'note')];
  assert.equal(updateEntry(list, '1', { project: 'B' })[0].project, 'B');
  assert.equal(updateEntry(list, '1', { end: T0 - H })[0].end, T0);
  assert.equal(updateEntry(list, '1', { note: 'changed' })[0].note, 'changed');
  assert.deepEqual(updateEntry(list, 'other', { project: 'B' }), list);
  assert.deepEqual(removeEntry(list, '1'), []);
  assert.deepEqual(removeEntry(list, 'other'), list);
});

test('the list is sorted by start and capped', () => {
  const messy = [entry('2', 'A', T0 + H, null), entry('1', 'A', T0, T0 + M)];
  assert.deepEqual(trimEntries(messy).map((row) => row.id), ['1', '2']);
  const huge = Array.from({ length: MAX_ENTRIES + 10 }, (_, i) => entry(`e${i}`, 'A', T0 + i * M, T0 + i * M + 1000));
  const trimmed = trimEntries(huge);
  assert.equal(trimmed.length, MAX_ENTRIES);
  assert.equal(trimmed[trimmed.length - 1].id, `e${MAX_ENTRIES + 9}`);
});

test('stored rubbish is discarded rather than rendered', () => {
  assert.deepEqual(sanitiseEntries(null), []);
  assert.deepEqual(sanitiseEntries('nope'), []);
  const cleaned = sanitiseEntries([
    { id: '1', project: 'A', note: 'n', start: T0, end: T0 + H },
    { id: '2', project: '', note: 5, start: T0 + H, end: null },
    { id: '3', start: 'soon' },
    { project: 'no id', start: T0 },
    { id: '4', project: 'B', start: T0 + 2 * H, end: T0 }, // end before start
    42,
  ]);
  assert.deepEqual(
    cleaned.map((row) => [row.id, row.project, row.note, row.end]),
    [
      ['1', 'A', 'n', T0 + H],
      ['2', '—', '', null],
      ['4', 'B', '', T0 + 2 * H],
    ]
  );
});

test('daily totals group by the day the entry started', () => {
  const entries = [
    entry('1', 'A', Date.UTC(2026, 8, 28, 9), Date.UTC(2026, 8, 28, 12)),
    entry('2', 'B', Date.UTC(2026, 8, 28, 13), Date.UTC(2026, 8, 28, 14, 30)),
    // Crosses midnight: it belongs to the 29th, the day it began.
    entry('3', 'A', Date.UTC(2026, 8, 29, 23), Date.UTC(2026, 8, 30, 1)),
  ];
  const days = dailyTotals(entries, 0, 'exact', 6, utcKey);
  assert.deepEqual(
    days.map((day) => [day.key, day.ms / H, day.entries]),
    [
      ['2026-09-28', 4.5, 2],
      ['2026-09-29', 2, 1],
    ]
  );
  assert.equal(localDateKey(T0).length, 10);
  assert.match(localDateKey(T0), /^\d{4}-\d{2}-\d{2}$/);
});

test('project totals are ranked by time and round per entry', () => {
  const entries = [
    entry('1', 'A', T0, T0 + 25 * M),
    entry('2', 'A', T0 + H, T0 + H + 25 * M),
    entry('3', 'B', T0 + 2 * H, T0 + 2 * H + 2 * H),
  ];
  const totals = projectTotals(entries, 0, 'up', 30);
  assert.deepEqual(totals.map((group) => group.key), ['B', 'A']);
  // Two 25-minute entries round up to half an hour each — an hour, not half.
  const a = totals.find((group) => group.key === 'A');
  assert.equal(a?.ms, 50 * M);
  assert.equal(a?.billableMs, H);
  const whole = grandTotal(entries, 0, 'up', 30);
  assert.equal(whole.ms, 50 * M + 2 * H);
  assert.equal(whole.billableMs, H + 2 * H);
  assert.equal(whole.entries, 3);
  assert.equal(whole.running, 0);
  assert.equal(grandTotal([entry('4', 'A', T0, null)], T0 + H).running, 1);
});

test('overlapping entries are found, not silently merged', () => {
  const a = entry('1', 'A', T0, T0 + 2 * H);
  const b = entry('2', 'B', T0 + H, T0 + 3 * H);
  const c = entry('3', 'C', T0 + 4 * H, T0 + 5 * H);
  const found = findOverlaps([a, b, c], 0);
  assert.equal(found.length, 1);
  assert.equal(found[0].a.id, '1');
  assert.equal(found[0].b.id, '2');
  assert.equal(found[0].ms, H);
  // Touching but not overlapping is fine.
  assert.deepEqual(findOverlaps([entry('1', 'A', T0, T0 + H), entry('2', 'B', T0 + H, T0 + 2 * H)], 0), []);
  // A running entry overlaps anything that started after it.
  const running = findOverlaps([entry('1', 'A', T0, null), entry('2', 'B', T0 + H, T0 + 90 * M)], T0 + 2 * H);
  assert.equal(running.length, 1);
  assert.equal(running[0].ms, 30 * M);
  assert.deepEqual(findOverlaps([], 0), []);
});

test('the CSV quotes what it must and carries both hour columns', () => {
  const entries = [entry('1', 'Client, Inc', T0, T0 + 25 * M, 'said "hello"')];
  const lines = toCsv(entries, 0, 'up', 30, utcKey).split('\n');
  assert.equal(lines[0], 'date,project,start,end,hours,billable_hours,note');
  assert.ok(lines[1].startsWith('2026-09-28,"Client, Inc",'));
  assert.ok(lines[1].includes('0.42,0.50'));
  assert.ok(lines[1].endsWith('"said ""hello"""'));
  // A running entry leaves the end column empty rather than guessing.
  const open = toCsv([entry('2', 'A', T0, null)], T0 + H, 'exact', 6, utcKey).split('\n')[1];
  assert.equal(open.split(',')[3], '');
  assert.equal(toCsv([], 0).split('\n').length, 1);
});

test('ids are unique per start moment', () => {
  assert.notEqual(makeId(T0, 1), makeId(T0, 2));
  assert.equal(makeId(T0, 1), makeId(T0, 1));
  assert.match(makeId(T0, 7), /^[a-z0-9]+-[a-z0-9]+$/);
});

test('a lone carriage return in a field is quoted, not left to break the row', () => {
  // A bare CR inside an unquoted field ends the row in Excel and most parsers,
  // which shifted every later column by one without any visible error.
  const csv = toCsv(
    [{ id: 'a', project: 'A\rB', note: 'carriage\rreturn', start: 0, end: 3_600_000 }],
    0,
    'exact',
    6,
    () => '2026-09-26'
  );
  assert.ok(csv.includes('"A\rB"'), csv);
  assert.ok(csv.includes('"carriage\rreturn"'), csv);
  // The quoting rules already in place still hold.
  const other = toCsv(
    [{ id: 'b', project: 'A,B', note: 'say "hi"', start: 0, end: 60_000 }],
    0,
    'exact',
    6,
    () => '2026-09-26'
  );
  assert.ok(other.includes('"A,B"'));
  assert.ok(other.includes('"say ""hi"""'));
  // Nothing plain gets quoted.
  assert.ok(
    toCsv([{ id: 'c', project: 'plain', note: '', start: 0, end: 60_000 }], 0, 'exact', 6, () => '2026-09-26')
      .includes(',plain,')
  );
});
