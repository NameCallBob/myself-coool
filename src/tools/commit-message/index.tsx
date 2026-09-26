'use client';

import { useMemo, useState } from 'react';
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
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import type { ToolProps } from '../types';
import {
  BODY_WRAP,
  COMMIT_TYPES,
  SPEC_VERSION,
  SUBJECT_LIMIT,
  SUBJECT_RECOMMENDED,
  TYPES_CHECKED,
  TYPES_SOURCE,
  buildMessage,
  emptyDraft,
  lintDraft,
  measure,
  parseMessage,
  stripGitComments,
  wrapText,
  type Draft,
  type FooterSeparator,
  type Issue,
  type ParseNote,
} from './logic';

/**
 * Messages for the lint codes. Kept out of logic.ts so the rules stay testable
 * without dragging locale strings into the unit tests, and kept as a closed
 * record so a new code cannot be added without writing its text.
 */
const ISSUE_TEXT: Record<Issue['code'], [string, string]> = {
  'type-empty': ['type 是必填的。沒有 type 就不是 Conventional Commit,commitlint 會直接退回。', 'type is required. Without it this is not a Conventional Commit and commitlint will reject it.'],
  'type-uppercase': ['type「{v}」有大寫。規範本身不管大小寫,但慣例與多數 commitlint 設定要求全小寫。', 'The type “{v}” has capitals. The spec is case-insensitive here, but the convention and most commitlint configs want lowercase.'],
  'type-unknown': ['「{v}」不在常見的 type 清單裡。如果這是你們自己的約定,填到下面的「自訂 type」就不會再提醒。', '“{v}” is not in the common type list. If it is your own convention, add it under “custom types” below.'],
  'scope-parens': ['scope 裡不能有括號,括號本身就是 scope 的分隔符號。', 'A scope cannot contain parentheses; they are the delimiter.'],
  'scope-space': ['scope 有空白。規範沒禁止,但 changelog 產生器通常照 scope 分組,空白會讓分組變難讀。', 'The scope contains whitespace. Not forbidden, but changelog generators group by scope and whitespace makes that awkward.'],
  'scope-uppercase': ['scope「{v}」有大寫。慣例是小寫,大小寫不同會被當成兩個 scope。', 'The scope “{v}” has capitals. Lowercase is the convention; otherwise it counts as two different scopes.'],
  'subject-empty': ['描述不能空白。', 'The description cannot be empty.'],
  'subject-period': ['描述結尾不要加句號。這是 git 慣例,不是規範要求。', 'No full stop at the end of the description. A git convention, not a spec rule.'],
  'subject-capitalized': ['描述習慣用小寫開頭。這是 git 慣例,不是規範要求。', 'Descriptions conventionally start lowercase. A git convention, not a spec rule.'],
  'subject-long': [`第一行 {v} 欄,超過建議的 ${SUBJECT_RECOMMENDED} 欄。git log --oneline 在 80 欄終端機還讀得完,但已經不寬鬆了。`, `The first line is {v} columns, over the recommended ${SUBJECT_RECOMMENDED}. Still readable in git log --oneline at 80 columns, but not comfortably.`],
  'subject-over-limit': [`第一行 {v} 欄,超過 ${SUBJECT_LIMIT} 欄上限。GitHub 會截斷,git log 也會。`, `The first line is {v} columns, past the ${SUBJECT_LIMIT}-column limit. GitHub truncates it, and so does git log.`],
  'breaking-no-description': ['勾了 breaking 但沒寫說明。只有 `!` 也符合規範,但讀 changelog 的人看不到破壞了什麼。', 'Breaking is marked but not described. The `!` alone conforms, but nobody reading the changelog learns what broke.'],
  'footer-token-space': ['footer 名稱「{v}」有空白。規範要求用 `-` 代替空白,只有 BREAKING CHANGE 例外。', 'The footer token “{v}” contains whitespace. The spec requires `-` in place of spaces; BREAKING CHANGE is the only exception.'],
  'footer-value-empty': ['footer「{v}」沒有值。', 'The footer “{v}” has no value.'],
  'body-wrap': [`內文有 {v} 行超過 ${BODY_WRAP} 欄。git 不會自動折行,終端機會。`, `{v} body lines are over ${BODY_WRAP} columns. git will not wrap them; your terminal will.`],
};

