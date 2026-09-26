import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ToolsIndex } from '@/components/tools/ToolsIndex';
import { alternatesFor, ogFor, robotsFor } from '@/lib/seo';
import { TOOLS } from '../../../../content/tools/registry';
import { BUILT } from '@/tools/built.generated';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  const m = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('tools'),
    description: m('tools'),
    openGraph: ogFor(locale, { title: t('tools'), description: m('tools'), path: '/tools' }),
    alternates: alternatesFor(locale, '/tools'),
    robots: robotsFor('/tools'),
  };
}

export default async function ToolsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const zh = locale !== 'en';
  const built = TOOLS.filter((tool) => BUILT.has(tool.slug)).length;

  return (
    <div className="relative z-10 mx-auto max-w-[1200px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <p className="inst-no">{zh ? '儀器櫃' : 'INSTRUMENTS'}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
        {zh ? '一百件在瀏覽器裡跑完的工具' : 'A hundred tools that run in your browser'}
      </h1>

      {/* The reason these exist, in plain terms. It is a practical worry, not
          a manifesto — most of these tools exist elsewhere, and the difference
          is only where the data goes. */}
      <div className="mt-6 max-w-[44rem] space-y-4 text-[0.9375rem] leading-relaxed text-muted">
        {zh ? (
          <>
            <p>
              工作上常要臨時轉個格式、算個雜湊、看一下 JWT 裡面寫什麼。網路上這類工具很多,
              但你貼進去的東西會不會被留下來,沒有人說得準——而那些東西常常是公司的資料。
            </p>
            <p>
              所以這些我自己做了一套。全部在你這個分頁裡算完,不上傳、不連線、不記錄;
              頁面載入完成之後不會再發出任何網路請求,這件事寫成測試,沒過就不會部署。
              開 DevTools 的 Network 分頁自己看,筆數應該是零。也可以裝起來離線用。
            </p>
          </>
        ) : (
          <>
            <p>
              Work throws up small jobs: convert a format, hash a file, look inside a JWT. There
              are plenty of sites for that, but nobody can tell you whether what you paste is kept
              — and it is often your company&rsquo;s data.
            </p>
            <p>
              So these are mine. Everything computes in this tab: no upload, no connection, no
              logging. After the page loads it makes no further network requests, which is asserted
              by a test that blocks the deploy if it fails. Open the Network panel and check. It
              also installs for offline use.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inst-no">
          {built} / {TOOLS.length} {zh ? '已完成' : 'built'}
        </span>
        <span className="inst-no">{zh ? '⌘K 搜尋' : '⌘K to search'}</span>
        <Link href="/tools/settings" className="inst-no ink-link">
          {zh ? '離線與本地資料 →' : 'Offline & local data →'}
        </Link>
      </div>

      <div className="mt-10">
        <ToolsIndex locale={locale} />
      </div>
    </div>
  );
}
