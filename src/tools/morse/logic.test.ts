import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ICAO_DIGITS,
  MORSE,
  NATO,
  PROSIGNS,
  SPOKEN_PUNCTUATION,
  ditSeconds,
  durationSeconds,
  fromMorse,
  fromNato,
  morseUnits,
  normaliseMorse,
  timing,
  toMorse,
  toNato,
} from './logic.ts';

test('the table matches ITU-R M.1677-1 for the letters everyone knows', () => {
  assert.equal(MORSE.E, '.');
  assert.equal(MORSE.T, '-');
  assert.equal(MORSE.A, '.-');
  assert.equal(MORSE.S, '...');
  assert.equal(MORSE.O, '---');
  assert.equal(MORSE.H, '....');
  assert.equal(MORSE['5'], '.....');
  assert.equal(MORSE['0'], '-----');
  assert.equal(MORSE['?'], '..--..');
  assert.equal(MORSE['@'], '.--.-.'); // added by the ITU in 2004
  assert.equal(MORSE.$, '...-..-'); // seven elements, the longest in the table
  // Every code is made of dots and dashes only, and no two characters share one.
  const codes = Object.values(MORSE);
  for (const code of codes) assert.match(code, /^[.-]{1,7}$/);
  assert.equal(new Set(codes).size, codes.length, 'two characters share a code');
  assert.equal(Object.keys(MORSE).length, 26 + 10 + 18);
});

