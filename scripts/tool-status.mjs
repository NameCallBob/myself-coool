/**
 * Per-drawer build status for the bench.
 *
 * Reads the registry against what is actually on disk — the same rule the
 * loader generator uses — so "done" here means a tool a reader can open, not
 * a tool someone reported as finished.
 *
 * Usage: node scripts/tool-status.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { TOOLS } = await import('../content/tools/registry.ts');
const { CATEGORIES } = await import('../content/tools/categories.ts');

/**
 * The notes barrel is read as text rather than imported: it uses the
 * extensionless specifiers the bundler resolves, which Node's own ESM loader
 * does not. Matching the top-level slug keys is enough to know whether a tool
 * has prose, and it keeps this script from constraining how that file is
 * written.
 */
function slugsWithNotes() {
  const found = new Set();
  for (const category of ['text', 'encode', 'data', 'dev', 'crypto', 'time', 'calc', 'design', 'media', 'net']) {
    const file = join('content/tools/notes', `${category}.ts`);
    if (!existsSync(file)) continue;
    // Keys may be quoted or bare — `base64: {` is as valid as `'pii-mask': {`.
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s+'?([a-z0-9-]+)'?:\s*\{$/gm)) {
      found.add(match[1]);
    }
  }
  return found;
}

const TOOL_NOTES = Object.fromEntries([...slugsWithNotes()].map((slug) => [slug, true]));

const has = (slug, file) => existsSync(join('src/tools', slug, file));

let built = 0;
let tested = 0;
let notesDone = 0;
let notesNeeded = 0;

for (const category of CATEGORIES) {
  const tools = TOOLS.filter((tool) => tool.category === category.id);
  const done = tools.filter((tool) => has(tool.slug, 'index.tsx'));
  const withTests = tools.filter((tool) => has(tool.slug, 'logic.test.ts'));
  const wantNotes = tools.filter((tool) => tool.indexable);
  const gotNotes = wantNotes.filter((tool) => TOOL_NOTES[tool.slug]);
  const missing = tools.filter((tool) => !has(tool.slug, 'index.tsx')).map((tool) => tool.id);

  built += done.length;
  tested += withTests.length;
  notesDone += gotNotes.length;
  notesNeeded += wantNotes.length;

  console.log(
    `${category.letter}  ${category.name.zh.padEnd(5, '　')}  ` +
      `built ${String(done.length).padStart(2)}/${tools.length}  ` +
      `tests ${String(withTests.length).padStart(2)}  ` +
      `notes ${gotNotes.length}/${wantNotes.length}  ` +
      (missing.length ? `missing ${missing.join(' ')}` : '')
  );
}

console.log(
  `\ntotal  built ${built}/${TOOLS.length}  tested ${tested}  notes ${notesDone}/${notesNeeded}`
);
