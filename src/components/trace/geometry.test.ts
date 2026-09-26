import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, YEAR, clamp, hit, pan, stamp, ticks, toTime, toX, unitFor, zoomAt } from './geometry.ts';

const view = { from: Date.UTC(2024, 0, 1), to: Date.UTC(2026, 0, 1) };
const limits = { from: Date.UTC(2023, 0, 1), to: Date.UTC(2027, 0, 1) };
const W = 1000;

test('time and pixels convert both ways', () => {
  assert.equal(toX(view.from, view, W), 0);
  assert.equal(toX(view.to, view, W), W);
  assert.equal(toTime(0, view, W), view.from);
  assert.equal(toTime(W, view, W), view.to);
  for (const x of [0, 137, 500, 999]) {
    assert.ok(Math.abs(toX(toTime(x, view, W), view, W) - x) < 1e-6, `round trip at ${x}`);
  }
});

test('zooming keeps the instant under the pointer in place', () => {
  // The property that separates a chart that feels like a map from one that
  // slides away from the cursor.
  for (const pixel of [0, 250, 640, 1000]) {
    const before = toTime(pixel, view, W);
    const zoomed = zoomAt(view, W, pixel, 0.5, limits);
    const after = toTime(pixel, zoomed, W);
    assert.ok(Math.abs(after - before) < DAY, `pixel ${pixel} drifted ${(after - before) / DAY} days`);
  }
});

test('zoom is bounded at both ends', () => {
  let tight = view;
  for (let i = 0; i < 40; i += 1) tight = zoomAt(tight, W, 500, 0.5, limits);
  assert.ok(tight.to - tight.from >= DAY * 2 - 1, 'zoomed past the floor');

  let loose = view;
  for (let i = 0; i < 40; i += 1) loose = zoomAt(loose, W, 500, 2, limits);
  assert.ok(loose.to - loose.from <= (limits.to - limits.from) * 1.4 + 1, 'zoomed past the ceiling');
});

test('panning cannot walk the data off screen', () => {
  let far = view;
  for (let i = 0; i < 50; i += 1) far = pan(far, W, 400, limits);
  assert.ok(far.to <= limits.to + (limits.to - limits.from) * 0.05, 'panned past the end');
  let back = view;
  for (let i = 0; i < 50; i += 1) back = pan(back, W, -400, limits);
  assert.ok(back.from >= limits.from - (limits.to - limits.from) * 0.05, 'panned past the start');
  // The visible duration must survive a pan unchanged.
  assert.ok(Math.abs((far.to - far.from) - (view.to - view.from)) < 1000);
});

test('clamp keeps a view wider than the data anchored, not squeezed', () => {
  const wide = { from: limits.from - YEAR * 3, to: limits.to + YEAR * 3 };
  const result = clamp(wide, limits);
  assert.ok(Math.abs((result.to - result.from) - (wide.to - wide.from)) < 1000);
});

test('the tick unit changes with the visible duration, not the window size', () => {
  const at = (days: number) => ({ from: 0, to: days * DAY });
  assert.equal(unitFor(at(365 * 8)), 'year');
  assert.equal(unitFor(at(365 * 3)), 'quarter');
  assert.equal(unitFor(at(200)), 'month');
  assert.equal(unitFor(at(30)), 'week');
  assert.equal(unitFor(at(4)), 'day');
});

test('ticks stay inside the view and mark year boundaries as major', () => {
  for (const v of [view, { from: Date.UTC(2026, 3, 1), to: Date.UTC(2026, 4, 1) }, { from: Date.UTC(2026, 6, 8), to: Date.UTC(2026, 6, 18) }]) {
    const marks = ticks(v, 'zh');
    assert.ok(marks.length > 0, 'no ticks produced');
    assert.ok(marks.length < 120, `too many ticks: ${marks.length}`);
    for (const mark of marks) {
      assert.ok(mark.at >= v.from && mark.at <= v.to, 'tick outside the view');
      assert.ok(mark.label.length > 0);
    }
  }
  // The view runs 2024-01-01 to 2026-01-01 inclusive, so the boundary tick at
  // the right edge belongs in the list — dropping it would leave the last
  // year unlabelled.
  const yearly = ticks(view, 'zh').filter((t) => t.major);
  assert.deepEqual(yearly.map((t) => t.label), ['2024', '2025', '2026']);
});

test('hit testing prefers the bar drawn last', () => {
  const rects = [
    { id: 'under', rect: { x: 0, y: 0, width: 100, height: 20 } },
    { id: 'over', rect: { x: 50, y: 0, width: 100, height: 20 } },
  ];
  assert.equal(hit(rects, 10, 10), 'under');
  assert.equal(hit(rects, 60, 10), 'over');
  assert.equal(hit(rects, 200, 10), null);
  assert.equal(hit(rects, 60, 40), null);
});

test('the readout names the instant at the precision being shown', () => {
  const at = Date.UTC(2026, 6, 10);
  assert.equal(stamp(at, 'year', 'zh'), '2026');
  assert.equal(stamp(at, 'month', 'zh'), '2026 年 7 月');
  assert.equal(stamp(at, 'day', 'zh'), '2026/07/10');
  assert.equal(stamp(at, 'day', 'en'), '2026-07-10');
  assert.equal(stamp(at, 'quarter', 'en'), '2026 Q3');
});
