import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_WRAP,
  COMMIT_TYPES,
  SPEC_VERSION,
  SUBJECT_LIMIT,
  SUBJECT_RECOMMENDED,
  TYPES_CHECKED,
  TYPES_SOURCE,
  buildMessage,
  displayWidth,
  emptyDraft,
  headerOf,
  lintDraft,
  measure,
  parseMessage,
  stripGitComments,
  utf8Bytes,
  wrapText,
  type Draft,
} from './logic.ts';

const draftOf = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });
const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

/* ── constants and data ───────────────────── */

test('the type table covers the commitlint vocabulary and only defines feat/fix bumps', () => {
  const types = COMMIT_TYPES.map((entry) => entry.type);
  assert.deepEqual(
    [...types].sort(),
    ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']
  );
  assert.equal(new Set(types).size, types.length, 'duplicate type in the table');
  assert.equal(COMMIT_TYPES.find((e) => e.type === 'feat')!.bump, 'minor');
  assert.equal(COMMIT_TYPES.find((e) => e.type === 'fix')!.bump, 'patch');
  assert.deepEqual(
    COMMIT_TYPES.filter((e) => e.bump !== 'none').map((e) => e.type),
    ['feat', 'fix'],
    'the spec assigns a version bump to feat and fix only'
  );
  for (const entry of COMMIT_TYPES) {
    assert.equal(entry.type, entry.type.toLowerCase());
    assert.ok(entry.zh.length > 0 && entry.en.length > 0);
  }
});

test('the provenance strings are present and the limits are the git numbers', () => {
  assert.equal(SPEC_VERSION, 'Conventional Commits 1.0.0');
  assert.match(TYPES_SOURCE, /commitlint/);
  assert.match(TYPES_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(SUBJECT_RECOMMENDED, 50);
  assert.equal(SUBJECT_LIMIT, 72);
  assert.equal(BODY_WRAP, 72);
});

test('emptyDraft is empty and not shared between calls', () => {
  const mutated = emptyDraft();
  mutated.footers.push({ token: 'Refs', separator: ' #', value: '1' });
  assert.deepEqual(emptyDraft(), {
    type: '',
    scope: '',
    breaking: false,
    breakingDescription: '',
    subject: '',
    body: '',
    footers: [],
  });
});

/* ── widths ───────────────────────────────── */

test('displayWidth counts CJK as two columns and combining marks as zero', () => {
  assert.equal(displayWidth(''), 0);
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('修正錯誤'), 8);
  assert.equal(displayWidth('fix: 修正錯誤'), 5 + 8);
  assert.equal(displayWidth('ｆｕｌｌ'), 8, 'fullwidth latin is wide');
  assert.equal(displayWidth('e\u0301'), 1, 'e + combining acute is one column');
  assert.equal(displayWidth('\u200b'), 0);
  // A single emoji is wide; the keycap sequence is one wide glyph plus a
  // variation selector that takes no columns of its own.
  assert.equal(displayWidth('\u{1F600}'), 2);
  assert.equal(displayWidth('\u{1F1E6}'), 1, 'regional indicators are not in the wide blocks');
  assert.equal(displayWidth('日本語abc'), 9);
});

test('utf8Bytes matches TextEncoder on ASCII, CJK, emoji and CRLF', () => {
  const encoder = new TextEncoder();
  for (const sample of ['', 'abc', 'é', '中文', '\u{1F600}', 'a\r\nb', '中 a \u{1F9E0}']) {
    assert.equal(utf8Bytes(sample), encoder.encode(sample).length, sample);
  }
  assert.equal(utf8Bytes('中'), 3);
  assert.equal(utf8Bytes('\u{1F600}'), 4);
});

/* ── header ───────────────────────────────── */

test('headerOf assembles type, scope and the breaking marker in spec order', () => {
  assert.equal(headerOf(draftOf({ type: 'feat', subject: 'add lang picker' })), 'feat: add lang picker');
  assert.equal(
    headerOf(draftOf({ type: 'feat', scope: 'api', subject: 'add lang picker' })),
    'feat(api): add lang picker'
  );
  assert.equal(
    headerOf(draftOf({ type: 'feat', scope: 'api', breaking: true, subject: 'drop v1' })),
    'feat(api)!: drop v1'
  );
  assert.equal(
    headerOf(draftOf({ type: 'feat', breaking: true, subject: 'drop v1' })),
    'feat!: drop v1',
    'the marker sits right before the colon when there is no scope'
  );
});

