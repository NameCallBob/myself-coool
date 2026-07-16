# Phase 1 — UI/UX Design Proposal

> 狀態:**待審核**。通過後才進入 Phase 2(Information Architecture)。
> 依據:`phase-1-research-report.md`(10 個產品網站 + 19 個工程師網站的實地研究)

---

## 0. 設計論點(一句話)

> **「不做 Portfolio,做一份『活的系統規格書』(Living System Specification)。」**

Recruiter / CTO / Founder 打開網站時看到的不是自我介紹,而是一份工程文件:編號章節、藍圖格線、真實微服務拓撲的動態示意圖。網站本身的工程品質(Lighthouse 95+、動效紀律、無障礙)就是第一個作品。

這個概念同時解決兩個硬需求:
- **定位傳達**:「這是一位可以設計大型系統的人」——因為整個網站就長得像他畫的系統圖
- **與 AI 生成網站區隔**:AI 模板的預設美學(紫光/mesh/bento+綠光/Claude-core)全部避開;「工程規格文件」語言目前沒有被模板化

---

## 1. 視覺識別(Visual Design Direction)

### 1.1 概念:Engineering Blueprint × Warm Graphite

| 來源 | 借的是「系統」,不是表面效果 |
|---|---|
| Vercel | 可見 hairline 導線 + 交叉點十字刻度(藍圖骨架)、嚴格灰階、明暗雙主題對等 |
| Linear | 編號規格章節(01 / 02 / 03…)、hierarchy 靠調暗不靠加粗、截圖邊緣溶入背景 |
| Supabase / Raycast | 邊框階梯 + surface ladder 做深度(零 box-shadow)、accent 稀缺紀律 |
| Apple | 一個 viewport 一個概念、標題極短、scroll 作為敘事節奏 |
| Stripe | 效能紀律(canvas 離屏暫停)、真實數據作為獨立區塊 |
| OpenAI | 動效 token 化(全站同一組 easing/duration) |
| Anthropic | 「暖色調中性色」策略(但我們用暖石墨,不抄奶油)、Lenis 慣性捲動 |

### 1.2 色彩系統(dark-first,雙主題)

**深色(主)— Warm Graphite**(刻意避開藍黑 AI 色調,採暖灰石墨):

```
--bg-deep:      #0C0B09   (canvas,暖黑,非純黑)
--bg-base:      #12110E
--bg-raised:    #1A1815
--border-1:     rgba(235,225,210,0.07)   (幾乎不可見)
--border-2:     rgba(235,225,210,0.12)   (標準)
--border-3:     rgba(235,225,210,0.20)   (強調/hover)
--fg:           #EDE8DF   (暖白)
--fg-muted:     #A8A296
--fg-faint:     #6B665C
--accent:       #E8A33D   (示波器琥珀 / 電路銅色)
--accent-dim:   rgba(232,163,61,0.14)  (glow、focus ring)
```

**淺色(對等支援)— Drafting Paper**:暖紙白 `#F7F5F0` / 墨 `#171512` / 同一琥珀 accent(深色版 `#B87914` 以符合 4.5:1)。

**規則(Accent 憲法)**:
- 琥珀只出現在:primary CTA、focus ring、系統圖中的「活動訊號」(request pulse)、章節編號
- 圖表/架構圖內允許 2 個輔助資料色(青 `#4FA3A5`、灰藍),**永不**用於 UI chrome
- 禁用:紫色、mesh 漸層、綠光 bento——整組 AI 模板色迴避
- 噪點:2–3% opacity 的 SVG noise 疊在 canvas 上(需求中的 Noise Background,做到「看不出來但質感不同」的程度)
- 玻璃擬態:**只有導覽列**一處(`backdrop-filter: blur + saturate`,Apple 手法),不做玻璃卡片牆

### 1.3 字體系統

| 用途 | 字體 | 規則 |
|---|---|---|
| Display / 標題 | **Archivo**(variable) | 500–600 字重(不用 700+),tracking −2%~−4%,hero `clamp(2.75rem, 8vw, 7rem)` |
| 內文 / UI | **Archivo** 400 | 16–18px,行高 1.6,行寬 65–75ch |
| 標籤 / 數據 / 代碼 | **JetBrains Mono** | 章節編號、eyebrow(uppercase +8% tracking)、所有數字用 tabular-nums |

