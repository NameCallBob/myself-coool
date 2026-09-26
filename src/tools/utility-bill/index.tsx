'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { t, type Loc } from '@/lib/tools/locale';
import {
  BillError,
  MAX_TIERS,
  PRESETS,
  computeBill,
  money,
  usageForBudget,
  type Bill,
  type BillInput,
  type Tier,
  type TierMode,
} from './logic';

type TierDraft = { upTo: string; rate: string };

const toDraft = (tiers: Tier[]): TierDraft[] =>
  tiers.map((tier) => ({ upTo: tier.upTo === null ? '' : String(tier.upTo), rate: String(tier.rate) }));

const fromDraft = (drafts: TierDraft[]): Tier[] =>
  drafts.map((draft, index) => ({
    upTo: index === drafts.length - 1 || draft.upTo.trim() === '' ? null : Number(draft.upTo.replace(/[,\s]/g, '')),
    rate: Number(draft.rate.replace(/[,\s]/g, '')) || 0,
  }));

const num = (text: string): number => {
  const cleaned = text.replace(/[,\s_]/g, '');
  if (cleaned === '') return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
};

/** Editable rate table. The ceilings are per month; the last row is open-ended. */
function TierEditor({
  l,
  label,
  unit,
  drafts,
  onChange,
}: {
  l: Loc;
  label: string;
  unit: string;
  drafts: TierDraft[];
  onChange: (next: TierDraft[]) => void;
}) {
  const edit = (index: number, key: keyof TierDraft, value: string) =>
    onChange(drafts.map((draft, i) => (i === index ? { ...draft, [key]: value } : draft)));

  return (
    <div className="inst-field">
      <span className="inst-label">{label}</span>
      <Table
        head={[
          t(l, `到幾${unit}(每月)`, `up to (${unit}/month)`),
          t(l, '單價', 'price per unit'),
          '',
        ]}
        align={['left', 'left', 'left']}
        rows={drafts.map((draft, index) => [
          index === drafts.length - 1 ? (
            <span key="u" className="inst-no">
              {t(l, '以上全部', 'and above')}
            </span>
          ) : (
            <Input
              key="u"
              value={draft.upTo}
              onChange={(value) => edit(index, 'upTo', value)}
            />
          ),
          <Input key="r" value={draft.rate} onChange={(value) => edit(index, 'rate', value)} />,
          drafts.length > 1 && index < drafts.length - 1 ? (
            <Btn key="d" onClick={() => onChange(drafts.filter((_, i) => i !== index))}>
              {t(l, '刪', 'del')}
            </Btn>
          ) : (
            <span key="d" />
          ),
        ])}
      />
      <Row>
        <Btn
          disabled={drafts.length >= MAX_TIERS}
          onClick={() => {
            const next = drafts.slice();
            const last = next[next.length - 1];
            const previous = next[next.length - 2];
            const suggestion = previous ? Number(previous.upTo) * 2 || 100 : 100;
            next.splice(next.length - 1, 0, { upTo: String(suggestion), rate: last.rate });
            onChange(next);
          }}
        >
          {t(l, '加一級', 'add a tier')}
        </Btn>
      </Row>
    </div>
  );
}

