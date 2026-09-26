/**
 * Table data ⇄ INSERT statements.
 *
 * The dangerous half of this job is quoting, so it is the half that is written
 * out explicitly and tested case by case. Two things follow from that:
 *
 *  - Escaping is per dialect. `'` doubles everywhere, but a backslash is an
 *    escape character in MySQL and an ordinary character in PostgreSQL with
 *    `standard_conforming_strings` on — one rule for both would produce
 *    statements that run and store the wrong bytes.
 *  - Parameterised output exists and is offered first, because generated
 *    literals are only safe as long as this code is right, while placeholders
 *    are safe by construction. The literal mode is for a migration file you are
 *    going to read; the parameter mode is for anything that runs.
 *
 * Type inference is deliberately timid. `007` stays a string, because a leading
 * zero means something wherever it appears, and a nineteen-digit number stays a
 * string too, because it does not survive a JavaScript double.
 */

export type Dialect = 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'ansi';

export type Table = { columns: string[]; rows: string[][] };

export type Problem = { message: string; row?: number };

/** Rows read before the parsers give up. */
export const MAX_ROWS = 100_000;
/** Cells read before the parsers give up. */
export const MAX_CELLS = 1_000_000;

export class TooMuchData extends Error {
  constructor(what: string) {
    super(`more than ${what}`);
    this.name = 'TooMuchData';
  }
}

/* ── Delimited input ──────────────────────── */

/** Picks the delimiter that yields the most consistent first two lines. */
export function detectDelimiter(text: string): string {
  const head = text.slice(0, 64_000).split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 5);
  if (head.length === 0) return ',';
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestScore = -1;
  for (const candidate of candidates) {
    const counts = head.map((line) => parseDelimitedLineCount(line, candidate));
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.every((n) => n === first);
    const score = (consistent ? 100 : 0) + first;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Delimiters outside quotes on one line. Used only for detection. */
function parseDelimitedLineCount(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) count += 1;
  }
  return count;
}

/**
 * RFC 4180 reader: doubled quotes, embedded newlines, CRLF or LF.
 *
 * A quoted field is taken literally, so a delimiter or a line break inside
 * quotes stays part of the value — which is the entire reason a CSV parser
 * cannot be a `split(',')`.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  let cells = 0;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
    cells += 1;
    if (cells > MAX_CELLS) throw new TooMuchData(`${MAX_CELLS} cells`);
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS) throw new TooMuchData(`${MAX_ROWS} rows`);
  };

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
      field += ch;
      continue;
    }
    if (ch === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
      continue;
    }
    if (ch === '\n') {
      endRow();
      continue;
    }
    field += ch;
    started = true;
  }

  if (field !== '' || row.length > 0) endRow();
  // A file ending in a newline must not produce a row of one empty cell.
  return rows.filter((entry, index) => !(index === rows.length - 1 && entry.length === 1 && entry[0] === ''));
}

export function tableFromDelimited(text: string, delimiter: string, hasHeader: boolean): Table {
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return { columns: [], rows: [] };
  if (!hasHeader) {
    const width = Math.max(...rows.map((row) => row.length));
    return { columns: Array.from({ length: width }, (_, i) => `column_${i + 1}`), rows };
  }
  const columns = rows[0].map((name, index) => (name.trim() === '' ? `column_${index + 1}` : name.trim()));
  return { columns, rows: rows.slice(1) };
}

/* ── JSON input ───────────────────────────── */

/** Marker for "this cell was absent", so it becomes NULL rather than ''. */
export const ABSENT = '\u0000absent\u0000';

/**
 * An array of objects (or of arrays) as a table.
 *
 * Column order follows first appearance across every row, not just the first
 * row — a record that carries an extra member would otherwise lose it.
 */
export function tableFromJson(text: string): { table: Table; problems: Problem[] } {
  const problems: Problem[] = [];
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return { table: { columns: [], rows: [] }, problems: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_ROWS) throw new TooMuchData(`${MAX_ROWS} rows`);

  if (list.every((item) => Array.isArray(item))) {
    const width = Math.max(0, ...list.map((item) => (item as unknown[]).length));
    return {
      table: {
        columns: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
        rows: list.map((item) => (item as unknown[]).map((cell) => cellText(cell, problems))),
      },
      problems,
    };
  }

  const columns: string[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      problems.push({ message: 'every element must be an object with the same shape' });
      continue;
    }
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const rows = list.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return columns.map(() => ABSENT);
    const record = item as Record<string, unknown>;
    return columns.map((key) =>
      Object.hasOwn(record, key) ? cellText(record[key], problems, index) : ABSENT
    );
  });
  return { table: { columns, rows }, problems };
}

