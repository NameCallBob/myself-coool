'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  ACTIVITIES,
  KCAL_PER_KG,
  TW_BANDS,
  WAIST_LIMIT,
  WHO_BANDS,
  cmToFeetInches,
  dailyForWeeklyChange,
  feetInchesToCm,
  healthyWeightRange,
  kgToLb,
  lbToKg,
  roundCalories,
  summarise,
  tdee,
  waistBand,
  waistToHeight,
  type Sex,
} from './logic';

function bandText(l: Loc, id: string): string {
  switch (id) {
    case 'underweight':
      return t(l, '過輕', 'underweight');
    case 'healthy':
      return t(l, '健康體重', 'healthy weight');
    case 'overweight':
      return t(l, '過重', 'overweight');
    case 'obese-1':
      return t(l, '輕度肥胖', 'obesity class I');
    case 'obese-2':
      return t(l, '中度肥胖', 'obesity class II');
    case 'obese-3':
      return t(l, '重度肥胖', 'obesity class III');
    default:
      return id;
  }
}

function activityText(l: Loc, id: string): string {
  switch (id) {
    case 'sedentary':
      return t(l, '幾乎不動(久坐、沒有規律運動)', 'sedentary — desk work, no regular exercise');
    case 'light':
      return t(l, '輕度(每週運動 1–3 天)', 'light — exercise 1–3 days a week');
    case 'moderate':
      return t(l, '中度(每週運動 3–5 天)', 'moderate — exercise 3–5 days a week');
    case 'active':
      return t(l, '高度(每週運動 6–7 天)', 'active — exercise 6–7 days a week');
    case 'very-active':
      return t(l, '非常高(體力工作或一天兩練)', 'very active — physical job or two sessions a day');
    default:
      return id;
  }
}

function equationText(l: Loc, id: string): string {
  switch (id) {
    case 'mifflin':
      return t(l, 'Mifflin–St Jeor(1990,一般首選)', 'Mifflin–St Jeor (1990, usual first choice)');
    case 'harris':
      return t(l, 'Harris–Benedict(1984 修訂版,偏高約 5%)', 'Harris–Benedict (1984 revision, runs ~5% high)');
    case 'katch':
      return t(l, 'Katch–McArdle(以淨體重計,需要體脂率)', 'Katch–McArdle (from lean mass; needs a body-fat figure)');
    default:
      return id;
  }
}

const num = (text: string): number => {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : Number.NaN;
};

