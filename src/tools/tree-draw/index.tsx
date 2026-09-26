'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Readout,
  ResetButton,
  Row,
  Seg,
  Select,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  MAX_DEPTH,
  MAX_LINES,
  TreeError,
  countNodes,
  looksLikeTree,
  parseIndented,
  parseTreeDrawing,
  renderTree,
  toIndented,
  type Charset,
  type Marker,
  type Node,
} from './logic';

type Dir = 'draw' | 'back';

const SAMPLE_LIST = [
  'project/',
  '  src/',
  '    app/',
  '      page.tsx',
  '    lib/',
  '      tree.ts',
  '  public/',
  '    favicon.ico',
  '  package.json',
  '  README.md',
].join('\n');

const SAMPLE_TREE = [
  'project',
  '├── src',
  '│   ├── app',
  '│   │   └── page.tsx',
  '│   └── lib',
  '│       └── tree.ts',
  '├── public',
  '│   └── favicon.ico',
  '├── package.json',
  '└── README.md',
].join('\n');

/** Error copy lives here so `logic.ts` stays language-neutral. */
function explain(l: 'zh' | 'en', error: TreeError): string {
  const line = error.line;
  switch (error.code) {
    case 'too-many-lines':
      return t(
        l,
        `輸入有 ${count(error.detail)} 行,超過上限 ${count(MAX_LINES)} 行。分段貼。`,
        `${count(error.detail)} lines exceeds the ${count(MAX_LINES)}-line ceiling. Paste it in parts.`
      );
    case 'root-indented':
      return t(
        l,
        `第 ${line} 行:最外層的項目要貼齊左邊,第一行不能比後面的項目更深。`,
        `Line ${line}: the outermost items must be flush left; the first line cannot be deeper than what follows.`
      );
    case 'indent-misaligned':
      return t(
        l,
        `第 ${line} 行的縮排是 ${error.detail} 格,不是縮排單位的整數倍,判不出它屬於哪一層。`,
        `Line ${line} is indented ${error.detail} columns, which is not a whole number of levels — its parent is ambiguous.`
      );
    case 'indent-jump':
      return t(
        l,
        `第 ${line} 行一次深了兩層,中間缺一個父項。`,
        `Line ${line} goes two levels deeper at once; a parent line is missing.`
      );
    case 'too-deep':
      return t(
        l,
        `第 ${line} 行超過 ${MAX_DEPTH} 層,超出處理上限。`,
        `Line ${line} is deeper than the ${MAX_DEPTH}-level ceiling.`
      );
    case 'unknown-prefix':
      return t(
        l,
        `第 ${line} 行的行首認不出來:既不是樹狀連接符(├── └── |-- \`--),也不是貼齊左邊的最外層項目。`,
        `Line ${line} starts with something unaccounted for: neither a connector (├── └── |-- \`--) nor a flush-left root.`
      );
    case 'bad-indent-width':
      return t(
        l,
        `欄寬 ${error.detail} 畫不出來。`,
        `Column width ${error.detail} cannot be drawn.`
      );
  }
}

/**
 * Indented list <-> tree drawing.
 *
 * Both directions are the same tool because the reverse one is why people open
 * it: a tree pasted into an issue two years ago is the only record of a layout,
 * and editing it by hand means counting box-drawing characters.
 */
