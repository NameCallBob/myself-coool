'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_VALUES,
  formatStat,
  freedmanDiaconisBins,
  histogram,
  parseSeries,
  sturgesBins,
  summarise,
  type QuartileMethod,
} from './logic';

const SAMPLE = [2, 4, 4, 4, 5, 5, 7, 9].join('\n');

export default function Statistics({ l }: ToolProps) {
  const [text, setText] = useState(SAMPLE);
  const [method, setMethod] = useState<QuartileMethod>('inclusive');
  const [binMode, setBinMode] = useState<'sturges' | 'fd' | 'manual'>('sturges');
  const [manualBins, setManualBins] = useState(10);

  const parsed = useMemo(() => parseSeries(text), [text]);
  const stats = useMemo(() => summarise(parsed.values, method), [parsed.values, method]);

  const bins =
    binMode === 'manual'
      ? manualBins
      : binMode === 'fd'
        ? freedmanDiaconisBins(stats)
        : sturgesBins(stats.n);

  const chart = useMemo(() => histogram(parsed.values, bins), [parsed.values, bins]);
  const tallest = chart.reduce((max, bin) => Math.max(max, bin.count), 0);

  const report = [
    `n = ${stats.n}`,
    `sum = ${formatStat(stats.sum)}`,
    `mean = ${formatStat(stats.mean)}`,
    `median = ${formatStat(stats.median)}`,
    `sd (sample, n-1) = ${formatStat(stats.sdSample)}`,
    `sd (population, n) = ${formatStat(stats.sdPopulation)}`,
    `min = ${formatStat(stats.min)}`,
    `Q1 = ${formatStat(stats.q1)}`,
    `Q3 = ${formatStat(stats.q3)}`,
    `max = ${formatStat(stats.max)}`,
    `IQR = ${formatStat(stats.iqr)}`,
    `quartile method = ${method === 'inclusive' ? 'R type 7 / PERCENTILE.INC' : 'R type 6 / QUARTILE.EXC'}`,
  ].join('\n');

  return (
    <div>
      <Bench
        leftLabel={t(l, '資料', 'DATA')}
        rightLabel={t(l, '摘要', 'SUMMARY')}
        leftAside={
          <span className="inst-no">
            {count(stats.n)} {t(l, '筆', 'values')}
          </span>
        }
        rightAside={
          <span className="inst-no">
            {method === 'inclusive' ? 'type 7' : 'type 6'}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '一列一個數字,也可以用逗號或空白分隔', 'One number per line; commas and spaces also work')}
              value={text}
              onChange={setText}
              rows={14}
              hint={t(
                l,
                `最多 ${count(MAX_VALUES)} 筆。非數字的內容會被略過並列出來。`,
                `Up to ${count(MAX_VALUES)} values. Anything that is not a number is skipped and listed.`
              )}
            />
            <Row>
              <Seg
                label={t(l, '四分位數定義', 'Quartile definition')}
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'inclusive', label: t(l, '含端點 type 7', 'inclusive · type 7') },
                  { value: 'exclusive', label: t(l, '不含端點 type 6', 'exclusive · type 6') },
                ]}
              />
              <CopyButton l={l} text={report} label={t(l, '複製摘要', 'copy summary')} />
              <ResetButton l={l} onReset={() => setText('')} />
            </Row>
            {parsed.truncated ? (
              <Note error>
                {t(
                  l,
                  `資料超過上限,只取了前 ${count(MAX_VALUES)} 筆。`,
                  `Input exceeded the ceiling; only the first ${count(MAX_VALUES)} values were read.`
                )}
              </Note>
            ) : null}
            {parsed.skipped.length > 0 ? (
              <Note>
                {t(l, '略過了不是數字的內容:', 'Skipped non-numeric tokens: ')}
                {parsed.skipped.slice(0, 12).join('、')}
                {parsed.skipped.length > 12 ? '…' : ''}
              </Note>
            ) : null}
            <Note>
              {t(
                l,
                '四分位數沒有唯一定義:R 預設與 Excel 的 PERCENTILE.INC 取 (n−1)p 的位置,QUARTILE.EXC 取 (n+1)p,同一組數字會得到不同的 Q1 與 Q3。這裡兩種都給,對照別人的報表時請確認用的是哪一種。',
                'Quartiles have no single definition: R’s default and Excel’s PERCENTILE.INC interpolate at (n−1)p, QUARTILE.EXC at (n+1)p, and the same data gives different answers. Both are here; check which one a report you are comparing against used.'
              )}
            </Note>
          </>
        }
        right={
          stats.n === 0 ? (
            <Note>{t(l, '左邊貼一欄數字。', 'Paste a column of numbers on the left.')}</Note>
          ) : (
            <div aria-live="polite">
              <Table
                head={[t(l, '統計量', 'statistic'), t(l, '值', 'value')]}
                align={['left', 'right']}
                rows={[
                  [t(l, '筆數 n', 'count n'), count(stats.n)],
                  [t(l, '總和', 'sum'), formatStat(stats.sum)],
                  [t(l, '平均', 'mean'), formatStat(stats.mean)],
                  [t(l, '中位數', 'median'), formatStat(stats.median)],
                  [
                    t(l, '標準差(樣本,÷ n−1)', 'SD (sample, ÷ n−1)'),
                    formatStat(stats.sdSample),
                  ],
                  [
                    t(l, '標準差(母體,÷ n)', 'SD (population, ÷ n)'),
                    formatStat(stats.sdPopulation),
                  ],
                  [t(l, '變異數(樣本)', 'variance (sample)'), formatStat(stats.varianceSample)],
                  [t(l, '平均數標準誤', 'standard error'), formatStat(stats.sem)],
                  [t(l, '變異係數 CV', 'coefficient of variation'), formatStat(stats.cv)],
                  [t(l, '平均絕對偏差', 'mean absolute deviation'), formatStat(stats.mad)],
                  [t(l, '最小', 'min'), formatStat(stats.min)],
                  ['Q1', formatStat(stats.q1)],
                  ['Q3', formatStat(stats.q3)],
                  [t(l, '最大', 'max'), formatStat(stats.max)],
                  [t(l, '全距', 'range'), formatStat(stats.range)],
                  ['IQR', formatStat(stats.iqr)],
                  [t(l, '偏態 g1', 'skewness g1'), formatStat(stats.skewness)],
                  [t(l, '峰態 g2(超過常態)', 'excess kurtosis g2'), formatStat(stats.kurtosis)],
                  [t(l, '幾何平均', 'geometric mean'), formatStat(stats.geometricMean)],
                  [t(l, '調和平均', 'harmonic mean'), formatStat(stats.harmonicMean)],
                  [
                    t(l, '眾數', 'mode'),
                    stats.modes.length === 0
                      ? t(l, '沒有重複值', 'nothing repeats')
                      : `${stats.modes.slice(0, 6).map((value) => formatStat(value)).join('、')}${stats.modes.length > 6 ? '…' : ''} ×${stats.modeCount}`,
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
            </div>
          )
        }
      />

      <div className="mt-8">
        <Panel
          label={t(l, '直方圖', 'HISTOGRAM')}
          aside={
            <span className="inst-no">
              {count(chart.length)} {t(l, '組', 'bins')}
            </span>
          }
        >
          <Row>
            <Seg
              label={t(l, '分組方式', 'Binning')}
              value={binMode}
              onChange={setBinMode}
              options={[
                { value: 'sturges', label: 'Sturges' },
                { value: 'fd', label: 'Freedman–Diaconis' },
                { value: 'manual', label: t(l, '手動', 'manual') },
              ]}
            />
            {binMode === 'manual' ? (
              <>
                <Btn onClick={() => setManualBins((n) => Math.max(1, n - 1))}>−</Btn>
                <span className="inst-no" style={{ minWidth: '2.5rem', textAlign: 'center' }}>
                  {manualBins}
                </span>
                <Btn onClick={() => setManualBins((n) => Math.min(60, n + 1))}>+</Btn>
              </>
            ) : null}
          </Row>

          {chart.length === 0 ? (
            <Note>{t(l, '沒有資料。', 'No data.')}</Note>
          ) : (
            <div aria-live="polite" style={{ marginTop: '0.75rem' }}>
              {chart.map((bin, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(7rem, auto) 1fr 3.5rem',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.15rem 0',
                  }}
                >
                  <span className="inst-no" style={{ textAlign: 'right' }}>
                    {formatStat(bin.from)} – {formatStat(bin.to)}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      height: '0.6rem',
                      width: tallest === 0 ? '0%' : `${(bin.count / tallest) * 100}%`,
                      minWidth: bin.count > 0 ? '1px' : 0,
                      background: 'var(--accent)',
                      opacity: 0.75,
                    }}
                  />
                  <span className="inst-no" style={{ textAlign: 'right' }}>
                    {count(bin.count)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Note>
            {t(
              l,
              '最後一組包含上界,其他都是左閉右開,所以每一筆都落在某一組裡,各組加起來等於 n。',
              'The last bin includes its upper edge and the rest are half-open, so every value lands in exactly one bin and the counts sum to n.'
            )}
          </Note>
        </Panel>
      </div>

      {stats.n > 0 ? (
        <div className="mt-8">
          <Panel
            label={t(l, '離群值(Tukey 1.5×IQR)', 'OUTLIERS (TUKEY 1.5×IQR)')}
            aside={
              <span className="inst-no">
                {count(stats.outliers.length)} {t(l, '筆', 'values')}
              </span>
            }
          >
            <Table
              head={[t(l, '界線', 'fence'), t(l, '值', 'value')]}
              align={['left', 'right']}
              rows={[
                [t(l, '下界 Q1 − 1.5×IQR', 'lower Q1 − 1.5×IQR'), formatStat(stats.q1 - 1.5 * stats.iqr)],
                [t(l, '上界 Q3 + 1.5×IQR', 'upper Q3 + 1.5×IQR'), formatStat(stats.q3 + 1.5 * stats.iqr)],
              ].map(([k, v]) => [
                <span key="k" style={{ fontSize: '0.8125rem' }}>
                  {k}
                </span>,
                <span key="v" className="inst-no" style={{ color: 'var(--fg)' }}>
                  {v}
                </span>,
              ])}
            />
            {stats.outliers.length === 0 ? (
              <Note>{t(l, '界線之外沒有資料。', 'Nothing falls outside the fences.')}</Note>
            ) : (
              <Note>
                {stats.outliers.slice(0, 40).map((value) => formatStat(value)).join('、')}
                {stats.outliers.length > 40 ? '…' : ''}
              </Note>
            )}
            <Note>
              {t(
                l,
                '這是一條慣例線,不是「這筆資料錯了」的判定。偏態分布的長尾本來就會落在界外,刪掉它們會讓分布看起來比實際乾淨。',
                'This is a convention, not a verdict that a value is wrong. A skewed distribution has a real tail outside these fences, and deleting it makes the data look cleaner than it is.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '筆數', 'values'), v: count(stats.n) },
          { k: t(l, '略過', 'skipped'), v: count(parsed.skipped.length) },
          { k: t(l, '分組', 'bins'), v: count(chart.length) },
          { k: t(l, '離群', 'outliers'), v: count(stats.outliers.length) },
          { k: t(l, '四分位', 'quartiles'), v: method === 'inclusive' ? 'type 7' : 'type 6' },
        ]}
      />
    </div>
  );
}
