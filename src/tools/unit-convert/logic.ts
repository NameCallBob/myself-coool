/**
 * Unit conversion by exact ratio to a per-dimension base unit.
 *
 * Every factor here is the *defining* ratio, written as the fraction it is
 * defined by wherever the decimal form would round. An inch is 0.0254 m by
 * international agreement (1959), not by measurement, so it is written that
 * way; a Taiwanese 坪 is 400/121 m² because a 台尺 is defined as 10/33 m, and
 * writing 3.3058 instead would put a visible error into a property listing.
 *
 * Temperature is the exception: Celsius, Fahrenheit and Rankine are affine,
 * not proportional, so those units carry a pair of functions instead of a
 * factor. Multiplying a temperature by a ratio is the classic wrong answer
 * (20°C is not "twice" 10°C), and the type here makes that impossible to
 * express rather than merely discouraged.
 */

export type DimensionId =
  | 'length'
  | 'mass'
  | 'temperature'
  | 'area'
  | 'volume'
  | 'speed'
  | 'pressure'
  | 'data'
  | 'energy';

export type Unit = {
  id: string;
  zh: string;
  en: string;
  /** Multiplier to the dimension base. Present on every proportional unit. */
  factor?: number;
  /** Affine conversion in, for temperature only. */
  toBase?: (value: number) => number;
  /** Affine conversion out, for temperature only. */
  fromBase?: (value: number) => number;
  /**
   * The definition is conventional or environment-dependent rather than
   * exact — Mach depends on air temperature, a "cup" depends on the country.
   * The UI marks these so nobody quotes them as a measurement.
   */
  approx?: boolean;
  /**
   * The unit is the reciprocal of the base, not a multiple of it. Running pace
   * is the only case: minutes per kilometre goes *down* as speed goes up, so
   * no factor can express it.
   */
  reciprocal?: boolean;
};

export type Dimension = {
  id: DimensionId;
  zh: string;
  en: string;
  /** Base unit id. Its factor is 1 (or identity, for temperature). */
  base: string;
  units: Unit[];
};

/** A 台尺 is 10/33 m, which is where every other Taiwanese unit comes from. */
const CHI = 10 / 33;

