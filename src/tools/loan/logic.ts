/**
 * Amortisation, simulated month by month rather than solved in closed form.
 *
 * The closed-form payment formula is one line and it is in here, but it only
 * answers the question "what is the instalment" for a loan whose rate, balance
 * and term never change. Every feature people actually need breaks that
 * assumption: an interest-only grace period, the two-stage rate that almost
 * every Taiwanese mortgage carries ("first two years at X, then Y"), a lump-sum
 * prepayment, and the bank's habit of rounding the instalment up to whole
 * dollars. So the schedule is built by walking the months and the closed form is
 * re-solved whenever something changes — which is also the only way the
 * per-period table can be checked against a real statement.
 *
 * What the simulation does not do is decide anything for you. It does not know
 * your bank's day-count convention, its prepayment penalty, or whether it
 * compounds on the payment date or the anniversary. Those move the total by real
 * money, so the numbers here are an estimate to argue with, not a quote.
 */

export type Method = 'equal-payment' | 'equal-principal';
export type PrepaymentEffect = 'term' | 'payment';

export type Prepayment = {
  /** 1-based month the extra principal lands in. */
  month: number;
  amount: number;
};

export type LoanInput = {
  principal: number;
  /** Annual nominal rate, percent, for the first stage. */
  rate: number;
  /**
   * Months the first rate applies for, counted from month 1 — the disbursement
   * month — so a grace period falls inside the first stage. That is how a rate
   * card reads ("1.5% for the first two years" means the first two calendar
   * years of the loan), and it is the only reading this model can express: a
   * contract whose stage one instead starts when principal repayment begins has
   * to be entered as `stageMonths = graceMonths + 24`.
   *
   * Zero means one rate for the whole term, and `rateAfter` is then ignored.
   */
  stageMonths: number;
  /** Annual nominal rate, percent, after `stageMonths`. */
  rateAfter: number;
  /** Total term in months, including any grace period. */
  months: number;
  /** Leading months that pay interest only. */
  graceMonths: number;
  method: Method;
  prepayments: Prepayment[];
  /** Whether extra principal shortens the term or shrinks the instalment. */
  prepaymentEffect: PrepaymentEffect;
  /** Banks quote whole dollars; rounding up changes the last payment. */
  roundPayment: boolean;
};

export const MAX_MONTHS = 600;
export const MAX_PREPAYMENTS = 60;

export class LoanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoanError';
  }
}

/**
 * The textbook instalment: P·i / (1 − (1+i)^−n).
 *
 * At i = 0 the formula is 0/0, so the zero-rate case is handled separately
 * rather than left to produce NaN — an interest-free instalment is just the
 * principal split evenly, and a loan calculator that shows NaN for it looks
 * broken at the one input everybody tries first.
 */
export function monthlyPayment(principal: number, annualRatePercent: number, months: number): number {
  if (months <= 0) return Number.NaN;
  if (principal === 0) return 0;
  const i = annualRatePercent / 100 / 12;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - (1 + i) ** -months);
}

/**
 * Annual percent applying in a given 1-based month.
 *
 * Month 1 is the disbursement month, not the first month of amortisation, so a
 * grace period is spent inside the first stage. See `stageMonths`.
 */
export function rateForMonth(input: LoanInput, month: number): number {
  if (input.stageMonths > 0 && month > input.stageMonths) return input.rateAfter;
  return input.rate;
}

export type Period = {
  /** 1-based month. */
  month: number;
  /** Annual percent in force this month. */
  annualRate: number;
  /** Scheduled instalment, excluding any lump sum. */
  payment: number;
  interest: number;
  /** Scheduled principal repaid, excluding any lump sum. */
  principal: number;
  /** Extra principal paid this month. */
  extra: number;
  /** Balance after this month. */
  balance: number;
  /** True while the month pays interest only. */
  grace: boolean;
};

export type Schedule = {
  periods: Period[];
  totalInterest: number;
  totalPaid: number;
  /** Months actually needed — shorter than the term when prepaying. */
  actualMonths: number;
  firstPayment: number;
  lastPayment: number;
  /** Largest scheduled instalment, which is what the budget has to survive. */
  maxPayment: number;
  /** Instalment before and after the rate step, when there is one. */
  stagePayments: { fromMonth: number; annualRate: number; payment: number }[];
};

function validate(input: LoanInput): void {
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    throw new LoanError('principal must be a positive amount');
  }
  if (!Number.isInteger(input.months) || input.months <= 0 || input.months > MAX_MONTHS) {
    throw new LoanError(`term must be a whole number of months from 1 to ${MAX_MONTHS}`);
  }
  if (!Number.isInteger(input.graceMonths) || input.graceMonths < 0) {
    throw new LoanError('grace period must be a whole number of months');
  }
  if (input.graceMonths >= input.months) {
    throw new LoanError('grace period must be shorter than the term');
  }
  for (const rate of [input.rate, input.stageMonths > 0 ? input.rateAfter : 0]) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new LoanError('rates must be between 0 and 100 percent a year');
    }
  }
  if (!Number.isInteger(input.stageMonths) || input.stageMonths < 0) {
    throw new LoanError('the first stage must be a whole number of months');
  }
  if (input.prepayments.length > MAX_PREPAYMENTS) {
    throw new LoanError(`at most ${MAX_PREPAYMENTS} prepayments`);
  }
  for (const prepayment of input.prepayments) {
    if (!Number.isInteger(prepayment.month) || prepayment.month < 1) {
      throw new LoanError('a prepayment needs a whole month number from 1 up');
    }
    if (!Number.isFinite(prepayment.amount) || prepayment.amount < 0) {
      throw new LoanError('a prepayment cannot be negative');
    }
  }
}

