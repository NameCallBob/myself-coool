import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  DiffTooBig,
  MAX_CHANGES,
  canonical,
  compare,
  diffJson,
  formatChanges,
  joinPath,
  parseSide,
  summarise,
  typeOf,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULTS, ...patch });
const lines = (a: unknown, b: unknown, patch: Partial<Options> = {}) =>
  formatChanges(diffJson(a, b, options(patch))).split('\n').filter(Boolean);

test('identical documents produce no changes, whatever the key order', () => {
  assert.deepEqual(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
  assert.deepEqual(diffJson([1, [2, { c: null }]], [1, [2, { c: null }]]), []);
  assert.deepEqual(diffJson(null, null), []);
});

test('added and removed members are reported at their own path', () => {
  assert.deepEqual(lines({ a: 1 }, { a: 1, b: 2 }), ['+ $.b = 2']);
  assert.deepEqual(lines({ a: 1, b: 2 }, { a: 1 }), ['- $.b = 2']);
});

test('a changed value and a changed type are different findings', () => {
  assert.deepEqual(lines({ a: 1 }, { a: 2 }), ['~ $.a: 1 -> 2']);
  // The bug that a text diff calls a one-character edit.
  assert.deepEqual(lines({ a: 1 }, { a: '1' }), ['! $.a: number -> string  1 -> "1"']);
  assert.deepEqual(summarise(diffJson({ a: 1 }, { a: '1' })), {
    add: 0,
    remove: 0,
    retype: 1,
    change: 0,
    total: 1,
  });
});

test('null is a type of its own, not an absent member', () => {
  assert.deepEqual(lines({ a: null }, { a: 1 }), ['! $.a: null -> number  null -> 1']);
  assert.deepEqual(lines({ a: null }, {}), ['- $.a = null']);
  assert.deepEqual(lines({ a: null }, {}, { nullIsAbsent: true }), []);
  assert.deepEqual(lines({}, { a: null }, { nullIsAbsent: true }), []);
  assert.deepEqual(lines({ a: null }, { a: 1 }, { nullIsAbsent: true }).length, 1);
});

test('nested paths read the way the document is searched', () => {
  const left = { orders: [{ id: 'A', total: 100 }] };
  const right = { orders: [{ id: 'A', total: 120 }] };
  assert.deepEqual(lines(left, right), ['~ $.orders[0].total: 100 -> 120']);
  assert.equal(joinPath('$', 'a-b'), "$['a-b']");
  assert.equal(joinPath('$', 'ok_1'), '$.ok_1');
  assert.equal(joinPath('$', 3), '$[3]');
  assert.equal(joinPath('$', "it's"), "$['it\\'s']");
});

test('index mode compares element by element and reports the tail', () => {
  assert.deepEqual(lines([1, 2, 3], [1, 9, 3]), ['~ $[1]: 2 -> 9']);
  assert.deepEqual(lines([1, 2], [1, 2, 3]), ['+ $[2] = 3']);
  assert.deepEqual(lines([1, 2, 3], [1, 2]), ['- $[2] = 3']);
  // An element inserted at the front makes index mode report everything after
  // it. That is the honest answer for position-based comparison.
  assert.equal(lines([1, 2, 3], [0, 1, 2, 3]).length, 4);
});

test('key mode pairs records by their id wherever they moved to', () => {
  const left = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];
  const right = [
    { id: 3, name: 'c' },
    { id: 2, name: 'B' },
    { id: 4, name: 'd' },
  ];
  const out = lines(left, right, { arrayMode: 'key' });
  assert.deepEqual(out.sort(), ['+ $[2] = {"id":4,"name":"d"}', '- $[0] = {"id":1,"name":"a"}', '~ $[1].name: "b" -> "B"'].sort());
});

test('key mode falls back to position for elements without the key', () => {
  const left = [{ id: 1, v: 1 }, { v: 2 }];
  const right = [{ v: 3 }, { id: 1, v: 1 }];
  assert.deepEqual(lines(left, right, { arrayMode: 'key' }), ['~ $[0].v: 2 -> 3']);
});

test('key mode handles duplicate keys one for one', () => {
  const left = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];
  const right = [{ id: 1, v: 'a' }, { id: 1, v: 'c' }];
  assert.deepEqual(lines(left, right, { arrayMode: 'key' }), ['~ $[1].v: "b" -> "c"']);
});

