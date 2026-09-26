/**
 * Whitespace normalisation, including the two things most tools get wrong.
 *
 * First, a tab is not n spaces. A tab advances to the next tab stop, so `a\tb`
 * with a width of 4 is `a   b` (three spaces) and `ab\tc` is `ab  c` (two).
 * Replacing every tab with four spaces shifts every line that had text before
 * the tab. `expandTabs` below walks the columns instead.
 *
 * Second, zero-width characters are not all junk. U+200B and a stray BOM are
 * invisible noise worth deleting; U+200D ZERO WIDTH JOINER is what holds an
 * emoji family together, and deleting it silently turns one character into
 * three. It is therefore left in place, and the report says so.
 */

export type Eol = 'keep' | 'lf' | 'crlf' | 'cr';
export type IndentMode = 'keep' | 'tabs' | 'spaces';
export type FinalNewline = 'keep' | 'ensure' | 'strip';

export type Options = {
  eol: Eol;
  indent: IndentMode;
  /** Columns an existing tab advances. Also the assumed size of one level. */
  tabWidth: number;
  /** Columns one level becomes on output, when rescaling. */
  indentWidth: number;
  /** Re-space indentation from tabWidth levels to indentWidth levels. */
  rescale: boolean;
  /** Strip spaces and tabs at the end of every line. */
  trailing: boolean;
  /** Maximum consecutive blank lines. -1 keeps them all, 0 removes them. */
  maxBlank: number;
  trimStart: boolean;
  trimEnd: boolean;
  finalNewline: FinalNewline;
  /** NBSP and the other Unicode spaces to a plain space. */
  unicodeSpaces: boolean;
  /** Remove invisible zero-width characters, except the emoji joiner. */
  zeroWidth: boolean;
  /** Collapse runs of spaces inside a line, leaving indentation alone. */
  collapseInner: boolean;
};

export const DEFAULTS: Options = {
  eol: 'lf',
  indent: 'keep',
  tabWidth: 4,
  indentWidth: 2,
  rescale: false,
  trailing: true,
  maxBlank: -1,
  trimStart: false,
  trimEnd: true,
  finalNewline: 'ensure',
  unicodeSpaces: false,
  zeroWidth: false,
  collapseInner: false,
};

/** Spaces that are not the space: NBSP, the en/em family, narrow NBSP. */
const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f]/g;

/**
 * Invisible characters safe to delete. U+200D is deliberately absent: it joins
 * emoji sequences, and dropping it is data loss, not cleanup.
 */
const ZERO_WIDTH = /[\u200b\u200c\u2060\ufeff\u00ad]/g;

const INDENT = /^[ \t]*/;

export type Report = {
  lines: number;
  lf: number;
  crlf: number;
  cr: number;
  mixedEol: boolean;
  tabIndented: number;
  spaceIndented: number;
  mixedIndent: number;
  trailingWhitespace: number;
  blankLines: number;
  longestBlankRun: number;
  unicodeSpaces: number;
  zeroWidth: number;
  /** Emoji joiners present. Counted, never removed. */
  joiners: number;
  finalNewline: boolean;
  /** Most likely indent step among space-indented lines. */
  indentGuess: number | null;
};

/** Tab stops, not n spaces. Column position decides how wide each tab is. */
export function expandTabs(line: string, tabWidth: number): string {
  const width = Math.max(1, Math.trunc(tabWidth));
  let out = '';
  let column = 0;
  for (const ch of line) {
    if (ch === '\t') {
      const step = width - (column % width);
      out += ' '.repeat(step);
      column += step;
    } else {
      out += ch;
      // Column counting is per code point, which is right for indentation and
      // approximate for wide characters — it is only used before any text.
      column += 1;
    }
  }
  return out;
}

/** Visual width of the leading whitespace, with tabs expanded. */
export function indentWidthOf(line: string, tabWidth: number): number {
  const found = INDENT.exec(line);
  const lead = found ? found[0] : '';
  return expandTabs(lead, tabWidth).length;
}

/** Split a line into its indentation and the rest. */
export function splitIndent(line: string): { lead: string; rest: string } {
  const found = INDENT.exec(line);
  const lead = found ? found[0] : '';
  return { lead, rest: line.slice(lead.length) };
}

