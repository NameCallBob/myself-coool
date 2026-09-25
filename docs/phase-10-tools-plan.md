# Phase 10 提案 —「儀器櫃」工具區:100 個純本地工具 + 離線 PWA

> 立項:2026-09-26|狀態:待使用者裁決
> 來源:使用者要求「做一個小工具頁面,可多達 100 種工作/生活常用工具,
> 靜態網站可行、無資安問題、工作上敢用、不好被破解,並能當 PWA 離線使用」。

---

## 1. 先講定位:這頁在品牌站裡憑什麼存在

這站的目的不是自介,是讓 Recruiter / CTO 看完覺得「這人能設計大型系統」。
一個工具堆本身不會產生這種印象——網路上這種頁面多到爛掉,而且大多是
「把 npm 套件包一層 UI」。**但一個帶硬約束的工具子系統會。**

約束是這樣的:100 個工具、零網路出口、離線可用、每個工具的核心邏輯有單元測試、
CI 會斷言「互動後除靜態資產外不發出任何請求」。
這句話才是展示品——它證明的是**你會定規格、會把規格變成可驗證的斷言**,
而不是「你會寫 Base64 編碼器」。

所以這頁對外的名字不該是「小工具」。建議 **`/tools`,標題「儀器櫃 / INSTRUMENTS」**,
定位一行話寫死在頁首:

> 一百件在瀏覽器裡跑完的工具。不上傳、不連線、不記錄。離線也能用。

反向風險要先說清楚:**工具區不能搶走品牌站的主敘事。**
作法是 nav 入口放在最後一個、首頁不放工具區入口、`/about` 用一句話提及它是自用工具。
`/work` 的專案敘事仍是主體。

---

## 2. 現況評估(逐項對照實際檔案)

### 2.1 沒有後端這件事,對這個需求是優勢不是限制

`next.config.ts` 是 `output: 'export'` + GitHub Pages,沒有 middleware、沒有 API route、
沒有 Server Action。工具只能全在瀏覽器跑——而這正好就是使用者要的資安性質:
**沒有伺服器可以外洩資料,也沒有伺服器可以被打。** 攻擊面只剩下三個:

1. 送進瀏覽器的 JS 本身(供應鏈 / 我們自己寫錯)
2. 使用者貼進來的內容(XSS / ReDoS / 解析器炸開)
3. 瀏覽器本地儲存(localStorage / IndexedDB 殘留)

第 4 節會分別處理。整份計畫的核心就是把這三條路都堵死,而不是含糊地說「純前端所以安全」。

### 2.2 i18n:每個工具會變成兩頁

`src/i18n/routing.ts` 是 `localePrefix: 'always'`(靜態託管沒有 middleware 可改寫語系)。
100 個工具 = 200 個 HTML,加上現有 43 個。這對 `next build` 沒問題,
但會直接影響 PWA 預快取策略(第 5 節有解法:app-shell fallback,不預快取 200 個 HTML)。

### 2.3 basePath 是變數,不能寫死 `/`

`next.config.ts` 的 `basePath` 來自 `PAGES_BASE_PATH`,子路徑預覽時不是空字串。
Service Worker 的註冊路徑、`scope`、manifest 的 `start_url` 全都必須用 basePath 組出來。
硬寫 `/sw.js` 在子路徑預覽會 404,而且 SW 的 scope 會錯。

### 2.4 字型 subset 是個會靜默壞掉的陷阱 ⚠️

`src/app/[locale]/layout.tsx` 的註解寫得很清楚:display face 是自架 subset,
只切了實際用到的 1,161 個漢字,**subset 外的字會靜默 fallback 到系統襯線體**。

100 個工具的中文 UI 文案會引入大量新字(「網路遮罩」「材積」「累進級距」「輪班」…),
如果沿用 `font-serif`,畫面會出現部分字換字體的破面。

**決策:工具區不使用 Noto Serif TC display face。**
標題與數值用 JetBrains Mono,說明文字用系統 sans(`system-ui`)。
理由不只是規避陷阱——儀器盤本來就該是 mono + sans,serif 是敘事頁的語言。
這同時讓工具區的字型傳輸量是 0。

即便如此,`scripts/subset-fonts.mjs` 仍應在每批工具上線後重跑一次,確保索引頁若用到 serif 標題不破面。

### 2.5 Bundle:100 個工具絕對不能共用一個 chunk

現況 `out/_next/static/chunks` 共 900KB。若把 100 個工具塞進同一個 client bundle,
光工具邏輯就會是現在全站的數倍,而且是首頁也要付的代價(共用 framework chunk 會被污染)。

**決策:一個工具一個 chunk,用 `next/dynamic` 動態載入,不進共用 bundle。**
索引頁只載 registry 的 metadata(純字串,約 15–20KB),不載任何工具實作。

### 2.6 PWA 目前是零

