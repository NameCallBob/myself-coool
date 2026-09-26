/**
 * CSV / TSV reading, then the handful of operations you actually want on a
 * pasted table: sort, pick columns, transpose, dedupe, filter, summarise.
 *
 * Two decisions shape this file.
 *
 * The parser is a character loop rather than a `split`, because every real CSV
 * eventually contains a quoted field with a delimiter or a line break in it, and
 * a split-based reader corrupts exactly those rows — silently, in the middle of
 * a wide file, where nobody looks.
 *
 * `parseRows` is deliberately written as one self-contained function with no
 * imports and no references to anything outside itself. That is what lets the
 * same code run inside a Worker: `workerSource()` stringifies this very
 * function, so the main thread and the Worker can never drift apart the way two
 * hand-kept copies would.
 */

/** Rows read before the parser gives up, passed in so the parser is closure-free. */
export const MAX_ROWS = 500_000;
/** Cells read before the parser gives up. */
export const MAX_CELLS = 5_000_000;
/** Above this many characters the main thread hands the work to a Worker. */
export const WORKER_THRESHOLD = 400_000;

/**
 * RFC 4180 reader. Self-contained on purpose — see the note above.
 *
 * Doubled quotes are an escaped quote, a quoted field may hold the delimiter
 * and line breaks, and CRLF, CR and LF all end a row.
 */
export function parseRows(text: string, delimiter: string, maxRows: number, maxCells: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  let cells = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
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
      row.push(field);
      field = '';
      started = false;
      cells += 1;
      if (cells > maxCells) throw new Error('too many cells');
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i += 1;
      row.push(field);
      field = '';
      started = false;
      cells += 1;
      if (cells > maxCells) throw new Error('too many cells');
      rows.push(row);
      row = [];
      if (rows.length > maxRows) throw new Error('too many rows');
      continue;
    }
    field += ch;
    started = true;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing newline must not add a row holding one empty cell.
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }
  return rows;
}

/**
 * Worker source: the parser above, stringified.
 *
 * The body is code from this module, never anything the user typed — the text
 * and the delimiter cross as structured-cloned data.
 */
export function workerSource(): string {
  return [
    `const parseRows = ${parseRows.toString()};`,
    'onmessage = function (event) {',
    '  try {',
    '    const data = event.data;',
    '    postMessage({ value: parseRows(data.text, data.delimiter, data.maxRows, data.maxCells) });',
    '  } catch (error) {',
    '    postMessage({ error: error && error.message ? error.message : String(error) });',
    '  }',
    '};',
  ].join('\n');
}

/** Delimiters, with the name shown in the UI. */
export const DELIMITERS: { value: string; label: string }[] = [
  { value: ',', label: ',' },
  { value: '\t', label: 'tab' },
  { value: ';', label: ';' },
  { value: '|', label: '|' },
];

/** Picks the delimiter that splits the first few lines most consistently. */
export function detectDelimiter(text: string): string {
  const head = text
    .slice(0, 64_000)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, 6);
  if (head.length === 0) return ',';
  let best = ',';
  let bestScore = -1;
  for (const { value } of DELIMITERS) {
    const counts = head.map((line) => {
      let n = 0;
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
        if (!quoted && ch === value) n += 1;
      }
      return n;
    });
    if (counts[0] === 0) continue;
    const consistent = counts.every((n) => n === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0];
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return best;
}

export type Table = { columns: string[]; rows: string[][] };

/** Names the columns from the header row, or numbers them. Pads short rows. */
export function toTable(rows: readonly string[][], hasHeader: boolean): Table {
  if (rows.length === 0) return { columns: [], rows: [] };
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const columns =
    hasHeader
      ? Array.from({ length: width }, (_, index) => {
          const name = (rows[0][index] ?? '').trim();
          return name === '' ? `column_${index + 1}` : name;
        })
      : Array.from({ length: width }, (_, index) => `column_${index + 1}`);
  const body = (hasHeader ? rows.slice(1) : rows).map((row) =>
    row.length === width ? [...row] : Array.from({ length: width }, (_, index) => row[index] ?? '')
  );
  return { columns, rows: body };
}

/* ── Operations ───────────────────────────── */

/** Numbers, written the way spreadsheets write them. */
export function asNumber(raw: string): number | null {
  const text = raw.trim().replace(/,/g, '').replace(/^\+/, '');
  if (text === '') return null;
  const percent = text.endsWith('%');
  const body = percent ? text.slice(0, -1) : text;
  const negative = /^\(.*\)$/.test(body);
  const core = negative ? body.slice(1, -1) : body;
  if (!/^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(core)) return null;
  const value = Number(core) * (negative ? -1 : 1) * (percent ? 0.01 : 1);
  return Number.isFinite(value) ? value : null;
}

export type Direction = 'asc' | 'desc';

/**
 * Sorts by one column. Numeric where the whole column is numeric, otherwise by
 * locale-aware string order; blanks always sort last, in either direction,
 * because a blank is not a value and burying it is what a reader wants.
 */
export function sortRows(rows: readonly string[][], index: number, direction: Direction): string[][] {
  const values = rows.map((row) => row[index] ?? '');
  const numeric = values.some((value) => value.trim() !== '') &&
    values.every((value) => value.trim() === '' || asNumber(value) !== null);
  const sign = direction === 'asc' ? 1 : -1;
  // A copy with the original position kept, so equal keys stay in input order.
  return rows
    .map((row, position) => ({ row, position }))
    .sort((a, b) => {
      const left = a.row[index] ?? '';
      const right = b.row[index] ?? '';
      const leftBlank = left.trim() === '';
      const rightBlank = right.trim() === '';
      if (leftBlank || rightBlank) {
        if (leftBlank && rightBlank) return a.position - b.position;
        return leftBlank ? 1 : -1;
      }
      if (numeric) {
        const difference = (asNumber(left) ?? 0) - (asNumber(right) ?? 0);
        return difference === 0 ? a.position - b.position : sign * (difference < 0 ? -1 : 1);
      }
      const compared = left.localeCompare(right, 'zh-Hant-TW', { numeric: true });
      return compared === 0 ? a.position - b.position : sign * compared;
    })
    .map((entry) => entry.row);
}

