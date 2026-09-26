import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EMIT,
  MAX_LINES,
  convert,
  emit,
  factsFor,
  needsEnvQuotes,
  needsYamlQuotes,
  parseAny,
  parseDotenv,
  parseJsonEnv,
  parseYamlEnv,
  shellQuote,
  type Entry,
} from './logic.ts';

const pairs = (text: string) => parseDotenv(text).entries.map((e) => [e.key, e.value]);

test('plain assignments read as written', () => {
  assert.deepEqual(pairs('A=1\nB=two\n'), [['A', '1'], ['B', 'two']]);
  assert.deepEqual(pairs('A='), [['A', '']]);
  assert.deepEqual(pairs('  A = 1  '), [['A', '1']]);
  assert.deepEqual(pairs('export A=1'), [['A', '1']]);
});

test('comments and blank lines are skipped, inline comments need a space', () => {
  assert.deepEqual(pairs('# note\n\nA=1 # trailing\nB=2#notacomment'), [['A', '1'], ['B', '2#notacomment']]);
  assert.deepEqual(pairs('URL=http://x/#frag'), [['URL', 'http://x/#frag']]);
});

test('single quotes are literal, double quotes interpret escapes', () => {
  assert.deepEqual(pairs("A='no \\n escape and $HOME'"), [['A', 'no \\n escape and $HOME']]);
  assert.deepEqual(pairs('A="line\\nbreak"'), [['A', 'line\nbreak']]);
  assert.deepEqual(pairs('A="tab\\there"'), [['A', 'tab\there']]);
  assert.deepEqual(pairs('A="quote\\"in"'), [['A', 'quote"in']]);
  assert.deepEqual(pairs('A="dollar\\$sign"'), [['A', 'dollar$sign']]);
  assert.deepEqual(pairs('A="C:\\\\path"'), [['A', 'C:\\path']]);
  // An unknown escape keeps both characters rather than guessing.
  assert.deepEqual(pairs('A="keep\\qthis"'), [['A', 'keep\\qthis']]);
});

test('a quoted value may span lines, and an unquoted one may not', () => {
  const pem = 'KEY="-----BEGIN-----\nline2\n-----END-----"\nNEXT=1';
  assert.deepEqual(parseDotenv(pem).entries[0].value, '-----BEGIN-----\nline2\n-----END-----');
  assert.deepEqual(parseDotenv(pem).entries[1], { key: 'NEXT', value: '1', quoted: 'none' });
  const literal = "K='a\nb'";
  assert.equal(parseDotenv(literal).entries[0].value, 'a\nb');
  // Unquoted stops at the newline; the next line is its own statement.
  assert.deepEqual(pairs('A=one\nB=two'), [['A', 'one'], ['B', 'two']]);
});

test('CRLF input parses the same as LF', () => {
  assert.deepEqual(pairs('A=1\r\nB=2\r\n'), [['A', '1'], ['B', '2']]);
  assert.equal(parseDotenv('A="x\r\ny"').entries[0].value, 'x\ny');
});

test('problems are reported rather than guessed around', () => {
  assert.match(parseDotenv('JUST_A_NAME').problems[0].message, /no '='/);
  assert.match(parseDotenv('9BAD=1').problems[0].message, /not a usable variable name/);
  assert.match(parseDotenv('A="unclosed').problems[0].message, /unclosed double quote/);
  assert.match(parseDotenv("A='unclosed").problems[0].message, /unclosed single quote/);
  const dup = parseDotenv('A=1\nA=2');
  assert.match(dup.problems[0].message, /already set on line 1/);
  assert.deepEqual(dup.entries.map((e) => e.value), ['2']);
  const dotted = parseDotenv('my.key=1');
  assert.match(dotted.problems[0].message, /shell cannot export/);
  assert.deepEqual(dotted.entries.map((e) => e.key), ['my.key']);
});

test('unicode, emoji and CJK values survive intact', () => {
  assert.deepEqual(pairs('NAME=陳小美\nICON=🔑'), [['NAME', '陳小美'], ['ICON', '🔑']]);
  assert.deepEqual(pairs('NOTE="中文 有空白"'), [['NOTE', '中文 有空白']]);
});

