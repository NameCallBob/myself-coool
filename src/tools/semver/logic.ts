/**
 * Semantic versions, their ordering, and what a range actually covers.
 *
 * Two parts of this are counter-intuitive enough to be the reason the tool
 * exists, and both are implemented to match npm rather than to match intuition.
 *
 * The first is the prerelease rule. `1.0.0-rc.1` does *not* satisfy `^1.0.0`,
 * even though it is numerically between 1.0.0 and 2.0.0. A prerelease only
 * satisfies a range when some comparator in the same and-group names the same
 * major.minor.patch *and* carries a prerelease of its own — so `>=1.0.0-rc.1`
 * admits it and `>=1.0.0` does not. Without that rule, publishing any prerelease
 * would push it to every caret dependant in the ecosystem.
 *
 * The second is the `-0` upper bound. `^1.2.3` expands to `>=1.2.3 <2.0.0-0`,
 * not `<2.0.0`, because `2.0.0-alpha` sorts *below* `2.0.0` and would otherwise
 * slip in under the ceiling. The lowest possible prerelease of 2.0.0 is the
 * identifier `0`, so that is where the wall goes.
 */

export type Semver = {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated identifiers, already split. Numeric ones stay as strings. */
  prerelease: string[];
  /** Build metadata. Ignored entirely by precedence, per the spec. */
  build: string[];
  /** Canonical text, without any leading `v`. */
  raw: string;
};

const NUMERIC = /^(0|[1-9]\d*)$/;
const IDENTIFIER = /^[0-9A-Za-z-]+$/;

/**
 * Strict semver, with one concession: a leading `v` is stripped, because tags
 * are written `v1.2.3` everywhere and refusing them would be pedantry.
 */
export function parse(text: string): Semver | null {
  const trimmed = text.trim().replace(/^[v=]\s*/, '');
  const shape = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(trimmed);
  if (!shape) return null;
  const [, majorText, minorText, patchText, prereleaseText, buildText] = shape;

  // Leading zeros are invalid in the numeric parts — 1.02.3 is not a version.
  for (const part of [majorText, minorText, patchText]) {
    if (!NUMERIC.test(part)) return null;
  }

  const prerelease = prereleaseText === undefined ? [] : prereleaseText.split('.');
  for (const identifier of prerelease) {
    if (identifier === '' || !IDENTIFIER.test(identifier)) return null;
    // A numeric prerelease identifier must not have leading zeros either.
    if (/^\d+$/.test(identifier) && !NUMERIC.test(identifier)) return null;
  }

  const build = buildText === undefined ? [] : buildText.split('.');
  for (const identifier of build) {
    if (identifier === '' || !IDENTIFIER.test(identifier)) return null;
  }

  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
    prerelease,
    build,
    raw: trimmed,
  };
}

export function isValid(text: string): boolean {
  return parse(text) !== null;
}

export function format(version: Semver): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  const pre = version.prerelease.length > 0 ? `-${version.prerelease.join('.')}` : '';
  const build = version.build.length > 0 ? `+${version.build.join('.')}` : '';
  return `${core}${pre}${build}`;
}

/**
 * Compares two prerelease identifiers, spec rule 11.4.
 *
 * Numeric identifiers always sort below alphanumeric ones, and numeric ones
 * compare as numbers. The comparison is done on digit count first rather than by
 * converting to a number, so that an absurdly long identifier still orders
 * correctly instead of quietly becoming a float.
 */
export function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) {
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Spec precedence. Build metadata takes no part, so 1.0.0+a equals 1.0.0+b. */
export function compare(a: Semver, b: Semver): -1 | 0 | 1 {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  // A version with a prerelease has lower precedence than one without.
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

  const shared = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < shared; i += 1) {
    const order = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (order !== 0) return order < 0 ? -1 : 1;
  }
  // All shared identifiers equal: the longer set wins.
  if (a.prerelease.length === b.prerelease.length) return 0;
  return a.prerelease.length < b.prerelease.length ? -1 : 1;
}

/** Ascending precedence order. Stable for versions that compare equal. */
export function sortVersions(versions: readonly Semver[]): Semver[] {
  return versions
    .map((version, index) => ({ version, index }))
    .sort((left, right) => compare(left.version, right.version) || left.index - right.index)
    .map((entry) => entry.version);
}

export type DiffKind = 'same' | 'build' | 'prerelease' | 'patch' | 'minor' | 'major';

