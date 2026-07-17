import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-TW', 'en'],
  defaultLocale: 'zh-TW',
  // GitHub Pages is static-only hosting — no middleware for locale rewriting,
  // so the prefix is always on (/zh-TW, /en); root redirects via public/index.html.
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
