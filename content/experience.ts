import type { Localized } from './projects';

/** Experience — real, verified data. */
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
      en: 'Manience Inc.',
    },
    role: { zh: '全端開發', en: 'Full-Stack Developer' },
    period: '2025.06 — PRESENT',
    summary: {
      zh: '負責 AI 美甲平台與 Django 微服務平台的全端設計與開發:從資料庫、API、前端到 AI 整合。',
      en: 'Full-stack design and development for the AI nail platform and the Django microservices platform — from database schemas and APIs to frontends and AI integration.',
    },
  },
  {
    org: {
      zh: '國立高雄科技大學 智慧商務系',
      en: 'NKUST — Dept. of Intelligent Commerce',
    },
    role: { zh: '在學學生', en: 'Undergraduate student' },
    period: '— PRESENT',
    summary: {
      zh: '一邊完成學業,一邊建造真實上線的系統——系友會平台與設備借用系統都在校內正式營運中。',
      en: 'Finishing my degree while shipping real systems — the alumni platform and the equipment borrowing system both run in production on campus.',
    },
  },
  {
    org: {
      zh: 'DIGI⁺Talent 跨域數位人才加速躍升計畫',
      en: 'DIGI⁺Talent Cross-domain Digital Talent Program',
    },
    role: {
      zh: '學員 · 代表商業發展研究院(商研院)發表',
      en: 'Trainee · presented on behalf of CDRI',
    },
    period: '2023',
    summary: {
      zh: '參與經濟部 DIGI⁺Talent 跨域數位人才計畫,以環飽 EcoBǎo 剩食訂購平台專題,代表商業發展研究院(商研院)對外發表成果。',
      en: 'Took part in the MOEA DIGI⁺Talent program and, with the EcoBǎo food-surplus marketplace project, presented the results on behalf of the Commerce Development Research Institute (CDRI).',
    },
  },
  {
    org: {
      zh: '國立科學工藝博物館 × 教育部 113 年度 AI 健康應用計畫',
      en: 'National Science and Technology Museum × MOE 2024 AI Health Application Program',
    },
    role: { zh: '參與學生 · 全端 + AI 模型開發', en: 'Participating student · full-stack + AI model' },
    period: '2024',
    summary: {
      zh: '以「四時煮食時」食療推薦與健康管理平台參與科工館與教育部的 AI 健康應用計畫,獨立開發 Django 後端、React 前端與 BERT 實體標記推薦模型。',
      en: 'Took part in the museum × MOE AI Health Application program with “Four Times for Cook”, a food-therapy recommendation and health-management platform — independently building the Django backend, React frontend and a BERT entity-tagging recommendation model.',
    },
  },
];
