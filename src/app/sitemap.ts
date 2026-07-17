import type { MetadataRoute } from 'next';
import { SITE_URL } from '../../content/site';
import { PROJECTS } from '../../content/projects';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-static';

const PATHS = [
  '',
  '/work',
  ...PROJECTS.map((p) => `/work/${p.slug}`),
  '/architecture',
  '/ai',
  '/about',
];

export default function sitemap(): MetadataRoute.Sitemap {
  // No lastModified: stamping build time on every URL is noise search
  // engines learn to distrust — omit it until real per-page dates exist.
  return PATHS.map((path) => ({
    url: `${SITE_URL}/zh-TW${path}`,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`])
      ),
    },
  }));
}
