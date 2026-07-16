# Phase 2 — Information Architecture

> 前置:Phase 1 Proposal 已通過(2026-07-16)。
> 確認決策:zh-TW 為主 + en 切換|Vercel|binbin|binbinbob.work|琥珀電路視覺方向。

---

## 1. 路由結構(Sitemap)

```
https://binbinbob.work
│
├── /                        首頁(zh-TW,root 無前綴)
├── /work                    專案索引
│   ├── /work/microservices-platform   大型 Django 微服務平台
│   ├── /work/ai-nail-platform         AI 美甲平台
│   ├── /work/react-admin              React 大型後台
│   ├── /work/flutter-commerce         Flutter 電商 App
│   └── /work/ai-workflow              AI Agent 開發工作流
├── /architecture            互動式系統架構(全圖 + API Flow + Deployment Flow)
├── /ai                      AI Workflow(Agent pipeline 視覺化)
├── /about                   關於(減法自介 + Experience + Timeline + Achievements + Stack)
│
└── /en/...                  上述全部路由的英文版(prefix 策略:as-needed)
```

- **Slug 一律英文**(SEO、分享連結可讀性),中英文版共用 slug
- `/blog` 於 v1.1 保留結構(RSS-ready),首發不含——避免空 blog 上線(比沒有更傷)
- 404 頁面:藍圖風格 + 導回首頁

## 2. i18n 策略

| 項目 | 決策 |
|---|---|
| 預設語系 | `zh-TW`(root,無前綴)——主要受眾與使用者要求 |
| 英文 | `/en` 前綴,`localePrefix: 'as-needed'` |
| hreflang | 每頁互指 `zh-TW` / `en` + `x-default` → zh-TW |
| 切換器 | 導覽列 mono 樣式「EN / 中」,切換後停留在同一頁 |
| Mono 標籤 | 章節編號、eyebrow、數據標籤**兩語系皆保持英文 mono**(工程圖紙慣例,也是設計簽名) |
| 內容儲存 | UI 字串 → next-intl messages;結構化內容(專案/經歷)→ 型別化 TS 內容模組,per-locale 欄位 |

## 3. 需求項目 → 結構映射(15 項全數落位)

| 需求項 | 位置 |
|---|---|
| 首頁 | `/` |
| About | `/about` §1 + 首頁 03 哲學區帶出 |
| Experience | `/about` §2(散文式條目 + 每段一個關鍵數據) |
| Architecture | `/architecture`(首頁 02 放預覽入口) |
| Projects / Case Studies | `/work` + `/work/[slug]`(八段式模板) |
| Tech Stack | `/about` §5(行文 + Dependency Constellation;無 logo 牆) |
| Development Philosophy | 首頁 03(宣言體,3–4 條) |
| AI / AI Workflow | `/ai` |
| System Design | `/architecture` + 各 case study Architecture 段 |
| Blog | v1.1(結構保留) |
| GitHub | 導覽列圖示 + footer + About 行文連結 |
| Timeline | `/about` §3(垂直時間軸) |
| Achievements | `/about` §4(量化數據,counter 動畫) |
| Contact | 首頁 04 + footer(mailto + GitHub,**不做表單**——研究確立的資深訊號) |

## 4. 各頁資訊層級

### `/` 首頁(規格書封面)——5 個編號章節
```
00 HERO        身分陳述(1 句)+ 角色列(mono)+ 雙 CTA + Live System Schematic
01 SELECTED WORK   3–4 個專案「列表式」條目:標題+一句話+1 個關鍵數據+→
02 ARCHITECTURE    互動架構圖的靜態預覽(hover 有微動)→ /architecture
03 PHILOSOPHY      開發哲學宣言 3–4 條(大字,一屏一條的 scroll 節奏)
04 CONTACT         「找我設計系統」+ mailto CTA(magnetic)+ GitHub
```

### `/work/[slug]` Case Study(八段式模板,所有專案一致)
```
Hero(標題 + 角色 + 期間 + stack 行)
01 Problem        商業/技術問題,2–3 段
02 Constraints    限制條件(mono 列表)
03 Architecture   SVG 架構圖(可含該案簡化互動)+ 設計取捨說明
04 Responsibilities  我負責什麼(第一人稱、具體)
05 Challenges → Solutions  2–4 組,每組:挑戰一段 + 解法一段
06 Performance    量化成果(counter + tabular-nums;僅真實數據)
07 Lessons        學到什麼(誠實,包含會改做的事)
→ Next case study(FLIP 轉場入口)
```

### `/architecture`
```
00 全景互動圖(pan/zoom/點擊節點 → 側欄:職責、依賴、資料儲存)
01 API Flow(下單請求生命週期時間軸動畫)
02 Deployment Flow(真實流程,待使用者提供細節)
行動裝置:降級為分層列表 + 可縮放靜態 SVG
```

### `/ai`
```
00 論點:AI 是工程流程的放大器,不是替代品
01 Agent Pipeline 圖(Architecture/Code/Security/Performance Review、Docs)
02 終端機式 review 輸出動畫(全站唯一 typing 效果)
03 實際成效(真實數據)
```

### `/about`
```
01 減法自介(Hashimoto 式:建過什麼 → 現在專注什麼)
02 Experience(散文條目)   03 Timeline(垂直)
04 Achievements(量化)     05 Tech Stack(Constellation + 行文)
06 Contact
```

## 5. 導覽與 Breadcrumb

- 主導覽(全站一致):`Work / Architecture / AI / About` + Contact(琥珀 pill)+ 主題切換 + 語言切換;行動版:全螢幕 overlay(玻璃)
- Breadcrumb:僅 `/work/[slug]`(首頁 › Work › 專案名)+ BreadcrumbList JSON-LD
- Footer:一行身分陳述、mailto、GitHub、語言/主題、© binbin

## 6. 內容模型(型別摘要,Phase 7 落地)

```ts
type Localized = { zh: string; en: string }
type Project = {
  slug: string; title: Localized; oneLiner: Localized;
  role: Localized; period: string; stack: string[];
  keyMetric?: { value: string; label: Localized };   // 首頁列表用
  problem: Localized[]; constraints: Localized[];
  architectureNotes: Localized[]; diagram: string;    // SVG 元件名
  responsibilities: Localized[];
  challenges: { c: Localized; s: Localized }[];
  performance: { value: string; label: Localized; context?: Localized }[];
  lessons: Localized[];
}
type Experience = { org: string; role: Localized; period: string;
  summary: Localized; highlight: { value: string; label: Localized } }
```

## 7. 自我 Review

- **決策依據**:5 路由 + 錨點結構直接承襲研究結論(paco.me 的一屏骨架、brittanychiang 的經歷條目、brandur 的文件式層級);case study 八段式模板滿足需求列出的 Problem→Lessons 全部欄位
- **與頂尖比較**:導覽 4+1 項,少於 Linear(6)、與 Vercel 主導覽同量級;URL 深度 ≤2,符合企業級 SEO 慣例
- **發現問題與修正**:(1) blog 首發若空置是負訊號 → 移至 v1.1;(2) slug 若用中文會產生 percent-encoding 醜連結 → 統一英文 slug;(3) mono 標籤翻中文會破壞工程圖紙識別 → 保持英文(有真實世界慣例支持:工程圖注記慣用英文)
- **驗證**:15 需求項全數映射(§3 表);每頁皆有單一 h1 與可線性閱讀的標題序列(SEO/a11y 前提)
