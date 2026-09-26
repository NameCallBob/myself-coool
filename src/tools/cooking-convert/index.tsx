'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
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
  fToC,
  fanFromConventional,
  formatDecimal,
  formatIngredients,
  gramsToVolume,
  nearestGasMark,
  parseIngredients,
  roundOven,
  scaleFactor,
  scaleRecipe,
  volumeToGrams,
  volumeUnit,
} from './logic';

function volumeLabel(l: Loc, id: string): string {
  switch (id) {
    case 'ml':
      return t(l, '毫升 mL', 'millilitre');
    case 'l':
      return t(l, '公升 L', 'litre');
    case 'tsp-us':
      return t(l, '美制小匙 tsp(4.93 mL)', 'US teaspoon (4.93 mL)');
    case 'tsp-metric':
      return t(l, '公制小匙(5 mL)', 'metric teaspoon (5 mL)');
    case 'tbsp-us':
      return t(l, '美制大匙 tbsp(14.79 mL)', 'US tablespoon (14.79 mL)');
    case 'tbsp-metric':
      return t(l, '公制大匙(15 mL)', 'metric tablespoon (15 mL)');
    case 'tbsp-au':
      return t(l, '澳洲大匙(20 mL)', 'Australian tablespoon (20 mL)');
    case 'cup-us':
      return t(l, '美制杯(236.6 mL)', 'US cup (236.6 mL)');
    case 'cup-us-legal':
      return t(l, '美國營養標示杯(240 mL)', 'US legal cup (240 mL)');
    case 'cup-metric':
      return t(l, '公制杯(250 mL)', 'metric cup (250 mL)');
    case 'cup-rice':
      return t(l, '電鍋米杯 / 1 合(180 mL)', 'rice-cooker cup, 1 gō (180 mL)');
    case 'floz-us':
      return t(l, '美制液量盎司', 'US fluid ounce');
    case 'floz-uk':
      return t(l, '英制液量盎司', 'UK fluid ounce');
    case 'pint-us':
      return t(l, '美制品脫', 'US pint');
    case 'quart-us':
      return t(l, '美制夸脫', 'US quart');
    default:
      return id;
  }
}

function massLabel(l: Loc, id: string): string {
  switch (id) {
    case 'g':
      return t(l, '公克 g', 'gram');
    case 'kg':
      return t(l, '公斤 kg', 'kilogram');
    case 'oz':
      return t(l, '盎司 oz', 'ounce');
    case 'lb':
      return t(l, '磅 lb', 'pound');
    case 'tw-jin':
      return t(l, '台斤(600 g)', 'Taiwanese catty (600 g)');
    case 'tw-liang':
      return t(l, '台兩(37.5 g)', 'Taiwanese tael (37.5 g)');
    case 'tw-qian':
      return t(l, '錢(3.75 g)', 'qian (3.75 g)');
    default:
      return id;
  }
}

const num = (text: string): number => {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : Number.NaN;
};

const SAMPLE = [
  '4 人份',
  '中筋麵粉 250 g',
  '細砂糖 1/2 cup',
  '無鹽奶油 100 g',
  '全蛋 2 顆',
  '鮮奶 ½ cup',
  '泡打粉 1 tsp',
  '',
  '烤箱預熱 180°C,烤 25 分鐘。',
].join('\n');

