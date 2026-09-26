import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CRITERIA,
  MAX_ITEMS,
  MAX_OPTIONS,
  SCALES,
  TEMPLATES,
  buildOptions,
  checklistToMarkdown,
  flipWeights,
  formatCriteria,
  formatOptions,
  margin,
  matrixToMarkdown,
  normalisedWeights,
  parseChecklist,
  parseCriteria,
  parseOptionLabels,
  progressOf,
  pruneScores,
  ranking,
  sortSaved,
  templateToChecklist,
  weightedScore,
  type Criterion,
  type Item,
  type Saved,
  type ScoreTable,
} from './logic.ts';

const id = (index: number) => `i${index}`;

const item = (text: string, done = false, required = false): Item => ({
  id: text,
  text,
  done,
  required,
});

const near = (actual: number | null, expected: number, tolerance = 1e-9, message?: string) => {
  assert.notEqual(actual, null, message);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`
  );
};

/* ── Progress ─────────────────────────────── */

test('progress counts items and required items separately', () => {
  const items = [item('a', true), item('b', false, true), item('c', true, true)];
  assert.deepEqual(progressOf(items), {
    total: 3,
    done: 2,
    required: 2,
    requiredDone: 1,
    fraction: 2 / 3,
    ready: false,
  });
});

test('with required items marked, only those decide readiness', () => {
  const items = [item('a', false), item('b', true, true)];
  const progress = progressOf(items);
  assert.equal(progress.ready, true, 'the required item is done, so it is ready');
  assert.equal(progress.done, 1);
  assert.equal(progress.fraction, 0.5);
});

test('with nothing marked required, everything has to be ticked', () => {
  assert.equal(progressOf([item('a', true), item('b', false)]).ready, false);
  assert.equal(progressOf([item('a', true), item('b', true)]).ready, true);
});

test('an empty list is never ready', () => {
  assert.deepEqual(progressOf([]), {
    total: 0,
    done: 0,
    required: 0,
    requiredDone: 0,
    fraction: 0,
    ready: false,
  });
});

/* ── Checklist text ───────────────────────── */

test('a Markdown task list parses, including the required tag', () => {
  const list = parseChecklist(
    ['# Release', '', '- [x] built(必要)', '- [ ] tested (required)', '- [ ] plain', 'not an item'].join('\n'),
    id
  );
  assert.equal(list.title, 'Release');
  assert.deepEqual(
    list.items.map((entry) => [entry.text, entry.done, entry.required]),
    [
      ['built', true, true],
      ['tested', false, true],
      ['plain', false, false],
    ]
  );
});

test('a checklist round-trips through Markdown', () => {
  const list = {
    title: '上線前',
    items: [item('先跑測試', true, true), item('看一下手機版', false)],
  };
  const parsed = parseChecklist(checklistToMarkdown(list, 'zh'), id);
  assert.equal(parsed.title, list.title);
  assert.deepEqual(
    parsed.items.map((entry) => [entry.text, entry.done, entry.required]),
    [
      ['先跑測試', true, true],
      ['看一下手機版', false, false],
    ]
  );
});

test('the English export tags read back too', () => {
  const list = { title: 'Ship', items: [item('rollback tried', false, true)] };
  const parsed = parseChecklist(checklistToMarkdown(list, 'en'), id);
  assert.equal(parsed.items[0].required, true);
  assert.equal(parsed.items[0].text, 'rollback tried');
});

test('X, x and a blank all read correctly', () => {
  const list = parseChecklist(['- [X] a', '- [x] b', '- [ ] c', '* [x] d'].join('\n'), id);
  assert.deepEqual(list.items.map((entry) => entry.done), [true, true, false, true]);
});

test('parsing is capped and tolerates rubbish', () => {
  assert.deepEqual(parseChecklist('', id), { title: '', items: [] });
  assert.deepEqual(parseChecklist('just prose\nmore prose', id), { title: '', items: [] });
  const many = Array.from({ length: MAX_ITEMS + 20 }, () => '- [ ] x').join('\n');
  assert.equal(parseChecklist(many, id).items.length, MAX_ITEMS);
});

test('the exported Markdown ends with a count', () => {
  const text = checklistToMarkdown({ title: 'T', items: [item('a', true), item('b')] }, 'en');
  assert.match(text, /^# T$/m);
  assert.match(text, /^- \[x\] a$/m);
  assert.match(text, /^- \[ \] b$/m);
  assert.match(text, /1 \/ 2$/);
});

/* ── Templates ────────────────────────────── */

test('every template converts to an unticked checklist in both languages', () => {
  for (const template of TEMPLATES) {
    for (const locale of ['zh', 'en'] as const) {
      const list = templateToChecklist(template, locale, id);
      assert.equal(list.title, locale === 'en' ? template.title.en : template.title.zh);
      assert.equal(list.items.length, template.items.length);
      assert.equal(list.items.every((entry) => !entry.done), true);
      assert.equal(new Set(list.items.map((entry) => entry.id)).size, list.items.length);
      for (const entry of list.items) assert.notEqual(entry.text, '');
    }
  }
});

test('the templates have distinct ids and the release one has blockers', () => {
  assert.equal(new Set(TEMPLATES.map((entry) => entry.id)).size, TEMPLATES.length);
  const release = TEMPLATES.find((entry) => entry.id === 'release')!;
  assert.ok(release.items.some((entry) => entry.required));
  assert.equal(TEMPLATES.find((entry) => entry.id === 'blank')!.items.length, 0);
});

/* ── Criteria and options ─────────────────── */

test('criteria parse with weights, defaulting to one', () => {
  const criteria = parseCriteria(['# note', 'cost:3', 'speed:1.5', 'fun', 'broken:abc', ''].join('\n'));
  assert.deepEqual(
    criteria.map((entry) => [entry.label, entry.weight]),
    [
      ['cost', 3],
      ['speed', 1.5],
      ['fun', 1],
      ['broken', 1],
    ]
  );
});

test('a repeated label is disambiguated so its scores cannot collide', () => {
  const criteria = parseCriteria(['cost:1', 'cost:2'].join('\n'));
  assert.deepEqual(criteria.map((entry) => entry.id), ['cost', 'cost (2)']);
  assert.deepEqual(parseOptionLabels('a\na\na'), ['a', 'a (2)', 'a (3)']);
});

test('a negative weight is treated as one, not as a negative', () => {
  assert.equal(parseCriteria('cost:-5')[0].weight, 1);
});

test('criteria and options round-trip through their text forms', () => {
  const criteria = parseCriteria('cost:3\nspeed:1');
  assert.deepEqual(parseCriteria(formatCriteria(criteria)), criteria);
  const labels = parseOptionLabels('A\nB');
  assert.deepEqual(parseOptionLabels(formatOptions(buildOptions(labels, {}))), labels);
});

test('parsing is capped on both axes', () => {
  const criteria = parseCriteria(Array.from({ length: MAX_CRITERIA + 5 }, (_, i) => `c${i}:1`).join('\n'));
  assert.equal(criteria.length, MAX_CRITERIA);
  const labels = parseOptionLabels(Array.from({ length: MAX_OPTIONS + 5 }, (_, i) => `o${i}`).join('\n'));
  assert.equal(labels.length, MAX_OPTIONS);
});

/* ── Weights ──────────────────────────────── */

test('weights normalise to fractions of their total', () => {
  const weights = normalisedWeights(parseCriteria('a:3\nb:1'))!;
  near(weights.a, 0.75);
  near(weights.b, 0.25);
  assert.equal(normalisedWeights([]), null);
  assert.equal(normalisedWeights(parseCriteria('a:0\nb:0')), null);
});

/* ── Weighted score, hand-computed ────────── */

const criteria3: Criterion[] = [
  { id: 'cost', label: 'cost', weight: 3 },
  { id: 'speed', label: 'speed', weight: 1 },
];

test('a weighted score is the weighted mean divided by the scale', () => {
  // (3×4 + 1×2) / ((3+1) × 5) = 14 / 20 = 0.7.
  const option = { id: 'A', label: 'A', scores: { cost: 4, speed: 2 } };
  near(weightedScore(option, criteria3, 5), 0.7);
  // A perfect score is exactly 1, a zero exactly 0.
  near(weightedScore({ id: 'B', label: 'B', scores: { cost: 5, speed: 5 } }, criteria3, 5), 1);
  near(weightedScore({ id: 'C', label: 'C', scores: { cost: 0, speed: 0 } }, criteria3, 5), 0);
});

test('the score does not move when a zero-weight criterion is added', () => {
  const option = { id: 'A', label: 'A', scores: { cost: 4, speed: 2 } };
  const withExtra = [...criteria3, { id: 'extra', label: 'extra', weight: 0 }];
  assert.equal(weightedScore(option, criteria3, 5), weightedScore(option, withExtra, 5));
});

test('switching scale leaves an equivalent set of scores at the same result', () => {
  const onFive = { id: 'A', label: 'A', scores: { cost: 4, speed: 2 } };
  const onTen = { id: 'A', label: 'A', scores: { cost: 8, speed: 4 } };
  near(weightedScore(onFive, criteria3, 5), weightedScore(onTen, criteria3, 10)!);
});

test('a missing score counts as zero, and an out-of-range one is clamped', () => {
  near(weightedScore({ id: 'A', label: 'A', scores: { cost: 5 } }, criteria3, 5), 0.75);
  near(weightedScore({ id: 'A', label: 'A', scores: { cost: 99, speed: 5 } }, criteria3, 5), 1);
  near(weightedScore({ id: 'A', label: 'A', scores: { cost: -5, speed: 0 } }, criteria3, 5), 0);
});

test('an unusable scale or an empty criteria list gives null, not NaN', () => {
  const option = { id: 'A', label: 'A', scores: { cost: 4 } };
  assert.equal(weightedScore(option, criteria3, 0), null);
  assert.equal(weightedScore(option, criteria3, Number.NaN), null);
  assert.equal(weightedScore(option, [], 5), null);
  assert.equal(weightedScore(option, [{ id: 'x', label: 'x', weight: 0 }], 5), null);
});

/* ── Ranking ──────────────────────────────── */

const options3 = [
  { id: 'A', label: 'A', scores: { cost: 5, speed: 1 } },
  { id: 'B', label: 'B', scores: { cost: 3, speed: 5 } },
  { id: 'C', label: 'C', scores: { cost: 1, speed: 1 } },
];

test('ranking sorts by score and reports how far behind each option is', () => {
  const order = ranking(options3, criteria3, 5);
  // A: (15+1)/20 = 0.8, B: (9+5)/20 = 0.7, C: (3+1)/20 = 0.2.
  assert.deepEqual(order.map((entry) => entry.option.id), ['A', 'B', 'C']);
  near(order[0].score, 0.8);
  near(order[1].score, 0.7);
  near(order[2].score, 0.2);
  assert.deepEqual(order.map((entry) => entry.rank), [1, 2, 3]);
  near(order[1].behind, 0.1);
  near(order[0].behind, 0);
});

test('equal scores share a rank and the next rank skips', () => {
  const tied = [
    { id: 'A', label: 'A', scores: { cost: 4, speed: 4 } },
    { id: 'B', label: 'B', scores: { cost: 4, speed: 4 } },
    { id: 'C', label: 'C', scores: { cost: 1, speed: 1 } },
  ];
  assert.deepEqual(ranking(tied, criteria3, 5).map((entry) => entry.rank), [1, 1, 3]);
});

test('ranking an empty set, and a single option', () => {
  assert.deepEqual(ranking([], criteria3, 5), []);
  const single = ranking([options3[0]], criteria3, 5);
  assert.equal(single.length, 1);
  assert.equal(single[0].rank, 1);
  assert.equal(single[0].behind, 0);
});

/* ── Margin ───────────────────────────────── */

test('margin is the lead as a fraction of the leader', () => {
  const order = ranking(options3, criteria3, 5);
  near(margin(order), (0.8 - 0.7) / 0.8);
  assert.equal(margin(ranking([options3[0]], criteria3, 5)), null, 'nothing to compare against');
  assert.equal(margin([]), null);
  const zeroes = ranking(
    [
      { id: 'A', label: 'A', scores: {} },
      { id: 'B', label: 'B', scores: {} },
    ],
    criteria3,
    5
  );
  assert.equal(margin(zeroes), null, 'no margin when the leader scored nothing');
});

/* ── Sensitivity ──────────────────────────── */

test('the flip weight makes the top two tie, and is verified by recomputing', () => {
  const flips = flipWeights(options3, criteria3, 5);
  assert.ok(flips.length > 0);
  for (const flip of flips) {
    const adjusted = criteria3.map((entry) =>
      entry.id === flip.criterionId ? { ...entry, weight: flip.needed } : entry
    );
    const order = ranking(options3, adjusted, 5);
    near(order[0].score, order[1].score, 1e-9, `${flip.criterionId} should tie at ${flip.needed}`);
  }
});

test('the flip weight for the worked example is the hand-computed one', () => {
  // Leader A minus runner-up B: cost +2, speed −4. With w_cost = 3 and w_speed
  // as x, the tie is at 3×2 + x×(−4) = 0, so x = 1.5.
  const flips = flipWeights(options3, criteria3, 5);
  const speed = flips.find((flip) => flip.criterionId === 'speed')!;
  near(speed.needed, 1.5);
  near(speed.current, 1);
  near(speed.ratio, 1.5);
  // And on cost: x×2 + 1×(−4) = 0, so x = 2.
  const cost = flips.find((flip) => flip.criterionId === 'cost')!;
  near(cost.needed, 2);
});

test('flips are ordered with the smallest change first', () => {
  const flips = flipWeights(options3, criteria3, 5);
  for (let i = 1; i < flips.length; i += 1) {
    const before = Math.abs(flips[i - 1].needed - flips[i - 1].current);
    const after = Math.abs(flips[i].needed - flips[i].current);
    assert.ok(before <= after);
  }
});

test('a criterion the two leaders score identically on is left out', () => {
  const criteria = [
    { id: 'same', label: 'same', weight: 1 },
    { id: 'different', label: 'different', weight: 1 },
  ];
  const options = [
    { id: 'A', label: 'A', scores: { same: 3, different: 5 } },
    { id: 'B', label: 'B', scores: { same: 3, different: 1 } },
  ];
  const flips = flipWeights(options, criteria, 5);
  assert.deepEqual(flips.map((flip) => flip.criterionId), ['different']);
});

test('no flip is reported when the leader wins on every criterion', () => {
  const options = [
    { id: 'A', label: 'A', scores: { cost: 5, speed: 5 } },
    { id: 'B', label: 'B', scores: { cost: 1, speed: 1 } },
  ];
  // Every difference is positive, so no non-negative weight ties them.
  assert.deepEqual(flipWeights(options, criteria3, 5), []);
});

test('sensitivity needs two options', () => {
  assert.deepEqual(flipWeights([], criteria3, 5), []);
  assert.deepEqual(flipWeights([options3[0]], criteria3, 5), []);
});

test('a zero-weight criterion that could decide it reports an infinite ratio', () => {
  const criteria = [
    { id: 'a', label: 'a', weight: 1 },
    { id: 'b', label: 'b', weight: 0 },
  ];
  const options = [
    { id: 'A', label: 'A', scores: { a: 5, b: 0 } },
    { id: 'B', label: 'B', scores: { a: 3, b: 5 } },
  ];
  const flips = flipWeights(options, criteria, 5);
  const b = flips.find((flip) => flip.criterionId === 'b')!;
  assert.equal(b.current, 0);
  assert.equal(b.ratio, Number.POSITIVE_INFINITY);
  near(b.needed, 0.4, 1e-9, '1×2 + x×(−5) = 0');
});

/* ── Score table housekeeping ─────────────── */

test('buildOptions attaches the stored score row to each label', () => {
  const scores: ScoreTable = { A: { cost: 4 }, B: { cost: 1, speed: 5 } };
  const built = buildOptions(['A', 'B', 'C'], scores);
  assert.deepEqual(built.map((entry) => entry.id), ['A', 'B', 'C']);
  assert.deepEqual(built[0].scores, { cost: 4 });
  assert.deepEqual(built[2].scores, {}, 'a new option starts empty');
});

test('scores survive reordering, because they are keyed by label', () => {
  const scores: ScoreTable = { A: { cost: 4 }, B: { cost: 1 } };
  const reordered = buildOptions(['B', 'A'], scores);
  assert.deepEqual(reordered[0].scores, { cost: 1 });
  assert.deepEqual(reordered[1].scores, { cost: 4 });
});

test('pruning drops rows and columns that no longer exist', () => {
  const scores: ScoreTable = {
    A: { cost: 4, gone: 2 },
    Removed: { cost: 1 },
    Empty: { gone: 3 },
  };
  const pruned = pruneScores(scores, ['A', 'Empty'], criteria3);
  assert.deepEqual(pruned, { A: { cost: 4 } });
});

test('pruning drops values that are not numbers', () => {
  const scores = { A: { cost: Number.NaN, speed: 3 } } as ScoreTable;
  assert.deepEqual(pruneScores(scores, ['A'], criteria3), { A: { speed: 3 } });
});

/* ── Markdown export ──────────────────────── */

test('the matrix exports as a GFM table with weights and scores', () => {
  const text = matrixToMarkdown(options3, criteria3, 5, 'en');
  const lines = text.split('\n');
  assert.match(lines[0], /^\| Option \| cost \(3, 75%\) \| speed \(1, 25%\) \| Score \|$/);
  assert.match(lines[1], /^\| :--- \| ---: \| ---: \| ---: \|$/);
  // Rows come out in rank order, best first.
  assert.match(lines[2], /^\| A \| 5 \| 1 \| 80\.0% \|$/);
  assert.match(lines[3], /^\| B \| 3 \| 5 \| 70\.0% \|$/);
  assert.match(text, /Scale 1–5/);
});

test('a missing score shows as a dash rather than a zero', () => {
  const text = matrixToMarkdown(
    [{ id: 'A', label: 'A', scores: { cost: 4 } }],
    criteria3,
    5,
    'en'
  );
  assert.match(text, /\| A \| 4 \| — \|/);
});

test('the Chinese export uses Chinese headers', () => {
  const text = matrixToMarkdown(options3, criteria3, 5, 'zh');
  assert.match(text, /\| 選項 \|/);
  assert.match(text, /加權分數/);
  assert.match(text, /評分尺度 1–5/);
});

test('exporting with no options still produces a valid table header', () => {
  const text = matrixToMarkdown([], criteria3, 5, 'en');
  assert.equal(text.split('\n').filter((line) => line.startsWith('|')).length, 2);
});

/* ── Saved documents ──────────────────────── */

test('saved documents sort newest first', () => {
  const saved = (name: string, updated: number): Saved => ({
    id: name,
    name,
    updated,
    checklist: { title: '', items: [] },
    criteriaText: '',
    optionsText: '',
    scale: 5,
    scores: {},
  });
  assert.deepEqual(
    sortSaved([saved('a', 1), saved('b', 3), saved('c', 2)]).map((entry) => entry.name),
    ['b', 'c', 'a']
  );
  assert.deepEqual(sortSaved([]), []);
});

test('the offered scales are the sensible ones', () => {
  assert.deepEqual(SCALES, [5, 10, 100]);
});
