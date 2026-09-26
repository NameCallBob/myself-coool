/**
 * SQL formatter: a tokenizer plus a layout pass. Not a parser.
 *
 * Formatting SQL properly would mean parsing SQL, and SQL is not one language —
 * every engine has its own grammar for the interesting parts. A token-level
 * formatter is the honest compromise: it knows string literals, quoted
 * identifiers, comments and nesting, and it knows which words are clause
 * keywords. It does not know whether the query is valid, and it never rewrites
 * anything inside a literal or a comment.
 *
 * The consequence to be aware of: unrecognised dialect syntax comes out
 * indented oddly rather than wrongly executed. The output is always the same
 * tokens in the same order — only whitespace and keyword casing change.
 */

export type TokenKind =
  | 'word'
  | 'string'
  | 'ident'
  | 'number'
  | 'param'
  | 'operator'
  | 'punct'
  | 'lineComment'
  | 'blockComment';

export type Token = { kind: TokenKind; text: string };

/** Tokens read before the formatter gives up. */
export const MAX_TOKENS = 120_000;

export class SqlTooBig extends Error {
  constructor() {
    super(`more than ${MAX_TOKENS} tokens`);
    this.name = 'SqlTooBig';
  }
}

export class SqlUnterminated extends Error {
  readonly what: string;

  constructor(what: string) {
    super(`unterminated ${what}`);
    this.name = 'SqlUnterminated';
    this.what = what;
  }
}

/* ── Keywords ─────────────────────────────── */

/** Clause keywords that start a line. Longest match first, so 'GROUP BY' wins. */
export const CLAUSES: string[][] = [
  ['WITH', 'RECURSIVE'],
  ['SELECT', 'DISTINCT'],
  ['SELECT'],
  ['INSERT', 'INTO'],
  ['DELETE', 'FROM'],
  ['UPDATE'],
  ['FROM'],
  ['WHERE'],
  ['GROUP', 'BY'],
  ['HAVING'],
  ['ORDER', 'BY'],
  ['WINDOW'],
  ['LIMIT'],
  ['OFFSET'],
  ['FETCH', 'FIRST'],
  ['FETCH', 'NEXT'],
  ['UNION', 'ALL'],
  ['UNION'],
  ['INTERSECT'],
  ['EXCEPT'],
  ['VALUES'],
  ['SET'],
  ['RETURNING'],
  ['ON', 'CONFLICT'],
  ['ON', 'DUPLICATE', 'KEY', 'UPDATE'],
  ['CROSS', 'JOIN'],
  ['NATURAL', 'JOIN'],
  ['INNER', 'JOIN'],
  ['LEFT', 'OUTER', 'JOIN'],
  ['LEFT', 'JOIN'],
  ['RIGHT', 'OUTER', 'JOIN'],
  ['RIGHT', 'JOIN'],
  ['FULL', 'OUTER', 'JOIN'],
  ['FULL', 'JOIN'],
  ['LATERAL', 'JOIN'],
  ['JOIN'],
  ['CREATE', 'TABLE'],
  ['CREATE', 'OR', 'REPLACE', 'VIEW'],
  ['CREATE', 'VIEW'],
  ['CREATE', 'INDEX'],
  ['ALTER', 'TABLE'],
  ['DROP', 'TABLE'],
  ['TRUNCATE', 'TABLE'],
  ['GRANT'],
  ['REVOKE'],
  ['EXPLAIN'],
  ['ANALYZE'],
  ['BEGIN'],
  ['COMMIT'],
  ['ROLLBACK'],
];

