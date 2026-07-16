import { SITE_URL } from '../../content/site';
import { routing } from '@/i18n/routing';

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
