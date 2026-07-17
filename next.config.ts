import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// Temporary: lets github.io/myself-coool serve as a subpath preview before
// binbinbob.work is bound. Remove PAGES_BASE_PATH from the workflow once the
// domain is live (local dev is unaffected either way).
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // GitHub Pages: static export only; custom domain is bound via public/CNAME

  output: 'export',
  basePath,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
