/**
 * Progressive tier billing, for electricity and water.
 *
 * The arithmetic is not the hard part. Three details are, and all three are
 * places where a plausible-looking calculator gets the bill wrong:
 *
 * 1. The tiers are quoted *per month*, but Taipower reads the meter every two
 *    months. On a two-month bill every threshold doubles, so 400 kWh over two
 *    months is charged at the 200-per-month tiers, not at the 400 tier. Getting
 *    this backwards overstates a normal household bill by a lot.
 * 2. A billing period can straddle the summer season (June–September has its own
 *    rate table). Taipower splits the period by days and charges each part at its
 *    own table with thresholds scaled to that part's length. This models the same
 *    split by month count, which is the same answer when the period aligns with
 *    month boundaries and close to it when it does not.
 * 3. Progressive is not the same as banded-flat. Under progressive tiers only the
 *    units above a threshold pay the higher rate; some fee schedules instead
 *    charge every unit at the rate of the band the total lands in. Both are
 *    implemented, because using the wrong one is a silent error of tens of
 *    percent.
 *
 * Rates are shipped as editable defaults with a version date, never as truth.
 * They change by announcement — usually in April and October — and the bill in
 * your hand is authoritative over anything hard-coded here.
 */

export type Tier = {
  /** Upper bound of this tier in units per month. `null` means no upper bound. */
  upTo: number | null;
  /** Price per unit inside this tier. */
  rate: number;
};

export type TierMode = 'progressive' | 'flat';

export class BillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillError';
  }
}

export const MAX_TIERS = 12;
export const MAX_USAGE = 1_000_000;

/** Tiers must climb, end in an open band, and price nothing negatively. */
export function validateTiers(tiers: readonly Tier[]): void {
  if (tiers.length === 0) throw new BillError('a rate table needs at least one tier');
  if (tiers.length > MAX_TIERS) throw new BillError(`at most ${MAX_TIERS} tiers`);
  let previous = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i];
    if (!Number.isFinite(tier.rate) || tier.rate < 0) {
      throw new BillError(`tier ${i + 1} has no usable rate`);
    }
    if (tier.upTo === null) {
      if (i !== tiers.length - 1) throw new BillError('only the last tier may be open-ended');
      continue;
    }
    if (!Number.isFinite(tier.upTo) || tier.upTo <= previous) {
      throw new BillError(`tier ${i + 1} must end above tier ${i}`);
    }
    previous = tier.upTo;
  }
  if (tiers[tiers.length - 1].upTo !== null) {
    throw new BillError('the last tier must be open-ended so every amount is priced');
  }
}

export type TierLine = {
  index: number;
  /** Tier bounds after scaling to the billing period, in units. */
  from: number;
  to: number | null;
  rate: number;
  units: number;
  amount: number;
};

/**
 * Splits a quantity across tiers.
 *
 * `scale` multiplies every threshold — it is the number of months the bill
 * covers. `mode` picks progressive (each band priced separately) or flat (the
 * whole quantity at the rate of the band it lands in).
 */
export function tierBreakdown(
  quantity: number,
  tiers: readonly Tier[],
  scale = 1,
  mode: TierMode = 'progressive'
): TierLine[] {
  validateTiers(tiers);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new BillError('usage must be zero or more');
  }
  if (quantity > MAX_USAGE) throw new BillError(`usage above ${MAX_USAGE} is not supported`);
  if (!Number.isFinite(scale) || scale <= 0) throw new BillError('the period must be positive');

  const lines: TierLine[] = [];
  let floor = 0;

  if (mode === 'flat') {
    for (let i = 0; i < tiers.length; i += 1) {
      const ceiling = tiers[i].upTo === null ? null : (tiers[i].upTo as number) * scale;
      const inside = ceiling === null || quantity <= ceiling;
      lines.push({
        index: i,
        from: floor,
        to: ceiling,
        rate: tiers[i].rate,
        units: inside ? quantity : 0,
        amount: inside ? quantity * tiers[i].rate : 0,
      });
      if (inside) {
        // Everything above the matched band contributes nothing.
        for (let j = i + 1; j < tiers.length; j += 1) {
          const upper = tiers[j].upTo === null ? null : (tiers[j].upTo as number) * scale;
          lines.push({
            index: j,
            from: ceiling ?? 0,
            to: upper,
            rate: tiers[j].rate,
            units: 0,
            amount: 0,
          });
        }
        return lines;
      }
      floor = ceiling as number;
    }
    return lines;
  }

  for (let i = 0; i < tiers.length; i += 1) {
    const ceiling = tiers[i].upTo === null ? Number.POSITIVE_INFINITY : (tiers[i].upTo as number) * scale;
    const width = ceiling - floor;
    const units = Math.max(0, Math.min(quantity - floor, width));
    lines.push({
      index: i,
      from: floor,
      to: tiers[i].upTo === null ? null : ceiling,
      rate: tiers[i].rate,
      units,
      amount: units * tiers[i].rate,
    });
    floor = ceiling;
  }
  return lines;
}

