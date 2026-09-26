/**
 * The six percentage questions, each as one pure function.
 *
 * They are separate functions rather than one "calculate percent" because the
 * mistakes people make with percentages are mistakes of *which* question they
 * are answering. A 20% rise followed by a 20% fall is not a return to the
 * start; 20% off and 20% margin are different numbers; a rate moving from 3%
 * to 4% has risen one percentage point and thirty-three percent. Naming each
 * relationship separately is the only way a calculator can be honest about
 * which one it just computed.
 *
 * Division by zero returns NaN rather than Infinity throughout: "0 is 0% of 0"
 * is not a fact, and an ∞ rendered into a price field is worse than a blank.
 */

const finite = (value: number): number => (Number.isFinite(value) ? value : Number.NaN);

/** `part` as a percentage of `whole`. 25 of 200 is 12.5%. */
export function share(part: number, whole: number): number {
  if (whole === 0) return Number.NaN;
  return finite((part / whole) * 100);
}

/** `percent`% of `whole`. 15% of 200 is 30. */
export function partOf(whole: number, percent: number): number {
  return finite((whole * percent) / 100);
}

/** The whole, given that `part` is `percent`% of it. 30 being 15% means 200. */
export function wholeFrom(part: number, percent: number): number {
  if (percent === 0) return Number.NaN;
  return finite((part / percent) * 100);
}

/**
 * Relative change from `from` to `to`, in percent. Negative for a fall.
 *
 * Undefined when the starting value is zero — growth "from nothing" has no
 * percentage, and reporting one (∞, or 100%) is the single most common way a
 * dashboard lies.
 *
 * The denominator is |from|, not from. With a negative base the two disagree
 * on the *sign*: a loss shrinking from −100 to −50 is "+50%" by this rule and
 * "−50%" by the textbook one, and neither reading is wrong so much as the
 * question is. `changeIsAmbiguous` exists so the UI can say so out loud rather
 * than let the reader assume.
 */
export function changePercent(from: number, to: number): number {
  if (from === 0) return Number.NaN;
  return finite(((to - from) / Math.abs(from)) * 100);
}

/** True when the base is negative, so the sign of the change is a convention. */
export function changeIsAmbiguous(from: number): boolean {
  return Number.isFinite(from) && from < 0;
}

/** `base` after a `percent`% change. -20 gives four fifths of base. */
export function applyChange(base: number, percent: number): number {
  return finite(base * (1 + percent / 100));
}

/** The value before a `percent`% change produced `after`. */
export function baseBeforeChange(after: number, percent: number): number {
  const factor = 1 + percent / 100;
  if (factor === 0) return Number.NaN;
  return finite(after / factor);
}

/**
 * Net change of two successive percentage changes, in percent.
 *
 * +20% then -20% is -4%, not 0%. This is the function that says so.
 */
export function chainChanges(first: number, second: number): number {
  return finite(((1 + first / 100) * (1 + second / 100) - 1) * 100);
}

export type Discount = {
  /** What is paid. */
  sale: number;
  /** What comes off. */
  saved: number;
  /** Multiplier applied to the list price, e.g. 0.8 for 20% off. */
  multiplier: number;
};

export function discount(list: number, percentOff: number): Discount {
  const multiplier = 1 - percentOff / 100;
  const sale = finite(list * multiplier);
  return { sale, saved: finite(list - sale), multiplier };
}

/** The list price that `sale` came from, given `percentOff`. */
export function listPriceFrom(sale: number, percentOff: number): number {
  const multiplier = 1 - percentOff / 100;
  if (multiplier === 0) return Number.NaN;
  return finite(sale / multiplier);
}

/**
 * Taiwanese and Chinese shops quote discounts in 折 — tenths of the list price
 * *kept*, not taken off. 八折 is 80% of the price, i.e. 20% off; 85折 is 85%.
 *
 * Both one- and two-digit forms are in daily use, so the digit count decides
 * the scale: 8 → 0.8, 85 → 0.85, 9.5 → 0.95. Anything outside 1–99 is not a
 * 折 and is refused rather than guessed at.
 */
