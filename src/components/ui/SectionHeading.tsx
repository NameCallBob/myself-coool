/**
 * Numbered spec-style section heading — `[NN / LABEL]` in mono.
 * Labels stay English in every locale (engineering-drawing convention).
 */
export function SectionHeading({ no, label }: { no: string; label: string }) {
  return (
    <p className="font-mono text-xs tracking-[0.08em] text-muted">
      <span className="text-accent">{no}</span> / {label}
    </p>
  );
}
