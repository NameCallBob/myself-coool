import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MATCHES,
  QueryError,
  QueryTooBig,
  SUPPORTED,
  evaluate,
  formatMatches,
  joinPath,
  parseQuery,
  runQuery,
} from './logic.ts';

const DOC = {
  store: {
    book: [
      { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
      { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
      { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 },
      { category: 'fiction', author: 'J. R. R. Tolkien', title: 'The Lord of the Rings', isbn: '0-395-19395-8', price: 22.99 },
    ],
    bicycle: { color: 'red', price: 19.95 },
  },
};

const values = (path: string, doc: unknown = DOC) => runQuery(doc, parseQuery(path)).map((m) => m.value);
const paths = (path: string, doc: unknown = DOC) => runQuery(doc, parseQuery(path)).map((m) => m.path);

/* The Goessner examples, which every JSONPath implementation is measured on. */

test('the canonical examples give the canonical answers', () => {
  assert.deepEqual(values('$.store.book[*].author'), [
    'Nigel Rees',
    'Evelyn Waugh',
    'Herman Melville',
    'J. R. R. Tolkien',
  ]);
  assert.deepEqual(values('$..author').length, 4);
  assert.deepEqual(values('$.store.bicycle.color'), ['red']);
  assert.deepEqual(values("$..book[2].title"), ['Moby Dick']);
  assert.deepEqual(values('$..book[-1].title'), ['The Lord of the Rings']);
  assert.deepEqual(values('$..book[0,1].title'), ['Sayings of the Century', 'Sword of Honour']);
  assert.deepEqual(values('$..book[:2].title'), ['Sayings of the Century', 'Sword of Honour']);
  assert.deepEqual(values('$..book[?(@.isbn)].title'), ['Moby Dick', 'The Lord of the Rings']);
  assert.deepEqual(values('$..book[?(@.price < 10)].title'), ['Sayings of the Century', 'Moby Dick']);
  assert.equal(values('$..price').length, 5);
  assert.equal(values('$..*').length, 27);
});

test('bracket and dot notation name the same member', () => {
  assert.deepEqual(values("$['store']['bicycle']['price']"), [19.95]);
  assert.deepEqual(values('$.store.bicycle.price'), [19.95]);
  assert.deepEqual(values("$['store','missing'].bicycle.color"), ['red']);
});

test('a missing member yields nothing rather than undefined', () => {
  assert.deepEqual(values('$.store.nope.deeper'), []);
  assert.deepEqual(values('$.store.book[99]'), []);
  assert.deepEqual(values('$.store.book[?(@.price > 1000)]'), []);
});

test('paths are reported in a form that can be pasted back', () => {
  assert.deepEqual(paths('$.store.book[0].title'), ["$['store']['book'][0]['title']"]);
  const doc = { 'content-type': { "it's": 1 } };
  const reported = paths("$['content-type']", doc);
  assert.deepEqual(reported, ["$['content-type']"]);
  assert.deepEqual(values(reported[0], doc), [{ "it's": 1 }]);
  assert.deepEqual(paths("$..[\"it's\"]", doc), ["$['content-type']['it\\'s']"]);
});

test('a leading $ may be left out', () => {
  assert.deepEqual(values('store.bicycle.color'), ['red']);
  assert.deepEqual(values('[0]', [7, 8]), [7]);
});

test('slices handle negatives, steps and reverse order', () => {
  const doc = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(values('$[2:5]', doc), [2, 3, 4]);
  assert.deepEqual(values('$[-3:]', doc), [7, 8, 9]);
  assert.deepEqual(values('$[:3]', doc), [0, 1, 2]);
  assert.deepEqual(values('$[::3]', doc), [0, 3, 6, 9]);
  assert.deepEqual(values('$[::-1]', doc).slice(0, 3), [9, 8, 7]);
  assert.deepEqual(values('$[5:1:-2]', doc), [5, 3]);
  assert.deepEqual(values('$[100:200]', doc), []);
  assert.deepEqual(values('$[:]', doc), doc);
});

test('filters cover comparison, logic, negation and length', () => {
  const doc = { items: [{ n: 1, tag: 'a' }, { n: 5, tag: 'b' }, { n: 5 }, { n: 10, tag: 'a' }] };
  assert.deepEqual(values('$.items[?(@.n == 5)]', doc).length, 2);
  assert.deepEqual(values('$.items[?(@.n >= 5 && @.tag == "b")]', doc), [{ n: 5, tag: 'b' }]);
  assert.deepEqual(values('$.items[?(!@.tag)]', doc), [{ n: 5 }]);
  assert.deepEqual(values('$.items[?(@.n == 1 || @.n == 10)]', doc).map((v) => (v as { n: number }).n), [1, 10]);
  // A missing member is not equal to "a", so it satisfies `!= "a"` (RFC 9535).
  assert.deepEqual(values('$.items[?(@.tag != "a")]', doc).length, 2);
  assert.deepEqual(values('$[?(@.length > 2)]', { a: [1, 2, 3], b: [1] }), [[1, 2, 3]]);
  assert.deepEqual(values('$.items[?@.n > 9]', doc), [{ n: 10, tag: 'a' }]);
});

test('a filter compares against the document root too', () => {
  const doc = { limit: 5, rows: [{ n: 4 }, { n: 6 }] };
  assert.deepEqual(values('$.rows[?(@.n > $.limit)]', doc), [{ n: 6 }]);
});

test('ordering across mismatched types is false, not coerced', () => {
  const doc = [{ v: '2' }, { v: 2 }, { v: null }, { v: true }];
  // '2' > 1 is true in JavaScript. Here a string never orders against a number.
  assert.deepEqual(values('$[?(@.v > 1)]', doc), [{ v: 2 }]);
  assert.deepEqual(values('$[?(@.v == null)]', doc), [{ v: null }]);
  assert.deepEqual(values('$[?(@.v == true)]', doc), [{ v: true }]);
});

test('equality on a missing member is not equality with null', () => {
  const doc = [{ a: null }, { b: 1 }];
  assert.deepEqual(values('$[?(@.a == null)]', doc), [{ a: null }]);
});

test('equality is structural for objects and arrays', () => {
  const doc = { left: { a: 1, b: [1, 2] }, right: { a: 1, b: [1, 2] }, other: { a: 1, b: [1, 3] } };
  assert.deepEqual(values('$[?(@.b == $.left.b)]', doc).length, 2);
  assert.deepEqual(values('$[?(@ == $.left)]', doc).length, 2);
  // Literal arrays and objects are not part of the grammar: such a query must
  // fail to parse rather than silently match nothing.
  assert.throws(() => parseQuery('$[?(@.b == [1,2])]'), QueryError);
});

test('recursive descent finds members at every depth once each', () => {
  const doc = { a: { x: 1, b: { x: 2, c: { x: 3 } } } };
  assert.deepEqual(values('$..x', doc), [1, 2, 3]);
  assert.deepEqual(paths('$..x', doc), ["$['a']['x']", "$['a']['b']['x']", "$['a']['b']['c']['x']"]);
  assert.deepEqual(values('$..[0]', { a: [1, [2, 3]] }), [1, 2]);
});

test('unicode, emoji and CJK keys work in both notations', () => {
  const doc = { '訂單': { '狀態': '已付款', '備註': null }, '🔑': 1 };
  assert.deepEqual(values('$.訂單.狀態', doc), ['已付款']);
  assert.deepEqual(values("$['🔑']", doc), [1]);
  assert.deepEqual(values('$..狀態', doc), ['已付款']);
});

test('wildcards on scalars and empty containers yield nothing', () => {
  assert.deepEqual(values('$[*]', 5), []);
  assert.deepEqual(values('$[*]', {}), []);
  assert.deepEqual(values('$.*', []), []);
  assert.deepEqual(values('$', null), [null]);
});

test('parse errors carry an offset and say what was expected', () => {
  const cases: [string, RegExp][] = [
    ['$.a[', /unclosed/],
    ["$['a", /unclosed quote/],
    ['$.a[1:2:3:4]', /start:end:step/],
    ['$.a[?(@.b = 1)]', /'=='/],
    ['$.a[?(@.b > )]', /expected @/],
    ['$.a[0', /unclosed/],
    ['$.a[x]', /integer/],
    ['$.', /property name/],
    ['$.a[::0]', /step cannot be 0/],
    [']', /starts with/],
    ['$.a)', /unexpected character/],
  ];
  for (const [src, pattern] of cases) {
    try {
      parseQuery(src);
      assert.fail(`expected ${src} to fail`);
    } catch (error) {
      assert.ok(error instanceof QueryError, src);
      assert.match(error.message, pattern, src);
      assert.ok(error.at >= 0 && error.at <= src.length + 2, src);
    }
  }
});

test('a runaway query reports instead of grinding', () => {
  // A wide array under a recursive descent: more matches than the ceiling.
  const doc = { rows: Array.from({ length: MAX_MATCHES + 10 }, (_, i) => ({ i })) };
  assert.throws(() => runQuery(doc, parseQuery('$..*')), QueryTooBig);
});

test('deep nesting does not blow the stack before the ceiling', () => {
  let node: unknown = 1;
  for (let i = 0; i < 2000; i += 1) node = { n: node };
  assert.deepEqual(runQuery(node, parseQuery('$..n')).length, 2000);
});

test('evaluate() turns every failure into a message', () => {
  const ok = evaluate('{"a":[1,2]}', '$.a[*]');
  assert.ok(ok.ok);
  assert.deepEqual(ok.matches.map((m) => m.value), [1, 2]);

  const badJson = evaluate('{a:1}', '$.a');
  assert.equal(badJson.ok, false);

  const badPath = evaluate('{"a":1}', '$.a[');
  assert.equal(badPath.ok, false);
  if (!badPath.ok) assert.equal(typeof badPath.at, 'number');
});

test('formatMatches renders each shape', () => {
  const matches = runQuery(DOC, parseQuery('$..book[:2].title'));
  assert.equal(formatMatches(matches, 'values', 0), '["Sayings of the Century","Sword of Honour"]');
  assert.ok(formatMatches(matches, 'values', 2).startsWith('[\n  "'));
  assert.equal(
    formatMatches(matches, 'paths', 2),
    "$['store']['book'][0]['title']\n$['store']['book'][1]['title']"
  );
  assert.ok(formatMatches(matches, 'entries', 2).includes('\t"Moby Dick"') === false);
  assert.equal(formatMatches([], 'values', 0), '[]');
});

test('joinPath escapes what would break the round trip', () => {
  assert.equal(joinPath('$', 0), '$[0]');
  assert.equal(joinPath('$', "a'b"), "$['a\\'b']");
  assert.equal(joinPath('$', 'a\\b'), "$['a\\\\b']");
});

test('the supported list is not empty and is all strings', () => {
  assert.ok(SUPPORTED.length > 5);
  assert.ok(SUPPORTED.every((line) => typeof line === 'string' && line.length > 0));
});
