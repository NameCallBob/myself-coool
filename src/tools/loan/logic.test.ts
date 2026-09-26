import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LoanError,
  MAX_MONTHS,
  annualisedRates,
  buildSchedule,
  byYear,
  effectiveAnnualRate,
  money,
  monthlyPayment,
  prepaymentSaving,
  rateForMonth,
  termText,
  type LoanInput,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance = 1e-6, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

const base = (over: Partial<LoanInput> = {}): LoanInput => ({
  principal: 1_000_000,
  rate: 2,
  stageMonths: 0,
  rateAfter: 2,
  months: 240,
  graceMonths: 0,
  method: 'equal-payment',
  prepayments: [],
  prepaymentEffect: 'term',
  roundPayment: false,
  ...over,
});

test('monthlyPayment matches the published figures', () => {
  // The most-quoted example anywhere: $100 000 at 6% over 30 years.
  near(monthlyPayment(100_000, 6, 360), 599.5505251527569, 1e-9);
  near(monthlyPayment(1_000_000, 2, 240), 5058.8333504510765, 1e-9);
  near(monthlyPayment(5_000_000, 1.8, 360), 17_984.924778736015, 1e-9);
  // Zero interest is the principal split evenly, not NaN.
  near(monthlyPayment(120_000, 0, 12), 10_000);
  near(monthlyPayment(0, 5, 120), 0);
  assert.ok(Number.isNaN(monthlyPayment(1000, 5, 0)));
});

test('the schedule repays exactly the principal and nothing more', () => {
  const schedule = buildSchedule(base());
  assert.equal(schedule.periods.length, 240);
  const principalPaid = schedule.periods.reduce((sum, period) => sum + period.principal, 0);
  near(principalPaid, 1_000_000, 1e-6, 'principal must reconcile');
  near(schedule.periods[239].balance, 0, 1e-6, 'the balance must land on zero');
  near(schedule.totalPaid - schedule.totalInterest, 1_000_000, 1e-6);
});

test('each period is interest on the opening balance, principal as the rest', () => {
  const schedule = buildSchedule(base({ principal: 100_000, rate: 6, months: 360 }));
  const first = schedule.periods[0];
  near(first.interest, 500, 1e-9, '100 000 × 6% ÷ 12');
  near(first.payment, 599.5505251527569, 1e-9);
  near(first.principal, 99.5505251527569, 1e-9);
  near(first.balance, 99_900.44947484724, 1e-9);
  near(schedule.totalInterest, 115_838.18905499249, 1e-6);
  // Interest falls and principal rises, every single month.
  for (let i = 1; i < schedule.periods.length; i += 1) {
    assert.ok(
      schedule.periods[i].interest < schedule.periods[i - 1].interest,
      `interest rose at month ${i + 1}`
    );
    assert.ok(schedule.periods[i].principal > schedule.periods[i - 1].principal);
  }
});

test('an interest-only grace period pays no principal and raises the instalment after', () => {
  const schedule = buildSchedule(base({ graceMonths: 24 }));
  assert.equal(schedule.periods.length, 240);
  for (let i = 0; i < 24; i += 1) {
    assert.equal(schedule.periods[i].grace, true);
    assert.equal(schedule.periods[i].principal, 0);
    near(schedule.periods[i].payment, 1_666.6666666666667, 1e-9);
    near(schedule.periods[i].balance, 1_000_000, 1e-9, 'the balance must not move');
  }
  // After the grace period the same principal is amortised over 216 months.
  near(schedule.periods[24].payment, 5_516.67089672302, 1e-9);
  assert.equal(schedule.periods[24].grace, false);
  near(schedule.periods[239].balance, 0, 1e-6);
  // A grace period costs interest: 24 months of it, paid for nothing.
  const without = buildSchedule(base());
  assert.ok(schedule.totalInterest > without.totalInterest);
  near(schedule.totalInterest - without.totalInterest, 17_480.90958391389, 1e-4);
});

test('equal-principal repays the same principal every month, with a falling payment', () => {
  const schedule = buildSchedule(
    base({ principal: 1_200_000, rate: 2.4, months: 240, method: 'equal-principal' })
  );
  for (const period of schedule.periods) near(period.principal, 5_000, 1e-9);
  near(schedule.periods[0].payment, 7_400, 1e-9, '5 000 principal + 2 400 interest');
  near(schedule.periods[239].payment, 5_010, 1e-9);
  // Σ (balance × i) over a linear run-down, computed in closed form.
  near(schedule.totalInterest, 289_200, 1e-6);
  near(schedule.periods[239].balance, 0, 1e-6);
  // Equal-principal always costs less interest than equal-payment.
  const equalPayment = buildSchedule(
    base({ principal: 1_200_000, rate: 2.4, months: 240, method: 'equal-payment' })
  );
  assert.ok(schedule.totalInterest < equalPayment.totalInterest);
});

