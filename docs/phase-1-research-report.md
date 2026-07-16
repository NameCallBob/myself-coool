# Phase 1 — UI/UX Research Report

> 研究日期:2026-07-16
> 方法:實際抓取各網站 HTML/CSS(含 design token)、交叉比對設計拆解文章與品牌案例研究。
> 範圍:10 個頂尖產品網站 + 19 個知名工程師個人網站。

---

## 1. 產品網站研究(Apple / Stripe / Linear / Vercel / Supabase / OpenAI / Anthropic / GitHub Universe / Framer / Raycast)

### 1.1 各站精華摘要

| 網站 | 字體識別 | 色彩系統 | 招牌手法 | 該學 | 該避 |
|---|---|---|---|---|---|
| **Apple** | SF Pro,Display 80–96px Semibold,極緊 tracking | 淺色優先 #f5f5f7 / #1d1d1f,色彩全部來自產品攝影 | sticky 300–500vh + canvas 逐幀 scroll-scrub;毛玻璃導覽列 | 一個 viewport 一個概念;標題極短;scroll 作為敘事節奏 | 沒有 Apple 等級素材就做 500vh scroll-jacking |
| **Stripe** | Söhne variable(ss01),Display 反而用 300–400 細字重 | 白底 + #0a2540 墨色 + #635bff | WebGL mesh 漸層(~10kb 自製 minigl,離屏自動暫停);skewY(-6deg) 斜切區塊 | 效能紀律(GPU + IntersectionObserver 暫停);真實可操作的產品 UI 內嵌;硬數據作為獨立區塊 | mesh 漸層 hero 是十年來被抄最多的效果,一用就是「Stripe 仿冒品」 |
| **Linear** | Inter Display + font-feature tuning,粗細靠「調暗」不靠加粗 | 2025 已去紫光:#010102 + 暖灰階,#5e6ad2 幾乎只出現在 logo/focus/CTA | 1px hairline 邊框流光(specular highlight);截圖邊緣淡入黑底;編號規格式章節(1.0 / 2.0…) | 克制即識別;changelog 作為信任訊號;hierarchy 靠 dimming | 「2022 Linear look」(黑底+紫光+glow card)已是 AI 新創預設模板 |
| **Vercel** | Geist Sans + **Geist Mono 標題**,token 全公開 | 最嚴格:#fafafa/#171717 + 10 階灰(每個邊框有自己的階),藍色只給互動 | 可見垂直導線 + 交叉點十字刻度(藍圖感);多層 shadow-as-border;明暗完全對等 | 嚴格灰階讓 minimal 看起來是「工程出來的」而非「空的」;token 紀律 | 黑底+mono+格線已是 dev-tool 制服,沒有間距紀律就只是「沒設計」 |
| **Supabase** | Circular + Source Code Pro 微標籤 | #0f0f0f–#171717 + 綠 #3ecf8e 只用於重點 | **邊框階梯取代陰影**(#242424→#2e2e2e→#393939);程式碼/終端機作為行銷視覺 | 深色 UI 的正確深度=邊框階梯;單一擁有色 | 深色 bento + 綠光 = v0/Lovable 預設美學 |
| **OpenAI** | OpenAI Sans(ABC Dinamo),幾乎全站 h4/h5 尺寸的克制 | 近單色雙主題,灰階 ramp(primary-4/12/44/60/80/100) | **tokenized motion**(ease-curve-a/c/d + 200–300ms 全站統一);產品即 hero(直接放輸入框) | 動效 token 化讓全站微互動「同一種語氣」 | 8 支自動播放影片的 LCP 成本;沒有內容量支撐的單色編輯風 |
| **Anthropic / Claude** | 自製 Serif 400 字重 display(絕不加粗)+ 人文 sans + JetBrains Mono | 暖奶油 #faf9f5 / #f0eee6 + 墨 #141413 + 珊瑚 #D97757 | 奶油→卡片→深色三層「pacing rhythm」;GSAP + ScrollTrigger + **Lenis** + Lottie | 一個帶溫度的中性色立刻跳出藍黑 AI 同質圈;400 字重大標 = 不吼叫的權威 | 「Claude-core」奶油+珊瑚+serif 是 2025 被抄最兇的配方 |
| **GitHub Universe** | Mona Sans variable + Mono;章節命名 `dev.experience()` | 每區塊輪換 `--accent-color`(綠/藍/紫/橘/黃),light/dark 分區 | `--animation-order` CSS 變數 stagger;文字 unscramble;彩蛋按鈕 | 便宜優雅的 stagger 系統;分區 accent 讓長頁「有變化但成系統」 | terminal 游標/scramble 美學離開 dev event 就是 pandering |
| **Framer** | Display ~110px、tracking -5.5px、行高 0.85;body Inter 15px | #090909 canvas,「黑就是留白」;漸層聚光卡片限量配給 | 頁面本身就是產品 demo;spring physics;官方自己警告「不要每區都動」 | 飽和漸層限量使用可取代陰影;產品在頁面裡實際運作是最強證明 | 「黑底巨字+紫漸層」是 2025 最飽和的陳腔濫調 |
| **Raycast** | Inter + ss03,深色 UI 上 body 用**正** tracking 增加空氣感 | 藍黑 #07080a + 4 階 surface ladder,**唯一主行動色是純白**,紅色全站只用一次 | 零陰影、色階分層;keycap 字形;真實產品截圖當 hero | elevation-by-color;accent 稀缺紀律(白一個、紅一次) | near-black + hairline + glow card 公式已是預設模板 |

