import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RATES,
  MAX_INPUT,
  analyze,
  countSentences,
  countWords,
  formatDuration,
  frequency,
  graphemeCount,
  readingTime,
  splitLines,
  splitParagraphs,
} from './logic.ts';

test('empty input counts zero everywhere, including lines', () => {
  const counts = analyze('');
  assert.equal(counts.utf16, 0);
  assert.equal(counts.codePoints, 0);
  assert.equal(counts.graphemes, 0);
  assert.equal(counts.lines, 0);
  assert.equal(counts.paragraphs, 0);
  assert.equal(counts.sentences, 0);
  assert.equal(counts.truncated, false);
});

test('a plain English sentence, counted by hand', () => {
  const counts = analyze('The quick brown fox jumps over the lazy dog.');
  assert.equal(counts.latinWords, 9);
  assert.equal(counts.numbers, 0);
  assert.equal(counts.cjk, 0);
  assert.equal(counts.utf16, 44);
  assert.equal(counts.utf8Bytes, 44);
  assert.equal(counts.whitespace, 8);
  assert.equal(counts.visible, 36);
  assert.equal(counts.lines, 1);
  assert.equal(counts.sentences, 1);
  assert.equal(counts.paragraphs, 1);
});

test('CJK is counted per character, not per space-delimited run', () => {
  // Nine ideographs, no spaces: the naive split would report one word.
  const counts = analyze('今天天氣很好我要出門');
  assert.equal(counts.cjk, 10);
  assert.equal(counts.latinWords, 0);
  assert.equal(counts.utf8Bytes, 30);
});

test('mixed CJK and Latin keeps the two tallies apart', () => {
  const counts = analyze('\u9019\u500b API \u56de\u50b3 200 OK\uff0c\u5171 3 \u500b\u6b04\u4f4d\u3002');
  assert.equal(counts.cjk, 8); // 這個回傳共個欄位 — eight ideographs
  assert.equal(counts.latinWords, 2); // API, OK
  assert.equal(counts.numbers, 2); // 200, 3
  assert.equal(counts.cjkPunct, 2); // the full-width comma and the full stop
});

test('full-width Latin letters are not punctuation', () => {
  const counts = analyze('\uff21\uff22\uff23\uff0c\u3002');
  assert.equal(counts.cjkPunct, 2);
  assert.equal(counts.cjk, 0);
  assert.equal(counts.codePoints, 5);
});

test('graphemes, code points and UTF-16 units disagree on emoji — correctly', () => {
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  assert.equal(family.length, 8);
  assert.equal([...family].length, 5);
  assert.equal(graphemeCount(family), 1);

  const counts = analyze(family);
  assert.equal(counts.utf16, 8);
  assert.equal(counts.codePoints, 5);
  assert.equal(counts.graphemes, 1);
  assert.equal(counts.utf8Bytes, 4 + 3 + 4 + 3 + 4);
});

test('a single non-BMP ideograph is one CJK character', () => {
  const counts = analyze('\u{20BB7}'); // CJK Extension B
  assert.equal(counts.cjk, 1);
  assert.equal(counts.codePoints, 1);
  assert.equal(counts.utf16, 2);
  assert.equal(counts.utf8Bytes, 4);
});

