/**
 * Checklists and weighted decision matrices.
 *
 * The checklist half is bookkeeping. The matrix half is where the arithmetic
 * matters, and where most weighted-scoring tools quietly mislead:
 *
 *  - Scores are normalised by the weight total, so adding a criterion does not
 *    inflate every option's score and the number stays comparable.
 *  - The winning margin is reported, because a weighted score computed from
 *    numbers someone typed by feel has no business being shown to three decimal
 *    places as though it settled anything.
 *  - `flipWeights` says how far each weight would have to move to change the
 *    answer. If a two-point nudge on one criterion flips the winner, the matrix
 *    has not decided anything, and that is the most useful thing it can tell
 *    you.
 */

/* ── Checklists ───────────────────────────── */

export type Item = {
  id: string;
  text: string;
  done: boolean;
  /** A blocker: the list is not "ready" while any required item is unticked. */
  required: boolean;
};

export type Checklist = { title: string; items: Item[] };

export type Progress = {
  total: number;
  done: number;
  required: number;
  requiredDone: number;
  /** 0–1. Zero items counts as zero, not as complete. */
  fraction: number;
  ready: boolean;
};

export function progressOf(items: readonly Item[]): Progress {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  const required = items.filter((item) => item.required).length;
  const requiredDone = items.filter((item) => item.required && item.done).length;
  return {
    total,
    done,
    required,
    requiredDone,
    fraction: total === 0 ? 0 : done / total,
    // An empty list is never ready — there is nothing to have checked. With
    // required items marked, they are the bar; without any, everything is.
    ready: total > 0 && (required > 0 ? requiredDone === required : done === total),
  };
}

const ITEM_LINE = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
/** A trailing `(required)` or `(必要)` marks a blocker. */
const REQUIRED_TAG = /\s*[(（](?:required|必要|必填|blocker)[)）]\s*$/i;

export const MAX_ITEMS = 500;

/**
 * Reads a Markdown task list back. Anything that is not a task line is ignored
 * except a leading heading, which becomes the title — so the export format and
 * the import format are the same file.
 */
export function parseChecklist(text: string, makeId: (index: number) => string): Checklist {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  const items: Item[] = [];
  for (const line of lines) {
    if (items.length >= MAX_ITEMS) break;
    const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
    if (heading && title === '') {
      title = heading[1].trim();
      continue;
    }
    const match = ITEM_LINE.exec(line.trim());
    if (!match) continue;
    const raw = match[2].trim();
    const required = REQUIRED_TAG.test(raw);
    items.push({
      id: makeId(items.length),
      text: raw.replace(REQUIRED_TAG, '').trim(),
      done: match[1] !== ' ',
      required,
    });
  }
  return { title, items };
}

