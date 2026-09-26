/**
 * Recipe scaling, volume↔mass conversion by ingredient, and oven temperatures.
 *
 * The conversion arithmetic is trivial; what makes recipe conversion go wrong
 * is that a "cup" is four different volumes and that a cup of flour is not a
 * fixed mass. Both are handled explicitly:
 *
 *  - Every volume unit carries its millilitres, and the US, metric, Australian
 *    and Japanese/Taiwanese rice-cooker measures are separate entries rather
 *    than one averaged "cup".
 *  - Densities are a starting table that the page lets you edit, because how
 *    hard you pack the cup changes a flour measurement by twenty percent or
 *    more. That is not a rounding error — it is the difference between bread
 *    and a brick.
 */

/* ── Numbers as cooks write them ──────────── */

const VULGAR: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅐': 1 / 7,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
};

const VULGAR_CHARS = Object.keys(VULGAR).join('');

/**
 * `2`, `2.5`, `1/2`, `1 1/2`, `1½`, `½`. Returns the value and whether the text
 * was written as a fraction, so the scaled result can be written the same way.
 */
export function parseAmount(text: string): { value: number; fractional: boolean } | null {
  const trimmed = text.trim().replace(/,/g, '');
  if (trimmed === '') return null;

  // Integer or decimal, optionally followed by a vulgar fraction: `1½`.
  const mixedVulgar = new RegExp(`^(\\d+)\\s*([${VULGAR_CHARS}])$`).exec(trimmed);
  if (mixedVulgar) {
    return { value: Number(mixedVulgar[1]) + VULGAR[mixedVulgar[2]], fractional: true };
  }
  const bareVulgar = new RegExp(`^([${VULGAR_CHARS}])$`).exec(trimmed);
  if (bareVulgar) return { value: VULGAR[bareVulgar[1]], fractional: true };

  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(trimmed);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return { value: Number(mixed[1]) + Number(mixed[2]) / denominator, fractional: true };
  }

  const simple = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (simple) {
    const denominator = Number(simple[2]);
    if (denominator === 0) return null;
    return { value: Number(simple[1]) / denominator, fractional: true };
  }

  if (/^\d*\.?\d+$/.test(trimmed)) return { value: Number(trimmed), fractional: false };
  return null;
}

const NICE_DENOMINATORS = [2, 3, 4, 8];

/**
 * The nearest cook-friendly fraction, as a mixed number with a vulgar glyph
 * where one exists. Denominators beyond eighths are not useful in a kitchen, so
 * anything that does not land near one comes back as a decimal instead.
 */
export function formatFraction(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 0) return `-${formatFraction(-value)}`;
  const whole = Math.floor(value + 1e-9);
  const remainder = value - whole;
  if (remainder < 1e-6) return String(whole);

  for (const denominator of NICE_DENOMINATORS) {
    const numerator = Math.round(remainder * denominator);
    if (numerator === 0 || numerator >= denominator) continue;
    if (Math.abs(remainder - numerator / denominator) > 0.012) continue;
    const glyph = Object.entries(VULGAR).find(
      ([, amount]) => Math.abs(amount - numerator / denominator) < 1e-9
    )?.[0];
    const fraction = glyph ?? `${numerator}/${denominator}`;
    return whole === 0 ? fraction : `${whole}${glyph ? '' : ' '}${fraction}`;
  }
  return formatDecimal(value);
}

/** Decimal with a sensible number of places for the magnitude, zeros trimmed. */
export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const places = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return Number(value.toFixed(places)).toString();
}

export function formatAmount(value: number, fractional: boolean): string {
  return fractional ? formatFraction(value) : formatDecimal(value);
}

/* ── Units ────────────────────────────────── */

export type VolumeUnit = { id: string; ml: number };

/**
 * Every volume measure with its own millilitres, because they genuinely differ:
 * a US cup is 236.6 mL, the metric cup is 250, and the Japanese rice-cooker cup
 * — the one that comes with a rice cooker sold in Taiwan, 1 合 — is 180. Using
 * the wrong one on a cup of liquid is a 39% error.
 */