test('bag mode ignores order and reports only what appeared or vanished', () => {
  assert.deepEqual(lines([1, 2, 3], [3, 2, 1], { arrayMode: 'bag' }), []);
  assert.deepEqual(lines([{ a: 1 }], [{ a: 1 }], { arrayMode: 'bag' }), []);
  assert.deepEqual(lines([1, 1, 2], [1, 2], { arrayMode: 'bag' }), ['- $ = 1']);
  assert.deepEqual(lines([1, 2], [1, 2, 2], { arrayMode: 'bag' }), ['+ $ = 2']);
  // Object member order must not make two equal elements look different.
  assert.deepEqual(lines([{ a: 1, b: 2 }], [{ b: 2, a: 1 }], { arrayMode: 'bag' }), []);
});

test('canonical form sorts members recursively', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.equal(canonical(null), 'null');
  assert.equal(canonical('x'), '"x"');
});

test('a numeric tolerance suppresses float noise but not real change', () => {
  assert.deepEqual(lines({ a: 0.1 + 0.2 }, { a: 0.3 }), ['~ $.a: 0.30000000000000004 -> 0.3']);
  assert.deepEqual(lines({ a: 0.1 + 0.2 }, { a: 0.3 }, { tolerance: 1e-9 }), []);
  assert.deepEqual(lines({ a: 1 }, { a: 1.5 }, { tolerance: 0.1 }).length, 1);
  assert.deepEqual(lines({ a: -0 }, { a: 0 }), []);
});

test('strings compare exactly, including CRLF, emoji and CJK', () => {
  assert.deepEqual(lines({ a: 'x\r\ny' }, { a: 'x\ny' }).length, 1);
  assert.deepEqual(lines({ '訂單': '已付款' }, { '訂單': '已付款' }), []);
  assert.deepEqual(lines({ a: '🙂' }, { a: '🙃' }).length, 1);
  assert.deepEqual(lines({ '鍵': 1 }, { '鍵': 2 }), ["~ $['鍵']: 1 -> 2"]);
});

test('typeOf names every JSON type and rejects everything else', () => {
  assert.equal(typeOf(null), 'null');
  assert.equal(typeOf([]), 'array');
  assert.equal(typeOf({}), 'object');
  assert.equal(typeOf(1), 'number');
  assert.equal(typeOf('a'), 'string');
  assert.equal(typeOf(true), 'boolean');
  assert.throws(() => typeOf(undefined), TypeError);
  assert.throws(() => typeOf(() => 1), TypeError);
});

test('long values are truncated in the report, not in the data', () => {
  const long = 'x'.repeat(500);
  const out = lines({ a: long }, { a: `${long}y` });
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('...'));
  assert.ok(out[0].length < 400);
});

test('too many differences reports instead of filling memory', () => {
  const left = Object.fromEntries(Array.from({ length: MAX_CHANGES + 10 }, (_, i) => [`k${i}`, i]));
  assert.throws(() => diffJson(left, {}), DiffTooBig);
});

test('nesting past the ceiling reports instead of overflowing the stack', () => {
  let left: unknown = 1;
  let right: unknown = 2;
  for (let i = 0; i < 400; i += 1) {
    left = { n: left };
    right = { n: right };
  }
  assert.throws(() => diffJson(left, right), DiffTooBig);
});

test('parseSide reports which side failed', () => {
  assert.deepEqual(parseSide('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.equal(parseSide('').ok, false);
  assert.equal(parseSide('{a:1}').ok, false);
});

test('compare() reports the failing side by name', () => {
  const both = compare('', '');
  assert.equal(both.ok, false);
  if (!both.ok) assert.equal(both.side, 'both');
  const right = compare('{"a":1}', '{oops');
  assert.equal(right.ok, false);
  if (!right.ok) assert.equal(right.side, 'right');
  const left = compare('{oops', '{"a":1}');
  if (!left.ok) assert.equal(left.side, 'left');
  const ok = compare('{"a":1}', '{"a":2}');
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.summary.change, 1);
});

test('formatChanges on an empty diff is an empty string', () => {
  assert.equal(formatChanges([]), '');
});