test('a two-stage rate re-solves the instalment at the step', () => {
  const input = base({ rate: 1.5, stageMonths: 24, rateAfter: 2.5 });
  assert.equal(rateForMonth(input, 1), 1.5);
  assert.equal(rateForMonth(input, 24), 1.5);
  assert.equal(rateForMonth(input, 25), 2.5);

  const schedule = buildSchedule(input);
  near(schedule.periods[0].payment, 4_825.454088819613, 1e-9);
  near(schedule.periods[23].balance, 912_944.1882569949, 1e-6);
  near(schedule.periods[24].payment, 5_252.988921621979, 1e-6);
  near(schedule.totalInterest, 250_456.50520207433, 1e-4);
  near(schedule.periods[239].balance, 0, 1e-6);
  assert.equal(schedule.stagePayments.length, 2);
  near(schedule.stagePayments[1].payment, 5_252.988921621979, 1e-6);
});

test('with stageMonths at zero the second rate is ignored entirely', () => {
  const schedule = buildSchedule(base({ rate: 2, stageMonths: 0, rateAfter: 9 }));
  const plain = buildSchedule(base({ rate: 2 }));
  near(schedule.totalInterest, plain.totalInterest, 1e-9);
});

test('a prepayment set to shorten the term ends the loan early', () => {
  const input = base({ prepayments: [{ month: 13, amount: 200_000 }], prepaymentEffect: 'term' });
  const schedule = buildSchedule(input);
  assert.ok(schedule.actualMonths < 240, 'the term must shorten');
  near(schedule.periods[12].extra, 200_000);
  // The instalment never changes.
  near(schedule.periods[0].payment, schedule.periods[100].payment, 1e-9);
  const principalPaid = schedule.periods.reduce(
    (sum, period) => sum + period.principal + period.extra,
    0
  );
  near(principalPaid, 1_000_000, 1e-6);

  const saving = prepaymentSaving(input);
  assert.ok(saving.saved > 0, 'prepaying must save interest');
  assert.equal(saving.monthsSaved, 240 - schedule.actualMonths);
  near(saving.interestWithout, buildSchedule(base()).totalInterest, 1e-9);
});

test('a prepayment set to shrink the instalment keeps the term', () => {
  const schedule = buildSchedule(
    base({ prepayments: [{ month: 13, amount: 200_000 }], prepaymentEffect: 'payment' })
  );
  assert.equal(schedule.actualMonths, 240, 'the term must not shorten');
  assert.ok(
    schedule.periods[13].payment < schedule.periods[11].payment,
    'the instalment must fall'
  );
  near(schedule.periods[239].balance, 0, 1e-6);
  // Shortening the term saves more interest than shrinking the instalment.
  const shorter = buildSchedule(
    base({ prepayments: [{ month: 13, amount: 200_000 }], prepaymentEffect: 'term' })
  );
  assert.ok(shorter.totalInterest < schedule.totalInterest);
});

test('a prepayment larger than the balance is capped, not overpaid', () => {
  const schedule = buildSchedule(
    base({ prepayments: [{ month: 2, amount: 5_000_000 }], prepaymentEffect: 'term' })
  );
  assert.equal(schedule.actualMonths, 2);
  near(schedule.periods[1].balance, 0);
  const principalPaid = schedule.periods.reduce(
    (sum, period) => sum + period.principal + period.extra,
    0
  );
  near(principalPaid, 1_000_000, 1e-6, 'must not repay more than was borrowed');
});

test('several prepayments in the same month are added together', () => {
  const schedule = buildSchedule(
    base({
      prepayments: [
        { month: 10, amount: 50_000 },
        { month: 10, amount: 30_000 },
        { month: 0 + 20, amount: 20_000 },
      ],
    })
  );
  near(schedule.periods[9].extra, 80_000);
  near(schedule.periods[19].extra, 20_000);
});

test('rounding the instalment up finishes the loan a hair early', () => {
  const rounded = buildSchedule(base({ roundPayment: true }));
  const exact = buildSchedule(base());
  assert.equal(Number.isInteger(rounded.periods[0].payment), true);
  assert.equal(rounded.periods[0].payment, Math.ceil(exact.periods[0].payment));
  assert.ok(rounded.totalInterest <= exact.totalInterest);
  const principalPaid = rounded.periods.reduce((sum, period) => sum + period.principal, 0);
  near(principalPaid, 1_000_000, 1e-6);
  // The final instalment absorbs the difference instead of overshooting.
  const last = rounded.periods[rounded.periods.length - 1];
  assert.ok(last.payment <= rounded.periods[0].payment + 1e-9);
  near(last.balance, 0, 1e-6);
});

