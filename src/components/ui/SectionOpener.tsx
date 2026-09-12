/**
 * Magazine-style section opener: a giant hollow serif numeral anchors the
 * seam, with the spec label beside it and an optional serif title below.
 * Use at major section breaks; keep plain SectionHeading for meta rows.
 *
 * Heading contract: every opener emits exactly one `<h2>` carrying the
 * section id, so `<section aria-labelledby={sectionId(no)}>` always
 * resolves. When a `title` is given it is the h2 and the spec label drops
 * to an eyebrow; otherwise the label itself is the h2.
 *
 * The visible label stays English in every locale (engineering-drawing
 * convention), so `name` supplies the localized wording — it lands in the
 * heading text for crawlers and in the accessible name for screen readers.
 */

/** Stable per-page heading id, derived from the section number. */
export function sectionId(no: string) {
  return `sec-${no}`;
}

export function SectionOpener({
  no,
  label,
  title,
  name,
}: {
  no: string;
  label: string;
  /** Serif section title. Takes a node so a title can carry an inline icon. */
  title?: React.ReactNode;
  /** Localized section name — defaults to the English label. */
  name?: string;
}) {
  const id = sectionId(no);
  const Eyebrow = title ? 'p' : 'h2';

  return (
    <div>
      <div className="flex items-end gap-4 md:gap-6">
        <span aria-hidden className="numeral-ghost">
          {no}
        </span>
        <Eyebrow
          id={title ? undefined : id}
          className="pb-2 font-mono text-xs tracking-[0.08em] text-muted md:pb-3"
        >
          <span className="sr-only">
            {no} / {name ?? label}
          </span>
          <span aria-hidden>{label}</span>
        </Eyebrow>
      </div>
      {title && (
        <h2 id={id} className="mt-6 font-serif text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h2>
      )}
    </div>
  );
}
