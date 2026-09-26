# 工具作者規範(儀器櫃 /tools)

> 這份文件是 100 件工具的唯一規範。新增工具前讀完;修改既有工具前也讀完。
> 參考實作:`src/tools/text-diff`(純演算法)、`src/tools/json-format`(解析與診斷)、
> `src/tools/password-generator`(密碼學與敏感輸入)。

---

## 1. 檔案配置

一件工具 = 一個資料夾,三個檔案,沒有第四種:

```
src/tools/<slug>/
  logic.ts        純函式。不 import React,不碰 DOM,不碰 window。
  logic.test.ts   node:test 單元測試。每個匯出的函式都要有測試。
  index.tsx       'use client' 元件,default export。
```

`<slug>` 必須與 `content/tools/registry.ts` 裡登錄的 slug 完全相同。
不要改 registry 的料號、slug 或分類;要改文案再說。

跑 `npm run prebuild` 讓載入器認得新工具(它只收錄 `index.tsx` 存在的 slug)。

---

## 2. 元件契約

```tsx
'use client';
import type { ToolProps } from '../types';

export default function MyTool({ l }: ToolProps) { ... }
```

`ToolProps` 是 `{ l: Loc; tool: Tool }`。`l` 是 `'zh' | 'en'`。
**不要** 加其他 props,**不要** 具名匯出元件,**不要** 用 `React.memo` 包外層。

### 文案

工具內的字串直接寫在工具裡,用 `t(l, '中文', 'English')`:

```tsx
import { t } from '@/lib/tools/locale';
<Btn onClick={run}>{t(l, '計算', 'calculate')}</Btn>
```

理由:100 件工具的字串若放進 `messages/*.json`,每一頁都會下載全部。
放在工具裡,它只出現在這件工具自己的 chunk。

中文是主要語言,寫得像人講話,不要「輕鬆搞定」「一鍵完成」這種行銷語氣。
英文寫得簡短即可。

---

## 3. 可以用的東西(以及只能用這些)

### 版面與控制項 — `@/components/tools/bench`

| 匯出 | 用途 |
|---|---|
| `Bench({left,right,leftLabel,rightLabel,leftAside,rightAside})` | 輸入/輸出雙欄工作台,中間刻度接縫自動插入 |
| `Panel({label,aside,children})` | 單欄區塊 |
| `Row` | 橫向控制列 |
| `Area` / `Input` / `Select` / `Check2` / `Seg` | 表單控制項(都自帶 label 與 hint) |
| `Btn` / `CopyButton` / `ResetButton` | 按鈕 |
| `Out` / `Note` / `Table` / `DropZone` | 輸出、訊息、表格、檔案拖放 |
| `Readout({l, items})` | 底部量測讀數條 |

### 工具函式 — `@/lib/tools/*`

`locale`(t/loc)、`format`(bytes/count/ms/fixed/utf8Length)、
`random`(below/between/pick/shuffle/sample/randomBytes/entropyBits)、
`bytes`(toHex/fromHex/toBase64/fromBase64/encodeUtf8/decodeUtf8/equalBytes)、
`storage`(read/write/remove,**敏感工具禁用**)、
`isolate`(把會失控的運算丟進 Worker 並設超時)、
`useClientFacts`(useOnline/useOfflineCapable/useHydrated)。

### CSS

用 `src/styles/tools.css` 既有的 class(`inst-*`)與 Tailwind utility。
需要新 class 時加進 `tools.css` 並寫註解說明為什麼。

---

## 4. 硬性規則

違反這幾條的 PR 一律退回。前三條 eslint 會直接擋下。

1. **禁用 `Math.random()`。** 用 `@/lib/tools/random`。
   理由:它不是密鑰來源,而且用它做出來的密碼產生器外表看不出差別。
2. **禁用 `eval` / `new Function`。** 需要算式就自己寫剖析器(見 G04)。
3. **禁用 `dangerouslySetInnerHTML`。** 使用者貼進來的東西永遠不可以被當成標記。
   要預覽 HTML/Markdown,渲染在 `<iframe sandbox="" srcdoc={...}>` 裡。
   要預覽 SVG,用 `<img src={blobUrl}>`,不要 inline 進 DOM。
4. **不發出任何網路請求。** 沒有 fetch、沒有 XHR、沒有 WebSocket、沒有外部圖片。
   CI 會斷言頁面載入後零跨域請求,沒過就不會部署。
