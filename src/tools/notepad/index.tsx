'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Trash2 } from 'lucide-react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  DropZone,
  Note as Hint,
  Panel,
  Readout,
  Row,
  Seg,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t, type Loc } from '@/lib/tools/locale';
import { toHex } from '@/lib/tools/bytes';
import { randomBytes } from '@/lib/tools/random';
import { read, write } from '@/lib/tools/storage';
import { useOfflineCapable } from '@/lib/tools/useClientFacts';
import {
  deriveTitle,
  exportBundle,
  mergeNotes,
  parseBundle,
  previewDocument,
  renderMarkdown,
  sortNotes,
  stats,
  type Note,
} from './logic';

const SLUG = 'notepad';
const IMPORT_LIMIT = 2_000_000;

/**
 * The theme, read through a store rather than an effect (house pattern). The
 * preview lives in a sandboxed frame with no access to this page's stylesheet,
 * so its colours have to be handed to it, and they have to follow the toggle.
 */
const subscribeTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
};
const themeNow = () => document.documentElement.dataset.theme ?? 'light';
const themeServer = () => 'light';

/** Eight hex characters is plenty to keep a few hundred local notes apart. */
function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return toHex(randomBytes(4));
  }
}

const STARTER = [
  '# 便條',
  '',
  '這些字存在**這台裝置**的瀏覽器裡,沒有帳號,不會上傳。換一台電腦就看不到。',
  '',
  '- [ ] 待辦一件',
  '- [x] 已經做完的',
  '',
  '> 支援的語法:標題、粗體斜體、`行內程式碼`、圍欄程式碼、引用、清單、待辦、表格、水平線、連結。',
  '',
  '| 欄位 | 說明 |',
  '| :--- | :--- |',
  '| 儲存 | localStorage |',
  '| 匯出 | 一個 Markdown 檔 |',
].join('\n');

