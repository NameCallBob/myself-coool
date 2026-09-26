'use client';

import { useMemo, useState } from 'react';
import {
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
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  CATEGORIES,
  DATA_CHECKED,
  ENTRIES,
  REGISTRIES,
  SPEC_SET,
  citation,
  countByCategory,
  lookupStatus,
  searchEntries,
  statusFamily,
  type Category,
  type Entry,
} from './logic';

const PRESETS = ['404', '4xx', '301', 'cache-control', 'etag', 'vary', 'no-store', 'range', 'cors'];

/**
 * An offline HTTP reference.
 *
 * The reason to have one at all is that the useful answer is almost never the
 * reason phrase. "409 Conflict" tells you nothing; "conflicts with the current
 * state of the resource, and the body should say what conflicts" is the thing
 * you were looking up. So each row carries a sentence about when to reach for
 * it, and a citation you can go and check.
 */
export default function HttpReference({ l }: ToolProps) {
  const [query, setQuery] = useState('');
  const [off, setOff] = useState<readonly Category[]>([]);

  const active = useMemo(
    () => CATEGORIES.map((category) => category.key).filter((key) => !off.includes(key)),
    [off]
  );

  const results = useMemo(() => searchEntries(query, active), [query, active]);

  const grouped = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        rows: results.filter((entry) => entry.category === category.key),
      })).filter((group) => group.rows.length > 0),
    [results]
  );

  const totals = useMemo(() => countByCategory(), []);

  /**
   * A three-digit query with no registered match still deserves an answer: 499,
   * 520 and 598 turn up in real logs and belong to a class even though no RFC
   * defines them.
   */
  const unregistered = useMemo(() => {
    const trimmed = query.trim();
    if (!/^\d{3}$/.test(trimmed)) return null;
    if (lookupStatus(trimmed) !== null) return null;
    const family = statusFamily(Number(trimmed));
    return family === null ? { code: trimmed, family: null } : { code: trimmed, family };
  }, [query]);

  const asText = useMemo(
    () =>
      results
        .map((entry) => {
          const head = entry.label ? `${entry.name} ${entry.label}` : entry.name;
          return `${head}\t${citation(entry)}\t${t(l, entry.zh, entry.en)}`;
        })
        .join('\n'),
    [results, l]
  );

  const toggle = (key: Category, on: boolean) =>
    setOff((current) => (on ? current.filter((item) => item !== key) : [...current, key]));

  const flagText = (entry: Entry) =>
    [
      ...(entry.deprecated ? [t(l, '已廢棄', 'deprecated')] : []),
      ...(entry.flags ?? []),
    ].join(' · ');

  return (
    <div>
      <Panel
        label={t(l, '查詢', 'LOOK UP')}
        aside={<span className="inst-no">{SPEC_SET}</span>}
      >
        <Input
          label={t(l, '狀態碼、標頭名稱、指令、RFC 編號,或中文關鍵字', 'Status code, field name, directive, RFC number, or a keyword')}
          hint={t(
            l,
            '輸入 404、4xx、40(前綴)、etag、9111、限流都可以。搜尋範圍包含說明文字與舊名稱(例如 Unprocessable Entity 找得到 422)。',
            'Try 404, 4xx, 40 (prefix), etag, 9111. The search covers the descriptions and the former names, so “Unprocessable Entity” finds 422.'
          )}
          value={query}
          onChange={setQuery}
          placeholder="404"
        />

        <div className="inst-field">
          <span className="inst-label">{t(l, '常查的', 'Common lookups')}</span>
          <div className="inst-toolbar">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="inst-btn"
                aria-pressed={query === preset}
                onClick={() => setQuery(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <Row>
          {CATEGORIES.map((category) => (
            <Check2
              key={category.key}
              label={`${t(l, category.zh, category.en)} (${count(totals[category.key])})`}
              checked={!off.includes(category.key)}
              onChange={(on) => toggle(category.key, on)}
            />
          ))}
        </Row>

        <Row>
          <Btn onClick={() => setQuery('')} disabled={query === ''}>
            {t(l, '清空查詢', 'clear query')}
          </Btn>
          <Btn onClick={() => setOff([])} disabled={off.length === 0}>
            {t(l, '全部分類', 'all categories')}
          </Btn>
          <CopyButton l={l} text={asText} label={t(l, '複製結果', 'copy results')} />
        </Row>

        <div aria-live="polite">
          {active.length === 0 ? (
            <Note error>{t(l, '所有分類都關掉了,沒有東西可以查。', 'Every category is switched off, so there is nothing to search.')}</Note>
          ) : results.length === 0 ? (
            <Note error>
              {t(
                l,
                `「${query.trim()}」查不到。這份表只收錄 IANA 註冊過的狀態碼與標準標頭,X- 開頭的自訂標頭和廠商自己的狀態碼不在裡面。`,
                `Nothing matches “${query.trim()}”. This table holds the IANA-registered status codes and standard fields only — X- prefixed custom headers and vendor-specific codes are not here.`
              )}
            </Note>
          ) : (
            <Note>
              {t(
                l,
                `${results.length} 筆,共 ${ENTRIES.length} 筆資料。`,
                `${results.length} of ${ENTRIES.length} entries.`
              )}
            </Note>
          )}

          {unregistered ? (
            <Note>
              {unregistered.family === null
                ? t(
                    l,
                    `${unregistered.code} 不在 100–599 的範圍內,不是合法的 HTTP 狀態碼。`,
                    `${unregistered.code} is outside 100–599 and is not a valid HTTP status code.`
                  )
                : t(
                    l,
                    `${unregistered.code} 沒有被 IANA 註冊過,所以下面沒有它的條目。照開頭數字判斷,它屬於 ${unregistered.family.zh}。nginx 的 499、Cloudflare 的 520 與 521 都是這種廠商自己定的碼。`,
                    `${unregistered.code} is not IANA-registered, so it has no row below. By its leading digit it is ${unregistered.family.en}. nginx’s 499 and Cloudflare’s 520/521 are vendor codes of this kind.`
                  )}
            </Note>
          ) : null}
        </div>
      </Panel>

      {grouped.map((group) => (
        <Panel
          key={group.category.key}
          label={t(l, group.category.zh, group.category.en)}
          aside={<span className="inst-no">{count(group.rows.length)}</span>}
        >
          <Table
            head={[
              t(l, '名稱', 'name'),
              t(l, '說明', 'what it means'),
              t(l, '出處', 'defined in'),
            ]}
            rows={group.rows.map((entry) => [
              <span key="n">
                <b className="inst-no" style={{ color: 'var(--fg)' }}>
                  {entry.name}
                </b>
                {entry.label ? (
                  <>
                    {' '}
                    <span style={{ color: 'var(--fg-muted)' }}>{entry.label}</span>
                  </>
                ) : null}
                {flagText(entry) ? (
                  <>
                    <br />
                    <span className="inst-no" style={{ color: 'var(--fg-faint)' }}>
                      {flagText(entry)}
                    </span>
                  </>
                ) : null}
              </span>,
              <span key="d" className="inst-wrap">
                {t(l, entry.zh, entry.en)}
              </span>,
              <span key="c" className="inst-no" style={{ whiteSpace: 'nowrap' }}>
                {citation(entry)}
              </span>,
            ])}
          />
        </Panel>
      ))}

      <Panel label={t(l, '這份資料的出處與界線', 'PROVENANCE AND LIMITS')}>
        <Note>
          {t(
            l,
            `依據 ${SPEC_SET}。2022 年 6 月的這一批 RFC 廢止了 RFC 7230–7235 與 2616,所以還在引用 7231 的速查表指的是已廢止的文件。這裡的章節號都對應上述文件,可以直接去 RFC 原文核對。`,
            `Follows ${SPEC_SET}. That June 2022 batch obsoletes RFC 7230–7235 and 2616, so a cheat sheet still citing 7231 points at an obsolete document. The section numbers here refer to those RFCs so you can check the text yourself.`
          )}
        </Note>
        <Note>
          {t(
            l,
            `權威來源是 RFC 原文與 ${REGISTRIES}。這份表是手抄的,抄錯是有可能的;查核日 ${DATA_CHECKED}。部分條目沒有章節號,那是因為這裡不對它的章節號背書,不是它沒有出處。`,
            `The authorities are the RFC text and ${REGISTRIES}. This table was transcribed by hand and can therefore be wrong; checked ${DATA_CHECKED}. Some rows carry no section number, which means this table does not vouch for one — not that the entry has no source.`
          )}
        </Note>
        <Note>
          {t(
            l,
            '不收錄的東西:X- 開頭的自訂標頭、廠商自訂狀態碼(nginx 499、Cloudflare 5xx)、CORS 與 CSP 那一整組由 WHATWG Fetch 與 W3C 定義而非 RFC 定義的標頭。它們不在 RFC 裡,列進來就沒辦法給出處。',
            'Not included: X- prefixed custom fields, vendor status codes (nginx 499, Cloudflare 5xx), and the CORS and CSP families, which are defined by WHATWG Fetch and the W3C rather than by an RFC. Listing them here would mean listing them without a citation.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '符合', 'matches'), v: count(results.length) },
          { k: t(l, '資料筆數', 'entries'), v: count(ENTRIES.length) },
          { k: t(l, '狀態碼', 'status codes'), v: count(totals.status) },
          { k: t(l, '標頭', 'fields'), v: count(totals.request + totals.response) },
          { k: t(l, '快取指令', 'cache directives'), v: count(totals.cache) },
          { k: t(l, '依據', 'spec'), v: 'RFC 9110/9111' },
        ]}
      />
    </div>
  );
}
