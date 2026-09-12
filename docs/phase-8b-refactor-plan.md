# Phase 8b — SEO 修復 · CSS 架構重構 · 履歷輸出

> 立項日:2026-09-10|狀態:待使用者審核
> 三條並行主軸:(A) SEO 技術缺口修復 (B) 去 AI 模板感 + CSS 架構重構 (C) A4 履歷輸出
> 前置:Phase 1–7 規劃完成、Phase 8 開發進行中、網站已上線 https://binbinbob.work

---

## 0. 為什麼有這一期

Phase 6 的 SEO 規劃落地了大約七成,剩下的三成不是「沒寫」而是「寫了但沒接上」——
案例頁沒有 h2、`/architecture` 空殼卻進了 sitemap、Article schema 缺日期欄位。
同時使用者提出兩個新目標:

1. **去 AI 感**——視覺層、文案層、互動層(程式碼層本次不特別處理,但 CSS 重構會順帶改善)
2. **讓 CSS 能力可被檢視**——考官/主管點進 repo 看到的應該是有架構的 CSS,
   而不是散在 JSX 裡的 utility 長串;並且要能看出**整合開源方案的判斷力**,
   而非什麼都自己重寫

第三個目標是使用者中途追加的:**可直接下載的 A4 履歷**,純黑白、專業軟體工程師格式。

---

## 1. 現況盤點(實測,非推測)

### SEO 已經做對的

全頁自指 canonical、zh-TW / en / x-default 三件組 hreflang(`<head>` 與 sitemap 雙重宣告)、
JSON-LD 從 `content/` 單一資料源 derive、全站 SSG 靜態輸出(爬蟲拿到完整 HTML)、
`layout.tsx` 用 `html.js` class gate 讓 reveal 動畫不會對無 JS 爬蟲隱藏內容、
圖片全部有尺寸宣告與描述性中文 alt、裝飾 SVG `aria-hidden` / 資訊性 SVG `role="img"`。

### 實測數據

| 項目 | 實測值 | 判讀 |
|---|---|---|
| 案例頁 `<h2>` 數量 | **0**(僅 1 個 h1) | `SectionOpener` 只在傳 `title` 時吐 h2,案例頁從未傳 |
| `/architecture` 純文字量 | **163 字** | 空殼頁,但在 sitemap 且可索引 |
| 無 caseStudy 的專案 | **1**(`ai-workflow` / 16 個中) | 同上,薄內容 |
| sitemap `<url>` 條目 | 21(全為 zh-TW) | en 版只以 `xhtml:link` 存在,無獨立條目;缺 x-default |
| `og:url` | **未輸出** | `ogFor()` 未帶 `url` 欄位 |
| OG 圖 | 全站共用 `/og.png` 1 張 | 18 個案例分享出去長得一樣 |
| `Article` schema | 缺 `datePublished` / `dateModified` / `image` | 不符 Google Article rich result 建議欄位 |
| `public/index.html` | 同時有 `noindex` + `canonical` | Google 明文不建議的組合 |
| 自架 woff2 | **10 MB / 223 檔** | Noto Sans TC + Noto Serif TC 全 CJK 切片;僅 latin 被 preload |
| JS chunks | 1.3 MB(未壓縮) | 含 Lenis |
| `<Reveal>` 使用點 | **35 處** | 幾乎每個區塊都套 |
| `className` 最長字串 | 185 字元(首頁) | utility 長串 |
| `globals.css` | 256 行 | 品質不差,但只佔全站樣式的一小部分 |

### 現有 CSS 的實際水準(誠實評估)

`globals.css` 目前的內容其實**不是 AI 隨手產物**:三層語意 token、`-webkit-text-stroke`
做中空章節數字、`::first-letter` drop cap 同時處理 CJK 與拉丁、`background-size`
做紅墨水底線動畫、`:lang(zh-Hant)` 行高補償、完整的 `prefers-reduced-motion` 基準線。
問題是它只有 256 行,而樣式的絕大部分以 utility 形式散在 JSX——
**考官點進 repo 第一眼看到的是後者**。這正是本期要翻轉的東西。

---

## 2. Track A — SEO 修復

低風險、彼此獨立,先做。

### A1 · 案例頁標題階層(影響最大)

`SectionOpener` 的 label 升為 `<h2>`(視覺完全不變——mono 小字一樣可以是 h2),
`<section>` 補 `aria-labelledby`。套用於 case study、首頁、`/ai`。
現況違反 Phase 6 §4 自訂的「章節 h2,不跳級」。

### A2 · 薄內容頁退出索引

`/architecture`(163 字)與 `ai-workflow`(無 caseStudy)加
`robots: { index: false, follow: true }`,並從 `sitemap.ts` 的 `PATHS` 排除。
互動架構圖完成後放回。**這是暫時的,不是放棄該頁。**