export function zheToMultiplier(zhe: number): number {
  if (!Number.isFinite(zhe) || zhe <= 0) return Number.NaN;
  if (zhe < 10) return zhe / 10;
  if (zhe < 100) return zhe / 100;
  return Number.NaN;
}

/** Percent off, given a 折 quote. 八折 is 20% off. */
export function zheToPercentOff(zhe: number): number {
  const multiplier = zheToMultiplier(zhe);
  if (Number.isNaN(multiplier)) return Number.NaN;
  return finite((1 - multiplier) * 100);
}

/** A percent-off figure written back as 折, to one decimal. 20% off is 8. */
export function percentOffToZhe(percentOff: number): number {
  const multiplier = 1 - percentOff / 100;
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1) return Number.NaN;
  return finite(multiplier * 10);
}

export type TaxSplit = {
  /** Price before tax. */
  net: number;
  /** The tax itself. */
  tax: number;
  /** Price including tax. */
  gross: number;
};

/** Adds `ratePercent` tax to a pre-tax amount. */
export function taxFromNet(net: number, ratePercent: number): TaxSplit {
  const tax = finite((net * ratePercent) / 100);
  return { net: finite(net), tax, gross: finite(net + tax) };
}

/**
 * Splits a tax-inclusive amount.
 *
 * The wrong version of this — multiplying the gross by the rate — is the
 * classic error: 5% of 1050 is 52.5, but the tax inside 1050 is 50. The net is
 * gross / (1 + rate), and the tax is the remainder.
 */
export function taxFromGross(gross: number, ratePercent: number): TaxSplit {
  const factor = 1 + ratePercent / 100;
  if (factor === 0) return { net: Number.NaN, tax: Number.NaN, gross: finite(gross) };
  const net = finite(gross / factor);
  return { net, tax: finite(gross - net), gross: finite(gross) };
}

/** Difference of two rates in percentage points: 3% to 4% is 1 point. */
export function pointsDelta(fromPercent: number, toPercent: number): number {
  return finite(toPercent - fromPercent);
}

/**
 * Margin from markup. A 25% markup on cost is a 20% margin on price.
 *
 * Markup is measured against cost, margin against selling price, so they are
 * never the same number — and a shop that sets prices with one and reports
 * profit with the other has a hole in its books.
 */
export function markupToMargin(markupPercent: number): number {
  const factor = 1 + markupPercent / 100;
  if (factor === 0) return Number.NaN;
  return finite(markupPercent / factor);
}

/** Markup from margin. A 20% margin needs a 25% markup. */
export function marginToMarkup(marginPercent: number): number {
  const rest = 1 - marginPercent / 100;
  if (rest === 0) return Number.NaN;
  return finite(marginPercent / rest);
}

/**
 * Reads a number out of a field, tolerating what people type into one: a
 * trailing percent sign, thousands separators, currency marks, full-width
 * digits. An empty field is NaN, not zero — a blank must not compute.
 */
export function parseNumber(text: string): number {
  const cleaned = text
    .trim()
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[,\s_'’、]/g, '')
    .replace(/[．。]/g, '.')
    .replace(/[%％]$/, '')
    .replace(/^[$¥￥€£NT]+/i, '')
    .replace(/^\+/, '');
  if (cleaned === '' || cleaned === '-') return Number.NaN;
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/**
 * Money-ish display: two decimals when the value is not whole, none when it
 * is, thousands grouped. Percentages use `formatPercent` instead.
 */
export function formatAmount(value: number, digits?: number): string {
  if (!Number.isFinite(value)) return '—';
  const places = digits ?? (Number.isInteger(value) ? 0 : 2);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** Percentages keep more digits than money: 0.04% is a real figure. */
export function formatPercent(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: digits })}%`;
}
