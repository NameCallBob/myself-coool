/**
 * Conventional Commits: build a message from a form, and read one back.
 *
 * Two halves that have to agree. `buildMessage` assembles the message from the
 * form; `parseMessage` takes a message someone pasted and fills the same form
 * back in. The property the tests hold to is that a well-formed message survives
 * the round trip unchanged — because if it does not, the reverse parser is
 * quietly dropping something, and the user's `--amend` will drop it too.
 *
 * The grammar implemented here is Conventional Commits 1.0.0:
 *
 *     <type>[(<scope>)][!]: <description>
 *     <BLANK LINE>
 *     [body]
 *     <BLANK LINE>
 *     [footers]
 *
 * Points of the spec that are easy to get wrong and are therefore spelled out
 * in code below:
 *  - The separator is a colon *and a space*. `feat:thing` is not conformant.
 *  - `!` goes after the scope and before the colon, never after the colon.
 *  - A footer token uses `-` in place of spaces, so `Reviewed-by`, not
 *    `Reviewed by`. `BREAKING CHANGE` is the single exception and must be
 *    uppercase; `BREAKING-CHANGE` is synonymous.
 *  - A footer separator is `: ` or ` #` — the second is what makes `Refs #133`
 *    a footer rather than prose.
 *  - `feat` implies a MINOR bump, `fix` a PATCH, and a breaking marker a MAJOR.
 *    No other type is given a meaning by the spec.
 *
 * The 50/72 numbers are not from Conventional Commits at all; they are the git
 * convention (`git log --oneline` in an 80-column terminal). They are measured
 * here in display columns rather than characters, because that is what they were
 * ever about — twenty Chinese characters is forty columns, not twenty.
 */

/* ── Reference data ───────────────────────── */

export type CommitType = {
  type: string;
  zh: string;
  en: string;
  /** What the spec says this type does to the version. Only feat/fix are defined. */
  bump: 'minor' | 'patch' | 'none';
};

/**
 * The type vocabulary. Conventional Commits 1.0.0 itself only defines `feat`
 * and `fix`; the rest of this list is the Angular convention as encoded by
 * @commitlint/config-conventional, which is what most repositories actually
 * enforce. Teams add their own, so this list is a default and not a rule — the
 * UI lets you type any word, and lets you register extra ones so they stop
 * being flagged as unknown.
 *
 * Source: conventionalcommits.org v1.0.0; @commitlint/config-conventional
 * type-enum. Checked 2026-09-26.
 */
export const COMMIT_TYPES: readonly CommitType[] = [
  { type: 'feat', zh: '新增功能', en: 'a new feature', bump: 'minor' },
  { type: 'fix', zh: '修正錯誤', en: 'a bug fix', bump: 'patch' },
  { type: 'docs', zh: '只改文件', en: 'documentation only', bump: 'none' },
  { type: 'style', zh: '不影響語意的格式調整(空白、分號、排版)', en: 'formatting only; no change in meaning', bump: 'none' },
  { type: 'refactor', zh: '重構:不改外部行為,也不是修 bug', en: 'neither fixes a bug nor adds a feature', bump: 'none' },
  { type: 'perf', zh: '效能改善', en: 'a performance improvement', bump: 'none' },
  { type: 'test', zh: '新增或修改測試', en: 'adding or correcting tests', bump: 'none' },
  { type: 'build', zh: '建置系統或依賴', en: 'build system or dependencies', bump: 'none' },
  { type: 'ci', zh: 'CI 設定與腳本', en: 'CI configuration and scripts', bump: 'none' },
  { type: 'chore', zh: '雜項:不動 src 與 test', en: 'chores that touch neither src nor tests', bump: 'none' },
  { type: 'revert', zh: '回復先前的 commit', en: 'reverts a previous commit', bump: 'none' },
];

export const SPEC_VERSION = 'Conventional Commits 1.0.0';
export const TYPES_SOURCE = 'conventionalcommits.org 1.0.0 + @commitlint/config-conventional';
export const TYPES_CHECKED = '2026-09-26';

/** git convention, not Conventional Commits: subject ≤ 50 preferred, ≤ 72 hard. */
export const SUBJECT_RECOMMENDED = 50;
export const SUBJECT_LIMIT = 72;
/** Body wrap column, also git convention. */
export const BODY_WRAP = 72;

