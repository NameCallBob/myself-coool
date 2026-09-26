import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { TraceWaterfall } from '@/components/trace/TraceWaterfall';
import { Figures } from '@/components/home/Figures';
import { WorkTracks } from '@/components/home/WorkTracks';
import { displaySerif } from '@/lib/fonts';
import { CONTACT_EMAIL, GITHUB_URL, PHILOSOPHY } from '../../../content/site';
import { PROJECTS } from '../../../content/projects';
import { PROJECT_PERIODS } from '../../../content/periods';
import { buildTimeline, endOf, startOf, timeExtent } from '../../../content/timeline';
import { figuresFor } from '../../../content/figures';
import '@/styles/trace.css';
import '@/styles/home.css';

type Props = { params: Promise<{ locale: string }> };

/**
 * Home — the trace.
 *
 * The page makes one argument: a degree, a job and a dozen production systems
 * were running at the same time. A list of projects cannot show that; a
 * waterfall cannot hide it. Every bar's dates are quoted from the case study
 * it links to (content/periods.ts), and every figure below the chart is
 * computed from the same spans the chart draws (content/figures.ts) — so the
 * prose on this page cannot drift away from its own evidence.
 */

/** A static export has no request: "now" is the moment the site was built. */
const BUILT_AT = Date.now();

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const h = await getTranslations({ locale, namespace: 'home' });
  const l = locale === 'en' ? 'en' : 'zh';

  const spans = buildTimeline(BUILT_AT);
  const extent = timeExtent(spans);
  const total = extent.to - extent.from;
  const figures = figuresFor(BUILT_AT);

  /** Where a project sits on the shared axis, as percentages. */
  const track = (slug: string) => {
    const period = PROJECT_PERIODS[slug];
    if (!period) return null;
    const from = startOf(period.start);
    const to = period.end === 'present' ? BUILT_AT : endOf(period.end);
    return {
      from: `${(((from - extent.from) / total) * 100).toFixed(2)}%`,
      to: `${(((to - extent.from) / total) * 100).toFixed(2)}%`,
      ongoing: period.end === 'present',
    };
  };

  const live = [
    { label: 'manience.com', href: 'https://manience.com', since: h('liveStorefront') },
    { label: 'aaic.nkust.edu.tw', href: 'https://aaic.nkust.edu.tw', since: h('liveAlumni') },
    {
      label: 'equipment-borrowing.binbinbob.work',
      href: 'https://equipment-borrowing.binbinbob.work',
      since: h('liveBorrow'),
    },
  ];

  return (
    <div className={`home-wrap ${displaySerif.variable}`}>
      {/* The kicker names what the page is, not what it is projected on —
          the projector metaphor left with the old composition. */}
      <p className="home-kicker">{h('kicker')}</p>
      <h1 className="home-name">{h('name')}</h1>
      <p className="home-stance">{h('stance')}</p>

      {/* ── The trace ─────────────────────────── */}
      <section className="home-section" aria-labelledby="trace-heading">
        <div className="home-section-head">
          <span className="home-kicker">01 / TRACE</span>
          <h2 id="trace-heading">{h('traceTitle')}</h2>
        </div>
        <p className="home-lede">{h('traceLede')}</p>

        <div className="mt-8">
          <TraceWaterfall locale={locale} />
        </div>

        <Figures figures={figures} l={l} />
        <p className="home-figure-note mt-6" style={{ maxWidth: '42rem', lineHeight: 1.7 }}>
          {h('traceSource')}
        </p>
      </section>

      {/* ── Work ──────────────────────────────── */}
      <section className="home-section" aria-labelledby="work-heading">
        <div className="home-section-head">
          <span className="home-kicker">02 / SYSTEMS</span>
          <h2 id="work-heading">{h('workTitle')}</h2>
          <Link href="/work" className="home-kicker ink-link" style={{ marginLeft: 'auto' }}>
            {h('workAll')} →
          </Link>
        </div>
        <p className="home-lede">{h('workLede')}</p>

        <WorkTracks>
          {PROJECTS.filter((project) => project.featured).map((project) => {
            const slice = track(project.slug);
            return (
              <Link key={project.slug} href={`/work/${project.slug}`} className="home-work-row">
                <span>
                  <span className="home-work-title">{project.title[l]}</span>
                  <span
                    className="home-track"
                    aria-hidden="true"
                    data-ongoing={slice?.ongoing ? 'true' : undefined}
                    data-undated={slice ? undefined : 'true'}
                    style={
                      {
                        '--from': slice?.from ?? '0%',
                        '--to': slice?.to ?? '100%',
                      } as React.CSSProperties
                    }
                  />
                </span>
                <span className="home-work-note">{project.oneLiner[l]}</span>
                <span className="home-work-stack">
                  {project.scope[l]}
                  <br />
                  {project.stack.join(' · ')}
                </span>
              </Link>
            );
          })}
        </WorkTracks>
      </section>

      {/* ── Principles ────────────────────────── */}
      <section className="home-section" aria-labelledby="rules-heading">
        <div className="home-section-head">
          <span className="home-kicker">03 / RULES</span>
          <h2 id="rules-heading">{h('rulesTitle')}</h2>
        </div>
        <p className="home-lede">{h('rulesLede')}</p>
        <div className="home-principles">
          {PHILOSOPHY.map((rule, index) => (
            <p key={rule.en} className="home-principle">
              <span>{String(index + 1).padStart(2, '0')}</span>
              {rule[l]}
            </p>
          ))}
        </div>
      </section>

      {/* ── Contact ───────────────────────────── */}
      <section className="home-section" aria-labelledby="contact-heading">
        <div className="home-section-head">
          <span className="home-kicker">04 / CONTACT</span>
          <h2 id="contact-heading">{h('contactTitle')}</h2>
        </div>
        <div className="home-contact">
          <a href={`mailto:${CONTACT_EMAIL}`} className="ink-link">
            {CONTACT_EMAIL}
          </a>
          <a href={GITHUB_URL} rel="noopener noreferrer" className="ink-link">
            github.com/NameCallBob
          </a>
        </div>
        <div className="home-live">
          {live.map((entry) => (
            <span key={entry.href}>
              <a href={entry.href} rel="noopener noreferrer">
                {entry.label}
              </a>
              {'  '}
              {entry.since}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
