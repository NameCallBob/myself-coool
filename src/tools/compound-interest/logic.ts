/**
 * Compound growth for a lump sum and for regular contributions.
 *
 * Two things in here exist because leaving them out is how this kind of
 * calculator misleads.
 *
 * The first is the fee. An annual expense ratio of 1% sounds like it takes 1%
 * of the return; over thirty years it takes roughly a quarter of the final
 * balance, because it is charged on the whole pot every year including the part
 * that would have compounded. A projection without a fee field is a projection
 * of a product that does not exist.
 *
 * The second is inflation. A number thirty years out is denominated in money
 * that will buy noticeably less, and the only honest way to read it is beside
 * the same figure deflated to today's purchasing power. Both are always shown.
 *
 * Everything is simulated period by period rather than closed-form, because a
 * contribution that grows with salary has no clean closed form — and because
 * the per-year table is the part a reader can actually check.
 */

export const MAX_YEARS = 100;
export const MAX_PERIODS = 100 * 12;

export type Timing = 'begin' | 'end';

export type Plan = {
  /** Starting balance. May be zero. */
  initial: number;
  /** Amount added each contribution period. */
  contribution: number;
  /** Contribution periods per year: 12, 4, 2 or 1. Also the simulation step. */
  contributionsPerYear: number;
  /** Annual percentage increase applied to the contribution each year. */
  contributionGrowth: number;
  /** Nominal annual return, percent. */
  annualRate: number;
  /** Compounding periods per year the rate is quoted against. */
  compoundsPerYear: number;
  /** Annual fee on assets, percent. Subtracted from the effective rate. */
  feePercent: number;
  /** Annual inflation, percent, used only for the real-terms column. */
  inflationPercent: number;
  years: number;
  timing: Timing;
};

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

/**
 * Effective annual rate from a nominal rate and its compounding frequency.
 *
 * 12% "compounded monthly" is 12.6825% a year. Quoting the nominal figure and
 * compounding at a different frequency than it was quoted for is a silent error
 * of about that size, which is why the frequency is an input rather than an
 * assumption.
 */
export function effectiveAnnual(nominalPercent: number, compoundsPerYear: number): number {
  if (compoundsPerYear <= 0) return Number.NaN;
  const nominal = nominalPercent / 100;
  return (1 + nominal / compoundsPerYear) ** compoundsPerYear - 1;
}

/**
 * Net of fees. The fee is subtracted from the effective rate, which is the
 * convention fund factsheets use; it slightly understates the drag compared to
 * charging it on the average balance monthly, and that difference is far smaller
 * than the difference between modelling the fee and ignoring it.
 */
export function netAnnual(effectiveRate: number, feePercent: number): number {
  return effectiveRate - feePercent / 100;
}