export const DIMENSIONS: Dimension[] = [
  {
    id: 'length',
    zh: '長度',
    en: 'Length',
    base: 'm',
    units: [
      { id: 'nm', zh: '奈米', en: 'nanometre', factor: 1e-9 },
      { id: 'um', zh: '微米', en: 'micrometre', factor: 1e-6 },
      { id: 'mm', zh: '公釐', en: 'millimetre', factor: 1e-3 },
      { id: 'cm', zh: '公分', en: 'centimetre', factor: 1e-2 },
      { id: 'm', zh: '公尺', en: 'metre', factor: 1 },
      { id: 'km', zh: '公里', en: 'kilometre', factor: 1000 },
      { id: 'in', zh: '英寸', en: 'inch', factor: 0.0254 },
      { id: 'ft', zh: '英尺', en: 'foot', factor: 0.3048 },
      { id: 'yd', zh: '碼', en: 'yard', factor: 0.9144 },
      { id: 'mi', zh: '英里', en: 'mile', factor: 1609.344 },
      { id: 'nmi', zh: '海里', en: 'nautical mile', factor: 1852 },
      { id: 'chi', zh: '台尺', en: 'Taiwanese chi', factor: CHI },
      { id: 'cun', zh: '台寸', en: 'Taiwanese cun', factor: CHI / 10 },
      { id: 'zhang', zh: '台丈', en: 'Taiwanese zhang', factor: CHI * 10 },
      { id: 'au', zh: '天文單位', en: 'astronomical unit', factor: 149_597_870_700 },
      { id: 'ly', zh: '光年', en: 'light year', factor: 9_460_730_472_580_800 },
    ],
  },
  {
    id: 'mass',
    zh: '重量',
    en: 'Mass',
    base: 'kg',
    units: [
      { id: 'mg', zh: '毫克', en: 'milligram', factor: 1e-6 },
      { id: 'g', zh: '公克', en: 'gram', factor: 1e-3 },
      { id: 'kg', zh: '公斤', en: 'kilogram', factor: 1 },
      { id: 't', zh: '公噸', en: 'tonne', factor: 1000 },
      { id: 'oz', zh: '英兩', en: 'ounce', factor: 0.028_349_523_125 },
      { id: 'lb', zh: '英磅', en: 'pound', factor: 0.453_592_37 },
      { id: 'st', zh: '英石', en: 'stone', factor: 6.350_293_18 },
      { id: 'ton_us', zh: '美噸', en: 'short ton', factor: 907.184_74 },
      { id: 'ton_uk', zh: '英噸', en: 'long ton', factor: 1016.046_908_8 },
      { id: 'jin', zh: '台斤', en: 'Taiwanese catty', factor: 0.6 },
      { id: 'liang', zh: '台兩', en: 'Taiwanese tael', factor: 0.6 / 16 },
      { id: 'qian', zh: '台錢', en: 'Taiwanese qian', factor: 0.6 / 160 },
      { id: 'jin_cn', zh: '市斤(中國)', en: 'mainland jin', factor: 0.5 },
      { id: 'ct', zh: '克拉', en: 'carat', factor: 0.0002 },
      { id: 'tr_oz', zh: '金衡盎司', en: 'troy ounce', factor: 0.031_103_476_8 },
    ],
  },
  {
    id: 'temperature',
    zh: '溫度',
    en: 'Temperature',
    base: 'K',
    units: [
      {
        id: 'C',
        zh: '攝氏',
        en: 'Celsius',
        toBase: (v) => v + 273.15,
        fromBase: (v) => v - 273.15,
      },
      {
        id: 'F',
        zh: '華氏',
        en: 'Fahrenheit',
        toBase: (v) => ((v - 32) * 5) / 9 + 273.15,
        fromBase: (v) => ((v - 273.15) * 9) / 5 + 32,
      },
      { id: 'K', zh: '克耳文', en: 'kelvin', toBase: (v) => v, fromBase: (v) => v },
      {
        id: 'R',
        zh: '蘭氏',
        en: 'Rankine',
        toBase: (v) => (v * 5) / 9,
        fromBase: (v) => (v * 9) / 5,
      },
    ],
  },
  {
    id: 'area',
    zh: '面積',
    en: 'Area',
    base: 'm2',
    units: [
      { id: 'mm2', zh: '平方公釐', en: 'square millimetre', factor: 1e-6 },
      { id: 'cm2', zh: '平方公分', en: 'square centimetre', factor: 1e-4 },
      { id: 'm2', zh: '平方公尺', en: 'square metre', factor: 1 },
      { id: 'km2', zh: '平方公里', en: 'square kilometre', factor: 1e6 },
      { id: 'a', zh: '公畝', en: 'are', factor: 100 },
      { id: 'ha', zh: '公頃', en: 'hectare', factor: 10_000 },
      { id: 'in2', zh: '平方英寸', en: 'square inch', factor: 0.0254 ** 2 },
      { id: 'ft2', zh: '平方英尺', en: 'square foot', factor: 0.3048 ** 2 },
      { id: 'yd2', zh: '平方碼', en: 'square yard', factor: 0.9144 ** 2 },
      { id: 'acre', zh: '英畝', en: 'acre', factor: 4046.856_422_4 },
      { id: 'mi2', zh: '平方英里', en: 'square mile', factor: 1609.344 ** 2 },
      // 1 坪 = one square 間 = (6 台尺)² = (60/33 m)² = 400/121 m².
      { id: 'ping', zh: '坪', en: 'ping', factor: (CHI * 6) ** 2 },
      { id: 'chi2', zh: '平方台尺', en: 'square chi', factor: CHI ** 2 },
      // 1 甲 = 2934 坪 by the Japanese-era land survey, still used in deeds.
      { id: 'jia', zh: '甲', en: 'kah', factor: (CHI * 6) ** 2 * 2934 },
      { id: 'fen_land', zh: '分(地)', en: 'fen (land)', factor: (CHI * 6) ** 2 * 293.4 },
    ],
  },
  {
    id: 'volume',
    zh: '體積',
    en: 'Volume',
    base: 'L',
    units: [
      { id: 'mL', zh: '毫升', en: 'millilitre', factor: 1e-3 },
      { id: 'cL', zh: '公合', en: 'centilitre', factor: 1e-2 },
      { id: 'L', zh: '公升', en: 'litre', factor: 1 },
      { id: 'm3', zh: '立方公尺', en: 'cubic metre', factor: 1000 },
      { id: 'cm3', zh: '立方公分', en: 'cubic centimetre', factor: 1e-3 },
      { id: 'in3', zh: '立方英寸', en: 'cubic inch', factor: 0.0254 ** 3 * 1000 },
      { id: 'ft3', zh: '立方英尺', en: 'cubic foot', factor: 0.3048 ** 3 * 1000 },
      { id: 'gal_us', zh: '美加侖', en: 'US gallon', factor: 3.785_411_784 },
      { id: 'gal_uk', zh: '英加侖', en: 'imperial gallon', factor: 4.546_09 },
      { id: 'qt_us', zh: '美夸脫', en: 'US quart', factor: 3.785_411_784 / 4 },
      { id: 'pt_us', zh: '美品脫', en: 'US pint', factor: 3.785_411_784 / 8 },
      { id: 'floz_us', zh: '美液盎司', en: 'US fluid ounce', factor: 3.785_411_784 / 128 },
      { id: 'floz_uk', zh: '英液盎司', en: 'imperial fluid ounce', factor: 4.546_09 / 160 },
      // Metric cup and spoon: the kitchen convention, not a legal definition.
      { id: 'cup_m', zh: '量杯(公制 250 mL)', en: 'metric cup', factor: 0.25, approx: true },
      { id: 'tbsp', zh: '大匙(15 mL)', en: 'tablespoon', factor: 0.015, approx: true },
      { id: 'tsp', zh: '小匙(5 mL)', en: 'teaspoon', factor: 0.005, approx: true },
      { id: 'bbl', zh: '石油桶', en: 'oil barrel', factor: 158.987_294_928 },
      // 台升 inherits the Japanese shō, defined as 2401/1331 litre exactly.
      { id: 'sheng', zh: '台升', en: 'Taiwanese sheng', factor: 2401 / 1331 },
      { id: 'dou', zh: '台斗', en: 'Taiwanese dou', factor: (2401 / 1331) * 10 },
    ],
  },
  {
    id: 'speed',
    zh: '速度',
    en: 'Speed',
    base: 'm_s',
    units: [
      { id: 'm_s', zh: '公尺/秒', en: 'metre/second', factor: 1 },
      { id: 'km_h', zh: '公里/小時', en: 'km/hour', factor: 1000 / 3600 },
      { id: 'mph', zh: '英里/小時', en: 'mile/hour', factor: 1609.344 / 3600 },
      { id: 'ft_s', zh: '英尺/秒', en: 'foot/second', factor: 0.3048 },
      { id: 'kn', zh: '節', en: 'knot', factor: 1852 / 3600 },
      { id: 'min_km', zh: '分/公里(配速)', en: 'min/km (pace)', reciprocal: true },
      { id: 'min_mi', zh: '分/英里(配速)', en: 'min/mile (pace)', reciprocal: true },
      // Sea level, 15 °C dry air. Mach is a ratio, not a unit, so this is a
      // convenience with a stated condition rather than a conversion.
      { id: 'mach', zh: '馬赫(海平面 15°C)', en: 'Mach (sea level, 15°C)', factor: 340.294, approx: true },
      { id: 'c', zh: '光速', en: 'speed of light', factor: 299_792_458 },
    ],
  },
  {
    id: 'pressure',
    zh: '壓力',
    en: 'Pressure',
    base: 'Pa',
    units: [
      { id: 'Pa', zh: '帕', en: 'pascal', factor: 1 },
      { id: 'hPa', zh: '百帕', en: 'hectopascal', factor: 100 },
      { id: 'kPa', zh: '千帕', en: 'kilopascal', factor: 1000 },
      { id: 'MPa', zh: '兆帕', en: 'megapascal', factor: 1e6 },
      { id: 'bar', zh: '巴', en: 'bar', factor: 100_000 },
      { id: 'mbar', zh: '毫巴', en: 'millibar', factor: 100 },
      { id: 'atm', zh: '標準大氣壓', en: 'atmosphere', factor: 101_325 },
      { id: 'mmHg', zh: '毫米汞柱', en: 'mmHg / torr', factor: 101_325 / 760 },
      // psi = lbf / in²; lbf = 0.45359237 kg × 9.80665 m/s².
      { id: 'psi', zh: '磅力/平方英寸', en: 'psi', factor: (0.453_592_37 * 9.806_65) / 0.0254 ** 2 },
      { id: 'kgf_cm2', zh: '公斤力/平方公分', en: 'kgf/cm²', factor: 98_066.5 },
      { id: 'inH2O', zh: '英寸水柱', en: 'inch of water (4°C)', factor: 249.082, approx: true },
    ],
  },
  {
    id: 'data',
    zh: '資料量',
    en: 'Data',
    base: 'B',
    units: [
      { id: 'bit', zh: '位元', en: 'bit', factor: 1 / 8 },
      { id: 'B', zh: '位元組', en: 'byte', factor: 1 },
      { id: 'kB', zh: 'kB(10³)', en: 'kB (10³)', factor: 1e3 },
      { id: 'MB', zh: 'MB(10⁶)', en: 'MB (10⁶)', factor: 1e6 },
      { id: 'GB', zh: 'GB(10⁹)', en: 'GB (10⁹)', factor: 1e9 },
      { id: 'TB', zh: 'TB(10¹²)', en: 'TB (10¹²)', factor: 1e12 },
      { id: 'PB', zh: 'PB(10¹⁵)', en: 'PB (10¹⁵)', factor: 1e15 },
      { id: 'KiB', zh: 'KiB(2¹⁰)', en: 'KiB (2¹⁰)', factor: 1024 },
      { id: 'MiB', zh: 'MiB(2²⁰)', en: 'MiB (2²⁰)', factor: 1024 ** 2 },
      { id: 'GiB', zh: 'GiB(2³⁰)', en: 'GiB (2³⁰)', factor: 1024 ** 3 },
      { id: 'TiB', zh: 'TiB(2⁴⁰)', en: 'TiB (2⁴⁰)', factor: 1024 ** 4 },
      { id: 'PiB', zh: 'PiB(2⁵⁰)', en: 'PiB (2⁵⁰)', factor: 1024 ** 5 },
    ],
  },
  {
    id: 'energy',
    zh: '能量',
    en: 'Energy',
    base: 'J',
    units: [
      { id: 'J', zh: '焦耳', en: 'joule', factor: 1 },
      { id: 'kJ', zh: '千焦', en: 'kilojoule', factor: 1000 },
      { id: 'MJ', zh: '兆焦', en: 'megajoule', factor: 1e6 },
      { id: 'cal', zh: '卡(熱化學)', en: 'calorie (thermochemical)', factor: 4.184 },
      { id: 'kcal', zh: '大卡', en: 'kilocalorie', factor: 4184 },
      { id: 'Wh', zh: '瓦時', en: 'watt-hour', factor: 3600 },
      { id: 'kWh', zh: '度(千瓦時)', en: 'kWh', factor: 3.6e6 },
      { id: 'eV', zh: '電子伏特', en: 'electronvolt', factor: 1.602_176_634e-19 },
      { id: 'BTU', zh: '英熱單位', en: 'BTU (IT)', factor: 1055.055_852_62 },
      { id: 'ftlb', zh: '英尺磅力', en: 'foot-pound', factor: 0.453_592_37 * 9.806_65 * 0.3048 },
      { id: 'tnt_t', zh: '公噸 TNT', en: 'tonne of TNT', factor: 4.184e9 },
    ],
  },
];

