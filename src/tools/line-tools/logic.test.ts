import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  MAX_LINES,
  dedupeLines,
  duplicateReport,
  leadingNumber,
  naturalCompare,
  numberLines,
  process,
  sortLines,
  splitLines,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULTS, ...patch });

test('line splitting folds CRLF and CR, and empty input has no lines', () => {
  assert.deepEqual(splitLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('\n'), ['', '']);
});

test('natural order puts file2 before file10', () => {
  const input = ['file10', 'file2', 'file1', 'file20', 'file3'];
  assert.deepEqual(
    input.slice().sort((a, b) => naturalCompare(a, b)),
    ['file1', 'file2', 'file3', 'file10', 'file20']
  );
  // Plain text order is the one that gets this wrong, which is why both exist.
  assert.deepEqual(input.slice().sort(), ['file1', 'file10', 'file2', 'file20', 'file3']);
});

test('natural order is total: equal values still order deterministically', () => {
  // Only the sign is part of the contract, as with any comparator.
  // Same numeric value, so the shorter spelling wins the tie: 7 then 007.
  assert.ok(naturalCompare('007', '7') > 0);
  assert.ok(naturalCompare('7', '007') < 0);
  assert.equal(naturalCompare('a1', 'a1'), 0);
  assert.ok(naturalCompare('a', 'a1') < 0);
  assert.ok(naturalCompare('1a', '1') > 0);
});

test('digit runs beyond double precision still compare correctly', () => {
  const a = `part${'1'.repeat(25)}`;
  const b = `part${'1'.repeat(24)}2`; // same length, larger last digit
  assert.equal(Number(a.slice(4)) === Number(b.slice(4)), true); // both lose precision
  assert.equal(naturalCompare(a, b), -1); // string comparison does not
});

test('natural order across mixed chunk counts', () => {
  assert.deepEqual(
    ['x2y10', 'x2y2', 'x10y1'].sort((a, b) => naturalCompare(a, b)),
    ['x2y2', 'x2y10', 'x10y1']
  );
});

test('sort kinds, directions and case folding', () => {
  const input = ['banana', 'Apple', 'cherry'];
  assert.deepEqual(sortLines(input, options({ sort: 'text' })), ['Apple', 'banana', 'cherry']);
  assert.deepEqual(sortLines(input, options({ sort: 'text', direction: 'desc' })), [
    'cherry',
    'banana',
    'Apple',
  ]);
  // Code-point order puts every capital before every lowercase.
  assert.deepEqual(sortLines(['b', 'A', 'a', 'B'], options({ sort: 'text' })), ['A', 'B', 'a', 'b']);
  assert.deepEqual(sortLines(['b', 'A', 'a', 'B'], options({ sort: 'text', sortIgnoreCase: true })), [
    'A',
    'a',
    'b',
    'B',
  ]);
  assert.deepEqual(sortLines(input, options({ sort: 'none' })), input);
});

test('length sort counts characters, not UTF-16 units', () => {
  const emoji = '\u{1F600}'; // two UTF-16 units, one character
  // Both one-character lines come first; the tie falls to code-point order,
  // where 'c' (U+0063) precedes the emoji (U+1F600).
  assert.deepEqual(sortLines([emoji, 'ab', 'c'], options({ sort: 'length' })), ['c', emoji, 'ab']);
});

test('numeric sort reads the leading number and parks lines without one', () => {
  assert.equal(leadingNumber('  -3.5 kg'), -3.5);
  assert.equal(leadingNumber('1e3 items'), 1000);
  assert.equal(leadingNumber('no number'), null);
  assert.equal(leadingNumber(''), null);
  assert.deepEqual(
    sortLines(['10 apples', '2 pears', 'header', '-1 debt'], options({ sort: 'numeric' })),
    ['-1 debt', '2 pears', '10 apples', 'header']
  );
  assert.deepEqual(
    sortLines(['10 apples', '2 pears', 'header'], options({ sort: 'numeric', direction: 'desc' })),
    ['10 apples', '2 pears', 'header']
  );
});

test('dedupe: adjacent is uniq, all keeps the first occurrence anywhere', () => {
  const input = ['a', 'a', 'b', 'a'];
  assert.deepEqual(dedupeLines(input, 'adjacent').lines, ['a', 'b', 'a']);
  assert.deepEqual(dedupeLines(input, 'all').lines, ['a', 'b']);
  assert.equal(dedupeLines(input, 'all').removed, 2);
  assert.deepEqual(dedupeLines(input, 'none').lines, input);
  assert.equal(dedupeLines([], 'all').removed, 0);
});

