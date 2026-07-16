# Phase 4 — Visual Design Specification

> 主題:**Engineering Blueprint × Warm Graphite × 琥珀電路**(使用者已核准 A 方向)

---

## 1. 色彩 Token(完整)

### 深色(預設)— Warm Graphite
| Token | 值 | 用途 | 對比(vs bg-deep) |
|---|---|---|---|
| `--bg-deep` | `#0C0B09` | 頁面 canvas | — |
| `--bg-base` | `#12110E` | 區塊底 | — |
| `--bg-raised` | `#1A1815` | 卡面/側欄/終端機 | — |
| `--border-1` | `rgba(235,225,210,.07)` | 導線、靜止邊框 | — |
| `--border-2` | `rgba(235,225,210,.13)` | 標準邊框、分隔線 | — |
| `--border-3` | `rgba(235,225,210,.22)` | hover/強調邊框 | — |
| `--fg` | `#EDE8DF` | 標題、正文 | **14.9:1** ✓AAA |
| `--fg-muted` | `#A8A296` | 次要文字 | **7.2:1** ✓AAA |
| `--fg-faint` | `#6B665C` | 停用/水印(非正文) | 3.2:1(僅大型/裝飾) |
| `--accent` | `#E8A33D` | CTA、pulse、編號、focus | **8.1:1** ✓AAA |
| `--accent-ink` | `#0C0B09` | 琥珀底上的文字 | 8.1:1 ✓ |
| `--accent-dim` | `rgba(232,163,61,.14)` | glow、選取底 | — |
| `--data-teal` | `#5FB3B5` | 圖表輔助色 1(僅圖內) | 6.6:1 ✓ |
| `--data-slate` | `#8A93A6` | 圖表輔助色 2(僅圖內) | 5.1:1 ✓ |

