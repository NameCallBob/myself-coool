/**
 * Project content — single source of truth for /work, home §01,
 * JSON-LD, and sitemap.
 *
 * 內容原則:全部欄位皆來自 2026-07-16 對三個實際 repo 的程式碼分析,
 * 無捏造數據;「⚠ 待確認」標示需 binbin 核實的描述(主要是角色範圍)。
 * hris 為公司內部專案:不揭露客戶名稱、網域與內部細節。
 */
export type Localized = { zh: string; en: string };

export type CaseStudy = {
  problem: Localized[];
  constraints: Localized[];
  architecture: Localized[];
  responsibilities: Localized[];
  challenges: { c: Localized; s: Localized }[];
  facts: { value: string; label: Localized }[];
  lessons: Localized[];
};

export type Project = {
  slug: string;
  title: Localized;
  oneLiner: Localized;
  scope: Localized;
  stack: string[];
  keyMetric?: { value: string; label: Localized };
  links?: { live?: string; repo?: string };
  featured: boolean;
  caseStudy?: CaseStudy;
};

export const PROJECTS: Project[] = [
  {
    slug: 'hris-saas',
    title: {
      zh: '多租戶 SaaS 人資系統',
      en: 'Multi-tenant SaaS HRIS',
    },
    oneLiner: {
      zh: '涵蓋出勤、排班、薪資、簽核到招募訓練的企業級人資平台,Web + iOS 雙端。',
      en: 'An enterprise HR platform — attendance, scheduling, payroll, approvals, recruiting — on web and iOS.',
    },
    scope: { zh: '公司內部 · 企業級 SaaS', en: 'Internal · Enterprise SaaS' },
    stack: ['DJANGO', 'MYSQL', 'REDIS', 'CELERY', 'REACT', 'SWIFT'],
    keyMetric: { value: '214', label: { zh: '資料模型', en: 'data models' } },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '服務業組織的人資流程極度分散:出勤打卡、排班、請假加班、薪資與保險試算、簽核、招募與訓練,通常散落在紙本與多套工具之間。目標是一套多租戶 SaaS,讓多個組織在同一平台上各自安全地運作完整的 HR 流程。',
          en: 'HR in service-industry organizations is scattered across paper and disconnected tools — punch clocks, shift scheduling, leave, payroll and insurance runs, approvals, recruiting and training. The goal: one multi-tenant SaaS where multiple organizations run their entire HR flow, each in strict isolation.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開。',
          en: 'Company-internal project; the codebase is not public.',
        },
        {
          zh: '人資資料高度敏感:需欄位級加密、MFA、完整稽核軌跡與法遵要求。',
          en: 'HR data is highly sensitive: field-level encryption, MFA, full audit trails and compliance requirements.',
        },
        {
          zh: '多租戶必須做到嚴格隔離——任何一條查詢漏掉租戶條件都是資料外洩。',
          en: 'Multi-tenancy demands strict isolation — a single query missing its tenant filter is a data breach.',
        },
      ],
      architecture: [
        {
          zh: '模組化單體:Django 4.2 依領域切成約 41 個 app(出勤、排班、薪資、簽核、招募、資產、報表⋯),共約 214 個資料模型、549 條 API 路由。刻意不拆微服務——單一交易邊界讓薪資與簽核這類跨模組流程簡單得多。',
          en: 'A modular monolith: Django 4.2 split into ~41 domain apps (attendance, scheduling, payroll, approvals, recruiting, assets, reports…), totaling ~214 models and ~549 API routes. Deliberately not microservices — one transaction boundary keeps cross-module flows like payroll and approvals simple.',
        },
        {
          zh: '多租戶採 shared-schema、row-level 隔離:middleware 依 header 或子網域解析租戶,所有業務模型繼承 TenantAwareModel;權限為 5 級角色階層加約 20 個 DRF permission class。非同步層以 Celery(約 96 個任務)+ beat 排程處理班表產生、出勤歸檔、年終與保險試算;Channels WebSocket 推播即時通知;可觀測性用 Prometheus / Grafana / Loki / Sentry。',
          en: 'Multi-tenancy is shared-schema with row-level isolation: middleware resolves the tenant from headers or subdomain, and every business model inherits TenantAwareModel. Authorization is a 5-tier role hierarchy plus ~20 DRF permission classes. Async work runs on Celery (~96 tasks) with beat schedules — shift generation, attendance archiving, year-end and insurance runs; Channels WebSockets push realtime notifications; observability via Prometheus / Grafana / Loki / Sentry.',
        },
      ],
      responsibilities: [
        {
          zh: '後端開發:資料模型、API、多租戶與權限機制、背景任務。(範圍待補充)',
          en: 'Backend development: data models, APIs, multi-tenancy and permissions, background jobs. (scope to be detailed)',
        },
      ],
      challenges: [
        {
          c: {
            zh: '多租戶隔離不能靠「記得加 where 條件」。',
            en: "Tenant isolation can't depend on remembering a WHERE clause.",
          },
          s: {
            zh: '把隔離下沉到基底:TenantAwareModel + middleware 統一解析租戶,搭配租戶存取日誌稽核,讓「忘記過濾」在架構層面變得困難。',
            en: 'Push isolation into the base layer: TenantAwareModel plus middleware-resolved tenant context, backed by tenant-access audit logs — forgetting the filter becomes structurally hard.',
          },
        },
        {
          c: {
            zh: '人資資料的安全要求遠高於一般業務系統。',
            en: 'HR data demands far stronger security than typical business systems.',
          },
          s: {
            zh: '欄位級 Fernet 加密、TOTP MFA、JWT blacklist、速率限制與帳號鎖定,稽核日誌依 ISO 27001 A.12.4.1 設計並以 Celery 非同步寫入避免拖慢請求。',
            en: 'Field-level Fernet encryption, TOTP MFA, JWT blacklisting, rate limiting and account lockout; audit logging designed to ISO 27001 A.12.4.1 and written asynchronously via Celery to keep requests fast.',
          },
        },
        {
          c: {
            zh: '排班與薪資是重計算,不能卡在請求路徑上。',
            en: "Scheduling and payroll are heavy computations that can't block the request path.",
          },
          s: {
            zh: '全部任務化:Celery + beat 排程班表自動產生、出勤歸檔、保險與年終批次,報表產出也非同步化。',
            en: 'Everything becomes a task: Celery + beat schedules auto-generate shifts, archive attendance, run insurance and year-end batches; report generation is async too.',
          },
        },
      ],
      facts: [
        { value: '41', label: { zh: '領域模組', en: 'domain modules' } },
        { value: '214', label: { zh: '資料模型', en: 'data models' } },
        { value: '549', label: { zh: 'API 路由', en: 'API routes' } },
        { value: '96', label: { zh: 'Celery 任務', en: 'Celery tasks' } },
      ],
      lessons: [
        {
          zh: '快取 key 必須包含身分維度——曾修正一個薪資快取未依使用者與角色隔離的問題。在多租戶系統裡,快取設計就是權限設計。',
          en: 'Cache keys must carry identity — we fixed a payroll cache that was not keyed by user and role. In a multi-tenant system, cache design is authorization design.',
        },
        {
          zh: '「模組化單體」對這個規模是對的:41 個模組共享一個交易邊界,複雜度花在領域切分而不是網路呼叫上。',
          en: 'A modular monolith was right at this scale: 41 modules share one transaction boundary, spending complexity on domain boundaries instead of network calls.',
        },
      ],
    },
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
    featured: true,
    // 開發中專案,case study 待專案內容可公開時補上
  },
  {
    slug: 'nkust-alumni',
    title: {
      zh: '高科大智慧商務系系友會平台',
      en: 'NKUST Alumni Association Platform',
    },
    oneLiner: {
      zh: '系友名錄、傑出系友、系友企業與徵才的正式官網,已上線營運。',
      en: 'The official alumni site — member directory, distinguished alumni, alumni companies and job board. Live in production.',
    },
    scope: { zh: '正式營運 · 全端 + 維運', en: 'In production · Full stack + ops' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REDIS', 'REACT'],
    keyMetric: { value: '100+', label: { zh: 'API endpoints', en: 'API endpoints' } },
    links: { live: 'https://aaic.nkust.edu.tw' },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '系友會需要一個正式對外的官網:系友名錄與個人檔案、傑出系友、系友企業與產品、徵才刊登、電子報與會務資訊——內容要能被搜尋引擎索引,且由非技術背景的幹部自行維護。',
          en: 'The alumni association needed an official public site: member directory and profiles, distinguished alumni, alumni-owned companies and products, job postings, newsletters and association info — indexable by search engines and maintainable by non-technical staff.',
        },
      ],
      constraints: [
        {
          zh: '掛在校方網域(aaic.nkust.edu.tw)正式對外,資安與穩定性要求高。',
          en: 'Served on a university domain (aaic.nkust.edu.tw) — public, with high security and stability expectations.',
        },
        {
          zh: '主機資源有限,沒有容器編排;部署與維運都要輕。',
          en: 'Limited server resources and no container orchestration; deployment and ops had to stay light.',
        },
      ],
      architecture: [
        {
          zh: 'Django 5 + DRF 單體(11 個業務 app、約 39 個模型、100+ endpoints)搭配 React 18 SPA。權限採 deny-by-default:全域預設 IsAuthenticated,公開端點逐一顯式標註;JWT 走 HttpOnly cookie。Redis 快取熱門查詢,nginx 反向代理加完整安全標頭。',
          en: 'A Django 5 + DRF monolith (11 business apps, ~39 models, 100+ endpoints) with a React 18 SPA. Authorization is deny-by-default: IsAuthenticated globally, public endpoints explicitly opted in; JWT rides in HttpOnly cookies. Redis caches hot queries; nginx reverse-proxies with a full set of security headers.',
        },
        {
          zh: '自建監控子系統:middleware 記錄請求、錯誤與效能指標,GeoIP 標註來源國別,管理員信件告警;日誌以每日輪替 + gzip 壓縮保存一年。',
          en: 'A custom monitoring subsystem: middleware records requests, errors and performance metrics, GeoIP enriches origin country, and admins get email alerts; logs rotate daily with gzip compression, retained for a year.',
        },
      ],
      responsibilities: [
        {
          zh: '全端開發與維運:資料模型、API、權限與資安整改、前端、部署與監控。(⚠ 團隊分工待確認)',
          en: 'Full-stack development and operations: data models, APIs, security hardening, frontend, deployment and monitoring. (team split to be confirmed)',
        },
      ],
      challenges: [
        {
          c: {
            zh: '對外站台每天都被掃描與濫用嘗試。',
            en: 'A public site gets scanned and abused daily.',
          },
          s: {
            zh: '分級 throttling(登入 10/min、註冊 10/hr、聯絡表單 20/hr)、代理層信任設定取真實 IP、SEC 編號的資安整改流程,並為 IDOR 與權限提升寫回歸測試。',
            en: 'Scoped throttling (login 10/min, registration 10/hr, contact 20/hr), trusted-proxy handling for real client IPs, a numbered security-remediation process, and regression tests for IDOR and privilege escalation.',
          },
        },
        {
          c: {
            zh: 'SPA 天生對 SEO 不利,但系友會官網必須被搜得到。',
            en: 'SPAs are bad at SEO by default, but an alumni site must be findable.',
          },
          s: {
            zh: 'Build 後 prerender 靜態頁、SEO helper 與 GA 事件,後端另設 seo app 管理索引內容。',
            en: 'Post-build prerendering, SEO helpers and GA events, plus a backend seo app managing indexable content.',
          },
        },
        {
          c: {
            zh: '通知信一旦寄丟,就是會務事故。',
            en: 'A lost notification email is an operational incident.',
          },
          s: {
            zh: '以 Resend API 為主、SMTP 為備援的雙通道寄信,帳號建立、密碼重設與登入通知都有模板與紀錄。',
            en: 'Dual-channel email — Resend API primary with SMTP fallback — with templates and logging for account, password-reset and login notifications.',
          },
        },
      ],
      facts: [
        { value: '11', label: { zh: '業務模組', en: 'business apps' } },
        { value: '100+', label: { zh: 'API endpoints', en: 'API endpoints' } },
        { value: '43', label: { zh: 'Playwright E2E', en: 'Playwright E2E specs' } },
        { value: 'CI', label: { zh: '前後端皆有', en: 'on both repos' } },
      ],
      lessons: [
        {
          zh: '快取要跟量測一起上——部分熱點快取因為沒有數據支撐先被關掉了。先量測、再快取,順序不能反。',
          en: 'Ship caching with measurement — some hot-path caches were disabled because nothing proved them out. Measure first, cache second; the order is not negotiable.',
        },
      ],
    },
  },
  {
    slug: 'nkust-borrow',
    title: {
      zh: '高科大設備借用管理系統',
      en: 'NKUST Equipment Borrowing System',
    },
    oneLiner: {
      zh: '從條碼借還、逾期賠償到現金核帳的完整設備管理系統,含稽核軌跡。',
      en: 'Barcode-driven borrowing, overdue and compensation handling, cash reconciliation — with a full audit trail.',
    },
    scope: { zh: '正式營運 · 全端', en: 'In production · Full stack' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REACT', 'PLAYWRIGHT'],
    keyMetric: { value: '79', label: { zh: '自動化測試檔', en: 'test files' } },
    links: { live: 'https://equipment-borrowing.binbinbob.work' },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '設備借還原本靠人工與紙本:設備狀態、逾期追蹤、損壞賠償、押金與現金收支都難以核對。需要一套從借出到歸還、從賠償到結算都留有紀錄、可稽核的系統。',
          en: 'Equipment lending ran on paper: equipment status, overdue tracking, damage compensation and cash handling were nearly impossible to reconcile. The unit needed a system where everything — from checkout to return, compensation to settlement — is recorded and auditable.',
        },
      ],
      constraints: [
        {
          zh: '要承接舊系統的資料庫,資料不乾淨且結構不同。',
          en: "Had to absorb a legacy database with messy, structurally different data.",
        },
        {
          zh: '櫃檯借還是高頻操作,使用者非技術背景,流程必須秒級完成。',
          en: 'Front-desk lending is high-frequency and operated by non-technical staff — each transaction must take seconds.',
        },
      ],
      architecture: [
        {
          zh: 'Django 5 + DRF 單體,依領域切成 15 個 app(borrowing、finance、audit、inventory、kits⋯),React 19 + Ant Design SPA。JWT 放 HttpOnly cookie 並做 refresh rotation 與 blacklist;RBAC 以 Role/Capability 建模;自訂 middleware 疊層處理安全標頭、輸入清洗、速率限制與請求記錄。',
          en: 'A Django 5 + DRF monolith split into 15 domain apps (borrowing, finance, audit, inventory, kits…) with a React 19 + Ant Design SPA. JWT lives in HttpOnly cookies with refresh rotation and blacklisting; RBAC is modeled as Roles and Capabilities; a custom middleware stack handles security headers, input sanitization, rate limiting and request logging.',
        },
        {
          zh: '稽核是獨立子系統:4 個稽核模型加 signals 與 middleware,自動記錄模型變更與使用者活動;金流模組涵蓋帳戶、交易、結算期與現金核帳。',
          en: 'Auditing is its own subsystem: four audit models plus signals and middleware automatically record model changes and user activity; the finance module covers accounts, transactions, settlement periods and cash verification.',
        },
      ],
      responsibilities: [
        {
          zh: '全端獨立開發:資料模型、API、權限、前端、測試策略與部署(nginx + gunicorn + Cloudflare)。(⚠ 待確認)',
          en: 'Independent full-stack development: data models, APIs, permissions, frontend, test strategy and deployment (nginx + gunicorn + Cloudflare). (to be confirmed)',
        },
      ],
      challenges: [
        {
          c: {
            zh: '舊系統資料直接匯入會污染新 schema。',
            en: 'Importing legacy data directly would poison the new schema.',
          },
          s: {
            zh: '寫了一組遷移工具:mapper 轉換、verifier 驗證、批次執行並產出遷移報告,舊庫以獨立 connection 隔離。',
            en: 'Built a migration toolkit — mappers to transform, verifiers to check, batched runs with generated reports — keeping the legacy DB behind a separate connection.',
          },
        },
        {
          c: {
            zh: '櫃檯人工輸入太慢,高峰期會排隊。',
            en: 'Manual entry at the desk was too slow; peak hours meant queues.',
          },
          s: {
            zh: '整條流程改為條碼驅動:後端產生設備條碼、前端列印與 @zxing 掃描,一掃帶出設備與借用單,借還各只需幾秒。',
            en: 'Made the whole flow barcode-driven: backend-generated equipment barcodes, printable labels, @zxing scanning — one scan pulls up the equipment and ticket, cutting each transaction to seconds.',
          },
        },
        {
          c: {
            zh: '設備與金錢的每一步都需要留下可稽核的軌跡。',
            en: 'Every movement of equipment and money needs an auditable trail.',
          },
          s: {
            zh: '獨立 audit app 以 signals + middleware 自動記錄;賠償與現金核帳走結算期制,對不上的帳有跡可循。',
            en: 'A dedicated audit app records everything via signals and middleware; compensation and cash flows run through settlement periods, so discrepancies are traceable.',
          },
        },
      ],
      facts: [
        { value: '15', label: { zh: '領域模組', en: 'domain apps' } },
        { value: '85+', label: { zh: '自訂 API actions', en: 'custom API actions' } },
        { value: '36', label: { zh: 'Playwright E2E', en: 'Playwright E2E specs' } },
        { value: '~70k', label: { zh: '程式碼行數', en: 'lines of code' } },
      ],
      lessons: [
        {
          zh: 'LocMemCache 在多 worker 下不共享——快取層下一步要搬到 Redis。通知目前只有逾期 email,持久化的通知中心已在規劃。',
          en: "LocMemCache isn't shared across workers — the cache layer's next step is Redis. Notifications are overdue-email only for now; a persistent notification center is planned.",
        },
        {
          zh: '測試是這個專案最值得的投資:36 個 E2E 加單元測試,讓舊資料遷移與 API 調整可以放心地重構。',
          en: 'Tests were the best investment here: 36 E2E specs plus unit tests made the data migration and API changes safe to refactor.',
        },
      ],
    },
  },
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
    scope: { zh: '開發中', en: 'In development' },
    stack: ['DJANGO', 'MYSQL', 'REDIS', 'NGINX'],
    featured: false,
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
    featured: false,
  },
];