export default function TreeDraw({ l }: ToolProps) {
  const [dir, setDir] = useState<Dir>('draw');
  const [input, setInput] = useState('');
  const [column, setColumn] = useState('4');
  const [space, setSpace] = useState('2');
  const [tab, setTab] = useState('4');
  const [charset, setCharset] = useState<Charset>('unicode');
  const [marker, setMarker] = useState<Marker>('none');

  const result = useMemo(() => {
    const empty = { text: '', roots: [] as Node[], unit: 0, error: null as TreeError | null };
    if (input.trim() === '') return empty;
    try {
      const parsed =
        dir === 'draw'
          ? parseIndented(input, { tabWidth: Number.parseInt(tab, 10) })
          : parseTreeDrawing(input);
      const text =
        dir === 'draw'
          ? renderTree(parsed.roots, { indent: Number.parseInt(column, 10), charset, marker })
          : toIndented(parsed.roots, { indent: Number.parseInt(space, 10), marker });
      return { text, roots: parsed.roots, unit: parsed.unit, error: null };
    } catch (error) {
      if (error instanceof TreeError) return { ...empty, error };
      throw error;
    }
  }, [dir, input, column, space, tab, charset, marker]);

  const stats = useMemo(() => countNodes(result.roots), [result.roots]);
  const misdirected = dir === 'draw' && looksLikeTree(input);

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={dir}
          onChange={setDir}
          options={[
            { value: 'draw', label: t(l, '清單 → 樹狀圖', 'list → tree') },
            { value: 'back', label: t(l, '樹狀圖 → 清單', 'tree → list') },
          ]}
        />
        <Btn onClick={() => setInput(dir === 'draw' ? SAMPLE_LIST : SAMPLE_TREE)}>
          {t(l, '放入範例', 'load sample')}
        </Btn>
        <ResetButton l={l} onReset={() => setInput('')} />
      </Row>

      <div className="mt-6">
        <Bench
          leftLabel={dir === 'draw' ? t(l, '縮排清單', 'INDENTED LIST') : t(l, '樹狀圖', 'TREE')}
          rightLabel={dir === 'draw' ? t(l, '樹狀圖', 'TREE') : t(l, '縮排清單', 'INDENTED LIST')}
          leftAside={input ? <span className="inst-no">{bytes(new Blob([input]).size)}</span> : null}
          rightAside={
            result.text ? (
              <span className="inst-no">
                {t(l, '縮排單位', 'unit')} {count(result.unit)}
              </span>
            ) : null
          }
          left={
            <Area
              label={
                dir === 'draw'
                  ? t(l, '一行一項,用空格或 tab 表示層級', 'One item per line, nested with spaces or tabs')
                  : t(l, '貼上 tree 指令的輸出', 'Paste the output of `tree`')
              }
              hint={
                dir === 'draw'
                  ? t(
                      l,
                      '縮排單位自動偵測(取最小的非零縮排)。目錄結尾加 / 就能保留「這是空目錄」的資訊。',
                      'The indent unit is measured, not assumed. A trailing slash is what keeps an empty directory a directory.'
                    )
                  : t(
                      l,
                      '認得 ├── └── │、|-- `-- |、+--- \\---,欄寬 2 到 8 都行。',
                      'Reads ├── └── │, |-- `-- |, and +--- \\---, at any column width from 2 to 8.'
                    )
              }
              value={input}
              onChange={setInput}
              rows={16}
              invalid={result.error !== null}
              placeholder={dir === 'draw' ? SAMPLE_LIST : SAMPLE_TREE}
            />
          }
          right={
            <>
              <Row>
                {dir === 'draw' ? (
                  <>
                    <Seg
                      label={t(l, '字元集', 'Charset')}
                      value={charset}
                      onChange={setCharset}
                      options={[
                        { value: 'unicode', label: '├──' },
                        { value: 'ascii', label: '|--' },
                      ]}
                    />
                    <Input
                      label={t(l, '欄寬', 'Column width')}
                      type="number"
                      min={charset === 'ascii' ? 3 : 2}
                      max={8}
                      step={1}
                      value={column}
                      onChange={setColumn}
                    />
                  </>
                ) : (
                  <Input
                    label={t(l, '每層空格', 'Spaces per level')}
                    type="number"
                    min={1}
                    max={8}
                    step={1}
                    value={space}
                    onChange={setSpace}
                  />
                )}
                <Select
                  label={t(l, '種類標記', 'Kind marker')}
                  value={marker}
                  onChange={setMarker}
                  options={[
                    { value: 'none', label: t(l, '不標', 'none') },
                    { value: 'slash', label: t(l, '目錄加 /', 'dirs get /') },
                    { value: 'ascii', label: '[D] / [F]' },
                  ]}
                />
                <Input
                  label={t(l, 'tab 寬度', 'Tab width')}
                  type="number"
                  min={1}
                  max={16}
                  step={1}
                  value={tab}
                  onChange={setTab}
                />
              </Row>

              <pre
                className="inst-out mt-3"
                aria-live="polite"
                style={{ whiteSpace: 'pre', overflowWrap: 'normal', margin: 0 }}
              >
                {result.text || (
                  <span style={{ color: 'var(--fg-faint)' }}>
                    {result.error
                      ? t(l, '先修好輸入。', 'Fix the input first.')
                      : t(l, '貼上內容後會即時轉換。', 'Paste something to convert it.')}
                  </span>
                )}
              </pre>

              <Row>
                <CopyButton l={l} text={result.text} />
              </Row>
            </>
          }
        />
      </div>

      {result.error ? <Note error>{explain(l, result.error)}</Note> : null}

      {misdirected ? (
        <Note>
          {t(
            l,
            '輸入裡已經有樹狀連接符了。要把它轉回縮排清單,把方向改成「樹狀圖 → 清單」。',
            'The input already contains connectors. Switch the direction to tree → list to read it back.'
          )}
        </Note>
      ) : null}

      <Note>
        {t(
          l,
          '空目錄在縮排清單裡跟檔案長得一樣,沒有標記時一律當成檔案。要保留這個差別就用「目錄加 /」或 [D]/[F]。',
          'An empty directory and a file look identical in an indented list; unmarked leaves are treated as files. Use the slash or [D]/[F] marker to keep the distinction.'
        )}
      </Note>

      <Readout
        l={l}
        items={[
          { k: t(l, '節點', 'nodes'), v: count(stats.total) },
          { k: t(l, '目錄', 'dirs'), v: count(stats.dirs) },
          { k: t(l, '檔案', 'files'), v: count(stats.files) },
          { k: t(l, '深度', 'depth'), v: count(stats.depth) },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([result.text]).size) },
        ]}
      />
    </div>
  );
}
