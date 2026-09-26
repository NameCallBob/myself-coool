import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastestOf, scaledWithin } from '../../lib/tools/bench-timing.ts';
import { findDuplicateKeys, findError, locate, parseJson, render, sortDeep, toLines } from './logic.ts';

test('valid JSON reports structure, not just success', () => {
  const outcome = parseJson('{"b":1,"a":[1,2,{"c":null}]}');
  assert.ok(outcome.ok);
  assert.equal(outcome.stats.keys, 3);
  assert.equal(outcome.stats.objects, 2);
  assert.equal(outcome.stats.arrays, 1);
  assert.equal(outcome.stats.nulls, 1);
  assert.equal(outcome.stats.depth, 3);
  assert.equal(outcome.stats.bytes, 28);
});

test('scalars and empty containers are valid documents', () => {
  for (const text of ['1', '"a"', 'true', 'null', '[]', '{}']) {
    assert.ok(parseJson(text).ok, text);
  }
  assert.equal(parseJson('  ').ok, false);
});

test('a syntax error is pinned to a line and column', () => {
  const outcome = parseJson('{\n  "a": 1,\n  "b": ,\n}');
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.line, 3);
  assert.ok(outcome.error.excerpt?.includes('"b"'));
});

test('the scanner names what it wanted, wherever the engine gave up', () => {
  const cases: [string, RegExp][] = [
    ['{', /property name|'}'/],
    ['[1,]', /trailing comma/],
    ['{"a":1,}', /trailing comma/],
    ['{a:1}', /quoted property name/],
    ['{"a" 1}', /':'/],
    ['[1 2]', /','/],
    ['"unterminated', /closing quote/],
    ['{"a":"\u00e9\\q"}', /escape character/],
    ['{"a":"\\u12"}', /hex digits/],
    ['01', /end of document/],
    ['{}{}', /end of document/],
    ['', /a value/],
    ['-', /a number/],
  ];
  for (const [text, pattern] of cases) {
    const found = findError(text);
    assert.ok(found, `expected ${JSON.stringify(text)} to fail`);
    assert.match(`expected ${found.expected}`, pattern, JSON.stringify(text));
  }
});

test('the scanner accepts everything JSON.parse accepts', () => {
  const valid = [
    '{"a":[1,2,{"b":null}]}',
    '[]',
    '{}',
    '  {"a" : 1 }  ',
    '"\\u00e9 \\n \\\\"',
    '-0.5e+10',
    '[true,false,null]',
    '{"nested":{"deep":{"deeper":[[[]]]}}}',
  ];
  for (const text of valid) {
    assert.doesNotThrow(() => JSON.parse(text), text);
    assert.equal(findError(text.trim()), null, text);
  }
});

test('a raw control character inside a string is named as such', () => {
  const found = findError('{"a":"line\nbreak"}');
  assert.ok(found);
  assert.match(found.expected, /control character/);
});

test('locate() handles the first line, the last line and out-of-range', () => {
  const text = 'abc\ndefg\nhi';
  assert.deepEqual(locate(text, 0), { line: 1, column: 1, excerpt: 'abc' });
  assert.deepEqual(locate(text, 5), { line: 2, column: 2, excerpt: 'defg' });
  assert.equal(locate(text, 999).line, 3);
  assert.equal(locate(text, -5).line, 1);
});

test('sortDeep orders keys and leaves arrays alone', () => {
  const sorted = sortDeep({ b: 1, a: { d: 2, c: 3 }, list: [3, 1, 2] });
  assert.equal(JSON.stringify(sorted), '{"a":{"c":3,"d":2},"b":1,"list":[3,1,2]}');
});

test('render honours each indent setting', () => {
  const value = { a: [1] };
  assert.equal(render(value, 'min'), '{"a":[1]}');
  assert.equal(render(value, '2'), '{\n  "a": [\n    1\n  ]\n}');
  assert.ok(render(value, 'tab').includes('\t"a"'));
});