const NOTE_TEXT: Record<ParseNote['code'], [string, string]> = {
  'not-conventional': ['第一行不符合 `type(scope)!: 描述` 的格式,整行當成描述放進表單了。', 'The first line does not match `type(scope)!: description`, so the whole line went into the description field.'],
  'no-space-after-colon': ['冒號後面少一個空白。規範的分隔符號是「冒號加空白」。', 'Missing the space after the colon. The spec separator is a colon *and* a space.'],
  'bang-after-colon': ['`!` 要放在冒號前面(`feat!:`),不是後面。', 'The `!` belongs before the colon (`feat!:`), not after it.'],
  'no-blank-after-header': ['第一行和內文之間少一個空行。', 'There is no blank line between the first line and the body.'],
  'breaking-footer-case': ['BREAKING CHANGE 必須全大寫才算數。這裡的寫法已當成破壞性變更處理,但 commitlint 不會這樣認。', 'BREAKING CHANGE only counts in uppercase. It has been read as a breaking change here, but commitlint will not agree.'],
  'breaking-without-bang': ['只有 footer 標了破壞性變更。這樣也符合規範,但重組後的訊息會補上 `!`。', 'Only the footer marks the breaking change. That conforms, but the rebuilt message adds the `!`.'],
  'scope-empty-parens': ['空括號 `()` 不是 scope,拿掉它。', 'Empty parentheses are not a scope; drop them.'],
};

const fill = (text: string, value?: string | number) => text.replace('{v}', String(value ?? ''));

const FOOTER_PRESETS: { token: string; separator: FooterSeparator }[] = [
  { token: 'Refs', separator: ' #' },
  { token: 'Closes', separator: ' #' },
  { token: 'Reviewed-by', separator: ': ' },
  { token: 'Co-authored-by', separator: ': ' },
  { token: 'Signed-off-by', separator: ': ' },
];

const SAMPLE = [
  'feat(api)!: 改用 cursor 分頁',
  '',
  'offset 分頁在資料量大的時候會掉筆:插入發生在已讀過的頁之前,',
  '下一頁就會跳過一筆。改成 cursor 之後順序由排序鍵決定,不受插入影響。',
  '',
  'BREAKING CHANGE: /items 不再接受 ?page=,改用 ?cursor=。',
  'Refs #133',
].join('\n');

/**
 * A Conventional Commits form, and the same grammar read backwards.
 *
 * The reverse direction is the half that earns its place. Amending a commit
 * means retyping the whole message, and retyping is where the footer gets lost
 * and the `!` ends up on the wrong side of the colon — so paste the old message
 * in, edit the field you meant to edit, and copy the result back out.
 */
