import type { ToolNote } from './index';

/** Drawer B — "how it works" prose for the indexable tools in this drawer. */
export const ENCODE_NOTES: Record<string, ToolNote> = {
  base64: {
limits: [
      {
        zh: '檔案上限 8 MiB,超過就直接拒收。先撐不住的不是編碼器,是那個要裝下比原檔再長三分之一的字串的文字框。要翻大型二進位檔的內容請用 B10,它在 Worker 裡串流讀。',
        en: 'Files over 8 MiB are refused: the bottleneck is the textarea holding a string a third longer than the file, not the encoder. For large binaries use B10, which streams in a Worker.',
      },
      {
        zh: '解碼時空白會被跳過,所以一段 PEM 的內容可以整塊貼進來解。但 -----BEGIN CERTIFICATE----- 的那些連字號在 URL-safe 表裡是合法字元(值 62),連頭尾兩行一起貼不會報錯,會安靜地解出一堆垃圾。那兩行要自己刪掉。',
        en: 'Whitespace is skipped on decode, so a PEM body pastes in fine — but the dashes in -----BEGIN CERTIFICATE----- are legal URL-safe characters (value 62), so the header lines decode silently into garbage instead of erroring. Strip them yourself.',
      },
      {
        zh: '解碼預設是寬鬆的,padding 有幾個不算:QQ= 少了一個 =,但那兩個資料字元指的位元組沒有歧義,寧可讀出來也不要拒收——要檢查「資料字元數加 padding 是不是四的倍數」得勾嚴格模式。位置還是每次都管:= 出現在資料前面會報錯,整串只有 = 也會報錯,因為那不是「零個位元組」的寫法,空字串才是。',
        en: 'Lenient decoding does not count the padding: QQ= is one = short, but its two data characters name one byte unambiguously, so it is read rather than refused — the length arithmetic is a strict-mode check. Position is checked for every caller: data after = is an error, and so is a string of nothing but =, which is not how zero bytes are written (the empty string is).',
      },
      {
        zh: '它只做 Base64,不會幫你拆 JWT 的三段,也完全不驗簽章。要看 JWT 請用 D03。',
        en: 'It only does Base64 — it will not split a JWT into its three segments and it verifies no signature. Use D03 for that.',
      },
    ],
  },

  'url-codec': {
limits: [
      {
        zh: '拆網址用的是 RFC 3986 附錄 B 裡那份規格自己印出來的正規式,它只負責切開,不負責驗證——那條式子對任何字串都會匹配成功,包括空字串。authority 是從第一個冒號切開的(host 裡不可能有冒號),所以 exam:ple:x 會得到 host exam 與 port ple:x;port 不是十進位數字、或超過 65535 時表格下面會說一句,其餘一概不驗:不做 IDN / punycode 轉換,也不做路徑的 dot-segment 正規化。要把網址當成網址來檢查與清理請用 J02。',
        en: 'The splitter is the RFC 3986 Appendix B regex, which matches every string including the empty one: it separates, it does not validate. The authority is cut at its first colon, since a host cannot contain one, so exam:ple:x gives host exam and port ple:x — and a port that is not decimal digits within 65535 is called out under the table. Nothing else is checked: no punycode conversion, no path normalisation. For inspecting and cleaning URLs as URLs, use J02.',
      },
      {
        zh: '拆開再組回去會拿到同一個字串,空的分隔符也還在:https://example.com/? 的問號、空的 #、file:/// 的空 authority、query 裡孤零零的 ?= 都留著——對絕大多數伺服器來說「有 query 但是空的」與「沒有 query」沒差,但如果你在逐字比對兩個網址,它有差。唯一還不保證還原的是連續的分隔符:a=1&&b=2 會讀成兩筆,重組時中間那個空分段就不在了,因為一列沒有名稱、沒有值、連等號都沒有時,它不代表任何參數。',
        en: 'Splitting and rejoining returns the same string, empty delimiters included: the ? of https://example.com/?, an empty #, the empty authority of file:///, and a bare ?= in the query all survive — most servers do not care, but a string comparison does. Consecutive separators are the exception: a=1&&b=2 reads as two pairs and the empty chunk between them is gone, because a row with no key, no value and no equals sign is not a parameter.',
      },
      {
        zh: '它只處理 percent-encoding。一段同時混著 %-escape 與 &amp; 的字串,這裡只會處理前者,HTML 實體請用 B03。',
        en: 'Percent escapes only. A string that also carries &amp; needs B03 for the entity half.',
      },
    ],
  },
};
