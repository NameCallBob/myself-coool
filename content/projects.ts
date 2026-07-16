/**
 * Project content — single source of truth for /work, home §01,
 * JSON-LD, and sitemap.
 *
 * 內容原則:全部欄位皆來自 2026-07-16 對實際 repo 的程式碼分析,
 * 無捏造數據;「⚠ 待確認」標示需 binbin 核實的描述(主要是角色範圍)。
 * hris、ai-nail-platform、naily-app、microservices-platform 為公司內部專案:
 * 不揭露網域、內部環境細節,亦不揭露任何線上系統的現存弱點;
 * 品牌名稱的揭露範圍由 binbin 決定(目前僅 naily-app 揭露)。
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
          zh: '前後端獨立開發:資料模型與多租戶機制、權限體系、各領域模組(出勤、排班、薪資、簽核⋯)、Celery 背景任務,以及 React 前端。',
          en: 'Independent full-stack development: data models and multi-tenancy, the permission system, domain modules (attendance, scheduling, payroll, approvals…), Celery background jobs, and the React frontend.',
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
    stack: ['AI', 'AR', 'DJANGO', 'REACT', 'B2B'],
    keyMetric: { value: '50+', label: { zh: '業務模組', en: 'business modules' } },
    featured: true,
    // caseStudy 僅涵蓋可公開的營運後台部分;消費者端(AI/AR)待可公開時補上。
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
          zh: '橫切關注全部收斂在單一 Axios 攔截層:JWT 自動附加、401 刷新佇列、403 全域權限廣播、錯誤 toast 去重、json-bigint 處理大數精度。瀏覽器內以 TensorFlow.js 做影像物件辨識,認證支援 WebAuthn/Passkey,30+ 個 feature flag 控制功能開關,CI 設有 bundle 體積閘門。',
          en: 'Cross-cutting concerns converge in a single Axios interceptor layer: automatic JWT attachment, a 401 refresh queue, global 403 broadcasting, deduped error toasts, and json-bigint for numeric precision. In-browser object detection runs on TensorFlow.js, auth supports WebAuthn/Passkey, 30+ feature flags gate functionality, and CI enforces a bundle-size budget.',
        },
      ],
      responsibilities: [
        {
          zh: '全端開發:營運後台前端的主要開發,以及平台後端(Django)API 的設計與開發。',
          en: 'Full-stack development: primary owner of the ops console frontend, plus backend (Django) API design and development on the platform.',
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
            zh: '快速堆功能的階段過後,留下跨模組的正確性與一致性債。',
            en: 'A fast feature-stacking phase left cross-module correctness and consistency debt.',
          },
          s: {
            zh: '建立編號化的稽核修復流程,分「資料正確性」與「業務流程」兩軌逐項清償,並以 conventional commits 追蹤——已完成 21 項系統性修復。',
            en: 'Set up a numbered audit-and-fix process with two tracks — data correctness and business flow — paying items down one by one under conventional commits; 21 systematic fixes landed.',
          },
        },
      ],
      facts: [
        { value: '50+', label: { zh: '業務模組', en: 'business modules' } },
        { value: '~600k', label: { zh: '前端程式碼行數', en: 'lines of frontend code' } },
        { value: '1,951', label: { zh: 'API 呼叫點', en: 'API call sites' } },
        { value: '30+', label: { zh: 'Feature Flags', en: 'feature flags' } },
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
      ],
    },
  },
  {
    slug: 'naily-app',
    title: { zh: 'Naily — AI 美甲電商 App', en: 'Naily — AI Nail Commerce App' },
    oneLiner: {
      zh: 'Flutter 電商 App:裝置端 AI 指甲辨識、客製穿戴甲設計、完整金物流。上述平台的消費者端。',
      en: 'A Flutter commerce app — on-device AI nail sizing, custom press-on design, full payment and logistics. The consumer face of the platform above.',
    },
    scope: { zh: '2025.11 起獨立接手維護', en: 'Sole maintainer since 2025.11' },
    stack: ['FLUTTER', 'ONNX', 'FIREBASE', 'ECPAY'],
    keyMetric: { value: '82', label: { zh: '畫面', en: 'screens' } },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '消費者要在手機上完成「量指甲 → 客製設計 → 下單收貨」的完整旅程:以裝置端 AI 辨識指甲尺寸、3 步驟客製穿戴甲設計,加上電商必備的金流(信用卡、超商、定期定額)與物流(宅配、超商取貨)、推播、深連結與會員體系。',
          en: 'Consumers complete the whole journey on their phone — measure nails, design custom press-ons, order and receive: on-device AI nail sizing, a 3-step designer, plus the commerce essentials of payments (cards, convenience-store codes, subscriptions), logistics (home delivery, CVS pickup), push, deep links and membership.',
        },
      ],
      constraints: [
        {
          zh: '多人共同開發的 codebase,2025 年 11 月之後由我一人接手全部開發與維護。',
          en: 'A codebase built by multiple developers — fully handed over to me in November 2025.',
        },
        {
          zh: 'AI 推論必須在裝置端執行(隱私與體驗),中低階手機也要順。',
          en: 'AI inference must run on-device (privacy and UX) — and stay smooth on mid-range phones.',
        },
        {
          zh: '已上線營運的商業 App:每個改動都面對真實使用者與真實金流。',
          en: 'A live commercial app: every change faces real users and real money.',
        },
      ],
      architecture: [
        {
          zh: 'Flutter feature-first 分層(config / models / services / screens⋯),go_router 宣告式導航,不用 DI 框架、以 service singleton 收斂依賴——82 個畫面、約 70 個 service、533 個 Dart 檔、約 12.9 萬行。',
          en: 'Feature-first Flutter layering (config / models / services / screens…), declarative navigation with go_router, no DI framework — dependencies converge on service singletons. 82 screens, ~70 services, 533 Dart files, ~129k lines.',
        },
        {
          zh: '裝置端 AI 自成子套件:ONNX Runtime 執行 YOLO11 指甲偵測/分割與手掌關節點模型,iOS 以 platform channel 銜接 CoreML;AR 試戴與遮罩重上色等 CV 模組獨立封裝。金物流整合 ECPay 與超商取貨,Firebase 負責推播、Crashlytics 與分析,並有憑證釘選與裝置完整性檢查。',
          en: 'On-device AI lives in self-contained sub-packages: ONNX Runtime drives YOLO11 nail detection/segmentation and hand-landmark models, with an iOS platform channel bridging to CoreML; AR try-on and mask-recolor CV modules are isolated. Commerce integrates ECPay and CVS pickup; Firebase handles push, Crashlytics and analytics, hardened with certificate pinning and device-integrity checks.',
        },
      ],
      responsibilities: [
        {
          zh: '2025/11 前參與共同開發;之後獨立承接全部開發、維護與發版——包含 CI、nightly E2E 與 release pipeline。',
          en: 'Co-developed until 2025/11; since then the sole owner of all development, maintenance and releases — including CI, nightly E2E and the release pipeline.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '接手多人寫的 12 萬行 codebase,沒有交接期的奢侈。',
            en: 'Inheriting a 120k-line multi-author codebase, without the luxury of a handover period.',
          },
          s: {
            zh: '先立規矩再動手:把慣例明文化(統一 AppConfig / AppLogger / CacheService、畫面檔 800 行上限、僅 GoRouter 導航),再以編號化稽核(P0–P2)逐項清償正確性與品質債。',
            en: 'Rules before refactors: codify conventions (single AppConfig / AppLogger / CacheService, an 800-line screen cap, GoRouter-only navigation), then pay down correctness and quality debt through a numbered P0–P2 audit.',
          },
        },
        {
          c: {
            zh: '裝置端 AI 要同時做到準、小、快。',
            en: 'On-device AI has to be accurate, small and fast at once.',
          },
          s: {
            zh: 'YOLO11 nano 級模型搭配自建 16KB page-size 的 ONNX Runtime 建置,iOS 走 CoreML platform channel;模型隨 App 內建,離線也能辨識。',
            en: 'Nano-class YOLO11 models on a custom 16KB-page-size ONNX Runtime build, with CoreML via a platform channel on iOS; models ship inside the app and work offline.',
          },
        },
        {
          c: {
            zh: '上線 App 的錯誤處理不能靠運氣。',
            en: "A live app's error handling can't run on luck.",
          },
          s: {
            zh: 'runZonedGuarded、FlutterError.onError 與 PlatformDispatcher.onError 三層全部收斂到 Crashlytics;Firebase 初始化失敗時 App 降級續跑,ErrorWidget 也有自訂 fallback。',
            en: 'Three layers — runZonedGuarded, FlutterError.onError and PlatformDispatcher.onError — all converge on Crashlytics; the app degrades gracefully if Firebase init fails, with a custom ErrorWidget fallback.',
          },
        },
      ],
      facts: [
        { value: '82', label: { zh: '畫面', en: 'screens' } },
        { value: '~129k', label: { zh: 'Dart 行數', en: 'lines of Dart' } },
        { value: '68', label: { zh: '測試檔', en: 'test files' } },
        { value: '2025.11', label: { zh: '起唯一維護者', en: 'sole maintainer since' } },
      ],
      lessons: [
        {
          zh: '接手程式碼的第一步不是重構,是把慣例寫下來——規則明文化之後,每一次修改才會讓系統更一致,而不是更發散。',
          en: 'The first step in a takeover is not refactoring — it is writing the conventions down. Once rules are explicit, every change makes the system more consistent instead of more divergent.',
        },
        {
          zh: '債要列出來才會被還:幾個超過 800 行上限的大畫面被列在待辦清單上,而不是藏起來。有編號的債,才有被清償的一天。',
          en: "Debt gets paid only when it's listed: the screens exceeding the 800-line cap sit on the backlog, not under the rug. Numbered debt is payable debt.",
        },
      ],
    },
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
          zh: '前後端獨立開發與維運:資料模型、API、權限與資安整改、React 前端、部署(nginx)與監控告警。',
          en: 'Independent full-stack development and operations: data models, APIs, security hardening, the React frontend, deployment (nginx) and monitoring.',
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
          zh: '前後端獨立開發:資料模型、API、權限、React 前端、測試策略(單元 + E2E)與部署(nginx + gunicorn + Cloudflare)。',
          en: 'Independent full-stack development: data models, APIs, permissions, the React frontend, test strategy (unit + E2E) and deployment (nginx + gunicorn + Cloudflare).',
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
      zh: '30+ 個 Django 微服務支撐電商、多租戶 POS、B2B、CRM 與線上課程六大業務域,搭配多個 Web 前端與原生 App。',
      en: '30+ Django microservices powering e-commerce, multi-tenant POS, B2B, CRM and online courses — with multiple web frontends and native apps.',
    },
    scope: { zh: '開發中 · 全通路商務', en: 'In development · Omnichannel commerce' },
    stack: ['DJANGO', 'CELERY', 'MYSQL', 'REDIS', 'REACT', 'FLUTTER', 'SWIFT'],
    keyMetric: { value: '30+', label: { zh: '微服務', en: 'microservices' } },
    featured: true,
    caseStudy: {
      problem: [
        {
          zh: '全通路商務不是單一商店:同一批商品與會員,要同時流經 B2C 電商、門市 POS、企業採購(B2B)、業務團隊(CRM + 傭金歸因)與線上課程。平台以 30+ 個 Django 微服務支撐這六大業務域,前端是 4 個 React 應用加 4 個原生行動 App(Flutter、SwiftUI)。',
          en: 'Omnichannel commerce is never one storefront: the same products and members flow through B2C e-commerce, in-store POS, B2B procurement, a sales force (CRM + commission attribution) and online courses. The platform backs these six domains with 30+ Django microservices, fronted by 4 React apps and 4 native mobile apps (Flutter, SwiftUI).',
        },
      ],
      constraints: [
        {
          zh: '公司商業專案,程式碼不公開。',
          en: 'A commercial, closed-source project.',
        },
        {
          zh: '金流、發票、物流全部接真:信用卡、BNPL、電子發票與多家物流商,每一筆交易都是真錢。',
          en: 'Payments, invoicing and logistics are all live — cards, BNPL, e-invoicing and multiple carriers. Every transaction is real money.',
        },
        {
          zh: '兩位主力開發者維護 170 萬行後端:橫切機制必須做成共享庫,而不是 30 份複製。',
          en: 'Two core developers maintain 1.7M lines of backend: cross-cutting concerns must live in a shared library, not thirty copies.',
        },
      ],
      architecture: [
        {
          zh: '每服務一庫:33 個 Django 服務各自擁有獨立的 MySQL schema,共 807 個資料模型;跨服務不建外鍵,只存邏輯參照與下單當下的快照。服務間走同步 REST(共享 client,逾時 + 指數退避),以 RS256 service JWT 互相認證;三個 Redis 實例分工快取、Session 與分散式鎖、Celery 佇列,每服務一個 worker,啟動依核心 → 業務 → 輔助三階段編排。',
          en: 'Database-per-service: 33 Django services each own a MySQL schema — 807 models in total. No cross-service foreign keys; services keep logical references plus point-in-time snapshots. Inter-service calls are synchronous REST (a shared client with timeouts and exponential backoff), mutually authenticated with RS256 service JWTs. Three Redis instances split caching, sessions-and-locks and Celery queues — one worker per service, booted in a three-stage core → business → auxiliary order.',
        },
        {
          zh: 'POS 把多租戶做到實體隔離:每租戶一個獨立資料庫,middleware 做零信任租戶解析,DB router 依 app 動態路由。金流域整合綠界(刷卡、BNPL、電子發票)與多家物流商;通知域涵蓋 134 個郵件模板、四憑證 FCM 推播與 LINE,全部走 Celery 非同步。',
          en: 'POS pushes multi-tenancy to physical isolation: one database per tenant, zero-trust tenant resolution in middleware, and a DB router dispatching per app. The payment domain integrates ECPay (cards, BNPL, e-invoicing) and multiple logistics carriers; notifications span 134 email templates, four-credential FCM push and LINE — all asynchronous via Celery.',
        },
        {
          zh: '前端不是一套打天下:每個 React 應用針對自己的場景做工程——B2B 採購端用伺服器權威報價、冪等鍵結帳與序號化樂觀更新(舊回應與舊回滾都不會倒灌);門市 POS 把收銀熱路徑做成 eager chunk(初始 JS 從 666kB 降到 310kB gz),班別 session 放 sessionStorage,共用收銀機關掉分頁即登出;外勤業務 PWA 以 tesseract.js 做裝置端名片 OCR(影像不出手機)加 GPS 地理圍欄業績歸因。',
          en: 'The frontends are not one-size-fits-all: each React app is engineered for its context — the B2B portal runs server-authoritative quoting, idempotency-key checkout and sequence-numbered optimistic updates (stale responses and stale rollbacks can never clobber state); the in-store POS keeps the checkout hot path in an eager chunk (initial JS cut from 666kB to 310kB gzipped) and holds shift sessions in sessionStorage, so closing the tab logs a shared register out; the field-sales PWA does on-device business-card OCR with tesseract.js (images never leave the phone) plus GPS-geofenced commission attribution.',
        },
      ],
      responsibilities: [
        {
          zh: '兩位主力開發者之一,全端開發:微服務後端(資料模型、API、服務間通訊、Celery 任務)、React 前端與行動端整合,以及每週回歸測試系統與部署工具。',
          en: 'One of two core developers, working full-stack: the microservice backends (models, APIs, inter-service communication, Celery tasks), the React frontends and mobile integration, plus the weekly regression system and deployment tooling.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '多租戶 POS 只要漏一次租戶判斷,就是跨店資料事故。',
            en: 'In a multi-tenant POS, one missed tenant check is a cross-store data incident.',
          },
          s: {
            zh: '零信任租戶解析:header 裡的租戶 ID 只是「聲明」,middleware 以 RS256 公鑰驗簽後,以 JWT 內的租戶 claim 為唯一權威,不符即 403;租戶資料本身落在實體隔離的獨立資料庫。',
            en: "Zero-trust tenant resolution: the tenant ID header is merely a claim — middleware verifies the JWT against the RS256 public key and treats the token's tenant claim as the only authority, rejecting mismatches with 403. Tenant data itself lives in physically separate databases.",
          },
        },
        {
          c: {
            zh: '金流回調是整個平台正確性的咽喉:一筆漏掉或重複,對帳就崩。',
            en: "Payment callbacks are the platform's correctness chokepoint: one lost or duplicated callback breaks reconciliation.",
          },
          s: {
            zh: '下單以商品快照落庫,付款回調通過驗簽後依通路(電商 / B2B / POS)分流同步,交易一律記入不可變(append-only)帳本,通知走 Celery 非同步——退款、發票與對帳都能事後回放。',
            en: 'Orders persist product snapshots at checkout; verified callbacks fan out by channel (e-commerce / B2B / POS); every transaction lands in an append-only ledger, with notifications async on Celery — so refunds, invoices and reconciliation can always be replayed.',
          },
        },
        {
          c: {
            zh: '門市與外勤的網路不可靠,但收銀與開戶不能停。',
            en: "Store and field networks are unreliable — but checkout and onboarding can't stop.",
          },
          s: {
            zh: 'POS 結帳斷線時進本地佇列、連線恢復自動重送(業務錯誤不盲目重試);業務 PWA 以 app-shell Service Worker 加送件佇列支援離線開戶,再用三層機制終結 SPA 換版白屏:舊 chunk 載入失敗自癒重載、資產缺檔回硬 404 而非 HTML、SW 版本化清快取。',
            en: 'POS checkouts queue locally when offline and auto-resend on reconnect (business errors are never blindly retried); the sales PWA pairs an app-shell service worker with a submission queue for offline onboarding — and kills the classic stale-deploy white screen with three layers: self-healing reloads on stale-chunk failures, hard 404s for missing assets instead of HTML fallbacks, and versioned service-worker cache purges.',
          },
        },
        {
          c: {
            zh: '上萬個測試不等於安全網——得先讓測試「可信」。',
            en: "Sixteen thousand tests are not a safety net until you can trust them.",
          },
          s: {
            zh: '建立四層回歸系統:全服務健康閘 → 218 個唯讀端點基線比對 → 掛 DB 安全守衛的 pytest(偵測到測試打向非隔離資料庫立即中止)→ 跨服務真 E2E;每週排程執行,全綠才滾動更新基線。',
            en: 'Built a four-layer regression system: an all-service health gate → baseline comparison across 218 read-only endpoints → pytest behind a DB guard (any test touching a non-isolated database halts the run) → true cross-service E2E. It runs on a weekly schedule, and baselines only roll forward on all-green.',
          },
        },
      ],
      facts: [
        { value: '30+', label: { zh: '微服務', en: 'microservices' } },
        { value: '807', label: { zh: '資料模型', en: 'data models' } },
        { value: '1.7M+', label: { zh: 'Python 行數', en: 'lines of Python' } },
        { value: '16,433', label: { zh: '測試案例', en: 'test cases' } },
      ],
      lessons: [
        {
          zh: '微服務的代價在邊界處支付:沒有跨庫交易,一致性就得用快照、邏輯參照與不可變帳本來換——這些不是 workaround,是這個架構誠實的成本。',
          en: 'Microservices charge their toll at the boundaries: without cross-database transactions, consistency is bought with snapshots, logical references and append-only ledgers — not workarounds, but the honest price of the architecture.',
        },
        {
          zh: '測試先看可信度、再看數量:一個能擋下「打到真實資料庫」的守衛,比一千個綠燈更能保護一次重構。',
          en: 'Trust before volume in testing: one guard that halts a test the moment it touches a real database protects a refactor better than a thousand green checks.',
        },
      ],
    },
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
