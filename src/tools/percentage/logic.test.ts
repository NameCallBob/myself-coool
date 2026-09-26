import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChange,
  baseBeforeChange,
  chainChanges,
  changeIsAmbiguous,
  changePercent,
  discount,
  formatAmount,
  formatPercent,
  listPriceFrom,
  marginToMarkup,
  markupToMargin,
  parseNumber,
  partOf,
  percentOffToZhe,
  pointsDelta,
  share,
  taxFromGross,
  taxFromNet,
  wholeFrom,
  zheToMultiplier,
  zheToPercentOff,
} from './logic.ts';

const near = (actual: number, expected: number, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

test('share answers "A is what percent of B"', () => {
  near(share(25, 200), 12.5);
  near(share(1, 3), 33.33333333333333);
  near(share(200, 200), 100);
  near(share(0, 5), 0);
  near(share(-10, 50), -20, 'a negative part is a negative share');
  near(share(7, 2), 350, 'a part can exceed the whole');
  assert.ok(Number.isNaN(share(5, 0)), 'nothing is a percentage of zero');
});

test('partOf and wholeFrom are inverses', () => {
  near(partOf(200, 15), 30);
  near(wholeFrom(30, 15), 200);
  near(partOf(1234.56, 5), 61.728);
  near(wholeFrom(partOf(987, 37), 37), 987);
  near(partOf(100, 0), 0);
  assert.ok(Number.isNaN(wholeFrom(30, 0)), '0% of something cannot be 30');
});

test('changePercent reports rises and falls', () => {
  near(changePercent(100, 120), 20);
  near(changePercent(100, 80), -20);
  near(changePercent(80, 100), 25, 'the reverse is not -20%');
  near(changePercent(50, 50), 0);
  near(changePercent(3, 4), 33.33333333333333, 'a rate can rise 33% and one point');
  assert.ok(Number.isNaN(changePercent(0, 10)), 'growth from zero has no percentage');
});

test('changePercent over a negative base is flagged, not silently signed', () => {
  // A loss shrinking is an improvement; with |from| as denominator it reads +.
  near(changePercent(-100, -50), 50);
  assert.equal(changeIsAmbiguous(-100), true);
  assert.equal(changeIsAmbiguous(100), false);
  assert.equal(changeIsAmbiguous(0), false);
});

test('applyChange and baseBeforeChange are inverses', () => {
  near(applyChange(100, 20), 120);
  near(applyChange(100, -20), 80);
  near(baseBeforeChange(120, 20), 100);
  near(baseBeforeChange(80, -20), 100);
  near(baseBeforeChange(applyChange(4321, 17.5), 17.5), 4321);
  assert.ok(Number.isNaN(baseBeforeChange(50, -100)), 'a 100% fall erases the base');
});

test('chained changes do not cancel', () => {
  // The headline case: up 20% then down 20% loses 4%.
  near(chainChanges(20, -20), -4);
  near(chainChanges(-20, 20), -4);
  near(chainChanges(10, 10), 21);
  near(chainChanges(0, 35), 35);
  near(chainChanges(100, -50), 0, 'double then halve does come back');
});

test('discount computes the sale price and what came off', () => {
  const twenty = discount(1000, 20);
  near(twenty.sale, 800);
  near(twenty.saved, 200);
  near(twenty.multiplier, 0.8);

  const none = discount(1000, 0);
  near(none.sale, 1000);
  near(none.saved, 0);

  const all = discount(1000, 100);
  near(all.sale, 0);
  near(all.saved, 1000);

  // Over 100% off is a refund, not a clamp — say what the arithmetic says.
  near(discount(1000, 120).sale, -200);
});

test('listPriceFrom recovers the pre-discount price', () => {
  near(listPriceFrom(800, 20), 1000);
  near(listPriceFrom(255, 15), 300);
  near(listPriceFrom(discount(1499, 35).sale, 35), 1499);
  assert.ok(Number.isNaN(listPriceFrom(0, 100)), '100% off hides the list price');
});

test('折 is tenths of the price kept, not taken off', () => {
  near(zheToMultiplier(8), 0.8, '八折');
  near(zheToPercentOff(8), 20);
  near(zheToMultiplier(85), 0.85, '85折');
  near(zheToPercentOff(85), 15);
  near(zheToMultiplier(9.5), 0.95);
  near(zheToMultiplier(5), 0.5, '對折');
  near(zheToMultiplier(99), 0.99);
  near(zheToMultiplier(1), 0.1, '一折');
  for (const bad of [0, -1, 100, 1000, Number.NaN]) {
    assert.ok(Number.isNaN(zheToMultiplier(bad)), `${bad} is not a 折`);
  }
});

test('percentOffToZhe writes a discount back in 折', () => {
  near(percentOffToZhe(20), 8);
  near(percentOffToZhe(15), 8.5);
  near(percentOffToZhe(0), 10);
  near(percentOffToZhe(50), 5);
  assert.ok(Number.isNaN(percentOffToZhe(100)), 'free is not a 折');
  assert.ok(Number.isNaN(percentOffToZhe(-10)), 'a surcharge is not a 折');
});

test('tax on a net amount adds up', () => {
  const split = taxFromNet(1000, 5);
  near(split.net, 1000);
  near(split.tax, 50);
  near(split.gross, 1050);
  near(taxFromNet(1234, 0).gross, 1234);
});

test('tax inside a gross amount is not the rate times the gross', () => {
  // The classic error: 5% of 1050 is 52.5; the tax inside 1050 is 50.
  const split = taxFromGross(1050, 5);
  near(split.net, 1000);
  near(split.tax, 50);
  near(split.gross, 1050);
  assert.ok(Math.abs(split.tax - 52.5) > 1, 'gross × rate is the wrong formula');

  // Taiwanese business tax is 5%; a 10% VAT and a 0% rate must also work.
  near(taxFromGross(1100, 10).net, 1000);
  near(taxFromGross(999, 0).tax, 0);
  near(taxFromGross(taxFromNet(777, 5).gross, 5).net, 777);
});

test('percentage points are not percent', () => {
  near(pointsDelta(3, 4), 1);
  near(pointsDelta(4, 3), -1);
  near(pointsDelta(0.5, 1.75), 1.25);
  // The same move is one point and 33% — both readings from one pair.
  near(changePercent(3, 4), 33.33333333333333);
});

test('markup and margin are different numbers', () => {
  near(markupToMargin(25), 20);
  near(marginToMarkup(20), 25);
  near(markupToMargin(100), 50);
  near(marginToMarkup(50), 100);
  near(markupToMargin(0), 0);
  near(marginToMarkup(0), 0);
  near(markupToMargin(marginToMarkup(33)), 33, 'round trip');
  assert.ok(Number.isNaN(marginToMarkup(100)), 'a 100% margin means zero cost');
  assert.ok(Number.isNaN(markupToMargin(-100)));
});

test('parseNumber accepts what goes into a price field', () => {
  assert.equal(parseNumber('1234'), 1234);
  assert.equal(parseNumber('1,234.50'), 1234.5);
  assert.equal(parseNumber(' -12.5 '), -12.5);
  assert.equal(parseNumber('15%'), 15);
  assert.equal(parseNumber('15％'), 15);
  assert.equal(parseNumber('$1,000'), 1000);
  assert.equal(parseNumber('NT$1,000'), 1000);
  assert.equal(parseNumber('１２３'), 123);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('1e2'), 100);
});

