'use client';

/**
 * The bench kit: every control a tool is allowed to use.
 *
 * One shared module rather than a component per file, because these are small,
 * always used together, and a hundred tools importing from one place is what
 * keeps them looking like one instrument rather than a hundred.
 *
 * House rules enforced here:
 *  - No user input is ever passed to `dangerouslySetInnerHTML`.
 *  - Results are announced through a live region, not a toast.
 *  - Copy happens inside the click handler, never on a timer or on mount.
 */

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { t, type Loc } from '@/lib/tools/locale';

/* ── Layout ───────────────────────────────── */

/**
 * Input on the left, result on the right, a measured seam between them.
 * The seam is inserted here rather than left to each tool so the split is
 * identical across the whole bench.
 */
export function Bench({
  left,
  right,
  leftLabel,
  rightLabel,
  leftAside,
  rightAside,
}: {
  left: ReactNode;
  right: ReactNode;
  leftLabel: string;
  rightLabel: string;
  leftAside?: ReactNode;
  rightAside?: ReactNode;
}) {
  return (
    <div className="inst-bench">
      <section>
        <div className="inst-pane-label">
          <span>{leftLabel}</span>
          {leftAside}
        </div>
        {left}
      </section>
      <div className="inst-seam" aria-hidden="true" />
      <section>
        <div className="inst-pane-label">
          <span>{rightLabel}</span>
          {rightAside}
        </div>
        {right}
      </section>
    </div>
  );
}

/** A single full-width working area, for tools that are not input→output. */
export function Panel({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="inst-pane-label">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="inst-toolbar">{children}</div>;
}

/* ── Fields ───────────────────────────────── */

function Wrapper({
  label,
  hint,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="inst-field">
      {label ? (
        <label className="inst-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <p className="inst-hint">{hint}</p> : null}
    </div>
  );
}

export function Area({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows,
  invalid,
  spellCheck = false,
  readOnly,
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  spellCheck?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        className="inst-area"
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={spellCheck}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value)}
      />
    </Wrapper>
  );
}

export function Input({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  step,
  invalid,
  autoComplete = 'off',
}: {
  label?: string;
  hint?: string;
  value: string | number;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'password' | 'date' | 'time' | 'datetime-local' | 'color';
  min?: number | string;
  max?: number | string;
  step?: number | string;
  invalid?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="inst-input"
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </Wrapper>
  );
}

export function Select<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label?: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <Wrapper label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        className="inst-select"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function Check2({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inst-status" style={{ cursor: 'pointer', gap: '0.4rem' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ accentColor: 'var(--accent)' }}
      />
      <span style={{ color: 'var(--fg-muted)', letterSpacing: 0 }}>{label}</span>
    </label>
  );
}

/** Mutually exclusive switch. Uses aria-pressed, so it reads as buttons. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inst-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  primary,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="inst-btn"
      data-primary={primary ? 'true' : undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ── Output ───────────────────────────────── */

/** Read-only result surface. Text only — never interpreted as markup. */
export function Out({ value, empty }: { value: string; empty?: string }) {
  return (
    <div className="inst-out" aria-live="polite" aria-atomic="false">
      {value || <span style={{ color: 'var(--fg-faint)' }}>{empty ?? ''}</span>}
    </div>
  );
}

export function Note({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      className="inst-hint"
      role={error ? 'alert' : undefined}
      style={error ? { color: 'var(--accent)' } : undefined}
    >
      {children}
    </p>
  );
}

/**
 * The measurement strip. Every tool ends with one, and it always closes with
 * where the work happened — the privacy claim stated as a reading rather than
 * a badge, in the same place, in the same type, on all hundred tools.
 */
export function Readout({
  l,
  items,
}: {
  l: Loc;
  items: { k: string; v: string }[];
}) {
  return (
    <dl className="inst-readout">
      {items.map((item) => (
        <div key={item.k}>
          <dt>{item.k}</dt>
          <dd>{item.v}</dd>
        </div>
      ))}
      <div>
        <dt>{t(l, '運算位置', 'computed')}</dt>
        <dd>{t(l, '本分頁', 'this tab')}</dd>
      </div>
    </dl>
  );
}

export function CopyButton({ l, text, label }: { l: Loc; text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1400);
    } catch {
      // Clipboard write can be refused outright (permissions policy, older
      // Safari). Say so instead of pretending it worked.
      setDone(false);
      window.alert(t(l, '瀏覽器拒絕寫入剪貼簿,請手動選取複製。', 'The browser refused clipboard access — select and copy manually.'));
    }
  }, [l, text]);

  return (
    <Btn onClick={copy} disabled={!text}>
      {done ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.5} />}
      {done ? t(l, '已複製', 'copied') : (label ?? t(l, '複製', 'copy'))}
    </Btn>
  );
}

export function ResetButton({ l, onReset }: { l: Loc; onReset: () => void }) {
  return (
    <Btn onClick={onReset}>
      <RotateCcw size={12} strokeWidth={1.5} />
      {t(l, '清空', 'clear')}
    </Btn>
  );
}

/* ── Files ────────────────────────────────── */

/**
 * File intake. There is no upload: the handler receives a `File` and reads it
 * with FileReader / arrayBuffer in this tab. `accept` is a hint to the picker,
 * so callers still have to validate what they get.
 */
export function DropZone({
  l,
  onFiles,
  accept,
  multiple,
  hint,
}: {
  l: Loc;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div className="inst-field">
      <button
        type="button"
        className="inst-drop"
        data-over={over ? 'true' : undefined}
        onClick={() => input.current?.click()}
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer?.files ?? null);
        }}
      >
        {hint ?? t(l, '把檔案拖到這裡,或點一下選檔', 'Drop a file here, or click to choose')}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = '';
        }}
      />
      <p className="inst-hint">
        {t(l, '檔案在這個分頁裡讀取,不會離開這台裝置。', 'Files are read in this tab and never leave this device.')}
      </p>
    </div>
  );
}

/* ── Tables ───────────────────────────────── */

export function Table({
  head,
  rows,
  align,
}: {
  head: string[];
  rows: ReactNode[][];
  align?: ('left' | 'right')[];
}) {
  return (
    <div className="inst-scroll">
      <table className="inst-table">
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={cell} style={{ textAlign: align?.[i] ?? 'left' }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ textAlign: align?.[j] ?? 'left' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
