/**
 * A JSONPath subset: tokenizer, parser, evaluator. No eval, no Function.
 *
 * The shape of the problem is that a path language looks trivial until the
 * filter expressions arrive — `[?(@.price > 10 && @.tags)]` is an expression
 * grammar, and the usual shortcut is to hand it to `new Function`. That turns a
 * query box into arbitrary code execution against whatever the page can reach,
 * so the expression parser here is written out: a Pratt-ish descent over
 * comparison and logical operators, evaluated against the current node only.
 *
 * What is supported is listed in `SUPPORTED`, and what is not is listed in the
 * UI. Anything unrecognised is a parse error with an offset, never a silent
 * "no results" — a query language that answers "nothing matched" when it really
 * means "I did not understand you" is worse than no query language.
 */

/** Node visits before the walk gives up, so `$..*` on a huge document cannot hang. */
export const MAX_VISITS = 400_000;
/** Matches kept before the walk gives up. */
export const MAX_MATCHES = 20_000;

export class QueryError extends Error {
  /** 0-based offset into the query text. Declared apart: no parameter properties. */
  readonly at: number;

  constructor(message: string, at: number) {
    super(message);
    this.name = 'QueryError';
    this.at = at;
  }
}

export class QueryTooBig extends Error {
  readonly visits: number;

  constructor(visits: number) {
    super(`query touched more than ${visits} nodes`);
    this.name = 'QueryTooBig';
    this.visits = visits;
  }
}

/* ── Grammar ──────────────────────────────── */

export type Selector =
  | { kind: 'name'; names: string[] }
  | { kind: 'index'; indexes: number[] }
  | { kind: 'slice'; start: number | null; end: number | null; step: number }
  | { kind: 'wild' }
  | { kind: 'filter'; test: Expr };

export type Segment = { descendant: boolean; selector: Selector };
export type Query = Segment[];

export type Expr =
  | { t: 'lit'; v: unknown }
  | { t: 'path'; fromRoot: boolean; segments: Segment[] }
  | { t: 'cmp'; op: '==' | '!=' | '<' | '<=' | '>' | '>='; a: Expr; b: Expr }
  | { t: 'and'; a: Expr; b: Expr }
  | { t: 'or'; a: Expr; b: Expr }
  | { t: 'not'; a: Expr };

/** Human-readable inventory of the grammar, rendered on the page. */
export const SUPPORTED: string[] = [
  '$',
  '.name',
  "['name']",
  '[0]  [-1]  [0,2]',
  '[1:5]  [::2]',
  '[*]  .*',
  '..name  ..*  ..[0]',
  '[?(@.a == 1)]',
  '[?(@.a > 1 && @.b)]',
  '[?(!@.a || @.b != "x")]',
  '@.length  (array / string length)',
];

/* ── Scanner helpers ──────────────────────── */

const WS = new Set([' ', '\t', '\n', '\r']);

/** Characters a bare `.name` step may contain. Excludes filter operators. */
function isNameChar(ch: string, inFilter: boolean): boolean {
  if (ch === undefined) return false;
  if (WS.has(ch)) return false;
  if ('.[]()\'"!=<>&|,:?@$*'.includes(ch)) return false;
  // Inside a filter a hyphen is a minus sign we do not support, so a key like
  // `content-type` has to be written `['content-type']` there. Outside one
  // there is nothing for it to collide with.
  if (ch === '-' && inFilter) return false;
  return true;
}

type Cursor = { src: string; i: number };

function skip(c: Cursor): void {
  while (c.i < c.src.length && WS.has(c.src[c.i])) c.i += 1;
}

function fail(c: Cursor, message: string): never {
  throw new QueryError(message, c.i);
}

function readQuoted(c: Cursor): string {
  const quote = c.src[c.i];
  c.i += 1;
  let out = '';
  while (c.i < c.src.length) {
    const ch = c.src[c.i];
    if (ch === '\\') {
      const next = c.src[c.i + 1];
      if (next === undefined) fail(c, 'unfinished escape');
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      c.i += 2;
      continue;
    }
    if (ch === quote) {
      c.i += 1;
      return out;
    }
    out += ch;
    c.i += 1;
  }
  return fail(c, 'unclosed quote');
}

