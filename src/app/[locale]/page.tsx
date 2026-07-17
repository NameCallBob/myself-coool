import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { HeroSchematic } from '@/components/diagrams/HeroSchematic';
import { Reveal } from '@/components/motion/Reveal';
import { StaggerHeading } from '@/components/motion/StaggerHeading';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { CONTACT_EMAIL, GITHUB_URL, PHILOSOPHY } from '../../../content/site';
import { PROJECTS } from '../../../content/projects';
import { EXPERIENCE } from '../../../content/experience';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });
  const tw = await getTranslations({ locale, namespace: 'work' });
  const ta = await getTranslations({ locale, namespace: 'about' });
  const a11y = await getTranslations({ locale, namespace: 'a11y' });
  const loc = locale === 'zh-TW' ? 'zh' : 'en';

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 md:px-6">
      {/* 00 / PROFILE — 自介以陳述事實為主,非口號 */}
      <section aria-labelledby="hero-heading" className="pt-36 pb-20 md:pt-44 md:pb-28">
        <SectionHeading no="00" label="PROFILE" />
        <StaggerHeading
          id="hero-heading"
          text={t('name')}
          className="mt-6 text-[clamp(3rem,9vw,6.5rem)] leading-none font-semibold tracking-tight"
        />
        <p className="mt-4 text-xl text-muted md:text-2xl">{t('tagline')}</p>
        <p className="mt-8 max-w-[42rem] text-base leading-relaxed md:text-lg">
          {t('intro')}
        </p>
        <p className="mt-8 font-mono text-xs tracking-[0.12em] text-faint">{t('roles')}</p>

        <figure className="mt-16">
          <div className="mx-auto w-full max-w-[960px]">
            <HeroSchematic label={a11y('schematicLabel')} />
          </div>
          <figcaption className="mt-4 text-center font-mono text-[11px] tracking-[0.06em] text-faint">
            {t('schematicCaption')}
          </figcaption>
        </figure>
      </section>

      {/* 01 / SELECTED WORK */}
      <section aria-labelledby="work-heading" className="tick border-t border-line-2 py-20 md:py-28">
        <Reveal>
          <SectionHeading no="01" label="SELECTED WORK" />
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">{t('workNote')}</p>
        </Reveal>
        <h2 id="work-heading" className="sr-only">
          {tw('title')}
        </h2>
        <div className="mt-10">
          {PROJECTS.filter((p) => p.featured).map((p, i) => (
            <Reveal key={p.slug} delay={i * 40}>
              <Link
                href={`/work/${p.slug}`}
                className="group grid grid-cols-1 gap-2 border-b border-line-2 py-7 transition-colors duration-200 first:border-t hover:bg-base md:grid-cols-[1fr_auto_auto] md:items-center md:gap-8"
              >
                <div>
                  <h3 className="text-lg font-medium transition-transform duration-200 group-hover:translate-x-1 md:text-xl">
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
                  <p className="font-mono text-xs text-muted">{p.scope[loc]}</p>
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

      {/* 02 / EXPERIENCE */}
      <section
        aria-label={ta('experienceLabel')}
        className="tick border-t border-line-2 py-20 md:py-28"
      >
        <Reveal>
          <SectionHeading no="02" label="EXPERIENCE" />
        </Reveal>
        <div className="mt-10 space-y-10">
          {EXPERIENCE.map((e) => (
            <Reveal key={e.period + e.role.en}>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:gap-10">
                <p className="font-mono text-xs tracking-[0.1em] text-faint">{e.period}</p>
                <div>
                  <h3 className="text-base font-medium md:text-lg">
                    {e.role[loc]}
                    <span className="text-muted"> — {e.org[loc]}</span>
                  </h3>
                  <p className="mt-1 max-w-[60ch] text-sm text-muted">{e.summary[loc]}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 03 / ARCHITECTURE — 文件式指引,非行銷區塊 */}
      <section aria-label="Architecture" className="tick border-t border-line-2 py-20 md:py-28">
        <Reveal>
          <SectionHeading no="03" label="ARCHITECTURE" />
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">{t('archNote')}</p>
          <Link
            href="/architecture"
            className="ink-link mt-6 inline-flex items-center gap-1 pb-0.5 text-base text-fg"
          >
            {t('archCta')}
            <ArrowUpRight size={16} strokeWidth={1.5} className="text-accent" />
          </Link>
        </Reveal>
      </section>

      {/* 04 / PRINCIPLES */}
      <section aria-label="Principles" className="tick border-t border-line-2 py-20 md:py-28">
        <Reveal>
          <SectionHeading no="04" label="PRINCIPLES" />
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">
            {t('principlesNote')}
          </p>
        </Reveal>
        <ul className="mt-10 max-w-[42rem] space-y-6">
          {PHILOSOPHY.map((s, i) => (
            <Reveal key={s.en} delay={i * 40}>
              <li className="flex gap-5 border-l-2 border-accent/40 pl-5">
                <span className="font-mono text-xs leading-7 text-faint">0{i + 1}</span>
                <p className="text-lg leading-relaxed font-medium md:text-xl">{s[loc]}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* 05 / CONTACT — 純文字聯絡資訊 */}
      <section id="contact" aria-label="Contact" className="tick border-t border-line-2 py-20 md:py-32">
        <Reveal>
          <SectionHeading no="05" label="CONTACT" />
          <p className="mt-4 max-w-[46ch] text-sm text-muted md:text-base">{t('contactNote')}</p>
          <dl className="mt-8 space-y-3 font-mono text-sm">
            <div className="flex gap-6">
              <dt className="w-16 tracking-[0.12em] text-faint">EMAIL</dt>
              <dd>
                <a href={`mailto:${CONTACT_EMAIL}`} className="ink-link pb-0.5 text-accent">
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div className="flex gap-6">
              <dt className="w-16 tracking-[0.12em] text-faint">GITHUB</dt>
              <dd>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ink-link pb-0.5 text-fg"
                >
                  github.com/NameCallBob ↗
                </a>
              </dd>
            </div>
          </dl>
        </Reveal>
      </section>
    </div>
  );
}
