'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Check2,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { isolate } from '@/lib/tools/isolate';
import {
  FLAG_KEYS,
  MATCH_LIMIT,
  WORKER_BODY,
  checkPattern,
  lineColumn,
  riskNotes,
  toSegments,
  type FlagKey,
  type WorkerValue,
} from './logic';

/** Long enough for a real pattern on a real file, short enough to feel broken. */
const TIMEOUT_MS = 2000;
/** Keystrokes coalesce into one worker; spawning one per character is waste. */
const SETTLE_MS = 140;

const SAMPLE_PATTERN = '(?<user>[\\w.+-]+)@(?<host>[\\w-]+(?:\\.[\\w-]+)+)';
const SAMPLE_SUBJECT = [
  'from: ada@example.com',
  'cc: grace.hopper+navy@navy.mil, 沒有信箱的一行',
  'bcc: not-an-email@, bad@@example.com',
].join('\n');

function flagHint(l: 'zh' | 'en', flag: FlagKey): string {
  const table: Record<FlagKey, [string, string]> = {
    g: ['全域:找出全部,不只第一個', 'global — every match, not just the first'],
    i: ['忽略大小寫', 'ignore case'],
    m: ['多行:^ $ 對每一行生效', 'multiline — ^ and $ match at line breaks'],
    s: ['. 也能匹配換行', 'dot matches newlines'],
    u: ['Unicode:\\p{...} 可用,逐碼位處理', 'unicode — \\p{…} works, code points not units'],
    v: ['Unicode 集合運算(與 u 互斥)', 'unicode sets (mutually exclusive with u)'],
    y: ['黏著:只在 lastIndex 位置嘗試', 'sticky — only try at lastIndex'],
    d: ['回報群組的起訖位置', 'report group start and end indices'],
  };
  return t(l, table[flag][0], table[flag][1]);
}

/**
 * Pattern on the left, matches on the right, and the actual match in a Worker.
 *
 * The Worker is not an optimisation. JavaScript regexes have no timeout, so a
 * catastrophically backtracking pattern on the main thread freezes the tab with
 * no way out. In a Worker the runaway is terminable, which is the only reason
 * this tool can let people type whatever they like into the pattern box.
 */
