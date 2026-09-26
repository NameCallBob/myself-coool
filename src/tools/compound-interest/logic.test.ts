import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_YEARS,
  PlanError,
  effectiveAnnual,
  money,
  netAnnual,
  percent,
  project,
  realRate,
  requiredContribution,
  yearsToTarget,
  type Plan,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance = 1e-6, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

const plan = (over: Partial<Plan> = {}): Plan => ({
  initial: 0,
  contribution: 0,
  contributionsPerYear: 12,
  contributionGrowth: 0,
  annualRate: 6,
  compoundsPerYear: 12,
  feePercent: 0,
  inflationPercent: 0,
  years: 10,
  timing: 'end',
  ...over,
});

test('effectiveAnnual converts a nominal quote to what it actually earns', () => {
  near(effectiveAnnual(12, 12), 0.12682503013196977, 1e-12, '12% compounded monthly');
  near(effectiveAnnual(12, 1), 0.12, 1e-15, 'annual compounding is the quote itself');
  near(effectiveAnnual(12, 4), (1.03) ** 4 - 1, 1e-15);
  near(effectiveAnnual(0, 12), 0);
  near(effectiveAnnual(-6, 12), (1 - 0.005) ** 12 - 1, 1e-15, 'a negative return still compounds');
  assert.ok(Number.isNaN(effectiveAnnual(5, 0)));
});

test('netAnnual and realRate use the right arithmetic', () => {
  near(netAnnual(0.07, 1), 0.06);
  near(netAnnual(0.07, 0), 0.07);
  // Fisher, not subtraction: 7% nominal against 2% inflation is 4.902%, not 5%.
  near(realRate(0.07, 0.02), 0.0490196078431373, 1e-12);
  near(realRate(0.02, 0.02), 0);
  assert.ok(realRate(0.07, 0.02) < 0.05, 'subtracting inflation overstates the real return');
});

test('a lump sum with annual compounding matches the textbook formula', () => {
  const result = project(
    plan({ initial: 1000, annualRate: 5, compoundsPerYear: 1, contributionsPerYear: 1, years: 10 })
  );
  near(result.finalBalance, 1628.894626777442, 1e-9, '1000 × 1.05^10');
  near(result.totalContributed, 1000);
  near(result.totalGrowth, 628.894626777442, 1e-9);
  assert.equal(result.periods.length, 10);
  near(result.periods[0].balance, 1050, 1e-12);
});

test('monthly compounding on a lump sum matches the effective rate', () => {
  const result = project(plan({ initial: 1000, annualRate: 12, years: 1, contributionsPerYear: 12 }));
  near(result.finalBalance, 1126.8250301319697, 1e-9);
  near(result.effectiveAnnualRate, 0.12682503013196977, 1e-12);
});

test('an ordinary annuity matches the published future-value factor', () => {
  // 100 a month for 120 months at 6% nominal compounded monthly, paid at period end.
  const result = project(plan({ contribution: 100, annualRate: 6, years: 10, timing: 'end' }));
  near(result.finalBalance, 16387.9346806458, 1e-6);
  near(result.totalContributed, 12000);
  near(result.totalGrowth, 4387.9346806458, 1e-6);
});

test('paying at the start of the period earns one extra period of growth', () => {
  const begin = project(plan({ contribution: 100, annualRate: 6, years: 10, timing: 'begin' }));
  near(begin.finalBalance, 16469.87435404903, 1e-6, 'the annuity-due factor');
  const end = project(plan({ contribution: 100, annualRate: 6, years: 10, timing: 'end' }));
  near(begin.finalBalance / end.finalBalance, 1.005, 1e-9);
});

test('a lump sum and a stream add up independently', () => {
  const both = project(plan({ initial: 1_000_000, contribution: 10_000, annualRate: 6, years: 30 }));
  near(both.finalBalance, 16_067_725.636788959, 1e-3);
  const lump = project(plan({ initial: 1_000_000, annualRate: 6, years: 30 }));
  const stream = project(plan({ contribution: 10_000, annualRate: 6, years: 30 }));
  near(both.finalBalance, lump.finalBalance + stream.finalBalance, 1e-6);
});

test('zero return means you get back exactly what you put in', () => {
  const result = project(plan({ initial: 1000, contribution: 100, annualRate: 0, years: 10 }));
  near(result.finalBalance, 1000 + 100 * 120);
  near(result.totalGrowth, 0, 1e-9);
  near(result.effectiveAnnualRate, 0);
});

