/**
 * Magazine-style section opener: a giant hollow serif numeral anchors the
 * seam, with the spec label beside it and an optional serif title below.
 * Use at major section breaks; keep plain SectionHeading for meta rows.
 */
export function SectionOpener({
  no,
  label,
  title,
}: {
  no: string;
  label: string;
  title?: string;
}) {
  return (
    <div>
      <div className="flex items-end gap-4 md:gap-6">
        <span aria-hidden className="numeral-ghost">
          {no}
        </span>
        <p className="pb-2 font-mono text-xs tracking-[0.08em] text-muted md:pb-3">
          <span className="sr-only">{no} / </span>
          {label}
        </p>
      </div>
      {title && (
        <h2 className="mt-6 font-serif text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h2>
      )}
    </div>
  );
}
