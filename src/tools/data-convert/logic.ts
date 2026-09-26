/**
 * Six configuration formats through one value model.
 *
 * Everything parses into plain JSON values and everything serializes out of
 * them, so there are twelve pieces of code rather than thirty conversion pairs.
 * The model is the constraint that matters: it has no dates, no comments, no
 * anchors and no type tags, so any information a format carries beyond
 * "null / boolean / number / string / list / map" is lost on the way through.
 * That is stated in the UI rather than hidden.
 *
 * YAML and TOML are hand-written subsets, not implementations of the specs.
 * A conforming YAML parser is a five-figure line count and is not something to
 * fake. The subsets cover what configuration files actually contain; anything
 * outside them raises a ConvertError naming the construct. The rule throughout:
 * refuse to parse rather than parse into something plausible and wrong.
 *
 * Deliberately NOT supported, each of which throws:
 *   YAML — anchors/aliases (& *), tags (! !!), block scalars (| >), multiple
 *          documents, complex keys (?), merge keys (<<), tab indentation,
 *          quoted scalars spanning lines.
 *   TOML — multi-line strings (""" '''). Dates parse but become strings.
 *   XML  — DOCTYPE and entity declarations. Namespaces are literal name text.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Format = 'json' | 'yaml' | 'toml' | 'xml' | 'csv' | 'query';

export const FORMATS: Format[] = ['json', 'yaml', 'toml', 'xml', 'csv', 'query'];

/**
 * Input ceiling, counted in UTF-16 code units — `text.length`, which is O(1) to
 * check on every keystroke. It is deliberately not a byte count: measuring
 * UTF-8 bytes would mean walking the whole string on each keystroke, and the
 * point of the ceiling is to stay cheap. The message says "characters" for the
 * same reason, because a document at this length is 512 KB of ASCII but about
 * 1.5 MB of UTF-8 Chinese, and quoting KB would be wrong for one of them.
 */
export const MAX_INPUT = 512 * 1024;

/** Nesting ceiling, so a pathological input cannot blow the JS stack. */
export const MAX_DEPTH = 64;

export class ConvertError extends Error {
  format: Format;
  /** 1-based, when the parser knows it. */
  line?: number;
  column?: number;

  constructor(message: string, format: Format, line?: number, column?: number) {
    super(message);
    this.name = 'ConvertError';
    this.format = format;
    this.line = line;
    this.column = column;
  }
}

export type ParseResult = {
  value: Json;
  /** Things that were lossy or guessed. Not errors — the parse succeeded. */
  warnings: string[];
};

export type ParseOptions = {
  csvDelimiter?: string;
  /** First CSV row is a header row. Default true. */
  csvHeader?: boolean;
  /** Turn CSV / XML text that looks numeric or boolean into those types. Default false. */
  coerce?: boolean;
};

export type StringifyOptions = {
  /** Spaces per level for JSON, YAML and XML. Default 2. */
  indent?: number;
  csvDelimiter?: string;
  csvHeader?: boolean;
  xmlRoot?: string;
  sortKeys?: boolean;
};

type Obj = { [key: string]: Json };

/** Accepts `undefined` so callers can test a possibly-absent property directly. */
function isPlainObject(value: Json | undefined): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Assigns a key without letting the input reach the prototype chain.
 *
 * `obj[key] = v` with `key === '__proto__'` mutates the prototype instead of
 * adding a property, which is both a correctness bug (the key disappears) and
 * the classic prototype-pollution shape. `defineProperty` always makes an own
 * property, and the object keeps the ordinary Object prototype so the result
 * behaves like anything JSON.parse produces.
 */
function setKey(target: Obj, key: string, value: Json): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function guardDepth(depth: number, format: Format, line?: number): void {
  if (depth > MAX_DEPTH) {
    throw new ConvertError(`巢狀超過 ${MAX_DEPTH} 層,停在這裡。`, format, line);
  }
}

/* ── JSON ─────────────────────────────────── */

/** Character offset → 1-based line and column. */
function locate(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const line = (before.match(/\n/g) ?? []).length + 1;
  return { line, column: clamped - before.lastIndexOf('\n') };
}

/**
 * Where the JSON went wrong, found by scanning rather than by reading the
 * engine's apology.
 *
 * `JSON.parse` stays the parser — it is the definition of correct — but its
 * error message is not something to build on. Current V8 reports
 * `Unexpected token ',', "…" is not valid JSON` with no offset at all, older V8
 * said "at position N", and Safari and Firefox word theirs differently again.
 * Since a converter's whole value is pointing at the line, the position is
 * recovered here on the slow path, only after the native parse has failed.
 */
type Scan = { s: string; i: number };

type ScanFail = { offset: number; expected: string };

function isScanFail(value: unknown): value is ScanFail {
  return typeof value === 'object' && value !== null && 'offset' in value && 'expected' in value;
}

function jsonWs(c: Scan): void {
  while (c.i < c.s.length && ' \t\n\r'.includes(c.s[c.i])) c.i += 1;
}

function jsonScanString(c: Scan): void {
  c.i += 1; // past the opening quote
  for (;;) {
    const ch = c.s[c.i];
    if (ch === undefined) throw { offset: c.i, expected: '收尾的雙引號' };
    if (ch === '"') {
      c.i += 1;
      return;
    }
    if (ch === '\\') {
      const next = c.s[c.i + 1];
      if (next === undefined) throw { offset: c.i, expected: '轉義字元' };
      if (next === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(c.s.slice(c.i + 2, c.i + 6))) {
          throw { offset: c.i + 2, expected: '\\u 後面四個十六進位數字' };
        }
        c.i += 6;
        continue;
      }
      if (!'"\\/bfnrt'.includes(next)) throw { offset: c.i + 1, expected: '合法的轉義字元' };
      c.i += 2;
      continue;
    }
    // A raw control character is illegal inside a JSON string, and it is the
    // usual reason a log line pasted straight in will not parse.
    if (ch < ' ') throw { offset: c.i, expected: '被轉義的控制字元' };
    c.i += 1;
  }
}

function jsonScanValue(c: Scan, depth: number): void {
  if (depth > MAX_DEPTH) throw { offset: c.i, expected: `不超過 ${MAX_DEPTH} 層的巢狀` };
  jsonWs(c);
  const ch = c.s[c.i];
  if (ch === undefined) throw { offset: c.i, expected: '一個值' };
  if (ch === '"') {
    jsonScanString(c);
    return;
  }
  if (ch === '-' || (ch >= '0' && ch <= '9')) {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(c.s.slice(c.i));
    if (!match || match[0] === '' || match[0] === '-') throw { offset: c.i, expected: '一個數字' };
    c.i += match[0].length;
    return;
  }
  for (const word of ['true', 'false', 'null']) {
    if (c.s.startsWith(word, c.i)) {
      c.i += word.length;
      return;
    }
  }
  if (ch === '[') {
    c.i += 1;
    jsonWs(c);
    if (c.s[c.i] === ']') {
      c.i += 1;
      return;
    }
    for (;;) {
      jsonScanValue(c, depth + 1);
      jsonWs(c);
      if (c.s[c.i] === ',') {
        c.i += 1;
        continue;
      }
      if (c.s[c.i] === ']') {
        c.i += 1;
        return;
      }
      throw { offset: c.i, expected: ', 或 ]' };
    }
  }
  if (ch === '{') {
    c.i += 1;
    jsonWs(c);
    if (c.s[c.i] === '}') {
      c.i += 1;
      return;
    }
    for (;;) {
      jsonWs(c);
      if (c.s[c.i] !== '"') throw { offset: c.i, expected: '用雙引號寫的鍵' };
      jsonScanString(c);
      jsonWs(c);
      if (c.s[c.i] !== ':') throw { offset: c.i, expected: ':' };
      c.i += 1;
      jsonScanValue(c, depth + 1);
      jsonWs(c);
      if (c.s[c.i] === ',') {
        c.i += 1;
        continue;
      }
      if (c.s[c.i] === '}') {
        c.i += 1;
        return;
      }
      throw { offset: c.i, expected: ', 或 }' };
    }
  }
  throw { offset: c.i, expected: '一個值' };
}

function findJsonError(text: string): ScanFail | null {
  const c: Scan = { s: text, i: 0 };
  try {
    jsonScanValue(c, 1);
  } catch (problem) {
    if (isScanFail(problem)) return problem;
    throw problem;
  }
  jsonWs(c);
  if (c.i < text.length) return { offset: c.i, expected: '文件在這裡就該結束了' };
  return null;
}

