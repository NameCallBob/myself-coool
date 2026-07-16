import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // GitHub Pages:純靜態輸出;自有網域以 CNAME 綁定(public/CNAME)
  output: 'export',
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