test('encoding uses one space between letters and a slash between words', () => {
  assert.equal(toMorse('SOS').code, '... --- ...');
  assert.equal(toMorse('HELLO WORLD').code, '.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
  assert.equal(toMorse('hello').code, '.... . .-.. .-.. ---');
  assert.equal(toMorse('').code, '');
  assert.equal(toMorse('   ').code, '');
  assert.equal(toMorse('A').code, '.-');
});

test('separators are configurable without changing the codes', () => {
  assert.equal(toMorse('AB', { letterSep: '/' }).code, '.-/-...');
  assert.equal(toMorse('A B', { wordSep: '|' }).code, '.- | -...');
  assert.equal(toMorse('A B', { letterSep: ' ', wordSep: '/' }).code, '.- / -...');
});

test('accents are folded, and what cannot be sent is named', () => {
  assert.equal(toMorse('café').code, toMorse('cafe').code);
  assert.deepEqual(toMorse('café').unknown, []);
  assert.deepEqual(toMorse('café', { fold: false }).unknown, ['é']);
  const chinese = toMorse('台北 101');
  assert.deepEqual(chinese.unknown, ['台', '北']);
  assert.equal(chinese.code, '.---- ----- .----');
  assert.deepEqual(toMorse('😀').unknown, ['😀']);
});

test('decoding is the inverse for everything the table covers', () => {
  const alphabet = Object.keys(MORSE).join('');
  const encoded = toMorse(alphabet);
  assert.deepEqual(encoded.unknown, []);
  assert.equal(fromMorse(encoded.code).text, alphabet);

  for (const sample of ['SOS', 'HELLO WORLD', 'ABC 123', 'A', 'E T', "IT'S 100% -- NO"]) {
    const round = fromMorse(toMorse(sample).code).text;
    // Encoding folds case and drops what it cannot send, so compare upper-cased
    // and with the unsendable characters removed.
    const expected = [...sample.toUpperCase()]
      .filter((ch) => ch === ' ' || ch in MORSE)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    assert.equal(round, expected, sample);
  }
});

test('decoding accepts every separator and glyph people paste', () => {
  assert.equal(fromMorse('... --- ...').text, 'SOS');
  assert.equal(fromMorse('...  ---  ...').text, 'SOS');
  assert.equal(fromMorse('.- / -...').text, 'A B');
  assert.equal(fromMorse('.- | -...').text, 'A B');
  assert.equal(fromMorse('.-    -...').text, 'A B'); // three or more spaces
  assert.equal(fromMorse('·−· ').text, 'R');
  assert.equal(fromMorse('._. ').text, 'R');
  assert.equal(fromMorse('  ... --- ...  ').text, 'SOS');
  assert.equal(fromMorse('').text, '');
  assert.equal(fromMorse('   ').text, '');
});

test('an unrecognised code is flagged rather than guessed', () => {
  const result = fromMorse('... -------- ...');
  assert.equal(result.text, 'S�S');
  assert.deepEqual(result.unknown, ['--------']);
  assert.deepEqual(fromMorse('... --- ...').unknown, []);
});

test('normalising leaves proper morse untouched', () => {
  assert.equal(normaliseMorse('... --- ...'), '... --- ...');
  assert.equal(normaliseMorse('•−•'), '.-.');
  assert.equal(normaliseMorse('.　.'), '. .');
  assert.equal(normaliseMorse(''), '');
});

test('PARIS is fifty units, which is what defines words per minute', () => {
  // 43 units for the word itself, plus the seven-unit gap that follows it.
  assert.equal(morseUnits(toMorse('PARIS').code), 43);
  assert.equal(morseUnits(toMorse('PARIS PARIS').code), 43 * 2 + 7);
  // At 20 wpm a unit is 60 ms, so PARIS plus its gap takes exactly 3 seconds.
  assert.ok(Math.abs(ditSeconds(20) - 0.06) < 1e-9);
  assert.ok(Math.abs((morseUnits(toMorse('PARIS').code) + 7) * ditSeconds(20) - 3) < 1e-9);
});

test('unit counting follows the 1/3/1/3/7 rule exactly', () => {
  assert.equal(morseUnits('.'), 1);
  assert.equal(morseUnits('-'), 3);
  assert.equal(morseUnits('.-'), 1 + 1 + 3); // dit, gap, dah
  assert.equal(morseUnits('. .'), 1 + 3 + 1); // two letters
  assert.equal(morseUnits('. / .'), 1 + 7 + 1); // two words
  assert.equal(morseUnits('... --- ...'), 27);
  assert.equal(morseUnits(''), 0);
});

test('timing gives alternating on and off runs that add up', () => {
  assert.deepEqual(timing('.-'), [
    { on: true, units: 1 },
    { on: false, units: 1 },
    { on: true, units: 3 },
  ]);
  const segments = timing('... --- ...');
  assert.equal(segments[0].on, true);
  for (let i = 1; i < segments.length; i += 1) {
    assert.notEqual(segments[i].on, segments[i - 1].on, `two runs of the same kind at ${i}`);
  }
  assert.equal(segments.reduce((n, s) => n + s.units, 0), 27);
  assert.deepEqual(timing(''), []);
  assert.deepEqual(timing('   '), []);
});

test('duration scales inversely with speed and is zero for nonsense speeds', () => {
  const code = toMorse('PARIS').code;
  assert.ok(Math.abs(durationSeconds(code, 10) - durationSeconds(code, 20) * 2) < 1e-9);
  assert.equal(durationSeconds(code, 0), 0);
  assert.equal(durationSeconds(code, -5), 0);
  assert.equal(ditSeconds(Number.NaN), 0);
});

test('prosigns are listed as symbols, not as characters', () => {
  const sos = PROSIGNS.find((entry) => entry.name === 'SOS');
  assert.equal(sos?.code, '...---...');
  // Sent as one symbol: nine elements (3+9+3 = 15 units) and eight one-unit
  // gaps between them, so 23. As three letters the two inter-letter gaps cost
  // three each instead of one, so 27.
  assert.equal(morseUnits('...---...'), 15 + 8);
  assert.equal(morseUnits('... --- ...'), 15 + 6 + 3 + 3);
  assert.notEqual(morseUnits('...---...'), morseUnits('... --- ...'));
  for (const entry of PROSIGNS) {
    assert.match(entry.code, /^[.-]+$/);
    assert.ok(entry.meaning.zh.length > 0 && entry.meaning.en.length > 0);
  }
});

test('the NATO alphabet is the official spelling, oddities included', () => {
  assert.equal(NATO.A, 'Alfa'); // not Alpha
  assert.equal(NATO.J, 'Juliett'); // two Ts
  assert.equal(NATO.X, 'Xray');
  assert.equal(NATO.Q, 'Quebec');
  assert.equal(Object.keys(NATO).length, 36);
  for (const word of Object.values(NATO)) assert.match(word, /^[A-Z][a-z]+$/);
});

test('ICAO digits differ from NATO digits where a radio would confuse them', () => {
  assert.equal(ICAO_DIGITS['3'], 'Tree');
  assert.equal(ICAO_DIGITS['4'], 'Fower');
  assert.equal(ICAO_DIGITS['5'], 'Fife');
  assert.equal(ICAO_DIGITS['9'], 'Niner');
  assert.equal(ICAO_DIGITS['0'], 'Zero');
  assert.equal(ICAO_DIGITS['6'], NATO['6']);
  assert.equal(Object.keys(ICAO_DIGITS).length, 10);
});

test('spelling a code out reads one symbol at a time', () => {
  assert.deepEqual(toNato('AB1').words, ['Alfa', 'Bravo', 'One']);
  assert.deepEqual(toNato('AB1', { icao: true }).words, ['Alfa', 'Bravo', 'Wun']);
  assert.deepEqual(toNato('A-1').words, ['Alfa', 'Dash', 'One']);
  assert.deepEqual(toNato('A-1', { punctuation: false }).words, ['Alfa', 'One']);
  assert.deepEqual(toNato('').words, []);
});

test('case is only called out when the input actually mixes it', () => {
  assert.deepEqual(toNato('ABC').words, ['Alfa', 'Bravo', 'Charlie']);
  assert.deepEqual(toNato('abc').words, ['Alfa', 'Bravo', 'Charlie']);
  assert.deepEqual(toNato('aB').words, ['small Alfa', 'capital Bravo']);
});

test('what cannot be spelled out is reported', () => {
  const result = toNato('A台');
  assert.deepEqual(result.words, ['Alfa']);
  assert.deepEqual(result.unknown, ['台']);
});

test('reading a spelled code back works, including the unofficial spellings', () => {
  assert.equal(fromNato('Alfa Bravo Charlie').text, 'ABC');
  assert.equal(fromNato('alpha juliet x-ray whisky').text, 'AJXW');
  assert.equal(fromNato('Tree Fower Fife Niner').text, '3459');
  assert.equal(fromNato('Three Four Five Nine').text, '3459');
  assert.equal(fromNato('capital Alfa small Bravo').text, 'AB');
  assert.equal(fromNato('Alfa, Bravo; Charlie').text, 'ABC');
  assert.equal(fromNato('').text, '');
  const bad = fromNato('Alfa Nonsense');
  assert.equal(bad.text, 'A�');
  assert.deepEqual(bad.unknown, ['nonsense']);
});

test('spelling out a code and reading it back is a round trip', () => {
  for (const sample of ['ABC123', 'A1B2C3', 'XYZ', '0123456789']) {
    assert.equal(fromNato(toNato(sample).words.join(' ')).text, sample, sample);
    assert.equal(fromNato(toNato(sample, { icao: true }).words.join(' ')).text, sample, sample);
  }
});

test('the spoken punctuation table covers what appears in a reference code', () => {
  for (const ch of ['-', '_', '.', '@', '/', ':']) {
    assert.ok(ch in SPOKEN_PUNCTUATION, ch);
  }
  assert.equal(SPOKEN_PUNCTUATION['@'], 'At');
});
