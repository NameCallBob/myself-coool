import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOMS,
  ERROR_CAP,
  FINDING_CAP,
  INVISIBLE,
  UTF8_ERROR_TEXT,
  analyzeText,
  convertEndings,
  detectBom,
  ensureFinalNewline,
  findInvisibles,
  markInvisibles,
  removeFinalNewline,
  removeInvisibles,
  stripBom,
  stripBomChar,
  trimTrailingWhitespace,
  validateUtf8,
} from './logic.ts';

const NBSP = ' ';
const ZWSP = '​';
const BOM = '﻿';
const bytes = (...values: number[]) => new Uint8Array(values);

test('CRLF is counted as one ending, not as a CR plus an LF', () => {
  const report = analyzeText('a\r\nb\r\nc');
  assert.equal(report.crlf, 2);
  assert.equal(report.cr, 0);
  assert.equal(report.lf, 0);
  assert.equal(report.mixed, false);
  assert.equal(report.dominant, 'crlf');
  assert.equal(report.lines, 3);
  assert.equal(report.finalNewline, false);
});

test('mixed endings are named, with the majority reported', () => {
  const report = analyzeText('a\r\nb\nc\nd\rE');
  assert.equal(report.crlf, 1);
  assert.equal(report.lf, 2);
  assert.equal(report.cr, 1);
  assert.equal(report.mixed, true);
  assert.equal(report.dominant, 'lf');
  assert.equal(report.lines, 5);
});

test('line counts handle the empty, single-line and trailing-newline cases', () => {
  assert.equal(analyzeText('').lines, 0);
  assert.equal(analyzeText('').dominant, null);
  assert.equal(analyzeText('one line').lines, 1);
  assert.equal(analyzeText('one line\n').lines, 1);
  assert.equal(analyzeText('one line\n').finalNewline, true);
  assert.equal(analyzeText('a\n\nb').lines, 3);
  assert.equal(analyzeText('\n').lines, 1);
});

test('trailing whitespace is reported by line number', () => {
  const report = analyzeText('clean\ntrailing \nalso\t\nfine');
  assert.deepEqual(report.trailingWhitespace, [2, 3]);
  assert.equal(report.tabs, 1);
  assert.deepEqual(analyzeText('none here').trailingWhitespace, []);
  assert.equal(analyzeText('ab\ncdef\ng').longestLine, 4);
});

test('converting endings is idempotent and round-trips', () => {
  const source = 'a\r\nb\nc\rd';
  assert.equal(convertEndings(source, 'lf'), 'a\nb\nc\nd');
  assert.equal(convertEndings(source, 'crlf'), 'a\r\nb\r\nc\r\nd');
  assert.equal(convertEndings(source, 'cr'), 'a\rb\rc\rd');
  for (const to of ['lf', 'crlf', 'cr'] as const) {
    const once = convertEndings(source, to);
    assert.equal(convertEndings(once, to), once, `${to} is not idempotent`);
    assert.equal(convertEndings(once, 'lf'), 'a\nb\nc\nd');
  }
  assert.equal(convertEndings('', 'crlf'), '');
  // A CR immediately followed by LF must never become two endings.
  assert.equal(analyzeText(convertEndings('a\r\nb', 'crlf')).crlf, 1);
});

test('whitespace and final-newline fixes do exactly what they say', () => {
  assert.equal(trimTrailingWhitespace('a  \nb\t\t\nc '), 'a\nb\nc');
  assert.equal(trimTrailingWhitespace('keep  inner  spaces'), 'keep  inner  spaces');
  assert.equal(trimTrailingWhitespace('a  \r\nb'), 'a\r\nb');
  assert.equal(ensureFinalNewline('a'), 'a\n');
  assert.equal(ensureFinalNewline('a\n'), 'a\n');
  assert.equal(ensureFinalNewline('a', 'crlf'), 'a\r\n');
  assert.equal(ensureFinalNewline(''), '');
  assert.equal(removeFinalNewline('a\r\n'), 'a');
  assert.equal(removeFinalNewline('a\n\n'), 'a\n');
  assert.equal(removeFinalNewline('a'), 'a');
});

