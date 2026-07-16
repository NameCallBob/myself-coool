# Phase 5 — Animation Design Specification

> 原則:每個動畫表達因果,不做裝飾;只動 `transform` / `opacity`;每 viewport 最多 1–2 個動畫主角。

---

## 1. 動效 Token(全站唯一語彙)

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* expo-out:所有進場 */
--ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);  /* 轉場/位移 */
--dur-micro:   180ms;   /* hover/press/focus */
--dur-reveal:  450ms;   /* scroll reveal */
--dur-page:    600ms;   /* 頁面轉場(exit ≤ 250ms) */
stagger: 40ms/item(≤8 items;>8 改 25ms)
exit = enter × 0.6
```

## 2. 技術分工

| 引擎 | 負責 | 理由 |
|---|---|---|
| **Lenis** | 慣性捲動(全站) | Anthropic 同款;與 ScrollTrigger 官方整合 |
| **GSAP + ScrollTrigger / Flip / SplitText**(3.13+ 全免費) | scroll 編排、hero 序列、case study FLIP 轉場、大標逐字 | scrub 與 timeline 精度 |
| **Framer Motion(motion)** | 元件微互動、nav overlay、presence 轉場 | React 生命週期整合 |
| **CSS only** | hover/press/focus、pulse keyframes | 零 JS 成本優先 |

規則:一個元素只屬於一個引擎;GSAP 一律 `useGSAP({ scope })` 自動清理。

## 3. 逐區塊編排(Choreography)

### Loading Sequence(首次進站,唯一一次)
承諾「不做 preloader 計數器」:無阻擋式 loader。導線由中心向上下**畫出**(scaleY,600ms)→ eyebrow fade → H1 SplitText 逐字(40ms stagger)→ CTA fade → schematic 節點依拓撲序點亮(各 60ms)→ pulse 開始巡航。總長 ≤1.6s,內容 800ms 內可讀、全程可互動、可捲動打斷。

### Hero Live Schematic
- 節點:進場 opacity 0→1 + scale .95→1;之後**靜止**(節點不漂浮——漂浮=廉價訊號)
- Pulse:琥珀 3px 圓點沿 SVG path(`getPointAtLength` rAF 驅動),每 2.5–4s 隨機一條真實路徑(Client→Nginx→Service→DB→回程);同時最多 2 顆
- 路徑經過的節點邊框短暫亮起(300ms)——表達「請求正在被處理」的因果
- IntersectionObserver:離屏即停 rAF;分頁不可見(`visibilitychange`)也停

### Scroll Reveal(全站標準)
`opacity 0→1, y 16→0, 450ms, --ease-out`,trigger `top 85%`,一次性(不反向重播);列表 stagger 40ms。**位移只有 16px——讀起來是 fade,不是 slide。**

### 頁面轉場
overlay wipe(`--bg-base` 由下而上 scaleY,exit 250ms → 換頁 → 收回 350ms);case study 入口用 **Flip shared-element**(列表列標題 → hero 標題,每次導航僅此一組);瀏覽器「上一頁」不播轉場(即時返回)。

### 各招牌區塊
| 區塊 | 編排 |
|---|---|
| Philosophy | 每條宣言 SplitText 逐字 + 前後條 `--fg-muted`→`--fg` 的 scroll-scrub 焦點轉移 |
| API Flow | ScrollTrigger `scrub: 0.5` pin 該區,pulse 隨捲動前進 6 站,站點依序亮起 + 注記 fade(scrub = 使用者掌控節奏,非 scroll-jacking:隨時可反向) |
| Architecture 互動圖 | pan/zoom(pointer events + transform);點擊節點:側欄 spring 滑入(FM),圖中相依節點亮、無關節點降 opacity .3 |
| Constellation | canvas;hover 技術點:相連服務高亮 + 連線畫出(300ms);無 hover(觸控)改點擊 |
| 終端機 typing | 唯一 typing 效果;24 字/秒,可點擊「skip」立即完成;完成後琥珀游標閃爍 |
| Counter | 數字進 viewport 後 800ms ease-out 遞增,tabular-nums 防跳動 |
| Timeline | 垂直線 scaleY scrub 生長,節點依序點亮 |

### 微互動(CSS)
hover:邊框 `--border-2`→`--border-3` + 列位移 4px;press:scale .97;magnetic(僅 hero Contact 與 04 Contact 兩顆):`gsap.quickTo` ±30% 位移 clamp;自訂游標:十字準星 6px 點(`pointer: fine` 才啟用),hover 互動元素放大至 24px 環——**無拖尾**。

## 4. Reduced Motion 對照表(必過)

`prefers-reduced-motion: reduce` 時:
| 原動效 | 降級 |
|---|---|
| Loading 序列 / SplitText / reveal | 直接顯示(opacity 1,無位移) |
| Lenis | 停用(原生捲動) |
| Pulse / typing / counter | 靜態:pulse 隱藏、終端機直接顯示全文、數字直接顯示終值 |
| 頁面轉場 / FLIP | 150ms crossfade |
| Magnetic / 自訂游標 | 停用 |
| 互動圖 pan/zoom | **保留**(使用者主動操作,非自動動效) |

## 5. 效能規則

- 只動 `transform/opacity`;`will-change` 僅在動畫期間掛載
- 所有循環動畫(pulse、游標閃爍)離屏/背景分頁即停
- ScrollTrigger 統一 `invalidateOnRefresh`;resize 節流 200ms
- 動畫 JS 按路由 code-split;首屏僅 hero 所需
- 驗收:Chrome DevTools Performance 面板 60fps,4× CPU throttle 下 hero 不掉幀;INP < 200ms

## 6. 自我 Review

- **決策依據**:token 化(OpenAI)、scrub 而非 jacking(Apple 的 scroll 敘事 + 使用者可反向)、pulse 表達真實請求路徑(samwho 的「動畫即語意」)、typing 限單點(GitHub Universe 教訓:terminal 效果氾濫即 pandering)
- **與頂尖比較**:動畫主角密度低於 Framer 官網(其官方也警告過度動畫傷 INP);loading 序列短於 Apple 產品頁,且不阻擋互動
- **發現問題與修正**:(1) 需求原列 Parallax → 研究判定易暈眩且被 reduced-motion 規範點名,改以「scrub 焦點轉移」達成景深感;(2) reveal 反向重播(toggleActions reverse)會讓回捲頁面閃爍 → 改一次性;(3) SplitText 對讀屏會碎裂文字 → 完成後 `revert()` 還原 DOM,且 `aria-label` 保留原句
- **驗證計畫**:Phase 9 用 Performance trace + reduced-motion 模擬逐項核對本表