/**
 * The indent step the file appears to use.
 *
 * Scored rather than guessed from the first indented line: a file whose first
 * indented line happens to be a continuation would otherwise mislead. A step
 * only counts if every space-indented line is a multiple of it, and ties go to
 * the smaller step, because 2 divides 4 and would otherwise always lose.
 */
export function guessIndent(lines: readonly string[], tabWidth: number): number | null {
  const widths: number[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (!line.startsWith(' ')) continue;
    const width = indentWidthOf(line, tabWidth);
    if (width > 0) widths.push(width);
  }
  if (widths.length === 0) return null;

  let best: number | null = null;
  let bestScore = 0;
  for (const step of [2, 3, 4, 8]) {
    const score = widths.filter((width) => width % step === 0).length;
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return bestScore === 0 ? null : best;
}

export function inspect(text: string): Report {
  // Counted by subtraction rather than with a lookbehind: lookbehind is missing
  // from Safari before 16.4, and a regex literal that fails to parse takes the
  // whole module down with it.
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;

  const lines = text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n');

  let tabIndented = 0;
  let spaceIndented = 0;
  let mixedIndent = 0;
  let trailingWhitespace = 0;
  let blankLines = 0;
  let longestBlankRun = 0;
  let run = 0;

  for (const line of lines) {
    const { lead } = splitIndent(line);
    if (lead.includes('\t') && lead.includes(' ')) mixedIndent += 1;
    else if (lead.includes('\t')) tabIndented += 1;
    else if (lead.length > 0) spaceIndented += 1;
    if (/[ \t]$/.test(line)) trailingWhitespace += 1;
    if (line.trim() === '') {
      blankLines += 1;
      run += 1;
      longestBlankRun = Math.max(longestBlankRun, run);
    } else {
      run = 0;
    }
  }

  return {
    lines: lines.length,
    lf,
    crlf,
    cr,
    mixedEol: [lf, crlf, cr].filter((n) => n > 0).length > 1,
    tabIndented,
    spaceIndented,
    mixedIndent,
    trailingWhitespace,
    blankLines,
    longestBlankRun,
    unicodeSpaces: (text.match(UNICODE_SPACES) ?? []).length,
    zeroWidth: (text.match(ZERO_WIDTH) ?? []).length,
    joiners: (text.match(/\u200d/g) ?? []).length,
    finalNewline: text !== '' && /[\r\n]$/.test(text),
    indentGuess: guessIndent(lines, 4),
  };
}

export type Changes = {
  eol: number;
  indent: number;
  trailing: number;
  blanks: number;
  spaces: number;
  zeroWidth: number;
  finalNewline: number;
};

const NO_CHANGES: Changes = {
  eol: 0,
  indent: 0,
  trailing: 0,
  blanks: 0,
  spaces: 0,
  zeroWidth: 0,
  finalNewline: 0,
};

/** One line's indentation rebuilt in the target form. */
export function convertIndent(line: string, options: Options): string {
  if (options.indent === 'keep') return line;
  const { lead, rest } = splitIndent(line);
  if (lead === '') return line;

  const tabWidth = Math.max(1, Math.trunc(options.tabWidth));
  const indentWidth = Math.max(1, Math.trunc(options.indentWidth));
  const width = expandTabs(lead, tabWidth).length;

  // Rescaling needs whole levels. A width that is not a multiple of the source
  // step is a continuation line or hand alignment, and is carried over as is.
  const levels = options.rescale && width % tabWidth === 0 ? width / tabWidth : null;
  const target = levels === null ? width : levels * indentWidth;

  if (options.indent === 'spaces') return ' '.repeat(target) + rest;

  const unit = levels === null ? tabWidth : indentWidth;
  const tabs = Math.floor(target / unit);
  return '\t'.repeat(tabs) + ' '.repeat(target - tabs * unit) + rest;
}

const EOL_TEXT: Record<Exclude<Eol, 'keep'>, string> = { lf: '\n', crlf: '\r\n', cr: '\r' };

export function normalize(input: string, options: Options): { text: string; changes: Changes } {
  const changes: Changes = { ...NO_CHANGES };
  if (input === '') return { text: '', changes };

  const before = inspect(input);
  let text = input;

  if (options.zeroWidth) {
    text = text.replace(ZERO_WIDTH, () => {
      changes.zeroWidth += 1;
      return '';
    });
  }
  if (options.unicodeSpaces) {
    text = text.replace(UNICODE_SPACES, () => {
      changes.spaces += 1;
      return ' ';
    });
  }

  // Everything below works in LF and the requested ending is applied last, so a
  // CRLF file is not processed twice per line.
  const hadFinalNewline = /[\r\n]$/.test(text);
  let lines = text.replace(/\r\n?/g, '\n').split('\n');

  lines = lines.map((line) => {
    let next = convertIndent(line, options);
    if (next !== line) changes.indent += 1;

    if (options.collapseInner) {
      const { lead, rest } = splitIndent(next);
      const squeezed = rest.replace(/[ \t]{2,}/g, ' ');
      if (squeezed !== rest) changes.spaces += 1;
      next = lead + squeezed;
    }
    if (options.trailing) {
      const trimmed = next.replace(/[ \t]+$/, '');
      if (trimmed !== next) changes.trailing += 1;
      next = trimmed;
    }
    return next;
  });

  // A trailing newline produced one empty last element; it is the file ending,
  // not a blank line, so it is set aside before blank-line handling.
  if (hadFinalNewline && lines[lines.length - 1] === '') lines.pop();

  if (options.maxBlank >= 0) {
    const kept: string[] = [];
    let run = 0;
    for (const line of lines) {
      if (line.trim() === '') {
        run += 1;
        if (run > options.maxBlank) {
          changes.blanks += 1;
          continue;
        }
      } else {
        run = 0;
      }
      kept.push(line);
    }
    lines = kept;
  }

  if (options.trimStart) {
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
      changes.blanks += 1;
    }
  }
  if (options.trimEnd) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
      changes.blanks += 1;
    }
  }

  const eol = options.eol === 'keep' ? null : EOL_TEXT[options.eol];
  const joiner = eol ?? (before.crlf > before.lf && before.crlf > before.cr ? '\r\n' : before.cr > before.lf ? '\r' : '\n');
  if (eol !== null) {
    const wrong =
      (options.eol === 'lf' ? before.crlf + before.cr : 0) +
      (options.eol === 'crlf' ? before.lf + before.cr : 0) +
      (options.eol === 'cr' ? before.lf + before.crlf : 0);
    changes.eol = wrong;
  }

  let out = lines.join(joiner);
  const wantFinal =
    options.finalNewline === 'ensure' ? true : options.finalNewline === 'strip' ? false : hadFinalNewline;
  if (wantFinal && out !== '') {
    out += joiner;
    if (!hadFinalNewline) changes.finalNewline = 1;
  } else if (!wantFinal && hadFinalNewline) {
    changes.finalNewline = 1;
  }

  return { text: out, changes };
}

