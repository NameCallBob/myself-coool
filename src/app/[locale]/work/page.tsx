import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { alternatesFor } from '@/lib/seo';
import { PROJECTS } from '../../../../content/projects';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'work' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: m('work'),
    alternates: alternatesFor(locale, '/work'),
  };
}

export default async function WorkPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'work' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no="01" label="WORK / INDEX" />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">{t('title')}</h1>
      <p className="mt-6 max-w-[46ch] text-base text-muted md:text-lg">{t('description')}</p>

      {/* BOM-table style index */}
      <div className="mt-16">
        <div className="hidden grid-cols-[64px_1fr_240px_40px] gap-6 border-b border-line-2 pb-3 font-mono text-[11px] tracking-[0.12em] text-faint md:grid">
          <span>NO.</span>
          <span>PROJECT</span>
          <span>SCOPE</span>
          <span aria-hidden />
        </div>
        {PROJECTS.map((p, i) => (
          <Reveal key={p.slug} delay={i * 40}>
            <Link
              href={`/work/${p.slug}`}
              className="group grid grid-cols-1 gap-2 border-b border-line-2 py-7 transition-colors duration-200 hover:bg-base md:grid-cols-[64px_1fr_240px_40px] md:items-center md:gap-6"
            >
              <span className="font-mono text-xs text-accent tabular">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h2 className="text-lg font-medium transition-transform duration-200 group-hover:translate-x-1 md:text-xl">
                  {p.title[loc]}
                </h2>
                <p className="mt-1 max-w-[56ch] text-sm text-muted">{p.oneLiner[loc]}</p>
              </div>
              <span className="font-mono text-xs tracking-[0.06em] text-muted">
                {p.scope[loc]}
              </span>
              <ArrowUpRight
                size={18}
                strokeWidth={1.5}
                className="hidden text-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block"
              />
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
