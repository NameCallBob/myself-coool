import type { ToolNote } from './index';

/** Drawer B — "how it works" prose for the indexable tools in this drawer. */
export const ENCODE_NOTES: Record<string, ToolNote> = {
  base64: {
    body: [
      {
        zh: '這裡的編解碼是自己寫出來的,沒有走 btoa / atob。btoa 只認 latin-1,碰到 U+00FF 以上的字元就丟例外,所以每一個包在它外面的函式都要先把 UTF-8 位元組偽裝成一串 char code——「Base64 把中文弄壞了」的回報幾乎全部都追到這一步漏掉了一半。改成直接吃 Uint8Array 之後這個問題就不存在了:位元組進去,字元出來,中間沒有「要先變成哪種字串」的空間。三個位元組切成四組 6-bit 查表,尾端不足三個的補零,再依設定決定要不要補 =。RFC 4648 §4 的 +/ 與 §5 的 -_ 兩套字母表放在同一張 128 格的 Int8Array 裡,解碼時兩套都收——一段 JWT 與一段 MIME 內容是同一堆位元組,在願意讀它之前先問你貼的是哪個變體,是個沒有答案有用的問題。',
        en: 'Encoding is written out rather than handed to btoa, which only speaks latin-1 and throws above U+00FF; every wrapper around it smuggles UTF-8 through char codes, and that is where "Base64 breaks Chinese" comes from. Bytes in, characters out. Both RFC 4648 alphabets share one 128-entry decode table, so +/ and -_ are interchangeable on the way in.',
      },
      {
        zh: '不用 atob 的理由更硬一點:它拒絕 URL-safe 字母表、會默默接受不合法的尾端,而它丟出來的錯誤只有一句 InvalidCharacterError,不含位置。一件工作是「告訴你這串為什麼解不開」的工具,只能自己掃過每個字元。所以這裡每個錯誤都帶一個 0-based 位移,介面拿它畫指標;長度也在同一輪裡檢查:四個字元帶三個位元組,除四餘 1 代表多出孤零零的六個位元,不是一個完整位元組,在任何變體裡都不合法——與其回傳一段截斷的結果,不如指著那個位置說它不合法。另外有一個只描述、不判斷的檢查:空白幾個、= 幾個、只屬於標準表的 +/ 幾個、只屬於 URL-safe 的 -_ 幾個、預期會解出幾個位元組,以及兩套符號是否同時出現(那通常是兩個變體被接在一起了)。盯著一段壞掉的 token 的人要的是這幾個數字,不是一行紅字。',
        en: 'atob is worse for this purpose: it rejects the URL-safe alphabet, accepts some non-canonical tails, and reports only InvalidCharacterError with no offset. Every error here carries a 0-based index for a caret, and a separate pass describes the string without judging it — whitespace, padding, which alphabet the symbols belong to, expected byte count, and whether two variants were spliced together.',
      },
      {
        zh: '嚴格模式處理的是尾端那幾個沒人看的位元。atob 會把 Zg== 和 Zh== 都解成 0x66:兩字元的尾端有 4 個位元、三字元的尾端有 2 個位元根本沒被用到,填什麼都解得出同一個位元組。純粹讀內容時這不重要,但只要你要比較兩個 token、或把解出來的位元組重新編碼回去對照,兩個不同的字串對應到同一堆位元組就會咬人。勾起嚴格模式之後,那些未使用的位元不是零就拒收。預設是關的,因為多數人貼一段 Base64 進來只是想看看裡面寫什麼,那種時候寬鬆比正確有用。',
        en: 'Strict mode rejects a non-canonical tail: the last character carries 4 or 2 bits that nothing reads, so Zg== and Zh== both decode to 0x66. Harmless when reading, wrong when comparing or re-encoding tokens, and off by default because most pastes are just being read.',
      },
      {
        zh: '換行寬度只有兩個選項,76 與 64,因為它們不是品味問題:76 是 RFC 2045 給 MIME 內容寫死的值,64 是 RFC 7468 給 PEM 寫死的值,自己挑一個數字只會讓某一端的 parser 不收。Data URI 那一側預設用 Base64,但也做了 percent-encoding 的形式;解析時 ;base64 當旗標處理,跟 charset 這類真的參數分開,而型別留空則依 RFC 2397 補回 text/plain;charset=US-ASCII。工具介面上另外寫了一句該寫的話:data URI 會讓位元組再長三分之一,而且瀏覽器無法單獨快取它——小圖示可以,照片不要。',
        en: 'Wrap widths are 76 (RFC 2045, MIME) and 64 (RFC 7468, PEM) because both are fixed by spec, not preference. Data URIs default to base64 but the percent form is there too; ;base64 is parsed as a flag rather than a parameter, and an omitted type falls back to text/plain;charset=US-ASCII per RFC 2397.',
      },
    ],
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
        zh: '它只做 Base64,不會幫你拆 JWT 的三段,也完全不驗簽章。要看 JWT 請用 D03。',
        en: 'It only does Base64 — it will not split a JWT into its three segments and it verifies no signature. Use D03 for that.',
      },
    ],
  },

  'url-codec': {
    body: [
      {
        zh: '「URL 編碼」不是一個動作,是四個,所以模式是這件工具逼你選的東西,而且每個模式的定義是一張「哪些位元組原樣留著」的表,不是轉手交給某個內建函式、再去查它到底留了什麼。encodeURIComponent 會留下 !\'()*,因為它是照 RFC 2396 寫的,那份規格把這幾個字元歸為 mark;RFC 3986 把它們改成 sub-delimiter,於是一個帶單引號的檔名能安然通過 encodeURIComponent,再去弄壞另一端解析 URL 的程式。嚴格模式只留 RFC 3986 §2.3 的 unreserved,也就是 A–Z a–z 0–9 與 - . _ ~ 共 66 個字元。表單那個模式根本不屬於 RFC 3986:它是 HTML 的 urlencoded 序列化,unreserved 少一個 ~、多一個 *,而且空白變成 +——一個代表空白的 + 與一個代表加號的 +,在你已經知道自己在讀哪一種之前是分不出來的。整段網址用的模式則刻意連 encodeURI 的怪癖一起複製:它會把 IPv6 字面位址的方括號也編掉,這裡沒有順手改好。',
        en: 'Percent-encoding is four different operations, so the mode is a choice you have to make, each defined by the exact byte set it leaves alone. encodeURIComponent keeps !\'()* because RFC 2396 called them marks and RFC 3986 made them sub-delimiters; strict mode keeps only the 66 unreserved characters; form mode is HTML urlencoded, where space becomes + and a + meaning space is indistinguishable from a literal plus.',
      },
      {
        zh: '編碼一律先過 TextEncoder 變成 UTF-8 位元組,再逐個位元組處理:「中」是 %E4%B8%AD 三個 escape,任何照 UTF-16 code unit 去轉的實作會生出 %U4E2D 這種地球上沒有東西解得開的字串。解碼這側的麻煩不一樣:decodeURIComponent 對「escape 本身寫壞了」與「escape 解出來的位元組不是合法 UTF-8」丟同一個 URIError,沒有區別也沒有位置,可是這兩件事的修法完全不同——前者是這個字串有錯,後者通常代表它根本不是 UTF-8,或是被編了兩次。所以 UTF-8 的有效性是自己走一遍的:過長編碼、落單的代理對碼位、超過 U+10FFFF、被截斷的續接位元組,各自認出來並記下在第幾個位元組壞掉;同時維護一張「每個位元組來自原字串第幾個字」的對照,錯誤的位置才會指在那個 % 上面,而不是指在解碼後的位元組序號上——那個數字對正在盯著輸入框的人毫無意義。',
        en: 'Encoding runs over UTF-8 bytes, never code units: one ideograph is three escapes. Decoding needs its own UTF-8 validator because decodeURIComponent reports a malformed escape and invalid UTF-8 as the same positionless URIError, though the fixes differ; overlongs, lone surrogates, out-of-range and truncated sequences are each recognised, and a byte-to-character map puts the caret on the offending % rather than on a byte index.',
      },
      {
        zh: 'Query string 的分隔符收 & 也收 ;——HTML 4 推薦過 ; 整整十年,舊連結裡還有,把它當成資料而不是分隔符會安靜地把兩個參數併成一個。每一列記著原本有沒有 =,因為 ?flag 與 ?flag= 不是同一件事,重組的時候要還得回去。重複的 key 會被列出來但不會幫你合併:?a=1&a=2 在 PHP 與 Rails 是一個陣列,在 Express 與 Go 的預設是最後一個贏,這是收這段 query 的伺服器的約定,工具沒有立場替它決定,只能指給你看。重組預設走表單模式,因為那是瀏覽器實際送出的東西、也是多數後端 parser 預期的格式;會需要改成嚴格 RFC 3986 的場合通常是這段 query 要進簽章的 base string,那裡的 + 會被當成真的加號。',
        en: 'Both & and ; separate pairs, since HTML 4 recommended ; for a decade. Each row remembers whether it had an =, because ?flag and ?flag= differ. Duplicate keys are flagged, not merged: they mean a list to PHP and Rails and last-wins to Express and Go, which is the server\'s convention to decide. Rebuilding defaults to form mode; strict RFC 3986 is there for signature base strings.',
      },
      {
        zh: '還有一個很短的函式處理 percent-encoding 最常見的那個 bug:%2520 是某一層把已經編好的 %20 又編了一次。做法是反覆解碼直到結果不再變化,最多五輪,回報這串看起來被編過幾次。答案是 2 以上的時候,要修的是上游那段程式,不是手上這個輸入。',
        en: 'A short routine counts how many times the input appears to have been encoded, decoding to a fixed point with a cap of five rounds. %2520 is a %20 that some layer escaped twice; an answer above one means the bug is upstream, not in the string.',
      },
    ],
    limits: [
      {
        zh: '拆網址用的是 RFC 3986 附錄 B 裡那份規格自己印出來的正規式,它只負責切開,不負責驗證——那條式子對任何字串都會匹配成功,包括空字串。所以它不會告訴你 port 不是數字(exam:ple 會被切成 host exam 與 port ple),也不做 IDN / punycode 轉換與路徑的 dot-segment 正規化。要把網址當成網址來檢查與清理請用 J02。',
        en: 'The splitter is the RFC 3986 Appendix B regex, which matches every string including the empty one: it separates, it does not validate. It will not object that a port is not a number, and it does no punycode conversion or path normalisation. For inspecting and cleaning URLs as URLs, use J02.',
      },
      {
        zh: '重組時空的 query 會消失:https://example.com/? 拆開再組回去就沒有那個問號,把表格裡每一列都清空也一樣。這是重組只在 query 非空時才寫 ? 的直接後果。對絕大多數伺服器來說「有 query 但是空的」與「沒有 query」沒差,但如果你在逐字比對兩個網址,它有差。',
        en: 'An empty query is dropped when rebuilding, so https://example.com/? comes back without the question mark, as does a table whose rows you have all cleared. Most servers do not care; a string comparison does.',
      },
      {
        zh: '它只處理 percent-encoding。一段同時混著 %-escape 與 &amp; 的字串,這裡只會處理前者,HTML 實體請用 B03。',
        en: 'Percent escapes only. A string that also carries &amp; needs B03 for the entity half.',
      },
    ],
  },
};
