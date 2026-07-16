# Phase 3 — Wireframes

> 標記:`|` = 全頁垂直導線(1px hairline)、`+` = 區塊交界十字刻度、`[mono]` = JetBrains Mono、其餘為 Archivo(+ Noto Sans TC)。
> 斷點:375 / 768 / 1024 / 1440。以下為 1440(desktop)與 375(mobile)。

---

## 1. 全域框架

```
┌────────────────────────────────────────────────────────────┐
│ NAV(fixed, glass blur, 高 64px)                            │
│  ◆ binbin        Work  Architecture  AI  About   ⌖Contact ◐ EN │
├────────────────────────────────────────────────────────────┤
│ ╷         ╷              (內容區 max-w 1200)   ╷          ╷ │ ← 4 條導線
│ │  ...sections...                              │          │ │    貫穿全頁
│ ╵         ╵                                    ╵          ╵ │
├────────────────────────────────────────────────────────────┤
│ FOOTER: 一句身分陳述 / mailto / GitHub / EN·中 / © binbin   │
└────────────────────────────────────────────────────────────┘
```
Mobile(375):logo + 漢堡 → 全螢幕玻璃 overlay(大字導覽,stagger 進場);導線縮為左右 2 條。

## 2. `/` 首頁

### Desktop
```
+──────────────────────────────────────────────+
│ [00 / SYSTEM OVERVIEW]                (mono) │
│                                              │
│ 我設計大型系統。                    (H1 96px)│
│ 從資料庫到 AI Workflow。                     │
│                                              │
│ [SOFTWARE ARCHITECT · BACKEND · AI SYSTEMS]  │
│ ( 檢視作品 )  ( 聯絡我 )●magnetic            │
│                                              │
│ ┌─ LIVE SCHEMATIC ─ SVG 佔滿下半 viewport ─┐ │
│ │  [auth]──[member]    ●→ pulse             │ │
│ │    │   ╲   │                              │ │
│ │ [nginx]─[order]──[inventory]              │ │
│ │    │       │╲                             │ │
│ │ [mysql] [redis] [notification] ...        │ │
│ └───────────────────────────────────────────┘ │
+──────────────────────────────────────────────+
│ [01 / SELECTED WORK]                         │
│ ────────────────────────────────────────────│
│ 大型微服務平台        數十個服務·單一平台  →│  ← 列表列:hover 時
│ [DJANGO · MYSQL · REDIS]      [30+ services] │     邊框亮 + 標題位移 4px
│ ────────────────────────────────────────────│
│ AI 美甲平台           AI 辨識到 POS 的全鏈 →│
│ ────────────────────────────────────────────│
│ (× 3–4 列,絕不做圖片卡片牆)                │
+──────────────────────────────────────────────+
│ [02 / ARCHITECTURE]                          │
│ 系統不是畫出來的,是取捨出來的。      (H2)  │
│ ┌─ 架構圖預覽(靜態+微 pulse)────────────┐ │
│ └── ( 探索完整架構 → /architecture ) ──────┘ │
+──────────────────────────────────────────────+
│ [03 / PHILOSOPHY]  一屏一條,scroll 節奏     │
│   「先量測,再優化。」            (48–64px) │
│   「邊界比元件重要。」                       │
│   「AI 放大工程,不取代工程。」              │
+──────────────────────────────────────────────+
│ [04 / CONTACT]                               │
│ 需要能扛規模的系統?          (H2 大字)     │
│ ( hello@… )●magnetic   [GITHUB ↗]            │
+──────────────────────────────────────────────+
```

### Mobile(375)
Hero:H1 縮至 clamp 下限(~44px zh),Schematic 改為「精簡 8 節點直式拓撲」高 45vh,pulse 保留;Work 列表列改上下堆疊(標題/一句話/數據);Philosophy 每條 32px;所有 hover 效果改為 press 狀態。

## 3. `/work` 索引
```
[WORK / INDEX]  (mono eyebrow) + H1
表格式索引(藍圖 BOM 表概念):
──────────────────────────────────────────────
NO.  PROJECT            SCOPE           YEAR  →
01   微服務平台          30+ services    20xx  →
02   AI 美甲平台         AI+AR+POS+商城  20xx  →
──────────────────────────────────────────────
每列 → FLIP 轉場進 case study
```

## 4. `/work/[slug]` Case Study
```
Hero: [WORK / 01] + H1 標題 + 一句話
      [ROLE]…  [PERIOD]…  [STACK]…   (mono 三欄 meta 列)
+ 01 PROBLEM      散文 2–3 段(65ch 行寬,置中欄)
+ 02 CONSTRAINTS  mono 列表(左緣琥珀刻度線)
+ 03 ARCHITECTURE 全幅 SVG 圖(sticky 說明文字在側欄逐段對應圖中高亮)
+ 04 RESPONSIBILITIES  條列
+ 05 CHALLENGES → SOLUTIONS  左挑戰/右解法 兩欄(mobile 堆疊)
+ 06 PERFORMANCE  3–4 個大數字(counter,tabular-nums)+ context 小字
+ 07 LESSONS      引言體
→ NEXT: 下一個專案(全幅列,hover 箭頭位移)
```

## 5. `/architecture`
```
Hero: H1 + 說明一段
00 全景圖:全幅互動畫布(pan/zoom,左上 mono 圖例,右側 340px 詳情側欄
   ── 點節點滑入:名稱/職責/依賴/資料儲存)
01 API FLOW:水平時間軸,6 站點(Client→Nginx→Auth→Order→Inventory→Resp)
   scroll-scrub 驅動 pulse 前進,每站下方注記
02 DEPLOYMENT FLOW:水平流程圖(真實流程,內容待補)
Mobile:00 改為「服務分層手風琴列表 + 靜態圖(可雙指縮放)」
```

## 6. `/ai`
```
Hero: H1「AI 在我的工程流程裡的位置」
01 PIPELINE:Commit → [Arch Review][Code Review][Security][Perf] → Docs
   (五個 Agent 節點,依序點亮)
02 終端機視窗(玻璃邊框):review 輸出 typing 動畫,可 skip
03 成效數據(真實)
```

## 7. `/about`
```
01 自介:大字兩段(建過什麼/現在專注什麼)
02 EXPERIENCE:散文條目(org mono 標籤 + 一段 + 1 個 highlight 數據)
03 TIMELINE:左緣垂直線 + 節點(scroll 逐點亮)
04 ACHIEVEMENTS:2×2 大數字格
05 STACK:Dependency Constellation(canvas)+ 一段行文
06 CONTACT 同首頁 04
```

## 8. 自我 Review

- **決策依據**:首頁列表式作品(非卡片牆)、meta 列 mono 三欄、BOM 表式索引均來自 Phase 1 研究的資深訊號;case study 的 sticky 圖文對應取自 ciechanow.ski 的「文字驅動圖解」模式
- **與頂尖比較**:一屏一概念(Apple)、編號章節(Linear)、表格索引(Vercel 的 token 表美學)
- **發現問題與修正**:(1) hero schematic 在 mobile 全圖會小到不可讀 → 改精簡 8 節點直式版;(2) 05 挑戰/解法兩欄在 375px 擁擠 → 堆疊;(3) 互動畫布在觸控裝置與頁面捲動衝突 → mobile 降級為手風琴 + 靜態圖(同時就是 a11y/SEO fallback)
- **驗證**:每頁 wireframe 皆標注 mobile 降級方案與 hover→press 對應;無任何區塊依賴 hover 才能取得資訊
