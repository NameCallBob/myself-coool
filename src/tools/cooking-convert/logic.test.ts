import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAN_OFFSET_C,
  GAS_MARKS,
  INGREDIENTS,
  MASS_UNITS,
  MAX_RECIPE_LINES,
  VOLUME_UNITS,
  cToF,
  conventionalFromFan,
  convertMass,
  convertVolume,
  fToC,
  fanFromConventional,
  formatAmount,
  formatDecimal,
  formatFraction,
  formatIngredients,
  gasMarkToC,
  gramsToVolume,
  ingredient,
  massUnit,
  nearestGasMark,
  parseAmount,
  parseIngredients,
  roundOven,
  scaleFactor,
  scaleLine,
  scaleRecipe,
  volumeToGrams,
  volumeUnit,
} from './logic.ts';

const near = (actual: number | null, expected: number, tolerance = 1e-6, message?: string) => {
  assert.notEqual(actual, null, message);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`
  );
};

/* ── Reading amounts ──────────────────────── */

test('every way a cook writes a number', () => {
  assert.deepEqual(parseAmount('2'), { value: 2, fractional: false });
  assert.deepEqual(parseAmount('2.5'), { value: 2.5, fractional: false });
  assert.deepEqual(parseAmount('.5'), { value: 0.5, fractional: false });
  assert.deepEqual(parseAmount('1/2'), { value: 0.5, fractional: true });
  assert.deepEqual(parseAmount('3/4'), { value: 0.75, fractional: true });
  assert.deepEqual(parseAmount('1 1/2'), { value: 1.5, fractional: true });
  assert.deepEqual(parseAmount('½'), { value: 0.5, fractional: true });
  assert.deepEqual(parseAmount('1½'), { value: 1.5, fractional: true });
  assert.deepEqual(parseAmount('1 ½'), { value: 1.5, fractional: true });
  near(parseAmount('⅓')?.value ?? null, 1 / 3);
  near(parseAmount('2⅔')?.value ?? null, 8 / 3);
  assert.deepEqual(parseAmount('1,000'), { value: 1000, fractional: false });
});

test('amounts that are not amounts', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('   '), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1/0'), null, 'no dividing by zero');
  assert.equal(parseAmount('2 cups'), null, 'the unit is not part of the amount');
  assert.equal(parseAmount('-2'), null);
});

/* ── Writing amounts ──────────────────────── */

test('fractions come back as glyphs a cook can read', () => {
  assert.equal(formatFraction(0.5), '½');
  assert.equal(formatFraction(1.5), '1½');
  assert.equal(formatFraction(0.75), '¾');
  assert.equal(formatFraction(2.25), '2¼');
  assert.equal(formatFraction(1 / 3), '⅓');
  assert.equal(formatFraction(2 / 3), '⅔');
  assert.equal(formatFraction(0.625), '⅝');
  assert.equal(formatFraction(3), '3');
  assert.equal(formatFraction(0), '0');
});

test('a value near no useful fraction falls back to a decimal', () => {
  // 0.42 is not within a hair of any half, third, quarter or eighth.
  assert.equal(formatFraction(0.42), '0.42');
  assert.equal(formatFraction(1.11), '1.11');
});

test('decimals get places to suit their size, with no trailing zeros', () => {
  assert.equal(formatDecimal(250), '250');
  assert.equal(formatDecimal(250.4), '250');
  assert.equal(formatDecimal(12.34), '12.3');
  assert.equal(formatDecimal(1.5), '1.5');
  assert.equal(formatDecimal(1.0), '1');
  assert.equal(formatDecimal(0.125), '0.13');
});

test('amounts round-trip through parse and format', () => {
  for (const text of ['2', '2.5', '½', '1½', '¾', '1 1/2', '250']) {
    const parsed = parseAmount(text)!;
    const written = formatAmount(parsed.value, parsed.fractional);
    const again = parseAmount(written)!;
    near(again.value, parsed.value, 1e-9, text);
  }
});

/* ── Volume units ─────────────────────────── */

test('the four cups are four different volumes', () => {
  assert.equal(volumeUnit('cup-us')?.ml, 236.5882365);
  assert.equal(volumeUnit('cup-us-legal')?.ml, 240);
  assert.equal(volumeUnit('cup-metric')?.ml, 250);
  assert.equal(volumeUnit('cup-rice')?.ml, 180, 'the rice-cooker cup, 1 合');
  // A metric cup is 5.7% more than a US cup, and the rice cup is 24% less.
  near(convertVolume(1, 'cup-metric', 'cup-us'), 250 / 236.5882365, 1e-9);
});

test('spoons differ too', () => {
  near(volumeUnit('tbsp-us')?.ml ?? null, 14.786765, 1e-6);
  assert.equal(volumeUnit('tbsp-metric')?.ml, 15);
  assert.equal(volumeUnit('tbsp-au')?.ml, 20, 'the Australian tablespoon is four teaspoons');
  // Three US teaspoons make a US tablespoon, exactly.
  near(convertVolume(3, 'tsp-us', 'tbsp-us'), 1, 1e-12);
  near(convertVolume(3, 'tsp-metric', 'tbsp-metric'), 1, 1e-12);
  near(convertVolume(1, 'tbsp-au', 'tsp-metric'), 4, 1e-12);
});

test('volume conversions are reversible and reject unknown units', () => {
  for (const [from, to] of [
    ['cup-us', 'ml'],
    ['tbsp-us', 'tsp-us'],
    ['l', 'floz-uk'],
  ] as [string, string][]) {
    const there = convertVolume(2, from, to)!;
    near(convertVolume(there, to, from), 2, 1e-9, `${from}→${to}`);
  }
  assert.equal(convertVolume(1, 'cup-us', 'nope'), null);
  assert.equal(convertVolume(Number.NaN, 'cup-us', 'ml'), null);
});

test('one litre is a known number of US fluid ounces and UK ones', () => {
  near(convertVolume(1, 'l', 'floz-us'), 33.814, 0.001);
  near(convertVolume(1, 'l', 'floz-uk'), 35.195, 0.001);
});

/* ── Mass units ───────────────────────────── */

test('the Taiwanese market units are exact by statute', () => {
  assert.equal(massUnit('tw-jin')?.grams, 600);
  assert.equal(massUnit('tw-liang')?.grams, 37.5);
  assert.equal(massUnit('tw-qian')?.grams, 3.75);
  // 1 台斤 is 16 台兩, and 1 台兩 is 10 錢.
  near(convertMass(1, 'tw-jin', 'tw-liang'), 16, 1e-12);
  near(convertMass(1, 'tw-liang', 'tw-qian'), 10, 1e-12);
  // And it is not a pound: 600 g against 453.6 g.
  near(convertMass(1, 'tw-jin', 'lb'), 1.3228, 0.0001);
});

test('ounces and pounds are the international definitions', () => {
  near(massUnit('lb')?.grams ?? null, 453.59237, 1e-9);
  near(convertMass(1, 'lb', 'oz'), 16, 1e-12);
  near(convertMass(100, 'g', 'oz'), 3.5274, 0.0001);
  assert.equal(convertMass(1, 'g', 'stone'), null);
});

/* ── Densities ────────────────────────────── */

test('a cup of flour and a cup of sugar come out at the published weights', () => {
  // Spoon-and-levelled all-purpose flour: about 125 g per US cup.
  near(volumeToGrams(1, 'cup-us', ingredient('flour-ap')!.gPerMl), 125.4, 0.5);
  // Granulated sugar: about 200 g per US cup.
  near(volumeToGrams(1, 'cup-us', ingredient('sugar-white')!.gPerMl), 201.1, 0.5);
  // Butter: 227 g per US cup, the two-stick figure every US recipe assumes.
  near(volumeToGrams(1, 'cup-us', ingredient('butter')!.gPerMl), 227.1, 0.5);
  // Water: a millilitre is a gram.
  near(volumeToGrams(250, 'ml', 1), 250, 1e-9);
});

test('a teaspoon of each leavening and salt matches the usual figures', () => {
  near(volumeToGrams(1, 'tsp-us', ingredient('baking-powder')!.gPerMl), 4.0, 0.1);
  near(volumeToGrams(1, 'tsp-us', ingredient('baking-soda')!.gPerMl), 4.6, 0.1);
  near(volumeToGrams(1, 'tsp-us', ingredient('salt-fine')!.gPerMl), 6.0, 0.1);
  near(volumeToGrams(1, 'tsp-us', ingredient('salt-kosher')!.gPerMl), 2.96, 0.1);
});

test('volume and mass conversions invert each other', () => {
  for (const entry of INGREDIENTS) {
    const grams = volumeToGrams(1.5, 'cup-us', entry.gPerMl)!;
    near(gramsToVolume(grams, 'cup-us', entry.gPerMl), 1.5, 1e-9, entry.id);
  }
});

test('conversion refuses a nonsensical density', () => {
  assert.equal(volumeToGrams(1, 'cup-us', 0), null);
  assert.equal(volumeToGrams(1, 'cup-us', -1), null);
  assert.equal(gramsToVolume(100, 'cup-us', 0), null);
  assert.equal(volumeToGrams(1, 'nope', 1), null);
});

test('the shipped ingredient table is coherent', () => {
  assert.equal(new Set(INGREDIENTS.map((entry) => entry.id)).size, INGREDIENTS.length);
  for (const entry of INGREDIENTS) {
    assert.ok(entry.gPerMl > 0.2 && entry.gPerMl < 2, `${entry.id} density out of range`);
    assert.notEqual(entry.zh, '');
    assert.notEqual(entry.en, '');
  }
  // Powders are lighter than water; syrups are heavier.
  assert.ok(ingredient('flour-ap')!.gPerMl < 1);
  assert.ok(ingredient('honey')!.gPerMl > 1);
});

test('the ingredient table round-trips through its editable text form', () => {
  const parsed = parseIngredients(formatIngredients(INGREDIENTS));
  assert.deepEqual(parsed, INGREDIENTS);
});

test('the ingredient parser drops rows it cannot use', () => {
  const parsed = parseIngredients(
    ['# mine', '', 'mystery:0.6:神秘粉:mystery powder', 'broken:abc:x:y', ':0.5:a:b', 'heavy:99:x:y'].join('\n')
  );
  assert.deepEqual(parsed, [{ id: 'mystery', gPerMl: 0.6, zh: '神秘粉', en: 'mystery powder' }]);
});

test('a missing label falls back to the id', () => {
  assert.deepEqual(parseIngredients('x:0.5::'), [{ id: 'x', gPerMl: 0.5, zh: 'x', en: 'x' }]);
});

/* ── Oven ─────────────────────────────────── */

test('Celsius and Fahrenheit, at the fixed points', () => {
  assert.equal(cToF(0), 32);
  assert.equal(cToF(100), 212);
  assert.equal(cToF(-40), -40);
  near(cToF(180), 356);
  near(fToC(350), 176.667, 0.001);
  for (const c of [-40, 0, 20, 180, 250]) near(fToC(cToF(c)), c, 1e-9);
});

test('the gas-mark table is the printed one, monotonic in both columns', () => {
  assert.equal(gasMarkToC('4'), 180);
  assert.equal(gasMarkToC('¼'), 110);
  assert.equal(gasMarkToC('9'), 240);
  assert.equal(gasMarkToC('10'), null);
  for (let i = 1; i < GAS_MARKS.length; i += 1) {
    assert.ok(GAS_MARKS[i].c > GAS_MARKS[i - 1].c);
    assert.ok(GAS_MARKS[i].f > GAS_MARKS[i - 1].f);
  }
});

test('the published °C and °F in the table are the rounded cookbook pair, not exact conversions', () => {
  const mark4 = GAS_MARKS.find((entry) => entry.mark === '4')!;
  assert.equal(mark4.c, 180);
  assert.equal(mark4.f, 350);
  // 180 °C is really 356 °F — the table is a convention, and that is the point.
  assert.notEqual(Math.round(cToF(mark4.c)), mark4.f);
});

test('the nearest gas mark reports how far off it is', () => {
  assert.equal(nearestGasMark(180)?.mark.mark, '4');
  assert.equal(nearestGasMark(180)?.offBy, 0);
  assert.equal(nearestGasMark(185)?.mark.mark, '4');
  assert.equal(nearestGasMark(185)?.offBy, 5);
  assert.equal(nearestGasMark(215)?.mark.mark, '7');
  // 210 is exactly between marks 6 and 7; the lower one wins.
  assert.equal(nearestGasMark(210)?.mark.mark, '6');
  assert.equal(nearestGasMark(210)?.offBy, 10);
  assert.equal(nearestGasMark(1000)?.mark.mark, '9');
  assert.equal(nearestGasMark(Number.NaN), null);
});

test('the fan adjustment is a fixed offset in both directions', () => {
  assert.equal(FAN_OFFSET_C, 20);
  assert.equal(fanFromConventional(180), 160);
  assert.equal(conventionalFromFan(160), 180);
  for (const c of [140, 180, 220]) assert.equal(conventionalFromFan(fanFromConventional(c)), c);
});

test('oven settings round to something a dial can be set to', () => {
  assert.equal(roundOven(176.667), 175);
  assert.equal(roundOven(178), 180);
  assert.equal(roundOven(180), 180);
  assert.equal(roundOven(183, 10), 180);
  assert.ok(Number.isNaN(roundOven(Number.NaN)));
});

/* ── Recipe scaling ───────────────────────── */

test('quantities scale and fractions stay fractions', () => {
  assert.equal(scaleLine('中筋麵粉 200 g', 2), '中筋麵粉 400 g');
  assert.equal(scaleLine('2 cups flour', 0.5), '1 cups flour');
  assert.equal(scaleLine('1/2 tsp salt', 3), '1½ tsp salt');
  assert.equal(scaleLine('½ 顆蛋', 4), '2 顆蛋');
  assert.equal(scaleLine('1 1/2 cups milk', 2), '3 cups milk');
});

test('temperatures and times are never scaled', () => {
  assert.equal(scaleLine('預熱烤箱到 180°C', 2), '預熱烤箱到 180°C');
  assert.equal(scaleLine('Bake at 350 F for 25 minutes', 2), 'Bake at 350 F for 25 minutes');
  assert.equal(scaleLine('烤 25 分鐘', 3), '烤 25 分鐘');
  assert.equal(scaleLine('靜置 1 小時', 2), '靜置 1 小時');
  assert.equal(scaleLine('攝氏 200 度', 2), '攝氏 200 度');
  assert.equal(scaleLine('rest 30 sec', 2), 'rest 30 sec');
  assert.equal(scaleLine('bake at 200 C', 2), 'bake at 200 C', 'a bare C after an oven-sized number');
  // But `2 C` in an American recipe is two cups, and that does scale.
  assert.equal(scaleLine('2 C flour', 2), '4 C flour');
});

test('tin sizes and dial positions are never scaled', () => {
  assert.equal(scaleLine('9x13 吋烤盤', 2), '9x13 吋烤盤');
  assert.equal(scaleLine('用 20 cm 蛋糕模', 2), '用 20 cm 蛋糕模');
  assert.equal(scaleLine('gas mark 4', 2), 'gas mark 4');
  assert.equal(scaleLine('hydration 70%', 2), 'hydration 70%');
});

test('several quantities on one line all scale', () => {
  assert.equal(scaleLine('麵粉 200 g、糖 50 g、鹽 3 g', 0.5), '麵粉 100 g、糖 25 g、鹽 1.5 g');
});

test('a factor that makes no sense leaves the line alone', () => {
  assert.equal(scaleLine('麵粉 200 g', 0), '麵粉 200 g');
  assert.equal(scaleLine('麵粉 200 g', -1), '麵粉 200 g');
  assert.equal(scaleLine('麵粉 200 g', Number.NaN), '麵粉 200 g');
});

test('a line with no numbers is untouched', () => {
  assert.equal(scaleLine('攪拌至均勻', 2), '攪拌至均勻');
  assert.equal(scaleLine('', 2), '');
});

test('the whole recipe scales line by line and is capped', () => {
  const recipe = ['4 人份', '麵粉 250 g', '烤 180°C 30 分鐘'].join('\n');
  assert.equal(
    scaleRecipe(recipe, 1.5).text,
    ['6 人份', '麵粉 375 g', '烤 180°C 30 分鐘'].join('\n')
  );
  const long = Array.from({ length: MAX_RECIPE_LINES + 5 }, () => '麵粉 100 g').join('\n');
  const result = scaleRecipe(long, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.text.split('\n').length, MAX_RECIPE_LINES);
});

test('scaling twice by the square root is scaling once', () => {
  const once = scaleRecipe('麵粉 400 g', 0.25).text;
  const twice = scaleRecipe(scaleRecipe('麵粉 400 g', 0.5).text, 0.5).text;
  assert.equal(once, twice);
  assert.equal(once, '麵粉 100 g');
});

test('the scale factor is target over original', () => {
  assert.equal(scaleFactor(4, 6), 1.5);
  assert.equal(scaleFactor(2, 2), 1);
  assert.equal(scaleFactor(0, 4), null);
  assert.equal(scaleFactor(4, 0), null);
  assert.equal(scaleFactor(4, Number.NaN), null);
});

test('the unit lists have no duplicate ids', () => {
  assert.equal(new Set(VOLUME_UNITS.map((entry) => entry.id)).size, VOLUME_UNITS.length);
  assert.equal(new Set(MASS_UNITS.map((entry) => entry.id)).size, MASS_UNITS.length);
  for (const entry of VOLUME_UNITS) assert.ok(entry.ml > 0);
  for (const entry of MASS_UNITS) assert.ok(entry.grams > 0);
});
