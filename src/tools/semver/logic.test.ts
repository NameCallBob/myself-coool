import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundsOf,
  compare,
  compareIdentifiers,
  diffKind,
  format,
  formatRange,
  isValid,
  maxSatisfying,
  minSatisfying,
  parse,
  parseRange,
  probeVersions,
  satisfies,
  sortVersions,
  type Semver,
} from './logic.ts';

const v = (text: string): Semver => {
  const parsed = parse(text);
  assert.ok(parsed, `expected ${text} to parse`);
  return parsed;
};

const r = (text: string) => {
  const range = parseRange(text);
  assert.ok(range, `expected range ${text} to parse`);
  return range;
};

const ok = (version: string, range: string) => satisfies(v(version), r(range));

/* ── Parsing ──────────────────────────────── */

test('the spec examples parse into their parts', () => {
  assert.deepEqual(
    (({ major, minor, patch, prerelease, build }) => ({ major, minor, patch, prerelease, build }))(
      v('1.2.3')
    ),
    { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
  );
  assert.deepEqual(v('1.0.0-alpha.1').prerelease, ['alpha', '1']);
  assert.deepEqual(v('1.0.0+20130313144700').build, ['20130313144700']);
  assert.deepEqual(v('1.0.0-beta+exp.sha.5114f85').prerelease, ['beta']);
  assert.deepEqual(v('1.0.0-beta+exp.sha.5114f85').build, ['exp', 'sha', '5114f85']);
  assert.deepEqual(v('1.0.0-0.3.7').prerelease, ['0', '3', '7']);
  assert.deepEqual(v('1.0.0-x.7.z.92').prerelease, ['x', '7', 'z', '92']);
});

test('a leading v or = is stripped, because tags are written that way', () => {
  assert.equal(v('v1.2.3').raw, '1.2.3');
  assert.equal(v('=1.2.3').raw, '1.2.3');
  assert.equal(format(v('v1.2.3-rc.1+build.9')), '1.2.3-rc.1+build.9');
});

test('what the spec calls invalid is invalid here too', () => {
  for (const bad of [
    '',
    '1',
    '1.2',
    '1.2.3.4',
    '1.02.3',
    '01.2.3',
    '1.2.3-',
    '1.2.3+',
    '1.2.3-01',
    '1.2.3-alpha..1',
    '1.2.3-alpha_1',
    'a.b.c',
    '-1.2.3',
    '1.2.3 4.5.6',
  ]) {
    assert.equal(parse(bad), null, bad);
    assert.equal(isValid(bad), false, bad);
  }
  // A numeric prerelease identifier of exactly zero is legal.
  assert.deepEqual(v('1.2.3-0').prerelease, ['0']);
});

/* ── Precedence, against the spec's own list ─ */

test('spec rule 11: the documented precedence chain holds', () => {
  // semver.org §11: 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta
  //   < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
  const chain = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  for (let i = 0; i + 1 < chain.length; i += 1) {
    assert.equal(compare(v(chain[i]), v(chain[i + 1])), -1, `${chain[i]} < ${chain[i + 1]}`);
    assert.equal(compare(v(chain[i + 1]), v(chain[i])), 1);
  }
  // And the whole chain sorts back into that order from any starting point.
  const shuffled = [...chain].reverse().map(v);
  assert.deepEqual(sortVersions(shuffled).map(format), chain);
});

test('spec rule 11.2: the numeric parts are compared numerically', () => {
  assert.equal(compare(v('1.0.0'), v('2.0.0')), -1);
  assert.equal(compare(v('2.0.0'), v('2.1.0')), -1);
  assert.equal(compare(v('2.1.0'), v('2.1.1')), -1);
  // Not lexicographically: 10 is above 9.
  assert.equal(compare(v('1.9.0'), v('1.10.0')), -1);
  assert.equal(compare(v('9.0.0'), v('10.0.0')), -1);
});

test('spec rule 10: build metadata is ignored by precedence', () => {
  assert.equal(compare(v('1.0.0+a'), v('1.0.0+b')), 0);
  assert.equal(compare(v('1.0.0'), v('1.0.0+build.1')), 0);
  assert.equal(compare(v('1.0.0-rc+a'), v('1.0.0-rc+b')), 0);
});

test('prerelease identifiers sort numeric below alphanumeric', () => {
  assert.equal(compareIdentifiers('1', '2'), -1);
  assert.equal(compareIdentifiers('2', '10'), -1);
  assert.equal(compareIdentifiers('1', 'alpha'), -1);
  assert.equal(compareIdentifiers('alpha', '1'), 1);
  assert.equal(compareIdentifiers('alpha', 'beta'), -1);
  assert.equal(compareIdentifiers('alpha', 'alpha'), 0);
  // Length first, so a very long numeric identifier still orders correctly.
  assert.equal(compareIdentifiers('99999999999999999999', '100000000000000000000'), -1);
});

test('a longer prerelease set wins when the shared identifiers are equal', () => {
  assert.equal(compare(v('1.0.0-alpha'), v('1.0.0-alpha.1')), -1);
  assert.equal(compare(v('1.0.0-alpha.1'), v('1.0.0-alpha.1.0')), -1);
});

test('sorting is stable for versions that compare equal', () => {
  const list = [v('1.0.0+b'), v('1.0.0+a')];
  assert.deepEqual(sortVersions(list).map(format), ['1.0.0+b', '1.0.0+a']);
});

test('diffKind names the largest part that moved', () => {
  assert.equal(diffKind(v('1.2.3'), v('2.0.0')), 'major');
  assert.equal(diffKind(v('1.2.3'), v('1.3.0')), 'minor');
  assert.equal(diffKind(v('1.2.3'), v('1.2.4')), 'patch');
  assert.equal(diffKind(v('1.2.3-a'), v('1.2.3-b')), 'prerelease');
  assert.equal(diffKind(v('1.2.3+a'), v('1.2.3+b')), 'build');
  assert.equal(diffKind(v('1.2.3'), v('1.2.3')), 'same');
});

/* ── Range expansion ──────────────────────── */

test('the caret keeps the leftmost non-zero part, including below 1.0.0', () => {
  assert.equal(formatRange(r('^1.2.3')), '>=1.2.3 <2.0.0-0');
  assert.equal(formatRange(r('^0.2.3')), '>=0.2.3 <0.3.0-0');
  assert.equal(formatRange(r('^0.0.3')), '>=0.0.3 <0.0.4-0');
  assert.equal(formatRange(r('^1.2.x')), '>=1.2.0 <2.0.0-0');
  assert.equal(formatRange(r('^0.0.x')), '>=0.0.0 <0.1.0-0');
  assert.equal(formatRange(r('^1.x')), '>=1.0.0 <2.0.0-0');
  assert.equal(formatRange(r('^0.x')), '>=0.0.0 <1.0.0-0');
});

test('the tilde allows patches, and minors only when the minor is absent', () => {
  assert.equal(formatRange(r('~1.2.3')), '>=1.2.3 <1.3.0-0');
  assert.equal(formatRange(r('~1.2')), '>=1.2.0 <1.3.0-0');
  assert.equal(formatRange(r('~1')), '>=1.0.0 <2.0.0-0');
  assert.equal(formatRange(r('~0.2.3')), '>=0.2.3 <0.3.0-0');
  // The old npm spelling means the same thing.
  assert.equal(formatRange(r('~>1.2.3')), formatRange(r('~1.2.3')));
});

test('an x-range covers the band it names', () => {
  assert.equal(formatRange(r('1.2.x')), '>=1.2.0 <1.3.0-0');
  assert.equal(formatRange(r('1.x')), '>=1.0.0 <2.0.0-0');
  assert.equal(formatRange(r('1.2.3')), '=1.2.3');
  assert.equal(formatRange(r('*')), '>=0.0.0');
  assert.equal(formatRange(r('')), '>=0.0.0');
  assert.equal(formatRange(r('x')), '>=0.0.0');
});

test('inequalities on partial versions expand the way npm expands them', () => {
  assert.equal(formatRange(r('>1.2.3')), '>1.2.3');
  assert.equal(formatRange(r('>1.2')), '>=1.3.0');
  assert.equal(formatRange(r('>1')), '>=2.0.0');
  assert.equal(formatRange(r('>=1.2.3')), '>=1.2.3');
  assert.equal(formatRange(r('>=1.2')), '>=1.2.0');
  assert.equal(formatRange(r('<1.2.3')), '<1.2.3');
  assert.equal(formatRange(r('<1.2')), '<1.2.0-0');
  assert.equal(formatRange(r('<=1.2.3')), '<=1.2.3');
  assert.equal(formatRange(r('<=1.2')), '<1.3.0-0');
});

test('hyphen ranges close at the end of whatever the right side names', () => {
  assert.equal(formatRange(r('1.2.3 - 2.3.4')), '>=1.2.3 <=2.3.4');
  assert.equal(formatRange(r('1.2 - 2.3.4')), '>=1.2.0 <=2.3.4');
  assert.equal(formatRange(r('1.2.3 - 2.3')), '>=1.2.3 <2.4.0-0');
  assert.equal(formatRange(r('1.2.3 - 2')), '>=1.2.3 <3.0.0-0');
});

test('and-groups and or-groups both parse', () => {
  assert.equal(formatRange(r('>=1.2.7 <1.3.0')), '>=1.2.7 <1.3.0');
  assert.equal(formatRange(r('^1.0.0 || ^2.0.0')), '>=1.0.0 <2.0.0-0 || >=2.0.0 <3.0.0-0');
  assert.equal(r('^1 || ^2 || ^3').groups.length, 3);
});

test('malformed ranges are refused rather than half-understood', () => {
  for (const bad of ['^', '~', '>=', 'not-a-range', '1.x.3', '^1.2.3.4', '<x', '>=1.2.3 -']) {
    assert.equal(parseRange(bad), null, bad);
  }
});

/* ── Satisfaction ─────────────────────────── */

test('the caret admits what it should and refuses what it should not', () => {
  assert.equal(ok('1.2.3', '^1.2.3'), true);
  assert.equal(ok('1.9.9', '^1.2.3'), true);
  assert.equal(ok('1.2.2', '^1.2.3'), false);
  assert.equal(ok('2.0.0', '^1.2.3'), false);
  // 0.x: a minor bump is breaking, so 0.3.0 is out of ^0.2.3.
  assert.equal(ok('0.2.9', '^0.2.3'), true);
  assert.equal(ok('0.3.0', '^0.2.3'), false);
  assert.equal(ok('0.0.3', '^0.0.3'), true);
  assert.equal(ok('0.0.4', '^0.0.3'), false);
});

test('the -0 ceiling keeps the next major prerelease out', () => {
  // This is the whole reason ^1.2.3 expands to <2.0.0-0 and not <2.0.0.
  assert.equal(ok('2.0.0-alpha', '^1.2.3'), false);
  assert.equal(ok('2.0.0-alpha', '>=1.2.3 <2.0.0'), false);
  assert.equal(satisfies(v('2.0.0-alpha'), r('>=1.2.3 <2.0.0'), true), true);
});

test('a prerelease needs a comparator on its own version to get in', () => {
  assert.equal(ok('1.0.0-rc.1', '^1.0.0'), false);
  assert.equal(ok('1.0.0-rc.1', '>=1.0.0'), false);
  assert.equal(ok('1.0.0-rc.1', '>=1.0.0-rc.1'), true);
  assert.equal(ok('1.0.0-rc.2', '>=1.0.0-rc.1'), true);
  assert.equal(ok('1.0.0-rc.1', '^1.0.0-rc.1'), true);
  // The pinning comparator has to name the same major.minor.patch.
  assert.equal(ok('1.2.0-rc.1', '^1.0.0-rc.1'), false);
  assert.equal(satisfies(v('1.2.0-rc.1'), r('^1.0.0-rc.1'), true), true);
});

test('includePrerelease lifts the filter but not the ordering', () => {
  assert.equal(satisfies(v('1.5.0-beta'), r('1.x'), true), true);
  assert.equal(satisfies(v('1.5.0-beta'), r('1.x'), false), false);
  assert.equal(satisfies(v('1.5.0-beta'), r('^1.0.0'), true), true);
  // 1.0.0-rc.1 sorts *below* 1.0.0, so `>=1.0.0` still excludes it even with
  // the prerelease filter off. includePrerelease is not a licence to ignore
  // precedence — that is a different bug from the one it fixes.
  assert.equal(satisfies(v('1.0.0-rc.1'), r('^1.0.0'), true), false);
});

test('the prerelease rule is per and-group, not per range', () => {
  // The 2.x group pins nothing at 2.0.0, so a 2.0.0 prerelease is still out.
  assert.equal(ok('2.0.0-beta', '^1.0.0 || ^2.0.0'), false);
  assert.equal(ok('2.0.0-beta', '^1.0.0 || >=2.0.0-beta <3.0.0-0'), true);
});

test('build metadata never changes whether a version satisfies', () => {
  assert.equal(ok('1.2.3+build.1', '^1.2.3'), true);
  assert.equal(ok('1.2.3+build.1', '=1.2.3'), true);
});

test('an exact range means exactly that version', () => {
  assert.equal(ok('1.2.3', '1.2.3'), true);
  assert.equal(ok('1.2.4', '1.2.3'), false);
  assert.equal(ok('1.2.3', '=1.2.3'), true);
});

test('star covers every release but still not a prerelease', () => {
  assert.equal(ok('0.0.0', '*'), true);
  assert.equal(ok('99.0.0', '*'), true);
  assert.equal(ok('1.0.0-rc', '*'), false);
  assert.equal(satisfies(v('1.0.0-rc'), r('*'), true), true);
});

test('a hyphen range includes both ends', () => {
  assert.equal(ok('1.2.3', '1.2.3 - 2.3.4'), true);
  assert.equal(ok('2.3.4', '1.2.3 - 2.3.4'), true);
  assert.equal(ok('2.3.5', '1.2.3 - 2.3.4'), false);
  assert.equal(ok('1.2.2', '1.2.3 - 2.3.4'), false);
  assert.equal(ok('2.3.9', '1.2.3 - 2.3'), true);
  assert.equal(ok('2.4.0', '1.2.3 - 2.3'), false);
});

/* ── Bounds ───────────────────────────────── */

test('bounds are the tightest interval a group describes', () => {
  const caret = boundsOf(r('^1.2.3').groups[0]);
  assert.equal(format(caret.lower!), '1.2.3');
  assert.equal(caret.lowerInclusive, true);
  assert.equal(format(caret.upper!), '2.0.0-0');
  assert.equal(caret.upperInclusive, false);
  assert.equal(caret.empty, false);
});

test('bounds intersect several comparators down to one interval', () => {
  const tight = boundsOf(r('>=1.0.0 >=1.5.0 <3.0.0 <2.0.0').groups[0]);
  assert.equal(format(tight.lower!), '1.5.0');
  assert.equal(format(tight.upper!), '2.0.0');
});

test('an unsatisfiable group is reported as empty', () => {
  assert.equal(boundsOf(r('>=2.0.0 <1.0.0').groups[0]).empty, true);
  assert.equal(boundsOf(r('>1.0.0 <1.0.0').groups[0]).empty, true);
  // A single point is not empty when both ends include it.
  assert.equal(boundsOf(r('>=1.0.0 <=1.0.0').groups[0]).empty, false);
  // But an exclusive end at the same point is.
  assert.equal(boundsOf(r('>=1.0.0 <1.0.0').groups[0]).empty, true);
});

test('an open-ended group has a null bound on that side', () => {
  const up = boundsOf(r('>=1.0.0').groups[0]);
  assert.equal(up.upper, null);
  assert.equal(format(up.lower!), '1.0.0');
  const down = boundsOf(r('<2.0.0').groups[0]);
  assert.equal(down.lower, null);
  assert.equal(format(down.upper!), '2.0.0');
});

test('an exact comparator pins both bounds to the same version', () => {
  const exact = boundsOf(r('=1.2.3').groups[0]);
  assert.equal(format(exact.lower!), '1.2.3');
  assert.equal(format(exact.upper!), '1.2.3');
  assert.equal(exact.lowerInclusive, true);
  assert.equal(exact.upperInclusive, true);
  assert.equal(exact.empty, false);
});

/* ── Picking from a list ──────────────────── */

const CANDIDATES = [
  '0.9.0',
  '1.0.0',
  '1.0.1',
  '1.2.0',
  '1.2.3',
  '1.9.9',
  '2.0.0-rc.1',
  '2.0.0',
  '2.1.0',
].map(v);

test('maxSatisfying and minSatisfying pick the ends of the allowed set', () => {
  assert.equal(format(maxSatisfying(CANDIDATES, r('^1.0.0'))!), '1.9.9');
  assert.equal(format(minSatisfying(CANDIDATES, r('^1.0.0'))!), '1.0.0');
  assert.equal(format(maxSatisfying(CANDIDATES, r('*'))!), '2.1.0');
  assert.equal(format(maxSatisfying(CANDIDATES, r('~1.2.0'))!), '1.2.3');
  assert.equal(maxSatisfying(CANDIDATES, r('^5.0.0')), null);
  assert.equal(minSatisfying(CANDIDATES, r('^5.0.0')), null);
});

test('a prerelease candidate is only picked when the range invites it', () => {
  assert.equal(format(maxSatisfying(CANDIDATES, r('>=1.0.0'))!), '2.1.0');
  assert.equal(format(maxSatisfying(CANDIDATES, r('>=2.0.0-rc.1 <2.1.0'))!), '2.0.0');
  assert.equal(format(maxSatisfying(CANDIDATES, r('2.0.0-rc.1'))!), '2.0.0-rc.1');
  assert.equal(format(maxSatisfying(CANDIDATES, r('^2.0.0'), true)!), '2.1.0');
});

test('probe versions surround every bound and include the prerelease case', () => {
  const probes = probeVersions(r('^1.2.3')).map(format);
  assert.ok(probes.includes('1.2.3'));
  assert.ok(probes.includes('1.2.2'));
  assert.ok(probes.includes('2.0.0'));
  assert.ok(probes.includes('2.0.0-0'));
  assert.ok(probes.some((text) => text.includes('-rc.1')));
  // Returned in precedence order, with no duplicates.
  assert.equal(new Set(probes).size, probes.length);
  const sorted = sortVersions(probeVersions(r('^1.2.3'))).map(format);
  assert.deepEqual(probes, sorted);
});
