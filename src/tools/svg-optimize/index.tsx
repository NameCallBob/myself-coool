'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  DropZone,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count, fixed } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import {
  DEFAULT_OPTIONS,
  EDITOR_PREFIXES,
  MAX_NODES,
  MAX_SOURCE,
  optimizeSvg,
  type FailCode,
  type Options,
  type Outcome,
  type WarningCode,
} from './logic';

/** Above this many characters the work waits for a button instead of running
 *  on every keystroke. Pasting is instant either way; typing is not. */
const AUTO_LIMIT = 200_000;

const DIGIT_CHOICES = ['0', '1', '2', '3', 'off'] as const;

const SAMPLE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generator: an editor that likes to sign its work -->',
  '<svg xmlns="http://www.w3.org/2000/svg"',
  '     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
  '     width="48" height="48" inkscape:version="1.1.2">',
  '  <metadata>',
  '    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>',
  '  </metadata>',
  '  <g inkscape:label="Layer 1" inkscape:groupmode="layer" fill-opacity="1" stroke-linejoin="miter">',
  '    <path d="M24.000001 4.0000004 L43.99999 43.999999 L4.0000001 44.000001 Z"',
  '          fill="none" stroke="#111111" stroke-width="2" stroke-miterlimit="4"/>',
  '    <circle cx="24.123456" cy="30.987654" r="3.5000001" stroke="none"/>',
  '  </g>',
  '  <g id="empty-layer"/>',
  '</svg>',
].join('\n');

type Run = {
  outcome: Outcome;
  /** Object URLs for the two previews. Neither SVG is ever put into the DOM. */
  sourceUrl: string;
  resultUrl: string | null;
};

function splitPrefixes(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
}

function failText(l: Loc, code: FailCode, detail: string): string {
  const where = detail === '' ? '' : `:${detail}`;
  switch (code) {
    case 'empty':
      return t(l, '沒有輸入。', 'Nothing to read.');
    case 'too-large':
      return t(
        l,
        `檔案超過 ${count(MAX_SOURCE)} 個字元,這裡不處理。`,
        `Over ${count(MAX_SOURCE)} characters — past what this tool will read.`
      );
    case 'too-many-nodes':
      return t(
        l,
        `節點超過 ${count(MAX_NODES)} 個,這裡不處理。`,
        `Over ${count(MAX_NODES)} nodes — past what this tool will read.`
      );
    case 'too-deep':
      return t(l, '巢狀太深。', 'Nested too deep.');
    case 'bad-tag':
      return t(l, `標籤寫法看不懂${where}。`, `Cannot read this tag${where}.`);
    case 'stray-close':
      return t(l, `多了一個結束標籤 </${detail}>。`, `A closing tag </${detail}> with nothing open.`);
    case 'mismatched-tag':
      return t(l, `開始與結束標籤對不上(${detail})。`, `Open and close tags do not match (${detail}).`);
    case 'unclosed-tag':
      return t(l, `<${detail}> 沒有關。`, `<${detail}> is never closed.`);
    case 'unterminated':
      return t(l, `${detail} 沒有結束。`, `${detail} is never terminated.`);
    case 'bad-path':
      return t(l, `路徑資料看不懂(${detail})。`, `Cannot read this path data (${detail}).`);
  }
}

