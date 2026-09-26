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
  inspect,
  normalize,
  totalChanges,
  visualize,
  type Eol,
  type FinalNewline,
  type IndentMode,
  type Options,
} from './logic';

/**
 * Whitespace is invisible, so this tool shows it before changing it: the report
 * on the left is what the file actually contains, and the marker view makes the
 * difference between a tab and four spaces something you can see.
 */
export default function Whitespace({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [marks, setMarks] = useState(false);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((previous) => ({ ...previous, [key]: value }));

  const report = useMemo(() => inspect(text), [text]);
  const result = useMemo(() => normalize(text, options), [text, options]);
  const total = totalChanges(result.changes);
  const shown = marks ? visualize(result.text) : result.text;

  const endings =
    report.crlf > 0 && report.lf === 0 && report.cr === 0
      ? 'CRLF'
      : report.lf > 0 && report.crlf === 0 && report.cr === 0
        ? 'LF'
        : report.cr > 0 && report.lf === 0 && report.crlf === 0
          ? 'CR'
          : report.lines <= 1
            ? '—'
            : t(l, '混用', 'mixed');

  const rows: [string, string][] = [
    [t(l, '行數', 'lines'), count(report.lines)],
    [t(l, '換行符號', 'line endings'), endings],
    ['LF / CRLF / CR', `${count(report.lf)} / ${count(report.crlf)} / ${count(report.cr)}`],
    [t(l, 'Tab 縮排的行', 'tab-indented lines'), count(report.tabIndented)],
    [t(l, '空格縮排的行', 'space-indented lines'), count(report.spaceIndented)],
    [t(l, 'Tab 與空格混用的行', 'mixed-indent lines'), count(report.mixedIndent)],
    [t(l, '推測縮排寬度', 'likely indent step'), report.indentGuess === null ? '—' : String(report.indentGuess)],
    [t(l, '行尾有空白的行', 'lines with trailing space'), count(report.trailingWhitespace)],
    [t(l, '空行', 'blank lines'), count(report.blankLines)],
    [t(l, '最長連續空行', 'longest blank run'), count(report.longestBlankRun)],
    [t(l, '非普通空白(NBSP 等)', 'non-plain spaces (NBSP…)'), count(report.unicodeSpaces)],
    [t(l, '零寬字元', 'zero-width characters'), count(report.zeroWidth)],
    [t(l, 'Emoji 連接符(不會被刪)', 'emoji joiners (never removed)'), count(report.joiners)],
    [t(l, '檔尾換行', 'final newline'), report.finalNewline ? t(l, '有', 'yes') : t(l, '沒有', 'no')],
  ];

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{bytes(new Blob([text]).size)}</span>}
        rightAside={
          <span className="inst-no">
            {count(total)} {t(l, '處改動', 'changes')}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '貼上文字或程式碼', 'Paste text or code')}
              value={text}
              onChange={setText}
              rows={14}
            />
            <Row>
              <ResetButton l={l} onReset={() => setText('')} />
              <button type="button" className="inst-btn" onClick={() => setText(result.text)}>
                {t(l, '把結果寫回輸入', 'apply to the input')}
              </button>
              <Check2
                label={t(l, '顯示空白符號', 'show whitespace marks')}
                checked={marks}
                onChange={setMarks}
              />
            </Row>
            <div aria-live="polite">
              <Table
                head={[t(l, '檢查項目', 'measure'), t(l, '值', 'value')]}
                rows={rows.map(([label, value]) => [
                  label,
                  <span key={label} className="inst-no">
                    {value}
                  </span>,
                ])}
                align={['left', 'right']}
              />
            </div>
          </>
        }
        right={
          <>
            <pre className="inst-out" aria-live="polite" style={{ minHeight: '14rem', margin: 0 }}>
              {shown || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊貼上文字。', 'Paste text on the left.')}
                </span>
              )}
            </pre>
            <Row>
              <CopyButton l={l} text={result.text} />
            </Row>
            {marks ? (
              <Note>
                {t(
                  l,
                  '· 空格 ⇥ Tab ␊ LF ␍ CR ␣ 其他空白 ∅ 零寬字元 ⁀ emoji 連接符。符號只是顯示用,複製出去的是真正的文字。',
                  '· space, ⇥ tab, ␊ LF, ␍ CR, ␣ other space, ∅ zero-width, ⁀ emoji joiner. Display only — copying gives you the real text.'
                )}
              </Note>
            ) : null}
            <Table
              head={[t(l, '規則', 'rule'), t(l, '次數', 'n')]}
              rows={(
                [
                  [t(l, '換行符號', 'line endings'), result.changes.eol],
                  [t(l, '縮排', 'indentation'), result.changes.indent],
                  [t(l, '行尾空白', 'trailing space'), result.changes.trailing],
                  [t(l, '空行', 'blank lines'), result.changes.blanks],
                  [t(l, '空白字元', 'space characters'), result.changes.spaces],
                  [t(l, '零寬字元', 'zero-width'), result.changes.zeroWidth],
                  [t(l, '檔尾換行', 'final newline'), result.changes.finalNewline],
                ] as [string, number][]
              ).map(([label, n]) => [
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
            <span>{t(l, '換行與檔尾', 'LINE ENDINGS')}</span>
          </div>
          <Row>
            <Seg
              label={t(l, '換行符號', 'Line endings')}
              value={options.eol}
              onChange={(value: Eol) => set('eol', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'lf', label: 'LF' },
                { value: 'crlf', label: 'CRLF' },
                { value: 'cr', label: 'CR' },
              ]}
            />
          </Row>
          <Row>
            <Seg
              label={t(l, '檔尾換行', 'Final newline')}
              value={options.finalNewline}
              onChange={(value: FinalNewline) => set('finalNewline', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'ensure', label: t(l, '補上', 'ensure') },
                { value: 'strip', label: t(l, '去掉', 'strip') },
              ]}
            />
          </Row>
          <Note>
            {t(
              l,
              'POSIX 把「檔案」定義成一串以換行結尾的行,所以少了最後那個換行,git 會顯示 \\ No newline at end of file。',
              'POSIX defines a text file as lines each ending in a newline, which is why git prints “\\ No newline at end of file”.'
            )}
          </Note>

          <div className="inst-pane-label mt-6">
            <span>{t(l, '空行', 'BLANK LINES')}</span>
          </div>
          <Row>
            <Select
              label={t(l, '最多連續空行', 'Maximum consecutive blank lines')}
              value={String(options.maxBlank)}
              onChange={(value) => set('maxBlank', Number(value))}
              options={[
                { value: '-1', label: t(l, '不動', 'keep all') },
                { value: '0', label: t(l, '全部去掉', 'none') },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
              ]}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '去掉開頭的空行', 'drop blank lines at the start')}
              checked={options.trimStart}
              onChange={(value) => set('trimStart', value)}
            />
            <Check2
              label={t(l, '去掉結尾的空行', 'drop blank lines at the end')}
              checked={options.trimEnd}
              onChange={(value) => set('trimEnd', value)}
            />
          </Row>
        </section>

        <div className="inst-seam" aria-hidden="true" />

        <section>
          <div className="inst-pane-label">
            <span>{t(l, '縮排', 'INDENTATION')}</span>
          </div>
          <Row>
            <Seg
              label={t(l, '縮排字元', 'Indent with')}
              value={options.indent}
              onChange={(value: IndentMode) => set('indent', value)}
              options={[
                { value: 'keep', label: t(l, '不動', 'keep') },
                { value: 'spaces', label: t(l, '空格', 'spaces') },
                { value: 'tabs', label: 'Tab' },
              ]}
            />
          </Row>
          <Row>
            <Input
              label={t(l, 'Tab 寬度(原始)', 'Tab width (source)')}
              type="number"
              min={1}
              max={16}
              value={String(options.tabWidth)}
              onChange={(value) => set('tabWidth', Math.max(1, Math.min(16, Number(value) || 1)))}
            />
            <Input
              label={t(l, '目標縮排寬度', 'Target indent width')}
              type="number"
              min={1}
              max={16}
              value={String(options.indentWidth)}
              onChange={(value) => set('indentWidth', Math.max(1, Math.min(16, Number(value) || 1)))}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, '換算縮排層級(4 空白 → 2 空白)', 'rescale levels (4 spaces → 2)')}
              checked={options.rescale}
              onChange={(value) => set('rescale', value)}
            />
          </Row>
          <Note>
            {t(
              l,
              'Tab 是「跳到下一個定位點」,不是固定 n 個空格:a\\tb 在寬度 4 下是 a 加三個空格。換算層級時,寬度不是來源寬度整數倍的行會原樣保留——那通常是手動對齊的續行。',
              'A tab advances to the next tab stop rather than being n spaces. When rescaling, a line whose indent is not a whole multiple of the source width is left as is — that is usually hand-aligned continuation.'
            )}
          </Note>

          <div className="inst-pane-label mt-6">
            <span>{t(l, '其他空白', 'OTHER WHITESPACE')}</span>
          </div>
          <Row>
            <Check2
              label={t(l, '去掉行尾空白', 'strip trailing whitespace')}
              checked={options.trailing}
              onChange={(value) => set('trailing', value)}
            />
            <Check2
              label={t(l, '句中連續空格壓成一個', 'collapse runs of spaces in a line')}
              checked={options.collapseInner}
              onChange={(value) => set('collapseInner', value)}
            />
          </Row>
          <Row>
            <Check2
              label={t(l, 'NBSP 等特殊空白改成普通空格', 'NBSP and friends to a plain space')}
              checked={options.unicodeSpaces}
              onChange={(value) => set('unicodeSpaces', value)}
            />
            <Check2
              label={t(l, '刪掉零寬字元', 'remove zero-width characters')}
              checked={options.zeroWidth}
              onChange={(value) => set('zeroWidth', value)}
            />
          </Row>
          <Note>
            {t(
              l,
              '零寬字元刪的是 ZWSP、ZWNJ、BOM、word joiner 與軟連字號。U+200D(emoji 連接符)不刪——刪了會把一個 emoji 家族變成三個人。全形空格 U+3000 請用 A06 處理。',
              'Removes ZWSP, ZWNJ, BOM, word joiner and the soft hyphen. U+200D is kept: removing it turns one emoji family into three people. For the ideographic space, use A06.'
            )}
          </Note>
          <Row>
            <button type="button" className="inst-btn" onClick={() => setOptions(DEFAULTS)}>
              {t(l, '還原預設', 'restore defaults')}
            </button>
          </Row>
        </section>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '行', 'lines'), v: count(report.lines) },
          { k: t(l, '換行', 'endings'), v: endings },
          { k: t(l, '改動', 'changes'), v: count(total) },
          { k: t(l, '行尾空白', 'trailing'), v: count(report.trailingWhitespace) },
          { k: t(l, '輸入', 'in'), v: bytes(new Blob([text]).size) },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([result.text]).size) },
        ]}
      />
    </div>
  );
}