export default function CookingConvert({ l }: ToolProps) {
  const [fromServings, setFromServings] = useState('4');
  const [toServings, setToServings] = useState('6');
  const [recipe, setRecipe] = useState(SAMPLE);

  const [ingredientText, setIngredientText] = useState(formatIngredients(INGREDIENTS));
  const [showTable, setShowTable] = useState(false);
  const [pick, setPick] = useState('flour-ap');
  const [volumeAmount, setVolumeAmount] = useState('1');
  const [volumeUnitId, setVolumeUnitId] = useState('cup-us');
  const [gramsText, setGramsText] = useState('');
  const [direction, setDirection] = useState<'to-mass' | 'to-volume'>('to-mass');

  const [massAmount, setMassAmount] = useState('1');
  const [massFrom, setMassFrom] = useState('tw-jin');
  const [massTo, setMassTo] = useState('g');

  const [ovenC, setOvenC] = useState('180');
  const [fan, setFan] = useState(false);

  const list = useMemo(() => parseIngredients(ingredientText), [ingredientText]);
  const chosen = list.find((entry) => entry.id === pick) ?? list[0];

  const factor = scaleFactor(num(fromServings), num(toServings));
  const scaled = useMemo(
    () => (factor === null ? null : scaleRecipe(recipe, factor)),
    [recipe, factor]
  );

  const grams =
    chosen === undefined
      ? null
      : volumeToGrams(num(volumeAmount), volumeUnitId, chosen.gPerMl);
  const backVolume =
    chosen === undefined ? null : gramsToVolume(num(gramsText), volumeUnitId, chosen.gPerMl);

  const massOut = convertMass(num(massAmount), massFrom, massTo);

  const c = num(ovenC);
  const shown = fan ? fanFromConventional(c) : c;
  const gas = nearestGasMark(c);

  return (
    <div>
      <Bench
        leftLabel={t(l, '食譜', 'RECIPE')}
        rightLabel={t(l, '縮放後', 'SCALED')}
        leftAside={
          <span className="inst-no">
            {factor === null ? '—' : `×${formatDecimal(factor)}`}
          </span>
        }
        rightAside={scaled ? <CopyButton l={l} text={scaled.text} /> : null}
        left={
          <>
            <Row>
              <Input
                label={t(l, '原本份數', 'Original servings')}
                type="number"
                value={fromServings}
                onChange={setFromServings}
                min={0.5}
                step={0.5}
              />
              <Input
                label={t(l, '想做幾份', 'Target servings')}
                type="number"
                value={toServings}
                onChange={setToServings}
                min={0.5}
                step={0.5}
              />
            </Row>
            <Area
              label={t(l, '貼上食譜(一行一項)', 'Paste the recipe, one item per line')}
              value={recipe}
              onChange={setRecipe}
              rows={12}
            />
            <Row>
              <Btn onClick={() => setRecipe('')} disabled={recipe === ''}>
                {t(l, '清空', 'clear')}
              </Btn>
              <Btn onClick={() => setRecipe(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
            </Row>
            {factor === null ? (
              <Note error>{t(l, '份數要是大於 0 的數字。', 'Both serving counts must be greater than zero.')}</Note>
            ) : null}
            {scaled?.truncated ? (
              <Note error>
                {t(l, `超過 ${MAX_RECIPE_LINES} 行,只處理前面的。`, `Over ${MAX_RECIPE_LINES} lines — only the first were scaled.`)}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div className="inst-out" aria-live="polite" style={{ minHeight: '18rem', whiteSpace: 'pre-wrap' }}>
              {scaled?.text || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上食譜就會在這裡縮放。', 'The scaled recipe appears here.')}
                </span>
              )}
            </div>
            <Note>
              {t(
                l,
                '溫度、時間、烤模尺寸與百分比不會被乘:那是縮放食譜最容易搞壞的東西。份量放大之後烘烤時間通常要延長,但延長多少跟形狀與厚度有關,沒有公式可以套——用探針或竹籤判斷。另外調味、泡打粉與酵母在大幅放大時常常不是線性的,先按比例算,再依實際味道修。',
                'Temperatures, times, tin sizes and percentages are never multiplied — scaling those is what ruins a recipe. Baking time usually does grow with the batch, but by how much depends on shape and depth, and there is no formula: use a probe or a skewer. Seasoning, leavening and yeast are also not reliably linear on a large scale-up; take the proportional figure and then adjust by taste.'
              )}
            </Note>
          </>
        }
      />

      <Panel
        label={t(l, '杯匙與公克', 'CUPS, SPOONS, GRAMS')}
        aside={
          <Btn onClick={() => setShowTable(!showTable)}>
            {showTable ? t(l, '收起密度表', 'hide the density table') : t(l, '編輯密度表', 'edit the density table')}
          </Btn>
        }
      >
        <Row>
          <Select
            label={t(l, '食材', 'Ingredient')}
            value={chosen?.id ?? ''}
            onChange={setPick}
            options={list.map((entry) => ({
              value: entry.id,
              label: t(l, entry.zh, entry.en),
            }))}
          />
          <Select
            label={t(l, '體積單位', 'Volume unit')}
            value={volumeUnitId}
            onChange={setVolumeUnitId}
            options={VOLUME_UNITS.map((entry) => ({
              value: entry.id,
              label: volumeLabel(l, entry.id),
            }))}
          />
          <Select
            label={t(l, '方向', 'Direction')}
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'to-mass', label: t(l, '體積 → 公克', 'volume → grams') },
              { value: 'to-volume', label: t(l, '公克 → 體積', 'grams → volume') },
            ]}
          />
        </Row>

        {direction === 'to-mass' ? (
          <Row>
            <Input
              label={t(l, '數量', 'Amount')}
              type="number"
              value={volumeAmount}
              onChange={setVolumeAmount}
              min={0}
              step={0.25}
            />
            <span className="inst-no" aria-live="polite" style={{ fontSize: 16 }}>
              = {grams === null ? '—' : `${formatDecimal(grams)} g`}
            </span>
          </Row>
        ) : (
          <Row>
            <Input
              label={t(l, '公克', 'Grams')}
              type="number"
              value={gramsText}
              onChange={setGramsText}
              min={0}
              step={1}
            />
            <span className="inst-no" aria-live="polite" style={{ fontSize: 16 }}>
              = {backVolume === null ? '—' : formatDecimal(backVolume)}{' '}
              {volumeUnit(volumeUnitId) ? volumeLabel(l, volumeUnitId) : ''}
            </span>
          </Row>
        )}

        {chosen ? (
          <p className="inst-hint">
            {t(l, '使用密度', 'density used')}: {chosen.gPerMl} g/mL ·{' '}
            {t(l, '一個美制杯約', 'about')} {formatDecimal(volumeToGrams(1, 'cup-us', chosen.gPerMl) ?? 0)} g{' '}
            {t(l, '/ 一小匙約', 'per US cup;')} {formatDecimal(volumeToGrams(1, 'tsp-us', chosen.gPerMl) ?? 0)} g{' '}
            {t(l, '', 'per US teaspoon')}
          </p>
        ) : null}

        <Note>
          {t(
            l,
            '粉類的「一杯」不是固定重量。用湯匙把麵粉舀進量杯再刮平大約 125 g,直接拿量杯去麵粉袋裡挖會壓實到 140–150 g——同一份食譜差了兩成的麵粉。真的要準就用電子秤;這張表只是沒有秤的時候的近似值,而且應該用你自己量過的數字取代。',
            'A "cup" of a powder is not a fixed weight. Spooning flour into the cup and levelling it gives about 125 g; dipping the cup into the bag packs it to 140–150 g — twenty percent more flour in the same recipe. If it matters, use a scale. This table is the approximation for when you have not got one, and it should be replaced with numbers you measured yourself.'
          )}
        </Note>

        {showTable ? (
          <>
            <Area
              label={t(l, '密度表(id:每毫升公克數:中文:English)', 'Density table (id:g per mL:Chinese:English)')}
              value={ingredientText}
              onChange={setIngredientText}
              rows={14}
            />
            <Row>
              <Btn onClick={() => setIngredientText(formatIngredients(INGREDIENTS))}>
                {t(l, '還原內建表', 'restore the built-in table')}
              </Btn>
              <span className="inst-no">
                {count(list.length)} {t(l, '項', 'rows')}
              </span>
            </Row>
          </>
        ) : (
          <Table
            head={[
              t(l, '食材', 'ingredient'),
              'g/mL',
              t(l, '美制杯', 'per US cup'),
              t(l, '公制杯', 'per metric cup'),
              t(l, '大匙', 'per tbsp'),
              t(l, '小匙', 'per tsp'),
            ]}
            rows={list.map((entry) => [
              <span
                key={entry.id}
                style={{ color: entry.id === chosen?.id ? 'var(--accent)' : undefined }}
              >
                {t(l, entry.zh, entry.en)}
              </span>,
              String(entry.gPerMl),
              `${formatDecimal(volumeToGrams(1, 'cup-us', entry.gPerMl) ?? 0)} g`,
              `${formatDecimal(volumeToGrams(1, 'cup-metric', entry.gPerMl) ?? 0)} g`,
              `${formatDecimal(volumeToGrams(1, 'tbsp-us', entry.gPerMl) ?? 0)} g`,
              `${formatDecimal(volumeToGrams(1, 'tsp-us', entry.gPerMl) ?? 0)} g`,
            ])}
          />
        )}
      </Panel>

      <Panel label={t(l, '重量單位', 'MASS UNITS')}>
        <Row>
          <Input label={t(l, '數量', 'Amount')} type="number" value={massAmount} onChange={setMassAmount} step={0.1} />
          <Select
            label={t(l, '從', 'From')}
            value={massFrom}
            onChange={setMassFrom}
            options={MASS_UNITS.map((entry) => ({ value: entry.id, label: massLabel(l, entry.id) }))}
          />
          <Select
            label={t(l, '到', 'To')}
            value={massTo}
            onChange={setMassTo}
            options={MASS_UNITS.map((entry) => ({ value: entry.id, label: massLabel(l, entry.id) }))}
          />
          <span className="inst-no" aria-live="polite" style={{ fontSize: 16 }}>
            = {massOut === null ? '—' : formatDecimal(massOut)}
          </span>
        </Row>
        <p className="inst-hint">
          {t(
            l,
            '台斤 600 g、台兩 37.5 g、錢 3.75 g,是法定換算值,不是近似。市場說的「一斤」是台斤,不是公斤也不是磅——當成磅算會少三成。',
            'The Taiwanese catty is exactly 600 g, the tael 37.5 g and the qian 3.75 g — statutory, not approximate. A market "jin" is a catty, not a kilogram and not a pound; treating it as a pound loses a third of the weight.'
          )}
        </p>
      </Panel>

      <Panel label={t(l, '烤箱溫度', 'OVEN TEMPERATURE')}>
        <Row>
          <Input
            label={t(l, '食譜寫的溫度 °C', 'Recipe temperature °C')}
            type="number"
            value={ovenC}
            onChange={setOvenC}
            step={5}
          />
          <Check2
            label={t(l, '我的烤箱是熱風循環(旋風)', 'my oven is fan-assisted')}
            checked={fan}
            onChange={setFan}
          />
        </Row>
        <Table
          head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
          rows={[
            [t(l, '攝氏', 'Celsius'), Number.isFinite(c) ? `${formatDecimal(c)} °C` : '—'],
            [t(l, '華氏', 'Fahrenheit'), Number.isFinite(c) ? `${fixed(cToF(c), 0)} °F` : '—'],
            [
              t(l, '英式瓦斯刻度', 'gas mark'),
              gas
                ? `${gas.mark.mark}${gas.offBy === 0 ? '' : t(l, `(表上是 ${gas.mark.c} °C,差 ${formatDecimal(Math.abs(gas.offBy))} 度)`, ` (table says ${gas.mark.c} °C, off by ${formatDecimal(Math.abs(gas.offBy))})`)}`
                : '—',
            ],
            [
              fan
                ? t(l, '你的旋風烤箱設定', 'set your fan oven to')
                : t(l, '若改用旋風烤箱', 'on a fan oven, set'),
              Number.isFinite(c) ? `${roundOven(fan ? shown : fanFromConventional(c))} °C` : '—',
            ],
            [
              t(l, '反向:旋風 → 傳統', 'reverse: fan → conventional'),
              Number.isFinite(c) ? `${roundOven(conventionalFromFan(c))} °C` : '—',
            ],
          ]}
        />
        <Table
          head={['°C', '°F', t(l, '瓦斯刻度', 'gas mark'), t(l, '旋風 °C', 'fan °C')]}
          rows={GAS_MARKS.map((entry) => [
            <span
              key={entry.mark}
              style={{ color: gas?.mark.mark === entry.mark ? 'var(--accent)' : undefined }}
            >
              {entry.c}
            </span>,
            String(entry.f),
            entry.mark,
            String(fanFromConventional(entry.c)),
          ])}
        />
        <Note>
          {t(
            l,
            `旋風烤箱的熱風會加快表面上色,同樣的成品大約低 ${FAN_OFFSET_C} °C。各廠牌建議 20 到 25 度都有,而且小烤箱本身就常常比刻度熱——這欄是起點,真正的答案是買一支烤箱溫度計量一次。表裡的 °C 與 °F 是食譜書印的對照值,不是彼此的精確換算(刻度 4 印 180 °C 與 350 °F,而 180 °C 其實是 356 °F)。`,
            `A fan moves hot air over the surface, so the same result happens about ${FAN_OFFSET_C} °C lower. Manufacturers say 20 or 25, and small ovens often run hotter than their dial anyway — this row is a starting point, and an oven thermometer is the real answer. The °C and °F columns are the pair cookbooks print rather than exact conversions of each other: mark 4 is published as 180 °C and 350 °F, while 180 °C is really 356 °F.`
          )}
        </Note>
        <p className="inst-hint">
          {t(l, '華氏轉攝氏:', 'Fahrenheit to Celsius: ')}350 °F = {fixed(fToC(350), 1)} °C
        </p>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '縮放倍率', 'factor'), v: factor === null ? '—' : `×${formatDecimal(factor)}` },
          {
            k: t(l, '食譜行數', 'lines'),
            v: count(recipe === '' ? 0 : recipe.split('\n').length),
          },
          { k: t(l, '密度表', 'densities'), v: count(list.length) },
          {
            k: t(l, '換算', 'conversion'),
            v: grams === null ? '—' : `${formatDecimal(grams)} g`,
          },
          { k: t(l, '烤箱', 'oven'), v: Number.isFinite(c) ? `${roundOven(shown)} °C` : '—' },
        ]}
      />
    </div>
  );
}