### A3 · 根網域 index.html

移除 `<meta name="robots" content="noindex">`,保留 meta refresh + canonical。
理由:Google 明文不建議在 noindex 頁面放 canonical(noindex 有機率沿 canonical 傳遞),
而 `https://binbinbob.work/` 是最可能被外部連結與直接輸入的 URL。

### A4 · sitemap 標準化

- zh-TW 與 en 各自成獨立 `<url>` 條目(Google 多語 sitemap 規範)
- alternates 補 `x-default`(與 `<head>` 對齊)
- 補 `lastModified`:`content/projects.ts` 新增 `updated: '2026-07-18'` 之類的真實欄位,
  靜態頁用常數。**沿用原本的判斷——不蓋 build time**,但解法是補真實日期而非永遠留空。

### A5 · 結構化資料補完

- `Article`:補 `datePublished` / `dateModified`(來源同 A4)/ `image`(來源 = 該專案第一張 screenshot 或 diagram)
- `/about`:新增 `ProfilePage` → `mainEntity: Person`(Phase 6 §2 原本規劃,未實作)
- `Person`:補 `alumniOf`(高科大智慧商務系)、`worksFor`(Manience Inc.)

### A6 · OG / Twitter 補洞

- `ogFor()` 補 `url`
- `twitter` 補 `creator`
- **per-project OG 圖**:**已實測,結論是改用別的做法**(見下)

> **實測紀錄(2026-09-10)**——`opengraph-image.tsx` + `ImageResponse` 在
> `output: 'export'` 下**確實會產出檔案**,但有兩個對 GitHub Pages 致命的問題:
>
> 1. 產出路徑是 `out/zh-TW/work/<slug>/opengraph-image`——**沒有副檔名**。
>    GitHub Pages 依副檔名決定 Content-Type,無副檔名會送出
>    `application/octet-stream`,社群平台的爬蟲不會當成圖片。
> 2. 巢狀動態路由的 `generateStaticParams()` 必須回傳**從根層算起的完整 params**
>    (`{ locale, slug }`,只給 `slug` 會 build 失敗)。
>
> 另外中文標題要進 `ImageResponse` 還得自行嵌入 CJK 字型子集,否則是豆腐字。
>
> **改採**:Track D 本來就要引入 Puppeteer 產履歷 PDF,順道用同一套產
> `public/og/<slug>.png`(真實副檔名、真實 Content-Type),`ogFor()` 指向它。
> 這項因此**移到 Track D 一起做**,Track A 先維持共用 `/og.png`。

---

## 3. Track B — 去 AI 感

使用者指定三層:**互動層、視覺層、文案層**。

### B1 · 互動層(減法)

「Lenis 平滑捲動 + 逐字 stagger 標題 + 每個區塊都 fade-in」這個組合是 AI 作品集的標準配方,
在懂行的人眼裡是扣分項,而且三者都有 INP / 主執行緒成本。

| 動作 | 理由 |
|---|---|
| 移除 `LenisProvider` 與 `lenis` 依賴 | 劫持原生捲動,行動端手感更差,是最明顯的模板訊號 |
| `<Reveal>` 從 35 處收斂到約 6 處 | 只留主要章節首次進場;其餘內容直接呈現 |
| `StaggerHeading` 逐字動畫改單次 fade(或全砍) | 逐字動畫是 AI 作品集特徵;首頁 h1 是 LCP 元素,動畫直接拖慢 LCP |

副作用是正面的:JS 變小、INP 改善、LCP 改善——與 Track A 的目標一致。

### B2 · 視覺層(打破均勻節奏)

目前每個 section 都是同一個模板循環:`SectionOpener` → 分隔線 → 段落。
間距刻度完全一致,讀起來像自動生成的文件。改法:

1. **章節間距分級**——major / minor 兩級,不再全部 `mt-20`
2. **邊註(marginalia)**——把 case study 的 facts 數據、技術補充移到側欄邊註,
   窄螢幕收回內文。這是目前版面**最缺、也最不像模板**的東西,靈感來源 Tufte CSS(見 Track C)
3. **圖片節奏**——目前全部同寬同框;改成 full-bleed / 跨欄 / 並排對照三種
4. **`numeral-ghost` 收斂**——只在主要章節出現,次章節改小型 mono 標號

### B3 · 文案層

全站中文逐句過,砍掉 AI 愛用的並列句式與翻譯腔
(「涵蓋 A、B、C 到 D」「從 X 到 Y」「不僅…而且…」)。
範圍:`messages/zh-TW.json` 的 `meta` description、`content/projects.ts` 的 `oneLiner`
與 case study 段落。英文版同步,但優先度較低。

