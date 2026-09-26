/**
 * Turns a piece of text into a string literal for a specific language.
 *
 * Nine targets rather than one "escape" button, because the rules genuinely
 * differ and three of the differences bite:
 *
 * Java processes `\uXXXX` in the *lexer*, before it knows what a string is. So
 * `"\u000A"` is a literal newline inside the source line and the file will not
 * compile — Java is the one language where `\n` is mandatory rather than a
 * nicety, and where a naive "escape everything as \u" produces broken source.
 *
 * C's `\x` escape has no length limit: `"\x41" "1"` is fine but `"\x411"` is
 * one escape for U+0411. So C output here uses `\uXXXX` universal character
 * names and three-digit octal, both of which are self-terminating.
 *
 * And a shell single-quoted string cannot contain an escaped quote at all —
 * there are no escapes inside `'…'`. The only way out is to close the quote,
 * emit a backslash-quote, and reopen: `'\''`. Every shell-quoting bug is a
 * version of not knowing that.
 */

export type Target =
  | 'json'
  | 'js'
  | 'java'
  | 'c'
  | 'python'
  | 'shell-single'
  | 'shell-double'
  | 'sql'
  | 'sql-mysql';

export type Quote = 'double' | 'single';

export type EscapeOptions = {
  /** Which quote the literal is wrapped in. Ignored where only one is legal. */
  quote?: Quote;
  /** Escape every non-ASCII character, for files of uncertain encoding. */
  asciiOnly?: boolean;
  /** Include the surrounding quotes. */
  wrap?: boolean;
};

export type TargetInfo = {
  label: string;
  /** Quotes the target accepts; the first is the default. */
  quotes: Quote[];
  /** Whether an ASCII-only mode makes sense for this target. */
  ascii: boolean;
};

export const TARGETS: Record<Target, TargetInfo> = {
  json: { label: 'JSON', quotes: ['double'], ascii: true },
  js: { label: 'JavaScript / TypeScript', quotes: ['single', 'double'], ascii: true },
  java: { label: 'Java / Kotlin', quotes: ['double'], ascii: true },
  c: { label: 'C / C++', quotes: ['double'], ascii: true },
  python: { label: 'Python', quotes: ['single', 'double'], ascii: true },
  'shell-single': { label: "Shell '…'", quotes: ['single'], ascii: false },
  'shell-double': { label: 'Shell "…"', quotes: ['double'], ascii: false },
  sql: { label: 'SQL (ANSI)', quotes: ['single'], ascii: false },
  'sql-mysql': { label: 'SQL (MySQL default mode)', quotes: ['single'], ascii: false },
};

/**
 * JSON is the one target written in lowercase hex, because `JSON.stringify`
 * is: matching it exactly means output from this tool diffs cleanly against
 * machine-generated JSON. Everywhere else uppercase reads better in source.
 */
function lowerHexFor(target: Target): boolean {
  return target === 'json';
}

function hex(n: number, width: number, lower = false): string {
  const text = n.toString(16).padStart(width, '0');
  return lower ? text : text.toUpperCase();
}

/** A code point as `\uXXXX`, or as a surrogate pair for the UTF-16 targets. */
function u16Escapes(cp: number, lower = false): string {
  if (cp <= 0xffff) return `\\u${hex(cp, 4, lower)}`;
  const v = cp - 0x10000;
  return `\\u${hex(0xd800 + (v >> 10), 4, lower)}\\u${hex(0xdc00 + (v & 0x3ff), 4, lower)}`;
}

/** The non-ASCII form for each target, by that target's own rules. */
function asciiEscape(cp: number, target: Target): string {
  switch (target) {
    case 'python':
      if (cp <= 0xff) return `\\x${hex(cp, 2)}`;
      if (cp <= 0xffff) return `\\u${hex(cp, 4)}`;
      return `\\U${hex(cp, 8)}`;
    case 'c':
      // C99 universal character names. `\x` is avoided on purpose: it has no
      // length limit, so `\x41` followed by a digit becomes a different escape.
      if (cp <= 0xffff) return `\\u${hex(cp, 4)}`;
      return `\\U${hex(cp, 8)}`;
    default:
      return u16Escapes(cp, lowerHexFor(target));
  }
}

/** Control characters, in each target's own spelling. */
function controlEscape(cp: number, target: Target): string {
  const shared: Record<number, string> = { 0x08: '\\b', 0x0a: '\\n', 0x0c: '\\f', 0x0d: '\\r', 0x09: '\\t' };
  if (target === 'json') return shared[cp] ?? `\\u${hex(cp, 4, true)}`;
  if (target === 'java') {
    // Never `\u000A`: Java's lexer expands \u before parsing, so that would put
    // a real newline in the middle of a source line.
    return shared[cp] ?? `\\u${hex(cp, 4)}`;
  }
  if (target === 'js') {
    if (cp === 0x0b) return '\\v';
    if (cp === 0x00) return '\\x00';
    return shared[cp] ?? `\\x${hex(cp, 2)}`;
  }
  if (target === 'python') {
    if (cp === 0x07) return '\\a';
    if (cp === 0x0b) return '\\v';
    return shared[cp] ?? `\\x${hex(cp, 2)}`;
  }
  if (target === 'c') {
    if (cp === 0x07) return '\\a';
    if (cp === 0x0b) return '\\v';
    // Three-digit octal: fixed width, so a following digit cannot join it.
    return shared[cp] ?? `\\${cp.toString(8).padStart(3, '0')}`;
  }
  return String.fromCodePoint(cp);
}

