import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_STYLES,
  NAMING_STYLES,
  SMALL_WORDS,
  convert,
  convertAll,
  splitWords,
  toCamel,
  toConstant,
  toDot,
  toKebab,
  toLowerText,
  toPascal,
  toPath,
  toSentence,
  toSnake,
  toTitle,
  toTrain,
  toUpperText,
} from './logic.ts';

test('the word splitter handles every boundary an identifier has', () => {
  const cases: [string, string[]][] = [
    ['helloWorld', ['hello', 'World']],
    ['HelloWorld', ['Hello', 'World']],
    ['hello_world', ['hello', 'world']],
    ['hello-world', ['hello', 'world']],
    ['hello.world', ['hello', 'world']],
    ['foo--bar__baz', ['foo', 'bar', 'baz']],
    ['  multiple   spaces  ', ['multiple', 'spaces']],
    ['HTTPServer', ['HTTP', 'Server']],
    ['parseHTTPResponse', ['parse', 'HTTP', 'Response']],
    ['XMLHttpRequest', ['XML', 'Http', 'Request']],
    ['MACAddress', ['MAC', 'Address']],
    ['IPv4Address', ['IP', 'v4', 'Address']],
    ['user.name@example.com', ['user', 'name', 'example', 'com']],
    ['', []],
    ['___', []],
    ['中文 test', ['中文', 'test']],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(splitWords(input), expected, input);
  }
});

test('digits attach to the preceding word unless asked to split', () => {
  assert.deepEqual(splitWords('utf8Length'), ['utf8', 'Length']);
  assert.deepEqual(splitWords('utf8Length', { splitDigits: true }), ['utf', '8', 'Length']);
  assert.deepEqual(splitWords('version 2.0'), ['version', '2', '0']);
});

test('a shared global regex does not resume where the last call stopped', () => {
  // splitWords is called in a loop by convertAll; a leaked lastIndex would
  // make the second call skip the head of its input.
  assert.deepEqual(splitWords('alphaBeta'), ['alpha', 'Beta']);
  assert.deepEqual(splitWords('alphaBeta'), ['alpha', 'Beta']);
});

test('naming styles, against hand-written expectations', () => {
  const input = 'hello world-again_one';
  assert.equal(toCamel(input), 'helloWorldAgainOne');
  assert.equal(toPascal(input), 'HelloWorldAgainOne');
  assert.equal(toSnake(input), 'hello_world_again_one');
  assert.equal(toKebab(input), 'hello-world-again-one');
  assert.equal(toConstant(input), 'HELLO_WORLD_AGAIN_ONE');
  assert.equal(toDot(input), 'hello.world.again.one');
  assert.equal(toPath(input), 'hello/world/again/one');
  assert.equal(toTrain(input), 'Hello-World-Again-One');
});

test('round trip: every naming style re-splits into the same words', () => {
  const words = ['parse', 'http', 'response'];
  for (const style of NAMING_STYLES) {
    const encoded = convert('parse http response', style);
    assert.deepEqual(
      splitWords(encoded).map((word) => word.toLowerCase()),
      words,
      style
    );
  }
});

test('acronyms are folded by default and kept on request', () => {
  assert.equal(toCamel('parseHTTPResponse'), 'parseHttpResponse');
  assert.equal(toCamel('parseHTTPResponse', { preserveAcronyms: true }), 'parseHTTPResponse');
  assert.equal(toPascal('id', { preserveAcronyms: true }), 'Id');
  // A single capital is not an acronym, so it still folds.
  assert.equal(toPascal('A bee', { preserveAcronyms: true }), 'ABee');
  // snake_case lowercases what is not an acronym, so only HTTP keeps its case.
  assert.equal(toSnake('parseHTTPResponse', { preserveAcronyms: true }), 'parse_HTTP_response');
  assert.equal(toConstant('utf8Length'), 'UTF8_LENGTH');
});

test('CJK and other non-cased scripts pass through untouched', () => {
  assert.equal(toCamel('中文 標題 test'), '中文標題Test');
  assert.equal(toSnake('中文 標題'), '中文_標題');
  assert.equal(toConstant('中文 a'), '中文_A');
});

test('a capitalised word starting outside the BMP is not cut in half', () => {
  // Deseret capital letters are astral and cased; slicing at index 1 would
  // leave a lone surrogate.
  const word = '\u{10400}\u{10428}';
  const pascal = toPascal(word);
  assert.equal([...pascal].length, 2);
  assert.equal(pascal, '\u{10400}\u{10428}');
});

test('prose styles keep punctuation and line breaks where they are', () => {
  assert.equal(toLowerText('Hello, World! (Again)'), 'hello, world! (again)');
  assert.equal(toUpperText('Hello, World!'), 'HELLO, WORLD!');
  assert.equal(toLowerText('NASA and ESA', { preserveAcronyms: true }), 'NASA and ESA');
  assert.equal(toLowerText('A B', { preserveAcronyms: true }), 'a b');
});

