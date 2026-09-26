'use client';

import { useState, type ReactNode } from 'react';
import type { ToolProps } from '../types';
import { Bench, Input, Note, Readout, Row } from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
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
  zheToPercentOff,
} from './logic';

/** Every field the six questions use, as raw text. */
type Fields = {
  sharePart: string;
  shareWhole: string;
  changeFrom: string;
  changeTo: string;
  chainFirst: string;
  chainSecond: string;
  ofWhole: string;
  ofPercent: string;
  reversePart: string;
  reversePercent: string;
  listPrice: string;
  percentOff: string;
  zhe: string;
  salePrice: string;
  taxAmount: string;
  taxRate: string;
  rateFrom: string;
  rateTo: string;
  markup: string;
  margin: string;
};

const INITIAL: Fields = {
  sharePart: '25',
  shareWhole: '200',
  changeFrom: '100',
  changeTo: '120',
  chainFirst: '20',
  chainSecond: '-20',
  ofWhole: '1200',
  ofPercent: '15',
  reversePart: '30',
  reversePercent: '15',
  listPrice: '1000',
  percentOff: '20',
  zhe: '8',
  salePrice: '800',
  taxAmount: '1050',
  taxRate: '5',
  rateFrom: '3',
  rateTo: '4',
  markup: '25',
  margin: '20',
};

/** One answer line: a label, the number, and nothing else competing with it. */
function Line({ k, v, muted }: { k: string; v: ReactNode; muted?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '1rem',
        padding: '0.3rem 0',
        borderBottom: '1px solid var(--border-1)',
      }}
    >
      <span style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)' }}>{k}</span>
      <span
        className="inst-no"
        style={{
          fontSize: muted ? '0.8125rem' : '1rem',
          color: muted ? 'var(--fg-muted)' : 'var(--fg)',
        }}
      >
        {v}
      </span>
    </div>
  );
}

