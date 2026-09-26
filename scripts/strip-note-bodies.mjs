/**
 * One-off: removes the `body: [...]` block from every tool note.
 *
 * The notes were written as essays about how each tool works. They are being
 * cut back to what a person using the tool needs — what it will not do, and
 * which tool to use instead. Done with a bracket matcher rather than a regex
 * because the prose contains brackets and quotes of its own.
 *
 * Usage: node scripts/strip-note-bodies.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Index just past the `]` that closes the array starting at `open`. */
function closeOf(source, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('unterminated array');
}

let removed = 0;
for (const drawer of ['text', 'encode', 'data', 'dev', 'crypto', 'time', 'calc', 'design', 'media', 'net']) {
  const path = `content/tools/notes/${drawer}.ts`;
  let source = readFileSync(path, 'utf8');

  for (;;) {
    const at = source.indexOf('body: [');
    if (at === -1) break;
    const end = closeOf(source, source.indexOf('[', at));
    // Swallow the trailing comma and the blank line the block leaves behind.
    let after = end;
    if (source[after] === ',') after += 1;
    while (source[after] === ' ' || source[after] === '\n') after += 1;
    // Keep the indentation of whatever followed.
    const lineStart = source.lastIndexOf('\n', at) + 1;
    source = source.slice(0, lineStart) + source.slice(lineStart).replace(source.slice(lineStart, after - lineStart + lineStart), '');
    removed += 1;
  }

  writeFileSync(path, source);
}
console.log(`removed ${removed} body blocks`);
