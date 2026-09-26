import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import {
  FLAG_KEYS,
  MATCH_LIMIT,
  WORKER_BODY,
  checkPattern,
  collectMatches,
  lineColumn,
  replaceWith,
  riskNotes,
  toSegments,
} from './logic.ts';

test('a global scan finds every match with its offset', () => {
  const outcome = collectMatches('\\d+', 'g', 'a1 bb 234 c5', MATCH_LIMIT);
  assert.deepEqual(
    outcome.hits.map((hit) => [hit.index, hit.text]),
    [
      [1, '1'],
      [6, '234'],
      [11, '5'],
    ]
  );
  assert.equal(outcome.truncated, false);
  assert.equal(outcome.groupCount, 0);
});

test('without g only the first match is reported', () => {
  const outcome = collectMatches('\\d+', '', 'a1 b2', MATCH_LIMIT);
  assert.equal(outcome.hits.length, 1);
  assert.equal(outcome.hits[0].text, '1');
});

test('numbered and named groups come back separately', () => {
  const outcome = collectMatches(
    '(?<year>\\d{4})-(\\d{2})',
    'g',
    'due 2024-05 and 1999-12',
    MATCH_LIMIT
  );
  assert.equal(outcome.groupCount, 2);
  assert.deepEqual(outcome.names, ['year']);
  assert.deepEqual(outcome.hits[0].groups, ['2024', '05']);
  assert.deepEqual(outcome.hits[0].named, [{ name: 'year', value: '2024' }]);
  assert.deepEqual(outcome.hits[1].groups, ['1999', '12']);
});

test('a group that did not take part reads as null, not empty string', () => {
  const outcome = collectMatches('(a)|(b)', 'g', 'b', MATCH_LIMIT);
  assert.deepEqual(outcome.hits[0].groups, [null, 'b']);
});

test('group count is right even when the pattern cannot match', () => {
  // The probe trick has to survive a pattern that never matches the subject.
  const outcome = collectMatches('(x)(y)(?<z>w)', 'g', 'nothing here', MATCH_LIMIT);
  assert.equal(outcome.hits.length, 0);
  assert.equal(outcome.groupCount, 3);
  assert.deepEqual(outcome.names, ['z']);
});

test('a zero-length pattern terminates and lands between characters', () => {
  const outcome = collectMatches('', 'g', 'abc', MATCH_LIMIT);
  assert.deepEqual(
    outcome.hits.map((hit) => hit.index),
    [0, 1, 2, 3]
  );
  assert.ok(outcome.hits.every((hit) => hit.length === 0));
});

test('a zero-length unicode pattern steps over whole code points', () => {
  // '👍' is two code units. Advancing by one would leave lastIndex inside the
  // surrogate pair, where a /u/ pattern cannot start a match.
  const outcome = collectMatches('(?:)', 'gu', 'a👍b', MATCH_LIMIT);
  assert.deepEqual(
    outcome.hits.map((hit) => hit.index),
    [0, 1, 3, 4]
  );
});

test('word-boundary scanning over Chinese behaves as the engine defines it', () => {
  const outcome = collectMatches('[\\u4e00-\\u9fff]+', 'gu', '前面 中文字 後面', MATCH_LIMIT);
  assert.deepEqual(
    outcome.hits.map((hit) => hit.text),
    ['前面', '中文字', '後面']
  );
});

test('the match limit truncates instead of listing everything', () => {
  const outcome = collectMatches('a', 'g', 'a'.repeat(50), 10);
  assert.equal(outcome.hits.length, 10);
  assert.equal(outcome.truncated, true);
});

test('hitting the limit exactly at the end is not reported as truncated', () => {
  const outcome = collectMatches('a', 'g', 'aaa', 3);
  assert.equal(outcome.hits.length, 3);
  assert.equal(outcome.truncated, false);
});

test('the sticky flag only matches at the start', () => {
  assert.equal(collectMatches('b', 'y', 'abc', MATCH_LIMIT).hits.length, 0);
  assert.equal(collectMatches('a', 'y', 'aab', MATCH_LIMIT).hits.length, 2);
});

test('empty subject with an anchored pattern still matches once', () => {
  const outcome = collectMatches('^$', 'g', '', MATCH_LIMIT);
  assert.equal(outcome.hits.length, 1);
  assert.equal(outcome.hits[0].index, 0);
});

test('replacement honours the platform substitution syntax', () => {
  assert.equal(replaceWith('(\\w+)@(\\w+)', 'g', 'a@b c@d', '$2:$1'), 'b:a d:c');
  assert.equal(replaceWith('o', 'g', 'foo', '0'), 'f00');
  assert.equal(replaceWith('o', '', 'foo', '0'), 'f0o');
  assert.equal(replaceWith('(?<n>\\d+)', 'g', 'x12', '[$<n>]'), 'x[12]');
  assert.equal(replaceWith('b', 'g', 'abc', '$&$&'), 'abbc');
  assert.equal(replaceWith('b', 'g', 'abc', '$$'), 'a$c');
});