function cellText(value: unknown, problems: Problem[], row?: number): string {
  if (value === null) return ABSENT;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Nested structures have no column type here; the JSON text is lossless and
  // is what a jsonb column wants anyway.
  problems.push({ message: 'a nested value was written as JSON text', row });
  return JSON.stringify(value) ?? '';
}

/* ── Quoting ──────────────────────────────── */

const RESERVED_SAFE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quotes an identifier the way the dialect does. Always quotes when unsure. */
export function quoteIdent(name: string, dialect: Dialect): string {
  const needsQuoting = !RESERVED_SAFE.test(name) || name !== name.toLowerCase();
  if (dialect === 'mysql') return needsQuoting ? `\`${name.replace(/`/g, '``')}\`` : name;
  if (dialect === 'mssql') return `[${name.replace(/]/g, ']]')}]`;
  return needsQuoting ? `"${name.replace(/"/g, '""')}"` : name;
}

/**
 * Quotes a string literal.
 *
 * MySQL treats a backslash as an escape character inside a literal, so one has
 * to be doubled there and left alone everywhere else. Getting this backwards
 * produces statements that run cleanly and store different text.
 */
export function quoteString(value: string, dialect: Dialect): string {
  if (dialect === 'mysql') {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\u0000/g, '\\0')
      .replace(/\u001a/g, '\\Z');
    return `'${escaped}'`;
  }
  const doubled = value.replace(/'/g, "''");
  if (dialect === 'mssql') {
    // N'' is what makes a literal nvarchar rather than a code-page varchar.
    const prefix = /[^\u0000-\u007f]/.test(value) ? 'N' : '';
    return `${prefix}'${doubled}'`;
  }
  return `'${doubled}'`;
}

/* ── Value typing ─────────────────────────── */

export type Typing = 'auto' | 'text';

export type SqlValue =
  | { kind: 'null' }
  | { kind: 'number'; text: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; text: string };

/** Digits that still round-trip through a double. */
const SAFE_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d{1,15})?([eE][+-]?\d{1,3})?$/;

/**
 * What a cell should become in SQL.
 *
 * `007` stays a string: a leading zero is never decoration, it is a postcode or
 * an account number. A number too long for a double stays a string as well,
 * because turning it into a numeric literal would change its value.
 */
export function inferValue(raw: string, typing: Typing, emptyIsNull: boolean): SqlValue {
  if (raw === ABSENT) return { kind: 'null' };
  if (typing === 'text') {
    if (raw === '' && emptyIsNull) return { kind: 'null' };
    return { kind: 'string', text: raw };
  }
  const trimmed = raw.trim();
  if (trimmed === '') return emptyIsNull ? { kind: 'null' } : { kind: 'string', text: raw };
  if (/^null$/i.test(trimmed)) return { kind: 'null' };
  if (/^true$/i.test(trimmed)) return { kind: 'boolean', value: true };
  if (/^false$/i.test(trimmed)) return { kind: 'boolean', value: false };
  if (SAFE_NUMBER.test(trimmed)) return { kind: 'number', text: trimmed };
  return { kind: 'string', text: raw };
}

export function renderValue(value: SqlValue, dialect: Dialect): string {
  switch (value.kind) {
    case 'null':
      return 'NULL';
    case 'number':
      return value.text;
    case 'boolean':
      // MySQL and SQL Server have no boolean literal; 1/0 is what they accept.
      if (dialect === 'mysql' || dialect === 'mssql' || dialect === 'sqlite') return value.value ? '1' : '0';
      return value.value ? 'TRUE' : 'FALSE';
    case 'string':
      return quoteString(value.text, dialect);
  }
}

/** The parameter placeholder for position `n` (1-based) in this dialect. */
export function placeholder(n: number, dialect: Dialect): string {
  if (dialect === 'postgres') return `$${n}`;
  if (dialect === 'mssql') return `@p${n}`;
  return '?';
}