export const VOLUME_UNITS: VolumeUnit[] = [
  { id: 'ml', ml: 1 },
  { id: 'l', ml: 1000 },
  { id: 'tsp-us', ml: 4.92892159375 },
  { id: 'tsp-metric', ml: 5 },
  { id: 'tbsp-us', ml: 14.78676478125 },
  { id: 'tbsp-metric', ml: 15 },
  { id: 'tbsp-au', ml: 20 },
  { id: 'cup-us', ml: 236.5882365 },
  { id: 'cup-us-legal', ml: 240 },
  { id: 'cup-metric', ml: 250 },
  { id: 'cup-rice', ml: 180 },
  { id: 'floz-us', ml: 29.5735295625 },
  { id: 'floz-uk', ml: 28.4130625 },
  { id: 'pint-us', ml: 473.176473 },
  { id: 'quart-us', ml: 946.352946 },
];

export type MassUnit = { id: string; grams: number };

/**
 * Includes the Taiwanese market units, which are exact by statute: 1 台斤 is
 * 600 g, 1 台兩 is 37.5 g, 1 錢 is 3.75 g. A recipe or a market receipt in
 * 斤 is not pounds, and treating it as pounds is a 32% error.
 */
export const MASS_UNITS: MassUnit[] = [
  { id: 'g', grams: 1 },
  { id: 'kg', grams: 1000 },
  { id: 'oz', grams: 28.349523125 },
  { id: 'lb', grams: 453.59237 },
  { id: 'tw-jin', grams: 600 },
  { id: 'tw-liang', grams: 37.5 },
  { id: 'tw-qian', grams: 3.75 },
];

export function volumeUnit(id: string): VolumeUnit | undefined {
  return VOLUME_UNITS.find((entry) => entry.id === id);
}

export function massUnit(id: string): MassUnit | undefined {
  return MASS_UNITS.find((entry) => entry.id === id);
}

export function convertVolume(amount: number, from: string, to: string): number | null {
  const a = volumeUnit(from);
  const b = volumeUnit(to);
  if (!a || !b || !Number.isFinite(amount)) return null;
  return (amount * a.ml) / b.ml;
}

export function convertMass(amount: number, from: string, to: string): number | null {
  const a = massUnit(from);
  const b = massUnit(to);
  if (!a || !b || !Number.isFinite(amount)) return null;
  return (amount * a.grams) / b.grams;
}

/* ── Densities ────────────────────────────── */

export type Ingredient = { id: string; gPerMl: number; zh: string; en: string };

/**
 * Bulk density in grams per millilitre — for a powder this is not the material
 * density but how much of it ends up in a measuring cup, which is why flour
 * appears at about half the density of water.
 *
 * Figures are the spoon-and-level convention (spoon the flour into the cup and
 * level the top) at roughly 0.53 g/mL for plain flour, i.e. about 125 g per US
 * cup. Dipping the cup into the bag instead packs it and gives 140–150 g — the
 * same recipe, twenty percent more flour. Any table like this is therefore a
 * starting point, which is why the page lets you replace it with the number
 * your own scale gives. Reviewed 2025-09.
 */
