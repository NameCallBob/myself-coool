import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMON_WORDS,
  LEET,
  MAX_LENGTH,
  REFERENCE_YEAR,
  TOP_PASSWORDS,
  adviceFor,
  allMatches,
  bruteforceCardinality,
  capitalizationVariants,
  choose,
  coverage,
  dateMatches,
  dictionaryMatches,
  estimate,
  guessTime,
  keyboardMatches,
  leetVariants,
  repeatMatches,
  scoreOf,
  sequenceMatches,
  spatialGuesses,
  unleet,
} from './logic.ts';

const kinds = (password: string) => new Set(estimate(password).sequence.map((match) => match.kind));
const tokensOf = (password: string) => estimate(password).sequence.map((match) => match.token);

/* ── Lists ─────────────────────────────────── */

test('both lists are de-duplicated and long enough to be worth consulting', () => {
  assert.ok(TOP_PASSWORDS.length > 200, `only ${TOP_PASSWORDS.length} passwords`);
  assert.ok(COMMON_WORDS.length > 2000, `only ${COMMON_WORDS.length} words`);
  assert.equal(new Set(TOP_PASSWORDS).size, TOP_PASSWORDS.length);
  assert.equal(new Set(COMMON_WORDS).size, COMMON_WORDS.length);
  for (const word of [...TOP_PASSWORDS, ...COMMON_WORDS]) {
    assert.equal(word, word.toLowerCase(), word);
    assert.ok(word.length >= 3, word);
  }
});

test('the head of the password list is in guessing order', () => {
  assert.equal(TOP_PASSWORDS[0], '123456');
  assert.equal(TOP_PASSWORDS[1], 'password');
  // Regionally common, which English-only lists miss.
  assert.ok(TOP_PASSWORDS.includes('5201314'));
  assert.ok(TOP_PASSWORDS.includes('woaini'));
});

/* ── Combinatorics ─────────────────────────── */

test('choose() is exact for the sizes used here', () => {
  assert.equal(choose(5, 0), 1);
  assert.equal(choose(5, 1), 5);
  assert.equal(choose(5, 2), 10);
  assert.equal(choose(10, 5), 252);
  assert.equal(choose(3, 5), 0);
  assert.equal(choose(3, -1), 0);
});

test('capitalisation habits cost a factor of two, anything else costs more', () => {
  assert.equal(capitalizationVariants('password'), 1);
  assert.equal(capitalizationVariants('Password'), 2);
  assert.equal(capitalizationVariants('PASSWORD'), 2);
  assert.equal(capitalizationVariants('passworD'), 2);
  assert.ok(capitalizationVariants('PaSsWoRd') > 2);
  assert.equal(capitalizationVariants('1234'), 1);
});

test('l33t substitutions are undone and priced', () => {
  assert.deepEqual(unleet('p@ssw0rd'), { plain: 'password', substitutions: 2 });
  assert.deepEqual(unleet('password'), { plain: 'password', substitutions: 0 });
  assert.equal(unleet('4ll3y').plain, 'alley');
  for (const [from, to] of Object.entries(LEET)) {
    assert.equal(unleet(from).plain, to, from);
  }
  // One of two possible a-positions substituted costs more than both.
  assert.ok(leetVariants('p@ssword', 'password') >= 2);
  assert.ok(leetVariants('p@ssw0rd', 'password') >= 4);
  assert.equal(leetVariants('password', 'password'), 1);
});

/* ── Matchers ──────────────────────────────── */

test('dictionary matches find the word, its rank and where it sits', () => {
  const found = dictionaryMatches('mypassword99');
  const hit = found.find((match) => match.token === 'password');
  assert.ok(hit, 'password was not found');
  assert.equal(hit.kind, 'dictionary');
  assert.equal(hit.i, 2);
  assert.equal(hit.j, 9);
  assert.equal(hit.detail.word, 'password');
  assert.ok((hit.detail.rank ?? 0) > 0);
});

test('a reversed word is found, and costs one bit more than forwards', () => {
  const forwards = dictionaryMatches('password').find(
    (match) => match.kind === 'dictionary' && match.detail.word === 'password'
  );
  const backwards = dictionaryMatches('drowssap').find(
    (match) => match.kind === 'reversed' && match.detail.word === 'password'
  );
  assert.ok(forwards && backwards);
  assert.ok(Math.abs(backwards.log2Guesses - forwards.log2Guesses - 1) < 1e-9);
});

test('a substituted word is found through the substitution', () => {
  const hit = dictionaryMatches('p@ssw0rd').find(
    (match) => match.kind === 'leet' && match.token === 'p@ssw0rd'
  );
  assert.ok(hit);
  assert.equal(hit.detail.word, 'password');
  // Still cheap: the substitution is worth a few bits, not a new password.
  assert.ok(hit.log2Guesses < 12, `${hit.log2Guesses} bits`);
});

