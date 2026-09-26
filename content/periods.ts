/**
 * When each project was actually worked on.
 *
 * Kept apart from `projects.ts` for one reason: every entry here has to name
 * the sentence it was read from. `content/dates.ts` cannot be used for this —
 * those are the dates the *case study text* changed, which is a different fact
 * and would draw a timeline of when the website was edited.
 *
 * A project with no stated period gets no entry. The home page shows it in a
 * separate strip rather than inventing a span for it: an undated bar on a
 * timeline is a claim, and this site does not make claims it cannot source.
 */

export type Precision = 'day' | 'month' | 'year';

export type Period = {
  /** 'YYYY-MM-DD', 'YYYY-MM' or 'YYYY' — as precise as the sentence was. */
  start: string;
  end: string | 'present';
  precision: Precision;
  /** The sentence in projects.ts / experience.ts this was read from. */
  source: string;
};

export const PROJECT_PERIODS: Record<string, Period> = {
  'ai-nail-platform': {
    start: '2025-09',
    end: 'present',
    precision: 'month',
    source: '營運後台前端:2025 年 9 月起接手為唯一貢獻者',
  },
  'naily-app': {
    start: '2025-11',
    end: 'present',
    precision: 'month',
    source: '2025 年 11 月起由我接手 App 前端的開發與維護',
  },
  'microservices-platform': {
    start: '2025-01',
    end: 'present',
    precision: 'month',
    source: '2025 年 1 月專案創始即參與,2025 年 9 月起為唯一主力',
  },
  'nkust-alumni': {
    start: '2024',
    end: 'present',
    precision: 'year',
    source: '2024 年起開發,現於校方網域營運中',
  },
  'nkust-borrow': {
    start: '2025',
    end: 'present',
    precision: 'year',
    source: '2025 年起獨立開發並部署',
  },
  'naily-storefront': {
    start: '2026-01',
    end: 'present',
    precision: 'month',
    source: '2026 年初的重構把 5 步驟的客製化流程重做為 3 步',
  },
  'four-times-for-cook': {
    start: '2024',
    end: '2024',
    precision: 'year',
    source: '2024 年於計畫期間獨立開發原始三件式',
  },
  'helmet-detect': {
    start: '2024-06',
    end: '2024-06',
    precision: 'month',
    source: '2024 年 6 月是一支能跑通「上傳 → 推論」的 PHP + Flask 原型',
  },
  'food-selector': {
    start: '2024-06',
    end: '2024-06',
    precision: 'month',
    source: '2024 年 6 月的 20 個 commit 是課堂期的 Lumen 後端',
  },
  // The two short ones. Their case studies name the exact days, which is the
  // whole point of them — a six-day build is only interesting if you can see
  // that it was six days.
  'field-sales-pwa': {
    start: '2026-07-10',
    end: '2026-07-15',
    precision: 'day',
    source: '獨立開發:從空 repo 到部署共 6 天(2026/07/10–07/15),全部 commit 出自我一人',
  },
  'agm-evoting-system': {
    start: '2026-04-04',
    end: '2026-04-12',
    precision: 'day',
    source: '獨立開發:11 個 commit 全數出自我(2026/04/04–04/12)',
  },
  'retail-pos': {
    start: '2026-04',
    end: '2026-07',
    precision: 'month',
    source: '前後端獨立開發(2026/04–07,前端 93、後端 20 個 commit 皆出自我一人)',
  },
  'b2b-wholesale-platform': {
    start: '2025-10',
    end: '2026-07',
    precision: 'month',
    source: '(2025/10–2026/07):12 個業務模組的資料模型與 API、金流串接與退款鏈路',
  },
  'ecobao': {
    start: '2023',
    end: '2023',
    precision: 'year',
    source: 'experience.ts:以環飽 EcoBǎo 剩食訂購平台專題,代表商業發展研究院發表(2023)',
  },
};

/**
 * A second pass over an older project — the rewrite that made it public.
 *
 * Drawn as its own span rather than stretching the first one across the gap:
 * a bar from 2024 to 2026 would say the work ran for two years, and it did not.
 */
export const REWORK_PERIODS: Record<string, Period> = {
  'helmet-detect': {
    start: '2026',
    end: '2026',
    precision: 'year',
    source: '2026 年的工作是把它重整成 backend/ 與 frontend/ 的完整專案',
  },
  'food-selector': {
    start: '2026-07',
    end: '2026-07',
    precision: 'month',
    source: '2026 年這一輪的工作是把它重新整理成能拿出來看的作品',
  },
  'four-times-for-cook': {
    start: '2026',
    end: '2026',
    precision: 'year',
    source: '近期重構(案例文中所述的公開作品集整理)',
  },
};

/**
 * Projects whose dates are not stated anywhere in the content.
 *
 * Listed explicitly so the gap is visible in code review rather than showing
 * up as a silently missing bar.
 */
export const UNDATED = [
  // No date is stated anywhere in its case study.
  'hris-saas',
  // Not a project with a start and an end — it is how the other work is done.
  'ai-workflow',
] as const;