export default function RegexTester({ l }: ToolProps) {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('gm');
  const [subject, setSubject] = useState('');
  const [substituting, setSubstituting] = useState(false);
  const [template, setTemplate] = useState('');

  const [value, setValue] = useState<WorkerValue | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  /** Compiling is cheap and never loops; only matching can go exponential. */
  const compileError = useMemo(
    () => (pattern === '' ? null : checkPattern(pattern, flags)),
    [pattern, flags]
  );
  const risks = useMemo(() => (pattern === '' ? [] : riskNotes(pattern)), [pattern]);

  const idle = pattern === '' || compileError !== null;

  useEffect(() => {
    let dropped = false;
    const timer = setTimeout(() => {
      if (idle) {
        setValue(null);
        setFailure(null);
        setRunning(false);
        return;
      }
      setRunning(true);
      void isolate<WorkerValue>(
        WORKER_BODY,
        {
          pattern,
          flags,
          input: subject,
          limit: MATCH_LIMIT,
          template: substituting ? template : null,
        },
        TIMEOUT_MS
      ).then((outcome) => {
        if (dropped) return;
        setRunning(false);
        if (outcome.ok) {
          setValue(outcome.value);
          setFailure(null);
        } else {
          setValue(null);
          setFailure(outcome.error);
        }
      });
    }, SETTLE_MS);
    return () => {
      dropped = true;
      clearTimeout(timer);
    };
  }, [idle, pattern, flags, subject, substituting, template]);

  const segments = useMemo(() => toSegments(subject, value?.outcome.hits ?? []), [subject, value]);
  const hits = value?.outcome.hits ?? [];

  const timedOut = failure !== null && failure.startsWith('timeout');

  const toggleFlag = (flag: FlagKey) =>
    setFlags((current) => {
      if (current.includes(flag)) return current.split('').filter((f) => f !== flag).join('');
      // u and v cannot both be set; picking one replaces the other rather than
      // handing the user a compile error they did not ask for.
      const stripped =
        flag === 'u' || flag === 'v'
          ? current.split('').filter((f) => f !== 'u' && f !== 'v').join('')
          : current;
      return FLAG_KEYS.filter((key) => stripped.includes(key) || key === flag).join('');
    });

  return (
    <div>
      <Bench
        leftLabel={t(l, '樣式與主體', 'PATTERN & SUBJECT')}
        rightLabel={t(l, '命中', 'MATCHES')}
        leftAside={<span className="inst-no">{bytes(new Blob([subject]).size)}</span>}
        rightAside={
          <span className="inst-no">
            {running
              ? t(l, '計算中', 'running')
              : `${count(hits.length)}${value?.outcome.truncated ? '+' : ''}`}
          </span>
        }
        left={
          <>
            <div className="inst-field">
              <label className="inst-label" htmlFor="rx-pattern">
                {t(l, '正規表達式(不含前後斜線)', 'Pattern (no surrounding slashes)')}
              </label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span aria-hidden="true" style={{ color: 'var(--fg-faint)' }}>
                  /
                </span>
                <input
                  id="rx-pattern"
                  className="inst-input"
                  value={pattern}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={SAMPLE_PATTERN}
                  aria-invalid={compileError !== null || undefined}
                  onChange={(event) => setPattern(event.target.value)}
                />
                <span aria-hidden="true" style={{ color: 'var(--fg-faint)' }}>
                  /{flags}
                </span>
              </div>
            </div>

            <div className="inst-field">
              <span className="inst-label">{t(l, '旗標', 'Flags')}</span>
              <div className="inst-toolbar">
                {FLAG_KEYS.map((flag) => (
                  <button
                    key={flag}
                    type="button"
                    className="inst-btn"
                    aria-pressed={flags.includes(flag)}
                    data-primary={flags.includes(flag) ? 'true' : undefined}
                    title={flagHint(l, flag)}
                    onClick={() => toggleFlag(flag)}
                  >
                    {flag}
                  </button>
                ))}
              </div>
              <p className="inst-hint">
                {flags === ''
                  ? t(l, '沒有旗標:只找第一個命中。', 'No flags: first match only.')
                  : FLAG_KEYS.filter((flag) => flags.includes(flag))
                      .map((flag) => flagHint(l, flag))
                      .join(' · ')}
              </p>
            </div>

            <Area
              label={t(l, '測試文字', 'Test subject')}
              value={subject}
              onChange={setSubject}
              rows={10}
              placeholder={SAMPLE_SUBJECT}
            />

            <Row>
              <Check2
                label={t(l, '取代預覽', 'replacement preview')}
                checked={substituting}
                onChange={setSubstituting}
              />
              <ResetButton
                l={l}
                onReset={() => {
                  setPattern('');
                  setSubject('');
                  setTemplate('');
                }}
              />
              <button
                type="button"
                className="inst-btn"
                onClick={() => {
                  setPattern(SAMPLE_PATTERN);
                  setSubject(SAMPLE_SUBJECT);
                  setFlags('gm');
                }}
              >
                {t(l, '放入範例', 'load sample')}
              </button>
            </Row>

            {substituting ? (
              <Input
                label={t(l, '取代樣板', 'Replacement template')}
                hint={t(
                  l,
                  '$1 編號群組、$<name> 具名群組、$& 整段命中、$$ 一個錢字號。',
                  '$1 numbered group, $<name> named group, $& whole match, $$ a literal dollar sign.'
                )}
                value={template}
                onChange={setTemplate}
                placeholder="$<user> at $<host>"
              />
            ) : null}

            {compileError ? (
              <Note error>
                {t(l, '這個樣式編不起來:', 'This pattern does not compile: ')}
                {compileError}
              </Note>
            ) : null}

            {timedOut ? (
              <Note error>
                {t(
                  l,
                  `比對超過 ${TIMEOUT_MS} 毫秒被中止。這通常是災難性回溯:樣式裡有重複包重複的結構,引擎正在試每一種拆法。Worker 已經終止,這一頁沒有被卡住。`,
                  `The match was aborted after ${TIMEOUT_MS}ms. That is usually catastrophic backtracking — a repetition inside a repetition, with the engine trying every way to split the input. The worker was terminated; this page never froze.`
                )}
              </Note>
            ) : failure ? (
              <Note error>{failure}</Note>
            ) : null}

            {risks.length > 0 ? (
              <Note>
                {t(l, '樣式風險:', 'Pattern risk: ')}
                {risks
                  .map((risk) =>
                    risk === 'nested-quantifier'
                      ? t(
                          l,
                          '重複裡面還有重複(像 (a+)+),失敗時的嘗試次數是輸入長度的指數',
                          'a repetition inside a repetition, as in (a+)+ — failing costs exponential attempts'
                        )
                      : t(
                          l,
                          '被重複的群組裡有多選一(像 (a|a)*),分支重疊會讓回溯爆開',
                          'a repeated group containing alternation, as in (a|a)* — overlapping branches explode on backtracking'
                        )
                  )
                  .join('; ')}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <div className="inst-out" style={{ minHeight: '9rem' }} aria-live="polite">
              {idle || subject === '' ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '填入樣式與測試文字,命中會標在這裡。', 'Matches are highlighted here.')}
                </span>
              ) : (
                segments.map((segment, index) =>
                  segment.hit === null ? (
                    <span key={index}>{segment.text}</span>
                  ) : (
                    <mark
                      key={index}
                      style={{
                        background: 'color-mix(in oklab, var(--accent) 22%, transparent)',
                        color: 'inherit',
                        // Alternate matches differ in weight as well as tint, so
                        // the boundary between two adjacent hits is still visible
                        // without relying on colour alone.
                        fontWeight: segment.hit % 2 === 0 ? 400 : 700,
                      }}
                    >
                      {segment.text}
                    </mark>
                  )
                )
              )}
            </div>

            {hits.length > 0 ? (
              <>
                <Row>
                  <CopyButton
                    l={l}
                    text={hits.map((hit) => hit.text).join('\n')}
                    label={t(l, '複製命中', 'copy matches')}
                  />
                  {value?.outcome.truncated ? (
                    <span className="inst-no">
                      {t(l, `只列前 ${count(MATCH_LIMIT)} 筆`, `first ${count(MATCH_LIMIT)} only`)}
                    </span>
                  ) : null}
                </Row>
                <div className="mt-3">
                  <Table
                    head={[
                      '#',
                      t(l, '行:欄', 'line:col'),
                      t(l, '命中', 'match'),
                      t(l, '群組', 'groups'),
                    ]}
                    align={['right', 'right', 'left', 'left']}
                    rows={hits.slice(0, 200).map((hit, index) => {
                      const at = lineColumn(subject, hit.index);
                      const named = hit.named.map((group) => `${group.name}=${group.value ?? '—'}`);
                      const numbered = hit.groups.map(
                        (group, position) => `$${position + 1}=${group ?? '—'}`
                      );
                      return [
                        String(index + 1),
                        `${at.line}:${at.column}`,
                        <span key="m" className="inst-wrap">
                          {hit.length === 0 ? t(l, '(零長度)', '(zero length)') : hit.text}
                        </span>,
                        <span key="g" className="inst-wrap" style={{ color: 'var(--fg-muted)' }}>
                          {(named.length > 0 ? named : numbered).join('  ') || '—'}
                        </span>,
                      ];
                    })}
                  />
                  {hits.length > 200 ? (
                    <Note>
                      {t(
                        l,
                        `表格只畫前 200 筆(共 ${count(hits.length)} 筆),其餘仍在上方標示與複製內容裡。`,
                        `The table draws the first 200 of ${count(hits.length)}; the rest are still highlighted above and included in the copy.`
                      )}
                    </Note>
                  ) : null}
                </div>
              </>
            ) : !idle && subject !== '' && !running && failure === null ? (
              <Note>{t(l, '這個樣式在這段文字裡沒有命中。', 'No match in this subject.')}</Note>
            ) : null}

            {substituting && value?.replaced !== null && value !== null ? (
              <Panel
                label={t(l, '取代結果', 'REPLACED')}
                aside={<CopyButton l={l} text={value.replaced ?? ''} />}
              >
                <div className="inst-out" aria-live="polite">
                  {value.replaced}
                </div>
              </Panel>
            ) : null}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          {
            k: t(l, '命中', 'matches'),
            v: idle ? '—' : `${count(hits.length)}${value?.outcome.truncated ? '+' : ''}`,
          },
          { k: t(l, '擷取群組', 'groups'), v: idle ? '—' : count(value?.outcome.groupCount ?? 0) },
          { k: t(l, '具名群組', 'named'), v: idle ? '—' : count(value?.outcome.names.length ?? 0) },
          { k: t(l, '主體', 'subject'), v: bytes(new Blob([subject]).size) },
          { k: t(l, '超時上限', 'timeout'), v: `${TIMEOUT_MS} ms` },
        ]}
      />
    </div>
  );
}