沒有 manifest、沒有 Service Worker、沒有 192/512 PNG 圖示(只有 `src/app/icon.svg`)、
沒有 apple-touch-icon。第 5 節是完整補件清單。

### 2.7 沒有測試框架

`playwright` 只用來截圖(`scripts/shots.mjs`、`scripts/mobile-shots.mjs`),沒有單元測試。
**100 個工具沒有測試就是 100 個未驗證的斷言。**
一個算錯的房貸試算或漏字元的 Base64,比沒有這個工具更糟。
第 10 節會把測試列為 Phase 10.1 的必要條件,不是之後補。

### 2.8 可直接複用的資產

`SectionHeading`(編號章節)、`GridGuides`(導線)、`Reveal`、`tick` 十字刻度、
`seo.ts` 的 `isIndexable` / `alternatesFor` / `ogFor`、`sitemap.ts` 的多語結構、
design tokens(製圖紙 + 紅墨水 + `--data-teal` / `--data-slate`)。
工具區不需要新的視覺語言,只需要一個新的版面型態(工作台)。

`gsap` 已在依賴裡,但**工具區不用它**。工具要的是即時回饋,不是編排動畫。

---

## 3. 需要先裁決的取捨

| 議題 | 選項 | 建議 |
|---|---|---|
| 工具區要不要雙語 | (a) 只做 zh-TW(en 導回索引)(b) 全部雙語 | **(b) 全部雙語**,但 en 只翻 UI 與工具名,「原理」長文只寫 zh-TW,en 顯示簡短版。全站 hreflang 一致性不能為工具區破例 |
| SEO | (a) 全部索引 (b) 只索引索引頁+精選 | **(b)**。100 個薄頁會被判 doorway page,拖累整站評分。沿用現有 `isIndexable` 機制,只放行有「原理」長文的工具 |
| Nav 入口 | (a) 加進 nav (b) 只放 footer | **(a) 加進 nav 但排最後**。工具區要能被找到,但不能排在 `/work` 前面 |
| 資料持久化 | (a) 全部不存 (b) 非敏感可存 | **(b)**,但敏感工具(JWT / TOTP / 加解密 / PII 遮蔽)硬編碼禁止持久化 |

---

## 4. 資安規劃:使用者說的「資安」其實是三件不同的事

這節是整份計畫的重點。含糊地講「純前端所以安全」是不夠的——
純前端的頁面照樣可以偷偷 POST 你貼進去的 JWT。要做的是**把「不會偷」變成可驗證的事實**。

### 4.1 第一件:資料不會離開這台電腦(零出口)

**設計原則**

- 工具區的任何程式碼不得呼叫 `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource`
  對外通訊。唯一允許的網路行為是瀏覽器自己抓同源靜態資產(JS chunk、CSS、字型)。
- 不放 analytics、不放字型 CDN、不放任何第三方 script。主站現在就沒有,工具區也不會有。
- 不用 `<img src>` 指向外部網址(那是最容易被忽略的 egress 管道)。

**三道可驗證的防線**

1. **CSP(`<meta http-equiv>`)**
   GitHub Pages 無法設 HTTP header,所以只能用 meta 標籤。要誠實知道它的限制:
   meta 版的 CSP **不支援 `frame-ancestors` 與 `report-uri`**,其餘指令有效。
   ```
   default-src 'self';
   connect-src 'self';
   img-src 'self' data: blob:;
   media-src 'self' blob:;
   script-src 'self' 'wasm-unsafe-eval';
   style-src 'self' 'unsafe-inline';
   font-src 'self';
   object-src 'none';
   base-uri 'none';
   form-action 'none';
   worker-src 'self' blob:;
   ```
   `connect-src 'self'` 就是「零出口」的機器可執行版本:任何對外請求會被瀏覽器直接擋掉。
   ⚠️ 注意 `layout.tsx` 目前有一段 `dangerouslySetInnerHTML` 的 inline script(標記 `js` class),
   `next-themes` 也會注入 inline script。靜態匯出拿不到 per-request nonce,
   所以要嘛用 `'sha256-...'` hash(build 時算,寫進 script 檔或改成外部檔案),
   要嘛把那段 inline script 移進 `public/` 的獨立 `.js`。
   **建議後者**——一個檔案換掉一整類 CSP 例外,比維護 hash 清單穩。
   `'wasm-unsafe-eval'` 只在確定要用 WASM(Argon2 / 影像編碼)時才加,否則拿掉。

2. **Service Worker 當第二道閘**
   SW 的 `fetch` handler 會看到頁面發出的每一個請求。
   對**非同源**的請求直接 `Response.error()`,不轉發。
   這比 CSP 更強的地方在於:即使某天 CSP meta 被誤刪,SW 還在。