/** The JSON value a placeholder stands for. */
export function parameterValue(value: SqlValue): string | number | boolean | null {
  if (value.kind === 'null') return null;
  if (value.kind === 'number') return Number(value.text);
  if (value.kind === 'boolean') return value.value;
  return value.text;
}

/* ── INSERT output ────────────────────────── */

export type Conflict = 'none' | 'ignore' | 'update';

export type EmitOptions = {
  table: string;
  dialect: Dialect;
  typing: Typing;
  emptyIsNull: boolean;
  /** Rows per statement. 1 gives one statement per row. */
  batch: number;
  parameterised: boolean;
  conflict: Conflict;
  /** Column used by `conflict: 'ignore' | 'update'`. */
  conflictKey: string;
  indent: number;
};

export const DEFAULT_EMIT: EmitOptions = {
  table: 'my_table',
  dialect: 'postgres',
  typing: 'auto',
  emptyIsNull: true,
  batch: 50,
  parameterised: false,
  conflict: 'none',
  conflictKey: 'id',
  indent: 2,
};

export type Insert = { sql: string; params: (string | number | boolean | null)[] };

function conflictClause(options: EmitOptions, columns: string[]): string {
  const { dialect, conflict, conflictKey } = options;
  if (conflict === 'none') return '';
  const key = quoteIdent(conflictKey, dialect);
  if (dialect === 'mysql') {
    if (conflict === 'ignore') return ''; // handled by INSERT IGNORE
    const assignments = columns
      .filter((column) => column !== conflictKey)
      .map((column) => `${quoteIdent(column, dialect)} = VALUES(${quoteIdent(column, dialect)})`)
      .join(', ');
    return assignments === '' ? '' : `\nON DUPLICATE KEY UPDATE ${assignments}`;
  }
  if (dialect === 'sqlite' || dialect === 'postgres') {
    if (conflict === 'ignore') return `\nON CONFLICT (${key}) DO NOTHING`;
    const assignments = columns
      .filter((column) => column !== conflictKey)
      .map((column) => `${quoteIdent(column, dialect)} = EXCLUDED.${quoteIdent(column, dialect)}`)
      .join(', ');
    return assignments === '' ? `\nON CONFLICT (${key}) DO NOTHING` : `\nON CONFLICT (${key}) DO UPDATE SET ${assignments}`;
  }
  // ANSI and SQL Server have no upsert of this shape; MERGE is a different
  // statement and generating one from a CSV would be guesswork.
  return '';
}

/** Builds INSERT statements. Every value is either a parameter or escaped. */
export function toInserts(table: Table, options: EmitOptions = DEFAULT_EMIT): { statements: Insert[]; problems: Problem[] } {
  const problems: Problem[] = [];
  if (table.columns.length === 0) return { statements: [], problems: [{ message: 'no columns' }] };
  const pad = ' '.repeat(Math.max(0, options.indent));
  const name = options.table.trim() === '' ? 'my_table' : options.table.trim();
  // A schema-qualified name is quoted a part at a time, so `public.orders`
  // does not become one identifier called `public.orders`.
  const qualified = name
    .split('.')
    .map((part) => quoteIdent(part, options.dialect))
    .join('.');
  const columnList = table.columns.map((column) => quoteIdent(column, options.dialect)).join(', ');
  const verb =
    options.dialect === 'mysql' && options.conflict === 'ignore' ? 'INSERT IGNORE INTO' : 'INSERT INTO';
  const tail = conflictClause(options, table.columns);

  const statements: Insert[] = [];
  const batch = Math.max(1, Math.floor(options.batch));

  for (let start = 0; start < table.rows.length; start += batch) {
    const slice = table.rows.slice(start, start + batch);
    const params: (string | number | boolean | null)[] = [];
    const tuples: string[] = [];

    slice.forEach((row, offset) => {
      if (row.length !== table.columns.length) {
        problems.push({
          message: `row has ${row.length} cells but there are ${table.columns.length} columns; missing cells became NULL`,
          row: start + offset + 1,
        });
      }
      const cells = table.columns.map((_, index) => {
        const raw = index < row.length ? row[index] : ABSENT;
        const value = inferValue(raw, options.typing, options.emptyIsNull);
        if (options.parameterised) {
          params.push(parameterValue(value));
          return placeholder(params.length, options.dialect);
        }
        if (value.kind === 'string' && value.text.includes('\u0000')) {
          problems.push({
            message: 'a value contains a NUL byte, which most engines refuse in text',
            row: start + offset + 1,
          });
        }
        return renderValue(value, options.dialect);
      });
      tuples.push(`(${cells.join(', ')})`);
    });

    const body =
      tuples.length === 1
        ? ` ${tuples[0]}`
        : `\n${tuples.map((tuple) => `${pad}${tuple}`).join(',\n')}`;
    statements.push({
      sql: `${verb} ${qualified} (${columnList})\nVALUES${body}${tail};`,
      params,
    });
  }

  return { statements, problems };
}

