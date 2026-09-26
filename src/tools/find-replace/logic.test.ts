import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadPattern,
  DEFAULT_FLAGS,
  InputTooLarge,
  MAX_INPUT,
  MAX_MATCHES,
  WORKER_BODY,
  buildPattern,
  compile,
  escapeLiteral,
  expandEscapes,
  findMatches,
  flagString,
  run,
  segments,
  type Flags,
} from './logic.ts';

const flags = (patch: Partial<Flags> = {}): Flags => ({ ...DEFAULT_FLAGS, ...patch });

test('literal escaping neutralises every metacharacter', () => {
  assert.equal(escapeLiteral('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'), 'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
  assert.equal(escapeLiteral(''), '');
  // The escaped form matches the literal text and nothing else.
  assert.equal(new RegExp(escapeLiteral('a.c')).test('abc'), false);
  assert.equal(new RegExp(escapeLiteral('a.c')).test('a.c'), true);
});

test('literal mode finds text that looks like a pattern', () => {
  const re = compile('c:\\temp (v1.0)', 'literal', flags());
  const outcome = run('path c:\\temp (v1.0) here', re, 'X');
  assert.equal(outcome.count, 1);
  assert.equal(outcome.text, 'path X here');
});

test('escape expansion turns typed escapes into characters', () => {
  assert.equal(expandEscapes('a\\nb'), 'a\nb');
  assert.equal(expandEscapes('a\\tb'), 'a\tb');
  assert.equal(expandEscapes('a\\\\nb'), 'a\\nb'); // \\ stays one backslash, n stays n
  assert.equal(expandEscapes('\\u0041'), 'A');
  assert.equal(expandEscapes('\\u{1F600}'), '\u{1F600}');
  assert.equal(expandEscapes('\\x41'), 'A');
  assert.equal(expandEscapes('\\q'), '\\q'); // unknown escape is left alone
  assert.equal(expandEscapes(''), '');
});

test('flag strings are assembled in a stable order', () => {
  assert.equal(flagString(flags()), 'gm');
  assert.equal(flagString(flags({ ignoreCase: true, dotAll: true, unicode: true })), 'gimsu');
  assert.equal(flagString(flags({ global: false, multiline: false })), '');
});

test('whole-word wrapping wraps the pattern, not each alternative', () => {
  const built = buildPattern('cat|dog', 'regex', flags({ wholeWord: true }));
  assert.equal(built.source, '\\b(?:cat|dog)\\b');
  const re = new RegExp(built.source, built.flags);
  assert.equal(findMatches('cat category dog', re).count, 2);
});

test('a broken pattern throws BadPattern with the engine message', () => {
  assert.throws(() => compile('(unclosed', 'regex', flags()), BadPattern);
  try {
    compile('a{2,1}', 'regex', flags());
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof BadPattern);
    assert.ok(error.detail.length > 0);
  }
  // The same text in literal mode is fine, because it is escaped first.
  assert.equal(run('(unclosed', compile('(unclosed', 'literal', flags()), 'x').count, 1);
});

test('capture groups and named groups expand the way JavaScript expands them', () => {
  const re = compile('(\\w+)@(\\w+)', 'regex', flags());
  assert.equal(run('a@b c@d', re, '$2:$1').text, 'b:a d:c');
  assert.equal(run('a@b', re, '$&!').text, 'a@b!');
  assert.equal(run('a@b', re, '$$1').text, '$1');

  const named = compile('(?<user>\\w+)@(?<host>\\w+)', 'regex', flags());
  const outcome = run('ann@example', named, '$<host>/$<user>');
  assert.equal(outcome.text, 'example/ann');
  assert.deepEqual(outcome.groups, ['ann', 'example']);
  assert.deepEqual(outcome.named, { user: 'ann', host: 'example' });
});

test('global off replaces only the first match', () => {
  const re = compile('a', 'literal', flags({ global: false }));
  const outcome = run('aaa', re, 'b');
  assert.equal(outcome.text, 'baa');
  assert.equal(outcome.count, 1);
});

test('an empty match does not loop forever', () => {
  const re = compile('a*', 'regex', flags());
  const outcome = run('bab', re, '-');
  // Four matches: empty at 0, "a" at 1, empty at 2, empty at 3 — the same
  // four String.replace produces, which is the point of counting this way.
  assert.equal(outcome.count, 4);
  assert.equal(outcome.text, '-b--b-');
});