const C_FAMILY: Target[] = ['json', 'js', 'java', 'c', 'python'];

export function isCFamily(target: Target): boolean {
  return C_FAMILY.includes(target);
}

export function quoteChar(target: Target, quote?: Quote): string {
  const allowed = TARGETS[target].quotes;
  const chosen = quote && allowed.includes(quote) ? quote : allowed[0];
  return chosen === 'single' ? "'" : '"';
}

/**
 * Escapes `text` so it can be pasted as a string literal in `target`.
 *
 * Line and paragraph separators (U+2028, U+2029) are escaped for the
 * JavaScript-family targets even in non-ASCII mode: they are legal in JSON and
 * illegal in a JavaScript string literal, which is why a JSON blob pasted into
 * a `.js` file can fail to parse with no visible cause.
 */
export function escapeFor(text: string, target: Target, options: EscapeOptions = {}): string {
  const wrap = options.wrap ?? true;
  const q = quoteChar(target, options.quote);
  let body = '';

  if (target === 'shell-single') {
    // No escapes exist inside '…'. Close, emit a quote, reopen.
    body = text.split("'").join("'\\''");
    return wrap ? `'${body}'` : body;
  }

  if (target === 'shell-double') {
    for (const ch of text) {
      body += '\\"$`'.includes(ch) ? `\\${ch}` : ch;
    }
    return wrap ? `"${body}"` : body;
  }

  if (target === 'sql' || target === 'sql-mysql') {
    for (const ch of text) {
      if (ch === "'") body += "''";
      else if (ch === '\\' && target === 'sql-mysql') body += '\\\\';
      else body += ch;
    }
    return wrap ? `'${body}'` : body;
  }

  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (ch === '\\') {
      body += '\\\\';
    } else if (ch === q) {
      body += `\\${q}`;
    } else if (cp < 0x20 || cp === 0x7f) {
      body += controlEscape(cp, target);
    } else if ((cp === 0x2028 || cp === 0x2029) && (target === 'js' || target === 'json')) {
      body += u16Escapes(cp, lowerHexFor(target));
    } else if (options.asciiOnly && cp > 0x7f) {
      body += asciiEscape(cp, target);
    } else {
      body += ch;
    }
  }

  return wrap ? `${q}${body}${q}` : body;
}

/* ── Reversing ────────────────────────────── */

/** Strips one matching pair of surrounding quotes, if there is one. */
export function unwrap(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    if ((first === '"' || first === "'" || first === '`') && trimmed.endsWith(first)) {
      return trimmed.slice(1, -1);
    }
  }
  return text;
}

const SIMPLE_BACK: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  a: '\u0007',
  '0': '\0',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '`': '`',
  '/': '/',
  '?': '?',
  '\n': '', // a backslash-newline continuation joins the lines
};

/**
 * Reads a string literal back into text.
 *
 * Shared across the C-family targets because the escapes they have in common
 * cover everything this tool emits; a target-specific escape it does not know
 * is passed through rather than guessed at.
 */
function unescapeCFamily(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '\\') {
      out += text[i];
      i += 1;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    if (next === 'u' && text[i + 2] === '{') {
      const close = text.indexOf('}', i + 3);
      const digits = close === -1 ? '' : text.slice(i + 3, close);
      if (/^[0-9a-fA-F]{1,6}$/.test(digits) && Number.parseInt(digits, 16) <= 0x10ffff) {
        out += String.fromCodePoint(Number.parseInt(digits, 16));
        i = close + 1;
        continue;
      }
    }
    if (next === 'u') {
      const digits = /^[0-9a-fA-F]{4}/.exec(text.slice(i + 2))?.[0];
      if (digits) {
        // fromCharCode so an adjacent surrogate pair joins up on its own.
        out += String.fromCharCode(Number.parseInt(digits, 16));
        i += 6;
        continue;
      }
    }
    if (next === 'U') {
      const digits = /^[0-9a-fA-F]{8}/.exec(text.slice(i + 2))?.[0];
      if (digits && Number.parseInt(digits, 16) <= 0x10ffff) {
        out += String.fromCodePoint(Number.parseInt(digits, 16));
        i += 10;
        continue;
      }
    }
    if (next === 'x') {
      const digits = /^[0-9a-fA-F]{1,2}/.exec(text.slice(i + 2))?.[0];
      if (digits) {
        out += String.fromCharCode(Number.parseInt(digits, 16));
        i += 2 + digits.length;
        continue;
      }
    }
    if (/[0-7]/.test(next)) {
      const digits = /^[0-7]{1,3}/.exec(text.slice(i + 1))?.[0] as string;
      const value = Number.parseInt(digits, 8);
      if (value <= 0xff) {
        out += String.fromCharCode(value);
        i += 1 + digits.length;
        continue;
      }
    }
    if (next in SIMPLE_BACK) {
      out += SIMPLE_BACK[next];
      i += 2;
      continue;
    }
    // Unknown: keep both characters. Dropping the backslash would silently
    // change a regular expression pasted in by mistake.
    out += `\\${next}`;
    i += 2;
  }
  return out;
}