/** A cent, in the smallest unit the schedule bothers to chase. */
const EPSILON = 0.005;

/**
 * Builds the full schedule.
 *
 * The instalment is re-solved at three moments: when amortisation begins (after
 * the grace period), when the rate steps, and — if prepayments are set to
 * shrink the instalment rather than the term — after each lump sum. Everything
 * else is bookkeeping: interest on the opening balance, principal as the
 * remainder, balance down by the difference.
 */
export function buildSchedule(input: LoanInput): Schedule {
  validate(input);

  const extras = new Map<number, number>();
  for (const prepayment of input.prepayments) {
    if (prepayment.amount > 0) {
      extras.set(prepayment.month, (extras.get(prepayment.month) ?? 0) + prepayment.amount);
    }
  }

  const periods: Period[] = [];
  const stagePayments: Schedule['stagePayments'] = [];
  let balance = input.principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let payment = Number.NaN;
  let fixedPrincipal = Number.NaN;
  let previousRate = Number.NaN;

  const round = (value: number) => (input.roundPayment ? Math.ceil(value) : value);

  /**
   * Records the instalment that applies from a month, one row per month.
   *
   * Two of the three re-solve moments can land on the same month — a lump sum in
   * month 24 re-solves for month 25, and the rate step re-solves for month 25 as
   * well — and the table of "where the instalment changes" then showed month 25
   * twice. The later write is the authoritative one: it is the figure the loop
   * goes on to charge.
   */
  const pushStage = (fromMonth: number, annualRate: number, value: number) => {
    const existing = stagePayments.findIndex((stage) => stage.fromMonth === fromMonth);
    const row = { fromMonth, annualRate, payment: value };
    if (existing >= 0) stagePayments[existing] = row;
    else stagePayments.push(row);
  };

  for (let month = 1; month <= input.months; month += 1) {
    if (balance <= EPSILON) break;

    const annualRate = rateForMonth(input, month);
    const i = annualRate / 100 / 12;
    const interest = balance * i;
    const grace = month <= input.graceMonths;
    const remaining = input.months - month + 1;

    let scheduledPrincipal = 0;
    let scheduledPayment = interest;

    if (!grace) {
      const startingAmortisation = month === input.graceMonths + 1;
      const rateChanged = annualRate !== previousRate;

      if (input.method === 'equal-payment') {
        if (startingAmortisation || rateChanged || Number.isNaN(payment)) {
          payment = round(monthlyPayment(balance, annualRate, remaining));
          pushStage(month, annualRate, payment);
        }
        scheduledPayment = Math.min(payment, balance + interest);
        scheduledPrincipal = scheduledPayment - interest;
      } else {
        if (startingAmortisation || Number.isNaN(fixedPrincipal)) {
          fixedPrincipal = balance / remaining;
          pushStage(month, annualRate, fixedPrincipal + interest);
        } else if (rateChanged) {
          pushStage(month, annualRate, fixedPrincipal + interest);
        }
        scheduledPrincipal = Math.min(fixedPrincipal, balance);
        scheduledPayment = scheduledPrincipal + interest;
      }

      // Defensive: the closed form can never return an instalment below the
      // interest, and rounding only ever rounds it up — but a negative
      // principal payment would mean a growing balance, and that is a wrong
      // answer worth failing loudly on rather than printing.
      if (scheduledPrincipal < -EPSILON) {
        throw new LoanError('the instalment does not cover the interest at this rate');
      }
    }

    let extra = extras.get(month) ?? 0;
    const afterScheduled = balance - scheduledPrincipal;
    if (extra > afterScheduled) extra = Math.max(0, afterScheduled);

    balance = afterScheduled - extra;
    if (balance < EPSILON) balance = 0;

    totalInterest += interest;
    totalPaid += scheduledPayment + extra;

    periods.push({
      month,
      annualRate,
      payment: scheduledPayment,
      interest,
      principal: scheduledPrincipal,
      extra,
      balance,
      grace,
    });

    previousRate = annualRate;

    // A lump sum leaves the schedule over-funded. Either the term shortens
    // (nothing to do — the loop exits early when the balance reaches zero) or
    // the instalment is re-solved over the months that remain.
    //
    // Not while the grace period is still running, though: those months pay
    // interest only, and the instalment is solved from scratch when amortisation
    // starts. Re-solving here changed no figure the loop went on to use, but it
    // did publish an instalment for a month that never charges one.
    if (extra > 0 && !grace && input.prepaymentEffect === 'payment' && balance > EPSILON) {
      const monthsLeft = input.months - month;
      if (monthsLeft > 0) {
        const nextRate = rateForMonth(input, month + 1);
        if (input.method === 'equal-payment') {
          payment = round(monthlyPayment(balance, nextRate, monthsLeft));
          pushStage(month + 1, nextRate, payment);
        } else {
          fixedPrincipal = balance / monthsLeft;
        }
      }
    }
  }

  const scheduled = periods.filter((period) => !period.grace);
  return {
    periods,
    totalInterest,
    totalPaid,
    actualMonths: periods.length,
    firstPayment: periods.length > 0 ? periods[0].payment : Number.NaN,
    lastPayment: periods.length > 0 ? periods[periods.length - 1].payment : Number.NaN,
    maxPayment: scheduled.reduce((max, period) => Math.max(max, period.payment), 0),
    stagePayments,
  };
}