test('a zero-rate loan is just the principal divided by the term', () => {
  const schedule = buildSchedule(base({ rate: 0, rateAfter: 0, months: 100 }));
  near(schedule.totalInterest, 0);
  for (const period of schedule.periods) {
    near(period.payment, 10_000);
    near(period.interest, 0);
  }
  near(schedule.periods[99].balance, 0, 1e-6);
});

test('bad input is refused with a reason, not silently coerced', () => {
  assert.throws(() => buildSchedule(base({ principal: 0 })), LoanError);
  assert.throws(() => buildSchedule(base({ principal: -5 })), /positive amount/);
  assert.throws(() => buildSchedule(base({ months: 0 })), /whole number of months/);
  assert.throws(() => buildSchedule(base({ months: MAX_MONTHS + 1 })), /whole number of months/);
  assert.throws(() => buildSchedule(base({ months: 12.5 })), /whole number of months/);
  assert.throws(() => buildSchedule(base({ graceMonths: 240 })), /shorter than the term/);
  assert.throws(() => buildSchedule(base({ graceMonths: -1 })), /whole number of months/);
  assert.throws(() => buildSchedule(base({ rate: -1 })), /between 0 and 100/);
  assert.throws(() => buildSchedule(base({ rate: 101 })), /between 0 and 100/);
  assert.throws(() => buildSchedule(base({ stageMonths: 1.5 })), /whole number of months/);
  assert.throws(
    () => buildSchedule(base({ prepayments: [{ month: 0, amount: 100 }] })),
    /whole month number/
  );
  assert.throws(
    () => buildSchedule(base({ prepayments: [{ month: 3, amount: -1 }] })),
    /cannot be negative/
  );
  assert.throws(
    () => buildSchedule(base({ prepayments: Array.from({ length: 61 }, (_, i) => ({ month: i + 1, amount: 1 })) })),
    /at most 60 prepayments/
  );
});

test('effectiveAnnualRate recovers the nominal rate when there is only one', () => {
  // 2% a year compounded monthly is 2.0184% effective.
  near(effectiveAnnualRate(base({ rate: 2 })), 2.0184355681501787, 1e-6);
  near(effectiveAnnualRate(base({ rate: 6, months: 360 })), ((1 + 0.06 / 12) ** 12 - 1) * 100, 1e-6);
  near(effectiveAnnualRate(base({ rate: 0, rateAfter: 0 })), 0, 1e-6);
});

test('a teaser rate is neither of the two rates it advertises', () => {
  const effective = effectiveAnnualRate(base({ rate: 1.5, stageMonths: 24, rateAfter: 2.5 }));
  assert.ok(effective > 1.6, `${effective} should be above the teaser rate`);
  assert.ok(effective < 2.55, `${effective} should be below the later rate`);
});

test('byYear rolls the months up without losing any of them', () => {
  const schedule = buildSchedule(base());
  const years = byYear(schedule);
  assert.equal(years.length, 20);
  assert.equal(years[0].year, 1);
  near(
    years.reduce((sum, row) => sum + row.interest, 0),
    schedule.totalInterest,
    1e-6
  );
  near(
    years.reduce((sum, row) => sum + row.principal + row.extra, 0),
    1_000_000,
    1e-6
  );
  near(years[19].balance, 0, 1e-6);
  // A part year at the end is its own row, not folded into the one before.
  const short = byYear(buildSchedule(base({ months: 30 })));
  assert.equal(short.length, 3);
  assert.equal(short[2].year, 3);
  assert.deepEqual(byYear({ ...schedule, periods: [] }), []);
});

test('money and termText render the way a bank statement does', () => {
  assert.equal(money(1_234_567), '1,234,567');
  assert.equal(money(1234.567, 2), '1,234.57');
  assert.equal(money(Number.NaN), '—');
  assert.equal(termText(240, 'zh'), '20 年');
  assert.equal(termText(30, 'zh'), '2 年 6 個月');
  assert.equal(termText(6, 'zh'), '6 個月');
  assert.equal(termText(240, 'en'), '20 yr');
  assert.equal(termText(30, 'en'), '2 yr 6 mo');
  assert.equal(termText(6, 'en'), '6 mo');
});

test('the longest allowed loan still builds', () => {
  const schedule = buildSchedule(base({ months: MAX_MONTHS, principal: 20_000_000, rate: 3 }));
  assert.equal(schedule.periods.length, MAX_MONTHS);
  near(schedule.periods[MAX_MONTHS - 1].balance, 0, 1e-6);
});

