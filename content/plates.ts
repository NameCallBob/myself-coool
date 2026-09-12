import type { Localized } from './projects';

/**
 * Framed plates for the wall.
 *
 * Every plate is something that actually happened in one of my repos — a
 * number, a bug, a decision. None of it is borrowed imagery: the wall stays
 * copyright-clean, and the joke lands harder because it is all true.
 *
 * A random subset is hung on each load, so the wall is never the same twice.
 */
export type Plate = {
  /** The big thing — a figure, a flag, a line of code. */
  value: string;
  /** What it was. */
  note: Localized;
};

export const PLATES: Plate[] = [
  {
    value: '2,271',
    note: { zh: '筆遷移失敗,根因只有一種:空欄位', en: 'failed rows. One root cause: an empty field' },
  },
  {
    value: '87.5%',
    note: { zh: '驗收通過率。沒過的也寫在案例頁上', en: 'acceptance pass rate. The rest is on the page too' },
  },
  {
    value: 'AllowAny',
    note: { zh: '→ default-deny。順序錯了,攻擊面就全開', en: '→ default-deny. Wrong order opens everything' },
  },
  {
    value: 'argmax(-1)',
    note: { zh: '取錯軸。訓練看起來在跑,數字沒有意義', en: 'wrong axis. It looked like training. It meant nothing' },
  },
  {
    value: 'text-base',
    note: { zh: '撞到 Tailwind 保留字,全站白底白字', en: 'collided with a Tailwind scale word. White on white' },
  },
  {
    value: 'SEC-001‑030',
    note: { zh: '上線前一條一條修完', en: 'closed one by one before launch' },
  },
  {
    value: '728',
    note: { zh: '個端點,驗收時真的每個都打過', en: 'endpoints, every one actually exercised' },
  },
  {
    value: 'cache_key',
    note: { zh: '少了身分維度。快取設計就是權限設計', en: 'missing the identity dimension. Cache is authorization' },
  },
  {
    value: '03:47',
    note: { zh: '一個我不該還醒著的 commit 時間', en: 'a commit timestamp I should not have been awake for' },
  },
  {
    value: '5,256 → 230',
    note: { zh: '行。訂單詳情拆完之後', en: 'lines. Order detail, after the split' },
  },
  {
    value: 'no Celery',
    note: { zh: '沒有 Redis,沒有 scheduler。架構圖照實畫', en: 'no Redis, no scheduler. The diagram draws the absence' },
  },
  {
    value: '10 MB',
    note: { zh: '自架字型。LCP 最大的一根釘子', en: 'of self-hosted fonts. The LCP nail' },
  },
  {
    value: '1,181',
    note: { zh: '個後端測試,跑在一台 VPS 上', en: 'backend tests, all on one VPS' },
  },
  {
    value: 'CHANGELOG',
    note: { zh: '事後補寫的,日期跟 commit 對不上', en: 'backfilled. Dates never matched the commits' },
  },
  {
    value: '198 / 121',
    note: { zh: '別人的 commit / 我接手後的 commit', en: 'their commits / mine after the takeover' },
  },
  {
    value: 'CRA + 自刻 SSG',
    note: { zh: '能動,但綁死一個 Chrome 版本', en: 'worked, but pinned to one Chrome build' },
  },
  {
    value: '241',
    note: { zh: '個資料模型,186 個帶租戶欄位', en: 'models. 186 carry a tenant column' },
  },
  {
    value: '假資料',
    note: { zh: '顯示在正式畫面上。那是我趕功能欠的債', en: 'shown in a real screen. Debt I racked up' },
  },
  {
    value: 'Ubuntu',
    note: { zh: '從大三顧到現在', en: 'boxes I have kept alive since my third year' },
  },
  {
    value: '9,138',
    note: { zh: '筆資料,一個週末搬完', en: 'rows, migrated over one weekend' },
  },
  {
    value: '$table',
    note: { zh: '沒釘死,三個模型的每一次查詢都必定失敗', en: 'unpinned. Every query through three models failed' },
  },
  {
    value: '17',
    note: { zh: '個專案。有幾個我現在不想再看', en: 'projects. A few I would rather not reread' },
  },
];