export function totalChanges(changes: Changes): number {
  return (
    changes.eol +
    changes.indent +
    changes.trailing +
    changes.blanks +
    changes.spaces +
    changes.zeroWidth +
    changes.finalNewline
  );
}

/**
 * Whitespace made visible for the reader: a middle dot per space, an arrow per
 * tab, a pilcrow at each line end, and a marker for each invisible character.
 * Display only — it is never fed back into the pipeline.
 */
export function visualize(text: string, limit = 4000): string {
  const head = text.length > limit ? text.slice(0, limit) : text;
  const space = /[\u00a0\u1680\u2000-\u200a\u202f\u205f]/;
  const invisible = /[\u200b\u200c\u2060\ufeff\u00ad]/;
  let out = '';
  for (let i = 0; i < head.length; i += 1) {
    const ch = head[i];
    if (ch === '\r') {
      // CRLF is one ending: marked once, then broken for display.
      if (head[i + 1] === '\n') {
        out += '\u240d\u240a\n';
        i += 1;
      } else {
        out += '\u240d\n';
      }
    } else if (ch === '\n') out += '\u240a\n';
    else if (ch === ' ') out += '\u00b7';
    else if (ch === '\t') out += '\u21e5';
    else if (ch === '\u200d') out += '\u2040';
    else if (space.test(ch)) out += '\u2423';
    else if (invisible.test(ch)) out += '\u2205';
    else out += ch;
  }
  return out;
}