function readInteger(c: Cursor): number {
  const start = c.i;
  if (c.src[c.i] === '-' || c.src[c.i] === '+') c.i += 1;
  while (c.i < c.src.length && c.src[c.i] >= '0' && c.src[c.i] <= '9') c.i += 1;
  const text = c.src.slice(start, c.i);
  if (!/^[+-]?\d+$/.test(text)) fail(c, 'expected an integer');
  return Number.parseInt(text, 10);
}

function readNumber(c: Cursor): number {
  const match = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/.exec(c.src.slice(c.i));
  if (!match) fail(c, 'expected a number');
  c.i += match[0].length;
  return Number(match[0]);
}

/* ── Path parsing ─────────────────────────── */

function parseBracket(c: Cursor): Selector {
  skip(c);
  const ch = c.src[c.i];
  if (ch === undefined) fail(c, "unclosed '['");

  if (ch === '*') {
    c.i += 1;
    skip(c);
    if (c.src[c.i] !== ']') fail(c, "expected ']' after '*'");
    c.i += 1;
    return { kind: 'wild' };
  }

  if (ch === '?') {
    c.i += 1;
    skip(c);
    const parenthesised = c.src[c.i] === '(';
    if (parenthesised) c.i += 1;
    const test = parseExpr(c, 0);
    skip(c);
    if (parenthesised) {
      if (c.src[c.i] !== ')') fail(c, "expected ')' to close the filter");
      c.i += 1;
      skip(c);
    }
    if (c.src[c.i] !== ']') fail(c, "expected ']' to close the filter");
    c.i += 1;
    return { kind: 'filter', test };
  }

  if (ch === '"' || ch === "'") {
    const names = [readQuoted(c)];
    for (;;) {
      skip(c);
      if (c.src[c.i] === ',') {
        c.i += 1;
        skip(c);
        const next = c.src[c.i];
        if (next !== '"' && next !== "'") fail(c, 'expected a quoted name after the comma');
        names.push(readQuoted(c));
        continue;
      }
      if (c.src[c.i] === ']') {
        c.i += 1;
        return { kind: 'name', names };
      }
      return fail(c, "expected ',' or ']'");
    }
  }

  // Slice or index union. A ':' anywhere before the ']' means slice.
  const close = c.src.indexOf(']', c.i);
  if (close === -1) fail(c, "unclosed '['");
  const body = c.src.slice(c.i, close);
  if (body.includes(':')) {
    const parts = body.split(':');
    if (parts.length > 3) fail(c, 'a slice takes at most start:end:step');
    const read = (text: string, what: string): number | null => {
      const trimmed = text.trim();
      if (trimmed === '') return null;
      if (!/^[+-]?\d+$/.test(trimmed)) fail(c, `slice ${what} must be an integer`);
      return Number.parseInt(trimmed, 10);
    };
    const start = read(parts[0], 'start');
    const end = read(parts[1] ?? '', 'end');
    const stepValue = read(parts[2] ?? '', 'step');
    if (stepValue === 0) fail(c, 'slice step cannot be 0');
    c.i = close + 1;
    return { kind: 'slice', start, end, step: stepValue ?? 1 };
  }

  const indexes: number[] = [];
  for (;;) {
    skip(c);
    indexes.push(readInteger(c));
    skip(c);
    if (c.src[c.i] === ',') {
      c.i += 1;
      continue;
    }
    if (c.src[c.i] === ']') {
      c.i += 1;
      return { kind: 'index', indexes };
    }
    return fail(c, "expected ',' or ']'");
  }
}

function parseName(c: Cursor, inFilter: boolean): string {
  const start = c.i;
  while (c.i < c.src.length && isNameChar(c.src[c.i], inFilter)) c.i += 1;
  if (c.i === start) fail(c, 'expected a property name');
  return c.src.slice(start, c.i);
}