3. **CI 斷言(最重要的一道)**
   Playwright 開每一個工具頁,注入代表性輸入並互動,
   攔截所有 request,斷言「除同源靜態資產外,request 數為 0」。
   這條測試把承諾變成 build gate——**沒過就不能 deploy**。
   這也是整個工具區最值得寫進 `/about` 的一句話。

**頁面上的可驗證承諾**

工具頁底部顯示 build commit hash + 一行「本頁在載入完成後不發出任何網路請求」,
並附一句怎麼自己驗(開 DevTools Network,清空,操作工具,看筆數)。
承諾要附驗證方法才叫承諾,否則只是文案。

### 4.2 第二件:產生出來的東西「不好被破解」

這是密碼學強度問題,規則要寫死在 lint 與 code review 裡:

- **亂數一律 `crypto.getRandomValues()`。`Math.random()` 在工具區列為禁用**
  (加一條 ESLint `no-restricted-properties`)。密碼產生器用 `Math.random` 是經典漏洞,
  而且外表看不出來。
- 密碼 / passphrase 產生器要**顯示 entropy bits**,並用無模數偏差的取樣
  (rejection sampling,不是 `% charset.length`——取模會讓部分字元機率偏高)。
- 對稱加密只用 **AES-256-GCM**,金鑰由 **PBKDF2-SHA256 / 600,000 次迭代**(OWASP 2023 建議值)
  導出,每次加密新的隨機 salt + IV。若要更強再評估 Argon2id(WASM,約 50KB,opt-in)。
- 雜湊只提供 SHA-256/384/512;**MD5 與 SHA-1 可以做,但 UI 上標紅「僅供檔案校驗,不可用於安全用途」**。
- 非對稱金鑰用 WebCrypto `generateKey`(RSA-2048+ / ECDSA P-256),不自己實作。
- **不自己寫密碼學原語。** 一律走 WebCrypto。這條沒有例外。

### 4.3 第三件:工具本身不能害到使用者

工具會吃使用者貼進來的 HTML / JSON / SVG / Markdown / CSV / 二進位檔,這是真正的攻擊面:

| 風險 | 規則 |
|---|---|
| XSS | 使用者輸入**絕不**進 `dangerouslySetInnerHTML`。Markdown / HTML 預覽一律渲染在 `<iframe sandbox="" srcdoc>` 裡(空 sandbox = 無 script、無同源、無表單) |
| SVG 是可執行的 | SVG 預覽用 `<img src={blobURL}>`,不 inline 進 DOM(`<img>` 裡的 SVG 不會執行 script) |
| 動態求值 | `eval` / `new Function` 在工具區禁用(ESLint 強制)。計算機自己寫 tokenizer + shunting-yard parser,不偷懶 |
| ReDoS | Regex 測試器跑在 Web Worker,主執行緒設 timeout(如 2s)`worker.terminate()`。不然一個 `(a+)+$` 就把使用者的瀏覽器凍住 |
| 大檔凍結 UI | 檔案類工具(hash、CSV、圖片、hexdump)一律 Worker + 串流讀取 + 大小上限提示 |
| 解析器炸開 | JSON/YAML/XML 設深度與大小上限;XML 解析禁 external entity(XXE) |
| 剪貼簿 | 只在使用者明確點擊時**寫入**;**絕不主動讀取**剪貼簿 |
| 外連 | 任何外連 `rel="noopener noreferrer"` |

### 4.4 本地殘留:工作電腦上的「乾淨」

- localStorage key 一律命名空間化:`tools:<slug>:<key>`。
- **敏感工具硬編碼禁止持久化**:JWT 解碼、TOTP、AES 加解密、金鑰產生、PII 遮蔽。
  離開頁面即清空表單,並提供「閒置 N 分鐘自動清除」選項。
- 工具區設定頁提供**「清除本站所有本地資料」**一鍵按鈕
  (localStorage + IndexedDB + Cache Storage + 取消註冊 SW),並列出目前佔用了什麼。
- 便條 / 待辦 / 工時這類要持久化的,明確標示「只存在這台裝置的瀏覽器,沒有雲端,換裝置不會同步,清瀏覽器資料就會消失」。

### 4.5 供應鏈:第 2 節說的攻擊面第 1 條

工具區唯一真正的入侵路徑是 npm 套件。規則:

1. 預設自己寫。只有在「自己寫會寫錯密碼學或規格太大」時才引入依賴。
2. 允許引入的必須:**零 transitive dependency**、有明確 license、版本 pin 死、
   體積符合第 9 節預算、且 PR 裡要附一段「我看過它做什麼」的說明。
3. `npm ci` + lockfile 進版控(已是現況)。
4. 新依賴要走一次 review,不能夾在工具 PR 裡默默進來。

### 4.6 明確不做的工具(這是資安承諾的一部分)

以下全部需要把使用者資料送出去,**一律不做**,並在索引頁寫出為什麼不做:

