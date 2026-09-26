import type { ToolNote } from './index';

/** Drawer F — what each indexable tool in this drawer will not do. */
export const TIME_NOTES: Record<string, ToolNote> = {
  timezone: {
    limits: [
      {
        zh: '只支援西元 100 到 275760 年;1891 年前的秒級偏移會對不回原本輸入。',
        en: 'Years 100 to 275760 only; pre-1891 offsets in seconds cannot format back exactly.',
      },
      {
        zh: '「日光節約中」是由一月與七月偏移推論,非季節性時區會標錯,請看偏移欄位。',
        en: 'The DST flag is inferred from January and July offsets, so zones that do not shift seasonally are mislabelled — read the offset column.',
      },
      {
        zh: '變更表只往後掃 400 天;找共同開會時段請用 F07,算工作日請用 F02。',
        en: 'The change table scans 400 days ahead. Use F07 for shared meeting hours and F02 for working days.',
      },
    ],
  },
};
