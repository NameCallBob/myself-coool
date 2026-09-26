/**
 * Line operations as one ordered pipeline.
 *
 * Order is the whole design. Trimming after deduplicating leaves `a` and `a `
 * as two lines; deduplicating after sorting is cheaper but loses the ability to
 * keep the first occurrence in original order. So the steps run in a fixed
 * sequence — split, trim, filter, drop blanks, dedupe, sort, reverse, affix,
 * number — and the UI states that sequence rather than letting the reader guess
 * why their result looks the way it does.
 *
 * Sorting defaults to code-point order, like `LC_ALL=C sort`, because that is
 * the only order that is the same in every browser. Locale order is available
 * and labelled as what it is: browser-dependent.
 */

/** Above this many lines, process the head and report the cut. */
export const MAX_LINES = 200_000;

export type SortKind = 'none' | 'text' | 'natural' | 'length' | 'numeric';
export type Direction = 'asc' | 'desc';
export type DedupeKind = 'none' | 'adjacent' | 'all';
export type Collate = 'binary' | 'locale';

export type Options = {
  trim: boolean;
  dropEmpty: boolean;
  /** Keep only lines containing this text. Empty means keep everything. */
  keep: string;
  /** Drop lines containing this text. Empty means drop nothing. */
  drop: string;
  filterIgnoreCase: boolean;
  dedupe: DedupeKind;
  dedupeIgnoreCase: boolean;
  /** Compare with leading and trailing whitespace ignored when deduping. */
  dedupeIgnoreWhitespace: boolean;
  sort: SortKind;
  sortIgnoreCase: boolean;
  direction: Direction;
  collate: Collate;
  reverse: boolean;
  number: boolean;
  numberStart: number;
  numberPad: boolean;
  numberSeparator: string;
  prefix: string;
  suffix: string;
};

export const DEFAULTS: Options = {
  trim: false,
  dropEmpty: false,
  keep: '',
  drop: '',
  filterIgnoreCase: true,
  dedupe: 'none',
  dedupeIgnoreCase: false,
  dedupeIgnoreWhitespace: true,
  sort: 'none',
  sortIgnoreCase: false,
  direction: 'asc',
  collate: 'binary',
  reverse: false,
  number: false,
  numberStart: 1,
  numberPad: true,
  numberSeparator: '. ',
  prefix: '',
  suffix: '',
};

export type Stats = {
  input: number;
  output: number;
  filtered: number;
  blanks: number;
  duplicates: number;
  truncated: boolean;
};

export type Result = { lines: string[]; stats: Stats };

/** CRLF and CR fold to LF so a Windows paste is not one giant line. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n?/g, '\n').split('\n');
}

const CHUNKS = /\d+|\D+/g;
const STARTS_DIGIT = /^\d/;

function compareText(a: string, b: string, collator: Intl.Collator | null): number {
  if (collator) return collator.compare(a, b);
  // Code-point order: predictable, identical everywhere, uppercase before
  // lowercase. The caller folds case beforehand when that is not wanted.
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Digit runs compared as numbers, everything else as text, so `file10` sorts
 * after `file2`.
 *
 * Digit runs are compared by stripped length and then lexicographically rather
 * than via `Number()`: a 30-digit part number exceeds the precision of a double
 * and `Number()` would call two different versions equal. `007` and `7` have the
 * same value, so the shorter one goes first to keep the order total.
 */
export function naturalCompare(a: string, b: string, collator: Intl.Collator | null = null): number {
  CHUNKS.lastIndex = 0;
  const left = a.match(CHUNKS) ?? [];
  CHUNKS.lastIndex = 0;
  const right = b.match(CHUNKS) ?? [];
  const shared = Math.min(left.length, right.length);

  for (let i = 0; i < shared; i += 1) {
    const x = left[i];
    const y = right[i];
    const xd = STARTS_DIGIT.test(x);
    const yd = STARTS_DIGIT.test(y);
    if (xd && yd) {
      const sx = x.replace(/^0+(?=\d)/, '');
      const sy = y.replace(/^0+(?=\d)/, '');
      if (sx.length !== sy.length) return sx.length - sy.length;
      if (sx !== sy) return sx < sy ? -1 : 1;
      if (x.length !== y.length) return x.length - y.length;
    } else {
      const order = compareText(x, y, collator);
      if (order !== 0) return order;
    }
  }
  return left.length - right.length;
}

/** Leading number of a line, or null when it does not start with one. */
export function leadingNumber(line: string): number | null {
  const found = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(line.trim());
  if (!found) return null;
  const value = Number(found[0]);
  return Number.isFinite(value) ? value : null;
}

function collatorFor(options: Options): Intl.Collator | null {
  if (options.collate !== 'locale') return null;
  try {
    // No locale argument: the reader's own locale is the one they mean.
    return new Intl.Collator(undefined, { sensitivity: 'variant' });
  } catch {
    return null;
  }
}

