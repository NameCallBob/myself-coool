'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULTS,
  tidy,
  totalChanges,
  type Options,
  type PunctuationMode,
  type QuoteStyle,
  type RunMode,
  type WidthMode,
} from './logic';

const SAMPLE =
  '這個API在2024年釋出,支援JSON與CSV格式。檔案.txt不要改名,ＩＤ欄位是A1。他說"這樣就好"...';

/**
 * Chinese typography repair. Every rule is a checkbox because every rule is a
 * house-style decision, and the two that can plausibly damage text (forcing
 * punctuation width, squeezing spaces between characters) are off by default.
 */
export default function CjkTidy({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Options>(DEFAULTS);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const result = useMemo(() => tidy(text, options), [text, options]);
  const total = totalChanges(result.changes);

  const breakdown: [string, number][] = [
    [t(l, '中英之間補空格', 'spaces inserted'), result.changes.spacesAdded],
    [t(l, '多餘空白移除', 'spaces removed'), result.changes.spacesRemoved],
    [t(l, '全形半形', 'width'), result.changes.width],
    [t(l, '標點', 'punctuation'), result.changes.punctuation],
    [t(l, '引號', 'quotes'), result.changes.quotes],
    [t(l, '刪節號', 'ellipsis'), result.changes.ellipsis],
    [t(l, '破折號', 'dash'), result.changes.dash],
    [t(l, '半形假名', 'half-width kana'), result.changes.kana],
  ];

  return (
    <div>
      <Bench
        leftLabel={t(l, '原文', 'INPUT')}
        rightLabel={t(l, '修整後', 'TIDIED')}
        leftAside={<span className="inst-no">{bytes(new Blob([text]).size)}</span>}
        rightAside={
          <span className="inst-no">
            {count(total)} {t(l, '處改動', 'changes')}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '貼上中英混排的文字', 'Paste mixed Chinese and Latin text')}
              value={text}
              onChange={setText}
              rows={14}
              placeholder={SAMPLE}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button type="button" className="inst-btn" onClick={() => setText(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
              <button type="button" className="inst-btn" onClick={() => setText(result.text)}>
                {t(l, '把結果寫回原文', 'apply to the input')}
              </button>
            </Row>
            <Note>
              {t(
                l,
                '改動只發生在你勾選的規則上,沒勾的一律不動。想確認改了哪裡,把兩邊貼進 A05 文字比對。',
                'Only the rules you tick are applied. To see exactly what moved, paste both sides into A05.'
              )}
            </Note>
          </>
        }
        right={
          <>
            <div className="inst-out" aria-live="polite" style={{ minHeight: '14rem' }}>
              {result.text || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊貼上文字。', 'Paste text on the left.')}
                </span>
              )}
            </div>
            <Row>
              <CopyButton l={l} text={result.text} />
            </Row>
            <Table
              head={[t(l, '規則', 'rule'), t(l, '次數', 'n')]}
              rows={breakdown.map(([label, n]) => [
                label,
                <span key={label} className="inst-no">
                  {count(n)}
                </span>,
              ])}
              align={['left', 'right']}
            />
          </>
        }
      />

      <div className="inst-bench mt-8">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '間距', 'SPACING')}</span>
          </div>
          <Row>
            <Check2
              label={t(l, '中英數之間補一個空格', 'space between CJK and Latin')}
              checked={options.spaceCjkLatin}
              onChange={(value) => set('spaceCjkLatin', value)}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '去掉全形標點旁的空格', 'drop spaces against full-width punctuation')}
              checked={options.trimAroundFullwidth}
              onChange={(value) => set('trimAroundFullwidth', value)}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '去掉中文字之間的空格', 'drop spaces between two CJK characters')}
              checked={options.dropSpaceBetweenCjk}
              onChange={(value) => set('dropSpaceBetweenCjk', value)}
            />
            <Check2
              label={t(l, '連續空格壓成一個', 'collapse runs of spaces')}
              checked={options.collapseSpaces}
              onChange={(value) => set('collapseSpaces', value)}
            />
          </Row>
          <Note>
            {t(
              l,
              '「去掉中文字之間的空格」會動到刻意排開的文字(詩、表格對齊),預設關著。',
              'Dropping spaces between CJK characters will also flatten deliberate spacing, so it is off by default.'
            )}
          </Note>

          <div className="inst-pane-label mt-6">
            <span>{t(l, '全形半形', 'CHARACTER WIDTH')}</span>
          </div>
          <Row>
            <Seg
              label={t(l, '英數字寬度', 'Letters and digits')}
              value={options.width}
              onChange={(value: WidthMode) => set('width', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'half', label: t(l, '全形→半形', 'to half-width') },
                { value: 'full', label: t(l, '半形→全形', 'to full-width') },
              ]}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '全形空格 U+3000 換成普通空格', 'ideographic space to a plain space')}
              checked={options.fullwidthSpace}
              onChange={(value) => set('fullwidthSpace', value)}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '半形片假名合成全形(ｶﾞ → ガ)', 'compose half-width katakana (ｶﾞ → ガ)')}
              checked={options.composeKana}
              onChange={(value) => set('composeKana', value)}
            />
          </Row>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '標點', 'PUNCTUATION')}</span>
          </div>
          <Select
            label={t(l, '標點寬度', 'Punctuation width')}
            value={options.punctuation}
            onChange={(value: PunctuationMode) => set('punctuation', value)}
            options={[
              { value: 'keep', label: t(l, '不動', 'keep') },
              { value: 'contextual', label: t(l, '看上下文判斷(建議)', 'decide from context (recommended)') },
              { value: 'full', label: t(l, '全部改成全形', 'force full-width') },
              { value: 'half', label: t(l, '全部改成半形', 'force half-width') },
            ]}
            hint={t(
              l,
              '看上下文:含中文的那一行才會補全形標點,純英文那一行的全形標點會改回半形。檔名、版號、時間與網址裡的點與冒號不動。',
              'Contextual: only a line containing CJK gains full-width punctuation, and a Latin-only line has its full-width punctuation narrowed. Dots and colons in file names, versions, times and URLs are left alone.'
            )}
          />
          {options.punctuation === 'full' || options.punctuation === 'half' ? (
            <Note error>
              {t(
                l,
                '強制轉換不看上下文:檔名、版號、程式碼裡的標點也會一起被改。確認過再用。',
                'Forced conversion ignores context — file names, version numbers and code will be changed too.'
              )}
            </Note>
          ) : null}

          <div className="inst-pane-label mt-6">
            <span>{t(l, '引號與符號', 'QUOTES & MARKS')}</span>
          </div>
          <Row>
            <Check2
              label={t(l, '直引號改成成對的引號', 'pair straight quotes')}
              checked={options.quotes}
              onChange={(value) => set('quotes', value)}
            />
            <Seg
              label={t(l, '引號樣式', 'Quote style')}
              value={options.quoteStyle}
              onChange={(value: QuoteStyle) => set('quoteStyle', value)}
              options={[
                { value: 'curly', label: '“ ” ‘ ’' },
                { value: 'corner', label: '「 」 『 』' },
              ]}
            />
          </Row>
          <Note>
            {t(
              l,
              '開引號或閉引號是看前一個字決定的:前面是空白或開括號就是開引號。字母中間的那一撇一律當成撇號(don’t)。',
              'Open or close is decided by the preceding character; an apostrophe between letters stays an apostrophe (don’t).'
            )}
          </Note>
          <Row>
            <Seg
              label={t(l, '刪節號', 'Ellipsis')}
              value={options.ellipsis}
              onChange={(value: RunMode) => set('ellipsis', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'cjk', label: '……' },
                { value: 'single', label: '…' },
              ]}
            />
          </Row>
          <Row>
            <Seg
              label={t(l, '破折號', 'Dash')}
              value={options.dash}
              onChange={(value: RunMode) => set('dash', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'cjk', label: '——' },
                { value: 'single', label: '—' },
              ]}
            />
          </Row>
          <Note>
            {t(
              l,
              '破折號只在旁邊有中文時才轉換,所以 npm run build --watch 不會被動到。',
              'Dashes convert only next to CJK, so `npm run build --watch` survives.'
            )}
          </Note>
          <Row>
            <button type="button" className="inst-btn" onClick={() => setOptions(DEFAULTS)}>
              {t(l, '還原預設規則', 'restore defaults')}
            </button>
          </Row>
        </section>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '改動', 'changes'), v: count(total) },
          { k: t(l, '補空格', 'spaced'), v: count(result.changes.spacesAdded) },
          { k: t(l, '標點', 'punctuation'), v: count(result.changes.punctuation) },
          { k: t(l, '全半形', 'width'), v: count(result.changes.width) },
          { k: t(l, '輸入', 'in'), v: bytes(new Blob([text]).size) },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([result.text]).size) },
        ]}
      />
    </div>
  );
}
