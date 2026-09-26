import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLEAN,
  DEFAULT_PORTS,
  TRACKING_PATTERNS,
  buildQuery,
  byteLength,
  confusableLabels,
  encodeComponent,
  hostToAscii,
  hostToUnicode,
  inspect,
  isAscii,
  matchesAny,
  matchesPattern,
  parsePatterns,
  parseQuery,
  punyDecode,
  punyEncode,
  rebuild,
  safeDecode,
  scriptsOf,
  stripTracking,
} from './logic.ts';

/* ── Percent decoding ─────────────────────── */

test('safeDecode handles plus, percent escapes and broken input', () => {
  assert.deepEqual(safeDecode('a+b'), { text: 'a b', malformed: false });
  assert.deepEqual(safeDecode('%E4%B8%AD%E6%96%87'), { text: '中文', malformed: false });
  assert.deepEqual(safeDecode('%F0%9F%98%80'), { text: '😀', malformed: false });
  assert.deepEqual(safeDecode('100%'), { text: '100%', malformed: true });
  assert.deepEqual(safeDecode('%zz'), { text: '%zz', malformed: true });
  assert.deepEqual(safeDecode(''), { text: '', malformed: false });
});

/* ── Query parsing ────────────────────────── */

test('query order and duplicates survive', () => {
  assert.deepEqual(parseQuery('?b=2&a=1&b=3'), [
    { name: 'b', value: '2', hasEquals: true, malformed: false },
    { name: 'a', value: '1', hasEquals: true, malformed: false },
    { name: 'b', value: '3', hasEquals: true, malformed: false },
  ]);
});

test('an empty value and an absent value are different things', () => {
  assert.deepEqual(parseQuery('?a'), [{ name: 'a', value: '', hasEquals: false, malformed: false }]);
  assert.deepEqual(parseQuery('?a='), [{ name: 'a', value: '', hasEquals: true, malformed: false }]);
  assert.equal(buildQuery(parseQuery('?a')), 'a');
  assert.equal(buildQuery(parseQuery('?a=')), 'a=');
});

test('empty and odd queries', () => {
  assert.deepEqual(parseQuery(''), []);
  assert.deepEqual(parseQuery('?'), []);
  assert.deepEqual(parseQuery('a=1'), [{ name: 'a', value: '1', hasEquals: true, malformed: false }]);
  // A value containing '=' keeps it: only the first '=' separates.
  assert.deepEqual(parseQuery('?t=a=b'), [{ name: 't', value: 'a=b', hasEquals: true, malformed: false }]);
  assert.deepEqual(parseQuery('?&a=1'), [
    { name: '', value: '', hasEquals: false, malformed: false },
    { name: 'a', value: '1', hasEquals: true, malformed: false },
  ]);
});

test('malformed escapes are flagged, not thrown', () => {
  const pairs = parseQuery('?q=100%');
  assert.equal(pairs[0].malformed, true);
  assert.equal(pairs[0].value, '100%');
});

test('encodeComponent escapes the characters encodeURIComponent leaves', () => {
  assert.equal(encodeComponent("a!'()*b"), 'a%21%27%28%29%2Ab');
  assert.equal(encodeComponent('中文'), '%E4%B8%AD%E6%96%87');
  assert.equal(encodeComponent('a b'), 'a%20b');
});

test('query round-trips through parse and build', () => {
  for (const search of ['?a=1&b=2', '?q=%E4%B8%AD%E6%96%87', '?a&b=', '?x=1&x=2']) {
    const once = buildQuery(parseQuery(search));
    assert.equal(buildQuery(parseQuery(`?${once}`)), once, search);
  }
});

test('a space round-trips as %20, not +', () => {
  assert.equal(buildQuery(parseQuery('?q=a+b')), 'q=a%20b');
  assert.deepEqual(parseQuery('?q=a%20b')[0].value, 'a b');
});

/* ── Tracking patterns ────────────────────── */

