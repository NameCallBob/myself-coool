'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { isolate } from '@/lib/tools/isolate';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  BadPattern,
  DEFAULT_FLAGS,
  MAX_INPUT,
  MAX_PREVIEW,
  TIMEOUT_MS,
  WORKER_BODY,
  buildPattern,
  compile,
  expandEscapes,
  run,
  segments,
  type Flags,
  type Mode,
  type Span,
} from './logic';

/** Highlighting more than this much text costs more than it explains. */
const PREVIEW_CHARS = 8000;

type State = {
  text: string;
  count: number;
  truncated: boolean;
  spans: Span[];
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
  error: string | null;
  /** True when the regex ran on the main thread because no Worker was available. */
  unguarded: boolean;
  pending: boolean;
};

const IDLE: State = {
  text: '',
  count: 0,
  truncated: false,
  spans: [],
  groups: [],
  named: {},
  error: null,
  unguarded: false,
  pending: false,
};

/**
 * Find and replace, with the regex run at arm's length.
 *
 * Everything is computed in an effect rather than during render, because the
 * regex path is asynchronous: it is handed to a Worker with a deadline so a
 * pattern that backtracks forever becomes an error message instead of a dead
 * tab. The debounce in front of it also means typing a pattern does not launch
 * a Worker per keystroke.
 */
