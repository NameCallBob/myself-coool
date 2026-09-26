import { PROJECTS } from './projects.ts';
import { buildTimeline, concurrentAt, ongoingAt, peakConcurrency, timeExtent } from './timeline.ts';
import { DAY } from './units.ts';

/**
 * The numbers on the home page, derived rather than typed.
 *
 * A figure someone typed goes stale the moment the content changes and
 * nobody notices, because nothing fails. These are computed from the same
 * spans the chart draws, so the page cannot disagree with its own chart.
 */

export type Figure = {
  value: string;
  label: { zh: string; en: string };
  note: { zh: string; en: string };
};

export function figuresFor(now: number): Figure[] {
  const spans = buildTimeline(now);
  const peak = peakConcurrency(spans);
  const running = ongoingAt(spans, now);
  const extent = timeExtent(spans);

  const shortest = spans
    .filter((span) => span.precision === 'day')
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  const shortestDays = shortest ? Math.round((shortest.end - shortest.start) / DAY) : 0;

  const live = PROJECTS.filter((project) => /營運中|production|部署/.test(project.scope.zh + project.scope.en));
  void concurrentAt;
  const years = Math.max(1, Math.round((extent.to - extent.from) / (DAY * 365.25)));

  return [
    {
      value: String(peak.count),
      label: { zh: '同時在跑的尖峰', en: 'running at once, peak' },
      note: {
        zh: `${new Date(peak.at).toISOString().slice(0, 10)} 這一天`,
        en: `on ${new Date(peak.at).toISOString().slice(0, 10)}`,
      },
    },
    {
      value: String(running.length),
      label: { zh: '此刻仍在維護', en: 'still maintained' },
      note: {
        zh: '含學業與工作;其餘系統在營運中但已無人經手',
        en: 'including the degree and the job; the rest run untouched',
      },
    },
    {
      value: String(PROJECTS.length),
      label: { zh: '個系統', en: 'systems' },
      note: {
        zh: `${live.length} 個在營運中,${years} 年之內`,
        en: `${live.length} in production, inside ${years} years`,
      },
    },
    {
      value: `${shortestDays}`,
      label: { zh: '天:最短的一次', en: 'days: the shortest build' },
      note: {
        zh: shortest ? `${shortest.label.zh},從空 repo 到部署` : '',
        en: shortest ? `${shortest.label.en}, empty repo to deployed` : '',
      },
    },
  ];
}
