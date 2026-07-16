import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { HeroSchematic } from '@/components/diagrams/HeroSchematic';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { CONTACT_EMAIL, GITHUB_URL, PHILOSOPHY } from '../../../content/site';
import { PROJECTS } from '../../../content/projects';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });
  const tw = await getTranslations({ locale, namespace: 'work' });
  const a11y = await getTranslations({ locale, namespace: 'a11y' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 md:px-6">
      {/* 00 / HERO */}
      <section
        aria-labelledby="hero-heading"
        className="flex min-h-svh flex-col justify-center gap-10 pt-24 pb-12"
      >
        <div>
          <SectionHeading no="00" label="SYSTEM OVERVIEW" />
          <h1
            id="hero-heading"
            className="mt-6 max-w-[16ch] text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.15] font-semibold tracking-tight"
          >
            {t('title')}
          </h1>
          <p className="mt-6 max-w-[38ch] text-lg text-muted md:text-xl">
            {t('subtitle')}
          </p>
          <p className="mt-8 font-mono text-xs tracking-[0.12em] text-faint">
            {t('roles')}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/work"
              className="flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-base font-medium text-accent-ink transition-all duration-200 hover:shadow-[0_0_24px_var(--accent-dim)] active:scale-[0.97]"
            >
              {t('ctaWork')}
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex h-12 items-center rounded-full border border-line-2 px-7 text-base text-fg transition-colors duration-200 hover:border-line-3 hover:bg-base active:scale-[0.97]"
            >
              {t('ctaContact')}
            </a>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[960px]">
          <HeroSchematic label={a11y('schematicLabel')} />
        </div>
      </section>

      {/* 01 / SELECTED WORK */}
      <section aria-labelledby="work-heading" className="tick border-t border-line-2 py-24 md:py-32">
        <Reveal>
          <SectionHeading no="01" label="SELECTED WORK" />
        </Reveal>
        <h2 id="work-heading" className="sr-only">
          {tw('title')}
        </h2>
        <div className="mt-10">
          {PROJECTS.map((p, i) => (
            <Reveal key={p.slug} delay={i * 40}>
              <Link
                href={`/work/${p.slug}`}
                className="group grid grid-cols-1 gap-2 border-b border-line-2 py-8 transition-colors duration-200 first:border-t hover:bg-base md:grid-cols-[1fr_auto_auto] md:items-center md:gap-8"
              >
                <div>
                  <h3 className="text-xl font-medium transition-transform duration-200 group-hover:translate-x-1 md:text-2xl">
                    {p.title[loc]}
                  </h3>
                  <p className="mt-2 max-w-[60ch] text-sm text-muted md:text-base">
                    {p.oneLiner[loc]}
                  </p>
                </div>
                <p className="font-mono text-xs tracking-[0.08em] text-faint">
                  {p.stack.join(' · ')}
                </p>
                <div className="flex items-center gap-4 md:justify-end">
                  {p.keyMetric && (
                    <p className="font-mono text-xs text-muted">
                      <span className="tabular text-accent">{p.keyMetric.value}</span>{' '}
                      {p.keyMetric.label[loc]}
                    </p>
                  )}
                  <ArrowUpRight
                    size={18}
                    strokeWidth={1.5}
                    className="text-faint opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 02 / ARCHITECTURE */}
      <section aria-labelledby="arch-heading" className="tick border-t border-line-2 py-24 md:py-32">
        <Reveal>
          <SectionHeading no="02" label="ARCHITECTURE" />
        </Reveal>
        <Reveal delay={60}>
          <h2
            id="arch-heading"
            className="mt-6 max-w-[24ch] text-3xl leading-[1.3] font-semibold tracking-tight md:text-5xl"
          >
            {t('archTitle')}
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-6 max-w-[46ch] text-base text-muted md:text-lg">{t('archBlurb')}</p>
          <Link
            href="/architecture"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full border border-line-2 px-7 text-base text-fg transition-colors duration-200 hover:border-line-3 hover:bg-base"
          >
            {t('archCta')}
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </Reveal>
      </section>

      {/* 03 / PHILOSOPHY */}
      <section aria-labelledby="phi-heading" className="tick border-t border-line-2 py-24 md:py-32">
        <Reveal>
          <SectionHeading no="03" label="PHILOSOPHY" />
        </Reveal>
        <h2 id="phi-heading" className="sr-only">
          Philosophy
        </h2>
        <div className="mt-12 space-y-16 md:space-y-24">
          {PHILOSOPHY.map((s, i) => (
            <Reveal key={s.en} delay={i * 40}>
              <p className="max-w-[22ch] text-2xl leading-[1.4] font-medium tracking-tight text-fg md:text-4xl">
                <span className="mr-4 font-mono text-sm text-faint">0{i + 1}</span>
                {s[loc]}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 04 / CONTACT */}
      <section
        id="contact"
        aria-labelledby="contact-heading"
        className="tick border-t border-line-2 py-24 md:py-40"
      >
        <Reveal>
          <SectionHeading no="04" label="CONTACT" />
        </Reveal>
        <Reveal delay={60}>
          <h2
            id="contact-heading"
            className="mt-6 max-w-[20ch] text-3xl leading-[1.25] font-semibold tracking-tight md:text-6xl"
          >
            {t('contactTitle')}
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-6 max-w-[46ch] text-base text-muted md:text-lg">{t('contactBlurb')}</p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex h-12 items-center rounded-full bg-accent px-7 text-base font-medium text-accent-ink transition-all duration-200 hover:shadow-[0_0_24px_var(--accent-dim)] active:scale-[0.97]"
            >
              {CONTACT_EMAIL}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm tracking-[0.08em] text-muted transition-colors duration-200 hover:text-fg"
            >
              GITHUB ↗
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
