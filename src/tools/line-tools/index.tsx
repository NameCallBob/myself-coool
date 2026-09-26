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
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  DEFAULTS,
  MAX_LINES,
  duplicateReport,
  process,
  splitLines,
  type Collate,
  type DedupeKind,
  type Direction,
  type Options,
  type SortKind,
} from './logic';

/**
 * Sort, dedupe, filter, number. All of it is one pipeline in a fixed order,
 * and the order is printed on the page: the most common complaint about tools
 * like this is a result that looks wrong because the steps ran in an order the
 * reader did not expect.
 */
export default function LineTools({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const result = useMemo(() => process(text, options), [text, options]);
  const output = result.lines.join('\n');

  const duplicates = useMemo(
    () =>
      showDuplicates
        ? duplicateReport(splitLines(text), {
            ignoreCase: options.dedupeIgnoreCase,
            ignoreWhitespace: options.dedupeIgnoreWhitespace,
          })
        : [],
    [showDuplicates, text, options.dedupeIgnoreCase, options.dedupeIgnoreWhitespace]
  );

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{count(result.stats.input)} {t(l, '行', 'lines')}</span>}
        rightAside={<span className="inst-no">{count(result.stats.output)} {t(l, '行', 'lines')}</span>}
        left={
          <>
            <Area
              label={t(l, '一行一筆', 'One item per line')}
              value={text}
              onChange={setText}
              rows={16}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button
                type="button"
                className="inst-btn"
                onClick={() => setOptions(DEFAULTS)}
              >
                {t(l, '還原設定', 'reset options')}
              </button>
              <button type="button" className="inst-btn" onClick={() => setText(output)}>
                {t(l, '把輸出送回輸入', 'send output back to input')}
              </button>
            </Row>
            {result.stats.truncated ? (
              <Note error>
                {t(
                  l,
                  `行數超過 ${count(MAX_LINES)} 行,只處理前面這些,不然分頁會沒反應。`,
                  `Over ${count(MAX_LINES)} lines — only the first ${count(MAX_LINES)} were processed, to keep the tab responsive.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div className="inst-out" aria-live="polite">
              {output || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊貼上文字,結果即時出現。', 'Paste on the left; the result appears here.')}
                </span>
              )}
            </div>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>
            <Note>
              {t(
                l,
                '處理順序:去頭尾空白 → 篩選 → 去空行 → 去重 → 排序 → 反轉 → 前後綴 → 加行號。',
                'Order: trim → filter → drop blanks → dedupe → sort → reverse → affix → number.'
              )}
            </Note>
          </>
        }
      />

      <div className="inst-bench mt-8">
        <section>
          <div className="inst-pane-label">
            <span>{t(l, '清理與篩選', 'CLEAN & FILTER')}</span>
          </div>
          <Row>
            <Check2
              label={t(l, '去掉每行頭尾空白', 'trim each line')}
              checked={options.trim}
              onChange={(value) => set('trim', value)}
            />
            <Check2
              label={t(l, '去掉空行', 'drop blank lines')}
              checked={options.dropEmpty}
              onChange={(value) => set('dropEmpty', value)}
            />
          </Row>
          <Row>
            <Input
              label={t(l, '只留包含', 'Keep lines containing')}
              value={options.keep}
              onChange={(value) => set('keep', value)}
              placeholder={t(l, '留空表示全留', 'blank keeps everything')}
            />
            <Input
              label={t(l, '去掉包含', 'Drop lines containing')}
              value={options.drop}
              onChange={(value) => set('drop', value)}
              placeholder={t(l, '留空表示不去', 'blank drops nothing')}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '篩選不分大小寫', 'filter ignores case')}
              checked={options.filterIgnoreCase}
              onChange={(value) => set('filterIgnoreCase', value)}
            />
          </Row>
          <Note>
            {t(
              l,
              '篩選比對的是純文字,不是正規表達式。要用 regex 請用 A04 尋找取代。',
              'Filters match literal text, not regular expressions — use A04 for those.'
            )}
          </Note>

          <div className="inst-pane-label mt-6">
            <span>{t(l, '去重', 'DEDUPE')}</span>
            <span className="inst-no">−{count(result.stats.duplicates)}</span>
          </div>
          <Row>
            <Seg
              label={t(l, '去重方式', 'Dedupe mode')}
              value={options.dedupe}
              onChange={(value: DedupeKind) => set('dedupe', value)}
              options={[
                { value: 'none', label: t(l, '不去重', 'off') },
                { value: 'all', label: t(l, '全檔去重', 'whole file') },
                { value: 'adjacent', label: t(l, '只去相鄰(uniq)', 'adjacent only') },
              ]}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '不分大小寫', 'ignore case')}
              checked={options.dedupeIgnoreCase}
              onChange={(value) => set('dedupeIgnoreCase', value)}
            />
            <Check2
              label={t(l, '忽略頭尾空白', 'ignore surrounding whitespace')}
              checked={options.dedupeIgnoreWhitespace}
              onChange={(value) => set('dedupeIgnoreWhitespace', value)}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '列出重複的行', 'list the duplicated lines')}
              checked={showDuplicates}
              onChange={setShowDuplicates}
            />
          </Row>
          {showDuplicates ? (
            duplicates.length === 0 ? (
              <Note>{t(l, '沒有重複的行。', 'No duplicated lines.')}</Note>
            ) : (
              <Table
                head={[t(l, '行', 'line'), t(l, '次', 'n')]}
                rows={duplicates.map((entry) => [
                  <span key={entry.line} className="inst-wrap">{entry.line}</span>,
                  <span key={`${entry.line}-n`} className="inst-no">{count(entry.n)}</span>,
                ])}
                align={['left', 'right']}
              />
            )
          ) : null}
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '排序', 'SORT')}</span>
          </div>
          <Row>
            <Select
              label={t(l, '排序依據', 'Sort by')}
              value={options.sort}
              onChange={(value: SortKind) => set('sort', value)}
              options={[
                { value: 'none', label: t(l, '不排序(保留原序)', 'keep original order') },
                { value: 'text', label: t(l, '文字', 'text') },
                { value: 'natural', label: t(l, '自然排序(file2 在 file10 前)', 'natural (file2 before file10)') },
                { value: 'numeric', label: t(l, '行首數字', 'leading number') },
                { value: 'length', label: t(l, '長度', 'length') },
              ]}
            />
            <Seg
              label={t(l, '方向', 'Direction')}
              value={options.direction}
              onChange={(value: Direction) => set('direction', value)}
              options={[
                { value: 'asc', label: t(l, '升冪', 'asc') },
                { value: 'desc', label: t(l, '降冪', 'desc') },
              ]}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '排序不分大小寫', 'sort ignores case')}
              checked={options.sortIgnoreCase}
              onChange={(value) => set('sortIgnoreCase', value)}
            />
            <Check2
              label={t(l, '最後整個反轉', 'reverse at the end')}
              checked={options.reverse}
              onChange={(value) => set('reverse', value)}
            />
          </Row>
          <Row>
            <Seg
              label={t(l, '比較方式', 'Collation')}
              value={options.collate}
              onChange={(value: Collate) => set('collate', value)}
              options={[
                { value: 'binary', label: t(l, '碼點順序', 'code point') },
                { value: 'locale', label: t(l, '語言慣例', 'locale') },
              ]}
            />
          </Row>
          <Note>
            {t(
              l,
              '碼點順序等同 LC_ALL=C sort:大寫全部排在小寫前面,每個瀏覽器結果相同。語言慣例會照使用者的語言排(中文可能按拼音或筆畫),不同瀏覽器可能不一樣。',
              'Code-point order matches LC_ALL=C sort: capitals before lowercase, identical in every browser. Locale order follows the reader’s language and differs between browsers.'
            )}
          </Note>

          <div className="inst-pane-label mt-6">
            <span>{t(l, '加工', 'DECORATE')}</span>
          </div>
          <Row>
            <Input
              label={t(l, '每行前面加', 'Prefix')}
              value={options.prefix}
              onChange={(value) => set('prefix', value)}
              placeholder="- "
            />
            <Input
              label={t(l, '每行後面加', 'Suffix')}
              value={options.suffix}
              onChange={(value) => set('suffix', value)}
              placeholder=","
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '加行號', 'number the lines')}
              checked={options.number}
              onChange={(value) => set('number', value)}
            />
            <Check2
              label={t(l, '補零對齊', 'pad with zeros')}
              checked={options.numberPad}
              onChange={(value) => set('numberPad', value)}
            />
          </Row>
          {options.number ? (
            <Row>
              <Input
                label={t(l, '起始號', 'Start at')}
                type="number"
                value={String(options.numberStart)}
                onChange={(value) => set('numberStart', Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 1)}
              />
              <Input
                label={t(l, '號碼與內容之間', 'Between number and line')}
                value={options.numberSeparator}
                onChange={(value) => set('numberSeparator', value)}
              />
            </Row>
          ) : null}
        </section>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入', 'in'), v: `${count(result.stats.input)} ${t(l, '行', 'lines')}` },
          { k: t(l, '輸出', 'out'), v: `${count(result.stats.output)} ${t(l, '行', 'lines')}` },
          { k: t(l, '篩掉', 'filtered'), v: count(result.stats.filtered) },
          { k: t(l, '空行', 'blanks'), v: count(result.stats.blanks) },
          { k: t(l, '重複', 'duplicates'), v: count(result.stats.duplicates) },
          { k: t(l, '大小', 'size'), v: bytes(new Blob([output]).size) },
        ]}
      />
    </div>
  );
}