export function dimension(id: DimensionId): Dimension {
  const found = DIMENSIONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown dimension: ${id}`);
  return found;
}

export function unit(dim: DimensionId, id: string): Unit {
  const found = dimension(dim).units.find((entry) => entry.id === id);
  if (!found) throw new Error(`unknown unit ${id} in ${dim}`);
  return found;
}

/** Metres covered by the distance a pace unit is quoted per. */
const PACE_DISTANCE: Record<string, number> = { min_km: 1000, min_mi: 1609.344 };

/**
 * Converts `value` from one unit to another inside a dimension.
 *
 * Proportional units go through the base by multiply-then-divide. Affine units
 * go through their own pair of functions. `min/km` is neither — it is the
 * reciprocal of a speed — so it is converted explicitly rather than pretending
 * a factor exists for it.
 */
export function convert(dim: DimensionId, from: string, to: string, value: number): number {
  const a = unit(dim, from);
  const b = unit(dim, to);
  if (!Number.isFinite(value)) return Number.NaN;
  // Short-circuit the identity. Going through the base would multiply and then
  // divide by the same factor, and 1.5 × 0.0254 ÷ 0.0254 is 1.4999999999999998
  // — a value that renders as "1.5" but breaks an equality check downstream.
  if (from === to) return value;

  // Pace is symmetric in both directions: metres / (minutes × 60) either way.
  const pace = (u: Unit, v: number): number =>
    v > 0 ? PACE_DISTANCE[u.id] / (v * 60) : Number.NaN;

  const toBase = (u: Unit, v: number): number => {
    if (u.reciprocal) return pace(u, v);
    if (u.toBase) return u.toBase(v);
    return v * (u.factor as number);
  };
  const fromBase = (u: Unit, v: number): number => {
    if (u.reciprocal) return pace(u, v);
    if (u.fromBase) return u.fromBase(v);
    return v / (u.factor as number);
  };

  return fromBase(b, toBase(a, value));
}

export type Conversion = { unit: Unit; value: number };

/** Every unit in the dimension, for the column of results. */
export function convertAll(dim: DimensionId, from: string, value: number): Conversion[] {
  return dimension(dim).units.map((u) => ({ unit: u, value: convert(dim, from, u.id, value) }));
}

/**
 * Parses what a person types into a number field: thousands separators, a
 * leading +, full-width digits pasted from a Chinese-language page, and
 * scientific notation all appear in real input.
 *
 * Separators are only accepted where a thousands separator belongs — between
 * digits of the integer part, in groups of three. Deleting every separator
 * first was simpler and read "1 2" as twelve: a fat-fingered space turned two
 * keystrokes into a number nobody asked for, and the conversion below it looked
 * perfectly healthy. Grouping that does not check out is refused instead,
 * because a wrong amount is worse than an empty result.
 */
const SEPARATOR = /[,\s_、]/g;
const HAS_SEPARATOR = /[,\s_、]/;

/** `1 234 567`, `1,234`, `1_000`: one to three digits, then groups of three. */
const GROUPED = /^\d{1,3}(?:[,\s_、]\d{3})+$/;

export function parseAmount(text: string): number {
  const normalised = text
    .trim()
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/[．。]/g, '.')
    // Every space a paste can carry — NBSP, the en-to-hair range, ideographic —
    // becomes a plain one so the grouping rule sees them all alike.
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/[，﹐､]/g, ',')
    .replace(/^\+/, '');
  if (normalised === '' || normalised === '-') return Number.NaN;

  const sign = normalised.startsWith('-') ? '-' : '';
  const body = sign === '' ? normalised : normalised.slice(1);

  // Split off the fraction and the exponent; separators may appear in neither.
  const shape = /^([\d,\s_、]*)(\.\d*)?(e[+-]?\d+)?$/i.exec(body);
  if (!shape) return Number.NaN;
  const [, whole, fraction = '', exponent = ''] = shape;

  const wellFormed = HAS_SEPARATOR.test(whole) ? GROUPED.test(whole) : /^\d*$/.test(whole);
  if (!wellFormed) return Number.NaN;

  const digits = `${sign}${whole.replace(SEPARATOR, '')}${fraction}${exponent}`;
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(digits)) return Number.NaN;
  return Number(digits);
}

/**
 * Twelve significant digits, trailing zeros removed.
 *
 * Twelve rather than seventeen because binary floating point turns an exact
 * ratio like 1/0.0254 into 39.370078740157481 and printing every digit
 * advertises precision the conversion does not have; twelve keeps every digit
 * that is real for these magnitudes and hides the representation noise.
 */
export function formatQuantity(value: number, group = false): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-6) return value.toExponential(6);

  let text = value.toPrecision(12);
  if (text.includes('e')) return value.toExponential(6);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  if (!group) return text;

  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [whole, fraction] = body.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}
