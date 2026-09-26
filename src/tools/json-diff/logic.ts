/**
 * Structural JSON comparison.
 *
 * A text diff of two JSON documents reports the wrong thing twice over: it
 * calls a reordered object a change when the document is identical, and it
 * calls `"1"` becoming `1` a one-character edit when it is the bug that broke
 * production. So this walks both trees instead, and keeps four outcomes apart —
 * added, removed, retyped, and changed in value.
 *
 * Arrays are the hard part, because "the same element" is not defined by JSON.
 * Three policies are offered and the choice is the caller's: by position
 * (right for tuples and fixed layouts), by a key field (right for records from
 * an API), or as an unordered bag (right when order carries no meaning).
 */

export type JsonType = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

export type ChangeKind = 'add' | 'remove' | 'retype' | 'change';

export type Change = {
  kind: ChangeKind;
  /** `$.orders[0].total`, in the shape a reader can search the document for. */
  path: string;
  left?: unknown;
  right?: unknown;
  leftType?: JsonType;
  rightType?: JsonType;
};

export type ArrayMode = 'index' | 'key' | 'bag';

export type Options = {
  arrayMode: ArrayMode;
  /** Member used to pair up array elements when `arrayMode` is 'key'. */
  keyField: string;
  /** Absolute difference under which two numbers count as equal. 0 = exact. */
  tolerance: number;
  /** Treat a missing member and an explicit null as the same thing. */
  nullIsAbsent: boolean;
};

export const DEFAULTS: Options = {
  arrayMode: 'index',
  keyField: 'id',
  tolerance: 0,
  nullIsAbsent: false,
};

/** Changes recorded before the walk gives up. */
export const MAX_CHANGES = 20_000;
/** Nesting levels walked before the walk gives up. */
export const MAX_DEPTH = 300;

export class DiffTooBig extends Error {
  readonly reason: 'changes' | 'depth';

  constructor(reason: 'changes' | 'depth') {
    super(
      reason === 'changes'
        ? `more than ${MAX_CHANGES} differences`
        : `nesting deeper than ${MAX_DEPTH} levels`
    );
    this.name = 'DiffTooBig';
    this.reason = reason;
  }
}

export function typeOf(value: unknown): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'boolean' || t === 'number' || t === 'string') return t;
  // Nothing else can come out of JSON.parse; a caller passing a Date or a
  // function is a programming error, not an input to diff.
  throw new TypeError(`not a JSON value: ${t}`);
}

/** `$.a.b[0]` when the key is an identifier, `$['odd key']` when it is not. */
export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${base}.${key}`;
  return `${base}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

/** Stable key for bag mode: object members sorted so key order cannot matter. */
export function canonical(value: unknown): string {
  const type = typeOf(value);
  if (type === 'array') return `[${(value as unknown[]).map(canonical).join(',')}]`;
  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameNumber(a: number, b: number, tolerance: number): boolean {
  if (a === b) return true;
  // NaN and Infinity cannot appear in JSON, so no special cases are needed.
  return tolerance > 0 && Math.abs(a - b) <= tolerance;
}

type Walk = { changes: Change[]; options: Options };

function record(walk: Walk, change: Change): void {
  walk.changes.push(change);
  if (walk.changes.length > MAX_CHANGES) throw new DiffTooBig('changes');
}

/** Pairs array elements by a key member. Unpairable elements fall back to order. */
function pairByKey(
  left: readonly unknown[],
  right: readonly unknown[],
  keyField: string
): { pairs: [number, number][]; onlyLeft: number[]; onlyRight: number[] } {
  const keyOf = (item: unknown): string | null => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    const value = (item as Record<string, unknown>)[keyField];
    if (value === null || value === undefined || typeof value === 'object') return null;
    return String(value);
  };

  const index = new Map<string, number[]>();
  left.forEach((item, i) => {
    const key = keyOf(item);
    if (key === null) return;
    const bucket = index.get(key);
    if (bucket) bucket.push(i);
    else index.set(key, [i]);
  });

  const pairs: [number, number][] = [];
  const takenLeft = new Set<number>();
  const onlyRight: number[] = [];

  right.forEach((item, j) => {
    const key = keyOf(item);
    const bucket = key === null ? undefined : index.get(key);
    if (!bucket || bucket.length === 0) {
      onlyRight.push(j);
      return;
    }
    const i = bucket.shift()!;
    takenLeft.add(i);
    pairs.push([i, j]);
  });

  const onlyLeft = left.map((_, i) => i).filter((i) => !takenLeft.has(i) && keyOf(left[i]) !== null);
  // Elements without a usable key on either side are compared by position, so
  // a list that only partly carries the key field still produces a useful diff.
  const leftUnkeyed = left.map((_, i) => i).filter((i) => keyOf(left[i]) === null);
  const rightUnkeyed = onlyRight.filter((j) => keyOf(right[j]) === null);
  const shared = Math.min(leftUnkeyed.length, rightUnkeyed.length);
  for (let n = 0; n < shared; n += 1) pairs.push([leftUnkeyed[n], rightUnkeyed[n]]);
  const pairedRight = new Set(pairs.map(([, j]) => j));

  return {
    pairs: pairs.sort((a, b) => a[1] - b[1]),
    onlyLeft: onlyLeft.concat(leftUnkeyed.slice(shared)).sort((a, b) => a - b),
    onlyRight: onlyRight.filter((j) => !pairedRight.has(j)),
  };
}