export default function BmiTdee({ l }: ToolProps) {
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [sex, setSex] = useState<Sex>('female');
  const [kgText, setKgText] = useState('60');
  const [cmText, setCmText] = useState('165');
  const [lbText, setLbText] = useState('132');
  const [feetText, setFeetText] = useState('5');
  const [inchText, setInchText] = useState('5');
  const [ageText, setAgeText] = useState('35');
  const [waistText, setWaistText] = useState('');
  const [fatText, setFatText] = useState('');
  const [useFat, setUseFat] = useState(false);
  const [activity, setActivity] = useState('light');
  const [rateText, setRateText] = useState('-0.5');

  const kg = unit === 'metric' ? num(kgText) : lbToKg(num(lbText));
  const cm = unit === 'metric' ? num(cmText) : feetInchesToCm(num(feetText), num(inchText));
  const age = num(ageText);
  const fat = useFat ? num(fatText) : Number.NaN;
  const factor = ACTIVITIES.find((entry) => entry.id === activity)?.factor ?? 1.2;

  const result = useMemo(
    () =>
      summarise({
        sex,
        kg,
        cm,
        age,
        factor,
        bodyFatPercent: Number.isFinite(fat) ? fat : null,
      }),
    [sex, kg, cm, age, factor, fat]
  );

  const waist = num(waistText);
  const ratio = Number.isFinite(waist) ? waistToHeight(waist, cm) : null;
  const ratioBand = ratio === null ? null : waistBand(ratio);
  const waistOver = Number.isFinite(waist) && waist >= WAIST_LIMIT[sex];

  const rate = num(rateText);
  const dailyDelta = Number.isFinite(rate) ? dailyForWeeklyChange(rate) : Number.NaN;
  const reference = result.tdee.mifflin ?? result.spread?.low ?? null;
  const target =
    reference !== null && Number.isFinite(dailyDelta) ? reference + dailyDelta : null;

  const whoRange = healthyWeightRange(cm, WHO_BANDS);

  const asDisplayWeight = (value: number) =>
    unit === 'metric' ? `${fixed(value, 1)} kg` : `${fixed(kgToLb(value), 1)} lb`;

  const summaryText = [
    `BMI ${result.bmi === null ? '—' : fixed(result.bmi, 1)} (${result.band ? bandText(l, result.band.id) : '—'})`,
    ...Object.entries(result.bmr).map(
      ([key, value]) => `BMR ${key}: ${roundCalories(value)} kcal`
    ),
    ...Object.entries(result.tdee).map(
      ([key, value]) => `TDEE ${key} ×${factor}: ${roundCalories(value)} kcal`
    ),
  ].join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '身體資料', 'BODY')}
        rightLabel={t(l, '結果', 'RESULT')}
        leftAside={
          <Seg
            label={t(l, '單位', 'units')}
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'metric', label: 'kg / cm' },
              { value: 'imperial', label: 'lb / ft' },
            ]}
          />
        }
        rightAside={<CopyButton l={l} text={summaryText} />}
        left={
          <>
            <Row>
              <Seg
                label={t(l, '生理性別', 'sex')}
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'female', label: t(l, '女', 'female') },
                  { value: 'male', label: t(l, '男', 'male') },
                ]}
              />
              <Input label={t(l, '年齡', 'Age')} type="number" value={ageText} onChange={setAgeText} min={0} max={120} />
            </Row>

            {unit === 'metric' ? (
              <Row>
                <Input label={t(l, '體重 kg', 'Weight kg')} type="number" value={kgText} onChange={setKgText} min={0} step={0.1} />
                <Input label={t(l, '身高 cm', 'Height cm')} type="number" value={cmText} onChange={setCmText} min={0} step={0.1} />
              </Row>
            ) : (
              <Row>
                <Input label={t(l, '體重 lb', 'Weight lb')} type="number" value={lbText} onChange={setLbText} min={0} step={0.1} />
                <Input label={t(l, '身高 ft', 'Height ft')} type="number" value={feetText} onChange={setFeetText} min={0} max={8} />
                <Input label={t(l, 'in', 'in')} type="number" value={inchText} onChange={setInchText} min={0} max={11.9} step={0.1} />
              </Row>
            )}

            <Row>
              <Input
                label={t(l, '腰圍 cm(選填)', 'Waist cm (optional)')}
                type="number"
                value={waistText}
                onChange={setWaistText}
                min={0}
                step={0.5}
              />
              <Check2
                label={t(l, '我知道體脂率', 'I know my body fat %')}
                checked={useFat}
                onChange={setUseFat}
              />
              {useFat ? (
                <Input
                  label={t(l, '體脂率 %', 'Body fat %')}
                  type="number"
                  value={fatText}
                  onChange={setFatText}
                  min={0}
                  max={70}
                  step={0.1}
                />
              ) : null}
            </Row>

            <Seg
              label={t(l, '活動量', 'activity')}
              value={activity}
              onChange={setActivity}
              options={ACTIVITIES.map((entry) => ({ value: entry.id, label: `×${entry.factor}` }))}
            />
            <p className="inst-hint">{activityText(l, activity)}</p>

            {unit === 'imperial' && Number.isFinite(cm) ? (
              <p className="inst-hint">
                = {fixed(cm, 1)} cm / {fixed(kg, 1)} kg
              </p>
            ) : null}
            {unit === 'metric' && Number.isFinite(cm) ? (
              <p className="inst-hint">
                ={' '}
                {(() => {
                  const { feet, inches } = cmToFeetInches(cm);
                  return `${feet}′${fixed(inches, 1)}″`;
                })()}{' '}
                / {fixed(kgToLb(kg), 1)} lb
              </p>
            ) : null}
          </>
        }
        right={
          result.bmi === null ? (
            <Note>{t(l, '填入身高與體重。', 'Enter a height and a weight.')}</Note>
          ) : (
            <div aria-live="polite">
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 32,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--fg)',
                  lineHeight: 1.1,
                }}
              >
                {fixed(result.bmi, 1)}
                <span style={{ fontSize: 12, color: 'var(--fg-faint)', marginLeft: '0.6rem' }}>
                  BMI
                </span>
              </div>
              <Table
                head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                rows={[
                  [
                    t(l, '衛福部分級', 'HPA category (Taiwan)'),
                    result.band ? bandText(l, result.band.id) : '—',
                  ],
                  [
                    t(l, 'WHO 分級', 'WHO category'),
                    result.whoBand ? bandText(l, result.whoBand.id) : '—',
                  ],
                  [
                    t(l, '這個身高的健康體重', 'healthy weight for this height'),
                    result.healthy
                      ? `${asDisplayWeight(result.healthy.min)} – ${asDisplayWeight(result.healthy.max)}`
                      : '—',
                  ],
                  [
                    t(l, '腰圍', 'waist'),
                    Number.isFinite(waist)
                      ? `${fixed(waist, 1)} cm ${waistOver ? t(l, '(達腹部肥胖標準)', '(meets the abdominal-obesity threshold)') : t(l, '(未達標準)', '(below the threshold)')}`
                      : '—',
                  ],
                  [
                    t(l, '腰高比', 'waist-to-height'),
                    ratio === null
                      ? '—'
                      : `${fixed(ratio, 3)}${ratioBand ? ` (${ratioBand})` : ''}`,
                  ],
                ]}
              />

              {result.whoBand && result.band && result.whoBand.id !== result.band.id ? (
                <Note>
                  {t(
                    l,
                    '兩套標準給出不同分級。台灣用的切點比 WHO 低(過重從 24 起算、肥胖從 27 起算),依據是亞洲族群在較低 BMI 就出現代謝風險上升。在台灣看健檢報告,以衛福部那一欄為準。',
                    'The two standards disagree. Taiwan uses lower cut-offs — overweight from 24, obesity from 27 — following evidence that metabolic risk rises at a lower BMI in Asian populations. For a health check in Taiwan, the HPA column is the one that applies.'
                  )}
                </Note>
              ) : null}
            </div>
          )
        }
      />

      <Panel
        label={t(l, '每日熱量需求', 'DAILY ENERGY')}
        aside={
          result.spread ? (
            <span className="inst-no">
              {roundCalories(result.spread.low)}–{roundCalories(result.spread.high)} kcal
            </span>
          ) : null
        }
      >
        {Object.keys(result.bmr).length === 0 ? (
          <Note>{t(l, '需要身高、體重與年齡。', 'Needs a height, a weight and an age.')}</Note>
        ) : (
          <>
            <Table
              head={[
                t(l, '公式', 'equation'),
                t(l, '基礎代謝 BMR', 'BMR'),
                t(l, `總消耗 ×${factor}`, `TDEE ×${factor}`),
              ]}
              rows={(Object.keys(result.bmr) as (keyof typeof result.bmr)[]).map((key) => [
                equationText(l, key),
                <span key={`b${key}`} style={{ fontFamily: 'var(--font-mono)' }}>
                  {roundCalories(result.bmr[key]!)} kcal
                </span>,
                <span key={`t${key}`} style={{ fontFamily: 'var(--font-mono)' }}>
                  {result.tdee[key] === undefined ? '—' : `${roundCalories(result.tdee[key]!)} kcal`}
                </span>,
              ])}
            />
            <Note>
              {t(
                l,
                `三個公式的差距就是這個估算的精度。同一組身體資料,不同公式相差 ${
                  result.spread ? roundCalories(result.spread.high - result.spread.low) : 0
                } kcal,而單一公式本身的標準差還有大約 ±10%。把它當成起點,用兩三週的體重變化去校正,那個數字才是你的。`,
                `The spread between the equations is the precision of this estimate: ${
                  result.spread ? roundCalories(result.spread.high - result.spread.low) : 0
                } kcal apart on the same body, and each equation carries about ±10% of its own. Treat it as a starting point and correct it against two or three weeks of actual weight change.`
              )}
            </Note>

            <Table
              head={[t(l, '活動量', 'activity'), t(l, '倍率', 'factor'), t(l, '總消耗', 'TDEE')]}
              rows={ACTIVITIES.map((entry) => {
                const value = result.bmr.mifflin ? tdee(result.bmr.mifflin, entry.factor) : null;
                return [
                  activityText(l, entry.id),
                  `×${entry.factor}`,
                  <span
                    key={entry.id}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: entry.id === activity ? 'var(--accent)' : undefined,
                    }}
                  >
                    {value === null ? '—' : `${roundCalories(value)} kcal`}
                  </span>,
                ];
              })}
            />
          </>
        )}
      </Panel>

      <Panel label={t(l, '增減重試算', 'WEIGHT CHANGE')}>
        <Row>
          <Input
            label={t(l, '每週目標變化 kg(負數是減重)', 'Target change per week, kg (negative to lose)')}
            type="number"
            value={rateText}
            onChange={setRateText}
            step={0.1}
            min={-2}
            max={2}
          />
        </Row>
        {target !== null ? (
          <Table
            head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
            rows={[
              [t(l, '每日熱量差', 'daily difference'), `${dailyDelta > 0 ? '+' : ''}${roundCalories(dailyDelta)} kcal`],
              [t(l, '目標攝取', 'target intake'), `${roundCalories(target)} kcal`],
              [t(l, '一個月(4 週)', 'over four weeks'), `${fixed(rate * 4, 2)} kg`],
              [t(l, '換算依據', 'basis'), `${KCAL_PER_KG} kcal / kg`],
            ]}
          />
        ) : null}
        <Note>
          {t(
            l,
            `這裡用的是「1 公斤體脂約 ${KCAL_PER_KG} kcal」的線性估算。前幾週還算準,之後會越來越樂觀:體重下降後移動身體的耗能也下降,固定的熱量差會產生越來越慢的減重速度,而不是一條直線。這一頁不是醫療建議;有代謝疾病、懷孕、或目標攝取低於 1200 kcal,請找營養師或醫師。`,
            `This uses the linear "about ${KCAL_PER_KG} kcal per kilogram of fat" rule. It holds for the first few weeks and then grows optimistic: as body mass falls so does the energy cost of moving it, so a fixed deficit yields a slowing rate of loss rather than a straight line. This page is not medical advice — with a metabolic condition, in pregnancy, or at a target below 1200 kcal, ask a dietitian or a doctor.`
          )}
        </Note>
      </Panel>

      <Panel label={t(l, 'BMI 分級對照', 'CATEGORY TABLE')}>
        <Table
          head={[
            t(l, '分級', 'category'),
            t(l, '衛福部 BMI', 'HPA BMI'),
            t(l, 'WHO BMI', 'WHO BMI'),
            t(l, '這個身高的體重', 'weight at this height'),
          ]}
          rows={TW_BANDS.map((band, index) => {
            const who = WHO_BANDS[index];
            const metres = cm / 100;
            const usable = Number.isFinite(metres) && metres > 0;
            const low = usable ? band.min * metres * metres : Number.NaN;
            const high =
              usable && Number.isFinite(band.max) ? band.max * metres * metres : Number.NaN;
            return [
              <span
                key={band.id}
                style={{ color: result.band?.id === band.id ? 'var(--accent)' : undefined }}
              >
                {bandText(l, band.id)}
              </span>,
              band.max === Number.POSITIVE_INFINITY ? `≥ ${band.min}` : `${band.min} – ${band.max}`,
              who.max === Number.POSITIVE_INFINITY ? `≥ ${who.min}` : `${who.min} – ${who.max}`,
              !usable
                ? '—'
                : Number.isFinite(high)
                  ? `${asDisplayWeight(low)} – ${asDisplayWeight(high)}`
                  : `≥ ${asDisplayWeight(low)}`,
            ];
          })}
        />
        <p className="inst-hint">
          {t(
            l,
            `衛福部標準:過輕 < 18.5,健康 18.5–24,過重 24–27,肥胖 ≥ 27。腹部肥胖切點為男性腰圍 ${WAIST_LIMIT.male} cm、女性 ${WAIST_LIMIT.female} cm。以國民健康署最新公告為準(此表為 2025-09 版)。WHO 對應的健康上限是 ${whoRange ? fixed(whoRange.max, 1) : '—'} kg。`,
            `HPA: underweight below 18.5, healthy 18.5–24, overweight 24–27, obese 27 and above. Abdominal obesity starts at a waist of ${WAIST_LIMIT.male} cm for men and ${WAIST_LIMIT.female} cm for women. Follow the HPA's current publication over this table, which is the 2025-09 version.`
          )}
        </p>
        <Note>
          {t(
            l,
            'BMI 只有身高與體重兩個輸入,所以它分不出肌肉與脂肪,也不看脂肪長在哪裡。肌肉量高的人常常被歸到「過重」,而四肢細、腹部脂肪多的人可能 BMI 正常卻有代謝風險——腰圍與腰高比就是為了補這個洞。未滿 18 歲不適用這張表,兒童與青少年要看年齡別百分位曲線,那份資料表不在這個工具裡。懷孕、水腫、截肢、嚴重肌少症的情況下,BMI 也不成立。',
            'BMI takes only a height and a weight, so it cannot separate muscle from fat or say where the fat is. Muscular people are routinely classified as overweight, and someone with thin limbs and central fat can have a normal BMI and raised metabolic risk — which is what the waist measurements are for. This table does not apply under 18: children and teenagers are read against age- and sex-specific percentile curves, and that table is not in this tool. BMI also breaks down in pregnancy, with oedema, after an amputation, and with significant sarcopenia.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: 'BMI', v: result.bmi === null ? '—' : fixed(result.bmi, 1) },
          { k: t(l, '分級', 'category'), v: result.band ? bandText(l, result.band.id) : '—' },
          {
            k: 'BMR',
            v: result.bmr.mifflin ? `${roundCalories(result.bmr.mifflin)} kcal` : '—',
          },
          {
            k: 'TDEE',
            v: result.spread
              ? `${roundCalories(result.spread.low)}–${roundCalories(result.spread.high)} kcal`
              : '—',
          },
          {
            k: t(l, '腰高比', 'waist/height'),
            v: ratio === null ? '—' : fixed(ratio, 3),
          },
        ]}
      />
    </div>
  );
}