test('pattern matching is case-insensitive with a trailing wildcard', () => {
  assert.equal(matchesPattern('utm_source', 'utm_*'), true);
  assert.equal(matchesPattern('UTM_Source', 'utm_*'), true);
  assert.equal(matchesPattern('utm', 'utm_*'), false);
  assert.equal(matchesPattern('gclid', 'gclid'), true);
  assert.equal(matchesPattern('gclid2', 'gclid'), false);
  assert.equal(matchesPattern('anything', '*'), true);
});

test('matchesAny ignores empty patterns', () => {
  assert.equal(matchesAny('fbclid', ['', 'fbclid']), true);
  assert.equal(matchesAny('id', ['']), false);
  assert.equal(matchesAny('id', []), false);
});

test('the shipped list removes the parameters it claims to and nothing else', () => {
  const pairs = parseQuery(
    '?id=42&utm_source=news&utm_medium=email&fbclid=abc&gclid=def&page=3&q=utm_source'
  );
  const { kept, removed } = stripTracking(pairs, TRACKING_PATTERNS);
  assert.deepEqual(
    kept.map((pair) => pair.name),
    ['id', 'page', 'q'],
    'a parameter whose *value* mentions utm_source is content, not tracking'
  );
  assert.deepEqual(removed.map((pair) => pair.name), ['utm_source', 'utm_medium', 'fbclid', 'gclid']);
});

test('the list has no duplicates and no stray whitespace', () => {
  assert.equal(new Set(TRACKING_PATTERNS).size, TRACKING_PATTERNS.length);
  for (const pattern of TRACKING_PATTERNS) assert.equal(pattern, pattern.trim());
});

test('parsePatterns splits on commas, spaces and newlines', () => {
  assert.deepEqual(parsePatterns('utm_*, gclid\nfbclid  '), ['utm_*', 'gclid', 'fbclid']);
  assert.deepEqual(parsePatterns('   '), []);
  assert.deepEqual(parsePatterns(''), []);
});

/* ── Punycode ─────────────────────────────── */

test('punycode decodes the canonical examples', () => {
  assert.equal(punyDecode('bcher-kva'), 'bücher');
  assert.equal(punyDecode('mller-kva'), 'müller');
  assert.equal(punyDecode('fiqs8s'), '中国');
  assert.equal(punyDecode('fiqz9s'), '中國');
  assert.equal(punyDecode('kpry57d'), '台灣');
  assert.equal(punyDecode('kprw13d'), '台湾');
});

test('punycode encodes back to the same labels', () => {
  assert.equal(punyEncode('bücher'), 'bcher-kva');
  assert.equal(punyEncode('müller'), 'mller-kva');
  assert.equal(punyEncode('中国'), 'fiqs8s');
  assert.equal(punyEncode('台灣'), 'kpry57d');
});

test('punycode round-trips, including emoji and mixed labels', () => {
  for (const label of ['中文', '日本語', '한국어', 'café', 'mañana', 'ÅÄÖ', '😀', 'a1中b2', 'ελληνικά']) {
    assert.equal(punyDecode(punyEncode(label)), label, label);
  }
});

test('an all-ASCII label encodes to itself plus the delimiter', () => {
  assert.equal(punyEncode('abc'), 'abc-');
  assert.equal(punyDecode('abc-'), 'abc');
  assert.equal(punyEncode(''), '');
  assert.equal(punyDecode(''), '');
});

test('invalid punycode is rejected rather than producing mojibake', () => {
  assert.equal(punyDecode('!!'), null, 'not base-36 digits');
  assert.equal(punyDecode('a-!'), null);
  assert.equal(punyDecode("z".repeat(32)), null, 'the decoded code point runs past U+10FFFF');
  assert.equal(punyDecode('999999999999'), null, 'same, via the digit range');
  assert.equal(punyDecode('-a'), null, 'nothing before the delimiter to be basic text');
});

