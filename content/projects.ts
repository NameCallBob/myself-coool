/**
 * Project content — single source of truth for /work, home §01,
 * JSON-LD, and sitemap.
 *
 * ⚠ 標示「待補」的欄位需 binbin 提供真實資料後填入;
 *   絕不放置捏造的數據(品牌原則)。
 */
export type Localized = { zh: string; en: string };

export type Project = {
  slug: string;
  title: Localized;
  oneLiner: Localized;
  scope: Localized; // 索引表的 SCOPE 欄
  stack: string[];
  keyMetric?: { value: string; label: Localized };
  /** 八段式內容於資料到齊後補上(Phase 2 §4 模板) */
  ready: boolean;
};

export const PROJECTS: Project[] = [
  {
    slug: 'microservices-platform',
    title: {
      zh: '大型 Django 微服務平台',
      en: 'Large-scale Django Microservices Platform',
    },
    oneLiner: {
      zh: '數十個微服務組成的單一平台:從身分驗證、訂單、庫存到日誌與媒體。',
      en: 'Dozens of services on one platform — auth, orders, inventory, logging, media and more.',
    },
    scope: { zh: '數十個微服務', en: 'Dozens of services' },
    stack: ['DJANGO', 'MYSQL', 'REDIS', 'NGINX'],
    keyMetric: {
      value: '30+',
      label: { zh: '微服務', en: 'services' }, // ⚠ 待補:實際數量
    },
    ready: false,
  },
  {
    slug: 'ai-nail-platform',
    title: { zh: 'AI 美甲平台', en: 'AI Nail Platform' },
    oneLiner: {
      zh: 'AI 指甲辨識、AR 試戴、設計師平台到 CRM 與 POS 的完整商業系統。',
      en: 'From AI nail recognition and AR try-on to designer marketplace, CRM and POS.',
    },
    scope: { zh: 'AI × AR × 商城 × POS', en: 'AI × AR × Commerce × POS' },
    stack: ['AI', 'AR', 'DJANGO', 'B2B'],
    ready: false,
  },
  {
    slug: 'react-admin',
    title: { zh: 'React 大型後台系統', en: 'Large-scale React Admin' },
    oneLiner: {
      zh: '支撐整個平台營運的大型管理後台。',
      en: 'The admin console that runs the whole platform.',
    },
    scope: { zh: '平台營運後台', en: 'Operations console' },
    stack: ['REACT', 'REST API'],
    ready: false,
  },
  {
    slug: 'flutter-commerce',
    title: { zh: 'Flutter 電商 App', en: 'Flutter Commerce App' },
    oneLiner: {
      zh: '跨平台電商應用,串接平台微服務。',
      en: 'Cross-platform commerce app backed by the microservices platform.',
    },
    scope: { zh: '跨平台電商', en: 'Cross-platform commerce' },
    stack: ['FLUTTER', 'REST API'],
    ready: false,
  },
  {
    slug: 'ai-workflow',
    title: { zh: 'AI 開發工作流', en: 'AI Development Workflow' },
    oneLiner: {
      zh: '以 AI Agent 執行 Code Review、Security Review、效能與架構審查及文件生成。',
      en: 'AI agents running code, security, performance and architecture reviews — plus docs.',
    },
    scope: { zh: 'AI Agents × Review', en: 'AI Agents × Review' },
    stack: ['AI AGENTS', 'AUTOMATION'],
    ready: false,
  },
];