test('sentence case capitalises after each terminator, including CJK ones', () => {
  assert.equal(toSentence('HELLO WORLD. how ARE you?'), 'Hello world. How are you?');
  assert.equal(toSentence('one\ntwo'), 'One\nTwo');
  assert.equal(toSentence('he said "yes." then left.'), 'He said "yes." Then left.');
  assert.equal(toSentence('NASA went. it landed.', { preserveAcronyms: true }), 'NASA went. It landed.');
  assert.equal(toSentence(''), '');
});

test('title case: first and last word always capital, small words not', () => {
  assert.equal(toTitle('the quick brown fox jumps over the lazy dog'), 'The Quick Brown Fox Jumps Over the Lazy Dog');
  assert.equal(toTitle('a tale of two cities'), 'A Tale of Two Cities');
  // "of" would normally stay lowercase, but here it is the last word.
  assert.equal(toTitle('what are you made of'), 'What Are You Made Of');
  assert.equal(toTitle('state-of-the-art design'), 'State-of-the-Art Design');
  assert.equal(toTitle('nasa and esa', { preserveAcronyms: true }), 'Nasa and Esa');
  assert.equal(toTitle('NASA and ESA', { preserveAcronyms: true }), 'NASA and ESA');
  assert.equal(toTitle('line one\nline two'), 'Line One\nLine Two');
  assert.equal(toTitle('   '), '   ');
});

test('the small-word list is an argument, not a law', () => {
  assert.ok(SMALL_WORDS.includes('the'));
  assert.equal(toTitle('war and peace', { smallWords: [] }), 'War And Peace');
  assert.equal(toTitle('war and peace', { smallWords: ['AND'] }), 'War and Peace');
});

test('naming styles run per line so a pasted column stays a column', () => {
  assert.equal(convert('first name\nlast name', 'camel'), 'firstName\nlastName');
  assert.equal(convert('first name\nlast name', 'constant'), 'FIRST_NAME\nLAST_NAME');
  assert.equal(convert('a\n\nb', 'kebab'), 'a\n\nb');
});

test('convertAll returns every catalogue style once, in order', () => {
  const all = convertAll('hello world');
  assert.deepEqual(all.map((entry) => entry.style), [...CASE_STYLES]);
  assert.equal(all.length, 12);
  assert.equal(all.find((entry) => entry.style === 'kebab')?.text, 'hello-world');
  assert.equal(all.find((entry) => entry.style === 'title')?.text, 'Hello World');
});

test('empty input produces empty output in every style', () => {
  for (const style of CASE_STYLES) {
    assert.equal(convert('', style), '', style);
  }
});

test('a name that was already mixed case is not flattened by title case', () => {
  // iPhone → Iphone and McDonald → Mcdonald are the two everyone notices. With
  // acronym preservation on (the UI default) a word carrying a capital anywhere
  // but the front is taken as deliberate and left alone.
  assert.equal(toTitle('the iPhone era', { preserveAcronyms: true }), 'The iPhone Era');
  assert.equal(toTitle('McDonald and eBay', { preserveAcronyms: true }), 'McDonald and eBay');
  assert.equal(toTitle('a LaTeX macro', { preserveAcronyms: true }), 'A LaTeX Macro');
  assert.equal(toPascal('iPhone case', { preserveAcronyms: true }), 'IPhoneCase');
  // Ordinary words still get their capital, and ALL CAPS still works as before.
  assert.equal(toTitle('hello world', { preserveAcronyms: true }), 'Hello World');
  assert.equal(toTitle('NASA and ESA', { preserveAcronyms: true }), 'NASA and ESA');
  // Without the switch the old behaviour is what you get.
  assert.equal(toTitle('the iPhone era'), 'The Iphone Era');
});

test('upper case is Unicode full case mapping, and is not a round trip', () => {
  // Documented rather than fixed. ß uppercases to SS and ﬁ to FI by Unicode's
  // own mapping, so upper() can change the length and lower() cannot undo it.
  assert.equal(toUpperText('straße'), 'STRASSE');
  assert.equal(toLowerText(toUpperText('straße')), 'strasse');
  assert.equal(toUpperText('ﬁle'), 'FILE');
  assert.equal(toUpperText('ΣΟΦΟΣ'.toLowerCase()), 'ΣΟΦΟΣ');
  // Latin text, which is what the tool is for, does round trip.
  assert.equal(toLowerText(toUpperText('Hello World')), 'hello world');
  assert.equal(toUpperText('HTTP header'), 'HTTP HEADER');
});