/** Segments after the `$` or `@`. Stops at the first character it cannot use. */
function parseSegments(c: Cursor, inFilter: boolean): Segment[] {
  const segments: Segment[] = [];
  for (;;) {
    if (c.src.startsWith('..', c.i)) {
      c.i += 2;
      const ch = c.src[c.i];
      if (ch === '[') {
        c.i += 1;
        segments.push({ descendant: true, selector: parseBracket(c) });
      } else if (ch === '*') {
        c.i += 1;
        segments.push({ descendant: true, selector: { kind: 'wild' } });
      } else {
        segments.push({ descendant: true, selector: { kind: 'name', names: [parseName(c, inFilter)] } });
      }
      continue;
    }
    if (c.src[c.i] === '.') {
      c.i += 1;
      if (c.src[c.i] === '*') {
        c.i += 1;
        segments.push({ descendant: false, selector: { kind: 'wild' } });
        continue;
      }
      segments.push({ descendant: false, selector: { kind: 'name', names: [parseName(c, inFilter)] } });
      continue;
    }
    if (c.src[c.i] === '[') {
      c.i += 1;
      segments.push({ descendant: false, selector: parseBracket(c) });
      continue;
    }
    return segments;
  }
}

/* ── Expression parsing ───────────────────── */

const BINDING: Record<string, number> = { '||': 1, '&&': 2 };
const COMPARISONS = ['==', '!=', '<=', '>=', '<', '>'] as const;

function parsePrimary(c: Cursor): Expr {
  skip(c);
  const ch = c.src[c.i];
  if (ch === undefined) fail(c, 'expected an expression');

  if (ch === '!') {
    c.i += 1;
    return { t: 'not', a: parsePrimary(c) };
  }
  if (ch === '(') {
    c.i += 1;
    const inner = parseExpr(c, 0);
    skip(c);
    if (c.src[c.i] !== ')') fail(c, "expected ')'");
    c.i += 1;
    return inner;
  }
  if (ch === '@' || ch === '$') {
    c.i += 1;
    return { t: 'path', fromRoot: ch === '$', segments: parseSegments(c, true) };
  }
  if (ch === '"' || ch === "'") return { t: 'lit', v: readQuoted(c) };
  if (c.src.startsWith('true', c.i)) {
    c.i += 4;
    return { t: 'lit', v: true };
  }
  if (c.src.startsWith('false', c.i)) {
    c.i += 5;
    return { t: 'lit', v: false };
  }
  if (c.src.startsWith('null', c.i)) {
    c.i += 4;
    return { t: 'lit', v: null };
  }
  if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
    return { t: 'lit', v: readNumber(c) };
  }
  return fail(c, 'expected @, $, a literal or (');
}

/** Comparison binds tighter than && and ||, and does not chain. */
function parseComparison(c: Cursor): Expr {
  const left = parsePrimary(c);
  skip(c);
  for (const op of COMPARISONS) {
    if (c.src.startsWith(op, c.i)) {
      // A single '=' is the mistake everyone makes; say so rather than
      // reporting "expected ]" three characters later.
      c.i += op.length;
      const right = parsePrimary(c);
      return { t: 'cmp', op, a: left, b: right };
    }
  }
  if (c.src[c.i] === '=') fail(c, "use '==' for comparison");
  return left;
}

function parseExpr(c: Cursor, minBinding: number): Expr {
  let left = parseComparison(c);
  for (;;) {
    skip(c);
    const op = c.src.slice(c.i, c.i + 2);
    const binding = BINDING[op];
    if (binding === undefined || binding < minBinding) return left;
    c.i += 2;
    const right = parseExpr(c, binding + 1);
    left = op === '&&' ? { t: 'and', a: left, b: right } : { t: 'or', a: left, b: right };
  }
}

/**
 * Parses a whole query. Throws `QueryError` with an offset on anything else.
 *
 * `items[0].name` with no leading `$` is what people type first, so it is read
 * as `$.items[0].name` rather than rejected on the first character.
 */
export function parseQuery(src: string): Query {
  const trimmed = src.trim();
  const rooted = trimmed.startsWith('$')
    ? trimmed
    : isNameChar(trimmed[0], false) || trimmed.startsWith('[')
      ? `$${trimmed.startsWith('[') ? '' : '.'}${trimmed}`
      : trimmed;
  const c: Cursor = { src: rooted, i: 0 };
  skip(c);
  if (c.src[c.i] !== '$') fail(c, "a query starts with '$'");
  c.i += 1;
  const segments = parseSegments(c, false);
  skip(c);
  if (c.i < c.src.length) fail(c, 'unexpected character');
  return segments;
}

