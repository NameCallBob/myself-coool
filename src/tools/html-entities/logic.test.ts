import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CP1252,
  NAMED_COUNT,
  NAMED_CP,
  NAME_OF,
  REPLACEMENT,
  TABLE_VERSION,
  charFromCodePoint,
  countC1,
  decodeEntities,
  encodeEntities,
  entityRows,
  inspectEntities,
} from './logic.ts';

test('the table is HTML 4.01 plus apos, with the well-known code points', () => {
  assert.equal(NAMED_COUNT, 253);
  assert.match(TABLE_VERSION, /HTML 4\.01/);
  assert.equal(NAMED_CP.amp, 0x26);
  assert.equal(NAMED_CP.nbsp, 0xa0);
  assert.equal(NAMED_CP.copy, 0xa9);
  assert.equal(NAMED_CP.mdash, 0x2014);
  assert.equal(NAMED_CP.euro, 0x20ac);
  assert.equal(NAMED_CP.hearts, 0x2665);
  assert.equal(NAMED_CP.notin, 0x2209);
  // Final sigma is a separate entity from sigma; getting these two the wrong
  // way round is the classic transcription slip.
  assert.equal(NAMED_CP.sigmaf, 0x3c2);
  assert.equal(NAMED_CP.sigma, 0x3c3);
  // There is no Sigmaf, and no entity for U+03A2, which Greek does not use.
  assert.equal('Sigmaf' in NAMED_CP, false);
});

test('the reverse map never collides and covers every code point in the table', () => {
  const cps = new Set(Object.values(NAMED_CP));
  assert.equal(Object.keys(NAME_OF).length, cps.size);
  for (const cp of cps) assert.ok(NAME_OF[cp] in NAMED_CP);
  assert.equal(NAME_OF[0x26], 'amp');
  assert.equal(NAME_OF[0x27], 'apos');
});