/** Every word the casing option applies to. Identifiers are left alone. */
export const KEYWORDS = new Set<string>([
  'ADD', 'ALL', 'ALTER', 'ANALYZE', 'AND', 'ANY', 'AS', 'ASC', 'BEGIN', 'BETWEEN', 'BY', 'CASCADE',
  'CASE', 'CAST', 'CHECK', 'COLLATE', 'COLUMN', 'COMMIT', 'CONFLICT', 'CONSTRAINT', 'CREATE',
  'CROSS', 'CURRENT', 'DATABASE', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DO', 'DROP', 'DUPLICATE', 'ELSE',
  'END', 'ESCAPE', 'EXCEPT', 'EXCLUDED', 'EXISTS', 'EXPLAIN', 'FALSE', 'FETCH', 'FILTER', 'FIRST',
  'FOLLOWING', 'FOR', 'FOREIGN', 'FROM', 'FULL', 'GRANT', 'GROUP', 'HAVING', 'IF', 'ILIKE', 'IN',
  'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTERVAL', 'INTO', 'IS', 'JOIN', 'KEY', 'LAST',
  'LATERAL', 'LEFT', 'LIKE', 'LIMIT', 'MATERIALIZED', 'NATURAL', 'NEXT', 'NOT', 'NOTHING',
  'NULL', 'NULLS', 'OFFSET', 'ON', 'ONLY', 'OR', 'ORDER', 'OUTER', 'OVER', 'PARTITION',
  'PRECEDING', 'PRIMARY', 'RANGE', 'RECURSIVE', 'REFERENCES', 'RENAME', 'REPLACE', 'RESTRICT',
  'RETURNING', 'REVOKE', 'RIGHT', 'ROLLBACK', 'ROW', 'ROWS', 'SELECT', 'SET', 'SIMILAR', 'SOME',
  'TABLE', 'THEN', 'TIES', 'TO', 'TRUE', 'TRUNCATE', 'UNBOUNDED', 'UNION', 'UNIQUE', 'UPDATE',
  'USING', 'VALUES', 'VIEW', 'WHEN', 'WHERE', 'WINDOW', 'WITH', 'WITHIN', 'WITHOUT',
]);

/** Operators, longest first so `->>` is not read as `->` then `>`. */
const OPERATORS = [
  '->>', '#>>', '<<=', '>>=', '!~*', '~~*',
  '::', '->', '#>', '||', '<=', '>=', '<>', '!=', ':=', '=>', '**', '<<', '>>', '!~', '~*',
  '@>', '<@', '&&',
  '+', '-', '*', '/', '%', '=', '<', '>', '~', '!', '&', '|', '^', '#', '@',
];

/* ── Tokenizer ────────────────────────────── */

const SPACE = new Set([' ', '\t', '\n', '\r', '\f']);

/** Identifier characters, including the non-ASCII letters dialects allow. */
const IDENT_START = /^[A-Za-z_-￿]/;
const IDENT_WORD = /^[A-Za-z_-￿][A-Za-z0-9_$-￿]*/;

