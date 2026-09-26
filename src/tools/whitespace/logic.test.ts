import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  convertIndent,
  expandTabs,
  guessIndent,
  indentWidthOf,
  inspect,
  normalize,
  splitIndent,
  totalChanges,
  visualize,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULTS, ...patch });
const inert = (patch: Partial<Options> = {}): Options =>
  options({ eol: 'keep', trailing: false, trimEnd: false, finalNewline: 'keep', ...patch });

test('a tab advances to the next tab stop, it is not n spaces', () => {
  assert.equal(expandTabs('\ta', 4), '    a');
  assert.equal(expandTabs('a\tb', 4), 'a   b');
  assert.equal(expandTabs('ab\tc', 4), 'ab  c');
  assert.equal(expandTabs('abc\td', 4), 'abc d');
  assert.equal(expandTabs('abcd\te', 4), 'abcd    e');
  assert.equal(expandTabs('\t\t', 2), '    ');
  assert.equal(expandTabs('no tabs', 4), 'no tabs');
  assert.equal(expandTabs('', 4), '');
  // A zero or negative width would divide by zero; it is clamped to one.
  assert.equal(expandTabs('a\tb', 0), 'a b');
});

test('indentation is measured, and separable from the line', () => {
  assert.equal(indentWidthOf('\t\tx', 4), 8);
  assert.equal(indentWidthOf('    x', 4), 4);
  assert.equal(indentWidthOf(' \tx', 4), 4); // one space then a tab to column 4
  assert.equal(indentWidthOf('x', 4), 0);
  assert.deepEqual(splitIndent('  \tfoo  '), { lead: '  \t', rest: 'foo  ' });
  assert.deepEqual(splitIndent('foo'), { lead: '', rest: 'foo' });
  assert.deepEqual(splitIndent('   '), { lead: '   ', rest: '' });
});

test('the indent step is guessed from every indented line, not the first', () => {
  assert.equal(guessIndent(['a', '  b', '    c'], 4), 2);
  assert.equal(guessIndent(['a', '    b', '        c'], 4), 2); // 2 divides 4 and 8
  assert.equal(guessIndent(['a', '   b', '      c'], 4), 3);
  assert.equal(guessIndent(['a', 'b'], 4), null);
  assert.equal(guessIndent(['\ta'], 4), null); // tab-indented files have no step
  assert.equal(guessIndent([], 4), null);
});

test('inspect reports line endings without a lookbehind', () => {
  const report = inspect('a\r\nb\nc\rd');
  assert.equal(report.crlf, 1);
  assert.equal(report.lf, 1);
  assert.equal(report.cr, 1);
  assert.equal(report.mixedEol, true);
  assert.equal(report.lines, 4);

  const clean = inspect('a\nb\n');
  assert.equal(clean.mixedEol, false);
  assert.equal(clean.finalNewline, true);
  assert.equal(inspect('a').finalNewline, false);
  assert.equal(inspect('').lines, 0);
});

test('inspect counts indentation, trailing space and blank runs', () => {
  const report = inspect('\tone \n  two\n \ttwo and a half\n\n\n\nfour');
  assert.equal(report.tabIndented, 1);
  assert.equal(report.spaceIndented, 1);
  assert.equal(report.mixedIndent, 1);
  assert.equal(report.trailingWhitespace, 1);
  assert.equal(report.blankLines, 3);
  assert.equal(report.longestBlankRun, 3);
});

test('inspect counts invisible characters and never confuses the emoji joiner', () => {
  const report = inspect('a​b c\u{1F468}‍\u{1F469}');
  assert.equal(report.zeroWidth, 1);
  assert.equal(report.unicodeSpaces, 1);
  assert.equal(report.joiners, 1);
});

test('line endings are normalised in every direction', () => {
  assert.equal(normalize('a\r\nb', options({ eol: 'lf' })).text, 'a\nb\n');
  assert.equal(normalize('a\nb', options({ eol: 'crlf' })).text, 'a\r\nb\r\n');
  assert.equal(normalize('a\nb', options({ eol: 'cr' })).text, 'a\rb\r');
  assert.equal(normalize('a\r\nb', options({ eol: 'keep', finalNewline: 'keep' })).text, 'a\r\nb');
  assert.equal(normalize('a\r\nb', options({ eol: 'lf' })).changes.eol, 1);
  assert.equal(normalize('a\nb', options({ eol: 'lf' })).changes.eol, 0);
});

test('trailing whitespace comes off, indentation does not', () => {
  const result = normalize('  keep  \n\tkeep\t\n', options({ eol: 'keep', finalNewline: 'keep' }));
  assert.equal(result.text, '  keep\n\tkeep\n');
  assert.equal(result.changes.trailing, 2);
  // A line of only spaces is trailing whitespace too.
  assert.equal(normalize('a\n   \nb', options({ eol: 'keep', finalNewline: 'keep' })).text, 'a\n\nb');
});

test('tabs to spaces and back, using tab stops', () => {
  assert.equal(convertIndent('\tx', options({ indent: 'spaces', tabWidth: 4 })), '    x');
  assert.equal(convertIndent('\t\tx', options({ indent: 'spaces', tabWidth: 2 })), '    x');
  assert.equal(convertIndent('    x', options({ indent: 'tabs', tabWidth: 4 })), '\tx');
  assert.equal(convertIndent('      x', options({ indent: 'tabs', tabWidth: 4 })), '\t  x');
  assert.equal(convertIndent('x', options({ indent: 'spaces' })), 'x');
  assert.equal(convertIndent('  x', options({ indent: 'keep' })), '  x');
  // Only the indentation is touched; a tab inside the text stays a tab.
  assert.equal(convertIndent('\ta\tb', options({ indent: 'spaces', tabWidth: 4 })), '    a\tb');
});