test('headerOf keeps the header to one line and trims the padding', () => {
  assert.equal(
    headerOf(draftOf({ type: '  fix  ', scope: ' api ', subject: '  two\n  lines   here ' })),
    'fix(api): two lines here'
  );
  assert.equal(headerOf(draftOf({ subject: 'no type given' })), 'no type given');
  assert.equal(headerOf(emptyDraft()), '');
});

/* ── build ────────────────────────────────── */

test('buildMessage separates header, body and footers with one blank line each', () => {
  const message = buildMessage(
    draftOf({
      type: 'fix',
      scope: 'parser',
      subject: 'handle CRLF input',
      body: 'Windows checkouts sent \\r\\n and the splitter kept the \\r.',
      footers: [
        { token: 'Refs', separator: ' #', value: '133' },
        { token: 'Reviewed-by', separator: ': ', value: 'Z' },
      ],
    })
  );
  assert.equal(
    message,
    [
      'fix(parser): handle CRLF input',
      '',
      'Windows checkouts sent \\r\\n and the splitter kept the \\r.',
      '',
      'Refs #133',
      'Reviewed-by: Z',
    ].join('\n')
  );
});

test('buildMessage omits absent sections instead of leaving blank lines behind', () => {
  assert.equal(buildMessage(draftOf({ type: 'docs', subject: 'fix a typo' })), 'docs: fix a typo');
  assert.equal(
    buildMessage(draftOf({ type: 'docs', subject: 'x', body: '\n\n  \n' })),
    'docs: x',
    'a body of nothing but blank lines is not a body'
  );
  assert.equal(
    buildMessage(draftOf({ type: 'docs', subject: 'x', footers: [{ token: '  ', separator: ': ', value: 'y' }] })),
    'docs: x',
    'a footer with no token is dropped'
  );
});

test('buildMessage writes BREAKING CHANGE first, and only when it has text', () => {
  assert.equal(
    buildMessage(draftOf({ type: 'feat', subject: 'drop v1', breaking: true })),
    'feat!: drop v1',
    'the marker alone is valid; an empty footer is not written'
  );
  assert.equal(
    buildMessage(
      draftOf({
        type: 'feat',
        subject: 'drop v1',
        breaking: true,
        breakingDescription: '/v1 is gone; move to /v2.',
        footers: [{ token: 'Closes', separator: ' #', value: '9' }],
      })
    ),
    ['feat!: drop v1', '', 'BREAKING CHANGE: /v1 is gone; move to /v2.', 'Closes #9'].join('\n')
  );
});

test('buildMessage normalizes CRLF and keeps blank lines inside a body', () => {
  const message = buildMessage(
    draftOf({ type: 'fix', subject: 'x', body: '\r\nfirst para\r\n\r\nsecond para\r\n' })
  );
  assert.equal(message, 'fix: x\n\nfirst para\n\nsecond para');
});

/* ── parse ────────────────────────────────── */

test('parseMessage reads a full message back into the form', () => {
  const result = parseMessage(
    [
      'feat(api)!: drop the v1 endpoints',
      '',
      'They have been deprecated for two releases.',
      '',
      'BREAKING CHANGE: /v1/* now answers 410.',
      'Refs #133',
      'Reviewed-by: Z',
    ].join('\n')
  );
  assert.equal(result.conventional, true);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.draft, {
    type: 'feat',
    scope: 'api',
    breaking: true,
    breakingDescription: '/v1/* now answers 410.',
    subject: 'drop the v1 endpoints',
    body: 'They have been deprecated for two releases.',
    footers: [
      { token: 'Refs', separator: ' #', value: '133' },
      { token: 'Reviewed-by', separator: ': ', value: 'Z' },
    ],
  });
});

test('a well-formed message survives build(parse(message))', () => {
  const samples = [
    'docs: fix a typo',
    'fix(parser): 處理 CRLF 輸入',
    'feat!: drop node 18',
    ['feat(api)!: drop v1', '', 'Body line one.', '', 'BREAKING CHANGE: gone.', 'Closes #4'].join('\n'),
    ['chore: bump deps', '', 'Signed-off-by: A B'].join('\n'),
    ['fix: x', '', 'para one', '', 'para two', '', 'Refs #1'].join('\n'),
    ['revert: feat(api)!: drop v1', '', 'This reverts commit abc1234.'].join('\n'),
  ];
  for (const sample of samples) {
    assert.equal(buildMessage(parseMessage(sample).draft), sample, sample);
  }
});

