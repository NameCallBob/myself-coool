import type { ToolNote } from './index';

/** Drawer DESIGN — "how it works" prose for the indexable tools in this drawer. */
export const DESIGN_NOTES: Record<string, ToolNote> = {
  'color-convert': {
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
        zh: '顏色名稱只在顏色本來就落在 sRGB 內時才標。超出 sRGB 的顏色壓回來之後有機會剛好撞上某個命名顏色的十六進位值(oklch(0.8 0.4 72) 壓完正好是 #ffa500),標成「orange」的話,那是使用者沒有輸入過的顏色名,所以那種情況一律不標。',
        en: 'A colour is only named when it already fits sRGB. A colour from outside can land on a named hex once it has been mapped — oklch(0.8 0.4 72) maps onto exactly #ffa500 — and calling that "orange" would label the input with a colour nobody typed, so it is left unnamed.',
      },
      {
        zh: '一次只處理一個顏色。要從一個顏色長出整條感知均勻的色階請用 H03,要看兩個顏色之間怎麼插值請用 H04,要確認這個配色在色覺缺陷下還分得開請用 H08。',
        en: 'One colour at a time. For a perceptually even ramp use H03, for interpolation between two colours H04, and to check a palette still separates under colour-vision deficiency, H08.',
      },
    ],
  },

  contrast: {
limits: [
      {
        zh: '它只看得到兩個顏色。字級、字重、字型的實際筆畫粗細、文字是不是壓在照片或漸層上、使用者有沒有調系統字體大小——這些都影響可讀性而這裡一個都不知道,所以本文與大字兩欄都列出來,選哪一欄是你的判斷。',
        en: 'It sees two colours and nothing else: not the size, the weight, how thin the typeface actually draws, or whether the text sits over a photo. Both the body and large-text columns are reported and choosing between them is your call.',
      },
      {
        zh: '剖析的顏色語法是縮減版:十六進位、rgb()、hsl()、oklch()、oklab(),加上八個常見顏色名。完整的 CSS 顏色詞彙在 H01,包括 lab()、hwb()、color() 與全部一百多個命名顏色。oklab() 與 oklch() 超出色域時走的是同一條路——固定明度與色相、降彩度,因為 oklab() 只是同一個顏色的直角座標寫法;夾通道會同時改掉色相與明度,量出來的對比率就會是另一個顏色的。',
        en: 'The accepted syntax is reduced — hex, rgb(), hsl(), oklch(), oklab() and eight names. The full CSS vocabulary lives in H01, along with lab(), hwb() and color(). Out-of-gamut oklab() and oklch() values take the same route — hold lightness and hue, reduce chroma — because oklab() is only the rectangular spelling of the same colour; clipping the channels moves both hue and lightness, and the ratio then belongs to a different colour.',
      },
      {
        zh: 'APCA 的常數是 0.1.9 版,而 APCA 仍在修訂中,未來版本印出來的 Lc 可能跟這裡不同。要寫進稽核報告或無障礙聲明的數字請用 WCAG 那一欄,它是現在唯一有規範地位的。要檢查資訊是不是只靠顏色傳達,那是另一件事,請用 H08。',
        en: 'The APCA constants are version 0.1.9 and APCA is still being revised, so a future version may print a different Lc. Cite the WCAG column in an audit — it is the one with normative standing. For whether information is carried by hue alone, use H08.',
      },
    ],
  },
};
