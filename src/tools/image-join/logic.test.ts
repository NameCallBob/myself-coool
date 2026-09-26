import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_LIMITS,
  alignOffset,
  checkLayout,
  crossTarget,
  moveItem,
  normalizeHexColor,
  planJoin,
  scaleToCross,
  type JoinOptions,
  type Size,
} from './logic.ts';

const base: JoinOptions = {
  orientation: 'vertical',
  gap: 0,
  padding: 0,
  align: 'start',
  fit: 'none',
};

const opts = (over: Partial<JoinOptions>): JoinOptions => ({ ...base, ...over });

const A: Size = { width: 100, height: 50 };
const B: Size = { width: 200, height: 80 };

test('scaleToCross keeps the aspect ratio on both axes', () => {
  assert.deepEqual(scaleToCross({ width: 400, height: 300 }, 200, 'vertical'), {
    width: 200,
    height: 150,
  });
  assert.deepEqual(scaleToCross({ width: 400, height: 300 }, 150, 'horizontal'), {
    width: 200,
    height: 150,
  });
});

test('scaleToCross at the image own extent is the identity', () => {
  assert.deepEqual(scaleToCross(A, A.width, 'vertical'), A);
  assert.deepEqual(scaleToCross(B, B.height, 'horizontal'), B);
});

test('scaleToCross never produces a zero-pixel side', () => {
  // 2000x30 down to 40 wide is 0.6 px tall before the floor.
  assert.deepEqual(scaleToCross({ width: 2000, height: 30 }, 40, 'vertical'), {
    width: 40,
    height: 1,
  });
});

test('scaleToCross rounds to whole pixels', () => {
  // 1000/333 = 3.003..., 333 * (100/1000) = 33.3 -> 33
  assert.deepEqual(scaleToCross({ width: 1000, height: 333 }, 100, 'vertical'), {
    width: 100,
    height: 33,
  });
});

test('scaleToCross rejects impossible inputs', () => {
  assert.throws(() => scaleToCross(A, 0, 'vertical'), RangeError);
  assert.throws(() => scaleToCross(A, -10, 'vertical'), RangeError);
  assert.throws(() => scaleToCross(A, Number.NaN, 'vertical'), RangeError);
  assert.throws(() => scaleToCross({ width: 0, height: 10 }, 50, 'vertical'), RangeError);
  assert.throws(
    () => scaleToCross({ width: 10, height: Number.POSITIVE_INFINITY }, 50, 'vertical'),
    RangeError
  );
});

test('crossTarget picks the axis that matters for the orientation', () => {
  const sizes: Size[] = [
    { width: 100, height: 50 },
    { width: 200, height: 80 },
    { width: 150, height: 90 },
  ];
  assert.equal(crossTarget(sizes, 'min', 'vertical'), 100);
  assert.equal(crossTarget(sizes, 'max', 'vertical'), 200);
  assert.equal(crossTarget(sizes, 'min', 'horizontal'), 50);
  assert.equal(crossTarget(sizes, 'max', 'horizontal'), 90);
  assert.equal(crossTarget(sizes, 'none', 'vertical'), null);
  assert.equal(crossTarget([], 'max', 'vertical'), null);
});

test('crossTarget rounds fractional sizes up off zero', () => {
  assert.equal(crossTarget([{ width: 0.4, height: 10 }], 'min', 'vertical'), 1);
});

test('alignOffset places the leftover space', () => {
  assert.equal(alignOffset(100, 'start'), 0);
  assert.equal(alignOffset(100, 'center'), 50);
  assert.equal(alignOffset(100, 'end'), 100);
  // Odd leftovers floor, so the box never crosses the far edge.
  assert.equal(alignOffset(5, 'center'), 2);
  assert.equal(alignOffset(0, 'center'), 0);
  assert.equal(alignOffset(-3, 'center'), 0);
  assert.equal(alignOffset(Number.NaN, 'end'), 0);
});

test('planJoin stacks vertically with a gap and centres the narrow one', () => {
  const layout = planJoin([A, B], opts({ gap: 10, align: 'center' }));
  assert.deepEqual(layout.canvas, { width: 200, height: 140 });
  assert.deepEqual(layout.placements, [
    { index: 0, x: 50, y: 0, width: 100, height: 50 },
    { index: 1, x: 0, y: 60, width: 200, height: 80 },
  ]);
  assert.equal(layout.scaled, false);
});

