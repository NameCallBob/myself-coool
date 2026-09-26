'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
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
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  DEFAULT_CLEAN,
  TRACKING_PATTERNS,
  buildQuery,
  byteLength,
  confusableLabels,
  hostToAscii,
  inspect,
  parsePatterns,
  rebuild,
  scriptsOf,
  type QueryPair,
} from './logic';

const SAMPLE =
  'https://shop.example.com/products/tea?utm_source=newsletter&utm_medium=email&utm_campaign=autumn&fbclid=IwAR123&id=88&variant=green#reviews';

export default function UrlInspect({ l }: ToolProps) {
  const [text, setText] = useState(SAMPLE);
  /** Non-null once the query table has been edited; cleared when the URL changes. */
  const [edits, setEdits] = useState<QueryPair[] | null>(null);
  const [patternText, setPatternText] = useState(TRACKING_PATTERNS.join('\n'));
  const [showPatterns, setShowPatterns] = useState(false);
  const [dropFragment, setDropFragment] = useState(false);
  const [dropAuth, setDropAuth] = useState(false);
  const [sortParams, setSortParams] = useState(false);
  const [forceHttps, setForceHttps] = useState(false);
  const [stripOn, setStripOn] = useState(true);

  const result = useMemo(() => inspect(text), [text]);
  const parts = result.ok ? result.parts : null;

  // Memoised so the rebuild below is not handed a fresh array every render.
  const pairs = useMemo(() => edits ?? parts?.query ?? [], [edits, parts]);
  const patterns = useMemo(() => (stripOn ? parsePatterns(patternText) : []), [patternText, stripOn]);

  const output = useMemo(() => {
    if (!parts) return { url: '', removed: [] as QueryPair[] };
    return rebuild(parts.href, pairs, {
      ...DEFAULT_CLEAN,
      patterns,
      dropFragment,
      dropAuth,
      sortParams,
      forceHttps,
    });
  }, [parts, pairs, patterns, dropFragment, dropAuth, sortParams, forceHttps]);

  const homographs = parts ? confusableLabels(parts.unicodeHost) : [];

  const setPair = (index: number, patch: Partial<QueryPair>) =>
    setEdits(pairs.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));

  const rows: [string, string][] = parts
    ? [
        [t(l, '協定', 'scheme'), parts.protocol],
        [t(l, '使用者', 'username'), parts.username || '—'],
        [t(l, '密碼', 'password'), parts.password ? '•'.repeat(parts.password.length) : '—'],
        [t(l, '主機', 'host'), parts.hostname || '—'],
        [
          t(l, '連接埠', 'port'),
          parts.port
            ? parts.port
            : parts.effectivePort
              ? `${parts.effectivePort} ${t(l, '(協定預設,字串裡沒寫)', '(scheme default, absent from the string)')}`
              : '—',
        ],
        [t(l, '來源', 'origin'), parts.origin],
        [t(l, '路徑', 'path'), parts.pathname],
        [
          t(l, '路徑片段', 'segments'),
          parts.segments.length === 0 ? '—' : parts.segments.map((s) => `/${s}`).join(' '),
        ],
        [t(l, '查詢字串', 'query'), parts.search || '—'],
        [t(l, '片段識別', 'fragment'), parts.hash || '—'],
      ]
    : [];

  return (
    <div>
      <Bench
        leftLabel={t(l, '網址', 'URL')}
        rightLabel={t(l, '部件', 'PARTS')}
        leftAside={<span className="inst-no">{bytes(byteLength(text))}</span>}
        rightAside={
          parts ? (
            <CopyButton
              l={l}
              text={rows.map(([k, v]) => `${k}: ${v}`).join('\n')}
              label={t(l, '複製拆解', 'copy parts')}
            />
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上網址', 'Paste a URL')}
              value={text}
              onChange={(value) => {
                setText(value);
                setEdits(null);
              }}
              rows={5}
              invalid={!result.ok && text.trim() !== ''}
              placeholder={SAMPLE}
            />
            <Row>
              <Btn
                onClick={() => {
                  setText('');
                  setEdits(null);
                }}
              >
                {t(l, '清空', 'clear')}
              </Btn>
              <Btn
                onClick={() => {
                  setText(SAMPLE);
                  setEdits(null);
                }}
              >
                {t(l, '放入範例', 'load sample')}
              </Btn>
            </Row>

            {!result.ok && text.trim() !== '' ? (
              <Note error>
                {t(
                  l,
                  '這串文字用瀏覽器的 URL 規則解不開。少了協定的話會自動試 https://,但前提是開頭看起來像主機名稱。',
                  'The browser URL parser rejects this. A missing scheme is retried as https://, but only when the start already looks like a host name.'
                )}
              </Note>
            ) : null}

            {result.ok && result.schemeAdded ? (
              <Note>
                {t(
                  l,
                  '原字串沒有協定,已當成 https:// 解析。',
                  'No scheme in the input — parsed as https://.'
                )}
              </Note>
            ) : null}

            {parts && parts.unicodeHost !== parts.hostname ? (
              <Note>
                {t(l, '這是國際化網域。瀏覽器實際連線用的是 ', 'This is an internationalised domain. The browser connects to ')}
                <span className="inst-no">{parts.hostname}</span>
                {t(l, ',網址列顯示的是 ', ', while the address bar shows ')}
                <span className="inst-no">{parts.unicodeHost}</span>
                {t(l, '。', '.')}
              </Note>
            ) : null}

            {homographs.length > 0 ? (
              <Note error>
                {t(
                  l,
                  `警告:主機名稱裡的「${homographs.join('、')}」混用了兩種以上長得很像的字母(拉丁/斯拉夫/希臘),各字母分別是 ${homographs.map((label) => scriptsOf(label).join('+')).join('、')}。這是仿冒網域最常見的手法。`,
                  `Warning: the label "${homographs.join(', ')}" mixes two or more look-alike alphabets (${homographs.map((label) => scriptsOf(label).join(' + ')).join('; ')}). That is the standard homograph trick.`
                )}
              </Note>
            ) : null}

            {parts && parts.username ? (
              <Note>
                {t(
                  l,
                  '網址裡帶了帳號密碼。大多數瀏覽器會忽略或警告,而且它會進入歷史紀錄與 Referer。',
                  'Credentials are embedded in the URL. Most browsers ignore or warn about these, and they end up in history and Referer.'
                )}
              </Note>
            ) : null}
          </>
        }
        right={
          parts ? (
            <div aria-live="polite">
              <Table
                head={[t(l, '部件', 'part'), t(l, '值', 'value')]}
                rows={rows.map(([key, value]) => [
                  key,
                  <span key={key} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {value}
                  </span>,
                ])}
              />
              {parts.unicodeHost !== parts.hostname ? (
                <p className="inst-hint">
                  {t(l, 'ASCII 形式', 'ASCII form')}:{' '}
                  <span className="inst-no">{hostToAscii(parts.unicodeHost)}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <Note>{t(l, '貼上網址就會在這裡拆開。', 'A URL is broken down here.')}</Note>
          )
        }
      />

      <Panel
        label={t(l, '查詢參數', 'QUERY PARAMETERS')}
        aside={
          <span className="inst-no">
            {count(pairs.length)} {t(l, '個', 'total')}
            {output.removed.length > 0
              ? ` · ${t(l, '將移除', 'stripping')} ${count(output.removed.length)}`
              : ''}
          </span>
        }
      >
        {pairs.length === 0 ? (
          <Note>{t(l, '這個網址沒有查詢參數。', 'This URL has no query parameters.')}</Note>
        ) : (
          <Table
            head={[t(l, '名稱', 'name'), t(l, '值', 'value'), t(l, '狀態', 'state'), '']}
            rows={pairs.map((pair, index) => [
              <Input
                key="n"
                value={pair.name}
                onChange={(value) => setPair(index, { name: value })}
              />,
              <Input
                key="v"
                value={pair.value}
                onChange={(value) => setPair(index, { value, hasEquals: true })}
              />,
              <span key="s" className="inst-no">
                {patterns.length > 0 && output.removed.includes(pair)
                  ? t(l, '追蹤,將移除', 'tracking → removed')
                  : pair.malformed
                    ? t(l, '百分號編碼有問題', 'broken escape')
                    : !pair.hasEquals
                      ? t(l, '沒有等號', 'no "="')
                      : ''}
              </span>,
              <Btn key="x" onClick={() => setEdits(pairs.filter((_, i) => i !== index))}>
                <X size={12} strokeWidth={1.5} />
                {t(l, '刪除', 'drop')}
              </Btn>,
            ])}
          />
        )}
        <Row>
          <Btn
            onClick={() =>
              setEdits([...pairs, { name: '', value: '', hasEquals: true, malformed: false }])
            }
          >
            {t(l, '加一列', 'add a row')}
          </Btn>
          {edits ? (
            <Btn onClick={() => setEdits(null)}>{t(l, '還原成原網址的參數', 'revert to the URL')}</Btn>
          ) : null}
          <span className="inst-no">?{buildQuery(pairs) || '—'}</span>
        </Row>
      </Panel>

      <Panel
        label={t(l, '清理後的網址', 'CLEANED URL')}
        aside={parts ? <CopyButton l={l} text={output.url} /> : null}
      >
        <Row>
          <Check2
            label={t(l, '移除追蹤參數', 'strip tracking parameters')}
            checked={stripOn}
            onChange={setStripOn}
          />
          <Check2 label={t(l, '去掉 # 片段', 'drop the #fragment')} checked={dropFragment} onChange={setDropFragment} />
          <Check2 label={t(l, '去掉帳號密碼', 'drop credentials')} checked={dropAuth} onChange={setDropAuth} />
          <Check2 label={t(l, '參數排序', 'sort parameters')} checked={sortParams} onChange={setSortParams} />
          <Check2 label={t(l, 'http 改 https', 'http → https')} checked={forceHttps} onChange={setForceHttps} />
        </Row>

        <div className="inst-out" aria-live="polite" style={{ minHeight: '4.5rem' }}>
          {output.url || (
            <span style={{ color: 'var(--fg-faint)' }}>
              {t(l, '先貼一個能解析的網址。', 'Paste a URL that parses first.')}
            </span>
          )}
        </div>

        {output.removed.length > 0 ? (
          <p className="inst-hint">
            {t(l, '移除了', 'Removed')}:{' '}
            <span className="inst-no">
              {output.removed.map((pair) => `${pair.name}=${pair.value}`).join('  ')}
            </span>
          </p>
        ) : null}

        <p className="inst-hint">
          {t(
            l,
            '路徑的大小寫與順序一律不動:/A 與 /a 是兩個不同的資源,會「順手整理」的清理器會弄壞連結。',
            'The path is never re-cased or reordered: /A and /a are different resources, and a cleaner that tidies them breaks links.'
          )}
        </p>

        <Row>
          <Btn onClick={() => setShowPatterns(!showPatterns)}>
            {showPatterns
              ? t(l, '收起參數清單', 'hide the pattern list')
              : t(l, `編輯追蹤參數清單(${parsePatterns(patternText).length} 條)`, `edit the pattern list (${parsePatterns(patternText).length})`)}
          </Btn>
          {patternText !== TRACKING_PATTERNS.join('\n') ? (
            <Btn onClick={() => setPatternText(TRACKING_PATTERNS.join('\n'))}>
              {t(l, '還原內建清單', 'restore the built-in list')}
            </Btn>
          ) : null}
        </Row>

        {showPatterns ? (
          <>
            <Area
              label={t(l, '要移除的參數名稱(一行一條,結尾 * 代表前綴比對)', 'Parameter names to remove (one per line; a trailing * matches a prefix)')}
              value={patternText}
              onChange={setPatternText}
              rows={10}
            />
            <p className="inst-hint">
              {t(
                l,
                '內建清單來自各廣告平台自己的文件與 Firefox 的查詢字串清理設定,2025-09 檢視。廣告網路加參數的速度比任何清單更新都快,而且任何網站都可以讓其中一個變成必要參數——覺得不對就自己改,以實際網站行為為準。',
                'The built-in list comes from each ad platform’s own documentation and Firefox’s query-stripping list, reviewed 2025-09. Networks add parameters faster than any list is updated, and any site is free to make one of these load-bearing — edit it, and trust the site’s actual behaviour over the list.'
              )}
            </p>
          </>
        ) : null}
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '協定', 'scheme'), v: parts ? parts.protocol.replace(':', '') : '—' },
          { k: t(l, '主機', 'host'), v: parts ? parts.unicodeHost || '—' : '—' },
          { k: t(l, '參數', 'params'), v: count(pairs.length) },
          { k: t(l, '已移除', 'stripped'), v: count(output.removed.length) },
          {
            k: t(l, '長度變化', 'length'),
            v: parts ? `${count(byteLength(parts.href))} → ${count(byteLength(output.url))} B` : '—',
          },
        ]}
      />
    </div>
  );
}