export const INGREDIENTS: Ingredient[] = [
  { id: 'water', gPerMl: 1, zh: '水', en: 'water' },
  { id: 'milk', gPerMl: 1.03, zh: '全脂鮮奶', en: 'whole milk' },
  { id: 'cream', gPerMl: 0.994, zh: '動物性鮮奶油', en: 'heavy cream' },
  { id: 'oil', gPerMl: 0.92, zh: '植物油', en: 'vegetable oil' },
  // 0.96 rather than butterfat's 0.911: a US recipe's "1 cup of butter" means
  // two stick-marked halves, which is 227 g — that is the number to reproduce.
  { id: 'butter', gPerMl: 0.96, zh: '奶油(條裝)', en: 'butter, stick' },
  { id: 'honey', gPerMl: 1.42, zh: '蜂蜜', en: 'honey' },
  { id: 'maple', gPerMl: 1.32, zh: '楓糖漿', en: 'maple syrup' },
  { id: 'soy-sauce', gPerMl: 1.12, zh: '醬油', en: 'soy sauce' },
  { id: 'vinegar', gPerMl: 1.01, zh: '醋', en: 'vinegar' },
  { id: 'rice-wine', gPerMl: 0.98, zh: '米酒', en: 'rice wine' },
  { id: 'flour-ap', gPerMl: 0.53, zh: '中筋麵粉', en: 'all-purpose flour' },
  { id: 'flour-bread', gPerMl: 0.55, zh: '高筋麵粉', en: 'bread flour' },
  { id: 'flour-cake', gPerMl: 0.48, zh: '低筋麵粉', en: 'cake flour' },
  { id: 'flour-whole', gPerMl: 0.51, zh: '全麥麵粉', en: 'wholemeal flour' },
  { id: 'cornstarch', gPerMl: 0.51, zh: '玉米粉 / 太白粉', en: 'cornstarch' },
  { id: 'sugar-white', gPerMl: 0.85, zh: '細砂糖', en: 'granulated sugar' },
  { id: 'sugar-brown', gPerMl: 0.9, zh: '二砂 / 紅糖(壓實)', en: 'brown sugar, packed' },
  { id: 'sugar-powder', gPerMl: 0.51, zh: '糖粉', en: 'icing sugar' },
  { id: 'salt-fine', gPerMl: 1.22, zh: '精鹽 / 細鹽', en: 'fine table salt' },
  { id: 'salt-kosher', gPerMl: 0.6, zh: '粗鹽 / 猶太鹽', en: 'kosher salt' },
  { id: 'baking-powder', gPerMl: 0.81, zh: '泡打粉', en: 'baking powder' },
  { id: 'baking-soda', gPerMl: 0.93, zh: '小蘇打', en: 'bicarbonate of soda' },
  { id: 'cocoa', gPerMl: 0.42, zh: '無糖可可粉', en: 'cocoa powder' },
  { id: 'oats', gPerMl: 0.36, zh: '燕麥片', en: 'rolled oats' },
  { id: 'rice-raw', gPerMl: 0.78, zh: '生白米', en: 'raw white rice' },
  { id: 'cheese-grated', gPerMl: 0.4, zh: '起司絲', en: 'grated cheese' },
];

export function ingredient(id: string): Ingredient | undefined {
  return INGREDIENTS.find((entry) => entry.id === id);
}

/** `id:g per ml:中文:english` per line. `#` starts a comment. */
export function parseIngredients(text: string): Ingredient[] {
  const out: Ingredient[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [id, densityText, zh, ...rest] = trimmed.split(':');
    const gPerMl = Number((densityText ?? '').trim());
    const key = (id ?? '').trim();
    if (key === '' || !Number.isFinite(gPerMl) || gPerMl <= 0 || gPerMl > 25) continue;
    out.push({
      id: key,
      gPerMl,
      zh: (zh ?? '').trim() || key,
      en: rest.join(':').trim() || key,
    });
  }
  return out;
}

export function formatIngredients(list: readonly Ingredient[]): string {
  return list.map((entry) => `${entry.id}:${entry.gPerMl}:${entry.zh}:${entry.en}`).join('\n');
}

export function volumeToGrams(amount: number, unitId: string, gPerMl: number): number | null {
  const unit = volumeUnit(unitId);
  if (!unit || !Number.isFinite(amount) || !Number.isFinite(gPerMl) || gPerMl <= 0) return null;
  return amount * unit.ml * gPerMl;
}

export function gramsToVolume(grams: number, unitId: string, gPerMl: number): number | null {
  const unit = volumeUnit(unitId);
  if (!unit || !Number.isFinite(grams) || !Number.isFinite(gPerMl) || gPerMl <= 0) return null;
  return grams / gPerMl / unit.ml;
}

/* ── Oven temperature ─────────────────────── */

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export type GasMark = { mark: string; c: number; f: number };

/**
 * The British gas-mark table. The marks are not a linear scale and there is no
 * formula — it is a lookup, and the °C and °F columns in it are the rounded
 * figures cookbooks print rather than exact conversions of each other
 * (mark 4 is published as 180 °C and 350 °F; 180 °C is really 356 °F).
 */
export const GAS_MARKS: GasMark[] = [
  { mark: '¼', c: 110, f: 225 },
  { mark: '½', c: 120, f: 250 },
  { mark: '1', c: 140, f: 275 },
  { mark: '2', c: 150, f: 300 },
  { mark: '3', c: 170, f: 325 },
  { mark: '4', c: 180, f: 350 },
  { mark: '5', c: 190, f: 375 },
  { mark: '6', c: 200, f: 400 },
  { mark: '7', c: 220, f: 425 },
  { mark: '8', c: 230, f: 450 },
  { mark: '9', c: 240, f: 475 },
];