test('planJoin adds padding on all four sides', () => {
  const layout = planJoin([A, B], opts({ gap: 10, padding: 5, align: 'center' }));
  assert.deepEqual(layout.canvas, { width: 210, height: 150 });
  assert.deepEqual(layout.placements, [
    { index: 0, x: 55, y: 5, width: 100, height: 50 },
    { index: 1, x: 5, y: 65, width: 200, height: 80 },
  ]);
});

test('planJoin honours start and end alignment', () => {
  const start = planJoin([A, B], opts({ align: 'start' }));
  assert.equal(start.placements[0].x, 0);
  const end = planJoin([A, B], opts({ align: 'end' }));
  assert.equal(end.placements[0].x, 100);
  assert.equal(end.placements[1].x, 0);
});

test('planJoin lines up horizontally on the other axis', () => {
  const layout = planJoin([A, B], opts({ orientation: 'horizontal', align: 'center' }));
  assert.deepEqual(layout.canvas, { width: 300, height: 80 });
  assert.deepEqual(layout.placements, [
    { index: 0, x: 0, y: 15, width: 100, height: 50 },
    { index: 1, x: 100, y: 0, width: 200, height: 80 },
  ]);
});

test('planJoin fit=min shrinks everything to the narrowest', () => {
  const layout = planJoin([A, B], opts({ fit: 'min', gap: 10 }));
  assert.deepEqual(layout.canvas, { width: 100, height: 100 });
  assert.deepEqual(layout.placements, [
    { index: 0, x: 0, y: 0, width: 100, height: 50 },
    { index: 1, x: 0, y: 60, width: 100, height: 40 },
  ]);
  assert.equal(layout.scaled, true);
});

test('planJoin fit=max grows everything to the widest', () => {
  const layout = planJoin([A, B], opts({ fit: 'max', gap: 10 }));
  assert.deepEqual(layout.canvas, { width: 200, height: 190 });
  assert.deepEqual(layout.placements, [
    { index: 0, x: 0, y: 0, width: 200, height: 100 },
    { index: 1, x: 0, y: 110, width: 200, height: 80 },
  ]);
  assert.equal(layout.scaled, true);
});

test('planJoin fit on equal sizes reports no scaling', () => {
  const layout = planJoin([A, A], opts({ fit: 'max' }));
  assert.equal(layout.scaled, false);
});

test('planJoin with one image adds no gap', () => {
  const layout = planJoin([B], opts({ gap: 40, padding: 3 }));
  assert.deepEqual(layout.canvas, { width: 206, height: 86 });
  assert.deepEqual(layout.placements, [{ index: 0, x: 3, y: 3, width: 200, height: 80 }]);
});

test('planJoin with no images is an empty canvas, not a padded blank', () => {
  const layout = planJoin([], opts({ padding: 20, gap: 10 }));
  assert.deepEqual(layout, { canvas: { width: 0, height: 0 }, placements: [], scaled: false });
});

test('planJoin rounds fractional spacing and sizes to whole pixels', () => {
  const layout = planJoin([{ width: 99.6, height: 49.4 }], opts({ gap: 2.4, padding: 1.5 }));
  // 99.6 -> 100, 49.4 -> 49, padding 1.5 -> 2
  assert.deepEqual(layout.canvas, { width: 104, height: 53 });
  assert.deepEqual(layout.placements, [{ index: 0, x: 2, y: 2, width: 100, height: 49 }]);
});

test('planJoin rejects impossible spacing and sizes', () => {
  assert.throws(() => planJoin([A], opts({ gap: -1 })), RangeError);
  assert.throws(() => planJoin([A], opts({ padding: Number.NaN })), RangeError);
  assert.throws(() => planJoin([{ width: 10, height: 0 }], base), RangeError);
  assert.throws(() => planJoin([A, { width: -5, height: 5 }], base), RangeError);
});

