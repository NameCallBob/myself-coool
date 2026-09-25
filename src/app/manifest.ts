import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/**
 * Installed-app metadata for the bench.
 *
 * `start_url` points at /tools rather than the home page on purpose: someone
 * who installs this wants the instruments, not the portfolio. The scope is the
 * whole site because the service worker has to be able to serve the shared
 * chunks, which live at the root regardless of which route pulled them in.
 *
 * Both values are built from `basePath` — hard-coding "/" would 404 on the
 * subpath preview deploy and silently leave the install without a worker.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${basePath}/zh-TW/tools`,
    name: 'binbin — 儀器櫃 / Instruments',
    short_name: '儀器櫃',
    description:
      '一百件純在瀏覽器裡執行的工具。不上傳、不連線、不記錄,離線可用。A hundred tools that run entirely in your browser.',
    lang: 'zh-Hant-TW',
    dir: 'ltr',
    start_url: `${basePath}/zh-TW/tools`,
    scope: `${basePath}/`,
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf8f4',
    theme_color: '#faf8f4',
    categories: ['utilities', 'productivity', 'developer'],
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      {
        src: `${basePath}/icons/icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'JSON', url: `${basePath}/zh-TW/tools/json-format` },
      { name: '密碼產生器', url: `${basePath}/zh-TW/tools/password-generator` },
      { name: '時間戳', url: `${basePath}/zh-TW/tools/timestamp` },
      { name: 'Base64', url: `${basePath}/zh-TW/tools/base64` },
    ],
  };
}