/** The statements as one document, with the parameters as a comment. */
export function insertsToText(statements: readonly Insert[], parameterised: boolean): string {
  return statements
    .map((statement) =>
      parameterised && statement.params.length > 0
        ? `${statement.sql}\n-- params: ${JSON.stringify(statement.params)}`
        : statement.sql
    )
    .join('\n\n');
}

/* ── INSERT input ─────────────────────────── */

type Lit = { kind: 'string' | 'number' | 'word' | 'punct'; text: string };

/** Literal-aware scanner, only as much SQL as an INSERT statement needs. */
export function scanSql(sql: string): Lit[] {
  const out: Lit[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ((ch === 'N' || ch === 'n' || ch === 'E' || ch === 'e') && sql[i + 1] === "'")) {
      const backslash = ch === 'E' || ch === 'e';
      let j = (ch === "'" ? i : i + 1) + 1;
      let text = '';
      let closed = false;
      while (j < sql.length) {
        if (backslash && sql[j] === '\\' && j + 1 < sql.length) {
          const code = sql[j + 1];
          text += code === 'n' ? '\n' : code === 't' ? '\t' : code === 'r' ? '\r' : code;
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            text += "'";
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        text += sql[j];
        j += 1;
      }
      if (!closed) throw new Error('unterminated string literal');
      out.push({ kind: 'string', text });
      i = j + 1;
      continue;
    }
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1;
      let text = '';
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (sql[j + 1] === close && close !== ']') {
            text += close;
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        text += sql[j];
        j += 1;
      }
      if (!closed) throw new Error('unterminated quoted identifier');
      out.push({ kind: 'word', text });
      i = j + 1;
      continue;
    }
    if (/[-\d.]/.test(ch) && /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.test(sql.slice(i))) {
      const match = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(sql.slice(i))!;
      out.push({ kind: 'number', text: match[0] });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_@$]/.test(ch)) {
      const match = /^[A-Za-z_@$][A-Za-z0-9_$.]*/.exec(sql.slice(i))!;
      out.push({ kind: 'word', text: match[0] });
      i += match[0].length;
      continue;
    }
    out.push({ kind: 'punct', text: ch });
    i += 1;
  }
  return out;
}

export type ParsedInserts = { tables: { table: string; data: Table }[]; problems: Problem[] };

/**
 * Reads pasted INSERT statements back into a table.
 *
 * Only INSERT is understood, and only its literal form: an expression such as
 * `now()` or `1 + 1` inside VALUES is kept as the text it was, because
 * evaluating it would mean implementing the engine.
 */