即時匯率 / 股價、翻譯、AI 生成、短網址、IP 地理查詢、Whois / DNS / Ping / port scan、
密碼外洩查詢(HIBP 的 k-anonymity 仍是 egress)、網頁截圖、Email 可送達驗證、
雲端同步 / 跨裝置分享、任何 OAuth 登入。

「我們拒絕做什麼」比「我們做了 100 個」更能建立信任。

---

## 5. PWA 與離線

### 5.1 補件清單

| 項目 | 位置 | 備註 |
|---|---|---|
| Web App Manifest | `src/app/manifest.ts` | 與 `robots.ts` / `sitemap.ts` 同層。`export const dynamic = 'force-static'` |
| 圖示 192 / 512 / maskable | `public/icons/` | 由 `src/app/icon.svg` 產生。用已裝的 `playwright` 截圖產 PNG(沿用 `scripts/shots.mjs` 慣例),**不新增 sharp 依賴** |
| apple-touch-icon | `public/icons/apple-touch-icon.png` | 180×180,iOS 不吃 manifest icons |
| theme-color(雙主題) | `layout.tsx` metadata | `light` → `#faf8f4`,`dark` → `#12100e`,用 `media` 條件 |
| Service Worker | `public/sw.js` | 手寫,不引 Serwist(它需要 webpack 設定,與 Turbopack/靜態匯出組合是額外風險) |
| 預快取清單 | `public/sw-manifest.json` | build 後由 `scripts/gen-sw-manifest.mjs` 掃 `out/` 產生,含 build id |
| 更新提示 UI | `src/components/tools/UpdateBanner.tsx` | 不自動 `skipWaiting` |

`manifest.ts` 重點欄位:
```ts
start_url: `${basePath}/zh-TW/tools`,
scope: `${basePath}/`,
display: 'standalone',
categories: ['utilities', 'productivity'],
shortcuts: [ /* 3–5 個最常用工具 */ ],
```
`start_url` 指向工具區而不是首頁——安裝這個 PWA 的人要的是工具,不是看作品集。

### 5.2 Service Worker 策略

**關鍵設計:app-shell fallback,不預快取 200 個 HTML。**

`/tools/<slug>` 的 HTML 刻意做得極薄(殼 + slug,工具實作全在 dynamic chunk)。
SW 對 `/tools/*` 的導航請求採 network-first;離線時**回傳已快取的工具區殼頁**,
由 client 從 `location.pathname` 讀出 slug 再動態載入對應 chunk。
這樣預快取只需要:殼頁 ×2 語系 + 索引頁 ×2 + framework/registry chunk + CSS。
估計 **1–1.5MB**,而不是 3–6MB。

| 資源 | 策略 |
|---|---|
| 工具區殼頁、索引頁 | precache,network-first + cache fallback |
| `_next/static/**`(hash 檔名) | cache-first,永久(檔名變了就是新檔) |
| 工具 chunk | 首次開啟時 runtime cache(cache-first) |
| 字型 / CSS | cache-first |
| `public/memes/**`(3.1MB)、`og.png` | **排除**,不快取 |
| 非同源 | 直接拒絕(見 4.1) |
| 品牌站其他路由(`/work` `/about` `/ai`) | passthrough,不攔不快取 |

最後一條很重要:**SW 的 scope 必須是 root(才能管 `/tools`),但 fetch handler 只處理工具區與靜態資產。**
品牌站主體的更新行為、SEO、快取語意完全不受影響。這是風險隔離。

**版本管理**:cache name 帶 build id;`activate` 時刪掉舊 cache;
**不呼叫 `skipWaiting`**——使用者正在用工具時被換頁很糟。
改成顯示一條「有新版本可用 · 重新載入」的 banner,由使用者決定時機。

### 5.3「下載全部工具以供離線」

工具區設定頁提供一個按鈕:主動抓取所有工具 chunk 預熱 Cache Storage,顯示進度與總大小。
這解決了「我要上飛機前先準備好」的真實情境,而且把離線範圍交給使用者控制,
不會擅自下載幾 MB。UI 上同時顯示目前已離線可用的工具數 / 100。

### 5.4 iOS 與配額的老實話

- iOS 只在「加入主畫面」後才算 PWA,Safari 分頁裡不吃 standalone。
- iOS 對長期未使用的網站會清 storage(約 7 天),離線資料可能消失——
  便條 / 工時這類工具要在 UI 上說清楚,並提供匯出 CSV / JSON。
- 相機類工具(QR 掃描)需要 HTTPS(GitHub Pages 有)+ 使用者授權,且要處理
  `BarcodeDetector` 不存在的瀏覽器(Safari 尚未支援)→ 降級為提示,不靜默失敗。

---

## 6. 前端架構

### 6.1 路由與檔案配置

