/**
 * Indented list <-> box-drawing tree, both directions.
 *
 * The forward direction is the easy half: read indentation, build a tree, print
 * connectors. The reverse half is the one that decides whether this tool is
 * useful, because trees in the wild come from `tree`, from `exa --tree`, from
 * Markdown fences someone hand-edited, and from Windows `tree /f`. They differ
 * in charset (`├──` vs `|--` vs `` `-- ``), in column width (2, 3 and 4 all
 * occur), and in whether directories carry a trailing slash.
 *
 * So the parser infers the column width from the drawing instead of assuming
 * four, and refuses anything it cannot account for: a misaligned connector or a
 * depth that jumps two levels is reported with its line number rather than
 * silently reparented. A tree that is quietly restructured is worse than an
 * error message — you would paste it into a README and never notice.
 *
 * One thing is genuinely not recoverable: an *empty* directory in an indented
 * list is indistinguishable from a file. Mark it with a trailing slash (or use
 * the `[D]`/`[F]` prefixes) and both directions round-trip; otherwise a leaf is
 * treated as a file. That limit is stated in the UI, not hidden here.
 */

export type Node = { name: string; isDir: boolean; children: Node[] };

export type Charset = 'unicode' | 'ascii';

/** How a node's kind is written: not at all, a trailing slash, or `[D]`/`[F]`. */
export type Marker = 'none' | 'slash' | 'ascii';

export type Parsed = { roots: Node[]; unit: number };

export type RenderOptions = { indent?: number; charset?: Charset; marker?: Marker };

export type IndentOptions = { indent?: number; marker?: Marker };

/** Ceilings. A paste box is a place where people try a 200k-line `tree` dump. */
export const MAX_LINES = 5000;
export const MAX_DEPTH = 40;
export const MIN_INDENT = 2;
export const MAX_INDENT = 8;

export type ErrorCode =
  | 'too-many-lines'
  | 'root-indented'
  | 'indent-misaligned'
  | 'indent-jump'
  | 'too-deep'
  | 'unknown-prefix'
  | 'bad-indent-width';

/**
 * Carries a machine-readable code plus the offending line, so the UI can write
 * the message in the reader's language instead of surfacing English from here.
 */
export class TreeError extends Error {
  /** Declared and assigned separately: Node's type-stripping test runner
   *  rejects TypeScript parameter properties. */
  readonly code: ErrorCode;
  readonly line: number;
  readonly detail: number;

  constructor(code: ErrorCode, line: number, detail = 0) {
    super(`${code} at line ${line} (${detail})`);
    this.name = 'TreeError';
    this.code = code;
    this.line = line;
    this.detail = detail;
  }
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Tab -> spaces at real tab stops, so a mixed-indent paste still lines up. */
function expandTabs(line: string, tabWidth: number): string {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(tabWidth - (out.length % tabWidth));
    else out += ch;
  }
  return out;
}

function leading(line: string): number {
  return line.length - line.trimStart().length;
}

/** Reads a name and its kind off one label, accepting either marker style. */
function stripLabel(text: string): { name: string; isDir: boolean } {
  let name = text.trim();
  let isDir = false;

  const tag = /^\[([DdFf])\]\s*/.exec(name);
  if (tag) {
    isDir = tag[1].toLowerCase() === 'd';
    name = name.slice(tag[0].length).trim();
  }
  // A trailing slash is the conventional directory mark; `/` alone is a name.
  while (name.length > 1 && (name.endsWith('/') || name.endsWith('\\'))) {
    name = name.slice(0, -1);
    isDir = true;
  }
  if (name === '/' || name === '\\') isDir = true;

  return { name, isDir };
}

function label(node: Node, marker: Marker): string {
  const name = node.name;
  if (marker === 'ascii') return `${node.isDir ? '[D]' : '[F]'} ${name}`;
  if (marker === 'slash' && node.isDir && !name.endsWith('/')) return `${name}/`;
  return name;
}

type Row = { depth: number; name: string; isDir: boolean; line: number };

/** Rows -> forest, with the two structural errors that cannot be guessed away. */
function build(rows: readonly Row[]): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  let previous = -1;

  for (const row of rows) {
    if (previous < 0 && row.depth !== 0) throw new TreeError('root-indented', row.line, row.depth);
    if (row.depth > previous + 1) throw new TreeError('indent-jump', row.line, row.depth);
    if (row.depth >= MAX_DEPTH) throw new TreeError('too-deep', row.line, row.depth);

    const node: Node = { name: row.name, isDir: row.isDir, children: [] };
    stack.length = row.depth;
    if (row.depth === 0) {
      roots.push(node);
    } else {
      const parent = stack[row.depth - 1];
      parent.children.push(node);
      // Having children settles it, whatever the label said.
      parent.isDir = true;
    }
    stack.push(node);
    previous = row.depth;
  }

  return roots;
}