test('minimal scope escapes only what a parser could misread', () => {
  assert.equal(encodeEntities('<a href="x">&y</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;');
  assert.equal(encodeEntities("it's"), 'it&#39;s');
  assert.equal(encodeEntities('中文 é 😀'), '中文 é 😀');
  assert.equal(encodeEntities(''), '');
});

test('apos is written numerically because HTML 4 does not have the name', () => {
  assert.equal(encodeEntities("'", { prefer: 'named' }), '&#39;');
  assert.equal(encodeEntities("'", { prefer: 'hex' }), '&#x27;');
  // It still decodes, because HTML5 and XML both define it.
  assert.equal(decodeEntities('&apos;'), "'");
});

test('nonAscii scope prefers a name and falls back to a number', () => {
  assert.equal(encodeEntities('café', { scope: 'nonAscii' }), 'caf&eacute;');
  assert.equal(encodeEntities('中', { scope: 'nonAscii' }), '&#20013;');
  assert.equal(encodeEntities('中', { scope: 'nonAscii', prefer: 'hex' }), '&#x4E2D;');
  assert.equal(encodeEntities('中', { scope: 'nonAscii', prefer: 'decimal' }), '&#20013;');
  assert.equal(encodeEntities('—', { scope: 'nonAscii' }), '&mdash;');
  assert.equal(encodeEntities('—', { scope: 'nonAscii', prefer: 'decimal' }), '&#8212;');
});

test('an emoji is one reference, not two surrogate references', () => {
  assert.equal(encodeEntities('😀', { scope: 'nonAscii' }), '&#128512;');
  assert.equal(encodeEntities('😀', { scope: 'nonAscii', prefer: 'hex' }), '&#x1F600;');
  assert.equal(decodeEntities('&#128512;'), '😀');
  assert.equal(decodeEntities('&#x1F600;'), '😀');
  // Surrogate halves written individually are not characters.
  assert.equal(decodeEntities('&#xD800;'), REPLACEMENT);
});

test('numeric references in the C1 range get the Windows-1252 treatment', () => {
  assert.equal(decodeEntities('&#151;'), '—'); // 0x97 -> U+2014
  assert.equal(decodeEntities('&#150;'), '–'); // 0x96 -> U+2013
  assert.equal(decodeEntities('&#146;'), '’'); // 0x92 -> U+2019
  assert.equal(decodeEntities('&#128;'), '€');
  assert.equal(decodeEntities('&#x80;'), '€');
  // The holes in the table stay as themselves.
  assert.equal(decodeEntities('&#129;'), '');
  assert.equal(Object.keys(CP1252).length, 27);
});

test('C1 characters are left literal because no reference can express them', () => {
  const c1 = String.fromCodePoint(0x85);
  const text = `a${c1}b`;
  assert.equal(encodeEntities(text, { scope: 'nonAscii' }), text);
  assert.equal(countC1(text), 1);
  assert.equal(countC1('plain'), 0);
  assert.equal(countC1(`${String.fromCodePoint(0x80)}${String.fromCodePoint(0x9f)}`), 2);
  // Written as a reference it would come back as an ellipsis instead.
  assert.notEqual(decodeEntities('&#133;'), c1);
});

test('illegal code points become the replacement character, as HTML says', () => {
  assert.equal(charFromCodePoint(0), REPLACEMENT);
  assert.equal(charFromCodePoint(0x110000), REPLACEMENT);
  assert.equal(charFromCodePoint(0xdfff), REPLACEMENT);
  assert.equal(charFromCodePoint(0x41), 'A');
  assert.equal(charFromCodePoint(0x97), '—');
  assert.equal(decodeEntities('&#0;'), REPLACEMENT);
  assert.equal(decodeEntities('&#x110000;'), REPLACEMENT);
});

test('decoding leaves anything that is not a reference exactly as it was', () => {
  assert.equal(decodeEntities('AT&T'), 'AT&T');
  assert.equal(decodeEntities('a & b'), 'a & b');
  assert.equal(decodeEntities('&unknownthing;'), '&unknownthing;');
  assert.equal(decodeEntities('&#;'), '&#;');
  assert.equal(decodeEntities('&#x;'), '&#x;');
  assert.equal(decodeEntities('&'), '&');
  assert.equal(decodeEntities(''), '');
  assert.equal(decodeEntities('&&amp;&'), '&&&');
});

test('a missing semicolon is only resolved in lenient mode, longest match first', () => {
  assert.equal(decodeEntities('&amp'), '&amp');
  assert.equal(decodeEntities('&amp', { lenient: true }), '&');
  assert.equal(decodeEntities('&notin', { lenient: true }), '∉');
  assert.equal(decodeEntities('&notit', { lenient: true }), '¬it');
  assert.equal(decodeEntities('&#65', { lenient: true }), 'A');
  assert.equal(decodeEntities('&#65'), '&#65');
  // A single letter is never a name, so it cannot swallow one character.
  assert.equal(decodeEntities('&a', { lenient: true }), '&a');
});

test('adjacent and repeated references all resolve', () => {
  assert.equal(decodeEntities('&lt;&gt;&amp;&quot;&apos;'), '<>&"\'');
  assert.equal(decodeEntities('&copy;&nbsp;2026'), '© 2026');
  assert.equal(decodeEntities('x&amp;amp;y'), 'x&amp;y');
});

test('round trip holds for every character in the table', () => {
  for (const [name, cp] of Object.entries(NAMED_CP)) {
    const ch = String.fromCodePoint(cp);
    const encoded = encodeEntities(ch, { scope: 'nonAscii' });
    assert.equal(decodeEntities(encoded), ch, `${name} (U+${cp.toString(16)})`);
  }
});

test('round trip holds for awkward real text', () => {
  const samples = [
    '',
    '<script>alert("x")</script>',
    '台北 101 & 松山',
    'naïve café — “quoted”',
    '😀🌏 mixed with <tags>',
    'tab\there\nnewline\r\ncrlf',
    '&already;&amp;encoded;',
  ];
  for (const sample of samples) {
    for (const scope of ['minimal', 'nonAscii'] as const) {
      for (const prefer of ['named', 'decimal', 'hex'] as const) {
        assert.equal(
          decodeEntities(encodeEntities(sample, { scope, prefer })),
          sample,
          `${scope}/${prefer}: ${JSON.stringify(sample)}`
        );
      }
    }
  }
});

test('inspect counts and names what it cannot resolve', () => {
  const report = inspectEntities('&amp; &rsquot; &#151; &#x41; &nbsp &notaname;');
  assert.equal(report.named, 2); // amp, nbsp (without semicolon)
  assert.equal(report.numeric, 2);
  assert.equal(report.cp1252, 1);
  assert.equal(report.missingSemicolon, 1);
  assert.deepEqual(report.unknown, ['&rsquot;', '&notaname;']);

  const clean = inspectEntities('nothing here');
  assert.equal(clean.named, 0);
  assert.equal(clean.numeric, 0);
  assert.deepEqual(clean.unknown, []);
});

test('entityRows is sorted by code point and covers the whole table', () => {
  const rows = entityRows();
  assert.equal(rows.length, NAMED_COUNT);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].cp >= rows[i - 1].cp, `row ${i} out of order`);
  }
  assert.equal(rows[0].name, 'quot');
  assert.equal(rows.at(-1)?.name, 'diams');
  assert.equal(rows.find((row) => row.name === 'copy')?.char, '©');
});

test('a long run of ampersands does not blow up', () => {
  const nasty = '&'.repeat(50_000);
  assert.equal(decodeEntities(nasty), nasty);
  assert.equal(decodeEntities(`${'&amp;'.repeat(10_000)}`).length, 10_000);
});