5. **不新增 npm 依賴。** 需要的演算法自己寫。真的不行,先問。
6. **敏感工具(registry 標 `sensitive`)不得持久化任何東西。** 不寫 localStorage、
   不寫 IndexedDB、不寫 URL query。
7. **不在 render 期間呼叫 `performance.now()`、`Date.now()`、`Math.random()`。**
   React 19 的純度規則會擋。讀數用純粹的量測值(位元組、筆數、深度),不要計時。
8. **不在 effect 裡同步 `setState`。** 用 `useSyncExternalStore`(見 `useClientFacts.ts`)
   或在事件處理器裡設狀態。
9. **`logic.ts` 不可使用 TypeScript parameter property**(`constructor(readonly x: number)`)、
   enum、namespace。Node 的 type-stripping 測試執行器不支援,測試會直接掛掉。
10. **會爆炸的運算要有界線。** 正規表達式、無上限的迴圈、大檔解析:
    設上限並在超過時給訊息,不要讓分頁凍住——在瀏覽器裡凍住等於當掉。

---

## 5. 測試

`logic.ts` 的每個匯出都要有測試。指令:`npm test`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myFunction } from './logic.ts';   // 副檔名 .ts 必須寫出來
```

測什麼(照這個順序想):

- **來回轉換**:encode 之後 decode 等於原值。
- **邊界**:空字串、單一元素、極大值、負數、0、非法輸入、Unicode 與 emoji、
  中文、換行符號差異(CRLF/LF)。
- **已知答案**:演算法要對照公開的測試向量或手算結果,不要只測「不會拋錯」。
  金融試算、檢查碼、級距計算必須逐案對表。
- **會拋的要驗它拋**:`assert.throws(() => f(bad), ErrorType)`。

不要為了讓測試過而放寬 logic。測試發現的是真的 bug。

---

## 6. 資料表要標版本

台灣假日、電費級距、匯率、廠商係數這類會過期的資料:

- 在檔案裡用註解寫清楚來源與版本日期。
- **在 UI 上讓使用者可以編輯**,並註明「以帳單/公告為準」。
- 不要假裝它永遠正確。不確定的數字寧可讓使用者自己填。

---

## 7. 原理文章

`registry.ts` 標了 `indexable: true` 的工具要寫「原理」,放在
`content/tools/notes/<drawer>.ts`(每個抽屜一個檔案,不要動別人的檔案)。

寫法:兩到四段散文,中文為主,英文寫短版。內容是
**這個工具在算什麼、為什麼這樣算、什麼情況會不準**——
不是操作說明。`limits` 欄位寫它不做什麼、以及該改用哪一件工具。

這段文字同時是這一頁能進搜尋結果的唯一理由。沒有實質內容的頁面會被
當成 doorway page,拖累整個網域。

---

## 8. 設計

工具區是**零件型錄 + 儀器工作台**,不是 SaaS landing page。

**不要**:卡片、陰影、圓角膠囊、漸層、玻璃模糊、每個工具一個圖示方塊、
emoji、彩色徽章牆、置中大標配兩顆按鈕。

**要**:密度。等寬字放數值與標籤,`font-variant-numeric: tabular-nums` 讓數字不跳動。
分隔用細線,不用陰影。主要動作只有一個(`data-primary`),其餘都是線框按鈕。
結果即時更新,不要「送出」按鈕(除非運算很貴)。

每件工具**必須**以 `<Readout>` 結尾。讀數是純粹的量測值,例如:

```tsx
<Readout l={l} items={[
  { k: t(l, '輸入', 'in'), v: bytes(size) },
  { k: t(l, '筆數', 'rows'), v: count(rows.length) },
]} />
```

`Readout` 會自動補上最後一項「運算位置:本分頁」——那是這一區的簽名,
不要自己再寫一個。

---

## 9. 無障礙

- 每個控制項都要有 label(`bench` 的元件已內建)。
- 結果區塊加 `aria-live="polite"`。
- 錯誤訊息用 `<Note error>`,它會帶 `role="alert"`。
- 狀態不可以只靠顏色傳達,要有文字或符號。
- 鍵盤可以完成所有操作。

---

## 10. 收工前

```bash
npm run prebuild     # 讓載入器收錄新工具
npx tsc --noEmit     # 型別
npx eslint src content
npm test             # 單元測試
npm run build && npm run verify   # 零外送、CSP、離線
```

五個都過才算完成。