export function tierTotal(
  quantity: number,
  tiers: readonly Tier[],
  scale = 1,
  mode: TierMode = 'progressive'
): number {
  return tierBreakdown(quantity, tiers, scale, mode).reduce((sum, line) => sum + line.amount, 0);
}

export type BillInput = {
  /** Total units consumed over the whole billing period. */
  usage: number;
  /** Months the bill covers. Taipower reads every two months. */
  periodMonths: number;
  /** How many of those months fall in the summer season. */
  summerMonths: number;
  summerTiers: Tier[];
  normalTiers: Tier[];
  mode: TierMode;
  /** Fixed charge for the period, regardless of usage. */
  basicCharge: number;
  /** Per-unit levy on every unit (water's conservation levy, for example). */
  perUnitLevy: number;
  /** Percentage surcharge on the usage charge (sewerage, for example). */
  surchargePercent: number;
  /** Taipower rounds the total to whole dollars. */
  roundTotal: boolean;
};

export type BillSection = {
  season: 'summer' | 'normal';
  months: number;
  usage: number;
  lines: TierLine[];
  amount: number;
};

export type Bill = {
  sections: BillSection[];
  /** Charge from the tier tables alone. */
  usageCharge: number;
  basicCharge: number;
  levy: number;
  surcharge: number;
  total: number;
  /** Total ÷ usage — what the next unit actually costs on average. */
  averageUnitPrice: number;
  /** Rate of the highest tier any unit reached. */
  marginalRate: number;
};

export function computeBill(input: BillInput): Bill {
  if (!Number.isInteger(input.periodMonths) || input.periodMonths < 1 || input.periodMonths > 12) {
    throw new BillError('the billing period must be 1 to 12 whole months');
  }
  if (
    !Number.isInteger(input.summerMonths) ||
    input.summerMonths < 0 ||
    input.summerMonths > input.periodMonths
  ) {
    throw new BillError('summer months must be between zero and the length of the period');
  }
  if (!Number.isFinite(input.basicCharge) || input.basicCharge < 0) {
    throw new BillError('the basic charge cannot be negative');
  }
  if (!Number.isFinite(input.perUnitLevy) || input.perUnitLevy < 0) {
    throw new BillError('the per-unit levy cannot be negative');
  }
  if (!Number.isFinite(input.surchargePercent) || input.surchargePercent < 0) {
    throw new BillError('the surcharge cannot be negative');
  }

  const normalMonths = input.periodMonths - input.summerMonths;
  // Usage is split in proportion to the length of each part. Taipower splits by
  // days; when a period lines up with month boundaries the two agree.
  const summerUsage = (input.usage * input.summerMonths) / input.periodMonths;
  const normalUsage = input.usage - summerUsage;

  const sections: BillSection[] = [];
  if (input.summerMonths > 0) {
    const lines = tierBreakdown(summerUsage, input.summerTiers, input.summerMonths, input.mode);
    sections.push({
      season: 'summer',
      months: input.summerMonths,
      usage: summerUsage,
      lines,
      amount: lines.reduce((sum, line) => sum + line.amount, 0),
    });
  }
  if (normalMonths > 0) {
    const lines = tierBreakdown(normalUsage, input.normalTiers, normalMonths, input.mode);
    sections.push({
      season: 'normal',
      months: normalMonths,
      usage: normalUsage,
      lines,
      amount: lines.reduce((sum, line) => sum + line.amount, 0),
    });
  }

  const usageCharge = sections.reduce((sum, section) => sum + section.amount, 0);
  const levy = input.usage * input.perUnitLevy;
  const surcharge = (usageCharge * input.surchargePercent) / 100;
  const raw = usageCharge + input.basicCharge + levy + surcharge;
  const total = input.roundTotal ? Math.round(raw) : raw;

  let marginalRate = 0;
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.units > 0) marginalRate = Math.max(marginalRate, line.rate);
    }
  }

  return {
    sections,
    usageCharge,
    basicCharge: input.basicCharge,
    levy,
    surcharge,
    total,
    averageUnitPrice: input.usage > 0 ? total / input.usage : Number.NaN,
    marginalRate,
  };
}

/**
 * How many units fit inside a budget, found by bisection.
 *
 * Useful in the direction people actually ask: not "what will 500 kWh cost" but
 * "how much can I use before the bill passes 2 000". The total is monotonic in
 * usage, so bisection converges.
 */
export function usageForBudget(input: BillInput, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return Number.NaN;
  const atZero = computeBill({ ...input, usage: 0 }).total;
  if (atZero > budget) return 0;

  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    if (high >= MAX_USAGE) {
      high = MAX_USAGE;
      break;
    }
    if (computeBill({ ...input, usage: high }).total >= budget) break;
    high *= 2;
  }
  if (computeBill({ ...input, usage: high }).total < budget) return high;

  for (let step = 0; step < 80; step += 1) {
    const middle = (low + high) / 2;
    if (computeBill({ ...input, usage: middle }).total <= budget) low = middle;
    else high = middle;
  }
  return low;
}

/* ── Shipped defaults ──────────────────────── */

