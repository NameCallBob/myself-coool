/**
 * JSON formatting, with error positions the browser does not give you.
 *
 * `JSON.parse` throws a message whose wording differs per engine and whose
 * position, when it has one, is a character offset. An offset is useless when
 * you are staring at 400 lines, so the offset is converted to line and column
 * here and the offending line is quoted back.
 */

export type Stats = {
  bytes: number;
  keys: number;
  depth: number;
  objects: number;
  arrays: number;
  nulls: number;
};

export type ParseFailure = {
  message: string;
  /** 1-based, for display. Absent when the engine gave no position. */
  line?: number;
  column?: number;
  /** The offending line, for quoting under the error. */
  excerpt?: string;
};

/**
 * A key written twice in the same object. Not a syntax error — `JSON.parse`
 * accepts it and keeps the last one — so it is reported alongside a successful
 * parse rather than instead of one. Silence here means a field disappears.
 */
export type Duplicate = {
  /** The decoded key, as `JSON.parse` sees it. */
  key: string;
  /** Where the object is: `$`, `$.order`, `$.rows[2]`. */
  path: string;
  /** 1-based position of the second occurrence. */
  line: number;
  column: number;
};

export type Outcome =
  | { ok: true; value: unknown; stats: Stats; duplicates: Duplicate[] }
  | { ok: false; error: ParseFailure };

/** Character offset → 1-based line and column, plus that line's text. */
export function locate(text: string, offset: number): { line: number; column: number; excerpt: string } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const line = (before.match(/\n/g) ?? []).length + 1;
  const lastBreak = before.lastIndexOf('\n');
  const column = clamped - lastBreak;
  const lineStart = lastBreak + 1;
  const lineEnd = text.indexOf('\n', lineStart);
  const excerpt = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return { line, column, excerpt };
}

/**
 * Finds the first syntax error and where it is.
 *
 * `JSON.parse` stays the parser — it is faster and it is the definition of
 * correct. But its error message is not something to build on: V8 alone has
 * two shapes, only one of which carries a position ("Expected property name
 * ... at position 1" versus "Unexpected token ',', \"...\" is not valid JSON"),
 * and Safari and Firefox word theirs differently again. Since this tool's whole
 * claim is that it tells you *where*, the diagnosis is done here, on the slow
 * path, only after the native parse has already failed.
 */
const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

type ScanError = {
  offset: number;
  expected: string;
  /**
   * Set when the scanner stopped because the document is nested deeper than it
   * follows. That is a limit of the diagnosis, not a fault in the document, so
   * the offset must not be reported as the error's position.
   */
  depth?: true;
};

/** Collector for the duplicate-key pass. Absent on the error-finding pass. */
type DupScan = { found: Duplicate[] };

function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length && WHITESPACE.has(text[i])) i += 1;
  return i;
}

function scanString(text: string, start: number): number | ScanError {
  let i = start + 1; // past the opening quote
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') return i + 1;
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) return { offset: i, expected: 'an escape sequence' };
      if (next === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
          return { offset: i + 2, expected: 'four hex digits after \\u' };
        }
        i += 6;
        continue;
      }
      if (!'"\\/bfnrt'.includes(next)) {
        return { offset: i + 1, expected: 'a valid escape character' };
      }
      i += 2;
      continue;
    }
    // Raw control characters are not allowed inside a JSON string, and they
    // are the usual reason a log line pasted straight in will not parse.
    if (ch < ' ') return { offset: i, expected: 'the control character to be escaped' };
    i += 1;
  }
  return { offset: text.length, expected: 'a closing quote' };
}

function scanNumber(text: string, start: number): number | ScanError {
  const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(start));
  if (!match || match[0] === '' || match[0] === '-') {
    return { offset: start, expected: 'a number' };
  }
  return start + match[0].length;
}

export const MAX_DEPTH = 512;

