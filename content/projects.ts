/**
 * Project content — single source of truth for /work, home §01,
 * JSON-LD, and sitemap.
 *
 * 內容原則:全部欄位來自 2026-07-17 對各 repo 的程式碼與 git 歷史分析
 * (docs/content-request.md 規格),每個數字皆可重跑指令驗證;
 * 語氣為「可信地陳述經驗」——不誇大、未上線就寫未上線、沒有數據就不寫。
 * hris、ai-nail-platform、naily-app、microservices-platform 為公司內部專案:
 * 不揭露網域、內網位址、內部人員與現存弱點的重現細節。
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
          zh: '模組化單體:Django 4.2 + DRF 依領域切成 36 個功能 app(出勤、排班、薪資、簽核、招募、資產、勞健保⋯),約 215 個資料模型、188 個資源路由,展開後在驗收中實測了 728 個端點。刻意不拆微服務——薪資與簽核這類跨模組流程在單一交易邊界裡簡單得多。',
          en: 'A modular monolith: Django 4.2 + DRF split into 36 domain apps (attendance, scheduling, payroll, approvals, recruiting, assets, labor insurance…), with ~215 models and 188 registered resource routes — 728 concrete endpoints exercised during acceptance. Deliberately not microservices: payroll and approval flows are far simpler inside one transaction boundary.',
        },
        {
          zh: '多租戶採 shared-schema、row-level 隔離:middleware 解析租戶,304 個類別繼承租戶感知基底。非同步層以 Celery + Beat 處理班表產生、出勤歸檔與法規/假日同步;Redis 作快取與 Channel;資料庫可依環境切換 PostgreSQL 或 MySQL;CI 用 GitHub Actions + pre-commit,並附 Prometheus / Grafana / Loki 可觀測性編排。',
          en: 'Multi-tenancy is shared-schema with row-level isolation: middleware resolves the tenant and 304 classes inherit the tenant-aware base. Async work runs on Celery + Beat — shift generation, attendance archiving, holiday/regulation sync; Redis backs cache and channels; the database switches between PostgreSQL and MySQL per environment. CI runs on GitHub Actions with pre-commit, plus a Prometheus / Grafana / Loki observability stack.',
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
            zh: '資安稽核發現:部分自訂 API action 繞過了租戶過濾,可跨租戶操作帳號。',
            en: 'A security audit found custom API actions bypassing tenant filtering — accounts could be manipulated across tenants.',
          },
          s: {
            zh: '把隔離下沉到基底(TenantAwareModel + middleware 統一解析),逐一修補繞過 queryset 的 action。該輪稽核共 35 項發現(含 2 項 Critical)全數確認,30 項修復完成、5 項部分修復,尚待 staging 環境複驗——這個狀態如實記錄。',
            en: 'Isolation was pushed into the base layer (TenantAwareModel plus middleware-resolved context) and every queryset-bypassing action patched. The audit confirmed 35 findings (2 critical); 30 are fixed and 5 partially — pending staging re-verification, recorded as-is.',
          },
        },
        {
          c: {
            zh: '薪資 API 的快取鍵沒有包含使用者身分——同一個 TTL 窗內,一般員工可能命中管理員的快取,看到全公司薪資。',
            en: "The payroll API's cache key ignored user identity — within one TTL window, an employee could hit an admin's cached response and see company-wide salaries.",
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
        { value: '215', label: { zh: '資料模型', en: 'data models' } },
        { value: '728', label: { zh: '端點實測', en: 'endpoints tested' } },
        { value: '87.5%', label: { zh: '驗收通過率', en: 'acceptance pass rate' } },
      ],
      lessons: [
        {
          zh: '快取設計就是權限設計——薪資快取洩漏的根因,是快取鍵少了身分維度。在多租戶系統裡,這種錯誤不是效能問題,是資料外洩。',
          en: 'Cache design is authorization design: the payroll leak came from a cache key missing the identity dimension. In a multi-tenant system that class of bug is not a performance issue — it is a breach.',
        },
        {
          zh: '系統性的漏洞往往來自模型設計:全域角色與租戶角色雙軌並存,連帶引發提權與跨租戶問題。重來一次,我會從第一天就統一以租戶維度設計權限。',
          en: 'Systemic vulnerabilities trace back to model design: dual global-vs-tenant role tracks caused the privilege and cross-tenant issues. Doing it again, I would design permissions on the tenant dimension from day one.',
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
          zh: '營運後台前端的主要開發,以及平台後端(Django)API 的設計與開發。',
          en: 'Primary development of the ops console frontend, plus backend (Django) API design and development on the platform.',
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
      zh: 'Flutter 電商 App:裝置端 AI 指甲辨識、AR 試戴與客製穿戴甲。2025 年 11 月起由我接手全部開發與維護。',
      en: 'A Flutter commerce app — on-device AI nail sizing, AR try-on and custom press-ons. I took over all development and maintenance in November 2025.',
    },
    scope: { zh: '上架準備 · 2025.11 起接手', en: 'Pre-launch · takeover since 2025.11' },
    stack: ['FLUTTER', 'ONNX', 'FIREBASE', 'ECPAY'],
    keyMetric: { value: '82', label: { zh: '畫面', en: 'screens' } },
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
          zh: 'AI 推論必須在裝置端執行,受手機算力限制——接手時的 AR 試戴只有 1 FPS。',
          en: 'AI inference must run on-device within phone-level compute — at handover, AR try-on ran at 1 FPS.',
        },
        {
          zh: '涉及金流與個資:token 只能放 secure storage、日誌不得記錄完整 request body、iOS 需處理 ATT 追蹤同意;目前處於上架準備階段(P0–P2 上架就緒稽核修復中)。',
          en: 'Payments and personal data are involved: tokens live in secure storage only, logs must not capture full request bodies, iOS requires ATT consent. The app is in pre-launch readiness (P0–P2 audit fixes).',
        },
      ],
      architecture: [
        {
          zh: 'Flutter 模組化單體:feature-first 分層(config / models / services / screens),GoRouter 宣告式導航——82 個畫面、72 個 service、44 個 model,共 533 個 Dart 檔、約 12.9 萬行,呼叫後端 123 個 API 端點。',
          en: 'A modular Flutter app: feature-first layering (config / models / services / screens) with declarative GoRouter navigation — 82 screens, 72 services, 44 models across 533 Dart files (~129k lines), talking to 123 backend API endpoints.',
        },
        {
          zh: '裝置端 AI 拆成 6 個職責分離的 AR/CV 套件,以 ONNX Runtime 執行 4 個模型(YOLO11 指甲偵測/分割、手掌關節點),iOS 另以 platform channel 銜接原生 CoreML。商務面整合 ECPay 金流/物流/電子發票與四家社交登入;Firebase 負責推播、Crashlytics 與分析;CI 有三條 pipeline(兩階段 CI、夜間全量 E2E、tag 觸發簽署發版)。',
          en: 'On-device AI is split into six single-purpose AR/CV packages running four ONNX models (YOLO11 nail detection/segmentation, hand landmarks), with an iOS platform channel to native CoreML. Commerce integrates ECPay payments/logistics/e-invoicing and four social logins; Firebase covers push, Crashlytics and analytics; CI runs three pipelines — staged CI, nightly full E2E, and tag-triggered signed releases.',
        },
      ],
      responsibilities: [
        {
          zh: '2025 年 11 月接手;此前的基礎架構與商城流程由原團隊建置。接手後的開發、維護與發版由我負責(該期間 121 個 commit、占 85%):FCM 與追蹤整合、客製穿戴甲功能、點數系統、AR 架構重寫、iOS CoreML 原生層、安全硬化與 CI/CD。後端 API 為獨立服務,不在此 repo 範圍。',
          en: 'Took over in November 2025; the foundation and commerce flows were built by the original team. Since then all development, maintenance and releases are mine (121 commits, 85% of the period): FCM and tracking integration, the custom press-on feature, a points system, the AR rewrite, the iOS CoreML native layer, security hardening and CI/CD. The backend API is a separate service outside this repo.',
        },
      ],
      challenges: [
        {
          c: {
            zh: '接手時的 AR 試戴只有 1 FPS,偵測時設計圖還會閃爍漂移。',
            en: 'At handover, AR try-on ran at 1 FPS, with the design overlay flickering and drifting during detection.',
          },
          s: {
            zh: '汰換三代舊實作,重寫為五個職責分離的套件(偵測、渲染、傳統 CV、遮罩重上色、手動工作室),iOS 改走原生 CoreML 偵測;再加跨幀遲滯消除閃爍。FPS 從 1 提升到即時,核心偵測頁從 3,051 行減到 1,356 行。',
            en: 'Retired three generations of old implementations and rewrote it as five single-purpose packages (detection, rendering, classic CV, mask recolor, manual studio), moving iOS detection to native CoreML, plus cross-frame hysteresis to kill flicker. FPS went from 1 to realtime; the core detection page shrank from 3,051 to 1,356 lines.',
          },
        },
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
    slug: 'nkust-alumni',
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
  },
  {
    slug: 'nkust-borrow',
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
    keyMetric: { value: '1,112', label: { zh: '後端測試函式', en: 'backend tests' } },
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
          zh: 'Django 5 + DRF 模組化單體,依領域切成 13 個 app(borrowing、finance、audit、inventory、kits⋯),27 個資料模型、23 個資源路由加 86 個自訂 action;前端 React 19 + Ant Design,40 個頁面。JWT 放 HttpOnly cookie 並做 refresh rotation 與 blacklist;RBAC 以 Role/Capability 建模。',
          en: 'A Django 5 + DRF modular monolith split into 13 domain apps (borrowing, finance, audit, inventory, kits…) — 27 models, 23 resource routes plus 86 custom actions — with a React 19 + Ant Design frontend of 40 pages. JWT lives in HttpOnly cookies with refresh rotation and blacklisting; RBAC is modeled as Roles and Capabilities.',
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
        { value: '1,112', label: { zh: '後端測試函式', en: 'backend test functions' } },
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
