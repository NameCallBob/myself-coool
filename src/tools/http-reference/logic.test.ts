import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  DATA_CHECKED,
  ENTRIES,
  REGISTRIES,
  SPEC_SET,
  citation,
  countByCategory,
  lookupStatus,
  searchEntries,
  statusFamily,
  type Category,
  type Entry,
} from './logic.ts';

const byId = (id: string): Entry => {
  const found = ENTRIES.find((entry) => entry.id === id);
  assert.ok(found, `no entry with id ${id}`);
  return found;
};
const names = (entries: readonly Entry[]) => entries.map((entry) => entry.name);
const statuses = ENTRIES.filter((entry) => entry.category === 'status');

/* ── table integrity ─────────────────────── */

test('every entry has a unique id, a name, both languages and a document', () => {
  const ids = new Set<string>();
  for (const entry of ENTRIES) {
    assert.ok(!ids.has(entry.id), `duplicate id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.name.trim().length > 0, `empty name on ${entry.id}`);
    assert.ok(entry.zh.trim().length > 0, `no Chinese text on ${entry.id}`);
    assert.ok(entry.en.trim().length > 0, `no English text on ${entry.id}`);
    assert.match(entry.rfc, /^RFC \d{3,4}$/, `bad citation on ${entry.id}: ${entry.rfc}`);
    if (entry.section !== undefined) {
      assert.match(entry.section, /^\d+(\.\d+)*$/, `bad section on ${entry.id}: ${entry.section}`);
    }
  }
  assert.ok(ENTRIES.length > 120, `the table is suspiciously small: ${ENTRIES.length}`);
});

test('every entry belongs to a declared category, and every category is used', () => {
  const declared = CATEGORIES.map((category) => category.key);
  assert.deepEqual(declared, ['status', 'method', 'request', 'response', 'cache']);
  const counts = countByCategory();
  for (const entry of ENTRIES) assert.ok(declared.includes(entry.category), entry.id);
  for (const key of declared) assert.ok(counts[key] > 0, `category ${key} is empty`);
  assert.equal(
    declared.reduce((sum, key) => sum + counts[key], 0),
    ENTRIES.length
  );
});

test('every name is unique within its category', () => {
  const seen = new Map<Category, Set<string>>();
  for (const entry of ENTRIES) {
    const set = seen.get(entry.category) ?? new Set<string>();
    const key = entry.name.toLowerCase();
    assert.ok(!set.has(key), `duplicate name in ${entry.category}: ${entry.name}`);
    set.add(key);
    seen.set(entry.category, set);
  }
});

test('the provenance strings name the current core specification', () => {
  assert.match(SPEC_SET, /9110/);
  assert.match(SPEC_SET, /9111/);
  assert.match(DATA_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(REGISTRIES, /IANA/);
});

/* ── status codes: known answers ──────────── */

test('every status entry is a three-digit code with a reason phrase', () => {
  for (const entry of statuses) {
    assert.match(entry.name, /^[1-5]\d\d$/, entry.id);
    assert.ok(entry.label && entry.label.length > 0, `no reason phrase on ${entry.name}`);
  }
  // Codes are listed in ascending order; the UI relies on it for tie-breaking.
  const codes = statuses.map((entry) => Number(entry.name));
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b), 'status codes are out of order');
});

test('the reason phrases are the ones RFC 9110 currently uses', () => {
  assert.equal(byId('s413').label, 'Content Too Large', 'not "Payload Too Large" any more');
  assert.equal(byId('s422').label, 'Unprocessable Content', 'not "Unprocessable Entity" any more');
  assert.equal(byId('s418').label, '(Unused)', 'RFC 9110 reserves 418 rather than defining a teapot');
  assert.equal(byId('s306').label, '(Unused)');
  assert.equal(byId('s200').label, 'OK');
  assert.equal(byId('s404').label, 'Not Found');
  assert.equal(byId('s451').label, 'Unavailable For Legal Reasons');
  // The former names stay searchable, because that is what people type.
  assert.ok(searchEntries('payload too large').some((entry) => entry.name === '413'));
  assert.ok(searchEntries('unprocessable entity').some((entry) => entry.name === '422'));
  assert.ok(searchEntries('teapot').some((entry) => entry.name === '418'));
});

test('the codes that moved into RFC 9110 cite it, and the ones that did not do not', () => {
  // Re-cut in 2022: nothing here may still point at the obsolete RFC 7231.
  for (const entry of ENTRIES) {
    assert.ok(
      !['RFC 7230', 'RFC 7231', 'RFC 7232', 'RFC 7233', 'RFC 7234', 'RFC 7235', 'RFC 2616'].includes(entry.rfc),
      `${entry.id} cites the obsolete ${entry.rfc}`
    );
  }
  assert.equal(byId('s200').rfc, 'RFC 9110');
  assert.equal(byId('s308').rfc, 'RFC 9110');
  assert.equal(byId('s421').rfc, 'RFC 9110');
  // Never part of the core spec:
  assert.equal(byId('s429').rfc, 'RFC 6585');
  assert.equal(byId('s451').rfc, 'RFC 7725');
  assert.equal(byId('s423').rfc, 'RFC 4918');
  assert.equal(byId('s425').rfc, 'RFC 8470');
  assert.equal(byId('s103').rfc, 'RFC 8297');
});

test('the status section numbers follow the RFC 9110 §15 layout', () => {
  assert.equal(citation(byId('s100')), 'RFC 9110 §15.2.1');
  assert.equal(citation(byId('s200')), 'RFC 9110 §15.3.1');
  assert.equal(citation(byId('s206')), 'RFC 9110 §15.3.7');
  assert.equal(citation(byId('s300')), 'RFC 9110 §15.4.1');
  assert.equal(citation(byId('s308')), 'RFC 9110 §15.4.9');
  assert.equal(citation(byId('s400')), 'RFC 9110 §15.5.1');
  assert.equal(citation(byId('s404')), 'RFC 9110 §15.5.5');
  assert.equal(citation(byId('s422')), 'RFC 9110 §15.5.21');
  assert.equal(citation(byId('s426')), 'RFC 9110 §15.5.22');
  assert.equal(citation(byId('s500')), 'RFC 9110 §15.6.1');
  assert.equal(citation(byId('s505')), 'RFC 9110 §15.6.6');

  // Within RFC 9110, each class is numbered sequentially from .1 with no gaps.
  for (const [prefix, first, last] of [
    ['15.3', 200, 206],
    ['15.4', 300, 308],
    ['15.6', 500, 505],
  ] as const) {
    const inClass = statuses.filter(
      (entry) => entry.rfc === 'RFC 9110' && entry.section?.startsWith(`${prefix}.`) && Number(entry.name) >= first && Number(entry.name) <= last
    );
    const tails = inClass.map((entry) => Number(entry.section!.slice(prefix.length + 1)));
    assert.deepEqual(tails, Array.from({ length: tails.length }, (_, i) => i + 1), prefix);
  }
});

test('the heuristically cacheable set is exactly the one RFC 9110 §15.1 names', () => {
  const flagged = statuses
    .filter((entry) => entry.flags?.includes('heuristically cacheable'))
    .map((entry) => entry.name);
  assert.deepEqual(flagged, ['200', '203', '204', '206', '300', '301', '308', '404', '405', '410', '414', '501']);
});

test('the codes that are registered but must not be sent are marked deprecated', () => {
  for (const id of ['s102', 's305', 's306', 's510']) {
    assert.equal(byId(id).deprecated, true, id);
  }
  assert.equal(byId('s200').deprecated, undefined);
});

/* ── methods ──────────────────────────────── */

test('method properties match RFC 9110 §9.2: safe, idempotent, cacheable', () => {
  const flags = (name: string) =>
    [...(ENTRIES.find((entry) => entry.category === 'method' && entry.name === name)!.flags ?? [])].sort();

  assert.deepEqual(flags('GET'), ['cacheable', 'idempotent', 'safe']);
  assert.deepEqual(flags('HEAD'), ['cacheable', 'idempotent', 'safe']);
  assert.deepEqual(flags('OPTIONS'), ['idempotent', 'safe']);
  assert.deepEqual(flags('TRACE'), ['idempotent', 'safe']);
  assert.deepEqual(flags('PUT'), ['idempotent', 'request body defined']);
  assert.deepEqual(flags('DELETE'), ['idempotent']);
  assert.deepEqual(flags('POST'), ['request body defined'], 'POST is neither safe nor idempotent');
  assert.deepEqual(flags('PATCH'), ['request body defined'], 'PATCH is not idempotent in general');
  assert.deepEqual(flags('CONNECT'), []);

  // Every safe method is also idempotent; the converse does not hold.
  for (const entry of ENTRIES.filter((e) => e.category === 'method')) {
    if (entry.flags?.includes('safe')) {
      assert.ok(entry.flags.includes('idempotent'), `${entry.name} is safe but not marked idempotent`);
    }
  }
  assert.equal(
    ENTRIES.filter((entry) => entry.category === 'method').length,
    9,
    'the eight RFC 9110 methods plus PATCH'
  );
  assert.equal(ENTRIES.find((e) => e.category === 'method' && e.name === 'PATCH')!.rfc, 'RFC 5789');
});

/* ── headers and cache directives ─────────── */

test('header entries cite the document the field was actually defined in', () => {
  const header = (name: string) =>
    ENTRIES.find((entry) => (entry.category === 'request' || entry.category === 'response') && entry.name === name)!;

  assert.equal(citation(header('Accept')), 'RFC 9110 §12.5.1');
  assert.equal(citation(header('Accept-Encoding')), 'RFC 9110 §12.5.3');
  assert.equal(citation(header('Vary')), 'RFC 9110 §12.5.5');
  assert.equal(citation(header('If-None-Match')), 'RFC 9110 §13.1.2');
  assert.equal(citation(header('Range')), 'RFC 9110 §14.2');
  assert.equal(citation(header('Content-Range')), 'RFC 9110 §14.4');
  assert.equal(citation(header('ETag')), 'RFC 9110 §8.8.3');
  assert.equal(citation(header('WWW-Authenticate')), 'RFC 9110 §11.6.1');
  // Caching fields live in 9111, not 9110.
  assert.equal(citation(header('Age')), 'RFC 9111 §5.1');
  assert.equal(citation(header('Expires')), 'RFC 9111 §5.3');
  // And the ones that were never in the core spec at all.
  assert.equal(header('Set-Cookie').rfc, 'RFC 6265');
  assert.equal(header('Cookie').rfc, 'RFC 6265');
  assert.equal(header('Origin').rfc, 'RFC 6454');
  assert.equal(header('Forwarded').rfc, 'RFC 7239');
  assert.equal(header('Content-Disposition').rfc, 'RFC 6266');
  assert.equal(header('Priority').rfc, 'RFC 9218');
});

test('a field with no vouched-for section cites the RFC alone', () => {
  const trailer = ENTRIES.find((entry) => entry.name === 'Trailer')!;
  assert.equal(trailer.section, undefined);
  assert.equal(citation(trailer), 'RFC 9110');
});

test('the RFC 9111 response directives are complete and in the spec order', () => {
  const responseDirectives = ENTRIES.filter(
    (entry) => entry.category === 'cache' && entry.section?.startsWith('5.2.2.')
  );
  assert.deepEqual(names(responseDirectives), [
    'max-age',
    'must-revalidate',
    'must-understand',
    'no-cache',
    'no-store',
    'no-transform',
    'private',
    'proxy-revalidate',
    'public',
    's-maxage',
  ]);
  const tails = responseDirectives.map((entry) => Number(entry.section!.slice('5.2.2.'.length)));
  assert.deepEqual(tails, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('the RFC 9111 request directives are complete and in the spec order', () => {
  const requestDirectives = ENTRIES.filter(
    (entry) => entry.category === 'cache' && entry.section?.startsWith('5.2.1.')
  );
  assert.deepEqual(names(requestDirectives), [
    'max-age (request)',
    'max-stale',
    'min-fresh',
    'no-cache (request)',
    'no-store (request)',
    'no-transform (request)',
    'only-if-cached',
  ]);
});

test('the cache extensions cite their own RFCs and Pragma is deprecated', () => {
  const directive = (name: string) => ENTRIES.find((entry) => entry.category === 'cache' && entry.name === name)!;
  assert.equal(directive('immutable').rfc, 'RFC 8246');
  assert.equal(directive('stale-while-revalidate').rfc, 'RFC 5861');
  assert.equal(directive('stale-if-error').rfc, 'RFC 5861');
  assert.equal(directive('immutable').section, undefined);
  assert.equal(directive('Pragma: no-cache').deprecated, true);
});

/* ── citation ─────────────────────────────── */

test('citation joins the RFC and section, and omits an absent section', () => {
  assert.equal(
    citation({ id: 'x', category: 'status', name: '999', rfc: 'RFC 1234', section: '1.2.3', zh: 'a', en: 'b' }),
    'RFC 1234 §1.2.3'
  );
  assert.equal(
    citation({ id: 'x', category: 'status', name: '999', rfc: 'RFC 1234', zh: 'a', en: 'b' }),
    'RFC 1234'
  );
});

/* ── statusFamily ─────────────────────────── */

test('statusFamily classifies by leading digit and rejects what is not a status', () => {
  assert.equal(statusFamily(100)!.digit, 1);
  assert.equal(statusFamily(204)!.digit, 2);
  assert.equal(statusFamily(301)!.digit, 3);
  assert.equal(statusFamily(404)!.digit, 4);
  assert.equal(statusFamily(503)!.digit, 5);
  assert.equal(statusFamily(599)!.digit, 5);
  assert.match(statusFamily(404)!.en, /Client error/);
  assert.match(statusFamily(404)!.zh, /客戶端/);

  assert.equal(statusFamily(99), null);
  assert.equal(statusFamily(600), null);
  assert.equal(statusFamily(0), null);
  assert.equal(statusFamily(-404), null);
  assert.equal(statusFamily(404.5), null);
  assert.equal(statusFamily(Number.NaN), null);
  assert.equal(statusFamily(Number.POSITIVE_INFINITY), null);
});

test('statusFamily still answers for unregistered codes seen in the wild', () => {
  // nginx 499, Cloudflare 520/521, and 598 from various proxies are not
  // registered, but their class is still meaningful.
  for (const code of [499, 520, 521, 598]) {
    assert.equal(lookupStatus(code), null, `${code} should not be in the registry table`);
    assert.ok(statusFamily(code), `${code} should still get a family`);
  }
  assert.equal(statusFamily(499)!.digit, 4);
  assert.equal(statusFamily(520)!.digit, 5);
});

/* ── lookupStatus ─────────────────────────── */

test('lookupStatus accepts a number or a string and finds only status entries', () => {
  assert.equal(lookupStatus(404)!.label, 'Not Found');
  assert.equal(lookupStatus('404')!.label, 'Not Found');
  assert.equal(lookupStatus(' 404 ')!.label, 'Not Found');
  assert.equal(lookupStatus(200)!.id, 's200');
  assert.equal(lookupStatus(418)!.label, '(Unused)');
  assert.equal(lookupStatus(999), null);
  assert.equal(lookupStatus(''), null);
  assert.equal(lookupStatus('GET'), null, 'a method is not a status');
  assert.equal(lookupStatus('ETag'), null);
});

/* ── countByCategory ──────────────────────── */

test('countByCategory adds up to the table and has no stray keys', () => {
  const counts = countByCategory();
  assert.deepEqual(Object.keys(counts).sort(), ['cache', 'method', 'request', 'response', 'status']);
  assert.equal(counts.status, statuses.length);
  assert.equal(counts.method, 9);
  assert.equal(
    Object.values(counts).reduce((sum, n) => sum + n, 0),
    ENTRIES.length
  );
});

/* ── search ───────────────────────────────── */

test('an empty query returns the whole table in its own order', () => {
  assert.deepEqual(names(searchEntries('')), names(ENTRIES));
  assert.deepEqual(names(searchEntries('   ')), names(ENTRIES));
  assert.notEqual(searchEntries(''), ENTRIES, 'a copy, so the caller cannot sort the table itself');
});

test('an exact token wins, whatever else mentions it', () => {
  assert.equal(searchEntries('404')[0].name, '404');
  assert.equal(searchEntries('ETag')[0].name, 'ETag');
  assert.equal(searchEntries('etag')[0].name, 'ETag');
  assert.equal(searchEntries('vary')[0].name, 'Vary');
  assert.equal(searchEntries('no-store')[0].name, 'no-store');
  assert.equal(searchEntries('GET')[0].name, 'GET');
});

test('a class query expands to that class, in numeric order', () => {
  const found = names(searchEntries('4xx'));
  assert.ok(found.length > 20, `only ${found.length} 4xx codes`);
  assert.ok(found.every((name) => name.startsWith('4')));
  assert.deepEqual(found, [...found].sort(), '4xx came back out of order');
  assert.deepEqual(names(searchEntries('5xx')).slice(0, 3), ['500', '501', '502']);
  assert.deepEqual(names(searchEntries('1**')).slice(0, 2), ['100', '101']);
});

test('a partial code narrows to the codes that start with it', () => {
  assert.deepEqual(names(searchEntries('40')).slice(0, 4), ['400', '401', '402', '403']);
  assert.equal(searchEntries('41')[0].name, '410', 'an exact match still outranks the prefix');
  assert.ok(names(searchEntries('20')).includes('200'));
});

test('searching by reason phrase, alias, RFC and Chinese term all work', () => {
  assert.equal(searchEntries('not found')[0].name, '404');
  assert.equal(searchEntries('too many requests')[0].name, '429');
  assert.ok(names(searchEntries('RFC 9111')).includes('Age'));
  assert.ok(names(searchEntries('9111')).includes('max-age'));
  assert.ok(names(searchEntries('限流')).includes('429'));
  assert.ok(names(searchEntries('續傳')).includes('Range'));
  assert.ok(names(searchEntries('cors')).includes('Origin'));
  assert.ok(names(searchEntries('samesite')).includes('Set-Cookie'));
  assert.ok(names(searchEntries('smuggling')).includes('Content-Length'));
});

test('a query that matches nothing returns nothing rather than everything', () => {
  assert.deepEqual(searchEntries('zzzzznotathing'), []);
  assert.deepEqual(searchEntries('700'), []);
  assert.deepEqual(searchEntries('6xx'), [], 'there is no 6xx class');
});

test('the category filter narrows the pool and an empty filter does not', () => {
  const cacheOnly = searchEntries('no-cache', ['cache']);
  assert.ok(cacheOnly.length >= 2, 'both the request and response no-cache directives');
  assert.ok(cacheOnly.every((entry) => entry.category === 'cache'));

  assert.deepEqual(searchEntries('404', ['cache']), [], '404 is not a cache directive');
  assert.deepEqual(names(searchEntries('', [])), names(ENTRIES));
  assert.equal(searchEntries('', ['method']).length, 9);
  const requestSide = searchEntries('content-type', ['request']);
  assert.equal(requestSide[0].name, 'Content-Type', 'the token itself ranks above a body-text mention');
  assert.ok(requestSide.every((entry) => entry.category === 'request'));
  assert.equal(
    searchEntries('content-type', ['response']).filter((entry) => entry.name === 'Content-Type').length,
    1,
    'the request and response copies are separate entries'
  );
});

test('searching for a wide word does not blow up, and every hit really matches', () => {
  const hits = searchEntries('cache');
  assert.ok(hits.length > 5);
  for (const entry of hits) {
    const haystack = [
      entry.name,
      entry.label ?? '',
      entry.rfc,
      ...(entry.tags ?? []),
      ...(entry.flags ?? []),
      entry.zh,
      entry.en,
    ]
      .join(' ')
      .toLowerCase();
    assert.ok(haystack.includes('cache'), `${entry.id} was returned but does not mention it`);
  }
});