test('toLines emits one row per array element', () => {
  assert.equal(toLines([{ a: 1 }, { a: 2 }]), '{"a":1}\n{"a":2}');
  assert.equal(toLines({ a: 1 }), '{"a":1}');
});

/* ── Regressions found while writing the "how it works" note ─── */

test('[15] the reported line counts the text as pasted, not a trimmed copy', () => {
  const outcome = parseJson('\n\n\n{\n  "a": ,\n}');
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.line, 5);
  assert.equal(outcome.error.column, 8);
  assert.equal(outcome.error.excerpt, '  "a": ,');
});

test('[15] leading whitespace does not shift the column either', () => {
  const outcome = parseJson('   {"a" 1}');
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error.line, 1);
  assert.equal(outcome.error.column, 9);
  assert.equal(outcome.error.excerpt, '   {"a" 1}');
});

test('[16] keys sort by code unit, the order C02 (data-convert) also uses', () => {
  const sorted = sortDeep({ b: 1, B: 2, a: 3, A: 4, _z: 5, Z: 6 });
  const plain = Object.keys({ b: 1, B: 2, a: 3, A: 4, _z: 5, Z: 6 }).sort();
  assert.deepEqual(Object.keys(sorted as object), plain);
  assert.deepEqual(plain, ['A', 'B', 'Z', '_z', 'a', 'b']);
});

test('[17] a duplicate key is reported rather than silently dropped', () => {
  const outcome = parseJson('{\n  "id": 1,\n  "name": "a",\n  "id": 2\n}');
  assert.ok(outcome.ok);
  assert.equal(outcome.duplicates.length, 1);
  assert.equal(outcome.duplicates[0].key, 'id');
  assert.equal(outcome.duplicates[0].path, '$');
  assert.equal(outcome.duplicates[0].line, 4);
  assert.equal(outcome.duplicates[0].column, 3);
  // JSON.parse kept the last one, which is exactly why this has to be said.
  assert.deepEqual(outcome.value, { id: 2, name: 'a' });
});

test('[17] duplicates are found at every depth and through escapes', () => {
  assert.deepEqual(
    findDuplicateKeys('{"a":{"x":1,"x":2}}').map((d) => `${d.path}.${d.key}`),
    ['$.a.x']
  );
  assert.deepEqual(
    findDuplicateKeys('{"rows":[{"k":1},{"k":1,"k":2}]}').map((d) => d.path),
    ['$.rows[1]']
  );
  // Two spellings of the same key collide for JSON.parse, so they collide here.
  assert.equal(findDuplicateKeys('{"a":1,"\\u0061":2}').length, 1);
  assert.deepEqual(findDuplicateKeys('{"a":1,"b":{"a":2}}'), []);
  assert.deepEqual(findDuplicateKeys('[1,2,3]'), []);
  assert.deepEqual(parseJson('{"a":1}').ok ? [] : ['unexpected'], []);
});

test('[18] a deep document with a real syntax error is not blamed on its depth', () => {
  const text = `${'['.repeat(600)}${']'.repeat(600)}x`;
  const outcome = parseJson(text);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(/nesting under/.test(outcome.error.message), false);
  assert.match(outcome.error.message, /512/);
  assert.equal(outcome.error.line, undefined);
  const found = findError(text);
  assert.ok(found);
  assert.equal(found.depth, true);
});

test('[18] diagnosing a document full of numbers stays linear', () => {
  const build = (n: number) => `[${Array.from({ length: n }, (_, i) => String(i * 1234567)).join(',')},]`;
  const small = build(40_000);
  const large = build(160_000);
  // Fastest-of-N rather than a single run: timer noise only ever adds time,
  // so the quickest run is the honest estimate and the one that survives a
  // busy machine. Four times the input must not mean sixteen times the work.
  const quick = fastestOf(() => void findError(small));
  const slow = fastestOf(() => void findError(large));
  const scaling = scaledWithin(quick, slow, 8);
  assert.ok(scaling.ok, `four times the input should not cost sixteen times — ${scaling.detail}`);
});
