import type { ToolNote } from './index';

/** Drawer DESIGN — "how it works" prose for the indexable tools in this drawer. */
export const DESIGN_NOTES: Record<string, ToolNote> = {
  'color-convert': {
    body: [
      {
        zh: '矩陣與常數全部抄自 CSS Color 4,不是抄某個函式庫,理由是這一頁印出來的數字要跟瀏覽器對同一個輸入算出來的一致——不一致的話這個工具就沒有用。而照規格做之後會發現一件容易被跳過的事:這些空間的白點不同。CSS 的 lab() 與 lch() 是以 D50 定義的,oklab()、oklch() 與 sRGB 是 D65,所以兩邊互轉除了旋轉還要做色度適應。這裡用的是 Bradford 適應矩陣,跟瀏覽器一樣;省掉它的話,一個中灰的偏移量會超過一個可辨差異,而那是眼睛看得出來的量。',
        en: 'Every matrix and constant comes from CSS Color 4 rather than from a library, so the numbers printed here match what a browser computes for the same input. Following the spec surfaces the part that gets skipped: CSS `lab()` and `lch()` are D50 while `oklab()`, `oklch()` and sRGB are D65, so crossing between them needs a Bradford chromatic adaptation and not just a rotation. Without it a mid-grey shifts by more than a just-noticeable difference.',
      },
      {
        zh: 'OKLCH 比任何螢幕都大,所以大部分 (L, C, h) 組合指的是螢幕做不出來的顏色,而怎麼處理這件事是這個工具最有代價的決定。最直覺的做法是把三個通道各自夾回 0 到 1,而那是錯的:一個過飽和的藍會把紅通道夾成零,結果變成紫色——色相被改掉了;而且整片超出範圍的區域會被夾到同一個顏色上,一條色階走到底會平掉。這裡照 CSS Color 4 §13.2 做:固定明度與色相,對彩度做二分搜尋,一路降到顏色落回範圍內,而搜尋的停止條件是「再夾一次的誤差已經小於一個可辨差異」——用 OKLab 距離量,門檻 0.02。',
        en: 'OKLCH is larger than any screen, so most (L, C, h) triples name a colour no monitor can show, and how that is handled is the costly decision here. Clipping each channel independently is the intuitive answer and it is wrong: an oversaturated blue clips its red channel to zero and turns purple, and whole out-of-range regions collapse onto one colour, flattening the end of a ramp. This follows CSS Color 4 §13.2 instead — hold lightness and hue, bisect chroma until the colour fits, and stop once clipping would be within one just-noticeable difference, measured as an OKLab distance with a threshold of 0.02.',
      },
      {
        zh: '同一個顏色的九種寫法並排時,螢幕空間的那幾欄(HEX、rgb()、hsl()、hwb())是經過上面那道映射的,感知空間的那幾欄(lab、lch、oklab、oklch)則照原樣印。這個不一致是刻意的:超出色域時,兩邊本來就不該顯示成同一個顏色,並排看才知道是哪一個寫法在騙你。旁邊另外標了兩個旗標——超出 sRGB、以及連 Display-P3 也裝不下——判定用的容差是 0.0005,比色域檢查本身的 1e-5 寬,因為浮點捨去造成的「差一點點超出」不值得警告使用者。',
        en: 'With one colour shown in nine notations, the screen spaces (hex, rgb, hsl, hwb) are gamut-mapped while the perceptual ones (lab, lch, oklab, oklch) are printed as typed. The inconsistency is deliberate: out of gamut the two genuinely are not the same colour, and seeing them side by side is how you find out which notation is lying. Two flags sit alongside — outside sRGB, and outside Display-P3 as well — at a 0.0005 tolerance, looser than the 1e-5 used internally, because a rounding-width overflow is not worth warning about.',
      },
      {
        zh: '剖析那一半沒有什麼演算法,只有一堆別人踩過的地方。剖析失敗回傳 null 而不是丟例外,因為輸入框每敲一個鍵就重剖一次,「還沒打完」是正常狀態不是錯誤。逗號式的舊寫法與空白加斜線的新寫法都收,但「第四個參數是不是 alpha」必須可切換:rgba(r,g,b,a) 的第四個是 alpha,color(display-p3 r g b) 的第四個是藍色、第一個是空間名稱。角度四種單位都認(deg、grad、rad、turn)。沒有 # 的純十六進位也收,因為那就是從設計工具複製出來的樣子。轉換函式保留正負號,所以超出範圍的通道來回轉一趟不會被折到 0;彩度低於 1e-6 時色相直接歸零,不然那個角度只是被放大的捨去誤差。',
        en: 'The parsing half has no algorithm, only accumulated scar tissue. It returns null instead of throwing, because the box reparses on every keystroke and half-typed input is the normal state. Both the legacy comma form and the modern space-plus-slash form are accepted, but whether a fourth argument means alpha has to be switchable: it is alpha in `rgba()` and blue in `color(display-p3 …)`. All four angle units are read, a bare hex triple with no `#` is accepted because that is what design tools hand you, the transfer functions preserve sign so out-of-range channels survive a round trip instead of folding to zero, and chroma under 1e-6 zeroes the hue rather than reporting amplified rounding error as an angle.',
      },
    ],
    limits: [
      {
        zh: '螢幕取色靠瀏覽器的 EyeDropper API,目前只有 Chromium 系列有;沒有的瀏覽器不會顯示那個按鈕,也沒有替代方案——用 canvas 截圖需要螢幕擷取權限,而那個代價比這個功能大。取回來的值是螢幕像素合成後的 sRGB,所以取到半透明疊層或廣色域圖片上時,拿到的是你看到的那個顏色,不是原始色值。',
        en: 'Screen picking uses the browser EyeDropper API, which today means Chromium. Elsewhere the button is simply absent, with no fallback. What it returns is the composited sRGB pixel, so over a translucent layer or a wide-gamut image you get the colour you saw, not the source value.',
      },
      {
        zh: 'color() 只認 srgb、srgb-linear 與 display-p3 三個空間,rec2020、a98-rgb、prophoto-rgb 與 xyz 一律拒絕而不是硬猜。相對顏色語法與 color-mix() 也不處理,那是要一個小型 CSS 求值器才做得到的事。',
        en: 'Inside `color()` only srgb, srgb-linear and display-p3 are understood; rec2020, a98-rgb, prophoto-rgb and xyz are refused rather than guessed at. Relative colour syntax and `color-mix()` are out of scope — both need a small CSS evaluator.',
      },
      {
        zh: '一次只處理一個顏色。要從一個顏色長出整條感知均勻的色階請用 H03,要看兩個顏色之間怎麼插值請用 H04,要確認這個配色在色覺缺陷下還分得開請用 H08。',
        en: 'One colour at a time. For a perceptually even ramp use H03, for interpolation between two colours H04, and to check a palette still separates under colour-vision deficiency, H08.',
      },
    ],
  },

  contrast: {
    body: [
      {
        zh: 'WCAG 2.2 的對比率是兩個相對亮度的比值:通道各自線性化,用 sRGB 的 Y 列加權(0.2126、0.7152、0.0722),然後 (較亮 + 0.05) ÷ (較暗 + 0.05),值域 1:1 到 21:1。那個 0.05 是遮蔽性眩光——房間裡的散射光加上眼球內部的散射。它同時也是這個量度對深色主題特別寬鬆的原因:靠近純黑時分母幾乎只剩眩光項,兩個深色算出來的距離會遠大於看起來的距離。門檻直接對到條文:1.4.3 的本文是 4.5、1.4.6 的 AAA 是 7,大字(18pt/24px,或 14pt/18.66px 粗體)降為 3 與 4.5,1.4.11 的非文字元素——圖示、邊框、焦點框——是 3 且沒有 AAA。',
        en: 'The WCAG 2.2 ratio is two relative luminances — channels linearised, weighted by the sRGB Y row — combined as (lighter + 0.05) / (darker + 0.05), from 1:1 to 21:1. That 0.05 models veiling flare, and it is also why the measure is generous to dark themes: near black the flare term dominates, so two dark colours score much further apart than they look. Thresholds map straight onto the clauses: 4.5 and 7 for body text, 3 and 4.5 for large text, 3 with no AAA for non-text.',
      },
      {
        zh: 'APCA 也算,而且不是拿來當第二意見用的裝飾。它不是比值而是明度差的感知估計:自己的亮度公式用單一的 2.4 次方、沒有 sRGB 那段分段的低端直線,再對 0.022 以下做一次軟性夾制,免得兩個很深的顏色被算成無限可分。兩種極性用不同的指數(淺底深字 0.56/0.57,深底淺字 0.65/0.62),因為它們不對稱:深底上的淺字會暈開、看起來比同樣距離的反向組合更粗,而那正是 WCAG 的單一比值表達不出來的效應。Lc 的正負號就是極性。分級門檻(90/75/60/45/15)是 APCA 文件裡的使用建議而不是合規判定——APCA 真正的介面是一張跨字級與字重的查表,引用一個分級是誠實的摘要,不是假裝的結論。這一頁兩個數字都給,並且不幫你選:WCAG 是現行規範,APCA 還在 WCAG 3 草案階段。',
        en: 'APCA is computed too, and not as decoration. It estimates a lightness difference rather than a ratio: a single 2.4 exponent with no piecewise toe, then a soft clamp below 0.022 so two very dark colours are not treated as infinitely separable. The polarities get different exponents because they are not symmetric — light text on a dark ground blooms and reads heavier than the same separation reversed — and the sign of Lc carries that polarity. The bands are usage guidance from the APCA documentation, not a conformance test, because APCA proper is a lookup table over size and weight. Both numbers are shown and neither is picked for you: WCAG is normative, APCA is a WCAG 3 draft.',
      },
      {
        zh: '半透明的顏色會先合成再量,因為對比是落在視網膜上的東西的性質,不是色值的性質——60% alpha 的文字色跟它背後是什麼有關。合成在 gamma 編碼的 sRGB 裡做,理由是瀏覽器就是在那裡做的;在線性光裡合成會得到另一個答案,那個答案對這個用途是錯的。背景本身也可以是半透明,所以它會先疊到頁面底色上(白或黑二選一),再讓文字疊上去——兩層都半透明時,底色選白還是黑會改變結論,這也是為什麼那個開關要露在畫面上。',
        en: 'A translucent colour is composited before it is measured, because contrast is a property of what reaches the retina rather than of the value. That compositing happens in gamma-encoded sRGB, which is where browsers do it; doing it in linear light gives a different and, for this purpose, wrong answer. The background may be translucent as well, so it lands on a page colour — white or black — before the text lands on it, and which of the two you pick can change the verdict, which is why the switch is on the page.',
      },
      {
        zh: '「最近的可用色」動的是 OKLCH 的明度,不是十六進位的三個通道。三個通道一起降同樣的量會連帶改掉色相與彩度,而一個設計師不會接受的建議等於沒有建議,所以色相與彩度固定,只對明度做四十八次二分搜尋。搜尋前先試極端值:如果連純黑或純白都到不到目標,就直接說這一邊不管往哪個方向都過不了,請改另一邊或放棄這個色相——這比給一個做不到的數字有用。結果會做色域映射,所以給出來的是真的存在的顏色;但色域映射讓「明度對比率」這個函數只是接近單調而不是嚴格單調,所以最後的比率是重新量過才回傳的,不是假設二分搜尋一定對。兩個方向的候選按 OKLab 距離排序,改動最小的排前面。',
        en: 'The nearest passing colour moves OKLCH lightness, not the hex channels: dropping all three by the same amount changes hue and chroma too, and a suggestion a designer will not accept is the same as no suggestion. Hue and chroma are held through a 48-step bisection, and the bound is tested first — if even pure black or white misses the target, the page says this side cannot reach it in either direction rather than printing an impossible number. Results are gamut-mapped so they are colours that exist, which makes the function only nearly monotonic, so the final ratio is re-measured instead of assumed. Candidates are ordered by OKLab distance, smallest change first.',
      },
    ],
    limits: [
      {
        zh: '它只看得到兩個顏色。字級、字重、字型的實際筆畫粗細、文字是不是壓在照片或漸層上、使用者有沒有調系統字體大小——這些都影響可讀性而這裡一個都不知道,所以本文與大字兩欄都列出來,選哪一欄是你的判斷。',
        en: 'It sees two colours and nothing else: not the size, the weight, how thin the typeface actually draws, or whether the text sits over a photo. Both the body and large-text columns are reported and choosing between them is your call.',
      },
      {
        zh: '剖析的顏色語法是縮減版:十六進位、rgb()、hsl()、oklch()、oklab(),加上八個常見顏色名。完整的 CSS 顏色詞彙在 H01,包括 lab()、hwb()、color() 與全部一百多個命名顏色。另外 oklab() 超出色域時這裡是直接夾通道而不是降彩度,跟 H01 的做法不同——那條路徑只是為了讓貼進來的值有個解釋,不是為了精確重現。',
        en: 'The accepted syntax is reduced — hex, rgb(), hsl(), oklch(), oklab() and eight names. The full CSS vocabulary lives in H01, along with lab(), hwb() and color(). Note also that an out-of-gamut oklab() value is clipped here rather than chroma-reduced, unlike H01.',
      },
      {
        zh: 'APCA 的常數是 0.1.9 版,而 APCA 仍在修訂中,未來版本印出來的 Lc 可能跟這裡不同。要寫進稽核報告或無障礙聲明的數字請用 WCAG 那一欄,它是現在唯一有規範地位的。要檢查資訊是不是只靠顏色傳達,那是另一件事,請用 H08。',
        en: 'The APCA constants are version 0.1.9 and APCA is still being revised, so a future version may print a different Lc. Cite the WCAG column in an audit — it is the one with normative standing. For whether information is carried by hue alone, use H08.',
      },
    ],
  },
};