/** The largest part that differs — what a changelog entry would be filed under. */
export function diffKind(a: Semver, b: Semver): DiffKind {
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  if (a.prerelease.join('.') !== b.prerelease.join('.')) return 'prerelease';
  if (a.build.join('.') !== b.build.join('.')) return 'build';
  return 'same';
}

/* ── Ranges ───────────────────────────────── */

export type Op = '<' | '<=' | '>' | '>=' | '=';

export type Comparator = { op: Op; version: Semver };

/** An or-set of and-groups, exactly as npm's grammar describes a range. */
export type Range = { groups: Comparator[][]; raw: string };

const ANY = '*';

function core(major: number, minor: number, patch: number, prerelease: string[] = []): Semver {
  return {
    major,
    minor,
    patch,
    prerelease,
    build: [],
    raw: `${major}.${minor}.${patch}${prerelease.length > 0 ? `-${prerelease.join('.')}` : ''}`,
  };
}

/** The lowest possible prerelease of a version — the wall a `<` ceiling needs. */
function floorOf(major: number, minor: number, patch: number): Semver {
  return core(major, minor, patch, ['0']);
}

type Partial = {
  major: number | null;
  minor: number | null;
  patch: number | null;
  prerelease: string[];
  build: string[];
};

/** `1.2.x`, `1`, `*`, `1.2.3-rc.1` — a version with holes allowed. */
function parsePartial(text: string): Partial | null {
  const trimmed = text.trim().replace(/^v/, '');
  if (trimmed === '' || trimmed === ANY || /^[xX]$/.test(trimmed)) {
    return { major: null, minor: null, patch: null, prerelease: [], build: [] };
  }
  const shape =
    /^(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/.exec(
      trimmed
    );
  if (!shape) return null;
  const hole = (part: string | undefined) =>
    part === undefined || part === '' || /^[xX*]$/.test(part) ? null : Number(part);
  const major = hole(shape[1]);
  const minor = hole(shape[2]);
  const patch = hole(shape[3]);
  // A hole cannot be filled to the right of another hole: 1.x.3 is meaningless.
  if (major === null && (minor !== null || patch !== null)) return null;
  if (minor === null && patch !== null) return null;
  return {
    major,
    minor,
    patch,
    prerelease: shape[4] === undefined ? [] : shape[4].split('.'),
    build: shape[5] === undefined ? [] : shape[5].split('.'),
  };
}

function toComparators(op: Op | '^' | '~' | '', part: Partial): Comparator[] | null {
  const { major, minor, patch, prerelease } = part;

  // A bare `*`, `x`, or empty string: every release, prereleases excluded by the
  // prerelease rule rather than by the bound. An operator with nothing after it
  // (`^`, `>=`, `~`) is a typo rather than a wildcard, so it is refused — saying
  // "that covers everything" about a half-typed range would be worse than an
  // error message.
  if (major === null) {
    if (op !== '') return null;
    return [{ op: '>=', version: core(0, 0, 0) }];
  }

  const exact = minor !== null && patch !== null;

  if (op === '^') {
    const from = core(major, minor ?? 0, patch ?? 0, prerelease);
    // The caret keeps the leftmost non-zero part fixed. Below 1.0.0 that part is
    // the minor (or the patch), which is why ^0.2.3 will not take 0.3.0 —
    // a 0.x minor bump is treated as a breaking change.
    if (major !== 0) return [{ op: '>=', version: from }, { op: '<', version: floorOf(major + 1, 0, 0) }];
    if (minor === null) return [{ op: '>=', version: from }, { op: '<', version: floorOf(1, 0, 0) }];
    if (minor !== 0 || patch === null) {
      return [{ op: '>=', version: from }, { op: '<', version: floorOf(0, minor + 1, 0) }];
    }
    return [{ op: '>=', version: from }, { op: '<', version: floorOf(0, 0, patch + 1) }];
  }

  if (op === '~') {
    const from = core(major, minor ?? 0, patch ?? 0, prerelease);
    // ~1.2.3 and ~1.2 both allow patch-level changes; ~1 allows minor ones.
    if (minor === null) return [{ op: '>=', version: from }, { op: '<', version: floorOf(major + 1, 0, 0) }];
    return [{ op: '>=', version: from }, { op: '<', version: floorOf(major, minor + 1, 0) }];
  }

  if (op === '>' ) {
    if (exact) return [{ op: '>', version: core(major, minor, patch, prerelease) }];
    // `>1.2` means "after everything in 1.2", i.e. from 1.3.0 onwards.
    if (minor === null) return [{ op: '>=', version: core(major + 1, 0, 0) }];
    return [{ op: '>=', version: core(major, minor + 1, 0) }];
  }

  if (op === '<') {
    if (exact) return [{ op: '<', version: core(major, minor, patch, prerelease) }];
    if (minor === null) return [{ op: '<', version: floorOf(major, 0, 0) }];
    return [{ op: '<', version: floorOf(major, minor, 0) }];
  }

  if (op === '>=') {
    return [{ op: '>=', version: core(major, minor ?? 0, patch ?? 0, prerelease) }];
  }

  if (op === '<=') {
    if (exact) return [{ op: '<=', version: core(major, minor, patch, prerelease) }];
    // `<=1.2` includes all of 1.2, so the ceiling sits at the 1.3.0 wall.
    if (minor === null) return [{ op: '<', version: floorOf(major + 1, 0, 0) }];
    return [{ op: '<', version: floorOf(major, minor + 1, 0) }];
  }

  // `=` or no operator at all: an exact version, or the whole band a partial names.
  if (exact) return [{ op: '=', version: core(major, minor, patch, prerelease) }];
  if (minor === null) {
    return [
      { op: '>=', version: core(major, 0, 0) },
      { op: '<', version: floorOf(major + 1, 0, 0) },
    ];
  }
  return [
    { op: '>=', version: core(major, minor, 0) },
    { op: '<', version: floorOf(major, minor + 1, 0) },
  ];
}

function hyphenRange(left: string, right: string): Comparator[] | null {
  const from = parsePartial(left);
  const to = parsePartial(right);
  if (!from || !to) return null;
  const lower =
    from.major === null
      ? { op: '>=' as Op, version: core(0, 0, 0) }
      : { op: '>=' as Op, version: core(from.major, from.minor ?? 0, from.patch ?? 0, from.prerelease) };
  // `1.2.3 - 2.3` means up to the end of 2.3, so the ceiling is the 2.4.0 wall.
  const upper =
    to.major === null
      ? null
      : to.minor === null
        ? { op: '<' as Op, version: floorOf(to.major + 1, 0, 0) }
        : to.patch === null
          ? { op: '<' as Op, version: floorOf(to.major, to.minor + 1, 0) }
          : { op: '<=' as Op, version: core(to.major, to.minor, to.patch, to.prerelease) };
  return upper === null ? [lower] : [lower, upper];
}

/**
 * A full npm range: or-groups separated by `||`, each a whitespace-separated
 * conjunction of comparators, hyphen ranges included.
 */
export function parseRange(text: string): Range | null {
  const raw = text.trim();
  const groups: Comparator[][] = [];

  for (const alternative of raw.split('||')) {
    const body = alternative.trim().replace(/\s+/g, ' ');
    if (body === '') {
      groups.push([{ op: '>=', version: core(0, 0, 0) }]);
      continue;
    }

    const comparators: Comparator[] = [];
    const tokens = body.split(' ');
    let index = 0;
    let failed = false;

    while (index < tokens.length) {
      // A hyphen range is three tokens: `1.2.3 - 2.3.4`.
      if (tokens[index + 1] === '-' && tokens[index + 2] !== undefined) {
        const pair = hyphenRange(tokens[index], tokens[index + 2]);
        if (!pair) {
          failed = true;
          break;
        }
        comparators.push(...pair);
        index += 3;
        continue;
      }

      const token = tokens[index];
      const opMatch = /^(<=|>=|<|>|=|\^|~>|~)/.exec(token);
      const op = opMatch ? (opMatch[1] === '~>' ? '~' : opMatch[1]) : '';
      const rest = opMatch ? token.slice(opMatch[1].length) : token;
      const part = parsePartial(rest);
      if (!part) {
        failed = true;
        break;
      }
      const built = toComparators(op as Op | '^' | '~' | '', part);
      if (!built) {
        failed = true;
        break;
      }
      comparators.push(...built);
      index += 1;
    }

    if (failed) return null;
    groups.push(comparators);
  }

  if (groups.length === 0) return null;
  return { groups, raw };
}

/** Renders a parsed range back as explicit comparators, one group per line. */
export function formatRange(range: Range): string {
  return range.groups
    .map((group) =>
      group.map((comparator) => `${comparator.op}${format(comparator.version)}`).join(' ')
    )
    .join(' || ');
}

function satisfiesComparator(version: Semver, comparator: Comparator): boolean {
  const order = compare(version, comparator.version);
  switch (comparator.op) {
    case '=':
      return order === 0;
    case '>':
      return order > 0;
    case '>=':
      return order >= 0;
    case '<':
      return order < 0;
    default:
      return order <= 0;
  }
}

const sameCore = (a: Semver, b: Semver) =>
  a.major === b.major && a.minor === b.minor && a.patch === b.patch;

/**
 * Whether `version` is inside `range`.
 *
 * The prerelease rule lives here. A prerelease is only admitted when a
 * comparator in the *same* and-group pins the same major.minor.patch and itself
 * carries a prerelease — the npm behaviour that stops a published `2.0.0-beta`
 * reaching everyone who wrote `^1.0.0 || ^2.0.0`.
 */
export function satisfies(version: Semver, range: Range, includePrerelease = false): boolean {
  return range.groups.some((group) => {
    if (!group.every((comparator) => satisfiesComparator(version, comparator))) return false;
    if (version.prerelease.length === 0 || includePrerelease) return true;
    return group.some(
      (comparator) => comparator.version.prerelease.length > 0 && sameCore(comparator.version, version)
    );
  });
}

export type Bounds = {
  lower: Semver | null;
  lowerInclusive: boolean;
  upper: Semver | null;
  upperInclusive: boolean;
  /** No version at all can satisfy this group. */
  empty: boolean;
};

/** The tightest interval an and-group describes, for stating it in prose. */
export function boundsOf(group: readonly Comparator[]): Bounds {
  let lower: Semver | null = null;
  let lowerInclusive = true;
  let upper: Semver | null = null;
  let upperInclusive = true;

  for (const comparator of group) {
    if (comparator.op === '=') {
      if (lower === null || compare(comparator.version, lower) >= 0) {
        lower = comparator.version;
        lowerInclusive = true;
      }
      if (upper === null || compare(comparator.version, upper) <= 0) {
        upper = comparator.version;
        upperInclusive = true;
      }
      continue;
    }
    if (comparator.op === '>' || comparator.op === '>=') {
      const inclusive = comparator.op === '>=';
      if (
        lower === null ||
        compare(comparator.version, lower) > 0 ||
        (compare(comparator.version, lower) === 0 && !inclusive)
      ) {
        lower = comparator.version;
        lowerInclusive = inclusive;
      }
      continue;
    }
    const inclusive = comparator.op === '<=';
    if (
      upper === null ||
      compare(comparator.version, upper) < 0 ||
      (compare(comparator.version, upper) === 0 && !inclusive)
    ) {
      upper = comparator.version;
      upperInclusive = inclusive;
    }
  }

  const order = lower !== null && upper !== null ? compare(lower, upper) : -1;
  const empty = order > 0 || (order === 0 && !(lowerInclusive && upperInclusive));
  return { lower, lowerInclusive, upper, upperInclusive, empty };
}

/** Highest version in `versions` that satisfies `range`, or null. */
export function maxSatisfying(
  versions: readonly Semver[],
  range: Range,
  includePrerelease = false
): Semver | null {
  const allowed = versions.filter((version) => satisfies(version, range, includePrerelease));
  if (allowed.length === 0) return null;
  return sortVersions(allowed)[allowed.length - 1];
}

export function minSatisfying(
  versions: readonly Semver[],
  range: Range,
  includePrerelease = false
): Semver | null {
  const allowed = versions.filter((version) => satisfies(version, range, includePrerelease));
  if (allowed.length === 0) return null;
  return sortVersions(allowed)[0];
}

/**
 * Versions worth testing a range against: every bound, its neighbours, and the
 * release after the ceiling. Enough to make an off-by-one bound visible without
 * asking the reader to invent examples.
 */
export function probeVersions(range: Range): Semver[] {
  const seen = new Map<string, Semver>();
  const add = (version: Semver) => {
    const key = format(version);
    if (!seen.has(key)) seen.set(key, version);
  };

  for (const group of range.groups) {
    for (const comparator of group) {
      const { major, minor, patch } = comparator.version;
      add(comparator.version);
      add(core(major, minor, patch));
      if (patch > 0) add(core(major, minor, patch - 1));
      add(core(major, minor, patch + 1));
      add(core(major, minor + 1, 0));
      add(core(major + 1, 0, 0));
      add(core(major, minor, patch, ['rc', '1']));
    }
  }
  return sortVersions(Array.from(seen.values()));
}
