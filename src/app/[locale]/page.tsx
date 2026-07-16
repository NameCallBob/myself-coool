import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CONTACT_EMAIL } from '../../../content/site';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 md:px-6">
      {/* 00 / HERO — schematic 動畫將於後續開發階段掛載 */}
      <section
        aria-labelledby="hero-heading"
        className="flex min-h-svh flex-col justify-center pt-16"
      >
        <p className="font-mono text-xs tracking-[0.08em] text-muted">
          <span className="text-accent">00</span> / SYSTEM OVERVIEW
        </p>
        <h1
          id="hero-heading"
          className="mt-6 max-w-[16ch] text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.15] font-semibold tracking-tight"
        >
          {t('title')}
        </h1>
        <p className="mt-6 max-w-[36ch] text-lg text-muted md:text-xl">
          {t('subtitle')}
        </p>
        <p className="mt-8 font-mono text-xs tracking-[0.12em] text-faint">
          {t('roles')}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/work"
            className="flex h-12 items-center rounded-full bg-accent px-7 text-base font-medium text-accent-ink transition-all duration-200 hover:shadow-[0_0_24px_var(--accent-dim)] active:scale-[0.97]"
          >
            {t('ctaWork')}
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            id="contact"
            className="flex h-12 items-center rounded-full border border-line-2 px-7 text-base text-fg transition-colors duration-200 hover:border-line-3 hover:bg-base active:scale-[0.97]"
          >
            {t('ctaContact')}
          </a>
        </div>
      </section>
    </div>
  );
}
