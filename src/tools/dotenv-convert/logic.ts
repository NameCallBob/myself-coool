/**
 * .env ⇄ JSON / YAML / compose environment / shell export.
 *
 * The whole difficulty of this format is quoting, and every loader disagrees
 * slightly. The rules implemented here are the ones `dotenv` documents and the
 * ones Docker Compose follows, written out so they can be argued with:
 *
 *  - `KEY=value` — unquoted. Trailing spaces are dropped, and ` #` starts a
 *    comment. A `$` is left exactly as typed, because whether it expands is up
 *    to whatever loads the file.
 *  - `KEY='value'` — literal. No escape sequences at all, not even `\'`.
 *  - `KEY="value"` — `\n`, `\r`, `\t`, `\\`, `\"` and `\$` are interpreted.
 *  - Either quote may span lines; an unquoted value may not.
 *
 * Nothing here is stored or put in the URL: the registry marks this tool
 * sensitive, and the input is by definition a file full of credentials.
 */

export type Entry = { key: string; value: string; quoted: 'none' | 'single' | 'double' };

export type Problem = { line: number; message: string };

export type ParseResult = { entries: Entry[]; problems: Problem[] };

/** Lines read before the parser gives up. A .env is not a data file. */
export const MAX_LINES = 20_000;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Compose and Kubernetes accept dots and dashes in names that a shell cannot. */
const LOOSE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function decodeDouble(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\') {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      out += '\\';
      continue;
    }
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '\\' || next === '"' || next === '$' || next === "'") out += next;
    // An unknown escape keeps both characters: guessing would quietly change
    // a value such as a Windows path.
    else out += `\\${next}`;
    i += 1;
  }
  return out;
}

/** Reads a .env document. Never throws: problems are collected and reported. */
export function parseDotenv(text: string): ParseResult {
  const entries: Entry[] = [];
  const problems: Problem[] = [];
  const seen = new Map<string, number>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > MAX_LINES) {
    return { entries: [], problems: [{ line: 1, message: `more than ${MAX_LINES} lines` }] };
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq === -1) {
      problems.push({ line: i + 1, message: `no '=' on this line: ${withoutExport.slice(0, 40)}` });
      continue;
    }

    const key = withoutExport.slice(0, eq).trim();
    if (!LOOSE_KEY_PATTERN.test(key)) {
      problems.push({ line: i + 1, message: `not a usable variable name: ${key.slice(0, 40)}` });
      continue;
    }
    if (!KEY_PATTERN.test(key)) {
      problems.push({ line: i + 1, message: `${key} holds . or -, which a shell cannot export` });
    }

    const rest = withoutExport.slice(eq + 1);
    const first = rest.trimStart()[0];
    let value: string;
    let quoted: Entry['quoted'] = 'none';

    if (first === '"' || first === "'") {
      const offset = rest.indexOf(first);
      let body = rest.slice(offset + 1);
      let closed = false;
      // A quoted value may run over several lines; consume them until the
      // closing quote, so a PEM key or a JSON blob survives intact.
      for (;;) {
        let cursor = 0;
        let collected = '';
        while (cursor < body.length) {
          if (first === '"' && body[cursor] === '\\' && cursor + 1 < body.length) {
            collected += body.slice(cursor, cursor + 2);
            cursor += 2;
            continue;
          }
          if (body[cursor] === first) {
            closed = true;
            break;
          }
          collected += body[cursor];
          cursor += 1;
        }
        if (closed) {
          value = first === '"' ? decodeDouble(collected) : collected;
          quoted = first === '"' ? 'double' : 'single';
          break;
        }
        if (i + 1 >= lines.length) {
          problems.push({ line: i + 1, message: `unclosed ${first === '"' ? 'double' : 'single'} quote` });
          value = first === '"' ? decodeDouble(collected) : collected;
          quoted = first === '"' ? 'double' : 'single';
          break;
        }
        i += 1;
        body = `${collected}\n${lines[i]}`;
      }
    } else {
      // Unquoted: an inline comment needs whitespace before the '#', so a
      // value such as a colour or a URL fragment is not truncated.
      const commented = rest.replace(/\s+#.*$/, '');
      value = commented.trim();
    }

    const previous = seen.get(key);
    if (previous !== undefined) {
      problems.push({ line: i + 1, message: `${key} was already set on line ${previous}; the later value wins` });
      entries[entries.findIndex((entry) => entry.key === key)] = { key, value: value!, quoted };
      seen.set(key, i + 1);
      continue;
    }
    seen.set(key, i + 1);
    entries.push({ key, value: value!, quoted });
  }

  return { entries, problems };
}