test('byte-order marks are detected longest-first', () => {
  // UTF-32LE starts with the UTF-16LE signature; order decides the answer.
  assert.deepEqual(detectBom(bytes(0xff, 0xfe, 0x00, 0x00)), { kind: 'utf32le', length: 4 });
  assert.deepEqual(detectBom(bytes(0xff, 0xfe, 0x41, 0x00)), { kind: 'utf16le', length: 2 });
  assert.deepEqual(detectBom(bytes(0x00, 0x00, 0xfe, 0xff)), { kind: 'utf32be', length: 4 });
  assert.deepEqual(detectBom(bytes(0xfe, 0xff, 0x00, 0x41)), { kind: 'utf16be', length: 2 });
  assert.deepEqual(detectBom(bytes(0xef, 0xbb, 0xbf, 0x61)), { kind: 'utf8', length: 3 });
  assert.equal(detectBom(bytes(0x61, 0x62)), null);
  assert.equal(detectBom(bytes()), null);
  assert.equal(detectBom(bytes(0xff)), null);
  assert.equal(BOMS[0].kind, 'utf32le');
});

test('stripping a BOM leaves the rest of the bytes untouched', () => {
  assert.deepEqual(stripBom(bytes(0xef, 0xbb, 0xbf, 0x61, 0x62)), bytes(0x61, 0x62));
  assert.deepEqual(stripBom(bytes(0x61, 0x62)), bytes(0x61, 0x62));
  assert.deepEqual(stripBom(bytes()), bytes());
  assert.equal(stripBomChar(`${BOM}#!/bin/sh`), '#!/bin/sh');
  assert.equal(stripBomChar('#!/bin/sh'), '#!/bin/sh');
  // Only a leading one: a U+FEFF in the middle is a zero-width no-break space.
  assert.equal(stripBomChar(`a${BOM}b`), `a${BOM}b`);
});

test('valid UTF-8 at every sequence length passes', () => {
  const cases: [number[], number][] = [
    [[], 0],
    [[0x41, 0x42], 2],
    [[0xc2, 0x80], 1], // U+0080, the shortest two-byte sequence
    [[0xdf, 0xbf], 1], // U+07FF
    [[0xe0, 0xa0, 0x80], 1], // U+0800
    [[0xef, 0xbf, 0xbf], 1], // U+FFFF
    [[0xf0, 0x90, 0x80, 0x80], 1], // U+10000
    [[0xf4, 0x8f, 0xbf, 0xbf], 1], // U+10FFFF, the last code point
    [[0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd], 2], // 你好
  ];
  for (const [input, codePoints] of cases) {
    const report = validateUtf8(bytes(...input));
    assert.equal(report.ok, true, input.join(' '));
    assert.equal(report.codePoints, codePoints, input.join(' '));
    assert.equal(report.errorCount, 0);
  }
});

test('each UTF-8 failure class is detected and named correctly', () => {
  const cases: [number[], string][] = [
    [[0x80], 'stray-continuation'],
    [[0xbf], 'stray-continuation'],
    [[0xc0, 0x80], 'invalid-lead'], // overlong NUL, refused at the lead byte
    [[0xc1, 0xbf], 'invalid-lead'],
    [[0xf5, 0x80, 0x80, 0x80], 'invalid-lead'], // above U+10FFFF
    [[0xfe], 'invalid-lead'],
    [[0xff], 'invalid-lead'],
    [[0xe4, 0xbd], 'truncated'],
    [[0xf0, 0x9f], 'truncated'],
    [[0xe0, 0x80, 0xaf], 'overlong'], // U+002F written in three bytes
    [[0xf0, 0x80, 0x80, 0xaf], 'overlong'],
    [[0xed, 0xa0, 0x80], 'surrogate'], // U+D800
    [[0xed, 0xbf, 0xbf], 'surrogate'], // U+DFFF
    [[0xf4, 0x90, 0x80, 0x80], 'out-of-range'], // U+110000
  ];
  for (const [input, kind] of cases) {
    const report = validateUtf8(bytes(...input));
    assert.equal(report.ok, false, input.join(' '));
    assert.equal(report.errors[0].kind, kind, input.join(' '));
    assert.equal(report.errors[0].offset, 0);
    assert.ok(UTF8_ERROR_TEXT[report.errors[0].kind].zh.length > 0);
  }
});

