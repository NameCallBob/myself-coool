import type { ToolNote } from './index';

/** Drawer NET — "how it works" prose for the indexable tools in this drawer. */
export const NET_NOTES: Record<string, ToolNote> = {
  cidr: {
    body: [
      {
        zh: '子網路計算只有一個動作:用前綴長度造出遮罩,再跟位址做位元運算。/24 的遮罩就是前 24 個位元是 1、後 8 個是 0,把位址跟它做 AND 得到網段位址,跟它的反向遮罩做 OR 得到區塊的最後一個位址。IPv4 與 IPv6 的差別只在位址寬度是 32 還是 128 位元,規則完全一樣。',
        en: 'Subnetting is one operation: build a mask from the prefix length, then do bitwise arithmetic with the address. A /24 mask is twenty-four ones followed by eight zeros; AND it with the address for the network address, OR it with its complement for the last address in the block. IPv4 and IPv6 differ only in whether the address is 32 or 128 bits wide.',
      },
      {
        zh: '這裡兩個家族都存成 bigint,不是因為 IPv6 需要,而是因為 IPv4 用 JavaScript 的位元運算會出錯:`&`、`|`、`~` 會先把運算元轉成有號 32 位元整數,所以 0.0.0.0/1 的反向遮罩算出來是負數,之後每一個比較都跟著錯。一種數字型別處理兩個家族,直接消掉這一整類 bug。',
        en: 'Both families are held as bigint here, not because IPv6 demands it but because IPv4 in JavaScript does: `&`, `|` and `~` coerce to *signed* 32-bit integers, so the complement of a /1 mask comes back negative and every comparison after that is wrong. One numeric type for both families removes the whole class of bug.',
      },
      {
        zh: '可用主機數是各家計算器最常給出不同答案的地方,所以三種情況分開寫。/30 以下扣掉網段位址與廣播位址,是 2^n − 2。/31 沒有廣播位址:RFC 3021 把兩個位址都給點對點鏈路的兩端,可用數是 2。/32 是一台主機,沒有網段的概念。IPv6 根本沒有廣播——它的位置由多播取代——所以整個區塊都可以配置;全零主機部分被保留為子網路路由器 anycast(RFC 4291 §2.6.1),但那是給路由器的保留,不從數量裡扣。',
        en: 'Usable host counts are where calculators disagree, so the three cases are written out. At /30 and shorter you lose the network and broadcast addresses: 2^n − 2. A /31 has no broadcast address at all — RFC 3021 gives both of its addresses to the two ends of a point-to-point link — so the count is 2. A /32 is one host and no network. IPv6 has no broadcast address; its role is taken by multicast, so the whole block is addressable. The all-zeros host part is reserved as the subnet-router anycast address (RFC 4291 §2.6.1), but that is a reservation for routers rather than a hole in the count.',
      },
      {
        zh: '「位址性質」那一欄是照 IANA 特殊用途登錄表做最長前綴比對,跟路由表解析的方式一樣,所以 2001:db8::1 會判成文件用位址而不是 Teredo,即使 2001::/32 也涵蓋它。範圍轉 CIDR 用的是對齊法:每一步取「能從目前位置開始、又不超出結尾」的最大區塊,`cursor & -cursor` 取出最低位的 1,那就是目前位置的對齊度,也就是能合法起始的最大區塊大小。',
        en: 'The scope column is a longest-prefix match against the IANA special-purpose registries, resolved the way a routing table would: 2001:db8::1 is documentation, not Teredo, even though 2001::/32 also covers it. Range-to-CIDR works by alignment — at each step it takes the largest block that both starts at the current position and does not run past the end, and `cursor & -cursor` isolates the lowest set bit, which is exactly that position’s alignment.',
      },
    ],
    limits: [
      {
        zh: 'IPv4 的前導零一律拒絕。010.0.0.1 在這個剖析器裡是十,在 inet_aton 裡是八,而哪一家函式庫用哪一種解讀就是一長串 SSRF 繞過的來源——拒絕這種寫法是唯一不會默默算錯的選擇。',
        en: 'Leading zeros in IPv4 are refused outright. 010.0.0.1 is ten to this parser and eight to inet_aton, and which reading a given library takes is the root of a long line of SSRF bypasses. Refusing the form is the only answer that cannot be quietly wrong.',
      },
      {
        zh: '切分子網段與範圍轉 CIDR 都有列表上限。把 /8 切成 /32 是四十億列,那不是使用者要看的東西,超過上限時會說明只列出前面幾筆,而不是把分頁凍住。',
        en: 'Subnet splitting and range decomposition are both capped. A /8 cut into /32s is four billion rows; past the cap the tool says how many it is showing instead of freezing the tab.',
      },
      {
        zh: '這裡只做算術。不查 whois、不問 DNS、不測連通性,「全球單播」只代表「沒有被保留給特別用途」,不代表那個位址通。要換算 IPv4 與整數、或做位元檢視,請用 B 抽屜的進位轉換與位元運算工具。',
        en: 'This is arithmetic only: no whois, no DNS, no reachability. "Global unicast" means "not reserved for anything in particular", not "reachable". For address-to-integer conversion or bit-level inspection, use the radix and bitwise tools in drawer B.',
      },
    ],
  },

  'url-inspect': {
    body: [
      {
        zh: '解析本身交給瀏覽器的 URL 介面,因為那就是 WHATWG 的演算法,也就是「瀏覽器實際會怎麼看這串字」的定義。自己寫剖析器只會跟真實行為產生分歧。剩下的工作都是 URL 介面本身答不出來的問題。',
        en: 'The parse itself is the browser’s URL interface, because that is the WHATWG algorithm and therefore the definition of what a browser will do with the string. Writing a second parser would only create disagreements with reality. Everything else here exists because the URL interface cannot answer it.',
      },
      {
        zh: '查詢字串在這裡重新拆一次,不用 URLSearchParams。理由是它會把 ?a 與 ?a= 視為相同——前者沒有等號、後者有一個空值,而有些後端把這兩種當成不同的意思;它也不會告訴你同一個參數出現了兩次。?id=1&id=2 對不同框架的意義不一樣(取第一個、取最後一個、變成陣列),把它折疊起來剛好藏住某個請求行為詭異的原因,所以這裡照原順序保留每一筆,包含重複。',
        en: 'The query is re-parsed here rather than handed to URLSearchParams, which treats ?a and ?a= as the same thing — one has no equals sign, the other an empty value, and some back ends distinguish them — and which cannot tell you a parameter appeared twice. ?id=1&id=2 means different things to different frameworks (first wins, last wins, becomes an array), and collapsing it hides the reason a request behaves oddly. Every pair is kept, in order, duplicates included.',
      },
      {
        zh: '主機名稱那一欄有兩種寫法,因為國際化網域有兩種形式:瀏覽器實際連線用的是 Punycode 的 xn-- 形式,網址列顯示的是 Unicode。這裡自己實作了 RFC 3492 的編解碼,順便做一件事:如果某個標籤裡混用了拉丁、斯拉夫、希臘這三種長得很像的字母,就標出來。那是仿冒網域最常見的手法——把 apple 的 a 換成斯拉夫字母的 а,肉眼分不出來。',
        en: 'The host appears in two forms, because an internationalised domain has two: the browser connects to the Punycode xn-- form while the address bar shows Unicode. RFC 3492 is implemented here in both directions, and while it is at it the tool flags any label mixing two of the three look-alike alphabets — Latin, Cyrillic, Greek. That is the standard homograph trick: replace the a in apple with a Cyrillic а and no reader can tell.',
      },
      {
        zh: '清理追蹤參數的清單來自各廣告平台自己的文件與 Firefox 的查詢字串清理設定。這種清單本質上會過期,廣告網路加參數比任何人更新清單都快,而且任何網站都可以讓其中一個變成必要參數,所以它在畫面上可以直接編輯。路徑則一律不動:大小寫不改、順序不排、不做正規化——/A 與 /a 是兩個不同的資源,一個會「順手整理」路徑的清理器會弄壞連結。',
        en: 'The tracking-parameter list comes from each ad platform’s own documentation and Firefox’s query-stripping list. Any such list expires: networks add parameters faster than lists are updated, and any site is free to make one of them load-bearing, which is why it is editable on the page. The path, by contrast, is never touched — not re-cased, not reordered, not normalised. /A and /a are different resources, and a cleaner that tidies them breaks links.',
      },
    ],
    limits: [
      {
        zh: '沒有 scheme 的字串會自動補上 https:// 再試一次,但只在開頭本來就長得像主機名稱的時候。ht!tp://x 不會變成 https://ht!tp//x——那會解析成功並且不是任何人的意思,錯誤答案比錯誤訊息糟糕得多。',
        en: 'A string with no scheme is retried with https:// in front, but only when the start already looks like a host name. ht!tp://x does not become https://ht!tp//x, which would parse and would not be what anyone meant; a wrong answer is far worse than an error.',
      },
      {
        zh: 'Punycode 的實作是純 RFC 3492,沒有做 UTS-46 的映射與正規化,所以它不是完整的 IDNA。它可以告訴你 xn-- 標籤長什麼樣子、幫你看出混script的仿冒手法,但不要拿它的輸出當安全判斷的依據——真正的比對要在做過 UTS-46 之後才有意義。',
        en: 'The Punycode implementation is RFC 3492 alone, without UTS-46 mapping and normalisation, so it is not full IDNA. It will show you what an xn-- label says and help you spot a mixed-script imposter, but do not use its output as a security decision: a meaningful comparison has to happen after UTS-46.',
      },
      {
        zh: '追蹤參數清單不是規範,是觀察。移除它們不會改變你拿到哪一頁——這些參數的作用是標記點擊來源而不是選擇內容——但如果某個網站真的把 utm_source 當成路由的一部分,清理過的網址就會壞掉。以網站的實際行為為準,不要以清單為準。',
        en: 'The tracking list is an observation, not a specification. Removing those parameters does not change which page you get, because they identify the click rather than select content — but if a site really does route on utm_source, the cleaned URL breaks. Trust the site’s behaviour over the list.',
      },
      {
        zh: '這一頁不連任何地方。它不會去抓那個網址、不會跟隨重新導向、不會告訴你那個連結還活著。',
        en: 'Nothing here is fetched. The tool does not visit the URL, does not follow redirects, and cannot tell you whether the link still works.',
      },
    ],
  },

  'tw-validate': {
    body: [
      {
        zh: '國民身分證、2021 年起的新式統一證號、舊式的兩個英文字母統一證號,三種格式共用同一個加權和。第一個英文字母先依內政部的對照表展開成兩位數,權重分別是 1 與 9;舊式統一證號的第二個字母佔第三個位置,只貢獻它對照值的個位數;其後每一位的權重是 8、7、6…2,最後一位檢查碼權重 1。總和是 10 的倍數就通過。這個設計是刻意的——新式統一證號把第二位改成 8 或 9,讓原本只驗身分證的系統不用改就能接受它。',
        en: 'The national ID, the 2021 resident number, and the older two-letter resident number all share one weighted sum. The leading letter expands to two digits from the Ministry of the Interior’s table, weighted 1 and 9; in the legacy resident format the second letter takes the third slot and contributes only the units digit of its value; everything after that is weighted 8, 7, 6 … 2, and the final check digit 1. Valid when the total is a multiple of ten. The design is deliberate: the 2021 format puts 8 or 9 in the second position so that systems validating only national IDs accept it unchanged.',
      },
      {
        zh: '字母對照表不是按字母順序排的,因為它跟著當年的行政編號:I 是 34、O 是 35,接在 Z 之後,原因是嘉義市與新竹市後來才升格。那個字母記的是「第一次發證的戶政事務所」,不是現在住哪裡,所以看到 L(臺中縣)或 Y(陽明山管理局,1974 年撤銷)這種已經不存在的行政區是正常的。',
        en: 'The letter table is not alphabetical, because it follows the administrative numbering of the time: I is 34 and O is 35, tacked on after Z, because Chiayi City and Hsinchu City were promoted later. The letter records the household-registration office of *first* issue, not where the holder lives now, so letters for places that no longer exist — L for Taichung County, Y for the Yangmingshan Administration, abolished in 1974 — are entirely normal.',
      },
      {
        zh: '統一編號用財政部的「邏輯乘法」:每一位乘上權重 1、2、1、2、1、2、4、1,然後把乘積的各位數加起來,所以 7×4=28 貢獻的是 2+8=10 而不是 28。這裡有兩件事會讓人踩到。第一,2023 年 4 月 1 日起判定規則從「總和是 10 的倍數」改成「5 的倍數」,因為剩下未發放的號碼沒辦法全部滿足較嚴的規則;2023 年之前發的號碼兩種規則都過,所以還在用舊規則的系統只會退掉新號碼,那正是最難找的那種 bug。第二,第七位是 7 的時候,官方規則允許總和照算或加一,所以那種號碼有兩個可接受的總和——這不是實作寫錯。兩種判定這裡都會列出來。',
        en: 'The business number uses the Ministry of Finance’s logical multiplication: each digit times weights 1, 2, 1, 2, 1, 2, 4, 1, then the *digits of each product* are added, so 7×4 = 28 contributes 2+8 = 10 rather than 28. Two things trip people up. First, on 1 April 2023 the rule changed from "the total is a multiple of 10" to "a multiple of 5", because the remaining unissued numbers could not all satisfy the stricter form; numbers issued before then pass both, so a system still checking mod 10 rejects only the new ones — exactly the kind of bug that is hard to find. Second, when the seventh digit is 7 the official rule allows the total as-is or plus one, so such a number has two acceptable totals. That is not an implementation error. Both verdicts are reported.',
      },
      {
        zh: '手機號碼沒有檢查碼。台灣的 09 開頭號碼是純號碼,沒有任何可以驗算的東西,所以這裡驗的只有格式:09 加八位數字,並把 +886 折回本地寫法。哪些 09xx 號段真的發給了業者是 NCC 的配號表,會變,而且號碼可以跨業者攜出,所以這個工具刻意不假裝知道。市話的區碼表倒是有位數可以核對,但號碼計畫本身會改——臺北市 2000 年就從 7 碼變成 8 碼——所以那張表在畫面上可以編輯。',
        en: 'Mobile numbers carry no check digit. A Taiwanese 09 number is just a number with nothing to verify, so only the shape is checked: 09 plus eight digits, with +886 folded back to the local form. Which 09xx blocks are actually allocated is an NCC table that changes, and numbers port between carriers anyway, so this tool deliberately does not pretend to know. Landlines do have a digit count worth checking, but numbering plans change — Taipei went from seven digits to eight in 2000 — so that table is editable on the page.',
      },
    ],
    limits: [
      {
        zh: '檢查碼只能證明號碼「編得對」。編得對的號碼不代表有人持有它,不代表那個人是誰,也不代表那家公司還在營業。這一頁不查任何資料庫,也沒有資料庫可以查——要確認統一編號對應的公司,去財政部稅籍登記查詢;要確認身分,那不是一個網頁能做的事。',
        en: 'A check digit only proves the number is well formed. A well-formed number does not mean anyone holds it, does not say who, and does not mean a company is still trading. Nothing is looked up here and there is nothing to look up: to confirm which company a business number belongs to, use the Ministry of Finance’s registry; to confirm an identity, a web page is the wrong instrument.',
      },
      {
        zh: '舊式(兩個英文字母)統一證號的檢查碼規則是照移民署公告的編碼原則實作的,權重配置與計算順序都對得上文件,但沒有公開的合法號碼清單可以逐筆比對,所以那一部分的信心度低於身分證與統一編號——後兩者有公開可驗的已知值。',
        en: 'The legacy two-letter resident number is implemented from the National Immigration Agency’s published encoding rules, and the weights and ordering match the document, but there is no public list of valid numbers to check case by case. Confidence in that branch is therefore lower than for the national ID and the business number, both of which have publicly verifiable known values.',
      },
      {
        zh: '沒有做的:健保卡號、統一發票號碼、銀行帳號、自然人憑證。前三者沒有公開的檢查碼規則可以實作,硬做出來的「驗證」只會給人錯誤的信心。',
        en: 'Not covered: health insurance card numbers, invoice numbers, bank account numbers, citizen digital certificates. The first three have no published check-digit rule to implement, and a "validation" invented for them would only create false confidence.',
      },
      {
        zh: '整批檢查有筆數上限。輸入的號碼不會被記住、不會被上傳、不寫進瀏覽器儲存空間——關掉分頁就沒了。',
        en: 'Batch checking is capped. Nothing you type is remembered, uploaded, or written to browser storage; closing the tab is the end of it.',
      },
    ],
  },
};
