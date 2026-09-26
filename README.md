# binbinbob.work

binbin 的個人網站。Next.js 16 靜態匯出,部署在 GitHub Pages,綁 `binbinbob.work`。

網站分兩個部分:

- **品牌頁**(`/`、`/work`、`/ai`、`/about`)——專案經歷與工程觀點。
  設計概念是「活的系統規格書」:製圖紙 + 紅墨水、可見導線、編號章節。
  設計與內容的決策過程留在 `docs/phase-1` 到 `docs/phase-9`。
- **儀器櫃**(`/tools`)——100 件純在瀏覽器裡執行的工具。
  不上傳、不連線、不記錄,可安裝成離線 PWA。
  規劃在 `docs/phase-10-tools-plan.md`,作者規範在 `docs/tool-author-guide.md`。

---

## 開發

```bash
npm install
npm run dev          # http://localhost:3000
```

### 指令

| 指令 | 做什麼 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 靜態匯出到 `out/`,並跑 `scripts/build-pwa.mjs`(離線清單、worker 版號、CSP 注入) |
| `npm run serve` | 用 GitHub Pages 的路徑解析規則服務 `out/`(`/a/b` → `a/b.html`) |
| `npm test` | 工具邏輯的單元測試(`node --test`,不需要額外依賴) |
| `npm run verify` | 對建置結果跑 Playwright:零跨域請求、零 CSP 違規、離線可用 |
| `npm run lint` | ESLint |
| `npm run icons` | 由 `src/app/icon.svg` 產生 PWA 圖示 |
| `npm run fonts` | 重新切中文襯線字型的子集 |
| `npm run content:dates` | 由 git 歷史推導內容日期,寫入 `content/dates.ts` |
| `npm run shots` | 截圖 |

`prebuild` 會自動跑 `scripts/gen-tool-loader.mjs`,依照 `src/tools/` 底下實際存在的
實作產生載入器——登錄了但還沒做的工具會顯示為「未完成」,不會連到壞掉的頁面。

---

## 這個 repo 裡幾個不明顯的決定

**字型只在需要的頁面載入。** 中文襯線顯示字型切過子集(1,161 字,252 KB),
宣告在 `src/lib/fonts.ts` 而不是 root layout——放在 root layout 會讓 200 個工具頁
全部預載一個它們一個字都沒用到的字型。要加中文文案到用了 `font-serif` 的頁面時,
記得重跑 `npm run fonts`,子集外的字會靜默 fallback 成系統襯線體。

**CSP 在 build 之後注入。** GitHub Pages 不能設 response header,所以政策只能寫在
`<meta http-equiv>`,而 meta 版的政策沒辦法帶 per-request nonce。
`scripts/build-pwa.mjs` 掃過每一個產出的 HTML,替每一段 inline script 算 SHA-256,
組出該頁自己的政策。代價是這支腳本每次 build 都得跑;換來的是 `connect-src 'self'`,
也就是「這一頁不會把你的資料送出去」這件事由瀏覽器強制執行,而不是靠我說。

**Service worker 只管工具區。** scope 必須是整個網域(共用的 chunk 在根目錄),
但 fetch handler 對品牌頁完全不攔截——它們的快取語意與索引行為跟這支 worker
出現之前一模一樣。worker 另外會擋掉所有跨來源請求,當作 CSP 之外的第二道。

**資料日期來自 git,不是 build 時間。** `content/dates.ts` 由 `scripts/content-dates.mjs`
走 git 歷史產生,所以 sitemap 的 `lastmod` 與 JSON-LD 的日期都能用 `git log` 重新驗證。
用 build 時間戳會讓每次部署都把所有 URL 標成剛更新,搜尋引擎會學會不信任這個欄位。

---

## 部署

推到 `main` 會觸發 `.github/workflows` 的 GitHub Pages 部署。
`next.config.ts` 是 `output: 'export'`——沒有 middleware、沒有 API route、沒有 server action,
語系前綴因此一律帶上(`/zh-TW`、`/en`),根路徑由 `public/index.html` 轉導。