export function parseJson(text: string): ParseResult {
  if (text.trim() === '') throw new ConvertError('沒有內容。', 'json', 1);
  try {
    return { value: JSON.parse(text) as Json, warnings: [] };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(
      /^JSON\.parse: /,
      ''
    );
    const found = findJsonError(text);
    if (found) {
      const { line, column } = locate(text, found.offset);
      throw new ConvertError(`這裡需要${found.expected}。`, 'json', line, column);
    }
    // The scanner saw nothing the native parser objected to. Do not invent a
    // position; hand the engine's own words over.
    const at = /position (\d+)/.exec(message);
    if (at) {
      const { line, column } = locate(text, Number(at[1]));
      throw new ConvertError(message, 'json', line, column);
    }
    throw new ConvertError(message, 'json');
  }
}

function assertFinite(value: Json, format: Format, path = '$'): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ConvertError(
      `${path} 是 ${Number.isNaN(value) ? 'NaN' : '無限值'},JSON 沒有這種值,無法輸出。`,
      format
    );
  }
  if (Array.isArray(value)) value.forEach((item, i) => assertFinite(item, format, `${path}[${i}]`));
  else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) assertFinite(value[key], format, `${path}.${key}`);
  }
}

export function sortDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (isPlainObject(value)) {
    const out: Obj = {};
    for (const key of Object.keys(value).sort()) setKey(out, key, sortDeep(value[key]));
    return out;
  }
  return value;
}

export function stringifyJson(value: Json, options: StringifyOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  assertFinite(prepared, 'json');
  return JSON.stringify(prepared, null, options.indent ?? 2);
}

/* ── YAML: the subset ─────────────────────── */

type YLine = { indent: number; text: string; line: number };

/** Quote openers only count at a token boundary, so `it's` stays a plain scalar. */
function opensQuote(text: string, i: number): boolean {
  if (text[i] !== '"' && text[i] !== "'") return false;
  if (i === 0) return true;
  return ' ,[{:-'.includes(text[i - 1]);
}

function stripYamlComment(text: string, line: number): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && text[i + 1] === "'") {
          i += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (opensQuote(text, i)) {
      quote = text[i];
      continue;
    }
    if (ch === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) {
      return text.slice(0, i);
    }
  }
  if (quote) {
    throw new ConvertError(
      '引號在這一行結束前沒有收尾。不支援跨行的引號字串,請把值寫在一行內。',
      'yaml',
      line
    );
  }
  return text;
}

function yamlLines(source: string): YLine[] {
  const out: YLine[] = [];
  const raw = source.split(/\r\n|\r|\n/);
  let sawMarker = false;
  for (let i = 0; i < raw.length; i += 1) {
    const rawLine = raw[i];
    const no = i + 1;
    let indent = 0;
    while (indent < rawLine.length && rawLine[indent] === ' ') indent += 1;
    if (rawLine[indent] === '\t') {
      throw new ConvertError('YAML 不接受用 tab 縮排,改成空白。', 'yaml', no, indent + 1);
    }
    const text = stripYamlComment(rawLine.slice(indent), no).replace(/\s+$/, '');
    if (text === '') continue;
    if (text === '---') {
      if (sawMarker || out.length > 0) {
        throw new ConvertError('一次只處理一份文件,不支援多份文件(第二個 ---)。', 'yaml', no);
      }
      sawMarker = true;
      continue;
    }
    if (text === '...') break;
    out.push({ indent, text, line: no });
  }
  return out;
}

const isSeqItem = (text: string): boolean => text === '-' || text.startsWith('- ');

/** Index of the colon that ends a key at this level, or -1. */
function yamlKeyEnd(text: string): number {
  let quote: string | null = null;
  let flow = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && text[i + 1] === "'") {
          i += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (opensQuote(text, i)) {
      quote = ch;
      continue;
    }
    if (ch === '[' || ch === '{') flow += 1;
    else if (ch === ']' || ch === '}') flow -= 1;
    else if (ch === ':' && flow === 0 && (i + 1 === text.length || text[i + 1] === ' ')) return i;
  }
  return -1;
}

function yamlBlock(lines: YLine[], start: number, indent: number, depth: number): [Json, number] {
  guardDepth(depth, 'yaml', lines[start]?.line);
  const first = lines[start];
  if (!first) return [null, start];
  return isSeqItem(first.text)
    ? yamlSeq(lines, start, indent, depth)
    : yamlMap(lines, start, indent, depth);
}

function yamlSeq(lines: YLine[], start: number, indent: number, depth: number): [Json[], number] {
  const out: Json[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new ConvertError('這一行的縮排和上面的序列對不起來。', 'yaml', line.line, line.indent + 1);
    }
    // A line at this indent that is not an item ends the sequence: that is how
    // the common `key:` followed by same-indent `- item` style closes.
    if (!isSeqItem(line.text)) break;
    const rest = line.text === '-' ? '' : line.text.slice(2).replace(/^\s+/, '');
    if (rest === '') {
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const [value, after] = yamlBlock(lines, i + 1, next.indent, depth + 1);
        out.push(value);
        i = after;
        continue;
      }
      out.push(null);
      i += 1;
      continue;
    }
    // `- key: value` and `- - nested`: re-indent the line to where the content
    // starts and parse it as a block of its own, which is exactly what YAML's
    // indentation rules mean here.
    if (isSeqItem(rest) || yamlKeyEnd(rest) !== -1) {
      const offset = indent + (line.text.length - rest.length);
      lines[i] = { indent: offset, text: rest, line: line.line };
      const [value, after] = yamlBlock(lines, i, offset, depth + 1);
      out.push(value);
      i = after;
      continue;
    }
    out.push(yamlScalar(rest, line.line, depth + 1));
    i += 1;
  }
  return [out, i];
}

function yamlMap(lines: YLine[], start: number, indent: number, depth: number): [Obj, number] {
  const out: Obj = {};
  const seen = new Set<string>();
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new ConvertError('這一行的縮排和上面的鍵對不起來。', 'yaml', line.line, line.indent + 1);
    }
    if (isSeqItem(line.text)) {
      throw new ConvertError('這一層已經是對應表,不能再放序列項目。', 'yaml', line.line);
    }
    if (line.text.startsWith('? ')) {
      throw new ConvertError('不支援複合鍵(以 ? 開頭)。', 'yaml', line.line);
    }
    const colon = yamlKeyEnd(line.text);
    if (colon === -1) {
      throw new ConvertError('這一行找不到 "鍵: 值"。', 'yaml', line.line);
    }
    const key = yamlKeyName(line.text.slice(0, colon).trim(), line.line);
    if (key === '<<') {
      throw new ConvertError('不支援合併鍵(<<),它需要錨點才有意義。', 'yaml', line.line);
    }
    if (seen.has(key)) {
      throw new ConvertError(`鍵 "${key}" 在同一層出現兩次。`, 'yaml', line.line);
    }
    seen.add(key);
    const rest = line.text.slice(colon + 1).trim();
    if (rest !== '') {
      setKey(out, key, yamlScalar(rest, line.line, depth + 1));
      i += 1;
      continue;
    }
    const next = lines[i + 1];
    if (next && next.indent > indent) {
      const [value, after] = yamlBlock(lines, i + 1, next.indent, depth + 1);
      setKey(out, key, value);
      i = after;
      continue;
    }
    // A sequence may sit at the same indentation as its key — the common style.
    if (next && next.indent === indent && isSeqItem(next.text)) {
      const [value, after] = yamlSeq(lines, i + 1, indent, depth + 1);
      setKey(out, key, value);
      i = after;
      continue;
    }
    setKey(out, key, null);
    i += 1;
  }
  return [out, i];
}

function yamlKeyName(text: string, line: number): string {
  if (text === '') throw new ConvertError('鍵是空的。', 'yaml', line);
  if (text[0] === '"' || text[0] === "'") {
    const value = yamlQuoted(text, line);
    if (typeof value !== 'string') throw new ConvertError('鍵讀不出來。', 'yaml', line);
    return value;
  }
  if ('&*!|>%@`'.includes(text[0])) {
    throw new ConvertError(`鍵不能以 ${text[0]} 開頭,這個字元在 YAML 裡是保留用途。`, 'yaml', line);
  }
  return text;
}