/** Fisher: (1+nominal)/(1+inflation) − 1, not nominal − inflation. */
export function realRate(nominalRate: number, inflationRate: number): number {
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

export type PeriodRow = {
  period: number;
  /** 1-based year this period falls in. */
  year: number;
  /** Paid in this period. */
  contribution: number;
  /** Growth credited this period. */
  growth: number;
  /** Balance at the end of the period. */
  balance: number;
  /** Cumulative amount paid in, including the initial balance. */
  contributedToDate: number;
  /** Balance in today's money. */
  realBalance: number;
};

export type YearRow = {
  year: number;
  contribution: number;
  growth: number;
  balance: number;
  contributedToDate: number;
  realBalance: number;
};

export type Projection = {
  periods: PeriodRow[];
  yearly: YearRow[];
  /** Final nominal balance. */
  finalBalance: number;
  /** Final balance deflated to today's money. */
  finalRealBalance: number;
  totalContributed: number;
  totalGrowth: number;
  effectiveAnnualRate: number;
  netAnnualRate: number;
  realAnnualRate: number;
  /**
   * First year in which the growth credited that year exceeds the amount paid
   * in that year — the point the pot starts doing more work than the saver.
   * Null when it never happens inside the term.
   */
  crossoverYear: number | null;
  /** What the same plan would reach with no fee, for comparison. */
  feeCost: number;
};

function validate(plan: Plan): void {
  if (!Number.isFinite(plan.initial) || plan.initial < 0) {
    throw new PlanError('the starting balance cannot be negative');
  }
  if (!Number.isFinite(plan.contribution) || plan.contribution < 0) {
    throw new PlanError('the contribution cannot be negative');
  }
  if (![1, 2, 4, 12].includes(plan.contributionsPerYear)) {
    throw new PlanError('contributions must be yearly, half-yearly, quarterly or monthly');
  }
  if (!Number.isFinite(plan.compoundsPerYear) || plan.compoundsPerYear < 1) {
    throw new PlanError('compounding must happen at least once a year');
  }
  if (!Number.isInteger(plan.years) || plan.years < 1 || plan.years > MAX_YEARS) {
    throw new PlanError(`the term must be a whole number of years from 1 to ${MAX_YEARS}`);
  }
  for (const [value, label] of [
    [plan.annualRate, 'return'],
    [plan.feePercent, 'fee'],
    [plan.inflationPercent, 'inflation'],
    [plan.contributionGrowth, 'contribution growth'],
  ] as [number, string][]) {
    if (!Number.isFinite(value)) throw new PlanError(`the ${label} must be a number`);
  }
  if (plan.feePercent < 0) throw new PlanError('the fee cannot be negative');
  if (plan.initial === 0 && plan.contribution === 0) {
    throw new PlanError('nothing is being invested');
  }
}

/**
 * Runs the plan.
 *
 * Contributions at the beginning of a period earn that period's growth;
 * contributions at the end do not. Over thirty monthly years the difference is
 * about half a percent of the final balance — small, and exactly the sort of
 * small that makes two calculators disagree for no visible reason, so it is a
 * stated input rather than a hidden choice.
 */
export function project(plan: Plan): Projection {
  validate(plan);

  const effective = effectiveAnnual(plan.annualRate, plan.compoundsPerYear);
  const net = netAnnual(effective, plan.feePercent);
  const perYear = plan.contributionsPerYear;
  const totalPeriods = plan.years * perYear;
  if (totalPeriods > MAX_PERIODS) throw new PlanError('too many periods');

  // A net rate can legitimately be negative (a high fee, or a negative return);
  // 1 + net must still be positive or the compounding has no meaning.
  if (1 + net <= 0) throw new PlanError('the net return wipes out the balance every year');

  const growthFactor = (1 + net) ** (1 / perYear);
  const inflationFactor = 1 + plan.inflationPercent / 100;

  const periods: PeriodRow[] = [];
  let balance = plan.initial;
  let contributed = plan.initial;

  for (let period = 1; period <= totalPeriods; period += 1) {
    const year = Math.ceil(period / perYear);
    const contribution =
      plan.contribution * (1 + plan.contributionGrowth / 100) ** (year - 1);

    const opening = balance;
    let growth: number;
    if (plan.timing === 'begin') {
      growth = (opening + contribution) * (growthFactor - 1);
      balance = (opening + contribution) * growthFactor;
    } else {
      growth = opening * (growthFactor - 1);
      balance = opening * growthFactor + contribution;
    }
    contributed += contribution;

    const elapsedYears = period / perYear;
    periods.push({
      period,
      year,
      contribution,
      growth,
      balance,
      contributedToDate: contributed,
      realBalance: balance / inflationFactor ** elapsedYears,
    });
  }

  const yearly: YearRow[] = [];
  for (const row of periods) {
    let year = yearly[yearly.length - 1];
    if (!year || year.year !== row.year) {
      year = {
        year: row.year,
        contribution: 0,
        growth: 0,
        balance: row.balance,
        contributedToDate: row.contributedToDate,
        realBalance: row.realBalance,
      };
      yearly.push(year);
    }
    year.contribution += row.contribution;
    year.growth += row.growth;
    year.balance = row.balance;
    year.contributedToDate = row.contributedToDate;
    year.realBalance = row.realBalance;
  }

  const crossover = yearly.find((year) => year.growth > year.contribution && year.contribution > 0);
  const finalBalance = periods.length > 0 ? periods[periods.length - 1].balance : plan.initial;

  const withoutFee =
    plan.feePercent === 0
      ? finalBalance
      : project({ ...plan, feePercent: 0 }).finalBalance;

  return {
    periods,
    yearly,
    finalBalance,
    finalRealBalance: finalBalance / inflationFactor ** plan.years,
    totalContributed: contributed,
    totalGrowth: finalBalance - contributed,
    effectiveAnnualRate: effective,
    netAnnualRate: net,
    realAnnualRate: realRate(net, plan.inflationPercent / 100),
    crossoverYear: crossover ? crossover.year : null,
    feeCost: withoutFee - finalBalance,
  };
}

/**
 * Final balance only, without building the per-period table.
 *
 * The bisection below calls this a hundred times; allocating a thousand rows on
 * each call would turn a search into a visible pause for no benefit, since only
 * the last number is read.
 */
function finalBalanceOnly(plan: Plan): number {
  const net = netAnnual(effectiveAnnual(plan.annualRate, plan.compoundsPerYear), plan.feePercent);
  if (1 + net <= 0) return Number.NaN;
  const perYear = plan.contributionsPerYear;
  const growthFactor = (1 + net) ** (1 / perYear);
  let balance = plan.initial;
  for (let period = 1; period <= plan.years * perYear; period += 1) {
    const year = Math.ceil(period / perYear);
    const contribution = plan.contribution * (1 + plan.contributionGrowth / 100) ** (year - 1);
    balance =
      plan.timing === 'begin'
        ? (balance + contribution) * growthFactor
        : balance * growthFactor + contribution;
  }
  return balance;
}

/**
 * The contribution needed to reach a target, found by bisection.
 *
 * Bisection rather than algebra because the contribution can grow with salary
 * each year, and the closed form for a growing annuity under a separate
 * compounding frequency is both long and easy to get subtly wrong. The final
 * balance is monotonic in the contribution, which is all bisection needs.
 */
export function requiredContribution(plan: Plan, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return Number.NaN;
  validate({ ...plan, contribution: 1 });
  if (finalBalanceOnly({ ...plan, contribution: 0 }) >= target) return 0;

  let low = 0;
  let high = Math.max(target / (plan.years * plan.contributionsPerYear), 1);
  // Grow the bracket until it covers the target; the balance rises with the
  // contribution, so doubling always terminates.
  for (let step = 0; step < 80; step += 1) {
    if (finalBalanceOnly({ ...plan, contribution: high }) >= target) break;
    high *= 2;
    if (!Number.isFinite(high)) return Number.NaN;
  }

  for (let step = 0; step < 80; step += 1) {
    const middle = (low + high) / 2;
    if (finalBalanceOnly({ ...plan, contribution: middle }) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Whole years until the balance first reaches a target, or null inside MAX_YEARS. */
export function yearsToTarget(plan: Plan, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  const long = project({ ...plan, years: MAX_YEARS });
  const hit = long.yearly.find((year) => year.balance >= target);
  return hit ? hit.year : null;
}

/** Money for display. Whole units — cents on a thirty-year projection are noise. */
export function money(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function percent(rate: number, digits = 3): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}