test('parseMessage keeps a multi-line footer value with its token', () => {
  const result = parseMessage(
    ['feat: x', '', 'BREAKING CHANGE: the first line', 'and the wrapped continuation', 'Refs #7'].join('\n')
  );
  assert.equal(result.draft.breakingDescription, 'the first line\nand the wrapped continuation');
  assert.deepEqual(result.draft.footers, [{ token: 'Refs', separator: ' #', value: '7' }]);
});

test('parseMessage accepts BREAKING-CHANGE and flags the lowercase spelling', () => {
  const hyphen = parseMessage('feat!: x\n\nBREAKING-CHANGE: gone');
  assert.equal(hyphen.draft.breaking, true);
  assert.equal(hyphen.draft.breakingDescription, 'gone');
  assert.deepEqual(hyphen.notes, []);

  const lower = parseMessage('feat!: x\n\nbreaking change: gone');
  assert.equal(lower.draft.breaking, true);
  assert.deepEqual(codes(lower.notes), ['breaking-footer-case']);
});

test('a footer-only breaking change is reported, because rebuilding adds the !', () => {
  const result = parseMessage('feat: x\n\nBREAKING CHANGE: gone');
  assert.equal(result.draft.breaking, true);
  assert.deepEqual(codes(result.notes), ['breaking-without-bang']);
  assert.equal(buildMessage(result.draft), 'feat!: x\n\nBREAKING CHANGE: gone');
});

test('parseMessage reports a non-conventional header and keeps the text as the subject', () => {
  const result = parseMessage('Update the README\n\nsome body');
  assert.equal(result.conventional, false);
  assert.deepEqual(codes(result.notes), ['not-conventional']);
  assert.equal(result.draft.type, '');
  assert.equal(result.draft.subject, 'Update the README');
  assert.equal(result.draft.body, 'some body');
});

test('parseMessage reports the malformed separators rather than silently fixing them', () => {
  assert.deepEqual(codes(parseMessage('feat:no space').notes), ['no-space-after-colon']);
  assert.deepEqual(codes(parseMessage('feat(): empty scope').notes), ['scope-empty-parens']);
  assert.deepEqual(codes(parseMessage('feat:! wrong side').notes), [
    'no-space-after-colon',
    'bang-after-colon',
  ]);
  assert.deepEqual(codes(parseMessage('fix: x\nbody with no blank line').notes), [
    'no-blank-after-header',
  ]);
});

test('parseMessage does not mistake a mid-paragraph colon for a footer', () => {
  const result = parseMessage(
    ['fix: x', '', 'The cause was this: the splitter kept the \\r.', 'Second line of the paragraph.'].join('\n')
  );
  assert.deepEqual(result.draft.footers, []);
  assert.equal(result.draft.body, 'The cause was this: the splitter kept the \\r.\nSecond line of the paragraph.');
});

test('parseMessage handles empty, whitespace, CRLF and Unicode input without throwing', () => {
  const empty = parseMessage('');
  assert.equal(empty.conventional, false);
  assert.equal(empty.draft.subject, '');
  assert.deepEqual(empty.draft.footers, []);

  assert.equal(parseMessage('   \n\n  ').draft.subject, '');

  const crlf = parseMessage('fix(語系)!: 修正 CRLF\r\n\r\n內文一行\r\n\r\nBREAKING CHANGE: 介面換了\r\n');
  assert.equal(crlf.draft.scope, '語系');
  assert.equal(crlf.draft.subject, '修正 CRLF');
  assert.equal(crlf.draft.body, '內文一行');
  assert.equal(crlf.draft.breakingDescription, '介面換了');

  const emoji = parseMessage('feat: 加上 \u{1F9E0} 圖示');
  assert.equal(emoji.draft.subject, '加上 \u{1F9E0} 圖示');
});

test('parseMessage tolerates extra blank lines between the header and the body', () => {
  const result = parseMessage('fix: x\n\n\n\nbody here\n\n\nRefs #2\n\n');
  assert.equal(result.draft.body, 'body here');
  assert.deepEqual(result.draft.footers, [{ token: 'Refs', separator: ' #', value: '2' }]);
  assert.deepEqual(result.notes, []);
});

/* ── git comments ─────────────────────────── */