理由:單一 sans + mono 調味 = 研究中確立的「資深訊號」;Archivo 是工程製圖感的 grotesque,且避開 Inter/Geist/Space Grotesk 的「dev 預設臉」。self-host + `font-display: swap` + preload,零 CLS。

字階(1.25 modular,mono 標籤除外):`12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64 / 96(clamp)`

### 1.4 版面系統

- 12-col grid,max-width **1200px**,gutter 24px;**可見的垂直導線**(1px,border-1 色)貫穿全頁 + 區塊交界十字刻度「+」——這是全站簽名元素
- 間距:8pt 制,區塊節奏 96–160px(spacious;density dial = 3)
- 深度:只用邊框階梯 + surface ladder,全站零 box-shadow
- 圓角:6px(容器)/ 999px(pill CTA),二值制
- 斷點:375 / 768 / 1024 / 1440

---

## 2. 資訊架構(IA 摘要,Phase 2 細化)

研究結論:15 個內容項全做成頁面 = Junior 訊號。合併為 **5 條路由 + 錨點區塊**:

```
/            首頁(規格書封面)
             00 Hero — 動態系統拓撲
             01 Selected Work — 3–4 個代表專案(不是卡片牆)
             02 Architecture — 互動式系統架構(可拖曳/縮放)預覽 → /architecture
             03 Philosophy — 開發哲學(短宣言體)
             04 Contact — mailto + GitHub,不做表單
/work        專案索引 + /work/[slug] 深度 case study
             (Problem → Constraints → Architecture → Stack → Role →
              Challenges/Solutions → Performance → Lessons)
/architecture 互動式微服務全圖 + API Request 動畫 + Deployment Flow
/ai          AI Workflow — Agent 協作(Code/Security/Performance/Architecture
              Review、Documentation)的可視化
/about       身分陳述(Hashimoto 式減法自介)+ Experience + Timeline +
             Achievements + Tech Stack(行文帶出,無 logo 牆、無百分比)
/blog        Phase 2 決定是否首發包含(可先留 RSS-ready 結構)
```

導覽:`Work / Architecture / AI / About` + 一個琥珀 CTA(Contact)。需求清單中的 15 項全部映射到上述結構(GitHub = 導覽列圖示 + About 內行文;Case Studies = /work/[slug];System Design + Tech Stack + Timeline + Achievements 併入對應區塊)。

---

## 3. 招牌互動區塊(核心差異化)

全部走 **samwho.dev / ciechanow.ski 路線**:真實系統的可操作視覺化,不是裝飾特效。

1. **Hero — Live System Schematic**:以 SVG 繪製「你實際的 Django 微服務平台」拓撲(Auth、Member、Order、Inventory、Notification…),藍圖線稿風格 + mono 標籤;琥珀 request pulse 沿邊緣流動(每次隨機路徑:Client → Nginx → Service → MySQL/Redis)。IntersectionObserver 離屏暫停、reduced-motion 降級為靜態圖。**不用粒子、不用 code rain。**
2. **Interactive System Architecture**(/architecture):pan / zoom / 點擊節點展開該微服務的職責、依賴、資料儲存。行動裝置降級為分層列表 + 靜態縮放圖。
3. **API Flow Visualization**:一條真實 API(如下單)的生命週期時間軸動畫——Nginx → Auth 驗證 → Order Service → Inventory 扣減 → Notification → Response,附時序標註。
4. **Technology Universe → 重新定義為「Dependency Constellation」**:技術以「實際被哪些服務使用」連成星座(2D canvas),hover 高亮關聯服務。刻意不做 Three.js 3D 星系(效能預算 + 避免 bruno-simon 式 overkill)。
5. **Deployment Flow**:以你**真實**的部署流程繪製(開發前需向你確認實際流程;絕不加入不存在的 Kubernetes/Docker)。
6. **AI Workflow**(/ai):Agent pipeline 圖 + 終端機式 review 輸出動畫(typing 效果只用在此處,一次)。

---

## 4. 動效設計系統(Animation Design)

**單一動效語彙(OpenAI 式 token 化)**:

```
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1)   (expo-out,全站進場)
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1) (轉場)
micro:   150–250ms   reveal: 350–500ms   hero/page: 600–800ms
stagger: 30–50ms/item(≤8 items)   exit 一律比 enter 短(×0.6)
```