export function selectColumns(table: Table, keep: readonly number[]): Table {
  const indexes = keep.filter((index) => index >= 0 && index < table.columns.length);
  return {
    columns: indexes.map((index) => table.columns[index]),
    rows: table.rows.map((row) => indexes.map((index) => row[index] ?? '')),
  };
}

/**
 * Turns rows into columns. The old column names become the first column, so
 * nothing is lost and transposing twice gets you back where you started.
 */
export function transpose(table: Table): Table {
  const width = table.rows.length;
  const columns = ['column', ...Array.from({ length: width }, (_, index) => `row_${index + 1}`)];
  const rows = table.columns.map((name, index) => [name, ...table.rows.map((row) => row[index] ?? '')]);
  return { columns, rows };
}

/** Drops later rows equal on the given columns (all of them when none given). */
export function dedupe(table: Table, on: readonly number[]): { table: Table; removed: number } {
  const indexes = on.length > 0 ? on : table.columns.map((_, index) => index);
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const row of table.rows) {
    // The separator cannot occur in a cell, so two different rows cannot
    // produce the same key.
    const key = indexes
      .map((index) => (row[index] ?? '').replace(/\u0000/g, ''))
      .join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return { table: { columns: table.columns, rows }, removed: table.rows.length - rows.length };
}

/** Case-insensitive substring match over every column, or one named column. */
export function filterRows(table: Table, query: string, column: number | null): Table {
  const needle = query.trim().toLowerCase();
  if (needle === '') return table;
  const rows = table.rows.filter((row) =>
    column === null
      ? row.some((cell) => cell.toLowerCase().includes(needle))
      : (row[column] ?? '').toLowerCase().includes(needle)
  );
  return { columns: table.columns, rows };
}

/* ── Column statistics ────────────────────── */

export type ColumnStats = {
  name: string;
  count: number;
  blank: number;
  distinct: number;
  numeric: number;
  /** Present only when at least one cell parsed as a number. */
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
  /** Shortest and longest text length, for non-numeric columns. */
  shortest?: number;
  longest?: number;
  /** The most frequent values, at most five. */
  top: { value: string; n: number }[];
};

/**
 * One column summarised.
 *
 * `numeric` is a count, not a verdict: a column of 998 numbers and 2 typos is
 * the interesting case, and reporting it as "not numeric" would hide the typos.
 */
export function columnStats(table: Table, index: number): ColumnStats {
  const name = table.columns[index] ?? `column_${index + 1}`;
  const counts = new Map<string, number>();
  const numbers: number[] = [];
  let blank = 0;
  let shortest = Number.POSITIVE_INFINITY;
  let longest = 0;

  for (const row of table.rows) {
    const cell = row[index] ?? '';
    if (cell.trim() === '') blank += 1;
    else {
      const value = asNumber(cell);
      if (value !== null) numbers.push(value);
      shortest = Math.min(shortest, cell.length);
      longest = Math.max(longest, cell.length);
    }
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }

  const stats: ColumnStats = {
    name,
    count: table.rows.length,
    blank,
    distinct: counts.size,
    numeric: numbers.length,
    top: [...counts.entries()]
      .filter(([value]) => value.trim() !== '')
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([value, n]) => ({ value, n })),
  };

  if (numbers.length > 0) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((total, value) => total + value, 0);
    const middle = Math.floor(sorted.length / 2);
    stats.min = sorted[0];
    stats.max = sorted[sorted.length - 1];
    stats.sum = sum;
    stats.mean = sum / numbers.length;
    stats.median =
      sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  if (Number.isFinite(shortest)) {
    stats.shortest = shortest;
    stats.longest = longest;
  }
  return stats;
}

/* ── Output ───────────────────────────────── */

export function toCsv(table: Table, delimiter = ','): string {
  const escape = (cell: string) =>
    cell.includes('"') || cell.includes('\n') || cell.includes('\r') || cell.includes(delimiter)
      ? `"${cell.replace(/"/g, '""')}"`
      : cell;
  return [table.columns, ...table.rows].map((row) => row.map(escape).join(delimiter)).join('\n');
}

export function toJson(table: Table, indent = 2): string {
  const rows = table.rows.map((row) =>
    Object.fromEntries(table.columns.map((column, index) => [column, row[index] ?? '']))
  );
  return JSON.stringify(rows, null, indent === 0 ? undefined : indent) ?? '[]';
}

/** GitHub-flavoured pipe table. Pipes in cells are escaped, not dropped. */
export function toMarkdown(table: Table): string {
  const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const header = `| ${table.columns.map(escape).join(' | ')} |`;
  const rule = `| ${table.columns.map(() => '---').join(' | ')} |`;
  const body = table.rows.map((row) => `| ${table.columns.map((_, index) => escape(row[index] ?? '')).join(' | ')} |`);
  return [header, rule, ...body].join('\n');
}

export function countCells(table: Table): number {
  return table.rows.length * table.columns.length;
}

/** Rows whose length differs from the header, which is usually a quoting bug. */
export function raggedRows(rows: readonly string[][]): number[] {
  if (rows.length === 0) return [];
  const width = rows[0].length;
  const out: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].length !== width) out.push(i + 1);
  }
  return out;
}
