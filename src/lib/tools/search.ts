import type { Tool } from '../../../content/tools/types';
import type { Loc } from './locale';

/**
 * Ranked substring search over registry metadata.
 *
 * Deliberately not fuzzy. A fuzzy matcher would put `text-diff` behind
 * `json-diff` for the query "diff" depending on character positions, and on a
 * list of a hundred known items exact-prefix ranking is both predictable and
 * ten lines instead of a dependency.
 */

const norm = (value: string) => value.toLowerCase().trim();

function score(tool: Tool, q: string, l: Loc): number {
  const id = tool.id.toLowerCase();
  if (id === q) return 1000;
  if (id.startsWith(q)) return 900;

  const primary = norm(l === 'en' ? tool.name.en : tool.name.zh);
  const other = norm(l === 'en' ? tool.name.zh : tool.name.en);
  if (primary === q) return 800;
  if (primary.startsWith(q)) return 700;
  if (primary.includes(q)) return 600;
  if (other.includes(q)) return 500;

  if (tool.slug.includes(q)) return 450;
  if (tool.keywords.some((keyword) => norm(keyword) === q)) return 400;
  if (tool.keywords.some((keyword) => norm(keyword).includes(q))) return 300;

  const blurb = norm(l === 'en' ? tool.blurb.en : tool.blurb.zh);
  if (blurb.includes(q)) return 100;

  return 0;
}

export function search(tools: readonly Tool[], query: string, l: Loc): Tool[] {
  const q = norm(query);
  if (!q) return tools.slice();

  return tools
    .map((tool) => ({ tool, rank: score(tool, q, l) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.tool.id.localeCompare(b.tool.id))
    .map((entry) => entry.tool);
}
