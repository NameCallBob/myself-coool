import type { ToolNote } from './index';

/** Drawer NET — "how it works" prose for the indexable tools in this drawer. */
export const NET_NOTES: Record<string, ToolNote> = {
  cidr: {
limits: [
      {
        zh: 'IPv4 的前導零一律拒絕。010.0.0.1 在 inet_aton 眼裡是八進位,解出來是 8.0.0.1,在別的函式庫眼裡是 10.0.0.1;哪一家採哪一種解讀,就是一長串 SSRF 繞過的來源。這個剖析器兩種都不猜,直接不接受這種寫法,那是唯一不會默默算錯的答案。斜線後面的前綴長度守同一條規則:/024 一樣退掉,不會被當成 /24——一個嚴格到位址部分、對前綴部分就鬆手的剖析器,只是在有人記得的地方嚴格而已。',
        en: 'Leading zeros in IPv4 are refused outright. 010.0.0.1 is 8.0.0.1 to inet_aton and 10.0.0.1 to other libraries, and which reading a library takes is the root of a long line of SSRF bypasses; refusing the form is the only answer that cannot be quietly wrong. The prefix length after the slash is held to the same rule: /024 is rejected rather than read as /24, because a parser that is strict about the address and lax about the prefix is only strict where someone remembered to be.',
      },
      {
        zh: '切分與範圍彙總都有列表上限,切分最多列 128 個子網段,範圍最多 64 個區塊。總數照算並顯示,列表截斷時會說明。上限存在的理由很實際:把 /8 切成 /32 是一千六百多萬列,沒有人要看,而在瀏覽器裡跑一個停不下來的迴圈,跟分頁當掉沒有區別。',
        en: 'Splitting lists at most 128 subnets and range decomposition at most 64 blocks; the true total is still computed and the truncation is stated. A /8 cut into /32s is over sixteen million rows, and a runaway loop in a browser is indistinguishable from a crash.',
      },
      {
        zh: '這裡只做算術,不查 whois、不問 DNS、不測連通性。「全球單播」只代表「沒有被保留給特別用途」,不代表那個位址通得到。那份特殊用途清單是 IANA 登錄表在 2024 年的快照,而且是節錄:區段級的項目都在(包含 192.0.0.0/29 的 DS-Lite、192.31.196.0/24 與 192.175.48.0/24 的 AS112、192.52.193.0/24 的 AMT),但 192.0.0.0/24 裡面那幾筆單一位址的協定指派——dummy address、PCP 與 TURN 的 anycast、NAT64 探測用的那一對——沒有逐筆列,它們會顯示成外層的「IETF 協定指派保留」。IANA 之後新增的保留區段不會自己長出來。要把位址當成整數在進位之間搬,請用 G02;要逐位元看遮罩與位移,請用 D06。',
        en: 'Arithmetic only: no whois, no DNS, no reachability test. "Global unicast" means "not reserved for anything in particular", not "reachable". The special-purpose list is a 2024 snapshot of the IANA registry, and an abridged one: every block-level entry is there (including 192.0.0.0/29 for DS-Lite, AS112 at 192.31.196.0/24 and 192.175.48.0/24, and AMT at 192.52.193.0/24), but the single-address protocol assignments inside 192.0.0.0/24 — the dummy address, the PCP and TURN anycast addresses, the NAT64 discovery pair — are not listed row by row and report as the enclosing IETF protocol assignments block. Entries IANA adds later will not appear on their own. For base conversion use G02, and for bit-level masking and shifts use D06.',
      },
    ],
  },

  'url-inspect': {
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