test('rescaling maps whole levels and leaves odd widths alone', () => {
  const rescale = options({ indent: 'spaces', tabWidth: 4, indentWidth: 2, rescale: true });
  assert.equal(convertIndent('    x', rescale), '  x'); // one level of 4 becomes 2
  assert.equal(convertIndent('        x', rescale), '    x'); // two levels
  assert.equal(convertIndent('      x', rescale), '      x'); // 6 is not a multiple of 4
  const widen = options({ indent: 'spaces', tabWidth: 2, indentWidth: 4, rescale: true });
  assert.equal(convertIndent('  x', widen), '    x');
});

test('blank-line squeezing keeps at most the requested number', () => {
  const text = 'a\n\n\n\nb';
  assert.equal(normalize(text, inert({ maxBlank: 1 })).text, 'a\n\nb');
  assert.equal(normalize(text, inert({ maxBlank: 0 })).text, 'a\nb');
  assert.equal(normalize(text, inert({ maxBlank: -1 })).text, text);
  assert.equal(normalize(text, inert({ maxBlank: 1 })).changes.blanks, 2);
});

test('leading and trailing blank lines are separate decisions', () => {
  // The file ended with a newline and finalNewline is 'keep', so the ending
  // itself survives every trim — only the blank lines in front of it go.
  assert.equal(normalize('\n\na\n\n', inert({ trimStart: true })).text, 'a\n\n');
  assert.equal(normalize('\n\na\n\n', inert({ trimEnd: true })).text, '\n\na\n');
  assert.equal(normalize('\n\na\n\n', inert({ trimStart: true, trimEnd: true })).text, 'a\n');
  assert.equal(normalize('\n\na\n\n', inert({ trimStart: true, trimEnd: true, finalNewline: 'strip' })).text, 'a');
});

test('the final newline is added, removed or left alone', () => {
  assert.equal(normalize('a', options({ eol: 'keep', finalNewline: 'ensure' })).text, 'a\n');
  assert.equal(normalize('a\n', options({ eol: 'keep', finalNewline: 'strip' })).text, 'a');
  assert.equal(normalize('a', options({ eol: 'keep', finalNewline: 'keep' })).text, 'a');
  assert.equal(normalize('a\n', options({ eol: 'keep', finalNewline: 'keep' })).text, 'a\n');
  assert.equal(normalize('a', options({ eol: 'crlf', finalNewline: 'ensure' })).text, 'a\r\n');
  assert.equal(normalize('a', options({ eol: 'keep', finalNewline: 'ensure' })).changes.finalNewline, 1);
});

test('a trailing newline is a file ending, not a blank line', () => {
  // Without that distinction, "ensure final newline" plus "no blank lines"
  // would fight each other and strip the ending.
  assert.equal(normalize('a\n', options({ eol: 'keep', maxBlank: 0, finalNewline: 'ensure' })).text, 'a\n');
});

test('NBSP and zero-width characters are handled, the emoji joiner is not', () => {
  const family = '\u{1F468}\u200d\u{1F469}';
  const input = `a\u00a0b\u200bc${family}`;
  const result = normalize(input, options({ unicodeSpaces: true, zeroWidth: true, eol: 'keep', finalNewline: 'keep' }));
  // NBSP became a space, the zero-width space vanished, the joiner stayed.
  assert.equal(result.text, `a bc${family}`);
  assert.equal(result.changes.spaces, 1);
  assert.equal(result.changes.zeroWidth, 1);
  assert.equal(result.text.includes('\u200d'), true);
  // Left off, both survive.
  assert.equal(normalize(input, inert()).text, input);
});

test('inner space collapsing leaves indentation intact', () => {
  const result = normalize('    a    b', inert({ collapseInner: true }));
  assert.equal(result.text, '    a b');
});

test('empty input stays empty and reports nothing', () => {
  const result = normalize('', options());
  assert.equal(result.text, '');
  assert.equal(totalChanges(result.changes), 0);
});

test('a clean file is not changed by the defaults', () => {
  const clean = 'line one\nline two\n';
  const result = normalize(clean, DEFAULTS);
  assert.equal(result.text, clean);
  assert.equal(totalChanges(result.changes), 0);
});

test('a messy file, end to end, against a hand-written expectation', () => {
  const messy = '\tfirst  \r\n\r\n\r\n  second\t\r\nthird   \r\n\r\n';
  const result = normalize(messy, options({ eol: 'lf', indent: 'spaces', tabWidth: 4, maxBlank: 1, trailing: true, trimEnd: true, finalNewline: 'ensure' }));
  assert.equal(result.text, '    first\n\n  second\nthird\n');
  assert.ok(totalChanges(result.changes) > 0);
});

test('CJK and emoji content is untouched by whitespace work', () => {
  const text = '中文  內容\t\n\u{1F600} 表情  \n';
  const result = normalize(text, options({ eol: 'lf', trailing: true, finalNewline: 'keep' }));
  assert.equal(result.text, '中文  內容\n\u{1F600} 表情\n');
});

test('visualize marks every kind of whitespace and stays a display function', () => {
  assert.equal(visualize('a b'), 'a·b');
  assert.equal(visualize('a\tb'), 'a⇥b');
  assert.equal(visualize('a\nb'), 'a␊\nb');
  assert.equal(visualize('a\r\nb'), 'a␍␊\nb');
  assert.equal(visualize('a\rb'), 'a␍\nb');
  assert.equal(visualize('a b'), 'a␣b');
  assert.equal(visualize('a​b'), 'a∅b');
  assert.equal(visualize('\u{1F468}‍\u{1F469}'), '\u{1F468}⁀\u{1F469}');
  assert.equal(visualize('abcdef', 3), 'abc');
  assert.equal(visualize(''), '');
});
