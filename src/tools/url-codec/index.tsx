'use client';

import { useMemo, useState } from 'react';
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
  ResetButton,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { count, utf8Length } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  PercentError,
  buildQuery,
  duplicateKeys,
  encodingRounds,
  joinUrl,
  parseQuery,
  percentDecode,
  percentEncode,
  splitUrl,
  type Mode,
  type Pair,
} from './logic';

type Direction = 'encode' | 'decode';

const SAMPLE = 'https://example.com/搜尋?q=台北 天氣&page=2&tag=a+b#結果';

export default function UrlCodec({ l }: ToolProps) {
  const [direction, setDirection] = useState<Direction>('encode');
  const [mode, setMode] = useState<Mode>('component');
  const [plusAsSpace, setPlusAsSpace] = useState(true);
  const [text, setText] = useState('');
  /** Query rows are edited, so they are state — never synced from an effect. */
  const [pairs, setPairs] = useState<Pair[] | null>(null);

  const result = useMemo(() => {
    if (text === '') return { out: '', error: null as string | null, at: -1 };
    if (direction === 'encode') return { out: percentEncode(text, mode), error: null, at: -1 };
    try {
      return { out: percentDecode(text, { plusAsSpace }), error: null, at: -1 };
    } catch (problem) {
      return {
        out: '',
        error: problem instanceof Error ? problem.message : String(problem),
        at: problem instanceof PercentError ? problem.index : -1,
      };
    }
  }, [text, direction, mode, plusAsSpace]);

  const parts = useMemo(() => splitUrl(text), [text]);
  const rounds = useMemo(() => encodingRounds(text), [text]);
  const looksLikeUrl = parts.scheme !== '' || parts.query !== '' || parts.host !== '';

  const duplicates = pairs ? duplicateKeys(pairs) : [];
  const rebuiltQuery = pairs ? buildQuery(pairs, { mode: plusAsSpace ? 'form' : 'rfc3986' }) : '';
  const rebuiltUrl = pairs ? joinUrl({ ...parts, query: rebuiltQuery }) : '';

  const loadQuery = () => {
    const source = parts.query !== '' ? parts.query : text;
    setPairs(parseQuery(source, { plusAsSpace }));
  };

  const editPair = (index: number, patch: Partial<Pair>) =>
    setPairs((previous) =>
      previous ? previous.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)) : previous
    );

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '方向', 'Direction')}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: t(l, '編碼', 'encode') },
            { value: 'decode', label: t(l, '解碼', 'decode') },
          ]}
        />
        {direction === 'encode' ? (
          <Select
            label={t(l, '規則', 'Rule')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'component', label: t(l, '參數值(encodeURIComponent)', 'component (encodeURIComponent)') },
              { value: 'rfc3986', label: t(l, '嚴格 RFC 3986(只留 A–Z a–z 0–9 - . _ ~)', 'strict RFC 3986') },
              { value: 'uri', label: t(l, '整條網址(encodeURI)', 'whole URL (encodeURI)') },
              { value: 'form', label: t(l, '表單本文(空白變 +)', 'form body (space becomes +)') },
            ]}
          />
        ) : (
          <Check2
            label={t(l, '把 + 當空白', 'treat + as space')}
            checked={plusAsSpace}
            onChange={setPlusAsSpace}
          />
        )}
        <Btn onClick={() => setText(SAMPLE)}>{t(l, '放入範例', 'load sample')}</Btn>
        <ResetButton
          l={l}
          onReset={() => {
            setText('');
            setPairs(null);
          }}
        />
      </Row>

      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={direction === 'encode' ? t(l, '已編碼', 'ENCODED') : t(l, '已解碼', 'DECODED')}
        leftAside={<span className="inst-no">{count(utf8Length(text))} B</span>}
        rightAside={<span className="inst-no">{count(utf8Length(result.out))} B</span>}
        left={
          <>
            <Area
              label={
                direction === 'encode'
                  ? t(l, '要編碼的文字或網址', 'Text or URL to encode')
                  : t(l, '要解碼的 percent-encoded 字串', 'Percent-encoded string to decode')
              }
              value={text}
              onChange={setText}
              rows={10}
              invalid={Boolean(result.error)}
              placeholder={SAMPLE}
            />
            {result.error ? (
              <>
                <Note error>
                  {result.at >= 0
                    ? t(l, `第 ${result.at + 1} 個字元:${result.error}`, `At character ${result.at + 1}: ${result.error}`)
                    : result.error}
                </Note>
                {result.at >= 0 ? (
                  <pre className="inst-out mt-2" style={{ minHeight: 0 }}>
                    {text.slice(Math.max(0, result.at - 30), result.at + 30)}
                    {'\n'}
                    {`${' '.repeat(result.at - Math.max(0, result.at - 30))}^`}
                  </pre>
                ) : null}
              </>
            ) : null}
            {rounds > 1 ? (
              <Note>
                {t(
                  l,
                  `這串看起來被編碼了 ${rounds} 次(例如 %2520 是被二次轉義的 %20)。解到底之前先確認是哪一層多做了一次。`,
                  `This looks percent-encoded ${rounds} times over — %2520 is a %20 that got escaped again. Find the layer doing it twice before decoding all the way.`
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={result.out} />
            </Row>
            <div
              className="inst-out mt-3"
              style={{ minHeight: '13rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              aria-live="polite"
            >
              {result.out || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '左邊輸入後即時轉換。', 'Output updates as you type.')}
                </span>
              )}
            </div>
          </>
        }
      />

      {looksLikeUrl ? (
        <div className="mt-8">
          <Panel
            label={t(l, '網址分解 (RFC 3986)', 'URL PARTS (RFC 3986)')}
            aside={
              <span className="inst-no">
                {parts.relative ? t(l, '相對參照', 'relative reference') : parts.scheme}
              </span>
            }
          >
            <Table
              head={[t(l, '部位', 'part'), t(l, '內容', 'value'), t(l, '這裡該用什麼規則', 'rule for this part')]}
              rows={[
                ['scheme', parts.scheme || '—', t(l, '不編碼', 'never encoded')],
                ['userinfo', parts.userinfo || '—', t(l, '嚴格 RFC 3986', 'strict RFC 3986')],
                ['host', parts.host || '—', t(l, '非 ASCII 網域要用 Punycode,不是 percent', 'non-ASCII hosts need Punycode, not percent')],
                ['port', parts.port || '—', t(l, '只能是數字', 'digits only')],
                ['path', parts.path || '—', t(l, '每段分別編碼,斜線保留', 'encode each segment; keep the slashes')],
                ['query', parts.query || '—', t(l, '表單規則或嚴格 RFC 3986', 'form rule or strict RFC 3986')],
                ['fragment', parts.fragment || '—', t(l, '不會送到伺服器', 'never sent to the server')],
              ]}
            />
          </Panel>
        </div>
      ) : null}

      <div className="mt-8">
        <Panel
          label={t(l, 'QUERY STRING 表格', 'QUERY STRING TABLE')}
          aside={pairs ? <span className="inst-no">{count(pairs.length)} {t(l, '筆', 'pairs')}</span> : null}
        >
          <Row>
            <Btn onClick={loadQuery} primary>
              {t(l, '把上面的 query 拆進表格', 'split the query above into rows')}
            </Btn>
            {pairs ? (
              <>
                <Btn onClick={() => setPairs([...pairs, { key: '', value: '', hasEquals: true, error: null }])}>
                  {t(l, '加一列', 'add row')}
                </Btn>
                <Btn onClick={() => setPairs(null)}>{t(l, '收起表格', 'close table')}</Btn>
              </>
            ) : null}
          </Row>

          {pairs === null ? (
            <Note>
              {t(
                l,
                '按上面那顆按鈕會取輸入裡的 query 部分(沒有 query 就取整串),把每個參數解碼後列成可編輯的表格。',
                'That button takes the query from the input (or the whole string if there is no query), decodes each parameter and lists it as an editable row.'
              )}
            </Note>
          ) : pairs.length === 0 ? (
            <Note>{t(l, '這串沒有參數。', 'No parameters in that string.')}</Note>
          ) : (
            <>
              <Table
                head={[t(l, '名稱', 'key'), t(l, '值(已解碼)', 'value (decoded)'), '']}
                rows={pairs.map((pair, index) => [
                  <Input
                    key={`k${index}`}
                    value={pair.key}
                    onChange={(value) => editPair(index, { key: value })}
                    invalid={Boolean(pair.error)}
                  />,
                  <Input
                    key={`v${index}`}
                    value={pair.value}
                    onChange={(value) => editPair(index, { value, hasEquals: true })}
                  />,
                  <Btn
                    key={`d${index}`}
                    onClick={() => setPairs(pairs.filter((_, i) => i !== index))}
                  >
                    {t(l, '刪除', 'remove')}
                  </Btn>,
                ])}
              />

              {pairs.some((pair) => pair.error) ? (
                <Note error>
                  {t(
                    l,
                    '有一列的原始值無法解碼,表格裡顯示的是未解碼的原字串。重組之後那一列的內容會變。',
                    'One row would not decode, so it shows the raw string. Rebuilding will change that row.'
                  )}
                </Note>
              ) : null}

              {duplicates.length > 0 ? (
                <Note>
                  {t(
                    l,
                    `重複的名稱:${duplicates.join('、')}。重複是合法的,但 PHP 與 Rails 讀成陣列、Express 與 Go 讀成最後一個,兩邊行為不同。`,
                    `Repeated keys: ${duplicates.join(', ')}. That is legal, but PHP and Rails read them as a list while Express and Go keep only the last one.`
                  )}
                </Note>
              ) : null}

              <Row>
                <CopyButton l={l} text={rebuiltQuery} label={t(l, '複製 query', 'copy query')} />
                {looksLikeUrl ? (
                  <CopyButton l={l} text={rebuiltUrl} label={t(l, '複製完整網址', 'copy full URL')} />
                ) : null}
                <Btn onClick={() => setText(looksLikeUrl ? rebuiltUrl : rebuiltQuery)}>
                  {t(l, '寫回輸入框', 'write back to input')}
                </Btn>
              </Row>
              <div className="inst-out mt-2" style={{ minHeight: 0, wordBreak: 'break-all' }} aria-live="polite">
                {looksLikeUrl ? rebuiltUrl : rebuiltQuery}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Readout
        l={l}
        items={[
          { k: t(l, '輸入', 'in'), v: `${count(utf8Length(text))} B` },
          { k: t(l, '輸出', 'out'), v: `${count(utf8Length(result.out))} B` },
          { k: t(l, '參數', 'pairs'), v: pairs ? count(pairs.length) : '—' },
          { k: t(l, '編碼層數', 'encode rounds'), v: count(rounds) },
          { k: t(l, '規則', 'rule'), v: direction === 'encode' ? mode : plusAsSpace ? 'form' : 'rfc3986' },
        ]}
      />
    </div>
  );
}