export function parseInserts(sql: string): ParsedInserts {
  const problems: Problem[] = [];
  let tokens: Lit[];
  try {
    tokens = scanSql(sql);
  } catch (error) {
    return { tables: [], problems: [{ message: error instanceof Error ? error.message : String(error) }] };
  }

  const tables: { table: string; data: Table }[] = [];
  let i = 0;
  const isWord = (index: number, word: string) =>
    tokens[index]?.kind === 'word' && tokens[index].text.toUpperCase() === word;

  while (i < tokens.length) {
    if (!isWord(i, 'INSERT') && !isWord(i, 'REPLACE')) {
      i += 1;
      continue;
    }
    let cursor = i + 1;
    while (cursor < tokens.length && !isWord(cursor, 'INTO')) {
      if (isWord(cursor, 'INSERT') || tokens[cursor].text === ';') break;
      cursor += 1;
    }
    if (!isWord(cursor, 'INTO')) {
      problems.push({ message: 'an INSERT without INTO was skipped' });
      i += 1;
      continue;
    }
    cursor += 1;
    const nameParts: string[] = [];
    while (cursor < tokens.length && (tokens[cursor].kind === 'word' || tokens[cursor].text === '.')) {
      if (tokens[cursor].kind === 'word') nameParts.push(tokens[cursor].text);
      cursor += 1;
      if (tokens[cursor]?.text !== '.') break;
      cursor += 1;
      if (tokens[cursor]?.kind === 'word') {
        nameParts.push(tokens[cursor].text);
        cursor += 1;
      }
      break;
    }
    const tableName = nameParts.join('.');

    const columns: string[] = [];
    if (tokens[cursor]?.text === '(') {
      cursor += 1;
      while (cursor < tokens.length && tokens[cursor].text !== ')') {
        if (tokens[cursor].kind === 'word' || tokens[cursor].kind === 'string') columns.push(tokens[cursor].text);
        cursor += 1;
      }
      cursor += 1;
    }

    if (!isWord(cursor, 'VALUES') && !isWord(cursor, 'VALUE')) {
      problems.push({ message: `INSERT INTO ${tableName || '?'} has no VALUES list and was skipped` });
      i = cursor;
      continue;
    }
    cursor += 1;

    const rows: string[][] = [];
    while (cursor < tokens.length && tokens[cursor].text === '(') {
      cursor += 1;
      const row: string[] = [];
      let depth = 0;
      let cell = '';
      let cellIsNull = false;
      const endCell = () => {
        row.push(cellIsNull ? ABSENT : cell);
        cell = '';
        cellIsNull = false;
      };
      while (cursor < tokens.length) {
        const token = tokens[cursor];
        if (token.text === '(' && token.kind === 'punct') depth += 1;
        if (token.kind === 'punct' && token.text === ')') {
          if (depth === 0) break;
          depth -= 1;
        }
        if (token.kind === 'punct' && token.text === ',' && depth === 0) {
          endCell();
          cursor += 1;
          continue;
        }
        if (token.kind === 'word' && token.text.toUpperCase() === 'NULL' && cell === '') {
          cellIsNull = true;
        } else {
          // Anything that is not a bare literal keeps its own text, spaces and
          // all, rather than being evaluated.
          cell += (cell === '' ? '' : ' ') + token.text;
        }
        cursor += 1;
      }
      endCell();
      rows.push(row);
      cursor += 1; // past ')'
      if (tokens[cursor]?.text === ',') {
        cursor += 1;
        continue;
      }
      break;
    }

    if (rows.length > MAX_ROWS) throw new TooMuchData(`${MAX_ROWS} rows`);
    const width = Math.max(columns.length, ...rows.map((row) => row.length));
    const names =
      columns.length > 0
        ? columns
        : Array.from({ length: width }, (_, index) => `column_${index + 1}`);
    if (columns.length > 0 && rows.some((row) => row.length !== columns.length)) {
      problems.push({ message: `a row in ${tableName} has a different number of values than columns` });
    }

    const existing = tables.find((entry) => entry.table === tableName && entry.data.columns.join() === names.join());
    if (existing) existing.data.rows.push(...rows);
    else tables.push({ table: tableName, data: { columns: names, rows } });

    i = cursor;
  }

  if (tables.length === 0 && problems.length === 0) {
    problems.push({ message: 'no INSERT statement found' });
  }
  return { tables, problems };
}

/* ── Table output ─────────────────────────── */

export function toCsv(table: Table, delimiter = ','): string {
  const escape = (cell: string) => {
    const text = cell === ABSENT ? '' : cell;
    return new RegExp(`["\\n\\r${delimiter === '\\' ? '\\\\' : delimiter}]`).test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };
  return [table.columns, ...table.rows].map((row) => row.map(escape).join(delimiter)).join('\n');
}

export function toJson(table: Table, typing: Typing, emptyIsNull: boolean, indent = 2): string {
  const rows = table.rows.map((row) =>
    Object.fromEntries(
      table.columns.map((column, index) => {
        const value = inferValue(index < row.length ? row[index] : ABSENT, typing, emptyIsNull);
        return [column, parameterValue(value)];
      })
    )
  );
  return JSON.stringify(rows, null, indent === 0 ? undefined : indent) ?? '[]';
}

export function countCells(table: Table): number {
  return table.rows.reduce((total, row) => total + row.length, 0);
}