test('parseNumber treats a blank field as no answer, not as zero', () => {
  for (const bad of ['', '   ', '-', 'abc', '1.2.3', '12%%', '一百']) {
    assert.ok(Number.isNaN(parseNumber(bad)), `${JSON.stringify(bad)} should not parse`);
  }
});

test('formatAmount groups and only shows decimals when they exist', () => {
  assert.equal(formatAmount(1000), '1,000');
  assert.equal(formatAmount(1234.5), '1,234.50');
  assert.equal(formatAmount(-1234.567), '-1,234.57');
  assert.equal(formatAmount(0), '0');
  assert.equal(formatAmount(1234.5, 0), '1,235');
  assert.equal(formatAmount(Number.NaN), '—');
  assert.equal(formatAmount(Number.POSITIVE_INFINITY), '—');
});

test('formatPercent keeps small rates visible', () => {
  assert.equal(formatPercent(12.5), '12.5%');
  assert.equal(formatPercent(33.333333333), '33.3333%');
  assert.equal(formatPercent(0.04), '0.04%');
  assert.equal(formatPercent(100), '100%');
  assert.equal(formatPercent(-20), '-20%');
  assert.equal(formatPercent(Number.NaN), '—');
  assert.equal(formatPercent(1234.5678, 2), '1,234.57%');
});