export default function UtilityBill({ l }: ToolProps) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((entry) => entry.id === presetId) ?? PRESETS[0];

  const [usage, setUsage] = useState('800');
  const [periodMonths, setPeriodMonths] = useState('2');
  const [summerMonths, setSummerMonths] = useState('2');
  const [mode, setMode] = useState<TierMode>('progressive');
  const [basicCharge, setBasicCharge] = useState('0');
  const [perUnitLevy, setPerUnitLevy] = useState('0');
  const [surchargePercent, setSurchargePercent] = useState('0');
  const [roundTotal, setRoundTotal] = useState(true);
  const [separateSummer, setSeparateSummer] = useState(true);
  const [budget, setBudget] = useState('2000');

  const [normalDraft, setNormalDraft] = useState<TierDraft[]>(toDraft(PRESETS[0].normalTiers));
  const [summerDraft, setSummerDraft] = useState<TierDraft[]>(toDraft(PRESETS[0].summerTiers));

  const unit = l === 'en' ? preset.unitEn : preset.unitZh;

  const loadPreset = (id: string) => {
    const found = PRESETS.find((entry) => entry.id === id);
    if (!found) return;
    setPresetId(id);
    setNormalDraft(toDraft(found.normalTiers));
    setSummerDraft(toDraft(found.summerTiers));
    setPeriodMonths(String(found.periodMonths));
    setSummerMonths(String(found.summerMonths));
    setBasicCharge(String(found.basicCharge));
    setPerUnitLevy(String(found.perUnitLevy));
    setSurchargePercent(String(found.surchargePercent));
    setSeparateSummer(found.summerMonths > 0);
  };

  const input: BillInput = useMemo(
    () => ({
      usage: num(usage),
      periodMonths: Math.trunc(num(periodMonths)) || 1,
      summerMonths: separateSummer ? Math.trunc(num(summerMonths)) || 0 : 0,
      summerTiers: fromDraft(summerDraft),
      normalTiers: fromDraft(normalDraft),
      mode,
      basicCharge: num(basicCharge) || 0,
      perUnitLevy: num(perUnitLevy) || 0,
      surchargePercent: num(surchargePercent) || 0,
      roundTotal,
    }),
    [
      usage,
      periodMonths,
      summerMonths,
      separateSummer,
      summerDraft,
      normalDraft,
      mode,
      basicCharge,
      perUnitLevy,
      surchargePercent,
      roundTotal,
    ]
  );

  const outcome = useMemo((): { result: Bill | null; error: string | null } => {
    try {
      return { result: computeBill(input), error: null };
    } catch (problem) {
      return {
        result: null,
        error: problem instanceof BillError ? problem.message : String(problem),
      };
    }
  }, [input]);

  const result = outcome.result;

  const allowance = useMemo(() => {
    if (!result) return Number.NaN;
    try {
      return usageForBudget(input, num(budget));
    } catch {
      return Number.NaN;
    }
  }, [input, result, budget]);

  const seasonName = (season: 'summer' | 'normal') =>
    season === 'summer' ? t(l, '夏月', 'summer') : t(l, '非夏月', 'non-summer');

  const summary = result
    ? [
        `${t(l, '用量', 'usage')}: ${money(input.usage, 1)} ${unit}`,
        `${t(l, '期間', 'period')}: ${input.periodMonths} ${t(l, '個月', 'months')}`,
        `${t(l, '用電費用', 'usage charge')}: ${money(result.usageCharge, 2)}`,
        `${t(l, '基本費', 'basic charge')}: ${money(result.basicCharge, 2)}`,
        `${t(l, '合計', 'total')}: ${money(result.total, 2)}`,
      ].join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '用量與費率', 'USAGE AND RATES')}
        rightLabel={t(l, '帳單', 'BILL')}
        leftAside={<span className="inst-no">{preset.version}</span>}
        rightAside={
          result ? (
            <span className="inst-no">
              {t(l, '邊際單價', 'marginal')} {money(result.marginalRate, 2)}
            </span>
          ) : null
        }
        left={
          <>
            <Select
              label={t(l, '費率表', 'Rate table')}
              value={presetId}
              options={PRESETS.map((entry) => ({
                value: entry.id,
                label: l === 'en' ? entry.en : entry.zh,
              }))}
              onChange={loadPreset}
            />

            <Note error={!preset.ratesProvided}>
              {l === 'en' ? preset.noteEn : preset.noteZh}
            </Note>
            {preset.ratesProvided ? (
              <Note>
                {t(
                  l,
                  `單價版本 ${preset.version}。台電通常在 4 月與 10 月檢討電價,這裡不會自動跟上——請打開帳單核對級距與單價,不一樣就直接改下面那張表。`,
                  `Prices as of ${preset.version}. Taipower reviews them around April and October and this page does not follow along — check the bands and prices on your bill and edit the table below if they differ.`
                )}
              </Note>
            ) : null}

            <Row>
              <Input
                label={t(l, `這期用量(${unit})`, `Usage this period (${unit})`)}
                value={usage}
                onChange={setUsage}
              />
              <Input
                label={t(l, '帳單期間(月)', 'Billing period (months)')}
                value={periodMonths}
                onChange={setPeriodMonths}
                hint={t(l, '台電是兩個月一期。', 'Taipower bills every two months.')}
              />
            </Row>

            <Row>
              <Check2
                label={t(l, '夏月另一張費率表', 'separate summer table')}
                checked={separateSummer}
                onChange={setSeparateSummer}
              />
              {separateSummer ? (
                <Input
                  label={t(l, '其中幾個月是夏月', 'Summer months in the period')}
                  value={summerMonths}
                  onChange={setSummerMonths}
                  hint={t(l, '夏月是 6 月到 9 月。', 'Summer is June to September.')}
                />
              ) : null}
            </Row>

            <Row>
              <Seg
                label={t(l, '級距計算方式', 'Tier mode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'progressive', label: t(l, '累進(逐級計價)', 'progressive') },
                  { value: 'flat', label: t(l, '全額(整筆同一單價)', 'banded flat') },
                ]}
              />
              <Check2
                label={t(l, '總額四捨五入到整數', 'round total to whole')}
                checked={roundTotal}
                onChange={setRoundTotal}
              />
            </Row>

            <Row>
              <Input
                label={t(l, '基本費(每期)', 'Basic charge (per period)')}
                value={basicCharge}
                onChange={setBasicCharge}
              />
              <Input
                label={t(l, `附加單價(每${unit})`, `Per-unit levy (per ${unit})`)}
                value={perUnitLevy}
                onChange={setPerUnitLevy}
              />
              <Input
                label={t(l, '附加百分比 %', 'Percentage surcharge %')}
                value={surchargePercent}
                onChange={setSurchargePercent}
                hint={t(l, '例如污水下水道使用費。', 'Sewerage charge, for example.')}
              />
            </Row>

            {separateSummer ? (
              <TierEditor
                l={l}
                label={t(l, '夏月費率表', 'Summer rate table')}
                unit={unit}
                drafts={summerDraft}
                onChange={setSummerDraft}
              />
            ) : null}
            <TierEditor
              l={l}
              label={separateSummer ? t(l, '非夏月費率表', 'Non-summer rate table') : t(l, '費率表', 'Rate table')}
              unit={unit}
              drafts={normalDraft}
              onChange={setNormalDraft}
            />

            {outcome.error ? <Note error>{outcome.error}</Note> : null}
          </>
        }
        right={
          !result ? (
            <Note>{t(l, '費率表或用量還不完整。', 'The rate table or the usage is incomplete.')}</Note>
          ) : (
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'item'), t(l, '金額', 'amount')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '用量費用', 'usage charge'), money(result.usageCharge, 2)],
                  [t(l, '基本費', 'basic charge'), money(result.basicCharge, 2)],
                  [t(l, '附加單價費用', 'per-unit levy'), money(result.levy, 2)],
                  [t(l, '附加百分比費用', 'percentage surcharge'), money(result.surcharge, 2)],
                  [t(l, '合計', 'total'), money(result.total, roundTotal ? 0 : 2)],
                  [
                    t(l, `平均每${unit}`, `average per ${unit}`),
                    money(result.averageUnitPrice, 3),
                  ],
                  [
                    t(l, `下一${unit}的單價(邊際)`, `marginal price per ${unit}`),
                    money(result.marginalRate, 2),
                  ],
                  [
                    t(l, '平均每月', 'per month'),
                    money(result.total / input.periodMonths, 0),
                  ],
                ].map(([k, v]) => [
                  <span key="k" style={{ fontSize: '0.8125rem' }}>
                    {k}
                  </span>,
                  <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                    {v}
                  </span>,
                ])}
              />
              <Row>
                <CopyButton l={l} text={summary} label={t(l, '複製明細', 'copy summary')} />
              </Row>

              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '反推:預算內可以用多少', 'HOW MUCH FITS IN A BUDGET')}</span>
                </div>
                <Row>
                  <Input label={t(l, '預算金額', 'Budget')} value={budget} onChange={setBudget} />
                </Row>
                <Note>
                  {Number.isFinite(allowance)
                    ? t(
                        l,
                        `這個預算下這一期可以用到 ${money(allowance, 1)} ${unit},平均每月 ${money(allowance / input.periodMonths, 1)} ${unit}。`,
                        `That budget covers ${money(allowance, 1)} ${unit} this period, ${money(allowance / input.periodMonths, 1)} ${unit} a month.`
                      )
                    : t(l, '填一個預算金額。', 'Enter a budget.')}
                </Note>
              </div>

              <Note>
                {t(
                  l,
                  '平均單價永遠低於邊際單價,這就是累進級距的作用:省下的一度電是按最高那一級退的,不是按平均。',
                  'The average price is always below the marginal price — which is the point of progressive tiers: a unit you do not use is saved at the top rate, not at the average.'
                )}
              </Note>
            </div>
          )
        }
      />

      {result ? (
        <div className="mt-8">
          {result.sections.map((section) => (
            <div key={section.season} className="mb-6">
              <Panel
                label={t(
                  l,
                  `${seasonName(section.season)}分算(${section.months} 個月,${money(section.usage, 1)} ${unit})`,
                  `${seasonName(section.season)} portion (${section.months} months, ${money(section.usage, 1)} ${unit})`
                )}
                aside={<span className="inst-no">{money(section.amount, 2)}</span>}
              >
                <Table
                  head={[
                    t(l, '級距(本期)', 'band (this period)'),
                    t(l, '單價', 'price'),
                    t(l, `用量 ${unit}`, `units ${unit}`),
                    t(l, '金額', 'amount'),
                  ]}
                  align={['left', 'right', 'right', 'right']}
                  rows={section.lines.map((line) => [
                    <span key="b" className="inst-no">
                      {money(line.from, 0)} –{' '}
                      {line.to === null ? t(l, '以上', 'above') : money(line.to, 0)}
                    </span>,
                    <span key="r" className="inst-no">
                      {money(line.rate, 2)}
                    </span>,
                    <span
                      key="u"
                      className="inst-no"
                      style={line.units > 0 ? { color: 'var(--fg)' } : undefined}
                    >
                      {line.units > 0 ? money(line.units, 1) : '—'}
                    </span>,
                    <span key="a" className="inst-no" style={line.amount > 0 ? { color: 'var(--fg)' } : undefined}>
                      {line.amount > 0 ? money(line.amount, 2) : '—'}
                    </span>,
                  ])}
                />
              </Panel>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <Panel label={t(l, '這個試算不做什麼', 'WHAT THIS DOES NOT DO')}>
          <Note>
            {t(
              l,
              '沒有時間電價(尖峰/離峰)、沒有需量計費、沒有營業用或表燈非住宅的級距、沒有分攤公共電費、沒有節電獎勵與各種減免。這些會讓金額差很多,以帳單為準。',
              'No time-of-use pricing, no demand charges, no commercial tariffs, no shared common-area allocation, no conservation rebates or exemptions. Any of these moves the figure materially — the bill is authoritative.'
            )}
          </Note>
          <Note>
            {t(
              l,
              '夏月與非夏月混合的期間,這裡照月數比例拆用量;台電是按日數拆。期間剛好落在月底的話兩者相同,不然會有小差異。',
              'For a period straddling the summer season, usage is split by month count here; Taipower splits by days. The two agree when the period aligns with month boundaries and differ slightly otherwise.'
            )}
          </Note>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '用量', 'usage'), v: `${money(input.usage, 1)} ${unit}` },
          { k: t(l, '合計', 'total'), v: result ? money(result.total, 0) : '—' },
          { k: t(l, '平均單價', 'average'), v: result ? money(result.averageUnitPrice, 3) : '—' },
          { k: t(l, '邊際單價', 'marginal'), v: result ? money(result.marginalRate, 2) : '—' },
          { k: t(l, '費率版本', 'table version'), v: preset.version },
        ]}
      />
    </div>
  );
}