function yamlQuoted(text: string, line: number): string {
  const quote = text[0];
  const end = text.length - 1;
  if (text.length < 2 || text[end] !== quote) {
    throw new ConvertError('引號沒有收尾。', 'yaml', line);
  }
  const body = text.slice(1, end);
  if (quote === "'") {
    if (/(^|[^'])'($|[^'])/.test(body)) {
      throw new ConvertError("單引號字串裡的單引號要寫兩次('')。", 'yaml', line);
    }
    return body.replace(/''/g, "'");
  }
  return unescapeDouble(body, line);
}

function unescapeDouble(body: string, line: number): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    if (next === undefined) throw new ConvertError('字串結尾有一個孤立的反斜線。', 'yaml', line);
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '0') out += '\0';
    else if (next === '"' || next === '\\' || next === '/' || next === "'") out += next;
    else if (next === 'u' || next === 'x' || next === 'U') {
      const width = next === 'x' ? 2 : next === 'u' ? 4 : 8;
      const digits = body.slice(i + 2, i + 2 + width);
      if (digits.length !== width || !/^[0-9a-fA-F]+$/.test(digits)) {
        throw new ConvertError(`\\${next} 後面要接 ${width} 個十六進位數字。`, 'yaml', line);
      }
      out += String.fromCodePoint(Number.parseInt(digits, 16));
      i += width;
    } else throw new ConvertError(`不認得轉義 \\${next}。`, 'yaml', line);
    i += 1;
  }
  return out;
}

/**
 * A plain YAML scalar's type.
 *
 * Kept deliberately narrow: `null`/`~`/empty, the four spellings of the two
 * booleans, decimal integers and floats, and 0x hex. YAML 1.1's `yes`/`no`/`on`
 * (the "Norway problem") stay strings, because guessing there is how a country
 * code turns into `false`.
 */
function plainScalar(text: string): Json {
  if (text === '' || text === '~' || text === 'null' || text === 'Null' || text === 'NULL') {
    return null;
  }
  if (text === 'true' || text === 'True' || text === 'TRUE') return true;
  if (text === 'false' || text === 'False' || text === 'FALSE') return false;
  if (/^[-+]?\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) return n;
    return text;
  }
  if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(text)) {
    const n = Number.parseInt(text.replace('+', ''), 16);
    return Number.isSafeInteger(n) ? n : text;
  }
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  return text;
}

function yamlScalar(text: string, line: number, depth: number): Json {
  guardDepth(depth, 'yaml', line);
  const head = text[0];
  if (head === '|' || head === '>') {
    throw new ConvertError(
      '不支援區塊純量(| 與 >)。把值改成同一行的引號字串,換行寫成 \\n。',
      'yaml',
      line
    );
  }
  if (head === '&' || head === '*') {
    throw new ConvertError('不支援錨點與別名(& 與 *)。先把它們展開再貼進來。', 'yaml', line);
  }
  if (head === '!') throw new ConvertError('不支援型別標籤(! 與 !!)。', 'yaml', line);
  if (head === '[' || head === '{') return yamlFlow(text, line, depth);
  if (head === '"' || head === "'") return yamlQuoted(text, line);
  return plainScalar(text);
}

type Cursor = { s: string; i: number; line: number; sawDate?: boolean };

function skipFlowSpace(c: Cursor): void {
  while (c.i < c.s.length && (c.s[c.i] === ' ' || c.s[c.i] === '\t')) c.i += 1;
}

function yamlFlow(text: string, line: number, depth: number): Json {
  const c: Cursor = { s: text, i: 0, line };
  const value = flowValue(c, depth);
  skipFlowSpace(c);
  if (c.i < c.s.length) {
    throw new ConvertError(`流式集合收尾後還有多餘的字元:${c.s.slice(c.i)}`, 'yaml', line);
  }
  return value;
}

function flowValue(c: Cursor, depth: number): Json {
  guardDepth(depth, 'yaml', c.line);
  skipFlowSpace(c);
  const ch = c.s[c.i];
  if (ch === '[') {
    c.i += 1;
    const out: Json[] = [];
    skipFlowSpace(c);
    if (c.s[c.i] === ']') {
      c.i += 1;
      return out;
    }
    for (;;) {
      out.push(flowValue(c, depth + 1));
      skipFlowSpace(c);
      const sep = c.s[c.i];
      if (sep === ',') {
        c.i += 1;
        skipFlowSpace(c);
        if (c.s[c.i] === ']') {
          c.i += 1;
          return out;
        }
        continue;
      }
      if (sep === ']') {
        c.i += 1;
        return out;
      }
      throw new ConvertError('流式序列裡少了 , 或 ]。', 'yaml', c.line);
    }
  }
  if (ch === '{') {
    c.i += 1;
    const out: Obj = {};
    skipFlowSpace(c);
    if (c.s[c.i] === '}') {
      c.i += 1;
      return out;
    }
    for (;;) {
      skipFlowSpace(c);
      const key = flowKey(c);
      skipFlowSpace(c);
      if (c.s[c.i] !== ':') throw new ConvertError('流式對應表裡少了 :。', 'yaml', c.line);
      c.i += 1;
      setKey(out, key, flowValue(c, depth + 1));
      skipFlowSpace(c);
      const sep = c.s[c.i];
      if (sep === ',') {
        c.i += 1;
        skipFlowSpace(c);
        if (c.s[c.i] === '}') {
          c.i += 1;
          return out;
        }
        continue;
      }
      if (sep === '}') {
        c.i += 1;
        return out;
      }
      throw new ConvertError('流式對應表裡少了 , 或 }。', 'yaml', c.line);
    }
  }
  if (ch === '"' || ch === "'") return flowQuoted(c);
  const start = c.i;
  while (c.i < c.s.length && !',]}:'.includes(c.s[c.i])) c.i += 1;
  const token = c.s.slice(start, c.i).trim();
  if (token === '') throw new ConvertError('流式集合裡有一個空的位置。', 'yaml', c.line);
  return plainScalar(token);
}

function flowQuoted(c: Cursor): string {
  const quote = c.s[c.i];
  let i = c.i + 1;
  while (i < c.s.length) {
    if (quote === '"' && c.s[i] === '\\') {
      i += 2;
      continue;
    }
    if (c.s[i] === quote) {
      if (quote === "'" && c.s[i + 1] === "'") {
        i += 2;
        continue;
      }
      const raw = c.s.slice(c.i, i + 1);
      c.i = i + 1;
      return yamlQuoted(raw, c.line);
    }
    i += 1;
  }
  throw new ConvertError('引號沒有收尾。', 'yaml', c.line);
}

function flowKey(c: Cursor): string {
  if (c.s[c.i] === '"' || c.s[c.i] === "'") return flowQuoted(c);
  const start = c.i;
  while (c.i < c.s.length && !',}:'.includes(c.s[c.i])) c.i += 1;
  const token = c.s.slice(start, c.i).trim();
  if (token === '') throw new ConvertError('流式對應表裡有一個空的鍵。', 'yaml', c.line);
  return token;
}

export function parseYaml(text: string): ParseResult {
  const lines = yamlLines(text);
  if (lines.length === 0) return { value: null, warnings: [] };
  // A single scalar document, e.g. just `42`.
  if (lines.length === 1 && !isSeqItem(lines[0].text) && yamlKeyEnd(lines[0].text) === -1) {
    return { value: yamlScalar(lines[0].text, lines[0].line, 1), warnings: [] };
  }
  const [value, consumed] = yamlBlock(lines, 0, lines[0].indent, 1);
  if (consumed < lines.length) {
    throw new ConvertError('這一行接不到上面的結構上。', 'yaml', lines[consumed].line);
  }
  return { value, warnings: [] };
}

/* ── YAML out ─────────────────────────────── */

/**
 * Words a YAML 1.1 reader (PyYAML included) turns into booleans. This parser keeps them as
 * strings, but the output has to survive being read by something that does not
 * — so they go out quoted. This is the Norway problem: `country: NO` becoming
 * `false` somewhere downstream.
 */
const YAML11_BOOL = /^(yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;

function yamlScalarOut(value: Json, format: Format): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ConvertError(`YAML 輸出遇到 ${Number.isNaN(value) ? 'NaN' : '無限值'}。`, format);
    }
    return String(value);
  }
  const text = String(value);
  // Quote whenever leaving it bare would change what it parses back as, or
  // where an indicator character would start something else.
  const risky =
    text === '' ||
    text !== text.trim() ||
    /[\n\r\t]/.test(text) ||
    text.includes(': ') ||
    text.includes(' #') ||
    text.endsWith(':') ||
    '-?:,[]{}#&*!|>\'"%@`'.includes(text[0]) ||
    YAML11_BOOL.test(text) ||
    typeof plainScalar(text) !== 'string';
  return risky ? JSON.stringify(text) : text;
}