⚠️ 這一項會動到已驗證的專案內容文字。**只改語氣,不改事實與數字**;
任何涉及數據的句子改寫後需與 `docs/content-request.md` 的來源比對。

---

## 4. Track C — CSS 架構重構(本期核心)

目標:讓 repo 裡的 CSS 本身成為作品——有分層、有取捨、有文件。

### C1 · 引入並改寫開源方案

使用者選定「引入具名開源方案並改寫」。候選與定位:

| 套件 | 版本 | 定位 | 採用範圍 |
|---|---|---|---|
| `open-props` | 1.7.23 | primitive token 層 | **只取用到的模組**(easings / animations / sizes),不全量匯入 |
| `modern-normalize` | 3.0.1 | reset | 全量(僅 ~200 行) |
| Tufte CSS | — | 邊註排版思路 | **不安裝**,內化技法(B2-2),文件標註靈感來源 |

> **誠實的取捨提醒(必須寫進 `docs/css-architecture.md`)**
> Tailwind v4 的 `@theme` 本身就是一套 token 系統。如果只是「把 open-props 也裝上」,
> 結果是兩套 token 並存——那**反而扣分**,因為看起來像沒想清楚就堆套件。
> 加分的做法是明確分工:**open-props 只當 primitive 層**(它的 easing 曲線、
> size 刻度是經過設計的通用值),**semantic 層自製**(品牌色、CJK 字級節奏),
> 並在文件裡具體寫出「覆寫了哪些刻度、為什麼」。
> 例:`--size-*` 不採用,因為 CJK 的行高補償與字級節奏和拉丁文不同。
> 展示的是判斷力,不是套件數量。

### C2 · 檔案結構

```
src/styles/
  tokens.primitive.css   open-props 選用模組 + 自製 primitive(CJK 字級刻度)
  tokens.semantic.css    現有 --bg-* / --fg-* / --accent 對應到 primitive
  base.css               modern-normalize + 排版基準 + :lang(zh-Hant) 補償
  components.css         @layer components — 語意化 class
  utilities.css          少量自製 utility
  print.css              A4 履歷用(Track D)
```

`globals.css` 收縮成 `@import` 清單 + `@theme inline` 橋接。

### C3 · Utility 收斂

把**重複出現**的 utility 長串收斂成語意 class:
`.work-row`、`.spec-list`、`.case-section`、`.fact-grid`、`.marginalia` 等。

**保留 Tailwind 的邊界**(要寫進文件,這個邊界本身就是判斷力的展示):

- 重複出現 ≥3 次的視覺模式 → 語意化 component class
- 一次性的版面微調 → 保留 Tailwind utility

不做「把 Tailwind 全部拆掉手寫」——那是為了炫技而增加維護成本,
一個資深工程師不會那樣做,考官也看得出來。

### C4 · `docs/css-architecture.md`

這份文件是給考官看的東西,內容:三層 token 架構圖、
採用了 open-props 的哪些 module、**覆寫了什麼與為什麼**、
為何保留 Tailwind 而非全部手寫、CJK 排版的特殊處理、
`prefers-reduced-motion` 與 `prefers-color-scheme` 的處理策略。

---

## 5. Track D — A4 履歷輸出(新功能)

**使用者規格:純黑白(白底黑字),專業軟體工程師使用的格式。**
這也意味要 **ATS 友善**:單欄、不用表格排版、真實文字(非圖片)、標準標題階層。

### D1 · 資料來源

`/[locale]/resume` 的內容 **derive 自 `content/` 現有模組**
(`experience.ts` / `projects.ts` / `site.ts`),不另外維護一份履歷資料。
→ 履歷永遠與網站同步,不會出現「網站更新了但履歷是舊的」。
這件事本身就是可以拿出來講的工程決策。

可能需要在 `Project` 型別補 `resumeBullet?: Localized[]`——
履歷條目的措辭與網站案例頁的敘述長度需求不同。

### D2 · 視覺規格(刻意與網站主體不同)

網站主體是「製圖紙 + 紅墨水」的編輯風;**履歷頁一律不套用**:

- 白底 `#fff` / 黑字 `#000`,無品牌紅、無底紋、無 noise overlay
- 字體:履歷用襯線或無襯線單一家族,**不混用四種字型**
- 單欄、標準階層(姓名 h1 → 區段 h2 → 職位/專案 h3)
- 無圖片、無圖示、無色塊(ATS 解析友善)

### D3 · 列印 CSS(`print.css`)

```
@page { size: A4; margin: 14mm; }
```
加上:`break-inside: avoid` 保護經歷條目不被分頁切斷、
隱藏 nav / footer / 主題切換 / 下載按鈕、
連結展開為可讀 URL(`a::after { content: " (" attr(href) ")" }`)、
色彩改為印刷安全值。