/* ── Other input formats ──────────────────── */

/** Flattens a JSON object to entries. Nested values are JSON-encoded. */
export function parseJsonEnv(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return { entries: [], problems: [{ line: 1, message: error instanceof Error ? error.message : String(error) }] };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { entries: [], problems: [{ line: 1, message: 'expected a JSON object of name → value' }] };
  }
  const entries: Entry[] = [];
  const problems: Problem[] = [];
  for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
    if (!LOOSE_KEY_PATTERN.test(key)) {
      problems.push({ line: 1, message: `not a usable variable name: ${key.slice(0, 40)}` });
      continue;
    }
    if (member === null) {
      entries.push({ key, value: '', quoted: 'none' });
      continue;
    }
    if (typeof member === 'object') {
      // An environment is flat strings. Keeping the JSON text is lossless and
      // says what happened, which inventing `A_B` keys would not.
      problems.push({ line: 1, message: `${key} is not a scalar; kept as JSON text` });
      entries.push({ key, value: JSON.stringify(member) ?? '', quoted: 'none' });
      continue;
    }
    entries.push({ key, value: String(member), quoted: 'none' });
  }
  return { entries, problems };
}

/**
 * The flat mapping a compose `environment:` block is, in either style.
 *
 * Deliberately not a YAML parser: it reads `KEY: value` and `- KEY=value`
 * lines, skips an `environment:` header, and says so on anything else.
 */
export function parseYamlEnv(text: string): ParseResult {
  const entries: Entry[] = [];
  const problems: Problem[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#') || line === '---') continue;
    if (/^environment:\s*$/.test(line)) continue;

    if (line.startsWith('- ') || line.startsWith('-')) {
      const item = line.replace(/^-\s*/, '');
      const eq = item.indexOf('=');
      if (eq === -1) {
        // `- KEY` with no value means "take it from the host environment".
        const key = stripYamlQuotes(item);
        if (LOOSE_KEY_PATTERN.test(key)) entries.push({ key, value: '', quoted: 'none' });
        else problems.push({ line: i + 1, message: `cannot read this list item: ${item.slice(0, 40)}` });
        continue;
      }
      const key = stripYamlQuotes(item.slice(0, eq).trim());
      const value = stripYamlQuotes(item.slice(eq + 1).trim());
      if (!LOOSE_KEY_PATTERN.test(key)) {
        problems.push({ line: i + 1, message: `not a usable variable name: ${key.slice(0, 40)}` });
        continue;
      }
      entries.push({ key, value, quoted: 'none' });
      continue;
    }

    const colon = line.indexOf(':');
    if (colon === -1) {
      problems.push({ line: i + 1, message: `expected 'KEY: value' or '- KEY=value': ${line.slice(0, 40)}` });
      continue;
    }
    const key = stripYamlQuotes(line.slice(0, colon).trim());
    const value = stripYamlQuotes(line.slice(colon + 1).trim());
    if (!LOOSE_KEY_PATTERN.test(key)) {
      problems.push({ line: i + 1, message: `not a usable variable name: ${key.slice(0, 40)}` });
      continue;
    }
    if (value === '|' || value === '>' || value.startsWith('&') || value.startsWith('*')) {
      problems.push({ line: i + 1, message: `${key}: block scalars and anchors are not read here` });
      continue;
    }
    entries.push({ key, value, quoted: 'none' });
  }
  return { entries, problems };
}

