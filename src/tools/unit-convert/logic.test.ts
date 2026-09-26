import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSIONS,
  convert,
  convertAll,
  dimension,
  formatQuantity,
  parseAmount,
  unit,
} from './logic.ts';

/** Ratios are exact by definition, so the tolerance is representation noise. */
const near = (actual: number, expected: number, message?: string) => {
  const tolerance = Math.max(Math.abs(expected) * 1e-12, 1e-12);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

test('every dimension declares a base unit that exists', () => {
  for (const dim of DIMENSIONS) {
    const base = dim.units.find((u) => u.id === dim.base);
    assert.ok(base, `${dim.id} has no unit matching its base ${dim.base}`);
    if (base.factor !== undefined) assert.equal(base.factor, 1, `${dim.id} base factor`);
  }
});

test('every unit is either proportional, affine or reciprocal — never two', () => {
  for (const dim of DIMENSIONS) {
    const ids = new Set<string>();
    for (const u of dim.units) {
      assert.ok(!ids.has(u.id), `duplicate unit id ${u.id} in ${dim.id}`);
      ids.add(u.id);
      const kinds = [u.factor !== undefined, u.toBase !== undefined, u.reciprocal === true];
      assert.equal(kinds.filter(Boolean).length, 1, `${dim.id}/${u.id} kind`);
      if (u.factor !== undefined) assert.ok(u.factor > 0, `${dim.id}/${u.id} factor sign`);
    }
  }
});

test('length uses the 1959 international definitions', () => {
  near(convert('length', 'in', 'cm', 1), 2.54, 'inch');
  near(convert('length', 'ft', 'm', 1), 0.3048, 'foot');
  near(convert('length', 'mi', 'km', 1), 1.609344, 'mile');
  near(convert('length', 'nmi', 'm', 1), 1852, 'nautical mile');
  near(convert('length', 'm', 'in', 1), 39.37007874015748, 'metre to inch');
  near(convert('length', 'km', 'mi', 42.195), 26.2187574564543, 'marathon in miles');
});

test('Taiwanese length units come from 台尺 = 10/33 m', () => {
  near(convert('length', 'chi', 'm', 1), 10 / 33);
  near(convert('length', 'chi', 'cun', 1), 10);
  near(convert('length', 'zhang', 'chi', 1), 10);
  // A 3 尺 6 寸 door leaf, the size actually quoted by carpenters.
  near(convert('length', 'chi', 'cm', 3.6), 109.0909090909, 'door leaf');
});

test('temperature is affine, not proportional', () => {
  near(convert('temperature', 'C', 'F', 100), 212);
  near(convert('temperature', 'C', 'F', 0), 32);
  near(convert('temperature', 'C', 'F', -40), -40, 'the crossing point');
  near(convert('temperature', 'C', 'K', 0), 273.15);
  near(convert('temperature', 'K', 'C', 0), -273.15, 'absolute zero');
  near(convert('temperature', 'F', 'C', 98.6), 37);
  near(convert('temperature', 'R', 'K', 491.67), 273.15);
  near(convert('temperature', 'C', 'R', 100), 671.67);
  // The trap: doubling Celsius must not double kelvin.
  const ten = convert('temperature', 'C', 'K', 10);
  const twenty = convert('temperature', 'C', 'K', 20);
  assert.ok(twenty / ten < 1.1, 'affine conversion behaved like a ratio');
});

test('area: 坪 and 甲 match the land-registry figures', () => {
  // 1 坪 = (6 × 10/33)² = 400/121 m².
  near(convert('area', 'ping', 'm2', 1), 400 / 121);
  near(convert('area', 'm2', 'ping', 100), 30.25, '100 m² in ping');
  near(convert('area', 'ping', 'm2', 30), 99.1735537190, '30 ping');
  // 1 甲 = 2934 坪 = 9699.17 m² ≈ 0.9699 ha, the figure printed on deeds.
  near(convert('area', 'jia', 'ping', 1), 2934);
  near(convert('area', 'jia', 'ha', 1), 0.9699173553719, '1 kah in hectares');
  near(convert('area', 'jia', 'fen_land', 1), 10);
  near(convert('area', 'acre', 'm2', 1), 4046.8564224);
  near(convert('area', 'ha', 'acre', 1), 2.4710538146717, 'hectare in acres');
  near(convert('area', 'ft2', 'm2', 1), 0.09290304);
});

test('mass: catty is 600 g exactly and troy ounce is not the avoirdupois one', () => {
  near(convert('mass', 'jin', 'g', 1), 600);
  near(convert('mass', 'jin', 'liang', 1), 16);
  near(convert('mass', 'liang', 'g', 1), 37.5);
  near(convert('mass', 'qian', 'g', 1), 3.75);
  near(convert('mass', 'jin', 'kg', 3), 1.8, 'three catty of fruit');
  near(convert('mass', 'lb', 'kg', 1), 0.45359237);
  near(convert('mass', 'kg', 'lb', 1), 2.2046226218488, 'kilogram in pounds');
  near(convert('mass', 'oz', 'g', 1), 28.349523125);
  near(convert('mass', 'tr_oz', 'g', 1), 31.1034768, 'gold is weighed in troy ounces');
  near(convert('mass', 'st', 'lb', 1), 14);
  near(convert('mass', 'ton_uk', 'lb', 1), 2240);
  near(convert('mass', 'ton_us', 'lb', 1), 2000);
});

test('volume: US and imperial gallons are different sizes', () => {
  near(convert('volume', 'gal_us', 'L', 1), 3.785411784);
  near(convert('volume', 'gal_uk', 'L', 1), 4.54609);
  near(convert('volume', 'gal_us', 'floz_us', 1), 128);
  near(convert('volume', 'gal_uk', 'floz_uk', 1), 160);
  near(convert('volume', 'm3', 'L', 1), 1000);
  near(convert('volume', 'ft3', 'L', 1), 28.316846592);
  near(convert('volume', 'bbl', 'gal_us', 1), 42, 'an oil barrel is 42 US gallons');
  // 台升 = Japanese shō = 2401/1331 L exactly.
  near(convert('volume', 'sheng', 'mL', 1), 1803.9068369647);
  near(convert('volume', 'dou', 'sheng', 1), 10);
});

test('speed: knots, mph and running pace', () => {
  near(convert('speed', 'kn', 'km_h', 1), 1.852);
  near(convert('speed', 'mph', 'km_h', 1), 1.609344);
  near(convert('speed', 'km_h', 'm_s', 36), 10);
  near(convert('speed', 'c', 'm_s', 1), 299792458);
  // 4:00/km is 15 km/h; the relationship is a reciprocal, so it must invert.
  near(convert('speed', 'min_km', 'km_h', 4), 15);
  near(convert('speed', 'km_h', 'min_km', 15), 4);
  near(convert('speed', 'min_km', 'min_mi', 4), 6.437376, 'pace per mile');
  // Zero or negative pace has no speed; it must not silently come back as ∞.
  assert.ok(Number.isNaN(convert('speed', 'min_km', 'km_h', 0)));
  assert.ok(Number.isNaN(convert('speed', 'min_km', 'km_h', -3)));
});

test('pressure: psi and mmHg against the standard atmosphere', () => {
  near(convert('pressure', 'atm', 'Pa', 1), 101325);
  near(convert('pressure', 'atm', 'mmHg', 1), 760);
  near(convert('pressure', 'atm', 'psi', 1), 14.695948775513, '1 atm in psi');
  near(convert('pressure', 'psi', 'Pa', 1), 6894.757293168361);
  near(convert('pressure', 'bar', 'kPa', 1), 100);
  near(convert('pressure', 'psi', 'kgf_cm2', 32), 2.2498226548453, 'a car tyre');
});

test('data: decimal and binary prefixes are kept apart', () => {
  near(convert('data', 'GiB', 'B', 1), 1073741824);
  near(convert('data', 'GB', 'B', 1), 1e9);
  near(convert('data', 'GB', 'GiB', 1), 0.9313225746155, 'the missing 7% on a disk label');
  near(convert('data', 'TB', 'TiB', 1), 0.9094947017729);
  near(convert('data', 'B', 'bit', 1), 8);
  near(convert('data', 'MiB', 'KiB', 1), 1024);
});

test('energy: kWh, calories and BTU', () => {
  near(convert('energy', 'kWh', 'J', 1), 3.6e6);
  near(convert('energy', 'kWh', 'kcal', 1), 860.4206500956, 'one unit of electricity');
  near(convert('energy', 'kcal', 'J', 1), 4184);
  near(convert('energy', 'BTU', 'J', 1), 1055.05585262);
  near(convert('energy', 'eV', 'J', 1), 1.602176634e-19);
  near(convert('energy', 'tnt_t', 'J', 1), 4.184e9);
});

test('every unit round-trips through every other unit in its dimension', () => {
  for (const dim of DIMENSIONS) {
    for (const from of dim.units) {
      for (const to of dim.units) {
        // 7 rather than 1 so an affine unit cannot pass by symmetry alone.
        const there = convert(dim.id, from.id, to.id, 7);
        const back = convert(dim.id, to.id, from.id, there);
        assert.ok(
          Number.isFinite(back),
          `${dim.id}: ${from.id}→${to.id}→${from.id} produced ${back}`
        );
        const tolerance = Math.max(7 * 1e-9, 1e-9);
        assert.ok(
          Math.abs(back - 7) <= tolerance,
          `${dim.id}: ${from.id}→${to.id}→${from.id} gave ${back}, not 7`
        );
      }
    }
  }
});

test('identity conversion is exactly the input', () => {
  for (const dim of DIMENSIONS) {
    for (const u of dim.units) {
      if (u.reciprocal) continue;
      assert.equal(convert(dim.id, u.id, u.id, 1.5), 1.5, `${dim.id}/${u.id}`);
    }
  }
});

test('non-finite input stays non-finite instead of becoming a number', () => {
  assert.ok(Number.isNaN(convert('length', 'm', 'ft', Number.NaN)));
  assert.ok(Number.isNaN(convert('length', 'm', 'ft', Number.POSITIVE_INFINITY)));
});

test('unknown dimensions and units throw rather than return 0', () => {
  assert.throws(() => dimension('nope' as 'length'), /unknown dimension/);
  assert.throws(() => unit('length', 'furlong'), /unknown unit/);
  assert.throws(() => convert('length', 'm', 'furlong', 1), /unknown unit/);
});

test('convertAll covers the whole dimension in declaration order', () => {
  const rows = convertAll('length', 'm', 1);
  assert.equal(rows.length, dimension('length').units.length);
  assert.deepEqual(
    rows.map((row) => row.unit.id),
    dimension('length').units.map((u) => u.id)
  );
  const metre = rows.find((row) => row.unit.id === 'm');
  assert.equal(metre?.value, 1);
});

test('parseAmount accepts what people actually paste', () => {
  assert.equal(parseAmount('42'), 42);
  assert.equal(parseAmount('  -3.5 '), -3.5);
  assert.equal(parseAmount('1,234,567.25'), 1234567.25);
  assert.equal(parseAmount('+7'), 7);
  assert.equal(parseAmount('1e3'), 1000);
  assert.equal(parseAmount('2.5E-3'), 0.0025);
  assert.equal(parseAmount('.5'), 0.5);
  assert.equal(parseAmount('12.'), 12);
  // Full-width digits, from copying out of a Chinese-language page.
  assert.equal(parseAmount('１２３．５'), 123.5);
  assert.equal(parseAmount('1 234'), 1234);
});

test('parseAmount refuses anything it cannot read', () => {
  for (const bad of ['', '   ', '-', 'abc', '1.2.3', '5坪', '1/2', 'Infinity', 'NaN', '0x10', '--1']) {
    assert.ok(Number.isNaN(parseAmount(bad)), `${JSON.stringify(bad)} should not parse`);
  }
});

test('formatQuantity hides float noise without hiding real digits', () => {
  assert.equal(formatQuantity(0), '0');
  assert.equal(formatQuantity(2.54), '2.54');
  assert.equal(formatQuantity(1 / 0.0254), '39.3700787402');
  assert.equal(formatQuantity(1 / 3), '0.333333333333');
  assert.equal(formatQuantity(-1609.344), '-1609.344');
  assert.equal(formatQuantity(Number.NaN), '—');
  assert.equal(formatQuantity(Number.POSITIVE_INFINITY), '—');
  // 0.1 + 0.2 must not print as 0.30000000000000004.
  assert.equal(formatQuantity(0.1 + 0.2), '0.3');
});

test('formatQuantity groups only the integer part, sign included', () => {
  assert.equal(formatQuantity(1234567.25, true), '1,234,567.25');
  assert.equal(formatQuantity(-1234.5, true), '-1,234.5');
  assert.equal(formatQuantity(999, true), '999');
  assert.equal(formatQuantity(1000, true), '1,000');
  assert.equal(formatQuantity(0.12345, true), '0.12345');
});

test('formatQuantity falls back to exponent notation at the extremes', () => {
  assert.ok(formatQuantity(1e20).includes('e+'));
  assert.ok(formatQuantity(1e-9).includes('e-'));
  assert.equal(formatQuantity(9.460730472580800e15), '9.460730e+15');
});

test('a separator is only accepted where a thousands separator belongs', () => {
  // "1 2" is a typo, not the number 12: stripping all whitespace accepted it
  // silently, which is the worst possible reading of a mistyped amount.
  for (const bad of ['1 2', '1 23', '1,2', '1,23', '12,3456', '1 234 56', '1.234 5', '1.2 3', '1_2', '1、2']) {
    assert.ok(Number.isNaN(parseAmount(bad)), `${JSON.stringify(bad)} should not parse`);
  }
  // Real grouping still works, in every separator this field has ever seen.
  assert.equal(parseAmount('1 234'), 1234);
  assert.equal(parseAmount('12 345'), 12345);
  assert.equal(parseAmount('1,234,567.25'), 1234567.25);
  assert.equal(parseAmount('1_234_567'), 1234567);
  assert.equal(parseAmount('1、234'), 1234);
  assert.equal(parseAmount('-2 500.5'), -2500.5);
  assert.equal(parseAmount('１，２３４'), 1234, 'full-width digits and comma');
  // And a number with no separators at all is untouched by the rule.
  assert.equal(parseAmount('1234567'), 1234567);
  assert.equal(parseAmount('0.000125'), 0.000125);
});
