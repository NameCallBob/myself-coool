import type { MetadataRoute } from 'next';
import { SITE_URL } from '../../content/site';
import { PROJECTS } from '../../content/projects';
import { CONTENT_DATES, ROUTE_DATES } from '../../content/dates';
import { routing } from '@/i18n/routing';
import { isIndexable } from '@/lib/seo';

export const dynamic = 'force-static';

/**
 * Every indexable path, with the date its own sources last changed.
 *
 * `lastModified` comes from git via scripts/content-dates.mjs — never from
 * build time, which would restamp every URL on every deploy and teach search
 * engines to ignore the field.
 */
function paths(): { path: string; lastModified: string }[] {
  const entries = [
    { path: '', lastModified: ROUTE_DATES[''] },
    { path: '/work', lastModified: ROUTE_DATES['/work'] },
    ...PROJECTS.map((p) => ({
      path: `/work/${p.slug}`,
      lastModified: CONTENT_DATES[p.slug].updated,
    })),
    { path: '/ai', lastModified: ROUTE_DATES['/ai'] },
    { path: '/about', lastModified: ROUTE_DATES['/about'] },
  ];

  return entries.filter((e) => isIndexable(e.path));
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Google's multilingual guidance wants one <url> entry per language
  // version, each carrying the complete alternates set including itself.
  return paths().flatMap(({ path, lastModified }) => {
    const languages: Record<string, string> = Object.fromEntries(
      routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
    );
    languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}${path}`;

    return routing.locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      alternates: { languages },
    }));
  });
}
