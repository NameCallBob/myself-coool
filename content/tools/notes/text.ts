import type { ToolNote } from './index';

/** Drawer A — what each indexable tool in this drawer will not do. */
export const TEXT_NOTES: Record<string, ToolNote> = {
  'text-diff': {
    limits: [
      {
        zh: '只比文字,不比結構;JSON 或程式碼的欄位變動請用 C05。',
        en: 'Compares text, not structure. For JSON or code use C05.',
      },
      {
        zh: '逐行模式把 CRLF 與 LF 視為相同,要檢查換行差異請用 B06。',
        en: 'Line mode treats CRLF and LF as equal. To inspect line endings use B06.',
      },
    ],
  },

  'text-stats': {
    limits: [
      {
        zh: '句數是用句末標點推估的,e.g. 這類縮寫會被多算一句。',
        en: 'Sentence counts are estimated from terminators; abbreviations such as "e.g." count as an extra sentence.',
      },
      {
        zh: '中文只算字頻,沒有詞頻;最短長度門檻只對英文詞生效。',
        en: 'CJK gets character frequency, never word frequency; the minimum-length filter applies to Latin words only.',
      },
      {
        zh: '超過兩百萬字元只計算前面一段,結果會標明已截斷。',
        en: 'Past two million characters only the head is counted, and the result says it was truncated.',
      },
    ],
  },

  'case-convert': {
    limits: [
      {
        zh: '中文沒有大小寫,標題式與句首大寫套在中文上不會有變化。',
        en: 'CJK has no letter case, so title and sentence case do nothing to Chinese.',
      },
      {
        zh: '句首大寫會先整段轉小寫,iPhone 這類混合大小寫不會保留。',
        en: 'Sentence case lowercases everything first, so mixed-case names such as iPhone are flattened.',
      },
      {
        zh: '大小寫轉換不可逆(ß 會變成 ss),也不轉寫重音字;URL slug 請用 A08。',
        en: 'Case conversion is not reversible (ß becomes ss) and accents are not transliterated; for URL slugs use A08.',
      },
    ],
  },

  'cjk-tidy': {
    limits: [
      {
        zh: '標點半形化不可逆:、和,都會變成半形逗號,轉回只會得到,。',
        en: 'Narrowing punctuation is lossy: both 、 and ， become a plain comma, and widening never gives 、 back.',
      },
      {
        zh: '「依上下文」是逐行判斷,中英文混在同一行會整行套中文規則。',
        en: 'Contextual mode decides per line, so a mixed Chinese and English line gets the Chinese rules throughout.',
      },
      {
        zh: '只轉全形英數,不做 Unicode 正規化;縮排與行尾空白請用 A07。',
        en: 'Converts full-width letters and digits only, not full Unicode normalisation; for indents and trailing whitespace use A07.',
      },
    ],
  },

  'pii-mask': {
    limits: [
      {
        zh: '這是過濾器不是保證:姓名、地址與自訂編號不會命中,輸出請自己再讀一遍。',
        en: 'A filter, not a guarantee: names, addresses and your own id schemes are not matched, so read the output.',
      },
      {
        zh: '電話與證號只認台灣格式;統一編號與長 base64 偵測器預設關閉。',
        en: 'Phone and ID patterns are Taiwan-only; the 統一編號 and long-base64 detectors ship off.',
      },
      {
        zh: 'partial 保留的碼仍可比對,對外請用 label 或 fixed;截圖用 I04。',
        en: 'Partial mode leaves digits that can still be matched, so use label or fixed for outsiders; for screenshots use I04.',
      },
    ],
  },
};
