'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { bytes, count } from '@/lib/tools/format';
import { loc, t } from '@/lib/tools/locale';
import { BASE_PATH, prefetchAll, storageEstimate, wipeEverything } from '@/lib/tools/pwa';
import {
  clearAll,
  inventorySnapshot,
  refreshInventory,
  serverInventory,
  subscribeInventory,
} from '@/lib/tools/storage';
import { useOfflineCapable, useOnline } from '@/lib/tools/useClientFacts';
import { Btn, Note, Row, Table } from '@/components/tools/bench';

type Manifest = {
  buildId: string;
  precache: string[];
  /** `shared` plus one key per locale, so a download is one language only. */
  offline: Record<string, string[]>;
};

/**
 * Two switches and an honest inventory.
 *
 * "Download everything" exists because caching a tool the first time you open
 * it is no use on a plane. It is a button rather than a default: several
 * megabytes should be something you chose, and the size is shown before you
 * choose it.
 */
export function OfflineManager({ locale }: { locale: string }) {
  const l = loc(locale);
  const online = useOnline();
  const supported = useOfflineCapable();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [tick, setTick] = useState(0);
  const local = useSyncExternalStore(subscribeInventory, inventorySnapshot, serverInventory);

  /** Asks for a fresh read of the key inventory and the quota estimate. */
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    // The manifest is written by scripts/build-pwa.mjs next to the export, so
    // this is a same-origin static file — the only request this page makes.
    let cancelled = false;
    fetch(`${BASE_PATH}/sw-manifest.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Manifest | null) => {
        if (!cancelled) setManifest(data);
      })
      .catch(() => {
        /* No manifest means offline download is unavailable, not broken. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Storage figures are asynchronous, so they land after a tick rather than
  // during render; `tick` re-runs this after a download or a wipe.
  useEffect(() => {
    let cancelled = false;
    refreshInventory();
    storageEstimate().then((value) => {
      if (!cancelled) setUsage(value);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // One language's pages plus the shared chunks. Downloading the other
  // locale's hundred pages to read this one would be a waste of the reader's
  // bandwidth and their disk.
  const queue = manifest ? [...manifest.offline.shared, ...(manifest.offline[locale] ?? [])] : [];

  const download = useCallback(async () => {
    if (queue.length === 0) return;
    setResult(null);
    setProgress({ done: 0, total: queue.length });
    const outcome = await prefetchAll(queue, setProgress);
    setProgress(null);
    setResult(
      t(
        l,
        `已快取 ${outcome.cached} 個檔案${outcome.failed ? `,${outcome.failed} 個失敗` : ''}。現在斷網也能用。`,
        `Cached ${outcome.cached} files${outcome.failed ? `, ${outcome.failed} failed` : ''}. It works offline now.`
      )
    );
    refresh();
  }, [queue, l, refresh]);

  const wipe = useCallback(async () => {
    const removed = clearAll();
    await wipeEverything();
    setResult(
      t(
        l,
        `清掉了 ${removed} 筆本地設定、所有離線快取,並移除了 service worker。`,
        `Removed ${removed} stored settings, every offline cache, and the service worker.`
      )
    );
    refresh();
  }, [l, refresh]);

  return (
    <div className="space-y-10">
      <section>
        <div className="inst-pane-label">
          <span>{t(l, '離線', 'OFFLINE')}</span>
          <span className="inst-status" data-state={online ? 'online' : 'offline'}>
            {online ? t(l, '已連線', 'online') : t(l, '離線中', 'offline')}
          </span>
        </div>

        {supported ? (
          <>
            <Row>
              <Btn onClick={download} primary disabled={queue.length === 0 || progress !== null || !online}>
                {progress
                  ? `${count(progress.done)} / ${count(progress.total)}`
                  : t(l, '下載全部以供離線使用', 'Download everything for offline use')}
              </Btn>
              <span className="inst-no">
                {manifest
                  ? `${count(queue.length)} ${t(l, '個檔案', 'files')} · build ${manifest.buildId.slice(0, 8)}`
                  : t(l, '清單載入中…', 'loading manifest…')}
              </span>
            </Row>
            <Note>
              {t(
                l,
                '按下之後會把索引、每一件工具的頁面與程式碼抓進瀏覽器快取。完成後整個儀器櫃在完全斷網下都能開。',
                'This pulls the index and every tool page and chunk into the browser cache. After that the whole bench opens with no network at all.'
              )}
            </Note>
          </>
        ) : (
          <Note>
            {t(
              l,
              '這個瀏覽器沒有 Service Worker 或 Cache Storage,離線模式無法啟用。工具本身照常可用。',
              'This browser has no Service Worker or Cache Storage, so offline mode is unavailable. The tools themselves still work.'
            )}
          </Note>
        )}
      </section>

      <section>
        <div className="inst-pane-label">
          <span>{t(l, '這台裝置上的資料', 'STORED ON THIS DEVICE')}</span>
          <span className="inst-no">
            {usage ? `${bytes(usage.usage)} / ${bytes(usage.quota)}` : '—'}
          </span>
        </div>

        {local.length === 0 ? (
          <Note>{t(l, '目前沒有任何工具寫入設定。', 'No tool has stored anything yet.')}</Note>
        ) : (
          <Table
            head={[t(l, '鍵', 'key'), t(l, '大小', 'size')]}
            align={['left', 'right']}
            rows={local.map((entry) => [entry.key, bytes(entry.size)])}
          />
        )}

        <Row>
          <Btn onClick={wipe}>{t(l, '清除本站所有本地資料', 'Erase everything stored here')}</Btn>
        </Row>
        <Note>
          {t(
            l,
            '包含便條、工時、工具偏好、離線快取與 service worker。清掉之後不可復原,也沒有雲端備份可以還原——因為從來沒有上傳過。',
            'Notes, timesheets, tool preferences, offline caches and the worker. There is no undo and no cloud copy to restore from, because nothing was ever uploaded.'
          )}
        </Note>
      </section>

      {result ? <Note>{result}</Note> : null}
    </div>
  );
}
