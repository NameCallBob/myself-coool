import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findError, locate, parseJson, render, sortDeep, toLines } from './logic.ts';

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
