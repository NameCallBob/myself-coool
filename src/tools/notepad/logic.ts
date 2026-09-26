/**
 * A Markdown subset, rendered to HTML, plus the note bundle format.
 *
 * Writing the renderer rather than pulling one in is a deliberate trade: the
 * subset below is what a scratch note actually uses, it is a few hundred lines,
 * and it never has to be audited for the one thing that matters here — that
 * nothing a person types can become markup. Everything is escaped, and the only
 * tags in the output are the ones this file writes.
 *
 * The output is still rendered inside `<iframe sandbox="" srcdoc>`, so even a
 * mistake in here cannot run a script or reach the page around it. That is belt
 * and braces on purpose: this renderer handles text that arrived by paste.
 *
 * What the subset covers: ATX headings, paragraphs with hard breaks, fenced and
 * inline code, emphasis, strong, strikethrough, links, blockquotes, nested and
 * ordered lists, task lists, horizontal rules, and GFM pipe tables. What it does
 * not: reference links, setext headings, HTML passthrough, footnotes,
 * definition lists, and images — the page says so.
 */

/* ── Escaping ─────────────────────────────── */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

/**
 * Only `http`, `https`, `mailto` and same-document fragments become links.
 *
 * Everything else — `javascript:`, `data:`, `vbscript:`, a scheme nobody has
 * heard of — is rendered as plain text instead. An allow-list is the only form
 * of this check that stays correct as browsers add schemes.
 */