test('planJoin keeps every placement inside the canvas', () => {
  // A deterministic spread of awkward sizes: tall, wide, tiny, huge.
  const sizes: Size[] = [
    { width: 1, height: 1 },
    { width: 4000, height: 3 },
    { width: 7, height: 2200 },
    { width: 640, height: 640 },
    { width: 1919, height: 1081 },
  ];
  for (const orientation of ['vertical', 'horizontal'] as const) {
    for (const fit of ['none', 'min', 'max'] as const) {
      for (const align of ['start', 'center', 'end'] as const) {
        const layout = planJoin(sizes, { orientation, fit, align, gap: 7, padding: 3 });
        for (const p of layout.placements) {
          const where = `${orientation}/${fit}/${align} #${p.index}`;
          assert.ok(p.x >= 3, `${where} x`);
          assert.ok(p.y >= 3, `${where} y`);
          assert.ok(p.x + p.width <= layout.canvas.width - 3, `${where} right edge`);
          assert.ok(p.y + p.height <= layout.canvas.height - 3, `${where} bottom edge`);
        }
        assert.equal(layout.placements.length, sizes.length);
      }
    }
  }
});

test('planJoin never overlaps neighbours along the main axis', () => {
  const sizes: Size[] = [A, B, { width: 30, height: 200 }, { width: 500, height: 12 }];
  const vertical = planJoin(sizes, opts({ gap: 6 }));
  for (let i = 1; i < vertical.placements.length; i += 1) {
    const prev = vertical.placements[i - 1];
    assert.equal(vertical.placements[i].y, prev.y + prev.height + 6);
  }
  const horizontal = planJoin(sizes, opts({ orientation: 'horizontal', gap: 6 }));
  for (let i = 1; i < horizontal.placements.length; i += 1) {
    const prev = horizontal.placements[i - 1];
    assert.equal(horizontal.placements[i].x, prev.x + prev.width + 6);
  }
});

test('checkLayout flags long sides and oversized areas', () => {
  const small = checkLayout(planJoin([A], base));
  assert.equal(small.pixels, 5000);
  assert.deepEqual(small.exceeded, []);

  const long = checkLayout(planJoin([{ width: 20000, height: 10 }], base));
  assert.deepEqual(long.exceeded, ['side']);

  const wide = checkLayout(planJoin([{ width: 8000, height: 8000 }], base));
  assert.equal(wide.pixels, 64_000_000);
  assert.deepEqual(wide.exceeded, ['area']);

  const both = checkLayout(planJoin([{ width: 20000, height: 20000 }], base));
  assert.deepEqual(both.exceeded, ['side', 'area']);
});

test('checkLayout takes custom ceilings', () => {
  const layout = planJoin([{ width: 100, height: 100 }], base);
  assert.deepEqual(checkLayout(layout, { maxSide: 50, maxArea: 1000 }).exceeded, ['side', 'area']);
  assert.deepEqual(checkLayout(layout, CANVAS_LIMITS).exceeded, []);
});

test('checkLayout on an empty layout counts zero pixels', () => {
  assert.deepEqual(checkLayout(planJoin([], base)), { pixels: 0, exceeded: [] });
});

test('moveItem reorders without mutating the input', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 2, 1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('moveItem clamps the destination and ignores a bad source', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(list, 0, -5), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 0, 99), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(list, 7, 0), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(list, -1, 0), ['a', 'b', 'c']);
  assert.deepEqual(moveItem([], 0, 1), []);
  assert.notEqual(moveItem(list, 0, 0), list);
});

test('normalizeHexColor accepts the two hex forms and nothing else', () => {
  assert.equal(normalizeHexColor('#ABC'), '#aabbcc');
  assert.equal(normalizeHexColor('abc'), '#aabbcc');
  assert.equal(normalizeHexColor('  #FF0000 '), '#ff0000');
  assert.equal(normalizeHexColor('ff0000'), '#ff0000');
  assert.equal(normalizeHexColor('#ffffff'), '#ffffff');
  assert.equal(normalizeHexColor('red'), null);
  assert.equal(normalizeHexColor('rgb(0,0,0)'), null);
  assert.equal(normalizeHexColor('#12345'), null);
  assert.equal(normalizeHexColor('#1234567'), null);
  assert.equal(normalizeHexColor(''), null);
  assert.equal(normalizeHexColor('#gggggg'), null);
  assert.equal(normalizeHexColor('白色'), null);
  assert.equal(normalizeHexColor('🎨'), null);
});
