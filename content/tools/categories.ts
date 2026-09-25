import type { Category } from './types';

/**
 * Ten drawers, ten instruments each. The order is the order of the index and
 * the order of the part numbers — A through J — so a number alone tells you
 * which drawer a tool came out of.
 */
export const CATEGORIES: Category[] = [
  {
    id: 'text',
    letter: 'A',
    name: { zh: '文字處理', en: 'Text' },
    note: {
      zh: '數、排、比、洗。處理別人丟過來的一坨字。',
      en: 'Count it, sort it, compare it, clean it.',
    },
  },
  {
    id: 'encode',
    letter: 'B',
    name: { zh: '編碼轉換', en: 'Encoding' },
    note: {
      zh: '同一串位元的不同寫法之間來回。',
      en: 'Moving between ways of writing the same bytes.',
    },
  },
  {
    id: 'data',
    letter: 'C',
    name: { zh: '資料格式', en: 'Data formats' },
    note: {
      zh: 'JSON 與它的鄰居們:驗證、查詢、互轉、生成型別。',
      en: 'JSON and its neighbours — validate, query, convert, type.',
    },
  },
  {
    id: 'dev',
    letter: 'D',
    name: { zh: '開發者', en: 'Developer' },
    note: {
      zh: '每天開著的那幾個分頁。',
      en: 'The tabs that stay open all day.',
    },
  },
  {
    id: 'crypto',
    letter: 'E',
    name: { zh: '密碼與安全', en: 'Crypto' },
    note: {
      zh: '亂數來自 getRandomValues,原語一律走 WebCrypto,沒有自製密碼學。',
      en: 'Randomness from getRandomValues, primitives from WebCrypto. Nothing hand-rolled.',
    },
  },
  {
    id: 'time',
    letter: 'F',
    name: { zh: '時間與日期', en: 'Time' },
    note: {
      zh: '時區、工作日、民國年,以及會議前的倒數。',
      en: 'Zones, working days, and the countdown before a meeting.',
    },
  },
  {
    id: 'calc',
    letter: 'G',
    name: { zh: '計算與換算', en: 'Calculate' },
    note: {
      zh: '單位、利率、帳單、抽籤。算式解析器自己寫,不用 eval。',
      en: 'Units, interest, bills, draws. The expression parser is hand-written — no eval.',
    },
  },
  {
    id: 'design',
    letter: 'H',
    name: { zh: '顏色與設計', en: 'Colour' },
    note: {
      zh: 'OKLCH 色階、WCAG 對比、CSS 產生器。',
      en: 'OKLCH ramps, WCAG contrast, CSS generators.',
    },
  },
  {
    id: 'media',
    letter: 'I',
    name: { zh: '圖片與檔案', en: 'Media' },
    note: {
      zh: 'Canvas 與 Worker 就地處理。檔案沒有上傳這個選項。',
      en: 'Canvas and Workers, in place. There is no upload button.',
    },
  },
  {
    id: 'net',
    letter: 'J',
    name: { zh: '網路與生活', en: 'Network & life' },
    note: {
      zh: '純算術的網路計算,加上幾件下班後也用得到的。',
      en: 'Network arithmetic, plus a few things for after work.',
    },
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