export function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  if (/[\s<>"'`]/.test(trimmed)) return null;
  // The text reaching here has already been HTML-escaped, so a quote arrives as
  // `&quot;`. Inside a quoted attribute an entity cannot end the value, but a
  // URL with one in it is never a real URL, so it is refused rather than
  // reasoned about.
  if (/&(?:quot|apos|lt|gt);|&#/i.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return trimmed;
  if (/^(?:https?:\/\/|mailto:)\S+$/i.test(trimmed)) return trimmed;
  return null;
}

/* ── Internal markers ─────────────────────── */

/**
 * Code spans, backslash escapes and hard breaks are lifted out of the text and
 * replaced by markers before anything else runs. The markers are control
 * characters, and every control character is stripped from the input first, so
 * no marker can ever come from what was typed.
 */
const CODE_MARK = '\u0000';
const ESCAPE_MARK = '\u0001';
const BREAK_MARK = '\u0002';

export function stripControls(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/* ── Inline ───────────────────────────────── */

/**
 * Pulls code spans out before anything else touches the text.
 *
 * A code span is delimited by a run of backticks and closed by a run of the
 * same length, so a span containing a backtick works. Nothing inside may be
 * interpreted, which is why the content is stored and replaced by a marker
 * rather than processed.
 */
function extractCode(text: string, store: string[]): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      out += text[i] + text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      let run = 0;
      while (text[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      const close = text.indexOf(fence, i + run);
      if (close !== -1) {
        store.push(text.slice(i + run, close));
        out += `${CODE_MARK}${store.length - 1}${CODE_MARK}`;
        i = close + run;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

const ESCAPABLE = '\\\\`*_{}\\[\\]()#+\\-.!>~|';

export function renderInline(text: string): string {
  const codes: string[] = [];
  const escapes: string[] = [];

  let work = extractCode(text, codes);
  work = work.replace(new RegExp(`\\\\([${ESCAPABLE}])`, 'g'), (_, ch: string) => {
    escapes.push(ch);
    return `${ESCAPE_MARK}${escapes.length - 1}${ESCAPE_MARK}`;
  });

  work = escapeHtml(work);

  // Images cannot be loaded — there is no network here and the preview frame is
  // sandboxed — so they are shown as a labelled link rather than silently lost.
  work = work.replace(/!\[([^\]]*)\]\(([^)\s]*)\)/g, (_, alt: string, href: string) => {
    const url = safeUrl(href);
    const label = alt.trim() === '' ? 'image' : alt;
    return url
      ? `<span class="img">[${label}]</span> <a href="${url}">${url}</a>`
      : `<span class="img">[${label}]</span>`;
  });

  work = work.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (whole, label: string, href: string) => {
    const url = safeUrl(href);
    return url ? `<a href="${url}">${label}</a>` : whole;
  });

  work = work.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  work = work.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  work = work.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  work = work.replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>');
  // Underscore emphasis only between non-word characters, so snake_case names
  // survive: do_the_thing is an identifier, not emphasis.
  work = work.replace(/(?<![A-Za-z0-9_])_(?=\S)([^_]*?\S)_(?![A-Za-z0-9_])/g, '<em>$1</em>');

  work = work.replace(
    new RegExp(`${ESCAPE_MARK}(\\d+)${ESCAPE_MARK}`, 'g'),
    (_, index: string) => escapeHtml(escapes[Number(index)])
  );
  work = work.replace(
    new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, 'g'),
    (_, index: string) => `<code>${escapeHtml(codes[Number(index)])}</code>`
  );
  return work;
}

/* ── Blocks ───────────────────────────────── */

const FENCE = /^ {0,3}(```+|~~~+)(.*)$/;
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const ITEM = /^(\s*)([-*+]|\d+[.)])[ \t]+(.*)$/;
const DELIMITER_ROW = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line)
  );
}

function cellsOf(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function alignmentsOf(row: string): ('left' | 'center' | 'right')[] {
  return cellsOf(row).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/** Nesting cap: a pathological document should not blow the stack. */
const MAX_DEPTH = 12;

function renderList(lines: readonly string[], start: number, depth: number): { html: string; next: number } {
  const first = ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: string[][] = [];
  let i = start;

  // The marker itself is part of the list's identity: CommonMark starts a new
  // list when it changes, so `- a` followed by `* b` is two lists, not one.
  const marker = ordered ? first[2].replace(/\d+/, '') : first[2];
  while (i < lines.length) {
    const match = ITEM.exec(lines[i]);
    if (!match || match[1].length !== indent) break;
    const thisOrdered = /\d/.test(match[2]);
    if (thisOrdered !== ordered) break;
    if ((thisOrdered ? match[2].replace(/\d+/, '') : match[2]) !== marker) break;
    const content = [match[3]];
    i += 1;
    while (i < lines.length) {
      if (lines[i].trim() === '') {
        // A blank line stays inside the item only when something indented
        // follows it; otherwise it ends the list.
        if (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
          content.push('');
          i += 1;
          continue;
        }
        break;
      }
      const leading = /^\s*/.exec(lines[i])![0].length;
      if (leading > indent) {
        content.push(lines[i].slice(Math.min(leading, indent + 2)));
        i += 1;
        continue;
      }
      break;
    }
    items.push(content);
  }

  const rendered = items.map((content) => {
    const task = /^\[([ xX])\][ \t]+([\s\S]*)$/.exec(content[0]);
    const body = task ? [task[2], ...content.slice(1)] : content;
    let inner = renderBlocks(body, depth + 1);
    // An item with no blank line inside it is "tight": its first paragraph
    // renders without <p>, which is what a list is supposed to look like. An
    // item that does contain a blank line keeps its paragraphs.
    if (!content.includes('')) inner = inner.replace(/^<p>([\s\S]*?)<\/p>\n?/, '$1');
    const box = task ? `<span class="task">${task[1] === ' ' ? '☐' : '☑'}</span> ` : '';
    return `<li>${box}${inner}</li>`;
  });

  const tag = ordered ? 'ol' : 'ul';
  const startValue = ordered ? first[2].replace(/[.)]/, '') : '1';
  const startAttribute = ordered && startValue !== '1' ? ` start="${escapeHtml(startValue)}"` : '';
  return { html: `<${tag}${startAttribute}>${rendered.join('')}</${tag}>`, next: i };
}

export function renderBlocks(lines: readonly string[], depth = 0): string {
  if (depth > MAX_DEPTH) return `<p>${escapeHtml(lines.join('\n'))}</p>`;
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const closer = fence[1][0] === '`' ? /^ {0,3}```+\s*$/ : /^ {0,3}~~~+\s*$/;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !closer.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const language = fence[2].trim().split(/\s+/)[0];
      const attribute = language ? ` class="lang-${escapeHtml(language)}"` : '';
      out.push(`<pre><code${attribute}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(QUOTE, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(inner, depth + 1)}</blockquote>`);
      continue;
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      DELIMITER_ROW.test(lines[i + 1]) &&
      cellsOf(lines[i + 1]).length === cellsOf(line).length
    ) {
      const headers = cellsOf(line);
      const align = alignmentsOf(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(cellsOf(lines[i]));
        i += 1;
      }
      const head = headers
        .map(
          (cell, index) =>
            `<th style="text-align:${align[index] ?? 'left'}">${renderInline(cell)}</th>`
        )
        .join('');
      const body = rows
        .map(
          (row) =>
            `<tr>${headers
              .map(
                (_, index) =>
                  `<td style="text-align:${align[index] ?? 'left'}">${renderInline(row[index] ?? '')}</td>`
              )
              .join('')}</tr>`
        )
        .join('');
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    if (ITEM.test(line)) {
      const { html, next } = renderList(lines, i, depth);
      out.push(html);
      i = next;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    // Two trailing spaces, or a trailing backslash, is a hard break.
    const joined = paragraph.join('\n').replace(/(?: {2,}|\\)\n/g, `${BREAK_MARK}\n`);
    const body = renderInline(joined)
      .replace(new RegExp(`${BREAK_MARK}\n`, 'g'), '<br>')
      .replace(/\n/g, ' ');
    out.push(`<p>${body}</p>`);
  }

  return out.join('\n');
}

/** Above this many characters, the preview reports instead of rendering. */
export const MAX_PREVIEW = 200_000;

export function renderMarkdown(source: string): string {
  const clean = stripControls(source).replace(/\r\n?/g, '\n');
  if (clean.length > MAX_PREVIEW) {
    return `<p class="over">Too long to preview: ${clean.length} characters, limit ${MAX_PREVIEW}.</p>`;
  }
  return renderBlocks(clean.split('\n'));
}

/* ── The preview document ─────────────────── */

/**
 * The whole `srcdoc`. Styles are inline because the frame has no origin and so
 * cannot load a stylesheet; `sandbox=""` on the element means no scripts, no
 * forms, no navigation and no access to the page around it.
 */
export function previewDocument(bodyHtml: string, dark: boolean): string {
  const fg = dark ? '#e8e6e1' : '#1a1a19';
  const bg = dark ? '#17171a' : '#fbfaf8';
  const muted = dark ? '#8f8d88' : '#6e6c68';
  const rule = dark ? '#2e2e33' : '#e2e0da';
  const code = dark ? '#1f1f24' : '#f1efe9';
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>',
    `:root{color-scheme:${dark ? 'dark' : 'light'}}`,
    `body{margin:0;padding:1rem 1.1rem;background:${bg};color:${fg};`,
    'font:14px/1.7 ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;overflow-wrap:break-word}',
    'h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.4em 0 .5em;font-weight:600}',
    'h1{font-size:1.5em}h2{font-size:1.28em}h3{font-size:1.12em}h4,h5,h6{font-size:1em}',
    'p{margin:.7em 0}',
    `a{color:inherit;text-decoration:underline;text-decoration-color:${muted}}`,
    `code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:${code};padding:.1em .35em;border-radius:2px}`,
    `pre{background:${code};padding:.75rem .9rem;overflow-x:auto}`,
    'pre code{background:none;padding:0}',
    `blockquote{margin:.8em 0;padding:.1em 0 .1em .9rem;border-left:2px solid ${rule};color:${muted}}`,
    'ul,ol{margin:.6em 0;padding-left:1.4em}li{margin:.2em 0}',
    `hr{border:0;border-top:1px solid ${rule};margin:1.4em 0}`,
    'table{border-collapse:collapse;margin:.8em 0;font-size:13px;display:block;overflow-x:auto}',
    `th,td{border:1px solid ${rule};padding:.35em .6em}`,
    `th{font-weight:600;background:${code}}`,
    `.img,.task{color:${muted};font-family:ui-monospace,monospace;font-size:12px}`,
    `.over{color:${muted};font-family:ui-monospace,monospace}`,
    '</style></head><body>',
    bodyHtml,
    '</body></html>',
  ].join('');
}

/* ── Notes ────────────────────────────────── */

export type Note = { id: string; body: string; updated: number };

export const TITLE_LIMIT = 64;

/**
 * The first heading, or failing that the first non-blank line. A note's name is
 * part of the note, so there is no separate title field to keep in sync.
 */
export function deriveTitle(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const heading = HEADING.exec(line);
    const text = (heading ? heading[2] : trimmed).replace(/[*_`~#>]/g, '').trim();
    if (text === '') continue;
    return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT - 1)}…` : text;
  }
  return '';
}

export type Stats = { characters: number; words: number; lines: number };

const CJK_RANGES = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;
const LATIN_WORD = /[A-Za-z0-9\u00c0-\u024f]+(?:['\u2019][A-Za-z]+)?/g;

/**
 * Word counting that works for Chinese.
 *
 * Splitting on whitespace gives a paragraph of Chinese a word count of one, so
 * CJK characters are counted individually and runs of letters and digits count
 * as one word each — the convention word processors use for mixed text.
 */
export function stats(body: string): Stats {
  const cjk = body.match(CJK_RANGES) ?? [];
  const latin = body.match(LATIN_WORD) ?? [];
  return {
    characters: [...body].length,
    words: cjk.length + latin.length,
    lines: body === '' ? 0 : body.split('\n').length,
  };
}

/* ── Bundle format ────────────────────────── */

const BUNDLE_HEADER = /^<!-- note id="([^"]*)" updated="(\d+)" -->$/;

export function noteHeader(note: Note): string {
  return `<!-- note id="${note.id.replace(/"/g, '')}" updated="${Math.trunc(note.updated)}" -->`;
}

/**
 * All notes in one Markdown file, each preceded by an HTML comment carrying its
 * id and timestamp. A comment, because the file still has to be readable — and
 * openable in any Markdown editor — when this tool is not involved.
 */
export function exportBundle(notes: readonly Note[]): string {
  return notes.map((note) => `${noteHeader(note)}\n${note.body.replace(/\s+$/, '')}\n`).join('\n');
}

/**
 * Reads a bundle back. A file with no headers at all is taken as a single note,
 * so importing an ordinary `.md` file works.
 */
export function parseBundle(text: string): Note[] {
  const lines = stripControls(text).replace(/\r\n?/g, '\n').split('\n');
  const notes: Note[] = [];
  let current: Note | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const header = BUNDLE_HEADER.exec(line.trim());
    if (header) {
      if (current) notes.push({ ...current, body: current.body.replace(/\n+$/, '') });
      current = { id: header[1], body: '', updated: Number(header[2]) };
      continue;
    }
    if (current) current.body += current.body === '' ? line : `\n${line}`;
    else preamble.push(line);
  }
  if (current) notes.push({ ...current, body: current.body.replace(/\n+$/, '') });

  if (notes.length === 0) {
    const body = preamble.join('\n').trim();
    return body === '' ? [] : [{ id: '', body, updated: 0 }];
  }
  return notes;
}

/** Newest first, which is the order a scratch pad is read in. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => b.updated - a.updated);
}

/**
 * Merges imported notes into the existing set, matching on id. A note whose id
 * is already present is kept only if the imported copy is newer, so importing
 * the same bundle twice changes nothing.
 */
export function mergeNotes(existing: readonly Note[], incoming: readonly Note[]): Note[] {
  const byId = new Map(existing.map((note) => [note.id, note]));
  for (const note of incoming) {
    if (note.id === '') continue;
    const held = byId.get(note.id);
    if (!held || note.updated > held.updated) byId.set(note.id, note);
  }
  return sortNotes([...byId.values()]);
}