/* ── Widths ───────────────────────────────── */

/**
 * Zero-width code points: combining marks and the invisible joiners. Not the
 * complete Unicode set — the ranges that turn up in commit messages written by
 * humans (accents, emoji joiners and variation selectors).
 */
function isZeroWidth(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritical marks
    (cp >= 0x20d0 && cp <= 0x20f0) || // combining marks for symbols
    (cp >= 0x200b && cp <= 0x200f) || // ZWSP, ZWNJ, ZWJ, LRM, RLM
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) || // combining half marks
    cp === 0xfeff ||
    (cp >= 0xe0100 && cp <= 0xe01ef) // variation selectors supplement
  );
}

/**
 * East Asian Wide and Fullwidth, per UAX #11. Approximated by block ranges
 * rather than by shipping the property table — a hundred kilobytes of data for
 * a column count in a commit-message linter is not a trade worth making, and
 * every range below is a whole block whose members are all W or F.
 */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo initial consonants
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, Kangxi, CJK symbols
    (cp >= 0x3041 && cp <= 0x33ff) || // kana, Hangul compat, CJK compat
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe10 && cp <= 0xfe19) || // vertical forms
    (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK compat forms, small form variants
    (cp >= 0xff01 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1f64f) || // pictographs and emoticons
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // supplemental symbols and pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK ext B and beyond
  );
}

/** Terminal columns a string occupies. Wide → 2, combining → 0, else 1. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

/** UTF-8 byte length. git stores bytes, so this is what a hook counts. */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) n += 1;
    else if (cp < 0x800) n += 2;
    else if (cp < 0x10000) n += 3;
    else n += 4;
  }
  return n;
}

/* ── The form ─────────────────────────────── */

export type FooterSeparator = ': ' | ' #';

export type Footer = {
  token: string;
  separator: FooterSeparator;
  value: string;
};

export type Draft = {
  type: string;
  scope: string;
  breaking: boolean;
  /** Text of the BREAKING CHANGE footer. Empty means `!` in the header alone. */
  breakingDescription: string;
  subject: string;
  body: string;
  footers: Footer[];
};

export function emptyDraft(): Draft {
  return {
    type: '',
    scope: '',
    breaking: false,
    breakingDescription: '',
    subject: '',
    body: '',
    footers: [],
  };
}

