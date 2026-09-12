import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { SectionOpener, sectionId } from '@/components/ui/SectionOpener';
import { ProfileJsonLd } from '@/lib/jsonld';
import { alternatesFor, ogFor, robotsFor } from '@/lib/seo';
import { EXPERIENCE } from '../../../../content/experience';
import { PLATES } from '../../../../content/plates';
import { Avatar } from '@/components/ui/Avatar';
import { PlateWall } from '@/components/ui/PlateWall';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('title'),
    description: m('about'),
    openGraph: ogFor(locale, { title: t('title'), description: m('about'), path: '/about' }),
    alternates: alternatesFor(locale, '/about'),
    robots: robotsFor('/about'),
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  const ts = await getTranslations({ locale, namespace: 'sections' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <ProfileJsonLd locale={locale} />
      <SectionHeading no="01" label="ABOUT" />
      <h1 className="sr-only">{t('title')}</h1>

      <div className="relative mt-10 overflow-hidden rounded-[6px] border border-line-2 px-5 py-10 md:px-10 md:py-14">
        <PlateWall plates={PLATES.map((x) => ({ value: x.value, note: x.note[loc] }))} />
        <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:gap-10">
          <Avatar title={t('avatarAlt')} size={148} className="shrink-0 text-fg" />
          <p className="max-w-[34ch] font-serif text-xl leading-snug font-medium md:text-2xl">
            {t('avatarNote')}
          </p>
        </div>
      </div>

      <div className="mt-16 max-w-[32ch] space-y-10 font-serif text-2xl leading-[1.6] font-medium tracking-tight md:text-4xl">
        <Reveal>
          <p className="drop-cap">{t('p1')}</p>
        </Reveal>
        <Reveal delay={80}>
          <p className="text-muted">{t('p2')}</p>
        </Reveal>
      </div>

      <section aria-labelledby={sectionId('02')} className="tick mt-24 border-t border-line-2 pt-16">
        <SectionOpener no="02" label="EXPERIENCE" name={ts('experience')} />
        <div className="mt-10 space-y-12">
          {EXPERIENCE.map((e) => (
            <Reveal key={e.period + e.role.en}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr] md:gap-10">
                <p className="font-mono text-xs tracking-[0.1em] text-faint">{e.period}</p>
                <div>
                  <h3 className="font-serif text-lg font-semibold md:text-xl">
                    {e.role[loc]}
                    <span className="font-sans text-base font-medium text-muted md:text-lg">
                      {' '}
                      — {e.org[loc]}
                    </span>
                  </h3>
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