```
src/app/[locale]/tools/page.tsx            # 索引:搜尋 + 分類 + 離線狀態
src/app/[locale]/tools/[slug]/page.tsx     # 單一工具(generateStaticParams)
src/app/[locale]/tools/settings/page.tsx   # 離線下載 / 清除本地資料 / 儲存用量
src/app/manifest.ts

content/tools/index.ts                     # registry(metadata,純資料)
content/tools/categories.ts

src/tools/<slug>/index.tsx                 # UI(client component,動態載入)
src/tools/<slug>/logic.ts                  # 純函式,可單元測試
src/tools/<slug>/logic.test.ts

src/components/tools/ToolShell.tsx          # 編號 + 名稱 + 說明 + 隱私徽章 + 重設
src/components/tools/Workbench.tsx          # 輸入/輸出雙欄版面
src/components/tools/{Field,CopyButton,DropZone,ResultPane,DataTable}.tsx
src/components/tools/CommandPalette.tsx     # ⌘K,索引 registry
src/lib/tools/{worker,clipboard,file,entropy}.ts

public/sw.js
public/sw-manifest.json                     # build 產生
scripts/gen-sw-manifest.mjs
scripts/gen-icons.mjs
```

### 6.2 Registry 的形狀

```ts
type Tool = {
  id: string;                    // 'A03'
  slug: string;                  // 'text-diff'
  category: CategoryId;
  name: Localized;
  blurb: Localized;              // 一行說明(索引頁與 meta description)
  keywords: string[];            // 搜尋用,含中英與別名
  offline: boolean;              // 是否完全離線可用
  sensitive: boolean;            // 敏感輸入 → 禁止持久化 + UI 徽章
  needs?: ('camera' | 'clipboard' | 'file')[];
  weight: 'tiny' | 'small' | 'optIn';  // chunk 體積級別
  indexable: boolean;            // 有「原理」長文才 true
};
```
metadata 與實作分離的理由:索引頁 / 命令面板 / sitemap / SW 清單都只需要 metadata,
不該為了顯示一個名字而載入工具邏輯。

### 6.3 Code splitting

- 工具頁用 `next/dynamic(() => import(`@/tools/${slug}`))`。
  ⚠️ 完全動態的 import 路徑打包器無法靜態分析 →
  用 registry 產生**明確的 import map**(每個工具一行 `() => import('@/tools/text-diff')`),
  這樣每個工具才會各自成 chunk。這個 map 由 `scripts` 從 registry 產生,避免手寫遺漏。
- 共用工具邏輯(Worker wrapper、剪貼簿、檔案讀取)進一個小的共用 chunk。
- 目標:索引頁新增 JS ≤ 25KB gzip;單一工具頁 ≤ 25KB(殼)+ 工具 chunk。

### 6.4 狀態

輸入只活在 React state 與記憶體。非敏感偏好(如單位換算的預設單位)可存 localStorage。
URL **不帶輸入內容**——不要把使用者貼的 token 寫進 URL、history 與 Referer。
可分享的只有工具本身的網址。

---

## 7. UX 與視覺

版面型態叫**工作台(Workbench)**:左輸入、右輸出,窄螢幕上下堆疊。
沿用製圖紙 + 紅墨水 + 導線 + 編號章節,但**不要卡片陰影、不要 bento 格、不要發光**。
工具之間用製圖紙的表格線分隔,像儀器面板的標籤,不像 SaaS landing page。

- 索引頁:分類 A–J,每個工具一列「編號 · 名稱 · 一行說明 · 徽章」。
  `/` 聚焦搜尋、`⌘K` 開命令面板、方向鍵 + Enter 進入。純鍵盤可完成一切。
- 工具頁頭部:編號 + 名稱 + 一行說明 + 三枚徽章(本地運算 / 不連網 / 不儲存;敏感工具多一枚紅色「敏感輸入」)。
- 工具頁尾部:**「原理」一到三段散文**——這個工具在算什麼、邊界條件是什麼、什麼情況會不準。
  這段同時是 SEO 的實質內容,也是這頁不像模板的原因。
- 結果變動用 `aria-live="polite"` 播報;錯誤訊息貼在欄位旁,不用 toast。
- 所有數值輸出附複製按鈕,複製回饋用 inline 狀態文字,不用彈出層。
- 需要列印的工具(檢查表、報價單)附 `@media print` 樣式。
- WCAG 2.2 AA 是既有門檻,工具區不降級:每個互動元件可聚焦、對比達標、
  不用顏色單獨傳達狀態。

---

## 8. 一百件工具

標記:`⚙` 需 opt-in 額外依賴或資料表 · `🔒` 敏感輸入(禁持久化) · `📷` 需相機 · `∅` 無法完全離線

