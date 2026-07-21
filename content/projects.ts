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
          zh: '橫切關注全部收斂在單一 Axios 攔截層:JWT 自動附加、401 刷新佇列、403 全域權限廣播、錯誤 toast 去重、json-bigint 處理大數精度。瀏覽器內以 TensorFlow.js 做影像物件辨識,認證支援 WebAuthn/Passkey,30+ 個 feature flag 控制功能開關,CI 設有 bundle 體積閘門。',
          en: 'Cross-cutting concerns converge in a single Axios interceptor layer: automatic JWT attachment, a 401 refresh queue, global 403 broadcasting, deduped error toasts, and json-bigint for numeric precision. In-browser object detection runs on TensorFlow.js, auth supports WebAuthn/Passkey, 30+ feature flags gate functionality, and CI enforces a bundle-size budget.',
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
            zh: '一輪涵蓋工作流程、表單、權限、無障礙與效能的企業級稽核,產出 163 筆原始發現;其中最高槓桿的一類,是跨 4 個以上模組重演的「假成功」反模式——表單顯示儲存成功但沒有真正寫進後端、按鈕顯示成功但功能早已被靜默停用。',
            en: 'An enterprise audit across workflows, forms, permissions, accessibility and performance produced 163 raw findings — the highest-leverage class being a “fake success” anti-pattern recurring in four-plus modules: forms toasting success without persisting to the backend, buttons reporting success on silently disabled features.',
          },
          s: {
            zh: '163 筆先去重為 49 筆;21 筆 Critical/High 逐一交叉驗證(21/21 確認為真)後才投入修復,對應 18 個批次的系列 commit——含修正假成功動作、讓 8 個佣金相關檔案改回統一的 errorHandler。其餘 28 筆 Medium/Low 如實列管、未虛報進度。',
            en: 'The 163 were deduplicated to 49; the 21 Critical/High items were each cross-verified (21/21 confirmed real) before any fix, then landed across 18 batched commits — repairing the fake-success actions and returning eight commission files to the unified errorHandler. The remaining 28 Medium/Low findings stay tracked as open, with no progress inflated.',
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
      zh: 'Flutter 電商 App:裝置端 AI 指甲辨識、AR 試戴與客製穿戴甲。2025 年 11 月起由我接手全部開發與維護。',
      en: 'A Flutter commerce app — on-device AI nail sizing, AR try-on and custom press-ons. I took over all development and maintenance in November 2025.',
    },
    scope: { zh: '雙平台上架 · 2025.11 起接手', en: 'Live on both stores · takeover since 2025.11' },
    stack: ['FLUTTER', 'ONNX', 'FIREBASE', 'ECPAY'],
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
          zh: 'AI 推論必須在裝置端執行,受手機算力限制——接手時的 AR 試戴只有 1 FPS。',
          en: 'AI inference must run on-device within phone-level compute — at handover, AR try-on ran at 1 FPS.',
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
    screenshots: [
      {
        src: '/images/work/nkust-alumni/home.webp',
        alt: {
          zh: '系友會平台首頁:主視覺輪播、搜尋列與最新消息',
          en: 'Alumni platform home: hero carousel, search bar and latest news',
        },
        caption: { zh: '首頁(輪播與最新消息)', en: 'Home (carousel and news)' },
      },
      {
        src: '/images/work/nkust-alumni/search.webp',
        alt: {
          zh: '系友企業搜尋頁:關鍵字搜尋、行業別篩選與企業卡片',
          en: 'Alumni company search: keyword search, industry filters and company cards',
        },
        caption: { zh: '系友企業搜尋(篩選與排序)', en: 'Company search (filters and sorting)' },
      },
      {
        src: '/images/work/nkust-alumni/recruit.webp',
        alt: {
          zh: '系友企業職缺頁:表格/卡片雙檢視的徵才列表',
          en: 'Alumni job board: table and card views of postings',
        },
        caption: { zh: '徵才職缺(表格/卡片雙檢視)', en: 'Job board (table/card views)' },
      },
    ],
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
    keyMetric: { value: '1,112', label: { zh: '後端測試函式', en: 'backend tests' } },
    links: { live: 'https://equipment-borrowing.binbinbob.work' },
    featured: true,
    screenshots: [
      {
        src: '/images/work/nkust-borrow/login.webp',
        alt: {
          zh: '設備借用管理系統登入頁',
          en: 'Equipment borrowing system login page',
        },
        caption: { zh: '登入(自建 JWT 認證)', en: 'Login (self-built JWT auth)' },
      },
      {
        src: '/images/work/nkust-borrow/borrow-return.webp',
        alt: {
          zh: '借還作業中心:借用/歸還/快速查詢分頁、今日借還統計與掃描條碼流程',
          en: 'Borrow/return center: tabs for lending, returns and quick lookup, daily stats and barcode scanning',
        },
        caption: {
          zh: '借還作業中心(掃碼借還)',
          en: 'Borrow/return center (barcode flow)',
        },
      },
      {
        src: '/images/work/nkust-borrow/equipment-management.webp',
        alt: {
          zh: '設備管理中心:分類樹瀏覽、設備列表、批次匯入與批次列印條碼',
          en: 'Equipment management: category tree, equipment list, batch import and batch barcode printing',
        },
        caption: {
          zh: '設備管理中心(批次條碼)',
          en: 'Equipment management (batch barcodes)',
        },
      },
    ],
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
            zh: '移除可偽造的內網豁免,預設一律要登入、真正的例外逐一顯式宣告;新增權威定價模組,單價由後端依當時階梯價與促銷重算;修正折扣分攤讓對帳單與應收一致。三項修復連同對應測試一併提交,已上線運行。',
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
            zh: '身分證後四碼與電話後三碼原本以明碼存庫,作為登入比對依據——資料庫一旦外洩就是直接可識別的個資;而且表裡已有既存明碼資料,不能砍掉重灌。',
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
    screenshots: [
      {
        src: '/images/work/ecobao/home.webp',
        alt: {
          zh: '環飽首頁:惜食主標、搜尋列與平台減碳影響力數字',
          en: 'EcoBǎo home: food-saving hero, search bar and platform impact stats',
        },
        caption: { zh: '消費者首頁(Eco-Fresh 設計系統)', en: 'Consumer home (Eco-Fresh design system)' },
      },
      {
        src: '/images/work/ecobao/menu.webp',
        alt: {
          zh: '逛剩食頁:分類篩選、排序與剩食福袋商品卡(原價/優惠價/取貨倒數)',
          en: 'Browse page: category filters, sorting and surplus-bag product cards with original/deal price and pickup countdown',
        },
        caption: { zh: '逛剩食(篩選與剩食福袋卡片)', en: 'Browse surplus (filters and surprise-bag cards)' },
      },
      {
        src: '/images/work/ecobao/store.webp',
        alt: {
          zh: '店家頁:封面、評分與剩食商品分頁',
          en: 'Store page: cover, rating and surplus-items tabs',
        },
        caption: { zh: '店家頁(評分與商品分頁)', en: 'Store page (rating and item tabs)' },
      },
      {
        src: '/images/work/ecobao/dashboard.webp',
        alt: {
          zh: '店家後台營運總覽:營收/訂單 KPI、近 7 日圖表與剩食售出佔比',
          en: 'Merchant dashboard: revenue/order KPIs, 7-day charts and surplus-sold share',
        },
        caption: { zh: '店家後台儀表板(recharts 圖表)', en: 'Merchant dashboard (recharts)' },
      },
    ],
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
          zh: '三個公開 repo(Django REST 後端、React 前端、PyTorch BERT 模型)。誠實揭露分工:原始專案(2024)由本人於計畫期間開發;近期這輪資安稽核與全面重構為 AI(Claude)輔助完成,每一項修復皆對應到可查證的 commit,數字不灌水。',
          en: 'Three public repos — a Django REST backend, a React frontend and a PyTorch BERT model. Attribution kept honest: the original project (2024) is my own work from the program; the recent security audit and full rebuild were done with AI (Claude) assistance, every fix tied to a verifiable commit, no numbers inflated.',
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
          zh: '2024 年於計畫期間獨立開發原始三件式(後端 API、前端、BERT 模型)。2026 年這輪的資安稽核、後端硬化、前端重構與模型修復為 AI(Claude)輔助完成,分三個 repo 推進,commit 歷史與測試結果皆可查證。',
          en: 'Independently built the original three pieces (backend API, frontend, BERT model) during the 2024 program. The 2026 security audit, backend hardening, frontend rebuild and model fixes were done with AI (Claude) assistance across the three repos, with verifiable commit history and test results.',
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
  },
];
