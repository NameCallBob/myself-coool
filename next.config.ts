import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

// 暫時措施:binbinbob.work 綁定前,讓 github.io/myself-coool 子路徑預覽可用。
// 網域綁定後把 workflow 裡的 PAGES_BASE_PATH 移除即可(本地開發不受影響)。
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // GitHub Pages:純靜態輸出;自有網域以 CNAME 綁定(public/CNAME)
  output: 'export',
  basePath,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
