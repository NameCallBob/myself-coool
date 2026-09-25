/**
 * Myers diff, with the trimming that makes it usable on real input.
 *
 * The algorithm is O((N+M)·D) in the edit distance D, which is fast when two
 * texts are similar and slow when they are not — exactly the wrong shape for a
 * paste box, where "completely different" is a normal thing to try. So the
 * common prefix and suffix come off first (that is most of the work in a real
 * edit), and a ceiling on the remaining size turns the pathological case into
 * a message instead of a frozen tab.
 */

export type Kind = 'equal' | 'insert' | 'delete';
export type Op = { kind: Kind; value: string };

/** Above this many tokens on the changed span, report instead of grinding. */
export const TOKEN_CEILING = 12_000;

export class DiffTooLarge extends Error {
  /** Declared and assigned separately: Node's type-stripping test runner
   *  rejects TypeScript parameter properties. */
  readonly tokens: number;

  constructor(tokens: number) {
    super(`too many changed tokens to diff (${tokens} > ${TOKEN_CEILING})`);
    this.name = 'DiffTooLarge';
    this.tokens = tokens;
  }
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  // Keep the line content only; the renderer re-adds separators, so CRLF and
  // LF inputs compare equal instead of differing on every single line.
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * CJK ranges, written out because the classes matter: Unified Ideographs and
 * Extension A, compatibility forms, CJK punctuation, and the full-width block.
 */
const CJK = '\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
const WORDS = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g');

/**
 * Whitespace runs, one CJK character at a time, everything else in word-ish
 * chunks. Chinese has no spaces, so splitting on them would make a paragraph a
 * single token and report the whole thing replaced over a one-character edit.
 */
export function splitWords(text: string): string[] {
  return text.match(WORDS) ?? [];
}

/** Length of the shared head of two token lists. */
function prefix(a: readonly string[], b: readonly string[]): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/** Length of the shared tail, never overlapping the head. */
function suffix(a: readonly string[], b: readonly string[], head: number): number {
  const limit = Math.min(a.length, b.length) - head;
  let i = 0;
  while (i < limit && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

/** Myers' greedy forward pass, keeping each round's frontier for backtracking. */
function trace(a: readonly string[], b: readonly string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  const history: number[][] = [];

  for (let d = 0; d <= max; d += 1) {
    history.push(Array.from(v));
    for (let k = -d; k <= d; k += 2) {
      // Step down from k+1 when that path is further along, else right from k-1.
      const down = k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset]);
      let x = down ? v[k + 1 + offset] : v[k - 1 + offset] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) return history;
    }
  }
  return history;
}

/**
 * Walks the frontier history backwards to recover the script.
 *
 * `history[d]` is the frontier as it stood before round d, so the k-line that
 * led into the current position tells us which move round d made: arriving on
 * k+1 means an insertion, k-1 a deletion, and any diagonal run before that is
 * unchanged text. Discovered last-first, so the runs are reversed at the end.
 */
function walkBack(a: readonly string[], b: readonly string[], history: number[][]): Op[] {
  const offset = a.length + b.length;
  const runs: Op[] = [];
  let x = a.length;
  let y = b.length;

  const push = (kind: Kind, value: string) => {
    const last = runs[runs.length - 1];
    // Prepending inside a run keeps its text forward-ordered even though the
    // runs themselves arrive backwards.
    if (last && last.kind === kind) last.value = value + last.value;
    else runs.push({ kind, value });
  };

  for (let d = history.length - 1; d >= 0; d -= 1) {
    const v = history[d];
    const k = x - y;
    const fromAbove = k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset]);
    const previousK = fromAbove ? k + 1 : k - 1;
    const previousX = d === 0 ? 0 : v[previousK + offset];
    const previousY = d === 0 ? 0 : previousX - previousK;

    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      push('equal', a[x]);
    }
    if (d > 0) {
      if (x === previousX) {
        y -= 1;
        push('insert', b[y]);
      } else {
        x -= 1;
        push('delete', a[x]);
      }
    }
    x = previousX;
    y = previousY;
  }

  return runs.reverse();
}