test('an empty match next to an astral character steps over the whole pair', () => {
  const re = compile('x*', 'regex', flags({ unicode: true }));
  const outcome = findMatches('\u{1F600}\u{1F600}', re);
  assert.equal(outcome.count, 3); // before, between, after — not five
});

test('multiline and dotAll change what ^ $ and . mean', () => {
  assert.equal(findMatches('a\nb', compile('^b$', 'regex', flags({ multiline: true }))).count, 1);
  assert.equal(findMatches('a\nb', compile('^b$', 'regex', flags({ multiline: false }))).count, 0);
  assert.equal(findMatches('a\nb', compile('a.b', 'regex', flags({ dotAll: true }))).count, 1);
  assert.equal(findMatches('a\nb', compile('a.b', 'regex', flags({ dotAll: false }))).count, 0);
});

test('ignoreCase folds case for both modes', () => {
  assert.equal(findMatches('Apple apple', compile('apple', 'literal', flags({ ignoreCase: true }))).count, 2);
  assert.equal(findMatches('Apple apple', compile('apple', 'literal', flags())).count, 1);
});

test('CJK, emoji and CRLF survive replacement untouched', () => {
  const re = compile('貓', 'literal', flags());
  assert.equal(run('我的貓\r\n你的貓', re, '狗').text, '我的狗\r\n你的狗');
  const emoji = compile('\u{1F600}', 'literal', flags({ unicode: true }));
  assert.equal(run('a\u{1F600}b', emoji, '!').text, 'a!b');
});

test('match counting stops at the safety limit and says so', () => {
  const text = 'a'.repeat(MAX_MATCHES + 10);
  const outcome = findMatches(text, compile('a', 'literal', flags()));
  assert.equal(outcome.truncated, true);
  assert.equal(outcome.count, MAX_MATCHES);
  assert.equal(findMatches('aaa', compile('a', 'literal', flags())).truncated, false);
});

test('preview spans are capped while the count is not', () => {
  const outcome = findMatches('a'.repeat(1000), compile('a', 'literal', flags()), 10);
  assert.equal(outcome.count, 1000);
  assert.equal(outcome.spans.length, 10);
  assert.deepEqual(outcome.spans[0], { at: 0, length: 1 });
});

test('oversized input is refused rather than attempted', () => {
  const re = compile('a', 'literal', flags());
  assert.throws(() => run('a'.repeat(MAX_INPUT + 1), re, 'b'), InputTooLarge);
  try {
    run('a'.repeat(MAX_INPUT + 1), re, 'b');
  } catch (error) {
    assert.ok(error instanceof InputTooLarge);
    assert.equal(error.length, MAX_INPUT + 1);
  }
});

test('segments rebuild the original text exactly', () => {
  const text = 'the cat sat on the mat';
  const found = findMatches(text, compile('at', 'literal', flags()));
  const parts = segments(text, found.spans);
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.equal(parts.filter((part) => part.hit).length, 3);

  assert.deepEqual(segments('abc', []), [{ text: 'abc', hit: false }]);
  assert.deepEqual(segments('', []), []);
  // Zero-length spans mark nothing but must not duplicate text either.
  assert.equal(segments('abc', [{ at: 1, length: 0 }]).map((part) => part.text).join(''), 'abc');
});

test('nothing found leaves the text alone', () => {
  const outcome = run('hello', compile('zzz', 'literal', flags()), 'x');
  assert.equal(outcome.count, 0);
  assert.equal(outcome.text, 'hello');
  assert.deepEqual(outcome.spans, []);
});

test('the worker script carries the same contract as the module', () => {
  // It cannot be imported, so at least assert every field it must read and
  // return is mentioned — a renamed field would otherwise fail only at runtime.
  for (const field of ['source', 'flags', 'text', 'replacement', 'preview', 'limit', 'spans', 'truncated', 'groups', 'named', 'count']) {
    assert.ok(WORKER_BODY.includes(field), field);
  }
  assert.ok(WORKER_BODY.includes('onmessage'));
  assert.ok(WORKER_BODY.includes('postMessage'));
  // No eval-shaped construct: the pattern is compiled, the text is not.
  assert.ok(!WORKER_BODY.includes('eval('));
  assert.ok(!WORKER_BODY.includes('Function('));
});