test('a missing continuation byte resumes at the byte that broke it', () => {
  // 'E4 28 AD': the 0x28 is a perfectly good ASCII '(' and must not be eaten.
  const report = validateUtf8(bytes(0xe4, 0x28, 0xad));
  assert.equal(report.errors[0].kind, 'bad-continuation');
  assert.equal(report.errors[0].offset, 0);
  assert.equal(report.errors[1].kind, 'stray-continuation');
  assert.equal(report.errors[1].offset, 2);
  assert.equal(report.codePoints, 1); // the '('
  assert.equal(report.errorCount, 2);
});

test('one bad byte in a large valid file is found at its exact offset', () => {
  const good = new TextEncoder().encode('台北天氣很好'.repeat(2000));
  const broken = Uint8Array.from(good);
  broken[3000] = 0xff;
  const report = validateUtf8(broken);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.offset >= 2998 && error.offset <= 3000));
  assert.equal(validateUtf8(good).ok, true);
});

test('a file of garbage reports a capped list and the true total', () => {
  const junk = new Uint8Array(1000).fill(0x80);
  const report = validateUtf8(junk);
  assert.equal(report.errorCount, 1000);
  assert.equal(report.errors.length, ERROR_CAP);
  assert.equal(report.nonAscii, 1000);
  assert.equal(report.codePoints, 0);
});

test('invisible characters are found with line and column', () => {
  const found = findInvisibles(`ok\nbad${NBSP}here\n${ZWSP}`);
  assert.equal(found.length, 2);
  assert.equal(found[0].label, 'NBSP');
  assert.equal(found[0].line, 2);
  assert.equal(found[0].column, 4);
  assert.equal(found[1].label, 'ZWSP');
  assert.equal(found[1].line, 3);
  assert.equal(found[1].column, 1);
});

test('tab, LF, CR and plain space are not reported as invisible', () => {
  assert.deepEqual(findInvisibles('a\tb\r\nc d'), []);
  assert.deepEqual(findInvisibles(''), []);
  assert.deepEqual(findInvisibles('plain text 中文 😀'), []);
});

test('the invisible scan is capped', () => {
  assert.equal(findInvisibles(ZWSP.repeat(2000)).length, FINDING_CAP);
  assert.equal(findInvisibles(ZWSP.repeat(2000), 5).length, 5);
  assert.ok(FINDING_CAP >= 100);
});

test('every named invisible character is actually found by the scan', () => {
  for (const key of Object.keys(INVISIBLE)) {
    const cp = Number(key);
    if (cp === 0x0a) continue; // LF is structure, not a finding
    const found = findInvisibles(`a${String.fromCodePoint(cp)}b`);
    assert.equal(found.length, 1, `U+${cp.toString(16)} not found`);
    assert.equal(found[0].label, INVISIBLE[cp]);
  }
});

test('marking spells out what is there, and CRLF stays one marker', () => {
  assert.equal(markInvisibles('a\r\nb'), 'a⟨CRLF⟩\nb');
  assert.equal(markInvisibles('a\nb'), 'a⟨LF⟩\nb');
  assert.equal(markInvisibles('a\rb'), 'a⟨CR⟩\nb');
  assert.equal(markInvisibles('a\tb'), 'a⟨TAB⟩b');
  assert.equal(markInvisibles(`a${NBSP}b`), 'a⟨NBSP⟩b');
  assert.equal(markInvisibles(`${BOM}a`), '⟨BOM / ZWNBSP⟩a');
  assert.equal(markInvisibles('plain 中文 😀'), 'plain 中文 😀');
  assert.equal(markInvisibles('a\r\nb', { endings: false }), 'a\r\nb');
  assert.equal(markInvisibles(''), '');
});

test('removing invisibles turns odd spaces into ordinary ones and drops the rest', () => {
  assert.equal(removeInvisibles(`a${NBSP}b`), 'a b');
  assert.equal(removeInvisibles(`a${ZWSP}b`), 'ab');
  assert.equal(removeInvisibles(`${BOM}#!/bin/sh`), '#!/bin/sh');
  assert.equal(removeInvisibles('a\t b\r\n'), 'a\t b\r\n');
  assert.equal(removeInvisibles('中文 😀'), '中文 😀');
  assert.deepEqual(findInvisibles(removeInvisibles(`x${NBSP}${ZWSP}‮y`)), []);
});
