import { setRequestLocale } from 'next-intl/server';
import { OfflineManager } from '@/components/tools/OfflineManager';
import { alternatesFor, ogFor, robotsFor } from '@/lib/seo';
import { loc, t } from '@/lib/tools/locale';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const l = loc(locale);
  const title = t(l, '離線與本地資料', 'Offline & local data');
  const description = t(
    l,
    '把工具下載下來離線使用,或清掉這個網站在你裝置上留下的所有資料。',
    'Download the bench for offline use, or wipe everything this site stored on your device.'
  );
  return {
    title,
    description,
    openGraph: ogFor(locale, { title, description, path: '/tools/settings' }),
    alternates: alternatesFor(locale, '/tools/settings'),
    robots: robotsFor('/tools/settings'),
  };
}

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = loc(locale);

  return (
    <div className="relative z-10 mx-auto max-w-[840px] px-5 pt-32 pb-24 md:px-6 md:pb-32">
      <p className="inst-no">{t(l, '儀器櫃 / 設定', 'INSTRUMENTS / SETTINGS')}</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
        {t(l, '離線與本地資料', 'Offline & local data')}
      </h1>
      <p className="mt-4 max-w-[44rem] text-[0.9375rem] leading-relaxed text-muted">
        {t(
          l,
          '這一區沒有帳號、沒有雲端、沒有同步。凡是留下來的東西都在這台裝置的瀏覽器裡,下面這兩個按鈕是它的全部開關。',
          'No accounts, no cloud, no sync. Anything kept lives in this browser on this device, and the two controls below are all of it.'
        )}
      </p>
      <div className="mt-10">
        <OfflineManager locale={locale} />
      </div>
    </div>
  );
}