/**
 * Splits SQL into tokens. Throws on an unterminated literal or comment, because
 * guessing where one ends would move code into a string or the other way round.
 */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (kind: TokenKind, text: string) => {
    tokens.push({ kind, text });
    if (tokens.length > MAX_TOKENS) throw new SqlTooBig();
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (SPACE.has(ch)) {
      i += 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      push('lineComment', sql.slice(i, end === -1 ? sql.length : end));
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === '#' && (i === 0 || sql[i - 1] === '\n')) {
      // MySQL's other line comment, only at the start of a line so the
      // PostgreSQL `#>` operator is not mistaken for one.
      const end = sql.indexOf('\n', i);
      push('lineComment', sql.slice(i, end === -1 ? sql.length : end));
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new SqlUnterminated('block comment');
      push('blockComment', sql.slice(i, end + 2));
      i = end + 2;
      continue;
    }

    if (ch === "'" || (/[eEnNbBxX]/.test(ch) && sql[i + 1] === "'")) {
      // Prefixed literals: E'...' (escapes), N'...' (national), x'..' (binary).
      const open = ch === "'" ? i : i + 1;
      let j = open + 1;
      const backslashEscapes = ch === 'e' || ch === 'E';
      let closed = false;
      while (j < sql.length) {
        if (backslashEscapes && sql[j] === '\\' && j + 1 < sql.length) {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) throw new SqlUnterminated('string literal');
      push('string', sql.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (ch === '"' || ch === '`') {
      let j = i + 1;
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) throw new SqlUnterminated('quoted identifier');
      push('ident', sql.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (ch === '[' && /[A-Za-z_@#]/.test(sql[i + 1] ?? '')) {
      // T-SQL bracket identifier, only when it looks like a name so an array
      // subscript stays punctuation.
      const end = sql.indexOf(']', i + 1);
      if (end !== -1) {
        push('ident', sql.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    if (ch === '$' && /^\$[A-Za-z_]*\$/.test(sql.slice(i))) {
      // PostgreSQL dollar quoting: $$ ... $$ or $tag$ ... $tag$.
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))![0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) throw new SqlUnterminated('dollar-quoted string');
      push('string', sql.slice(i, end + tag.length));
      i = end + tag.length;
      continue;
    }

    if (ch === '$' && /\d/.test(sql[i + 1] ?? '')) {
      const match = /^\$\d+/.exec(sql.slice(i))!;
      push('param', match[0]);
      i += match[0].length;
      continue;
    }
    if (ch === ':' || ch === '@') {
      const match = /^[:@][A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
      if (match) {
        push('param', match[0]);
        i += match[0].length;
        continue;
      }
    }
    if (ch === '?') {
      push('param', '?');
      i += 1;
      continue;
    }

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(sql[i + 1] ?? ''))) {
      const match = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/.exec(sql.slice(i));
      if (match) {
        push('number', match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (IDENT_START.test(ch)) {
      const match = IDENT_WORD.exec(sql.slice(i))!;
      push('word', match[0]);
      i += match[0].length;
      continue;
    }

    if ('(),;.'.includes(ch)) {
      push('punct', ch);
      i += 1;
      continue;
    }

    const operator = OPERATORS.find((candidate) => sql.startsWith(candidate, i));
    if (operator) {
      push('operator', operator);
      i += operator.length;
      continue;
    }

    // Anything else (a stray bracket, a symbol from a dialect not listed here)
    // passes through, so the output still contains everything the input did.
    push('operator', ch);
    i += 1;
  }

  return tokens;
}

/* ── Layout ───────────────────────────────── */

export type Casing = 'upper' | 'lower' | 'preserve';

export type Options = {
  casing: Casing;
  /** Spaces per level, or 0 for a tab. */
  indent: number;
  /** Clauses narrower than this stay on one line. */
  width: number;
  /** Put the comma before the next item instead of after the previous one. */
  commaFirst: boolean;
};

export const DEFAULTS: Options = { casing: 'upper', indent: 2, width: 76, commaFirst: false };

function cased(token: Token, casing: Casing): string {
  if (token.kind !== 'word') return token.text;
  if (casing === 'preserve') return token.text;
  if (!KEYWORDS.has(token.text.toUpperCase())) return token.text;
  return casing === 'upper' ? token.text.toUpperCase() : token.text.toLowerCase();
}

function isWord(token: Token | undefined, word: string): boolean {
  return token !== undefined && token.kind === 'word' && token.text.toUpperCase() === word;
}

/** Matching close paren for the open paren at `from`, or -1. */
function matchParen(tokens: readonly Token[], from: number): number {
  let depth = 0;
  for (let i = from; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind !== 'punct') continue;
    if (token.text === '(') depth += 1;
    else if (token.text === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The longest clause starting at `i`, as its list of words. */
function clauseAt(tokens: readonly Token[], i: number): string[] | null {
  for (const clause of CLAUSES) {
    if (clause.every((word, offset) => isWord(tokens[i + offset], word))) return clause;
  }
  return null;
}

/** Whether two adjacent tokens need a space between them. */
function spaceBetween(left: Token | undefined, right: Token): boolean {
  if (left === undefined) return false;
  if (right.kind === 'punct' && ',);.'.includes(right.text)) return false;
  if (left.kind === 'punct' && '(.'.includes(left.text)) return false;
  // Cast and JSON arrows are written tight, the way the dialects that have
  // them write them: `b::text`, `data->>'k'`.
  const TIGHT = new Set(['::', '->', '->>', '#>', '#>>']);
  if (left.kind === 'operator' && TIGHT.has(left.text)) return false;
  if (right.kind === 'operator' && TIGHT.has(right.text)) return false;
  if (right.kind === 'punct' && right.text === '(') {
    // `count(` is a call; `IN (` and `VALUES (` are clauses.
    if (left.kind === 'word' && !KEYWORDS.has(left.text.toUpperCase())) return false;
    if (left.kind === 'ident') return false;
  }
  return true;
}

/** Width of tokens rendered on one line, used to decide whether to break. */
function flatWidth(tokens: readonly Token[], from: number, to: number, options: Options): number {
  let width = 0;
  for (let i = from; i < to && i < tokens.length; i += 1) {
    const text = cased(tokens[i], options.casing);
    width += text.length + (i > from && spaceBetween(tokens[i - 1], tokens[i]) ? 1 : 0);
  }
  return width;
}

/** Clauses in which a parenthesis after a name is a column list, not a call. */
const COLUMN_LIST_CLAUSES = new Set(['INSERT INTO', 'CREATE TABLE', 'CREATE INDEX', 'ALTER TABLE', 'USING']);

type Frame = {
  /** Indent of the clause keywords inside this frame. */
  indent: number;
  /** Whether the frame lays out over several lines. */
  block: boolean;
  /** Indent for items separated by commas, AND or OR. */
  itemIndent: number;
  /** Whether the clause being laid out gives each item its own line. */
  clauseBlock: boolean;
  /** The clause in progress, e.g. 'INSERT INTO'. */
  clauseName: string;
};

/**
 * Lays out a token stream.
 *
 * One pass with a frame stack: a frame is a statement or a parenthesised group,
 * and each frame decides once whether it fits on a line. Deciding per frame
 * rather than per token is what keeps `count(*)` inline while a subquery of the
 * same length breaks open.
 */
export function layout(tokens: readonly Token[], options: Options = DEFAULTS): string {
  const unit = options.indent === 0 ? '\t' : ' '.repeat(options.indent);
  const step = options.indent === 0 ? 4 : options.indent;
  const lines: string[] = [];
  let line = '';
  let previous: Token | undefined;
  const frames: Frame[] = [{ indent: 0, block: true, itemIndent: 1, clauseBlock: false, clauseName: '' }];
  const caseIndents: number[] = [];

  const top = () => frames[frames.length - 1];
  const flush = () => {
    if (line.trim() !== '') lines.push(line.replace(/\s+$/, ''));
    line = '';
  };
  const newline = (level: number) => {
    flush();
    line = unit.repeat(Math.max(0, level));
  };
  const put = (text: string, token: Token) => {
    if (line.trim() === '') line += text;
    else line += (spaceBetween(previous, token) ? ' ' : '') + text;
    previous = token;
  };

  /** Where the current clause ends: the next clause keyword, `)` or `;`. */
  const clauseEnd = (from: number): number => {
    let depth = 0;
    for (let i = from; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.kind === 'punct') {
        if (token.text === '(') depth += 1;
        else if (token.text === ')') {
          if (depth === 0) return i;
          depth -= 1;
        } else if (token.text === ';' && depth === 0) return i;
      }
      if (depth === 0 && i > from && clauseAt(tokens, i)) return i;
    }
    return tokens.length;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const frame = top();

    if (token.kind === 'lineComment') {
      // A line comment swallows the rest of its line, so whatever follows has
      // to start a new one — otherwise the next token would be commented out.
      put(token.text, token);
      flush();
      line = unit.repeat(frame.clauseBlock ? frame.itemIndent : frame.indent);
      continue;
    }
    if (token.kind === 'blockComment') {
      put(token.text, token);
      continue;
    }

    if (token.kind === 'punct' && token.text === '(') {
      const close = matchParen(tokens, i);
      const inner = close === -1 ? tokens.length : close;
      let hasClause = false;
      let depth = 0;
      for (let j = i + 1; j < inner; j += 1) {
        if (tokens[j].kind === 'punct' && tokens[j].text === '(') depth += 1;
        else if (tokens[j].kind === 'punct' && tokens[j].text === ')') depth -= 1;
        else if (depth === 0 && clauseAt(tokens, j)) {
          hasClause = true;
          break;
        }
      }
      const block = hasClause || line.length + flatWidth(tokens, i, inner + 1, options) > options.width;
      // `INSERT INTO t (a, b)` — a column list is not a function call, so it
      // keeps the space that `count(` does not get.
      const columnList = COLUMN_LIST_CLAUSES.has(frame.clauseName) && previous !== undefined &&
        (previous.kind === 'word' || previous.kind === 'ident');
      if (columnList && line.trim() !== '') line += ' ';
      put('(', token);
      frames.push({
        indent: frame.indent + 1,
        block,
        itemIndent: frame.indent + 2,
        clauseBlock: false,
        clauseName: '',
      });
      if (block) newline(frame.indent + 1);
      continue;
    }

    if (token.kind === 'punct' && token.text === ')') {
      const closing = frames.length > 1 ? frames.pop()! : frame;
      if (closing.block) newline(top().indent);
      put(')', token);
      continue;
    }

    if (token.kind === 'punct' && token.text === ',') {
      if (options.commaFirst && frame.clauseBlock) {
        newline(frame.itemIndent);
        put(',', token);
        continue;
      }
      put(',', token);
      if (frame.clauseBlock) newline(frame.itemIndent);
      continue;
    }

    if (token.kind === 'punct' && token.text === ';') {
      put(';', token);
      flush();
      lines.push('');
      frames.length = 1;
      frames[0] = { indent: 0, block: true, itemIndent: 1, clauseBlock: false, clauseName: '' };
      caseIndents.length = 0;
      previous = undefined;
      continue;
    }

    const clause = frame.block ? clauseAt(tokens, i) : null;
    if (clause) {
      const end = clauseEnd(i + clause.length);
      const width = flatWidth(tokens, i, end, options) + frame.indent * step;
      // A CASE expression always breaks its clause open: leaving `SELECT CASE`
      // on one line and the branches under it reads as two different indents
      // for the same nesting level.
      let hasCase = false;
      let caseDepth = 0;
      for (let j = i + clause.length; j < end; j += 1) {
        if (tokens[j].kind === 'punct' && tokens[j].text === '(') caseDepth += 1;
        else if (tokens[j].kind === 'punct' && tokens[j].text === ')') caseDepth -= 1;
        else if (caseDepth === 0 && isWord(tokens[j], 'CASE')) {
          hasCase = true;
          break;
        }
      }
      newline(frame.indent);
      for (let offset = 0; offset < clause.length; offset += 1) {
        put(cased(tokens[i + offset], options.casing), tokens[i + offset]);
      }
      i += clause.length - 1;
      frame.clauseName = clause.join(' ');
      frame.itemIndent = frame.indent + 1;
      // A clause that fits stays on its line; one that does not gets a line per
      // item. This is the only thing the width setting is for.
      frame.clauseBlock = hasCase || width > options.width;
      if (frame.clauseBlock) newline(frame.itemIndent);
      continue;
    }

    if (token.kind === 'word') {
      const upper = token.text.toUpperCase();
      if ((upper === 'AND' || upper === 'OR') && frame.clauseBlock) {
        newline(frame.itemIndent);
        put(cased(token, options.casing), token);
        continue;
      }
      if (upper === 'CASE') {
        caseIndents.push(frame.itemIndent + 1);
        put(cased(token, options.casing), token);
        continue;
      }
      if ((upper === 'WHEN' || upper === 'ELSE') && caseIndents.length > 0) {
        newline(caseIndents[caseIndents.length - 1]);
        put(cased(token, options.casing), token);
        continue;
      }
      if (upper === 'END' && caseIndents.length > 0) {
        const indent = caseIndents.pop()!;
        newline(indent - 1);
        put(cased(token, options.casing), token);
        continue;
      }
      put(cased(token, options.casing), token);
      continue;
    }

    put(token.text, token);
  }

  flush();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

export type Outcome = { ok: true; sql: string; tokens: number } | { ok: false; message: string };

export function format(sql: string, options: Options = DEFAULTS): Outcome {
  if (sql.trim() === '') return { ok: false, message: 'empty input' };
  try {
    const tokens = tokenize(sql);
    return { ok: true, sql: layout(tokens, options), tokens: tokens.length };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Everything on one line, for pasting into code. Comments are dropped. */
export function minify(sql: string): Outcome {
  if (sql.trim() === '') return { ok: false, message: 'empty input' };
  let tokens: Token[];
  try {
    tokens = tokenize(sql);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const kept = tokens.filter((token) => token.kind !== 'lineComment' && token.kind !== 'blockComment');
  let out = '';
  let previous: Token | undefined;
  for (const token of kept) {
    out += (spaceBetween(previous, token) ? ' ' : '') + token.text;
    previous = token;
  }
  return { ok: true, sql: out.trim(), tokens: tokens.length };
}

/** Counts statements, for the readout. A trailing semicolon is not a statement. */
export function statementCount(tokens: readonly Token[]): number {
  let depth = 0;
  let statements = 0;
  let seenSomething = false;
  for (const token of tokens) {
    if (token.kind === 'punct' && token.text === '(') depth += 1;
    else if (token.kind === 'punct' && token.text === ')') depth -= 1;
    else if (token.kind === 'punct' && token.text === ';' && depth === 0) {
      if (seenSomething) statements += 1;
      seenSomething = false;
    } else if (token.kind !== 'lineComment' && token.kind !== 'blockComment') {
      seenSomething = true;
    }
  }
  return statements + (seenSomething ? 1 : 0);
}