test('replacement leaves a non-matching subject untouched', () => {
  assert.equal(replaceWith('z', 'g', '中文 abc', '!'), '中文 abc');
});

test('an invalid pattern is reported rather than thrown at the caller', () => {
  assert.equal(checkPattern('a+', 'g'), null);
  assert.ok(checkPattern('(', 'g'));
  assert.ok(checkPattern('a', 'uv'));
  assert.ok(checkPattern('a', 'q'));
});

test('flag keys cover the whole set the spec defines', () => {
  assert.deepEqual([...FLAG_KEYS].sort(), ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
});

test('risky shapes are named, ordinary ones are not', () => {
  assert.deepEqual(riskNotes('(a+)+'), ['nested-quantifier']);
  assert.deepEqual(riskNotes('(a*)*'), ['nested-quantifier']);
  assert.deepEqual(riskNotes('(a{2,}){3,}'), ['nested-quantifier']);
  assert.deepEqual(riskNotes('(a|a)*'), ['quantified-alternation']);
  assert.deepEqual(riskNotes('(a+|b)+').sort(), ['nested-quantifier', 'quantified-alternation']);
  assert.deepEqual(riskNotes('^\\d{4}-\\d{2}-\\d{2}$'), []);
  assert.deepEqual(riskNotes('(\\w+)@(\\w+)\\.\\w{2,}'), []);
});

test('risk scanning is not fooled by escapes, classes or literal braces', () => {
  // The `+` is escaped, so the group holds no repetition at all.
  assert.deepEqual(riskNotes('(a\\+)+'), []);
  // Inside a class, `+` and `|` are ordinary characters.
  assert.deepEqual(riskNotes('([a+|])+'), []);
  // `{` with no digit after it is a literal brace, not a quantifier.
  assert.deepEqual(riskNotes('(a{x})+'), []);
  assert.deepEqual(riskNotes('(?:(a+)+)'), ['nested-quantifier']);
});

test('a repeated group counts as a repetition for the group around it', () => {
  assert.deepEqual(riskNotes('((a)+)+'), ['nested-quantifier']);
});

test('segments reconstruct the subject exactly', () => {
  const input = 'a1 bb 234';
  const outcome = collectMatches('\\d+', 'g', input, MATCH_LIMIT);
  const segments = toSegments(input, outcome.hits);
  assert.equal(segments.map((segment) => segment.text).join(''), input);
  assert.deepEqual(
    segments.filter((segment) => segment.hit !== null).map((segment) => segment.text),
    ['1', '234']
  );
});

test('segments skip zero-length hits and still reconstruct', () => {
  const input = 'abc';
  const outcome = collectMatches('', 'g', input, MATCH_LIMIT);
  const segments = toSegments(input, outcome.hits);
  assert.equal(segments.map((segment) => segment.text).join(''), input);
  assert.deepEqual(segments, [{ text: 'abc', hit: null }]);
});

test('segments of an empty subject are empty', () => {
  assert.deepEqual(toSegments('', []), []);
});

test('a match at offset zero produces no leading blank segment', () => {
  const segments = toSegments('abc', [
    { index: 0, length: 1, text: 'a', groups: [], named: [] },
  ]);
  assert.deepEqual(segments, [
    { text: 'a', hit: 0 },
    { text: 'bc', hit: null },
  ]);
});

test('line and column are 1-based and reset at each newline', () => {
  const input = 'one\ntwo\r\nthree';
  assert.deepEqual(lineColumn(input, 0), { line: 1, column: 1 });
  assert.deepEqual(lineColumn(input, 4), { line: 2, column: 1 });
  assert.deepEqual(lineColumn(input, 9), { line: 3, column: 1 });
  assert.deepEqual(lineColumn(input, 999), { line: 3, column: 6 });
  assert.deepEqual(lineColumn(input, -5), { line: 1, column: 1 });
});

test('the worker body is valid JavaScript carrying both implementations', () => {
  // Compiling is not running: this checks the serialised source parses, which
  // is the failure mode that would otherwise only show up in the browser.
  assert.doesNotThrow(() => new Script(WORKER_BODY, { filename: 'regex-worker.js' }));
  assert.ok(WORKER_BODY.includes('self.onmessage'));
  assert.ok(WORKER_BODY.includes('lastIndex'));
  assert.ok(WORKER_BODY.includes('input.replace'));
});