test('sequences are found in both directions and priced accordingly', () => {
  const up = sequenceMatches('abcdef').find((match) => match.token === 'abcdef');
  const down = sequenceMatches('fedcba').find((match) => match.token === 'fedcba');
  assert.ok(up && down);
  assert.ok(down.log2Guesses > up.log2Guesses, 'descending must cost more');
  assert.ok(sequenceMatches('123456').some((match) => match.token === '123456'));
  assert.ok(sequenceMatches('9876').some((match) => match.token === '9876'));
  // Two characters is not a sequence.
  assert.equal(sequenceMatches('ab').length, 0);
  assert.equal(sequenceMatches('acegik').length, 0, 'steps of two are not runs');
});

test('repeats are found and cost the unit plus the repeat count', () => {
  const single = repeatMatches('aaaa').find((match) => match.token === 'aaaa');
  assert.ok(single);
  assert.equal(single.detail.repeats, 4);
  assert.equal(single.detail.base, 'a');

  const unit = repeatMatches('abcabcabc').find((match) => match.token === 'abcabcabc');
  assert.ok(unit);
  assert.equal(unit.detail.base, 'abc');
  assert.equal(unit.detail.repeats, 3);
  // Nine characters of repeat cost far less than nine random ones.
  assert.ok(unit.log2Guesses < Math.log2(26) * 9);
  assert.equal(repeatMatches('abcdef').length, 0);
});

test('keyboard runs are found on the letter rows and the keypad', () => {
  const qwerty = keyboardMatches('qwerty');
  assert.ok(qwerty.some((match) => match.token === 'qwerty'), 'qwerty run missed');
  assert.ok(keyboardMatches('asdfgh').some((match) => match.token === 'asdfgh'));
  assert.ok(keyboardMatches('1qaz2wsx').length > 0);
  assert.ok(keyboardMatches('789456').some((match) => match.detail.base === 'keypad'));
  assert.equal(keyboardMatches('q9z').length, 0, 'keys that are not adjacent are not a run');
});

test('spatial guesses grow with length and with direction changes', () => {
  const straight = spatialGuesses(6, 0, 94, 4.6);
  const turning = spatialGuesses(6, 3, 94, 4.6);
  assert.ok(turning > straight);
  assert.ok(spatialGuesses(8, 0, 94, 4.6) > straight);
  assert.ok(spatialGuesses(1, 0, 94, 4.6) >= 94);
});

test('dates are recognised in the shapes people use', () => {
  assert.ok(dateMatches('1990').some((match) => match.detail.year === 1990));
  assert.ok(dateMatches('19900101').some((match) => match.token === '19900101'));
  assert.ok(dateMatches('1990-01-01').some((match) => match.token === '1990-01-01'));
  assert.ok(dateMatches('3/14/79').length > 0);
  assert.equal(dateMatches('abc').length, 0);
  // A year near now is cheaper to guess than one far away.
  const near = dateMatches(String(REFERENCE_YEAR - 1))[0];
  const far = dateMatches('1901')[0];
  assert.ok(near.log2Guesses <= far.log2Guesses);
});

test('brute-force cardinality counts the classes actually present', () => {
  assert.equal(bruteforceCardinality('abc'), 26);
  assert.equal(bruteforceCardinality('ABC'), 26);
  assert.equal(bruteforceCardinality('abcABC'), 52);
  assert.equal(bruteforceCardinality('abc123'), 36);
  assert.equal(bruteforceCardinality('abc123!'), 69);
  assert.equal(bruteforceCardinality('123'), 10);
  assert.ok(bruteforceCardinality('密碼') > 100);
  assert.equal(bruteforceCardinality(''), 1);
});

test('allMatches gathers every matcher over one password', () => {
  const found = allMatches('password1990qwerty');
  const seen = new Set(found.map((match) => match.kind));
  assert.ok(seen.has('dictionary'));
  assert.ok(seen.has('date'));
  assert.ok(seen.has('keyboard'));
  assert.equal(allMatches('').length, 0);
});

/* ── The estimate ──────────────────────────── */

test('the worst passwords come out at almost no bits', () => {
  for (const password of ['123456', 'password', 'qwerty', 'iloveyou', '5201314', 'abc123']) {
    const result = estimate(password);
    assert.ok(result.bits < 12, `${password} scored ${result.bits.toFixed(1)} bits`);
    assert.equal(result.score, 0, password);
  }
});

test('the decomposition is the cheapest explanation, not the longest', () => {
  assert.deepEqual(tokensOf('password'), ['password']);
  assert.ok(kinds('p@ssw0rd').has('leet'));
  assert.ok(kinds('aaaaaaaa').has('repeat'));
  assert.ok(kinds('abcdefgh').has('sequence'));
  assert.ok(kinds('qwertyuiop').size === 1);
  // Two known pieces are found as two pieces.
  assert.equal(estimate('michael1990').sequence.length, 2);
});

