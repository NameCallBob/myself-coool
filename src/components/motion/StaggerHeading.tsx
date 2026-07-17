/**
 * Character-by-character reveal heading — pure CSS animation
 * (globals.css .stagger-ch). Screen readers get the sr-only full
 * string; no-JS / reduced-motion renders it plainly.
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
