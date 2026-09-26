import type { ToolNote } from './index';

/** Drawer CALC — what each indexable tool in this drawer will not do. */
export const CALC_NOTES: Record<string, ToolNote> = {
  'unit-convert': {
    limits: [
      {
        zh: '一次只換一個純量,5 ft 10 in 這種複合寫法要自己拆成兩次算。',
        en: 'One scalar per conversion; compound inputs like 5 ft 10 in must be split by hand.',
      },
      {
        zh: '沒有貨幣換算,這一區互動後不連網,拿不到匯率。',
        en: 'No currency conversion: this drawer makes no network requests, so there are no rates.',
      },
      {
        zh: '杯匙換公克要看食材密度,請用 J08;進位轉換請用 G02。',
        en: 'Cups to grams depends on ingredient density — use J08; for number bases use G02.',
      },
    ],
  },

  calculator: {
    limits: [
      {
        zh: '雙精度浮點運算,超過 2^53 的整數會掉尾數,23! 以上只是近似值。',
        en: 'Double-precision arithmetic: integers above 2^53 lose digits and 23! up is approximate.',
      },
      {
        zh: '只算數值,不解方程、不化簡、不微分,變數只是儲存格。',
        en: 'Numeric only — no equation solving, simplification or derivatives; variables are just slots.',
      },
      {
        zh: '沒有位元運算子,AND、OR、XOR 與位移請用 D06,純進位轉換用 G02。',
        en: 'No bitwise operators: use D06 for AND, OR, XOR and shifts, G02 for base conversion.',
      },
    ],
  },

  loan: {
    limits: [
      {
        zh: '結果是估算,未計入計息天數慣例、提前清償違約金與結息日差異。',
        en: 'Estimates only: day-count conventions, prepayment penalties and compounding dates are ignored.',
      },
      {
        zh: '有效年利率只看本息,不含開辦費與保費,不等於公告的總費用年百分率。',
        en: 'The effective rate covers principal and interest, so it is not the lender-published APR.',
      },
      {
        zh: '利率最多兩段、固定月繳;機動利率、雙週繳不支援,投資複利請用 G07。',
        en: 'Two rate stages and monthly payments at most; for investment compounding use G07.',
      },
    ],
  },
};