test('stripGitComments removes the template and everything past the scissors', () => {
  const raw = [
    'fix: something',
    '',
    'Body kept.',
    '# Please enter the commit message for your changes.',
    '# On branch main',
    '# ------------------------ >8 ------------------------',
    'diff --git a/x b/x',
    '+kept out',
  ].join('\n');
  assert.equal(stripGitComments(raw), 'fix: something\n\nBody kept.');
  assert.equal(stripGitComments('fix: x'), 'fix: x');
  assert.equal(stripGitComments(''), '');
  assert.equal(
    stripGitComments('fix: x\n\nsee #12 for context'),
    'fix: x\n\nsee #12 for context',
    'a # that is not at the start of a line is not a comment'
  );
});

/* ── lint ─────────────────────────────────── */

test('lintDraft errors on the things that break the spec', () => {
  assert.deepEqual(codes(lintDraft(emptyDraft())), ['type-empty', 'subject-empty']);
  assert.ok(codes(lintDraft(draftOf({ type: 'feat', scope: 'a(b', subject: 'x' }))).includes('scope-parens'));
  assert.ok(
    codes(
      lintDraft(draftOf({ type: 'feat', subject: 'x', footers: [{ token: 'Reviewed by', separator: ': ', value: 'Z' }] }))
    ).includes('footer-token-space')
  );
  const issues = lintDraft(draftOf({ subject: '' }));
  assert.ok(issues.every((issue) => issue.severity === 'error'));
});

test('lintDraft warns on the git conventions without calling them errors', () => {
  const issues = lintDraft(draftOf({ type: 'Feature', scope: 'My Api', subject: 'Added the thing.' }));
  const found = codes(issues);
  assert.ok(found.includes('type-uppercase'));
  assert.ok(found.includes('type-unknown'));
  assert.ok(found.includes('scope-space'));
  assert.ok(found.includes('scope-uppercase'));
  assert.ok(found.includes('subject-period'));
  assert.ok(found.includes('subject-capitalized'));
  assert.ok(issues.every((issue) => issue.severity === 'warn'));
});

test('lintDraft leaves an all-caps opening alone', () => {
  assert.ok(!codes(lintDraft(draftOf({ type: 'fix', subject: 'HTTP 415 on empty body' }))).includes('subject-capitalized'));
  assert.ok(codes(lintDraft(draftOf({ type: 'fix', subject: 'Http 415' }))).includes('subject-capitalized'));
});

test('lintDraft measures the header at 50 and 72 columns, counting CJK as two', () => {
  const at = (subject: string) => lintDraft(draftOf({ type: 'fix', subject }));
  // 'fix: ' is 5 columns, so 45 ASCII characters lands exactly on 50.
  assert.deepEqual(codes(at('a'.repeat(45))), []);
  assert.deepEqual(codes(at('a'.repeat(46))), ['subject-long']);
  assert.equal(at('a'.repeat(46))[0].value, 51);
  assert.deepEqual(codes(at('a'.repeat(67))), ['subject-long']);
  assert.deepEqual(codes(at('a'.repeat(68))), ['subject-over-limit']);
  // 23 Chinese characters are 46 columns; with 'fix: ' that is 51.
  assert.deepEqual(codes(at('中'.repeat(23))), ['subject-long']);
  assert.equal(at('中'.repeat(23))[0].value, 51);
  assert.deepEqual(codes(at('中'.repeat(22))), [], '22 Chinese characters still fit in 50 columns');
});

test('lintDraft accepts extra types the caller registers', () => {
  const draft = draftOf({ type: 'deps', subject: 'bump lockfile' });
  assert.ok(codes(lintDraft(draft)).includes('type-unknown'));
  assert.deepEqual(codes(lintDraft(draft, ['deps', 'feat'])), []);
  assert.deepEqual(codes(lintDraft(draftOf({ type: 'DEPS', subject: 'x' }), ['deps'])), ['type-uppercase']);
});

test('lintDraft warns about a bare marker and an empty footer value', () => {
  assert.deepEqual(
    codes(lintDraft(draftOf({ type: 'feat', subject: 'x', breaking: true }))),
    ['breaking-no-description']
  );
  assert.deepEqual(
    codes(
      lintDraft(draftOf({ type: 'feat', subject: 'x', breaking: true, breakingDescription: 'gone' }))
    ),
    []
  );
  assert.deepEqual(
    codes(lintDraft(draftOf({ type: 'feat', subject: 'x', footers: [{ token: 'Refs', separator: ' #', value: ' ' }] }))),
    ['footer-value-empty']
  );
});