function yamlNode(value: Json, indent: number, step: number, format: Format, depth: number): string[] {
  guardDepth(depth, format);
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const out: string[] = [];
    for (const item of value) {
      if (Array.isArray(item) ? item.length === 0 : isPlainObject(item) && Object.keys(item).length === 0) {
        out.push(`${pad}- ${Array.isArray(item) ? '[]' : '{}'}`);
        continue;
      }
      if (Array.isArray(item) || isPlainObject(item)) {
        const child = yamlNode(item, indent + step, step, format, depth + 1);
        child[0] = `${pad}- ${child[0].slice(indent + step)}`;
        out.push(...child);
        continue;
      }
      out.push(`${pad}- ${yamlScalarOut(item, format)}`);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [`${pad}{}`];
    const out: string[] = [];
    for (const key of keys) {
      const child = value[key];
      const name = yamlScalarOut(key, format);
      if (Array.isArray(child) && child.length === 0) out.push(`${pad}${name}: []`);
      else if (isPlainObject(child) && Object.keys(child).length === 0) out.push(`${pad}${name}: {}`);
      else if (Array.isArray(child) || isPlainObject(child)) {
        out.push(`${pad}${name}:`);
        out.push(...yamlNode(child, indent + step, step, format, depth + 1));
      } else out.push(`${pad}${name}: ${yamlScalarOut(child, format)}`);
    }
    return out;
  }
  return [`${pad}${yamlScalarOut(value, format)}`];
}

export function stringifyYaml(value: Json, options: StringifyOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  const step = Math.max(1, options.indent ?? 2);
  return `${yamlNode(prepared, 0, step, 'yaml', 1).join('\n')}\n`;
}

/* ── TOML: the subset ─────────────────────── */

function tomlString(body: string, quote: string, line: number): string {
  if (quote === "'") return body;
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '"' || next === '\\') out += next;
    else if (next === 'u' || next === 'U') {
      const width = next === 'u' ? 4 : 8;
      const digits = body.slice(i + 2, i + 2 + width);
      if (digits.length !== width || !/^[0-9a-fA-F]+$/.test(digits)) {
        throw new ConvertError(`\\${next} 後面要接 ${width} 個十六進位數字。`, 'toml', line);
      }
      out += String.fromCodePoint(Number.parseInt(digits, 16));
      i += width;
    } else throw new ConvertError(`TOML 不認得轉義 \\${next}。`, 'toml', line);
    i += 1;
  }
  return out;
}

const TOML_DATE =
  /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$|^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

function tomlNumber(token: string, line: number): number {
  const sign = token[0] === '-' ? -1 : 1;
  const body = token.replace(/^[+-]/, '');
  if (body === 'inf') return sign * Infinity;
  if (body === 'nan') return NaN;
  if (/^0[xX][0-9a-fA-F_]+$/.test(body)) return sign * Number.parseInt(strip(body.slice(2)), 16);
  if (/^0[oO][0-7_]+$/.test(body)) return sign * Number.parseInt(strip(body.slice(2)), 8);
  if (/^0[bB][01_]+$/.test(body)) return sign * Number.parseInt(strip(body.slice(2)), 2);
  const clean = strip(body);
  if (/^\d+$/.test(clean)) {
    if (clean.length > 1 && clean[0] === '0') {
      throw new ConvertError(`TOML 的整數不能有前導零:${token}`, 'toml', line);
    }
    const n = sign * Number(clean);
    if (!Number.isSafeInteger(n)) {
      throw new ConvertError(`整數 ${token} 超出 JavaScript 能精確表示的範圍。`, 'toml', line);
    }
    return n;
  }
  if (/^(\d+\.\d+|\d+)([eE][+-]?\d+)?$/.test(clean)) return sign * Number(clean);
  throw new ConvertError(`讀不出這個值:${token}`, 'toml', line);
}

const strip = (text: string): string => text.replace(/_/g, '');

function skipTomlSpace(c: Cursor): void {
  for (;;) {
    while (c.i < c.s.length && ' \t\r\n'.includes(c.s[c.i])) {
      if (c.s[c.i] === '\n') c.line += 1;
      c.i += 1;
    }
    if (c.s[c.i] === '#') {
      while (c.i < c.s.length && c.s[c.i] !== '\n') c.i += 1;
      continue;
    }
    return;
  }
}

function tomlValue(c: Cursor, depth: number): Json {
  guardDepth(depth, 'toml', c.line);
  skipTomlSpace(c);
  const ch = c.s[c.i];
  if (ch === undefined) throw new ConvertError('= 後面沒有值。', 'toml', c.line);

  if (ch === '"' || ch === "'") {
    if (c.s.startsWith(ch.repeat(3), c.i)) {
      throw new ConvertError(
        '不支援多行字串(""" 與 \'\'\')。把它寫成單行字串,換行用 \\n。',
        'toml',
        c.line
      );
    }
    let i = c.i + 1;
    while (i < c.s.length && c.s[i] !== ch) {
      if (c.s[i] === '\n') throw new ConvertError('字串在換行前沒有收尾。', 'toml', c.line);
      if (ch === '"' && c.s[i] === '\\') i += 1;
      i += 1;
    }
    if (i >= c.s.length) throw new ConvertError('字串沒有收尾。', 'toml', c.line);
    const body = c.s.slice(c.i + 1, i);
    c.i = i + 1;
    return tomlString(body, ch, c.line);
  }

  if (ch === '[') {
    c.i += 1;
    const out: Json[] = [];
    for (;;) {
      skipTomlSpace(c);
      if (c.s[c.i] === ']') {
        c.i += 1;
        return out;
      }
      if (c.i >= c.s.length) throw new ConvertError('陣列沒有收尾的 ]。', 'toml', c.line);
      out.push(tomlValue(c, depth + 1));
      skipTomlSpace(c);
      if (c.s[c.i] === ',') {
        c.i += 1;
        continue;
      }
      if (c.s[c.i] === ']') {
        c.i += 1;
        return out;
      }
      throw new ConvertError('陣列裡少了 , 或 ]。', 'toml', c.line);
    }
  }

  if (ch === '{') {
    c.i += 1;
    const out: Obj = {};
    skipTomlSpace(c);
    if (c.s[c.i] === '}') {
      c.i += 1;
      return out;
    }
    for (;;) {
      skipTomlSpace(c);
      const path = tomlKeyPath(c);
      skipTomlSpace(c);
      if (c.s[c.i] !== '=') throw new ConvertError('行內表裡少了 =。', 'toml', c.line);
      c.i += 1;
      const value = tomlValue(c, depth + 1);
      placeValue(out, path, value, c.line, new Set());
      skipTomlSpace(c);
      if (c.s[c.i] === ',') {
        c.i += 1;
        continue;
      }
      if (c.s[c.i] === '}') {
        c.i += 1;
        return out;
      }
      throw new ConvertError('行內表裡少了 , 或 }。', 'toml', c.line);
    }
  }

  const start = c.i;
  while (c.i < c.s.length && !',]}\n#'.includes(c.s[c.i])) c.i += 1;
  const token = c.s.slice(start, c.i).trim();
  if (token === '') throw new ConvertError('= 後面沒有值。', 'toml', c.line);
  if (token === 'true') return true;
  if (token === 'false') return false;
  // Dates and times have no home in the JSON model, so they stay as the text
  // they were written as. The caller warns about it.
  if (TOML_DATE.test(token)) {
    c.sawDate = true;
    return token;
  }
  return tomlNumber(token, c.line);
}

function tomlKeyPath(c: Cursor): string[] {
  const path: string[] = [];
  for (;;) {
    skipTomlSpace(c);
    const ch = c.s[c.i];
    if (ch === '"' || ch === "'") {
      let i = c.i + 1;
      while (i < c.s.length && c.s[i] !== ch) {
        if (ch === '"' && c.s[i] === '\\') i += 1;
        i += 1;
      }
      if (i >= c.s.length) throw new ConvertError('鍵的引號沒有收尾。', 'toml', c.line);
      path.push(tomlString(c.s.slice(c.i + 1, i), ch, c.line));
      c.i = i + 1;
    } else {
      const start = c.i;
      while (c.i < c.s.length && /[A-Za-z0-9_-]/.test(c.s[c.i])) c.i += 1;
      if (c.i === start) throw new ConvertError(`鍵讀不出來:${c.s.slice(start, start + 20)}`, 'toml', c.line);
      path.push(c.s.slice(start, c.i));
    }
    const save = c.i;
    skipTomlSpace(c);
    if (c.s[c.i] === '.') {
      c.i += 1;
      continue;
    }
    c.i = save;
    return path;
  }
}

