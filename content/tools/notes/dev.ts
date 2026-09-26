import type { ToolNote } from './index';

/** Drawer D — "how it works" prose for the indexable tools in this drawer. */
export const DEV_NOTES: Record<string, ToolNote> = {
  'regex-tester': {
limits: [
      {
        zh: '命中位置與長度是引擎給的 UTF-16 碼位偏移,不是字元數;emoji 與某些漢字各占兩個。勾了 d 旗標時,群組後面會多出 @起–訖 兩個數字,那也是碼位偏移。要看某個字元到底是什麼碼位請用 B04。',
        en: 'Offsets are UTF-16 code units as the engine reports them, not characters; with the d flag each group also shows its own @start–end in the same units. To inspect a single character, use B04.',
      },
      {
        zh: '命中滿一千筆就停止掃描,主體後面那一段會標成淡色並註明「還沒看」。那一段不是沒有命中,是根本沒被比對——一千筆之後的列表讀不完,而每一筆都要付 DOM 的代價。要處理更長的檔案請分段貼,或把樣式寫得更精確。',
        en: 'The scan stops at 1000 matches and the remaining tail is dimmed and labelled unscanned — not "no match", but "never examined", since a longer list is unreadable and every row costs DOM. Paste in sections or tighten the pattern for longer files.',
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
        zh: '日光節約的兩天處理方式刻意不對稱。春天被跳掉的那個本地時刻根本不存在,組出來會被反算驗掉,那一天就少報一次;秋天重複的那一小時裡,01:30 其實發生兩次(相隔一小時的兩個時刻),這裡只報前面那一次。Vixie cron 對固定時刻的行為大致也是一次,而且從掛鐘欄位反推本來就只能得到第一次——但真實 cron 各家實作在這兩天的行為不一樣,以你那台機器的 crontab(5) 為準。',
        en: 'The two daylight-saving days are treated asymmetrically on purpose. A spring-forward time that does not exist is round-tripped away, so that day fires once less; in the repeated autumn hour 01:30 happens twice and only the first instant is listed, which is roughly what Vixie cron does and the only occurrence wall-clock fields can reach. Real implementations differ on both days — check your own crontab(5).',
      },
      {
        zh: '時刻是照你瀏覽器的時區或 UTC 算的,不是照那台跑 cron 的機器。伺服器的 TZ、容器裡的 /etc/localtime、Kubernetes CronJob 的 timeZone 欄位任何一個不一樣,答案就會差幾個小時。要換算特定時區請用 F01。',
        en: 'Times are computed in your browser’s zone or UTC, not the machine that runs the job; a server TZ or a CronJob timeZone field will shift everything by hours. For a specific zone, use F01.',
      },
    ],
  },
  'jwt-decode': {
limits: [
      {
        zh: '簽名對不對,和這個 token 該不該被接受,是兩個問題。這裡只回答前者:aud、iss、sub、scope 有沒有符合你的服務、jti 是否被重放、header 的 kid 指向哪把金鑰、金鑰有沒有被撤銷,全都不查。',
        en: 'A correct signature and an acceptable token are different questions. Only the first is answered here: audience, issuer, scope, jti replay, kid selection and revocation are all outside it.',
      },
      {
        zh: '沒有網路出口,所以不會去抓 JWKS,也不會把 x5c 或 JWK 轉成 PEM。非對稱演算法要驗,得自己把 SPKI 公鑰貼進來。JWE 只能看出它是 JWE,payload 會標成「加密」而不是「壞掉的 JSON」,但不解密。',
        en: 'With no network egress there is no JWKS fetch and no JWK-to-PEM conversion; an asymmetric check needs you to paste the SPKI key. A JWE is identified and its payload marked encrypted rather than malformed, never decrypted.',
      },
      {
        zh: '這裡不簽發 token,也不改 token。要算裸 HMAC 請用 E05,要看 X.509 憑證與它的鏈請用 E10。',
        en: 'It neither mints nor rewrites tokens. For a bare HMAC use E05; for an X.509 certificate use E10.',
      },
    ],
  },
  'id-generator': {
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
limits: [
      {
        zh: 'JavaScript 的 Date 只涵蓋紀元前後各一億天,也就是 ±8.64e15 毫秒。超出這個範圍輸出是一個破折號,不是繞回去的錯值;而且不論你貼的是裸數字還是 ISO 字串,講法都一樣是「超出範圍」而不是「讀不出來」——太大是數值的問題,不是格式的問題。微秒與奈秒的尾數只被保存與顯示,不參與任何日曆運算。',
        en: 'A JavaScript Date spans ±8.64e15 ms — a hundred million days either side of the epoch — and anything beyond reads as a dash rather than a wrapped value. A bare number and an ISO string both report it as out of range rather than unreadable: the magnitude is the problem, not the syntax. Sub-millisecond digits are carried and displayed, never used in calendar arithmetic.',
      },
      {
        zh: '「距現在」的最小單位是毫秒,而且只在差距不到一分鐘時才顯示毫秒——再上去那截尾數是雜訊。它比的是兩個 Date 毫秒值,毫秒以下的位數在另一欄單獨顯示,不會被算進這個距離裡。',
        en: 'The relative reading goes down to milliseconds, shown only when the gap is under a minute; above that the tail is noise. It compares two Date milliseconds, so sub-millisecond digits stay in their own field and never enter the distance.',
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