/** Nearest gas mark to a Celsius setting, with how far off it is. */
export function nearestGasMark(c: number): { mark: GasMark; offBy: number } | null {
  if (!Number.isFinite(c)) return null;
  let best = GAS_MARKS[0];
  for (const entry of GAS_MARKS) {
    if (Math.abs(entry.c - c) < Math.abs(best.c - c)) best = entry;
  }
  return { mark: best, offBy: c - best.c };
}

export function gasMarkToC(mark: string): number | null {
  return GAS_MARKS.find((entry) => entry.mark === mark)?.c ?? null;
}

/**
 * Fan (convection) ovens move hot air over the food, so the same browning
 * happens about 20 °C lower. Manufacturers print 20 °C; some say 25. The
 * adjustment is an approximation either way, and small ovens run hotter than
 * their dial in the first place — an oven thermometer settles the argument.
 */
export const FAN_OFFSET_C = 20;

export function fanFromConventional(c: number): number {
  return c - FAN_OFFSET_C;
}

export function conventionalFromFan(c: number): number {
  return c + FAN_OFFSET_C;
}

/** Round to a setting an oven dial can actually be set to. */
export function roundOven(c: number, step = 5): number {
  if (!Number.isFinite(c)) return Number.NaN;
  return Math.round(c / step) * step;
}

/* ── Recipe scaling ───────────────────────── */

/**
 * Tokens that mean the number in front of them is not a quantity of anything.
 * Scaling an oven temperature or a baking time by 1.5 is the single most
 * damaging thing a recipe scaler can do, so they are excluded by name.
 */
const NOT_A_QUANTITY =
  /^\s*(?:°|℃|℉|度|分鐘|分鍾|分|秒鐘|秒|小時|鐘頭|吋|英吋|公分|公釐|inch(?:es)?|in\b|cm\b|mm\b|min(?:s|ute|utes)?\b|hour?s?\b|hrs?\b|sec(?:s|ond|onds)?\b|%|％)/i;

/** `9x13`: both numbers are a tin size, not a quantity of anything. */
const DIMENSION_AFTER = /^\s*[x×*]\s*\d/i;
const DIMENSION_BEFORE = /\d\s*[x×*]\s*$/i;

/** `gas mark 4` is a dial position. */
const DIAL_BEFORE = /(?:gas\s*mark|mark|瓦斯刻度)\s*$/i;

/**
 * A bare `C` or `F` after the number. It cannot be excluded unconditionally,
 * because an American recipe writes two cups as `2 C` — so it only counts as a
 * degree symbol when the number is oven-sized. Nobody measures 90 cups.
 */
const BARE_DEGREE_AFTER = /^\s*°?\s*[CF]\b/i;
const OVEN_SCALE_FLOOR = 90;

const NUMBER_TOKEN = new RegExp(`\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?\\s*[${VULGAR_CHARS}]|[${VULGAR_CHARS}]|\\d+(?:\\.\\d+)?`, 'g');

export const MAX_RECIPE_LINES = 400;

/**
 * Multiplies the quantities on one line, leaving temperatures, times and tin
 * sizes alone. A number written as a fraction comes back as a fraction.
 */
export function scaleLine(line: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return line;
  return line.replace(NUMBER_TOKEN, (token, offset: number) => {
    const before = line.slice(0, offset);
    const after = line.slice(offset + token.length);
    if (NOT_A_QUANTITY.test(after)) return token;
    if (DIMENSION_AFTER.test(after) || DIMENSION_BEFORE.test(before)) return token;
    if (DIAL_BEFORE.test(before)) return token;
    const parsed = parseAmount(token);
    if (!parsed) return token;
    if (BARE_DEGREE_AFTER.test(after) && parsed.value >= OVEN_SCALE_FLOOR) return token;
    return formatAmount(parsed.value * factor, parsed.fractional);
  });
}

export function scaleRecipe(
  text: string,
  factor: number
): { text: string; truncated: boolean } {
  const lines = text.split('\n');
  const truncated = lines.length > MAX_RECIPE_LINES;
  const kept = lines.slice(0, MAX_RECIPE_LINES).map((line) => scaleLine(line, factor));
  return { text: kept.join('\n'), truncated };
}

/** Target servings over original servings, or null when either is unusable. */
export function scaleFactor(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from <= 0 || to <= 0) return null;
  return to / from;
}
