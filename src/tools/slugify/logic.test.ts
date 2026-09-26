import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  SPECIAL_LETTERS,
  byteLength,
  percentEncoded,
  slugify,
  transliterate,
  truncate,
  uniqueSlugs,
  type Options,
} from './logic.ts';

const options = (patch: Partial<Options> = {}): Options => ({ ...DEFAULTS, ...patch });

test('the ordinary case, against hand-written expectations', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  leading and trailing  '), 'leading-and-trailing');
  assert.equal(slugify('Hello -- World!!'), 'hello-world');
  assert.equal(slugify('already-a-slug'), 'already-a-slug');
  assert.equal(slugify('CamelCaseTitle'), 'camelcasetitle');
  assert.equal(slugify('2024 年度報告', options({ nonAscii: 'strip' })), '2024');
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!! ???'), '');
});

test('diacritics fold to their base letters', () => {
  assert.equal(transliterate('Ünïcödé Tèxt'), 'Unicode Text');
  assert.equal(slugify('Ünïcödé Tèxt'), 'unicode-text');
  assert.equal(slugify('Crème Brûlée'), 'creme-brulee');
  assert.equal(slugify('Español — Año'), 'espanol-ano');
  assert.equal(slugify('Việt Nam'), 'viet-nam');
});

test('letters with no decomposition come from the table', () => {
  assert.equal(slugify('Straße'), 'strasse');
  assert.equal(slugify('Æon Flux'), 'aeon-flux');
  assert.equal(slugify('Køge'), 'koge');
  assert.equal(slugify('Łódź'), 'lodz');
  assert.equal(slugify('Þingvellir'), 'thingvellir');
  // Every table entry produces ASCII, or the table is not doing its job.
  for (const [from, to] of Object.entries(SPECIAL_LETTERS)) {
    assert.match(to, /^[A-Za-z]+$/, `${from} -> ${to}`);
    assert.match(slugify(`x${from}x`), /^[a-z0-9-]+$/, from);
  }
});

test('non-ASCII: strip, keep or transliterate — three different answers', () => {
  assert.equal(slugify('台北美食指南', options({ nonAscii: 'keep' })), '台北美食指南');
  assert.equal(slugify('台北美食指南', options({ nonAscii: 'strip' })), '');
  assert.equal(slugify('台北美食指南', options({ nonAscii: 'transliterate' })), '');
  assert.equal(slugify('台北 Taipei 指南', options({ nonAscii: 'keep' })), '台北-taipei-指南');
  assert.equal(slugify('台北 Taipei 指南', options({ nonAscii: 'strip' })), 'taipei');
  // Keep mode keeps letters of any script, still not punctuation.
  assert.equal(slugify('日本語、テスト', options({ nonAscii: 'keep' })), '日本語-テスト');
});

test('the ampersand becomes a word, in whichever language', () => {
  assert.equal(slugify('C++ & C#'), 'c-and-c');
  assert.equal(slugify('Rock & Roll'), 'rock-and-roll');
  assert.equal(slugify('A&B'), 'a-and-b');
  // Empty means "no word": the ampersand falls through to the separator rule.
  assert.equal(slugify('A&B', options({ ampersand: '' })), 'a-b');
  assert.equal(slugify('設計 & 開發', options({ nonAscii: 'keep', ampersand: '與' })), '設計-與-開發');
});

test('the separator is a setting, including no separator at all', () => {
  assert.equal(slugify('Hello World', options({ separator: '_' })), 'hello_world');
  assert.equal(slugify('Hello World', options({ separator: '.' })), 'hello.world');
  assert.equal(slugify('Hello World', options({ separator: '' })), 'helloworld');
  assert.equal(slugify('a  b', options({ separator: '~' })), 'a~b');
});

test('case is preserved when asked', () => {
  assert.equal(slugify('Hello World', options({ lowercase: false })), 'Hello-World');
  assert.equal(slugify('Straße', options({ lowercase: false })), 'Strasse');
});

test('truncation cuts at a word boundary, or hard when it cannot', () => {
  const short = options({ maxLength: 10 });
  assert.equal(slugify('one two three four', short), 'one-two');
  assert.equal(slugify('averylongsinglewordwithnobreaks', short), 'averylongs');
  assert.equal(slugify('one two three', options({ maxLength: 10, wordSafe: false })), 'one-two-th');
  assert.equal(slugify('short', short), 'short');
  assert.equal(slugify('one two three', options({ maxLength: 0 })), 'one-two-three');
  // No dangling separator, whichever path was taken.
  assert.equal(slugify('one two', options({ maxLength: 4, wordSafe: false })), 'one');
  assert.equal(truncate('abc', options({ maxLength: 0 })), 'abc');
});

test('truncation counts characters, so a CJK slug is not cut mid-character', () => {
  const slug = slugify('台北美食指南', options({ nonAscii: 'keep', maxLength: 3 }));
  assert.equal([...slug].length, 3);
  assert.equal(slug, '台北美');
});

test('collisions are numbered with the chosen separator', () => {
  const rows = uniqueSlugs(['Notes', 'Notes', 'notes!', 'Other'], DEFAULTS);
  assert.deepEqual(rows.map((row) => row.slug), ['notes', 'notes-2', 'notes-3', 'other']);
  assert.deepEqual(rows.map((row) => row.duplicate), [false, true, true, false]);

  const underscored = uniqueSlugs(['A', 'A'], options({ separator: '_' }));
  assert.deepEqual(underscored.map((row) => row.slug), ['a', 'a_2']);

  // An empty slug is not a collision to number; it is nothing.
  const empty = uniqueSlugs(['!!!', '???'], DEFAULTS);
  assert.deepEqual(empty.map((row) => row.slug), ['', '']);
  assert.deepEqual(uniqueSlugs([], DEFAULTS), []);
});

test('a numbered slug still respects the length limit before its suffix', () => {
  const rows = uniqueSlugs(['one two three', 'one two three'], options({ maxLength: 7 }));
  assert.deepEqual(rows.map((row) => row.slug), ['one-two', 'one-two-2']);
});

test('URL forms and byte lengths are reported honestly', () => {
  assert.equal(percentEncoded('hello-world'), 'hello-world');
  assert.equal(percentEncoded('台北'), '%E5%8F%B0%E5%8C%97');
  assert.equal(byteLength('hello'), 5);
  assert.equal(byteLength('台北'), 6);
  assert.equal(byteLength('\u{1F600}'), 4);
  assert.equal(byteLength(''), 0);
  // The point of showing both: a six-character CJK slug is 54 URL characters.
  assert.equal(percentEncoded('台北美食指南').length, 54);
});

test('emoji and symbols become separators, never content', () => {
  assert.equal(slugify('Hello \u{1F600} World'), 'hello-world');
  assert.equal(slugify('\u{1F600}', options({ nonAscii: 'keep' })), '');
  assert.equal(slugify('100% pure'), '100-pure');
  assert.equal(slugify('a/b\\c'), 'a-b-c');
  assert.equal(slugify('file.name.txt'), 'file-name-txt');
});

test('CRLF and tabs are just separators', () => {
  assert.equal(slugify('one\r\ntwo\tthree'), 'one-two-three');
});