/** Assigns `path` inside `table`, creating intermediate tables. */
function placeValue(table: Obj, path: string[], value: Json, line: number, frozen: Set<Obj>): void {
  let cursor = table;
  for (let k = 0; k < path.length - 1; k += 1) {
    const key = path[k];
    const existing = Object.prototype.hasOwnProperty.call(cursor, key) ? cursor[key] : undefined;
    if (existing === undefined) {
      const fresh: Obj = {};
      setKey(cursor, key, fresh);
      cursor = fresh;
      continue;
    }
    if (!isPlainObject(existing)) {
      throw new ConvertError(`${path.slice(0, k + 1).join('.')} 已經是一個值,不能再當表使用。`, 'toml', line);
    }
    if (frozen.has(existing)) {
      throw new ConvertError(`${path.slice(0, k + 1).join('.')} 是行內表,定義後不能再加鍵。`, 'toml', line);
    }
    cursor = existing;
  }
  const last = path[path.length - 1];
  if (Object.prototype.hasOwnProperty.call(cursor, last)) {
    throw new ConvertError(`鍵 ${path.join('.')} 重複定義。`, 'toml', line);
  }
  setKey(cursor, last, value);
}

export function parseToml(text: string): ParseResult {
  const root: Obj = {};
  const warnings: string[] = [];
  const definedTables = new Set<string>();
  const frozen = new Set<Obj>();
  let current = root;
  let sawDate = false;

  const raw = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < raw.length; index += 1) {
    const no = index + 1;
    const trimmed = raw[index].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[')) {
      const isArray = trimmed.startsWith('[[');
      const c: Cursor = { s: trimmed, i: isArray ? 2 : 1, line: no };
      const path = tomlKeyPath(c);
      skipTomlSpace(c);
      const closer = isArray ? ']]' : ']';
      if (!c.s.startsWith(closer, c.i)) {
        throw new ConvertError(`表頭少了 ${closer}。`, 'toml', no);
      }
      c.i += closer.length;
      skipTomlSpace(c);
      if (c.i < c.s.length) throw new ConvertError('表頭後面還有多餘的內容。', 'toml', no);

      const id = JSON.stringify(path);
      if (!isArray && definedTables.has(id)) {
        throw new ConvertError(`表 [${path.join('.')}] 重複定義。`, 'toml', no);
      }
      if (!isArray) definedTables.add(id);
      current = openTable(root, path, isArray, no, frozen);
      continue;
    }

    // A key/value line. Array and inline-table values may run over several
    // lines, so keep appending lines until the brackets balance.
    const body = raw[index];
    const eq = findTomlEquals(body, no);
    let value = body.slice(eq + 1);
    if (needsMoreLines(value)) {
      let look = index;
      while (needsMoreLines(value) && look + 1 < raw.length) {
        look += 1;
        value += `\n${raw[look]}`;
      }
      if (needsMoreLines(value)) throw new ConvertError('陣列或行內表沒有收尾。', 'toml', no);
      index = look;
    }
    const keyCursor: Cursor = { s: body.slice(0, eq), i: 0, line: no };
    const path = tomlKeyPath(keyCursor);
    skipTomlSpace(keyCursor);
    if (keyCursor.i < keyCursor.s.length) {
      throw new ConvertError('= 左邊的鍵讀不出來。', 'toml', no);
    }
    const valueCursor: Cursor = { s: value, i: 0, line: no };
    const parsed = tomlValue(valueCursor, 1);
    skipTomlSpace(valueCursor);
    if (valueCursor.i < valueCursor.s.length) {
      throw new ConvertError(`值後面還有多餘的內容:${value.slice(valueCursor.i).trim()}`, 'toml', no);
    }
    if (valueCursor.sawDate) sawDate = true;
    if (isPlainObject(parsed)) frozen.add(parsed);
    placeValue(current, path, parsed, no, frozen);
  }

  if (sawDate) {
    warnings.push('TOML 的日期與時間值被當成字串保留 —— JSON 模型裡沒有日期型別。');
  }
  return { value: root, warnings };
}

function findTomlEquals(line: string, no: number): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') break;
    if (ch === '=') return i;
  }
  throw new ConvertError('這一行不是 key = value,也不是表頭。', 'toml', no);
}

/** True while an array or inline table is still open outside of any string. */
function needsMoreLines(text: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') depth -= 1;
  }
  return depth > 0;
}

function openTable(root: Obj, path: string[], isArray: boolean, line: number, frozen: Set<Obj>): Obj {
  let cursor = root;
  for (let k = 0; k < path.length - 1; k += 1) {
    const key = path[k];
    const existing = Object.prototype.hasOwnProperty.call(cursor, key) ? cursor[key] : undefined;
    if (existing === undefined) {
      const fresh: Obj = {};
      setKey(cursor, key, fresh);
      cursor = fresh;
      continue;
    }
    if (Array.isArray(existing)) {
      const last = existing[existing.length - 1];
      if (!isPlainObject(last)) {
        throw new ConvertError(`${path.slice(0, k + 1).join('.')} 不是表陣列。`, 'toml', line);
      }
      cursor = last;
      continue;
    }
    if (!isPlainObject(existing)) {
      throw new ConvertError(`${path.slice(0, k + 1).join('.')} 已經是一個值,不能再當表使用。`, 'toml', line);
    }
    if (frozen.has(existing)) {
      throw new ConvertError(`${path.slice(0, k + 1).join('.')} 是行內表,不能再加鍵。`, 'toml', line);
    }
    cursor = existing;
  }
  const last = path[path.length - 1];
  const existing = Object.prototype.hasOwnProperty.call(cursor, last) ? cursor[last] : undefined;
  if (isArray) {
    if (existing === undefined) {
      const fresh: Obj = {};
      setKey(cursor, last, [fresh]);
      return fresh;
    }
    if (!Array.isArray(existing)) {
      throw new ConvertError(`${path.join('.')} 已經是表,不能再當表陣列使用。`, 'toml', line);
    }
    const fresh: Obj = {};
    existing.push(fresh);
    return fresh;
  }
  if (existing === undefined) {
    const fresh: Obj = {};
    setKey(cursor, last, fresh);
    return fresh;
  }
  if (!isPlainObject(existing)) {
    throw new ConvertError(`${path.join('.')} 已經是一個值,不能再當表使用。`, 'toml', line);
  }
  return existing;
}

/* ── TOML out ─────────────────────────────── */

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function tomlKeyOut(key: string): string {
  return BARE_KEY.test(key) && key !== '' ? key : tomlQuote(key);
}

function tomlQuote(text: string): string {
  let out = '"';
  for (const ch of text) {
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch < ' ') out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

function tomlInline(value: Json, path: string, depth: number): string {
  guardDepth(depth, 'toml');
  if (value === null) {
    throw new ConvertError(`${path} 是 null。TOML 沒有 null,請先刪掉這個鍵或改成空字串。`, 'toml');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    return String(value);
  }
  if (typeof value === 'string') return tomlQuote(value);
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => tomlInline(item, `${path}[${i}]`, depth + 1)).join(', ')}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  return `{ ${keys
    .map((key) => `${tomlKeyOut(key)} = ${tomlInline(value[key], `${path}.${key}`, depth + 1)}`)
    .join(', ')} }`;
}

const isTableArray = (value: Json): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(isPlainObject);

function tomlSection(table: Obj, path: string[], out: string[], depth: number): void {
  guardDepth(depth, 'toml');
  const nested: string[] = [];
  for (const key of Object.keys(table)) {
    const value = table[key];
    if (isPlainObject(value) || isTableArray(value)) {
      nested.push(key);
      continue;
    }
    out.push(`${tomlKeyOut(key)} = ${tomlInline(value, [...path, key].join('.'), depth + 1)}`);
  }
  for (const key of nested) {
    const value = table[key];
    const here = [...path, key];
    const header = here.map(tomlKeyOut).join('.');
    if (Array.isArray(value)) {
      for (const item of value) {
        out.push('');
        out.push(`[[${header}]]`);
        tomlSection(item as Obj, here, out, depth + 1);
      }
      continue;
    }
    out.push('');
    out.push(`[${header}]`);
    tomlSection(value as Obj, here, out, depth + 1);
  }
}