### A 文字處理
| # | 工具 | 備註 |
|---|---|---|
| A01 | 字數 / 字元 / 行數統計 | 中英混排、閱讀時間、各平台字數上限 |
| A02 | 大小寫與命名轉換 | camel / snake / kebab / Pascal / CONSTANT / Title |
| A03 | 排序 · 去重 · 反轉 | 自然排序、忽略大小寫、依長度 |
| A04 | 尋找取代 | 支援 regex、多行、擷取群組 |
| A05 | 文字 Diff | 逐行 / 逐字,自寫 Myers diff |
| A06 | 全形半形與中文排版修整 | 中英間距、標點正規化、彎引號 |
| A07 | 空白與縮排正規化 | tab↔space、trim、移除空行 |
| A08 | Slug 產生 | 非 ASCII 處理策略可選 |
| A09 | 假資料產生 | 中英姓名 / 地址 / email / UUID / Luhn 測試卡號 |
| A10 | 敏感資訊遮蔽 🔒 | 身分證 / 卡號 / 手機 / email / IP / token —— 貼 log 給同事前先過一遍 |

### B 編碼轉換
| # | 工具 | 備註 |
|---|---|---|
| B01 | Base64 編解碼 | 文字 / 檔案 / Data URI |
| B02 | URL 編解碼 + Query 編輯 | 表格化編輯 query 後重組 |
| B03 | HTML Entity 編解碼 | |
| B04 | Unicode 與字串跳脫 | `\uXXXX`、`\xNN`、碼位檢視 |
| B05 | BaseX 轉換 | Hex / Base32 / Base58 / Base64url |
| B06 | 換行與編碼正規化 | CRLF↔LF、BOM 偵測、UTF-8 驗證 |
| B07 | 程式碼字串轉義 | 貼進 JSON / Java / C / Shell / SQL |
| B08 | Morse 與 NATO 拼讀 | |
| B09 | ROT13 / Caesar / Atbash | UI 明示「這不是加密」 |
| B10 | Hex 檢視器 | 檔案 hexdump + magic number 識別,Worker |

### C 資料格式
| # | 工具 | 備註 |
|---|---|---|
| C01 | JSON 格式化 / 壓縮 / 驗證 | 錯誤定位到行列 |
| C02 | JSON ↔ YAML ↔ TOML ↔ XML ↔ CSV ⚙ | YAML/TOML 需輕量 parser |
| C03 | JSONPath 查詢 | jq 常用子集,自寫求值器(禁 eval) |
| C04 | JSON → 型別定義 | TypeScript / Zod / Go struct / Pydantic |
| C05 | JSON Diff | 結構化差異,非文字比對 |
| C06 | CSV / TSV 檢視器 | 排序、選欄、轉置、去重,Worker 處理大檔 |
| C07 | SQL 格式化 | |
| C08 | SQL ↔ JSON / CSV | 產生 INSERT / 解析結果集 |
| C09 | .env ↔ JSON / YAML / compose | |
| C10 | curl → 程式碼 | fetch / axios / requests —— **只解析,不送出** |

### D 開發者
| # | 工具 | 備註 |
|---|---|---|
| D01 | Regex 測試器 | Worker + timeout 防 ReDoS,附常用樣式庫 |
| D02 | Cron 解譯 | 白話說明 + 下次 N 次執行時間,支援 Quartz 6 欄 |
| D03 | JWT 解碼與本地驗簽 🔒 | HS256 需自備密鑰;明示 token 敏感性 |
| D04 | UUID / ULID / NanoID | 產生與解析(v4 / v7 時間戳還原) |
| D05 | 時間戳 ↔ 日期 | 秒 / 毫秒 / 微秒 / ISO / RFC2822 |
| D06 | 位元運算與浮點檢視 | AND/OR/XOR/shift、IEEE754 拆解 |
| D07 | Semver 比較 | `^` `~` 範圍解譯與命中測試 |
| D08 | Commit / PR 描述產生 | Conventional Commits 表單 |
| D09 | HTTP 速查 | 狀態碼、Header、快取語意 |
| D10 | 目錄樹 / ASCII 圖 | 縮排文字 → 樹狀圖 |

### E 密碼與安全
| # | 工具 | 備註 |
|---|---|---|
| E01 | 密碼產生器 🔒 | `getRandomValues` + rejection sampling + entropy bits |
| E02 | Passphrase 產生 🔒⚙ | Diceware 字表(中英),字表 opt-in 下載 |
| E03 | 密碼強度檢測 ⚙ | 離線常見密碼表 + entropy 估算 |
| E04 | Hash 計算 | 文字與檔案;MD5 / SHA-1 標註不可用於安全 |
| E05 | HMAC 計算 🔒 | |
| E06 | 檔案校驗碼比對 | 拖入檔案比對 checksum 字串 |
| E07 | AES-256-GCM 加解密 🔒 | PBKDF2-SHA256 600k,隨機 salt/IV,自帶格式說明 |
| E08 | 金鑰對產生 🔒 | RSA / ECDSA,匯出 PEM / JWK(WebCrypto) |
| E09 | TOTP 驗證碼 🔒 | 本地計算;預設不儲存 secret |
| E10 | 憑證與公鑰檢視 ⚙ | X.509 欄位、有效期、SSH 公鑰指紋 |

