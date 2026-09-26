import type { ToolNote } from './index';

/** Drawer D — "how it works" prose for the indexable tools in this drawer. */
export const DEV_NOTES: Record<string, ToolNote> = {
  'regex-tester': {
    body: [
      {
        zh: 'JavaScript 的正規表達式沒有超時這種東西。(a+)+$ 遇上 aaaaaaaaX 這類註定失敗的主體,引擎會把那串 a 在內外兩層重複之間的每一種拆法都試一次,時間隨長度指數成長;跑在主執行緒上,這跟瀏覽器當掉沒有區別——不重繪、不收輸入,唯一的出路是關掉分頁。所以比對不在主執行緒跑,而是丟進一個用完就丟的 Worker,給兩秒的死線,逾時就 terminate 掉它,畫面只收到一則錯誤。編譯反而留在主執行緒,因為 new RegExp 只是檢查語法,會失控的是跑,不是編。',
        en: 'JavaScript regexes have no timeout, and catastrophic backtracking on the main thread is indistinguishable from a hung browser. The match runs in a throwaway Worker with a 2000 ms deadline; on timeout the Worker is terminated and the page reports an error. Compiling stays on the main thread — compiling is not matching.',
      },
      {
        zh: 'Worker 裡跑的不是另寫一份實作。collectMatches 與 replaceWith 刻意寫成完全自給自足,不引用任何模組層的變數,於是可以直接用 toString() 把它們的原始碼接成 Worker 的程式本體。單元測試測的是同一份原始碼,不存在「測到的那份」與「真的跑的那份」慢慢走鐘的空間。你輸入的樣式與主體是以 structured clone 當資料送過去的,永遠不會變成那段程式的文字——否則這個工具本身就成了一個 eval。',
        en: 'The Worker body is generated from the same two functions the unit tests exercise, via toString(); they reference nothing at module scope for exactly that reason. Pattern and subject cross as structured-cloned data, never as program text.',
      },
      {
        zh: '幾個藏在細節裡的決定。群組數量不是解析樣式算出來的,而是在樣式尾端接一個空的替代式(樣式後面加一個豎線),這條式子必然成功,對空字串 exec 一次,回傳陣列長度減一就是群組數,順便不必自己寫剖析器。零長度命中會讓 lastIndex 停在原地,所以要手動前進,而且是前進一整個碼點而不是一個碼位——在 u 或 v 旗標下落進代理對中間,unicode 模式根本不可能在那裡命中。命中上限一千筆,超過就明講被截斷,再多也讀不完而且每一筆都要付 DOM。另外有個掃描器會指出「重複包重複」與「重複包選擇」兩種形狀,但它是掃描器不是剖析器,所以只警告不拒絕:真正保護這一頁的是那兩秒。',
        en: 'Group count comes from compiling the pattern with an empty alternative appended — an expression that always matches — instead of parsing the pattern. Zero-length matches advance by a whole code point, not a code unit. Matches cap at 1000, and the backtracking-risk scanner only warns: the timeout is the actual protection.',
      },
    ],
    limits: [
      {
        zh: '命中位置與長度是引擎給的 UTF-16 碼位偏移,不是字元數;emoji 與某些漢字各占兩個。要看某個字元到底是什麼碼位請用 B04。',
        en: 'Offsets are UTF-16 code units as the engine reports them, not characters. To inspect a single character, use B04.',
      },
      {
        zh: '取代用的是平台自己的 String.prototype.replace,$1、$&、$<name> 的語意是 V8 的而不是這裡定義的,旗標沒有 g 就只取代一次——跟你自己的程式碼行為一致。要對一大段文字做批次取代與預覽請用 A04。',
        en: 'Replacement is the platform’s own String.prototype.replace, dollar-substitutions included, so no-g replaces once. For bulk replacing over long text, use A04.',
      },
      {
        zh: '跑的是瀏覽器的 ECMAScript 引擎,所以這裡的結果只代表 JavaScript 的答案。PCRE 的 possessive quantifier、遞迴樣式、Go RE2 的線性時間保證在這裡都不存在;就算同一條樣式兩邊都編譯得過,行為也可能不同——例如 \\d 在 JavaScript 永遠只是 ASCII 數字,在 Python 3 預設連全形數字都算。',
        en: 'This is the browser’s ECMAScript engine, so the answer is JavaScript’s answer. PCRE possessive quantifiers, recursive patterns and RE2’s linear-time guarantee do not exist here, and a pattern that compiles in both places can still differ — \\d is ASCII-only in JavaScript and not in Python 3.',
      },
    ],
  },

  'cron-explain': {
    body: [
      {
        zh: 'cron 不是一種語言,這是做這個工具的第一個麻煩。Vixie cron 吃五欄、週日編號 0(也收 7);Quartz 吃六欄或七欄、週日編號 1,還多了 ?、L、# 這些修飾。同樣六個字元在兩種方言指的是不同日子,所以方言在這裡是一個顯式選項,不是從欄位數猜出來就算了——欄位數只用來決定預設選哪一個。名稱形式的週幾(MON、FRI)兩種方言都一樣,所以解析時先把它標成已正規化的值,再避開任何一邊的偏移,不然 FRI 會在 Quartz 裡被多加一。',
        en: 'Cron is not one language: Vixie takes five fields and numbers Sunday 0, Quartz takes six or seven, numbers Sunday 1 and adds ?, L and #. The dialect is an explicit input, not a guess from field count; three-letter day names are normalised before either numbering applies.',
      },
      {
        zh: '第二個麻煩是日與週的關係。兩個欄位都指定時,cron 取的是聯集——其中一個成立就執行。0 0 1 * MON 是「每月一號」加上「每個週一」,大約是多數人讀這行時預期次數的五倍。這是歷史行為不是 bug,而且它是 cron 線最常見的「做了跟寫的不一樣」來源,所以偵測到就直接寫在說明裡。順帶一提,Quartz 自己根本不接受兩個日欄位同時指定,它要求其中一個寫 ?;這裡照聯集算給你看,但也會提醒那條式子部署上去會被拒絕。',
        en: 'When both day fields are restricted, cron takes the union — either match fires. 0 0 1 * MON is the first of the month plus every Monday, roughly five times what most readers expect. The tool flags it, and flags that Quartz itself rejects that shape and wants ? in one field.',
      },
      {
        zh: '算「接下來幾次」的搜尋是日在前的:先用便宜的日曆算術篩候選日,只有過關的那一天才去展開時分秒。這樣 0 0 29 2 * 是幾千次日期比對,而不是逐分鐘走四百萬步;候選窗口是 366×8 天,剛好夠走到下一個 2 月 29 日。本地時區模式下,每個組出來的時刻都會反算回去驗一次:春季調時那天的 02:30 在本地根本不存在,Date 建構子會默默給你 03:30,所以驗不過的就丟掉——寧可少報一次,也不要報一個不會發生的時刻。',
        en: 'The search is day-first: cheap calendar tests pick candidate days, and only a matching day gets its clock times enumerated, so 0 0 29 2 * costs thousands of tests rather than four million minute steps. The window is 366×8 days. In local mode each instant is round-tripped, because 02:30 on a spring-forward day does not exist and the Date constructor silently returns 03:30.',
      },
    ],
    limits: [
      {
        zh: 'Jenkins 的 H 和 Quartz 的 W/LW 一律拒絕而不是硬猜。H 把工作名稱雜湊成一個偏移,離開那個 Jenkins 實例就沒有答案;W(最近的工作日)需要一份「工作日」的定義,這個工具手上沒有任何行事曆。要算工作日請用 F02。',
        en: 'Jenkins H and Quartz W/LW are refused rather than guessed: H hashes the job name, and W needs a definition of "working day" this tool has no calendar for. For working-day arithmetic, use F02.',
      },
      {
        zh: '由大到小的區間(例如 FRI-SUN)這裡按環繞處理並標示出來,但多數 Linux 的 /etc/crontab 跑的 Vixie cron 會直接拒絕這種寫法。它能在這裡算出結果,不代表它能在你的機器上跑。',
        en: 'High-to-low ranges such as FRI-SUN are treated as wrapping and flagged, but Vixie cron — what most Linux boxes run — rejects them outright. Parsing here is not a promise it deploys.',
      },
      {
        zh: '時刻是照你瀏覽器的時區或 UTC 算的,不是照那台跑 cron 的機器。伺服器的 TZ、容器裡的 /etc/localtime、Kubernetes CronJob 的 timeZone 欄位任何一個不一樣,答案就會差幾個小時。要換算特定時區請用 F01。',
        en: 'Times are computed in your browser’s zone or UTC, not the machine that runs the job; a server TZ or a CronJob timeZone field will shift everything by hours. For a specific zone, use F01.',
      },
    ],
  },
  'jwt-decode': {
    body: [
      {
        zh: '解一個 JWT 只是 base64url 加 JSON,十行寫完——而這個容易正是風險所在。解出來的 payload 告訴你的是這個 token「聲稱」什麼,不是什麼是真的:任何人都能自己造一個 admin 為 true 的 token 貼進來。所以這裡把兩件事切開:解碼的那一段程式對信任不發一語,只有驗章那一段會給出「有效」這個字,而且是用 WebCrypto 配上你自己提供的金鑰算出來的。演算法也刻意取自介面上選的那個,而不是讀 header 裡的 alg——照 header 選演算法就是那個經典的 JWT 混淆攻擊,這裡不做這個隱含決定。',
        en: 'Decoding a JWT is base64url and JSON; the ease is the hazard, because the payload is what the token claims, not what is true. Decoding says nothing about trust, and only verification does — through WebCrypto with a key you supply, using the algorithm you selected rather than the one in the header, since trusting the header alg is the classic confusion attack.',
      },
      {
        zh: '三個常見的坑是明講而不是含糊帶過的。alg 為 none、簽名段為空的 token 依 RFC 7519 是合法的 JWS,但作為身分憑證毫無價值,所以它被標為「無法驗證」,永遠不會顯示成通過。五段的東西不是 JWS 而是 JWE,第四段是密文,沒有解密金鑰就沒有可讀的 payload——把那串 base64 當成 claims 印出來比直接說不行更糟。至於 exp,RFC 7519 §4.1 寫的是 NumericDate,單位是秒;絕對值超過 1e11 的值換算出來是西元 5138 年以後,實務上一律代表發行端寫成毫秒了,這種值會被指名而不是安靜地渲染成一個荒謬的日期。',
        en: 'Three traps are named rather than glossed over: an alg-of-none token with an empty signature is valid JWS and worthless as authentication, so it reads as unverifiable and never as OK; five segments is JWE, whose payload is ciphertext and is not guessed at; and a NumericDate past 1e11 means the issuer wrote milliseconds, which is called out instead of rendered as a year-5138 date.',
      },
      {
        zh: '驗章的細節大多是 RFC 7518 的規定照抄。HS 系列把祕密當 raw key 匯入 HMAC;RS、PS、ES 要一份 PEM 編碼的 SPKI 公鑰,PEM 標籤不管寫什麼,真正被讀的是裡面的 ASN.1。RSA-PSS 的 salt 長度固定等於雜湊長度,不是可調參數。ES512 用的曲線是 P-521 而不是 P-512,名字對不上而這件事會讓匯入直接失敗。JWS 的 ECDSA 簽名是裸的 r 接 s,剛好就是 WebCrypto 要的格式,所以不必像處理 OpenSSL 輸出那樣拆 DER。祕密長度也照 §3.2 對著雜湊量一次:HS256 要 32 位元組、HS384 要 48、HS512 要 64,短的會標為過弱——它照樣能驗過,但那個「驗過」的意義比你想的小。',
        en: 'Verification follows RFC 7518 closely: HS imports the secret as a raw HMAC key, the asymmetric families take a PEM SPKI public key, PSS salt length is fixed at the hash length, ES512 means curve P-521, and JWS carries ECDSA as raw r‖s — exactly WebCrypto’s format, with no DER to unwrap. Secrets are sized against §3.2 (32/48/64 bytes) and flagged when short.',
      },
      {
        zh: 'iat 落在未來時有六十秒的寬容。兩台伺服器之間有幾秒時鐘偏差是正常的,一個為了三秒就大聲抗議的解碼器,人們會停止閱讀它的輸出。整頁不寫入任何儲存:token 與祕密只存在這個分頁的記憶體裡,關掉就沒了。',
        en: 'A future iat is tolerated up to 60 seconds, because clock skew between two servers is normal and a decoder that shouts about three seconds stops being read. Nothing is stored: the token and the secret live only in this tab’s memory.',
      },
    ],
    limits: [
      {
        zh: '簽名對不對,和這個 token 該不該被接受,是兩個問題。這裡只回答前者:aud、iss、sub、scope 有沒有符合你的服務、jti 是否被重放、header 的 kid 指向哪把金鑰、金鑰有沒有被撤銷,全都不查。',
        en: 'A correct signature and an acceptable token are different questions. Only the first is answered here: audience, issuer, scope, jti replay, kid selection and revocation are all outside it.',
      },
      {
        zh: '沒有網路出口,所以不會去抓 JWKS,也不會把 x5c 或 JWK 轉成 PEM。非對稱演算法要驗,得自己把 SPKI 公鑰貼進來。JWE 只能看出它是 JWE,不解密。',
        en: 'With no network egress there is no JWKS fetch and no JWK-to-PEM conversion; an asymmetric check needs you to paste the SPKI key. JWE is identified, never decrypted.',
      },
      {
        zh: '這裡不簽發 token,也不改 token。要算裸 HMAC 請用 E05,要看 X.509 憑證與它的鏈請用 E10。',
        en: 'It neither mints nor rewrites tokens. For a bare HMAC use E05; for an X.509 certificate use E10.',
      },
    ],
  },
  'id-generator': {
    body: [
      {
        zh: '這四種格式都是 128 位元上下的東西,但它們不是不透明的亂數塊,而是有版面的。版面就是重點:v4 是 122 個隨機位元,除了「它很可能唯一」之外什麼都告訴不了你;v7 與 ULID 把 48 位元的毫秒時間戳放在最前面,於是字串的字典序就是時間序,寫進 B-tree 索引時會聚在一起而不是把寫入撒滿整棵樹。反解功能存在的理由很實際:從 log 裡撈到一個 ID,想知道那一列是幾點幾分建立的。',
        en: 'All four formats are 128-ish bits with a layout rather than opaque blobs. v4 is 122 random bits and tells you nothing; v7 and ULID put 48 bits of Unix milliseconds first, so lexicographic order is chronological and inserts cluster in a B-tree instead of scattering. The decoder exists so an ID found in a log can be read back to a time.',
      },
      {
        zh: '編碼的部分沒有寬鬆的空間。v1 的時鐘是 60 位元、base32 的取值範圍到 130 位元,兩者都超出 double 能精確表示的範圍,所以整數一律走 BigInt,而且是用 BigInt() 建構子而不是 0n 字面值——tsconfig 的 target 是 ES2017,那個語法在那裡還不存在。ULID 之所以剛好 26 個字元,是因為 48 位元的時間在 base32 裡正好是 10 個字元、80 位元的隨機段正好是 16 個,不需要補位。字母表用 Crockford 的:沒有 I、L、O、U,前三個是因為在收據上或電話裡跟 1、0 分不出來,U 是為了不讓生出來的 ID 意外拼出髒話。反解時則故意寬容——手抄成 I 的當 1,抄成 O 的當 0。',
        en: 'A 60-bit v1 clock and a 130-bit base32 range both exceed what a double holds exactly, so everything integral is BigInt — via the constructor, because the target is ES2017 and 0n does not exist there. A ULID is 26 characters because 48 bits of time is exactly 10 base32 characters and 80 bits of randomness exactly 16, with no padding. Crockford drops I, L, O and U; decoding forgives them anyway.',
      },
      {
        zh: 'NanoID 的部分,關鍵不在產字串而在怎麼取隨機。對一個隨機位元組取 % 62 會偏向低位:前 8 個字元大約會多出現 1.6%,而輸出看起來完全正常,只有你宣稱的熵值悄悄變小了。所以亂數來源是拒絕取樣的 below(),而且 logic.ts 從不直接碰 crypto——隨機由外面注入,測試時才能是決定性的。熵值就照 log2(字母表大小) 乘長度算,碰撞量用生日界 n ≈ sqrt(2·N·ln(1/(1−p))) 估;回傳的是浮點數而不是整數,因為這種答案的意義是數量級,「大約 2.6×10^16」才是可用的讀法,四捨五入成整數反而在假裝精確。',
        en: 'For NanoID the hard part is the draw, not the string: taking a random byte modulo 62 favours the low end by about 1.6% on the first eight characters while the output looks fine and only the claimed entropy shrinks. So the source is rejection-sampled, and logic.ts never touches crypto itself — randomness is injected, which also makes the generators deterministic under test. Entropy is log2(alphabet) × length, and the collision figure is the birthday bound, returned as a float because it is an order of magnitude.',
      },
      {
        zh: '反解要先分辨格式。UUID 讀 version nibble 與那兩個 bit 的 variant,順手指出不是 RFC 9562 變體的那些(微軟的 110 之類)。v1 與 v6 的時鐘都是 60 位元,但 v1 把低位段放在前面、v6 重新排成高位在前——那就是 v6 存在的全部理由;它們的紀元也不是 Unix,而是 1582 年 10 月 15 日格里曆改制那天,以 100 奈秒為單位,兩者差 122192928000000000 個刻度,把那個數字當秒讀會錯四個世紀。ULID 的判定條件是 26 個 Crockford 字元、整個值塞得進 128 位元、而且前 10 個字元解出來不超過 281474976710655;最後那個檢查存在的意義是攔住一個剛好 26 字元的 NanoID 被讀成 ULID 然後配上一個胡說八道的建立時間。真的是 NanoID 的話只能反推字母表,並且明說那是猜的。',
        en: 'Decoding starts by telling the formats apart: the UUID version nibble and two-bit variant, with non-RFC variants named. v1 stores its 60-bit clock low-part first and v6 reorders it — that is why v6 exists — and both count 100-nanosecond ticks from 1582-10-15, 122192928000000000 of them before the Unix epoch. A ULID must be 26 Crockford characters, fit in 128 bits, and decode to a time below 281474976710655; that last test is what stops a 26-character NanoID getting a nonsense creation date.',
      },
    ],
    limits: [
      {
        zh: '一批 ID 共用同一次 Date.now() 讀值,所以同一毫秒內幾個 v7 或 ULID 的先後只由隨機段決定。這不是 ULID 規格裡的 monotonic 模式:要在同毫秒內嚴格遞增,得在發行端維護一個計數器,瀏覽器裡的這件工具不負責。',
        en: 'One batch shares a single Date.now() read, so ordering within a millisecond comes only from the random part. This is not the ULID monotonic profile; strict intra-millisecond ordering needs a counter on the issuing side.',
      },
      {
        zh: '不是每個 ID 都藏著時間。v4 是純隨機,v3 與 v5 是名稱雜湊(MD5 與 SHA-1),v8 的版面由廠商自訂——這幾種沒有時間戳可以挖,標成「非時間型」比硬解出一個日期誠實。NanoID 的熵值是「假設字母表就是猜中的那個」的上限,不是量測值。',
        en: 'Not every ID hides a time: v4 is random, v3/v5 are name hashes over MD5 and SHA-1, and v8 is vendor-defined. NanoID entropy is an upper bound conditional on the guessed alphabet, not a measurement.',
      },
      {
        zh: '反解出來的時間戳只是發行端當時的時鐘,不是可信的時間來源。手動造一個 v7、前 48 位元想填什麼填什麼,跟打字一樣容易。要把那個毫秒數換成各種格式與時區請用 D05。',
        en: 'A decoded timestamp is only what the issuer’s clock said; forging the leading 48 bits of a v7 is as easy as typing. To convert that millisecond value between formats and zones, use D05.',
      },
    ],
  },
  'timestamp': {
    body: [
      {
        zh: '這個領域的 bug 幾乎只有三種,所以三種都被指名處理,而不是含糊帶過。第一種是單位讀錯。1645557742 與 1645557742000 差一千倍,兩個看起來都像「一個時間戳」,讀錯一邊落在 1970 年、另一邊落在五萬四千年。這裡用量級猜單位:小於 1e11 當秒(1e11 秒已經是西元 5138 年),小於 1e14 當毫秒,小於 1e17 當微秒,再上去是奈秒。對任何人實際在處理的日期,這幾條界線都不含糊,而猜的結果會明寫在輸出上,也可以直接指定推翻它。',
        en: 'Three bugs dominate this area, so all three are named. The first is the unit: 1645557742 and 1645557742000 differ by a thousand and both look like a timestamp. The unit is guessed by magnitude — under 1e11 is seconds, since 1e11 seconds is already the year 5138 — and the guess is stated in the output and can be overridden.',
      },
      {
        zh: '第二種是偏移不見了。ISO 8601 說沒寫偏移的日期時間就是本地時間,而 Date.parse 自己前後矛盾:2024-01-01 它當 UTC,2024-01-01T00:00 它當本地。任何以換算時間為業的東西都不能建立在這種行為上,所以這裡自己寫剖析器,並且把「沒寫偏移時假設哪一邊」當成一個顯式參數。附帶處理掉的邊角:24:00 是合法的 ISO 拼法,但只有在分秒都是零時才合法;小數部分會補到九位,不然 .5 會變成 5 奈秒而不是 500 毫秒;年份 0 到 99 會被 Date 建構子搬到 1900 到 1999,要用 setFullYear 搬回文字上寫的那一年。',
        en: 'The second is a missing offset. ISO 8601 says an offset-less date-time is local, while Date.parse contradicts itself — date-only is UTC, date-time without offset is local — so this file has its own strict parser and takes the assumption as an argument. Along the way: 24:00 is legal only with zero minutes and seconds, fractions pad to nine digits so .5 is 500 ms, and years 0–99 are put back with setFullYear.',
      },
      {
        zh: '第三種是精度悄悄消失。Postgres、Prometheus、Go 的時間戳常常是微秒或奈秒,而 JavaScript 的 Date 只到毫秒。Number(\'1645557742123456789\') 的最後兩位已經是錯的——19 位有效數字塞不進 float64——所以換算全程走 BigInt 在數字字串上做,輸出端也一樣:如果用 ms 乘 1e6,就會把某人專程來換算的那截尾數抹掉。毫秒以下的餘數單獨存著並回報「已捨棄」,而不是安靜地切掉。負的時刻還要多一步:BigInt 除法向零取整,Unix 時間要的是向下取整,否則 1970 年以前那一毫秒的餘數會變成負的。',
        en: 'The third is silent precision loss. Microsecond and nanosecond stamps are routine in Postgres, Prometheus and Go, while a JavaScript Date holds milliseconds. Number(\'1645557742123456789\') is already wrong in its last two digits, so conversion runs through BigInt on the digit string in both directions, and the sub-millisecond remainder is reported as dropped rather than truncated quietly. Negative instants need a floor, not BigInt’s truncation toward zero.',
      },
      {
        zh: 'RFC 2822 那一半留著 RFC 822 的字母時區(EST、PDT 那些),因為郵件標頭裡至今還在用。但 RFC 5322 §4.3 講得很清楚:認不出來的字母時區與所有單字母軍用時區都必須當成 -0000,意思是「偏移不明」,那跟 UTC 不是同一件事,只是算術上剛好一樣——所以這裡照 0 算,並且標記那個偏移是來自過時寫法。兩位數年份也照 §4.3:00 到 49 是 2000 年代,50 到 99 是 1900 年代。剖析順序上,裸數字一定先試,否則 20240101 會被當成 ISO 基本格式的日期,而 log 裡的一串裸數字幾乎從來不是那個意思。',
        en: 'The RFC 2822 side keeps the obsolete alphabetic zones because mail headers still carry them, but RFC 5322 §4.3 requires every unrecognised alphabetic or military zone to mean -0000 — "offset unknown", which is not UTC even though the arithmetic matches — and that is flagged. Two-digit years follow the same section. A bare number is tried first, or 20240101 would parse as a basic-format ISO date.',
      },
    ],
    limits: [
      {
        zh: 'JavaScript 的 Date 只涵蓋紀元前後各一億天,也就是 ±8.64e15 毫秒。超出這個範圍輸出是一個破折號,不是繞回去的錯值。微秒與奈秒的尾數只被保存與顯示,不參與任何日曆運算。',
        en: 'A JavaScript Date spans ±8.64e15 ms — a hundred million days either side of the epoch — and anything beyond reads as a dash rather than a wrapped value. Sub-millisecond digits are carried and displayed, never used in calendar arithmetic.',
      },
      {
        zh: '「本地」是你這台瀏覽器的時區,不是某個指定的時區。IANA 資料庫裡的歷史規則(某地某年改過哪個偏移、哪一年開始實施日光節約)這裡不查。要在城市之間換算請用 F01。',
        en: 'Local means this browser’s zone, not a named one, and historical IANA rules are not consulted. To convert between cities, use F01.',
      },
      {
        zh: '閏秒只標示,不計算。Unix 時間本身沒有閏秒的位置,second 寫 60 會被日曆算術吃成下一分鐘的第 0 秒;工具會告訴你那一秒的存在,但補不回那一秒的差。',
        en: 'Leap seconds are flagged, not modelled: Unix time has no room for them, so a :60 rolls into the next minute. The tool says the second was there; it cannot restore it.',
      },
    ],
  },
};