export function unescapeFrom(text: string, target: Target): string {
  const body = unwrap(text);
  if (target === 'shell-single') return body.split("'\\''").join("'");
  if (target === 'shell-double') return body.replace(/\\(["\\$`\n])/g, (_, ch) => (ch === '\n' ? '' : ch));
  if (target === 'sql') return body.split("''").join("'");
  if (target === 'sql-mysql') return body.split("''").join("'").replace(/\\(.)/g, '$1');
  return unescapeCFamily(body);
}

/* ── Advice ───────────────────────────────── */

export type Caveat = { zh: string; en: string };

/**
 * What the escaped output still will not protect you from.
 *
 * Present because the SQL case is the one where a tool like this can do real
 * harm: quoting a value correctly and pasting it into a query string teaches
 * exactly the habit that produces injection. The tool says so every time.
 */
export function caveatsFor(target: Target): Caveat[] {
  switch (target) {
    case 'sql':
    case 'sql-mysql':
      return [
        {
          zh: '這是給「手動貼一次 SQL 進 psql」用的。程式裡組查詢請一律用參數化查詢($1、?、:name),不要用這個結果做字串拼接——跳脫正確與安全不是同一件事。',
          en: 'This is for pasting one query into a console. In code, always use a parameterised query ($1, ?, :name); correct escaping and safety are not the same thing.',
        },
        {
          zh: 'ANSI 模式只把單引號加倍。MySQL 預設(NO_BACKSLASH_ESCAPES 未開)另外把反斜線當轉義字元,所以兩種模式的結果不同——選錯會少跳脫一個字元。',
          en: 'ANSI mode only doubles the quote. MySQL, unless NO_BACKSLASH_ESCAPES is on, also treats backslash as an escape, so the two modes differ by exactly one character.',
        },
      ];
    case 'shell-single':
      return [
        {
          zh: "單引號裡沒有轉義字元,所以引號本身要用 '\\'' 這個「關掉、放一個引號、再打開」的把戲。除此之外裡面的內容完全照字面,連反斜線和換行都是。",
          en: "There are no escapes inside single quotes, so a quote needs the close-quote-reopen trick '\\''. Everything else is literal, including backslashes and newlines.",
        },
      ];
    case 'shell-double':
      return [
        {
          zh: '雙引號裡 $、`、\\ 仍然有意義,已經跳脫。但驚嘆號在互動式 shell 裡還有歷史展開,腳本裡沒有——這個差異沒辦法靠跳脫解決。',
          en: 'Inside double quotes $, ` and \\ still act, and are escaped. But ! also triggers history expansion in an interactive shell and not in a script, and no escaping fixes that difference.',
        },
      ];
    case 'java':
      return [
        {
          zh: 'Java 的 \\uXXXX 是在詞法分析之前展開的,所以 "\\u000A" 會變成原始碼裡真正的換行,檔案編譯不過。這裡的換行一律輸出 \\n。',
          en: 'Java expands \\uXXXX before lexing, so "\\u000A" puts a real newline in the source and the file will not compile. Newlines are always written as \\n here.',
        },
      ];
    case 'c':
      return [
        {
          zh: 'C 的 \\x 沒有長度上限:"\\x411" 是一個轉義而不是 \\x41 加 1。所以這裡用 \\uXXXX 與三位數八進位,兩者長度固定。',
          en: 'C\'s \\x has no length limit: "\\x411" is one escape, not \\x41 followed by 1. This writes \\uXXXX and three-digit octal, both fixed width.',
        },
      ];
    case 'json':
      return [
        {
          zh: 'JSON 允許字串裡直接放 U+2028 與 U+2029,JavaScript 的字串字面值不允許。所以這裡把它們跳脫,不然一段合法 JSON 貼進 .js 檔就會語法錯誤。',
          en: 'JSON allows U+2028 and U+2029 raw in a string; a JavaScript string literal does not. They are escaped here, or valid JSON pasted into a .js file becomes a syntax error.',
        },
      ];
    default:
      return [];
  }
}