/**
 * Minimal edit script turning `a` into `b`, as runs of equal/insert/delete.
 * Adjacent operations of the same kind are merged, so the caller renders spans
 * rather than one element per token.
 */
export function diffTokens(a: readonly string[], b: readonly string[]): Op[] {
  const head = prefix(a, b);
  const tail = suffix(a, b, head);
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  if (midA.length + midB.length > TOKEN_CEILING) {
    throw new DiffTooLarge(midA.length + midB.length);
  }

  const ops: Op[] = [];
  if (head > 0) ops.push({ kind: 'equal', value: a.slice(0, head).join('') });

  if (midA.length === 0 && midB.length > 0) {
    ops.push({ kind: 'insert', value: midB.join('') });
  } else if (midB.length === 0 && midA.length > 0) {
    ops.push({ kind: 'delete', value: midA.join('') });
  } else if (midA.length > 0) {
    ops.push(...walkBack(midA, midB, trace(midA, midB)));
  }

  if (tail > 0) ops.push({ kind: 'equal', value: a.slice(a.length - tail).join('') });

  // Merge across the seams the prefix/suffix split introduced.
  return ops.reduce<Op[]>((out, op) => {
    const last = out[out.length - 1];
    if (last && last.kind === op.kind) last.value += op.value;
    else if (op.value !== '') out.push({ ...op });
    return out;
  }, []);
}

export type Stats = { added: number; removed: number; unchanged: number };

/**
 * Counts in the unit the reader chose. Line tokens carry their own trailing
 * newline, so splitting on it would count "one changed line\n" as two — the
 * separator belongs to the line before it, not to a new empty one.
 */
export function countStats(ops: readonly Op[], unit: 'line' | 'word'): Stats {
  const lines = (value: string) => {
    if (value === '') return 0;
    const breaks = (value.match(/\n/g) ?? []).length;
    return value.endsWith('\n') ? breaks : breaks + 1;
  };
  const size = (value: string) => (unit === 'line' ? lines(value) : splitWords(value).length);

  return ops.reduce<Stats>(
    (stats, op) => {
      if (op.kind === 'insert') stats.added += size(op.value);
      else if (op.kind === 'delete') stats.removed += size(op.value);
      else stats.unchanged += size(op.value);
      return stats;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

/** Line-mode diff. Tokens carry their own newline so joins stay faithful. */
export function diffLines(left: string, right: string): Op[] {
  const asTokens = (text: string) => {
    const lines = splitLines(text);
    return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line));
  };
  return diffTokens(asTokens(left), asTokens(right));
}

export function diffWords(left: string, right: string): Op[] {
  return diffTokens(splitWords(left), splitWords(right));
}

export type DiffRow = { kind: Kind; text: string };

/**
 * Line-mode runs flattened to one row per line.
 *
 * Rendering line mode as inline spans runs a deleted line straight into the
 * inserted one whenever the deleted line was the last in the file and so
 * carries no trailing newline. A diff is read as rows; this is what makes the
 * rows explicit rather than relying on the text to contain its own breaks.
 */
export function toRows(ops: readonly Op[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const op of ops) {
    const lines = op.value.split('\n');
    // A trailing newline closes the previous line; it does not open a new one.
    if (lines[lines.length - 1] === '') lines.pop();
    for (const text of lines) rows.push({ kind: op.kind, text });
  }
  return rows;
}

/** Unified-diff text for the clipboard. Only line mode has a standard form. */
export function toUnified(ops: readonly Op[]): string {
  const mark = { equal: ' ', insert: '+', delete: '-' } as const;
  return toRows(ops)
    .map((row) => `${mark[row.kind]}${row.text}`)
    .join('\n');
}