### F 時間與日期
| # | 工具 | 備註 |
|---|---|---|
| F01 | 時區並排轉換 | `Intl` API,不需時區資料庫 |
| F02 | 工作日 / 日期加減 ⚙ | 內建台灣假日表,標註年度 |
| F03 | 民國 · 西元 · ISO Week | |
| F04 | 年齡與紀念日 | |
| F05 | 倒數計時 / 碼表 | 本地通知 |
| F06 | 番茄鐘 | 離線可用,音效內嵌 |
| F07 | 跨時區會議時段熱圖 | 多人多時區的可行時段 |
| F08 | 排班輪班日曆產生 | 匯出 CSV / ICS |
| F09 | 工時記錄 | IndexedDB,匯出 CSV |
| F10 | 簡報大字時鐘 | 全螢幕、倒數、超時變色 |

### G 計算與換算
| # | 工具 | 備註 |
|---|---|---|
| G01 | 單位換算 | 長度 / 重量 / 溫度 / 面積 / 體積 / 速度 / 壓力 / 資料量 / 能量 |
| G02 | 任意底進位轉換 | 2–36 進位 |
| G03 | 百分比 · 漲跌 · 折扣 | |
| G04 | 運算式計算機 | 自寫 tokenizer + parser,**禁 eval** |
| G05 | 統計摘要 | 平均 / 中位 / 標準差 / 分位數 / 直方圖 |
| G06 | 貸款 · 房貸試算 | 本息平均、寬限期、提前還款、攤還表 |
| G07 | 複利 · 定期定額 | 含通膨調整 |
| G08 | 電費 · 水費試算 ⚙ | 台電累進級距表,標註版本日期 |
| G09 | 分帳 · 小費 · 均攤 | 多人、不均分、含服務費 |
| G10 | 抽籤 · 分組 · 骰子 | `getRandomValues`;可選公開 seed 供事後驗證 |

### H 顏色與設計
| # | 工具 | 備註 |
|---|---|---|
| H01 | 顏色格式轉換 + 螢幕取色 | HEX / RGB / HSL / OKLCH / LAB;`EyeDropper` API |
| H02 | 對比度檢查 | WCAG 2.2 AA/AAA + APCA |
| H03 | 調色盤 / 色階產生 | OKLCH 感知均勻 |
| H04 | 漸層產生器 | CSS,含 easing 中繼點 |
| H05 | 陰影 / 圓角 / 邊框 CSS | |
| H06 | cubic-bezier 編輯器 | |
| H07 | 字級比例尺 | modular scale + 行高建議 |
| H08 | 色盲模擬 | 濾鏡矩陣,三型 |
| H09 | 長寬比與解析度 | 等比縮放、常見裝置尺寸 |
| H10 | SVG 最佳化與預覽 | 預覽走 `<img blob>`(見 4.3) |

### I 圖片與檔案
| # | 工具 | 備註 |
|---|---|---|
| I01 | 圖片壓縮 / 格式轉換 | WebP / AVIF / JPEG / PNG,OffscreenCanvas |
| I02 | 裁切 / 縮放 / 旋轉 | |
| I03 | EXIF 檢視與移除 | 發照片前去掉 GPS,工作與生活都常用 |
| I04 | 截圖打碼 / 浮水印 | 貼 issue 前遮掉客戶資料 |
| I05 | 圖片拼接 | 長截圖併接、併排對照 |
| I06 | 影片擷取影格 | 本地檔案 `<video>` + canvas |
| I07 | QR Code 產生 ⚙ | URL / WiFi / vCard / 純文字 |
| I08 | QR / 條碼掃描 📷 | `BarcodeDetector`,不支援時明確降級 |
| I09 | Favicon / ICO 產生 | 多尺寸打包 |
| I10 | PDF 合併 / 取頁 / 轉圖 ⚙ | `pdf-lib` opt-in(約 300KB) |

### J 網路與生活
| # | 工具 | 備註 |
|---|---|---|
| J01 | CIDR / 子網路計算 | IPv4 + IPv6,純算術不查詢 |
| J02 | URL 解析與 UTM | 建構 UTM、**移除追蹤參數** |
| J03 | User-Agent 解析 | 本地規則表 |
| J04 | 裝置能力面板 | 螢幕 / DPR / 色域 / 記憶體 / 網路型態,唯讀不上傳 |
| J05 | 台灣格式驗證 | 身分證 / 統一編號 / 手機 —— 純檢查碼演算法,不查個資 |
| J06 | BMI / TDEE / 基礎代謝 | |
| J07 | 材積重與運費 | 長寬高 → 材積重,多家係數 |
| J08 | 烹飪份量換算 | 份數縮放、杯匙克互換 |
| J09 | 便條紙 / 待辦 | IndexedDB,Markdown,匯出 |
| J10 | 檢查表與決策矩陣 | 上線前檢查、加權評分,可列印 |

