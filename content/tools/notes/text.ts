import type { ToolNote } from './index';

/** Drawer A — "how it works" prose for the indexable tools in this drawer. */
export const TEXT_NOTES: Record<string, ToolNote> = {
  'text-diff': {
    body: [
      {
        zh: '這裡用的是 Myers 1986 年那篇論文的演算法:它把「把左邊改成右邊最少要動幾下」當成在編輯圖上找最短路徑,複雜度是 O((N+M)·D),D 是實際的差異量。換句話說,兩段很像的文字比得飛快,兩段毫不相干的文字才會慢——而「貼兩段毫不相干的東西」剛好是任何人都會試一次的操作。',
        en: 'This is Myers (1986): the minimum edit script as a shortest path through an edit graph, at O((N+M)·D) in the actual edit distance D. Similar texts compare instantly; unrelated ones are the slow case — which is exactly what everyone tries first.',
      },
      {
        zh: '所以在跑演算法之前會先把兩邊共同的開頭與結尾切掉。真實的修改幾乎都只動中間一小段,切完之後要比的長度常常只剩原本的百分之幾。剩下的部分若還是太大(超過一萬兩千個片段),它會直接告訴你比不動,而不是把你的分頁凍住——那種凍住在瀏覽器裡跟當掉是一樣的,唯一的出路是關掉分頁。',
        en: 'So the shared prefix and suffix come off first. A real edit touches a small middle span, and trimming often leaves a few percent of the original length. If what remains is still too large, the tool says so rather than freezing the tab — in a browser a runaway loop is indistinguishable from a crash.',
      },
      {
        zh: '逐字模式對中文有特別處理:中文沒有空格,若照英文那樣用空白切詞,一整段中文會變成一個片段,改一個字就報告整段被換掉。這裡把中日韓字元逐字切開,標點與全形字元也算在內,所以「一段」改成「兩段」就只會標出那一個字。',
        en: 'Word mode treats CJK per character. Chinese has no spaces, so splitting on whitespace would make a whole paragraph one token and report it entirely replaced over a single character. Splitting ideographs individually keeps the change as small as it actually is.',
      },
    ],
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
    body: [
      {
        zh: '「幾個字」不是一個問題,是四個。這裡同時給出 String.length 的 UTF-16 單位數、Unicode 碼位數、Intl.Segmenter 切出的字元叢集數,以及 UTF-8 位元組數。四個數字在純英文時會很接近,在你貼進一個家庭 emoji 時會分裂成 8、5、1、18。會需要哪一個取決於你要對付誰:資料庫的 varchar(50) 通常指 UTF-16 單位,HTTP header 或簡訊的長度上限指位元組,而「這行放不放得下」只有字元叢集數答得出來。把四個都攤開,是因為只給一個數字等於替你做了一個你沒同意的假設。',
        en: 'Four counts, not one: UTF-16 units, code points, grapheme clusters from Intl.Segmenter, and UTF-8 bytes. A three-person family emoji is 8, 5, 1 and 18 of those. A varchar limit means UTF-16, a header limit means bytes, and only graphemes answer "does this line fit".',
      },
      {
        zh: '中英混排是這個工具存在的理由。英文用空白分詞,中文沒有分隔符,所以 split(/\\s+/) 遇到一整段中文會回報「一個字」,再算出兩秒的閱讀時間。這裡的做法是先把中日韓字元換成空白,剩下的才丟給分詞的正規式,含字母的算一個英文詞、純數字的另外歸到數字欄——3.14 與 1,000 因此是一個 token 而不是三個。中日韓字元則逐字數,判斷用的是 \\p{Script=Han} 這類 Unicode 屬性,不是手寫的碼位區間:區間每個 Unicode 版本都在動,而且擴充 B 區在 BMP 之外,用區間比對會靜默漏掉代理對。全形標點也單獨數一欄,而且是逐個列出來的,因為 U+FF00–FFEF 裡混著全形英文字母與數字,整塊當標點會把「Ａ」算成標點符號。',
        en: 'Mixed text is the reason this exists. CJK letters are replaced with spaces before the word regex runs, so a Chinese paragraph is not reported as one word; CJK is then counted per character via \\p{Script=Han} and friends rather than hand-written ranges, which miss surrogate pairs in Extension B.',
      },
      {
        zh: '閱讀時間是兩個獨立的項相加:中日韓字數除以每分鐘 300 字,英文詞數除以每分鐘 200 詞,兩段秒數分開顯示再合計。混排的文字不會以任何單一速率被讀完,用加權平均只會得到一個誰都不適用的數字。兩個速率都做成可調參數,理由沒什麼高深:已發表的閱讀速率研究彼此差到兩倍,真正知道你讀多快的只有你。字頻那一欄同樣沒有猜:沒有詞典就沒有中文分詞,所以中文按單字計。「彌補」被拆成「彌」和「補」不好看,但它是關於這段文字的真話;硬猜出來的詞不是。',
        en: 'Reading time is two terms added, not a blended rate: CJK characters at 300/min and Latin words at 200/min, both shown and both editable, because published figures differ by a factor of two. Frequency counts CJK per character — without a dictionary there is no segmentation, and a guessed word would be confidently wrong.',
      },
    ],
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
    body: [
      {
        zh: '這裡面其實是兩種不同的工作,分開處理是整件工具的重點。一個識別字像 parseHTTPResponse 沒有標點也沒有語法,它只是幾個詞黏在一起,所以轉換它等於把這串詞拆開、換另一種方式黏回去。一個句子兩者都有,所以轉換它等於把不是詞的東西原地留著。把散文丟進識別字的拆詞器,標點會消失;把識別字丟進散文用的函式,只會得到 parsehttpresponse。因此 camelCase 到 CONSTANT_CASE 這八種命名風格走「拆詞再重組」,全小寫、句首大寫與標題式大寫走「原地改字」,後者的空白、標點與換行一個都不動。',
        en: 'Two separate jobs. An identifier is a glued list of words with no punctuation, so the eight naming styles split it and re-glue it; a sentence has punctuation and grammar, so lower, sentence and title case edit words in place and leave everything else untouched. Swapping the two either eats the punctuation or yields parsehttpresponse.',
      },
      {
        zh: '拆詞最難的一段是連續大寫。規則是:兩個以上的大寫字母,在後面接著「大寫加小寫」或接著非文字字元時,提前結束一個詞——HTTPServer 是 HTTP 加 Server,不是 HTTPS 加 erver。要求至少兩個,否則 IPv4Address 會在 I 後面就斷掉。數字預設不切,因為 utf8Length 讀起來比 utf_8_length 順,想要切開是一個開關。另一個開關是保留原有大寫,它管兩種形狀:一種是連續大寫,開著的話 HTTP 不會變成 Http;另一種是第一個字母之後還有大寫的詞,像 iPhone、McDonald、eBay、LaTeX。後者不是縮寫,但它們的大寫同樣是打字的人刻意打的,而標題式大寫把 McDonald 寫成 Mcdonald 看起來像拼錯字而不是像排版風格——這是這件工具最不該犯的錯,所以判斷是「全大寫,或第一個字母之後還有大寫」。它只保留、不添加:本來全小寫的詞照樣會補上首字母大寫。整組正規式用的是 Unicode 屬性而不是 [A-Za-z],因為識別字裡真的會出現中文,而字元類別對付不了的東西是直接丟掉而不是報錯——那種靜默的資料遺失比壞掉難查。',
        en: 'The hard part is capital runs: two or more capitals end a word early when followed by a capital plus a lowercase, so HTTPServer is HTTP plus Server, not HTTPS plus erver; the run must be two long or IPv4Address splits after the I. Digits stay attached by default. The preserve switch covers two shapes — a run of capitals, and a capital past the first letter (iPhone, McDonald, eBay), which are not acronyms but were typed on purpose; it preserves without adding, so a lower-case word still gets its initial capital. and the patterns use Unicode properties because [A-Za-z] would silently drop CJK.',
      },
      {
        zh: '標題式大寫的小詞清單是照 AP 風格抓的,但這件事沒有標準答案:AP、Chicago 與紐約時報畫的線都不一樣,主要吵的是介系詞要多長才配得上一個大寫。所以那份清單在介面上是可以編輯的,你的公司風格指南比任何一家報社都重要。實作上第一個詞與最後一個詞一律大寫,這需要知道每個詞在該行裡的位置,所以是先把所有詞的位置收集起來再重建字串,而不是一次 replace 掃過去。命名風格則是逐行套用的:貼一整欄變數名進來是最常見的用法,整份合起來處理只會產生一個超長的識別字。',
        en: 'The small-word list follows AP, but AP, Chicago and the New York Times all draw the line differently, so the list is editable. First and last word always take a capital, which needs each word position within its line — so matches are collected and the string rebuilt rather than replaced in one pass. Naming styles run per line, because a pasted column of names is the common case.',
      },
    ],
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
    body: [
      {
        zh: '這不是一組獨立的取代,是一條有順序的管線,因為每條規則都看上下文,而上下文會被前面的規則改掉。刪節號要在標點之前處理,否則三個點的第一個點會先被單獨轉成句號。標點要在空格之前處理,因為兩個字之間該不該有空格,取決於中間那個標點最後變成全形還是半形。實際的順序是:半形假名合成、全形英數轉換、刪節號、破折號、標點寬度、引號配對、去掉貼著全形標點的空白,最後才補中英之間的空格。每一步都回報改了幾處,總數列在結果上方——一個看不出自己動了什麼的排版工具,你不會敢拿它處理一份要交出去的文件。也因為這個數字是唯一的憑據,已經是正確形式的東西就不會被算一筆:一個原本就寫對的「……」或「——」會被原樣留下並計為零,而不是被同樣的字元取代再報告一次改動。',
        en: 'A pipeline, not a set of independent substitutions: every rule reads context, and earlier rules change that context. Ellipses settle before punctuation, punctuation before spacing, and the pangu space goes in last. Each step reports how many edits it made, and a run already in the target form is left alone and counted as zero rather than replaced by itself.',
      },
      {
        zh: '整組規則刻意保守,判準是這樣的:一個會把「檔案.txt」變成「檔案。txt」的工具比沒有工具更糟,因為輸出看起來像對的。所以句點與冒號永遠不會在英文字母或數字前面變成全形,在英文字母後面也只有在行尾才變——2.0、12:30、http:// 與 e.g. 因此都活著,而「…結果是 A1.」的句尾仍然會收成句號。寬化的判斷還先問了一次「這一行有沒有中文」,不只看左右兩個字:A1。是一個中文句子,只是最後一個 token 剛好是英數,只看鄰居的規則會把那個句號縮成半形,結果一致但明顯是錯的。而「有沒有中文」也不能只認漢字與假名:中文文件裡的條列編號行像「(1)。」或「2。」一個漢字都沒有,只認漢字的話整行會被當成英文行、作者選的全形標點會被縮掉。所以判準是:有漢字假名韓文,或者這一行出現全形標點而且找不到一個英文字母來解釋它。Hello,world。有字母,仍然會被縮成半形,那正是縮寫規則存在的理由。括號則按它面對的方向判斷,左括號看右邊,右括號看左邊。',
        en: 'The rules are deliberately conservative: a tool that turns 檔案.txt into 檔案。txt is worse than none, because the output looks plausible. Periods and colons never widen before Latin, and after Latin only at end of line, which keeps 2.0, 12:30 and http:// intact. Widening also asks whether the whole line contains CJK, since A1。 is a Chinese sentence that happens to end in a Latin token — and "contains CJK" is not Han alone, because a numbered heading such as （1）。 has none: a line counts as Chinese if it has Han, kana or Hangul, or if it holds full-width punctuation with no Latin letter to justify it.',
      },
      {
        zh: '引號配對是看左邊決定的,不是數奇偶。前面是空白、行首或一個開括號,就是開引號,其他一律是收引號;而夾在兩個字母中間的單引號是撇號,像 don\'t,永遠不當引號處理。用奇偶數配對的話,每一個英文縮寫都會開出一個吞掉後面整段的引號——這種錯誤很難用眼睛掃出來,因為它只在段落末尾才顯形。中英之間補空格則跑兩趟,不是一趟:「中a中」這個情形兩條規則會重疊,單一次全域掃描會把中間那個字母吃掉,結果只補到一邊。',
        en: 'Quote pairing is decided by the character on the left, not by parity, and a straight quote between two letters is an apostrophe. Parity counting would let every contraction open a quotation that swallows the rest of the paragraph. The pangu spacing runs in two passes, because a single global pass consumes the shared character in 中a中 and misses the second boundary.',
      },
      {
        zh: '半形假名的合成用 NFKC,但只作用在半形假名那一個區塊上。對整份文字跑 NFKC 會順手把全形英數、㍿ 這類方形合字與上下標全部攤平,那是沒人要求的改動。限定範圍之後它只做一件事,包括把假名與後面的濁音符號併成一個字。全形英數轉半形則是純算術,碼位加減 0xFEE0,不經過正規化表。',
        en: 'Half-width kana composition uses NFKC, but only on the half-width kana block — NFKC over the whole string would also flatten full-width Latin, squared forms and superscripts. Width conversion for letters and digits is plain arithmetic on the code point, offset 0xFEE0.',
      },
    ],
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
    body: [
      {
        zh: '比「抓得多」更重要的有兩件事。第一件是命中必須真的是命中:八位數字不等於統一編號,十六位數字不等於信用卡號,所以凡是有檢查碼的東西都先驗算再遮。卡號走 Luhn,長度限定 13 到 19 位;身分證號走內政部那組加權公式,首字母的 10 到 35 對照表是照公布順序寫的(ABCDEFGHJKLMNPQRSTUVXYWZIO,I 與 O 在最後),不是按字母序;2021 年啟用的新式外來人口統一證號用的是同一組權重,只有第二位不同——本國身分證是 1 或 2,統一證號是 8 或 9,所以那一位認的是 [1289] 四種,少認兩種的後果不是「沒抓到」,是居留證號被安靜地留在輸出裡;統一編號用 2023 年 4 月起改成的「加總為 5 的倍數」規則,舊的 10 的倍數規則下合法的號碼一樣會通過,第七位是 7 的特例也保留。會對訂單編號亂叫的偵測器,結果是被使用者關掉,然後什麼都保護不到。',
        en: 'Two things matter more than coverage. First, a hit has to be a real hit: anything with a check digit is verified before masking — Luhn for 13 to 19 digit cards, the weighted ROC ID formula with the published (non-alphabetical) letter table — the same formula covers the 2021 resident certificate number, whose second digit is 8 or 9 rather than 1 or 2 — and the multiple-of-five 統一編號 rule that replaced the multiple-of-ten one in April 2023. A detector that fires on order numbers gets switched off, and then it protects nothing.',
      },
      {
        zh: '第二件是遮蔽要保留意義、不保留值。label 模式給每個不同的值一個穩定的編號,同一個 Email 出現十次都是 [EMAIL_1],另一個人是 [EMAIL_2]——這樣一份 log 讀起來還是「兩個使用者各做了什麼」的故事,而不是一堵一模一樣的方塊牆,同時沒有任何原值留下來。partial 模式則是各偵測器自己決定保留哪一段,判準是「除錯需要的是什麼」:Email 留網域不留人,IPv4 留前兩段因為要知道是哪個網段,卡號留末四碼。有些片段在任何模式下都留著:Authorization 的 Bearer 或 Basic 不是秘密,而知道是哪個 scheme 失敗有用;查詢字串的參數名也留著,因為 token=[SECRET_1] 才說得出到底是什麼洩漏了;帶帳密的 URL 只遮帳密不遮主機,一個沒有主機的 URL 等於什麼都沒說。',
        en: 'Second, masking is reversible in meaning but not in value. Label mode numbers each distinct value, so every occurrence of one address is [EMAIL_1] and a log still reads as a story about two users. Partial mode keeps whatever debugging needs — the email domain, the first two octets of an IP, the last four digits of a card — and the Bearer scheme, the query parameter name and the URL host survive in every mode, because a log missing those is harder to read and no safer.',
      },
      {
        zh: '偵測器本來就會互相重疊:一個 JWT 同時也是一長串 base64,URL 裡的卡號同時也是一串數字。所以做法是全部先掃出來,再由左到右掃過去,每個位置取優先度最高的那個,並跳過會與已取用區間重疊的東西——具體的偵測器優先度一定高於通用的,JWT 是 90,十六進位長字串是 40,八位數統編是 20。IPv6 是最需要驗算的一個:鬆散的樣式分不出 2001:db8::1 與 log 時間戳裡的 10:14:22,兩者都是冒號分隔的十六進位群組,所以樣式只負責提候選,由驗算函式決定——最多一個雙冒號、每組一到四位、沒有雙冒號時必須剛好八組,而時鐘永遠不會有八組。卡號的樣式同樣寫成三種明確的分組形狀,而不是「數字加任意分隔符」:後者會讓比對跨過空白吃進 log 裡的下一個數字,整串接著 Luhn 驗算失敗,然後被安靜地跳過。',
        en: 'Detectors overlap by design — a JWT is also a long base64 run — so everything is collected first, then swept left to right taking the highest priority at each position and skipping overlaps. IPv6 needs the validator most: a loose pattern cannot tell 2001:db8::1 from the 10:14:22 in a timestamp, so the pattern only proposes and the validator decides, and a clock never has eight groups.',
      },
      {
        zh: '所有樣式都是線性的:有界重複、簡單字元類別,沒有量詞包量詞。這條是硬規定,因為整份 log 是在主執行緒上掃的,一個會回溯爆炸的樣式就是把分頁鎖死,而使用者分不出那是當掉還是很慢。輸入超過 50 萬字元直接拒絕並說明原因;命中數的上限是 2 萬,但那 2 萬是分配給各個偵測器的預算,不是先搶先用。差別在安全性上很大:先搶先用的話,一份前面塞滿 JWT 的 log 會在 Email 與 IP 的偵測器跑到之前就把配額用完,輸出看起來遮好了,實際上每一個地址都還在裡面。所以做法是輪流分配——每一輪把剩下的預算平分給還沒掃完的偵測器,提早掃完的把剩額交還給還沒掃完的,最後被犧牲的是同一類的尾巴,而且介面上會明確列出是哪幾類只掃到一部分。在一個把資料留在本機的工具裡,老實說「這幾類我只看到前面那些」比一句「已截斷」重要得多。',
        en: 'Every pattern is linear: bounded repetition, simple classes, no nested quantifiers. The scan runs on the main thread over a whole log, and a backtracking pattern would freeze the tab. Input over 500,000 characters is refused outright. The 20,000 match cap is a budget shared out between the enabled detectors in rounds rather than spent first-come — otherwise a log whose head is full of JWTs would exhaust it before the e-mail and IP detectors ran once, and the output would look redacted while carrying every address in the file. What gets lost is the tail of one category, and the UI names which.',
      },
    ],
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
