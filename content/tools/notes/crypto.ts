import type { ToolNote } from './index';

/** Drawer E — "how it works" prose for the indexable tools in this drawer. */
export const CRYPTO_NOTES: Record<string, ToolNote> = {
  hash: {
    body: [
      {
        zh: 'WebCrypto 有五種裡的四種,crypto.subtle.digest 一行就能算完 SHA-1 到 SHA-512,MD5 它拒絕提供。這裡五種全部自己寫,原因不是 MD5——是 subtle.digest 只吃整個 buffer。要這樣算一份 4 GB 的映像檔,就得把 4 GB 同時放在分頁裡,多數機器上那叫分頁死掉。這個檔裡每一種都是 incremental 的:餵 1 MB 進去,記憶體用量不動,這才有辦法對檔案做串流雜湊。',
        en: 'WebCrypto covers four of the five and refuses MD5, but the reason all five are written out here is that subtle.digest only takes a whole buffer — hashing a 4 GB image that way means holding 4 GB in the tab. Everything here is incremental, so memory stays flat at 1 MB a time.',
      },
      {
        zh: 'SHA-256 與 SHA-512 的輪常數是推導出來的,不是抄來的。規格說它們取自前幾個質數的立方根小數部分,初始狀態取自平方根;抄 80 個十六進位常數,打錯一位數的後果是「某些輸入算錯、多數輸入正確」,那種錯誤靠肉眼看不出來。這裡用 BigInt 做整數開方(Newton 迭代),把 p 左移 r·b 位再開 r 次方,全程沒有浮點數,所以沒有可以打錯的地方。MD5 的常數還是得算 |sin(i+1)|·2³²,那個沒有整數版本。測試仍然釘住公開向量,並且每一種都跟瀏覽器自己的實作對照一次。',
        en: 'The SHA-256 and SHA-512 round constants are derived with exact BigInt integer roots rather than transcribed — one mistyped digit among 80 hex literals is wrong for some inputs and right for most. The tests still pin the published vectors and cross-check against the platform.',
      },
      {
        zh: 'SHA-512 家族在 JavaScript 裡的代價是這個檔案為什麼這麼長:專案編到 ES2017,沒有 64 位元整數可用,1n 是語法錯誤,所以每個 64 位元字都拆成 hi/lo 兩個 32 位元半,旋轉要跨半邊接,加法要自己用 Math.floor(lo / 2³²) 把進位搬上去。讀起來像組語,但這是在沒有 BigInt 熱路徑(BigInt 太慢)的前提下唯一能跑得動的寫法。',
        en: 'The SHA-512 family is why this file is long: the project targets ES2017, so every 64-bit word is split into hi/lo 32-bit halves with carries moved by hand. It reads like assembly, but BigInt in the hot loop is far too slow.',
      },
      {
        zh: '檔案模式一次讀 1 MB,用 Blob.slice 切,刻意不用 file.stream()——那個介面給你的 chunk 大小由瀏覽器決定,實務上常常是 64 KB,一份大檔就變成幾千次進度更新與幾千次重繪。五種摘要共用同一次讀取,因為把 4 GB 讀五遍只是把同一個答案的等待時間乘五。MD5 與 SHA-1 在頁面上被標成只適合校驗:MD5 的實際碰撞從 2004 年就有,SHA-1 是 2017 年的 SHAttered,意思是有人可以造出兩個不同的檔案、同一個摘要。抓壞掉的下載沒問題,用來確認「這就是我要的那個檔案」不行。',
        en: 'File mode reads 1 MB slices via Blob.slice rather than file.stream(), whose chunk size the browser picks — often 64 KB, which means thousands of repaints. All five digests share one pass. MD5 and SHA-1 are flagged checksum-only: both have practical collisions (2004 and SHAttered in 2017).',
      },
    ],
    limits: [
      {
        zh: '文字模式的上限是 4 MB,超過就請切到檔案模式——文字模式把整份字串留在記憶體裡,檔案模式才是串流的。',
        en: 'Text mode caps at 4 MB; past that switch to file mode, which streams instead of holding everything.',
      },
      {
        zh: '這裡算的是純摘要,沒有密鑰。要對 webhook 簽章做除錯請用 E05 的 HMAC;要拿官方公布的 checksum 逐項核對,E06 是為那個流程做的。',
        en: 'These are keyless digests. For a webhook signature use E05 (HMAC); to check a file against a published checksum, E06 is built for that flow.',
      },
      {
        zh: '不要拿這裡的 SHA-256 存密碼。密碼需要的是慢、有 salt 的導出函式,不是快的雜湊;那個方向請看 E07 的 PBKDF2 部分。',
        en: 'Do not store passwords with SHA-256 from here — passwords need a slow salted derivation, which is what E07 does with PBKDF2.',
      },
    ],
  },

  'aes-encrypt': {
    body: [
      {
        zh: '密碼學本身是這個工具最簡單的部分:crypto.subtle 提供 AES-256-GCM,GCM 是認證加密,密碼錯或位元被翻過都會直接失敗,不會吐出一堆看似合理的垃圾明文。難的是外面那一圈。第一件是密碼不等於金鑰——它必須被慢慢地拉長,否則 GPU 一秒可以對著密文試幾十億個候選。這裡用 PBKDF2-HMAC-SHA256 跑 600,000 次迭代,那是 OWASP 2023 對這個組合給的數字。PBKDF2 不是好的 KDF,Argon2id 才是,但 WebCrypto 沒有 Argon2id,而這個站不能為了它載入 wasm(工具區的規格是零網路出口、一個工具一個小 chunk),所以成本只能花在唯一能花的地方:迭代次數。換算下來,一次迭代是兩次 SHA-256 壓縮,2024 年代的 GPU 大約每秒一百億次壓縮,對著這個容器每秒約八千個猜測。',
        en: 'The cipher is the easy part — subtle does AES-256-GCM and GCM fails loudly. The work is around it: a password is not a key, so it is stretched with PBKDF2-HMAC-SHA256 at 600,000 iterations (OWASP 2023). Argon2id would be better but is not in WebCrypto, and loading wasm is off the table here, so the cost goes into iterations: roughly 8,000 offline guesses a second on a 2024 GPU.',
      },
      {
        zh: '第二件是 salt 與 IV 每次都必須是新的。salt 重複用,一次導出就能攻擊所有訊息;GCM 的 (key, IV) 重複用更糟,它會洩漏兩份明文的 XOR,還會洩漏認證用的子金鑰,整個完整性保證就沒了。所以 16 位元組的 salt 與 12 位元組的 IV 每則訊息都從 CSPRNG 重抽——不是 Math.random,這兩個值就是「同一段輸入永遠不會加密成同一串位元組」的全部原因。12 位元組是 GCM 規格本身定的 IV 長度,不是隨便選的。',
        en: 'Salt and IV are fresh per message from the CSPRNG: a reused salt attacks every message with one derivation, and a reused (key, IV) pair in GCM leaks the XOR of two plaintexts and the authentication subkey. That randomness is the whole reason the same input never encrypts to the same bytes twice.',
      },
      {
        zh: '第三件是參數得跟著密文走,而且得被認證。輸出前面是 40 位元組的檔頭:5 位元組的 ASCII 標記 SPENC、版本、KDF 編號、cipher 編號、大端序 uint32 的迭代次數、salt、IV,然後才是密文與 GCM 附在尾端的 16 位元組 tag。這個檔頭會作為 additional authenticated data 交給 GCM,所以把檔案裡的迭代次數改掉,結果是解密失敗,而不是安靜地導出另一把金鑰、再報一個看不懂的錯。參數全部明文放著是刻意的:有了 salt、IV 與迭代次數,任何語言的 crypto 函式庫用十幾行就能把同樣的解密重做出來,輸出不是黑盒子。',
        en: 'The 40-byte header — magic, version, KDF id, cipher id, big-endian iteration count, salt, IV — travels with the ciphertext and is fed to GCM as additional authenticated data, so editing the iteration count fails authentication instead of quietly deriving a different key. The parameters sit in the clear on purpose: anyone can reproduce the decryption in a dozen lines.',
      },
      {
        zh: '解密失敗時只有一個訊息:「認證失敗——密碼錯誤,或資料被改過」。GCM 的所有失敗模式在 WebCrypto 裡都是同一個 DOMException,而這剛好也是應該交回去的資訊量。如果去區分「密碼錯」與「資料被動過」,那就是自己造一個 oracle 給攻擊者用。文字輸出包在 64 欄一行的 base64 與 BEGIN/END 標記之間,是為了活著穿過郵件與聊天軟體的自動換行;讀回來時也接受裸的 base64,因為人會只貼中間那一段。',
        en: 'Every GCM failure arrives as one DOMException and is reported as one message — separating "wrong password" from "altered data" would hand an attacker an oracle. Text output is base64 in 64-column lines between markers so it survives mail and chat; bare base64 is accepted back, because people paste only the middle.',
      },
    ],
    limits: [
      {
        zh: '檔案上限 64 MB。WebCrypto 沒有串流版的 AES-GCM,整份明文與整份密文必須同時在記憶體裡,再大就會把分頁弄死。大檔請用 age 或 gpg。',
        en: 'Files cap at 64 MB: WebCrypto has no streaming AES-GCM, so the whole thing sits in memory. For larger files use age or gpg.',
      },
      {
        zh: 'SPENC 這個容器格式是這個工具自己定的,沒有別的軟體讀得懂它。要跟其他人長期交換加密檔案,請用 age 或 gpg——它們有規格書,也有多方實作,不會因為這個網站消失就解不開。',
        en: 'The SPENC container is this tool\'s own format and nothing else reads it. For exchanging encrypted files with other people over time, use age or gpg, which have specifications and multiple implementations.',
      },
      {
        zh: '真正決定強度的是你的密語,不是 600,000 這個數字——迭代只買到大約二十個 bit 的緩衝。密語請用 E01 或 E02 產生,不要用你記得住的那一個。',
        en: 'Your passphrase decides the strength, not the iteration count, which buys about twenty bits. Generate one with E01 or E02 rather than reusing the one you can remember.',
      },
    ],
  },

  'password-generator': {
    body: [
      {
        zh: '這個工具有兩個地方會錯得沒人發現。第一個是取樣:crypto.getRandomValues 只做完一半工作,拿它的輸出去取模就把偏差放回來了。拿一個位元組對 62 個字元取模就很清楚:256 = 4×62 + 8,前 8 個字元各有五次機會,其餘 54 個只有四次,也就是前八個字元多出現四分之一。肉眼看不出來,但 UI 上那個熵的數字已經在虛報。所以 below() 用 rejection sampling:算出 floor(2³² / max) × max 這個界線,抽到界線以上就丟掉重抽,剩下的範圍才整除。順帶一提,Math.random 在這個目錄樹裡是被 eslint 擋掉的,因為用它寫的密碼產生器跟安全的那個看起來一模一樣。',
        en: 'Two things here fail invisibly. Sampling first: taking a modulus of getRandomValues re-introduces bias — 256 = 4x62 + 8, so with a 62-character alphabet the first eight characters get five chances out of 256 and the rest four. So below() rejection-samples against floor(2^32 / max) × max, and Math.random is banned in this tree by eslint, because a generator built on it looks identical to a safe one.',
      },
      {
        zh: '第二個是「每種字元至少一個」這個選項。幾乎每個產生器都提供它,然後照樣回報 長度 × log2(字母表) 個 bit。那個數字是「從整個字母表均勻抽」的熵,但這個限制讓抽樣不再均勻——它直接禁掉了一部分字串,所以真值比較低。這裡的做法是整串重抽:抽出一個不合格的密碼就整個丟掉再抽,而不是就地把某個位置補成缺少的那類字元。補位比較快,但會讓被補的那個位置的分佈歪掉,而歪掉的分佈配上原本的公式就是雙重的謊。',
        en: 'Second is "at least one of each type". Most generators offer it and still report length × log2(alphabet), which is the figure for uniform draws over the whole alphabet — the constraint forbids some strings, so the truth is lower. This one rejects and redraws the whole password rather than patching a position, because patching skews whichever position got patched.',
      },
      {
        zh: '熵因此是對那個較小的集合算的:長度 × log2(字母表) + log2(P(合格)),而 P 用排容原理跑遍 2ᵏ 個子集的遮罩算出來(k 是選用的字元類數,四類以內所以窮舉很便宜)。第二項永遠是零或負數——限制從來不會增加強度,它只會減少可能的字串數量,這正是別人省略的那一項。「避開易混淆字元」也一樣誠實處理:拿掉 Il1O0oB8S5Z2 會讓字母表變小,熵就跟著降,頁面上直接顯示降下來的數字。破解時間用 2^(bits−1) / 1e11 估,假設是離線、快雜湊、商用 GPU;強度只分四段而不給一個百分制分數,60 bit 附近是離線攻擊不再是週末專案的門檻,80 bit 對可能被 dump 的東西算舒適,過了 120 bit 密碼已經不是系統裡最弱的那一環。',
        en: 'So the entropy is computed for that smaller set — length × log2(alphabet) + log2(P(allowed)) — with P from inclusion–exclusion over 2^k subset masks. The second term is never positive: the constraint cannot add strength, and that is the term other generators omit. Dropping look-alike characters shrinks the alphabet and the reported number drops with it.',
      },
      {
        zh: '符號集刻意不含引號、反斜線與反引號。它們在某一段工具鏈裡一定會被轉義、吞掉或拒收,而一個貼不進去的密碼會被換成一個貼得進去的、比較弱的密碼——所以留下的是 !#$%&()*+,-./:;<=>?@[]^_{|}~ 這一組,能活著穿過 shell、CSV 與表單。',
        en: 'The symbol set leaves out quotes, backslash and backtick: something in every toolchain escapes, swallows or rejects them, and a password you cannot paste gets replaced by a weaker one you can.',
      },
    ],
    limits: [
      {
        zh: '重抽最多一萬次。如果限制實際上難以滿足(例如長度 4 要同時塞四類字元、又開了避開易混淆字元),它會直接報錯要你放寬,而不是安靜地交出一個不合格或被補過的密碼。',
        en: 'Rejection gives up after 10,000 attempts and raises rather than quietly handing back a patched or non-conforming password when the constraints are effectively impossible.',
      },
      {
        zh: '這裡的熵描述的是產生器,不是你自己想的密碼——只要不是這個分佈抽出來的,這個數字就不適用。要評估手打的密碼請用 E03,它會去比對常見密碼、鍵盤序列與替換字母的老把戲。',
        en: 'The entropy describes the generator, not a password you invented; for that use E03, which checks common passwords, keyboard runs and letter substitutions.',
      },
      {
        zh: '純亂碼是給密碼管理器存的。需要用嘴唸出來、用手打進去的那一個(例如硬碟加密或管理器主密碼),請用 E02 的密語,同樣的熵好記得多。',
        en: 'Random strings are for a password manager to hold. For one you have to say aloud or type by hand, use the passphrases in E02 — the same entropy, far easier to remember.',
      },
    ],
  },
};