test('inflation is reported beside the nominal figure, never instead of it', () => {
  const result = project(
    plan({ initial: 1_000_000, annualRate: 6, years: 30, inflationPercent: 2 })
  );
  near(result.finalBalance, 6_022_575.211, 1e-2);
  near(result.finalRealBalance, 3_324_888.4513824065, 1e-3, 'deflated by 1.02^30');
  assert.ok(result.finalRealBalance < result.finalBalance * 0.6);
  near(result.realAnnualRate, realRate(result.netAnnualRate, 0.02), 1e-12);
  // With no inflation the two columns agree exactly.
  const flat = project(plan({ initial: 1000, years: 10 }));
  near(flat.finalRealBalance, flat.finalBalance, 1e-9);
});

test('a 1% fee costs far more than 1% over a long horizon', () => {
  const withFee = project(plan({ initial: 1_000_000, annualRate: 7, years: 30, feePercent: 1 }));
  const without = project(plan({ initial: 1_000_000, annualRate: 7, years: 30, feePercent: 0 }));
  near(withFee.feeCost, without.finalBalance - withFee.finalBalance, 1e-6);
  const share = withFee.feeCost / without.finalBalance;
  assert.ok(share > 0.2, `a 1% fee took only ${(share * 100).toFixed(1)}% — too little`);
  assert.ok(share < 0.35);
  near(withFee.netAnnualRate, without.effectiveAnnualRate - 0.01, 1e-12);
  // With no fee the reported cost is exactly zero, not a rounding crumb.
  assert.equal(without.feeCost, 0);
});

test('contributions that grow each year are compounded, not averaged', () => {
  const flat = project(plan({ contribution: 10_000, years: 20, annualRate: 5 }));
  const growing = project(
    plan({ contribution: 10_000, years: 20, annualRate: 5, contributionGrowth: 3 })
  );
  assert.ok(growing.totalContributed > flat.totalContributed);
  // Year 2 pays 3% more than year 1, every period.
  near(growing.periods[12].contribution, 10_300, 1e-9);
  near(growing.periods[24].contribution, 10_000 * 1.03 ** 2, 1e-9);
  near(growing.periods[0].contribution, 10_000);
});

test('the yearly roll-up reconciles with the periods it came from', () => {
  const result = project(plan({ initial: 5000, contribution: 500, years: 10, annualRate: 6 }));
  assert.equal(result.yearly.length, 10);
  near(
    result.yearly.reduce((sum, year) => sum + year.contribution, 0),
    result.totalContributed - 5000,
    1e-6
  );
  near(
    result.yearly.reduce((sum, year) => sum + year.growth, 0),
    result.totalGrowth,
    1e-6
  );
  near(result.yearly[9].balance, result.finalBalance, 1e-9);
  assert.equal(result.yearly[0].year, 1);
});

test('the crossover year is where growth first beats contributions', () => {
  const result = project(plan({ contribution: 10_000, annualRate: 7, years: 40 }));
  assert.ok(result.crossoverYear !== null);
  const year = result.yearly[(result.crossoverYear as number) - 1];
  assert.ok(year.growth > year.contribution);
  const before = result.yearly[(result.crossoverYear as number) - 2];
  assert.ok(before.growth <= before.contribution, 'it must be the first such year');
  // With no return it never happens, and the field says so rather than 0.
  assert.equal(project(plan({ contribution: 100, annualRate: 0, years: 40 })).crossoverYear, null);
  // With no contributions there is nothing to cross.
  assert.equal(project(plan({ initial: 1000, annualRate: 7, years: 40 })).crossoverYear, null);
});

test('contribution frequency changes the answer and is validated', () => {
  const monthly = project(plan({ contribution: 1000, contributionsPerYear: 12, years: 10 }));
  const yearly = project(plan({ contribution: 12_000, contributionsPerYear: 1, years: 10 }));
  assert.ok(monthly.finalBalance > yearly.finalBalance, 'paying earlier earns more');
  near(monthly.totalContributed, yearly.totalContributed, 1e-9);
  assert.throws(() => project(plan({ contributionsPerYear: 6, contribution: 1 })), /yearly, half-yearly/);
  assert.throws(() => project(plan({ contributionsPerYear: 365, contribution: 1 })), PlanError);
});