test('dedupe comparison can ignore case and surrounding whitespace', () => {
  assert.deepEqual(dedupeLines(['a', ' a '], 'all', { ignoreWhitespace: true }).lines, ['a']);
  assert.deepEqual(dedupeLines(['a', ' a '], 'all', { ignoreWhitespace: false }).lines, ['a', ' a ']);
  assert.deepEqual(dedupeLines(['A', 'a'], 'all', { ignoreCase: true }).lines, ['A']);
  assert.deepEqual(dedupeLines(['A', 'a'], 'all', { ignoreCase: false }).lines, ['A', 'a']);
});

test('numbering pads to the widest number so text stays aligned', () => {
  assert.deepEqual(numberLines(['a', 'b'], 1, true, '. '), ['1. a', '2. b']);
  assert.deepEqual(numberLines(new Array(10).fill('x'), 1, true, ' ')[0], '01 x');
  assert.deepEqual(numberLines(new Array(10).fill('x'), 1, false, ' ')[0], '1 x');
  assert.deepEqual(numberLines(['a'], 0, true, ': '), ['0: a']);
  assert.deepEqual(numberLines([], 1, true, '. '), []);
});

test('the pipeline runs in the documented order', () => {
  // Trim before dedupe, or "a" and " a " survive as two lines.
  const result = process('  a  \na\nb\n\nB', options({ trim: true, dropEmpty: true, dedupe: 'all' }));
  assert.deepEqual(result.lines, ['a', 'b', 'B']);
  assert.equal(result.stats.input, 5);
  assert.equal(result.stats.blanks, 1);
  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.stats.output, 3);
});

test('affixes go on before numbers, so the number stays leftmost', () => {
  const result = process('a\nb', options({ prefix: '- ', suffix: ';', number: true, numberSeparator: '. ' }));
  assert.deepEqual(result.lines, ['1. - a;', '2. - b;']);
});

test('filters count what they removed and can ignore case', () => {
  const kept = process('apple\nApple pie\nbanana', options({ keep: 'apple' }));
  assert.deepEqual(kept.lines, ['apple', 'Apple pie']);
  assert.equal(kept.stats.filtered, 1);

  const cased = process('apple\nApple', options({ keep: 'apple', filterIgnoreCase: false }));
  assert.deepEqual(cased.lines, ['apple']);

  const dropped = process('keep\ndrop this', options({ drop: 'drop' }));
  assert.deepEqual(dropped.lines, ['keep']);

  const both = process('a x\nb x\na y', options({ keep: 'a', drop: 'y' }));
  assert.deepEqual(both.lines, ['a x']);
});

test('reverse applies after sorting, and on its own', () => {
  assert.deepEqual(process('a\nb\nc', options({ reverse: true })).lines, ['c', 'b', 'a']);
  assert.deepEqual(
    process('b\na\nc', options({ sort: 'text', reverse: true })).lines,
    ['c', 'b', 'a']
  );
});

test('empty input produces no lines rather than one empty line', () => {
  const result = process('', DEFAULTS);
  assert.deepEqual(result.lines, []);
  assert.equal(result.stats.input, 0);
  assert.equal(result.stats.output, 0);
  assert.equal(result.stats.truncated, false);
});

test('Unicode, emoji and CJK survive every stage unchanged', () => {
  const result = process('貓\n狗\n貓\n\u{1F600}', options({ dedupe: 'all', sort: 'text' }));
  assert.deepEqual(result.lines, ['狗', '貓', '\u{1F600}']);
});

test('too many lines is reported, not ground through', () => {
  const text = new Array(MAX_LINES + 5).fill('x').join('\n');
  const result = process(text, DEFAULTS);
  assert.equal(result.stats.truncated, true);
  assert.equal(result.stats.input, MAX_LINES);
});

test('the duplicate report counts occurrences, most frequent first', () => {
  const report = duplicateReport(['a', 'b', 'a', 'a', 'b', 'c']);
  assert.deepEqual(report, [
    { line: 'a', n: 3 },
    { line: 'b', n: 2 },
  ]);
  assert.deepEqual(duplicateReport(['a', 'b']), []);
  assert.deepEqual(duplicateReport(['A', 'a'], { ignoreCase: true }), [{ line: 'A', n: 2 }]);
  assert.equal(duplicateReport(['a', 'a', 'b', 'b'], {}, 1).length, 1);
});

test('locale collation is accepted and still returns a total order', () => {
  const sorted = sortLines(['b', 'a', 'B', 'A'], options({ sort: 'text', collate: 'locale' }));
  assert.equal(sorted.length, 4);
  assert.deepEqual(sorted.slice().sort(), ['A', 'B', 'a', 'b']);
});
