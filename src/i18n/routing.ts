import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-TW', 'en'],
  defaultLocale: 'zh-TW',
  // GitHub Pages 是純靜態主機,無 middleware 可做語系改寫,
  // 因此固定前綴(/zh-TW、/en),root 由 public/index.html 轉導。
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
