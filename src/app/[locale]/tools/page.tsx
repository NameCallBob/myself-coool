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

      {/* The promise, stated where it can be checked rather than as a badge. */}
      <div className="mt-6 max-w-[44rem] space-y-4 text-[0.9375rem] leading-relaxed text-muted">
        {zh ? (
          <>
            <p>
              這一區不上傳、不連線、不記錄。每個工具的運算都發生在你這個分頁裡,
              頁面載入完成之後不會再發出任何網路請求——這件事寫成了測試,
              沒過就不會部署。
            </p>
            <p>
              你可以自己驗:開 DevTools 的 Network 分頁、清空紀錄、操作任何一個工具,
              筆數應該是零。若你用的是公司電腦,這頁也可以裝成離線應用,
              在完全斷網的狀態下使用。
            </p>
          </>
        ) : (
          <>
            <p>
              Nothing here is uploaded, and nothing is logged. Every tool computes in this tab, and
              after the page has loaded it makes no further network requests — which is asserted by a
              test that blocks the deploy if it fails.
            </p>
            <p>
              Check it yourself: open the Network panel, clear it, use any tool, and the count should
              stay at zero. The section also installs as an offline app.
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