/* ── Evaluation ───────────────────────────── */

export type Match = { path: string; value: unknown };

/** Sentinel for "the path matched nothing", distinct from a JSON null. */
const NOTHING = Symbol('nothing');

type Walk = { visits: number };

function bump(walk: Walk): void {
  walk.visits += 1;
  if (walk.visits > MAX_VISITS) throw new QueryTooBig(MAX_VISITS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** `$['a'][0]` — always bracketed, so any key shape round-trips unambiguously. */
export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  return `${base}['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

function normaliseIndex(index: number, length: number): number {
  return index < 0 ? length + index : index;
}

function sliceIndexes(length: number, sel: Extract<Selector, { kind: 'slice' }>): number[] {
  const step = sel.step;
  const clamp = (n: number) => Math.min(Math.max(n, 0), length);
  const out: number[] = [];
  if (step > 0) {
    const from = clamp(sel.start === null ? 0 : normaliseIndex(sel.start, length));
    const to = clamp(sel.end === null ? length : normaliseIndex(sel.end, length));
    for (let i = from; i < to; i += step) out.push(i);
  } else {
    const from = Math.min(sel.start === null ? length - 1 : normaliseIndex(sel.start, length), length - 1);
    const to = sel.end === null ? -1 : normaliseIndex(sel.end, length);
    for (let i = from; i > to && i >= 0; i += step) out.push(i);
  }
  return out;
}

/** Direct children as matches, with their paths already joined. */
function children(input: Match): Match[] {
  const node = input.value;
  if (Array.isArray(node)) {
    return node.map((value, index) => ({ path: joinPath(input.path, index), value }));
  }
  if (isRecord(node)) {
    return Object.entries(node).map(([key, value]) => ({ path: joinPath(input.path, key), value }));
  }
  return [];
}

/** Pre-order self-and-descendants, used by `..`. */
function descendants(match: Match, walk: Walk): Match[] {
  const out: Match[] = [match];
  const stack: Match[] = [match];
  while (stack.length > 0) {
    const current = stack.pop()!;
    bump(walk);
    if (Array.isArray(current.value)) {
      for (let i = current.value.length - 1; i >= 0; i -= 1) {
        const child = { path: joinPath(current.path, i), value: current.value[i] };
        out.push(child);
        stack.push(child);
      }
    } else if (isRecord(current.value)) {
      const entries = Object.entries(current.value);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const child = { path: joinPath(current.path, entries[i][0]), value: entries[i][1] };
        out.push(child);
        stack.push(child);
      }
    }
  }
  return out;
}

function applySelector(input: Match, selector: Selector, root: unknown, walk: Walk): Match[] {
  bump(walk);
  const node = input.value;

  switch (selector.kind) {
    case 'name': {
      const out: Match[] = [];
      for (const name of selector.names) {
        if (isRecord(node)) {
          if (Object.hasOwn(node, name)) out.push({ path: joinPath(input.path, name), value: node[name] });
        } else if (name === 'length' && (Array.isArray(node) || typeof node === 'string')) {
          // `length` is not a JSON member, but every query language grows it
          // because filters need it. Only synthesised where it is unambiguous.
          out.push({ path: joinPath(input.path, name), value: node.length });
        }
      }
      return out;
    }
    case 'index': {
      if (!Array.isArray(node)) return [];
      const out: Match[] = [];
      for (const raw of selector.indexes) {
        const index = normaliseIndex(raw, node.length);
        if (index >= 0 && index < node.length) {
          out.push({ path: joinPath(input.path, index), value: node[index] });
        }
      }
      return out;
    }
    case 'slice': {
      if (!Array.isArray(node)) return [];
      return sliceIndexes(node.length, selector).map((index) => ({
        path: joinPath(input.path, index),
        value: node[index],
      }));
    }
    case 'wild':
      return children(input);
    case 'filter': {
      const out: Match[] = [];
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i += 1) {
          bump(walk);
          if (truthy(selector.test, node[i], root, walk)) {
            out.push({ path: joinPath(input.path, i), value: node[i] });
          }
        }
      } else if (isRecord(node)) {
        for (const [key, value] of Object.entries(node)) {
          bump(walk);
          if (truthy(selector.test, value, root, walk)) {
            out.push({ path: joinPath(input.path, key), value });
          }
        }
      }
      return out;
    }
  }
}

function evaluatePath(expr: Extract<Expr, { t: 'path' }>, current: unknown, root: unknown, walk: Walk): Match[] {
  let matches: Match[] = [{ path: expr.fromRoot ? '$' : '@', value: expr.fromRoot ? root : current }];
  for (const segment of expr.segments) {
    const next: Match[] = [];
    for (const match of matches) {
      const sources = segment.descendant ? descendants(match, walk) : [match];
      for (const source of sources) next.push(...applySelector(source, segment.selector, root, walk));
    }
    matches = next;
    if (matches.length === 0) return matches;
  }
  return matches;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

/** One value per operand: the first match, or NOTHING when the path is absent. */
function operand(expr: Expr, current: unknown, root: unknown, walk: Walk): unknown {
  if (expr.t === 'lit') return expr.v;
  if (expr.t === 'path') {
    const matches = evaluatePath(expr, current, root, walk);
    return matches.length === 0 ? NOTHING : matches[0].value;
  }
  return truthy(expr, current, root, walk);
}

function compare(op: string, a: unknown, b: unknown): boolean {
  if (op === '==') return a === NOTHING || b === NOTHING ? a === b : deepEqual(a, b);
  if (op === '!=') return !compare('==', a, b);
  // Ordering only between two numbers or two strings. Comparing a string to a
  // number in JavaScript silently coerces; here it is simply false, which is
  // what RFC 9535 settled on and the only answer that cannot mislead.
  const comparable =
    (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
  if (!comparable) return false;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  return a >= b;
}

function truthy(expr: Expr, current: unknown, root: unknown, walk: Walk): boolean {
  switch (expr.t) {
    case 'lit':
      return Boolean(expr.v);
    case 'path':
      return evaluatePath(expr, current, root, walk).length > 0;
    case 'not':
      return !truthy(expr.a, current, root, walk);
    case 'and':
      return truthy(expr.a, current, root, walk) && truthy(expr.b, current, root, walk);
    case 'or':
      return truthy(expr.a, current, root, walk) || truthy(expr.b, current, root, walk);
    case 'cmp':
      return compare(expr.op, operand(expr.a, current, root, walk), operand(expr.b, current, root, walk));
  }
}

/** Runs a parsed query. Throws `QueryTooBig` rather than grinding. */
export function runQuery(root: unknown, q: Query): Match[] {
  const walk: Walk = { visits: 0 };
  let matches: Match[] = [{ path: '$', value: root }];
  for (const segment of q) {
    const next: Match[] = [];
    for (const match of matches) {
      const sources = segment.descendant ? descendants(match, walk) : [match];
      for (const source of sources) {
        next.push(...applySelector(source, segment.selector, root, walk));
        if (next.length > MAX_MATCHES) throw new QueryTooBig(MAX_MATCHES);
      }
    }
    matches = next;
  }
  return matches;
}

export type Outcome =
  | { ok: true; matches: Match[] }
  | { ok: false; message: string; at?: number };

/** Parse and run in one call, with every failure turned into a message. */
export function evaluate(json: string, path: string): Outcome {
  let root: unknown;
  try {
    root = JSON.parse(json) as unknown;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  let q: Query;
  try {
    q = parseQuery(path);
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, message: error.message, at: error.at };
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { ok: true, matches: runQuery(root, q) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export type Shape = 'values' | 'paths' | 'entries';

/** Renders matches for the output pane. */
export function formatMatches(matches: readonly Match[], shape: Shape, indent: number): string {
  if (shape === 'paths') return matches.map((match) => match.path).join('\n');
  if (shape === 'entries') {
    return matches
      .map((match) => `${match.path}\t${JSON.stringify(match.value) ?? 'undefined'}`)
      .join('\n');
  }
  const values = matches.map((match) => match.value);
  return JSON.stringify(values, null, indent === 0 ? undefined : indent) ?? '';
}
