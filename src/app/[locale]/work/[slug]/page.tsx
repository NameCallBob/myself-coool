import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { CaseStudyJsonLd } from '@/lib/jsonld';
import { alternatesFor } from '@/lib/seo';
import { PROJECTS } from '../../../../../content/projects';
import type { Localized } from '../../../../../content/projects';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const project = PROJECTS.find((p) => p.slug === slug);
  if (!project) return {};
  const loc = locale === 'zh-TW' ? 'zh' : 'en';
  return {
    title: project.title[loc],
    description: project.oneLiner[loc],
    openGraph: { title: project.title[loc], description: project.oneLiner[loc] },
    alternates: alternatesFor(locale, `/work/${slug}`),
  };
}

function Paragraphs({ items, loc }: { items: Localized[]; loc: 'zh' | 'en' }) {
  return (
    <div className="mt-8 max-w-[65ch] space-y-6">
      {items.map((p) => (
        <p key={p.en.slice(0, 40)} className="text-base leading-relaxed text-fg md:text-lg">
          {p[loc]}
        </p>
      ))}
    </div>
  );
}

export default async function CaseStudyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const project = PROJECTS.find((p) => p.slug === slug);
  if (!project) notFound();

  const t = await getTranslations({ locale, namespace: 'common' });
  const tc = await getTranslations({ locale, namespace: 'case' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';
  const index = PROJECTS.indexOf(project);
  const next = PROJECTS[(index + 1) % PROJECTS.length];
  const cs = project.caseStudy;

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <CaseStudyJsonLd project={project} locale={locale} />
      <SectionHeading no={String(index + 1).padStart(2, '0')} label="WORK / CASE STUDY" />
      <h1 className="mt-6 max-w-[20ch] text-4xl leading-[1.2] font-semibold tracking-tight md:text-6xl">
        {project.title[loc]}
      </h1>
      <p className="mt-6 max-w-[52ch] text-base text-muted md:text-lg">{project.oneLiner[loc]}</p>

      {/* Meta row */}
      <dl className="mt-12 grid grid-cols-1 gap-6 border-y border-line-2 py-6 font-mono text-xs md:grid-cols-3">
        <div>
          <dt className="tracking-[0.12em] text-faint">SCOPE</dt>
          <dd className="mt-2 text-fg">{project.scope[loc]}</dd>
        </div>
        <div>
          <dt className="tracking-[0.12em] text-faint">STACK</dt>
          <dd className="mt-2 text-fg">{project.stack.join(' · ')}</dd>
        </div>
        <div>
          <dt className="tracking-[0.12em] text-faint">LINKS</dt>
          <dd className="mt-2 text-fg">
            {project.links?.live ? (
              <a
                href={project.links.live}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent transition-opacity hover:opacity-80"
              >
                LIVE <ArrowUpRight size={12} strokeWidth={1.5} />
              </a>
            ) : (
              <span className="text-muted">{tc('internal')}</span>
            )}
          </dd>
        </div>
      </dl>

      {!cs && (
        <p className="mt-16 max-w-[46ch] font-mono text-sm leading-relaxed text-muted">
          {t('underConstruction')}
        </p>
      )}

      {cs && (
        <div>
          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="01" label="PROBLEM" />
              <Paragraphs items={cs.problem} loc={loc} />
            </Reveal>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="02" label="CONSTRAINTS" />
              <ul className="mt-8 max-w-[65ch] space-y-4">
                {cs.constraints.map((c) => (
                  <li
                    key={c.en.slice(0, 40)}
                    className="border-l-2 border-accent pl-5 font-mono text-sm leading-relaxed text-muted"
                  >
                    {c[loc]}
                  </li>
                ))}
              </ul>
            </Reveal>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="03" label="ARCHITECTURE" />
              <Paragraphs items={cs.architecture} loc={loc} />
            </Reveal>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="04" label="RESPONSIBILITIES" />
              <Paragraphs items={cs.responsibilities} loc={loc} />
            </Reveal>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="05" label="CHALLENGES → SOLUTIONS" />
            </Reveal>
            <div className="mt-10 space-y-12">
              {cs.challenges.map((ch, i) => (
                <Reveal key={ch.c.en.slice(0, 40)} delay={i * 40}>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-12">
                    <div>
                      <p className="font-mono text-[11px] tracking-[0.12em] text-faint">
                        CHALLENGE
                      </p>
                      <p className="mt-3 text-base leading-relaxed font-medium md:text-lg">
                        {ch.c[loc]}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[11px] tracking-[0.12em] text-accent">
                        SOLUTION
                      </p>
                      <p className="mt-3 text-base leading-relaxed text-muted">{ch.s[loc]}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="06" label="SYSTEM FACTS" />
            </Reveal>
            <div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4">
              {cs.facts.map((f, i) => (
                <Reveal key={f.label.en} delay={i * 40}>
                  <p className="tabular text-4xl font-semibold tracking-tight text-accent md:text-5xl">
                    {f.value}
                  </p>
                  <p className="mt-2 font-mono text-xs tracking-[0.08em] text-muted">
                    {f.label[loc]}
                  </p>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="tick mt-20 border-t border-line-2 pt-14">
            <Reveal>
              <SectionHeading no="07" label="LESSONS" />
              <div className="mt-8 max-w-[60ch] space-y-8">
                {cs.lessons.map((l) => (
                  <p
                    key={l.en.slice(0, 40)}
                    className="border-l-2 border-line-3 pl-6 text-lg leading-relaxed font-medium md:text-xl"
                  >
                    {l[loc]}
                  </p>
                ))}
              </div>
            </Reveal>
          </section>
        </div>
      )}

      {/* Next case study */}
      <Link
        href={`/work/${next.slug}`}
        className="group mt-24 flex items-center justify-between border-t border-line-2 pt-10"
      >
        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-faint">NEXT</p>
          <p className="mt-2 text-2xl font-medium transition-transform duration-200 group-hover:translate-x-1 md:text-3xl">
            {next.title[loc]}
          </p>
        </div>
        <ArrowUpRight
          size={24}
          strokeWidth={1.5}
          className="text-faint transition-colors duration-200 group-hover:text-accent"
        />
      </Link>
    </div>
  );
}