test('hostToUnicode only touches xn-- labels', () => {
  assert.equal(hostToUnicode('xn--fiqs8s'), '中国');
  assert.equal(hostToUnicode('www.xn--fiqs8s.cn'), 'www.中国.cn');
  assert.equal(hostToUnicode('XN--fiqs8s'), '中国', 'the prefix is case-insensitive');
  assert.equal(hostToUnicode('example.com'), 'example.com');
  assert.equal(hostToUnicode('xn--not-valid-punycode-!'), 'xn--not-valid-punycode-!', 'left alone when undecodable');
});

test('hostToAscii only touches non-ASCII labels', () => {
  assert.equal(hostToAscii('中国.cn'), 'xn--fiqs8s.cn');
  assert.equal(hostToAscii('example.com'), 'example.com');
  assert.equal(hostToUnicode(hostToAscii('台灣.example')), '台灣.example');
});

test('isAscii', () => {
  assert.equal(isAscii('abc-123'), true);
  assert.equal(isAscii(''), true);
  assert.equal(isAscii('café'), false);
  assert.equal(isAscii('😀'), false);
});

/* ── Confusable scripts ───────────────────── */

test('scriptsOf names the alphabets present', () => {
  assert.deepEqual(scriptsOf('apple'), ['Latin']);
  assert.deepEqual(scriptsOf('аpple'), ['Cyrillic', 'Latin'], 'leading Cyrillic а');
  assert.deepEqual(scriptsOf('中文'), ['Han']);
  assert.deepEqual(scriptsOf('テスト'), ['Kana']);
  assert.deepEqual(scriptsOf('한국'), ['Hangul']);
  assert.deepEqual(scriptsOf('café'), ['Latin'], 'Latin-1 Supplement is still Latin');
  assert.deepEqual(scriptsOf('mañana'), ['Latin']);
  assert.deepEqual(scriptsOf('123-'), [], 'digits and hyphens belong to no alphabet');
});

test('confusableLabels flags mixed look-alike alphabets only', () => {
  assert.deepEqual(confusableLabels('аpple.com'), ['аpple']);
  assert.deepEqual(confusableLabels('apple.com'), []);
  assert.deepEqual(confusableLabels('中文.example.com'), [], 'one script per label is not a homograph');
  assert.deepEqual(
    confusableLabels('раураl.com'),
    ['раураl'],
    'Cyrillic рaypa plus a Latin l is exactly the trick this catches'
  );
  assert.deepEqual(
    confusableLabels('раура.com'),
    [],
    'all-Cyrillic is a single script — suspicious to a human, but not mixed'
  );
});

/* ── inspect ──────────────────────────────── */

test('every part of a full URL is broken out', () => {
  const result = inspect('https://user:pw@example.com:8443/a/b%20c/?x=1&y=2#frag');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { parts } = result;
  assert.equal(parts.protocol, 'https:');
  assert.equal(parts.username, 'user');
  assert.equal(parts.password, 'pw');
  assert.equal(parts.hostname, 'example.com');
  assert.equal(parts.port, '8443');
  assert.equal(parts.effectivePort, '8443');
  assert.equal(parts.pathname, '/a/b%20c/');
  assert.deepEqual(parts.segments, ['a', 'b c']);
  assert.equal(parts.hash, 'frag');
  assert.equal(parts.origin, 'https://example.com:8443');
  assert.equal(parts.special, true);
  assert.deepEqual(parts.query.map((pair) => pair.name), ['x', 'y']);
  assert.equal(result.schemeAdded, false);
});

test('a default port is reported but not invented into the string', () => {
  const result = inspect('https://example.com/');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parts.port, '');
  assert.equal(result.parts.effectivePort, '443');
  assert.equal(DEFAULT_PORTS['http:'], '80');
});

test('a bare host gets https:// and says so', () => {
  const result = inspect('example.com/a?b=1');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.schemeAdded, true);
  assert.equal(result.parts.href, 'https://example.com/a?b=1');
});

test('a broken scheme is an error, not a guess', () => {
  assert.deepEqual(inspect('ht!tp://x'), { ok: false, reason: 'invalid' });
  assert.deepEqual(inspect('https://'), { ok: false, reason: 'invalid' });
  assert.deepEqual(inspect(''), { ok: false, reason: 'empty' });
  assert.deepEqual(inspect('   '), { ok: false, reason: 'empty' });
});

