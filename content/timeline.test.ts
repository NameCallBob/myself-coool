import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline,
  concurrentAt,
  endOf,
  packRows,
  peakConcurrency,
  startOf,
  timeExtent,
} from './timeline.ts';
import { PROJECT_PERIODS, REWORK_PERIODS } from './periods.ts';

const NOW = Date.UTC(2026, 8, 26);
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);

test('a partial date covers everything it could mean, not its first instant', () => {
  // The bug this pins: treating '2024' as 2024-01-01 draws a year of work as
  // a one-day bar.
  assert.equal(iso(startOf('2024')), '2024-01-01');
  assert.equal(iso(endOf('2024')), '2024-12-31');
  assert.equal(iso(startOf('2024-06')), '2024-06-01');
  assert.equal(iso(endOf('2024-06')), '2024-06-30');
  assert.equal(iso(startOf('2026-07-10')), '2026-07-10');
  assert.equal(iso(endOf('2026-07-10')), '2026-07-10');
});

test('February knows about leap years', () => {
  assert.equal(iso(endOf('2024-02')), '2024-02-29');
  assert.equal(iso(endOf('2025-02')), '2025-02-28');
  assert.equal(iso(endOf('2000-02')), '2000-02-29');
  assert.equal(iso(endOf('1900-02')), '1900-02-28');
});

test('every span has a source and an end at or after its start', () => {
  for (const span of buildTimeline(NOW)) {
    assert.ok(span.source.length > 0, `${span.id} has no source`);
    assert.ok(span.end >= span.start, `${span.id} ends before it starts`);
    assert.ok(span.label.zh && span.label.en, `${span.id} is missing a label`);
  }
});

test('the periods table only names projects that exist', async () => {
  const { PROJECTS } = await import('./projects.ts');
  const slugs = new Set(PROJECTS.map((project) => project.slug));
  for (const slug of [...Object.keys(PROJECT_PERIODS), ...Object.keys(REWORK_PERIODS)]) {
    assert.ok(slugs.has(slug), `periods.ts names ${slug}, which is not a project`);
  }
});

test('a rework span never starts before the work it reworks', () => {
  for (const [slug, rework] of Object.entries(REWORK_PERIODS)) {
    const original = PROJECT_PERIODS[slug];
    if (!original) continue;
    assert.ok(
      startOf(rework.start) >= startOf(original.start),
      `${slug}: the rework starts before the original`
    );
  }
});

test('an ongoing span runs to now and no further', () => {
  const spans = buildTimeline(NOW);
  for (const span of spans.filter((entry) => entry.ongoing)) {
    assert.equal(span.end, NOW, `${span.id} does not end at now`);
  }
});

test('the open-left span is the one with no recorded start', () => {
  const spans = buildTimeline(NOW);
  const open = spans.filter((span) => span.openStart);
  assert.equal(open.length, 1);
  assert.equal(open[0].start, Number.NEGATIVE_INFINITY);
  // And it must not poison the drawable extent.
  const extent = timeExtent(spans);
  assert.ok(Number.isFinite(extent.from) && Number.isFinite(extent.to));
});

test('concurrency counts what actually overlaps the instant', () => {
  const spans = buildTimeline(NOW);
  const at = Date.UTC(2026, 6, 12); // inside the six-day build
  const running = concurrentAt(spans, at);
  assert.ok(running.some((span) => span.id.endsWith('field-sales-pwa')));
  for (const span of running) {
    assert.ok(at >= span.start && at <= span.end);
  }
  // Before anything started, nothing is running except the open-left bar.
  const early = concurrentAt(spans, Date.UTC(2019, 0, 1));
  assert.deepEqual(early.map((span) => span.openStart), early.map(() => true));
});

test('the peak is a real instant with that many spans over it', () => {
  const spans = buildTimeline(NOW);
  const peak = peakConcurrency(spans);
  assert.equal(concurrentAt(spans, peak.at).length, peak.count);
  assert.ok(peak.count > 1);
});

test('packing never puts two overlapping spans in one row', () => {
  const spans = buildTimeline(NOW);
  for (const row of packRows(spans, 0)) {
    for (let i = 1; i < row.length; i += 1) {
      assert.ok(row[i].start > row[i - 1].end, 'two spans overlap inside a row');
    }
  }
});