function warningText(l: Loc, code: WarningCode): string {
  switch (code) {
    case 'no-svg-root':
      return t(
        l,
        '找不到 <svg> 根元素。這份檔案還是照 XML 處理了,但沒有加 viewBox 之類跟 svg 有關的動作。',
        'No <svg> root element. The file was still processed as XML, but nothing SVG-specific ran.'
      );
    case 'no-xmlns':
      return t(
        l,
        '根元素沒有 xmlns。內嵌進 HTML 沒問題,但存成 .svg 檔會打不開——請自己補上 xmlns="http://www.w3.org/2000/svg"。',
        'The root has no xmlns. Fine inline in HTML, but a standalone .svg file will not open — add xmlns="http://www.w3.org/2000/svg".'
      );
    case 'style-element':
      return t(
        l,
        '檔案裡有 <style>,所以「刪掉預設值屬性」整個跳過了:CSS 可能把某個屬性改成別的值,刪掉就會變樣。',
        'The file has a <style> element, so the default-attribute pass was skipped entirely: CSS may set those properties to something else.'
      );
    case 'script-element':
      return t(
        l,
        '檔案裡有 <script>。它原封不動留著,但下面的預覽是 <img>,裡面的腳本不會執行。',
        'The file has a <script>. It is left untouched, but the preview below is an <img>, where scripts do not run.'
      );
    case 'use-element':
      return t(
        l,
        '檔案裡有 <use>,所以「刪掉預設值屬性」整個跳過了:被 <use> 複製出去的節點,繼承來源不是檔案裡的父節點。',
        'The file has a <use>, so the default-attribute pass was skipped: an instantiated sub-tree inherits from the use site, not from its parents in the file.'
      );
    case 'foreign-object':
      return t(
        l,
        '檔案裡有 <foreignObject>。裡面是 HTML,空白視為內容,沒有動它。',
        'The file has a <foreignObject>. That is HTML, where whitespace is content, so it was left alone.'
      );
    case 'viewbox-needs-size':
      return t(
        l,
        '想補 viewBox,但 width/height 不是純數字(例如 100%),無法推算,所以沒補。',
        'A viewBox was requested but width/height are not plain numbers (100%, for instance), so none was added.'
      );
    case 'size-needs-viewbox':
      return t(
        l,
        '想刪掉 width/height,但這份檔案沒有 viewBox。刪了會失去尺寸依據,所以沒刪。',
        'Removing width/height was requested but this file has no viewBox, so they were kept.'
      );
    case 'bad-path':
      return t(
        l,
        '有路徑的 d 資料讀不懂,那一條原樣保留、沒有收斂小數。其他路徑照做。',
        'At least one path had d data this tool could not read. Those are left exactly as they were; the rest were rounded.'
      );
  }
}