| 類型 | 手法 | 限量規則 |
|---|---|---|
| 捲動 | Lenis 慣性捲動 + GSAP ScrollTrigger reveal(opacity + y 12–24px) | 小位移,讀起來是 fade 不是 slide |
| 頁面轉場 | 疊層 wipe(GSAP timeline,不阻塞導航,cap 250ms exit) | — |
| 大標 | SplitText 逐字進場(GSAP 3.13+ 全插件已免費) | 只用於 hero 與章節標題,≤8 字 |
| Magnetic button | `gsap.quickTo` + elastic | **全站最多 2 個焦點元素**(hero CTA、contact CTA) |
| 游標 | 十字準星小點,hover 互動元素時吸附放大(桌機 only,`pointer: fine`) | 呼應藍圖概念;不做拖尾 |
| 數字 | counter 動畫(效能指標區),tabular-nums 防跳動 | — |
| 卡片展開 | Case study 入口 FLIP shared-element(每次導航僅 1 組) | — |
| 微互動 | hover 邊框 border-1→border-3、press scale 0.97、focus ring 琥珀 | Framer Motion 管元件層 |

**硬規則**:只動 `transform/opacity`;每 viewport 最多 1–2 個動畫主角;`prefers-reduced-motion` 全部關閉非必要動效(內容立即可讀);所有 canvas/循環動畫離屏暫停。

---

## 5. 技術架構(Frontend Architecture 摘要,Phase 7 細化)

- **Next.js 15(App Router)+ TypeScript + Tailwind CSS v4**,全站 SSG
- 動效:**GSAP(ScrollTrigger/Flip/SplitText,現已全免費)+ Lenis + Framer Motion**(分工:GSAP 管 scroll 編排與 hero,FM 管元件微互動與轉場)
- 圖:自製 SVG(架構圖)+ 2D Canvas(constellation);**不引入 Three.js**
- 主題:next-themes(system 預設,深色優先)
- 部署:Vercel 或 GitHub Pages(static export)——**待你決定**;程式碼公開於 GitHub(MIT,內容目錄與程式分離,方便他人 fork 結構但不帶走你的內容)

---

## 6. SEO / Performance / Accessibility 計畫(摘要)

- **SEO**:Metadata API 全站配置、Person + WebSite + BreadcrumbList + Article(case study)JSON-LD、動態 per-page OG image(@vercel/og)、sitemap/robots、canonical、語意化 HTML(每頁單一 h1、序列標題)、RSS
- **Performance 預算**:LCP < 2.0s(hero 是 SVG+文字,無大圖)、CLS < 0.05(字體 preload + 所有媒體固定尺寸)、INP < 200ms、JS 首載 < 150KB gz(GSAP 按路由 code-split)、Lighthouse 四項 95+
- **A11y(WCAG 2.2 AA)**:對比 4.5:1(琥珀在深底 ≈ 8:1,淺色主題用加深版)、全鍵盤導航 + skip link、互動圖表附文字替代結構(架構圖 = 可見的分層列表 fallback,同時是 SEO 內容)、focus ring 永不移除、reduced-motion / high-contrast 支援

---

## 7. 自我 Review(Phase 1 checkpoint)

**與頂尖作品比較**:視覺紀律對標 Vercel(灰階/導線)、敘事對標 Apple(一屏一概念)、可信度策略對標 samwho/brittanychiang(互動模擬 + 量化成果)、動效紀律對標 OpenAI/Linear(token 化 + 稀缺)。

**發現的問題與修正**:
1. ~~原始需求的 15 頁結構~~ → 研究顯示是 Junior 訊號,合併為 5 路由(修正於 §2)
2. ~~Technology Universe 做成 3D 星系~~ → 效能與 gimmick 風險,改為 2D Dependency Constellation(修正於 §3.4)
3. ~~Glassmorphism + Gradient 大量使用~~ → 研究顯示已是 AI 模板特徵,降為「導覽列一處玻璃 + 圖內限量資料色」(修正於 §1.2)
4. Code Rain / 粒子背景 → 需求有列但研究判定為廉價訊號,以「真實系統拓撲動畫」替代(更貼合「讓人一進來就知道是做大型系統的」的原始目標)

**已知風險**:互動架構圖是最大效能風險點 → 每個互動區塊 lazy-load + 離屏暫停 + 靜態 fallback;逐 phase 用 Lighthouse CI 驗證。

**尚需使用者提供(Phase 2 前)**:姓名/品牌名與 domain、網站語言、主色方向確認、部署目標、真實部署流程細節、各專案可公開的真實數據。
