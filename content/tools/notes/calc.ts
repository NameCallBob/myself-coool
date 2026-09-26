import type { ToolNote } from './index';

/** Drawer CALC — "how it works" prose for the indexable tools in this drawer. */
export const CALC_NOTES: Record<string, ToolNote> = {
  'unit-convert': {
    body: [
      {
        zh: '每個維度有一個基準單位——長度是公尺、重量是公斤、資料量是位元組——換算就是先乘到基準再除到目標。這兩步沒什麼可講的,值得講的是表裡那些比例是怎麼寫的。英寸寫 0.0254,因為 1959 年的國際協定就是這麼定義的,那個數字不是量出來的;坪寫成 (10/33 × 6)²,也就是 400/121 平方公尺,而不是 3.3058。台制單位全部從「一台尺等於 10/33 公尺」推出來:台斤是 0.6 公斤整,甲是 2934 坪(日治時期土地調查留下來的定義,現在還印在權狀上),台升是 2401/1331 公升,繼承日本的升。寫成分數的理由很無聊但很實際:分數沒有捨入誤差,小數有,而差多少取決於捨到第幾位——那不該由這張表替使用者決定。',
        en: 'Each dimension has one base unit and conversion is multiply-to-base then divide-to-target. What matters is how the ratios are written: an inch is exactly 0.0254 m by the 1959 agreement, and a ping is (10/33 × 6)² = 400/121 m² rather than 3.3058. Every Taiwanese unit derives from 台尺 = 10/33 m, so a catty is exactly 0.6 kg and a kah is 2934 ping. Fractions carry no rounding error; a decimal would make this table decide how much error you get.',
      },
      {
        zh: '溫度是唯一不能用比例表達的維度,因為攝氏、華氏、蘭氏都是仿射關係,不是正比關係:20°C 不是 10°C 的兩倍。所以溫度的單位在型別上沒有 factor 欄位,改帶一對 toBase / fromBase 函式。這不是「約定好不要拿溫度去乘」,是拿溫度去乘這件事在這個型別上根本寫不出來。速度裡的配速是另一個特例:分/公里在你跑得更快的時候會變小,沒有任何一個乘數能表達這種反向關係,所以它被標成 reciprocal,進出兩個方向都用「距離 ÷(分鐘 × 60)」算,而不是假裝它有 factor。',
        en: 'Temperature is the exception: Celsius, Fahrenheit and Rankine are affine, not proportional, so those units carry a pair of functions instead of a factor — multiplying a temperature by a ratio is not discouraged here, it is unrepresentable. Running pace is the other one: min/km falls as speed rises, so it is flagged reciprocal and converted as distance ÷ (minutes × 60) in both directions.',
      },
      {
        zh: '同單位換同單位會直接回傳原值,不繞基準走一圈。這不是省效能,是因為 1.5 × 0.0254 ÷ 0.0254 在 IEEE 754 下等於 1.4999999999999998——顯示出來還是 1.5,但拿去跟 1.5 做等值比較就不成立。同一個理由決定了輸出只取十二位有效數字:1 ÷ 0.0254 的雙精度值是 39.370078740157481,把尾巴那幾位印出來,等於在宣稱這個換算有那種精度。超過 1e15 或小於 1e-6 會改用科學記號,因為那個範圍的定點寫法只會變成一長串零。',
        en: 'Converting a unit to itself short-circuits, because 1.5 × 0.0254 ÷ 0.0254 is 1.4999999999999998 — it prints as 1.5 but fails an equality check. Output is twelve significant digits for the same reason: 1 ÷ 0.0254 is 39.370078740157481 in double precision, and printing the tail advertises precision the conversion does not have. Magnitudes above 1e15 or below 1e-6 switch to exponential.',
      },
      {
        zh: '輸入欄位收到的東西比「一個數字」複雜:從中文網頁貼過來的全形數字、千分位逗號、頓號、被輸入法打成全形的句號、開頭的加號、科學記號。這些會先正規化成 ASCII,然後用一條 regex 驗證整個字串,不合格就回 NaN,不會猜。表裡有幾個單位標了「近似」:馬赫標的是海平面 15°C 乾空氣,它本質上是比值不是單位;量杯 250 mL、大匙 15 mL、小匙 5 mL 是廚房慣例,不是法定定義;英寸水柱隨水溫變。標記的用途只有一個——不要把這幾個數字當量測值引用。',
        en: 'Input is normalised before parsing: full-width digits pasted from Chinese pages, thousands separators, a full-width period used as a decimal point, a leading plus, scientific notation. A single regex then validates the whole string and anything else returns NaN rather than a guess. A few units are marked approximate — Mach at sea level in 15 °C dry air is a ratio, not a unit; the 250 mL cup and 15 mL tablespoon are kitchen convention; inches of water depend on water temperature.',
      },
    ],
    limits: [
      {
        zh: '一次只換一個純量。複合寫法要自己拆:5 ft 10 in 得分兩次算,1 小時 30 分也是。',
        en: 'One scalar at a time. Compound quantities like 5 ft 10 in have to be split by hand.',
      },
      {
        zh: '沒有貨幣,而且不會有。匯率是每秒都在變的外部資料,拿匯率就得連線,而這一區的硬約束是互動後不發出任何請求。',
        en: 'No currency, and there will not be. Rates are live external data and this drawer makes no network requests at all.',
      },
      {
        zh: '杯匙換公克要看食材密度,這裡的體積只換體積,請用 J08 烹飪份量換算。進位不是單位,十六進位轉十進位請用 G02。',
        en: 'Cups to grams needs ingredient density — use J08. Number bases are not units; for hex to decimal use G02.',
      },
    ],
  },

  calculator: {
    body: [
      {
        zh: '算式是自己剖析的:tokeniser 切出 token、precedence climbing 建出樹、走訪器算出數字。沒有用 eval,也沒有用 new Function。理由不是對這一頁特別多疑——eval 一段人打進來的字串,等於把整個頁面的權限交給那段字串,它可以讀 localStorage、可以發請求、可以改 DOM,而且這個錯誤是靜默的:任何人隨手試的算式在 eval 版本上都會算對,你永遠不會發現問題。剖析器只能產出數字,因為它的文法表達不出別的東西。',
        en: 'The expression is parsed by hand: tokeniser, precedence-climbing parser, tree walker. No eval and no new Function — eval on a typed string hands that string the whole page (storage, network, DOM), and the flaw is silent because such a calculator answers every expression anyone tries by accident. A parser can only produce numbers; nothing else is expressible in its grammar.',
      },
      {
        zh: '自己寫也順手買到 eval 給不了的東西。錯誤帶字元位置,所以看到的是「第 14 個字元少了右括號」而不是 Unexpected token。^ 是次方而不是 xor——在 JavaScript 裡 2^10 等於 8,那是位元互斥或,而沒有人在計算機裡打 ^ 是想要 8。三角函式有度數模式。次方是右結合(2^3^2 是 2^9),一元負號的優先序放在次方之下,所以 -2^2 讀成 -(2^2),也就是數學課本的讀法而不是試算表的讀法。',
        en: 'Writing it out also buys what eval cannot give. Errors carry a character offset instead of "Unexpected token". ^ means exponentiation: in JavaScript 2^10 is 8, and nobody typing ^ into a calculator wants 8. Trig has a degree mode. ^ is right-associative and unary minus binds below it, so -2^2 reads as -(2^2) — the textbook reading, not the spreadsheet one.',
      },
      {
        zh: '隱含乘法只在不可能有歧義的位置接受:前一個 token 是數字或右括號,下一個 token 開啟括號或是個名字。所以 2pi、3(4+5)、(1+2)(3+4) 都成立,而 2 3 仍然是錯誤,因為那是漏了運算子。有一個副作用值得知道:x y 會被讀成 x 乘 y,所以兩個變數名之間的錯字不會報錯,會安靜地變成乘法。遞迴深度上限 128 層是數在 parseExpression 裡而不是數括號,因為括號不是唯一的嵌套方式——----1 跟 2^2^2^2 一樣會往下遞迴,而四千個連續負號會把堆疊耗盡;在瀏覽器裡那不是一個例外,是一個關不掉的分頁。',
        en: 'Implicit multiplication is accepted only where it cannot be a missing operator: after a number or a closing paren, before a group or a name. 2pi, 3(4+5) and (1+2)(3+4) work; 2 3 stays an error. The side effect worth knowing is that x y reads as a product, so a typo between two variable names multiplies instead of failing. The 128-level depth cap is counted in the expression parser, not at parentheses, because ----1 recurses just as deep and 4000 leading minus signs would exhaust the stack — a dead tab rather than an exception.',
      },
      {
        zh: '幾個地方寧可拒絕也不給錯的答案。0b102 在 tokeniser 裡是錯誤,不是 2——parseInt 遇到不認得的位數會停下來把讀到的部分回傳,所以字面值先用正規式驗過才交給它。171! 超過雙精度能表示的範圍(170! 是 7.26e306),所以上限就是 170,回傳 Infinity 不算答案。結果只印十五位有效數字,因為第十六、十七位就是雙精度不可信的地方:印出來會讓 0.1 + 0.2 顯示成 0.30000000000000004,那個值是對的,但畫面看起來是壞的。2^53 以下的整數照完整位數印,並附十六進位、二進位與八進位視圖。多行模式裡 ans 是上一行的結果,某一行錯了就在那一行標出來,底下的行照樣算完——一個錯字就清空整張紙,是讓人不再用多行計算機的原因。',
        en: 'Several places refuse rather than answer wrongly. 0b102 is an error, not 2: parseInt stops at the first digit it does not know and returns what it read, so literals are regex-validated first. 171! exceeds a double (170! is 7.26e306), so 170 is the ceiling instead of returning Infinity. Results print fifteen significant digits, because the sixteenth turns 0.1 + 0.2 into 0.30000000000000004 — correct, but it looks broken. In multi-line mode ans is the previous line and a failed line is flagged in place while the rest still run.',
      },
    ],
    limits: [
      {
        zh: '算的是 IEEE 754 雙精度,不是任意精度。超過 2^53 的整數會開始掉個位數,金額算到分請用 G06 或 G03,它們的捨入規則是講清楚的。',
        en: 'Arithmetic is IEEE 754 double precision, not arbitrary precision: past 2^53 integers lose their last digits. For money to the cent use G06 or G03, where the rounding rules are stated.',
      },
      {
        zh: '只算數值,不做符號運算:不解方程、不化簡、不微分。變數是儲存格,不是未知數。',
        en: 'Numeric only — no symbolic algebra, no solving, no simplification, no derivatives. A variable is a slot, not an unknown.',
      },
      {
        zh: '因為 ^ 被指定成次方,這裡沒有位元運算子。AND、OR、XOR 與位移請用 D06;純進位轉換請用 G02。',
        en: 'Since ^ is exponentiation, there are no bitwise operators here. For AND, OR, XOR and shifts use D06; for base conversion alone use G02.',
      },
    ],
  },

  loan: {
    body: [
      {
        zh: '月付額的閉合公式 P·i /(1 −(1 + i)^−n)只有一行,這裡也有用它,但它只回答一種貸款:利率、餘額、期數三個都不變的那種。實務上需要的每一個功能都會打破這個前提——寬限期(前幾期只付息)、幾乎每份台灣房貸都有的兩段式利率(前兩年 X%,之後 Y%)、中間丟一筆提前還款、還有銀行把月付額進位到整元的習慣。所以這裡不是解一條公式,而是逐月走完整個期間,並在三個時刻重新解一次月付額:寬限期結束開始攤本金時、利率跳段時、以及提前還款設定成「降月付」的每一筆之後。其餘都只是記帳:利息是期初餘額乘當月月利率,本金是月付額減利息,餘額減掉本金。',
        en: 'The closed-form instalment P·i / (1 − (1+i)^−n) is in here, but it only answers a loan whose rate, balance and term never change — and grace periods, the two-stage rate on almost every Taiwanese mortgage, lump-sum prepayments and instalments rounded up to whole dollars all break that. So the schedule walks month by month and re-solves the closed form at three moments: when amortisation starts, when the rate steps, and after each prepayment that is set to shrink the instalment.',
      },
      {
        zh: '逐月模擬還有一個理由:那張表可以拿去跟對帳單一行一行對。看得到每期的利息、本金、餘額,才有辦法發現自己對利率或期數的理解跟銀行不一樣。零利率被單獨處理:i 等於 0 時公式變成 0 除以 0,而零利率的月付額就是本金除以期數;會特別寫這一段,是因為「利率填 0 看看」是每個人第一次都會做的動作,那裡跳出 NaN 會讓整件工具看起來壞掉。月付額進位到整元時,差額全部堆在最後一期,所以最後一期通常比前面小——工具把首期、最大期與末期分開顯示,預算要撐住的是最大那一期,不是平均。',
        en: 'A per-period table also exists so it can be checked line by line against a statement. Zero interest is special-cased: at i = 0 the formula is 0/0, while the answer is just principal ÷ months — and "try 0%" is what everyone does first, so a NaN there would make the tool look broken. When the instalment is rounded up, the difference accumulates into a smaller final payment, so the first, largest and last instalments are reported separately; the budget has to survive the largest one.',
      },
      {
        zh: '提前還款有兩種效果,銀行的合約決定是哪一種:縮期(月付不變、提早還完)或降月付(期數不變、月付重算)。縮期在程式裡不需要做任何事,餘額歸零時迴圈自己就結束了;降月付才要拿剩下的餘額與剩下的期數重解一次。金額超過當期剩餘餘額會被削到剛好清償,不會出現負餘額。另外有一道防禦性檢查:如果某期算出來的本金是負的(等於月付額連利息都不夠付,餘額會越還越多),這裡直接拋錯,而不是印出一張餘額上升的表——閉合公式加上只會往上進位的捨入本來不可能走到那裡,但把錯誤靜默成一張看起來正常的表,比當掉危險。',
        en: 'A prepayment either shortens the term or shrinks the instalment, and the contract decides which. Shortening needs no code — the loop ends when the balance reaches zero — while the other case re-solves over the remaining balance and months. An amount larger than the outstanding balance is clipped to it. There is also a defensive check: a negative principal component would mean a growing balance, and that throws rather than printing a plausible-looking table.',
      },
      {
        zh: '有效年利率是用二分法在實際現金流上找 IRR 算出來的:把每期實付金額(含提前還款)折現,找出讓現值等於本金的月利率,再年化成 (1 + 月利率)^12 − 1。區間取每月 0 到 100%,二分 200 次——遠超過雙精度用得上的次數,而且保證會停。這個數字存在的理由是它是唯一能誠實比較兩份報價的量:一份「前兩年 1.5%、之後 2.3%」的貸款,既不是 1.5% 的貸款,也不是 2.3% 的貸款,而兩家銀行的兩段式切在不同月份時,只看牌告利率是比不出來的。',
        en: 'The effective annual rate is an IRR found by bisection over the actual cash flows: discount every payment including prepayments, find the monthly rate where present value equals the principal, then annualise as (1 + r)^12 − 1. The bracket is 0 to 100% a month and 200 bisections always terminate. It exists because a loan at "1.5% for two years then 2.3%" is neither a 1.5% loan nor a 2.3% loan, and headline rates cannot be compared when the step falls in different months.',
      },
    ],
    limits: [
      {
        zh: '不知道你的銀行怎麼算。計息天數慣例(按實際天數還是每月當 1/12)、提前清償違約金、是在還款日還是週年日結息,這三件事都會差到真錢。這裡的數字是用來跟銀行對話的估算,不是報價。',
        en: 'It does not know your bank: day-count convention, prepayment penalties, and whether interest compounds on the payment date or the anniversary all move the total by real money. These figures are an estimate to argue with, not a quote.',
      },
      {
        zh: '有效年利率只看本息現金流,沒有把開辦費、帳管費、信保費或強制投保算進去,所以它不等於金融機構公告的總費用年百分率。',
        en: 'The effective rate covers principal and interest only — no origination fees, insurance or guarantee premiums — so it is not the lender-published APR.',
      },
      {
        zh: '利率最多兩段,繳款週期固定是月。機動利率每季隨指標調整、雙週繳、按日計息的循環信用都不在模型裡;投資端的複利與定期定額請用 G07。',
        en: 'At most two rate stages, monthly payments only: quarterly index resets, biweekly schedules and daily-accrual revolving credit are outside the model. For compound growth and regular investing use G07.',
      },
    ],
  },
};
