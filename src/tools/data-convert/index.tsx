'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { ToolProps } from '../types';
import {
  Area,
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
import { bytes as fmtBytes, count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  ConvertError,
  FORMATS,
  MAX_INPUT,
  convert,
  shape,
  type Format,
  type Json,
} from './logic';

const LABEL: { [key in Format]: string } = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  csv: 'CSV',
  query: 'query',
};

const SAMPLES: { [key in Format]: string } = {
  json: `{
  "service": "hex-viewer",
  "port": 8080,
  "debug": false,
  "limits": { "upload": "4MB", "retries": 3 },
  "hosts": ["a.example", "b.example"]
}`,
  yaml: `service: hex-viewer
port: 8080
debug: false
limits:
  upload: 4MB
  retries: 3
hosts:
  - a.example
  - b.example`,
  toml: `service = "hex-viewer"
port = 8080
debug = false
hosts = ["a.example", "b.example"]

[limits]
upload = "4MB"
retries = 3`,
  xml: `<service name="hex-viewer">
  <port>8080</port>
  <debug>false</debug>
  <limits upload="4MB">
    <retries>3</retries>
  </limits>
  <host>a.example</host>
  <host>b.example</host>
</service>`,
  csv: `name,port,debug
hex-viewer,8080,false
json-format,8081,true`,
  query: `service=hex-viewer&port=8080&limits[upload]=4MB&hosts[0]=a.example&hosts[1]=b.example`,
};

const delimiters = (l: Parameters<typeof t>[0]) => [
  { value: ',', label: t(l, '逗號 ,', 'comma ,') },
  { value: ';', label: t(l, '分號 ;', 'semicolon ;') },
  { value: '\t', label: t(l, 'Tab', 'tab') },
  { value: '|', label: t(l, '直線 |', 'pipe |') },
];

