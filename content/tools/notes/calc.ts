import type { ToolNote } from './index';

/** Drawer CALC — "how it works" prose for the indexable tools in this drawer. */
export const CALC_NOTES: Record<string, ToolNote> = {
  'unit-convert': {
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
limits: [
      {
        zh: '算的是 IEEE 754 雙精度,不是任意精度。超過 2^53 的整數會開始掉個位數,階乘從 23! 起就只是近似值(工具會在那種結果前面標 ≈),要精確的大整數這裡給不了。金額算到分請用 G06 或 G03,它們的捨入規則是講清楚的。',
        en: 'Arithmetic is IEEE 754 double precision, not arbitrary precision: past 2^53 integers lose their last digits and factorials from 23! up are approximations, marked with ≈ where they show. No exact big integers here. For money to the cent use G06 or G03, where the rounding rules are stated.',
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
        zh: '兩段式利率的「前段月數」從放款當月起算,寬限期算在裡面——這是牌告的讀法(「前兩年 1.5%」指的是貸款的前兩個年度)。如果你的合約是從開始攤本金才起算前段,請自己把寬限期月數加進去;工具沒有分開這兩種讀法的開關。',
        en: 'The first stage is counted from the disbursement month with the grace period inside it, the way a rate card reads. A contract whose stage one starts at the first principal payment has to be entered as grace + stage months; there is no switch for the two readings.',
      },
      {
        zh: '利率最多兩段,繳款週期固定是月。機動利率每季隨指標調整、雙週繳、按日計息的循環信用都不在模型裡;投資端的複利與定期定額請用 G07。',
        en: 'At most two rate stages, monthly payments only: quarterly index resets, biweekly schedules and daily-accrual revolving credit are outside the model. For compound growth and regular investing use G07.',
      },
    ],
  },
};
