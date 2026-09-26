import type { ToolNote } from './index';

/** Drawer DESIGN — what each indexable tool in this drawer will not do. */
export const DESIGN_NOTES: Record<string, ToolNote> = {
  'color-convert': {
    limits: [
      {
        zh: '螢幕取色需要 EyeDropper API,目前只有 Chromium 系列瀏覽器有。',
        en: 'Screen picking needs the EyeDropper API, today only in Chromium browsers.',
      },
      {
        zh: 'color() 只支援 srgb、srgb-linear 與 display-p3。',
        en: 'Inside color() only srgb, srgb-linear and display-p3 are accepted.',
      },
      {
        zh: '一次只轉一個顏色;色階用 H03,插值用 H04,色盲檢查用 H08。',
        en: 'One colour at a time: ramps H03, interpolation H04, colour-blind checks H08.',
      },
    ],
  },

  contrast: {
    limits: [
      {
        zh: '只看兩個顏色,不管字級、字重或背景照片;色覺檢查請用 H08。',
        en: 'Two colours only — no size, weight or photo backdrop; for colour vision use H08.',
      },
      {
        zh: '只收十六進位、rgb、hsl、oklch、oklab 與八個顏色名;完整語法請用 H01。',
        en: 'Accepts hex, rgb, hsl, oklch, oklab and eight names; full syntax in H01.',
      },
      {
        zh: 'APCA 的 Lc 仍在修訂中;要寫進稽核報告請引用 WCAG 那一欄。',
        en: 'APCA Lc values are still being revised; cite the WCAG column in an audit.',
      },
    ],
  },
};