test('bad plans are refused with a reason', () => {
  assert.throws(() => project(plan({ initial: -1 })), /cannot be negative/);
  assert.throws(() => project(plan({ initial: 100, contribution: -5 })), /cannot be negative/);
  assert.throws(() => project(plan({ initial: 0, contribution: 0 })), /nothing is being invested/);
  assert.throws(() => project(plan({ initial: 100, years: 0 })), /whole number of years/);
  assert.throws(() => project(plan({ initial: 100, years: 10.5 })), /whole number of years/);
  assert.throws(() => project(plan({ initial: 100, years: MAX_YEARS + 1 })), /whole number of years/);
  assert.throws(() => project(plan({ initial: 100, feePercent: -1 })), /fee cannot be negative/);
  assert.throws(() => project(plan({ initial: 100, compoundsPerYear: 0 })), /at least once a year/);
  assert.throws(() => project(plan({ initial: 100, annualRate: Number.NaN })), /must be a number/);
  // A fee that exceeds the return is a real (bad) product, not an error.
  const eaten = project(plan({ initial: 1000, annualRate: 2, feePercent: 3, years: 10 }));
  assert.ok(eaten.finalBalance < 1000, 'the balance must be allowed to shrink');
  // A fee that erases more than the whole balance every year is not modellable.
  assert.throws(() => project(plan({ initial: 1000, annualRate: 0, feePercent: 150 })), /wipes out/);
});

test('requiredContribution inverts the projection', () => {
  const target = 10_000_000;
  const shape = plan({ initial: 1_000_000, annualRate: 6, years: 20 });
  const needed = requiredContribution(shape, target);
  assert.ok(needed > 0);
  near(project({ ...shape, contribution: needed }).finalBalance, target, 1);

  // With a growing contribution the answer is smaller, because later years pay more.
  const growing = requiredContribution({ ...shape, contributionGrowth: 3 }, target);
  assert.ok(growing < needed);
  near(project({ ...shape, contributionGrowth: 3, contribution: growing }).finalBalance, target, 1);

  // Already there without paying anything.
  assert.equal(requiredContribution(plan({ initial: 20_000_000, years: 20 }), 1_000_000), 0);
  assert.ok(Number.isNaN(requiredContribution(shape, 0)));
  assert.ok(Number.isNaN(requiredContribution(shape, -5)));
});

test('yearsToTarget finds the first year the balance is enough', () => {
  const shape = plan({ initial: 1_000_000, contribution: 10_000, annualRate: 6, years: 10 });
  const years = yearsToTarget(shape, 3_000_000);
  assert.ok(years !== null && years > 0);
  const reached = project({ ...shape, years: years as number });
  assert.ok(reached.finalBalance >= 3_000_000);
  const beforeYear = (years as number) - 1;
  if (beforeYear >= 1) {
    assert.ok(project({ ...shape, years: beforeYear }).finalBalance < 3_000_000);
  }
  // Out of reach inside a century.
  assert.equal(yearsToTarget(plan({ initial: 1000, annualRate: 0, contribution: 0 }), 1e12), null);
  assert.equal(yearsToTarget(shape, 0), null);
});

test('money and percent render for a projection, not for an accountant', () => {
  assert.equal(money(1_234_567.89), '1,234,568');
  assert.equal(money(1234.5, 2), '1,234.50');
  assert.equal(money(Number.NaN), '—');
  assert.equal(percent(0.0490196078431373), '4.902%');
  assert.equal(percent(0.06, 1), '6.0%');
  assert.equal(percent(Number.NaN), '—');
});

test('the longest plan still runs and the periods are consistent', () => {
  const result = project(
    plan({ initial: 1000, contribution: 1000, years: MAX_YEARS, annualRate: 5, inflationPercent: 2 })
  );
  assert.equal(result.periods.length, MAX_YEARS * 12);
  assert.equal(result.yearly.length, MAX_YEARS);
  assert.ok(Number.isFinite(result.finalBalance));
  assert.ok(result.finalRealBalance < result.finalBalance);
  // Balances only ever move one way with a positive return and contributions.
  for (let i = 1; i < result.periods.length; i += 1) {
    assert.ok(result.periods[i].balance > result.periods[i - 1].balance, `month ${i}`);
  }
});
