import type { ToolNote } from './index';

/** Drawer A — "how it works" prose for the indexable tools in this drawer. */
export const TEXT_NOTES: Record<string, ToolNote> = {
  'text-diff': {
limits: [
      {
        zh: '比的是文字,不是結構。JSON 或程式碼請用 C05 的結構化比對,它認得欄位順序改變與型別改變。',
        en: 'It compares text, not structure. For JSON use C05, which knows the difference between a reordered key and a changed value.',
      },
      {
        zh: '逐行模式會把 CRLF 與 LF 視為相同,否則一份從 Windows 來的檔案會顯示「每一行都改了」。要專門檢查換行差異請用 B06。',
        en: 'Line mode treats CRLF and LF as equal, or a file from Windows would report every line as changed. To inspect line endings themselves, use B06.',
      },
    ],
  },

  'text-stats': {
limits: [
      {
        zh: '句數是數句末標點數出來的。全形的。!?一定結句,ASCII 的 . ! ? 要後面接著引號、括號或空白才算,否則每個 3.14 都會變成一句。代價是 e.g. 後面接空白時仍會被算成一句——這裡沒有縮寫詞典,也不打算靠猜的維護一份。',
        en: 'Sentences are counted from terminators. ASCII . ! ? need a following boundary or every 3.14 would end a sentence; the cost is that "e.g. " still counts as one, because there is no abbreviation dictionary here.',
      },
      {
        zh: '字頻是字頻,不是詞頻。要做中文關鍵詞抽取請找有詞典或模型的工具,這件工具不會假裝自己會斷詞。也因為中文是逐字計的,最短長度那個門檻只管英文詞:中文 token 一律只有一個字,拿同一個門檻去量它不是過濾而是清空,門檻設 2 會讓整張中文字頻表變空的,而空表看起來像「沒有高頻字」這個結論,不像「這個設定不適用」。要整批排除中文請用「不含中日韓」那個開關。',
        en: 'It reports character frequency for CJK, never word frequency. Keyword extraction needs a dictionary or a model, and this tool will not pretend otherwise. The minimum-length threshold is a word filter and applies to Latin tokens only: every CJK token is one character, so the same threshold would empty the CJK table rather than filter it, and an empty table reads as a claim about the text. Use the include-CJK switch to drop it deliberately.',
      },
      {
        zh: '輸入超過兩百萬個 UTF-16 單位時只計算前面那一段,並在結果上標明已截斷。上限存在的原因是 Intl.Segmenter 要逐個字元叢集走完整份文字,不設限就是把分頁鎖死。切的位置會退到字元邊界:如果剛好切在代理對中間,那半個字會被丟掉而不是留下來——一個孤立的代理半邊會被算成一個碼位、一個字元叢集與三個 UTF-8 位元組,四個數字在邊界上各偏一點,而那是沒人打過的字。',
        en: 'Past two million UTF-16 units only the head is counted, and the result says so — Intl.Segmenter walks every cluster, and without a cap the tab locks up. The cut backs off to a character boundary: a surrogate pair straddling the limit is dropped rather than half-kept, because a lone surrogate would count as one code point, one cluster and three UTF-8 bytes that nobody typed.',
      },
    ],
  },

  'case-convert': {
limits: [
      {
        zh: '中文沒有大小寫。命名風格對中文只做切詞與重組,字形不會改變;標題式與句首大寫套在中文上等於什麼都沒做。這是 Unicode 的事實,不是沒實作。',
        en: 'CJK has no letter case. Naming styles will split and re-glue Chinese words but cannot change their shape, and title or sentence case over Chinese is a no-op.',
      },
      {
        zh: '句首大寫的邊界判定跟 A01 用的是同一個近似:句末標點加空白。所以 e.g. 之後會被當成新句子並補上大寫。沒有縮寫詞典可以告訴它那不是句子結尾,輸出請看過一次。另外句首大寫會先把全文轉小寫,除了被保留的全大寫縮寫之外,專有名詞的大寫也一起沒了——包括 iPhone 這種混合大小寫的寫法,它在標題式大寫裡會被保留,在句首大寫裡不會,因為那一步是整段轉小寫,不是逐詞判斷。',
        en: 'Sentence case uses the same boundary approximation as A01, so "e.g." starts a new sentence and gets a capital; it also lowercases everything first, which flattens proper nouns along with the rest — mixed-case names such as iPhone survive title case but not sentence case, because that step lowercases the whole string rather than deciding word by word. Read the output.',
      },
      {
        zh: '全大寫與全小寫不是一對可以來回的轉換,這是 Unicode 的規則而不是實作偷懶。全大寫走的是 Unicode 的完整對應:ß 的大寫是 SS、連字 ﬁ 的大寫是 FI,長度會變,而轉回小寫只會得到 ss 與 fi,沒有任何簿記能把原字還原。希臘文的字尾 ς 與 İ 這類字也有同樣的問題。要能還原請留原稿。',
        en: 'Upper and lower are not a round trip, by Unicode rule rather than by omission: ß uppercases to SS and the ﬁ ligature to FI, so the length changes and lowercasing gives back ss and fi. Keep the original if you need it back.',
      },
      {
        zh: '它不是網址片段產生器。命名風格只留字母與數字,重音字母不會轉寫成 ASCII,也沒有長度上限——要產生 URL slug 請用 A08。',
        en: 'It is not a slug generator: accents are not transliterated and there is no length cap. Use A08 for URLs.',
      },
    ],
  },

  'cjk-tidy': {
limits: [
      {
        zh: '標點的半形化是不可逆的:句讀號的「、」與逗號的「,」都會變成 ASCII 的逗號,再轉回全形只會得到「,」。反方向也一樣,半形逗號永遠變成「,」,因為「、」不是它的對應字元,那是一個寫作決定,工具不該幫你做。要來回轉的話請留原稿。',
        en: 'Narrowing punctuation is lossy: both 、 and ， become a plain comma, and widening never gives 、 back, because choosing it is a writing decision rather than a mapping. Keep the original if you need a round trip.',
      },
      {
        zh: '「依上下文」是以行為單位判斷的。同一行裡既有中文句子又有完整英文句子時,整行都會套中文規則,那句英文的句尾句點若正好在行尾,會被寬化成句號。反過來,一行英文若夾著全形標點,那些標點會被縮成半形——只有在該行找不到任何英文字母時才會放它們過去。中英分行的文件不會有這個問題。',
        en: 'Contextual mode decides per line, so a line holding both a Chinese and a complete English sentence gets the Chinese rules, and an English full stop at end of line will widen. The reverse also holds: full-width punctuation on a line that contains a Latin letter is narrowed, and only a line with no Latin letter at all keeps it.',
      },
      {
        zh: '寬度轉換只處理全形的英文字母與數字,不是完整的 Unicode 正規化:㎡、Ⅳ 這類相容字元與連字都不會被拆開。空白方面它只壓縮空格與 Tab 的連續段,縮排寬度、Tab 與空格互換、行尾空白請用 A07,逐行排序與去重用 A03。',
        en: 'Width conversion covers full-width letters and digits only, not full Unicode normalisation, so compatibility characters such as ㎡ and Ⅳ stay as they are. For indent width, tabs and trailing whitespace use A07; for sorting and deduping lines use A03.',
      },
    ],
  },

  'pii-mask': {
limits: [
      {
        zh: '這是過濾器,不是保證。它沒辦法知道 order-8891 是客戶編號,也不認得使用者姓名、地址、內部主機名或你們自己的流水號。遮完之後還是要自己讀一遍再貼出去;螢幕截圖裡的個資請用 I04,那是像素不是文字。',
        en: 'A filter, not a guarantee: it cannot know that order-8891 is a customer reference, and it does not recognise names, addresses, internal hostnames or your own id schemes. Read the output before you paste it. For screenshots use I04, where the data is pixels.',
      },
      {
        zh: '電話與證號的規則是台灣的:+886 或 09 開頭的手機、0 加 2 到 8 的市話、一個英文字母加 1、2、8 或 9 再加八位數的身分證或新式統一證號。2021 年以前那種「兩個英文字母加八位數」的舊式居留證號不會命中:它的第二碼是字母、走另一張對照表,而那套編號已經被取代,與其猜一個規則不如講清楚它不在範圍內。其他國家的號碼格式同樣不會命中,這是範圍選擇而不是遺漏。單獨要驗一組身分證、統編或手機是否合法,用 J05。',
        en: 'Phone and ID rules are Taiwan-only: +886 and 09 mobiles, 0 plus 2 to 8 landlines, and the letter-plus-nine-digits ROC ID or 2021 resident certificate number. The pre-2021 two-letter resident number is not matched, because its second character is a letter with its own table and the scheme has been superseded. Other countries will not match, which is a scope decision. To validate one number rather than mask it, use J05.',
      },
      {
        zh: 'partial 模式保留的那幾碼是可以拿去比對的,它的用途是讓 log 還讀得懂,不是去識別化。要給不信任的收件人就用 label 或 fixed。另外統一編號與長 base64 兩個偵測器預設關閉:隨機的八位數字大約每五個就有一個能通過統編檢查碼,而四十字以上的 base64 會咬到雜湊、簽章與一堆本來就不是秘密的東西。要開可以,誤傷的成本你自己判斷。',
        en: 'Partial mode leaves digits that can still be matched against a known value — it exists to keep the log readable, not to de-identify. Use label or fixed for an untrusted recipient. The 統一編號 and long-base64 detectors ship off, because one in five random eight-digit numbers passes that checksum and long base64 catches hashes and signatures.',
      },
    ],
  },
};
