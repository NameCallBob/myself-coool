/**
 * Project content — single source of truth for /work, home §01,
 * JSON-LD, and sitemap.
 *
 * Every field is sourced from repo/git-history analysis per
 * docs/content-request.md; each number is independently re-verifiable.
 * Tone: state what actually happened — no exaggeration, no invented
 * metrics. Confidentiality boundaries for internal-company projects
 * are documented in docs/content-request.md.
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

export type Screenshot = { src: string; alt: Localized; caption: Localized };

/** Architecture / flow diagram derived from the real codebase (SVG, Mermaid-authored) */
export type Diagram = { src: string; alt: Localized; caption: Localized };

export type Project = {
  slug: string;
  title: Localized;
  oneLiner: Localized;
  scope: Localized;
  stack: string[];
  keyMetric?: { value: string; label: Localized };
  links?: { live?: string; repo?: string; appStore?: string; googlePlay?: string };
  featured: boolean;
  /** public = live site or repo can be shown; internal = company project, case-study only */
  visibility: 'public' | 'internal';
  /** Nature of the work: full-stack / backend / frontend / mobile app / AI tooling */
  domain: 'fullstack' | 'backend' | 'frontend' | 'mobile' | 'ai';
  caseStudy?: CaseStudy;
  /** Screenshots — always mock/synthetic data, never real PII */
  screenshots?: Screenshot[];
  /** Architecture diagrams — for backend/ML work that has no UI worth showing */
  diagrams?: Diagram[];
};

