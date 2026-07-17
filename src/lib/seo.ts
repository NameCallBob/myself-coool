import { SITE_NAME, SITE_URL } from '../../content/site';
import { routing } from '@/i18n/routing';

/** Shared social preview image (metadataBase resolves it to an absolute URL). */
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'binbin — Full-Stack Developer · System Design · AI Integration',
};

/**
 * Complete openGraph object for a page. Next.js metadata merging replaces
 * the parent's `openGraph` wholesale, so every page must re-declare
 * type/siteName/locale/images — this helper keeps that in one place.
 */
export function ogFor(
  locale: string,
  { title, description }: { title: string; description: string }
) {
  return {
    type: 'website' as const,
    siteName: SITE_NAME,
    locale: ogLocale(locale),
    title,
    description,
    images: [OG_IMAGE],
  };
}

/**
 * hreflang / canonical helper — every page declares its zh-TW/en pair
 * plus x-default (→ zh-TW), per Google multilingual guidelines.
 */
export function alternatesFor(locale: string, path: string) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
  ) as Record<string, string>;
  languages['x-default'] = `${SITE_URL}/zh-TW${path}`;

  return {
    canonical: `${SITE_URL}/${locale}${path}`,
    languages,
  };
}

export function ogLocale(locale: string) {
  return locale === 'zh-TW' ? 'zh_TW' : 'en_US';
}
