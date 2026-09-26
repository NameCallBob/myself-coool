import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SPAN_DAYS,
  MAX_STEP_DAYS,
  SpanTooLong,
  StepTooFar,
  TAIWAN_SEED,
  TAIWAN_SEED_VERSION,
  addWorkdays,
  buildCalendar,
  civilFromDayNumber,
  classify,
  countWorkdays,
  dayNumber,
  formatIso,
  isWorkday,
  listDays,
  monthlyTotals,
  nextWorkday,
  parseIso,
  parseTable,
  serializeTable,
  weekdayOf,
  workdayCount,
} from './logic.ts';

const d = (iso: string) => {
  const day = parseIso(iso);
  assert.notEqual(day, null, iso);
  return day as number;
};

const plain = buildCalendar([], [0, 6]);

test('civil dates convert both ways', () => {
  assert.equal(dayNumber(1970, 1, 1), 0);
  assert.equal(formatIso(0), '1970-01-01');
  assert.equal(formatIso(dayNumber(2026, 9, 26)), '2026-09-26');
  assert.deepEqual(civilFromDayNumber(dayNumber(2024, 2, 29)), { year: 2024, month: 2, day: 29 });
  assert.equal(formatIso(-1), '1969-12-31');
});

test('weekday indices line up with the real calendar', () => {
  assert.equal(weekdayOf(d('2026-09-26')), 6); // Saturday
  assert.equal(weekdayOf(d('2026-09-27')), 0); // Sunday
  assert.equal(weekdayOf(d('2026-09-28')), 1); // Monday
});

test('ISO dates are parsed strictly', () => {
  assert.equal(parseIso('2024-02-29'), dayNumber(2024, 2, 29));
  assert.equal(parseIso('2023-02-29'), null);
  assert.equal(parseIso('2026-13-01'), null);
  assert.equal(parseIso('2026-00-10'), null);
  assert.equal(parseIso('26-01-01'), null);
  assert.equal(parseIso(''), null);
  assert.equal(parseIso('2026-09-26 '), dayNumber(2026, 9, 26));
});

test('the table format takes names, comments, makeup days and blank lines', () => {
  const parsed = parseTable(
    ['# a comment', '', '2026-01-01 元旦', '+2026-02-14 補班', '2026-10-10\t國慶日  # trailing', '2026-05-01,勞動節'].join('\n')
  );
  assert.equal(parsed.problems.length, 0);
  assert.deepEqual(
    parsed.entries.map((entry) => [entry.iso, entry.name, entry.kind]),
    [
      ['2026-01-01', '元旦', 'holiday'],
      ['2026-02-14', '補班', 'workday'],
      ['2026-05-01', '勞動節', 'holiday'],
      ['2026-10-10', '國慶日', 'holiday'],
    ]
  );
});

test('bad lines are reported with their line number, not dropped silently', () => {
  const parsed = parseTable(['2026-01-01 ok', 'nonsense', '2026-02-30 沒有這天'].join('\n'));
  assert.equal(parsed.entries.length, 1);
  assert.deepEqual(
    parsed.problems.map((problem) => [problem.line, problem.reason]),
    [
      [2, 'date'],
      [3, 'date'],
    ]
  );
});

test('a later line overrides an earlier one for the same date', () => {
  const parsed = parseTable(['2026-05-01 勞動節', '+2026-05-01 今年照上班'].join('\n'));
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].kind, 'workday');
  assert.equal(parsed.problems[0].reason, 'duplicate');
});

test('serialise round trips through the parser', () => {
  const text = serializeTable(parseTable(TAIWAN_SEED).entries);
  const again = parseTable(text);
  assert.equal(again.problems.length, 0);
  assert.equal(serializeTable(again.entries), text);
  assert.ok(text.includes('2026-02-17 春節'));
});

test('a plain Monday-to-Friday week counts five', () => {
  assert.equal(workdayCount(d('2026-09-21'), d('2026-09-25'), plain), 5);
  assert.deepEqual(countWorkdays(d('2026-09-21'), d('2026-09-27'), plain), {
    total: 7,
    work: 5,
    weekend: 2,
    holiday: 0,
    makeup: 0,
  });
});

test('a single day counts itself, in either argument order', () => {
  assert.equal(workdayCount(d('2026-09-28'), d('2026-09-28'), plain), 1);
  assert.equal(workdayCount(d('2026-09-27'), d('2026-09-27'), plain), 0);
  assert.equal(
    workdayCount(d('2026-09-25'), d('2026-09-21'), plain),
    workdayCount(d('2026-09-21'), d('2026-09-25'), plain)
  );
});

test('holidays and makeup Saturdays move the count in opposite directions', () => {
  const calendar = buildCalendar(
    parseTable(['2026-09-25 中秋節', '+2026-09-26 補班'].join('\n')).entries,
    [0, 6]
  );
  assert.equal(classify(d('2026-09-25'), calendar), 'holiday');
  assert.equal(classify(d('2026-09-26'), calendar), 'makeup');
  assert.equal(classify(d('2026-09-27'), calendar), 'weekend');
  assert.equal(classify(d('2026-09-28'), calendar), 'work');
  assert.deepEqual(countWorkdays(d('2026-09-21'), d('2026-09-27'), calendar), {
    total: 7,
    work: 4,
    weekend: 1,
    holiday: 1,
    makeup: 1,
  });
  assert.equal(workdayCount(d('2026-09-21'), d('2026-09-27'), calendar), 5);
});