export default function DataConvert({ l }: ToolProps) {
  const [from, setFrom] = useState<Format>('json');
  const [to, setTo] = useState<Format>('yaml');
  const [text, setText] = useState(SAMPLES.json);
  const [indent, setIndent] = useState('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [coerce, setCoerce] = useState(false);
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  const [csvHeader, setCsvHeader] = useState(true);
  const [xmlRoot, setXmlRoot] = useState('');

  const options = useMemo(
    () => ({
      indent: Number(indent),
      sortKeys,
      coerce,
      csvDelimiter,
      csvHeader,
      xmlRoot: xmlRoot.trim() === '' ? undefined : xmlRoot.trim(),
    }),
    [indent, sortKeys, coerce, csvDelimiter, csvHeader, xmlRoot]
  );

  const result = useMemo(() => {
    if (text.trim() === '') {
      return { text: '', value: null as Json, warnings: [] as string[], error: null };
    }
    try {
      const done = convert(text, from, to, options);
      return { ...done, error: null };
    } catch (problem) {
      const error =
        problem instanceof ConvertError
          ? problem
          : new ConvertError(problem instanceof Error ? problem.message : String(problem), from);
      return { text: '', value: null as Json, warnings: [] as string[], error };
    }
  }, [text, from, to, options]);

  const measured = useMemo(() => (result.error ? null : shape(result.value)), [result]);

  const swap = useCallback(() => {
    // Swapping is only meaningful with something to swap: the output becomes
    // the input, so a mistake is one more click back rather than a retype.
    if (result.error || result.text === '') {
      setFrom(to);
      setTo(from);
      return;
    }
    setText(result.text);
    setFrom(to);
    setTo(from);
  }, [from, to, result]);

  const inputBytes = utf8Length(text);
  const csvInvolved = from === 'csv' || to === 'csv';

  return (
    <div>
      <Bench
        leftLabel={t(l, '來源', 'SOURCE')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{fmtBytes(inputBytes)}</span>}
        rightAside={
          <span className="inst-no">{result.text === '' ? '—' : fmtBytes(utf8Length(result.text))}</span>
        }
        left={
          <>
            <Row>
              <Seg
                label={t(l, '來源格式', 'Source format')}
                value={from}
                onChange={setFrom}
                options={FORMATS.map((format) => ({ value: format, label: LABEL[format] }))}
              />
              <Btn onClick={() => setText(SAMPLES[from])}>
                {t(l, '放一份範例', 'load a sample')}
              </Btn>
            </Row>
            <Area
              label={t(l, `${LABEL[from]} 輸入`, `${LABEL[from]} in`)}
              hint={t(
                l,
                `上限 ${Math.round(MAX_INPUT / 1024)} KB。每次按鍵都重算,不用按送出。`,
                `Up to ${Math.round(MAX_INPUT / 1024)} KB. Recomputed on every keystroke — there is no submit.`
              )}
              value={text}
              onChange={setText}
              rows={18}
              invalid={result.error !== null && result.error.format === from}
              placeholder={SAMPLES[from].split('\n')[0]}
            />
            <Row>
              <Btn onClick={swap} title={t(l, '把輸出搬到輸入,兩邊格式互換', 'Move the output into the input and swap the formats')}>
                <ArrowLeftRight size={12} strokeWidth={1.5} />
                {t(l, '反向', 'swap')}
              </Btn>
              <Btn onClick={() => setText('')}>{t(l, '清空', 'clear')}</Btn>
            </Row>
          </>
        }
        right={
          <>
            <Row>
              <Seg
                label={t(l, '輸出格式', 'Target format')}
                value={to}
                onChange={setTo}
                options={FORMATS.map((format) => ({ value: format, label: LABEL[format] }))}
              />
              <CopyButton l={l} text={result.text} />
            </Row>
            <Area
              label={t(l, `${LABEL[to]} 輸出`, `${LABEL[to]} out`)}
              value={result.error ? '' : result.text}
              readOnly
              rows={18}
              placeholder={t(l, '左邊貼資料就會出現', 'Paste on the left')}
            />
            <div aria-live="polite">
              {result.error ? (
                <Note error>
                  {LABEL[result.error.format]}
                  {result.error.line !== undefined
                    ? t(
                        l,
                        ` 第 ${result.error.line} 行${
                          result.error.column !== undefined ? ` 第 ${result.error.column} 欄` : ''
                        }:`,
                        ` line ${result.error.line}${
                          result.error.column !== undefined ? `, column ${result.error.column}` : ''
                        }: `
                      )
                    : t(l, ':', ': ')}
                  {result.error.message}
                </Note>
              ) : result.text !== '' && measured ? (
                <Note>
                  {t(
                    l,
                    `轉換完成 — ${count(measured.keys)} 個鍵、深度 ${measured.depth}`,
                    `Converted — ${count(measured.keys)} keys, depth ${measured.depth}`
                  )}
                </Note>
              ) : null}
              {result.warnings.map((warning) => (
                <Note key={warning}>{warning}</Note>
              ))}
            </div>
          </>
        }
      />

      <Panel label={t(l, '選項', 'OPTIONS')}>
        <Row>
          <Select
            label={t(l, '縮排', 'Indent')}
            hint={t(l, '用於 JSON、YAML、XML。', 'Applies to JSON, YAML and XML.')}
            value={indent}
            onChange={setIndent}
            options={[
              { value: '0', label: t(l, '不縮排(JSON 壓成一行)', 'none (JSON on one line)') },
              { value: '2', label: '2' },
              { value: '4', label: '4' },
            ]}
          />
          <Check2
            label={t(l, '鍵依字母排序', 'sort keys')}
            checked={sortKeys}
            onChange={setSortKeys}
          />
          <Check2
            label={t(l, '把看起來像數字/布林的文字轉型(CSV、XML 讀入時)', 'coerce numeric and boolean text (CSV, XML input)')}
            checked={coerce}
            onChange={setCoerce}
          />
        </Row>
        {csvInvolved ? (
          <Row>
            <Select
              label={t(l, 'CSV 分隔字元', 'CSV delimiter')}
              value={csvDelimiter}
              onChange={setCsvDelimiter}
              options={delimiters(l)}
            />
            <Check2
              label={t(l, 'CSV 第一列是標題', 'first CSV row is a header')}
              checked={csvHeader}
              onChange={setCsvHeader}
            />
          </Row>
        ) : null}
        {to === 'xml' ? (
          <Row>
            <Input
              label={t(l, 'XML 根元素名稱', 'XML root element')}
              hint={t(
                l,
                '留空時:最外層只有一個鍵就拿它當根元素,否則用 root。',
                'Left blank: a single top-level key becomes the root, otherwise "root".'
              )}
              value={xmlRoot}
              onChange={setXmlRoot}
              placeholder="root"
            />
          </Row>
        ) : null}
        {coerce ? (
          <Note>
            {t(
              l,
              '轉型會改變資料:電話號碼、郵遞區號、以 0 開頭的編號都會失去前導零或變成數字。只在確定整欄都是數值時才開。前導零的字串(007)有特別保留。',
              'Coercion changes data: phone numbers, postcodes and zero-padded ids become numbers. Turn it on only when a column really is numeric. Strings with a leading zero (007) are kept as text.'
            )}
          </Note>
        ) : null}
      </Panel>

      <Panel label={t(l, '支援到哪裡', 'WHAT IS SUPPORTED')}>
        <Note>
          {t(
            l,
            'YAML 與 TOML 是這裡自己寫的常用子集,不是完整規格實作。子集外的語法會直接報錯並指出是哪一行 —— 不會安靜地算出一個看起來對的結果。六種格式共用同一個值模型(null、布林、數字、字串、序列、對應表),所以模型裡沒有的東西(註解、日期型別、型別標籤、元素順序以外的 XML 資訊)一定會在轉換中消失。',
            'YAML and TOML here are hand-written common subsets, not spec implementations. Anything outside the subset is an error naming the line — never a quiet, plausible, wrong answer. All six formats share one value model (null, boolean, number, string, list, map), so anything the model has no room for — comments, date types, type tags — is lost in transit.'
          )}
        </Note>
        <Table
          head={[t(l, '格式', 'format'), t(l, '支援', 'supported'), t(l, '不支援(會報錯)', 'not supported (errors)')]}
          rows={[
            [
              'JSON',
              t(l, '完整規格,用瀏覽器內建剖析器;語法錯誤會標出行與欄。', 'The full spec, via the built-in parser; syntax errors carry a line and column.'),
              t(l, '註解、尾隨逗號、NaN/Infinity。', 'Comments, trailing commas, NaN/Infinity.'),
            ],
            [
              'YAML',
              t(
                l,
                '區塊對應表與序列(含同層縮排的 - 寫法)、巢狀、流式 [] {}、單/雙引號與轉義、# 註解、單一文件的 --- 與 ...、~ null、true/false、整數、浮點、0x。',
                'Block maps and sequences (including the same-indent dash style), nesting, flow [] {}, single and double quotes with escapes, # comments, a single document’s --- and ..., ~ null, booleans, integers, floats, 0x.'
              ),
              t(
                l,
                '錨點與別名(& *)、型別標籤(! !!)、區塊純量(| >)、多份文件、複合鍵(?)、合併鍵(<<)、tab 縮排、跨行引號字串。yes/no/on/off 一律當字串,不當布林。',
                'Anchors and aliases (& *), tags (! !!), block scalars (| >), multiple documents, complex keys (?), merge keys (<<), tab indentation, quoted scalars spanning lines. yes/no/on/off stay strings.'
              ),
            ],
            [
              'TOML',
              t(
                l,
                '鍵值對、點分鍵、[表]、[[表陣列]]、行內表、跨行陣列(含註解與尾隨逗號)、基本字串與轉義、字面字串、整數(含 _ 與 0x/0o/0b)、浮點、inf/nan、布林。日期時間保留成字串。',
                'Key/value pairs, dotted keys, [tables], [[array of tables]], inline tables, multi-line arrays with comments and a trailing comma, basic and literal strings, integers with _ and 0x/0o/0b, floats, inf/nan, booleans. Date-times are kept as strings.'
              ),
              t(
                l,
                '多行字串(""" 與 \'\'\')。前導零整數、重複鍵、重複表、對行內表追加鍵都會依規格報錯。輸出時遇到 null 會報錯,因為 TOML 沒有 null。',
                'Multi-line strings (""" and \'\'\'). Leading-zero integers, duplicate keys or tables and extending an inline table are refused as the spec requires. On output, null errors — TOML has no null.'
              ),
            ],
            [
              'XML',
              t(
                l,
                '元素、屬性(讀成 @name)、文字(混合內容讀成 #text)、CDATA、註解、處理指示、五個內建實體與數值字元參照。',
                'Elements, attributes (read as @name), text (mixed content as #text), CDATA, comments, processing instructions, the five built-in entities and numeric character references.'
              ),
              t(
                l,
                'DOCTYPE 與實體宣告(外部實體是這類剖析器最常見的漏洞,直接拒收)、自訂實體、命名空間會當成名稱的一部分而不解析。',
                'DOCTYPE and entity declarations (external entities are the classic hole in such parsers, so they are refused), custom entities; namespaces are treated as literal name text.'
              ),
            ],
            [
              'CSV',
              t(
                l,
                'RFC 4180:引號、欄位內的分隔字元與換行、"" 轉義;LF/CRLF/CR 都讀;BOM 自動去掉;可選標題列與分隔字元。',
                'RFC 4180: quotes, embedded delimiters and newlines, "" escapes; LF, CRLF and CR; the BOM is stripped; header row and delimiter are options.'
              ),
              t(
                l,
                '只能表示表格,所以輸出時最外層必須是陣列。巢狀的值會被塞成一格 JSON 文字,欄位數不一致的列會補空字串並在上面提示。',
                'Only tables, so output needs an array at the top level. A nested value goes into the cell as compact JSON, and ragged rows are padded with a warning above.'
              ),
            ],
            [
              'query',
              t(
                l,
                'a=1&b=2、重複鍵變陣列、a[b] 與 a[] 括號巢狀、+ 與百分比編碼。輸出時陣列用 a[0]、a[1],鍵名裡真正的方括號會編碼成 %5B。',
                'a=1&b=2, repeated keys becoming arrays, a[b] and a[] bracket nesting, plus and percent encoding. Output indexes arrays as a[0], a[1]; a literal bracket in a key name is encoded as %5B.'
              ),
              t(
                l,
                '值一律是字串(這一層沒有型別)。同一個鍵同時當值和容器會報錯。',
                'Values are always strings — the format has no types. Using one key as both a value and a container is an error.'
              ),
            ],
          ]}
        />
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入', 'in'), v: fmtBytes(inputBytes) },
          { k: t(l, '輸出', 'out'), v: result.text === '' ? '—' : fmtBytes(utf8Length(result.text)) },
          { k: t(l, '方向', 'direction'), v: `${LABEL[from]} → ${LABEL[to]}` },
          { k: t(l, '節點', 'nodes'), v: measured ? count(measured.nodes) : '—' },
          { k: t(l, '深度', 'depth'), v: measured ? String(measured.depth) : '—' },
        ]}
      />
    </div>
  );
}