function diffArrays(left: readonly unknown[], right: readonly unknown[], path: string, depth: number, walk: Walk): void {
  const { arrayMode, keyField } = walk.options;

  if (arrayMode === 'bag') {
    // Multiset comparison: identical elements cancel out, whatever their order.
    const counts = new Map<string, { n: number; value: unknown }>();
    for (const item of left) {
      const key = canonical(item);
      const seen = counts.get(key);
      if (seen) seen.n += 1;
      else counts.set(key, { n: 1, value: item });
    }
    for (const item of right) {
      const key = canonical(item);
      const seen = counts.get(key);
      if (seen && seen.n > 0) seen.n -= 1;
      else record(walk, { kind: 'add', path, right: item, rightType: typeOf(item) });
    }
    for (const entry of counts.values()) {
      for (let n = 0; n < entry.n; n += 1) {
        record(walk, { kind: 'remove', path, left: entry.value, leftType: typeOf(entry.value) });
      }
    }
    return;
  }

  if (arrayMode === 'key') {
    const { pairs, onlyLeft, onlyRight } = pairByKey(left, right, keyField);
    for (const [i, j] of pairs) walkValue(left[i], right[j], joinPath(path, j), depth + 1, walk);
    for (const i of onlyLeft) {
      record(walk, { kind: 'remove', path: joinPath(path, i), left: left[i], leftType: typeOf(left[i]) });
    }
    for (const j of onlyRight) {
      record(walk, { kind: 'add', path: joinPath(path, j), right: right[j], rightType: typeOf(right[j]) });
    }
    return;
  }

  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) walkValue(left[i], right[i], joinPath(path, i), depth + 1, walk);
  for (let i = shared; i < left.length; i += 1) {
    record(walk, { kind: 'remove', path: joinPath(path, i), left: left[i], leftType: typeOf(left[i]) });
  }
  for (let i = shared; i < right.length; i += 1) {
    record(walk, { kind: 'add', path: joinPath(path, i), right: right[i], rightType: typeOf(right[i]) });
  }
}

function walkValue(left: unknown, right: unknown, path: string, depth: number, walk: Walk): void {
  if (depth > MAX_DEPTH) throw new DiffTooBig('depth');

  const leftType = typeOf(left);
  const rightType = typeOf(right);

  if (leftType !== rightType) {
    record(walk, { kind: 'retype', path, left, right, leftType, rightType });
    return;
  }

  if (leftType === 'object') {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const absent = walk.options.nullIsAbsent;
    for (const key of Object.keys(a)) {
      if (Object.hasOwn(b, key)) {
        walkValue(a[key], b[key], joinPath(path, key), depth + 1, walk);
      } else if (!(absent && a[key] === null)) {
        record(walk, { kind: 'remove', path: joinPath(path, key), left: a[key], leftType: typeOf(a[key]) });
      }
    }
    for (const key of Object.keys(b)) {
      if (Object.hasOwn(a, key)) continue;
      if (absent && b[key] === null) continue;
      record(walk, { kind: 'add', path: joinPath(path, key), right: b[key], rightType: typeOf(b[key]) });
    }
    return;
  }

  if (leftType === 'array') {
    diffArrays(left as unknown[], right as unknown[], path, depth, walk);
    return;
  }

  if (leftType === 'number') {
    if (!sameNumber(left as number, right as number, walk.options.tolerance)) {
      record(walk, { kind: 'change', path, left, right, leftType, rightType });
    }
    return;
  }

  if (left !== right) {
    record(walk, { kind: 'change', path, left, right, leftType, rightType });
  }
}

/** Every difference between two parsed JSON values, in document order. */
export function diffJson(left: unknown, right: unknown, options: Options = DEFAULTS): Change[] {
  const walk: Walk = { changes: [], options };
  walkValue(left, right, '$', 0, walk);
  return walk.changes;
}

export type Summary = { add: number; remove: number; retype: number; change: number; total: number };

export function summarise(changes: readonly Change[]): Summary {
  const summary: Summary = { add: 0, remove: 0, retype: 0, change: 0, total: changes.length };
  for (const change of changes) summary[change.kind] += 1;
  return summary;
}

const MARK: Record<ChangeKind, string> = { add: '+', remove: '-', retype: '!', change: '~' };

function show(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** One line per change, for the clipboard. */
export function formatChanges(changes: readonly Change[]): string {
  return changes
    .map((change) => {
      const mark = MARK[change.kind];
      if (change.kind === 'add') return `${mark} ${change.path} = ${show(change.right)}`;
      if (change.kind === 'remove') return `${mark} ${change.path} = ${show(change.left)}`;
      if (change.kind === 'retype') {
        return `${mark} ${change.path}: ${change.leftType} -> ${change.rightType}  ${show(change.left)} -> ${show(change.right)}`;
      }
      return `${mark} ${change.path}: ${show(change.left)} -> ${show(change.right)}`;
    })
    .join('\n');
}

export type Side = { ok: true; value: unknown } | { ok: false; message: string };

export function parseSide(text: string): Side {
  if (text.trim() === '') return { ok: false, message: 'empty' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export type Outcome =
  | { ok: true; changes: Change[]; summary: Summary }
  | { ok: false; side: 'left' | 'right' | 'both'; message: string };

/** Parse both sides and compare, with every failure turned into a message. */
export function compare(leftText: string, rightText: string, options: Options = DEFAULTS): Outcome {
  const left = parseSide(leftText);
  const right = parseSide(rightText);
  if (!left.ok && !right.ok) return { ok: false, side: 'both', message: left.message };
  if (!left.ok) return { ok: false, side: 'left', message: left.message };
  if (!right.ok) return { ok: false, side: 'right', message: right.message };
  const changes = diffJson(left.value, right.value, options);
  return { ok: true, changes, summary: summarise(changes) };
}