test('CRLF, LF and CR all give the same line count', () => {
  assert.deepEqual(splitLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
  assert.equal(analyze('a\r\nb').lines, 2);
  assert.equal(analyze('a\nb').lines, 2);
  assert.equal(analyze('a\n').lines, 2); // trailing newline opens an empty last line
  assert.equal(analyze('a\n').blankLines, 1);
});

test('paragraphs are blank-line separated blocks, and blank lines are not blocks', () => {
  assert.deepEqual(splitParagraphs('one\n\ntwo\n\n\nthree'), ['one', 'two', 'three']);
  assert.deepEqual(splitParagraphs('\n\n  \n\n'), []);
  // An ideographic space on the "blank" line still separates.
  assert.deepEqual(splitParagraphs('a\n　\nb'), ['a', 'b']);
  assert.equal(analyze('a\n\nb').paragraphs, 2);
});

test('word tokens keep apostrophes, hyphens and decimal points', () => {
  assert.deepEqual(countWords("don't"), { latinWords: 1, numbers: 0 });
  assert.deepEqual(countWords('state-of-the-art'), { latinWords: 1, numbers: 0 });
  assert.deepEqual(countWords('3.14'), { latinWords: 0, numbers: 1 });
  assert.deepEqual(countWords('3D printing'), { latinWords: 2, numbers: 0 });
  assert.deepEqual(countWords('a  b\tc\nd'), { latinWords: 4, numbers: 0 });
  assert.deepEqual(countWords('   '), { latinWords: 0, numbers: 0 });
});

test('sentence ends: full-width always, ASCII only on a boundary', () => {
  assert.equal(countSentences('Hello world. How are you? Fine!'), 3);
  assert.equal(countSentences('你好。這是第二句!'), 2);
  assert.equal(countSentences('3.5 公里'), 0); // a decimal point is not a sentence
  assert.equal(countSentences('Wait...'), 1); // one run of dots, one end
  assert.equal(countSentences('他說:「好。」'), 1);
  assert.equal(countSentences('no terminator here'), 0);
});

test('reading time times each script at its own rate and adds them', () => {
  const counts = analyze('a '.repeat(200).trim() + '中'.repeat(300));
  const reading = readingTime(counts, DEFAULT_RATES);
  assert.equal(counts.latinWords, 200);
  assert.equal(counts.cjk, 300);
  assert.equal(Math.round(reading.latinSeconds), 60);
  assert.equal(Math.round(reading.cjkSeconds), 60);
  assert.equal(Math.round(reading.seconds), 120);
});

test('a zero or negative rate falls back instead of dividing by zero', () => {
  const counts = analyze('word '.repeat(100));
  const reading = readingTime(counts, { cjkPerMinute: 0, wordsPerMinute: -5 });
  assert.ok(Number.isFinite(reading.seconds));
  assert.equal(Math.round(reading.seconds), 30);
});

test('durations read the way a person would say them', () => {
  assert.equal(formatDuration(0, true), '0 秒');
  assert.equal(formatDuration(0.4, true), '不到 1 秒');
  assert.equal(formatDuration(0.4, false), 'under 1s');
  assert.equal(formatDuration(45, true), '45 秒');
  assert.equal(formatDuration(60, true), '1 分');
  assert.equal(formatDuration(80, true), '1 分 20 秒');
  assert.equal(formatDuration(80, false), '1m 20s');
  assert.equal(formatDuration(Number.NaN, true), '0 秒');
});

test('frequency ranks tokens and folds case, with CJK per character', () => {
  const top = frequency('the The THE cat cat 貓 貓 貓', { limit: 3 });
  assert.deepEqual(
    top.map((entry) => [entry.token, entry.n]),
    [['the', 3], ['貓', 3], ['cat', 2]]
  );
  assert.equal(top[0].share, 3 / 8);

  const cased = frequency('the The', { ignoreCase: false, limit: 5 });
  assert.equal(cased.length, 2);

  const long = frequency('a bb ccc', { minLength: 2, limit: 5 });
  assert.deepEqual(long.map((entry) => entry.token), ['bb', 'ccc']);

  assert.deepEqual(frequency('貓 cat', { includeCjk: false, limit: 5 }).map((e) => e.token), ['cat']);
  assert.deepEqual(frequency('', { limit: 5 }), []);
});

test('oversized input is truncated and says so rather than being counted wrong', () => {
  const counts = analyze('x'.repeat(MAX_INPUT + 10));
  assert.equal(counts.truncated, true);
  assert.equal(counts.utf16, MAX_INPUT);
  assert.equal(analyze('x').truncated, false);
});