export const PROJECTS: Project[] = [
  {
    slug: 'hris-saas',
    domain: 'fullstack',
    visibility: 'internal',
    title: {
      zh: '多租戶 SaaS 人資系統',
      en: 'Multi-tenant SaaS HRIS',
    },
    oneLiner: {
      zh: '涵蓋出勤、排班、薪資、簽核到招募的多租戶人資平台,36 個功能模組;目前處於驗收與修復階段。',
      en: 'A multi-tenant HR platform — attendance, scheduling, payroll, approvals, recruiting — across 36 modules; currently in acceptance and remediation.',
    },
    scope: { zh: '公司內部 · 驗收修復階段', en: 'Internal · acceptance stage' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REDIS', 'CELERY', 'REACT'],
    keyMetric: { value: '728', label: { zh: '端點實測', en: 'endpoints tested' } },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '中小企業的 HR 事務常散落在 Excel、紙本簽核與各自為政的工具之間,難以稽核也容易出錯,且每家公司都要重複導入一次。這個系統以多租戶 SaaS 的形態切入:單一部署服務多個組織,各租戶資料嚴格隔離、依訂閱開關功能模組,並內建台灣勞基法的合規檢查。',
          en: 'HR in small and mid-sized companies is scattered across spreadsheets, paper approvals and disconnected tools — hard to audit, easy to get wrong, and re-implemented at every company. This system is a multi-tenant SaaS: one deployment serves multiple organizations with strict data isolation, subscription-gated modules, and built-in Taiwan labor-law compliance checks.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開;目前以合成種子資料進行驗收,尚未正式上線。',
          en: 'Company-internal; the codebase is private. Currently in acceptance with synthetic seed data — not yet in production.',
        },
        {
          zh: '多租戶隔離是硬性要求:任何一條查詢漏掉租戶條件都是資料外洩。',
          en: 'Tenant isolation is non-negotiable — a single query missing its tenant filter is a data breach.',
        },
        {
          zh: '需符合台灣勞基法(工時上限、加班倍率、扣繳)並支援繁中/簡中/英文三語。',
          en: 'Must implement Taiwan labor law (working-hour caps, overtime multipliers, withholding) and support three languages.',
        },
      ],
      architecture: [
        {
          zh: '模組化單體:Django 4.2+ 與 DRF 依領域切成 36 個功能 app(出勤、排班、薪資、簽核、招募、資產、勞健保⋯),241 個資料模型、188 個資源路由,展開後在驗收中實測了 728 個端點。刻意不拆微服務——薪資與簽核這類跨模組流程在單一交易邊界裡簡單得多。',
          en: 'A modular monolith: Django 4.2+ and DRF split into 36 domain apps (attendance, scheduling, payroll, approvals, recruiting, assets, labor insurance…), with 241 models and 188 registered resource routes — 728 concrete endpoints exercised during acceptance. Deliberately not microservices: payroll and approval flows are far simpler inside one transaction boundary.',
        },
        {
          zh: '多租戶採 shared-schema、row-level 隔離:middleware 解析租戶,241 個模型中有 186 個帶租戶欄位、繼承租戶感知基底。非同步層以 Celery + Beat 處理班表產生、出勤歸檔與法規/假日同步;Redis 作快取與 Channel;資料庫可依環境切換 PostgreSQL 或 MySQL;CI 用 GitHub Actions + pre-commit,並附 Prometheus / Grafana / Loki 可觀測性編排。',
          en: 'Multi-tenancy is shared-schema with row-level isolation: middleware resolves the tenant and 186 of the 241 models carry a tenant column by inheriting the tenant-aware base. Async work runs on Celery + Beat — shift generation, attendance archiving, holiday/regulation sync; Redis backs cache and channels; the database switches between PostgreSQL and MySQL per environment. CI runs on GitHub Actions with pre-commit, plus a Prometheus / Grafana / Loki observability stack.',
        },
      ],
      responsibilities: [
        {
          zh: '前後端獨立開發(後端 434、前端 123 個 commit 皆出自我的兩組 git 身分):資料模型與多租戶機制、權限體系、各領域模組、Celery 背景任務、React 前端與 CI。',
          en: 'Independent full-stack development (all 434 backend and 123 frontend commits are mine, across two git identities): data models and multi-tenancy, the permission system, domain modules, Celery jobs, the React frontend and CI.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '驗收階段的資安稽核發現:部分自訂 API action 繞過了租戶過濾,可跨租戶操作帳號。系統從未對外營運,這些問題都在交付前被攔下。',
            en: 'An acceptance-stage security audit found custom API actions bypassing tenant filtering — accounts could be manipulated across tenants. The system has never been in production; these were caught before delivery.',
          },
          s: {
            zh: '把隔離下沉到基底(TenantAwareModel + middleware 統一解析),逐一修補繞過 queryset 的 action。該輪稽核共 35 項發現(含 2 項 Critical)全數確認,30 項修復完成、5 項部分修復,尚待 staging 環境複驗——這個狀態如實記錄。',
            en: 'Isolation was pushed into the base layer (TenantAwareModel plus middleware-resolved context) and every queryset-bypassing action patched. The audit confirmed 35 findings (2 critical); 30 are fixed and 5 partially — pending staging re-verification, recorded as-is.',
          },
        },
        {
          c: {
            zh: '驗收測試期間發現:薪資 API 的快取鍵沒有包含使用者身分——同一個 TTL 窗內,一般員工可能命中管理員的快取,看到全公司薪資。當時跑的是合成種子資料,沒有真實薪資外流。',
            en: "Found during acceptance testing: the payroll API's cache key ignored user identity — within one TTL window, an employee could hit an admin's cached response and see company-wide salaries. The run used synthetic seed data, so no real payroll was ever exposed.",
          },
          s: {
            zh: '在快取裝飾器加入 vary_by_user,把使用者折進快取鍵;並用真實 HTTP 呼叫寫了回歸測試,證明兩個使用者互相看不到彼此的快取。',
            en: 'Added vary_by_user to the cache decorator, folding the user into the key — then wrote a regression test with real HTTP calls proving two users can never see each other’s cache.',
          },
        },
        {
          c: {
            zh: '台灣的國定假日與法規參數每年變動,不能靠人工同步。',
            en: "Taiwan's public holidays and regulatory parameters change yearly — manual syncing doesn't scale.",
          },
          s: {
            zh: 'Celery Beat 排程化:每年同步隔年假日、每日檢查法規到期、每週預告即將到來的假日;任務帶自動重試與指數退避。',
            en: 'Scheduled it with Celery Beat: yearly next-year holiday sync, daily regulation-expiry checks, weekly upcoming-holiday notices — tasks retry automatically with exponential backoff.',
          },
        },
      ],
      facts: [
        { value: '36', label: { zh: '功能模組', en: 'domain modules' } },
        { value: '241', label: { zh: '資料模型', en: 'data models' } },
        { value: '728', label: { zh: '端點實測', en: 'endpoints tested' } },
        { value: '87.5%', label: { zh: '驗收通過率', en: 'acceptance pass rate' } },
      ],
      lessons: [
        {
          zh: '快取設計就是權限設計——那次薪資快取缺陷的根因,是快取鍵少了身分維度。在多租戶系統裡,這種錯誤不是效能問題,是資料外洩;幸好它在驗收階段就被攔下。',
          en: 'Cache design is authorization design: that payroll cache defect came from a cache key missing the identity dimension. In a multi-tenant system that class of bug is not a performance issue — it is a breach. This one was caught in acceptance.',
        },
        {
          zh: '系統性的漏洞往往來自模型設計:全域角色與租戶角色雙軌並存,連帶引發提權與跨租戶問題。重來一次,我會從第一天就統一以租戶維度設計權限。',
          en: 'Systemic vulnerabilities trace back to model design: dual global-vs-tenant role tracks caused the privilege and cross-tenant issues. Doing it again, I would design permissions on the tenant dimension from day one.',
        },
      ],
    },
    screenshots: [
      {
        src: '/images/work/hris-saas/payroll-management.webp',
        alt: {
          zh: '薪資管理頁:年份/月份/狀態篩選、人數與總薪資 KPI,以及本薪、加項、扣項、實發金額與已計算/已發放狀態的薪資表',
          en: 'Payroll management: year, month and status filters, headcount and total-payroll KPIs, and a table of base pay, additions, deductions, net pay and calculated/paid status',
        },
        caption: {
          zh: '薪資管理:試算、批次建立與匯出收在同一頁。畫面上每一個金額,在資料庫裡都是加密欄位——payroll_records 的 18 個金額欄位全數使用 EncryptedDecimalField。資料為合成種子資料。',
          en: 'Payroll management — trial calculation, batch creation and export on one screen. Every amount shown is an encrypted column underneath: all 18 money fields on payroll_records use EncryptedDecimalField. Synthetic seed data.',
        },
      },
      {
        src: '/images/work/hris-saas/payroll-api-browsable.webp',
        alt: {
          zh: '同一個薪資模組的 DRF browsable API:11 個自訂 action 連結、viewset docstring 渲染出的 OWASP 安全註記,以及 {data, pagination} 信封格式的 JSON 回應',
          en: 'The DRF browsable API for the same payroll module: eleven custom action links, OWASP security notes rendered from the viewset docstring, and a JSON response in the project’s {data, pagination} envelope',
        },
        caption: {
          zh: '同一個薪資模組,從 API 這一側看。頁面上那兩段 OWASP A01/A02 註記是直接由 viewset 的 docstring 渲染出來的:租戶隔離與敏感欄位保護寫在程式碼裡,而不是另一份文件裡。',
          en: 'The same payroll module seen from the API side. The two OWASP A01/A02 notes on the page render straight out of the viewset docstring — tenant isolation and sensitive-field handling are stated in the code itself, not in a separate document.',
        },
      },
      {
        src: '/images/work/hris-saas/recruitment-funnel.webp',
        alt: {
          zh: '招聘儀表板:開放職缺/待處理應徵者/本週面試/待發 Offer 四張 KPI 卡、逐階段標示轉換率的招聘漏斗,以及各職缺的錄取進度',
          en: 'Recruitment dashboard: KPI cards for open roles, candidates to review, interviews this week and pending offers; a hiring funnel labelled with stage-to-stage conversion; and per-opening progress',
        },
        caption: {
          zh: '招聘儀表板:漏斗逐階段標出轉換率,右側是各職缺的錄取進度。數字來自種子資料(3 個職缺、5 位應徵者),不是營運數據。',
          en: 'Recruitment dashboard — the funnel labels conversion at each stage, with per-opening hiring progress alongside. The numbers come from seed data (three openings, five candidates), not from production.',
        },
      },
      {
        src: '/images/work/hris-saas/scheduling-calendar.webp',
        alt: {
          zh: '排班日曆月檢視:月/週/日/列表四種檢視切換、早班/午班/晚班/全天班的色彩圖例,以及自動排班與新增班次',
          en: 'Scheduling calendar in month view: month/week/day/list view switcher, a colour legend for morning, afternoon, night and full-day shifts, and auto-schedule and add-shift actions',
        },
        caption: {
          zh: '排班月檢視,班別以顏色標示。「自動排班」對應後端的 scheduling.generate_monthly_schedules——同一個任務也掛在 Celery Beat 上,每月 25 日產生下個月班表。',
          en: 'Scheduling in month view, shifts colour-coded by type. The auto-schedule button maps to the backend’s scheduling.generate_monthly_schedules — the same task also sits on Celery Beat, generating next month’s roster on the 25th.',
        },
      },
      {
        src: '/images/work/hris-saas/mobile-scheduling-agenda.webp',
        alt: {
          zh: '390px 寬的排班畫面:改為逐日的日程列表版面,配長按拖放提示、底部分頁列與浮動新增按鈕',
          en: 'The scheduling screen at 390px: a day-by-day agenda layout with a long-press drag hint, a bottom tab bar and a floating add button',
        },
        caption: {
          zh: '同一個排班模組在 390px 寬。不是把月曆縮小,而是換成專屬的日程列表版面,導覽也從側邊欄改為底部分頁列。',
          en: 'The same scheduling module at 390px. Not a shrunken month grid — a dedicated agenda layout, with navigation moving from the sidebar to a bottom tab bar.',
        },
      },
      {
        src: '/images/work/hris-saas/openapi-swagger.webp',
        alt: {
          zh: 'drf-spectacular 產生的 Swagger UI,v1 群組展開,列出 tenants 相關的 GET/POST/PUT/PATCH/DELETE 端點',
          en: 'Swagger UI generated by drf-spectacular with the v1 group expanded, listing GET/POST/PUT/PATCH/DELETE endpoints under tenants',
        },
        caption: {
          zh: 'drf-spectacular 由 188 條路由註冊自動產生的 OpenAPI 3.0 文件。截圖只是開頭一小段:整份 schema 有 1,222 條路徑、1,919 個操作,完整渲染高度約 21 萬像素。',
          en: 'The OpenAPI 3.0 document drf-spectacular generates from 188 router registrations. The screenshot is only the opening slice: the full schema has 1,222 paths and 1,919 operations, and renders about 219,000px tall.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/hris-saas/diagram-tenant-isolation.svg',
        alt: {
          zh: '多租戶隔離四層圖:middleware 解析租戶、view 層 TenantFilterMixin 過濾、ORM 層刻意不做隱式 scope,以及四類已修復的歷史繞過路徑',
          en: 'Four-stage tenant isolation: middleware resolves the tenant, the view layer filters via TenantFilterMixin, the ORM deliberately applies no implicit scope, and four classes of historical bypass are shown fixed',
        },
        caption: {
          zh: '這張圖的重點不是「有做隔離」,而是隔離究竟落在哪一層。租戶由 middleware 依序從 header、子網域、使用者主租戶解析,再由 view 層的 TenantFilterMixin 過濾;ORM 刻意不做隱式 scope——TenantAwareManager 只過濾 is_deleted,repo 裡有一條測試專門斷言這件事。代價寫在圖的下半:200 個 viewset 中 155 個繼承過濾 mixin,另外 45 個仍是原生 DRF base、只能逐一手動加條件;而歷史上四類已修復的漏洞,無一例外都發生在 ORM 之上的 view 與 cache 程式碼裡。',
          en: 'The point of this figure is not that isolation exists, but which layer it lives in. Middleware resolves the tenant — header, then subdomain, then the user’s primary tenant — and TenantFilterMixin filters at the view layer. The ORM deliberately carries no implicit scope: TenantAwareManager filters only is_deleted, and a test in the repo exists to assert exactly that. The cost is drawn along the bottom: 155 of 200 viewsets inherit the mixin, the other 45 still sit on raw DRF bases and are scoped by hand — and every one of the four fixed historical leaks happened above the ORM, in view or cache code.',
        },
      },
      {
        src: '/images/work/hris-saas/diagram-system-architecture.svg',
        alt: {
          zh: '執行期架構圖:gunicorn 與 ASGI 兩個入口、Django 請求管線、36 個 app 與非同步層,以及 PostgreSQL/Redis、LDAP/Keycloak 與可觀測性堆疊',
          en: 'Runtime architecture: gunicorn and ASGI entrypoints, the Django request pipeline, 36 apps and the async tier, alongside PostgreSQL/Redis, LDAP/Keycloak and the observability stack',
        },
        caption: {
          zh: '執行期全貌:HTTP 走 gunicorn、WebSocket 走 ASGI,同一條 middleware 管線收斂到 36 個 app、241 個模型(其中 186 個帶租戶欄位)、188 條路由。Redis 一個實例同時扮演快取、session、Celery broker 與 channel layer。右下角的 ELK 被標為 NOT WIRED——docker-compose 定義了這三個服務,但 LOGGING 裡沒有任何 handler 餵它,所以照實畫成虛線。',
          en: 'The runtime as a whole: HTTP through gunicorn, WebSockets through ASGI, both converging on one middleware pipeline into 36 apps, 241 models (186 of them tenant-scoped) and 188 routes. A single Redis instance is simultaneously cache, session store, Celery broker and channel layer. Bottom right, ELK is marked NOT WIRED — docker-compose defines the three services, but no handler in LOGGING feeds them, so it is drawn dashed rather than quietly omitted.',
        },
      },
      {
        src: '/images/work/hris-saas/diagram-leave-request-flow.svg',
        alt: {
          zh: '請假送出與核准的序列圖:交易邊界、假期餘額列的 SELECT ... FOR UPDATE、審計日誌經 Celery 寫入與 WebSocket 推播',
          en: 'Sequence diagram of leave submission and approval: the transaction boundary, SELECT … FOR UPDATE on the balance row, the audit log written through Celery, and the WebSocket push',
        },
        caption: {
          zh: '請假從送出到核准的完整往返。真正值得看的是額度帳本:送出時鎖住餘額列(SELECT ... FOR UPDATE)把 pending_days 加上去,核准時在同一把鎖裡把 pending 轉成 used——取消則反向還原。審計日誌預設丟給 Celery 的 audit_logs 佇列,但 dispatch 失敗會退回同步寫入,不會靜默丟失。',
          en: 'The full round trip of a leave request, from submission to approval. The part worth reading is the balance ledger: submission locks the balance row (SELECT … FOR UPDATE) and adds to pending_days; approval converts pending into used under that same lock, and cancellation reverses it. Audit entries go to Celery’s audit_logs queue by default — but a failed dispatch falls back to a synchronous write rather than disappearing.',
        },
      },
      {
        src: '/images/work/hris-saas/diagram-celery-topology.svg',
        alt: {
          zh: 'Celery 拓撲圖:37 條 beat 排程、task_routes 路由規則、7 個宣告的隊列與 worker,以及 9 條指向未註冊 task 的排程',
          en: 'Celery topology: 37 beat entries, the task_routes rules, seven declared queues and the worker, plus the nine schedule entries naming unregistered tasks',
        },
        caption: {
          zh: '非同步層的實際樣貌:37 條 beat 排程、task_routes 的前綴路由、7 個帶優先級的隊列。這張圖真正的價值在紅色那一區——37 條排程裡有 9 條指向不存在的 task:名稱與 @shared_task 的註冊名不符、模組根本沒建(apps/assets/tasks.py、apps/insurance/tasks.py)、或函式從未定義。另外 emails 隊列沒有任何生產者,crawlers 隊列被排程引用卻不在 task_queues 裡。已知未修,照原樣畫出來。',
          en: 'What the async tier actually looks like: 37 beat entries, prefix-based task_routes, seven priority-tagged queues. The value of the figure is the red band — nine of those 37 entries point at a task that is not registered: the name does not match the @shared_task registration, the module was never created (apps/assets/tasks.py, apps/insurance/tasks.py), or the function is defined nowhere. Separately, the emails queue has no producer, and the crawlers queue is referenced by a schedule but never declared in task_queues. Known and unfixed, drawn as-is.',
        },
      },
      {
        src: '/images/work/hris-saas/diagram-core-erd.svg',
        alt: {
          zh: '18 張核心資料表的 ERD:租戶、成員、員工、組織、請假、出勤、薪資、簽核流程與審計日誌,欄位與資料表名皆為真名',
          en: 'ERD of 18 core tables — tenants, memberships, employees, org units, leave, attendance, payroll, workflow and the audit log — with real table and column names throughout',
        },
        caption: {
          zh: '18 張核心資料表,db_table 與欄位都是真名。圖裡藏著多租戶設計的兩個關鍵決定:accounts_user 上沒有 tenant_id——歸屬完全走 tenants_tenant_user 這張成員表,所以一個帳號可以屬於多個租戶;而 accounts_user.employee_id 是全域唯一,不是每租戶唯一。這兩點合起來,說明了為什麼隔離只能寫在查詢層,而不是靠資料表的唯一鍵擋下來。',
          en: 'Eighteen core tables, with real db_table and column names throughout. Two decisions of the multi-tenant design are visible in it: accounts_user carries no tenant_id — membership lives entirely in the tenants_tenant_user table, so one account can belong to several tenants — and accounts_user.employee_id is globally unique rather than unique per tenant. Together they explain why isolation has to be written at the query layer instead of being caught by a table constraint.',
        },
      },
    ],
  },
  {
    slug: 'ai-nail-platform',
    domain: 'fullstack',
    visibility: 'internal',
    title: { zh: 'AI 美甲平台', en: 'AI Nail Platform' },
    oneLiner: {
      zh: 'AI 指甲辨識、AR 試戴、設計師平台到 CRM 與 POS 的完整商業系統。',
      en: 'From AI nail recognition and AR try-on to designer marketplace, CRM and POS.',
    },
    scope: { zh: 'AI × AR × 商城 × POS', en: 'AI × AR × Commerce × POS' },
    stack: ['AI', 'AR', 'DJANGO', 'REACT', 'B2B'],
    keyMetric: { value: '50+', label: { zh: '業務模組', en: 'business modules' } },
    featured: true,
    // caseStudy 涵蓋營運後台;消費者端網頁前台見 naily-storefront、行動端見 naily-app。
    caseStudy: {
      problem: [
        {
          zh: '同一個平台有兩張面孔:對消費者是 AI 指甲辨識與 AR 試戴;對商家與內部團隊,則是一套涵蓋商品、訂單、庫存、B2B 報價結算、促銷與財務的營運後台。這份 case study 聚焦目前可公開的部分——約 50 個業務模組的營運後台前端。',
          en: 'One platform, two faces: consumers get AI nail recognition and AR try-on; merchants and internal teams get an operations console covering products, orders, inventory, B2B quoting and settlement, promotions and finance. This case study covers what can be shared today — the ops console frontend, spanning ~50 business modules.',
        },
      ],
      constraints: [
        {
          zh: '公司商業專案,程式碼與業務細節不公開。',
          en: 'A commercial, closed-source project; business details stay private.',
        },
        {
          zh: '業務範圍極廣且持續擴張:單一 SPA 要同時守住 bundle 體積、一致性與可維護性。',
          en: 'The scope is huge and still growing: one SPA has to hold the line on bundle size, consistency and maintainability.',
        },
        {
          zh: '前後端不共享型別:API 契約靠慣例與集中式的錯誤標準化來維持。',
          en: 'Frontend and backend share no types: the API contract survives on conventions and centralized error normalization.',
        },
      ],
      architecture: [
        {
          zh: '平台由多個服務組成:主業務 API(Django REST Framework)加上獨立的審批微服務;營運後台是 React 18 + Ant Design SPA,約 60 萬行程式碼,service 層依業務領域拆成 128 個檔案、共 1,951 個 API 呼叫點,元件層依模組切成 50+ 個資料夾。',
          en: 'The platform is multiple services: a main business API (Django REST Framework) plus a standalone approval microservice. The ops console is a React 18 + Ant Design SPA — ~600k lines, a service layer split into 128 domain files with 1,951 API call sites, and components organized into 50+ module folders.',
        },
        {
          zh: '橫切關注全部收斂在單一 Axios 攔截層:JWT 自動附加、401 刷新佇列、403 全域權限廣播、錯誤 toast 去重、json-bigint 處理大數精度。認證支援 WebAuthn/Passkey,30+ 個 feature flag 控制功能開關,CI 設有 bundle 體積閘門。',
          en: 'Cross-cutting concerns converge in a single Axios interceptor layer: automatic JWT attachment, a 401 refresh queue, global 403 broadcasting, deduped error toasts, and json-bigint for numeric precision. Auth supports WebAuthn/Passkey, 30+ feature flags gate functionality, and CI enforces a bundle-size budget.',
        },
      ],
      responsibilities: [
        {
          zh: '營運後台前端:2025 年 9 月起接手為唯一貢獻者(330 個 commit、佔全庫 72.8%),初版骨架由原團隊於 2025 年 8–9 月建立;接手後統一響應式與錯誤處理架構、重建深色模式與 design token,並執行四輪跨模組稽核與修復。另負責平台後端(Django)API 的設計與開發。',
          en: 'The ops console frontend: sole contributor since taking over in September 2025 (330 commits, 72.8% of the repo) — the original team built the initial skeleton in Aug–Sep 2025. Since the takeover: unified the responsive and error-handling architecture, rebuilt dark mode and the design tokens, and ran four cross-module audits with fixes landed. Also responsible for backend (Django) API design and development on the platform.',
        },
      ],
      challenges: [
        {
          c: {
            zh: 'JWT 過期的瞬間,數十個進行中的請求會同時觸發 refresh。',
            en: 'The moment a JWT expires, dozens of in-flight requests all try to refresh at once.',
          },
          s: {
            zh: '401 一律進入刷新佇列:只發一次 refresh,成功後重放所有排隊請求。同一個攔截層順帶標準化後端的逐欄位驗證錯誤,表單層直接顯示、不再各自解析。',
            en: 'Every 401 joins a refresh queue: one refresh fires, then all queued requests replay. The same interceptor normalizes per-field validation errors from the backend, so forms display them directly instead of parsing on their own.',
          },
        },
        {
          c: {
            zh: '50+ 個模組全部打包,首屏會被拖垮。',
            en: 'Bundling 50+ modules eagerly would sink the first paint.',
          },
          s: {
            zh: '路由層級懶加載搭配 feature flags 控制功能面;CI 以 bundle 體積閘門把關,讓體積成長永遠是「被看見的決定」而不是意外。',
            en: 'Route-level lazy loading plus feature flags gate the surface area; a CI bundle-size budget makes every size increase a visible decision, never an accident.',
          },
        },
        {
          c: {
            zh: '上線前一輪涵蓋工作流程、表單、權限、無障礙與效能的企業級稽核,產出 163 筆原始發現;其中最高槓桿的一類,是跨 4 個以上模組重演的「假成功」反模式——表單顯示儲存成功但沒有真正寫進後端、按鈕顯示成功但功能早已被靜默停用。',
            en: 'A pre-launch enterprise audit across workflows, forms, permissions, accessibility and performance produced 163 raw findings — the highest-leverage class being a “fake success” anti-pattern recurring in four-plus modules: forms toasting success without persisting to the backend, buttons reporting success on silently disabled features.',
          },
          s: {
            zh: '163 筆先去重為 49 筆;21 筆 Critical/High 逐一交叉驗證(21/21 確認為真)後才投入修復,全部在對外開放前完成,對應 18 個批次的系列 commit——含修正假成功動作、讓 8 個佣金相關檔案改回統一的 errorHandler。其餘 28 筆 Medium/Low 如實列管、未虛報進度。',
            en: 'The 163 were deduplicated to 49; the 21 Critical/High items were each cross-verified (21/21 confirmed real) before any fix — all of it completed before the module went live — then landed across 18 batched commits — repairing the fake-success actions and returning eight commission files to the unified errorHandler. The remaining 28 Medium/Low findings stay tracked as open, with no progress inflated.',
          },
        },
        {
          c: {
            zh: '庫存尺寸頁的表格與提示框會不斷向下延伸、撐爆容器——而且只在有實體捲軸的瀏覽器重現。headless 測試用的是不佔空間的 overlay 捲軸,自動化截圖完全看不出異常,一度被誤判為「已穩定」。',
            en: 'A stock-size table and its alert kept growing downward until they burst the container — but only in browsers with space-occupying scrollbars. Headless testing uses overlay scrollbars, so automated screenshots showed nothing wrong and the page was once misjudged as stable.',
          },
          s: {
            zh: '根因是表格自帶 scroll 與 fixed 首欄,和全域的 overflow-x:auto 疊成兩層水平捲動容器,fixed 欄再觸發 Ant Design 的 ResizeObserver 反覆重量測,形成「捲軸出現 → 容器變窄 → 再量測」的迴圈。移除該表格自己的 scroll/fixed、交給全域 wrapper 做單層捲動,並以 Playwright 在 1280/900/600/375 四種寬度驗證穩定不溢出。',
            en: 'The root cause: the table’s own scroll plus a fixed first column, stacked on a global overflow-x:auto, formed two nested horizontal scroll containers — and the fixed column kept re-triggering Ant Design’s ResizeObserver in a “scrollbar appears → container narrows → remeasure” loop. Removing the table-level scroll/fixed and letting the global wrapper own a single scroll layer fixed it, verified with Playwright at 1280/900/600/375 widths.',
          },
        },
      ],
      facts: [
        { value: '91', label: { zh: '管理路由', en: 'admin routes' } },
        { value: '~600k', label: { zh: '前端程式碼行數', en: 'lines of frontend code' } },
        { value: '1,193', label: { zh: '測試案例(Jest + E2E)', en: 'test cases (Jest + E2E)' } },
        { value: '72.8%', label: { zh: '個人 commit(330/453)', en: 'of commits mine (330/453)' } },
      ],
      lessons: [
        {
          zh: '前後端沒有共享型別時,最划算的契約投資是在攔截層統一錯誤格式——比逐表單處理省下數十倍的重複工作。',
          en: 'Without shared types, the highest-leverage contract investment is normalizing error shapes in the interceptor — it beats per-form handling by an order of magnitude.',
        },
        {
          zh: '技術債要掛編號才會被還:有編號、有優先級的稽核項目會被逐一清償;「有空再修」的那個「有空」永遠不會來。',
          en: "Tech debt gets paid only when it has a number: audited, prioritized items get fixed one by one — 'when we have time' never arrives on its own.",
        },
        {
          zh: '「操作顯示成功」和「資料真的被寫入」是兩件要分開驗證的事:這輪稽核重複率最高的反模式就是假成功——toast 亮了,資料卻沒有持久化。寫入類操作上線前,要同時確認使用者看到的回饋與後端的資料狀態一致。',
          en: '“The UI said success” and “the data was actually written” are two different claims to verify: the audit’s most repeated anti-pattern was fake success — a toast fires while nothing persists. Every write operation now gets checked on both sides before shipping: the feedback the user sees, and the state the backend holds.',
        },
      ],
    },
  },
  {
    slug: 'naily-app',
    domain: 'mobile',
    visibility: 'internal',
    title: { zh: 'Naily — AI 美甲電商 App', en: 'Naily — AI Nail Commerce App' },
    oneLiner: {
      zh: 'Flutter 電商 App:商城、客製穿戴甲與金流。2025 年 11 月起由我接手 App 前端的開發與維護;裝置端 AI 與 AR 模組屬於另一個團隊。',
      en: 'A Flutter commerce app — storefront, custom press-ons and payments. I took over the app frontend in November 2025; the on-device AI and AR modules belong to another team.',
    },
    scope: { zh: '雙平台上架 · 2025.11 起接手', en: 'Live on both stores · takeover since 2025.11' },
    stack: ['FLUTTER', 'FIREBASE', 'ECPAY'],
    keyMetric: { value: '82', label: { zh: '畫面', en: 'screens' } },
    links: {
      appStore: 'https://apps.apple.com/tw/app/naily-%E6%97%A5%E7%A7%80%E7%BE%8E%E5%AD%B8/id6748354584',
      googlePlay: 'https://play.google.com/store/apps/details?id=com.manience.NailyApp&hl=zh_TW',
    },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '穿戴甲是高度客製化的商品,消費者難以自行判斷指甲尺寸,線上下單常因尺寸不合而退換貨。這個 App 用手機相機加裝置端 AI 取代到店量測,把「設計 → 尺寸辨識 → AR 試戴 → 下單 → 金流物流」整合成單一流程。',
          en: 'Press-on nails are highly customized; customers can rarely judge their own nail sizes, so online orders often bounce back over fit. This app replaces in-store measuring with the phone camera and on-device AI, folding design → sizing → AR try-on → checkout → payment and logistics into one flow.',
        },
      ],
      constraints: [
        {
          zh: '接手一個由原團隊建置的多人 codebase(接手前 198 個 commit),沒有交接期。',
          en: 'Inherited a multi-author codebase built by the original team (198 commits before the handover), with no transition period.',
        },
        {
          zh: '裝置端的 AI 指甲辨識與 AR 試戴由另一個團隊負責,不在我的工作範圍;這份案例只涵蓋這些模組以外的 App 前端。',
          en: 'On-device nail recognition and AR try-on are another team’s work, outside my scope; this case study covers only the app frontend around those modules.',
        },
        {
          zh: '涉及金流與個資:token 只能放 secure storage、日誌不得記錄完整 request body、iOS 需處理 ATT 追蹤同意;上架前完成 P0–P2 上架就緒稽核修復,現已於雙平台上架。',
          en: 'Payments and personal data are involved: tokens live in secure storage only, logs must not capture full request bodies, iOS requires ATT consent. P0–P2 launch-readiness audit fixes were completed before release; the app is now live on both stores.',
        },
      ],
      architecture: [
        {
          zh: 'Flutter 模組化單體:feature-first 分層(config / models / services / screens),GoRouter 宣告式導航——82 個畫面、72 個 service、44 個 model,共 533 個 Dart 檔、約 12.9 萬行,呼叫後端 123 個 API 端點。',
          en: 'A modular Flutter app: feature-first layering (config / models / services / screens) with declarative GoRouter navigation — 82 screens, 72 services, 44 models across 533 Dart files (~129k lines), talking to 123 backend API endpoints.',
        },
        {
          zh: '裝置端 AI 與 AR 模組(ONNX Runtime 上的指甲偵測/分割與手掌關節點模型、iOS 的 CoreML 銜接)由另一個團隊建置與維護,本案例不涵蓋。我負責的商務面整合 ECPay 金流/物流/電子發票與四家社交登入;Firebase 負責推播、Crashlytics 與分析;CI 有三條 pipeline(兩階段 CI、夜間全量 E2E、tag 觸發簽署發版)。',
          en: 'The on-device AI and AR modules (nail detection/segmentation and hand-landmark models on ONNX Runtime, plus the iOS CoreML bridge) are built and maintained by another team and are not covered here. On the side I own, commerce integrates ECPay payments/logistics/e-invoicing and four social logins; Firebase covers push, Crashlytics and analytics; CI runs three pipelines — staged CI, nightly full E2E, and tag-triggered signed releases.',
        },
      ],
      responsibilities: [
        {
          zh: '2025 年 11 月接手;此前的基礎架構與商城流程由原團隊建置。接手後 App 前端的開發、維護與發版由我負責(該期間 121 個 commit、占 85%):FCM 與追蹤整合、客製穿戴甲功能、點數系統、巨檔拆分、安全硬化與 CI/CD。裝置端 AI 與 AR 模組由另一個團隊負責;後端 API 為獨立服務,不在此 repo 範圍。',
          en: 'Took over in November 2025; the foundation and commerce flows were built by the original team. Since then the app frontend’s development, maintenance and releases are mine (121 commits, 85% of the period): FCM and tracking integration, the custom press-on feature, a points system, breaking up the oversized files, security hardening and CI/CD. The on-device AI and AR modules belong to another team; the backend API is a separate service outside this repo.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '核心畫面是數千行的巨檔:訂單詳情 5,256 行、結帳 3,416 行,改一處動全身。',
            en: 'Core screens were multi-thousand-line monsters — order detail at 5,256 lines, checkout at 3,416 — where every change rippled everywhere.',
          },
          s: {
            zh: '訂下每檔 800 行的上限,依 UI 區塊與邏輯拆分:訂單詳情 5,256 → 230 行(邏輯抽離)、購物車/結帳/訂閱結帳三巨檔合計 6,800 → 1,200 行加獨立元件。',
            en: 'Set an 800-line-per-file cap and split by UI region and logic: order detail went 5,256 → 230 lines (logic extracted); the cart/checkout/subscription trio went 6,800 → 1,200 lines plus standalone widgets.',
          },
        },
        {
          c: {
            zh: 'Token 一過期使用者就被登出,而上架前的安全防護也不足。',
            en: 'Expired tokens logged users out mid-session, and pre-launch security hardening was thin.',
          },
          s: {
            zh: '在 7 個 service 加入 401 攔截刷新(自動續期不中斷);上架硬化含原生層混淆、Dart obfuscate、憑證綁定與 root/越獄偵測。',
            en: 'Added 401 intercept-and-refresh across seven services (seamless renewal), and hardened for launch with native-layer obfuscation, Dart obfuscation, certificate pinning and root/jailbreak detection.',
          },
        },
      ],
      facts: [
        { value: '82', label: { zh: '畫面', en: 'screens' } },
        { value: '~129k', label: { zh: 'Dart 行數', en: 'lines of Dart' } },
        { value: '121', label: { zh: '接手後 commits', en: 'commits since takeover' } },
        { value: '64', label: { zh: '測試檔(單元+整合)', en: 'test files (unit + e2e)' } },
      ],
      lessons: [
        {
          zh: '接手程式碼的第一步不是重構,是把慣例寫下來——規則明文化之後,每一次修改才會讓系統更一致,而不是更發散。',
          en: 'The first step in a takeover is not refactoring — it is writing the conventions down. Once rules are explicit, every change makes the system more consistent instead of more divergent.',
        },
        {
          zh: '佐證要以 git 為準:這個專案的 CHANGELOG 是事後重建的,日期與實際 commit 對不上。重要記錄應該跟 tag 一起產生,而不是回頭補寫。',
          en: "Trust git, not prose: this project's CHANGELOG was reconstructed after the fact and its dates don't match the commits. Records worth keeping should be generated with tags, not backfilled.",
        },
      ],
    },
  },
  {
    slug: 'naily-storefront',
    domain: 'frontend',
    visibility: 'internal',
    title: {
      zh: 'Naily 電商前台與 Canvas 客製化設計工具',
      en: 'Naily Storefront & Canvas Product Customizer',
    },
    oneLiner: {
      zh: '穿戴甲品牌的消費端電商前台:購物流程、金流發票、四種社群登入,以及瀏覽器內 Canvas 客製化設計編輯器;涵蓋 CRA 商城的模組開發與重構,及 Next.js 15 版的設計債清償。',
      en: 'The consumer storefront for a press-on nail brand — shopping flow, payments and e-invoicing, four social logins, and an in-browser Canvas design editor; spanning module work and a redesign on the CRA site, and design-debt cleanup on its Next.js 15 successor.',
    },
    scope: { zh: '營運中 · 參與 → 重構主力', en: 'In production · contributor → refactor lead' },
    stack: ['REACT', 'NEXTJS', 'CANVAS', 'ANTD', 'STYLED-COMPONENTS', 'PLAYWRIGHT'],
    keyMetric: { value: '72', label: { zh: '前台路由', en: 'storefront routes' } },
    links: { live: 'https://manience.com' },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: 'Naily 賣的是客製化穿戴甲,消費者要的不是填表單,而是「上傳自己的指甲照片 → 編修設計 → 即時預覽成品」——這需要一個在瀏覽器內即時渲染、支援十指獨立設計的 Canvas 編輯工具。同時它又是一個功能持續疊加的完整電商 SPA:購物車、結帳、台灣電子發票、綠界金流、四種社群登入與行銷追蹤全在同一個 codebase,CSS 與元件層長出重複造輪子與命名衝突。2026 年初的重構把 5 步驟的客製化流程重做為 3 步並統一全站視覺;其後前台遷移到 Next.js 15 App Router 以取得 SSR 與 SEO,遷移完成後緊接著一輪系統性的設計 token 債務清償。',
          en: 'Naily sells custom press-on nails, and what customers need is not a form — it is “upload a photo of your nails → edit the design → preview the result live”, which demands an in-browser Canvas editor with ten independently designable nails. Around it sits a full e-commerce SPA that kept accreting features: cart, checkout, Taiwan e-invoicing, ECPay payments, four social logins and marketing analytics in one codebase, with duplicated components and clashing styles growing in the gaps. An early-2026 redesign cut the five-step customization flow to three and unified the visual language; the storefront then moved to Next.js 15 App Router for SSR and SEO, followed immediately by a systematic design-token debt cleanup.',
        },
      ],
      constraints: [
        {
          zh: '品牌商業專案,程式碼不公開;CRA 商城為 5 人協作,本篇如實區分我負責與不負責的部分。',
          en: 'A commercial brand project; the codebase is private. The CRA site had five contributors — this page keeps my share and others’ work explicit.',
        },
        {
          zh: '效能與技術債要在「不增加後端資源」的前提下用純前端手段處理:bundle 精簡、CSS 變數整併、圖片壓縮。',
          en: 'Performance and debt work had to stay frontend-only, with no new backend resources: bundle trimming, CSS-variable consolidation, image compression.',
        },
        {
          zh: 'Next.js 版的登入狀態存 localStorage,而 middleware 跑在讀不到 localStorage 的 Edge Runtime——集中式登入導轉做不了,保護邏輯必須下放到每個頁面的 Client Component。',
          en: 'The Next.js build keeps auth in localStorage, but middleware runs on the Edge Runtime, which cannot read it — centralized login redirects were impossible, so protection devolves to each page’s client component.',
        },
        {
          zh: 'Next.js repo 僅 3 個測試檔、沒有 CI:大規模刪除死碼只能靠全庫 grep 二次驗證加乾淨 build 把關,而非測試套件。',
          en: 'The Next.js repo has three test files and no CI: large-scale dead-code deletion is gated by full-repo grep re-verification plus a clean build, not a test suite.',
        },
      ],
      architecture: [
        {
          zh: 'CRA 商城:React 18 SPA,react-router v7 管 72 條路由、其中 56 個元件走 React.lazy 分割;狀態刻意只用 4 個 Context 加 37 個 service 檔、不引入 Redux——多數狀態是單一使用者的購物流程,不是跨模組共享。單一 Axios 入口統一 JWT 刷新、json-bigint 精度與訪客容錯;GA4/GTM/Pixel 埋點以近 2,500 行的事件 schema 集中定義與驗證;測試為 572 個 Jest 案例加 33 個 Playwright E2E,GitHub Actions 每日排程執行。',
          en: 'The CRA site: a React 18 SPA with 72 routes under react-router v7, 56 components code-split via React.lazy; state is deliberately four Contexts plus 37 service files, no Redux — most state is one shopper’s flow, not cross-module. A single Axios entry point owns JWT refresh, json-bigint precision and guest-mode fallbacks; GA4/GTM/Pixel instrumentation is defined and validated by a ~2,500-line event schema; tests are 572 Jest cases plus 33 Playwright E2E specs on a daily GitHub Actions schedule.',
        },
        {
          zh: 'Next.js 15 版:自 CRA 遷移到 App Router 以導入 SSR/SSG——53 個路由頁、55 個功能模組、352 個元件檔,部署為 standalone build 加 PM2。遷移後的全站盤點揭開債務的實際規模:design token 檔案引用率僅 5%、Ant Design / react-bootstrap / styled-components / CSS Modules 四套樣式方案並存、純 CSS 硬編碼色碼 3,463 處——這是設計債清償階段的起點,目前進行中。',
          en: 'The Next.js 15 build: migrated from CRA to the App Router for SSR/SSG — 53 page routes, 55 feature modules, 352 component files, deployed standalone under PM2. A post-migration sitewide inventory exposed the real debt: the design-token file referenced by only 5% of files, four styling systems coexisting (Ant Design, react-bootstrap, styled-components, CSS Modules), and 3,463 hard-coded hex colors in CSS — the starting line of the ongoing debt-cleanup phase.',
        },
      ],
      responsibilities: [
        {
          zh: '兩個時期、兩種角色,如實區分。CRA 商城為 5 人協作,我佔 136/629 個 commit(21.6%):2025/05–07 開發內部後台管理模組(方案、使用者、商品庫存、訂單、金流與發票),2026/02–03 為全站重構期的主要開發者(Canvas 編輯器與三步驟客製流程、首頁效能、CSS 債務治理、無痕模式稽核)。Next.js 版的設計債清償為獨立完成:141 個 commit 全數出自我(2026/07、5 天集中執行),其中 8 個標註與 Claude 結對。',
          en: 'Two periods, two roles, kept distinct. On the CRA site — five contributors — I account for 136 of 629 commits (21.6%): building the internal admin modules in May–July 2025 (plans, users, products and inventory, orders, payments and invoicing), then serving as the main developer of the early-2026 redesign (the Canvas editor and three-step custom flow, homepage performance, CSS debt, the incognito-mode audit). The Next.js design-debt cleanup is solo: all 141 commits are mine (July 2026, five focused days), eight of them tagged as paired with Claude.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '舊版客製化流程有 5 個步驟,過長的流程本身就是轉換率風險;舊架構也沒有草稿保存、上傳記錄複用與 API 重試,使用者一旦中斷就得從頭開始。',
            en: 'The old customization flow ran five steps — length itself is a conversion risk — and the old architecture had no draft saving, no reuse of past uploads, no API retry: an interrupted session started over from scratch.',
          },
          s: {
            zh: '重新設計為 3 步驟(規格 → 設計 → 預覽),一次交付 9 大模塊:30 秒間隔草稿自動保存、上傳記錄複用、API 重試、6 種甲型 SVG 渲染、十指獨立設計狀態、圖片編修、雙視圖預覽與分享面板。開發方式是把 9 個模塊拆給 8 個並行 AI coding agent 同步產出(單一 commit 77 檔、25,804 行),再由我整合驗收——之後仍需兩輪精修 commit 才達可上線品質。',
            en: 'Redesigned to three steps (spec → design → preview), delivering nine modules at once: 30-second draft autosave, reusable upload history, API retry, six nail-shape SVG renderers, ten independently designed nails, image editing, dual-view preview and a share panel. The build split the nine modules across eight parallel AI coding agents in one pass (one commit: 77 files, 25,804 lines), with me doing the integration acceptance — and it still took two more polish commits to reach shippable quality.',
          },
        },
        {
          c: {
            zh: 'Next.js 版有三份 token 檔各自宣告同名 CSS 變數、給不同的值,實際生效值完全取決於 webpack chunk 載入順序——症狀之一是 --font-size-lg 到 5xl 全被攤平成 1rem,全站標題字級跑掉而沒人注意。',
            en: 'Three token files in the Next.js build each declared the same CSS custom properties with different values — which one won depended entirely on webpack chunk load order. One symptom: --font-size-lg through 5xl all flattened to 1rem, silently collapsing every heading size on the site.',
          },
          s: {
            zh: '不做表面對齊,先追出「現在實際生效的是哪組值」再統一:z-index 保留已被 15+ 個元件以自洽順序依賴的 unified 系統,讓另外兩檔改為轉發引用;字級/圓角/陰影則轉發 consolidated 的 token——變數名不變、值收斂。修復後在 build 產物逐一確認每個 token 在所有 chunk 組合下都是同一個值;硬編碼色碼從 3,463 處降到 2,131(-38%),分支仍在進行中。',
            en: 'Instead of surface alignment, first traced which values were actually winning, then converged on those: z-index kept the unified system already depended on by 15+ components in a self-consistent order, with the other two files re-pointed to it; font, radius and shadow tokens now forward to the consolidated file — same names, one value. Every token was then verified identical across all chunk combinations in the build output; hard-coded hex colors fell from 3,463 to 2,131 (−38%), branch still in progress.',
          },
        },
        {
          c: {
            zh: '專案累積大量重複與無引用的 CSS/資源檔(Cart.module.css 與 Cart2025.module.css 並存這類),但整個 repo 只有 3 個測試檔——沒有任何測試能保證「刪這個檔不會弄壞某個頁面」。',
            en: 'The repo had piled up duplicated and unreferenced CSS and assets (Cart.module.css coexisting with Cart2025.module.css, and so on), yet held only three test files — nothing guaranteed that deleting a file would not break a page.',
          },
          s: {
            zh: '把刪除門檻定為「全庫 grep 二次驗證確無任何 import/@import,且乾淨跑過一次 build」:第一輪刪除 80 個確認無引用的檔案,後續分支再刪 111 檔、淨減約 4.4 萬行(進行中)。這個方法有效但明確不可規模化、也蓋不到動態 import——列管中的限制,不是被掩蓋的風險。',
            en: 'The deletion gate became “full-repo grep re-verification of zero imports, plus one clean build”: round one removed 80 confirmed-dead files; the current branch removes another 111, a net ~44k lines down (in progress). The method works but explicitly does not scale and cannot see dynamic imports — a tracked limitation, not a hidden risk.',
          },
        },
        {
          c: {
            zh: 'Safari 等瀏覽器的無痕模式會限制甚至停用 localStorage,而商城多處(裝置識別、訪客訂單追蹤、資料同步)直接裸呼原生 API——一拋 DOMException,訪客訂單查詢這類核心功能就整個失效。',
            en: 'Incognito mode in Safari and others restricts or disables localStorage outright, and the site called the raw API in many places — device identity, guest order tracking, data sync — so one DOMException took whole features like guest order lookup down.',
          },
          s: {
            zh: '全站稽核標出 19 個問題點,確立 safeStorage(帶記憶體 fallback 的安全封裝)為修復標準;截至盤點,50 個檔案已遷移、36 個檔案(含稽核點名的核心等級檔案)仍未遷移——稽核完成、修復進行中,如實記錄。',
            en: 'A sitewide audit flagged 19 issues and established safeStorage — a wrapper with an in-memory fallback — as the fix standard. As of this inventory, 50 files have migrated and 36 (including core-severity files the audit named) have not: audit done, remediation in progress, recorded as-is.',
          },
        },
      ],
      facts: [
        { value: '72', label: { zh: '路由(56 個懶加載)', en: 'routes (56 lazy-loaded)' } },
        { value: '25,804', label: { zh: '行,單一 commit 交付 9 模塊', en: 'lines shipped in one commit' } },
        { value: '605', label: { zh: '測試(572 Jest + 33 E2E)', en: 'tests (572 Jest + 33 E2E)' } },
        { value: '-38%', label: { zh: '硬編碼色碼(3,463→2,131)', en: 'hard-coded colors (3,463→2,131)' } },
      ],
      lessons: [
        {
          zh: '大量並行生成拿得到功能骨架,拿不到一致性:8 個 agent 一次產出 2.5 萬行後,仍需兩輪精修與後續的 token/圖示庫收斂才成為單一風格。重來會在拆任務給並行 agent 之前先鎖定共用的 design token 與元件慣例,而不是事後合併。',
          en: 'Massively parallel generation buys a skeleton, not consistency: after eight agents produced 25k lines in one pass, it still took two polish rounds and a later token-and-icon consolidation to converge on one style. Next time the shared design tokens and component conventions get locked before the work is split across agents, not merged after.',
        },
        {
          zh: 'CSS 載入順序本身是一種隱性契約:三個檔案宣告同名 token 不同值,生效者由 chunk 順序決定,不是任何人的設計意圖。重來會從第一天強制單一 token 來源,並用 lint 擋掉 raw hex 與重複宣告,而不是等累積 3,463 處才回頭清。',
          en: 'CSS load order is an implicit contract: with three files declaring the same tokens at different values, the winner was decided by chunk order, not by anyone’s intent. Next time a single token source is enforced from day one, with lint blocking raw hex and duplicate declarations — instead of cleaning up 3,463 instances later.',
        },
        {
          zh: '稽核出的問題若不接著排優先序執行,就只是一份文件:無痕模式稽核早就列出 19 個問題點與修復計畫,半年後仍有 36 個檔案未遷移。要嘛當場排進衝刺,要嘛承認它就是「已知未修」——別讓文件本身變成完成的假象。',
          en: 'An audit not followed by scheduled execution is just a document: the incognito audit listed 19 issues and a phased plan, and half a year later 36 files remain unmigrated. Either the findings go into the sprint on the spot, or the state is honestly “known and unfixed” — the document must never impersonate the fix.',
        },
      ],
    },
  },
  {
    slug: 'nkust-alumni',
    domain: 'fullstack',
    visibility: 'public',
    title: {
      zh: '高科大智慧商務系系友會平台',
      en: 'NKUST Alumni Association Platform',
    },
    oneLiner: {
      zh: '系友名錄、系友企業與徵才的官方網站;2024 年起開發,現於校方網域營運中。',
      en: 'The official alumni site — member directory, alumni companies and job board. In development since 2024, now running on the university domain.',
    },
    scope: { zh: '營運中 · 全端 + 維運', en: 'In production · full stack + ops' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REDIS', 'REACT'],
    keyMetric: { value: '100+', label: { zh: 'API endpoints', en: 'API endpoints' } },
    links: { live: 'https://aaic.nkust.edu.tw' },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '系友會過去沒有統一的線上平台:系友名冊、合作企業、徵才與活動公告分散各處,靠人工維護。這個系統把「系友自助維護個資 → 管理員審核 → 對外公開展示」與「公司自助登錄職缺/產品」整合成單一平台,並提供傑出系友與系所的對外頁面。',
          en: "The alumni association had no unified platform: rosters, partner companies, job posts and announcements were scattered and manually maintained. This system folds 'alumni self-service → admin review → public display' and company self-service job/product listings into one platform, plus public pages for distinguished alumni and the department.",
        },
      ],
      constraints: [
        {
          zh: '掛在校方網域正式對外,存有系友個資(屬個資法規管),資安要求高。',
          en: 'Public on a university domain, holding alumni PII under data-protection law — security expectations are high.',
        },
        {
          zh: '單機部署(nginx + gunicorn),無容器編排;維運、資安與 UIUX 稽核都由一人完成。',
          en: 'Single-server deployment (nginx + gunicorn), no orchestration; ops, security and UX audits all fall on one person.',
        },
        {
          zh: '前端是 CRA(非 SSR),但系友會官網必須能被搜尋引擎索引。',
          en: 'The frontend is CRA (no SSR), yet an alumni site must be indexable by search engines.',
        },
      ],
      architecture: [
        {
          zh: 'Django 5 + DRF 單體(11 個業務 app、39 個資料模型,38 個資源路由加上 118 個自訂 action)搭配 React 18 SPA。權限為 deny-by-default:全域預設 IsAuthenticated,公開端點逐一顯式開放;JWT 走 HttpOnly cookie;Redis 快取熱門查詢。',
          en: 'A Django 5 + DRF monolith (11 business apps, 39 models, 38 resource routes plus 118 custom actions) with a React 18 SPA. Authorization is deny-by-default — IsAuthenticated globally, public endpoints explicitly opted in; JWT rides in HttpOnly cookies; Redis caches hot queries.',
        },
        {
          zh: '自建監控子系統:middleware 把請求、錯誤與效能指標寫進 7 個監控模型,GeoIP 標註來源國別,異常寄信告警;日誌每日輪替壓縮、保存一年,自 2025 年 5 月起持續記錄至今。',
          en: 'A custom monitoring subsystem: middleware writes requests, errors and performance metrics into seven models, GeoIP tags origin countries, anomalies alert by email; logs rotate daily with gzip and a one-year retention — recording continuously since May 2025.',
        },
      ],
      responsibilities: [
        {
          zh: '前後端獨立開發與維運(2024/08 起,前後端共 169 個 commit):資料模型、API、權限與資安整改、React 前端、部署與監控。',
          en: 'Independent full-stack development and operations since 2024/08 (169 commits across both repos): data models, APIs, security hardening, the React frontend, deployment and monitoring.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '上線前的資安審查發現一串高風險漏洞:註冊 API 可自我提權、序列化器有 mass assignment、會員端點可用遞增 id 列舉個資。',
            en: 'A pre-launch security review surfaced serious flaws: privilege escalation via the registration API, serializer mass assignment, and member PII enumerable through sequential IDs.',
          },
          s: {
            zh: '根因是全域 AllowAny + 逐點加鎖。把權限翻轉為 deny-by-default,以編號化流程(SEC-001~030)逐項修補:欄位白名單、擁有者過濾、敏感欄位遮罩、回應一致化防列舉——29 項修復落地,並補上針對提權與 IDOR 的回歸測試(7/7 通過)。',
            en: 'The root cause was global AllowAny with per-endpoint locking. Authorization was flipped to deny-by-default and a numbered program (SEC-001–030) fixed items one by one — field whitelists, owner filtering, sensitive-field redaction, uniform responses against enumeration. 29 fixes landed, backed by privilege/IDOR regression tests (7/7 passing).',
          },
        },
        {
          c: {
            zh: 'CRA SPA 天生對搜尋引擎不友善,而 react-snap 這類現成方案的 puppeteer 版本過舊不可用。',
            en: 'A CRA SPA is hostile to crawlers by default, and off-the-shelf prerenderers shipped a puppeteer too old to use.',
          },
          s: {
            zh: '自寫 prerender 腳本(puppeteer + Chrome for Testing):build 後對 14 條對外路由逐一渲染並寫回靜態 HTML,掛在 postbuild 自動執行;後端另建動態 sitemap,過程中順手修掉 sitemap 一律 500 的欄位錯誤。',
            en: 'Wrote a custom prerender script (puppeteer + Chrome for Testing): after build it renders 14 public routes back to static HTML, wired into postbuild; the backend serves a dynamic sitemap — fixing, along the way, a field bug that had it returning 500s.',
          },
        },
        {
          c: {
            zh: '沒有 APM 預算,但對外站台需要知道誰在打它、哪裡在變慢。',
            en: 'No budget for an APM, yet a public site needs to know who is hitting it and what is slowing down.',
          },
          s: {
            zh: '自建監控:middleware 記錄請求/錯誤/效能,GeoIP 標來源,分級 throttling(登入 10/min、註冊 10/hr)擋濫用;每日輪替的請求日誌從 2025 年 5 月持續累積至今,是系統真實營運的直接證據。',
            en: 'Built it in: middleware logs requests/errors/perf, GeoIP tags origins, scoped throttling (login 10/min, registration 10/hr) blocks abuse. The daily-rotated logs accumulating since May 2025 are direct evidence of real operation.',
          },
        },
      ],
      facts: [
        { value: '11', label: { zh: '業務模組', en: 'business apps' } },
        { value: '100+', label: { zh: 'API endpoints', en: 'API endpoints' } },
        { value: '30', label: { zh: 'SEC 稽核項(29 修復)', en: 'audit findings (29 fixed)' } },
        { value: '43', label: { zh: 'Playwright E2E', en: 'Playwright E2E specs' } },
      ],
      lessons: [
        {
          zh: '權限要從 default-deny 起步。AllowAny 加逐點加鎖讓整片攻擊面打開,上線前靠審查補救的成本,比一開始就做對高出太多。',
          en: 'Start from default-deny. Global AllowAny with per-endpoint locking opened a whole attack surface — remediating before launch cost far more than doing it right from the start.',
        },
        {
          zh: 'CRA + 自建預渲染能動,但脆弱:路由要手動維護、Chrome 版本綁死。重來會直接選有原生 SSR/SSG 的框架,省掉整條自維護管線。',
          en: 'CRA plus a hand-rolled prerenderer works, but it is fragile — routes are maintained by hand and pinned to a Chrome build. Next time I would pick a framework with native SSR/SSG and delete the whole pipeline.',
        },
      ],
    },
    screenshots: [
      {
        src: '/images/work/nkust-alumni/company-search.webp',
        alt: {
          zh: '系友企業搜尋頁:關鍵字搜尋列、行業別篩選標籤、結果筆數與網格/列表切換,下方為企業卡片',
          en: 'Alumni company search: keyword bar, industry filter chips, result count and a grid/list toggle above the company cards',
        },
        caption: {
          zh: '系友企業搜尋。行業別標籤由 company_industry 資料表長出來,不是寫死的清單;卡片影像是本次示範產生的合成圖,真實企業照片留在正式資料庫裡。',
          en: 'Alumni company search. The industry chips come from the company_industry table rather than a hard-coded list; the card imagery is synthetic, generated for this demo run — real company photos stay in the production database.',
        },
      },
      {
        src: '/images/work/nkust-alumni/recruit-board.webp',
        alt: {
          zh: '系友企業職缺頁的表格檢視:職位、公司、發布時間與截止時間欄位,右上為表格/卡片檢視切換',
          en: 'The public job board in table view — position, company, posted date and deadline columns, with a table/card view switch above',
        },
        caption: {
          zh: '對外職缺列表。公開端點只讀 active=True 的資料;截止日期存進資料庫也顯示在畫面上,卻沒有任何查詢過濾它——過期職缺要靠人工下架,這是設計上的缺口。',
          en: 'The public job board. Its endpoint reads only active=True rows; the deadline is stored and rendered, yet no queryset filters on it — an expired post stays visible until a human unpublishes it. A gap in the design, stated as such.',
        },
      },
      {
        src: '/images/work/nkust-alumni/mobile-recruit-board.webp',
        alt: {
          zh: '同一個職缺頁在 390px 寬手機上的樣子:表格改排為單欄卡片,導覽收合成漢堡選單',
          en: 'The same job board at a 390px phone width: the table re-flows into single-column cards and the navigation collapses into a hamburger',
        },
        caption: {
          zh: '同一頁在 390px 手機上,表格改排成單欄卡片。這是整頁截圖,所以比手機一屏長得多。',
          en: 'The same page on a 390px phone, where the table becomes single-column cards. This is a full-page capture, so it runs far longer than one phone screen.',
        },
      },
      {
        src: '/images/work/nkust-alumni/admin-recruit-manage.webp',
        alt: {
          zh: '後台招募職位管理頁:職缺總數與篩選結果統計卡、發布者下拉篩選、跨公司的職缺表格與檢視/編輯/刪除操作',
          en: 'The admin job-management page: total and filtered counts, a publisher filter, and a cross-company table of postings with view, edit and delete actions',
        },
        caption: {
          zh: '後台職缺管理:一張表列出所有公司的職缺,可新增、編輯、下架與匯出。這條路徑由 IsAdminOrSuperUser 把關,和系友端「只能改自己公司職缺」的路徑是兩組獨立端點。',
          en: "Admin job management: every company's postings in one table, with create, edit, unpublish and export. This path is gated by IsAdminOrSuperUser and lives on endpoints separate from the member path, where an alumnus can only touch their own company's posts.",
        },
      },
      {
        src: '/images/work/nkust-alumni/admin-outstanding-alumni.webp',
        alt: {
          zh: '傑出系友管理頁:順序編號、名稱、摘要、「展示於官網」開關、上下排序按鈕與編輯/刪除',
          en: 'The distinguished-alumni admin page: sort number, name, summary, a "show on site" switch, up/down reordering and edit/delete controls',
        },
        caption: {
          zh: '傑出系友管理。程式碼裡沒有提名或審核流程——管理員直接建立資料列,再用 is_featured 開關與 sort_order 決定官網呈現什麼、以什麼順序;批次排序走 bulk_update 包在單一交易裡,不是逐筆 save()。',
          en: 'Distinguished-alumni management. There is no nomination or review workflow in the code — staff create the rows directly, then is_featured and sort_order decide what the public page shows and in what order. Batch reordering runs as one bulk_update inside a transaction rather than a save() per row.',
        },
      },
      {
        src: '/images/work/nkust-alumni/mobile-admin-outstanding-alumni.webp',
        alt: {
          zh: '同一個傑出系友管理頁在 390px 手機上:每一列拆成「欄位名對值」的卡片,開關、排序與編輯刪除按鈕全部保留',
          en: 'The same distinguished-alumni admin page on a 390px phone: each row becomes a label-and-value card, keeping the switch, reordering and edit/delete controls',
        },
        caption: {
          zh: '同一張後台表格在手機上改成逐欄位的卡片,所有操作都留著。響應式的功夫沒有只做在對外頁面,後台也一起做了。',
          en: 'The same admin table on a phone, re-laid out field by field with every control kept. The responsive work was not limited to the public pages — the back office got it too.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/nkust-alumni/diagram-write-paths-and-visibility.svg',
        alt: {
          zh: '寫入路徑與公開可見性流程圖:匿名、系友、管理員三種角色各自能觸發的寫入端點、序列化器剝除的權限欄位,以及匿名讀者實際讀得到的查詢條件',
          en: 'Write-paths and public-visibility flowchart: the endpoints each of the three caller roles can reach, the privileged fields the serializers strip, and the exact filters that decide what an anonymous reader sees',
        },
        caption: {
          zh: '誰能寫什麼,以及公開端點真正讀得回什麼。整站的對外閘門其實只有幾個布林欄位:文章與職缺看 active,系友名錄看 is_show,傑出系友看 is_featured。右下角的註記是這張圖最值得看的部分——publish_at / expire_at / deadline 都存了也回傳了,卻沒有任何查詢用到它們。',
          en: "Who may write what, and what the public endpoints actually return. The site's entire outward gate turns out to be a few booleans: active for articles and jobs, is_show for the directory, is_featured for distinguished alumni. The note bottom-right is the part worth reading — publish_at, expire_at and deadline are all stored and serialized, and no query uses any of them.",
        },
      },
      {
        src: '/images/work/nkust-alumni/diagram-request-lifecycle.svg',
        alt: {
          zh: '登入與已認證請求的時序圖:nginx、監控 middleware 的 IP 封鎖閘、Cookie JWT 認證與 CSRF 檢查、DRF view,以及走執行緒池的稽核寫入',
          en: 'Sequence diagram of login and an authenticated call: nginx, the monitoring middleware IP block-gate, cookie-JWT authentication with its CSRF check, the DRF view, and the audit writes that go out on thread pools',
        },
        caption: {
          zh: '一個請求從 nginx 進來、到稽核紀錄落地的完整時序。IP 封鎖在進 view 之前就擋下;cookie 路徑強制 CSRF,舊的 Bearer header 路徑則跳過。最下方那則註記是誠實的缺口:每個寫入者都傳 request_log=None,所以 query_logs、crud_logs 這些表指回 request_logs 的外鍵建了模型卻從未被填。',
          en: 'One request from nginx through to its audit rows. The IP block-gate rejects before the view ever runs; the cookie path enforces CSRF while the legacy Bearer-header path skips it. The note at the bottom is an honest gap: every writer passes request_log=None, so the foreign key from query_logs and crud_logs back to request_logs is modelled and never populated.',
        },
      },
      {
        src: '/images/work/nkust-alumni/diagram-system-architecture.svg',
        alt: {
          zh: '部署與執行架構圖:nginx 反向代理到 gunicorn(3 workers)、依序排列的 middleware 鏈、DRF 的預設拒絕層與 11 個 Django app,以及 MySQL、Redis、GeoIP、輪替日誌與郵件外部相依',
          en: 'Deployment and runtime architecture: nginx proxying to gunicorn (3 workers), the middleware chain in declaration order, the deny-by-default DRF layer and 11 Django apps, plus MySQL, Redis, GeoIP, rotating logs and the mail providers',
        },
        caption: {
          zh: '單機部署的執行期全貌,middleware 依 settings.py 的實際順序排列。右下的註記寫的是這個系統的真相:沒有任何 broker——celery.py 是 0 位元組的空檔,非同步工作全部跑在 in-process 的 ThreadPoolExecutor(監控 4、稽核 2、文章圖片 5)與寄信用的 threading.Thread 上;whitenoise 躺在 requirements.txt 裡卻沒接進 MIDDLEWARE。',
          en: 'The whole runtime of a single-server deployment, with the middleware in the order settings.py actually declares. The note bottom-right states the truth of the system: there is no broker — celery.py is a 0-byte file, and every async job runs on in-process ThreadPoolExecutors (4 for monitoring, 2 for the audit log, 5 for article images) plus a threading.Thread for mail. whitenoise sits in requirements.txt and was never wired into MIDDLEWARE.',
        },
      },
      {
        src: '/images/work/nkust-alumni/diagram-account-lifecycle.svg',
        alt: {
          zh: '系友帳號的狀態圖:三條開通路徑、登入與登出、密碼重設碼、停用與刪除,每個轉換都標上對應端點與權限',
          en: 'Alumni account state diagram: three provisioning paths, login and logout, the password-reset code, deactivation and deletion, each transition labelled with its endpoint and permission',
        },
        caption: {
          zh: '帳號從三條開通路徑(自助註冊、管理員單筆建立、Excel 批次匯入)一路到停用與刪除的狀態機。停用不只翻 is_active——它在 transaction.atomic + select_for_update 裡把該使用者的每一張 OutstandingToken 加進黑名單;而既有帳號的 is_staff / is_superuser 全站只剩一個端點改得動。這是資安整改之後留下的形狀。',
          en: 'The account state machine, from three provisioning paths (self-registration, single admin create, Excel bulk import) through deactivation and deletion. Deactivating does more than flip is_active: inside transaction.atomic with select_for_update it blacklists every OutstandingToken the user holds. And on an existing account, exactly one endpoint may still change is_staff or is_superuser — the shape the security remediation left behind.',
        },
      },
      {
        src: '/images/work/nkust-alumni/diagram-domain-er.svg',
        alt: {
          zh: '核心領域 ER 圖:以真實 MySQL 表名繪製系友、公司、產品、職缺、文章與稽核紀錄之間的關聯、關鍵欄位與索引名稱',
          en: 'Core domain ER diagram drawn with the real MySQL table names — alumni, companies, products, job posts, articles and the audit log, with their relations, key columns and index names',
        },
        caption: {
          zh: '核心領域的 ER 圖,節點用的是真實的資料表名與索引名,不是模型類別名。順帶照實畫出一處歷史包袱:product 與 picture 兩個 app 各自有一個叫 ProductImage 的模型,資料表形狀還不一樣。監控相關的表除了 crud_logs 之外未收進圖中。',
          en: 'The core domain, drawn with the real table and index names rather than model class names. It also draws one piece of history as-is: the product and picture apps each define a model called ProductImage, with differently shaped tables. Monitoring tables other than crud_logs are deliberately left out.',
        },
      },
    ],
  },
  {
    slug: 'nkust-borrow',
    domain: 'fullstack',
    visibility: 'public',
    title: {
      zh: '高科大設備借用管理系統',
      en: 'NKUST Equipment Borrowing System',
    },
    oneLiner: {
      zh: '條碼借還、盤點、賠償與用餐基金記帳的系所內部系統;2025 年起獨立開發並部署。',
      en: 'Barcode lending, inventory, compensation and a meal-fund ledger for a university department — solo-built and deployed since 2025.',
    },
    scope: { zh: '已部署 · 獨立開發', en: 'Deployed · solo build' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REACT', 'PLAYWRIGHT'],
    keyMetric: { value: '1,181', label: { zh: '後端測試函式', en: 'backend tests' } },
    links: { live: 'https://equipment-borrowing.binbinbob.work' },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '系所的設備借還原本依附在一套舊平台的模組上,資料髒、難維護;「用餐基金」則是一份人工維護的 Excel。這個系統同時承接兩件事:把設備借還(含逾期、賠償、盤點、套組)系統化,並把基金記帳轉成有帳戶餘額、結算期間與現金核對的正式帳。',
          en: "The department's equipment lending lived inside a legacy platform module with messy data, and the shared meal fund was a hand-maintained spreadsheet. This system took over both: formalizing lending (overdue, compensation, stocktakes, kits) and turning the fund into real ledger accounting with balances, settlement periods and cash verification.",
        },
      ],
      constraints: [
        {
          zh: '要承接舊系統資料庫,舊借用紀錄大量欄位為空、品質差。',
          en: 'Had to absorb the legacy database — old borrowing records were riddled with empty fields.',
        },
        {
          zh: '櫃檯借還是高頻操作、使用者非技術背景,單筆流程必須在幾秒內完成。',
          en: 'Front-desk lending is high-frequency and run by non-technical staff — each transaction must finish in seconds.',
        },
        {
          zh: '單台 VPS、無容器與 Redis:快取用行程內 LocMemCache,速率限制改用 DB cache 以跨 worker 共享。',
          en: 'One VPS, no containers or Redis: caching is in-process LocMemCache, with rate limits on a DB cache to share across workers.',
        },
      ],
      architecture: [
        {
          zh: 'Django 5 + DRF 模組化單體,依領域切成 13 個 app(borrowing、finance、audit、inventory、kits⋯),28 個資料模型、24 個資源路由加 87 個自訂 action;前端 React 19 + Ant Design,40 個頁面。JWT 放 HttpOnly cookie 並做 refresh rotation 與 blacklist;RBAC 以 Role/Capability 建模。',
          en: 'A Django 5 + DRF modular monolith split into 13 domain apps (borrowing, finance, audit, inventory, kits…) — 28 models, 24 resource routes plus 87 custom actions — with a React 19 + Ant Design frontend of 40 pages. JWT lives in HttpOnly cookies with refresh rotation and blacklisting; RBAC is modeled as Roles and Capabilities.',
        },
        {
          zh: '稽核是獨立子系統:middleware 自動記錄操作(含敏感操作標記、耗時、回應狀態),另有欄位級的模型變更記錄。財務子系統做用餐基金:交易寫入時自動維護帳戶餘額,支援結算期間與現金核對,整套帳可從原始 Excel 一鍵匯入重建。',
          en: 'Auditing is its own subsystem: middleware records every operation (sensitive-action flags, latency, response status), plus field-level model change logs. The finance subsystem runs the meal fund: transactions maintain account balances on write, with settlement periods and cash verification — and the whole ledger can be rebuilt from the original spreadsheet in one import.',
        },
      ],
      responsibilities: [
        {
          zh: '前後端獨立開發(git 全歷史單一作者,2025/09–2026/07):資料模型、API、權限、React 前端、測試策略與部署(nginx + gunicorn systemd)。',
          en: 'Independent full-stack development (single author across the entire git history, 2025/09–2026/07): data models, APIs, permissions, the React frontend, test strategy and deployment (nginx + gunicorn under systemd).',
        },
      ],
      challenges: [
        {
          c: {
            zh: '舊系統的借用紀錄要搬進新 schema,但資料髒到直接匯入必然失敗。',
            en: 'Legacy borrowing records had to move into the new schema, but the data was too dirty to import directly.',
          },
          s: {
            zh: '寫了一組遷移工具(每個實體一個 mapper、獨立 verifier、支援 dry-run 與報表),舊庫以獨立 connection 隔離。一次實跑 180 秒搬入 9,138 筆借用單、3,336 名學生與 370 件設備;同時有 2,271 筆舊紀錄因空欄位報錯——這批錯誤被完整留在遷移報表裡,成為列管中的資料品質債,而不是被吞掉。',
            en: 'Built a migration toolkit (one mapper per entity, a standalone verifier, dry-run and reports), keeping the legacy DB behind its own connection. One real run took 180 seconds and moved 9,138 borrow tickets, 3,336 students and 370 pieces of equipment — while 2,271 legacy rows failed on empty fields. Those errors live in the migration report as tracked data-quality debt, not swallowed.',
          },
        },
        {
          c: {
            zh: '櫃檯要快:人工輸入太慢,而且桌機與手機的掃描硬體完全不同。',
            en: 'The front desk needs speed — manual entry was too slow, and desktop and mobile scan with entirely different hardware.',
          },
          s: {
            zh: '整條流程條碼化:後端以 Code128 產生設備標籤,前端依裝置自動切換模式——桌機走掃碼槍輸入、手機開相機(@zxing),支援批次連掃與同碼短時間去重,一掃帶出設備與借用單。',
            en: 'Made the whole flow barcode-driven: the backend generates Code128 labels; the frontend auto-switches by device — scanner-gun input on desktop, camera (@zxing) on mobile — with batch scanning and short-window dedup. One scan pulls up the equipment and its ticket.',
          },
        },
        {
          c: {
            zh: '用餐基金的 Excel 有多年新舊資料混雜,轉成正式帳不能弄丟一筆。',
            en: "Years of old and new records were tangled in the meal-fund spreadsheet — formalizing it couldn't lose a single row.",
          },
          s: {
            zh: '寫成兩遍式匯入命令:第一遍建帳戶與收支類別,第二遍處理期初餘額、結算期間與逐筆交易,整體包在資料庫交易裡,支援 dry-run 與重跑;交易寫入自動維護餘額,月底有現金核對機制。',
            en: 'Wrote a two-pass import command: pass one creates accounts and categories, pass two handles opening balances, settlement periods and every transaction — all inside a DB transaction, with dry-run and re-runs. Balances maintain themselves on write, and month-end cash verification closes the loop.',
          },
        },
      ],
      facts: [
        { value: '13', label: { zh: '領域模組', en: 'domain apps' } },
        { value: '86', label: { zh: '自訂 API actions', en: 'custom API actions' } },
        { value: '1,181', label: { zh: '後端測試函式', en: 'backend test functions' } },
        { value: '36', label: { zh: 'Playwright E2E', en: 'Playwright E2E specs' } },
      ],
      lessons: [
        {
          zh: '遷移的防呆要做在 mapper 層:2,271 筆錯誤幾乎全是同一種空欄位問題,先清洗再匯入,整份錯誤報表就不會存在。',
          en: 'Migration guards belong in the mapper: the 2,271 failures were nearly all one class of empty-field problem — clean first, import second, and that error report never exists.',
        },
        {
          zh: '把錯誤靜默成「一切正常」比壞掉更危險。後期 UIUX 稽核點出的重複頁面與假資料顯示,是快速堆功能階段留下的債——現在有清單、有編號地在還。',
          en: "Silencing errors into 'everything is fine' is worse than breaking. The duplicate pages and fake-data displays a late UX audit surfaced are debt from the fast-stacking phase — now numbered, listed, and being paid down.",
        },
      ],
    },
    screenshots: [
      {
        src: '/images/work/nkust-borrow/borrow-desk.webp',
        alt: {
          zh: '借還作業中心的借用分頁:左側以學號搜尋帶出學生班級與電話,右側是預計歸還日期與備註,下方設備清單已加入三件影音設備,底部是確認借用按鈕',
          en: 'The borrow tab of the lending desk: a student search on the left resolves class and phone, due date and note sit on the right, three AV items are already in the equipment cart, with the confirm button at the bottom',
        },
        caption: {
          zh: '櫃檯借用流程一路操作到最後一步:搜尋學生自動帶出班級與電話,連續加入三件設備,只差按下「確認借用」——這一步刻意沒按,所以畫面上沒有任何已寫入的結果。頂端「逾期未還 13」是即時算出來的,不是資料庫欄位。',
          en: 'The front-desk borrow flow driven to its last step: searching a student pulls in class and phone, three items go into the cart, and only 確認借用 remains. It was deliberately not clicked, so nothing on screen is a committed write. The "13 overdue" tile at the top is computed on the fly, not a stored column.',
        },
      },
      {
        src: '/images/work/nkust-borrow/dashboard.webp',
        alt: {
          zh: '儀表板:設備總數、借出中、可借用、學生總數、今日借出與今日歸還六個統計磚,近七天借還長條圖,借用率與可用率進度條,以及最近借用記錄表格',
          en: 'Dashboard with six KPI tiles (total equipment, on loan, available, students, borrowed today, returned today), a seven-day borrow/return bar chart, utilisation and availability bars, and a recent-activity table',
        },
        caption: {
          zh: '儀表板把六個統計磚、近七天趨勢圖、使用率條與最近借用記錄放在一頁。這次截圖跑在一次性 SQLite 上的合成種子資料(200 件設備、4,000 名學生皆由 Faker 產生),專案正式環境用的是 MySQL。',
          en: 'The dashboard puts six KPI tiles, a seven-day trend chart, utilisation bars and recent activity on one page. This capture ran against synthetic seed data on a throwaway SQLite file — the 200 items and 4,000 students are Faker-generated; the project itself runs on MySQL.',
        },
      },
      {
        src: '/images/work/nkust-borrow/equipment-catalog.webp',
        alt: {
          zh: '設備管理中心:左側依類別與地點展開的分類樹、右側 200 筆設備表格,上方有新增設備、批次匯入、匯出清單與批次列印條碼按鈕;設備編號欄位顯示為空白',
          en: 'Equipment management: a category-and-location tree on the left, a 200-row equipment table on the right with add, batch import, export and batch barcode-print actions above it; the equipment-code column renders blank',
        },
        caption: {
          zh: '設備管理中心:左側分類樹同時依類別與地點切分,右側是 200 筆清單加批次匯入、匯出與批次列印條碼。「設備編號」欄是空的——這是拍攝當下發現的真實 bug:前端 column 宣告 dataIndex 為 code,API 實際序列化的欄位叫 serial_number。資料在回應裡,只是讀錯 key;沒有為了讓截圖好看去改它。',
          en: 'Equipment management: the tree on the left slices the catalogue by category and by location, while the right side carries 200 rows plus batch import, export and batch barcode printing. The 設備編號 column is blank — a real bug caught during capture: the column declares dataIndex `code` while the API serialises the field as `serial_number`. The data is in the response; the column reads the wrong key. It was left alone rather than patched to flatter a screenshot.',
        },
      },
      {
        src: '/images/work/nkust-borrow/borrow-history.webp',
        alt: {
          zh: '借用紀錄查詢頁:關鍵字、日期區間與狀態三個篩選欄位,匯出 CSV 按鈕,以及 135 筆借用單的分頁表格,部分列帶有延期動作',
          en: 'Borrow-record search: keyword, date-range and status filters, a CSV export button, and a paginated table of 135 borrow tickets, some rows carrying an extend action',
        },
        caption: {
          zh: '借用紀錄查詢:關鍵字、日期區間、狀態三段篩選加 CSV 匯出,135 筆分頁列出。可延期的單子才會出現「延期」——後端把單次延長限制在 1 到 30 天,超出範圍直接擋在 API。',
          en: 'Borrow-record search: keyword, date-range and status filters plus CSV export over a paginated 135-row table. Only eligible tickets show the extend action — the backend caps a single extension at 1 to 30 days and rejects anything outside that range at the API.',
        },
      },
      {
        src: '/images/work/nkust-borrow/utilisation-report.webp',
        alt: {
          zh: '設備使用率分析頁:總設備數、借用中設備、累計借用次數與平均借用天數四個統計磚,下方是依借用次數排名的設備明細表,含序號、分類、地點、狀態與最後借用時間',
          en: 'Equipment utilisation report: four KPI tiles (total items, on loan, cumulative borrows, average borrow days) above a table of equipment ranked by borrow count, with serial number, category, location, status and last-borrowed time',
        },
        caption: {
          zh: '使用率分析把 200 件設備依累計借用次數排名,每列帶平均借用天數與最後借用時間,用來找出誰是熱門品項、誰在架上生灰。順帶一提:序號在這一頁正常顯示——同一份 API 資料,只是這裡的 column 設定沒有踩到設備管理頁那個讀錯 key 的問題。',
          en: 'The utilisation report ranks all 200 items by cumulative borrow count, each row carrying average borrow days and last-borrowed time — enough to tell the hot items from the shelf-warmers. Worth noting: the serial number renders correctly here. Same API payload; this page’s column config simply does not hit the wrong-key bug the equipment table does.',
        },
      },
      {
        src: '/images/work/nkust-borrow/tablet-borrow-desk.webp',
        alt: {
          zh: '同一個借還作業中心在平板寬度下的樣子:側欄收成漢堡選單,設備清單從表格改排成雙欄卡片,每張卡片列出設備編號、名稱、類別與存放地點',
          en: 'The same lending desk at tablet width: the sidebar collapses into a hamburger menu and the equipment cart switches from a table to two columns of cards listing code, name, category and location',
        },
        caption: {
          zh: '同一個借用畫面在 834px 平板寬度:側欄收成漢堡選單,設備清單從表格改排成雙欄卡片,欄位變成標籤/值的直列。這不是把表格橫向捲動了事,而是換一種資訊排法。',
          en: 'The same borrow screen at an 834px tablet width: the sidebar collapses to a hamburger and the equipment cart drops its table for two columns of label/value cards. Not a table shoved into a horizontal scroller — a different layout for the same data.',
        },
      },
      {
        src: '/images/work/nkust-borrow/mobile-dashboard.webp',
        alt: {
          zh: '390px 手機寬度的儀表板:六個統計磚排成雙欄、長條圖的日期軸標籤轉為直排、使用率條與最近借用記錄依序往下堆疊',
          en: 'The dashboard at 390px phone width: six KPI tiles reflow into two columns, the bar chart rotates its date labels vertically, and utilisation bars and recent activity stack below',
        },
        caption: {
          zh: '390px 手機寬度的同一張儀表板:統計磚改成雙欄、圖表的日期軸標籤轉直排、其餘區塊依序堆疊。桌機、平板、手機三種寬度都是同一支 Playwright 腳本對著跑起來的 app 實拍,不是縮圖模擬。',
          en: 'The same dashboard at a 390px phone width: KPI tiles reflow to two columns, the chart rotates its date labels, and the remaining blocks stack in order. All three widths — desktop, tablet, phone — come from one Playwright run against the live app, not from a resized mockup.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/nkust-borrow/diagram-borrow-lifecycle.svg',
        alt: {
          zh: '狀態圖:借用單(6 種狀態)、借用明細行(4 種)與設備(4 種)三組狀態機,每條轉移標註觸發它的 API 端點',
          en: 'State diagram of three machines — borrow ticket (6 states), line item (4) and equipment (4) — with every transition labelled by the API endpoint that fires it',
        },
        caption: {
          zh: '一張借用單同時驅動三組狀態機:單頭 6 種狀態、明細行 4 種、設備 4 種,圖上每條轉移都標了實際觸發它的端點。兩件事只有畫成圖才看得見:「逾期」根本不是儲存欄位,而是由 status 與 due_at 即時推導(靠 borrow_status_due_idx 撐住查詢);而 lost / damaged 兩個明細狀態雖然定義了、篩選器也讀得到,卻沒有任何正式路徑會寫入它們。',
          en: 'One borrow ticket drives three state machines at once — six ticket states, four line-item states, four equipment states — with each transition labelled by the endpoint that fires it. Two things only become visible once it is drawn: overdue is not a stored field at all but derived from status plus due_at (served by the borrow_status_due_idx index), and the lost / damaged line states, though defined and readable by the filters, have no production path that ever writes them.',
        },
      },
      {
        src: '/images/work/nkust-borrow/diagram-approve-request-path.svg',
        alt: {
          zh: '序列圖:核准借用單的請求從 React SPA 經 nginx、gunicorn、稽核與安全 middleware、DRF 認證授權,到 view 內的資料庫交易與三種稽核寫入',
          en: 'Sequence diagram of an approve request travelling from the React SPA through nginx, gunicorn, audit and security middleware, DRF auth, into the view transaction and three separate audit writes',
        },
        caption: {
          zh: 'POST /borrow-tickets/{id}/approve/ 從 nginx 到 MySQL 的完整往返——全系統最有意思的一條寫入路徑。核准時每個明細行都先 SELECT … FOR UPDATE 鎖住設備列,這正是兩位管理員同時核准同一件設備不會雙重借出的原因。同一次核准會被三套彼此獨立的機制各記一筆:ORM signal 寫 ModelChangeLog(涵蓋 11 個列管模型)、middleware 寫 AuditLog、view 明寫領域層的 BorrowStatusLog。',
          en: 'The full round trip of POST /borrow-tickets/{id}/approve/, nginx to MySQL — the most interesting write path in the system. Approval takes a SELECT … FOR UPDATE row lock per line item, and that lock is exactly what stops two admins double-issuing the same unit. A single approval then gets recorded three times by three independent mechanisms: ModelChangeLog from ORM signals (11 tracked models), AuditLog from middleware, and a domain-level BorrowStatusLog written explicitly by the view.',
        },
      },
      {
        src: '/images/work/nkust-borrow/diagram-authorization-layers.svg',
        alt: {
          zh: '流程圖:授權的四個層次——middleware 鏈、依序嘗試的三種認證方式、DRF 權限類別、view 內的逐列範圍限縮——並逐條列出每個路由實際落在哪一層',
          en: 'Flowchart of four authorization layers — the middleware chain, three authentication backends tried in order, DRF permission classes, and per-row scoping inside the view — with a route-by-route map of which layer each endpoint lands in',
        },
        caption: {
          zh: '授權其實是四層疊起來的:middleware 鏈、依序嘗試的三種認證方式、DRF 權限類別,再加上 view 內的逐列範圍限縮(例如非管理員只看得到自己開的單)。右側逐條列出每個路由實際落在哪一層。圖上也標出 RBAC 停在哪裡:Role/Capability 有建模、有種子資料、會回傳給前端做按鈕灰化,但伺服器端真正讀 capability 的只有備份模組;其餘實質上是 is_staff 說了算。這是設計現況,不是圖畫錯了。',
          en: 'Authorization is four layers stacked: the middleware chain, three authentication backends tried in order, DRF permission classes, and per-row scoping inside the view (a non-admin sees only tickets they created). The right-hand column maps route by route which layer each endpoint actually lands in. The figure also marks where RBAC stops: Roles and Capabilities are modelled, seeded and returned to the SPA so it can grey out buttons, but the only server-side code that reads a capability is the backups module — everything else effectively gates on is_staff. That is the current design, not a drafting error.',
        },
      },
      {
        src: '/images/work/nkust-borrow/diagram-runtime-architecture.svg',
        alt: {
          zh: '架構圖:Cloudflare 到 nginx、gunicorn 三個 worker、Django 十三個領域 app、MySQL 與兩組快取,並標示沒有 Celery、Redis 或排程器',
          en: 'Architecture diagram from Cloudflare through nginx, three gunicorn workers, thirteen Django domain apps, MySQL and two cache aliases — explicitly marking the absence of Celery, Redis or any scheduler',
        },
        caption: {
          zh: '單台 VPS 上真正跑起來的形狀:Cloudflare → nginx → gunicorn 三個 sync worker → MySQL 8,十三個領域 app 共用同一個行程。這張圖刻意把「不存在的東西」也畫進去:沒有 Celery、沒有 Redis、沒有排程器,所以逾期通知信、Excel 匯出、PDF 條碼標籤與 demo 重置全都同步跑在 web worker 裡,而唯一跨 worker 共享的狀態是速率限制用的 DatabaseCache——限制條件長成什麼樣,架構就會長成什麼樣。',
          en: 'What actually runs on a single VPS: Cloudflare → nginx → three gunicorn sync workers → MySQL 8, with thirteen domain apps sharing one process. The figure deliberately draws the absences too: no Celery, no Redis, no scheduler — so overdue mail, Excel export, PDF barcode labels and the demo reseed all run synchronously inside the web worker, and the rate-limit DatabaseCache is the only state shared between workers. The shape of the constraint is the shape of the architecture.',
        },
      },
      {
        src: '/images/work/nkust-borrow/diagram-domain-schema.svg',
        alt: {
          zh: 'ERD:借用單、明細行、賠償、設備、分類、地點、學生與帳號權限等核心資料表,標註真實的 MySQL 表名、欄位型別與外鍵刪除行為',
          en: 'Entity-relationship diagram of the core tables — tickets, line items, compensation, equipment, categories, locations, students and accounts — annotated with real MySQL table names, column types and foreign-key delete behaviour',
        },
        caption: {
          zh: '核心領域 schema,用的是真實 MySQL 表名與欄位型別(repo 裡沒有任何 db_table 覆寫,所以圖上的名字就是資料庫裡的名字)。兩個設計決定從圖上看得最清楚:明細行的 equipment_id 允許為 NULL,好讓椅子、鑰匙這類沒有建檔的臨時品項也能掛在同一張單上,再用兩條 partial unique constraint 分別擋掉重複設備與重複臨時品名;而 master data 一律以 PROTECT 相連,借過的設備刪不掉。',
          en: 'The core domain schema, drawn with real MySQL table names and column types — the repo overrides no db_table anywhere, so the names in the figure are the names in the database. Two design decisions read most clearly here: a line item’s equipment_id is nullable so unregistered ad-hoc items like chairs and keys can ride on the same ticket, guarded by two partial unique constraints against duplicate equipment and duplicate ad-hoc names; and master data is wired with PROTECT, so a piece of equipment someone has borrowed cannot be deleted out from under its history.',
        },
      },
    ],
  },
  {
    slug: 'microservices-platform',
    domain: 'backend',
    visibility: 'internal',
    title: {
      zh: '大型 Django 微服務全通路商務平台',
      en: 'Large-scale Django Microservices Commerce Platform',
    },
    oneLiner: {
      zh: '33 個 Django 微服務支撐電商、多租戶門市 POS、B2B 採購、業務 CRM 與獎金、線上課程與設計師共創六大業務域;營運中。',
      en: 'Thirty-three Django microservices behind six business domains — e-commerce, multi-tenant store POS, B2B purchasing, sales CRM and commissions, courses and designer co-creation. In production.',
    },
    scope: { zh: '公司內部 · 營運中', en: 'Internal · in production' },
    stack: ['DJANGO', 'DRF', 'CELERY', 'MYSQL', 'REDIS', 'NGINX'],
    keyMetric: { value: '33', label: { zh: '微服務', en: 'microservices' } },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '同一家零售業者同時經營線上商城、連鎖門市、企業批發與外勤業務團隊:四個通路各自產生訂單、動用同一批庫存、面對同一群會員、走同一套金流。各建一套系統的結局是庫存超賣、會員身分割裂與對帳災難。這個平台以領域切分的微服務承載:每個業務域一個 Django 服務、一個獨立資料庫,跨域以帶重試的同步 REST 與 Celery 非同步任務整合;金流、電子發票、物流等對外整合集中在專責服務,其他服務不觸碰第三方憑證。',
          en: 'One retailer runs an online mall, chain stores, B2B wholesale and a field sales team at once — four channels creating orders against the same inventory, the same members, the same payment rails. Separate systems per channel end in oversold stock, split identities and reconciliation chaos. This platform carries it on domain-split microservices: one Django service and one database per business domain, integrated across domains by retrying REST calls and Celery tasks; payments, e-invoicing and logistics live in dedicated services so nothing else touches third-party credentials.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開;所有規模數字皆可在 repo 內以指令重跑驗證。',
          en: 'Company-internal; the codebase is private. Every scale figure here re-runs as a command inside the repo.',
        },
        {
          zh: '裸機部署、無雲端託管預算:沒有 K8s,健康檢查、依賴順序三階段啟動與 Celery worker 管理全由自製啟動腳本承擔。',
          en: 'Bare-metal with no cloud budget: no Kubernetes — health checks, three-stage dependency-ordered startup and Celery worker management all fall to a hand-built orchestration script.',
        },
        {
          zh: '多租戶隔離是硬性要求:門市 POS 每租戶一庫,租戶 header 只能當「聲明」,權威必須來自 JWT 簽章內的 claim。',
          en: 'Tenant isolation is non-negotiable: store POS runs one database per tenant, and the tenant header is only ever a claim — authority comes from the signed JWT.',
        },
        {
          zh: '營運中系統不可停機:金流與訂單鏈路的修復必須在不中斷交易下上線。',
          en: 'The system is live: payment- and order-path fixes must land without interrupting transactions.',
        },
      ],
      architecture: [
        {
          zh: '多服務架構——不是單體拆分,而是逐域生長:Django 4.2 LTS + DRF,33 個服務、807 個資料模型、729 個 ViewSet 註冊加 2,203 個自訂 action,Python 主體約 153 萬行(不含 migrations)。選多服務的核心理由是發布節奏與風險容忍度:金流服務的變更風險和內容服務完全不同,獨立部署邊界讓高風險域能單獨小步發布。',
          en: 'A many-service architecture — grown domain by domain, not carved from a monolith: Django 4.2 LTS + DRF across 33 services, 807 data models, 729 ViewSet registrations plus 2,203 custom actions, ~1.53M lines of Python excluding migrations. The case for services is release cadence and risk: a payment service tolerates change very differently from a content service, and independent deploy boundaries let high-risk domains ship in small, separate steps.',
        },
        {
          zh: '認證採 RS256 非對稱 JWT:單一簽發服務持私鑰、其餘服務只驗公鑰、不回查使用者庫,權限碼在簽發時注入 token。每服務一個 MySQL 庫、三個 Redis 實例分工(快取/Session 與分散鎖/Celery 佇列);跨服務只存對方主鍵、不設資料庫外鍵,ID 用 Snowflake 並以字串序列化防 JS 精度問題。每服務一個 Celery worker、5 個服務帶 Beat 排程;金流、電子發票、超商與宅配物流、FCM 推播、社群登入集中在專責服務。CI 之外另自建每週四層回歸:健康閘 → 218 端點唯讀煙霧基線比對 → pytest → 跨服務 E2E。',
          en: 'Auth is asymmetric RS256 JWT: one issuing service holds the private key, everything else verifies with the public key and never calls back to the user store; permission codes are baked into the token at issue time. Each service owns a MySQL database; three Redis instances split cache, sessions-plus-locks, and Celery queues. Cross-service references store bare primary keys — no database foreign keys — with Snowflake IDs serialized as strings for JS precision. One Celery worker per service, five with Beat schedules; payments, e-invoicing, convenience-store and home logistics, FCM push and social login concentrate in dedicated services. Beyond CI, a weekly four-layer regression runs: health gate → a 218-endpoint read-only smoke baseline → pytest → cross-service E2E.',
        },
      ],
      responsibilities: [
        {
          zh: '主導開發:2025 年 1 月專案創始即參與,2025 年 9 月起為唯一主力;全期 731/825 個 commit(89%,兩組 git 身分皆為我)。範圍涵蓋服務架構與新業務域建置(POS 多租戶、B2B、業務 CRM 與獎金歸因、課程、設計共創)、跨平台資安/效能/正確性稽核修復、回歸測試基建與部署維運。',
          en: 'Lead development: on the project since its start in January 2025, sole main contributor since September 2025 — 731 of 825 commits (89%, both git identities mine). Scope spans service architecture and new domains (multi-tenant POS, B2B, sales CRM and commission attribution, courses, designer co-creation), platform-wide security/performance/correctness audits, the regression infrastructure and deployment operations.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '稽核發現金流回調的驗簽實作與金流商規範不符——所有合法回調都會被拒,付款成功但訂單狀態不同步;且付款成功只更新電商主訂單,B2B 與 POS 通路沒有任何同步路徑。',
            en: 'An audit found the payment-callback signature check implemented off-spec — every legitimate callback was rejected, so payments succeeded while orders never updated; and success only touched the e-commerce order, with no sync path at all for B2B and POS.',
          },
          s: {
            zh: '重寫簽章演算法對齊規範;新建「付款後通路同步」單一入口,依訂單來源分流到電商/B2B/POS/訂閱四條路徑,並加入冪等分支讓重複回調自癒而非重複入帳;以金流沙盒的真實回調驗證閉環後上線。',
            en: 'Rewrote the signature algorithm to spec and built a single post-payment sync entry point fanning out by order origin — e-commerce, B2B, POS, subscription — with idempotent branches so duplicate callbacks self-heal instead of double-booking. Verified the loop against real sandbox callbacks before shipping.',
          },
        },
        {
          c: {
            zh: '多個服務的非同步任務看似正常註冊、無任何錯誤日誌,實際上從未執行:任務投遞到 TASK_ROUTES 宣告的佇列,worker 卻監聽另一組佇列名,訊息安靜堆在無人消費的佇列裡。同類錯配在 4 個服務獨立發生——告警長期未寄出、發獎鏈整條斷裂、圖片變體全停。',
            en: 'Async tasks in several services registered cleanly, logged nothing — and never ran: tasks were routed to the queues declared in TASK_ROUTES while workers listened on differently named ones, messages piling up silently with no consumer. The same mismatch surfaced independently in four services — alerts never sent, the reward chain severed, image variants stalled.',
          },
          s: {
            zh: '逐服務比對 TASK_ROUTES 與啟動腳本的 -Q 參數,統一為服務專屬佇列名慣例並修正啟動腳本;修復後以 Beat 實跑驗證告警真實寄達、發獎鏈 E2E 冪等通過。',
            en: 'Diffed TASK_ROUTES against each startup script’s -Q flags, unified on a per-service queue-name convention and fixed the orchestration script — then proved it live: alert mail actually arriving, the reward chain passing an idempotent E2E.',
          },
        },
        {
          c: {
            zh: '平台長到 30+ 服務後,熱路徑劣化無人統測:登入實測 4.08 秒(每次登入同步遠端查權限),庫存統計端點因 threading.Lock 重入自我死鎖直接卡死 20 秒。',
            en: 'Past 30 services, hot-path decay had no owner: login measured 4.08 seconds (a synchronous remote permission lookup on every login), and the inventory stats endpoint hard-hung for 20 seconds on a re-entrant threading.Lock deadlock.',
          },
          s: {
            zh: '先建 curl 基線入庫,再分波修復 28 個服務、逐項複測:登入 4.08s → 0.55~0.75s(約 5–7 倍),庫存統計 20 秒卡死 → 0.014s(Lock 改 RLock 解死鎖),全程零新增 5xx;並確立 gevent worker 下 CONN_MAX_AGE=0 為正解、全平台統一。',
            en: 'Built a curl baseline first, then fixed 28 services in waves with re-measurement after each: login went 4.08s → 0.55–0.75s (~5–7×), the stats endpoint from a 20-second hang to 0.014s (Lock → RLock), zero new 5xx throughout — and settled CONN_MAX_AGE=0 as the platform-wide rule under gevent workers.',
          },
        },
      ],
      facts: [
        { value: '33', label: { zh: '微服務(每服務獨立 DB)', en: 'microservices, one DB each' } },
        { value: '807', label: { zh: '資料模型', en: 'data models' } },
        { value: '16,433', label: { zh: '後端測試函式', en: 'backend test functions' } },
        { value: '89%', label: { zh: '個人 commit(731/825)', en: 'of commits mine (731/825)' } },
      ],
      lessons: [
        {
          zh: '佇列名是一種契約,而人工同步的契約一定會斷:同一類 routes 與 worker 錯配在四個服務獨立重現,因為佇列名寫在兩個檔案裡靠人肉對齊。真正的修法不是修四次,而是讓啟動腳本從服務自身設定生成佇列參數——單一事實來源。',
          en: 'A queue name is a contract, and contracts kept in sync by hand always break: the same routes-vs-worker mismatch recurred independently in four services because the name lived in two files. The real fix is not fixing it four times — it is generating worker queue flags from each service’s own config. One source of truth.',
        },
        {
          zh: '效能要有人擁有基線,否則劣化是安靜的:登入 4 秒、統計 20 秒不是一夜發生,而是在沒有量測的日常中逐步累積,直到專項稽核才被看見。重來會在服務數突破十個時就建立熱路徑基線與定期複測,而不是等到 30 個。',
          en: 'Performance needs an owned baseline, because decay is silent: a 4-second login and a 20-second hang did not happen overnight — they accrued through unmeasured routine until a dedicated audit made them visible. Next time the hot-path baseline starts at ten services, not thirty.',
        },
      ],
    },
  },
  {
    slug: 'retail-pos',
    domain: 'fullstack',
    visibility: 'internal',
    title: {
      zh: '多租戶零售收銀系統',
      en: 'Multi-tenant Retail POS System',
    },
    oneLiner: {
      zh: '連鎖門市的收銀結帳、班次現金核對、企業客戶與電子發票整合在同一個多租戶平台,每租戶一個獨立資料庫;營運中。',
      en: 'Checkout, shift cash reconciliation, B2B customers and e-invoicing for chain stores on one multi-tenant platform — one physical database per tenant. In production.',
    },
    scope: { zh: '公司內部 · 營運中 · 全端', en: 'Internal · in production · full stack' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REDIS', 'REACT', 'TYPESCRIPT'],
    keyMetric: { value: '288', label: { zh: '後端 API 路由', en: 'backend API routes' } },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: '美業連鎖門市常見的現場問題:多間門市、多台收銀機各自為政,售價、庫存與會員資料在門市之間對不上;班次交接靠紙本核對現金;企業客戶的月結請款和一般消費訂單混在一起;電子發票沒進系統,就是多一道人工作業。這套系統把收銀、班次現金核對、企業客戶管理與電子發票開立整合進同一個多租戶平台——總部用同一套後台管理所有門市,門市端有一致的操作介面。',
          en: 'A familiar scene in beauty-industry chain retail: stores and registers run independently, so prices, stock and member data drift apart; shift handovers reconcile cash on paper; corporate monthly billing tangles with consumer orders; e-invoicing without system support is one more manual chore. This platform folds checkout, shift cash reconciliation, corporate customers and e-invoice issuance into one multi-tenant system — headquarters manages every store from one console, and stores share one consistent interface.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開;前端已部署、營運中。',
          en: 'Company-internal; the codebase is private. The frontend is deployed and in production.',
        },
        {
          zh: '每個租戶一個獨立實體 MySQL 資料庫:中介層必須在每個請求開始時解析並綁定租戶,任何一處漏掉租戶邊界就是資料外洩或錯亂。',
          en: 'One physical MySQL database per tenant: middleware must resolve and bind the tenant at the start of every request — any miss is a leak or data corruption.',
        },
        {
          zh: '收銀熱路徑不能因網路不穩中斷交易:結帳離線時先寫本機,恢復連線後帶冪等鍵自動重試,不能重複收費。',
          en: 'The checkout hot path must survive flaky networks: offline sales persist locally and retry with an idempotency key on reconnect — never charging twice.',
        },
        {
          zh: '與平台其他約 30 個服務共用 Redis 與 MySQL:Celery 任務必須走服務專屬佇列,否則會被其他服務的 worker 搶走執行。',
          en: 'Redis and MySQL are shared with ~30 other platform services: Celery tasks must ride a service-specific queue or other services’ workers will steal them.',
        },
      ],
      architecture: [
        {
          zh: 'Django REST Framework 服務,是大型多服務平台的一員,自身刻意不再往下拆:收銀、購物車、班次、訂單、退款這些強關聯流程共用同一個資料庫交易邊界,比分散式交易簡單可靠。規模:8 個 app、24 個資料模型、288 個 API 路由(Django URL resolver 實測、排除框架路由)、後端約 2.7 萬行 Python;前端為獨立的 React 19 + TypeScript SPA,24 個頁面、49 個元件、94 個 API 呼叫點,約 4.5 萬行。',
          en: 'A Django REST Framework service — one member of a larger multi-service platform, deliberately not subdivided further: checkout, cart, shifts, orders and refunds are tightly coupled flows sharing one database transaction boundary, far simpler than distributed transactions. Scale: 8 apps, 24 models, 288 API routes (measured via Django’s URL resolver, framework routes excluded), ~27k lines of Python; the frontend is a standalone React 19 + TypeScript SPA — 24 pages, 49 components, 94 API call sites, ~45k lines.',
        },
        {
          zh: '多租戶以 thread-local 加自訂 DB Router 實作,每租戶一庫、請求進入時綁定。Redis 快取只用在唯讀的商品參考價(TTL 120 秒),購物車金額永遠即時重算,守住交易一致性;Celery 走專屬佇列;第三方整合為綠界電子發票的開立與列印;跨服務呼叫平台的認證、會員、庫存與企業客戶服務;CI 三條 GitHub Actions,後端以 gunicorn(gthread)部署。',
          en: 'Multi-tenancy is thread-local state plus a custom DB router — one database per tenant, bound as each request enters. Redis caching applies only to read-only reference prices (120s TTL); cart totals are always recomputed live to protect transactional consistency. Celery rides a dedicated queue; ECPay handles e-invoice issuance and printing; the service calls the platform’s auth, membership, inventory and B2B services; CI runs three GitHub Actions workflows, and the backend deploys on gunicorn (gthread).',
        },
      ],
      responsibilities: [
        {
          zh: '前後端獨立開發(2026/04–07,前端 93、後端 20 個 commit 皆出自我一人;後端所在 monorepo 有其他協作者,但 POS 兩個目錄無他人提交):資料模型與多租戶機制、API、收銀與班次流程、React 前端、效能優化與部署設定。',
          en: 'Independent full-stack development (2026/04–07; all 93 frontend and 20 backend commits are mine — the surrounding monorepo has other contributors, but no one else touched the two POS paths): data models and multi-tenancy, APIs, checkout and shift flows, the React frontend, performance work and deployment config.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '收銀員在購物車快速連點加商品,系統開始回報 network error:20 個併發請求下 p95 拉到 427ms。根因是四層疊加——每點一次發一個請求、後端每次整車重查、結帳路徑有 3 秒逾時的同步外呼、後端只有 6 個併發處理槽。',
            en: 'Rapid-fire taps on the cart made the register throw network errors: at 20 concurrent requests, p95 hit 427ms. Four causes stacked — one request per tap, a full cart re-query per response, a synchronous external pricing call with a 3-second timeout in the path, and only 6 concurrent slots on the backend.',
          },
          s: {
            zh: '四層對應解:後端免整車重查、新增批次端點(一批品項單一交易寫入、只重算一次);唯讀參考價加 Redis 快取但金額計算絕不快取;前端 debounce 合併連點——第一版 180ms 視窗比真實連點間隔(200–400ms)還短、等於沒合併,改成「閒置 500ms 或最長 2000ms」雙保險;併發槽 6 調到 24。結果:20 併發 p95 從 427ms 降到 206ms 且零失敗,10 件商品批次送出約 74ms。',
            en: 'Four matching fixes: the backend stopped re-querying the whole cart and gained a batch endpoint (one transaction, one recalculation per batch); read-only reference prices got Redis caching while totals stayed uncached; the frontend debounced taps — the first 180ms window was shorter than real tap intervals (200–400ms) and merged nothing, so it became “idle 500ms or max 2000ms”; concurrency went 6 → 24 slots. Result: p95 at 20 concurrent fell 427ms → 206ms with zero failures, and ten items submit as one ~74ms batch.',
          },
        },
        {
          c: {
            zh: '前端登入成功後,幾乎所有 API 都回 500。追查發現租戶的雪花 ID 超出 JavaScript 的安全整數範圍:JSON.parse 把它轉成 float64 近似值、差了 4——每個請求帶的租戶 ID 都是錯的,查詢落到不含業務資料表的預設資料庫。',
            en: 'After a successful login, nearly every API returned 500. The tenant’s Snowflake ID exceeded JavaScript’s safe-integer range: JSON.parse rounded it to a float64 approximation, off by 4 — every request carried the wrong tenant ID, and queries landed in a default database with no business tables.',
          },
          s: {
            zh: '後端序列化層把該欄位強制輸出字串,前端型別同步改 string;並定下通則:任何會傳到前端、可能超過 2^53 的整數識別碼一律用字串,不等它真的出錯。',
            en: 'The backend now serializes the field as a string and the frontend type changed to match — with a standing rule: any integer identifier that reaches the frontend and could exceed 2^53 travels as a string, without waiting for it to break.',
          },
        },
        {
          c: {
            zh: '前端最初單檔打包,首屏要下載 666KB(gzip)的 JavaScript,門市網路下開機等待明顯偏長。',
            en: 'The frontend originally shipped as one bundle: 666KB (gzipped) of JavaScript before first paint — a long boot on store-grade networks.',
          },
          s: {
            zh: '改成路由層級懶加載,只留登入、條款與收銀台主畫面在首屏;掃碼元件移出收銀熱路徑;打包設定只固定拆 React/MUI/React Query/Router 幾個穩定套件——曾把圖表與掃碼函式庫也手動指定分包,反而因交叉引用被拉回首屏,改讓它們自然跟著懶加載邊界走。首屏 JavaScript 從 666KB 降到 310KB(-53%)。',
            en: 'Moved to route-level lazy loading with only login, terms and the register screen eager; the scanner component left the checkout hot path; manual chunking pins only the stable vendors (React, MUI, React Query, Router) — hand-chunking the chart and scanner libraries had backfired, cross-references dragging them back into the entry, so they now follow their lazy boundaries. First-load JavaScript fell 666KB → 310KB (−53%).',
          },
        },
      ],
      facts: [
        { value: '288', label: { zh: '後端 API 路由', en: 'backend API routes' } },
        { value: '~45k', label: { zh: '前端 TS/TSX 行數', en: 'lines of TypeScript' } },
        { value: '606', label: { zh: '測試案例(後端+前端)', en: 'test cases (BE + FE)' } },
        { value: '113', label: { zh: 'commits · 單一開發者', en: 'commits, single author' } },
      ],
      lessons: [
        {
          zh: '併發問題常是疊加出來的,不是單一原因:只做 debounce,3 秒逾時的同步外呼仍會拖垮併發;只加併發槽,資料庫仍被大量小交易打滿。請求合併、快取邊界、資源配額要一起處理,單點優化只會帶來「感覺變好」的錯覺。',
          en: 'Concurrency problems are usually stacked, not singular: debounce alone leaves the 3-second synchronous call to sink you; more worker slots alone leave the database drowning in tiny transactions. Request merging, cache boundaries and resource quotas have to move together — a single-point fix only feels like a fix.',
        },
        {
          zh: '跨語言的數字精度是一種容易被忽略的系統邊界:雪花 ID 在資料庫與 Python 端毫無問題,只在「傳進 JavaScript」那一步壞掉,後端測試永遠抓不到。可能超過 2^53 的識別碼,一開始就該用字串傳輸。',
          en: 'Cross-language numeric precision is a system boundary that is easy to forget: the Snowflake ID was flawless in the database and in Python, and broke only on entry into JavaScript — a failure no backend test can catch. Identifiers that might exceed 2^53 should travel as strings from day one.',
        },
      ],
    },
  },
  {
    slug: 'b2b-wholesale-platform',
    domain: 'fullstack',
    visibility: 'internal',
    title: {
      zh: '多租戶 B2B 批發電商平台',
      en: 'Multi-tenant B2B Wholesale Commerce Platform',
    },
    oneLiner: {
      zh: '企業批發客戶的自助採購系統:分層報價、信用額度、月結對帳與金流物流同步;商家端營運中,管理後台已開發完成、因驗收暫緩啟用。',
      en: 'Self-service wholesale purchasing for corporate clients — tiered pricing, credit limits, monthly billing and payment/logistics sync. The merchant portal is live; the admin console is complete but held back pending acceptance.',
    },
    scope: { zh: '公司內部 · 商家端營運中', en: 'Internal · merchant portal live' },
    stack: ['DJANGO', 'DRF', 'CELERY', 'MYSQL', 'REACT', 'TYPESCRIPT'],
    keyMetric: { value: '297', label: { zh: '後端測試函式', en: 'backend tests' } },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: '批發與經銷客戶的下單,很容易停在電話、通訊軟體與 Excel:沒有依採購量自動套用的階梯報價、沒有信用額度控管,對帳靠人工核對出貨明細與請款金額。這套系統把 B2B 自助下單、權威報價(單價一律後端重算、不信任前端)、月結對帳與爭議申訴、訂單與金流物流狀態同步收斂到一個服務,讓企業客戶像操作一般電商一樣完成批發採購,內部保有額度與帳務的控管權。',
          en: 'Wholesale ordering tends to live in phone calls, chat apps and spreadsheets: no volume-tiered pricing applied automatically, no credit-limit control, reconciliation done by hand against shipping manifests. This system pulls self-service B2B ordering, authoritative pricing (unit prices recomputed server-side, never trusted from the client), monthly billing with dispute handling, and order/payment/logistics sync into one service — corporate clients buy like it is ordinary e-commerce while credit and billing control stays in-house.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開;涉及金流與訂單的修復必須在不中斷交易下完成。',
          en: 'Company-internal; the codebase is private. Payment- and order-path fixes must land without interrupting live transactions.',
        },
        {
          zh: '必須與平台既有的 5 個以上服務整合而不破壞其契約:會員、金流閘道、庫存、分析、業務歸屬與佣金——本服務不持有這些領域的資料,只做整合。',
          en: 'Must integrate with five-plus existing platform services without breaking their contracts — membership, the payment gateway, inventory, analytics, sales attribution — owning none of that data, only the integration.',
        },
        {
          zh: '商家端與管理端共用同一組後端,任何一處漏掉權限檢查,商家就可能看到別家公司的資料。',
          en: 'Merchant portal and admin console share one backend: a single missing permission check lets one company see another’s data.',
        },
        {
          zh: '裸機自架、無雲端託管預算,服務生命週期由自製腳本管理。',
          en: 'Bare-metal and self-hosted with no cloud budget; service lifecycles are managed by hand-built scripts.',
        },
      ],
      architecture: [
        {
          zh: 'Django + DRF 獨立微服務,12 個業務 app(認證、公司、商品、B2B 定價、購物車、銷售訂單、對帳、報價單、通知、促銷、帳務、聯絡),35 個資料模型、21 個資源註冊加 97 個自訂 action、30 個 Celery 任務,後端約 1.4 萬行;前端為獨立 React 19 + TypeScript SPA,約 4.1 萬行,商家端 22 頁營運中、管理端 30 頁已開發待啟用。B2B 獨立成服務而非塞進既有電商的理由:報價、信用額度與月結規則和 B2C 的定價付款邏輯差異夠大,分開讓兩邊各自演進。',
          en: 'A standalone Django + DRF microservice: 12 business apps (auth, company, product, B2B pricing, cart, sales orders, settlement, quotations, notifications, promotions, billing, contact), 35 models, 21 resource registrations plus 97 custom actions, 30 Celery tasks, ~14k lines; the frontend is a separate React 19 + TypeScript SPA of ~41k lines — 22 merchant pages live, 30 admin pages built and gated. B2B is its own service rather than a bolt-on to the e-commerce service because quoting, credit and monthly billing diverge enough from B2C pricing to deserve independent evolution.',
        },
        {
          zh: 'JWT 認證、全域預設 IsAuthenticated,免認證端點(登入、註冊、金流回調、服務間呼叫)逐一顯式宣告;MySQL 加 Redis(快取與關鍵任務分庫),服務間以 REST 加共用內部密鑰溝通,金流走平台的全方位金流閘道。前端雙 axios instance(商家端/管理端各一),401 單飛換發 token、佇列重放併發請求。',
          en: 'JWT auth with a global IsAuthenticated default — unauthenticated endpoints (login, registration, payment callbacks, service-to-service) are declared one by one. MySQL plus Redis (cache and critical tasks on separate logical DBs); services talk REST with a shared internal secret; payments ride the platform’s all-in-one gateway. The frontend runs dual axios instances (merchant/admin), with single-flight token refresh on 401 and queued replay of concurrent requests.',
        },
      ],
      responsibilities: [
        {
          zh: '前後端獨立開發(後端 24、前端 102 個 commit 皆為我;2025/10–2026/07):12 個業務模組的資料模型與 API、金流串接與退款鏈路、權限修復、後端測試,以及商家端與管理端全部頁面、雙 client 與設計 token 系統。對接的會員、金流閘道、庫存等服務本身屬平台其他服務,不在本專案範圍。',
          en: 'Independent full-stack development (all 24 backend and 102 frontend commits mine; 2025/10–2026/07): models and APIs across 12 modules, the payment integration and refund chain, permission remediation and backend tests, plus every merchant and admin page, both clients and the design-token system. The membership, gateway and inventory services it integrates belong to the wider platform, not this project.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '稽核發現:取消已付款信用卡訂單的鏈路「看起來」完整——有排程、有呼叫退款服務的程式碼——但排程實際打的是一個只查詢、不執行退款的端點。訂單顯示已取消,持卡人的錢從未退回;問題橫跨三個服務,出在三方對「這支端點會不會真的退款」認知不一致。',
            en: 'An audit found the cancel-paid-order path looked complete — a schedule existed, refund-service calls existed — but the schedule was hitting an endpoint that only queries, never refunds. Orders showed cancelled; cardholders’ money never moved. The flaw spanned three services disagreeing about whether that endpoint actually refunds.',
          },
          s: {
            zh: '新增真正執行退刷的金流 client 並接上兩個取消入口;select_for_update 防兩台裝置同時取消造成重複退款;退款非冪等、明確標註禁止 retry;權益回沖改為交易提交後非同步派工,取消回應從 17 秒降到約 3 秒。以一筆真實訂單做端到端驗證:金流狀態確認取消、重複呼叫冪等。',
            en: 'Added a client that performs the actual refund and wired it into both cancellation entry points; select_for_update stops two devices double-refunding one order; the refund call is non-idempotent and now explicitly marked no-retry; benefit reversals moved to post-commit async jobs, cutting cancellation response from 17 seconds to ~3. Verified end-to-end with a real order — gateway confirmed cancelled, repeat calls idempotent.',
          },
        },
        {
          c: {
            zh: '結帳改走金流閘道的全方位支付後,付款頁偶發打不開,閘道回報簽章不符。乍看像演算法寫錯,但雙方演算法一致——真正原因是中轉頁把品項名稱直接塞進隱藏表單欄位,名稱含 & 或 < 時被瀏覽器截斷,實際送出的字串和簽章計算用的不一致。',
            en: 'After moving checkout to the gateway’s all-in-one flow, the payment page intermittently failed with a signature-mismatch error. The algorithm looked wrong but matched the spec exactly — the real culprit was the relay page injecting item names into hidden form fields unescaped, so a name containing & or < got truncated by the HTML parser and the POSTed string no longer matched the signed one.',
          },
          s: {
            zh: '中轉頁對隱藏欄位做 HTML escape,確保瀏覽器解析後送出的內容與簽章計算完全一致;同批修復加上 B2B 專屬的訂單類型分流,避免與 POS 訂單共用冪等序號互相覆蓋。修復後未再復現。',
            en: 'The relay page now HTML-escapes every hidden field so what the browser posts is byte-for-byte what was signed; the same batch added a B2B order-type lane so B2B and POS orders stop overwriting each other’s idempotency sequence. The error has not recurred.',
          },
        },
        {
          c: {
            zh: '安全檢查發現部分端點「內網來源免認證」,而內網判斷讀的是 X-Forwarded-For——用戶端可自由填寫的標頭,塞一個 127.0.0.1 就能跳過登入。同批稽核也發現結帳金額完全信任前端送來的單價,以及訂單層折扣未分攤、對帳單加總高於實際應收。',
            en: 'A security review found endpoints exempting “internal” traffic from auth — with “internal” judged by X-Forwarded-For, a header any client can forge; one 127.0.0.1 skipped login entirely. The same audit caught checkout trusting client-sent unit prices, and order-level discounts not prorated, inflating statement totals above what was owed.',
          },
          s: {
            zh: '把驗證預設從「有例外的允許」翻轉成「一律要登入、例外逐一顯式宣告」;新增權威定價模組,單價由後端依當時階梯價與促銷重算;修正折扣分攤讓對帳單與應收一致。三項修復連同對應測試一併提交,已上線運行。',
            en: 'Removed the forgeable exemption — authentication is the default, real exceptions declared one by one; added an authoritative-pricing module recomputing unit prices server-side from current tiers and promotions; fixed discount proration so statements match receivables. All three landed with accompanying tests and are live.',
          },
        },
      ],
      facts: [
        { value: '35', label: { zh: '資料模型(12 模組)', en: 'models across 12 apps' } },
        { value: '297', label: { zh: '後端測試函式', en: 'backend test functions' } },
        { value: '~41k', label: { zh: '前端 TS/TSX 行數', en: 'lines of TypeScript' } },
        { value: '126', label: { zh: 'commits · 單一開發者', en: 'commits, single author' } },
      ],
      lessons: [
        {
          zh: '「排程有跑」不等於「業務有發生」:退款排程長期正常執行、零報錯,但打的是查詢端點。金流這類必須產生副作用的任務,監控要對準「副作用是否發生」,而不是排程有沒有觸發。',
          en: '“The job ran” is not “the business happened”: the refund schedule executed cleanly for months while hitting a query endpoint. For jobs whose whole point is a side effect — refunds above all — monitor the side effect, not the trigger.',
        },
        {
          zh: '後端位址寫死在前端原始碼,是當時圖快留下的債:現在要多一個測試環境,得改碼重建而不是換個環境變數。重來會在只有一個環境的第一天,就把 API 位址做成環境變數。',
          en: 'Hard-coding the backend URL into the frontend was speed-bought debt: standing up a test environment now means editing code and rebuilding instead of flipping a variable. Next time the API base is an environment variable on day one, even with only one environment in sight.',
        },
      ],
    },
  },
  {
    slug: 'field-sales-pwa',
    domain: 'frontend',
    visibility: 'internal',
    title: {
      zh: '業務外勤現場開通 PWA',
      en: 'Field Sales On-site Activation PWA',
    },
    oneLiner: {
      zh: '給美業 B2B 通路業務員在客戶現場使用的手機優先 PWA:拍名片、當場開通企業客戶帳號、管理 CRM 與追蹤獎金;六天從零建置,已部署。',
      en: 'A mobile-first PWA for field reps in a beauty-industry B2B channel — scan a business card, activate the client account on the spot, manage CRM and track commissions. Built from scratch in six days; deployed.',
    },
    scope: { zh: '公司內部 · 已部署', en: 'Internal · deployed' },
    stack: ['REACT', 'VITE', 'MUI', 'REACT-QUERY', 'ZUSTAND', 'PWA'],
    keyMetric: { value: '50', label: { zh: '後端 API 呼叫點', en: 'backend API call sites' } },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: 'B2B 通路的業務員過去要幫客戶開通企業帳號,得先抄下資料、回辦公室用另一套後台操作,客戶當下無法直接下單;業務自己的獎金、待審核客戶與 CRM 進度也分散在不同系統。這個 PWA 把「現場拍名片 → 當場建立並開通帳號 → 客戶立即可下單」收斂成一支手機瀏覽器就能完成、可安裝離線使用的流程,並把獎金查詢、CRM 與客戶審核整合進同一個前台;服務對象是美業 B2B 通路的外勤業務。',
          en: 'Field reps used to copy a client’s details onto paper and open the account later from a back-office system — the client could not order on the spot, and the rep’s commissions, pending reviews and CRM lived in yet other tools. This PWA folds “photograph the business card → create and activate the account on-site → the client orders immediately” into one installable, offline-tolerant mobile flow, with commissions, CRM and account review in the same console — built for field reps in a beauty-industry B2B channel.',
        },
      ],
      constraints: [
        {
          zh: '公司內部專案,程式碼不公開;已部署於內部網域。',
          en: 'Company-internal; the codebase is private. Deployed on an internal domain.',
        },
        {
          zh: '外勤現場網路品質不受控:任何操作——尤其開戶送出——都必須在斷網或逾時時有本機暫存與自動重送,不能讓業務白填一次表單。',
          en: 'Field connectivity is uncontrolled: every action — above all account submission — needs local persistence and automatic resend on failure; a rep must never re-type a form.',
        },
        {
          zh: '名片影像屬客戶個資:OCR 完全在裝置端執行,不把影像外送任何第三方服務——這也是無雲端 OCR 預算下的自建解。',
          en: 'Business-card images are customer PII: OCR runs entirely on-device, never shipping the image to a third-party service — also the only option with no cloud-OCR budget.',
        },
        {
          zh: '前端純消費後端 API,不落地任何業務規則:獎金計算與權限判定皆由後端決定。',
          en: 'The frontend consumes APIs only — no business rules live client-side; commissions and permissions are decided by the backend.',
        },
      ],
      architecture: [
        {
          zh: 'React 18 + Vite 6 SPA:MUI 5 元件、TanStack React Query 5 管伺服端快取、Zustand 只放一份登入身分狀態——17 個路由畫面、6 個 API 模組共 50 個呼叫點,對接平台的 4 個後端服務(認證、獎金、CRM、店家),全站約 8,200 行。刻意維持極簡狀態設計:伺服端資料一律進 React Query,客戶端狀態只有登入身分一項。',
          en: 'A React 18 + Vite 6 SPA: MUI 5 components, TanStack React Query 5 for server-state caching, and a single Zustand store holding only the login identity — 17 routed screens and 6 API modules with 50 call sites against 4 platform backend services (auth, commissions, CRM, stores), ~8,200 lines in all. State design is deliberately minimal: server data lives in React Query; client state is the identity, nothing else.',
        },
        {
          zh: '橫切設計:Axios 攔截器統一附加 token 與 401 刷新(併發請求排隊、只刷新一次);Service Worker 只做 app shell 離線容忍(靜態資源 cache-first、API 一律不快取);現場開戶頁自建三層弱網韌性——草稿即時落地、送出失敗轉本機離線佇列、連線恢復自動重送;OCR 以 tesseract.js 全跑瀏覽器端。部署為 nginx 靜態站,API 走同網域反向代理。',
          en: 'Cross-cutting: an Axios interceptor attaches tokens and handles 401 refresh (concurrent requests queue behind a single refresh); the Service Worker covers app-shell offline only (cache-first statics, APIs never cached); the on-site activation page has three layers of weak-network resilience — live local drafts, an offline queue on failed submits, auto-resend on reconnect; OCR runs fully in-browser on tesseract.js. Deployment is a static nginx site with same-origin API reverse proxying.',
        },
      ],
      responsibilities: [
        {
          zh: '獨立開發:從空 repo 到部署共 6 天(2026/07/10–07/15),全部 commit 出自我一人;需求整理、架構、實作與部署皆由我完成。後端 API 為平台既有服務,不在本專案範圍。',
          en: 'Independent development: empty repo to deployment in six days (2026/07/10–15), every commit mine — requirements, architecture, implementation and deployment. The backend APIs are existing platform services outside this project’s scope.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '店家頁一開始直打既有後端給其他前台用的查詢端點:拿不到業務員對應的內部歸戶 ID 時,它不報錯,而是靜默改用 user_id 過濾——畫面完全正常,但業務看到的店家清單是錯的。',
            en: 'The store page initially hit an existing endpoint built for another frontend: missing the rep’s internal attribution ID, it did not error — it silently fell back to filtering by user_id. The screen looked fine; the list was wrong.',
          },
          s: {
            zh: '改走後端提供的業務專屬端點,由後端解析登入業務的歸戶 ID 再過濾,前端不再自組歸戶邏輯;同一次提交把登入換成業務專屬閘門(消費者帳號一律 403)。修正只有 2 個檔案 14 行,解決的卻是「看起來正常、資料是錯的」這類最難被發現的 bug。',
            en: 'Switched to a sales-specific endpoint where the backend resolves the rep’s own attribution ID before filtering, and moved login to a sales-only gate (consumer accounts get 403) in the same commit. The fix was 2 files and 14 lines — against the hardest kind of bug, the one that looks perfectly healthy.',
          },
        },
        {
          c: {
            zh: '訂單退貨後,後端會回沖對應獎金,但三個獎金畫面仍顯示原始金額——業務看到的數字,和公司實際會發放的淨額對不起來。',
            en: 'When an order was returned the backend clawed back its commission, but all three commission screens kept showing the gross figure — the number a rep saw never matched what would actually be paid.',
          },
          s: {
            zh: '三頁一次改成淨額口徑(獎金-回沖):有回沖的紀錄標示回沖金額、全額回沖用刪除線保留原額,讓業務看得懂「這筆錢去哪了」,而不是數字憑空消失。',
            en: 'Moved all three pages to net-of-clawback in one pass, annotating partial clawbacks and striking through fully clawed-back records instead of deleting them — a rep can see where the money went, not just watch it vanish.',
          },
        },
        {
          c: {
            zh: '現場開戶是核心流程,但網路品質是客戶店裡有什麼就是什麼;名片又是客戶個資,不能送第三方雲端 OCR,公司也沒有採購預算。',
            en: 'On-site activation is the core flow, yet connectivity is whatever the client’s shop happens to have; the business card is PII that cannot go to a cloud OCR — and there was no budget to buy one anyway.',
          },
          s: {
            zh: '弱網做三層:表單變動即存本機草稿、送出遇連線失敗轉離線佇列、瀏覽器恢復連線自動重送。OCR 以 tesseract.js 在裝置端跑,只預填仍為空的欄位、不覆蓋手動輸入,結果一律由業務核對後才送出——零後端支援、零額外預算的純前端解。',
            en: 'Resilience comes in three layers: live local drafts, an offline queue when the connection itself fails, auto-resend on reconnect. OCR runs on-device with tesseract.js, prefilling only still-empty fields and never overriding manual input, with the rep confirming before submit — a pure-frontend solution needing no backend work and no budget.',
          },
        },
      ],
      facts: [
        { value: '17', label: { zh: '路由畫面', en: 'routed screens' } },
        { value: '50', label: { zh: 'API 呼叫點', en: 'API call sites' } },
        { value: '~190KB', label: { zh: 'vendor bundle(gzip)', en: 'vendor bundle (gzip)' } },
        { value: '6', label: { zh: '天,從零到部署', en: 'days, zero to deployed' } },
      ],
      lessons: [
        {
          zh: '「查得到資料」不等於「資料是對的」——靜默降級比顯式錯誤更危險。共用端點在邊界情況下換了一套過濾邏輯而不報錯,呼叫端幾乎無從分辨。之後接既有端點,會先確認它的降級行為,而不是看到 200 就當作正確。',
          en: 'Getting data back is not the same as getting the right data — a silent fallback is more dangerous than a loud error. A shared endpoint that swaps its filtering logic at the edge, without erroring, is indistinguishable from a working one. I now ask how an existing endpoint degrades before consuming it, instead of trusting a 200.',
        },
        {
          zh: '弱網韌性要在設計期決定,事後補難得多:草稿、佇列、自動重送要嵌回已完成的表單狀態機,遠比一開始一起做困難。誠實的現狀是這個專案沒有自動化測試(斷網情境靠手動驗證),若要繼續維護,第一件事是替離線佇列與重送補上測試。',
          en: 'Weak-network resilience is a design-time decision — retrofitting drafts, queues and resend into a finished form state machine is far harder than building them in. The honest gap: this project has no automated tests (offline paths were verified by hand); the first item of further maintenance is covering the queue and resend logic.',
        },
      ],
    },
  },
  {
    slug: 'agm-evoting-system',
    domain: 'fullstack',
    visibility: 'internal',
    title: {
      zh: '股東常會電子投票系統',
      en: 'Shareholder AGM E-Voting System',
    },
    oneLiner: {
      zh: '股東常會的電子投票平台:OTP 登入、會議與議程管理、選舉制議案與迴避條款、SHA-256 雜湊鏈稽核;9 天獨立建置,目前處於驗收與修復階段。',
      en: 'An e-voting platform for shareholder AGMs — OTP login, meeting and agenda management, election-type motions with recusal rules, and a SHA-256 hash-chained audit log. Built solo in nine days; currently in acceptance and remediation.',
    },
    scope: { zh: '公司內部 · 驗收修復階段', en: 'Internal · acceptance stage' },
    stack: ['DJANGO', 'DRF', 'MYSQL', 'REACT', 'TYPESCRIPT', 'JWT'],
    keyMetric: { value: '51', label: { zh: 'API 端點實測', en: 'API endpoints measured' } },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: '台灣中小型公司的股東常會,多半仰賴現場紙本投票與人工計票:流程耗時、結果難以追溯,也沒有可稽核的紀錄。這套系統讓股東以 OTP 快速登入、依身分(股東/管理員/來賓/員工)分權操作,支援一般議案與含法定迴避條款的選舉制議案;設計的優先順序放在個資保護與稽核鏈完整性這類合規要求,而不是大規模併發。',
          en: 'Shareholder AGMs at small and mid-sized Taiwanese companies still run on paper ballots and manual counting: slow, hard to trace, and with no auditable record. This system lets shareholders log in quickly via OTP, operate under role-scoped permissions (shareholder, admin, guest, staff), and vote on both ordinary motions and election-type motions with statutory recusal rules. Design priorities are compliance-shaped — PII protection and audit-chain integrity — rather than large-scale concurrency.',
        },
      ],
      constraints: [
        {
          zh: '公司內部委託專案,程式碼不公開。',
          en: 'A company-internal commissioned project; the codebase is private.',
        },
        {
          zh: '單人、時程壓縮:11 個 commit 集中在 9 天內,其中 8 個在最後一天完成安全與效能加固。',
          en: 'Solo and compressed: 11 commits over nine days, eight of them landing security and performance hardening on the final day.',
        },
        {
          zh: '個資保護是硬性要求(對應 ISO 27001 控制項):身分證後四碼、電話後三碼只能以雜湊儲存,稽核日誌的 IP 與 User-Agent 必須遮罩。',
          en: 'PII protection is non-negotiable (mapped to ISO 27001 controls): ID and phone digits are stored only as hashes, and audit-log IPs and user agents must be masked.',
        },
        {
          zh: '不引入 Redis/Celery 等外部基礎設施;OTP 目前以 console 模擬發送、尚未接正式簡訊/Email 服務——如實記錄。',
          en: 'No Redis, Celery or other external infrastructure; OTP delivery is currently console-simulated, not yet wired to a real SMS/email service — recorded as-is.',
        },
      ],
      architecture: [
        {
          zh: 'Django 5.2 + DRF 單體:5 個 app(accounts、meetings、voting、otp_module、audits)、11 個資料模型、5 組資源路由加 21 個自訂 action,共 51 個實測 API 端點;前端 React 19 + TypeScript + MUI,11 個路由頁面、約 4,500 行。刻意不拆微服務——單人開發、業務規模是單一公司的股東會,投票與稽核鏈需要同一個交易邊界,拆分只會增加維運成本而無實益。',
          en: 'A Django 5.2 + DRF monolith: five apps (accounts, meetings, voting, otp_module, audits), 11 data models, five resource routes plus 21 custom actions — 51 measured API endpoints — with a React 19 + TypeScript + MUI frontend of 11 routed pages (~4,500 lines). Deliberately not microservices: one developer, one company’s AGM as the workload, and voting plus its audit chain need a single transaction boundary — splitting adds operations cost and nothing else.',
        },
        {
          zh: '認證為 JWT(含 token 黑名單)加 OTP 雙因子,另整合 Keycloak SSO(員工/股東各一組 realm、環境變數開關);權限以三個自訂 Permission 類別分流。四個核心模型套用軟刪除 Mixin(支援 restore 與 hard delete);throttle 依端點分級——OTP 請求 5/min、OTP 驗證 10/min、投票 20/min;CI 為 GitHub Actions 四階段(後端 lint → 後端測試 → 前端 lint → 前端 build),部署以 gunicorn + Nginx。',
          en: 'Auth is JWT (with token blacklisting) plus OTP as a second factor, and Keycloak SSO integration (separate staff and shareholder realms, toggled by environment); authorization flows through three custom permission classes. Four core models share a soft-delete mixin (restore and hard-delete supported); throttling is tiered per endpoint — OTP requests 5/min, verification 10/min, voting 20/min. CI is a four-stage GitHub Actions pipeline (backend lint → backend tests → frontend lint → frontend build); deployment is gunicorn behind Nginx.',
        },
      ],
      responsibilities: [
        {
          zh: '獨立開發:11 個 commit 全數出自我(2026/04/04–04/12),涵蓋 Django 後端、React 前端、資料模型、個資保護與稽核鏈設計、查詢效能優化與 CI 建置。',
          en: 'Independent development: all 11 commits are mine (2026/04/04–12), covering the Django backend, the React frontend, data models, the PII-protection and audit-chain design, query performance work and the CI pipeline.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '稽核日誌必須「不可竄改」,但投票內容(誰投了什麼)是高敏感個資——把投票 payload 直接存進日誌,等於製造第二個個資外洩點。',
            en: 'The audit log must be tamper-evident, yet ballot content — who voted for what — is highly sensitive PII: storing the vote payload in the log would just create a second leak surface.',
          },
          s: {
            zh: '所有日誌走 create_log() 單一入口:寫入前自動遮罩敏感欄位(身分證/電話/OTP/token 一律標記 ***,投票內容只留議案類型與完成旗標)、IP 與 User-Agent 遮罩後才落地、依動作類型自動分級嚴重度;每筆記錄再以 SHA-256 串接前一筆的 hash 形成雜湊鏈——任何歷史記錄被竄改,後續整條鏈就會斷裂、可被檢測。',
            en: 'Every log entry goes through a single create_log() gate: sensitive fields are masked before write (ID, phone, OTP and tokens become ***; ballot content keeps only motion type and a completed flag), IPs and user agents land masked, and severity is auto-classified by action. Each record then chains the previous record’s hash into its own SHA-256 — tampering with any historical entry breaks every link after it, detectably.',
          },
        },
        {
          c: {
            zh: '驗收修復階段發現:身分證後四碼與電話後三碼原本以明碼存庫,作為登入比對依據——資料庫一旦外洩就是直接可識別的個資;而且表裡已有既存明碼資料,不能砍掉重灌。',
            en: 'ID and phone digits were originally stored in plaintext as the login comparison key — a database leak would expose directly identifiable PII — and the tables already held live plaintext rows, so “wipe and reload” was not an option.',
          },
          s: {
            zh: '新增 hash_pii()(salt + SHA-256),用 Django 資料遷移把既有明碼欄位就地轉成雜湊,比對全面改走雜湊;salt 從環境變數讀取、未設定直接拋錯而非靜默用預設值。同一模式後續重複用在股票代號欄位,成為可重用的 PII 遷移範式。',
            en: 'Added hash_pii() (salt + SHA-256) and converted the existing plaintext columns in place via a Django data migration, with all comparisons moving to hash-vs-hash; the salt comes from an environment variable and a missing value throws instead of silently defaulting. The same pattern was reused for the stock-number field later — a repeatable PII-migration recipe.',
          },
        },
        {
          c: {
            zh: '議程投票統計原本用 8 個獨立查詢分別算票數與加權股數:議程與股東越多、查詢數線性增加,而且沒有任何查詢數的約束或測試。',
            en: 'Tallying an agenda originally took eight separate queries for counts and weighted shares — scaling linearly with agendas and shareholders, with no constraint or test on query volume at all.',
          },
          s: {
            zh: '改用 Case/When 條件聚合,把 8 次查詢合併成 1 次 aggregate 同時算出票數與加權股數;並補上以 CaptureQueriesContext 斷言查詢數 ≤ 10 的效能測試——讓「效能是否退化」變成 CI 會直接擋下的條件,而不是上線後靠感覺發現。',
            en: 'Replaced them with one Case/When conditional aggregate computing counts and weighted shares together, and added a performance test asserting query count ≤ 10 via CaptureQueriesContext — turning “did performance regress” into a condition CI enforces, not something users eventually feel.',
          },
        },
        {
          c: {
            zh: '驗收複驗時發現:原始碼定義了 225 個測試,實際只有 215 個被收集、其中 9 個失敗;另有 10 個測試因為 accounts/tests/ 目錄缺 __init__.py、又與 accounts/tests.py 撞名,寫完後從未被執行過,也沒有任何提示。',
            en: 'Acceptance re-verification found 225 tests defined in source but only 215 collected — nine of them failing — and another 10 tests that had never run at all: the accounts/tests/ package lacked an __init__.py and collided with accounts/tests.py, so they were silently skipped since the day they were written.',
          },
          s: {
            zh: '完成診斷與根因定位:9 個失敗可歸責到三次各自獨立的改動(登入契約改版、日誌訊息中文化、random→secrets 安全重構),每一次都沒同步更新對應測試;撞名則是測試組織的結構性缺陷。目前狀態如實記錄:206/215 通過、9 個待修、10 個待重新納入收集——修復列管中。',
            en: 'Diagnosis and root-cause attribution are done: the nine failures trace to three independent changes (a login-contract revision, log-message localization, and a random→secrets security refactor), none of which updated its tests; the collision is a structural flaw in test organization. Current state, recorded as-is: 206/215 passing, nine to fix, ten to bring back into collection — remediation tracked.',
          },
        },
      ],
      facts: [
        { value: '51', label: { zh: 'API 端點實測', en: 'API endpoints measured' } },
        { value: '11', label: { zh: '資料模型(5 app)', en: 'models across 5 apps' } },
        { value: '206/215', label: { zh: '測試通過(9 個待修)', en: 'tests passing (9 to fix)' } },
        { value: '9', label: { zh: '天,從零到驗收', en: 'days, zero to acceptance' } },
      ],
      lessons: [
        {
          zh: '沒有查詢數斷言的效能優化,等於沒有驗證:8 次查詢併成 1 次之後補上 ≤10 的斷言,日後任何人把聚合改回逐項查詢,CI 會直接失敗。這件事應該在最初設計時就連測試一起做,而不是優化時才回頭補。',
          en: 'A performance fix without a query-count assertion is unverified: after merging eight queries into one, the ≤10 assertion means anyone who reverts to per-option queries fails CI immediately. That test belonged in the original design, not retrofitted at optimization time.',
        },
        {
          zh: '「測試都寫了」不等於「測試都在跑」,更不等於「跑的測試還對得上程式碼」:10 個測試因缺 __init__.py 與撞名而從未執行、7 個測試因登入契約改版而過期。重來會在 CI 加一道「定義數 vs 實際收集數」的核對,並把「改端點契約必跑對應測試」列為明確流程。',
          en: '“The tests are written” is neither “the tests are running” nor “the running tests still match the code”: ten tests never executed thanks to a missing __init__.py and a name collision, and seven more went stale when the login contract changed. Next time CI gets a defined-vs-collected count check, and contract changes carry a mandatory run of their tests.',
        },
      ],
    },
  },
  {
    slug: 'ai-workflow',
    domain: 'ai',
    visibility: 'internal',
    title: { zh: 'Agentic 開發工作流', en: 'Agentic Development Workflow' },
    oneLiner: {
      zh: '從 vibe coding 到 agentic:規格驅動、驗證迴圈與人工審核構成的 AI 開發流程。',
      en: 'From vibe coding to agentic — a spec-driven AI development loop with verification gates and human review.',
    },
    scope: { zh: 'Spec × Verify × Review', en: 'Spec × Verify × Review' },
    stack: ['AI AGENTS', 'SPEC-DRIVEN', 'VERIFICATION'],
    featured: false,
  },
  {
    slug: 'ecobao',
    domain: 'fullstack',
    visibility: 'public',
    title: {
      zh: '環飽 EcoBǎo 剩食訂購平台',
      en: 'EcoBǎo Food-Surplus Marketplace',
    },
    oneLiner: {
      zh: '媒合店家餘食與消費者的剩食訂購平台,消費者與店家雙端;近期重構為純前端 demo 並統一設計系統,作為公開作品集。',
      en: 'A marketplace matching shops’ surplus food with buyers — consumer and merchant portals. Recently refactored into a standalone front-end demo with a unified design system, opened up as a public portfolio piece.',
    },
    scope: { zh: '剩食平台 · 現代化重構', en: 'Food-surplus platform · modernization' },
    stack: ['REACT', 'VITE', 'TAILWIND', 'REACT NATIVE', 'DJANGO', 'DRF'],
    keyMetric: { value: '4→1', label: { zh: 'UI 樣式庫收斂', en: 'UI libraries consolidated' } },
    links: {
      live: 'https://namecallbob.github.io/ecobaoFront/',
      repo: 'https://github.com/NameCallBob/ecobaoFront',
    },
    featured: false,
    caseStudy: {
      problem: [
        {
          zh: '環飽 EcoBǎo 是一個以「剩食」為題的訂購媒合平台——店家把當日未售完但仍新鮮的餐點,以即期優惠或驚喜福袋的形式折扣出售,消費者於指定時段到店自取,藉此減少food waste。專案分為三個 codebase:React 網頁前端、React Native(Expo)行動 App 與 Django REST 後端,提供消費者與店家兩端介面。這輪工作的目標,是把這個學生時期的專題「翻新成能公開展示的作品集」。',
          en: 'EcoBǎo is an ordering-and-matching marketplace built around food surplus — shops sell same-day unsold-but-fresh meals at a discount as “deals” or “surprise bags,” and buyers pick them up in a set window, cutting food waste. It spans three codebases: a React web frontend, a React Native (Expo) app and a Django REST backend, serving consumer and merchant sides. This round of work was about turning that student-era project into something presentable as a public portfolio piece.',
        },
      ],
      constraints: [
        {
          zh: '網頁前端原本綁死後端:透過 axios 打一組 ngrok 後端網址,一旦後端不在就整站空白,無法獨立展示。要當作品集 demo,必須讓它能脫離後端、部署到 GitHub Pages 靜態託管。',
          en: 'The web frontend was hard-wired to the backend: it hit an ngrok URL via axios, so the whole site went blank without a live server — impossible to demo standalone. To become a portfolio demo it had to run without any backend and deploy to static GitHub Pages hosting.',
        },
        {
          zh: '既有前端同時混用 MUI、Ant Design、Bootstrap 與 styled-components 四套樣式系統,視覺不一致、bundle 也肥。',
          en: 'The existing frontend mixed four styling systems at once — MUI, Ant Design, Bootstrap and styled-components — producing inconsistent visuals and a heavy bundle.',
        },
        {
          zh: '三個 repo 都要公開,後端原本把 SECRET_KEY、資料庫帳密與郵件設定寫死在程式碼裡,直接開源等於外洩設定。',
          en: 'All three repos were going public, but the backend hardcoded its SECRET_KEY, database credentials and mail settings in source — open-sourcing as-is would leak configuration.',
        },
      ],
      architecture: [
        {
          zh: '前端從 Create React App 遷移到 Vite,並移除四套 UI 庫、收斂到單一 Tailwind 設計系統。設計語言以 UI/UX 評估重建為「Eco-Fresh(清新永續)」:翠綠主色 + 食物暖橙點綴、Noto Sans/Serif TC 中文字體,token 以 CSS 變數驅動、Web 與 App 共用,並支援深色模式與 prefers-reduced-motion。',
          en: 'The web app was migrated from Create React App to Vite, the four UI libraries removed, and everything consolidated onto a single Tailwind design system. The visual language was rebuilt from a UX assessment into “Eco-Fresh”: emerald primary with a warm-amber food accent, Noto Sans/Serif TC for Chinese, tokens driven by CSS variables and shared across web and app, with dark mode and prefers-reduced-motion support.',
        },
        {
          zh: '為了脫離後端,建立一層純前端 mock API + seed 資料(店家、剩食商品、活動、評價、訂單、會員),以模擬延遲與 localStorage 持久化重現購物車、下單與取貨碼流程;整站改用 HashRouter 以相容 GitHub Pages,並以 GitHub Actions 自動建置部署。',
          en: 'To cut the backend dependency, a pure front-end mock API and seed dataset (stores, surplus items, campaigns, reviews, orders, members) was added — simulated latency plus localStorage persistence reproduce cart, checkout and pickup-code flows. Routing moved to HashRouter for GitHub Pages compatibility, with GitHub Actions building and deploying automatically.',
        },
        {
          zh: '後端(Django 4 + DRF)把 SECRET_KEY、資料庫、郵件與 API 金鑰等機敏設定全數抽離為環境變數並附 .env.example;補上 requirements 與完整 README,移除測試殘檔與未使用模組,並將誤入版控的 __pycache__ 與資產取消追蹤。行動端(Expo / React Native)則導入共用設計 token 與 UI 原子元件、統一導覽與樣式。',
          en: 'The backend (Django 4 + DRF) had all sensitive settings — SECRET_KEY, database, mail and API keys — extracted into environment variables with an .env.example; requirements and a full README were added, test leftovers and unused modules removed, and accidentally-tracked __pycache__ and assets untracked. The Expo / React Native app adopted the shared design tokens and UI atoms, unifying navigation and styling.',
        },
      ],
      responsibilities: [
        {
          zh: '本輪現代化重構(前端 Vite 遷移與 Eco-Fresh 設計系統、純前端 mock/seed 與 GitHub Pages 部署、後端機敏設定抽離與文件、App 設計語言套用)由我主導完成;原始平台為在學期間的團隊專題與競賽作品。',
          en: 'This modernization round — the web Vite migration and Eco-Fresh design system, the pure front-end mock/seed and GitHub Pages deployment, the backend secret-extraction and docs, and applying the shared design language to the app — was led and completed by me; the original platform was a team capstone and competition project from my studies.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '前端整站綁死後端,後端一離線就空白,無法當獨立 demo。',
            en: 'The frontend was welded to the backend and went blank offline — no way to demo it on its own.',
          },
          s: {
            zh: '在資料層與畫面之間插入一層 mock API,對外簽名與真實後端一致,底層改讀前端 seed 並以 localStorage 持久化;購物車、結帳、取貨碼、店家後台儀表板都能在無後端下完整跑完,直接靜態部署。',
            en: 'Inserted a mock API layer between data and views with the same signatures as the real backend, but reading front-end seed and persisting through localStorage; cart, checkout, pickup codes and the merchant dashboard all run end-to-end with no backend, deployable as static files.',
          },
        },
        {
          c: {
            zh: '四套 UI 樣式庫並存,視覺破碎、維護成本高。',
            en: 'Four coexisting UI libraries left the visuals fragmented and expensive to maintain.',
          },
          s: {
            zh: '先以 UI/UX 評估定出 Eco-Fresh 設計 token,再自建一套 Tailwind 元件庫(按鈕、卡片、標籤、對話框、分頁、評分、骨架⋯)逐頁替換,最終移除 MUI/Antd/Bootstrap/styled-components,收斂為單一設計系統。',
            en: 'Started from a UX assessment to define the Eco-Fresh tokens, then built a Tailwind component kit (buttons, cards, badges, dialogs, tabs, rating, skeletons…) and replaced pages one by one — ultimately dropping MUI/Antd/Bootstrap/styled-components down to a single design system.',
          },
        },
        {
          c: {
            zh: '後端要公開,但機敏設定散落在原始碼中。',
            en: 'The backend was going public, but sensitive settings were scattered through the source.',
          },
          s: {
            zh: '把 SECRET_KEY、資料庫、郵件與金鑰全部抽成環境變數並提供 .env.example 範本,補上 .gitignore、requirements 與 README,並將原本誤入版控的快取與資產取消追蹤——讓 repo 能安全開源。',
            en: 'Extracted SECRET_KEY, database, mail and keys into environment variables with an .env.example template, added .gitignore, requirements and a README, and untracked cache and assets that had been committed by mistake — so the repo can be open-sourced safely.',
          },
        },
      ],
      facts: [
        { value: '3', label: { zh: 'Web · App · 後端 repo', en: 'web · app · backend repos' } },
        { value: '2', label: { zh: '消費者 / 店家雙端', en: 'consumer + merchant portals' } },
        { value: '4→1', label: { zh: 'UI 樣式庫收斂', en: 'UI libraries consolidated' } },
        { value: 'SDGs 2·12', label: { zh: '對應永續目標', en: 'mapped SDG targets' } },
      ],
      lessons: [
        {
          zh: '把舊專案變成能公開展示的作品集,最關鍵的往往不是重畫畫面,而是先讓它「能獨立運作」並「機敏資訊乾淨」——解耦後端與抽離設定,比視覺翻新更早要處理。',
          en: 'Turning an old project into a shippable portfolio piece is less about redrawing screens than making it run standalone with clean secrets — decoupling the backend and extracting configuration come before any visual refresh.',
        },
        {
          zh: '設計 token 先行,web 與 app 才能共享同一套視覺語言;一致性來自系統,而不是逐頁手刻。',
          en: 'Design tokens first: only then can web and app share one visual language — consistency comes from the system, not from hand-styling each page.',
        },
      ],
    },
    screenshots: [
      {
        src: '/images/work/ecobao/shopper-home.webp',
        alt: {
          zh: '環飽消費者首頁全頁:惜食主視覺與搜尋列、平台影響力計數、食物分類磚、今日精選剩食折扣卡、三步驟說明與高評價店家',
          en: 'EcoBǎo shopper home, full page — food-saving hero and search, impact counters, category tiles, discounted surplus cards, a three-step explainer and top-rated stores',
        },
        caption: {
          zh: '消費者首頁全頁。頂端三個影響力數字不是營運數據,而是 getImpactStats() 從 8 家種子店家即時換算出來的(每份餐點 2.5 公斤 CO₂);少數圖磚落回品牌漸層,是 Unsplash 沒在時限內回應時 SmartImage 的預設行為,不是截圖失誤。',
          en: 'The shopper landing page end to end. The three impact counters are not operating data — getImpactStats() derives them live from the eight seeded stores at 2.5 kg CO₂ per meal. The few flat-green tiles are SmartImage falling back to the brand placeholder when an Unsplash image does not arrive in time; a real behaviour, not a capture glitch.',
        },
      },
      {
        src: '/images/work/ecobao/dashboard.webp',
        alt: {
          zh: '店家後台營運總覽:今日訂單/營收/已拯救餐點/評分四張 KPI 卡、近 7 日營收長條圖、驚喜福袋佔比甜甜圈、熱銷商品橫條、近期回饋與待處理訂單',
          en: 'Merchant back-office overview: four KPI cards (today’s orders, revenue, meals rescued, rating), a 7-day revenue bar chart, a surprise-bag share donut, a top-products bar list, recent reviews and pending orders',
        },
        caption: {
          zh: '店家後台總覽——平台的另一面。KPI、近 7 日長條圖與熱銷排行都由同一份 deterministic 生成的訂單資料推導,所以數字彼此對得上;右上角那幾個 +12% / +8% 的趨勢徽章則是寫死的示意值,沒有比較基準。圖表由 recharts 繪製;畫面其餘部分全是自建的 Tailwind 元件,MUI / Ant Design / Bootstrap / styled-components 都已不在相依清單裡。',
          en: 'The merchant overview — the platform’s other face. The KPIs, the 7-day bars and the top-product ranking are all derived from one deterministically generated order fixture, so the numbers reconcile with each other; the +12% / +8% trend badges, by contrast, are hard-coded illustrative values with nothing behind them. The charts are recharts; everything else on the screen is a self-built Tailwind component, with MUI, Ant Design, Bootstrap and styled-components all gone from the dependency list.',
        },
      },
      {
        src: '/images/work/ecobao/browse-surplus.webp',
        alt: {
          zh: '逛剩食頁:左欄分類與「只看驚喜福袋」篩選、排序下拉,右側 20 張剩食商品卡,標示原價、折扣價、剩餘份數與取貨時段',
          en: 'Browse page: category filters and a surprise-bag-only toggle on the left, a sort dropdown, and 20 surplus-item cards showing original price, deal price, portions left and pickup window',
        },
        caption: {
          zh: '逛剩食:20 筆種子商品在分類篩選、「只看驚喜福袋」與排序之下的完整列表。每張卡片同時給原價、折扣價、剩餘份數與取貨時段——對剩食來說時間壓力就是核心資訊,所以放在卡面而不是詳情頁。',
          en: 'Browse: all 20 seeded listings under category filters, a surprise-bag-only toggle and sorting. Every card carries original price, deal price, portions left and the pickup window — for surplus food the time pressure *is* the core information, so it sits on the card rather than the detail page.',
        },
      },
      {
        src: '/images/work/ecobao/checkout.webp',
        alt: {
          zh: '結帳頁:取貨人資訊表單(姓名、電話、Email 已帶入)、取貨時段選擇、現場付款/貨到付款單選,右側訂單摘要三項商品合計 NT$287',
          en: 'Checkout: a pickup-contact form prefilled with name, phone and email, a pickup-window select, pay-at-pickup / pay-on-delivery radios, and an order summary of three items totalling NT$287',
        },
        caption: {
          zh: '結帳頁。三項商品與 NT$287 小計不是擺拍——截圖腳本在店家頁真的按了三次「加入購物車」,狀態經 localStorage 一路帶到這裡;取貨人資訊由 demo 帳號自動帶入。整條購物流程沒有後端,src/lib/api.js 這層 372 行的假 API 把固定 fixture 包成有延遲的非同步介面。',
          en: 'Checkout. The three line items and the NT$287 subtotal are not staged: the capture script really clicked add-to-cart three times on the store page, and the state carried here through localStorage. The pickup contact is prefilled from the demo account. No backend takes part — the 372-line mock API in src/lib/api.js wraps fixed fixtures in a delayed async façade.',
        },
      },
      {
        src: '/images/work/ecobao/mobile-orders.webp',
        alt: {
          zh: '390px 寬的「我的訂單」頁:進行中(2)/ 已完成(3)分頁、兩張訂單卡含取貨碼與金額,下方為深綠色頁尾',
          en: '“My orders” at 390px wide: in-progress (2) and completed (3) tabs, two order cards carrying pickup codes and totals, above the dark-green footer',
        },
        caption: {
          zh: '同一份訂單頁在 390px 下的樣子。整個專案只有一份 src/index.css——行動版沒有第二套樣式表,是同一組 Tailwind token 直接重排。取貨碼是這條流程的實體交付物:到店報碼取餐,線上到線下的交接就在這裡。',
          en: 'The same orders page at 390px. The whole project has exactly one stylesheet, src/index.css — there is no second mobile sheet, just the same Tailwind tokens reflowing. The pickup code is this flow’s physical deliverable: you read it out at the counter, and that is where online hands off to offline.',
        },
      },
      {
        src: '/images/work/ecobao/app-store-detail.webp',
        alt: {
          zh: 'Expo React Native 行動端店家畫面:即期 5 折標籤、4.8(326)評分、今日取餐時段,以及橫向捲動的精選惜食折扣卡',
          en: 'Store screen in the Expo React Native app: a 50%-off badge, a 4.8 (326) rating, today’s pickup window, and a horizontally scrolling rail of discounted surplus items',
        },
        caption: {
          zh: 'Expo(React Native)行動端的店家畫面。兩點如實註記:這是 expo export --platform web 的網頁渲染,不是 iOS/Android 裝置截圖;而該 repo 目前所有店家共用同一張市場照、所有商品共用同一張漢堡圖——佔位素材沒有為了拍照被換掉。',
          en: 'The store screen in the Expo (React Native) app. Two things stated plainly: this is a web render from `expo export --platform web`, not an iOS or Android device capture — and in that repo every store still shares one market photo and every product one stock burger image. The placeholders were not swapped out for the shot.',
        },
      },
      {
        src: '/images/work/ecobao/api-store-list.webp',
        alt: {
          zh: 'DRF 可瀏覽 API 的 GET /store_sch/ 回應:HTTP 200,五家種子店家的 JSON,含 upid、type、city / area、address 與 lng / lat 座標',
          en: 'The DRF browsable API showing GET /store_sch/: HTTP 200 and JSON for five seeded stores with upid, type, city/area, address and lng/lat coordinates',
        },
        caption: {
          zh: 'DRF 可瀏覽 API:帶著真的 JWT 打 GET /store_sch/,拿回 5 家種子店家,含註冊時由 Google Geocoding 寫入的 lng / lat。這個專案只認 JWT、沒有 session 登入,沒帶 token 的瀏覽器直接吃 401。後端其餘幾乎全是 POST-only 的 @action,截圖照不出來——那是下面五張圖的工作。',
          en: 'The DRF browsable API: GET /store_sch/ carrying a real JWT returns the five seeded stores, lng/lat included — written by Google Geocoding at registration. The project authenticates by JWT only, with no session login, so a token-less browser simply gets a 401. Almost everything else in this backend is a POST-only @action that no screenshot can reach; that is what the five diagrams below are for.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/ecobao/diagram-order-state-machine.svg',
        alt: {
          zh: '訂單狀態機:未接單 → 已接單 → 未取餐 → 已完成,另有取消與硬刪除的終止路徑,每條轉移標註對應的 POST 端點與 order/views.py 行號',
          en: 'Order state machine: pending → accepted → ready-for-pickup → completed, with cancel and hard-delete terminal paths; every transition labelled with its POST endpoint and the line in order/views.py',
        },
        caption: {
          zh: '訂單生命週期——REST 介面藏起來的那一半。order_order.status 是沒有 choices 的 CharField(50),五個狀態全是中文字串字面值;圖上的箭頭是意圖,不是約束:除了 /order/delete/,每個 action 都以 Order.objects.get(oid=...) 直接覆寫狀態,不檢查呼叫者是不是這張訂單的主人,任何狀態都能跳到任何狀態。complete_time 也從頭到尾沒有任何程式寫入。',
          en: 'The order lifecycle — the half the REST surface hides. order_order.status is a CharField(50) with no choices, and all five states are Chinese string literals. The arrows are intent, not enforcement: every action except /order/delete/ does a bare Order.objects.get(oid=…) and overwrites the status without checking the caller owns the order, so any state can jump to any state. complete_time is never written by any code path either.',
        },
      },
      {
        src: '/images/work/ecobao/diagram-checkout-sequence.svg',
        alt: {
          zh: 'POST /order/add/ 的序列圖:JWT 解析使用者後,在 transaction.atomic 內查購物車、加總、產生 oid、寫入訂單與明細與付款、刪除購物車列,並標出從未被呼叫的寄信分支',
          en: 'Sequence diagram of POST /order/add/: JWT resolves the user, then inside transaction.atomic the cart is read, totals summed, an oid generated, order/line/payment rows inserted and cart rows deleted — with the never-called mail branch marked dead',
        },
        caption: {
          zh: '系統裡最重要的一次寫入 POST /order/add/,逐步對照 order/views.py:186–274。整段包在 transaction.atomic 裡,但有三件事不是交易能救的:oid 取自即時 COUNT(*)(兩筆併發結帳會撞號)、庫存只在 /cart/add/ 檢查過而結帳時從未扣減、信用卡號與安全碼原文寫進 order_orderpayment。右邊通往 notice.app.Email 的線是斷的:__mail() 沒有任何呼叫者,郵件通知在這個 codebase 裡從來沒有真的接上。',
          en: 'The system’s most important write, POST /order/add/, walked step by step against order/views.py:186–274. The body sits inside transaction.atomic, but three things no transaction can save it from: oid comes from a live COUNT(*) (two concurrent checkouts collide on the same id), stock is validated back at /cart/add/ and then never decremented here, and the card number and CVC land verbatim in order_orderpayment. The branch to notice.app.Email on the right is dead — nothing calls __mail(), so e-mail notification was never actually wired up in this codebase.',
        },
      },
      {
        src: '/images/work/ecobao/diagram-api-permission-map.svg',
        alt: {
          zh: 'API 權限分層圖:SimpleRouter 的 13 個註冊與 4 條顯式路由,依 AllowAny 匿名層、IsAuthenticated 會員層、view 內手寫的店家守衛層、Django admin 層分組,虛線標出會漏的節點',
          en: 'API permission map: SimpleRouter’s 13 registrations and four explicit paths grouped into an AllowAny anonymous tier, an IsAuthenticated member tier, a store-owner tier guarded inside the view body, and the Django admin — with leaking nodes dashed',
        },
        caption: {
          zh: '整個 API 表面依「實際上誰擋得住」分層,而不是依模組分層。第三層最值得看:店家身分不是用 permission class 擋的,而是在 view 裡手寫 Store.objects.filter(upid_id=request.user.uid).count() == 1;虛線節點是它自己會漏的地方——商品 upload/change 宣告成 IsAuthenticated | AllowAny,那個 OR 讓匿名呼叫者一樣過關。',
          en: 'The whole API surface sorted by what actually guards each route, not by which module it lives in. Tier three is the one to read: store-owner identity is not enforced by a permission class at all but hand-written inside the view body as Store.objects.filter(upid_id=request.user.uid).count() == 1. The dashed nodes are where it leaks — goods upload/change is declared IsAuthenticated | AllowAny, and that OR waves anonymous callers straight through.',
        },
      },
      {
        src: '/images/work/ecobao/diagram-domain-er.svg',
        alt: {
          zh: '核心領域 ER 圖:會員、店家、營業時間、商品、評價、購物車、訂單、訂單明細、付款與取消等資料表的實際欄位名與主鍵外鍵關係',
          en: 'Core domain ER: member, store, opening hours, goods, review, cart, order, order line, payment and cancellation tables with their real column names and PK/FK relationships',
        },
        caption: {
          zh: '核心領域 ER。表名與欄位名取自實際跑起來的 demo.sqlite3(PRAGMA table_info / foreign_key_list),再與 models 和 migrations 交叉比對,所以畫的是資料庫真的有的欄位,不是宣告過的欄位。幾個設計代價一眼看得到:store.upid_id 同時是 PK 和 FK(一個會員只能開一家店)、price 與 quantity 都存成字串、order_ordercheck 有表也有 migration,卻沒有任何程式讀寫它。',
          en: 'The core domain ER. Table and column names were read out of the running demo.sqlite3 (PRAGMA table_info / foreign_key_list) and cross-checked against models and migrations, so the figure shows the columns the database actually has rather than the ones merely declared. The design’s costs are visible at a glance: store.upid_id is both PK and FK (one store per member), price and quantity are stored as text, and order_ordercheck has a table and a migration but no code that ever reads or writes it.',
        },
      },
      {
        src: '/images/work/ecobao/diagram-system-architecture.svg',
        alt: {
          zh: 'Django 4.1 + DRF 系統架構圖:入口點、middleware 鏈、urls 路由、DRF 認證與權限預設、四個業務 app、Google Geocoding 與 geopy 外部呼叫、MySQL / SQLite 切換,以及以虛線標示的未接線元件',
          en: 'Django 4.1 + DRF architecture: entry points, the middleware chain, URL routing, DRF authentication and permission defaults, four business apps, outbound Google Geocoding and in-process geopy, the MySQL/SQLite swap, and the inert components drawn dashed',
        },
        caption: {
          zh: 'Django 4.1 + DRF 的實際接線:middleware 順序、SimpleRouter 的 13 個註冊、JWT 預設(HS256、USER_ID_FIELD=uid、access token 60 分鐘)、Geocoding 與 in-process 的 geopy 距離計算,以及 MySQL / SQLite 由 settings 模組決定。虛線的四個節點是「宣告了但沒作用」:asgi.py 沒有任何 async consumer、CsrfViewMiddleware 被註解掉、notice/ 郵件模組不在 INSTALLED_APPS 裡。這個 repo 沒有 Celery、沒有佇列也沒有排程——所有工作都在請求執行緒裡同步跑完。',
          en: 'How Django 4.1 + DRF is actually wired: middleware order, SimpleRouter’s 13 registrations, the JWT defaults (HS256, USER_ID_FIELD=uid, a 60-minute access token), the outbound Geocoding call and in-process geopy distance work, and MySQL versus SQLite chosen by settings module. The four dashed nodes are declared but inert — asgi.py has no async consumers, CsrfViewMiddleware is commented out, and the notice/ mail module is not in INSTALLED_APPS. There is no Celery, no queue and no scheduler anywhere in this repo: every unit of work runs synchronously inside the request thread.',
        },
      },
    ],
  },
  {
    slug: 'four-times-for-cook',
    domain: 'ai',
    visibility: 'public',
    title: {
      zh: '四時煮食時 — AI 食療推薦與健康管理平台',
      en: 'Four Times for Cook — AI Recipe & Health Platform',
    },
    oneLiner: {
      zh: '2024 年科工館「教育部 113 年度 AI 健康應用計畫」的作品:BERT 實體標記食譜推薦、健康追蹤與剩食訂購;近期以 AI 輔助完成資安稽核與全面重構,開源上架為作品集。',
      en: 'Built for the 2024 National Science and Technology Museum × MOE “AI Health Application” program — BERT-tagged recipe recommendation, health tracking and food-surplus ordering; recently hardened and rebuilt with AI assistance, open-sourced as a portfolio piece.',
    },
    scope: { zh: 'AI 健康應用計畫 · 自建 → AI 輔助重構', en: 'AI health program · self-built → AI-assisted rebuild' },
    stack: ['DJANGO', 'DRF', 'BERT', 'PYTORCH', 'REACT', 'VITE', 'TAILWIND'],
    keyMetric: { value: '175', label: { zh: '稽核發現修復', en: 'findings remediated' } },
    links: {
      live: 'https://namecallbob.github.io/4timesforcook_frontend/',
      repo: 'https://github.com/NameCallBob/4timesforcook_frontend',
    },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '四時煮食時是 2024 年參與科工館「教育部 113 年度 AI 健康應用計畫」的專題:把個人化食譜推薦、日常健康管理(卡路里/飲水/運動追蹤)、營養知識專區與「剩食訂購」結合成一個「吃得健康、不浪費食物」的平台。推薦引擎的核心是一個 BERT 實體標記(NER)模型——把使用者的自然語言需求拆成食材、營養、慢性病、過敏原等 12 類實體,再對食譜資料庫做知識查詢。兩年後,目標是把這個學生時期的專題翻新成能公開展示、且資安過關的作品集。',
          en: 'Four Times for Cook was my 2024 project for the National Science and Technology Museum × Ministry of Education “AI Health Application” program: a platform folding personalized recipe recommendation, daily health tracking (calories / water / exercise), a nutrition knowledge base and food-surplus ordering into one “eat well, waste less” product. The recommendation engine centers on a BERT named-entity model that parses a user’s natural-language request into 12 entity classes — ingredient, nutrition, chronic disease, allergen and more — then runs a knowledge query over the recipe database. Two years on, the goal was to turn that student project into a public, security-clean portfolio piece.',
        },
      ],
      constraints: [
        {
          zh: '三個公開 repo(Django REST 後端、React 前端、PyTorch BERT 微調腳本)。誠實揭露分工:原始專案(2024)由本人於計畫期間開發;近期這輪資安稽核與全面重構為 AI(Claude)輔助完成,每一項修復皆對應到可查證的 commit,數字不灌水。',
          en: 'Three public repos — a Django REST backend, a React frontend and a PyTorch BERT fine-tuning script. Attribution kept honest: the original project (2024) is my own work from the program; the recent security audit and full rebuild were done with AI (Claude) assistance, every fix tied to a verifiable commit, no numbers inflated.',
        },
        {
          zh: '展示環境沒有 MySQL、沒有 GPU、也沒有原始訓練資料,demo 仍必須完整可跑。',
          en: 'The showcase environment has no MySQL, no GPU and no original training data, yet the demo still has to run in full.',
        },
        {
          zh: '前端全部重寫後,仍要與既有 Django API 契約一字不差地對齊。',
          en: 'After a full frontend rewrite, it still had to line up exactly with the existing Django API contract.',
        },
      ],
      architecture: [
        {
          zh: '一次跨三個 repo 的稽核以多代理平行進行,產出 175 項經對抗式驗證的發現(4 項 Critical),再依 P0 資安 → P1 正確性 → P2 架構的順序修復,落地為 54 個原子 commit、26 個回歸測試(後端 13、前端 8、模型 5)全數綠燈。',
          en: 'A single audit across the three repos ran as parallel agents, producing 175 adversarially-verified findings (4 critical), remediated in a P0-security → P1-correctness → P2-architecture order and landed as 54 atomic commits with 26 regression tests (13 backend, 8 frontend, 5 model) all green.',
        },
        {
          zh: '後端 Django 5 + DRF + SimpleJWT,四個領域 app(會員、食譜、紀錄、健康管理);BERT 為 bert-base-cased token classification、12 類 BIO 標籤,產出的 state_dict 供後端推論。前端從停止維護的 Create React App 全面重寫為 Vite + TypeScript + Tailwind + shadcn,綠色食療設計系統、11 個頁面、記憶體內權杖與集中式 API service 層。',
          en: 'The backend is Django 5 + DRF + SimpleJWT across four domain apps (member, recipe, record, health); the BERT model is a bert-base-cased token classifier with 12 BIO labels whose state_dict feeds backend inference. The frontend was fully rewritten from the unmaintained Create React App to Vite + TypeScript + Tailwind + shadcn — a green “food-as-medicine” design system, 11 pages, in-memory tokens and a centralized API service layer.',
        },
      ],
      responsibilities: [
        {
          zh: '2024 年於計畫期間獨立開發原始三件式(後端 API、前端,以及在 Google 預訓練 bert-base-cased 上微調的實體標記模型——是套用既有模型,不是自建模型架構)。2026 年這輪的資安稽核、後端硬化、前端重構與模型修復為 AI(Claude)輔助完成,分三個 repo 推進,commit 歷史與測試結果皆可查證。',
          en: 'Independently built the original three pieces during the 2024 program — backend API, frontend, and an entity-tagging model fine-tuned on Google’s pretrained bert-base-cased (applying an existing model, not designing an architecture). The 2026 security audit, backend hardening, frontend rebuild and model fixes were done with AI (Claude) assistance across the three repos, with verifiable commit history and test results.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '後端有兩個可直接利用的高風險漏洞:任何登入者能透過 ModelViewset 讀取、修改或刪除全部會員(IDOR),且忘記密碼只憑 email + 生日就能重設任意帳號密碼。',
            en: 'The backend had two directly exploitable flaws: any logged-in user could read, edit or delete every member through a ModelViewset (IDOR), and password reset changed any account’s password given only an email and birthdate.',
          },
          s: {
            zh: '把會員端點收斂為僅限本人的自助動作、移除自動 CRUD;忘記密碼改為簽章式一次性權杖流程並加上限流與不洩漏帳號存在與否;全域權限預設由「同時掛 IsAuthenticated 與 AllowAny(等於全開)」收斂為單一 IsAuthenticated。這些修復都寫成回歸測試(13 個,全綠)。',
            en: 'Member endpoints were narrowed to owner-only self-service with the auto CRUD removed; password reset became a signed single-use-token flow with throttling and no account-existence leak; the global permission default — which had listed both IsAuthenticated and AllowAny, i.e. fully open — was collapsed to a single IsAuthenticated. Every fix was captured as a regression test (13, all green).',
          },
        },
        {
          c: {
            zh: '食譜是平台主功能,卻每一次回應都 500——序列化器對一張從未被填入的屬性表呼叫 .get(),必然拋 DoesNotExist。',
            en: 'Recipes are the platform’s core feature, yet every response 500’d — the serializer called .get() on an attributes table that was never populated, so it always raised DoesNotExist.',
          },
          s: {
            zh: '把 .get() 改為 .filter().first() 並在無資料時回傳空屬性,連同 week_record、會員更新、健康目標計算等一連串必炸端點一併修好,讓核心流程真正能回資料。',
            en: 'Changed .get() to .filter().first() returning empty attributes when absent, and fixed a chain of always-crashing endpoints alongside it — weekly records, profile update, health-target computation — so the core flows actually return data.',
          },
        },
        {
          c: {
            zh: 'BERT 訓練腳本的 argmax 取在序列軸而非標籤軸,訓練直接崩潰;準確率又被除以恆為 2 的長度、且測試集同時被當驗證集(資料洩漏)——看似在訓練,數字卻毫無意義。',
            en: 'The BERT trainer’s argmax reduced the sequence axis instead of the label axis, crashing training outright; accuracy was divided by a length that is always 2, and the test set doubled as the validation set (leakage) — it looked like it was training while the numbers meant nothing.',
          },
          s: {
            zh: '修正 argmax 軸、拆出互斥的 train/val/test、以有效 token 正確計算準確率、換用 AdamW + 排程器、加上 seqeval 的實體級 F1 與固定亂數種子,並統一 state_dict 存/載契約。附一組小樣本 fixture,讓 python train.py 能在 CPU 上真正跑完一個 epoch 並存回可載入的模型。',
            en: 'Fixed the argmax axis, split disjoint train/val/test sets, computed accuracy over valid tokens, switched to AdamW with a scheduler, added seqeval entity-level F1 and a fixed seed, and unified the state_dict save/load contract. A tiny sample fixture lets python train.py actually complete one epoch on CPU and save a reloadable model.',
          },
        },
        {
          c: {
            zh: '前端 API base 硬編碼成一條早已失效的 ngrok 通道,任何人 clone 下來畫面全是錯誤;而作品集又需要在完全沒有後端的 GitHub Pages 上完整展示。',
            en: 'The frontend’s API base was hard-coded to a long-dead ngrok tunnel, so anyone cloning it saw nothing but errors — and the portfolio still had to demo in full on GitHub Pages with no backend at all.',
          },
          s: {
            zh: '重寫時內建「Demo 模式 / API 模式」切換:Demo 模式以 MSW 攔截每一支 API,回傳一整套繁中種子資料(食譜、營養、健康、剩食),讓網站在 GitHub Pages 上無需後端即可完整運作;前端 service 層對後端 18 個端點逐一比對,契約 18/18 對齊。',
            en: 'The rewrite bakes in a Demo/API toggle: Demo mode intercepts every API call with MSW and returns a full set of Traditional-Chinese seed data (recipes, nutrition, health, surplus) so the site runs completely on GitHub Pages with no backend; the frontend service layer was checked against all 18 backend endpoints — 18/18 aligned.',
          },
        },
      ],
      facts: [
        { value: '175', label: { zh: '稽核發現(4 Critical)', en: 'findings (4 critical)' } },
        { value: '54', label: { zh: '原子 commit', en: 'atomic commits' } },
        { value: '26', label: { zh: '回歸測試全綠', en: 'regression tests, all green' } },
        { value: '3', label: { zh: 'repo:API · 前端 · 模型', en: 'repos: API · web · model' } },
      ],
      lessons: [
        {
          zh: '指標算錯比沒有指標更危險:BERT 的 argmax 取錯軸,讓訓練看起來在跑、印出的準確率卻毫無意義。模型類的「綠燈」一定要回頭確認算的是不是對的東西,而不是只看它有沒有印出數字。',
          en: 'A wrong metric is more dangerous than no metric: the BERT argmax on the wrong axis made training look alive while the printed accuracy was meaningless. A model’s “green” must be checked for measuring the right thing, not just for printing a number.',
        },
        {
          zh: '要讓舊專案變成能公開展示的作品集,先決條件是它「能在沒有後端的情況下獨立跑起來」:一層 seed/mock 模式比任何視覺翻新都更早該處理,否則 demo 連載入都失敗。',
          en: 'Turning an old project into a public portfolio piece hinges first on running standalone with no backend: a seed/mock layer comes before any visual refresh — without it the demo fails to even load.',
        },
        {
          zh: '重寫前端時,最該先鎖住的是與後端的 API 契約:先把 18 個端點逐一對齊,再重畫畫面,串接才不會在重構後悄悄斷掉。',
          en: 'When rewriting a frontend, the API contract with the backend is what to lock first: aligning all 18 endpoints before redrawing screens keeps the integration from silently breaking after the refactor.',
        },
      ],
    },
    screenshots: [
      {
        src: '/images/work/four-times-for-cook/health-dashboard.webp',
        alt: {
          zh: '健康總覽頁:飲水/熱量/運動三個進度環、連續達標卡、今日目標完成度徑向圖、可切換指標的近 7 日趨勢圖、本週紀錄表與個人化建議',
          en: 'Health dashboard: water / calorie / exercise progress rings, a streak card, a daily goal radial, a 7-day trend chart with metric tabs, the weekly log table and personalised suggestions',
        },
        caption: {
          zh: '登入後的健康總覽。三個環顯示的是「還差多少」而不是已完成量,7 日趨勢可切換指標並疊上目標線;整頁資料由 repo 內建的 demo 模式(MSW 攔截 23 支 API)供應,不需要任何後端。',
          en: 'The health dashboard behind login. The rings count down what is still missing rather than what is done, and the 7-day chart switches metric with the goal line overlaid. The whole page is fed by the repo’s built-in demo mode — MSW intercepting all 23 API routes — with no backend running.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/recipe-search.webp',
        alt: {
          zh: '食譜搜尋頁:自然語言輸入框、時段/料理/健康條件三組共 20 個篩選標籤,以及 8 張食譜卡片',
          en: 'Recipe search: a natural-language input, 20 filter chips in three groups (time of day / cooking method / health goal) and eight recipe cards',
        },
        caption: {
          zh: '食譜搜尋。輸入框接的是整條 BERT 管線的入口——正式模式下這句中文會被翻成英文、切成 12 類實體再組成 ORM 查詢;左側 20 個標籤則對應後端 frontendQuery.json 的分類。預設列出種子資料 12 筆食譜中的前 8 筆。',
          en: 'Recipe search. The text box is the front door of the whole BERT pipeline: in API mode that Chinese sentence is translated, split into 12 entity classes and turned into an ORM query. The 20 chips on the left mirror the backend’s frontendQuery.json categories; the default list shows 8 of the 12 seeded recipes.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/recipe-detail.webp',
        alt: {
          zh: '食譜詳情頁:主圖、標籤、時間/步驟/食材數摘要、食材清單、編號步驟、三大營養素甜甜圈圖與完整營養標示',
          en: 'Recipe detail: hero image, tags, a time/steps/ingredients summary, ingredient list, numbered steps, a macronutrient donut and a full nutrition panel',
        },
        caption: {
          zh: '食譜詳情——食材、編號步驟與營養標示。頁首那張沙漠夜景不是挑錯圖:種子資料用 picsum.photos 依 id 取隨機照片,所以「蒜香檸檬烤雞胸」配到了一片沙漠。這是程式真實渲染的結果,我沒有為了截圖去換掉它。',
          en: 'Recipe detail — ingredients, numbered steps and the nutrition panel. The desert at night is not a mis-picked image: the seed pulls `picsum.photos/seed/<id>`, an arbitrary photo per id, so a garlic-lemon roast chicken gets a desert. That is what the code actually renders, and I did not swap it out for the screenshot.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/surplus-marketplace.webp',
        alt: {
          zh: '剩食專區:四格影響力數字、店家搜尋與距離排序、類別分頁,以及 8 筆帶折扣標籤、取餐時段與距離的即期品項卡片',
          en: 'Food-surplus marketplace: a four-stat impact strip, store search with distance sorting, category tabs and eight discounted listings with pickup windows and distances',
        },
        caption: {
          zh: '剩食專區。頂端四格中,可預約品項、合作店家與平均折扣都是即時由清單算出的,只有「可減少浪費」是品項數乘上一個固定常數(320 克/件)——估算式的展示文案,不是量測值。另一件該講清楚的:Django 後端至今沒有任何 /Surplus/ 端點,這一整頁只活在 demo 模式的 mock 層裡。',
          en: 'The surplus marketplace. Of the four stats on top, item count, partner stores and average discount are computed live from the listing set; only “waste avoided” is item-count times a fixed constant (320 g per item) — a display estimate, not a measurement. Worth stating plainly: the Django backend has no /Surplus/ endpoint at all, so this entire page currently lives only in the demo-mode mock layer.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/landing.webp',
        alt: {
          zh: '首頁全頁:漸層主視覺、三大核心功能卡、當令食譜與知識專區橫排,以及影響力數字與 Recharts 面積圖',
          en: 'Full-page landing: gradient hero, three feature cards, seasonal recipe and knowledge rails, plus an impact stat block with a Recharts area chart',
        },
        caption: {
          zh: '首頁全頁,也是綠色食療設計系統最完整的一次展開。底部那四個數字(12,000+ 會員、8.2 噸)是寫死在 Landing.tsx 的展示文案,不是統計;旁邊的面積圖同樣讀種子資料——會特別做 prefers-reduced-motion 處理,是因為全頁截圖會讓 Recharts 重掛動畫。',
          en: 'The full landing page, and the widest view of the green “food is medicine” design system. The four figures at the bottom (12,000+ members, 8.2 tonnes) are display copy hard-coded in Landing.tsx, not statistics; the area chart beside them reads seed data too. It honours prefers-reduced-motion — which is what made a full-page capture possible, since resizing otherwise restarts the Recharts animation.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/mobile-health-dashboard.webp',
        alt: {
          zh: '健康總覽頁的 390px 行動版:三個進度環改為直向堆疊、快速記錄按鈕撐滿寬度,連續達標與目標完成度卡片接續在下方',
          en: 'The health dashboard at 390px: progress rings stacked vertically, full-width quick-log buttons, with the streak and goal-completion cards following below',
        },
        caption: {
          zh: '同一張健康總覽在 390px 寬。桌機版並排的三個環改為直向堆疊、快速記錄按鈕撐滿寬度,原本在右欄的連續達標與目標完成度卡片接到主欄下方——排版重排而不是等比縮小。',
          en: 'The same dashboard at 390px. The three rings that sit side by side on desktop stack vertically, the quick-log buttons go full width, and the right-column streak and goal cards fall into the main column — a reflow, not a scaled-down desktop layout.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/four-times-for-cook/diagram-recipe-query-pipeline.svg',
        alt: {
          zh: 'POST /Recipe/get/ 的流程圖:翻譯、BERT 標記、B-/I- 併段、篩選標籤合流、組成兩個 Q 物件並以 rid 相交,含兩條寫死的 fallback 路徑',
          en: 'Flowchart of POST /Recipe/get/: translation, BERT tagging, B-/I- span merging, chip merging, two Q objects intersected on rid, and two hard-coded fallback paths',
        },
        caption: {
          zh: '一句中文如何變成 ORM 查詢:先由 GoogleTranslator 翻成英文(一次對外 HTTP),再交給 BERT 切出 12 類實體,B-/I- 併成片語後與篩選標籤合流,最後組成兩個 Q 物件——實體側查 recipe_recipe_ob、屬性側查 recipe_recipe_at,以 rid 相交後取前 3 筆。圖上兩個紅框是這張圖最該看的地方:標不出任何實體、或查詢結果為空時,程式回傳寫死的三個食譜 id。',
          en: 'How one Chinese sentence becomes an ORM query: GoogleTranslator turns it into English (one outbound HTTP call), BERT splits out 12 entity classes, B-/I- spans are merged and joined with the filter chips, and two Q objects are built — the entity side against recipe_recipe_ob, the attribute side against recipe_recipe_at — intersected on rid, top three taken. The two red boxes are the part worth reading: when nothing is tagged, or nothing matches, the code returns three hard-coded recipe ids.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-bert-label-scheme.svg',
        alt: {
          zh: '12 類 BIO 標籤與五層規則串接的流程圖,包含詞典片語比對、單字詞典與靜態關鍵字表,以及整列被丟棄的條件',
          en: 'Flowchart of the 12-label BIO scheme and the five-rule cascade — gazetteer phrase matching, single-word vocabularies and static keyword lists — plus the row-drop condition',
        },
        caption: {
          zh: '12 個標籤是怎麼被標上去的。五層規則依序覆寫:數字 → 食材詞典片語 → 食譜標籤詞典片語 → 單字詞典 → 靜態關鍵字表,後面的規則蓋掉前面的。只有 ING 與 TAG 有 I- 延續標籤,num 完全不帶前綴——這正是推論端必須特判它的原因。標到最後整列只剩 O 與 num 的訓練資料會直接丟掉。',
          en: 'How the 12 labels get assigned. Five rules run in order and later ones overwrite earlier ones: numerics → ingredient-gazetteer phrases → recipe-tag phrases → single-word vocabularies → static keyword lists. Only ING and TAG have an I- continuation and `num` carries no prefix at all — which is exactly why the inference side special-cases it. A training row that ends up as nothing but O and num is discarded.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-bert-subword-alignment.svg',
        alt: {
          zh: '字詞級 BIO 標籤對齊 WordPiece 的流程圖,以實跑範例顯示 -100 遮罩如何套用在續接片段與特殊 token 上',
          en: 'Flowchart of word-level BIO tags aligned to WordPiece tokens, with a real worked example showing the -100 mask on continuation pieces and special tokens',
        },
        caption: {
          zh: '整個模型最容易寫錯的一步,用實跑的例子畫出來:fixture 第 2 行「i am allergic to peanuts and milk」中,peanuts 被切成 p / ##eanut / ##s,只有第一個片段拿到 B-ALG,其餘連同 [CLS]/[SEP]/[PAD] 一律填 -100,讓 CrossEntropy 完全略過——所以子詞與 padding 既不貢獻 loss,也不進準確率的分母。推論時同一套走訪改成輸出遮罩,過濾 logits 後保證「一個字一個標籤」。',
          en: 'The single easiest step to get wrong, drawn from a real run: in fixture line 2, “i am allergic to peanuts and milk”, *peanuts* becomes p / ##eanut / ##s — only the first piece receives B-ALG, and every continuation piece plus [CLS]/[SEP]/[PAD] is set to -100 so CrossEntropy skips it. Sub-words and padding therefore contribute neither loss nor an accuracy denominator. At inference the same walk emits a mask instead, filtering the logits down to exactly one tag per input word.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-bert-ml-pipeline.svg',
        alt: {
          zh: 'BERT 專案的五階段管線圖:語料前處理、已入版控的 fallback 資料、微調、產出權重與推論、以及跨 repo 的下游消費端',
          en: 'Five-stage pipeline of the BERT repo: corpus prep, committed fallbacks, fine-tuning, the weight artifact and inference, and the cross-repo downstream consumer',
        },
        caption: {
          zh: '模型從語料到下游的全貌,也順帶說明這個 repo 為什麼 clone 下來就能跑。左段的 Kaggle Food.com CSV 與 zjy1.xlsx 都在 .gitignore 裡,所以中段那兩個 fallback 才是實際入口:40 行手寫的 train.jsonl 是預設資料集,沒有權重時 demo.py 就直接拿它就地微調。右端跨出本 repo——DB_search 的契約在這裡只有一份 import 不到 Django 的參考副本。',
          en: 'The model from corpus to consumer — and why the repo runs straight out of a clone. The Kaggle Food.com CSVs and zjy1.xlsx on the left are both gitignored, so the two committed fallbacks in the middle are the real entry point: a 40-line hand-written train.jsonl is the default dataset, and with no weights on disk demo.py fine-tunes on it in memory. The right-hand stage leaves this repo entirely — the DB_search contract exists here only as a reference copy that cannot import Django.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-bert-inference-flow.svg',
        alt: {
          zh: 'python demo.py 跑一題的時序圖:載入權重或就地微調的分支、tokenize、對齊遮罩、logits argmax、抽出 typed spans,以及交給另一個 repo 的邊界',
          en: 'Sequence diagram of one question through python demo.py: the load-weights-or-fine-tune branch, tokenization, the alignment mask, logits argmax, typed-span extraction and the hand-off boundary to the other repo',
        },
        caption: {
          zh: '一題問句從 CLI 到食譜 id 的完整時序。上半段的 alt 分支是這個專案最實用的設計:有權重就 torch.load state_dict,沒有就退回用 40 行 fixture 就地微調 25 個 epoch,讓沒有任何前置作業的人也能看到東西。下半段被標成 BOUNDARY——spans 交給另一個 repo 的 Django 後端,那段在本 repo 裡跑不起來,圖上如實畫成跨界。',
          en: 'One question from the CLI to recipe ids. The alt branch at the top is the most practical decision in the repo: load a state_dict if weights exist, otherwise fall back to fine-tuning the 40-line fixture for 25 epochs in memory, so someone with zero setup still sees output. The lower half is marked BOUNDARY — the typed spans go to the Django backend in a different repo, and that stretch genuinely cannot run here, so it is drawn as a crossing rather than glossed over.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-system-architecture.svg',
        alt: {
          zh: '後端系統架構圖:middleware 鏈、DRF 全域預設(JWT、權限、限流)、六組路由 viewset、規則引擎與查詢服務層、SQLite/MySQL 切換,以及虛線標示的選用 ML 模組',
          en: 'Backend architecture: the middleware chain, DRF global defaults (JWT, permissions, throttles), six routed viewsets, the rules-engine and query service layer, the SQLite/MySQL switch, and dashed optional ML modules',
        },
        caption: {
          zh: 'Django 後端的全貌:middleware 鏈、DRF 全域預設(JWT HS256、預設 IsAuthenticated、匿名 30/min、密碼重設 5/hr)、六組路由 viewset,以及規則引擎與 DB_query 的服務層。右下角刻意畫成虛線的是選用模組——BERT 推論與 Kaggle 匯入都靠 requirements-ml.txt 額外安裝,而且權重目錄 recipe/BertModel/trained/ 在 repo 裡根本不存在。實際跑起來的資料庫裡,三張食譜表都是 0 列。',
          en: 'The Django backend end to end: the middleware chain, DRF global defaults (JWT HS256, IsAuthenticated by default, 30/min anonymous, 5/hour on password reset), six routed viewsets, and the rules-engine plus DB_query service layer. The dashed boxes bottom-right are deliberate — BERT inference and the Kaggle import both need the separate requirements-ml.txt, and the weights directory recipe/BertModel/trained/ does not exist in the repo at all. In a freshly migrated database, all three recipe tables hold zero rows.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-domain-er.svg',
        alt: {
          zh: '核心領域 ER 圖,使用真實表名與欄位名:會員四張一對一表、每日事件表與彙總表、題庫作答表,以及食譜三張表之間沒有外鍵的關係',
          en: 'Core domain ER diagram with real table and column names: the four one-to-one member tables, daily event and aggregate tables, the quiz tables, and the FK-less relationships between the three recipe tables',
        },
        caption: {
          zh: '真實的表名與欄位名——是從 sqlite 的 PRAGMA 讀出來的,不是照 models.py 抄。三件只有攤開 schema 才看得到的事:recipe_recipe_ob 與 recipe_recipe_at 之間沒有任何外鍵,靠 Python 以 rid 相接;Member_healthtarget 的外鍵指向 Member_member 而不是認證用的 Member_memberp;email 的唯一性只在序列化器把關,資料庫層沒有約束。',
          en: 'Real table and column names — read out of sqlite via PRAGMA, not transcribed from models.py. Three things only an expanded schema shows: recipe_recipe_ob and recipe_recipe_at have no foreign key between them and are joined in Python on rid; Member_healthtarget points at Member_member rather than the auth model Member_memberp; and email uniqueness is enforced only in the serializer, with no database constraint behind it.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-health-target-derivation.svg',
        alt: {
          zh: 'BMI 推導每日目標的流程圖:註冊交易與延遲補算兩個入口、純 Python 規則引擎的三種分派、BMI 區間表,以及寫入 HealthTarget 的計算式',
          en: 'Flowchart deriving daily targets from BMI: the registration transaction and the lazy-backfill entry point, the pure-Python rules engine’s three dispatches, the BMI interval table, and the HealthTarget write',
        },
        caption: {
          zh: 'BMI 怎麼變成每日的飲水/熱量/運動目標。兩個入口:註冊時在單一 transaction.atomic 內連建四張表,或首次呼叫 /HManage/Personal/ 時延遲補算。規則引擎是一張純 Python 的 BMI 區間表——用來取代在 Python 3.10+ 已經 import 不了的 experta——回傳的是 dict 複本,呼叫端動不到規則表本身。圖上也標了那個 /100 修正:身高沒先換算成公尺前,每個人的 BMI 都趨近 0。',
          en: 'How BMI becomes daily water / calorie / exercise targets. Two entry points: registration builds four tables inside one transaction.atomic, or the first call to /HManage/Personal/ backfills lazily. The rules engine is a plain-Python BMI interval table — written to replace experta, which no longer imports on Python 3.10+ — and it returns a copy of the dict so callers cannot mutate the rule table. The diagram also marks the /100 fix: before height was converted from cm to metres, every BMI came out near zero.',
        },
      },
      {
        src: '/images/work/four-times-for-cook/diagram-daily-record-loop.svg',
        alt: {
          zh: '每日健康紀錄的時序圖:一次 JWT 驗證後的寫入(含缺鍵 400 分支與強度加權),以及一次彙總讀取(當日時區窗、目標補算、週狀態碼)',
          en: 'Sequence diagram of the daily health loop: one JWT-authenticated write (with the missing-key 400 branch and intensity weighting) and one aggregate read (today’s timezone window, target backfill, weekly status codes)',
        },
        caption: {
          zh: '一次寫入加一次彙總讀取的時序。JWT 以 account 宣告解析使用者,運動分鐘依強度乘 2/5/7 的權重累進當日彙總列;讀取端以 Asia/Taipei 的當日區間過濾而不是裸 UTC,並在還沒有目標時就地呼叫 BMI 規則補算一份。週狀態 0–3 的判定條件(整週無紀錄、當日無紀錄、落在寬限值內、熱量另外再 ±200)也一併標在圖上。',
          en: 'One write and one aggregate read, in order. JWT resolves the user from the `account` claim; exercise minutes accumulate into the day’s aggregate row weighted 2/5/7 by intensity. The read side filters on today’s Asia/Taipei window rather than naive UTC, and backfills a target on the spot by calling the BMI rules if none exists. The 0–3 weekly status codes are spelled out too: nothing all week, nothing that day, inside the slack thresholds, and calories additionally within ±200.',
        },
      },
    ],
  },
  {
    slug: 'helmet-detect',
    domain: 'fullstack',
    visibility: 'public',
    title: {
      zh: 'HelmetDetect 工地安全帽偵測平台',
      en: 'HelmetDetect — Construction-Site Helmet Detection',
    },
    oneLiner: {
      zh: 'PHP Lumen API、獨立的 Python YOLO 推論服務與 React 儀表板組成的工地安全帽偵測平台;另做了一套不需後端的展示模式,部署在 GitHub Pages。',
      en: 'A construction-site helmet-detection platform — a PHP Lumen API, a separate Python YOLO inference service and a React dashboard, plus a backend-free demo mode deployed to GitHub Pages.',
    },
    scope: { zh: '個人專案 · 2024 原型 → 2026 重構', en: 'Personal project · 2024 prototype → 2026 rebuild' },
    stack: ['LUMEN', 'FLASK', 'YOLO', 'MYSQL', 'REACT', 'VITE', 'TAILWIND'],
    keyMetric: {
      value: '3',
      label: { zh: '服務(Lumen · Flask · React)', en: 'services (Lumen · Flask · React)' },
    },
    links: {
      live: 'https://namecallbob.github.io/Assist_project_HelmetDetect/',
      repo: 'https://github.com/NameCallBob/Assist_project_HelmetDetect',
    },
    featured: false,
    screenshots: [
      {
        src: '/images/work/helmet-detect/safety-dashboard.webp',
        alt: {
          zh: '工安總覽:總偵測次數、違規/合規場景與偵測到人員的 KPI 卡、合規率環圈圖、高風險地點長條圖,以及最近偵測的標註縮圖',
          en: 'Safety overview: KPI tiles for total detections, violating and compliant scenes and people detected, a compliance donut, a high-risk-location bar chart and annotated recent-detection thumbnails',
        },
        caption: {
          zh: '工安總覽——合規率 50% 是由 10 筆種子紀錄即時算出的,不是寫死的數字;右上角的「展示模式」標籤是應用自己掛的,提醒背後沒有後端。',
          en: 'Safety overview — the 50% compliance rate is computed live from the ten seeded records, not hard-coded; the “demo mode” pill top-right is the app labelling itself, because nothing is behind it.',
        },
      },
      {
        src: '/images/work/helmet-detect/detect-result.webp',
        alt: {
          zh: '安全帽偵測頁:左側是標註完成的畫面與逐人信心值,右側為上傳區與四個範例場景,底部有偵測完成提示',
          en: 'Helmet detection page: the annotated frame with per-person confidence on the left, an upload zone and four sample scenes on the right, and a completion toast at the bottom',
        },
        caption: {
          zh: '偵測結果——綠框 HELMET、紅框 NO-HELMET,附逐人信心值。這些框來自 seed 的固定座標:YOLO 服務沒有啟動,上傳區也直接寫著「展示模式會以模擬結果呈現」。',
          en: 'Detection result — green HELMET boxes, red NO-HELMET boxes, per-person confidence. The boxes come from fixed seed coordinates: the YOLO service is not running, and the upload zone says so in plain words.',
        },
      },
      {
        src: '/images/work/helmet-detect/detection-history.webp',
        alt: {
          zh: '偵測紀錄頁:9 張帶標註縮圖的卡片網格,上方有關鍵字搜尋與全部/違規/合規篩選',
          en: 'Detection history: a grid of nine cards with annotated thumbnails, above them a keyword search and all/violation/compliant filters',
        },
        caption: {
          zh: '偵測紀錄——關鍵字搜尋加違規/合規篩選。左上 08/29 那筆不是種子資料,是截圖當下真的按下「執行偵測」後寫進 localStorage 的紀錄。',
          en: 'Detection history — keyword search plus violation/compliance filters. The 08/29 card at top-left is not seed data: it is the record produced by actually clicking “run detection” during capture, persisted to localStorage.',
        },
      },
      {
        src: '/images/work/helmet-detect/detection-detail.webp',
        alt: {
          zh: '偵測詳情頁:放大的標註畫面、檔名與地點資訊卡、逐人辨識結果列,以及確認違規/誤判的複核面板',
          en: 'Detection detail: an enlarged annotated frame, a file/location info card, per-person result rows and a review panel with confirm-violation and false-positive actions',
        },
        caption: {
          zh: '偵測詳情——逐人結果與複核面板。「確認違規/誤判」對應後端 comment.confirm 欄位;該資料表與 CommentController 都存在,但 routes/web.php 沒有替它註冊任何路由。',
          en: 'Detection detail — per-person results and the review panel. Confirm/false-positive maps to the backend’s comment.confirm column; the table and CommentController both exist, but routes/web.php registers no route for them.',
        },
      },
      {
        src: '/images/work/helmet-detect/admin-review-table.webp',
        alt: {
          zh: '偵測管理頁:巡檢員人數、違規總數、合規率與待複核的 KPI 卡,下方是跨巡檢員的偵測表格與狀態標籤',
          en: 'Admin console: KPI tiles for inspectors, total violations, compliance rate and pending reviews, above a cross-inspector detection table with status badges',
        },
        caption: {
          zh: '管理端的跨巡檢員表格,可依違規/待複核過濾。只有 2 名巡檢員,是種子資料的全部,不是被截斷。',
          en: 'The admin’s cross-inspector table, filterable by violation and pending-review. Two inspectors is the entire seeded roster — not a truncated view.',
        },
      },
      {
        src: '/images/work/helmet-detect/mobile-dashboard.webp',
        alt: {
          zh: '390px 寬的行動版工安總覽:KPI 卡改為兩欄、圖表整寬堆疊,畫面底部固定底部導覽列',
          en: 'The safety overview at 390px: KPI tiles in two columns, charts stacked full width, and a fixed bottom navigation bar',
        },
        caption: {
          zh: '同一頁在 390px:KPI 收成兩欄、圖表整寬堆疊,側欄在 Tailwind md 斷點以下換成固定底部 tab 導覽——同一份元件,兩種資訊密度。',
          en: 'The same page at 390px: KPIs fold to two columns, charts stack full width, and below Tailwind’s md breakpoint the sidebar becomes a fixed bottom tab bar — one component tree, two information densities.',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/helmet-detect/diagram-detection-pipeline.svg',
        alt: {
          zh: 'POST /picture/upload 的循序圖:SPA、中介層、PictureController、儲存層、MySQL、Flask 與 YOLO 之間的同步呼叫順序',
          en: 'Sequence diagram of POST /picture/upload across the SPA, middleware, PictureController, storage, MySQL, Flask and YOLO',
        },
        caption: {
          zh: '整個系統最重要的一次呼叫:一個 POST 同步走完 RBAC 查表 → 存檔 → 寫入 picture → HTTP 打進 Flask → YOLO 推論 → 寫入 result。這條路徑上沒有任何佇列(QUEUE_CONNECTION=sync),請求會一路阻塞到推論回來;而且判定違規之後不會通知任何人。',
          en: 'The system’s single most important call: one POST walks RBAC lookup → file store → picture insert → an HTTP hop into Flask → YOLO inference → result insert, all synchronously. There is no queue anywhere on that path (QUEUE_CONNECTION=sync), so the request blocks until inference returns — and a confirmed violation notifies nobody.',
        },
      },
      {
        src: '/images/work/helmet-detect/diagram-system-architecture.svg',
        alt: {
          zh: '後端服務與分層架構圖:React SPA、Lumen 的前控制器/中介層/路由/控制器/Eloquent、MySQL,以及獨立的 Flask + YOLO 服務與 SMTP',
          en: 'Service and layer architecture: the React SPA, Lumen’s front controller, middleware, routes, controllers and Eloquent, MySQL, plus the separate Flask + YOLO service and SMTP',
        },
        caption: {
          zh: '三個執行體與它們之間的協定:React SPA → Lumen(全域 Cors/Auth 中介層、13 條路由註冊)→ 127.0.0.1:5000 的 Flask/YOLO。圖裡特地留了一格「已定義但未註冊路由」:ResultController、CommentController、UserController、ExampleController 都在檔案系統裡,routes/web.php 一條都沒接。',
          en: 'Three runtimes and the protocols between them: React SPA → Lumen (global CORS/auth middleware, 13 route registrations) → Flask/YOLO on 127.0.0.1:5000. One box is reserved for defined-but-unrouted controllers — ResultController, CommentController, UserController and ExampleController all exist on disk, and routes/web.php wires up none of them.',
        },
      },
      {
        src: '/images/work/helmet-detect/diagram-auth-rbac.svg',
        alt: {
          zh: 'JWT 認證與 role→action 授權流程圖:CORS 短路、全域中介層放行、有無 check.permission 的兩類路由、角色權限查表與各種 401/403 分支',
          en: 'JWT authentication and role→action authorization flow: the CORS short circuit, the global pass-through, guarded versus unguarded routes, the role-permission lookup and every 401/403 branch',
        },
        caption: {
          zh: '授權的實際形狀:只有 5 條 /picture/* 掛了 check.permission。另外 7 條裡,3 條在 controller 內自行重查身分,4 條完全不查——login、register,以及兩條密碼重設路由。這張圖畫的是這個不對稱,而不是一道齊整的門。',
          en: 'What authorization actually looks like: only the five /picture/* routes carry check.permission. Of the other seven, three re-check identity inside the controller and four check nothing at all — login, register, and both password-reset routes. The figure draws that asymmetry rather than a tidy single gate.',
        },
      },
      {
        src: '/images/work/helmet-detect/diagram-schema-er.svg',
        alt: {
          zh: 'MySQL 結構 ER 圖:users、picture、result、comment 四張業務表與 role、user_role、action、role_action 四張權限表及其外鍵關係',
          en: 'MySQL ER diagram: the four business tables users, picture, result and comment, the four RBAC tables role, user_role, action and role_action, and their foreign keys',
        },
        caption: {
          zh: '兩支 migration 建出的 8 張表——業務側 users/picture/result/comment,權限側 role/user_role/action/role_action,所有外鍵都是 ON DELETE CASCADE。值得注意的是 result.result_file_name 只有違規時才有值:合規的照片不會留下標註檔,這個「只存壞消息」的設計直接寫在欄位上。',
          en: 'The eight tables the two migrations create — users/picture/result/comment on the business side, role/user_role/action/role_action for RBAC, every foreign key ON DELETE CASCADE. Worth noticing: result.result_file_name is populated only on a violation, so a compliant photo leaves no annotated file. The “store only bad news” decision is visible in the column itself.',
        },
      },
      {
        src: '/images/work/helmet-detect/diagram-password-reset.svg',
        alt: {
          zh: '忘記密碼流程的循序圖:發送驗證碼、寫入 users 表的驗證碼與到期時間、透過 SMTP 寄信,以及重設密碼的查詢與到期判斷',
          en: 'Password-reset sequence: issuing the code, writing the code and expiry onto the users row, sending it over SMTP, and the reset lookup with its expiry check',
        },
        caption: {
          zh: '這是整個後端唯一一條對外送信的路徑——沒有任何違規通知走這裡。圖同時標出兩個從原始碼判讀出的行為(本機沒有 PHP runtime,Lumen 從未實際啟動):查無此人時 HTTP 仍回 200、狀態碼藏在 body 裡;重設時只用 6 碼驗證碼跨全表比對,沒有再綁回發起的使用者。',
          en: 'The only outbound mail path in the entire backend — no violation alert travels this way or any other. The figure also marks two behaviours read off the source (the Lumen app was never booted here — no PHP runtime): an unknown user still gets HTTP 200 with the status buried in the body, and the reset step matches the six-character code across all users without binding it back to whoever requested it.',
        },
      },
    ],
    caseStudy: {
      problem: [
        {
          zh: '工地未戴安全帽的稽查,原本靠人巡、拍照、事後回報。這個系統把它變成一條可查的流程:巡檢員上傳工地影像,YOLO 模型逐人標記 helmet / nohelmet,結果落成紀錄,再由工安管理員複核違規或標為誤判,並在總覽上匯出合規率與高風險地點。專案分兩個時期:2024 年 6 月是一支能跑通「上傳 → 推論」的 PHP + Flask 原型(對外靠 ngrok、後來換 serveo 打洞);2026 年的工作是把它重整成 backend/ 與 frontend/ 的完整專案,補上 React 儀表板,並讓它能在沒有後端的情況下公開展示。',
          en: 'Checking that workers wear helmets on site used to mean walking the site, taking photos and filing a report afterwards. This system turns that into a traceable flow: an inspector uploads a site image, a YOLO model marks each person helmet / nohelmet, the outcome becomes a record, and a safety manager confirms the violation or flags it as a false positive — with compliance rate and high-risk locations rolled up on an overview. The project has two eras: a June 2024 PHP + Flask prototype that could run upload → inference (exposed through an ngrok, later serveo, tunnel), and 2026 work that restructured it into a proper backend/ + frontend/ project, added the React dashboard, and made it demonstrable with no backend at all.',
        },
      ],
      constraints: [
        {
          zh: 'YOLO 偵測模型與 helmet.pt 權重由他人提供,不是我的工作;我負責的是 PHP 後端與串接。權重檔也沒有進版控——.gitignore 直接排除 *.pt,所以 clone 下來的 repo,Flask 服務在 import 時就會因為找不到 helmet.pt 而炸掉。任何公開的展示都不能依賴推論。',
          en: 'The YOLO detection model and the helmet.pt weights came from someone else — my work here is the PHP backend and the wiring around it. The weights are not in version control either: .gitignore excludes *.pt outright, so on a fresh clone the Flask service dies at import time looking for helmet.pt. No public demo can depend on inference running.',
        },
        {
          zh: '後端沒有非同步層。QUEUE_CONNECTION=sync、Console\\Kernel 的 schedule() 是空的、ExampleJob 仍是未動過的骨架,全庫 grep 不到任何 dispatch()、Queue:: 或 Notification 呼叫。偵測是一次阻塞的請求內呼叫,判定違規之後不會有信、推播或 webhook——這是既有事實,不是待辦。',
          en: 'There is no async tier. QUEUE_CONNECTION=sync, Console\\Kernel’s schedule() body is empty, ExampleJob is an untouched skeleton, and a repo-wide grep finds no dispatch(), Queue:: or Notification call anywhere. Detection is a blocking in-request call, and a violation produces no mail, push or webhook — a stated fact, not a to-do.',
        },
        {
          zh: '要公開開源,但憑證曾被提交進版控:MailController 寫死 Gmail SMTP 帳號與應用程式密碼,app.py 寫死本機 MySQL 連線資訊。兩者現已改讀環境變數,且公開前已改寫 git 歷史清除既有值,因此已無法從本 repo 復原。',
          en: 'It had to be open-sourced, yet credentials had been committed: a Gmail SMTP account and app password hardcoded in MailController, and local MySQL connection details in app.py. Both are now read from the environment, and the git history was rewritten before publication to purge the committed values — so they are no longer recoverable from this repo.',
        },
      ],
      architecture: [
        {
          zh: '三個獨立執行的東西。PHP Lumen 10 的 API 是入口:routes/web.php 共 13 條註冊(1 條根路由 + 12 個 API 端點),全域串 CorsMiddleware 與 AuthMiddleware,另以 check.permission 這個 route middleware 別名做逐端點授權。推論不在 PHP 裡:PictureController 把上傳的位元組以 multipart 打到 127.0.0.1:5000 的 Flask 服務,由 Ultralytics YOLO 讀 helmet.pt 推論,只在偵測到 nohelmet 時才把標註圖寫進 storage,並回傳 { message, detection, filename }。前端是 React 18 + Vite 6 + Tailwind v4,7 個頁面。',
          en: 'Three things that run independently. A PHP Lumen 10 API is the entry point: routes/web.php holds 13 registrations (1 root route plus 12 API endpoints), with CorsMiddleware and AuthMiddleware in the global stack and a check.permission route-middleware alias doing per-endpoint authorization. Inference does not live in PHP: PictureController posts the upload bytes as multipart to a Flask service on 127.0.0.1:5000, where Ultralytics YOLO loads helmet.pt, writes an annotated image to storage only when nohelmet is found, and returns { message, detection, filename }. The frontend is React 18 + Vite 6 + Tailwind v4 across seven pages.',
        },
        {
          zh: 'MySQL 由兩支 migration 建出 8 張表:業務側 users / picture / result / comment,權限側 role / user_role / action / role_action,外鍵全部 ON DELETE CASCADE。授權是 role→action 查表:種子有 5 個 action,user 角色拿 4 個,admin 多一個 picture.manage.all。前端的關鍵是單一資料轉接層(src/lib/api.js,237 行):同一組函式有 demo 與 live 兩個分支,由 VITE_API_MODE 決定——demo 讀 10 筆種子紀錄與 4 個範例場景、新的偵測寫進 localStorage;live 打 Lumen 端點,再把 picture[]+results[] 正規化成同一種扁平紀錄。GitHub Actions 先跑 vitest,再以 VITE_API_MODE=demo 建置並發到 Pages。',
          en: 'Two migrations create eight MySQL tables: users / picture / result / comment on the business side, role / user_role / action / role_action for RBAC, every foreign key ON DELETE CASCADE. Authorization is a role→action lookup: five seeded actions, four granted to the user role and a fifth (picture.manage.all) added for admin. The frontend’s keystone is a single data adapter (src/lib/api.js, 237 lines) where every operation has a demo and a live branch selected by VITE_API_MODE — demo reads ten seeded records and four sample scenes and writes new runs to localStorage; live calls the Lumen endpoints and normalizes picture[]+results[] into the same flat record shape. GitHub Actions runs vitest, then builds with VITE_API_MODE=demo and publishes to Pages.',
        },
      ],
      responsibilities: [
        {
          zh: '全部由我完成,git 全歷史 27 個 commit(跨我自己的兩組身分)。2024/06 的 5 個 commit 是 Lumen 後端加上串接他人提供的 Flask/YOLO 偵測服務的原型(模型本身不是我的);2026/07–08 的 22 個 commit 是這輪工作:目錄重整、React 儀表板與 demo/live 轉接層、34 個 vitest 測試、GitHub Pages CI,以及一串後端的正確性與資安修復。PHP 環境不在我目前的機器上,所以後端這輪是靜態閱讀原始碼後改的,沒有實際啟動驗證——這點如實記錄。',
          en: 'All of it is mine: 27 commits across the full git history (under two of my own identities). Five commits in June 2024 are the prototype — the Lumen backend wired to a Flask/YOLO detector someone else supplied (the model is not mine); 22 commits in July–August 2026 are this round — the directory restructure, the React dashboard and its demo/live adapter, 34 vitest tests, GitHub Pages CI, and a run of backend correctness and security fixes. PHP is not installed on my current machine, so those backend changes were made by reading the source rather than by booting the service — recorded as-is.',
        },
      ],
      challenges: [
        {
          c: {
            zh: 'Picture / Result / Comment 三個 Eloquent 模型沿用了複數表名的預設,但 migration 建的是單數表;而且程式讀寫 picture.file_name,schema 裡的欄位卻叫 url。也就是說,那三個模型的每一次查詢都必定失敗。',
            en: 'The Picture / Result / Comment Eloquent models kept Laravel’s plural-table default while the migration creates singular tables — and the code read and wrote picture.file_name against a column actually named url. Every query through those three models was guaranteed to fail.',
          },
          s: {
            zh: '在每個模型上明確釘死 $table,並把 schema 對齊程式實際讀寫的欄位:picture.url 改名為 file_name、補上 result.result_file_name。這類錯誤靜態看程式碼看不出來,是從「哪一行讀哪一個欄位」逐條比對 migration 才浮現的。',
            en: 'Pinned $table explicitly on each model and aligned the schema with the columns the code actually touches: renamed picture.url to file_name and added result.result_file_name. Nothing about this is visible from reading a model in isolation — it surfaced only from checking every read and write line against the migration.',
          },
        },
        {
          c: {
            zh: '上傳流程有兩個會在真實流量下爆掉的地方:upload() 先呼叫 store() 把暫存檔搬走,之後才用 getRealPath() 讀位元組;而 Flask 的回應直接以 $res[\'detection\'] 取用,推論服務一旦掛掉或回傳別的東西,使用者拿到的是 undefined index。',
            en: 'The upload path had two failure modes waiting for real traffic: upload() called store(), which moves the temp file, and only afterwards read the bytes via getRealPath(); and the Flask response was indexed straight as $res[\'detection\'], so a detector that was down or answered differently surfaced to the user as an undefined index.',
          },
          s: {
            zh: '把讀取位元組與原始檔名提前到 store() 之前,並在原地留下註解說明為什麼順序不能換;Flask 回應改成先檢查 ->ok() 再檢查 detection 欄位存在,兩種失敗各自回 502。同時把 checkAction() 從隱含回傳改成明確回傳布林,並修掉 401 訊息把 "token invalid" 寫成 "token is valid" 的錯字。',
            en: 'Moved reading the bytes and the original filename ahead of store(), with an in-place comment on why the order cannot be swapped; the Flask response is now checked with ->ok() and then for the presence of the detection key, each failure returning its own 502. In the same pass checkAction() went from an implicit return to a real boolean, and the 401 message that read “token is valid” was corrected to “token invalid”.',
          },
        },
        {
          c: {
            zh: '準備公開時的檢查翻出一批不該外流的東西:/user/info 直接把 User 模型序列化回去、密碼雜湊跟著出去;忘記密碼流程寫的是 reset_code / reset_expires_at 這兩個 migration 根本沒建的欄位,所以整條流程不可能成功;updateUser() 會把 account 覆寫成電話號碼,登入識別直接被改掉;MailController 有寫死的 Gmail 帳密,app.py 有寫死的 MySQL 連線資訊。',
            en: 'The pre-publication pass turned up a batch of things that should never leave the machine: /user/info serialized the User model straight back, password hash included; the reset flow wrote reset_code / reset_expires_at, columns no migration creates, so it could never have worked; updateUser() overwrote account with the phone number, silently changing the login identifier; MailController held hardcoded Gmail credentials and app.py hardcoded MySQL connection details.',
          },
          s: {
            zh: '在 User 模型上設 $hidden 擋掉 password 與重設欄位、改用真正存在的 password_reset_code / password_reset_expires_at、刪掉那行覆寫 account 的賦值;SMTP 與 MySQL 連線資訊全部改讀環境變數並附 .env.example(只有佔位值),app.py 的 finally 區塊也補上連線從未建立時的保護。另外把 UserSeeder 補成能真的登入的樣子——原本只產 faker 使用者、account 是隨機電話,README 宣稱的「種子示範帳號」在當時並不成立。',
            en: 'Added $hidden on the User model for the password and reset fields, switched to the columns that actually exist (password_reset_code / password_reset_expires_at), and deleted the line overwriting account; SMTP and MySQL settings now come from environment variables with a placeholder-only .env.example, and app.py’s finally block was guarded against a connection that never opened. UserSeeder was also fixed so someone can actually sign in — it previously created only faker users whose account was a random phone number, meaning the README’s “seeded demo users” claim was not true at the time.',
          },
        },
        {
          c: {
            zh: '要讓這個專案能公開展示,但推論根本跑不起來:權重檔不在 repo 裡,Flask 服務也需要一台會裝 Python 與 Ultralytics 的機器。最省事的做法是在瀏覽器裡假裝有模型。',
            en: 'The project needed to be publicly demonstrable while inference simply could not run: the weights are not in the repo and the Flask service needs a machine with Python and Ultralytics. The easy move would have been to fake a model in the browser.',
          },
          s: {
            zh: '選擇不假裝。資料轉接層加一個 demo 分支,讀的是 seed 裡寫死的正規化座標,並在畫面上把這件事講清楚:標題列掛「展示模式」標籤、上傳區直接寫「展示模式會以模擬結果呈現」。場景圖也不用照片——SceneImage.jsx 以 CSS 漸層畫出工地感的底,再把框疊上去,所以畫面上不會出現任何冒充成真實推論結果的東西。真正被測試涵蓋的是這一層:34 個 vitest 案例把 demo 分支釘住,包含「合規的場景不得捏造出標註圖檔名」與「新紀錄的 id 不得和種子撞號」。',
            en: 'Chose not to fake it. The data adapter gained a demo branch that resolves fixed normalized coordinates out of the seed, and the UI says so out loud: a “demo mode” pill in the header and “demo mode shows simulated results” on the upload zone. The scenes are not photographs either — SceneImage.jsx paints a worksite-ish CSS gradient and overlays the boxes, so nothing on screen impersonates a real inference result. That layer is what the tests actually cover: 34 vitest cases pin the demo branch down, including “a compliant scene must not fabricate an annotated filename” and “new ids must never collide with the seed”.',
          },
        },
      ],
      facts: [
        { value: '3', label: { zh: '服務(Lumen · Flask · React)', en: 'services (Lumen · Flask · React)' } },
        { value: '12', label: { zh: 'API 端點(另 1 條根路由)', en: 'API endpoints (plus 1 root route)' } },
        { value: '8', label: { zh: 'MySQL 資料表', en: 'MySQL tables' } },
        { value: '34', label: { zh: '前端測試(vitest 實跑通過)', en: 'frontend tests (vitest, all passing)' } },
      ],
      lessons: [
        {
          zh: '「偵測到違規」和「有人會知道」是兩件事。這套系統把安全帽違規完整記錄、可查、可複核,但整個後端沒有任何佇列、排程或通知——唯一一條對外送信的路徑是忘記密碼。它是一個稽核紀錄工具,不是即時告警系統;把這條界線講清楚,比暗示它會叫人有用得多。',
          en: '“A violation was detected” and “somebody will know” are two different claims. This system records helmet violations completely, queryably and reviewably — but the backend has no queue, no scheduler and no notification of any kind; its only outbound mail path is password reset. It is an inspection-record tool, not a realtime alerting system, and saying where that line sits is more useful than implying it will page someone.',
        },
        {
          zh: 'README 不是證據。這個 repo 的 README 寫著有種子示範帳號,而 UserSeeder 只產隨機電話當帳號的 faker 使用者,誰都登不進去;模型的表名、欄位名同樣和 migration 對不上。這輪所有修復的依據都是「哪一行讀哪一個欄位」,而不是文件怎麼說——文件說得通的系統,不代表跑得起來。',
          en: 'A README is not evidence. This one advertised seeded demo accounts while UserSeeder produced only faker users whose account was a random phone number, so nobody could sign in; the models’ table and column names likewise disagreed with the migration. Every fix this round came from tracing which line reads which column, not from what the docs claimed — a system that reads correctly is not the same as a system that runs.',
        },
        {
          zh: '沒有模型也要能展示,但不能假裝有模型。做法是把假的部分做成產品的一個明確模式:demo 分支、畫面上的「展示模式」標籤、CSS 漸層而非照片的場景圖,再用測試把這個分支的行為釘住。誠實標示不會讓 demo 變弱——它讓看的人知道哪些是真的做出來的:UI、資料流、複核流程與響應式版型全是真的,只有推論不是。',
          en: 'Demoing without a model is fine; pretending to have one is not. The answer was to make the simulated part an explicit product mode — a demo branch, a “demo mode” badge on screen, CSS-gradient scenes instead of photographs — and then pin that branch’s behaviour with tests. Labelling it honestly does not weaken the demo; it tells the viewer exactly what was really built: the UI, the data flow, the review workflow and the responsive layout are all real. Only the inference is not.',
        },
      ],
    },
  },
  {
    slug: 'food-selector',
    domain: 'fullstack',
    visibility: 'public',
    title: {
      zh: '耐人尋味 FoodSelector 美食選擇器',
      en: 'FoodSelector — Food Picker',
    },
    oneLiner: {
      zh: 'Lumen(PHP)JWT API 加 React + Vite 前端的美食探索站:先把課堂後端的權限繞過、失效的帳號鎖與壞掉的路由修好,再補上一個不需要 PHP 與資料庫就能完整操作的前端。',
      en: 'A food-discovery site on a Lumen (PHP) JWT API with a React + Vite frontend: first repair the coursework backend’s auth bypass, dead account lock and broken routes, then add a frontend that runs end-to-end with no PHP and no database.',
    },
    scope: { zh: '課堂後端 → 全端重構 · 獨立開發', en: 'Coursework backend → full-stack rebuild · solo' },
    stack: ['PHP', 'LUMEN', 'JWT', 'MYSQL', 'REACT', 'VITE', 'TAILWIND'],
    keyMetric: { value: '25', label: { zh: '後端路由(12 條需權限)', en: 'backend routes (12 permission-guarded)' } },
    links: { repo: 'https://github.com/NameCallBob/FoodSelector' },
    featured: false,
    screenshots: [
      {
        src: '/images/work/food-selector/home.webp',
        alt: {
          zh: '首頁:「今天吃什麼?交給命運決定」主視覺、8 個美食分類、今日推薦店家與人氣必吃',
          en: 'Home page: “what to eat today — let fate decide” hero, eight food categories, featured stores and popular dishes',
        },
        caption: {
          zh: '首頁 — 頂端的展示模式橫幅由 IS_DEMO 控制;這一整頁的分類、店家與菜色都由前端種子檔供應,沒有任何後端在跑',
          en: 'Home — the demo-mode banner is driven by IS_DEMO; every category, store and dish on this page comes from the front-end seed, with no backend running',
        },
      },
      {
        src: '/images/work/food-selector/store-detail.webp',
        alt: {
          zh: '店家頁:封面、評分、介紹、地址營業時間電話、標籤、完整菜單與食客評論',
          en: 'Store page: cover, rating, intro, address/hours/phone, tags, full menu and diner reviews',
        },
        caption: {
          zh: '店家頁 — 介紹、營業資訊與菜單同頁呈現;評論區在 demo 模式讀種子,live 模式則回傳空陣列,因為後端沒有任何路由指向 CommentController',
          en: 'Store page — intro, opening info and menu on one screen; reviews read the seed in demo mode and degrade to an empty array in live mode, because no route in the backend points at CommentController',
        },
      },
      {
        src: '/images/work/food-selector/browse-filters.webp',
        alt: {
          zh: '探索頁套用「燒肉」分類篩選:搜尋列、分類 chip、價格區間,以及菜色 3／店家 1 的計數',
          en: 'Browse page with the “yakiniku” category filter applied: search box, category chips, price range and a 3-dishes / 1-store result count',
        },
        caption: {
          zh: '探索頁套用分類篩選 — 關鍵字、分類、價格上下限對應後端 /search/ 的查詢參數;上方「菜色 3 / 店家 1」是同一組條件下的即時計數',
          en: 'Browse with a category filter — keyword, category and price bounds map onto the backend’s /search/ query parameters; the “3 dishes / 1 store” chips are live counts for the same filter set',
        },
      },
      {
        src: '/images/work/food-selector/random-pick-result.webp',
        alt: {
          zh: '隨機挑選頁在轉盤停下後的結果卡:「就決定是你了!」與被抽中的店家資訊',
          en: 'The random picker after the reel stops: a “this is the one!” result card with the picked store',
        },
        caption: {
          zh: '「幫我決定」轉完後的結果 — 挑選就是從候選池均勻取一筆,沒有個人化也沒有加權;偵測到 prefers-reduced-motion 時會跳過 1.6 秒的轉盤動畫直接給結果',
          en: 'The picker after a real spin — one uniformly random draw from the candidate pool, no personalization and no weighting; under prefers-reduced-motion it skips the 1.6-second reel and reveals the result directly',
        },
      },
      {
        src: '/images/work/food-selector/favorites.webp',
        alt: {
          zh: '口袋名單頁:6 筆已收藏菜色的卡片網格,頁首導覽列帶收藏數量徽章',
          en: 'Favorites page: a grid of six saved dishes, with a count badge on the header nav',
        },
        caption: {
          zh: '口袋名單 — 收藏只寫在瀏覽器的 localStorage(fs_favorites);後端雖然有 collect.create / read / delete 三條權限路由,前端至今一次都沒呼叫過',
          en: 'Favorites — saved items live only in the browser’s localStorage (fs_favorites); the backend does expose collect.create / read / delete behind permissions, but the frontend has never called them',
        },
      },
      {
        src: '/images/work/food-selector/mobile-browse.webp',
        alt: {
          zh: '390px 手機版探索頁:分類 chip 換行、價格區間獨立一列、雙欄卡片與底部固定四格導覽列',
          en: 'Browse page at 390px: wrapped category chips, price range on its own row, a two-column card grid and a fixed four-tab bottom bar',
        },
        caption: {
          zh: '手機版探索頁(390px)— 分類 chip 換行、價格區間獨立成列,並改用 md:hidden 的底部固定導覽;與桌機共用同一組頁面元件,只靠斷點切換',
          en: 'Browse at 390px — chips wrap, the price range gets its own row and navigation switches to a fixed md:hidden bottom bar; the same page components serve both widths, differing only by breakpoint',
        },
      },
    ],
    diagrams: [
      {
        src: '/images/work/food-selector/diagram-auth-sequence.svg',
        alt: {
          zh: 'POST /login 與 GET /collect/ 的時序圖,涵蓋帳號鎖檢查、JWT 簽發與逐路由權限檢查',
          en: 'Sequence diagram of POST /login and GET /collect/, covering the lock check, JWT issuance and the per-route permission check',
        },
        caption: {
          zh: '登入與授權時序 — 左半是 login:先查 locks、再 attempt(),失敗遞增計數、成功清空;右半是受保護路由通過 check.permission:collect.read 的全程。圖上刻意留著一個事實:中介層解過的 token,controller 又獨立解了第二次。',
          en: 'Login and authorization sequence — the left half is login: check locks, then attempt(), increment on failure and clear on success; the right half traces a guarded route through check.permission:collect.read. The figure deliberately keeps one fact visible: the controller decodes the same bearer token a second time, independently of the middleware.',
        },
      },
      {
        src: '/images/work/food-selector/diagram-route-rbac.svg',
        alt: {
          zh: '請求管線與完整路由表:公開路由、buyer 與 seller 兩組受權限保護的路由,以及 401/403 的分岔',
          en: 'Request pipeline and full route table: public routes, the buyer and seller permission-guarded groups, and the 401/403 branches',
        },
        caption: {
          zh: '請求管線與路由表 — 25 條路由中 13 條公開、12 條掛 check.permission:<action>;buyer / seller 的分組不是我畫上去的,兩個角色名與權限切分直接取自 RoleSeeder,每個權限字串都能在 PermissionsSeeder 找到對應列。',
          en: 'Request pipeline and route table — 13 of the 25 routes are public and 12 carry check.permission:<action>; the buyer/seller grouping is not an editorial choice: both role names and the permission split come straight from RoleSeeder, and every permission string has a matching row in PermissionsSeeder.',
        },
      },
      {
        src: '/images/work/food-selector/diagram-lock-state.svg',
        alt: {
          zh: 'locks 資料表的帳號鎖定狀態機:未建列、未鎖定、已鎖定三個狀態與其轉移條件',
          en: 'Account-lock state machine over the locks table: no row yet, unlocked and locked, with the transitions between them',
        },
        caption: {
          zh: '帳號鎖定狀態機 — 兩個容易被說錯的細節都畫在圖上:checklock() 跑在 attempt() 之前,計數必須已經是 5,所以鎖其實在第 6 次嘗試才跳;而離開鎖定的唯一出口是用兩題安全問題重設密碼——沒有管理員解鎖、沒有 TTL、沒有排程任務。',
          en: 'Account-lock state machine — the two details most easily misstated are drawn in: checklock() runs before attempt(), so the counter must already sit at 5, meaning the lock trips on the sixth try; and the only exit from Locked is a security-question password reset — no admin unlock, no TTL, no scheduled job.',
        },
      },
      {
        src: '/images/work/food-selector/diagram-discovery.svg',
        alt: {
          zh: '探索、隨機挑選與人氣統計的資料路徑,含買家端公開路由與賣家端受權限路由',
          en: 'Data paths for discovery, random picking and popularity stats, split into public buyer routes and guarded seller routes',
        },
        caption: {
          zh: '探索與挑選路徑 — 這張圖最有價值的是右下角的註記:所謂「推薦」就是 inRandomOrder()->limit(4),沒有使用者歷史、沒有加權、沒有 ML、沒有快取;而 look / collect 累積出來的人氣資料只回流到兩條賣家路由,從來沒有進入買家的挑選路徑。',
          en: 'Discovery and picking paths — the most valuable part is the note bottom-right: the “recommendation” is inRandomOrder()->limit(4) — no user history, no weighting, no ML, no cache. And the popularity data that look/collect accumulate flows back only into two seller-facing routes; it never reaches the buyer’s picker.',
        },
      },
      {
        src: '/images/work/food-selector/diagram-erd.svg',
        alt: {
          zh: '14 張資料表的 ERD:帳號(private/member/store)、RBAC 四表、商品與店家、locks、look 與 collect',
          en: 'ERD of 14 tables: accounts (private/member/store), the four RBAC tables, products and stores, locks, look and collect',
        },
        caption: {
          zh: '資料模型(14 張表,全部來自 5 個 migration)— 除了 private / member / store 三分的帳號結構與 roles×permissions 的 RBAC 四表,圖上也標出幾件實情:member.safe_ans1/2 是明文存放、user_roles 沒有唯一約束而中介層只讀第一列、comment 表有欄位也有 controller,卻沒有任何路由指得到它。',
          en: 'The data model (14 tables, all from five migrations) — beyond the three-way private/member/store account split and the four RBAC tables, the figure annotates a few realities: member.safe_ans1/2 are stored in plaintext, user_roles has no unique constraint while the middleware reads only the first row, and the comment table has columns and a controller but no route that reaches it.',
        },
      },
    ],
    caseStudy: {
      problem: [
        {
          zh: '「等一下」「隨便」「都可以」是聚餐時最沒效率的三句話。這個專案把餐廳資料拉到菜色層級(單品、價格、分類、人氣),讓人可以搜尋、篩選,再用一顆「幫我決定」的按鈕直接抽一家或一道。後端是 2024 年的課堂專案——一套 Lumen(PHP)的 JWT API;2026 年這一輪的工作是把它重新整理成能拿出來看的作品:先修掉後端確實壞掉的部分,再補上原本完全不存在的前端。',
          en: '“Hang on”, “whatever”, “anything’s fine” — the three least useful sentences at any group meal. This project pushes restaurant data down to dish level (item, price, category, popularity) so it can be searched and filtered, then adds a single “decide for me” button that draws a store or a dish. The backend is a 2024 coursework project — a Lumen (PHP) JWT API; this 2026 round was about making it presentable: fix what was genuinely broken in the backend, then build the frontend that never existed.',
        },
        {
          zh: '先把話說清楚:這個「幫我決定」不是推薦系統。整個挑選邏輯是一個 22 行的 RandomController,兩個方法各自 inRandomOrder()->limit(4)——翻成 SQL 就是 ORDER BY RAND() LIMIT 4。沒有個人化、沒有加權、沒有 ML。有趣的工程不在那裡,而在 JWT 認證與帳號鎖、逐路由的 RBAC,以及讓同一份前端能同時對種子資料與真實 API 運作的 adapter。',
          en: 'To be clear up front: “decide for me” is not a recommender. The entire picking logic is a 22-line RandomController whose two methods each call inRandomOrder()->limit(4) — ORDER BY RAND() LIMIT 4 in SQL. No personalization, no weighting, no ML. The engineering worth talking about is elsewhere: JWT auth with account locking, per-route RBAC, and the adapter that lets one frontend run against either seed data or the real API.',
        },
      ],
      constraints: [
        {
          zh: '後端是既有的課堂程式碼:這一輪只修「確定壞掉」的地方(權限繞過、失效的鎖、註解掉的路由、seeder 建不出角色),不重寫架構,也不追加新功能。',
          en: 'The backend is existing coursework code: this round only repaired what was demonstrably broken — the auth bypass, the dead lock, commented-out routes, a seeder that created no roles — without rewriting the architecture or adding features.',
        },
        {
          zh: '本機沒有 PHP 與 Composer,後端從頭到尾沒有啟動過。所有後端結論都追溯到原始碼行號;新寫的 PHPUnit 路由測試是「寫好了」而不是「跑過了」,這點如實記錄,不冒充驗證結果。',
          en: 'No PHP or Composer on this machine — the backend was never booted. Every backend claim traces to a source line; the new PHPUnit route tests are written, not run, and that is stated as-is rather than passed off as a verified result.',
        },
        {
          zh: '前端要能靜態部署(GitHub Actions → GitHub Pages)並在完全沒有後端的情況下完整操作,所以資料層必須可切換,而不是硬接 API 網址。',
          en: 'The frontend has to deploy statically (GitHub Actions → GitHub Pages) and be fully usable with no backend at all, so the data layer had to be switchable rather than hard-wired to an API host.',
        },
      ],
      architecture: [
        {
          zh: '後端:PHP 8.1 / Lumen 10 + Eloquent + tymon/jwt-auth 2,MySQL。routes/web.php 註冊 25 條路由——13 條公開(登入、忘記密碼、分類、店家、商品、搜尋、兩條隨機、照片),12 條掛 check.permission:<action>。RBAC 用 roles / permissions / role_permissions / user_roles 四張表建模,12 個權限字串切成 buyer(收藏三動作)與 seller(店家資訊與商品 CRUD 九動作)。資料層是 5 個 migration 建出的 14 張表。AuthMiddleware 同時是全域中介層(沒帶權限參數就直接放行)與 check.permission 別名的實作。',
          en: 'Backend: PHP 8.1 / Lumen 10 with Eloquent and tymon/jwt-auth 2 on MySQL. routes/web.php registers 25 routes — 13 public (login, forgot-password, categories, stores, products, search, the two pickers, photos) and 12 behind check.permission:<action>. RBAC is modeled across four tables (roles, permissions, role_permissions, user_roles), with 12 permission strings split into buyer (three favourite actions) and seller (nine store-info and product-CRUD actions). Persistence is 14 tables from five migrations. AuthMiddleware doubles as the global middleware (pass through when no permission argument is given) and as the implementation behind the check.permission alias.',
        },
        {
          zh: '前端:React 18 + Vite 6 + Tailwind v4,自製的 shadcn 風格元件,24 個 .js/.jsx 檔約 2,300 行、7 條路由(首頁、探索、店家、隨機、口袋名單、登入、404)。核心是一層 data adapter:12 個匯出函式,依 VITE_API_MODE 走 demo(讀本地種子)或 live(fetch Lumen API),兩條分支回傳完全相同的資料形狀。種子檔提供 8 個分類、8 家店、26 道菜、6 則評論;口袋名單以 localStorage 保存。測試是 39 個 Vitest 案例(實跑通過),CI 有兩條 GitHub Actions:測試+建置,以及 demo 模式的 Pages 部署。',
          en: 'Frontend: React 18 + Vite 6 + Tailwind v4 with hand-rolled shadcn-style primitives — 24 .js/.jsx source files, ~2,300 lines, seven routes (home, browse, store, random, favorites, login, 404). At its centre is a data adapter: 12 exported functions that follow VITE_API_MODE into either demo (local seed) or live (fetch against the Lumen API), with both branches returning identical shapes. The seed supplies 8 categories, 8 stores, 26 dishes and 6 reviews; favorites persist in localStorage. Tests are 39 Vitest cases (run, passing), and CI is two GitHub Actions workflows: test + build, and a demo-mode Pages deploy.',
        },
      ],
      responsibilities: [
        {
          zh: '整個 repo 的 38 個 commit 都出自我(三組 git 身分同屬一人):2024 年 6 月的 20 個 commit 是課堂期的 Lumen 後端;2026 年 7 月與 8 月的 18 個 commit 是這一輪重構——前端從零建置、後端的權限與資料層修復、前後端測試、CI/Pages 工作流與 README。',
          en: 'All 38 commits in the repo are mine (three git identities, one person): 20 commits in June 2024 built the Lumen backend during coursework; the 18 commits in July and August 2026 are this rebuild — the frontend from scratch, the backend permission and data-layer repairs, tests on both sides, the CI/Pages workflows and the README.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '權限中介層有一個靜默的繞過:hasPermission() 在 token 無效時 return response()->json([...], 401),而呼叫端只把它當布林判斷——JsonResponse 物件恆為真,於是「沒帶 token」和「帶壞 token」都會直接通過 12 條受保護路由。',
            en: 'The permission middleware had a silent bypass: on an invalid token, hasPermission() returned response()->json([...], 401), while the caller treated the return value as a boolean — a JsonResponse object is always truthy, so both a missing and a malformed token sailed through all 12 guarded routes.',
          },
          s: {
            zh: '把認證與授權拆開:先 verifyToken() 取回 private id,失敗直接 401;拿到 id 才進 hasPermission(),它現在只回傳純布林,失敗回 403。並補上路由層的 PHPUnit 測試,逐條斷言那 12 條路由掛著正確的 check.permission:<action>、公開路由則不得帶任何權限中介層——測試已寫好,但因為本機沒有 PHP 而尚未實跑。',
            en: 'Split authentication from authorization: verifyToken() resolves the private id first and returns 401 on failure; only then does hasPermission() run, now returning a real boolean and yielding 403. Route-level PHPUnit tests were added to assert each of the 12 guarded routes carries the right check.permission:<action> and that public routes carry none — written, but not yet executed, since this machine has no PHP.',
          },
        },
        {
          c: {
            zh: '帳號鎖定看起來做完了,實際上從未生效過:locks.status 是字串欄位,程式卻用 === 1 這個型別嚴格的整數比較,永遠為假;而且 add() 建立新列時根本沒寫入 status。',
            en: 'The account lock looked finished but had never once engaged: locks.status is a string column, yet the code compared it with === 1 — a strict integer comparison that is always false — and add() never wrote status when creating a row.',
          },
          s: {
            zh: '改成與 \'1\' 字串比較,並讓 add() 明確寫入 \'0\'。修好之後,把真實行為畫成狀態機而不是寫成宣傳詞:因為 checklock() 跑在 attempt() 之前,計數必須已達 5,鎖是在第 6 次嘗試才跳;離開鎖定的唯一路徑是答對兩題安全問題重設密碼,沒有管理員解鎖、沒有 TTL、也沒有排程任務。',
            en: 'Compare against the string \'1\', and have add() write \'0\' explicitly. With that fixed, the real behaviour was drawn as a state machine rather than written as a claim: because checklock() runs before attempt(), the counter must already be 5, so the lock trips on the sixth try; and the only way out of Locked is answering both security questions to reset the password — no admin unlock, no TTL, no scheduled job.',
          },
        },
        {
          c: {
            zh: 'RBAC 有四張表、有中介層、有權限字串,卻不可能通過:RoleSeeder 其實是 PermissionsSeeder 的複製品,一個角色都沒有建立,也沒有寫入 role_permissions 與 user_roles——所以每一條受權限保護的路由都必然 403。',
            en: 'RBAC had four tables, a middleware and permission strings, and still could not pass: RoleSeeder was a copy of PermissionsSeeder — it created no roles and wrote neither role_permissions nor user_roles, so every guarded route was guaranteed to 403.',
          },
          s: {
            zh: '重寫 RoleSeeder:建立 buyer / seller 兩個角色,依 action_name 查出 permission id 對映 role_permissions,再指派 user_roles,並補上買家的 member 列;DatabaseSeeder 改成外鍵安全的順序。另外補回一個從來沒有 migration 建立過的 collect 表——收藏功能所依賴的表其實不存在。這些修復目前只有原始碼佐證,沒有實跑遷移與 seeder 的紀錄。',
            en: 'Rewrote RoleSeeder: create the buyer and seller roles, resolve permission ids by action_name into role_permissions, assign user_roles, and seed the buyers’ member rows; DatabaseSeeder now runs in FK-safe order. Also added the collect migration that never existed — the table the favourites feature depends on was simply absent. These repairs rest on source evidence only; there is no record of the migrations and seeders actually being run.',
          },
        },
        {
          c: {
            zh: '要在沒有 PHP、沒有 MySQL 的環境裡把整個產品操作一遍——不論是 GitHub Pages 上的展示,還是自己開發前端時。',
            en: 'The whole product had to be operable with no PHP and no MySQL — both for a GitHub Pages demo and for developing the frontend at all.',
          },
          s: {
            zh: '所有資料存取收斂成一層 adapter(12 個匯出函式),以 VITE_API_MODE 切換 demo / live,兩條分支回傳同樣的形狀;demo 分支連後端的怪癖都照抄(/product/info/{id}/ 回傳單元素陣列),日後切回 live 不必動元件。39 個 Vitest 案例大多是在守這層。但 parity 並不完美,而且是已知的:demo 分支會過濾 products.status === 1(種子 26 道菜、上架 25 道,所以畫面顯示「菜色 25」),真實後端的 /search/ 與兩條隨機路由都沒有這個條件;前端向 adapter 要 8 家店 / 12 道菜當候選池,live 模式卻永遠只會拿到後端固定的 4 筆。這些落差列在已知問題,而不是假裝不存在;而且不只這兩處——demo 的搜尋還會比對描述欄,後端則只比對名稱。',
            en: 'All data access converges into one adapter (12 exported functions) switched by VITE_API_MODE, with both branches returning the same shapes; the demo branch even reproduces the backend’s quirks (/product/info/{id}/ returns a one-element array) so switching to live needs no component changes. Most of the 39 Vitest cases guard that layer. Parity is not perfect, and knowingly so: the demo branch filters products.status === 1 (26 seeded dishes, 25 listed — hence the “25 dishes” chip on screen) while the real /search/ and both pickers apply no such predicate; and the picker asks the adapter for a pool of 8 stores / 12 dishes, but in live mode the backend always returns exactly 4. These are tracked as known issues rather than papered over — and they are not the only ones: the demo search also matches on description where the backend matches on name alone.',
          },
        },
      ],
      facts: [
        { value: '25', label: { zh: '後端路由(12 條需權限)', en: 'backend routes (12 permission-guarded)' } },
        { value: '14', label: { zh: '資料表(5 個 migration)', en: 'tables (5 migrations)' } },
        { value: '39', label: { zh: '前端 Vitest 案例', en: 'frontend Vitest cases' } },
        { value: '22', label: { zh: '行:整個隨機挑選器', en: 'lines: the entire picker' } },
      ],
      lessons: [
        {
          zh: '「有寫」不等於「有生效」。權限檢查和帳號鎖在原本的程式碼裡都存在、讀起來也合理,但一個把 JsonResponse 當布林、一個用 === 1 去比字串欄位——兩個安全機制都是靜默失效,沒有任何錯誤訊息。這一輪讓它們現形的不是重讀程式碼,是把路由表寫成斷言、把鎖的生命週期畫成狀態機。',
          en: 'Written is not the same as working. Both the permission check and the account lock existed and read plausibly, but one treated a JsonResponse as a boolean and the other compared a string column with === 1 — two security mechanisms failing silently, with no error anywhere. What exposed them was not re-reading the code: it was turning the route table into assertions and the lock’s lifecycle into a state machine.',
        },
        {
          zh: '不要把隨機說成推薦。這個產品的賣點是「幫我決定」,實作卻只是 ORDER BY RAND() LIMIT 4。更值得注意的是,系統其實已經在累積瀏覽(look)與收藏(collect)資料,只是那些數字只回流到賣家端的兩條路由,從沒進入買家的挑選路徑——要升級成真正的推薦,缺的不是資料,是把既有的訊號接進去。',
          en: 'Do not call random a recommendation. The product’s pitch is “decide for me”, and the implementation is ORDER BY RAND() LIMIT 4. What is more telling is that the system already accumulates view (look) and favourite (collect) data — those numbers just flow back into two seller-facing routes and never reach the buyer’s picker. Turning this into a real recommender does not need more data; it needs the existing signal wired in.',
        },
        {
          zh: '讓 demo 與 live 共用同一組函式簽名,是這輪投資報酬率最高的決定——前端因此能離線開發、靜態部署、也能隨時切回真後端。但兩條分支的行為會慢慢分岔(status 過濾、候選池大小),而且沒有任何測試在守這件事。下一次會先寫一組跨模式的契約測試,再開始長功能。',
          en: 'Making demo and live share one set of function signatures was the highest-return decision of this round — the frontend can be developed offline, deployed statically, and switched back to the real backend at any time. But the two branches drift (the status filter, the pool size), and nothing tests for it. Next time the cross-mode contract tests come first, before any features are stacked on top.',
        },
      ],
    },
  },
];
