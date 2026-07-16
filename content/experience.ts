import type { Localized } from './projects';

/**
 * 經歷 — 真實資料。
 * ⚠ 學校名稱與更完整的 highlight 數據待 binbin 提供。
 */
export type Experience = {
  org: Localized;
  role: Localized;
  period: string;
  summary: Localized;
};

export const EXPERIENCE: Experience[] = [
  {
    org: {
      zh: '日秀美學股份有限公司',
      en: 'Rissiu Aesthetics Co., Ltd.', // ⚠ 待確認公司英文名
    },
    role: { zh: '後端開發', en: 'Backend Developer' },
    period: '2025.06 — PRESENT',
    summary: {
      zh: '負責 AI 美甲平台與 Django 微服務平台的後端設計與開發:從資料庫設計、API 到 AI 整合。',
      en: 'Backend design and development for the AI nail platform and the Django microservices platform — from database schemas and APIs to AI integration.',
    },
  },
  {
    org: { zh: '在學中', en: 'Student' }, // ⚠ 待補:學校/科系/預計畢業年
    role: { zh: '資訊相關科系', en: 'Computer Science (TBC)' },
    period: '— PRESENT',
    summary: {
      zh: '一邊完成學業,一邊在業界建造真實的生產系統。',
      en: 'Finishing my degree while building real production systems in industry.',
    },
  },
];