### 淺色 — Drafting Paper
| Token | 值 | 對比(vs #F7F5F0) |
|---|---|---|
| `--bg-deep` `#F7F5F0` / `--bg-base` `#F0EDE6` / `--bg-raised` `#FFFFFF` | | |
| `--border-1/2/3` | `rgba(23,21,18,.08/.14/.24)` | |
| `--fg` | `#171512` | 16.4:1 ✓ |
| `--fg-muted` | `#5C574E` | 6.9:1 ✓ |
| `--accent`(文字/線) | `#9A6410` | **4.6:1** ✓AA |
| `--accent`(CTA 填色) | `#B87914` + ink 文字 | 大面積用 |

規則:兩主題同一套 token 名;主題切換 = `data-theme` 屬性;`color-scheme` 同步(原生控件/捲軸)。

## 2. 材質

- **噪點**:SVG `feTurbulence` 產生的 tile(base64 內嵌),`opacity: .025`(dark)/`.035`(light),`pointer-events:none`,固定疊在 body 上——「看不出來但摸得到」
- **導線**:4 條(mobile 2 條)1px `--border-1` 垂直線,位於 container 邊緣與 1/3、2/3;區塊交界處放 12px「+」十字刻度(`--fg-faint`)
- **玻璃**:僅 nav 與 mobile overlay:`backdrop-filter: blur(16px) saturate(1.4)` + `--bg-deep`/75% + 底邊 `--border-2`
- **深度**:全站 `box-shadow: none`;層級 = surface ladder + 邊框階梯
- **Glow**:琥珀 glow 僅兩處——primary CTA hover(`0 0 24px --accent-dim`)與 schematic pulse

## 3. 字體系統(含 CJK 規則)

| 角色 | 字體 | 載入 |
|---|---|---|
| Latin 標題+正文 | **Archivo**(variable wght 400–700) | next/font self-host, swap, preload |
| CJK | **Noto Sans TC**(400/500/700) | next/font(自動 unicode-range 分片) |
| Mono | **JetBrains Mono**(400/500) | next/font |

font stack:`Archivo, "Noto Sans TC", system-ui, sans-serif`(Latin 字符走 Archivo,中文自動 fallback 到 Noto)。

**CJK 排版規則**(與 Latin 不同,必守):
- 中文**不使用負 tracking**(Latin display −2%~−4%,中文 0)
- 中文正文行高 1.8(Latin 1.6);中文標題行高 1.3(Latin 1.1)
- 中文 hero 上限縮一級:`clamp(2.5rem, 7vw, 5.5rem)`(Latin 至 7rem)
- 標點懸掛不強求;避免中英夾雜時的空隙問題:`text-autospace` 未普及前以內容規範處理(中英間手動空格)

**字階**:`12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64 / hero-clamp`;數字一律 `font-variant-numeric: tabular-nums`(mono 區塊天然等寬)。

**層級策略(Linear 式)**:粗細只用 400/500/600;層級靠「尺寸 + 調暗(`--fg-muted`)+ 間距」表達,不靠 700+ 加粗。

## 4. 版面 Token

```
--container: 1200px    --gutter: 24px(mobile 20px)
--space: 4 8 12 16 24 32 48 64 96 128 160(8pt 制)
--section-y: clamp(96px, 12vh, 160px)
--radius-s: 6px(容器/終端機)  --radius-pill: 999px(CTA)
斷點: 375 / 768 / 1024 / 1440
```

## 5. 元件規格

| 元件 | 規格 |
|---|---|
| **Primary CTA** | pill,琥珀底 + `--accent-ink` 字,高 44px(觸控達標),hover:glow + 內縮圖示位移;press scale .97 |
| **Secondary CTA** | pill,透明底 + `--border-2` 邊框,hover 邊框→`--border-3` + 底 `--bg-raised` |
| **Nav 連結** | 16px,`--fg-muted`,hover/current →`--fg`;current 加 4px 琥珀底線(offset 6px) |
| **章節標頭** | `[NN / LABEL]` mono 12px uppercase +8% tracking `--accent`(編號)+`--fg-muted`(label),下方 H2 |
| **列表列(作品)** | 上下 `--border-2` 分隔,py 32px;hover:bg `--bg-base`、標題 x+4px、箭頭浮現;整列可點,focus-visible 全列 ring |
| **Meta 列** | mono 12px 三欄:label `--fg-faint` / 值 `--fg` |
| **終端機視窗** | `--bg-raised` + `--border-2`,標題列三圓點(`--fg-faint`,裝飾性 aria-hidden),mono 14px,琥珀游標 |
| **架構圖節點** | 6px 圓角矩形,`--bg-raised` 底 + `--border-2`,mono 12px 標籤;active:琥珀邊框 + `--accent-dim` 底;連線 `--border-3`,pulse 為 3px 琥珀圓點 + 6px glow |
| **Focus ring** | 全站統一 `outline: 2px solid --accent; outline-offset: 3px`,永不移除 |
| **圖示** | Lucide,stroke 1.5,16/20px 二階;**全站零 emoji** |

## 6. OG Image 模板(視覺一致性)

1200×630,`--bg-deep` 底 + 導線 + 十字刻度 + 左上 `[BINBINBOB.WORK]` mono + 標題大字(zh/en)+ 右下琥珀節點小圖騰。@vercel/og 動態生成,每頁標題注入。

## 7. 自我 Review

- **決策依據**:邊框階梯(Supabase)、surface ladder(Raycast)、調暗式層級(Linear)、mono 標籤(Vercel)、玻璃單點使用(Apple);琥珀 accent 避開紫/綠/珊瑚的 AI 模板色帶
- **對比驗證**:上表全部經 WCAG 相對亮度計算;正文層級全數 ≥7:1(AAA),淺色主題琥珀文字改用 `#9A6410` 達 4.6:1(AA);`--fg-faint` 限制在裝飾與 ≥24px 大字
- **發現問題與修正**:(1) 琥珀直接在淺色底當文字不及格(3.1:1)→ 拆出淺色專用深琥珀;(2) 中文負 tracking 會黏字 → CJK tracking 歸零規則;(3) Noto Sans TC 全量 ~4MB → next/font unicode-range 分片,只載使用到的字塊;(4) 三圓點終端機裝飾易被讀屏誤讀 → aria-hidden
- **與頂尖比較**:token 完整度對標 Vercel Geist 公開 token 表;CJK/Latin 雙軌排版規則是本案獨有(研究樣本皆純 Latin,此處無可抄,依 CJK 排版慣例制定)
