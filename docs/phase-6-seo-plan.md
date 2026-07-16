# Phase 6 — SEO Plan(企業級)

> Domain:`https://binbinbob.work`|主語系 zh-TW(root)|en(`/en` 前綴)

---

## 1. Metadata 矩陣(Next.js Metadata API)

| 路由 | title(zh) | 重點 |
|---|---|---|
| `/` | `binbin — 軟體架構師 · 後端工程師 · AI 系統` | template 基底:`%s — binbin` |
| `/work` | `作品 — binbin` | |
| `/work/[slug]` | `{專案名} — binbin` | description 取 oneLiner |
| `/architecture` | `系統架構 — binbin` | |
| `/ai` | `AI Workflow — binbin` | |
| `/about` | `關於 — binbin` | |

每頁:`description`(≤155 字元,人工撰寫非截斷)、`canonical`(自指)、`alternates.languages`(zh-TW / en / x-default→zh-TW)、OG(type、locale `zh_TW`/`en_US`、動態 image)、Twitter Card `summary_large_image`。

## 2. 結構化資料(JSON-LD)

| 頁 | Schema |
|---|---|
| 全站 | `WebSite`(name、url、inLanguage)+ `Person`(name: binbin、url、jobTitle: Software Architect、knowsAbout: [Django, Distributed Systems, Microservices, AI Integration…]、sameAs: [GitHub]) |
| `/work/[slug]` | `Article`(headline、datePublished/Modified、author→Person、image→OG)+ `BreadcrumbList`(首頁›Work›專案) |
| `/about` | `ProfilePage` → mainEntity: Person |

以 `<script type="application/ld+json">` 由 layout/page server component 輸出;內容從同一內容模組derive(單一資料源,不手寫兩份)。

## 3. 索引基礎設施

- `sitemap.xml`:App Router `sitemap.ts` 生成,含全部 zh/en 路由 + `alternates`(hreflang)+ `lastModified`
- `robots.txt`:`robots.ts`,允許全部、指向 sitemap
- 動態 OG:`opengraph-image.tsx` per route(@vercel/og,Phase 4 §6 模板,zh 標題用 Noto Sans TC 子集字型)
- RSS:v1.1 blog 上線時加入(結構先預留)
- 重導:`www` → apex、http → https(Vercel domain 設定);trailing slash 統一關閉

## 4. 語意化 HTML / Heading 策略

- 每頁**單一 `h1`**;章節 `h2`,子項 `h3`,不跳級
- landmark:`header / nav / main / section(aria-labelledby) / footer` + skip link
- 互動視覺化的 SEO 雙保險:架構圖/Constellation 各配**同資料源渲染的語意化列表**(`<ul>` 服務分層),對爬蟲與讀屏是真內容,對視覺使用者是 mobile fallback——一份結構三種用途
- 圖片:next/image(AVIF/WebP、尺寸宣告、lazy;首屏 `priority`);裝飾性 SVG `aria-hidden`,資訊性圖配 `<figcaption>` 與替代描述

## 5. Core Web Vitals 預算(= Phase 9 驗收線)

| 指標 | 預算 | 手段 |
|---|---|---|
| LCP | **< 2.0s** | hero = 文字 + inline SVG(無 hero 圖);字型 preload + swap;SSG + Vercel edge cache |
| CLS | **< 0.05** | 字型 fallback 度量調整(next/font 自動)、所有媒體固定尺寸、動畫不觸發 layout |
| INP | < 200ms | 動效規則(§Phase 5)、互動圖 rAF 節流 |
| TTFB | < 200ms | 全 SSG,無 runtime 資料源 |
| JS 首載 | < 150KB gz | GSAP/圖表按路由 dynamic import;首頁僅 hero 動畫 chunk |
| Lighthouse | **四項 ≥ 95** | CI 驗證(見 §6) |

## 6. 驗證與監測

- **CI**:GitHub Actions — build + Lighthouse CI(mobile 模擬,四項 assert ≥95,PR 阻擋)
- 上線後:Vercel Speed Insights(真實用戶 CWV)+ Search Console(兩語系 sitemap 提交、hreflang 報告核對)
- 驗收工具:Rich Results Test(JSON-LD)、opengraph.xyz(OG 卡)、axe DevTools(a11y 與 SEO 交集項)

## 7. 自我 Review

- **決策依據**:動態 OG(leerob/Vercel 標準配備)、單一資料源 derive JSON-LD(避免 metadata 腐化)、互動圖的語意列表雙保險(研究中 samwho 的 SVG 內容對爬蟲不可讀是已知短板,本案補上)
- **發現問題與修正**:(1) zh-TW root + en 前綴若 hreflang 不完整會被判重複內容 → sitemap alternates + 每頁 alternates 雙重宣告;(2) OG 中文字型全量太大 → @vercel/og 只嵌標題用到的字元子集;(3) `knowsAbout` 原想列 20+ 技術 → 收斂到 8 個核心(關鍵字堆砌反而降權)
- **與頂尖比較**:metadata 完整度對標 Vercel/Stripe 行銷頁;多語 hreflang 超出研究樣本(多為單語)——依 Google 官方多語指南制定
