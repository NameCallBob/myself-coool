/**
 * 逐字進場標題 — 純 CSS 動畫(globals.css .stagger-ch),
 * 讀屏只讀 sr-only 的完整字串;no-JS / reduced-motion 直接顯示。
 */
export function StaggerHeading({
  text,
  id,
  className = '',
}: {
  text: string;
  id?: string;
  className?: string;
}) {
  return (
    <h1 id={id} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {Array.from(text).map((ch, i) => (
          <span
            key={`${i}-${ch}`}
            className="stagger-ch"
            style={{ animationDelay: `${120 + i * 45}ms` }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </span>
    </h1>
  );
}