test('a huge file reports instead of being parsed', () => {
  const text = Array.from({ length: MAX_LINES + 2 }, (_, i) => `K${i}=1`).join('\n');
  const out = parseDotenv(text);
  assert.deepEqual(out.entries, []);
  assert.match(out.problems[0].message, /more than/);
});

test('JSON input flattens scalars and keeps nested values as text', () => {
  const out = parseJsonEnv('{"A":1,"B":true,"C":null,"D":{"x":1}}');
  assert.deepEqual(out.entries.map((e) => [e.key, e.value]), [
    ['A', '1'],
    ['B', 'true'],
    ['C', ''],
    ['D', '{"x":1}'],
  ]);
  assert.match(out.problems[0].message, /not a scalar/);
  assert.equal(parseJsonEnv('[1]').problems.length, 1);
  assert.equal(parseJsonEnv('{oops').problems.length, 1);
});

test('YAML input reads both compose styles', () => {
  const map = 'environment:\n  A: 1\n  B: "two words"\n  C: \'lit\'\n';
  assert.deepEqual(parseYamlEnv(map).entries.map((e) => [e.key, e.value]), [
    ['A', '1'],
    ['B', 'two words'],
    ['C', 'lit'],
  ]);
  const list = 'environment:\n  - A=1\n  - B=two words\n  - PASSED_THROUGH\n';
  assert.deepEqual(parseYamlEnv(list).entries.map((e) => [e.key, e.value]), [
    ['A', '1'],
    ['B', 'two words'],
    ['PASSED_THROUGH', ''],
  ]);
  assert.match(parseYamlEnv('A: |\n  text').problems[0].message, /block scalars/);
  assert.match(parseYamlEnv('nonsense').problems[0].message, /expected/);
});

test('parseAny dispatches on the chosen input format', () => {
  assert.equal(parseAny('A=1', 'env').entries.length, 1);
  assert.equal(parseAny('{"A":"1"}', 'json').entries.length, 1);
  assert.equal(parseAny('A: 1', 'yaml').entries.length, 1);
});

/* ── Output ───────────────────────────────── */

const entries: Entry[] = [
  { key: 'PLAIN', value: 'value', quoted: 'none' },
  { key: 'SPACED', value: 'two words', quoted: 'none' },
  { key: 'DOLLAR', value: '$HOME/bin', quoted: 'none' },
  { key: 'MULTI', value: 'a\nb', quoted: 'double' },
  { key: 'EMPTY', value: '', quoted: 'none' },
  { key: 'QUOTE', value: "it's", quoted: 'double' },
];

test('.env output quotes only what would change meaning', () => {
  const out = emit(entries, 'env');
  assert.match(out, /^PLAIN=value$/m);
  assert.match(out, /^SPACED='two words'$/m);
  // A literal $ must not be left where a loader would expand it.
  assert.match(out, /^DOLLAR='\$HOME\/bin'$/m);
  assert.match(out, /^MULTI="a\\nb"$/m);
  assert.match(out, /^EMPTY=$/m);
  // A single quote inside a double-quoted value needs no escape.
  assert.match(out, /^QUOTE="it's"$/m);
});

test('.env round-trips through its own output', () => {
  const text = emit(entries, 'env');
  const back = parseDotenv(text).entries;
  assert.deepEqual(
    back.map((e) => [e.key, e.value]),
    entries.map((e) => [e.key, e.value])
  );
});

test('always and never quoting do what they say', () => {
  assert.match(emit(entries, 'env', { ...DEFAULT_EMIT, quoting: 'always' }), /^PLAIN='value'$/m);
  assert.match(emit(entries, 'env', { ...DEFAULT_EMIT, quoting: 'never' }), /^SPACED=two words$/m);
  assert.match(emit(entries, 'env', { ...DEFAULT_EMIT, exportPrefix: true }), /^export PLAIN=value$/m);
});

test('shell output uses the only escaping a shell cannot misread', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
  assert.equal(shellQuote('$HOME'), `'$HOME'`);
  assert.match(emit(entries, 'shell'), /^export PLAIN='value'$/m);
  assert.match(emit(entries, 'shell'), /^export MULTI='a\nb'$/m);
});

