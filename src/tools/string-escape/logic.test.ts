import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGETS,
  caveatsFor,
  escapeFor,
  isCFamily,
  quoteChar,
  unescapeFrom,
  unwrap,
  type Target,
} from './logic.ts';

const ALL = Object.keys(TARGETS) as Target[];

/** Written as escapes on purpose: a literal one in this file is invisible. */
const CTRL1 = '\u0001';
const CTRL1F = '\u001f';
const LS = '\u2028'; // LINE SEPARATOR
const PS = '\u2029'; // PARAGRAPH SEPARATOR

test('JSON output is what JSON.stringify produces', () => {
  const samples = [
    'plain',
    'quote " inside',
    'back \\ slash',
    'tab\there',
    'nl\nhere',
    'cr\rhere',
    '\b\f',
    `control ${CTRL1}${CTRL1F}`,
    '中文 😀',
    '',
  ];
  for (const sample of samples) {
    assert.equal(escapeFor(sample, 'json'), JSON.stringify(sample), JSON.stringify(sample));
  }
});

test('JSON in ASCII-only mode escapes non-ASCII as surrogate pairs', () => {
  // Lowercase hex, exactly as JSON.stringify writes it.
  assert.equal(escapeFor('中', 'json', { asciiOnly: true }), '"\\u4e2d"');
  assert.equal(escapeFor('😀', 'json', { asciiOnly: true }), '"\\ud83d\\ude00"');
  assert.equal(escapeFor('😀', 'json'), '"😀"');
  // Every other target writes uppercase, which reads better in source.
  assert.equal(escapeFor('中', 'js', { asciiOnly: true }), "'\\u4E2D'");
});

test('JSON escapes U+2028 and U+2029 even though JSON allows them raw', () => {
  // The bug: valid JSON pasted into a .js file becomes a syntax error.
  assert.equal(escapeFor(LS, 'json'), '"\\u2028"');
  assert.equal(escapeFor(PS, 'js'), "'\\u2029'");
  assert.equal(escapeFor(LS, 'python'), `'${LS}'`);
});

test('Java never writes a newline as a unicode escape', () => {
  // A literal U+000A written as \u000A would end the source line itself.
  assert.equal(escapeFor('a\nb', 'java'), '"a\\nb"');
  assert.equal(escapeFor('a\rb', 'java'), '"a\\rb"');
  assert.equal(escapeFor('a\tb', 'java'), '"a\\tb"');
  const out = escapeFor('\n\r', 'java', { asciiOnly: true });
  assert.equal(out.includes('\\u000A'), false);
  assert.equal(out.includes('\\u000D'), false);
  // Java has no \x and no \u{...}: anything else becomes \uXXXX.
  assert.equal(escapeFor(CTRL1, 'java'), '"\\u0001"');
  assert.equal(escapeFor('中', 'java', { asciiOnly: true }), '"\\u4E2D"');
});

test('C avoids the open-ended \\x escape', () => {
  // "\x411" is one escape in C, not \x41 followed by '1'.
  const out = escapeFor(`${CTRL1}1`, 'c');
  assert.equal(out, '"\\0011"');
  assert.equal(unescapeFrom(out, 'c'), `${CTRL1}1`);
  assert.equal(escapeFor('中', 'c', { asciiOnly: true }), '"\\u4E2D"');
  assert.equal(escapeFor('😀', 'c', { asciiOnly: true }), '"\\U0001F600"');
  assert.equal(escapeFor('\u0007\u000b', 'c'), '"\\a\\v"');
});

test('Python uses its own fixed-width escapes at every size', () => {
  assert.equal(escapeFor('中', 'python', { asciiOnly: true }), "'\\u4E2D'");
  assert.equal(escapeFor('é', 'python', { asciiOnly: true }), "'\\xE9'");
  assert.equal(escapeFor('😀', 'python', { asciiOnly: true }), "'\\U0001F600'");
  assert.equal(escapeFor("it's", 'python'), "'it\\'s'");
  assert.equal(escapeFor("it's", 'python', { quote: 'double' }), '"it\'s"');
  assert.equal(escapeFor('\u0007\u000b\u0001', 'python'), "'\\a\\v\\x01'");
});

test('JavaScript honours the quote it was given', () => {
  assert.equal(escapeFor('a', 'js'), "'a'");
  assert.equal(escapeFor('a', 'js', { quote: 'double' }), '"a"');
  assert.equal(escapeFor(`it's a "quote"`, 'js'), `'it\\'s a "quote"'`);
  assert.equal(escapeFor(`it's a "quote"`, 'js', { quote: 'double' }), `"it's a \\"quote\\""`);
  assert.equal(escapeFor('\0', 'js'), `'\\x00'`);
  assert.equal(quoteChar('js'), "'");
  assert.equal(quoteChar('js', 'double'), '"');
  // A target with one legal quote ignores the request.
  assert.equal(quoteChar('json', 'single'), '"');
});

test("the shell single-quote trick is the close-reopen form, not an escape", () => {
  assert.equal(escapeFor("it's", 'shell-single'), `'it'\\''s'`);
  assert.equal(escapeFor('plain', 'shell-single'), `'plain'`);
  // Everything else is literal inside single quotes, backslashes included.
  assert.equal(escapeFor('back\\slash $var `cmd`', 'shell-single'), `'back\\slash $var \`cmd\`'`);
  assert.equal(escapeFor("''", 'shell-single'), `''\\''`.concat(`'\\'''`));
  assert.equal(unescapeFrom(escapeFor("it's", 'shell-single'), 'shell-single'), "it's");
});

