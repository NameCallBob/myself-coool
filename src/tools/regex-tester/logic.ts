/**
 * Regex matching that cannot take the tab with it.
 *
 * A pattern like `(a+)+$` against `aaaaaaaaaaaaaaaaaaaaaaaaaaaaX` makes the
 * backtracking engine try every way of splitting the a-run between the inner
 * and the outer repetition. That is exponential in the length of the input, and
 * on the main thread it is indistinguishable from the browser hanging: no
 * paint, no input, no way out but closing the tab. JavaScript has no regex
 * timeout, so the only real fix is to run the match somewhere terminable.
 *
 * Hence the split in this file. `collectMatches` and `replaceWith` are written
 * to be completely self-contained — they reference nothing at module scope — so
 * their own source can be serialised into a Worker body (`WORKER_BODY`) and
 * still be the exact code the unit tests exercise here. One implementation,
 * two execution contexts, no second copy to drift.
 */

export type NamedCapture = { name: string; value: string | null };

export type MatchHit = {
  /** Offset in UTF-16 code units, as the engine reports it. */
  index: number;
  length: number;
  text: string;
  /** Numbered groups, 1-based in order; `null` where the group did not take part. */
  groups: (string | null)[];
  named: NamedCapture[];
};

export type MatchOutcome = {
  hits: MatchHit[];
  /** True when the match limit stopped the scan before the input ran out. */
  truncated: boolean;
  groupCount: number;
  names: string[];
};

/** Enough to read; past this the list is unreadable and the DOM is the cost. */
export const MATCH_LIMIT = 1000;

