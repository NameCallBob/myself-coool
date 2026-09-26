import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BillError,
  MAX_TIERS,
  MAX_USAGE,
  PRESETS,
  computeBill,
  money,
  tierBreakdown,
  tierTotal,
  usageForBudget,
  validateTiers,
  type BillInput,
  type Tier,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance = 1e-9, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

const taipower = PRESETS.find((preset) => preset.id === 'taipower-residential')!;

const bill = (over: Partial<BillInput> = {}): BillInput => ({
  usage: 800,
  periodMonths: 2,
  summerMonths: 2,
  summerTiers: taipower.summerTiers,
  normalTiers: taipower.normalTiers,
  mode: 'progressive',
  basicCharge: 0,
  perUnitLevy: 0,
  surchargePercent: 0,
  roundTotal: false,
  ...over,
});

test('every shipped preset is a legal rate table', () => {
  for (const preset of PRESETS) {
    validateTiers(preset.summerTiers);
    validateTiers(preset.normalTiers);
    assert.ok(preset.periodMonths >= 1);
    assert.ok(preset.summerMonths <= preset.periodMonths);
    assert.ok(preset.zh.length > 0 && preset.en.length > 0);
    // A preset either states where its numbers came from or admits it has none.
    if (preset.ratesProvided) assert.match(preset.version, /\d{4}-\d{2}-\d{2}/);
  }
});

test('the water and blank presets ship no invented prices', () => {
  for (const id of ['water-general', 'blank']) {
    const preset = PRESETS.find((entry) => entry.id === id)!;
    assert.equal(preset.ratesProvided, false);
    for (const tier of [...preset.summerTiers, ...preset.normalTiers]) {
      assert.equal(tier.rate, 0, `${id} must not ship a made-up rate`);
    }
  }
});

test('validateTiers insists the table is usable', () => {
  assert.throws(() => validateTiers([]), /at least one tier/);
  assert.throws(() => validateTiers([{ upTo: 100, rate: 1 }]), /must be open-ended/);
  assert.throws(
    () => validateTiers([{ upTo: null, rate: 1 }, { upTo: 200, rate: 2 }]),
    /only the last tier/
  );
  assert.throws(
    () => validateTiers([{ upTo: 200, rate: 1 }, { upTo: 100, rate: 2 }, { upTo: null, rate: 3 }]),
    /must end above/
  );
  assert.throws(
    () => validateTiers([{ upTo: 100, rate: 1 }, { upTo: 100, rate: 2 }, { upTo: null, rate: 3 }]),
    /must end above/
  );
  assert.throws(() => validateTiers([{ upTo: null, rate: -1 }]), /no usable rate/);
  assert.throws(
    () => validateTiers(Array.from({ length: MAX_TIERS + 1 }, (_, i) => ({ upTo: i === MAX_TIERS ? null : i + 1, rate: 1 }))),
    /at most/
  );
  // The minimum legal table: one open band.
  validateTiers([{ upTo: null, rate: 3 }]);
});

test('progressive tiers price each band separately', () => {
  const tiers: Tier[] = [
    { upTo: 100, rate: 1 },
    { upTo: 200, rate: 2 },
    { upTo: null, rate: 3 },
  ];
  near(tierTotal(0, tiers), 0);
  near(tierTotal(50, tiers), 50);
  near(tierTotal(100, tiers), 100);
  near(tierTotal(150, tiers), 100 + 50 * 2);
  near(tierTotal(200, tiers), 100 + 200);
  near(tierTotal(300, tiers), 100 + 200 + 300);

  const lines = tierBreakdown(150, tiers);
  assert.equal(lines.length, 3);
  assert.deepEqual(
    lines.map((line) => line.units),
    [100, 50, 0]
  );
  assert.equal(lines[2].to, null, 'the open band reports no ceiling');
  assert.equal(lines[0].from, 0);
  assert.equal(lines[1].from, 100);
});