function formatTime(l: Loc, value: number): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(l === 'en' ? 'en-GB' : 'zh-TW', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export default function Notepad({ l }: ToolProps) {
  const theme = useSyncExternalStore(subscribeTheme, themeNow, themeServer);
  const offlineCapable = useOfflineCapable();

  const [notes, setNotes] = useState<Note[]>(() => {
    const held = read<Note[]>(SLUG, 'notes', []);
    if (Array.isArray(held) && held.length > 0) return sortNotes(held);
    return [{ id: newId(), body: STARTER, updated: 0 }];
  });
  const [activeId, setActiveId] = useState<string>(() => notes[0]?.id ?? '');
  const [view, setView] = useState<'edit' | 'split' | 'preview'>('split');
  const [saveFailed, setSaveFailed] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState('');

  const active = notes.find((note) => note.id === activeId) ?? notes[0];
  const body = active?.body ?? '';

  /** Every mutation goes through here, so nothing can change without persisting. */
  const commit = (next: Note[]) => {
    setNotes(next);
    setSaveFailed(!write(SLUG, 'notes', next));
  };

  const edit = (text: string) => {
    if (!active) return;
    commit(
      notes.map((note) =>
        note.id === active.id ? { ...note, body: text, updated: Date.now() } : note
      )
    );
  };

  const add = () => {
    const note: Note = { id: newId(), body: '', updated: Date.now() };
    commit([note, ...notes]);
    setActiveId(note.id);
  };

  const remove = (id: string) => {
    const next = notes.filter((note) => note.id !== id);
    if (next.length === 0) {
      // Never leave the pad with nothing in it; an empty note is the floor. Its
      // timestamp stays 0 until something is typed into it — an untouched blank
      // has no modification time worth showing.
      const fresh: Note = { id: newId(), body: '', updated: 0 };
      commit([fresh]);
      setActiveId(fresh.id);
      return;
    }
    commit(next);
    if (id === activeId) setActiveId(next[0].id);
  };

  const importFrom = (text: string) => {
    if (text.length > IMPORT_LIMIT) {
      setImportMessage(
        t(l, `檔案超過 ${bytes(IMPORT_LIMIT)},沒有匯入。`, `Over ${bytes(IMPORT_LIMIT)} — not imported.`)
      );
      return;
    }
    const incoming = parseBundle(text);
    if (incoming.length === 0) {
      setImportMessage(t(l, '這份內容裡沒有可以匯入的東西。', 'Nothing importable in that.'));
      return;
    }
    const stamped = incoming.map((note) => ({
      id: note.id === '' ? newId() : note.id,
      body: note.body,
      updated: note.updated === 0 ? Date.now() : note.updated,
    }));
    const merged = mergeNotes(notes, stamped);
    commit(merged);
    setActiveId(stamped[0].id);
    setImportMessage(
      t(
        l,
        `匯入 ${stamped.length} 則,合併後共 ${merged.length} 則。同 id 只留較新的那一份。`,
        `Imported ${stamped.length}; ${merged.length} after merging. For a repeated id only the newer copy is kept.`
      )
    );
  };

  const bundle = exportBundle(notes);
  const measurements = stats(body);
  const html = useMemo(() => renderMarkdown(body), [body]);
  const document_ = useMemo(() => previewDocument(html, theme === 'dark'), [html, theme]);
  const storedBytes = new Blob([bundle]).size;

  const listing = (
    <div className="inst-scroll" style={{ maxHeight: '22rem' }}>
      {notes.map((note) => {
        const title = deriveTitle(note.body);
        return (
          <div
            key={note.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.5rem',
              padding: '0.4rem 0',
              borderBottom: '1px solid var(--border-1)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveId(note.id)}
              aria-current={note.id === activeId ? 'true' : undefined}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                color: note.id === activeId ? 'var(--accent)' : 'var(--fg-muted)',
                font: 'inherit',
              }}
            >
              <span style={{ display: 'block', fontSize: 13 }}>
                {title || t(l, '(空白便條)', '(empty note)')}
              </span>
              <span className="inst-no">
                {formatTime(l, note.updated)} · {count(stats(note.body).characters)}{' '}
                {t(l, '字', 'chars')}
              </span>
            </button>
            <Btn
              onClick={() => remove(note.id)}
              title={t(l, '刪除這則', 'delete this note')}
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </Btn>
          </div>
        );
      })}
    </div>
  );

  const editor = (
    <Area
      label={t(l, 'Markdown', 'Markdown')}
      value={body}
      onChange={edit}
      rows={view === 'edit' ? 28 : 20}
      placeholder={t(l, '直接開始寫。每次按鍵就存。', 'Just start typing. It saves on every keystroke.')}
    />
  );

  const preview = (
    <iframe
      title={t(l, '預覽', 'Preview')}
      sandbox=""
      srcDoc={document_}
      style={{
        width: '100%',
        height: view === 'preview' ? '46rem' : '34rem',
        border: '1px solid var(--border-1)',
        background: 'var(--bg-base)',
        display: 'block',
      }}
    />
  );

  return (
    <div>
      <Bench
        leftLabel={t(l, '便條', 'NOTES')}
        rightLabel={view === 'edit' ? t(l, '編輯', 'EDIT') : t(l, '預覽', 'PREVIEW')}
        leftAside={
          <span className="inst-no">
            {count(notes.length)} {t(l, '則', 'notes')}
          </span>
        }
        rightAside={
          <Seg
            label={t(l, '檢視', 'view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'edit', label: t(l, '只編輯', 'edit') },
              { value: 'split', label: t(l, '對照', 'split') },
              { value: 'preview', label: t(l, '只預覽', 'preview') },
            ]}
          />
        }
        left={
          <>
            <Row>
              <Btn onClick={add} primary>
                {t(l, '新增一則', 'new note')}
              </Btn>
              <CopyButton l={l} text={body} label={t(l, '複製這則', 'copy this note')} />
            </Row>
            {listing}
            {saveFailed ? (
              <Hint error>
                {t(
                  l,
                  '寫不進瀏覽器儲存空間。可能是無痕視窗、網站資料被封鎖,或容量滿了——先按「複製全部」把內容帶走。',
                  'The browser refused to store this: a private window, blocked site data, or a full quota. Copy everything out before you lose it.'
                )}
              </Hint>
            ) : null}
            <Hint>
              {t(
                l,
                `存在這台裝置的瀏覽器裡(localStorage),沒有帳號、沒有同步、不會上傳。清除瀏覽資料或換裝置就沒了,重要的東西請用下面的匯出。${
                  offlineCapable ? '離線也能用。' : ''
                }`,
                `Kept in this browser on this device (localStorage) — no account, no sync, nothing uploaded. Clearing site data or switching device loses it, so export anything that matters.${
                  offlineCapable ? ' Works offline.' : ''
                }`
              )}
            </Hint>
          </>
        }
        right={
          view === 'edit' ? (
            editor
          ) : view === 'preview' ? (
            preview
          ) : (
            <>
              {editor}
              {preview}
            </>
          )
        }
      />

      <Panel
        label={t(l, '匯出與匯入', 'EXPORT & IMPORT')}
        aside={<span className="inst-no">{bytes(storedBytes)}</span>}
      >
        <Row>
          <CopyButton l={l} text={bundle} label={t(l, '複製全部(Markdown)', 'copy everything')} />
          <Btn
            onClick={() => {
              try {
                const url = URL.createObjectURL(new Blob([bundle], { type: 'text/markdown' }));
                const anchor = window.document.createElement('a');
                anchor.href = url;
                anchor.download = 'notepad.md';
                anchor.rel = 'noopener';
                window.document.body.append(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              } catch {
                setImportMessage(
                  t(l, '瀏覽器拒絕了下載,請用「複製全部」。', 'The browser refused the download — use copy instead.')
                );
              }
            }}
          >
            {t(l, '下載 notepad.md', 'download notepad.md')}
          </Btn>
        </Row>

        <DropZone
          l={l}
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hint={t(l, '把之前匯出的 .md 拖進來合併', 'Drop an exported .md here to merge it back')}
          onFiles={(files) => {
            const file = files[0];
            if (!file) return;
            file
              .text()
              .then((text) => importFrom(text))
              .catch(() =>
                setImportMessage(t(l, '這個檔案讀不出來。', 'That file could not be read.'))
              );
          }}
        />

        <Area
          label={t(l, '或把內容貼進來', 'Or paste content here')}
          value={importText}
          onChange={setImportText}
          rows={4}
        />
        <Row>
          <Btn onClick={() => importFrom(importText)} disabled={importText.trim() === ''}>
            {t(l, '合併貼上的內容', 'merge the pasted text')}
          </Btn>
        </Row>
        {importMessage ? <Hint>{importMessage}</Hint> : null}

        <p className="inst-hint">
          {t(
            l,
            '匯出檔是一份普通的 Markdown:每則便條前面有一行 HTML 註解記著它的 id 與時間,其他編輯器看到那行只是註解。匯入時同 id 只留較新的一份,所以同一個檔案匯入兩次不會變出兩份。',
            'The export is an ordinary Markdown file: each note is preceded by an HTML comment holding its id and timestamp, which any other editor treats as a comment. On import, a repeated id keeps only the newer copy, so importing the same file twice does not duplicate anything.'
          )}
        </p>
      </Panel>

      <Panel label={t(l, '支援的 Markdown', 'THE MARKDOWN SUBSET')}>
        <p className="inst-hint">
          {t(
            l,
            '有:# 到 ###### 標題、**粗體**、*斜體*、~~刪除線~~、`行內程式碼`、``` 圍欄程式碼、> 引用、- 與 1. 清單(可巢狀)、- [ ] 待辦、--- 水平線、[文字](網址) 連結、| 表格 |、行尾兩個空白換行。',
            'Supported: headings # to ######, **bold**, *italic*, ~~strikethrough~~, `inline code`, ``` fenced code, > blockquotes, - and 1. lists (nestable), - [ ] tasks, --- rules, [text](url) links, | tables |, and a hard break from two trailing spaces.'
          )}
        </p>
        <p className="inst-hint">
          {t(
            l,
            '沒有:參照式連結、底線式標題、直接寫 HTML、腳註、圖片。前四項是刻意留白;圖片是因為這一區不向外抓任何東西,顯示不了,所以會變成一個標示加連結。',
            'Not supported: reference links, setext headings, raw HTML, footnotes, images. The first four are a deliberate gap; images cannot be shown because nothing here fetches anything external, so they render as a label plus a link.'
          )}
        </p>
        <p className="inst-hint">
          {t(
            l,
            '預覽在 <iframe sandbox="" srcdoc> 裡算:轉出來的 HTML 全部經過轉義,而且就算轉義有漏,那個框也不能執行腳本、不能送出表單、碰不到這一頁。你貼進來的東西永遠是文字,不會變成標記。',
            'The preview renders inside <iframe sandbox="" srcdoc>: the generated HTML is fully escaped, and even if the escaping were wrong that frame cannot run scripts, submit forms, or reach this page. What you paste stays text; it never becomes markup.'
          )}
        </p>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '便條', 'notes'), v: count(notes.length) },
          { k: t(l, '字數', 'words'), v: count(measurements.words) },
          { k: t(l, '字元', 'characters'), v: count(measurements.characters) },
          { k: t(l, '行數', 'lines'), v: count(measurements.lines) },
          { k: t(l, '本機占用', 'stored'), v: bytes(storedBytes) },
        ]}
      />
    </div>
  );
}
