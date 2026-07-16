# Phase 7 — Frontend Architecture

---

## 1. 技術棧(鎖定)

| 層 | 選型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15(App Router)+ React 19 + TypeScript(strict)** | SSG、Metadata API、RSC 減 JS |
| 樣式 | **Tailwind CSS v4**(CSS-first config,`@theme` 對映 Phase 4 token) | token 即 CSS 變數,雙主題零成本 |
| i18n | **next-intl**(`localePrefix: 'as-needed'`,zh-TW root / `/en`) | App Router 原生整合、typed messages |
| 主題 | **next-themes**(`attribute="data-theme"`,預設 dark,尊重 system) | 無 FOUC(inline script) |
| 動效 | **gsap + @gsap/react**(ScrollTrigger/Flip/SplitText)、**lenis**、**motion**(Framer Motion) | Phase 5 分工 |
| 圖示 | **lucide-react** | stroke 1.5 一致 |
| 部署 | **Vercel**(全 SSG + `@vercel/og` edge) | 使用者已確認 |
| 程式碼品質 | ESLint + Prettier + `tsc --noEmit`;GitHub Actions CI(lint/type/build/Lighthouse CI) | PR 阻擋線 |

不引入:Three.js、UI 元件庫(全自製,樣板感歸零)、CMS(內容即程式碼,typed)。

## 2. 目錄結構

```
self-page/
├── docs/                       # Phase 文件(本系列)
├── content/                    # ★ 內容與程式分離(公開 repo 時界線清楚)
│   ├── projects.ts             # Project[](Phase 2 §6 型別)
│   ├── experience.ts           # Experience[] / timeline / achievements
│   └── site.ts                 # 身分陳述、哲學宣言、聯絡資訊
├── messages/
│   ├── zh-TW.json              # UI 字串
│   └── en.json
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx      # html/body、字型、providers、Nav/Footer、JSON-LD
│   │   │   ├── page.tsx        # 首頁
│   │   │   ├── work/page.tsx + work/[slug]/page.tsx
│   │   │   ├── architecture/page.tsx
│   │   │   ├── ai/page.tsx
│   │   │   ├── about/page.tsx
│   │   │   ├── not-found.tsx
│   │   │   └── opengraph-image.tsx(+ per-route)
│   │   ├── sitemap.ts / robots.ts / manifest.ts
│   │   └── globals.css         # @theme token、噪點、導線、focus、reduced-motion 基底
│   ├── components/
│   │   ├── layout/   Nav, Footer, GridGuides, SectionHeading, Container
│   │   ├── motion/   LenisProvider, PageTransition, Reveal, SplitHeading,
│   │   │             Magnetic, Counter, Cursor
│   │   ├── diagrams/ HeroSchematic, ArchitectureCanvas, ApiFlow,
│   │   │             DeploymentFlow, Constellation, AgentPipeline, Terminal
│   │   └── ui/       Button, MetaRow, ProjectRow, ThemeToggle, LocaleToggle
│   ├── lib/          jsonld.ts, topology.ts(微服務拓撲資料→圖/列表共用), utils
│   └── i18n/         routing.ts, request.ts, navigation.ts
├── middleware.ts               # next-intl locale 偵測
└── .github/workflows/ci.yml
```

## 3. 渲染與資料流

- 全路由 `generateStaticParams`(locale × slug)→ **100% SSG**,無 runtime fetch
- `content/*.ts` 是唯一資料源 → 頁面、JSON-LD、sitemap、OG、架構圖節點、語意列表全部 derive(改一處全站同步)
- `lib/topology.ts`:微服務拓撲(節點/邊/分層)單一定義 → HeroSchematic(精簡版)、ArchitectureCanvas(全圖)、mobile 手風琴列表、SEO `<ul>` 四處共用

## 4. Client/Server 邊界

- Server(預設):所有頁面、SEO 輸出、靜態排版
- Client islands(`'use client'` + `next/dynamic`):diagrams/*、motion/*、toggles——各自 code-split;`Reveal` 等輕元件走 CSS class + 極小 observer hook
- Hero schematic:SSR 輸出完整 SVG(節點/連線在 HTML 內,無 JS 也可見、可被爬),hydration 後才啟動 pulse——LCP 與 SEO 同時成立

## 5. 主題 / i18n / 動效落地細節

- 主題:`data-theme` on `<html>`;token 全在 CSS 變數,元件零主題判斷;`color-scheme` 同步
- i18n:`useTranslations`(client)/`getTranslations`(server);內容模組 `Localized` 型別以 helper `t(loc, field)` 取值;LocaleToggle 用 next-intl `Link` 保持當前路徑
- 動效:`MotionProvider` 統一讀 `prefers-reduced-motion` 供 context;GSAP 一律 `useGSAP({ scope: ref })`;Lenis 在 `LenisProvider` 掛載並接 ScrollTrigger.update
- 字型:next/font — Archivo(variable)、Noto Sans TC(400/500/700 subset)、JetBrains Mono;CSS 變數 `--font-sans/--font-mono` 注入 Tailwind theme

## 6. CI / 部署

```
PR → GitHub Actions: lint → tsc → build → Lighthouse CI(≥95×4, assert 阻擋)
main → Vercel production(binbinbob.work);PR → preview URL
```
Repo 公開(MIT for code;`content/` 標示 All rights reserved)。README 說明架構與跑法。

## 7. 自我 Review

- **決策依據**:單一資料源 derive 一切(拓撲四用、內容三用)是本架構核心——對「Software Architect 的個人網站」而言,repo 本身的架構品質就是作品的一部分,公開後會被檢視
- **發現問題與修正**:(1) SplitText/Flip 若全域載入會吃首屏預算 → 全部 dynamic import 進各 island;(2) Lenis 與 CSS `scroll-behavior: smooth` 衝突 → 全域關閉後者;(3) 原考慮 MDX case study → 八段式是強結構,typed TS 比自由 prose 更能保證每案完整性(也避免漏段),捨 MDX
- **與頂尖比較**:分層與 island 策略對標 leerob 系 Next.js portfolio 最佳實踐;100% SSG + 零 runtime 依賴對標 Karpathy 的「輕」哲學但保留現代 DX
- **風險**:Tailwind v4 + next-intl 版本相容性 → scaffold 後先 build 驗證再繼續