export default function Percentage({ l }: ToolProps) {
  const [f, setF] = useState<Fields>(INITIAL);
  const set = (key: keyof Fields) => (value: string) =>
    setF((previous) => ({ ...previous, [key]: value }));

  const n = (key: keyof Fields) => parseNumber(f[key]);

  const sharePart = n('sharePart');
  const shareWhole = n('shareWhole');
  const changeFrom = n('changeFrom');
  const changeTo = n('changeTo');
  const taxBase = n('taxAmount');
  const taxRate = n('taxRate');
  const percentOff = n('percentOff');
  const listPrice = n('listPrice');
  const zheOff = zheToPercentOff(n('zhe'));

  const filled = (Object.keys(f) as (keyof Fields)[]).filter(
    (key) => !Number.isNaN(parseNumber(f[key]))
  ).length;

  const inclusive = taxFromGross(taxBase, taxRate);
  const exclusive = taxFromNet(taxBase, taxRate);

  return (
    <div className="inst">
      <Bench
        leftLabel={t(l, '一、佔比', '1 · SHARE OF TOTAL')}
        rightLabel={t(l, '二、增減幅', '2 · CHANGE')}
        left={
          <>
            <Row>
              <Input label={t(l, '部分', 'Part')} value={f.sharePart} onChange={set('sharePart')} />
              <Input label={t(l, '總數', 'Whole')} value={f.shareWhole} onChange={set('shareWhole')} />
            </Row>
            <div aria-live="polite">
              <Line
                k={t(l, '部分佔總數', 'part of whole')}
                v={formatPercent(share(sharePart, shareWhole))}
              />
              <Line
                k={t(l, '剩下的部分', 'the remainder')}
                v={formatPercent(share(shareWhole - sharePart, shareWhole))}
                muted
              />
              <Line
                k={t(l, '相差', 'difference')}
                v={formatAmount(shareWhole - sharePart)}
                muted
              />
            </div>
            {shareWhole === 0 ? (
              <Note error>{t(l, '總數是 0,沒有佔比可言。', 'Nothing is a percentage of zero.')}</Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <Input label={t(l, '原本', 'From')} value={f.changeFrom} onChange={set('changeFrom')} />
              <Input label={t(l, '變成', 'To')} value={f.changeTo} onChange={set('changeTo')} />
            </Row>
            <div aria-live="polite">
              <Line
                k={t(l, '變化', 'change')}
                v={formatPercent(changePercent(changeFrom, changeTo))}
              />
              <Line
                k={t(l, '反方向算', 'the other direction')}
                v={formatPercent(changePercent(changeTo, changeFrom))}
                muted
              />
              <Line k={t(l, '差額', 'absolute')} v={formatAmount(changeTo - changeFrom)} muted />
            </div>
            {changeFrom === 0 ? (
              <Note error>
                {t(
                  l,
                  '從 0 開始的成長算不出百分比。用差額描述,不要寫「成長 100%」。',
                  'Growth from zero has no percentage. Describe the absolute difference instead.'
                )}
              </Note>
            ) : changeIsAmbiguous(changeFrom) ? (
              <Note error>
                {t(
                  l,
                  '基期是負數,增減幅的正負號只是慣例。這裡用絕對值當分母:虧損從 -100 縮到 -50 記為 +50%。',
                  'The base is negative, so the sign is a convention. Here the denominator is |base|: a loss shrinking from −100 to −50 reads +50%.'
                )}
              </Note>
            ) : null}
            <Note>
              {t(
                l,
                `連續兩次變化不會互相抵消:先 ${f.chainFirst || '0'}% 再 ${f.chainSecond || '0'}%,合計 ${formatPercent(chainChanges(n('chainFirst'), n('chainSecond')))}。`,
                `Two changes do not cancel: ${f.chainFirst || '0'}% then ${f.chainSecond || '0'}% is ${formatPercent(chainChanges(n('chainFirst'), n('chainSecond')))} overall.`
              )}
            </Note>
            <Row>
              <Input label={t(l, '第一次 %', 'First %')} value={f.chainFirst} onChange={set('chainFirst')} />
              <Input label={t(l, '第二次 %', 'Second %')} value={f.chainSecond} onChange={set('chainSecond')} />
            </Row>
          </>
        }
      />

      <div className="mt-8">
        <Bench
          leftLabel={t(l, '三、取百分比與反推原值', '3 · PERCENT OF, AND BACK')}
          rightLabel={t(l, '四、折扣', '4 · DISCOUNT')}
          left={
            <>
              <Row>
                <Input label={t(l, '總數', 'Whole')} value={f.ofWhole} onChange={set('ofWhole')} />
                <Input label={t(l, '百分比 %', 'Percent')} value={f.ofPercent} onChange={set('ofPercent')} />
              </Row>
              <div aria-live="polite">
                <Line
                  k={t(l, '這麼多', 'that much is')}
                  v={formatAmount(partOf(n('ofWhole'), n('ofPercent')))}
                />
                <Line
                  k={t(l, '加上去之後', 'after adding it')}
                  v={formatAmount(applyChange(n('ofWhole'), n('ofPercent')))}
                  muted
                />
                <Line
                  k={t(l, '扣掉之後', 'after taking it off')}
                  v={formatAmount(applyChange(n('ofWhole'), -n('ofPercent')))}
                  muted
                />
              </div>
              <Row>
                <Input label={t(l, '已知數值', 'Known part')} value={f.reversePart} onChange={set('reversePart')} />
                <Input label={t(l, '它是幾 %', 'is what %')} value={f.reversePercent} onChange={set('reversePercent')} />
              </Row>
              <div aria-live="polite">
                <Line
                  k={t(l, '原本的總數', 'so the whole is')}
                  v={formatAmount(wholeFrom(n('reversePart'), n('reversePercent')))}
                />
                <Line
                  k={t(l, '若這是漲幅後的值,漲前是', 'if that was after the rise, before it')}
                  v={formatAmount(baseBeforeChange(n('reversePart'), n('reversePercent')))}
                  muted
                />
              </div>
            </>
          }
          right={
            <>
              <Row>
                <Input label={t(l, '原價', 'List price')} value={f.listPrice} onChange={set('listPrice')} />
                <Input label={t(l, '折扣 %', 'Percent off')} value={f.percentOff} onChange={set('percentOff')} />
              </Row>
              <div aria-live="polite">
                <Line k={t(l, '售價', 'you pay')} v={formatAmount(discount(listPrice, percentOff).sale)} />
                <Line
                  k={t(l, '省下', 'you save')}
                  v={formatAmount(discount(listPrice, percentOff).saved)}
                  muted
                />
                <Line
                  k={t(l, '相當於', 'quoted as')}
                  v={
                    Number.isNaN(percentOffToZhe(percentOff))
                      ? '—'
                      : `${formatAmount(percentOffToZhe(percentOff), 1)} ${t(l, '折', 'tenths kept')}`
                  }
                  muted
                />
              </div>
              <Row>
                <Input
                  label={t(l, '幾折(台式)', 'Quoted in 折')}
                  value={f.zhe}
                  onChange={set('zhe')}
                  hint={t(l, '8 是八折,85 是 85 折。', '8 means 80% of the price; 85 means 85%.')}
                />
                <Input label={t(l, '售價反推原價', 'Sale price')} value={f.salePrice} onChange={set('salePrice')} />
              </Row>
              <div aria-live="polite">
                <Line
                  k={t(l, '折 → 打幾 %', '折 → percent off')}
                  v={formatPercent(zheOff)}
                />
                <Line
                  k={t(l, '用這個折數算售價', 'sale at that 折')}
                  v={formatAmount(discount(listPrice, zheOff).sale)}
                  muted
                />
                <Line
                  k={t(l, '售價回推原價', 'list price behind the sale')}
                  v={formatAmount(listPriceFrom(n('salePrice'), percentOff))}
                  muted
                />
              </div>
              <Note>
                {t(
                  l,
                  '台灣的「折」是保留幾成,不是打掉幾成:八折是付原價的 80%,少付 20%。',
                  'In Taiwan a 折 is the fraction of the price kept, not taken off: 八折 means paying 80%.'
                )}
              </Note>
            </>
          }
        />
      </div>

      <div className="mt-8">
        <Bench
          leftLabel={t(l, '五、稅前稅後', '5 · BEFORE AND AFTER TAX')}
          rightLabel={t(l, '六、百分點與毛利率', '6 · POINTS, MARGIN, MARKUP')}
          left={
            <>
              <Row>
                <Input label={t(l, '金額', 'Amount')} value={f.taxAmount} onChange={set('taxAmount')} />
                <Input
                  label={t(l, '稅率 %', 'Tax rate')}
                  value={f.taxRate}
                  onChange={set('taxRate')}
                  hint={t(l, '台灣營業稅目前是 5%,以發票為準。', 'Taiwan business tax is 5%; the invoice is authoritative.')}
                />
              </Row>
              <div aria-live="polite">
                <Line k={t(l, '把金額當含稅:未稅', 'treating it as gross: net')} v={formatAmount(inclusive.net)} />
                <Line k={t(l, '其中的稅額', 'tax inside it')} v={formatAmount(inclusive.tax)} />
                <Line k={t(l, '把金額當未稅:含稅', 'treating it as net: gross')} v={formatAmount(exclusive.gross)} muted />
                <Line k={t(l, '要加的稅額', 'tax to add')} v={formatAmount(exclusive.tax)} muted />
              </div>
              <Note>
                {t(
                  l,
                  '含稅金額裡的稅不是「金額 × 稅率」。1050 含 5% 稅時,稅是 50 而不是 52.5——分母是 1.05。',
                  'The tax inside a gross amount is not gross × rate. In 1050 at 5%, the tax is 50, not 52.5: divide by 1.05.'
                )}
              </Note>
            </>
          }
          right={
            <>
              <Row>
                <Input label={t(l, '原本的比率 %', 'Rate before')} value={f.rateFrom} onChange={set('rateFrom')} />
                <Input label={t(l, '現在的比率 %', 'Rate after')} value={f.rateTo} onChange={set('rateTo')} />
              </Row>
              <div aria-live="polite">
                <Line
                  k={t(l, '差幾個百分點', 'percentage points')}
                  v={`${formatAmount(pointsDelta(n('rateFrom'), n('rateTo')), 4)} ${t(l, '點', 'pt')}`}
                />
                <Line
                  k={t(l, '相對變化', 'relative change')}
                  v={formatPercent(changePercent(n('rateFrom'), n('rateTo')))}
                />
              </div>
              <Note>
                {t(
                  l,
                  '利率從 3% 到 4% 是「升一個百分點」,也是「上升 33%」。兩種說法都對,混用就會誤導。',
                  'A rate moving 3% → 4% has risen one percentage point and also 33%. Both are true; mixing them misleads.'
                )}
              </Note>
              <Row>
                <Input label={t(l, '加價率 %(對成本)', 'Markup % on cost')} value={f.markup} onChange={set('markup')} />
                <Input label={t(l, '毛利率 %(對售價)', 'Margin % on price')} value={f.margin} onChange={set('margin')} />
              </Row>
              <div aria-live="polite">
                <Line
                  k={t(l, '這個加價率的毛利率', 'that markup is a margin of')}
                  v={formatPercent(markupToMargin(n('markup')))}
                />
                <Line
                  k={t(l, '這個毛利率需要的加價率', 'that margin needs a markup of')}
                  v={formatPercent(marginToMarkup(n('margin')))}
                />
              </div>
              <Note>
                {t(
                  l,
                  '加價率的分母是成本,毛利率的分母是售價。成本加價 25% 的東西,毛利率是 20%。',
                  'Markup is measured against cost, margin against price. A 25% markup is a 20% margin.'
                )}
              </Note>
            </>
          }
        />
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '題組', 'questions'), v: '6' },
          { k: t(l, '已填欄位', 'fields filled'), v: `${filled} / ${Object.keys(f).length}` },
          { k: t(l, '空欄視為', 'blank means'), v: t(l, '未作答', 'no answer') },
          { k: t(l, '算法', 'arithmetic'), v: 'IEEE 754 double' },
        ]}
      />
    </div>
  );
}