/** The first line. Subject whitespace is collapsed: a header is one line. */
export function headerOf(draft: Draft): string {
  const type = draft.type.trim();
  const scope = draft.scope.trim();
  const subject = draft.subject.replace(/\s+/g, ' ').trim();
  if (type === '') return subject;
  return `${type}${scope === '' ? '' : `(${scope})`}${draft.breaking ? '!' : ''}: ${subject}`;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Drop leading and trailing blank lines, and trailing spaces on every line. */
function trimBlock(text: string): string {
  return normalizeNewlines(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

export function buildMessage(draft: Draft): string {
  const blocks: string[] = [headerOf(draft)];

  const body = trimBlock(draft.body);
  if (body !== '') blocks.push(body);

  const footerLines: string[] = [];
  const breakingText = trimBlock(draft.breakingDescription);
  if (draft.breaking && breakingText !== '') {
    footerLines.push(`BREAKING CHANGE: ${breakingText}`);
  }
  for (const footer of draft.footers) {
    const token = footer.token.trim();
    if (token === '') continue;
    const value = trimBlock(footer.value);
    footerLines.push(`${token}${footer.separator}${value}`);
  }
  if (footerLines.length > 0) blocks.push(footerLines.join('\n'));

  return blocks.join('\n\n');
}

/* ── Reading a message back ───────────────── */

/**
 * `git commit` writes its instructions into the message file as `#` lines and
 * strips them again on save. A message pasted straight out of the editor still
 * has them, so they are removed on request — as a separate function rather than
 * inside the parser, because `#` at the start of a line is also a legitimate
 * Markdown heading in a body, and only the caller knows which it is looking at.
 */
export function stripGitComments(text: string): string {
  const lines = normalizeNewlines(text).split('\n');
  const scissors = lines.findIndex((line) => line.startsWith('# ------------------------ >8'));
  const kept = (scissors === -1 ? lines : lines.slice(0, scissors)).filter(
    (line) => !line.startsWith('#')
  );
  return kept.join('\n').replace(/\n+$/, '');
}

export type ParseNote = {
  code:
    | 'not-conventional'
    | 'no-space-after-colon'
    | 'bang-after-colon'
    | 'no-blank-after-header'
    | 'breaking-footer-case'
    | 'breaking-without-bang'
    | 'scope-empty-parens';
  /** 1-based line number in the normalized message, when the note has one. */
  line?: number;
};

export type ParseResult = {
  draft: Draft;
  /** True when the first line matched the Conventional Commits header grammar. */
  conventional: boolean;
  notes: ParseNote[];
};

const HEADER =
  /^(?<type>[A-Za-z][A-Za-z0-9._-]*)(?:\((?<scope>[^()]*)\))?(?<bang>!)?:(?<gap>[ \t]*)(?<subject>.*)$/;

/**
 * Case-insensitive on purpose. `BREAKING CHANGE` must be uppercase to count, but
 * a lowercase `breaking change:` has to be *recognised* before it can be
 * reported — matching case-sensitively would drop the line into the body and
 * leave the user with a message that silently is not a breaking change.
 */
const FOOTER = /^(?<token>BREAKING[ -]CHANGE|[A-Za-z][A-Za-z0-9-]*)(?<sep>:[ \t]*|[ \t]#)(?<value>.*)$/i;

const isBreakingToken = (token: string) => /^breaking[ -]change$/i.test(token);

/**
 * Where the footer section starts, as an index into `lines`.
 *
 * A footer is only recognised at the start of a block — either the first line
 * after the header, or a line preceded by a blank one. Without that condition a
 * body sentence such as "see also: the ticket" would swallow the rest of the
 * message. With it, a *paragraph* that opens `Note: …` is still read as a
 * footer, and that is not a bug in this parser but the shape of the format:
 * conventional-commits-parser and commitlint read it the same way.
 */
function footerStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    if (!FOOTER.test(lines[i])) continue;
    if (i === 0 || lines[i - 1].trim() === '') return i;
  }
  return -1;
}

export function parseMessage(text: string): ParseResult {
  const draft = emptyDraft();
  const notes: ParseNote[] = [];
  const lines = normalizeNewlines(text).split('\n');
  const header = lines[0] ?? '';

  const match = HEADER.exec(header.trim());
  let conventional = false;
  if (match?.groups) {
    conventional = true;
    draft.type = match.groups.type;
    draft.scope = match.groups.scope ?? '';
    draft.breaking = match.groups.bang === '!';
    draft.subject = match.groups.subject.trim();
    if (match.groups.gap === '') notes.push({ code: 'no-space-after-colon', line: 1 });
    if (match.groups.scope !== undefined && match.groups.scope.trim() === '') {
      notes.push({ code: 'scope-empty-parens', line: 1 });
    }
    if (draft.subject.startsWith('!')) notes.push({ code: 'bang-after-colon', line: 1 });
  } else {
    draft.subject = header.trim();
    notes.push({ code: 'not-conventional', line: 1 });
  }

  // Everything after the header, with the mandatory blank line consumed.
  let rest = lines.slice(1);
  if (rest.length > 0 && rest[0].trim() !== '') {
    notes.push({ code: 'no-blank-after-header', line: 2 });
  }
  const skipped = rest.findIndex((line) => line.trim() !== '');
  rest = skipped === -1 ? [] : rest.slice(skipped);
  const restOffset = 1 + (skipped === -1 ? 0 : skipped) + 1; // 1-based line of rest[0]

  const start = footerStart(rest);
  const bodyLines = start === -1 ? rest : rest.slice(0, start);
  const footerLines = start === -1 ? [] : rest.slice(start);
  draft.body = trimBlock(bodyLines.join('\n'));

  type Raw = { token: string; separator: FooterSeparator; value: string; line: number };
  const raw: Raw[] = [];
  for (let i = 0; i < footerLines.length; i += 1) {
    const line = footerLines[i];
    const found = FOOTER.exec(line);
    if (found?.groups) {
      raw.push({
        token: found.groups.token,
        separator: found.groups.sep.trimStart().startsWith('#') ? ' #' : ': ',
        value: found.groups.value,
        line: restOffset + start + i,
      });
      continue;
    }
    // Continuation of the previous footer's value. A footer value may contain
    // newlines, so an indented or wrapped line belongs to the token above it.
    if (raw.length > 0) raw[raw.length - 1].value += `\n${line}`;
  }

  const bangInHeader = draft.breaking;
  const breakingParts: string[] = [];
  for (const entry of raw) {
    if (isBreakingToken(entry.token)) {
      if (entry.token !== 'BREAKING CHANGE' && entry.token !== 'BREAKING-CHANGE') {
        notes.push({ code: 'breaking-footer-case', line: entry.line });
      }
      draft.breaking = true;
      breakingParts.push(trimBlock(entry.value));
      continue;
    }
    draft.footers.push({
      token: entry.token,
      separator: entry.separator,
      value: trimBlock(entry.value),
    });
  }
  draft.breakingDescription = breakingParts.filter((part) => part !== '').join('\n');

  // Valid per the spec — the footer alone is enough — but rebuilding the draft
  // will add the `!`, so say so rather than silently changing the header.
  if (draft.breaking && !bangInHeader) notes.push({ code: 'breaking-without-bang', line: 1 });

  return { draft, conventional, notes };
}

/* ── Linting ──────────────────────────────── */

export type Issue = {
  code:
    | 'type-empty'
    | 'type-uppercase'
    | 'type-unknown'
    | 'scope-parens'
    | 'scope-space'
    | 'scope-uppercase'
    | 'subject-empty'
    | 'subject-period'
    | 'subject-capitalized'
    | 'subject-long'
    | 'subject-over-limit'
    | 'breaking-no-description'
    | 'footer-token-space'
    | 'footer-value-empty'
    | 'body-wrap';
  severity: 'error' | 'warn';
  /** A number or string to interpolate into the message. */
  value?: string | number;
};

/**
 * Everything wrong with a draft, errors first.
 *
 * `error` means the message does not conform to Conventional Commits 1.0.0 and
 * a commitlint hook will reject it. `warn` means it conforms but breaks the git
 * convention or the Angular vocabulary — a real repository may well want it.
 * The two are kept apart because a tool that shouts equally about both trains
 * people to ignore it.
 */
export function lintDraft(draft: Draft, knownTypes?: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  const type = draft.type.trim();
  const scope = draft.scope.trim();
  const subject = draft.subject.replace(/\s+/g, ' ').trim();
  const known = new Set((knownTypes ?? COMMIT_TYPES.map((entry) => entry.type)).map((t) => t.toLowerCase()));

  if (type === '') {
    issues.push({ code: 'type-empty', severity: 'error' });
  } else {
    if (type !== type.toLowerCase()) issues.push({ code: 'type-uppercase', severity: 'warn', value: type });
    if (!known.has(type.toLowerCase())) issues.push({ code: 'type-unknown', severity: 'warn', value: type });
  }

  if (/[()]/.test(scope)) issues.push({ code: 'scope-parens', severity: 'error' });
  if (/\s/.test(scope)) issues.push({ code: 'scope-space', severity: 'warn' });
  if (scope !== '' && scope !== scope.toLowerCase()) {
    issues.push({ code: 'scope-uppercase', severity: 'warn', value: scope });
  }

  if (subject === '') {
    issues.push({ code: 'subject-empty', severity: 'error' });
  } else {
    if (/[.。]$/.test(subject)) issues.push({ code: 'subject-period', severity: 'warn' });
    if (/^[A-Z]/.test(subject) && !/^[A-Z]{2,}/.test(subject)) {
      // An initial capital is the convention being broken; an all-caps opening
      // is almost always an identifier (`HTTP`, `CI`) and is left alone.
      issues.push({ code: 'subject-capitalized', severity: 'warn' });
    }
    const width = displayWidth(headerOf(draft));
    if (width > SUBJECT_LIMIT) {
      issues.push({ code: 'subject-over-limit', severity: 'error', value: width });
    } else if (width > SUBJECT_RECOMMENDED) {
      issues.push({ code: 'subject-long', severity: 'warn', value: width });
    }
  }

  if (draft.breaking && trimBlock(draft.breakingDescription) === '') {
    issues.push({ code: 'breaking-no-description', severity: 'warn' });
  }

  for (const footer of draft.footers) {
    const token = footer.token.trim();
    if (token === '') continue;
    if (/\s/.test(token)) issues.push({ code: 'footer-token-space', severity: 'error', value: token });
    if (trimBlock(footer.value) === '') {
      issues.push({ code: 'footer-value-empty', severity: 'warn', value: token });
    }
  }

  const overlong = trimBlock(draft.body)
    .split('\n')
    .filter((line) => displayWidth(line) > BODY_WRAP).length;
  if (overlong > 0) issues.push({ code: 'body-wrap', severity: 'warn', value: overlong });

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/* ── Measurement ──────────────────────────── */

export type Measurement = {
  header: string;
  headerWidth: number;
  headerChars: number;
  subjectWidth: number;
  bodyLines: number;
  longestBodyLine: number;
  footerCount: number;
  totalBytes: number;
  /** What the spec says this commit does to the version, or null when undefined. */
  bump: 'major' | 'minor' | 'patch' | null;
};

export function measure(draft: Draft): Measurement {
  const header = headerOf(draft);
  const body = trimBlock(draft.body);
  const bodyLines = body === '' ? [] : body.split('\n');
  const entry = COMMIT_TYPES.find((item) => item.type === draft.type.trim().toLowerCase());
  const bump: Measurement['bump'] = draft.breaking
    ? 'major'
    : entry && entry.bump !== 'none'
      ? entry.bump
      : null;

  return {
    header,
    headerWidth: displayWidth(header),
    headerChars: [...header].length,
    subjectWidth: displayWidth(draft.subject.replace(/\s+/g, ' ').trim()),
    bodyLines: bodyLines.length,
    longestBodyLine: bodyLines.reduce((max, line) => Math.max(max, displayWidth(line)), 0),
    footerCount:
      draft.footers.filter((footer) => footer.token.trim() !== '').length +
      (draft.breaking && trimBlock(draft.breakingDescription) !== '' ? 1 : 0),
    totalBytes: utf8Bytes(buildMessage(draft)),
    bump,
  };
}

/* ── Wrapping ─────────────────────────────── */

type Token = { text: string; kind: 'space' | 'word' | 'wide' };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let word = '';
  let join = false;
  const flush = () => {
    if (word !== '') {
      out.push({ text: word, kind: 'word' });
      word = '';
    }
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x200d) {
      // Zero-width joiner: whatever comes next is part of the same glyph.
      if (word !== '') word += ch;
      else if (out.length > 0) out[out.length - 1].text += ch;
      join = true;
      continue;
    }
    if (join) {
      join = false;
      if (word !== '') {
        word += ch;
        continue;
      }
      if (out.length > 0) {
        out[out.length - 1].text += ch;
        continue;
      }
    }
    if (ch === ' ' || ch === '\t') {
      flush();
      out.push({ text: ch, kind: 'space' });
      continue;
    }
    if (isZeroWidth(cp)) {
      if (word !== '') word += ch;
      else if (out.length > 0) out[out.length - 1].text += ch;
      continue;
    }
    if (isWide(cp)) {
      flush();
      out.push({ text: ch, kind: 'wide' });
      continue;
    }
    word += ch;
  }
  flush();
  return out;
}

function wrapLine(line: string, columns: number): string {
  if (displayWidth(line) <= columns) return line;
  const indent = /^[ \t]*/.exec(line)![0];
  const indentWidth = displayWidth(indent);
  const tokens = tokenize(line.slice(indent.length));

  const out: string[] = [];
  let current = '';
  let width = 0;
  let space = false;

  for (const token of tokens) {
    if (token.kind === 'space') {
      if (current !== '') space = true;
      continue;
    }
    const w = displayWidth(token.text);
    const gap = space ? 1 : 0;
    if (current !== '' && indentWidth + width + gap + w > columns) {
      out.push(indent + current);
      current = token.text;
      width = w;
    } else {
      current += (space ? ' ' : '') + token.text;
      width += gap + w;
    }
    space = false;
  }
  if (current !== '') out.push(indent + current);
  return out.length === 0 ? line : out.join('\n');
}

/**
 * Hard-wraps a body at `columns` display columns, keeping blank lines and each
 * line's own indent. A token with no break opportunity inside it — a URL, a
 * stack frame — is left to overflow rather than cut, because a broken URL is
 * worse than a long line. CJK breaks between characters, Latin at spaces.
 */
export function wrapText(text: string, columns: number = BODY_WRAP): string {
  const width = Math.max(8, Math.floor(columns));
  return normalizeNewlines(text)
    .split('\n')
    .map((line) => wrapLine(line, width))
    .join('\n');
}