/** Flags this tool offers, in the order the spec lists them. */
export const FLAG_KEYS = ['g', 'i', 'm', 's', 'u', 'v', 'y', 'd'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/**
 * All matches of `pattern` in `input`, up to `limit`.
 *
 * Self-contained on purpose: every helper it needs is declared inside it, so
 * `collectMatches.toString()` is a complete program fragment. Do not reach for
 * anything at module scope from in here.
 */
export function collectMatches(
  pattern: string,
  flags: string,
  input: string,
  limit: number
): MatchOutcome {
  // Group count without parsing the pattern: `X|` can never fail, so exec
  // always returns an array of 1 + (group count) entries even when X itself
  // would not have matched. The g/y flags are dropped so lastIndex plays no part.
  let groupCount = 0;
  const probe = new RegExp(`${pattern}|`, flags.replace(/[gy]/g, ''));
  const probed = probe.exec('');
  if (probed) groupCount = probed.length - 1;

  const names: string[] = [];
  const nameScan = /\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/g;
  for (;;) {
    const found = nameScan.exec(pattern);
    if (found === null) break;
    names.push(found[1]);
  }

  // Scanning the whole input needs lastIndex to advance, which only the g and y
  // flags provide. Without either, the caller asked for the first match only,
  // so g is added for the walk and the loop stops after one hit.
  const repeating = flags.includes('g') || flags.includes('y');
  const re = new RegExp(pattern, repeating ? flags : `${flags}g`);
  const wide = flags.includes('u') || flags.includes('v');

  const hits: MatchHit[] = [];
  let truncated = false;

  for (;;) {
    const found = re.exec(input);
    if (found === null) break;
    if (hits.length >= limit) {
      truncated = true;
      break;
    }

    const groups: (string | null)[] = [];
    for (let i = 1; i < found.length; i += 1) {
      groups.push(found[i] === undefined ? null : found[i]);
    }
    const named: NamedCapture[] = [];
    const bag = found.groups;
    if (bag) {
      const keys = Object.keys(bag);
      for (let i = 0; i < keys.length; i += 1) {
        const value = bag[keys[i]];
        named.push({ name: keys[i], value: value === undefined ? null : value });
      }
    }
    hits.push({ index: found.index, length: found[0].length, text: found[0], groups, named });

    if (!repeating) break;
    if (found[0].length === 0) {
      // A zero-length match leaves lastIndex where it was, so the loop would
      // never end. Step over one whole code point — one code unit would land
      // inside a surrogate pair, which a unicode-aware pattern cannot match at.
      const code = input.codePointAt(re.lastIndex);
      re.lastIndex += wide && code !== undefined && code > 0xffff ? 2 : 1;
      if (re.lastIndex > input.length) break;
    }
  }

  return { hits, truncated, groupCount, names };
}

/**
 * `String.prototype.replace` with the flags exactly as given, so a pattern
 * without `g` replaces once — the same rule the caller's own code would follow.
 * `$1`, `$&`, `` $` ``, `$'`, `$$` and `$<name>` are the platform's, not ours.
 *
 * Self-contained, for the same reason as `collectMatches`.
 */
export function replaceWith(
  pattern: string,
  flags: string,
  input: string,
  template: string
): string {
  return input.replace(new RegExp(pattern, flags), template);
}

/**
 * Worker source. The pattern and the subject cross as structured-cloned data;
 * nothing the user typed is ever part of this program text.
 */
export const WORKER_BODY = `
const collect = (${collectMatches.toString()});
const substitute = (${replaceWith.toString()});
self.onmessage = function (event) {
  const job = event.data || {};
  try {
    const value = {
      outcome: collect(job.pattern, job.flags, job.input, job.limit),
      replaced: typeof job.template === 'string'
        ? substitute(job.pattern, job.flags, job.input, job.template)
        : null,
    };
    self.postMessage({ value: value });
  } catch (error) {
    self.postMessage({ error: error && error.message ? error.message : String(error) });
  }
};
`;

export type WorkerJob = {
  pattern: string;
  flags: string;
  input: string;
  limit: number;
  template: string | null;
};

export type WorkerValue = { outcome: MatchOutcome; replaced: string | null };

/**
 * The engine's own verdict on whether the pattern compiles, plus its message.
 * Returns null when it compiles. Cheap: compiling is not matching, so this is
 * safe on the main thread — it is the *running* that can go exponential.
 */
export function checkPattern(pattern: string, flags: string): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export type RiskCode = 'nested-quantifier' | 'quantified-alternation';

/**
 * Shapes that make backtracking exponential rather than merely slow.
 *
 * Both come down to the same thing: a repetition whose body can match the same
 * text in more than one way. `(a+)+` can split a run of a's between the inner
 * and outer loops in 2^n ways; `(a|a)*` picks one of two identical branches at
 * every step. On a subject that ultimately fails, the engine tries all of them.
 *
 * This is a scanner, not a parser, so it is deliberately a warning and never a
 * refusal — the timeout is what actually protects the page.
 */
export function riskNotes(pattern: string): RiskCode[] {
  const found = new Set<RiskCode>();
  const stack: { quant: boolean; alt: boolean }[] = [];
  let inClass = false;

  /** `{` only opens a quantifier when a digit follows; otherwise it is literal. */
  const repeats = (at: number): boolean => {
    const ch = pattern[at];
    if (ch === '*' || ch === '+') return true;
    if (ch !== '{') return false;
    const next = pattern[at + 1];
    return next !== undefined && next >= '0' && next <= '9';
  };

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch === '(') {
      stack.push({ quant: false, alt: false });
      continue;
    }
    if (ch === ')') {
      const group = stack.pop();
      if (repeats(i + 1)) {
        if (group?.quant) found.add('nested-quantifier');
        if (group?.alt) found.add('quantified-alternation');
        // The repeated group is itself a repetition inside whatever encloses it.
        if (stack.length > 0) stack[stack.length - 1].quant = true;
      }
      continue;
    }
    if (ch === '|') {
      if (stack.length > 0) stack[stack.length - 1].alt = true;
      continue;
    }
    if (repeats(i) && stack.length > 0) stack[stack.length - 1].quant = true;
  }

  return Array.from(found);
}

export type Segment = { text: string; hit: number | null };

/**
 * The subject cut into alternating plain and matched runs, for rendering.
 *
 * Returned as data rather than markup: the subject is someone else's text and
 * the highlighter must never be the thing that interprets it. Zero-length
 * matches produce no segment — there is nothing to paint — so the caller reads
 * their positions from the hit list instead.
 */
export function toSegments(input: string, hits: readonly MatchHit[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (hit.length === 0) continue;
    // Overlaps cannot happen from one scan, but a stale hit list can arrive
    // mid-render; clamping keeps the output a faithful cut of the input.
    if (hit.index < cursor) continue;
    if (hit.index > cursor) out.push({ text: input.slice(cursor, hit.index), hit: null });
    out.push({ text: input.slice(hit.index, hit.index + hit.length), hit: i });
    cursor = hit.index + hit.length;
  }
  if (cursor < input.length) out.push({ text: input.slice(cursor), hit: null });
  return out;
}

/** 1-based line and column of a code-unit offset, for the match table. */
export function lineColumn(input: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, input.length));
  const before = input.slice(0, clamped);
  const line = (before.match(/\n/g) ?? []).length + 1;
  return { line, column: clamped - before.lastIndexOf('\n') };
}