export function checklistToMarkdown(list: Checklist, l: 'zh' | 'en' = 'zh'): string {
  const lines: string[] = [];
  if (list.title.trim() !== '') lines.push(`# ${list.title.trim()}`, '');
  for (const item of list.items) {
    const tag = item.required ? (l === 'en' ? ' (required)' : '(必要)') : '';
    lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}${tag}`);
  }
  const progress = progressOf(list.items);
  lines.push('', `${progress.done} / ${progress.total}`);
  return lines.join('\n');
}

/* ── Decision matrix ──────────────────────── */

export type Criterion = { id: string; label: string; weight: number };
export type Option = { id: string; label: string; scores: Record<string, number> };

export const SCALES = [5, 10, 100];
export const MAX_CRITERIA = 30;
export const MAX_OPTIONS = 30;

/** Weights as fractions of their total, for display. Null when they sum to 0. */
export function normalisedWeights(criteria: readonly Criterion[]): Record<string, number> | null {
  const total = criteria.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;
  const out: Record<string, number> = {};
  for (const entry of criteria) out[entry.id] = Math.max(0, entry.weight) / total;
  return out;
}

/**
 * The weighted score, on 0–1.
 *
 * Dividing by the weight total *and* the scale means the result does not move
 * when a criterion is added or when the scale is switched from 1–5 to 1–10 —
 * both of which change a plain weighted sum and make yesterday's number
 * incomparable with today's.
 */
export function weightedScore(
  option: Option,
  criteria: readonly Criterion[],
  scale: number
): number | null {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  let weighted = 0;
  let total = 0;
  for (const criterion of criteria) {
    const weight = Math.max(0, criterion.weight);
    if (weight === 0) continue;
    const raw = option.scores[criterion.id];
    const score = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), scale) : 0;
    weighted += weight * score;
    total += weight;
  }
  if (total <= 0) return null;
  return weighted / (total * scale);
}

export type Ranked = {
  option: Option;
  score: number;
  /** 1-based. Equal scores share a rank. */
  rank: number;
  /** Difference from the leader, in score points (0–1). */
  behind: number;
};

export function ranking(
  options: readonly Option[],
  criteria: readonly Criterion[],
  scale: number
): Ranked[] {
  const scored = options.map((option) => ({
    option,
    score: weightedScore(option, criteria, scale) ?? 0,
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  let rank = 0;
  let previous = Number.NaN;
  return scored.map((entry, index) => {
    if (!(Math.abs(entry.score - previous) < 1e-12)) {
      rank = index + 1;
      previous = entry.score;
    }
    return { ...entry, rank, behind: best - entry.score };
  });
}

export type Flip = {
  criterionId: string;
  current: number;
  /** The weight at which the top two options tie. */
  needed: number;
  /** How far the weight has to move, as a multiple of its current value. */
  ratio: number;
};

/**
 * For each criterion, the weight at which the first and second place swap.
 *
 * With `d_i` the score difference between the leader and the runner-up on
 * criterion `i`, the leader wins while `Σ w_i·d_i > 0`. Changing one weight to
 * `x` and leaving the others alone, the tie is at
 *
 *     x = −(Σ_{i≠c} w_i·d_i) / d_c
 *
 * which exists only when `d_c ≠ 0` and comes out non-negative only when that
 * criterion can in fact carry the decision. Criteria where no achievable weight
 * changes the outcome are left out — those are the ones whose weight does not
 * matter, and knowing which they are is worth as much as the ranking.
 */
export function flipWeights(
  options: readonly Option[],
  criteria: readonly Criterion[],
  scale: number
): Flip[] {
  const order = ranking(options, criteria, scale);
  if (order.length < 2) return [];
  const leader = order[0].option;
  const runnerUp = order[1].option;

  const difference = (criterion: Criterion) => {
    const clamp = (value: number) =>
      Number.isFinite(value) ? Math.min(Math.max(value, 0), scale) : 0;
    return clamp(leader.scores[criterion.id]) - clamp(runnerUp.scores[criterion.id]);
  };

  const out: Flip[] = [];
  for (const criterion of criteria) {
    const own = difference(criterion);
    if (Math.abs(own) < 1e-12) continue;
    let rest = 0;
    for (const other of criteria) {
      if (other.id === criterion.id) continue;
      rest += Math.max(0, other.weight) * difference(other);
    }
    const needed = -rest / own;
    if (!Number.isFinite(needed) || needed < 0) continue;
    const current = Math.max(0, criterion.weight);
    out.push({
      criterionId: criterion.id,
      current,
      needed,
      ratio: current === 0 ? Number.POSITIVE_INFINITY : needed / current,
    });
  }
  // Smallest change first: that is the weight the decision actually hangs on.
  return out.sort(
    (a, b) => Math.abs(a.needed - a.current) - Math.abs(b.needed - b.current)
  );
}

/**
 * How close the decision is, as the leader's margin over the runner-up divided
 * by the leader's score. Under a few percent, the matrix has not decided
 * anything that the input precision can support.
 */
export function margin(order: readonly Ranked[]): number | null {
  if (order.length < 2) return null;
  if (order[0].score <= 0) return null;
  return (order[0].score - order[1].score) / order[0].score;
}

/* ── Matrix text format ───────────────────── */

/**
 * Makes a label usable as a key, appending a counter to repeats.
 *
 * Identifying criteria and options by their own label rather than by a generated
 * id is what lets the scores survive being reordered or reweighted: the score
 * table is keyed by what the user typed, so moving a row up does not move its
 * numbers to a different row. Renaming does lose that row's scores, which is
 * the one case where the behaviour is visible and it is the honest one.
 */
function uniqueLabels(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = seen.get(label) ?? 0;
    seen.set(label, count + 1);
    return count === 0 ? label : `${label} (${count + 1})`;
  });
}

/** `label:weight` per line; a missing weight is 1. `#` starts a comment. */
export function parseCriteria(text: string): Criterion[] {
  const rows: { label: string; weight: number }[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (rows.length >= MAX_CRITERIA) break;
    const at = trimmed.lastIndexOf(':');
    const label = at === -1 ? trimmed : trimmed.slice(0, at).trim();
    const rawWeight = at === -1 ? '1' : trimmed.slice(at + 1).trim();
    const weight = Number(rawWeight);
    if (label === '') continue;
    rows.push({ label, weight: Number.isFinite(weight) && weight >= 0 ? weight : 1 });
  }
  const ids = uniqueLabels(rows.map((row) => row.label));
  return rows.map((row, index) => ({ id: ids[index], label: ids[index], weight: row.weight }));
}

export function formatCriteria(criteria: readonly Criterion[]): string {
  return criteria.map((entry) => `${entry.label}:${entry.weight}`).join('\n');
}

/** Score table: option label to criterion label to raw score. */
export type ScoreTable = Record<string, Record<string, number>>;

/** One option label per line. */
export function parseOptionLabels(text: string): string[] {
  const labels = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .slice(0, MAX_OPTIONS);
  return uniqueLabels(labels);
}

export function buildOptions(labels: readonly string[], scores: ScoreTable): Option[] {
  return labels.map((label) => ({ id: label, label, scores: scores[label] ?? {} }));
}

export function formatOptions(options: readonly Option[]): string {
  return options.map((entry) => entry.label).join('\n');
}

/** Drops score rows and columns that no longer exist, so storage stays small. */
export function pruneScores(
  scores: ScoreTable,
  optionLabels: readonly string[],
  criteria: readonly Criterion[]
): ScoreTable {
  const keepCriteria = new Set(criteria.map((entry) => entry.id));
  const out: ScoreTable = {};
  for (const label of optionLabels) {
    const row = scores[label];
    if (!row) continue;
    const kept: Record<string, number> = {};
    for (const [key, value] of Object.entries(row)) {
      if (keepCriteria.has(key) && Number.isFinite(value)) kept[key] = value;
    }
    if (Object.keys(kept).length > 0) out[label] = kept;
  }
  return out;
}

/**
 * The matrix as a GFM table, with the weights in the header and the weighted
 * score as the last column — a form that survives being pasted into a pull
 * request or a wiki.
 */
export function matrixToMarkdown(
  options: readonly Option[],
  criteria: readonly Criterion[],
  scale: number,
  l: 'zh' | 'en' = 'zh'
): string {
  const weights = normalisedWeights(criteria);
  const header = [
    l === 'en' ? 'Option' : '選項',
    ...criteria.map(
      (entry) =>
        `${entry.label} (${entry.weight}${weights ? `, ${(weights[entry.id] * 100).toFixed(0)}%` : ''})`
    ),
    l === 'en' ? 'Score' : '加權分數',
  ];
  const divider = header.map((_, index) => (index === 0 ? ':---' : '---:'));
  const order = ranking(options, criteria, scale);
  const rows = order.map((entry) => [
    entry.option.label,
    ...criteria.map((criterion) => {
      const raw = entry.option.scores[criterion.id];
      return Number.isFinite(raw) ? String(raw) : '—';
    }),
    `${(entry.score * 100).toFixed(1)}%`,
  ]);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    l === 'en'
      ? `Scale 1–${scale}. Scores are normalised by the weight total, so they stay comparable when a criterion is added.`
      : `評分尺度 1–${scale}。分數已按權重總和正規化,所以增減評分項目不會讓分數整批位移。`,
  ];
  return lines.join('\n');
}

