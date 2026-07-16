import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { PROJECTS } from '../../../../../content/projects';

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export default async function CaseStudyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const project = PROJECTS.find((p) => p.slug === slug);
  if (!project) notFound();

  const t = await getTranslations({ locale, namespace: 'common' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';
  const index = PROJECTS.indexOf(project) + 1;

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no={String(index).padStart(2, '0')} label="WORK / CASE STUDY" />
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
          <dt className="tracking-[0.12em] text-faint">STATUS</dt>
          <dd className="mt-2 text-fg">CASE STUDY IN PROGRESS</dd>
        </div>
      </dl>

      {/* 八段式內容於真實資料到齊後填入(Phase 2 §4) */}
      <p className="mt-16 max-w-[46ch] font-mono text-sm leading-relaxed text-muted">
        {t('underConstruction')}
      </p>
    </div>
  );
}