test('flat banding charges everything at the rate of the band it lands in', () => {
  const tiers: Tier[] = [
    { upTo: 100, rate: 1 },
    { upTo: 200, rate: 2 },
    { upTo: null, rate: 3 },
  ];
  near(tierTotal(150, tiers, 1, 'flat'), 300, 1e-9, 'the whole 150 at rate 2');
  near(tierTotal(50, tiers, 1, 'flat'), 50);
  near(tierTotal(500, tiers, 1, 'flat'), 1500);
  // The difference between the two modes is not a rounding detail.
  assert.ok(tierTotal(150, tiers, 1, 'flat') > tierTotal(150, tiers, 1, 'progressive') * 1.4);
  // Every tier is still reported, so the table renders the same shape.
  assert.equal(tierBreakdown(150, tiers, 1, 'flat').length, 3);
  assert.equal(
    tierBreakdown(150, tiers, 1, 'flat').reduce((sum, line) => sum + line.units, 0),
    150
  );
});

test('the period scale doubles the thresholds on a two-month bill', () => {
  // 400 kWh across two months is charged as 200 a month, not as 400.
  near(tierTotal(400, taipower.normalTiers, 2), 795.2, 1e-9);
  near(tierTotal(400, taipower.normalTiers, 1), 975.1, 1e-9);
  assert.ok(
    tierTotal(400, taipower.normalTiers, 2) < tierTotal(400, taipower.normalTiers, 1),
    'ignoring the period would overstate the bill'
  );
  const lines = tierBreakdown(400, taipower.normalTiers, 2);
  assert.equal(lines[0].to, 240, '120 a month becomes 240 on a two-month bill');
  assert.equal(lines[1].to, 660);
});

test('the Taipower tables reproduce hand-computed bills', () => {
  // Summer, two months, 800 kWh: 240×1.68 + 420×2.68 + 140×4.39.
  near(computeBill(bill()).usageCharge, 2143.4, 1e-9);
  near(computeBill(bill({ summerMonths: 0 })).usageCharge, 1950.2, 1e-9);
  near(computeBill(bill({ usage: 1500, summerMonths: 0 })).usageCharge, 5330.2, 1e-9);
  near(computeBill(bill({ usage: 0 })).total, 0);
});

test('a period that straddles the summer season is split', () => {
  const mixed = computeBill(bill({ periodMonths: 2, summerMonths: 1 }));
  assert.equal(mixed.sections.length, 2);
  near(mixed.sections[0].usage, 400, 1e-9, 'half the units land in summer');
  near(mixed.sections[0].amount, 1071.7, 1e-9);
  near(mixed.sections[1].amount, 975.1, 1e-9);
  near(mixed.usageCharge, 2046.8, 1e-9);
  // Each half is priced with thresholds scaled to one month, not two.
  assert.equal(mixed.sections[0].lines[0].to, 120);
  // An all-summer or all-normal period has a single section.
  assert.equal(computeBill(bill({ summerMonths: 2 })).sections.length, 1);
  assert.equal(computeBill(bill({ summerMonths: 0 })).sections.length, 1);
});

test('basic charge, per-unit levy and percentage surcharge stack in the right order', () => {
  const result = computeBill(
    bill({ usage: 100, summerMonths: 0, basicCharge: 90, perUnitLevy: 0.5, surchargePercent: 10 })
  );
  // 100 kWh over two months sits entirely in the first band: 100 × 1.68.
  near(result.usageCharge, 168, 1e-9);
  near(result.levy, 50, 1e-9);
  near(result.surcharge, 16.8, 1e-9, 'the surcharge applies to the usage charge only');
  near(result.total, 168 + 90 + 50 + 16.8, 1e-9);
  near(result.averageUnitPrice, (168 + 90 + 50 + 16.8) / 100, 1e-9);
  // A bill with no usage still charges the fixed part.
  near(computeBill(bill({ usage: 0, basicCharge: 90 })).total, 90);
});

test('the marginal rate is the highest band any unit actually reached', () => {
  near(computeBill(bill({ usage: 100, summerMonths: 0 })).marginalRate, 1.68);
  near(computeBill(bill({ usage: 400, summerMonths: 0 })).marginalRate, 2.45);
  near(computeBill(bill({ usage: 800, summerMonths: 0 })).marginalRate, 3.7);
  near(computeBill(bill({ usage: 3000, summerMonths: 0 })).marginalRate, 7.69);
  assert.equal(computeBill(bill({ usage: 0 })).marginalRate, 0);
});