/* ── Templates ────────────────────────────── */

export type Template = { id: string; title: { zh: string; en: string }; items: { zh: string; en: string; required?: boolean }[] };

/**
 * Starting points, not standards. Each one is the set of checks that catch the
 * mistakes people actually make, written generically — the specifics of any
 * given deployment belong in your own copy.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'release',
    title: { zh: '上線前檢查', en: 'Before shipping' },
    items: [
      { zh: '在正式環境的資料上跑過一次,不是只有假資料', en: 'Ran once against production-shaped data, not only fixtures', required: true },
      { zh: '確認回復方式:出事之後怎麼退回上一版,而且有人試過', en: 'Rollback path confirmed and actually tried by someone', required: true },
      { zh: '資料庫遷移可以反向執行,或確認不可逆並接受', en: 'Migration is reversible, or its irreversibility is acknowledged', required: true },
      { zh: '新增的環境變數都在部署目標上設好了', en: 'Every new environment variable is set on the target' },
      { zh: '錯誤有被記錄到看得到的地方,不是只寫進 console', en: 'Errors reach somewhere someone looks, not just the console' },
      { zh: '慢查詢與 N+1 有看過', en: 'Checked for slow queries and N+1' },
      { zh: '手機寬度看過,最小 360px', en: 'Looked at it at phone width, down to 360px' },
      { zh: '鍵盤可以走完主要流程', en: 'The main flow can be completed with a keyboard' },
      { zh: '空狀態、載入中、錯誤狀態都有畫面', en: 'Empty, loading and error states all render' },
      { zh: '不需要的旗標與註解掉的程式碼清掉了', en: 'Dead flags and commented-out code removed' },
    ],
  },
  {
    id: 'handover',
    title: { zh: '交接檢查', en: 'Handover' },
    items: [
      { zh: '帳號與金鑰的持有位置寫清楚(不是把金鑰寫在文件裡)', en: 'Where the accounts and keys live is written down (not the keys themselves)', required: true },
      { zh: '從零開始跑起來的步驟被另一個人照做過', en: 'Someone else followed the from-scratch setup steps', required: true },
      { zh: '部署與回復流程有文件', en: 'Deploy and rollback are documented' },
      { zh: '網域、憑證、第三方服務的到期日列出來了', en: 'Expiry dates for domains, certificates and third-party services listed' },
      { zh: '已知問題與暫時解法寫下來,不是留在腦袋裡', en: 'Known problems and workarounds written down rather than remembered' },
      { zh: '備份確認真的可以還原', en: 'A backup has actually been restored' },
    ],
  },
  {
    id: 'blank',
    title: { zh: '空白', en: 'Blank' },
    items: [],
  },
];

export function templateToChecklist(
  template: Template,
  l: 'zh' | 'en',
  makeId: (index: number) => string
): Checklist {
  return {
    title: l === 'en' ? template.title.en : template.title.zh,
    items: template.items.map((item, index) => ({
      id: makeId(index),
      text: l === 'en' ? item.en : item.zh,
      done: false,
      required: item.required === true,
    })),
  };
}

/* ── Saved documents ──────────────────────── */

export type Saved = {
  id: string;
  name: string;
  updated: number;
  checklist: Checklist;
  criteriaText: string;
  optionsText: string;
  scale: number;
  scores: ScoreTable;
};

export function sortSaved(all: readonly Saved[]): Saved[] {
  return [...all].sort((a, b) => b.updated - a.updated);
}