test('a substitution does not rescue a common password', () => {
  const plain = estimate('password').bits;
  const leet = estimate('p@ssw0rd').bits;
  assert.ok(leet - plain < 10, `substitution bought ${(leet - plain).toFixed(1)} bits`);
  // And it is still far weaker than eight random characters.
  assert.ok(leet < Math.log2(62) * 8);
});

test('a genuinely random password is reported honestly, without saturating', () => {
  const random = estimate('xK7#mQ2$vL9pR4w');
  assert.ok(random.bits > 80, `${random.bits} bits`);
  assert.equal(random.score, 4);
  assert.equal(random.coverage, 0);

  // 60 characters: the estimate must stay a finite number, not Infinity.
  const long = estimate('Zq'.repeat(2) + 'K7#mQ2$vL9pR4wY6!tB3&nD8%hJ0^sF5*gA1+cE9-rU4');
  assert.ok(Number.isFinite(long.bits));
  assert.ok(long.bits > 100);
});

test('length beyond the ceiling is truncated and declared', () => {
  const long = 'a'.repeat(MAX_LENGTH + 40);
  const result = estimate(long);
  assert.ok(result.truncated);
  assert.ok(Number.isFinite(result.bits));
  assert.ok(!estimate('short').truncated);
});

test('an empty password is zero, with no pattern found', () => {
  const result = estimate('');
  assert.equal(result.bits, 0);
  assert.equal(result.score, 0);
  assert.deepEqual(result.sequence, []);
  assert.deepEqual(adviceFor('', result), ['empty']);
});

test('Unicode, emoji and spaces do not break the search', () => {
  for (const password of ['中文密碼', 'emoji \u{1F9EA} here', 'a b c', '  ', 'éèê']) {
    const result = estimate(password);
    assert.ok(Number.isFinite(result.bits), password);
    assert.ok(result.bits >= 0);
  }
  // A CJK password is not magically strong, but it is stronger per character.
  assert.ok(estimate('中文密碼').bits > estimate('abcd').bits);
});

test('coverage measures how much a known pattern explains', () => {
  assert.equal(coverage([], 0), 0);
  assert.equal(estimate('password').coverage, 1);
  assert.equal(estimate('xK7#mQ2$vL9pR4w').coverage, 0);
  const mixed = estimate('michael1990');
  assert.ok(mixed.coverage > 0.5 && mixed.coverage < 1);
});

test('a mostly-explained password is capped at "okay" whatever the arithmetic says', () => {
  // The raw band would be 4; the cap is the deliberate deviation.
  assert.ok(scoreOf(40, 0) > 2);
  assert.equal(scoreOf(40, 0.9), 2);
  assert.equal(scoreOf(90, 1), 4, 'a long explained password is still strong');
  assert.equal(estimate('michael1990').score, 2);
});

test('the score bands sit at the guess counts the comment claims', () => {
  assert.equal(scoreOf(Math.log2(999)), 0);
  assert.equal(scoreOf(Math.log2(1001)), 1);
  assert.equal(scoreOf(Math.log2(1e6) + 0.1), 2);
  assert.equal(scoreOf(Math.log2(1e8) + 0.1), 3);
  assert.equal(scoreOf(Math.log2(1e10) + 0.1), 4);
});

/* ── Time and advice ──────────────────────── */

test('guess time spans from instant to scientific notation', () => {
  assert.equal(guessTime(0, 1e10), 'instantly');
  assert.equal(guessTime(10, 1e10), 'instantly');
  assert.match(guessTime(60, 1e10), /day|hour|minute|second|year/);
  assert.match(guessTime(300, 1e10), /^1e\d+ years$/);
  // A throttled login is millions of times slower than an offline attack.
  assert.notEqual(guessTime(40, 1e3), guessTime(40, 1e10));
});

test('advice points at what was actually found', () => {
  assert.ok(adviceFor('password', estimate('password')).includes('top-password'));
  assert.ok(adviceFor('p@ssw0rd', estimate('p@ssw0rd')).includes('leet-substitution'));
  assert.ok(adviceFor('fghjkl;', estimate('fghjkl;')).includes('keyboard-run'));
  assert.ok(adviceFor('abcdefgh', estimate('abcdefgh')).includes('sequence'));
  assert.ok(adviceFor('aaaaaaaa', estimate('aaaaaaaa')).includes('repeat'));
  assert.ok(adviceFor('tiger19900101', estimate('tiger19900101')).includes('date'));
  assert.ok(adviceFor('abc', estimate('abc')).includes('too-short'));
  assert.ok(adviceFor('drowssap', estimate('drowssap')).includes('reversed-word'));

  const random = 'xK7#mQ2$vL9pR4wY6!t';
  const advice = adviceFor(random, estimate(random));
  assert.ok(advice.includes('looks-random'));
  assert.ok(!advice.includes('too-short'));
  // Every result carries the caveat about the list size.
  assert.ok(advice.includes('list-is-small'));
});