/**
 * Indented list -> forest. The indent unit is the smallest non-zero indent in
 * the text, so two-space and four-space lists both work without a setting; an
 * indent that is not a multiple of it is an error naming the line.
 */
export function parseIndented(text: string, options: { tabWidth?: number } = {}): Parsed {
  const asked = Math.trunc(options.tabWidth ?? 4);
  const tabWidth = Number.isInteger(asked) ? Math.min(16, Math.max(1, asked)) : 4;
  const lines = splitLines(text);
  if (lines.length > MAX_LINES) throw new TreeError('too-many-lines', lines.length, lines.length);

  const raw: { indent: number; text: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const expanded = expandTabs(line, tabWidth);
    if (expanded.trim() === '') return;
    raw.push({ indent: leading(expanded), text: expanded, line: index + 1 });
  });
  if (raw.length === 0) return { roots: [], unit: 0 };

  // A list copied out of a Markdown block often carries a common indent on
  // every line. That is not structure, so it comes off before anything else.
  let common = Number.POSITIVE_INFINITY;
  for (const row of raw) common = Math.min(common, row.indent);
  if (common > 0) for (const row of raw) row.indent -= common;
  if (raw[0].indent !== 0) throw new TreeError('root-indented', raw[0].line, raw[0].indent);

  let unit = 0;
  for (const row of raw) {
    if (row.indent > 0 && (unit === 0 || row.indent < unit)) unit = row.indent;
  }

  const rows = raw.map((row) => {
    if (unit > 0 && row.indent % unit !== 0) {
      throw new TreeError('indent-misaligned', row.line, row.indent);
    }
    const parsed = stripLabel(row.text);
    return {
      depth: unit === 0 ? 0 : row.indent / unit,
      name: parsed.name,
      isDir: parsed.isDir,
      line: row.line,
    };
  });

  return { roots: build(rows), unit: unit || 2 };
}

/* ── Reading a drawing back ────────────────── */

const VERTICAL = new Set(['│', '┃', '║', '|', '¦']);
const ARM = new Set(['─', '━', '═', '╴', '-', '=', '–', '—']);
/** Connectors that no filename starts with, so they need no lookahead. */
const BRANCH = new Set(['├', '└', '┣', '┗', '╠', '╚', '┠']);

/**
 * Column of the branch connector, or -1 when the line is a bare root name.
 *
 * The ambiguous characters get a lookahead: `|` is a carried-down vertical
 * unless an arm follows it, and `+`, `` ` `` and `\` are only connectors when
 * an arm follows — `+page.svelte` is a real filename.
 */
function connectorAt(line: string): number {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === ' ') continue;
    const next = line[i + 1];
    if (ch === '|' || ch === '¦' || ch === '║') {
      if (next !== undefined && ARM.has(next)) return i;
      continue;
    }
    if (VERTICAL.has(ch)) continue;
    if (BRANCH.has(ch)) return i;
    if (ch === '+' || ch === '`' || ch === '\\') {
      return next !== undefined && ARM.has(next) ? i : -1;
    }
    return -1;
  }
  return -1;
}

/** Where the name starts after a connector: skip arm characters, then padding. */
function nameStart(line: string, connector: number): number {
  let i = connector + 1;
  while (i < line.length && ARM.has(line[i])) i += 1;
  while (i < line.length && line[i] === ' ') i += 1;
  return i;
}

/**
 * Drawing -> forest. The column width is inferred from the shallowest indented
 * connector; anything that is not a whole number of those columns, and any
 * indented line with no connector at all, is rejected with its line number.
 */
