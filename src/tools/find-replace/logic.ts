/**
 * Find and replace, with the two failure modes that matter handled.
 *
 * The first is catastrophic backtracking. `(a+)+$` against forty non-matching
 * characters takes longer than the universe has left, and on the main thread of
 * a browser that is indistinguishable from the tab having crashed — there is no
 * way to interrupt a running regex. So the regex path runs inside a Worker with
 * a deadline (see `@/lib/tools/isolate`), and `WORKER_BODY` below is the script
 * it runs. A Worker cannot import a module, so that script restates the loop in
 * plain JavaScript; the version in this file is the one the tests pin, and the
 * two are kept side by side deliberately so a change to one is obviously a
 * change the other needs too.
 *
 * The second is the empty match. `a*` matches the empty string at every
 * position, so an `exec` loop that does not advance `lastIndex` itself never
 * terminates. Advancing by a whole code point rather than one UTF-16 unit keeps
 * that from landing between the halves of a surrogate pair.
 */

/** Longer than this and the tab stops being responsive; refuse instead. */
export const MAX_INPUT = 500_000;

/** Safety net on the match loop, not a limit anyone should hit in practice. */
export const MAX_MATCHES = 200_000;

/** Highlights rendered in the preview. Counting is unlimited; drawing is not. */
export const MAX_PREVIEW = 400;

/** How long the Worker gets before it is terminated. */
export const TIMEOUT_MS = 2000;

export type Mode = 'literal' | 'regex';

export type Flags = {
  ignoreCase: boolean;
  /** `^` and `$` match at every line, not just at the ends of the input. */
  multiline: boolean;
  /** `.` also matches a newline. */
  dotAll: boolean;
  /** Unicode mode. Off by default: it makes some older patterns invalid. */
  unicode: boolean;
  /** Replace every match, not just the first. */
  global: boolean;
  /** Wrap the pattern in word boundaries. */
  wholeWord: boolean;
};

export const DEFAULT_FLAGS: Flags = {
  ignoreCase: false,
  multiline: true,
  dotAll: false,
  unicode: false,
  global: true,
  wholeWord: false,
};

export class BadPattern extends Error {
  /** Declared then assigned: parameter properties are not supported by the
   *  type-stripping test runner. */
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = 'BadPattern';
    this.detail = detail;
  }
}

export class InputTooLarge extends Error {
  readonly length: number;

  constructor(length: number) {
    super(`input is ${length} characters, over the ${MAX_INPUT} limit`);
    this.name = 'InputTooLarge';
    this.length = length;
  }
}

/** Every character that means something to a regex engine, made literal. */
export function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `\n`, `\t`, `\r`, `\0`, `\xNN` and `\uNNNN` turned into the characters they
 * name, so a newline can be typed into a single-line field. `\\` stays a single
 * backslash. Anything else keeps its backslash rather than being swallowed.
 */