/** What the prepayments were worth, against the same loan without them. */
export function prepaymentSaving(input: LoanInput): {
  interestWith: number;
  interestWithout: number;
  saved: number;
  monthsSaved: number;
} {
  const withPrepayments = buildSchedule(input);
  const without = buildSchedule({ ...input, prepayments: [] });
  return {
    interestWith: withPrepayments.totalInterest,
    interestWithout: without.totalInterest,
    saved: without.totalInterest - withPrepayments.totalInterest,
    monthsSaved: without.actualMonths - withPrepayments.actualMonths,
  };
}

/**
 * The monthly internal rate of return of the actual cash flows, found by
 * bisection, annualised two ways.
 *
 * Both numbers are here because they answer different questions and the gap
 * between them looks like a bug when only one is shown. `nominal` is the monthly
 * IRR times twelve, which is the basis every bank quotes on: a single-stage loan
 * at 2.3% hands 2.3% back, which also makes this function self-checking.
 * `effective` compounds the same monthly rate twelve times — 2.3% nominal is
 * 2.3245% effective — and is the honest comparison once one offer has a teaser
 * rate, because a loan at "1.5% for two years then 2.3%" is neither a 1.5% loan
 * nor a 2.3% one.
 */
export function annualisedRates(input: LoanInput): {
  /** Monthly IRR, in percent. */
  monthly: number;
  /** monthly × 12: the basis a rate card is quoted on. */
  nominal: number;
  /** (1 + monthly)^12 − 1: what a year of monthly compounding costs. */
  effective: number;
} {
  const schedule = buildSchedule(input);
  if (schedule.periods.length === 0) {
    return { monthly: Number.NaN, nominal: Number.NaN, effective: Number.NaN };
  }

  const flows = schedule.periods.map((period) => period.payment + period.extra);

  const presentValue = (monthlyRate: number): number => {
    let sum = 0;
    for (let k = 0; k < flows.length; k += 1) {
      sum += flows[k] / (1 + monthlyRate) ** (k + 1);
    }
    return sum - input.principal;
  };

  // The rate is somewhere between 0 and 100% a month; 200 bisections is far
  // more than double precision can use, and it always terminates.
  let low = 0;
  let high = 1;
  let monthly = 0;
  if (presentValue(low) >= 0) {
    for (let step = 0; step < 200; step += 1) {
      const middle = (low + high) / 2;
      if (presentValue(middle) > 0) low = middle;
      else high = middle;
    }
    monthly = (low + high) / 2;
  }

  return {
    monthly: monthly * 100,
    nominal: monthly * 12 * 100,
    effective: ((1 + monthly) ** 12 - 1) * 100,
  };
}

/** Effective annual rate: the monthly IRR compounded over twelve months. */
export function effectiveAnnualRate(input: LoanInput): number {
  return annualisedRates(input).effective;
}

/** Yearly roll-up of the schedule, for a table that fits on a screen. */
export type YearRow = {
  year: number;
  interest: number;
  principal: number;
  extra: number;
  /** Balance at the end of the year. */
  balance: number;
};

export function byYear(schedule: Schedule): YearRow[] {
  const rows: YearRow[] = [];
  for (const period of schedule.periods) {
    const year = Math.ceil(period.month / 12);
    let row = rows[rows.length - 1];
    if (!row || row.year !== year) {
      row = { year, interest: 0, principal: 0, extra: 0, balance: period.balance };
      rows.push(row);
    }
    row.interest += period.interest;
    row.principal += period.principal;
    row.extra += period.extra;
    row.balance = period.balance;
  }
  return rows;
}

/** Money, to whole units by default — cents on a mortgage are noise. */
export function money(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** `240` reads as "20 年 0 個月" — the way a term is actually quoted. */
export function termText(months: number, l: 'zh' | 'en'): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (l === 'en') {
    if (years === 0) return `${rest} mo`;
    return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
  }
  if (years === 0) return `${rest} 個月`;
  return rest === 0 ? `${years} 年` : `${years} 年 ${rest} 個月`;
}
