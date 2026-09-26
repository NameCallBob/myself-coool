import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CronError,
  MAX_DAYS,
  dayMatches,
  daysInMonth,
  describe,
  detectDialect,
  nextRuns,
  parseCron,
  unionInEffect,
} from './logic.ts';

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const at = (text: string) => Date.parse(text);

/* ── Field parsing ────────────────────────── */

test('five fields parse in Unix order', () => {
  const cron = parseCron('30 4 * * *', 'unix');
  assert.deepEqual(cron.present, ['minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(cron.fields.minute.values, [30]);
  assert.deepEqual(cron.fields.hour.values, [4]);
  assert.equal(cron.fields.dom.wildcard, true);
  // An absent seconds field means second zero, not "every second".
  assert.deepEqual(cron.fields.second.values, [0]);
});

test('six fields parse in Quartz order with seconds first', () => {
  const cron = parseCron('15 30 4 * * ?', 'quartz');
  assert.deepEqual(cron.present, ['second', 'minute', 'hour', 'dom', 'month', 'dow']);
  assert.deepEqual(cron.fields.second.values, [15]);
  assert.deepEqual(cron.fields.minute.values, [30]);
  assert.equal(cron.fields.dow.wildcard, true);
});

test('seven fields add the Quartz year', () => {
  const cron = parseCron('0 0 12 1 1 ? 2030-2031', 'quartz');
  assert.deepEqual(cron.fields.year.values, [2030, 2031]);
  assert.ok(cron.present.includes('year'));
});

test('the wrong field count is refused, not silently reinterpreted', () => {
  assert.throws(() => parseCron('0 0 * * * *', 'unix'), (error: unknown) => {
    assert.ok(error instanceof CronError);
    assert.equal(error.code, 'field-count');
    return true;
  });
  assert.throws(() => parseCron('0 0 * * *', 'quartz'), CronError);
});

test('steps, lists and ranges expand to the right values', () => {
  assert.deepEqual(parseCron('*/15 * * * *', 'unix').fields.minute.values, [0, 15, 30, 45]);
  assert.deepEqual(parseCron('0,30 * * * *', 'unix').fields.minute.values, [0, 30]);
  assert.deepEqual(parseCron('10-13 * * * *', 'unix').fields.minute.values, [10, 11, 12, 13]);
  assert.deepEqual(parseCron('0-30/10 * * * *', 'unix').fields.minute.values, [0, 10, 20, 30]);
  // `a/step` counts from a to the end of the field.
  assert.deepEqual(parseCron('5/15 * * * *', 'unix').fields.minute.values, [5, 20, 35, 50]);
  assert.deepEqual(parseCron('0 0 * * *', 'unix').fields.dow.values.length, 7);
});

test('a step of 1 on a range is the range itself', () => {
  assert.deepEqual(parseCron('1-3/1 * * * *', 'unix').fields.minute.values, [1, 2, 3]);
});

test('Sunday is 0 in Unix and 7 is the same day', () => {
  assert.deepEqual(parseCron('0 0 * * 0', 'unix').fields.dow.values, [0]);
  assert.deepEqual(parseCron('0 0 * * 7', 'unix').fields.dow.values, [0]);
  assert.deepEqual(parseCron('0 0 * * 0,7', 'unix').fields.dow.values, [0]);
});

test('Sunday is 1 in Quartz, so the same digits mean different days', () => {
  assert.deepEqual(parseCron('0 0 0 ? * 1', 'quartz').fields.dow.values, [0]);
  assert.deepEqual(parseCron('0 0 0 ? * 2', 'quartz').fields.dow.values, [1]);
  assert.deepEqual(parseCron('0 0 0 ? * 7', 'quartz').fields.dow.values, [6]);
  assert.throws(() => parseCron('0 0 0 ? * 0', 'quartz'), CronError);
  // Unix numbering of the same string is one day earlier.
  assert.deepEqual(parseCron('0 0 * * 2', 'unix').fields.dow.values, [2]);
});

test('three-letter names are dialect independent', () => {
  assert.deepEqual(parseCron('0 0 * * SUN', 'unix').fields.dow.values, [0]);
  assert.deepEqual(parseCron('0 0 0 ? * SUN', 'quartz').fields.dow.values, [0]);
  assert.deepEqual(parseCron('0 0 * * mon-fri', 'unix').fields.dow.values, [1, 2, 3, 4, 5]);
  assert.deepEqual(parseCron('0 0 1 JAN,jul *', 'unix').fields.month.values, [1, 7]);
});

test('a high-to-low range wraps and is flagged', () => {
  const week = parseCron('0 0 * * FRI-SUN', 'unix').fields.dow;
  assert.deepEqual(week.values, [0, 5, 6]);
  assert.equal(week.wrapped, true);
  const hour = parseCron('0 22-2 * * *', 'unix').fields.hour;
  assert.deepEqual(hour.values, [0, 1, 2, 22, 23]);
  assert.equal(hour.wrapped, true);
});

test('out-of-range and malformed tokens throw with a code', () => {
  assert.throws(() => parseCron('60 * * * *', 'unix'), (error: unknown) => {
    assert.ok(error instanceof CronError);
    assert.equal(error.code, 'out-of-range');
    assert.equal(error.field, 'minute');
    return true;
  });
  assert.throws(() => parseCron('0 24 * * *', 'unix'), CronError);
  assert.throws(() => parseCron('0 0 0 * *', 'unix'), CronError); // day 0 does not exist
  assert.throws(() => parseCron('0 0 32 * *', 'unix'), CronError);
  assert.throws(() => parseCron('0 0 * 13 *', 'unix'), CronError);
  assert.throws(() => parseCron('x * * * *', 'unix'), CronError);
  assert.throws(() => parseCron('*/0 * * * *', 'unix'), CronError);
  assert.throws(() => parseCron('*/a * * * *', 'unix'), CronError);
  assert.throws(() => parseCron('0,, * * * *', 'unix'), CronError);
  assert.throws(() => parseCron('', 'unix'), CronError);
});

test('Quartz-only syntax is refused in Unix mode instead of misread', () => {
  assert.throws(() => parseCron('0 0 ? * MON', 'unix'), (error: unknown) => {
    assert.ok(error instanceof CronError);
    assert.equal(error.code, 'quartz-only');
    return true;
  });
  assert.throws(() => parseCron('0 0 L * *', 'unix'), CronError);
  assert.throws(() => parseCron('0 0 * * 6#3', 'unix'), CronError);
});

test('Jenkins H and the W modifier are refused, not approximated', () => {
  assert.throws(() => parseCron('H/15 * * * *', 'unix'), (error: unknown) => {
    assert.ok(error instanceof CronError);
    assert.equal(error.code, 'unsupported');
    assert.equal(error.token, 'H');
    return true;
  });
  assert.throws(() => parseCron('0 0 0 15W * ?', 'quartz'), (error: unknown) => {
    assert.ok(error instanceof CronError);
    assert.equal(error.token, 'W');
    return true;
  });
  // WED must not trip the W check.
  assert.deepEqual(parseCron('0 0 * * WED', 'unix').fields.dow.values, [3]);
});

test('Quartz L and # parse into their own shapes', () => {
  const last = parseCron('0 0 0 L * ?', 'quartz').fields.dom;
  assert.equal(last.lastDay, true);
  const third = parseCron('0 0 0 ? * 6#3', 'quartz').fields.dow;
  assert.deepEqual(third.nth, { weekday: 5, n: 3 });
  const lastFriday = parseCron('0 0 0 ? * 6L', 'quartz').fields.dow;
  assert.equal(lastFriday.lastWeekday, 5);
  // A bare L in day-of-week is Saturday in Quartz.
  assert.deepEqual(parseCron('0 0 0 ? * L', 'quartz').fields.dow.values, [6]);
  assert.throws(() => parseCron('0 0 0 ? * 6#9', 'quartz'), CronError);
  assert.throws(() => parseCron('0 0 0 L,15 * ?', 'quartz'), CronError);
});

test('macros expand and @reboot has no schedule', () => {
  const daily = parseCron('@daily', 'unix');
  assert.equal(daily.macro, '@daily');
  assert.deepEqual(daily.fields.hour.values, [0]);
  assert.deepEqual(parseCron('@weekly', 'unix').fields.dow.values, [0]);
  assert.deepEqual(parseCron('@yearly', 'unix').fields.month.values, [1]);
  assert.deepEqual(parseCron('@hourly', 'unix').fields.minute.values, [0]);
  const reboot = parseCron('@reboot', 'unix');
  assert.equal(reboot.reboot, true);
  assert.deepEqual(nextRuns(reboot, at('2026-01-01T00:00:00Z'), 3, 'utc'), []);
  assert.throws(() => parseCron('@never', 'unix'), CronError);
});

test('dialect detection counts fields', () => {
  assert.equal(detectDialect('0 0 * * *'), 'unix');
  assert.equal(detectDialect('0 0 0 * * ?'), 'quartz');
  assert.equal(detectDialect('  0 0 0 * * ? 2030 '), 'quartz');
});

/* ── The union rule ───────────────────────── */

test('both day fields restricted means either can fire', () => {
  const cron = parseCron('0 0 1 * MON', 'unix');
  assert.equal(unionInEffect(cron), true);
  // 2026-06-01 is a Monday and the first; 2026-06-08 is only a Monday;
  // 2026-07-01 is only the first. All three fire.
  assert.equal(dayMatches(cron, 2026, 6, 8, 1), true);
  assert.equal(dayMatches(cron, 2026, 7, 1, 3), true);
  assert.equal(dayMatches(cron, 2026, 6, 9, 2), false);
});

test('one wildcard day field means only the other applies', () => {
  const weekly = parseCron('0 0 * * MON', 'unix');
  assert.equal(unionInEffect(weekly), false);
  assert.equal(dayMatches(weekly, 2026, 6, 1, 1), true);
  assert.equal(dayMatches(weekly, 2026, 6, 2, 2), false);

  const monthly = parseCron('0 0 15 * *', 'unix');
  assert.equal(dayMatches(monthly, 2026, 6, 15, 1), true);
  assert.equal(dayMatches(monthly, 2026, 6, 16, 2), false);
});

/* ── Next runs, against hand-computed answers ─ */

test('a daily job lands on the next midnight', () => {
  const cron = parseCron('0 0 * * *', 'unix');
  assert.deepEqual(nextRuns(cron, at('2026-03-10T08:30:00Z'), 3, 'utc').map(iso), [
    '2026-03-11T00:00:00Z',
    '2026-03-12T00:00:00Z',
    '2026-03-13T00:00:00Z',
  ]);
});

test('the run exactly at the reference instant is not counted as next', () => {
  const cron = parseCron('0 * * * *', 'unix');
  assert.deepEqual(nextRuns(cron, at('2026-03-10T08:00:00Z'), 1, 'utc').map(iso), [
    '2026-03-10T09:00:00Z',
  ]);
});

test('every fifteen minutes crosses the hour correctly', () => {
  const cron = parseCron('*/15 * * * *', 'unix');
  assert.deepEqual(nextRuns(cron, at('2026-03-10T08:47:10Z'), 3, 'utc').map(iso), [
    '2026-03-10T09:00:00Z',
    '2026-03-10T09:15:00Z',
    '2026-03-10T09:30:00Z',
  ]);
});

test('weekday-only jobs skip the weekend', () => {
  // 2026-03-13 is a Friday, so the next weekday run is Monday the 16th.
  const cron = parseCron('30 9 * * 1-5', 'unix');
  assert.deepEqual(nextRuns(cron, at('2026-03-13T10:00:00Z'), 2, 'utc').map(iso), [
    '2026-03-16T09:30:00Z',
    '2026-03-17T09:30:00Z',
  ]);
});

test('the last day of the month tracks month length', () => {
  const cron = parseCron('0 0 23 L * ?', 'quartz');
  assert.deepEqual(nextRuns(cron, at('2027-01-01T00:00:00Z'), 4, 'utc').map(iso), [
    '2027-01-31T23:00:00Z',
    '2027-02-28T23:00:00Z',
    '2027-03-31T23:00:00Z',
    '2027-04-30T23:00:00Z',
  ]);
});

test('February 29 only fires in leap years', () => {
  const cron = parseCron('0 12 29 2 *', 'unix');
  const runs = nextRuns(cron, at('2026-01-01T00:00:00Z'), 2, 'utc').map(iso);
  assert.deepEqual(runs, ['2028-02-29T12:00:00Z', '2032-02-29T12:00:00Z']);
});

test('the third Friday of the month is the third Friday, not day 15 to 21', () => {
  const cron = parseCron('0 0 9 ? * 6#3', 'quartz');
  // March 2026: Fridays are the 6th, 13th, 20th, 27th → third is the 20th.
  assert.deepEqual(nextRuns(cron, at('2026-03-01T00:00:00Z'), 2, 'utc').map(iso), [
    '2026-03-20T09:00:00Z',
    '2026-04-17T09:00:00Z',
  ]);
});

test('the last Friday of the month is found in months with four and five', () => {
  const cron = parseCron('0 0 9 ? * 6L', 'quartz');
  // March 2026 has five Fridays (last = 27th); April 2026 has four (last = 24th).
  assert.deepEqual(nextRuns(cron, at('2026-03-01T00:00:00Z'), 2, 'utc').map(iso), [
    '2026-03-27T09:00:00Z',
    '2026-04-24T09:00:00Z',
  ]);
});

test('a union expression fires on both kinds of day', () => {
  const cron = parseCron('0 0 1 * MON', 'unix');
  // June 2026: the 1st is a Monday, then Mondays 8, 15, 22, 29, then July 1st.
  assert.deepEqual(nextRuns(cron, at('2026-06-01T12:00:00Z'), 3, 'utc').map(iso), [
    '2026-06-08T00:00:00Z',
    '2026-06-15T00:00:00Z',
    '2026-06-22T00:00:00Z',
  ]);
});

test('the seconds field is honoured', () => {
  const cron = parseCron('0/20 * * * * ?', 'quartz');
  assert.deepEqual(nextRuns(cron, at('2026-03-10T08:00:05Z'), 3, 'utc').map(iso), [
    '2026-03-10T08:00:20Z',
    '2026-03-10T08:00:40Z',
    '2026-03-10T08:01:00Z',
  ]);
});

test('a year restriction can exhaust the schedule', () => {
  const cron = parseCron('0 0 12 1 1 ? 2027', 'quartz');
  assert.deepEqual(nextRuns(cron, at('2026-06-01T00:00:00Z'), 3, 'utc').map(iso), [
    '2027-01-01T12:00:00Z',
  ]);
  const past = parseCron('0 0 12 1 1 ? 2000', 'quartz');
  assert.deepEqual(nextRuns(past, at('2026-06-01T00:00:00Z'), 3, 'utc'), []);
});

test('asking for zero runs returns nothing and never loops', () => {
  const cron = parseCron('* * * * *', 'unix');
  assert.deepEqual(nextRuns(cron, at('2026-06-01T00:00:00Z'), 0, 'utc'), []);
  assert.ok(MAX_DAYS > 365 * 4);
});

test('runs come back strictly ascending with no duplicates', () => {
  const cron = parseCron('0,0 0-1 * * *', 'unix');
  const runs = nextRuns(cron, at('2026-06-01T05:00:00Z'), 4, 'utc');
  assert.deepEqual(runs.map(iso), [
    '2026-06-02T00:00:00Z',
    '2026-06-02T01:00:00Z',
    '2026-06-03T00:00:00Z',
    '2026-06-03T01:00:00Z',
  ]);
});

test('local-zone runs are consistent with the machine timezone', () => {
  const cron = parseCron('0 3 * * *', 'unix');
  const [first] = nextRuns(cron, at('2026-06-01T00:00:00Z'), 1, 'local');
  const date = new Date(first);
  assert.equal(date.getHours(), 3);
  assert.equal(date.getMinutes(), 0);
  assert.ok(first > at('2026-06-01T00:00:00Z'));
});

/** Runs `fn` with the process timezone pinned, so a DST case is reproducible. */
function withZone(zone: string, fn: () => void): void {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/**
 * Calendar-shaped `new Date(y, m, d, …)` builds during `run` — the unit of work
 * the day-first search spends, and the only one worth counting here.
 */
function countCalendarBuilds(run: () => void): number {
  const RealDate = Date;
  let builds = 0;
  function counting(...args: unknown[]): Date {
    if (args.length >= 3) builds += 1;
    // The genuine prototype has to come along, or the result has no methods.
    return Reflect.construct(RealDate, args, counting) as Date;
  }
  // A mutable view of the members a DateConstructor needs: the real type
  // declares `prototype` readonly, and this stand-in has to carry it.
  const statics = counting as unknown as {
    prototype: Date;
    UTC: typeof Date.UTC;
    now: typeof Date.now;
    parse: typeof Date.parse;
  };
  statics.prototype = RealDate.prototype;
  statics.UTC = RealDate.UTC;
  statics.now = RealDate.now;
  statics.parse = RealDate.parse;
  globalThis.Date = counting as unknown as DateConstructor;
  try {
    run();
  } finally {
    globalThis.Date = RealDate;
  }
  return builds;
}

test('a spring-forward local time that does not exist is skipped, not shifted', () => {
  withZone('America/New_York', () => {
    // 2026-03-08: 02:00 EST jumps to 03:00 EDT, so 02:30 never happens.
    const cron = parseCron('30 2 * * *', 'unix');
    assert.deepEqual(nextRuns(cron, at('2026-03-08T00:00:00Z'), 2, 'local').map(iso), [
      '2026-03-09T06:30:00Z',
      '2026-03-10T06:30:00Z',
    ]);
  });
});

test('a fall-back local time that happens twice is reported once', () => {
  withZone('America/New_York', () => {
    // 2026-11-01: 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice —
    // once at 05:30Z and again at 06:30Z. Only the first is listed, which is
    // roughly what Vixie cron does; it is asserted here so the asymmetry with
    // the spring-forward case is a decision on the record, not an accident.
    const cron = parseCron('30 1 * * *', 'unix');
    const runs = nextRuns(cron, at('2026-11-01T04:30:00Z'), 2, 'local').map(iso);
    assert.deepEqual(runs, ['2026-11-01T05:30:00Z', '2026-11-02T06:30:00Z']);
    assert.ok(!runs.includes('2026-11-01T06:30:00Z'));
  });
});

test('the search does not enumerate the day before the reference instant', () => {
  withZone('America/New_York', () => {
    // Every second, asked at 19:00 local: the eight answers are the next eight
    // seconds, so the walk must not first build the 68 400 wall-clock times
    // that precede it.
    const cron = parseCron('* * * * * ?', 'quartz');
    let runs: number[] = [];
    const builds = countCalendarBuilds(() => {
      runs = nextRuns(cron, at('2026-06-15T23:00:00Z'), 8, 'local');
    });
    assert.deepEqual(runs.map(iso), [
      '2026-06-15T23:00:01Z',
      '2026-06-15T23:00:02Z',
      '2026-06-15T23:00:03Z',
      '2026-06-15T23:00:04Z',
      '2026-06-15T23:00:05Z',
      '2026-06-15T23:00:06Z',
      '2026-06-15T23:00:07Z',
      '2026-06-15T23:00:08Z',
    ]);
    assert.ok(builds < 200, `${builds} calendar builds for eight runs`);
  });
});

test('skipping ahead never drops a run, in a half-hour DST zone either', () => {
  // Lord Howe shifts by 30 minutes, which is exactly the shape a cutoff
  // computed from whole hours would get wrong.
  withZone('Australia/Lord_Howe', () => {
    const cron = parseCron('*/7 * * * *', 'unix');
    assert.deepEqual(nextRuns(cron, at('2026-04-04T15:30:00Z'), 4, 'local').map(iso), [
      '2026-04-04T15:37:00Z',
      '2026-04-04T15:44:00Z',
      '2026-04-04T15:51:00Z',
      '2026-04-04T15:58:00Z',
    ]);
    const daily = parseCron('30 1 * * *', 'unix');
    const runs = nextRuns(daily, at('2026-04-04T13:00:00Z'), 3, 'local');
    assert.ok(runs.every((run, index) => index === 0 || run > runs[index - 1]));
    for (const run of runs) assert.equal(new Date(run).getHours(), 1);
  });
});

test('month lengths are right, including leap February', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(daysInMonth(2026, 1), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

/* ── Reading it out loud ──────────────────── */

test('a plain daily job reads as a daily job', () => {
  const zh = describe(parseCron('30 4 * * *', 'unix'), 'zh');
  assert.equal(zh.summary, '每天 04:30 執行');
  const en = describe(parseCron('30 4 * * *', 'unix'), 'en');
  assert.equal(en.summary, 'every day at 04:30');
});

test('step and wildcard shapes get their own phrasing', () => {
  assert.equal(describe(parseCron('* * * * *', 'unix'), 'zh').summary, '每天 每一分鐘 執行');
  assert.equal(describe(parseCron('*/15 * * * *', 'unix'), 'zh').summary, '每天 每 15 分鐘 執行');
  assert.equal(
    describe(parseCron('0 */6 * * *', 'unix'), 'zh').summary,
    '每天 每 6 小時的第 0 分 執行'
  );
  assert.equal(
    describe(parseCron('5,35 * * * *', 'unix'), 'zh').summary,
    '每天 每小時的第 5、35 分 執行'
  );
  assert.equal(describe(parseCron('* * * * * ?', 'quartz'), 'zh').summary, '每天 每一秒 執行');
});

test('day, month and week restrictions show up in the summary', () => {
  assert.equal(
    describe(parseCron('0 9 * * 1-5', 'unix'), 'zh').summary,
    '每週一、週二、週三、週四、週五 09:00 執行'
  );
  assert.equal(describe(parseCron('0 0 1 1 *', 'unix'), 'zh').summary, '每月 1 日 限 1 月 00:00 執行');
  assert.equal(
    describe(parseCron('0 0 0 L * ?', 'quartz'), 'zh').summary,
    '每月最後一天 00:00 執行'
  );
  assert.equal(
    describe(parseCron('0 0 0 ? * 6#3', 'quartz'), 'zh').summary,
    '每月第 3 個週五 00:00 執行'
  );
});

test('the union rule is stated in the notes whenever it applies', () => {
  const both = describe(parseCron('0 0 1 * MON', 'unix'), 'zh');
  assert.ok(both.notes.some((note) => note.includes('聯集')));
  assert.ok(both.summary.includes('或'));
  const one = describe(parseCron('0 0 * * MON', 'unix'), 'zh');
  assert.ok(!one.notes.some((note) => note.includes('聯集')));
});

test('Quartz numbering and wrapped ranges are called out', () => {
  const quartz = describe(parseCron('0 0 0 ? * 2', 'quartz'), 'zh');
  assert.ok(quartz.notes.some((note) => note.includes('1=週日')));
  const wrapped = describe(parseCron('0 22-2 * * *', 'unix'), 'zh');
  assert.ok(wrapped.notes.some((note) => note.includes('Vixie')));
});

test('every field is listed with its raw text and its reading', () => {
  const read = describe(parseCron('0 12 * JAN-FEB MON', 'unix'), 'zh');
  assert.deepEqual(
    read.fields.map((field) => [field.label, field.raw, field.reading]),
    [
      ['分', '0', '0'],
      ['時', '12', '12'],
      ['日', '*', '不限'],
      ['月', 'JAN-FEB', '1 月、2 月'],
      ['週', 'MON', '週一'],
    ]
  );
});

test('@reboot says it has no next time', () => {
  const read = describe(parseCron('@reboot', 'unix'), 'zh');
  assert.ok(read.summary.includes('開機'));
  assert.ok(read.summary.includes('沒有'));
});

test('a long value list is abbreviated rather than dumped', () => {
  const read = describe(parseCron('*/2 * * * *', 'unix'), 'zh');
  const minute = read.fields.find((field) => field.label === '分');
  assert.ok(minute && minute.reading.includes('共 30 個'));
});
