'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULTS,
  byteLength,
  percentEncoded,
  uniqueSlugs,
  type NonAscii,
  type Options,
} from './logic';

const SAMPLE = 'Crème Brûlée 的做法\n台北美食指南\nRock & Roll\nNotes\nNotes';

export default function Slugify({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Options>(DEFAULTS);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const lines = useMemo(
    () => text.split('\n').filter((line) => line.trim() !== ''),
    [text]
  );
  const rows = useMemo(() => uniqueSlugs(lines, options), [lines, options]);
  const output = rows.map((row) => row.slug).join('\n');

  const empties = rows.filter((row) => row.slug === '').length;
  const longest = rows.reduce((max, row) => Math.max(max, byteLength(row.slug)), 0);

  return (
    <div>
      <Bench
        leftLabel={t(l, '標題', 'TITLES')}
        rightLabel={t(l, 'Slug', 'SLUGS')}
        leftAside={
          <span className="inst-no">
            {count(lines.length)} {t(l, '行', 'lines')}
          </span>
        }
        rightAside={longest > 0 ? <span className="inst-no">{t(l, '最長', 'longest')} {longest} B</span> : null}
        left={
          <>
            <Area
              label={t(l, '一行一個標題', 'One title per line')}
              value={text}
              onChange={setText}
              rows={10}
              placeholder={SAMPLE}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button type="button" className="inst-btn" onClick={() => setText(SAMPLE)}>
                {t(l, '放入範例', 'load sample')}
              </button>
              <CopyButton l={l} text={output} label={t(l, '複製 slug', 'copy slugs')} />
            </Row>

            <div className="inst-pane-label mt-6">
              <span>{t(l, '設定', 'OPTIONS')}</span>
            </div>
            <Row>
              <Seg
                label={t(l, '非 ASCII 字元', 'Non-ASCII characters')}
                value={options.nonAscii}
                onChange={(value: NonAscii) => set('nonAscii', value)}
                options={[
                  { value: 'transliterate', label: t(l, '轉成 ASCII', 'transliterate') },
                  { value: 'keep', label: t(l, '保留', 'keep') },
                  { value: 'strip', label: t(l, '移除', 'strip') },
                ]}
              />
            </Row>
            <Note>
              {t(
                l,
                '轉成 ASCII 只處理拉丁字母的變音符號(é→e、ß→ss):中文、日文、俄文沒有可靠的零依賴音譯表,所以會變成空字串——中文標題請選「保留」。',
                'Transliteration covers Latin diacritics only (é→e, ß→ss). There is no dependency-free romanisation for Chinese, Japanese or Cyrillic, so those become empty — choose keep for CJK titles.'
              )}
            </Note>
            <Row>
              <Input
                label={t(l, '分隔符', 'Separator')}
                value={options.separator}
                onChange={(value) => set('separator', value.slice(0, 3))}
                placeholder="-"
              />
              <Input
                label={t(l, '& 轉成', 'Ampersand becomes')}
                value={options.ampersand}
                onChange={(value) => set('ampersand', value)}
                placeholder="and"
              />
            </Row>
            <Row>
              <Input
                label={t(l, '長度上限(字元,0 = 不限)', 'Length cap (characters, 0 = none)')}
                type="number"
                min={0}
                max={200}
                value={String(options.maxLength)}
                onChange={(value) => set('maxLength', Math.max(0, Math.min(200, Number(value) || 0)))}
              />
            </Row>
            <Row>
              <Check2
                label={t(l, '全部小寫', 'lowercase')}
                checked={options.lowercase}
                onChange={(value) => set('lowercase', value)}
              />
              <Check2
                label={t(l, '截斷時切在分隔符上', 'cut at a separator')}
                checked={options.wordSafe}
                onChange={(value) => set('wordSafe', value)}
              />
            </Row>
            <Row>
              <button type="button" className="inst-btn" onClick={() => setOptions(DEFAULTS)}>
                {t(l, '還原預設', 'restore defaults')}
              </button>
            </Row>
          </>
        }
        right={
          <div aria-live="polite">
            {rows.length === 0 ? (
              <div className="inst-out">
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊貼上標題。', 'Paste titles on the left.')}
                </span>
              </div>
            ) : (
              <Table
                head={[t(l, 'Slug', 'slug'), t(l, 'URL 形式', 'in a URL'), 'B']}
                rows={rows.map((row, index) => [
                  <span key={`${index}-slug`} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {row.slug || (
                      <span style={{ color: 'var(--accent)' }}>
                        {t(l, '(空的)', '(empty)')}
                      </span>
                    )}
                    {row.duplicate ? (
                      <span style={{ color: 'var(--fg-faint)' }}> {t(l, '重複編號', 'deduped')}</span>
                    ) : null}
                  </span>,
                  <span key={`${index}-url`} className="inst-wrap" style={{ color: 'var(--fg-faint)' }}>
                    {percentEncoded(row.slug)}
                  </span>,
                  <span key={`${index}-b`} className="inst-no">
                    {count(byteLength(row.slug))}
                  </span>,
                ])}
                align={['left', 'left', 'right']}
              />
            )}
            {empties > 0 ? (
              <Note error>
                {t(
                  l,
                  `有 ${count(empties)} 個標題轉不出 slug——通常是整個標題都不是 ASCII。把「非 ASCII 字元」改成「保留」,或自己取一個英文 slug。`,
                  `${count(empties)} title(s) produced an empty slug — usually a title with no ASCII in it. Switch non-ASCII to keep, or write a slug by hand.`
                )}
              </Note>
            ) : null}
            <Note>
              {t(
                l,
                '保留中文時,網址列看起來是中文,但實際傳出去的是 percent-encoding,一個中文字三個 byte、九個字元。右邊那兩欄就是在講這件事。',
                'A kept CJK slug reads as Chinese in the address bar but travels as percent-encoding: three bytes and nine characters per character. That is what the two right-hand columns show.'
              )}
            </Note>
          </div>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '標題', 'titles'), v: count(lines.length) },
          { k: t(l, '產生', 'slugs'), v: count(rows.filter((row) => row.slug !== '').length) },
          { k: t(l, '空的', 'empty'), v: count(empties) },
          { k: t(l, '重複編號', 'deduped'), v: count(rows.filter((row) => row.duplicate).length) },
          { k: t(l, '最長', 'longest'), v: `${count(longest)} B` },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([output]).size) },
        ]}
      />
    </div>
  );
}