test('stage months are counted from the disbursement month, grace included', () => {
  // The convention, pinned: a contract that says "1.5% for the first two years"
  // means the first 24 calendar months of the loan, not the first 24 months of
  // amortisation. A 12-month grace period therefore eats half of stage one.
  const input = base({ rate: 1.5, stageMonths: 24, rateAfter: 2.5, graceMonths: 12 });
  assert.equal(rateForMonth(input, 1), 1.5, 'month 1 is inside the grace period');
  assert.equal(rateForMonth(input, 12), 1.5);
  assert.equal(rateForMonth(input, 13), 1.5, 'amortisation starts, stage one continues');
  assert.equal(rateForMonth(input, 24), 1.5);
  assert.equal(rateForMonth(input, 25), 2.5, 'the step is at calendar month 25');

  const schedule = buildSchedule(input);
  assert.equal(schedule.periods[11].annualRate, 1.5);
  assert.equal(schedule.periods[24].annualRate, 2.5);
  // 12 grace months at 1.5% on the full principal, untouched by the step.
  for (let i = 0; i < 12; i += 1) near(schedule.periods[i].payment, 1250, 1e-9);
});

test('a prepayment next to the rate step leaves one row per month, not two', () => {
  const input = base({
    rate: 1.5,
    stageMonths: 24,
    rateAfter: 2.5,
    prepayments: [{ month: 24, amount: 200_000 }],
    prepaymentEffect: 'payment',
  });
  const schedule = buildSchedule(input);
  const months = schedule.stagePayments.map((stage) => stage.fromMonth);
  assert.deepEqual(months, [...new Set(months)], `duplicate stage rows: ${months.join(',')}`);
  assert.deepEqual(months, [1, 25]);
  // The surviving row has to be the instalment the schedule actually charges.
  const stepped = schedule.stagePayments.find((stage) => stage.fromMonth === 25)!;
  near(stepped.payment, schedule.periods[24].payment, 1e-9);
  assert.equal(stepped.annualRate, 2.5);

  // Same collision at the start of amortisation: prepaying in the last grace
  // month and re-solving for month 13 must not double the row either.
  const graced = buildSchedule(
    base({
      graceMonths: 12,
      prepayments: [{ month: 12, amount: 200_000 }],
      prepaymentEffect: 'payment',
    })
  );
  const graceMonths = graced.stagePayments.map((stage) => stage.fromMonth);
  assert.deepEqual(graceMonths, [...new Set(graceMonths)]);
  near(graced.stagePayments[0].payment, graced.periods[12].payment, 1e-9);
});

test('a prepayment inside the grace period does not announce an instalment', () => {
  // Months 7 to 12 are still interest-only, so a row saying "from month 7 the
  // instalment is 3,945" is a number that is never charged.
  const schedule = buildSchedule(
    base({
      graceMonths: 12,
      prepayments: [{ month: 6, amount: 200_000 }],
      prepaymentEffect: 'payment',
    })
  );
  for (const stage of schedule.stagePayments) {
    assert.ok(stage.fromMonth > 12, `stage row at month ${stage.fromMonth} is inside the grace period`);
    near(stage.payment, schedule.periods[stage.fromMonth - 1].payment, 1e-9);
  }
  // The lump sum still lands, and still shrinks the instalment that follows.
  near(schedule.periods[5].extra, 200_000);
  near(schedule.periods[6].payment, 1_333.3333333333333, 1e-9, '800 000 × 2% ÷ 12, interest only');
  assert.ok(schedule.periods[12].payment < buildSchedule(base({ graceMonths: 12 })).periods[12].payment);
});

test('the nominal and the effective annual rate are both reported', () => {
  // A single-stage loan must hand back the rate it was given, on the basis the
  // bank quotes it: nominal, not compounded. 2.3% nominal is 2.3245% effective,
  // and showing only the second one reads as the tool disagreeing with the bank.
  const single = base({ rate: 2.3, rateAfter: 2.3 });
  const rates = annualisedRates(single);
  near(rates.nominal, 2.3, 1e-6, 'nominal must recover the quoted rate');
  near(rates.monthly, 2.3 / 12, 1e-8);
  near(rates.effective, ((1 + 0.023 / 12) ** 12 - 1) * 100, 1e-6);
  assert.ok(rates.effective > rates.nominal, 'monthly compounding lifts it');
  near(effectiveAnnualRate(single), rates.effective, 1e-12, 'the old export still means APY');

  // Two stages: the nominal figure lands between the two quoted rates.
  const teaser = annualisedRates(base({ rate: 1.5, stageMonths: 24, rateAfter: 2.5 }));
  assert.ok(teaser.nominal > 1.5 && teaser.nominal < 2.5, `${teaser.nominal} between the stages`);

  const free = annualisedRates(base({ rate: 0, rateAfter: 0 }));
  near(free.nominal, 0, 1e-6);
  near(free.effective, 0, 1e-6);
});