test('JSON output is an object of strings', () => {
  const json = JSON.parse(emit(entries, 'json')) as Record<string, string>;
  assert.equal(json.MULTI, 'a\nb');
  assert.equal(json.EMPTY, '');
  assert.equal(Object.keys(json).length, 6);
  assert.equal(emit(entries, 'json', { ...DEFAULT_EMIT, indent: 0 }).includes('\n'), false);
});

test('YAML output quotes anything that would read back as another type', () => {
  const rows: Entry[] = [
    { key: 'A', value: 'yes', quoted: 'none' },
    { key: 'B', value: '007', quoted: 'none' },
    { key: 'C', value: '2026-09-26', quoted: 'none' },
    { key: 'D', value: 'plain', quoted: 'none' },
    { key: 'E', value: '', quoted: 'none' },
    { key: 'F', value: 'a: b', quoted: 'none' },
  ];
  const out = emit(rows, 'yaml');
  assert.match(out, /^A: "yes"$/m);
  assert.match(out, /^B: "007"$/m);
  assert.match(out, /^C: "2026-09-26"$/m);
  assert.match(out, /^D: plain$/m);
  assert.match(out, /^E: ""$/m);
  assert.match(out, /^F: "a: b"$/m);
  assert.ok(needsYamlQuotes('true'));
  assert.ok(needsYamlQuotes('1.5'));
  assert.ok(needsYamlQuotes('0x10'));
  assert.ok(needsYamlQuotes('- x'));
  assert.equal(needsYamlQuotes('ordinary'), false);
});

test('compose output comes in both shapes at the chosen indent', () => {
  // A space needs no quoting in YAML; a colon or a leading dash would.
  const map = emit(entries.slice(0, 2), 'compose-map');
  assert.equal(map, 'environment:\n  PLAIN: value\n  SPACED: two words');
  const list = emit(entries.slice(0, 2), 'compose-list');
  assert.equal(list, 'environment:\n  - PLAIN=value\n  - SPACED=two words');
  const tricky = emit([{ key: 'K', value: 'a: b', quoted: 'none' }], 'compose-list');
  assert.equal(tricky, 'environment:\n  - "K=a: b"');
  assert.match(emit(entries.slice(0, 1), 'compose-map', { ...DEFAULT_EMIT, indent: 4 }), /^ {4}PLAIN/m);
});

test('sorting is available and off by default', () => {
  const rows: Entry[] = [
    { key: 'B', value: '1', quoted: 'none' },
    { key: 'A', value: '2', quoted: 'none' },
  ];
  assert.equal(emit(rows, 'env'), 'B=1\nA=2');
  assert.equal(emit(rows, 'env', { ...DEFAULT_EMIT, sort: true }), 'A=2\nB=1');
});

test('needsEnvQuotes covers the cases that bite', () => {
  assert.equal(needsEnvQuotes('plain'), false);
  assert.equal(needsEnvQuotes(''), false);
  assert.ok(needsEnvQuotes('two words'));
  assert.ok(needsEnvQuotes(' leading'));
  assert.ok(needsEnvQuotes('trailing '));
  assert.ok(needsEnvQuotes('has#hash'));
  assert.ok(needsEnvQuotes('$VAR'));
  assert.ok(needsEnvQuotes('back\\slash'));
  assert.ok(needsEnvQuotes('a\nb'));
});

test('facts describe the file without showing its contents', () => {
  const facts = factsFor(entries);
  assert.equal(facts.count, 6);
  assert.equal(facts.empty, 1);
  assert.equal(facts.multiline, 1);
  assert.equal(facts.withDollar, 1);
  assert.equal(facts.longest, 'two words'.length);
  assert.ok(facts.bytes > 0);
  assert.deepEqual(factsFor([]), { count: 0, empty: 0, multiline: 0, withDollar: 0, longest: 0, bytes: 0 });
});

test('convert() parses and emits in one call', () => {
  const out = convert('A=1\nB="two words"', 'env', 'json');
  assert.equal(out.entries.length, 2);
  assert.deepEqual(JSON.parse(out.output), { A: '1', B: 'two words' });
  assert.deepEqual(out.problems, []);
  // Every target is reachable and produces something.
  for (const to of ['env', 'json', 'yaml', 'compose-map', 'compose-list', 'shell'] as const) {
    assert.ok(convert('A=1', 'env', to).output.includes('A'), to);
  }
});