test('the average unit price is below the marginal rate, which is the point of tiers', () => {
  const result = computeBill(bill({ usage: 800, summerMonths: 2 }));
  assert.ok(result.averageUnitPrice < result.marginalRate);
  assert.ok(Number.isNaN(computeBill(bill({ usage: 0 })).averageUnitPrice), 'no units, no price');
});

test('rounding the total is optional and rounds the whole bill once', () => {
  const exact = computeBill(bill({ usage: 333, summerMonths: 0, roundTotal: false }));
  const rounded = computeBill(bill({ usage: 333, summerMonths: 0, roundTotal: true }));
  assert.equal(rounded.total, Math.round(exact.total));
  assert.equal(Number.isInteger(rounded.total), true);
  // The components are untouched, so the table still adds up to the raw figure.
  near(rounded.usageCharge, exact.usageCharge, 1e-12);
});

test('bad bill inputs are refused with a reason', () => {
  assert.throws(() => computeBill(bill({ periodMonths: 0 })), /1 to 12 whole months/);
  assert.throws(() => computeBill(bill({ periodMonths: 2.5 })), /whole months/);
  assert.throws(() => computeBill(bill({ periodMonths: 13 })), /1 to 12/);
  assert.throws(() => computeBill(bill({ summerMonths: 3 })), /summer months/);
  assert.throws(() => computeBill(bill({ summerMonths: -1 })), /summer months/);
  assert.throws(() => computeBill(bill({ basicCharge: -1 })), /basic charge/);
  assert.throws(() => computeBill(bill({ perUnitLevy: -1 })), /per-unit levy/);
  assert.throws(() => computeBill(bill({ surchargePercent: -1 })), /surcharge/);
  assert.throws(() => computeBill(bill({ usage: -5 })), /zero or more/);
  assert.throws(() => computeBill(bill({ usage: MAX_USAGE + 1 })), /not supported/);
  assert.throws(() => tierBreakdown(10, taipower.normalTiers, 0), /period must be positive/);
  assert.throws(() => computeBill(bill({ normalTiers: [], summerMonths: 0 })), BillError);
});

test('usageForBudget inverts the bill', () => {
  const shape = bill({ summerMonths: 0, basicCharge: 0 });
  const allowance = usageForBudget(shape, 2000);
  assert.ok(allowance > 0);
  near(computeBill({ ...shape, usage: allowance }).total, 2000, 0.01);
  // Spending one unit more must cross the budget.
  assert.ok(computeBill({ ...shape, usage: allowance + 1 }).total > 2000);
  // A budget smaller than the fixed charge buys nothing at all.
  assert.equal(usageForBudget(bill({ basicCharge: 500 }), 100), 0);
  assert.ok(Number.isNaN(usageForBudget(shape, 0)));
  assert.ok(Number.isNaN(usageForBudget(shape, -1)));
});

test('usageForBudget stops at the supported ceiling rather than running away', () => {
  const generous = usageForBudget(bill({ summerMonths: 0 }), 1e12);
  assert.ok(generous <= MAX_USAGE);
  assert.ok(Number.isFinite(generous));
});

test('a single open band behaves like a flat tariff', () => {
  const flatTariff: Tier[] = [{ upTo: null, rate: 4 }];
  near(tierTotal(250, flatTariff), 1000);
  near(tierTotal(250, flatTariff, 2), 1000, 1e-9, 'scaling an open band changes nothing');
  const result = computeBill(
    bill({ usage: 250, summerMonths: 0, normalTiers: flatTariff, periodMonths: 1 })
  );
  near(result.usageCharge, 1000);
  near(result.averageUnitPrice, 4);
});

test('money renders whole dollars by default', () => {
  assert.equal(money(2143.4), '2,143');
  assert.equal(money(2143.4, 2), '2,143.40');
  assert.equal(money(0), '0');
  assert.equal(money(Number.NaN), '—');
});