/**
 * A rate table as shipped, with the date it was taken from and how sure we are
 * about it. The UI shows both; neither is decoration.
 */
export type Preset = {
  id: string;
  zh: string;
  en: string;
  /** Where the numbers came from and when. */
  version: string;
  /** Rates are filled in and believed current-ish, or left for the reader. */
  ratesProvided: boolean;
  unitZh: string;
  unitEn: string;
  periodMonths: number;
  summerMonths: number;
  summerTiers: Tier[];
  normalTiers: Tier[];
  basicCharge: number;
  perUnitLevy: number;
  surchargePercent: number;
  noteZh: string;
  noteEn: string;
};

/**
 * Taipower residential, non-time-of-use.
 *
 * Structure (six progressive bands per month, a separate summer table for
 * June–September, meter read every two months) is stable and is the part worth
 * shipping. The unit prices are the 2024-04-01 announced schedule and are here
 * as a starting point only: they are adjusted by announcement, and the figures
 * printed on your bill win over these every time.
 */
const TAIPOWER_NORMAL: Tier[] = [
  { upTo: 120, rate: 1.68 },
  { upTo: 330, rate: 2.45 },
  { upTo: 500, rate: 3.7 },
  { upTo: 700, rate: 5.04 },
  { upTo: 1000, rate: 6.24 },
  { upTo: null, rate: 7.69 },
];

const TAIPOWER_SUMMER: Tier[] = [
  { upTo: 120, rate: 1.68 },
  { upTo: 330, rate: 2.68 },
  { upTo: 500, rate: 4.39 },
  { upTo: 700, rate: 5.44 },
  { upTo: 1000, rate: 7.03 },
  { upTo: null, rate: 8.46 },
];

/**
 * Taiwan Water Corporation, general use.
 *
 * The band structure (per month, in 度 = cubic metres) is shipped because it is
 * stable. The prices are not: they differ by tariff class and by region, the
 * basic charge depends on the meter size, and the sewerage charge depends on the
 * municipality. So the rates ship at zero and have to be copied off the bill —
 * a total of zero is an obvious "not filled in", which is the point.
 */
const WATER_TIERS: Tier[] = [
  { upTo: 10, rate: 0 },
  { upTo: 30, rate: 0 },
  { upTo: 50, rate: 0 },
  { upTo: 100, rate: 0 },
  { upTo: 1000, rate: 0 },
  { upTo: null, rate: 0 },
];

export const PRESETS: Preset[] = [
  {
    id: 'taipower-residential',
    zh: '台電 住宅用電(非時間電價)',
    en: 'Taipower residential, non-time-of-use',
    version: '2024-04-01',
    ratesProvided: true,
    unitZh: '度',
    unitEn: 'kWh',
    periodMonths: 2,
    summerMonths: 2,
    summerTiers: TAIPOWER_SUMMER,
    normalTiers: TAIPOWER_NORMAL,
    basicCharge: 0,
    perUnitLevy: 0,
    surchargePercent: 0,
    noteZh:
      '級距是「每月」的度數,抄表兩個月一次,所以一期帳單的級距門檻是表上的兩倍。夏月是 6 月到 9 月。單價會隨公告調整,請以帳單為準。',
    noteEn:
      'Bands are per month and the meter is read every two months, so a bill’s thresholds are double the table. Summer is June to September. Prices change by announcement — the bill is authoritative.',
  },
  {
    id: 'water-general',
    zh: '自來水 一般用水(級距結構,單價自填)',
    en: 'Water, general use (structure only — fill in the prices)',
    version: '—',
    ratesProvided: false,
    unitZh: '度',
    unitEn: 'm³',
    periodMonths: 2,
    summerMonths: 0,
    summerTiers: WATER_TIERS,
    normalTiers: WATER_TIERS,
    basicCharge: 0,
    perUnitLevy: 0,
    surchargePercent: 0,
    noteZh:
      '水費的單價、基本費(看水錶口徑)與污水下水道使用費各區不同,這裡只給級距結構,單價請照帳單填。基本費填一期的金額,污水費用「附加百分比」欄位填。',
    noteEn:
      'Water prices, the meter-size basic charge and the municipal sewerage charge all vary by region, so only the band structure ships here. Copy the prices off your bill; put the sewerage charge in the percentage surcharge field.',
  },
  {
    id: 'blank',
    zh: '空白(自己建一張表)',
    en: 'Blank (build your own table)',
    version: '—',
    ratesProvided: false,
    unitZh: '單位',
    unitEn: 'unit',
    periodMonths: 1,
    summerMonths: 0,
    summerTiers: [{ upTo: null, rate: 0 }],
    normalTiers: [
      { upTo: 100, rate: 0 },
      { upTo: null, rate: 0 },
    ],
    basicCharge: 0,
    perUnitLevy: 0,
    surchargePercent: 0,
    noteZh: '任何累進級距的費用都可以用這張空表算:填級距上限與單價就好。',
    noteEn: 'Any progressive tariff fits here: fill in the band ceilings and the prices.',
  },
];

export function money(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
