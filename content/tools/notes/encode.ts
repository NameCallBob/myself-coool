import type { ToolNote } from './index';

/** Drawer B — what each indexable tool in this drawer will not do. */
export const ENCODE_NOTES: Record<string, ToolNote> = {
  base64: {
    limits: [
      {
        zh: '檔案上限 8 MiB,超過就拒收;大型二進位檔請用 B10。',
        en: 'Files over 8 MiB are refused; use B10 for large binaries.',
      },
      {
        zh: '解碼 PEM 前要自己刪掉 BEGIN/END 那兩行,否則會安靜地解出垃圾。',
        en: 'Strip the BEGIN/END lines before decoding a PEM, or it decodes to garbage without erroring.',
      },
      {
        zh: '它不拆 JWT 的三段,也不驗簽章,要看 JWT 請用 D03。',
        en: 'It neither splits JWT segments nor verifies signatures; use D03 for that.',
      },
    ],
  },

  'url-codec': {
    limits: [
      {
        zh: '它只切開網址,不做驗證、punycode 與路徑正規化;要檢查網址請用 J02。',
        en: 'It only splits a URL apart: no validation, punycode or path normalisation. Use J02 to check URLs.',
      },
      {
        zh: '拆開再組回去字串一致,但 query 裡連續分隔符之間的空分段會消失。',
        en: 'Split and rejoin returns the same string, except that empty chunks between consecutive query separators are dropped.',
      },
      {
        zh: '它只處理 percent-encoding,HTML 實體請用 B03。',
        en: 'Percent escapes only; HTML entities need B03.',
      },
    ],
  },
};