export default function SvgOptimize({ l }: ToolProps) {
  const [source, setSource] = useState('');
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [prefixText, setPrefixText] = useState(EDITOR_PREFIXES.join(' '));
  const [run, setRun] = useState<Run | null>(null);
  const [stale, setStale] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  /** Object URLs live outside React, so they are revoked by hand: the pair in
   *  use is replaced on every run, and whatever is open goes on unmount. */
  const open = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of open.current) URL.revokeObjectURL(url);
      open.current = [];
    },
    []
  );

  const execute = useCallback((text: string, chosen: Options, prefixes: string) => {
    for (const url of open.current) URL.revokeObjectURL(url);
    open.current = [];
    setStale(false);
    if (text.trim() === '') {
      setRun(null);
      return;
    }
    const outcome = optimizeSvg(text, { ...chosen, prefixes: splitPrefixes(prefixes) });
    const publish = (svg: string) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      open.current.push(url);
      return url;
    };
    setRun({
      outcome,
      sourceUrl: publish(text),
      resultUrl: outcome.ok ? publish(outcome.svg) : null,
    });
  }, []);

  const editSource = useCallback(
    (text: string) => {
      setSource(text);
      setFileError(null);
      if (text.length <= AUTO_LIMIT) execute(text, options, prefixText);
      else setStale(true);
    },
    [execute, options, prefixText]
  );

  const setOption = useCallback(
    <K extends keyof Options>(key: K, value: Options[K]) => {
      const next = { ...options, [key]: value };
      setOptions(next);
      if (source.length <= AUTO_LIMIT) execute(source, next, prefixText);
      else setStale(true);
    },
    [execute, options, prefixText, source]
  );

  const editPrefixes = useCallback(
    (text: string) => {
      setPrefixText(text);
      if (source.length <= AUTO_LIMIT) execute(source, options, text);
      else setStale(true);
    },
    [execute, options, source]
  );

  const takeFile = useCallback(
    async (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      if (picked.size > MAX_SOURCE) {
        setFileError(
          t(
            l,
            `這個檔 ${fmtBytes(picked.size)},超過上限 ${fmtBytes(MAX_SOURCE)}。`,
            `That file is ${fmtBytes(picked.size)}, over the ${fmtBytes(MAX_SOURCE)} ceiling.`
          )
        );
        return;
      }
      const text = await picked.text();
      editSource(text);
    },
    [editSource, l]
  );

  const download = useCallback(() => {
    if (run === null || !run.outcome.ok || run.resultUrl === null) return;
    const anchor = document.createElement('a');
    anchor.href = run.resultUrl;
    anchor.download = 'optimised.svg';
    anchor.click();
  }, [run]);

  const outcome = run?.outcome ?? null;
  const ok = outcome !== null && outcome.ok ? outcome : null;
  const saved = ok ? ok.before - ok.after : 0;
  const digits = options.digits === null ? 'off' : String(options.digits);

  const countRows: { k: string; v: number }[] = ok
    ? [
        { k: t(l, '註解', 'comments'), v: ok.counts.comments },
        { k: t(l, 'XML 宣告與 DOCTYPE', 'XML declaration & doctype'), v: ok.counts.prolog },
        { k: t(l, '編輯器元素', 'editor elements'), v: ok.counts.editorElements },
        { k: t(l, '編輯器屬性', 'editor attributes'), v: ok.counts.editorAttrs },
        { k: t(l, '預設值屬性', 'default-valued attributes'), v: ok.counts.defaultAttrs },
        { k: t(l, '空容器', 'empty containers'), v: ok.counts.emptyContainers },
        { k: t(l, '縮排空白節點', 'indentation text nodes'), v: ok.counts.whitespace },
        { k: t(l, '收斂的路徑', 'paths rounded'), v: ok.counts.paths },
        { k: t(l, '收斂的數值屬性', 'numeric attributes rounded'), v: ok.counts.numericAttrs },
      ]
    : [];

  return (
    <div>
      <Bench
        leftLabel={t(l, '原始 SVG', 'SOURCE')}
        rightLabel={t(l, '最佳化結果', 'RESULT')}
        leftAside={<span className="inst-no">{ok ? fmtBytes(ok.before) : '—'}</span>}
        rightAside={
          <span className="inst-no">
            {ok ? `${fmtBytes(ok.after)} · −${fixed((saved / Math.max(ok.before, 1)) * 100, 1)}%` : '—'}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '貼上 SVG 原始碼', 'Paste SVG markup')}
              hint={t(
                l,
                '整份檔案貼進來就好。這裡只讀文字,不會連到任何地方。',
                'Paste the whole file. Text only, and it goes nowhere.'
              )}
              value={source}
              onChange={editSource}
              rows={14}
              placeholder="<svg xmlns=…>"
              invalid={outcome !== null && !outcome.ok}
            />
            <DropZone
              l={l}
              onFiles={takeFile}
              accept=".svg,image/svg+xml"
              hint={t(l, '或把 .svg 檔拖進來', 'Or drop an .svg file here')}
            />
            {fileError ? <Note error>{fileError}</Note> : null}
            <Row>
              <Btn onClick={() => editSource(SAMPLE)}>{t(l, '載入範例', 'load a sample')}</Btn>
              <Btn onClick={() => editSource('')}>{t(l, '清空', 'clear')}</Btn>
              {stale ? (
                <Btn primary onClick={() => execute(source, options, prefixText)}>
                  {t(l, '執行最佳化', 'optimise')}
                </Btn>
              ) : null}
            </Row>
            {stale ? (
              <Note>
                {t(
                  l,
                  `超過 ${count(AUTO_LIMIT)} 個字元就不跟著打字即時重算了,按上面那顆按鈕。`,
                  `Past ${count(AUTO_LIMIT)} characters it no longer recomputes as you type — use the button.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Area
              label={t(l, '輸出', 'Output')}
              value={ok ? ok.svg : ''}
              rows={14}
              readOnly
              placeholder={t(l, '(還沒有結果)', '(nothing yet)')}
            />
            <Row>
              <CopyButton l={l} text={ok ? ok.svg : ''} label={t(l, '複製結果', 'copy result')} />
              <Btn onClick={download} disabled={!ok}>
                {t(l, '下載 .svg', 'download .svg')}
              </Btn>
            </Row>
            {outcome !== null && !outcome.ok ? (
              <Note error>
                {t(
                  l,
                  `第 ${outcome.line} 行第 ${outcome.column} 欄:${failText(l, outcome.code, outcome.detail)}`,
                  `Line ${outcome.line}, column ${outcome.column}: ${failText(l, outcome.code, outcome.detail)}`
                )}
              </Note>
            ) : null}
          </>
        }
      />

      <div className="mt-8">
        <Panel label={t(l, '要做哪些事', 'PASSES')}>
          <Row>
            <Check2
              label={t(l, '刪註解', 'drop comments')}
              checked={options.comments}
              onChange={(value) => setOption('comments', value)}
            />
            <Check2
              label={t(l, '刪編輯器資料', 'drop editor data')}
              checked={options.editorData}
              onChange={(value) => setOption('editorData', value)}
            />
            <Check2
              label={t(l, '刪空的 g/defs', 'drop empty g/defs')}
              checked={options.emptyContainers}
              onChange={(value) => setOption('emptyContainers', value)}
            />
            <Check2
              label={t(l, '刪預設值屬性', 'drop default values')}
              checked={options.defaultAttrs}
              onChange={(value) => setOption('defaultAttrs', value)}
            />
            <Check2
              label={t(l, '刪縮排空白', 'drop indentation')}
              checked={options.indentation}
              onChange={(value) => setOption('indentation', value)}
            />
            <Check2
              label={t(l, '刪 XML 宣告與 DOCTYPE', 'drop XML declaration')}
              checked={options.prolog}
              onChange={(value) => setOption('prolog', value)}
            />
          </Row>
          <Row>
            <Seg
              label={t(l, '座標小數位數', 'Decimals in coordinates')}
              value={digits}
              onChange={(value) =>
                setOption('digits', value === 'off' ? null : Number(value))
              }
              options={DIGIT_CHOICES.map((choice) => ({
                value: choice,
                label: choice === 'off' ? t(l, '不動', 'leave') : choice,
              }))}
            />
            <Check2
              label={t(l, '缺 viewBox 時補上', 'add a missing viewBox')}
              checked={options.addViewBox}
              onChange={(value) => setOption('addViewBox', value)}
            />
            <Check2
              label={t(l, '刪掉 width/height', 'drop width/height')}
              checked={options.stripSize}
              onChange={(value) => setOption('stripSize', value)}
            />
          </Row>
          <Input
            label={t(l, '視為編輯器的命名空間前綴', 'Namespace prefixes treated as editor data')}
            hint={t(
              l,
              '空白或逗號分隔。xlink 故意不在清單裡——刪掉它 <use> 就壞了。這份清單是手動整理的,遇到沒列到的編輯器自己加。',
              'Space or comma separated. xlink is deliberately absent: dropping it breaks <use>. The list is hand-compiled, so add whatever your editor writes.'
            )}
            value={prefixText}
            onChange={editPrefixes}
          />
          <Note>
            {t(
              l,
              '「刪預設值屬性」刪的是值本來就等於初始值的展示屬性(stroke="none"、stroke-width="1" 這類)。這些屬性會繼承,所以只有在上層沒有設同一個屬性時才刪;檔案裡有 <style> 或 <use> 時整個跳過。「刪空的 g/defs」包含有 id 的空群組——如果你的程式靠 id 抓它,關掉這個選項。',
              'Dropping default values only touches presentation attributes already set to the property\'s initial value (stroke="none", stroke-width="1"). They inherit, so one is only dropped when no ancestor sets the same property, and the whole pass stands down when the file has a <style> or a <use>. Dropping empty g/defs includes empty groups with an id — if your code looks that id up, turn it off.'
            )}
          </Note>
          <Note>
            {t(
              l,
              '座標收斂只動路徑資料與單值的數值屬性。viewBox 不動(收斂它等於整張圖縮放);transform 用多三位的精度(matrix 裡的數字是倍率,把 1e-5 收成 0 不是移動圖形,是讓它消失);寬度、間距這類「量」如果會被收成 0,原樣保留。',
              'Rounding touches path data and single-number attributes. The viewBox is left alone (rounding it rescales the drawing); transforms get three more decimals, because a matrix entry is a multiplier and rounding 1e-5 to 0 does not move a shape but erases it; and any magnitude that would collapse to zero is kept as written.'
            )}
          </Note>
        </Panel>
      </div>

      {ok ? (
        <div className="mt-8">
          <Panel
            label={t(l, '預覽', 'PREVIEW')}
            aside={<span className="inst-no">{t(l, 'img + blob,不內嵌 DOM', 'img + blob, never inlined')}</span>}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
                gap: '1rem',
              }}
            >
              {[
                { key: 'before', label: t(l, '原圖', 'source'), url: run?.sourceUrl ?? null },
                { key: 'after', label: t(l, '最佳化後', 'optimised'), url: run?.resultUrl ?? null },
              ].map((pane) => (
                <figure key={pane.key} style={{ margin: 0, display: 'grid', gap: '0.35rem' }}>
                  <figcaption className="inst-no" style={{ color: 'var(--fg-muted)' }}>
                    {pane.label}
                  </figcaption>
                  <div
                    style={{
                      border: '1px solid var(--border-3)',
                      // Checkerboard, so a transparent background is visible
                      // rather than borrowed from the page.
                      backgroundImage:
                        'repeating-conic-gradient(var(--border-2) 0% 25%, transparent 0% 50%)',
                      backgroundSize: '16px 16px',
                      display: 'grid',
                      placeItems: 'center',
                      minHeight: '10rem',
                      padding: '0.5rem',
                    }}
                  >
                    {pane.url ? (
                      /* The SVG is handed to the browser as an image, so nothing
                         inside it becomes part of this page's DOM: no pasted
                         markup, no scripts, no external references honoured. */
                      /* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this tab; next/image would route it through a loader */
                      <img
                        src={pane.url}
                        alt={t(l, `${pane.label} 的 SVG 預覽`, `SVG preview: ${pane.label}`)}
                        style={{ maxWidth: '100%', maxHeight: '14rem' }}
                      />
                    ) : (
                      <span className="inst-no">—</span>
                    )}
                  </div>
                </figure>
              ))}
            </div>
            <Note>
              {t(
                l,
                '兩張圖都是用 blob URL 餵給 <img>。看起來一樣就代表這輪最佳化沒有改變畫面;不一樣就把上面的開關一個一個關掉找出是哪一項。',
                'Both panes are blob URLs in an <img>. If they look the same, this pass did not change the drawing; if they differ, switch the passes off one at a time to find which one did it.'
              )}
            </Note>
          </Panel>
        </div>
      ) : null}

      {ok ? (
        <div className="mt-8">
          <Panel label={t(l, '刪掉了什麼', 'WHAT WENT')}>
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'item'), t(l, '數量', 'count')]}
                align={['left', 'right']}
                rows={countRows.map((row) => [
                  row.k,
                  <span key="v" className="inst-no">
                    {count(row.v)}
                  </span>,
                ])}
              />
            </div>
            {ok.addedViewBox ? (
              <Note>{t(l, '已補上 viewBox。', 'A viewBox was added.')}</Note>
            ) : null}
            {ok.removedSize ? (
              <Note>
                {t(
                  l,
                  '已刪掉 width/height:這張圖現在會跟著容器縮放,原本固定尺寸的地方要自己補 CSS。',
                  'width/height were removed: the image now scales to its container, so anywhere that relied on the intrinsic size needs CSS.'
                )}
              </Note>
            ) : null}
            {ok.warnings.map((code) => (
              <Note key={code}>{warningText(l, code)}</Note>
            ))}
          </Panel>
        </div>
      ) : null}

      <Readout
        l={l}
        items={[
          { k: t(l, '原始', 'before'), v: ok ? fmtBytes(ok.before) : '—' },
          { k: t(l, '輸出', 'after'), v: ok ? fmtBytes(ok.after) : '—' },
          {
            k: t(l, '省下', 'saved'),
            v: ok ? `${fmtBytes(saved)} · ${fixed((saved / Math.max(ok.before, 1)) * 100, 1)}%` : '—',
          },
          { k: t(l, '元素', 'elements'), v: ok ? count(ok.elements) : '—' },
          { k: t(l, '小數位', 'decimals'), v: options.digits === null ? t(l, '不動', 'left') : String(options.digits) },
        ]}
      />
    </div>
  );
}