export function stringifyToml(value: Json, options: StringifyOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  if (!isPlainObject(prepared)) {
    throw new ConvertError(
      `TOML 的最外層必須是表(鍵值對)。這份資料的最外層是${
        Array.isArray(prepared) ? '陣列' : '純量'
      },請包成 { key: ... } 再轉。`,
      'toml'
    );
  }
  const out: string[] = [];
  tomlSection(prepared, [], out, 1);
  while (out.length > 0 && out[0] === '') out.shift();
  return `${out.join('\n')}\n`;
}

/* ── XML: the subset ──────────────────────── */

type XNode = { name: string; attrs: [string, string][]; children: XNode[]; text: string };

const ENTITIES: { [name: string]: string } = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string, line: number): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
        throw new ConvertError(`字元參照 ${whole} 不是合法的碼位。`, 'xml', line);
      }
      return String.fromCodePoint(code);
    }
    const known = ENTITIES[body];
    if (known === undefined) {
      throw new ConvertError(
        `不認得實體 ${whole}。只支援 &amp; &lt; &gt; &quot; &apos; 與數值參照;自訂實體需要 DTD,這裡不處理。`,
        'xml',
        line
      );
    }
    return known;
  });
}

const XML_NAME = /^[A-Za-z_][A-Za-z0-9._:-]*$/;

function xmlParse(text: string): XNode {
  const c: Cursor = { s: text, i: 0, line: 1 };
  const advance = (to: number): void => {
    for (let k = c.i; k < to; k += 1) if (c.s[k] === '\n') c.line += 1;
    c.i = to;
  };

  const skipProlog = (): void => {
    for (;;) {
      const before = c.i;
      while (c.i < c.s.length && ' \t\r\n'.includes(c.s[c.i])) {
        if (c.s[c.i] === '\n') c.line += 1;
        c.i += 1;
      }
      if (c.s.startsWith('<!--', c.i)) {
        const end = c.s.indexOf('-->', c.i);
        if (end === -1) throw new ConvertError('註解沒有收尾的 -->。', 'xml', c.line);
        advance(end + 3);
        continue;
      }
      if (c.s.startsWith('<?', c.i)) {
        const end = c.s.indexOf('?>', c.i);
        if (end === -1) throw new ConvertError('處理指示沒有收尾的 ?>。', 'xml', c.line);
        advance(end + 2);
        continue;
      }
      if (c.s.startsWith('<!DOCTYPE', c.i) || c.s.startsWith('<!ENTITY', c.i)) {
        throw new ConvertError(
          '不支援 DOCTYPE 與實體宣告。外部實體是這類解析器最常見的漏洞來源,這裡直接拒收。',
          'xml',
          c.line
        );
      }
      if (c.i === before) return;
    }
  };

  const readName = (): string => {
    const start = c.i;
    while (c.i < c.s.length && /[A-Za-z0-9._:-]/.test(c.s[c.i])) c.i += 1;
    const name = c.s.slice(start, c.i);
    if (!XML_NAME.test(name)) {
      throw new ConvertError(`元素或屬性名稱不合法:${name || c.s[c.i]}`, 'xml', c.line);
    }
    return name;
  };

  const readElement = (depth: number): XNode => {
    guardDepth(depth, 'xml', c.line);
    if (c.s[c.i] !== '<') throw new ConvertError('這裡需要一個元素。', 'xml', c.line);
    c.i += 1;
    const name = readName();
    const node: XNode = { name, attrs: [], children: [], text: '' };
    for (;;) {
      while (c.i < c.s.length && ' \t\r\n'.includes(c.s[c.i])) {
        if (c.s[c.i] === '\n') c.line += 1;
        c.i += 1;
      }
      if (c.s.startsWith('/>', c.i)) {
        c.i += 2;
        return node;
      }
      if (c.s[c.i] === '>') {
        c.i += 1;
        break;
      }
      if (c.i >= c.s.length) throw new ConvertError(`<${name}> 沒有收尾。`, 'xml', c.line);
      const attr = readName();
      while (c.i < c.s.length && ' \t\r\n'.includes(c.s[c.i])) c.i += 1;
      if (c.s[c.i] !== '=') throw new ConvertError(`屬性 ${attr} 少了 =。`, 'xml', c.line);
      c.i += 1;
      while (c.i < c.s.length && ' \t\r\n'.includes(c.s[c.i])) c.i += 1;
      const quote = c.s[c.i];
      if (quote !== '"' && quote !== "'") {
        throw new ConvertError(`屬性 ${attr} 的值必須用引號包起來。`, 'xml', c.line);
      }
      const end = c.s.indexOf(quote, c.i + 1);
      if (end === -1) throw new ConvertError(`屬性 ${attr} 的引號沒有收尾。`, 'xml', c.line);
      const value = decodeEntities(c.s.slice(c.i + 1, end), c.line);
      if (node.attrs.some(([existing]) => existing === attr)) {
        throw new ConvertError(`<${name}> 的屬性 ${attr} 重複了。`, 'xml', c.line);
      }
      node.attrs.push([attr, value]);
      advance(end + 1);
    }

    for (;;) {
      if (c.i >= c.s.length) throw new ConvertError(`</${name}> 不見了。`, 'xml', c.line);
      if (c.s.startsWith('</', c.i)) {
        const end = c.s.indexOf('>', c.i);
        if (end === -1) throw new ConvertError('結尾標籤沒有收尾的 >。', 'xml', c.line);
        const closing = c.s.slice(c.i + 2, end).trim();
        if (closing !== name) {
          throw new ConvertError(`<${name}> 的結尾標籤寫成 </${closing}>。`, 'xml', c.line);
        }
        advance(end + 1);
        return node;
      }
      if (c.s.startsWith('<!--', c.i)) {
        const end = c.s.indexOf('-->', c.i);
        if (end === -1) throw new ConvertError('註解沒有收尾的 -->。', 'xml', c.line);
        advance(end + 3);
        continue;
      }
      if (c.s.startsWith('<![CDATA[', c.i)) {
        const end = c.s.indexOf(']]>', c.i);
        if (end === -1) throw new ConvertError('CDATA 沒有收尾的 ]]>。', 'xml', c.line);
        node.text += c.s.slice(c.i + 9, end);
        advance(end + 3);
        continue;
      }
      if (c.s.startsWith('<?', c.i)) {
        const end = c.s.indexOf('?>', c.i);
        if (end === -1) throw new ConvertError('處理指示沒有收尾的 ?>。', 'xml', c.line);
        advance(end + 2);
        continue;
      }
      if (c.s[c.i] === '<') {
        node.children.push(readElement(depth + 1));
        continue;
      }
      const next = c.s.indexOf('<', c.i);
      const stop = next === -1 ? c.s.length : next;
      node.text += decodeEntities(c.s.slice(c.i, stop), c.line);
      advance(stop);
    }
  };

  skipProlog();
  if (c.i >= c.s.length) throw new ConvertError('沒有找到任何元素。', 'xml', c.line);
  const root = readElement(1);
  skipProlog();
  if (c.i < c.s.length) {
    throw new ConvertError('XML 只能有一個根元素,這裡後面還有內容。', 'xml', c.line);
  }
  return root;
}

function coerceText(text: string, coerce: boolean): Json {
  if (!coerce) return text;
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '') return text;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  return text;
}

function xmlToJson(node: XNode, coerce: boolean): Json {
  if (node.attrs.length === 0 && node.children.length === 0) return coerceText(node.text, coerce);
  const out: Obj = {};
  for (const [name, value] of node.attrs) setKey(out, `@${name}`, coerceText(value, coerce));
  const groups = new Map<string, XNode[]>();
  for (const child of node.children) {
    const list = groups.get(child.name);
    if (list) list.push(child);
    else groups.set(child.name, [child]);
  }
  for (const [name, list] of groups) {
    setKey(
      out,
      name,
      list.length === 1 ? xmlToJson(list[0], coerce) : list.map((child) => xmlToJson(child, coerce))
    );
  }
  if (node.text.trim() !== '') setKey(out, '#text', coerceText(node.text.trim(), coerce));
  return out;
}

export function parseXml(text: string, options: ParseOptions = {}): ParseResult {
  if (text.trim() === '') throw new ConvertError('沒有內容。', 'xml', 1);
  const root = xmlParse(text);
  const out: Obj = {};
  setKey(out, root.name, xmlToJson(root, options.coerce ?? false));
  const warnings = [
    '同名元素只出現一次時會變成物件,出現多次才是陣列 —— XML 本身沒有記錄「這是一個清單」。',
  ];
  return { value: out, warnings };
}