/** The raw text of a JSON string, decoded the way `JSON.parse` would decode it. */
function decodeKey(raw: string): string {
  if (!raw.includes('\\')) return raw.slice(1, -1);
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

function scanValue(
  text: string,
  start: number,
  level: number,
  dup: DupScan | null = null,
  path = '$'
): number | ScanError {
  if (level > MAX_DEPTH) {
    return { offset: start, expected: `nesting under ${MAX_DEPTH} levels`, depth: true };
  }
  const i = skipWhitespace(text, start);
  const ch = text[i];
  if (ch === undefined) return { offset: i, expected: 'a value' };

  if (ch === '"') return scanString(text, i);
  if (ch === '-' || (ch >= '0' && ch <= '9')) return scanNumber(text, i);
  for (const word of ['true', 'false', 'null']) {
    if (text.startsWith(word, i)) return i + word.length;
  }

  if (ch === '[') {
    let cursor = skipWhitespace(text, i + 1);
    if (text[cursor] === ']') return cursor + 1;
    let index = 0;
    for (;;) {
      const next = scanValue(text, cursor, level + 1, dup, dup ? `${path}[${index}]` : path);
      index += 1;
      if (typeof next !== 'number') return next;
      cursor = skipWhitespace(text, next);
      if (text[cursor] === ',') {
        cursor = skipWhitespace(text, cursor + 1);
        if (text[cursor] === ']') return { offset: cursor, expected: 'a value, not a trailing comma' };
        continue;
      }
      if (text[cursor] === ']') return cursor + 1;
      return { offset: cursor, expected: "',' or ']'" };
    }
  }

  if (ch === '{') {
    let cursor = skipWhitespace(text, i + 1);
    if (text[cursor] === '}') return cursor + 1;
    // One Set per object: the scanner already reads every key name here, so
    // catching a repeat costs a hash lookup and turns a silently lost field
    // into a message.
    const seen = dup ? new Set<string>() : null;
    for (;;) {
      if (text[cursor] !== '"') return { offset: cursor, expected: 'a quoted property name' };
      const afterKey = scanString(text, cursor);
      if (typeof afterKey !== 'number') return afterKey;
      let key = '';
      if (dup && seen) {
        key = decodeKey(text.slice(cursor, afterKey));
        if (seen.has(key)) {
          const at = locate(text, cursor);
          dup.found.push({ key, path, line: at.line, column: at.column });
        } else {
          seen.add(key);
        }
      }
      cursor = skipWhitespace(text, afterKey);
      if (text[cursor] !== ':') return { offset: cursor, expected: "':'" };
      const afterValue = scanValue(text, cursor + 1, level + 1, dup, dup ? `${path}.${key}` : path);
      if (typeof afterValue !== 'number') return afterValue;
      cursor = skipWhitespace(text, afterValue);
      if (text[cursor] === ',') {
        cursor = skipWhitespace(text, cursor + 1);
        if (text[cursor] === '}') return { offset: cursor, expected: 'a property, not a trailing comma' };
        continue;
      }
      if (text[cursor] === '}') return cursor + 1;
      return { offset: cursor, expected: "',' or '}'" };
    }
  }

  return { offset: i, expected: 'a value' };
}

/** First syntax error in `text`, or null when the document scans clean. */
export function findError(text: string): ScanError | null {
  const end = scanValue(text, 0, 1);
  if (typeof end !== 'number') return end;
  const rest = skipWhitespace(text, end);
  if (rest < text.length) return { offset: rest, expected: 'end of document' };
  return null;
}

function measure(value: unknown): Omit<Stats, 'bytes'> {
  let keys = 0;
  let depth = 0;
  let objects = 0;
  let arrays = 0;
  let nulls = 0;

  /** `level` counts containers only — a scalar leaf does not deepen a document. */
  const walk = (node: unknown, level: number) => {
    if (node === null) {
      nulls += 1;
      return;
    }
    if (Array.isArray(node)) {
      arrays += 1;
      if (level > depth) depth = level;
      for (const item of node) walk(item, level + 1);
      return;
    }
    if (typeof node === 'object') {
      objects += 1;
      if (level > depth) depth = level;
      keys += Object.keys(node as Record<string, unknown>).length;
      for (const item of Object.values(node as Record<string, unknown>)) walk(item, level + 1);
    }
  };

  walk(value, 1);
  return { keys, depth, objects, arrays, nulls };
}

/**
 * Every object's repeated keys, in document order.
 *
 * Run on a document the native parser accepted, so the scan cannot fail; a
 * document that does not scan cleanly returns whatever was found before the
 * fault, which is why this is only called on the success path.
 */
export function findDuplicateKeys(text: string): Duplicate[] {
  const dup: DupScan = { found: [] };
  scanValue(text, 0, 1, dup, '$');
  return dup.found;
}

export function parseJson(text: string): Outcome {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: { message: 'empty input' } };
  }
  try {
    // `JSON.parse` ignores surrounding whitespace by itself, and the scan below
    // has to run on the text as pasted: diagnosing a trimmed copy would report
    // line numbers short by however many blank lines the paste started with,
    // and a line number that is wrong is worse than none.
    const value = JSON.parse(text) as unknown;
    return {
      ok: true,
      value,
      // The document's own size, not the whitespace around it.
      stats: { bytes: new TextEncoder().encode(trimmed).length, ...measure(value) },
      duplicates: findDuplicateKeys(text),
    };
  } catch (error) {
    const engine = error instanceof Error ? error.message : String(error);
    const found = findError(text);
    if (!found) {
      // The native parser rejected something the scanner accepts. Report the
      // engine's own words rather than claiming the document is fine.
      return { ok: false, error: { message: engine } };
    }
    if (found.depth) {
      // The scanner ran out of levels before reaching the real fault, so its
      // offset points at the nesting rather than at the error. Naming a
      // position here would point at the wrong place.
      return {
        ok: false,
        error: {
          message: `${engine} — the diagnosis stops at ${MAX_DEPTH} levels of nesting, so it cannot point at a line here`,
        },
      };
    }
    const { line, column, excerpt } = locate(text, found.offset);
    return {
      ok: false,
      error: { message: `expected ${found.expected}`, line, column, excerpt },
    };
  }
}

/**
 * Recursively orders object keys. Arrays keep their order — reordering them
 * would change what the document means, which a formatter must never do.
 *
 * Keys compare by UTF-16 code unit, which is what `Array.prototype.sort` does
 * with no comparator and therefore what C02 (data-convert) and `jq -S` produce.
 * `localeCompare` was the earlier rule and had to go: it depends on the ICU
 * data in the browser, so the same document could sort differently in two
 * browsers and in the sibling tool, and sorted output exists to be diffed.
 */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortDeep(item)])
    );
  }
  return value;
}

export type Indent = '2' | '4' | 'tab' | 'min';

export function render(value: unknown, indent: Indent): string {
  if (indent === 'min') return JSON.stringify(value);
  const space = indent === 'tab' ? '\t' : Number(indent);
  return JSON.stringify(value, null, space) ?? '';
}

/** JSON Lines: one value per line, for piping into jq or a log shipper. */
export function toLines(value: unknown): string {
  if (!Array.isArray(value)) return JSON.stringify(value) ?? '';
  return value.map((item) => JSON.stringify(item)).join('\n');
}
