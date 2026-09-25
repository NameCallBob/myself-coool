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
  // The service worker registration and the offline pre-fetch both need the
  // base path at runtime, and `basePath` itself is not readable from the
  // browser. Re-exporting it as a public env var keeps one source of truth.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