/* ── XML out ──────────────────────────────── */

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

function xmlScalarText(value: Json, path: string): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ConvertError(`${path} 是 NaN 或無限值。`, 'xml');
    return String(value);
  }
  return String(value);
}

function xmlElement(
  name: string,
  value: Json,
  indent: number,
  step: number,
  path: string,
  depth: number
): string[] {
  guardDepth(depth, 'xml');
  if (!XML_NAME.test(name)) {
    throw new ConvertError(
      `"${name}" 不能當 XML 元素名稱(不能以數字或符號開頭,不能含空白)。`,
      'xml'
    );
  }
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(...xmlElement(name, value[i], indent, step, `${path}[${i}]`, depth + 1));
    }
    return out;
  }
  if (isPlainObject(value)) {
    const attrs: string[] = [];
    const kids: string[] = [];
    let text: string | null = null;
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (key.startsWith('@')) {
        if (Array.isArray(child) || isPlainObject(child)) {
          throw new ConvertError(`${path}.${key} 是屬性,值只能是純量。`, 'xml');
        }
        attrs.push(`${key.slice(1)}="${escapeXmlAttr(xmlScalarText(child, `${path}.${key}`))}"`);
        continue;
      }
      if (key === '#text') {
        if (Array.isArray(child) || isPlainObject(child)) {
          throw new ConvertError(`${path}.#text 只能是純量。`, 'xml');
        }
        text = xmlScalarText(child, `${path}.#text`);
        continue;
      }
      kids.push(...xmlElement(key, child, indent + step, step, `${path}.${key}`, depth + 1));
    }
    const open = `<${name}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}`;
    if (kids.length === 0 && text === null) return [`${pad}${open}/>`];
    if (kids.length === 0) return [`${pad}${open}>${escapeXmlText(text ?? '')}</${name}>`];
    const out = [`${pad}${open}>`];
    if (text !== null && text !== '') out.push(`${' '.repeat(indent + step)}${escapeXmlText(text)}`);
    out.push(...kids);
    out.push(`${pad}</${name}>`);
    return out;
  }
  if (value === null) return [`${pad}<${name}/>`];
  return [`${pad}<${name}>${escapeXmlText(xmlScalarText(value, path))}</${name}>`];
}