test('lintDraft counts body lines past the 72-column wrap', () => {
  const draft = draftOf({ type: 'fix', subject: 'x', body: `${'a'.repeat(73)}\nshort\n${'中'.repeat(40)}` });
  const issue = lintDraft(draft).find((entry) => entry.code === 'body-wrap');
  assert.equal(issue?.value, 2);
  assert.equal(codes(lintDraft(draftOf({ type: 'fix', subject: 'x', body: 'short' }))).length, 0);
});

/* ── measure ──────────────────────────────── */

test('measure reports widths, counts and the implied version bump', () => {
  const m = measure(
    draftOf({
      type: 'feat',
      scope: 'api',
      subject: '加上匯出',
      body: 'one\nlonger line here',
      footers: [{ token: 'Refs', separator: ' #', value: '1' }],
    })
  );
  assert.equal(m.header, 'feat(api): 加上匯出');
  assert.equal(m.headerWidth, 11 + 8);
  assert.equal(m.headerChars, 15);
  assert.equal(m.subjectWidth, 8);
  assert.equal(m.bodyLines, 2);
  assert.equal(m.longestBodyLine, 16);
  assert.equal(m.footerCount, 1);
  assert.equal(m.bump, 'minor');
  assert.equal(m.totalBytes, utf8Bytes(buildMessage(draftOf({
    type: 'feat',
    scope: 'api',
    subject: '加上匯出',
    body: 'one\nlonger line here',
    footers: [{ token: 'Refs', separator: ' #', value: '1' }],
  }))));
});

test('measure follows the spec on which bump each commit implies', () => {
  assert.equal(measure(draftOf({ type: 'fix', subject: 'x' })).bump, 'patch');
  assert.equal(measure(draftOf({ type: 'feat', subject: 'x' })).bump, 'minor');
  assert.equal(measure(draftOf({ type: 'docs', subject: 'x' })).bump, null);
  assert.equal(measure(draftOf({ type: 'docs', subject: 'x', breaking: true })).bump, 'major');
  assert.equal(measure(draftOf({ type: 'fix', subject: 'x', breaking: true })).bump, 'major');
  assert.equal(measure(emptyDraft()).bodyLines, 0);
  assert.equal(measure(emptyDraft()).footerCount, 0);
});

test('measure counts a breaking footer among the footers', () => {
  const m = measure(draftOf({ type: 'feat', subject: 'x', breaking: true, breakingDescription: 'gone' }));
  assert.equal(m.footerCount, 1);
  assert.equal(measure(draftOf({ type: 'feat', subject: 'x', breaking: true })).footerCount, 0);
});

/* ── wrap ─────────────────────────────────── */

test('wrapText breaks Latin text at spaces and keeps every word whole', () => {
  const text = 'the quick brown fox jumps over the lazy dog again and again and again';
  const wrapped = wrapText(text, 20);
  for (const line of wrapped.split('\n')) assert.ok(displayWidth(line) <= 20, line);
  assert.equal(wrapped.split('\n').join(' '), text, 'no word was lost or cut');
});

test('wrapText breaks CJK between characters without inserting spaces', () => {
  const text = '這是一段很長的中文說明文字,需要在七十二欄的位置折行。';
  const wrapped = wrapText(text, 12);
  for (const line of wrapped.split('\n')) assert.ok(displayWidth(line) <= 12, line);
  assert.equal(wrapped.replace(/\n/g, ''), text);
});

test('wrapText leaves short lines, blank lines and indents alone', () => {
  assert.equal(wrapText('short line', 72), 'short line');
  assert.equal(wrapText('a\n\nb', 72), 'a\n\nb');
  assert.equal(wrapText('', 72), '');
  const wrapped = wrapText(`  ${'word '.repeat(10).trim()}`, 24);
  for (const line of wrapped.split('\n')) assert.ok(line.startsWith('  '), `indent lost: ${line}`);
});

test('wrapText overflows rather than cutting a token with no break point', () => {
  const url = 'https://example.com/a/very/long/path/that/cannot/be/broken/anywhere';
  assert.equal(wrapText(url, 20), url);
  assert.equal(wrapText(`see ${url} ok`, 20), `see\n${url}\nok`);
});

test('wrapText keeps an emoji ZWJ sequence together and normalizes CRLF', () => {
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  const wrapped = wrapText(`aaaaaaaa ${family} bbbb`, 9);
  assert.ok(wrapped.includes(family), 'the joined sequence was split');
  assert.equal(wrapText('a\r\nb', 72), 'a\nb');
  assert.equal(wrapText('x', 1), 'x', 'a silly column count does not produce garbage');
});