**這一項同時是 Track C 的試金石**——一份寫得好的 print stylesheet
是相當能區分 CSS 功力的東西,而且它天然屬於 `src/styles/` 的分層架構。

### D4 · 下載方式(兩層)

| 層級 | 做法 | 使用者體感 |
|---|---|---|
| **基本**(必做) | 頁面「下載 PDF」按鈕 → `window.print()` | 開啟列印對話框,選「另存 PDF」。零依賴,任何瀏覽器可用 |
| **進階**(建議做) | GitHub Actions build 後用 Puppeteer 把 `/zh-TW/resume` 與 `/en/resume` 印成 `out/binbin-resume-zh-TW.pdf` / `-en.pdf` | 首頁 / about / 履歷頁直接給真實檔案連結,**一鍵下載,不經過對話框** |

使用者說的「可以給人直接下載」,嚴格講只有進階層做到。建議兩層都做,
基本層先上,進階層作為 CI 的加值。

### D5 · 索引策略

`/resume` **應該被索引**(對「binbin 履歷」這類查詢有價值),
但需與 `/about` 內容區隔避免自我競爭:`/about` 是敘事,`/resume` 是條列事實。

---

## 6. Track E — 驗證

1. `npm run build` 後逐項核對輸出 HTML:h2 數量、canonical、hreflang、JSON-LD
2. **Lighthouse CI 加進 workflow**——Phase 6 §6 原本規劃但從未實作,
   目前那條「四項 ≥95」的預算沒有任何東西在守。門檻先設 90,穩定後往上調
3. Rich Results Test 驗 JSON-LD;Search Console 提交 sitemap 並核對 hreflang 報告(需使用者操作)
4. 履歷實際列印:A4 分頁不切斷條目、中文字型正確嵌入、ATS 文字可選取

---

## 7. 執行順序與理由

```
A(SEO 修復)
   ↓  獨立、低風險,先落地
B1(互動層減法)
   ↓  是減法,先做可縮小 C 的重構面積
D(履歷 /resume + print.css)
   ↓  新功能,print.css 成為 C 的分層起點
C(CSS 架構重構 + 文件)
   ↓  最大工程量
B2 / B3(視覺節奏 + 文案語氣)
   ↓  需要在 C 的架構之上才好做
E(驗證)
```

每個 Track 完成後停下等使用者審核,不連續推進(沿用 Phase 1–7 的規則)。

---

## 8. 使用者決策(2026-09-10 已確認)

| # | 決策 | 影響 |
|---|---|---|
| Q1 | **內文換系統中文字體堆疊,Noto Serif TC 只保留 h1 與 pull-quote** | 砍掉大部分 CJK 字型下載;內文在不同 OS 上長相不同為已接受的代價 |
| Q2 | **履歷 PDF 兩層都做** | `/resume` 頁 + `window.print()` 按鈕,並加 Puppeteer CI 預產真實 PDF 檔 |
| Q3 | **重複 ≥3 次才抽 component class** | 一次性版面保留 Tailwind utility;邊界寫入 `docs/css-architecture.md` |

以下為決策當時的選項分析,保留作為決策紀錄。

### Q1 · 中文字型策略(影響 LCP 最大的單一因素)

現況自架 10 MB / 223 個 woff2(Noto Sans TC + Noto Serif TC 全 CJK 切片),
只有 latin 被 preload,中文字要等 CSS 解析完才開始抓。
首頁 LCP 元素正好是 `clamp(3.25rem, 10vw, 7.5rem)` 的 Noto Serif TC 大標。

| 選項 | 效果 | 代價 |
|---|---|---|
| 維持現狀 | 視覺完全一致 | LCP 風險最大 |
| Noto Sans TC 換系統字體堆疊,Serif 只留 h1 / pull-quote | 砍掉大部分 CJK 字型下載 | 內文在不同 OS 上長相不同 |
| 兩者都換系統字體 | 效能最好 | 失去 serif 編輯風的識別度 |

### Q2 · 履歷 PDF 是否做 CI 預產(D4 進階層)

要做的話 workflow 會多一個 Puppeteer 步驟(build 時間 +30~60 秒),
換來真正的一鍵下載。

### Q3 · 保留 Tailwind 的邊界(C3)

計劃採「重複 ≥3 次才抽 component class,一次性版面保留 utility」。
若使用者希望更激進(例如完全移除 Tailwind),工作量與風險都會顯著上升,
且我不認為那是更好的工程決策——需要確認。

---

## 9. 不在本期範圍

- `/architecture` 互動架構圖(改校園系統拆解)——獨立工作,本期只讓它暫時退出索引
- 英文文案的深度潤飾
- RSS / blog(Phase 6 §3 預留)
