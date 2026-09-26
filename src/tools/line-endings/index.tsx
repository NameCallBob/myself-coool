'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  Check2,
  CopyButton,
  DropZone,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  ERROR_CAP,
  UTF8_ERROR_TEXT,
  analyzeText,
  convertEndings,
  detectBom,
  ensureFinalNewline,
  findInvisibles,
  markInvisibles,
  removeFinalNewline,
  removeInvisibles,
  stripBomChar,
  trimTrailingWhitespace,
  validateUtf8,
  type BomKind,
  type Ending,
} from './logic';

/** Beyond this the analysis is still correct but the browser is the limit. */
const FILE_CEILING = 16 * 1024 * 1024;

const BOM_NAME: Record<BomKind, string> = {
  utf8: 'UTF-8 (EF BB BF)',
  utf16le: 'UTF-16 LE (FF FE)',
  utf16be: 'UTF-16 BE (FE FF)',
  utf32le: 'UTF-32 LE (FF FE 00 00)',
  utf32be: 'UTF-32 BE (00 00 FE FF)',
};

type Loaded = {
  name: string;
  size: number;
  bom: { kind: BomKind; length: number } | null;
  utf8: ReturnType<typeof validateUtf8>;
};

export default function LineEndings({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<Ending>('lf');
  const [showMarks, setShowMarks] = useState(true);
  const [file, setFile] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const report = useMemo(() => analyzeText(text), [text]);
  const invisibles = useMemo(() => findInvisibles(text), [text]);
  const marked = useMemo(() => (showMarks ? markInvisibles(text) : text), [text, showMarks]);
  const converted = useMemo(() => convertEndings(text, target), [text, target]);
  const hasBomChar = text.charCodeAt(0) === 0xfeff;

  const takeFile = async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    if (picked.size > FILE_CEILING) {
      setFileError(
        t(
          l,
          `這個檔案 ${bytes(picked.size)},超過 ${bytes(FILE_CEILING)} 上限。`,
          `That file is ${bytes(picked.size)}, over the ${bytes(FILE_CEILING)} ceiling.`
        )
      );
      return;
    }
    setFileError(null);
    const data = new Uint8Array(await picked.arrayBuffer());
    const bom = detectBom(data);
    setFile({ name: picked.name, size: data.length, bom, utf8: validateUtf8(data) });
    // The textarea gets the decoded text with the BOM removed, because that is
    // what the editing tools below should operate on. The byte-level findings
    // stay in the panel above so nothing is hidden.
    setText(stripBomChar(new TextDecoder('utf-8').decode(data)));
  };

  const apply = (next: string) => setText(next);

  return (
    <div>
      <DropZone
        l={l}
        onFiles={takeFile}
        hint={
          file
            ? `${file.name} · ${bytes(file.size)}`
            : t(l, '拖入檔案來檢查 BOM 與 UTF-8 有效性', 'Drop a file to check its BOM and UTF-8 validity')
        }
      />
      {fileError ? <Note error>{fileError}</Note> : null}

      {file ? (
        <div className="mt-6">
          <Panel
            label={t(l, '位元組層面', 'AT THE BYTE LEVEL')}
            aside={<span className="inst-no">{bytes(file.size)}</span>}
          >
            <Table
              head={[t(l, '檢查', 'check'), t(l, '結果', 'result')]}
              rows={[
                [
                  'BOM',
                  file.bom
                    ? BOM_NAME[file.bom.kind]
                    : t(l, '沒有(多數場合這才是想要的)', 'none — usually what you want'),
                ],
                [
                  t(l, 'UTF-8 有效性', 'UTF-8 validity'),
                  file.utf8.ok
                    ? t(l, '有效', 'valid')
                    : t(
                        l,
                        `${count(file.utf8.errorCount)} 處無效`,
                        `${count(file.utf8.errorCount)} invalid sequences`
                      ),
                ],
                [t(l, '碼位數', 'code points'), count(file.utf8.codePoints)],
                [t(l, '非 ASCII 位元組', 'non-ASCII bytes'), count(file.utf8.nonAscii)],
              ]}
            />

            {file.bom?.kind === 'utf8' ? (
              <Note>
                {t(
                  l,
                  'UTF-8 的 BOM 不是必要的,而且會惹麻煩:shell script 的第一行會變成「command not found」,CSV 的第一個欄名會多三個看不見的位元組,對不上你比較的字串。下面文字框裡已經把它去掉。',
                  'A UTF-8 BOM is unnecessary and causes trouble: a shell script’s first line becomes "command not found", and a CSV’s first column header carries three invisible bytes that will not match the string you compare it to. The textarea below already has it removed.'
                )}
              </Note>
            ) : null}
            {file.bom && file.bom.kind !== 'utf8' ? (
              <Note error>
                {t(
                  l,
                  `這是 ${BOM_NAME[file.bom.kind]} 的檔案,不是 UTF-8。下面的文字框以 UTF-8 解讀,所以內容會是亂的——這個工具只處理 UTF-8,請先用編輯器轉檔。`,
                  `This file is ${BOM_NAME[file.bom.kind]}, not UTF-8. The textarea below reads it as UTF-8, so it will be garbled. This tool only handles UTF-8; convert it in an editor first.`
                )}
              </Note>
            ) : null}

            {!file.utf8.ok ? (
              <>
                <Table
                  head={[t(l, '位移', 'offset'), t(l, '位元組', 'bytes'), t(l, '問題', 'problem')]}
                  rows={file.utf8.errors.slice(0, 20).map((error) => [
                    <span key={`o${error.offset}`} className="inst-no">
                      0x{error.offset.toString(16)} ({count(error.offset)})
                    </span>,
                    <span key={`b${error.offset}`} className="inst-no">
                      {error.bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                    </span>,
                    t(l, UTF8_ERROR_TEXT[error.kind].zh, UTF8_ERROR_TEXT[error.kind].en),
                  ])}
                />
                {file.utf8.errorCount > 20 ? (
                  <Note>
                    {t(
                      l,
                      `只列前 20 處,共 ${count(file.utf8.errorCount)} 處${file.utf8.errorCount > ERROR_CAP ? `(記錄上限 ${count(ERROR_CAP)})` : ''}。`,
                      `Showing the first 20 of ${count(file.utf8.errorCount)}${file.utf8.errorCount > ERROR_CAP ? `; the log stops at ${count(ERROR_CAP)}` : ''}.`
                    )}
                  </Note>
                ) : null}
              </>
            ) : null}
          </Panel>
        </div>
      ) : null}

      <div className="mt-8">
        <Panel
          label={t(l, '文字', 'TEXT')}
          aside={
            <span className="inst-no">
              {count(report.lines)} {t(l, '行', 'lines')}
            </span>
          }
        >
          <Area
            label={t(l, '貼上文字,或用上面的檔案', 'Paste text, or load a file above')}
            value={text}
            onChange={setText}
            rows={8}
            placeholder={'line one\r\nline two\n'}
          />

          <Row>
            <Seg
              label={t(l, '換行目標', 'Convert to')}
              value={target}
              onChange={setTarget}
              options={[
                { value: 'lf', label: 'LF (Unix)' },
                { value: 'crlf', label: 'CRLF (Windows)' },
                { value: 'cr', label: 'CR (classic Mac)' },
              ]}
            />
            <Btn onClick={() => apply(converted)} primary>
              {t(l, '套用換行轉換', 'apply conversion')}
            </Btn>
            <Btn onClick={() => apply(trimTrailingWhitespace(text))}>
              {t(l, '去行尾空白', 'trim line ends')}
            </Btn>
            <Btn onClick={() => apply(ensureFinalNewline(text, target))}>
              {t(l, '補檔尾換行', 'add final newline')}
            </Btn>
            <Btn onClick={() => apply(removeFinalNewline(text))}>
              {t(l, '去檔尾換行', 'drop final newline')}
            </Btn>
          </Row>
          <Row>
            <Btn onClick={() => apply(removeInvisibles(text))}>
              {t(l, '清掉看不見的字元', 'strip invisible characters')}
            </Btn>
            {hasBomChar ? (
              <Btn onClick={() => apply(stripBomChar(text))}>{t(l, '去開頭 BOM', 'remove leading BOM')}</Btn>
            ) : null}
            <CopyButton l={l} text={text} />
            <ResetButton
              l={l}
              onReset={() => {
                setText('');
                setFile(null);
                setFileError(null);
              }}
            />
          </Row>

          <Table
            head={[t(l, '項目', 'item'), t(l, '值', 'value')]}
            rows={[
              ['CRLF', count(report.crlf)],
              ['LF', count(report.lf)],
              ['CR', count(report.cr)],
              [
                t(l, '混用', 'mixed'),
                report.mixed
                  ? t(l, `是(多數是 ${report.dominant?.toUpperCase()})`, `yes — mostly ${report.dominant?.toUpperCase()}`)
                  : t(l, '否', 'no'),
              ],
              [
                t(l, '檔尾換行', 'final newline'),
                report.finalNewline ? t(l, '有', 'yes') : t(l, '沒有', 'no'),
              ],
              [
                t(l, '行尾有空白的行', 'lines with trailing whitespace'),
                report.trailingWhitespace.length === 0
                  ? '—'
                  : `${count(report.trailingWhitespace.length)} (${report.trailingWhitespace.slice(0, 10).join(', ')}${report.trailingWhitespace.length > 10 ? '…' : ''})`,
              ],
              [t(l, 'Tab 數', 'tabs'), count(report.tabs)],
              [t(l, '最長一行', 'longest line'), `${count(report.longestLine)} ${t(l, '字元', 'chars')}`],
            ]}
            align={['left', 'right']}
          />

          {report.mixed ? (
            <Note error>
              {t(
                l,
                '這份檔案混用換行。git diff 會顯示整份都改過,程式碼審查會被淹沒,而且沒有人看得出差在哪裡。選一種套用下去。',
                'This file mixes line endings. A diff will report every line as changed, a review drowns in it, and nobody can see what actually differs. Pick one and apply it.'
              )}
            </Note>
          ) : null}
          {!report.finalNewline && text !== '' ? (
            <Note>
              {t(
                l,
                'POSIX 的定義裡,一行以換行符結束,所以沒有檔尾換行的檔案嚴格說來最後一行不成行。實務上 git 會顯示「\\ No newline at end of file」。',
                'POSIX defines a line as ending with a newline, so a file without a final one technically has an incomplete last line. In practice git prints "\\ No newline at end of file".'
              )}
            </Note>
          ) : null}
        </Panel>
      </div>

      <div className="mt-8">
        <Panel
          label={t(l, '看不見的字元', 'INVISIBLE CHARACTERS')}
          aside={<span className="inst-no">{count(invisibles.length)}</span>}
        >
          {invisibles.length === 0 ? (
            <Note>
              {text === ''
                ? t(l, '貼上文字後會標出看不見的字元。', 'Invisible characters are listed here.')
                : t(l, '沒有找到看不見的字元(Tab、換行、普通空白不算)。', 'None found — tab, newline and ordinary space do not count.')}
            </Note>
          ) : (
            <Table
              head={[t(l, '行:欄', 'line:col'), t(l, '碼位', 'code point'), t(l, '是什麼', 'what it is')]}
              rows={invisibles.slice(0, 50).map((finding) => [
                <span key={`p${finding.index}`} className="inst-no">
                  {finding.line}:{finding.column}
                </span>,
                <span key={`c${finding.index}`} className="inst-no">
                  U+{finding.cp.toString(16).toUpperCase().padStart(4, '0')}
                </span>,
                finding.label,
              ])}
            />
          )}

          <Row>
            <Check2
              label={t(l, '顯示標記', 'show markers')}
              checked={showMarks}
              onChange={setShowMarks}
            />
          </Row>
          <div
            className="inst-out mt-2"
            style={{ minHeight: '8rem', whiteSpace: 'pre-wrap' }}
            aria-live="polite"
          >
            {marked || (
              <span style={{ color: 'var(--fg-faint)' }}>
                {t(l, '這裡會把每個看不見的字元寫出來。', 'Every invisible character is spelled out here.')}
              </span>
            )}
          </div>
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '行數', 'lines'), v: count(report.lines) },
          { k: 'CRLF / LF / CR', v: `${count(report.crlf)} / ${count(report.lf)} / ${count(report.cr)}` },
          { k: 'BOM', v: file?.bom ? BOM_NAME[file.bom.kind].split(' ')[0] : t(l, '無', 'none') },
          {
            k: 'UTF-8',
            v: file ? (file.utf8.ok ? t(l, '有效', 'valid') : `${count(file.utf8.errorCount)} ${t(l, '處錯誤', 'errors')}`) : '—',
          },
          { k: t(l, '看不見的字元', 'invisible'), v: count(invisibles.length) },
          { k: t(l, '位元組', 'bytes'), v: bytes(new TextEncoder().encode(text).length) },
        ]}
      />
    </div>
  );
}
