import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowUpRight, Lock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/Reveal';
import { DomainBadge } from '@/components/ui/DomainBadge';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { alternatesFor, ogFor } from '@/lib/seo';
import { PROJECTS } from '../../../../content/projects';
import type { Project } from '../../../../content/projects';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'work' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: m('work'),
    openGraph: ogFor(locale, { title: t('title'), description: m('work') }),
    alternates: alternatesFor(locale, '/work'),
  };
}

function ProjectRows({ projects, loc }: { projects: Project[]; loc: 'zh' | 'en' }) {
  return (
    <div>
      <div className="hidden grid-cols-[64px_1fr_240px_40px] gap-6 border-b border-line-2 pb-3 font-mono text-[11px] tracking-[0.12em] text-faint md:grid">
        <span>NO.</span>
        <span>PROJECT</span>
        <span>SCOPE</span>
        <span aria-hidden />
      </div>
      {projects.map((p, i) => (
        <Reveal key={p.slug} delay={i * 40}>
          <Link
            href={`/work/${p.slug}`}
            className="group grid grid-cols-1 gap-2 border-b border-line-2 py-7 transition-colors duration-200 hover:bg-base md:grid-cols-[64px_1fr_240px_40px] md:items-center md:gap-6"
          >
            <span className="tabular font-mono text-xs text-accent">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="flex flex-wrap items-center gap-3 text-lg font-medium transition-transform duration-200 group-hover:translate-x-1 md:text-xl">
                {p.title[loc]}
                <DomainBadge domain={p.domain} />
              </h3>
              <p className="mt-1 max-w-[56ch] text-sm text-muted">{p.oneLiner[loc]}</p>
            </div>
            <span className="font-mono text-xs tracking-[0.06em] text-muted">{p.scope[loc]}</span>
            <ArrowUpRight
              size={18}
              strokeWidth={1.5}
              className="hidden text-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block"
            />
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

export default async function WorkPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'work' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  const publicProjects = PROJECTS.filter((p) => p.visibility === 'public');
  const internalProjects = PROJECTS.filter((p) => p.visibility === 'internal');

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no="00" label="PROJECT EXPERIENCE" />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">{t('title')}</h1>
      <p className="mt-6 max-w-[46ch] text-base text-muted md:text-lg">{t('description')}</p>

      {/* 公開專案 */}
      <section aria-label={t('publicLabel')} className="tick mt-20 border-t border-line-2 pt-14">
        <Reveal>
          <SectionHeading no="01" label="PUBLIC" />
          <h2 className="mt-4 text-2xl font-medium md:text-3xl">{t('publicLabel')}</h2>
          <p className="mt-2 max-w-[52ch] text-sm text-muted">{t('publicNote')}</p>
        </Reveal>
        <div className="mt-10">
          <ProjectRows projects={publicProjects} loc={loc} />
        </div>
      </section>

      {/* 公司內部專案 */}
      <section aria-label={t('internalLabel')} className="tick mt-20 border-t border-line-2 pt-14">
        <Reveal>
          <SectionHeading no="02" label="INTERNAL" />
          <h2 className="mt-4 flex items-center gap-3 text-2xl font-medium md:text-3xl">
            {t('internalLabel')}
            <Lock size={18} strokeWidth={1.5} className="text-faint" aria-hidden />
          </h2>
          <p className="mt-2 max-w-[52ch] text-sm text-muted">{t('internalNote')}</p>
        </Reveal>
        <div className="mt-10">
          <ProjectRows projects={internalProjects} loc={loc} />
        </div>
      </section>
    </div>
  );
}
