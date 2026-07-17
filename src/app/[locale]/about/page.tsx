import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { alternatesFor } from '@/lib/seo';
import { EXPERIENCE } from '../../../../content/experience';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: m('about'),
    openGraph: { title: t('title'), description: m('about') },
    alternates: alternatesFor(locale, '/about'),
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <SectionHeading no="01" label="ABOUT" />
      <h1 className="sr-only">{t('title')}</h1>
      <div className="mt-10 max-w-[30ch] space-y-8 text-2xl leading-[1.5] font-medium tracking-tight md:text-4xl">
        <Reveal>
          <p>{t('p1')}</p>
        </Reveal>
        <Reveal delay={80}>
          <p className="text-muted">{t('p2')}</p>
        </Reveal>
      </div>

      <section aria-label={t('experienceLabel')} className="tick mt-24 border-t border-line-2 pt-16">
        <SectionHeading no="02" label="EXPERIENCE" />
        <div className="mt-10 space-y-12">
          {EXPERIENCE.map((e) => (
            <Reveal key={e.period + e.role.en}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr] md:gap-10">
                <p className="font-mono text-xs tracking-[0.1em] text-faint">{e.period}</p>
                <div>
                  <h2 className="text-lg font-medium md:text-xl">
                    {e.role[loc]}
                    <span className="text-muted"> — {e.org[loc]}</span>
                  </h2>
                  <p className="mt-2 max-w-[60ch] text-sm text-muted md:text-base">
                    {e.summary[loc]}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