### 1.2 跨站共同結論(2025–2026)

1. **向克制收斂**:Linear 去紫、Stripe 減漸層、頂級網站正從「glow everything」退回暖灰單色 + 一個稀缺 accent。
2. **字體是護城河**:每家都有自有字體或深度調校(feature-settings、tracking 規則)。差異化在字重/tracking 規則,多於字體本身。
3. **全部都展示真實產品介面**,不用抽象 3D 插圖。Hero 就是產品。
4. **動效 token 化且限量**:統一 easing/duration token;動畫必須表達因果,不做裝飾。
5. **深色 UI 深度 = 邊框階梯/色階分層**,不是陰影。

### 1.3 2026 必須整組避開的陳腔濫調

- Stripe mesh 漸層 hero
- 2022-Linear 紫光深色風(黑底 + 紫漸層 + glow cards)
- 深色 bento + 綠光(v0 / Lovable 預設輸出)
- Claude-core(奶油 + 珊瑚 + serif)整組照抄
- 自動播放影片牆、全頁 scroll-jacking
- Inter 預設樣式直接上(無調校)

---

## 2. 工程師 Portfolio 研究(19 站)

樣本:leerob.com、brittanychiang.com、rauno.me、paco.me、emilkowal.ski、joshwcomeau.com、rauchg.com、karpathy.ai、simonwillison.net、mitchellh.com、brandur.org、jvns.ca、antfu.me、samwho.dev、ciechanow.ski、bruno-simon.com、henryheffernan.com、Jesse's Ramen、cassie.codes。

### 2.1 資深 vs 樣板的分水嶺

**讀起來是資深(Senior)**:
- 單一字體,或一 sans + 一 mono;近單色 + 單一 accent
- 首屏一段話身分陳述(角色 + 公司 + 一個差異點),不是 hero banner
- 專案是「標題 + 一句話 + 連結」,不是截圖卡片牆
- 可信度來自:量化成果(「100k+ installs」)、深度寫作、具名機構輕描淡寫地放在行文中
- **裝飾密度 < 內容密度**(所有資深網站的共同比例)

**讀起來是 Junior 樣板**:
- 技能百分比條(沒有任何一個資深網站有技能區)
- 紫藍漸層 hero、打字機標題、「Hi, I'm X 👋」
- 技術 logo 沙拉牆、三卡片專案 grid + 「React | Node | MongoDB」
- 粒子背景、游標拖尾、preloader 計數器、聯絡表單(資深都用 mailto)

### 2.2 動畫:高級 vs 廉價

- **高級** = 物理感微互動 + 服務理解:emilkowal.ski(教動畫的人網站幾乎沒動畫)、rauno.me(把實驗動畫隔離到獨立「Craft」區,主站冷靜)、samwho.dev(動畫即教學:文章內可操作的負載平衡器模擬)
- **廉價** = 與意義脫鉤的環境動效:粒子、cursor trail、scroll-jacking、tilt cards
- bruno-simon.com 的 3D 成立是因為他**賣的就是 Three.js 教學**,且有畫質切換與開源;對其他人是 overkill
- 指標事件:cassie.codes(曾是 SVG 動畫典範)已收站——動畫最大化主義者也在退向克制

### 2.3 後端/系統工程師如何視覺化(對本案最關鍵)

- **samwho.dev(金標準)**:內嵌動畫 SVG 模擬——「看著」round-robin vs least-connections 在負載下的不同行為
- **ciechanow.ski**:可拖曳、滑桿驅動的互動圖解;每個圖回答「改變這個會怎樣?」
- 80/20 法則:深度 case study 內文 + 乾淨靜態圖解就有八成效果;**一個真正互動的系統模擬勝過十個裝飾動畫**

### 2.4 值得偷學(附出處)

1. 獨立「Craft/Lab」區隔離實驗性互動(rauno.me、paco.me)
2. Mitchell Hashimoto「反履歷」:說完建了什麼、說已放下什麼、聚焦當下一件事——減法即資深
3. 經歷條目 = 散文 + 公司連結 + 極少 tag + 每段一個殺手級數據(brittanychiang.com)
4. 分型內容系統降低發佈門檻(brandur.org 的 Articles/Fragments;simonwillison 的 TIL)
5. 文章列表放瀏覽數作為活的社會證明(rauchg.com)
6. 一個藏在功能元素上的微獎勵彩蛋(joshwcomeau 的音效按鈕)
7. 星號標記代表作導流(jvns.ca)
8. 動態 per-page OG image(leerob / @vercel/og 已是標準配備)

### 2.5 SEO / 效能觀察

- 靜態生成是常態;Karpathy 極端到零框架手寫 HTML
- 完整 metadata 堆疊:sitemap、robots、JSON-LD、canonical、動態 OG
- RSS 是一等公民;next-themes 是深淺主題標準庫
- 重型內容漸進增強:畫質切換、demo 降級為靜態圖

---

## 3. 本案的三大結論

1. **差異化路徑已明確**:避開所有 AI 模板美學(紫光、mesh、bento+綠光、Claude-core),改走「工程藍圖/規格文件」語言——這與使用者的 Software Architect 定位天然吻合,且沒有被大量複製。
2. **最強的後端可信度武器**是「真實系統的互動式視覺化」(samwho/ciechanowski 路線),不是視覺特效。Hero 應該畫的是使用者「實際的」微服務平台。
3. **內容架構要做減法**:15 個內容項合併為少數幾條路由;資深感來自密度與深度,不是頁面數量。