test('a listed holiday on a weekday beats the weekend rule, and vice versa', () => {
  // 2026-10-10 is a Saturday; listing it changes nothing about the count.
  const calendar = buildCalendar(parseTable('2026-10-10 國慶日').entries, [0, 6]);
  assert.equal(classify(d('2026-10-10'), calendar), 'holiday');
  assert.equal(isWorkday(d('2026-10-10'), calendar), false);
  // A six-day week: only Sunday off.
  const sixDay = buildCalendar([], [0]);
  assert.equal(workdayCount(d('2026-09-21'), d('2026-09-27'), sixDay), 6);
  // Nothing off at all.
  assert.equal(workdayCount(d('2026-09-21'), d('2026-09-27'), buildCalendar([], [])), 7);
});

test('stepping N working days out skips weekends and holidays', () => {
  // Friday + 1 working day is the following Monday.
  assert.equal(formatIso(addWorkdays(d('2026-09-25'), 1, plain)), '2026-09-28');
  assert.equal(formatIso(addWorkdays(d('2026-09-25'), 5, plain)), '2026-10-02');
  // Counting starts tomorrow, so zero is the same day.
  assert.equal(formatIso(addWorkdays(d('2026-09-25'), 0, plain)), '2026-09-25');
  // Backwards, for a deadline read in reverse.
  assert.equal(formatIso(addWorkdays(d('2026-09-28'), -1, plain)), '2026-09-25');
  assert.equal(formatIso(addWorkdays(d('2026-09-28'), -5, plain)), '2026-09-21');
  // Starting on a Sunday: the first working day out is Monday.
  assert.equal(formatIso(addWorkdays(d('2026-09-27'), 1, plain)), '2026-09-28');
  const lunar = buildCalendar(parseTable(TAIWAN_SEED).entries, [0, 6]);
  // 2026-02-13 is a Friday; the following week is Chinese New Year.
  assert.equal(formatIso(addWorkdays(d('2026-02-13'), 1, lunar)), '2026-02-20');
});

test('the next working day is the day itself when it already works', () => {
  assert.equal(formatIso(nextWorkday(d('2026-09-28'), plain)), '2026-09-28');
  assert.equal(formatIso(nextWorkday(d('2026-09-26'), plain)), '2026-09-28');
});

test('impossible configurations report instead of spinning', () => {
  const nothingWorks = buildCalendar([], [0, 1, 2, 3, 4, 5, 6]);
  assert.throws(() => addWorkdays(0, 1, nothingWorks), StepTooFar);
  assert.ok(MAX_STEP_DAYS > 0 && MAX_STEP_DAYS < MAX_SPAN_DAYS);
  assert.throws(() => nextWorkday(0, nothingWorks), StepTooFar);
  assert.throws(() => addWorkdays(0, 1.5, plain), TypeError);
  assert.throws(() => countWorkdays(0, MAX_SPAN_DAYS + 1, plain), SpanTooLong);
  assert.throws(() => monthlyTotals(0, MAX_SPAN_DAYS + 1, plain), SpanTooLong);
});

test('the day listing is capped and labelled', () => {
  const rows = listDays(d('2026-09-25'), d('2026-09-28'), buildCalendar(parseTable('2026-09-25 中秋節').entries, [0, 6]));
  assert.deepEqual(
    rows.map((row) => [row.iso, row.kind, row.name]),
    [
      ['2026-09-25', 'holiday', '中秋節'],
      ['2026-09-26', 'weekend', ''],
      ['2026-09-27', 'weekend', ''],
      ['2026-09-28', 'work', ''],
    ]
  );
  assert.equal(listDays(0, 5000, plain).length, 400);
  assert.equal(listDays(0, 5000, plain, 10).length, 10);
});

test('monthly totals break on the calendar month', () => {
  const totals = monthlyTotals(d('2026-09-28'), d('2026-11-02'), plain);
  assert.deepEqual(
    totals.map((row) => row.month),
    ['2026-09', '2026-10', '2026-11']
  );
  assert.equal(totals[0].total, 3);
  assert.equal(totals[1].total, 31);
  // October 2026: 31 days, Sat/Sun off. 1 Oct is a Thursday.
  assert.equal(totals[1].work, 22);
});

test('the seeded Taiwan table parses cleanly and is dated', () => {
  const parsed = parseTable(TAIWAN_SEED);
  assert.equal(parsed.problems.length, 0);
  assert.ok(parsed.entries.length >= 19);
  assert.match(TAIWAN_SEED_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  // Every seeded holiday is a holiday; no makeup days are invented.
  assert.equal(parsed.entries.every((entry) => entry.kind === 'holiday'), true);
});