function stripYamlQuotes(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return decodeDouble(raw.slice(1, -1));
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

export type From = 'env' | 'json' | 'yaml';

export function parseAny(text: string, from: From): ParseResult {
  if (from === 'json') return parseJsonEnv(text);
  if (from === 'yaml') return parseYamlEnv(text);
  return parseDotenv(text);
}

/* ── Output formats ───────────────────────── */

export type To = 'env' | 'json' | 'yaml' | 'compose-map' | 'compose-list' | 'shell';

export type Quoting = 'auto' | 'always' | 'never';

/** Unquoted .env values cannot hold these without changing meaning. */
export function needsEnvQuotes(value: string): boolean {
  if (value === '') return false;
  if (/^\s|\s$/.test(value)) return true;
  return /[\s#'"$`\\]|[\n\r]/.test(value);
}

function envValue(value: string, quoting: Quoting): string {
  if (quoting === 'never') return value;
  if (quoting === 'auto' && !needsEnvQuotes(value)) return value;
  // Single quotes are the literal form: a value holding `$HOME` or a backslash
  // survives whatever loads the file. Only a value containing a single quote
  // itself has to take the escaping form.
  if (!value.includes("'") && !value.includes('\n')) return `'${value}'`;
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/** POSIX single-quote escaping: the only form with no special characters left. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** YAML scalars that must be quoted, including the ones that look like other types. */
export function needsYamlQuotes(value: string): boolean {
  if (value === '') return true;
  if (/^[\s]|[\s]$/.test(value)) return true;
  if (/[:#{}[\]&*!|>%@`'"\n\r\t,]/.test(value)) return true;
  if (/^[-?]/.test(value)) return true;
  // A value YAML would read back as a number, a boolean, a date or null has to
  // be quoted, or the file no longer holds a string.
  if (/^(true|false|yes|no|on|off|null|~)$/i.test(value)) return true;
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value)) return true;
  if (/^0[xob]/i.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
  return false;
}

function yamlValue(value: string): string {
  if (!needsYamlQuotes(value)) return value;
  // Double quotes with escapes: the single-quoted YAML form cannot carry a
  // newline, and these values often do (a PEM key, a JSON blob).
  return JSON.stringify(value);
}

export type EmitOptions = { quoting: Quoting; exportPrefix: boolean; indent: number; sort: boolean };

export const DEFAULT_EMIT: EmitOptions = { quoting: 'auto', exportPrefix: false, indent: 2, sort: false };

export function emit(entries: readonly Entry[], to: To, options: EmitOptions = DEFAULT_EMIT): string {
  const rows = options.sort ? [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) : entries;
  const pad = ' '.repeat(Math.max(0, options.indent));

  switch (to) {
    case 'env':
      return rows
        .map((entry) => `${options.exportPrefix ? 'export ' : ''}${entry.key}=${envValue(entry.value, options.quoting)}`)
        .join('\n');
    case 'shell':
      return rows.map((entry) => `export ${entry.key}=${shellQuote(entry.value)}`).join('\n');
    case 'json':
      return JSON.stringify(
        Object.fromEntries(rows.map((entry) => [entry.key, entry.value])),
        null,
        options.indent === 0 ? undefined : options.indent
      );
    case 'yaml':
      return rows.map((entry) => `${entry.key}: ${yamlValue(entry.value)}`).join('\n');
    case 'compose-map':
      return ['environment:', ...rows.map((entry) => `${pad}${entry.key}: ${yamlValue(entry.value)}`)].join('\n');
    case 'compose-list':
      return [
        'environment:',
        ...rows.map((entry) => `${pad}- ${yamlValue(`${entry.key}=${entry.value}`)}`),
      ].join('\n');
  }
}

/* ── Readout facts ────────────────────────── */

export type Facts = {
  count: number;
  empty: number;
  multiline: number;
  withDollar: number;
  longest: number;
  bytes: number;
};

export function factsFor(entries: readonly Entry[]): Facts {
  let empty = 0;
  let multiline = 0;
  let withDollar = 0;
  let longest = 0;
  let size = 0;
  for (const entry of entries) {
    if (entry.value === '') empty += 1;
    if (entry.value.includes('\n')) multiline += 1;
    if (entry.value.includes('$')) withDollar += 1;
    longest = Math.max(longest, entry.value.length);
    size += entry.key.length + entry.value.length + 2;
  }
  return { count: entries.length, empty, multiline, withDollar, longest, bytes: size };
}

/** Parse then emit, for the single call the component makes. */
export function convert(text: string, from: From, to: To, options: EmitOptions = DEFAULT_EMIT): {
  output: string;
  entries: Entry[];
  problems: Problem[];
} {
  const { entries, problems } = parseAny(text, from);
  return { output: emit(entries, to, options), entries, problems };
}