test('non-special schemes still parse', () => {
  const mail = inspect('mailto:someone@example.com');
  assert.equal(mail.ok, true);
  if (!mail.ok) return;
  assert.equal(mail.parts.protocol, 'mailto:');
  assert.equal(mail.parts.special, false);
  assert.equal(mail.parts.effectivePort, '');

  const data = inspect('data:text/plain,hello');
  assert.equal(data.ok, true);
});

test('an IDN host is reported in both forms', () => {
  const result = inspect('https://中国.cn/路徑?q=值');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parts.hostname, 'xn--fiqs8s.cn');
  assert.equal(result.parts.unicodeHost, '中国.cn');
  assert.deepEqual(result.parts.segments, ['路徑']);
  assert.equal(result.parts.query[0].value, '值');
});

test('a percent-encoded path segment is decoded for display only', () => {
  const result = inspect('https://example.com/a%2Fb/c');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parts.pathname, '/a%2Fb/c', 'the raw path is untouched');
  assert.deepEqual(result.parts.segments, ['a/b', 'c']);
});

/* ── rebuild ──────────────────────────────── */

test('rebuild strips tracking and keeps everything else byte for byte', () => {
  const href = 'https://example.com/A/b?utm_source=x&id=7&utm_medium=y#top';
  const result = inspect(href);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const out = rebuild(result.parts.href, result.parts.query, DEFAULT_CLEAN);
  assert.equal(out.url, 'https://example.com/A/b?id=7#top');
  assert.deepEqual(out.removed.map((pair) => pair.name), ['utm_source', 'utm_medium']);
});

test('removing every parameter removes the question mark too', () => {
  const result = inspect('https://example.com/p?utm_source=x');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(rebuild(result.parts.href, result.parts.query, DEFAULT_CLEAN).url, 'https://example.com/p');
});

test('the optional cleanups do exactly what they say', () => {
  const result = inspect('http://u:p@example.com/x?b=2&a=1#frag');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { href, query } = result.parts;

  assert.equal(
    rebuild(href, query, { ...DEFAULT_CLEAN, dropFragment: true }).url,
    'http://u:p@example.com/x?b=2&a=1'
  );
  assert.equal(
    rebuild(href, query, { ...DEFAULT_CLEAN, dropAuth: true }).url,
    'http://example.com/x?b=2&a=1#frag'
  );
  assert.equal(
    rebuild(href, query, { ...DEFAULT_CLEAN, sortParams: true }).url,
    'http://u:p@example.com/x?a=1&b=2#frag'
  );
  assert.equal(
    rebuild(href, query, { ...DEFAULT_CLEAN, forceHttps: true }).url,
    'https://u:p@example.com/x?b=2&a=1#frag'
  );
});

test('rebuild never rewrites the path case or collapses segments', () => {
  const result = inspect('https://example.com/A/../B/./c');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // The URL parser itself resolves dot segments; rebuild must not add more.
  const once = rebuild(result.parts.href, result.parts.query, DEFAULT_CLEAN).url;
  assert.equal(rebuild(once, parseQuery(''), DEFAULT_CLEAN).url, once);
  assert.match(once, /\/B\/c$/);
});

test('rebuild on an unparseable href gives the input back', () => {
  assert.deepEqual(rebuild('not a url', [], DEFAULT_CLEAN), { url: 'not a url', removed: [] });
});

test('an empty pattern list removes nothing', () => {
  const result = inspect('https://example.com/?utm_source=x');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const out = rebuild(result.parts.href, result.parts.query, { ...DEFAULT_CLEAN, patterns: [] });
  assert.equal(out.url, 'https://example.com/?utm_source=x');
  assert.deepEqual(out.removed, []);
});

test('byteLength counts UTF-8 bytes', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('中文'), 6);
  assert.equal(byteLength('😀'), 4);
  assert.equal(byteLength(''), 0);
});