export default function FindReplace({ l }: ToolProps) {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [mode, setMode] = useState<Mode>('literal');
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [escapes, setEscapes] = useState(true);
  const [result, setResult] = useState<State>(IDLE);

  const setFlag = <K extends keyof Flags>(key: K, value: Flags[K]) =>
    setFlags((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    let cancelled = false;

    const compute = async (): Promise<State> => {
      if (find === '') return { ...IDLE, text };
      if (text.length > MAX_INPUT) {
        return {
          ...IDLE,
          error: t(
            l,
            `文字有 ${count(text.length)} 字元,超過 ${count(MAX_INPUT)} 的上限。這個工具是給段落用的,整份檔案請切成幾段。`,
            `The input is ${count(text.length)} characters, over the ${count(MAX_INPUT)} limit. Split a whole file into parts.`
          ),
        };
      }

      // Escape expansion applies to a literal search — a regex engine already
      // understands \n, and expanding it first would break \d and friends.
      const needle = mode === 'literal' && escapes ? expandEscapes(find) : find;
      const into = escapes ? expandEscapes(replacement) : replacement;

      let pattern: RegExp;
      try {
        pattern = compile(needle, mode, flags);
      } catch (error) {
        return {
          ...IDLE,
          error:
            error instanceof BadPattern
              ? t(l, `這個正規表達式不合法:${error.detail}`, `Not a valid regular expression: ${error.detail}`)
              : String(error),
        };
      }

      const workerAvailable = mode === 'regex' && typeof Worker !== 'undefined';
      if (workerAvailable) {
        const built = buildPattern(needle, mode, flags);
        const outcome = await isolate<{
          text: string;
          count: number;
          spans: Span[];
          truncated: boolean;
          groups: (string | undefined)[];
          named: Record<string, string | undefined>;
        }>(
          WORKER_BODY,
          {
            source: built.source,
            flags: built.flags,
            text,
            replacement: into,
            preview: MAX_PREVIEW,
            limit: 200_000,
          },
          TIMEOUT_MS
        );
        if (outcome.ok) return { ...IDLE, ...outcome.value };
        return {
          ...IDLE,
          error: outcome.error.startsWith('timeout')
            ? t(
                l,
                `這個 pattern 在 ${TIMEOUT_MS / 1000} 秒內沒算完,已經中止。巢狀量詞(像 (a+)+)在不符合的字串上會指數回溯,分頁沒被卡住是因為它在 Worker 裡跑。`,
                `The pattern did not finish in ${TIMEOUT_MS / 1000}s and was terminated. Nested quantifiers like (a+)+ backtrack exponentially; the tab survived because it ran in a Worker.`
              )
            : outcome.error,
        };
      }

      // Literal patterns cannot backtrack, so they are safe here. A regex only
      // lands here when Worker is unavailable, and the UI says so.
      try {
        const outcome = run(text, pattern, into);
        return { ...IDLE, ...outcome, unguarded: mode === 'regex' };
      } catch (error) {
        return { ...IDLE, error: error instanceof Error ? error.message : String(error) };
      }
    };

    // Everything happens in the timer callback: a setState in the effect body
    // would be a synchronous state write during commit.
    const timer = setTimeout(() => {
      setResult((previous) => ({ ...previous, pending: true }));
      void compute().then((next) => {
        if (!cancelled) setResult(next);
      });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, find, replacement, mode, flags, escapes, l]);

  const previewText = text.slice(0, PREVIEW_CHARS);
  const parts = useMemo(
    () => segments(previewText, result.spans.filter((span) => span.at + span.length <= previewText.length)),
    [previewText, result.spans]
  );

  const output = find === '' ? text : result.text;
  const groupRows = result.groups
    .map((value, index) => [`$${index + 1}`, value ?? ''])
    .concat(Object.entries(result.named).map(([name, value]) => [`$<${name}>`, value ?? '']));

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={t(l, '輸出', 'OUTPUT')}
        leftAside={<span className="inst-no">{bytes(new Blob([text]).size)}</span>}
        rightAside={
          <span className="inst-no">
            {result.pending ? t(l, '計算中', 'working') : `${count(result.count)} ${t(l, '處', 'matches')}`}
          </span>
        }
        left={
          <>
            <Area
              label={t(l, '貼上文字', 'Paste text')}
              value={text}
              onChange={setText}
              rows={12}
            />
            <Row>
              <ResetButton
                l={l}
                onReset={() => {
                  setText('');
                  setFind('');
                  setReplacement('');
                }}
              />
              <button type="button" className="inst-btn" onClick={() => setText(output)}>
                {t(l, '把結果寫回輸入', 'apply to the input')}
              </button>
            </Row>

            <Row>
              <Seg
                label={t(l, '比對方式', 'Match mode')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'literal', label: t(l, '純文字', 'literal') },
                  { value: 'regex', label: t(l, '正規表達式', 'regex') },
                ]}
              />
            </Row>
            <Input
              label={t(l, '尋找', 'Find')}
              value={find}
              onChange={setFind}
              invalid={result.error !== null}
              placeholder={mode === 'regex' ? '(\\w+)@(\\w+)' : t(l, '要找的文字', 'text to find')}
            />
            <Input
              label={t(l, '取代成', 'Replace with')}
              value={replacement}
              onChange={setReplacement}
              placeholder={mode === 'regex' ? '$2 / $1' : ''}
              hint={
                mode === 'regex'
                  ? t(
                      l,
                      '$1 $2 是擷取群組,$& 是整段命中,$<name> 是具名群組,$$ 是一個真正的錢字號。',
                      '$1 $2 are capture groups, $& the whole match, $<name> a named group, $$ a literal dollar sign.'
                    )
                  : undefined
              }
            />

            <Row>
              <Check2
                label={t(l, '不分大小寫 (i)', 'ignore case (i)')}
                checked={flags.ignoreCase}
                onChange={(value) => setFlag('ignoreCase', value)}
              />
              <Check2
                label={t(l, '全部取代 (g)', 'replace all (g)')}
                checked={flags.global}
                onChange={(value) => setFlag('global', value)}
              />
              <Check2
                label={t(l, '整字比對', 'whole word')}
                checked={flags.wholeWord}
                onChange={(value) => setFlag('wholeWord', value)}
              />
            </Row>
            {mode === 'regex' ? (
              <Row>
                <Check2
                  label={t(l, '多行 (m)', 'multiline (m)')}
                  checked={flags.multiline}
                  onChange={(value) => setFlag('multiline', value)}
                />
                <Check2
                  label={t(l, '點號含換行 (s)', 'dot matches newline (s)')}
                  checked={flags.dotAll}
                  onChange={(value) => setFlag('dotAll', value)}
                />
                <Check2
                  label={t(l, 'Unicode (u)', 'unicode (u)')}
                  checked={flags.unicode}
                  onChange={(value) => setFlag('unicode', value)}
                />
              </Row>
            ) : null}
            <Row>
              <Check2
                label={t(l, '把 \\n \\t \\u0041 當成字元', 'treat \\n \\t \\u0041 as characters')}
                checked={escapes}
                onChange={setEscapes}
              />
            </Row>

            {result.error ? <Note error>{result.error}</Note> : null}
            {flags.wholeWord ? (
              <Note>
                {t(
                  l,
                  '整字比對用的是 \\b,它只認得英數與底線;中文每個字的兩側都算邊界,所以對中文沒有作用。',
                  'Whole-word uses \\b, which only knows letters, digits and underscore — it does nothing useful around Chinese.'
                )}
              </Note>
            ) : null}
            {result.unguarded ? (
              <Note error>
                {t(
                  l,
                  '這個瀏覽器不支援 Worker,正規表達式改在主執行緒執行。惡性 pattern 可能讓分頁沒反應。',
                  'No Worker support in this browser, so the regex ran on the main thread. A pathological pattern can freeze the tab.'
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
                  {t(l, '貼上文字並填入「尋找」。', 'Paste text and fill in Find.')}
                </span>
              )}
            </div>
            <Row>
              <CopyButton l={l} text={output} />
            </Row>

            <div className="inst-pane-label mt-6">
              <span>{t(l, '命中位置', 'MATCHES')}</span>
              <span className="inst-no">
                {count(result.count)}
                {result.truncated ? ' +' : ''}
              </span>
            </div>
            <div className="inst-out" aria-live="polite">
              {parts.length === 0 ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '沒有命中。', 'No matches.')}
                </span>
              ) : (
                parts.map((part, index) => (
                  <span key={index} className={part.hit ? 'inst-ins' : undefined}>
                    {part.text}
                  </span>
                ))
              )}
            </div>
            {text.length > PREVIEW_CHARS ? (
              <Note>
                {t(
                  l,
                  `命中預覽只畫前 ${count(PREVIEW_CHARS)} 字元;計數與取代仍然是整份文字。`,
                  `The highlight only draws the first ${count(PREVIEW_CHARS)} characters; counting and replacing cover the whole text.`
                )}
              </Note>
            ) : null}
            {result.count > MAX_PREVIEW ? (
              <Note>
                {t(
                  l,
                  `命中太多,只標記前 ${count(MAX_PREVIEW)} 處。`,
                  `Too many matches to draw; the first ${count(MAX_PREVIEW)} are marked.`
                )}
              </Note>
            ) : null}

            {groupRows.length > 0 ? (
              <>
                <div className="inst-pane-label mt-6">
                  <span>{t(l, '第一處命中的群組', 'GROUPS IN THE FIRST MATCH')}</span>
                </div>
                <Table
                  head={[t(l, '參照', 'reference'), t(l, '內容', 'value')]}
                  rows={groupRows.map(([key, value]) => [
                    <span key={key} className="inst-no">{key}</span>,
                    <span key={`${key}-v`} className="inst-wrap">{value}</span>,
                  ])}
                />
              </>
            ) : null}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '命中', 'matches'), v: `${count(result.count)}${result.truncated ? '+' : ''}` },
          { k: t(l, '方式', 'mode'), v: mode === 'regex' ? 'regex' : t(l, '純文字', 'literal') },
          { k: t(l, '旗標', 'flags'), v: buildPattern(find, mode, flags).flags || '—' },
          { k: t(l, '輸入', 'in'), v: bytes(new Blob([text]).size) },
          { k: t(l, '輸出', 'out'), v: bytes(new Blob([output]).size) },
          {
            k: t(l, '執行位置', 'runs in'),
            v: mode === 'regex' && !result.unguarded ? t(l, 'Worker(可中止)', 'Worker (killable)') : t(l, '主執行緒', 'main thread'),
          },
        ]}
      />
    </div>
  );
}