export function stringifyXml(value: Json, options: StringifyOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  const step = Math.max(1, options.indent ?? 2);
  const declared = options.xmlRoot;
  let rootName = declared ?? 'root';
  let body: Json = prepared;
  if (declared === undefined && isPlainObject(prepared)) {
    const keys = Object.keys(prepared);
    // One object key that is a legal element name is the root, which is what
    // makes XML → JSON → XML come back the same shape.
    if (keys.length === 1 && XML_NAME.test(keys[0]) && !keys[0].startsWith('@')) {
      rootName = keys[0];
      body = prepared[keys[0]];
    }
  }
  const lines = Array.isArray(body)
    ? [
        `<${rootName}>`,
        ...body.flatMap((item, i) => xmlElement('item', item, step, step, `$[${i}]`, 2)),
        `</${rootName}>`,
      ]
    : xmlElement(rootName, body, 0, step, '$', 1);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join('\n')}\n`;
}

/* ── CSV ──────────────────────────────────── */

function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;
  let line = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      if (ch === '\n') line += 1;
      field += ch;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      touched = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      touched = true;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      touched = false;
      line += 1;
      continue;
    }
    field += ch;
    touched = true;
  }
  if (quoted) throw new ConvertError('有一個引號沒有收尾,檔案就結束了。', 'csv', line);
  if (touched || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string, options: ParseOptions = {}): ParseResult {
  const delimiter = (options.csvDelimiter ?? ',').slice(0, 1) || ',';
  const header = options.csvHeader ?? true;
  const coerce = options.coerce ?? false;
  const warnings: string[] = [];
  const rows = csvRows(text.replace(/^﻿/, ''), delimiter);
  if (rows.length === 0) return { value: [], warnings };

  if (!header) {
    return { value: rows.map((row) => row.map((cell) => coerceText(cell, coerce))), warnings };
  }

  const names: string[] = [];
  rows[0].forEach((cell, i) => {
    let name = cell.trim();
    if (name === '') {
      name = `column_${i + 1}`;
      warnings.push(`第 ${i + 1} 欄的標題是空的,命名為 ${name}。`);
    }
    if (names.includes(name)) {
      const unique = `${name}_${i + 1}`;
      warnings.push(`標題 "${name}" 重複,第 ${i + 1} 欄改叫 ${unique}。`);
      name = unique;
    }
    names.push(name);
  });

  let ragged = 0;
  const out: Json[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.length !== names.length) ragged += 1;
    const record: Obj = {};
    for (let cellIndex = 0; cellIndex < Math.max(names.length, row.length); cellIndex += 1) {
      const key = names[cellIndex] ?? `column_${cellIndex + 1}`;
      setKey(record, key, coerceText(row[cellIndex] ?? '', coerce));
    }
    out.push(record);
  }
  if (ragged > 0) {
    warnings.push(`有 ${ragged} 列的欄位數和標題不同,缺的補空字串,多的放進 column_N。`);
  }
  return { value: out, warnings };
}

function csvCell(value: Json, delimiter: string): string {
  let text: string;
  if (value === null) text = '';
  else if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (typeof value === 'string') text = value;
  // A nested value has no cell to live in, so it goes in as compact JSON. Said
  // out loud in the UI, because it is the one place CSV output is not faithful.
  else text = JSON.stringify(value);
  const needsQuote =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r') ||
    text !== text.trim();
  return needsQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

export function stringifyCsv(value: Json, options: StringifyOptions = {}): string {
  const delimiter = (options.csvDelimiter ?? ',').slice(0, 1) || ',';
  const header = options.csvHeader ?? true;
  if (!Array.isArray(value)) {
    throw new ConvertError(
      `CSV 只能表示表格,最外層必須是陣列。這份資料的最外層是${
        isPlainObject(value) ? '物件' : '純量'
      } —— 先用 JSON 查詢挑出要輸出的那個陣列。`,
      'csv'
    );
  }
  if (value.length === 0) return '';
  if (value.every((row) => Array.isArray(row))) {
    return `${(value as Json[][]).map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join('\n')}\n`;
  }
  if (value.every(isPlainObject)) {
    // The column union is collected with a Set rather than `names.includes`:
    // with a list this loop is O(rows x columns squared), which a 300-column
    // table inside the 512 K ceiling turns into hundreds of milliseconds on
    // every keystroke. Order still follows first appearance.
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of value as Obj[]) {
      for (const key of Object.keys(row)) {
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(key);
      }
    }
    const lines = (value as Obj[]).map((row) =>
      names.map((key) => csvCell(Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null, delimiter)).join(delimiter)
    );
    const head = header ? [names.map((key) => csvCell(key, delimiter)).join(delimiter)] : [];
    return `${[...head, ...lines].join('\n')}\n`;
  }
  // A flat list of scalars is still a one-column table; a mixture is not.
  if (value.every((row) => !Array.isArray(row) && !isPlainObject(row))) {
    const head = header ? ['value'] : [];
    return `${[...head, ...value.map((cell) => csvCell(cell, delimiter))].join('\n')}\n`;
  }
  throw new ConvertError(
    '這個陣列裡混了物件、陣列與純量,沒有一致的欄位可以排。先把它整理成同一種形狀。',
    'csv'
  );
}

/* ── Query string ─────────────────────────── */

function decodeComponent(text: string, format: Format): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    throw new ConvertError(`百分比編碼壞了,無法解碼:${text}`, format);
  }
}

/** `a[b][]` → ['a','b',''] on the raw text, before any decoding. */
function queryPath(rawKey: string): string[] {
  const head = rawKey.indexOf('[');
  if (head === -1) return [rawKey];
  const path = [rawKey.slice(0, head)];
  let i = head;
  while (i < rawKey.length) {
    if (rawKey[i] !== '[') throw new ConvertError(`鍵的括號寫法讀不出來:${rawKey}`, 'query');
    const close = rawKey.indexOf(']', i);
    if (close === -1) throw new ConvertError(`鍵少了收尾的 ]:${rawKey}`, 'query');
    path.push(rawKey.slice(i + 1, close));
    i = close + 1;
  }
  return path;
}

export function parseQuery(text: string): ParseResult {
  const warnings: string[] = [];
  const body = text.trim().replace(/^[?#]/, '');
  const root: Obj = {};
  if (body === '') return { value: root, warnings };

  for (const pair of body.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    if (rawKey === '') throw new ConvertError(`這一段沒有鍵:${pair}`, 'query');
    const path = queryPath(rawKey).map((part, i) =>
      i === 0 || !/^\d*$/.test(part) ? decodeComponent(part, 'query') : part
    );
    const value = decodeComponent(rawValue, 'query');
    if (eq === -1) warnings.push(`"${rawKey}" 沒有 =,當成空字串。`);
    assignQuery(root, path, value);
  }
  return { value: normalizeQueryArrays(root, 1), warnings };
}

/**
 * Bracket paths build objects first; numeric and empty keys become arrays in a
 * second pass. Doing it in one pass would mean guessing from `a[0]` whether `a`
 * is a list or a map with the key "0" before seeing the rest of the string.
 */
function assignQuery(target: Obj, path: string[], value: string): void {
  let cursor = target;
  for (let k = 0; k < path.length - 1; k += 1) {
    const key = path[k] === '' ? String(countNumericKeys(cursor)) : path[k];
    const existing = Object.prototype.hasOwnProperty.call(cursor, key) ? cursor[key] : undefined;
    if (isPlainObject(existing)) {
      cursor = existing;
      continue;
    }
    if (existing !== undefined) {
      throw new ConvertError(`${path.slice(0, k + 1).join('.')} 同時被當成值和容器使用。`, 'query');
    }
    const fresh: Obj = {};
    setKey(cursor, key, fresh);
    cursor = fresh;
  }
  const last = path[path.length - 1];
  if (last === '') {
    setKey(cursor, String(countNumericKeys(cursor)), value);
    return;
  }
  const existing = Object.prototype.hasOwnProperty.call(cursor, last) ? cursor[last] : undefined;
  if (existing === undefined) {
    setKey(cursor, last, value);
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  if (isPlainObject(existing)) {
    throw new ConvertError(`${last} 同時被當成值和容器使用。`, 'query');
  }
  // Repeated plain key: the second occurrence turns it into a list.
  setKey(cursor, last, [existing, value]);
}

function countNumericKeys(target: Obj): number {
  return Object.keys(target).filter((key) => /^\d+$/.test(key)).length;
}

/**
 * Whether a map's keys are exactly 0..n-1, which is the rule for reading it back
 * as a list. Shared with the round-trip warning below so the two can never
 * disagree about which maps disappear.
 */
function readsBackAsArray(keys: string[]): boolean {
  return (
    keys.length > 0 &&
    keys.every((key) => /^\d+$/.test(key)) &&
    keys
      .map(Number)
      .sort((a, b) => a - b)
      .every((n, i) => n === i)
  );
}

/**
 * Maps that a query string cannot bring back as maps.
 *
 * `{"a":{"0":"x"}}` serializes to `a[0]=x`, and reading that gives `{a:["x"]}`.
 * The bracket form has no way to say "a map with the key 0", so this is a limit
 * of the format rather than something to fix — but it is a value changing shape
 * on the way through, which is exactly the kind of thing that must not be
 * silent. Fires only for the maps that actually change; `a[]` style lists, and
 * maps whose numeric keys have gaps, come back as they went in.
 */
export function queryRoundTripWarnings(value: Json, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => queryRoundTripWarnings(item, `${path}[${i}]`));
  }
  if (!isPlainObject(value)) return [];
  const keys = Object.keys(value);
  const here = readsBackAsArray(keys)
    ? [`${path} 的鍵剛好是 0 到 ${keys.length - 1},寫成 query string 之後再讀回來會變成陣列,不會是原來的物件。`]
    : [];
  return [...here, ...keys.flatMap((key) => queryRoundTripWarnings(value[key], `${path}.${key}`))];
}

function normalizeQueryArrays(value: Json, depth: number): Json {
  guardDepth(depth, 'query');
  if (Array.isArray(value)) return value.map((item) => normalizeQueryArrays(item, depth + 1));
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  const numeric = readsBackAsArray(keys);
  if (numeric) {
    return keys
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => normalizeQueryArrays(value[String(n)], depth + 1));
  }
  const out: Obj = {};
  for (const key of keys) setKey(out, key, normalizeQueryArrays(value[key], depth + 1));
  return out;
}

/** Structural brackets stay literal; brackets inside a key name are escaped. */
function encodeQueryKey(path: string[]): string {
  const head = encodeURIComponent(path[0]);
  return head + path.slice(1).map((part) => `[${encodeURIComponent(part)}]`).join('');
}

function queryPairs(value: Json, path: string[], out: string[], depth: number): void {
  guardDepth(depth, 'query');
  if (Array.isArray(value)) {
    value.forEach((item, i) => queryPairs(item, [...path, String(i)], out, depth + 1));
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) queryPairs(value[key], [...path, key], out, depth + 1);
    return;
  }
  let text: string;
  if (value === null) text = '';
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ConvertError(`${path.join('.')} 是 NaN 或無限值。`, 'query');
    text = String(value);
  } else text = String(value);
  out.push(`${encodeQueryKey(path)}=${encodeURIComponent(text)}`);
}

export function stringifyQuery(value: Json, options: StringifyOptions = {}): string {
  const prepared = options.sortKeys ? sortDeep(value) : value;
  if (!isPlainObject(prepared) && !Array.isArray(prepared)) {
    throw new ConvertError('query string 的最外層要是物件或陣列。', 'query');
  }
  const out: string[] = [];
  if (Array.isArray(prepared)) {
    prepared.forEach((item, i) => queryPairs(item, [String(i)], out, 1));
  } else {
    for (const key of Object.keys(prepared)) queryPairs(prepared[key], [key], out, 1);
  }
  return out.join('&');
}

/* ── The dispatcher ───────────────────────── */

export function parse(text: string, format: Format, options: ParseOptions = {}): ParseResult {
  if (text.length > MAX_INPUT) {
    throw new ConvertError(
      `輸入 ${text.length} 個字元,超過 ${MAX_INPUT} 字元的上限。` +
        '上限算的是字元數而不是位元組:一份全中文的文件到這個長度,存成 UTF-8 大約是 1.5 MB。' +
        '這是為了讓每次按鍵都重算還不會卡住,超過的部分請分批處理。',
      format
    );
  }
  if (format === 'json') return parseJson(text);
  if (format === 'yaml') return parseYaml(text);
  if (format === 'toml') return parseToml(text);
  if (format === 'xml') return parseXml(text, options);
  if (format === 'csv') return parseCsv(text, options);
  return parseQuery(text);
}

export function stringify(value: Json, format: Format, options: StringifyOptions = {}): string {
  if (format === 'json') return stringifyJson(value, options);
  if (format === 'yaml') return stringifyYaml(value, options);
  if (format === 'toml') return stringifyToml(value, options);
  if (format === 'xml') return stringifyXml(value, options);
  if (format === 'csv') return stringifyCsv(value, options);
  return stringifyQuery(value, options);
}

export type ConvertResult = { text: string; value: Json; warnings: string[] };

export function convert(
  text: string,
  from: Format,
  to: Format,
  options: ParseOptions & StringifyOptions = {}
): ConvertResult {
  const parsed = parse(text, from, options);
  const out = stringify(parsed.value, to, options);
  const warnings =
    to === 'query' ? [...parsed.warnings, ...queryRoundTripWarnings(parsed.value)] : parsed.warnings;
  return { text: out, value: parsed.value, warnings };
}

/* ── Measurements ─────────────────────────── */

export type Shape = {
  kind: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
  keys: number;
  nodes: number;
  leaves: number;
  depth: number;
};

export function shape(value: Json): Shape {
  let keys = 0;
  let nodes = 0;
  let leaves = 0;
  let deepest = 0;

  const walk = (node: Json, level: number): void => {
    nodes += 1;
    if (level > deepest) deepest = level;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, level + 1);
      return;
    }
    if (isPlainObject(node)) {
      const own = Object.keys(node);
      keys += own.length;
      for (const key of own) walk(node[key], level + 1);
      return;
    }
    leaves += 1;
  };
  walk(value, 1);

  const kind = Array.isArray(value)
    ? 'array'
    : isPlainObject(value)
      ? 'object'
      : value === null
        ? 'null'
        : (typeof value as 'boolean' | 'number' | 'string');
  return { kind, keys, nodes, leaves, depth: deepest };
}