export function expandEscapes(text: string): string {
  return text.replace(/\\(u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (whole, body: string) => {
    if (body === 'n') return '\n';
    if (body === 't') return '\t';
    if (body === 'r') return '\r';
    if (body === '0') return '\0';
    if (body === '\\') return '\\';
    if (body.startsWith('u{')) return String.fromCodePoint(Number.parseInt(body.slice(2, -1), 16));
    if (body.startsWith('u')) return String.fromCharCode(Number.parseInt(body.slice(1), 16));
    if (body.startsWith('x')) return String.fromCharCode(Number.parseInt(body.slice(1), 16));
    return whole;
  });
}

export function flagString(flags: Flags): string {
  return (
    (flags.global ? 'g' : '') +
    (flags.ignoreCase ? 'i' : '') +
    (flags.multiline ? 'm' : '') +
    (flags.dotAll ? 's' : '') +
    (flags.unicode ? 'u' : '')
  );
}

/**
 * The pattern actually handed to the engine.
 *
 * Whole-word wrapping uses `\b`, which is defined in terms of `[A-Za-z0-9_]`
 * and therefore does nothing useful around Chinese — every position next to an
 * ideograph is a word boundary. The UI says so where the checkbox is.
 */
export function buildPattern(find: string, mode: Mode, flags: Flags): { source: string; flags: string } {
  const body = mode === 'literal' ? escapeLiteral(find) : find;
  const source = flags.wholeWord ? `\\b(?:${body})\\b` : body;
  return { source, flags: flagString(flags) };
}

export function compile(find: string, mode: Mode, flags: Flags): RegExp {
  const built = buildPattern(find, mode, flags);
  try {
    return new RegExp(built.source, built.flags);
  } catch (error) {
    throw new BadPattern(error instanceof Error ? error.message : String(error));
  }
}

export type Span = { at: number; length: number };

export type Found = {
  count: number;
  /** Positions of the first `preview` matches, for highlighting. */
  spans: Span[];
  /** True when the match loop hit MAX_MATCHES and stopped counting. */
  truncated: boolean;
  /** First match's capture groups, for showing what `$1` will be. */
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
};

/**
 * Counts matches and records the first few positions.
 *
 * The regex is cloned with `g` when it lacks it, so counting never depends on —
 * or disturbs — the caller's `lastIndex`.
 */
export function findMatches(text: string, re: RegExp, preview = MAX_PREVIEW, limit = MAX_MATCHES): Found {
  const probe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  probe.lastIndex = 0;

  const spans: Span[] = [];
  let count = 0;
  let truncated = false;
  let groups: (string | undefined)[] = [];
  let named: Record<string, string | undefined> = {};

  for (;;) {
    const found = probe.exec(text);
    if (found === null) break;
    if (count === 0) {
      groups = found.slice(1);
      named = { ...(found.groups ?? {}) };
    }
    count += 1;
    if (spans.length < preview) spans.push({ at: found.index, length: found[0].length });
    if (found[0] === '') {
      // Zero-length match: step forward a whole code point or loop forever.
      const point = text.codePointAt(probe.lastIndex);
      probe.lastIndex += point !== undefined && point > 0xffff ? 2 : 1;
    }
    if (!re.global) break;
    if (count >= limit) {
      truncated = true;
      break;
    }
  }

  return { count, spans, truncated, groups, named };
}

export type Outcome = Found & { text: string };

/**
 * The replacement itself is `String.replace`, so `$1`, `$&`, `$<name>` and `$$`
 * mean exactly what they mean everywhere else in JavaScript. Reimplementing
 * that expansion would only be a chance to get it subtly wrong.
 */
export function run(text: string, re: RegExp, replacement: string, preview = MAX_PREVIEW): Outcome {
  if (text.length > MAX_INPUT) throw new InputTooLarge(text.length);
  const found = findMatches(text, re, preview);
  return { ...found, text: text.replace(re, replacement) };
}

export type Segment = { text: string; hit: boolean };

/**
 * The input cut into alternating plain and matched pieces, for highlighting.
 * Only the spans handed in are marked, so a file with 90,000 matches renders the
 * first few hundred and stays a page rather than becoming 90,000 elements.
 */
export function segments(text: string, spans: readonly Span[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.at < cursor) continue; // overlapping spans cannot both be drawn
    if (span.at > cursor) out.push({ text: text.slice(cursor, span.at), hit: false });
    if (span.length > 0) out.push({ text: text.slice(span.at, span.at + span.length), hit: true });
    cursor = span.at + span.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/**
 * The Worker script. Mirrors `findMatches` + `run` in plain ES5-ish JavaScript.
 *
 * It is a static string: the pattern and the text cross as structured-cloned
 * data, never as code. Nothing the reader types is ever evaluated as a program —
 * `new RegExp` compiles a pattern, which is the whole point of the exercise.
 */
export const WORKER_BODY = `
onmessage = function (event) {
  var data = event.data;
  try {
    var re = new RegExp(data.source, data.flags);
    var probe = new RegExp(data.source, data.flags.indexOf('g') === -1 ? data.flags + 'g' : data.flags);
    probe.lastIndex = 0;
    var spans = [];
    var count = 0;
    var truncated = false;
    var groups = [];
    var named = {};
    for (;;) {
      var found = probe.exec(data.text);
      if (found === null) break;
      if (count === 0) {
        groups = found.slice(1);
        named = found.groups ? Object.assign({}, found.groups) : {};
      }
      count += 1;
      if (spans.length < data.preview) spans.push({ at: found.index, length: found[0].length });
      if (found[0] === '') {
        var point = data.text.codePointAt(probe.lastIndex);
        probe.lastIndex += point !== undefined && point > 0xffff ? 2 : 1;
      }
      if (!re.global) break;
      if (count >= data.limit) { truncated = true; break; }
    }
    postMessage({
      value: {
        text: data.text.replace(re, data.replacement),
        count: count,
        spans: spans,
        truncated: truncated,
        groups: groups,
        named: named,
      },
    });
  } catch (error) {
    postMessage({ error: String((error && error.message) || error) });
  }
};
`;