test('the shell double-quote form escapes exactly the four that still act', () => {
  assert.equal(escapeFor('$HOME', 'shell-double'), '"\\$HOME"');
  assert.equal(escapeFor('`id`', 'shell-double'), '"\\`id\\`"');
  assert.equal(escapeFor('a\\b', 'shell-double'), '"a\\\\b"');
  assert.equal(escapeFor('say "hi"', 'shell-double'), '"say \\"hi\\""');
  assert.equal(escapeFor("it's", 'shell-double'), `"it's"`);
  assert.equal(unescapeFrom(escapeFor('$a `b` "c" \\d', 'shell-double'), 'shell-double'), '$a `b` "c" \\d');
});

test('SQL doubles the quote, and only MySQL mode touches the backslash', () => {
  assert.equal(escapeFor("O'Brien", 'sql'), "'O''Brien'");
  assert.equal(escapeFor('a\\b', 'sql'), "'a\\b'");
  assert.equal(escapeFor('a\\b', 'sql-mysql'), "'a\\\\b'");
  assert.equal(escapeFor("O'Brien", 'sql-mysql'), "'O''Brien'");
  assert.equal(unescapeFrom("'O''Brien'", 'sql'), "O'Brien");
  assert.equal(unescapeFrom("'a\\\\b'", 'sql-mysql'), 'a\\b');
  // The one-character difference between the two modes is the whole point.
  assert.notEqual(escapeFor('a\\b', 'sql'), escapeFor('a\\b', 'sql-mysql'));
});

test('every target round-trips awkward text', () => {
  const samples = [
    '',
    'plain ascii',
    `quotes ' and " and \` together`,
    'back \\ slash \\\\ double',
    'tab\tnewline\ncr\r',
    '中文 台北 😀🌏',
    '$dollar `backtick` %percent%',
    `null\0and${CTRL1}control`,
    `U+2028${LS}U+2029${PS}`,
  ];
  for (const target of ALL) {
    for (const ascii of [false, true]) {
      if (ascii && !TARGETS[target].ascii) continue;
      for (const sample of samples) {
        const literal = escapeFor(sample, target, { asciiOnly: ascii });
        assert.equal(
          unescapeFrom(literal, target),
          sample,
          `${target}${ascii ? ' ascii' : ''}: ${JSON.stringify(sample)}`
        );
      }
    }
  }
});

test('both quote choices round-trip where both are legal', () => {
  const sample = `mixed ' and " quotes`;
  for (const target of ALL) {
    for (const quote of TARGETS[target].quotes) {
      const literal = escapeFor(sample, target, { quote });
      assert.equal(unescapeFrom(literal, target), sample, `${target}/${quote}`);
    }
  }
});

test('wrapping can be turned off without changing the body', () => {
  assert.equal(escapeFor('a"b', 'json', { wrap: false }), 'a\\"b');
  assert.equal(escapeFor('a"b', 'json'), '"a\\"b"');
  assert.equal(escapeFor("it's", 'sql', { wrap: false }), "it''s");
  assert.equal(escapeFor('', 'json', { wrap: false }), '');
});

test('unwrap removes one matching pair and leaves everything else alone', () => {
  assert.equal(unwrap('"abc"'), 'abc');
  assert.equal(unwrap("'abc'"), 'abc');
  assert.equal(unwrap('`abc`'), 'abc');
  assert.equal(unwrap('abc'), 'abc');
  assert.equal(unwrap('"abc'), '"abc');
  assert.equal(unwrap('"'), '"');
  assert.equal(unwrap(''), '');
  assert.equal(unwrap('  "abc"  '), 'abc');
  // Two literals side by side are not one pair of quotes.
  assert.equal(unwrap('"a" + "b"'), 'a" + "b');
});

test('unescape reads notations this tool does not itself emit', () => {
  assert.equal(unescapeFrom('"\\u{1F600}"', 'js'), '😀');
  assert.equal(unescapeFrom('"\\x41\\101\\u0041"', 'c'), 'AAA');
  assert.equal(unescapeFrom('"a\\\nb"', 'c'), 'ab'); // line continuation
  assert.equal(unescapeFrom('"\\?"', 'c'), '?');
  assert.equal(unescapeFrom('"\\/"', 'json'), '/');
});

test('an escape it does not recognise survives untouched', () => {
  assert.equal(unescapeFrom('"\\d+\\w"', 'js'), '\\d+\\w');
  assert.equal(unescapeFrom('"\\u12"', 'js'), '\\u12');
  assert.equal(unescapeFrom('"trailing\\"', 'js'), 'trailing\\');
});

test('the target table and the C-family test agree', () => {
  assert.equal(ALL.length, 9);
  for (const target of ALL) {
    assert.ok(TARGETS[target].quotes.length >= 1, target);
    assert.ok(TARGETS[target].label.length > 0, target);
  }
  assert.equal(isCFamily('json'), true);
  assert.equal(isCFamily('python'), true);
  assert.equal(isCFamily('sql'), false);
  assert.equal(isCFamily('shell-single'), false);
});

test('the SQL targets always come with the injection warning', () => {
  for (const target of ['sql', 'sql-mysql'] as const) {
    const caveats = caveatsFor(target);
    assert.ok(caveats.length >= 2, target);
    assert.ok(caveats.some((caveat) => /參數化/.test(caveat.zh)), target);
    assert.ok(caveats.some((caveat) => /parameterised/.test(caveat.en)), target);
  }
  assert.deepEqual(caveatsFor('js'), []);
  assert.ok(caveatsFor('java').length > 0);
});
