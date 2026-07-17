import type { Metadata } from 'next';
import { Archivo, JetBrains_Mono, Noto_Sans_TC } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from 'next-themes';
import { routing } from '@/i18n/routing';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { GridGuides } from '@/components/layout/GridGuides';
import { LenisProvider } from '@/components/motion/LenisProvider';
import { SiteJsonLd } from '@/lib/jsonld';
import { alternatesFor, OG_IMAGE, ogFor } from '@/lib/seo';
import { SITE_URL } from '../../../content/site';
import '../globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-tc',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const m = await getTranslations({ locale, namespace: 'meta' });
  const title =
    locale === 'zh-TW'
      ? 'binbin — 全端工程師 · 系統設計 · AI 整合'
      : 'binbin — Full-Stack Developer · System Design · AI Integration';

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: '%s — binbin' },
    description: m('home'),
    alternates: alternatesFor(locale, ''),
    openGraph: ogFor(locale, { title, description: m('home') }),
    twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'a11y' });

  // Client components only need nav/a11y strings — sending the full
  // message bundle would embed every page's copy in every payload.
  const messages = await getMessages();
  const clientMessages = { nav: messages.nav, a11y: messages.a11y };

  return (
    <html
      lang={locale === 'zh-TW' ? 'zh-Hant-TW' : 'en'}
      suppressHydrationWarning
      className={`${archivo.variable} ${notoSansTC.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <SiteJsonLd locale={locale} />
        {/* Marks JS availability so reveal styles never hide content from crawlers/no-JS */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <ThemeProvider attribute="data-theme" defaultTheme="light">
          <LenisProvider />
          <NextIntlClientProvider messages={clientMessages}>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-[6px] focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
            >
              {t('skipToContent')}
            </a>
            <GridGuides />
            <Nav />
            <main id="main" className="relative">
              {children}
            </main>
            <Footer />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