export function sortLines(lines: readonly string[], options: Options): string[] {
  if (options.sort === 'none') return lines.slice();
  const collator = collatorFor(options);
  const fold = (line: string) => (options.sortIgnoreCase ? line.toLowerCase() : line);
  const sign = options.direction === 'desc' ? -1 : 1;

  const out = lines.slice();
  out.sort((a, b) => {
    if (options.sort === 'length') {
      // Code points, not UTF-16 units: an emoji is one character long.
      const difference = [...a].length - [...b].length;
      return sign * (difference !== 0 ? difference : compareText(a, b, collator));
    }
    if (options.sort === 'numeric') {
      const na = leadingNumber(a);
      const nb = leadingNumber(b);
      // Lines without a number go last in either direction: they are not part
      // of the ordering being asked for.
      if (na === null && nb === null) return compareText(a, b, collator);
      if (na === null) return 1;
      if (nb === null) return -1;
      return sign * (na === nb ? compareText(a, b, collator) : na < nb ? -1 : 1);
    }
    if (options.sort === 'natural') return sign * naturalCompare(fold(a), fold(b), collator);
    return sign * compareText(fold(a), fold(b), collator);
  });
  return out;
}

export type DedupeResult = { lines: string[]; removed: number };

/**
 * `adjacent` is `uniq`: it only collapses neighbours, so it finds runs in an
 * already-sorted file. `all` keeps the first occurrence anywhere, which is what
 * people mean by "remove duplicates" on an unsorted list.
 */
export function dedupeLines(
  lines: readonly string[],
  kind: DedupeKind,
  options: { ignoreCase?: boolean; ignoreWhitespace?: boolean } = {}
): DedupeResult {
  if (kind === 'none') return { lines: lines.slice(), removed: 0 };

  const key = (line: string) => {
    let value = options.ignoreWhitespace ? line.trim() : line;
    if (options.ignoreCase) value = value.toLowerCase();
    return value;
  };

  const out: string[] = [];
  if (kind === 'adjacent') {
    let previous: string | null = null;
    for (const line of lines) {
      const k = key(line);
      if (previous !== null && k === previous) continue;
      previous = k;
      out.push(line);
    }
  } else {
    const seen = new Set<string>();
    for (const line of lines) {
      const k = key(line);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(line);
    }
  }
  return { lines: out, removed: lines.length - out.length };
}

/** Line numbers, padded to the widest number so the text stays aligned. */
export function numberLines(
  lines: readonly string[],
  start: number,
  pad: boolean,
  separator: string
): string[] {
  const last = start + lines.length - 1;
  const width = pad ? String(Math.max(Math.abs(start), Math.abs(last))).length : 0;
  return lines.map((line, index) => {
    const n = String(start + index);
    return `${pad ? n.padStart(width, '0') : n}${separator}${line}`;
  });
}

/** The whole pipeline, in the order the UI documents. */
export function process(text: string, options: Options): Result {
  const all = splitLines(text);
  const truncated = all.length > MAX_LINES;
  const input = truncated ? all.slice(0, MAX_LINES) : all;

  let lines = options.trim ? input.map((line) => line.trim()) : input.slice();

  const before = lines.length;
  if (options.keep !== '' || options.drop !== '') {
    const normalise = (value: string) => (options.filterIgnoreCase ? value.toLowerCase() : value);
    const keep = normalise(options.keep);
    const drop = normalise(options.drop);
    lines = lines.filter((line) => {
      const probe = normalise(line);
      if (keep !== '' && !probe.includes(keep)) return false;
      if (drop !== '' && probe.includes(drop)) return false;
      return true;
    });
  }
  const filtered = before - lines.length;

  let blanks = 0;
  if (options.dropEmpty) {
    const kept = lines.filter((line) => line.trim() !== '');
    blanks = lines.length - kept.length;
    lines = kept;
  }

  const deduped = dedupeLines(lines, options.dedupe, {
    ignoreCase: options.dedupeIgnoreCase,
    ignoreWhitespace: options.dedupeIgnoreWhitespace,
  });
  lines = deduped.lines;

  lines = sortLines(lines, options);
  if (options.reverse) lines.reverse();

  if (options.prefix !== '' || options.suffix !== '') {
    lines = lines.map((line) => `${options.prefix}${line}${options.suffix}`);
  }
  if (options.number) {
    lines = numberLines(lines, options.numberStart, options.numberPad, options.numberSeparator);
  }

  return {
    lines,
    stats: {
      input: input.length,
      output: lines.length,
      filtered,
      blanks,
      duplicates: deduped.removed,
      truncated,
    },
  };
}

/** Lines that appear more than once, most frequent first. For the report. */
export function duplicateReport(
  lines: readonly string[],
  options: { ignoreCase?: boolean; ignoreWhitespace?: boolean } = {},
  limit = 20
): { line: string; n: number }[] {
  const tally = new Map<string, { line: string; n: number }>();
  for (const line of lines) {
    let key = options.ignoreWhitespace ? line.trim() : line;
    if (options.ignoreCase) key = key.toLowerCase();
    const entry = tally.get(key);
    if (entry) entry.n += 1;
    else tally.set(key, { line, n: 1 });
  }
  return [...tally.values()]
    .filter((entry) => entry.n > 1)
    .sort((a, b) => b.n - a.n || naturalCompare(a.line, b.line))
    .slice(0, limit);
}