export function parseTreeDrawing(text: string): Parsed {
  const lines = splitLines(text);
  if (lines.length > MAX_LINES) throw new TreeError('too-many-lines', lines.length, lines.length);

  const raw: { col: number; text: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const expanded = expandTabs(line, 4);
    if (expanded.trim() === '') return;
    const col = connectorAt(expanded);
    if (col < 0) {
      const head = expanded.trimStart()[0];
      // No connector: only a flush-left plain name can be a root. Leading
      // space, or a stray glyph, means the drawing is not one we can account for.
      if (leading(expanded) > 0 || VERTICAL.has(head) || ARM.has(head) || head === '`') {
        throw new TreeError('unknown-prefix', index + 1, leading(expanded));
      }
    }
    raw.push({ col, text: expanded, line: index + 1 });
  });
  if (raw.length === 0) return { roots: [], unit: 0 };

  /*
   * Column width, in order of trust:
   *
   *  1. The connector's own width — `├── ` is four columns and says so. When
   *     every connector in the drawing is the same width, that IS the unit, and
   *     a connector sitting between two columns is then a real error rather than
   *     a hint to re-measure. This is what stops a hand-broken tree from being
   *     silently reparented.
   *  2. Otherwise (padding differs line to line, so widths disagree) the
   *     shallowest indented connector, which is the classic measurement.
   */
  let common = -1;
  let mixed = false;
  let shallowestCol = 0;
  for (const row of raw) {
    if (row.col < 0) continue;
    if (row.col > 0 && (shallowestCol === 0 || row.col < shallowestCol)) shallowestCol = row.col;
    const width = nameStart(row.text, row.col) - row.col;
    if (common < 0) common = width;
    else if (common !== width) mixed = true;
  }
  let unit = !mixed && common >= MIN_INDENT ? common : shallowestCol;
  if (unit < MIN_INDENT) unit = 4;

  const rows = raw.map((row) => {
    if (row.col < 0) {
      const parsed = stripLabel(row.text);
      return { depth: 0, name: parsed.name, isDir: parsed.isDir, line: row.line };
    }
    if (row.col % unit !== 0) throw new TreeError('indent-misaligned', row.line, row.col);
    const parsed = stripLabel(row.text.slice(nameStart(row.text, row.col)));
    return {
      depth: row.col / unit + 1,
      name: parsed.name,
      isDir: parsed.isDir,
      line: row.line,
    };
  });

  // A fragment pasted without its root line starts at depth 1. Lifting the
  // whole forest is the only reading of it; refusing it would be pedantry.
  let shallowest = MAX_DEPTH;
  for (const row of rows) shallowest = Math.min(shallowest, row.depth);
  if (shallowest > 0) for (const row of rows) row.depth -= shallowest;

  return { roots: build(rows), unit };
}

/* ── Writing ───────────────────────────────── */

/**
 * Forest -> drawing. `indent` is the total column width of one level, counted
 * the way `tree` counts it: `├── ` is four. ASCII needs at least three, because
 * a `|` with no arm after it reads as a vertical bar on the way back in.
 */
export function renderTree(roots: readonly Node[], options: RenderOptions = {}): string {
  const indent = Math.trunc(options.indent ?? 4);
  const charset: Charset = options.charset ?? 'unicode';
  const marker: Marker = options.marker ?? 'none';
  if (!Number.isInteger(indent) || indent < MIN_INDENT || indent > MAX_INDENT) {
    throw new TreeError('bad-indent-width', 0, indent);
  }
  if (charset === 'ascii' && indent < 3) throw new TreeError('bad-indent-width', 0, indent);

  const tee = charset === 'ascii' ? '|' : '├';
  const ell = charset === 'ascii' ? '`' : '└';
  const bar = charset === 'ascii' ? '|' : '│';
  const arm = (charset === 'ascii' ? '-' : '─').repeat(indent - 2) + ' ';
  const pipe = bar + ' '.repeat(indent - 1);
  const gap = ' '.repeat(indent);

  const out: string[] = [];
  const walk = (nodes: readonly Node[], prefix: string, depth: number) => {
    if (depth > MAX_DEPTH) throw new TreeError('too-deep', 0, depth);
    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1;
      out.push(prefix + (last ? ell : tee) + arm + label(node, marker));
      if (node.children.length > 0) walk(node.children, prefix + (last ? gap : pipe), depth + 1);
    });
  };

  for (const root of roots) {
    out.push(label(root, marker));
    walk(root.children, '', 1);
  }
  return out.join('\n');
}

/** Forest -> indented list. Slash marking is the default so kinds survive. */
export function toIndented(roots: readonly Node[], options: IndentOptions = {}): string {
  const indent = Math.trunc(options.indent ?? 2);
  if (!Number.isInteger(indent) || indent < 1 || indent > MAX_INDENT) {
    throw new TreeError('bad-indent-width', 0, indent);
  }
  const marker: Marker = options.marker ?? 'slash';

  const out: string[] = [];
  const walk = (nodes: readonly Node[], depth: number) => {
    if (depth > MAX_DEPTH) throw new TreeError('too-deep', 0, depth);
    for (const node of nodes) {
      out.push(' '.repeat(indent * depth) + label(node, marker));
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out.join('\n');
}

/* ── Readings ──────────────────────────────── */

export function countNodes(roots: readonly Node[]): {
  total: number;
  dirs: number;
  files: number;
  depth: number;
} {
  let total = 0;
  let dirs = 0;
  let files = 0;
  let depth = 0;

  const walk = (nodes: readonly Node[], level: number) => {
    if (nodes.length > 0 && level > depth) depth = level;
    for (const node of nodes) {
      total += 1;
      if (node.isDir) dirs += 1;
      else files += 1;
      walk(node.children, level + 1);
    }
  };
  walk(roots, 1);

  return { total, dirs, files, depth };
}

/** Cheap sniff so the UI can say "this already looks like a drawing". */
export function looksLikeTree(text: string): boolean {
  return /[│┃├└┣┗║╠╚]/.test(text)
    || /(^|\n)[ \t]*[|`+\\][-=]/.test(text);
}