**合計 100。**

---

## 9. 依賴預算

原則是第 4.5 節那條:預設自己寫。實際會需要外部依賴的只有這幾處:

| 用途 | 決策 |
|---|---|
| YAML / TOML 解析 (C02) | 引入零依賴的輕量 parser,pin 版本,opt-in chunk |
| QR 產生 (I07) | 輕量庫(約 20KB)或自寫 —— 規格不大,傾向自寫 |
| PDF (I10) | `pdf-lib`,opt-in,只有進到這個工具才下載 |
| Diceware 字表 (E02) | 資料非程式碼,opt-in JSON |
| X.509 / ASN.1 (E10) | 最小 parser,自寫或極小庫;排在最後一批 |
| 台灣假日 / 台電級距 (F02, G08) | 內建 JSON,**標註資料版本與適用年度**,過期要在 UI 上說 |

其餘 94 個工具目標:**不新增任何 runtime 依賴。**
單一工具 chunk 目標 ≤ 15KB gzip,超過 40KB 一律標 `optIn`。

---

## 10. 驗證計畫

1. **單元測試(必要,Phase 10.1 就要有)**
   每個 `logic.ts` 一份測試,用 Node 內建 `node:test`(不新增依賴)。
   重點是編碼往返(encode→decode 等於原值)、邊界(空值 / 極大 / 非法輸入 / Unicode / emoji)、
   以及所有數值計算對照一組已知答案。
   **房貸攤還、電費級距、檢查碼演算法這三類必須逐案對表。**
2. **零出口測試(build gate)**
   Playwright 逐頁互動,斷言無非同源請求、無 `connect-src` 外的請求。
3. **離線測試**
   Playwright 走訪 → `context.setOffline(true)` → 重新載入索引頁與數個工具頁,
   斷言仍可操作並得到正確結果。
4. **Smoke 測試**
   每個工具頁能載入、無 console error、無 CSP 違規(監聽 `securitypolicyviolation`)。
5. **Lighthouse**
   維持既有門檻(95+ / CLS<0.05 / LCP<2.0),外加 PWA 可安裝性檢查。
6. **a11y**
   鍵盤走完索引頁與抽樣工具頁;對比度由 H02 自己檢查自己(順手的 dogfooding)。
7. **體積回歸**
   記錄各 chunk 大小,超預算就 fail。

---

## 11. 分期與審核點

每一期結束我自我 review 後交你審,通過才進下一期(沿用 Phase 1–9 的規則)。

| 期 | 內容 | 產出 |
|---|---|---|
| **10.1 地基** | registry、路由、`ToolShell` / `Workbench`、命令面板、CSP(含 inline script 外移)、`manifest.ts`、圖示產生、`sw.js` + app-shell fallback、更新提示、`node:test` 接上、零出口測試、離線測試 | 骨架 + **3 個代表性工具**(A05 Diff / C01 JSON / E01 密碼)驗證三種型態:純文字、大資料、密碼學 |
| **10.2 高頻 15 件** | A01–A05、B01–B02、C01–C03、D01–D05 | 架構壓力測試 |
| **10.3 開發者與資料補齊** | C 與 D 剩餘 | |
| **10.4 密碼學與時間** | E、F 全部 | E 需要額外一輪安全 review |
| **10.5 計算與設計** | G、H 全部 | |
| **10.6 媒體與生活** | I、J 全部 | Worker / Canvas 密集 |
| **10.7 收尾** | 「原理」長文、SEO 放行清單、`sitemap` 納入、離線下載頁、字型 subset 重跑、驗收報告 | Phase 10 驗收報告 |

**Phase 10.1 是整件事的關鍵。** 地基如果對了,後面 97 個工具是重複勞動;
地基如果錯了(例如工具全進共用 bundle、或 SW 把品牌站也接管了),後面每一個都要重做。

---

## 12. 等你裁決

1. **命名與定位**:`/tools`、標題「儀器櫃 / INSTRUMENTS」、nav 排最後 —— 同意嗎?
2. **雙語範圍**:UI 與工具名雙語,「原理」長文只寫 zh-TW —— 可以嗎?
3. **SEO**:只索引索引頁 + 有長文的精選工具,其餘 `noindex, follow` —— 同意嗎?
4. **inline script 外移**:為了乾淨的 CSP,把 `layout.tsx` 那段 `js` class 的 inline script
   與 `next-themes` 的注入改為外部檔案(會動到主站 layout)—— 授權我改嗎?
5. **先做哪一批**:預設順序是 10.2 的高頻 15 件。如果你手上有現在每天在用的工具,
   講一下,我把它們提前。