export default function CommitMessage({ l }: ToolProps) {
  const [draft, setDraft] = useState<Draft>(() => parseMessage(SAMPLE).draft);
  const [extraTypes, setExtraTypes] = useState('');
  const [pasted, setPasted] = useState('');
  const [dropComments, setDropComments] = useState(true);

  const patch = (over: Partial<Draft>) => setDraft((current) => ({ ...current, ...over }));

  const knownTypes = useMemo(
    () => [
      ...COMMIT_TYPES.map((entry) => entry.type),
      ...extraTypes
        .split(/[,\s]+/)
        .map((word) => word.trim())
        .filter((word) => word !== ''),
    ],
    [extraTypes]
  );

  const message = useMemo(() => buildMessage(draft), [draft]);
  const issues = useMemo(() => lintDraft(draft, knownTypes), [draft, knownTypes]);
  const stats = useMemo(() => measure(draft), [draft]);

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warn');

  const parsed = useMemo(() => {
    const text = dropComments ? stripGitComments(pasted) : pasted;
    return text.trim() === '' ? null : parseMessage(text);
  }, [pasted, dropComments]);

  const setFooter = (index: number, over: Partial<Draft['footers'][number]>) =>
    setDraft((current) => ({
      ...current,
      footers: current.footers.map((footer, i) => (i === index ? { ...footer, ...over } : footer)),
    }));

  const bumpText =
    stats.bump === null
      ? t(l, '規範沒有定義', 'undefined by the spec')
      : stats.bump === 'major'
        ? t(l, 'MAJOR(有破壞性變更)', 'MAJOR (breaking)')
        : stats.bump === 'minor'
          ? 'MINOR'
          : 'PATCH';

  return (
    <div>
      <Bench
        leftLabel={t(l, '表單', 'FORM')}
        rightLabel={t(l, 'Commit 訊息', 'COMMIT MESSAGE')}
        leftAside={<span className="inst-no">{SPEC_VERSION}</span>}
        rightAside={
          <span className="inst-no">
            {stats.headerWidth}
            {t(l, ' 欄', ' col')}
          </span>
        }
        left={
          <>
            <Row>
              <Input
                label="type"
                value={draft.type}
                onChange={(value) => patch({ type: value })}
                placeholder="feat"
                invalid={draft.type.trim() === ''}
              />
              <Input
                label={t(l, 'scope(選填)', 'scope (optional)')}
                value={draft.scope}
                onChange={(value) => patch({ scope: value })}
                placeholder="api"
              />
            </Row>

            <div className="inst-field">
              <span className="inst-label">{t(l, '常見 type', 'Common types')}</span>
              <div className="inst-toolbar">
                {COMMIT_TYPES.map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    className="inst-btn"
                    aria-pressed={draft.type.trim().toLowerCase() === entry.type}
                    title={t(l, entry.zh, entry.en)}
                    onClick={() => patch({ type: entry.type })}
                  >
                    {entry.type}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={t(l, '描述(第一行)', 'Description (first line)')}
              hint={t(
                l,
                `連 type 一起算,建議不超過 ${SUBJECT_RECOMMENDED} 欄、上限 ${SUBJECT_LIMIT} 欄。中日韓文字一個算兩欄。`,
                `Counted with the type: ${SUBJECT_RECOMMENDED} columns preferred, ${SUBJECT_LIMIT} maximum. CJK characters count as two.`
              )}
              value={draft.subject}
              onChange={(value) => patch({ subject: value })}
              placeholder={t(l, '改用 cursor 分頁', 'switch to cursor pagination')}
              invalid={draft.subject.trim() === ''}
            />

            <Area
              label={t(l, '內文(選填)', 'Body (optional)')}
              hint={t(
                l,
                '寫為什麼改,不要寫改了什麼——改了什麼 diff 已經說了。空行分段。',
                'Say why, not what: the diff already says what. Blank lines separate paragraphs.'
              )}
              value={draft.body}
              onChange={(value) => patch({ body: value })}
              rows={6}
            />
            <Row>
              <Btn
                onClick={() => patch({ body: wrapText(draft.body, BODY_WRAP) })}
                disabled={draft.body.trim() === ''}
                title={t(l, `把內文折到 ${BODY_WRAP} 欄`, `Wrap the body at ${BODY_WRAP} columns`)}
              >
                {t(l, `折行到 ${BODY_WRAP} 欄`, `wrap at ${BODY_WRAP}`)}
              </Btn>
              <Check2
                label={t(l, '破壞性變更', 'breaking change')}
                checked={draft.breaking}
                onChange={(checked) => patch({ breaking: checked })}
              />
            </Row>

            {draft.breaking ? (
              <Area
                label={t(l, 'BREAKING CHANGE 說明', 'BREAKING CHANGE description')}
                hint={t(
                  l,
                  '寫原本怎麼用、現在要怎麼改。留空的話只會輸出 `!`,規範允許,但升級的人得自己猜。',
                  'Say what used to work and what to do instead. Left empty, only the `!` is written — valid, but the reader has to guess.'
                )}
                value={draft.breakingDescription}
                onChange={(value) => patch({ breakingDescription: value })}
                rows={3}
              />
            ) : null}

            <div className="inst-field">
              <span className="inst-label">{t(l, 'Footer', 'Footers')}</span>
              {draft.footers.length === 0 ? (
                <p className="inst-hint">
                  {t(
                    l,
                    '名稱用 `-` 代替空白(Reviewed-by),分隔符號是 `: ` 或 ` #`。',
                    'Tokens use `-` in place of spaces (Reviewed-by); the separator is `: ` or ` #`.'
                  )}
                </p>
              ) : null}
              {draft.footers.map((footer, index) => (
                <div key={index} className="inst-toolbar" style={{ alignItems: 'flex-end' }}>
                  <Input
                    label={t(l, '名稱', 'token')}
                    value={footer.token}
                    onChange={(value) => setFooter(index, { token: value })}
                  />
                  <Seg
                    label={t(l, '分隔符號', 'separator')}
                    value={footer.separator}
                    onChange={(value) => setFooter(index, { separator: value })}
                    options={[
                      { value: ': ', label: ':' },
                      { value: ' #', label: '#' },
                    ]}
                  />
                  <Input
                    label={t(l, '值', 'value')}
                    value={footer.value}
                    onChange={(value) => setFooter(index, { value })}
                  />
                  <Btn
                    onClick={() =>
                      patch({ footers: draft.footers.filter((_, i) => i !== index) })
                    }
                    title={t(l, '移除這個 footer', 'Remove this footer')}
                  >
                    {t(l, '移除', 'remove')}
                  </Btn>
                </div>
              ))}
              <div className="inst-toolbar">
                {FOOTER_PRESETS.map((preset) => (
                  <button
                    key={preset.token}
                    type="button"
                    className="inst-btn"
                    onClick={() =>
                      patch({ footers: [...draft.footers, { ...preset, value: '' }] })
                    }
                  >
                    + {preset.token}
                  </button>
                ))}
                <Btn
                  onClick={() =>
                    patch({ footers: [...draft.footers, { token: '', separator: ': ', value: '' }] })
                  }
                >
                  {t(l, '+ 自訂', '+ custom')}
                </Btn>
              </div>
            </div>

            <Row>
              <Btn onClick={() => setDraft(emptyDraft())}>{t(l, '清空表單', 'clear form')}</Btn>
              <Btn onClick={() => setDraft(parseMessage(SAMPLE).draft)}>
                {t(l, '放入範例', 'load sample')}
              </Btn>
            </Row>
          </>
        }
        right={
          <>
            <Row>
              <CopyButton l={l} text={message} />
              <span className="inst-no">
                {t(l, '版本影響', 'version bump')}: <b>{bumpText}</b>
              </span>
            </Row>

            <pre
              className="inst-out inst-wrap"
              style={{ minHeight: '10rem', whiteSpace: 'pre-wrap' }}
              aria-live="polite"
            >
              {message || (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '填好 type 與描述就會出現在這裡。', 'Fill in a type and a description.')}
                </span>
              )}
            </pre>

            <div className="inst-field" aria-live="polite">
              <span className="inst-label">
                {t(l, '檢查', 'Checks')} — {t(l, '錯誤', 'errors')} {count(errors.length)} /{' '}
                {t(l, '提醒', 'warnings')} {count(warnings.length)}
              </span>
              {issues.length === 0 ? (
                <Note>
                  {t(
                    l,
                    `符合 ${SPEC_VERSION},長度也在 git 慣例的範圍內。`,
                    `Conforms to ${SPEC_VERSION}, and within the git length conventions.`
                  )}
                </Note>
              ) : (
                issues.map((issue, index) => (
                  <Note key={`${issue.code}-${index}`} error={issue.severity === 'error'}>
                    {issue.severity === 'error' ? t(l, '[錯誤] ', '[error] ') : t(l, '[提醒] ', '[warn] ')}
                    {fill(t(l, ISSUE_TEXT[issue.code][0], ISSUE_TEXT[issue.code][1]), issue.value)}
                  </Note>
                ))
              )}
            </div>

            <div className="inst-field">
              <span className="inst-label">{t(l, '第一行的欄寬', 'First-line columns')}</span>
              <p className="inst-out inst-wrap" style={{ minHeight: 0 }}>
                {'|'.padEnd(SUBJECT_RECOMMENDED, '-')}
                {'|'.padEnd(SUBJECT_LIMIT - SUBJECT_RECOMMENDED, '-')}
                {'|'}
                {'\n'}
                {stats.header.slice(0, 200)}
              </p>
              <p className="inst-hint">
                {t(
                  l,
                  `上面的刻度是 0 / ${SUBJECT_RECOMMENDED} / ${SUBJECT_LIMIT} 欄。等寬字下對齊,中日韓文字會佔兩格。`,
                  `The ruler marks column 0 / ${SUBJECT_RECOMMENDED} / ${SUBJECT_LIMIT}. Aligned in the monospace face; CJK characters take two cells.`
                )}
              </p>
            </div>
          </>
        }
      />

      <Panel label={t(l, '把既有訊息貼回來', 'READ AN EXISTING MESSAGE BACK')}>
        <Area
          label={t(l, 'Commit 訊息', 'Commit message')}
          hint={t(
            l,
            '貼 git log -1 --format=%B 的輸出,或編輯器裡的 COMMIT_EDITMSG。反解成表單後就能只改要改的欄位。',
            'Paste the output of git log -1 --format=%B, or the COMMIT_EDITMSG buffer. It comes back as the form so you can edit one field.'
          )}
          value={pasted}
          onChange={setPasted}
          rows={8}
        />
        <Row>
          <Btn
            primary
            onClick={() => {
              if (parsed) setDraft(parsed.draft);
            }}
            disabled={parsed === null}
          >
            {t(l, '填進上面的表單', 'load into the form')}
          </Btn>
          <Check2
            label={t(l, '忽略 # 註解行', 'drop # comment lines')}
            checked={dropComments}
            onChange={setDropComments}
          />
          <Btn onClick={() => setPasted('')} disabled={pasted === ''}>
            {t(l, '清空', 'clear')}
          </Btn>
        </Row>

        <div aria-live="polite">
          {parsed === null ? (
            <Note>{t(l, '貼上訊息後,這裡會先說它哪裡不合格式。', 'Paste a message and this reports where it breaks the format.')}</Note>
          ) : (
            <>
              <Note>
                {parsed.conventional
                  ? t(
                      l,
                      `讀成:type=${parsed.draft.type}${parsed.draft.scope ? `, scope=${parsed.draft.scope}` : ''}${parsed.draft.breaking ? t(l, ', 破壞性變更', ', breaking') : ''}, footer ${parsed.draft.footers.length} 個。`,
                      `Read as: type=${parsed.draft.type}${parsed.draft.scope ? `, scope=${parsed.draft.scope}` : ''}${parsed.draft.breaking ? ', breaking' : ''}, ${parsed.draft.footers.length} footer(s).`
                    )
                  : t(l, '不是 Conventional Commit 格式。', 'Not in Conventional Commits form.')}
              </Note>
              {parsed.notes.map((note, index) => (
                <Note key={`${note.code}-${index}`} error={note.code === 'not-conventional'}>
                  {note.line ? t(l, `第 ${note.line} 行:`, `Line ${note.line}: `) : ''}
                  {t(l, NOTE_TEXT[note.code][0], NOTE_TEXT[note.code][1])}
                </Note>
              ))}
              {parsed.draft.body ? (
                <Note>
                  {t(
                    l,
                    '注意:以空行開頭、又長得像 `名稱: 值` 的段落會被讀成 footer。這不是這個工具的偏好,commitlint 與 conventional-changelog 也是這樣分的。',
                    'Note: a paragraph that begins after a blank line and looks like `Token: value` is read as a footer. That is not this tool being opinionated — commitlint and conventional-changelog split it the same way.'
                  )}
                </Note>
              ) : null}
            </>
          )}
        </div>
      </Panel>

      <Panel label={t(l, 'type 對照表', 'TYPE VOCABULARY')}>
        <Table
          head={['type', t(l, '用途', 'meaning'), t(l, '版本影響', 'version bump')]}
          rows={COMMIT_TYPES.map((entry) => [
            <span key="t" className="inst-no">
              {entry.type}
            </span>,
            t(l, entry.zh, entry.en),
            <span key="b" style={{ color: entry.bump === 'none' ? 'var(--fg-faint)' : undefined }}>
              {entry.bump === 'minor' ? 'MINOR' : entry.bump === 'patch' ? 'PATCH' : t(l, '無', 'none')}
            </span>,
          ])}
        />
        <Input
          label={t(l, '自訂 type(逗號或空白分隔)', 'Custom types (comma or space separated)')}
          hint={t(
            l,
            '填進來的 type 就不會再被當成未知。這份清單會過期:規範只定義 feat 與 fix,其餘照你們 repo 的 commitlint 設定為準。',
            'Types listed here stop being flagged as unknown. This table ages: the spec only defines feat and fix, and the rest is whatever your repo’s commitlint config says.'
          )}
          value={extraTypes}
          onChange={setExtraTypes}
          placeholder="deps, release, wip"
        />
        <Note>
          {t(
            l,
            `來源:${TYPES_SOURCE},查核日 ${TYPES_CHECKED}。50 / ${SUBJECT_LIMIT} 欄是 git 的慣例,不是 Conventional Commits 的規定。`,
            `Source: ${TYPES_SOURCE}, checked ${TYPES_CHECKED}. The 50 / ${SUBJECT_LIMIT} column figures are a git convention, not part of Conventional Commits.`
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '第一行欄寬', 'header cols'), v: `${stats.headerWidth} / ${SUBJECT_LIMIT}` },
          { k: t(l, '內文行數', 'body lines'), v: count(stats.bodyLines) },
          { k: t(l, '最長內文行', 'longest line'), v: `${stats.longestBodyLine} / ${BODY_WRAP}` },
          { k: 'footer', v: count(stats.footerCount) },
          { k: t(l, '錯誤', 'errors'), v: count(errors.length) },
          { k: t(l, '訊息大小', 'size'), v: bytes(stats.totalBytes) },
        ]}
      />
    </div>
  );
}
