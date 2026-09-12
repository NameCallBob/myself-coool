/**
 * Avatar — hand-drawn line portrait.
 *
 * Deliberately a drawing, not a filtered photograph: no real face appears on
 * the site. The likeness is carried by the three things that actually read at
 * small sizes — the heavy fringe, the big square metal frames, the round jaw —
 * everything else is dropped.
 *
 * Drawn in the site's own ink: strokes inherit `currentColor`, the frames take
 * the red accent, so it re-themes with the page instead of being a flat asset.
 */
export function Avatar({
  size = 168,
  className = '',
  title,
}: {
  size?: number;
  className?: string;
  title: string;
}) {
  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 200 224"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Shoulders / v-neck tee */}
      <path
        d="M34 224c2-28 14-42 34-49l32 30 32-30c20 7 32 21 34 49"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M74 176l26 25 26-25" stroke="currentColor" strokeWidth="2.4" opacity="0.55" />

      {/* Neck */}
      <path d="M82 158v16M118 158v16" stroke="currentColor" strokeWidth="3" />

      {/* Head */}
      <path
        d="M50 106c0-34 20-56 50-56s50 22 50 56c0 32-18 60-50 60s-50-28-50-60Z"
        stroke="currentColor"
        strokeWidth="3"
      />

      {/* Ears */}
      <path d="M50 108c-6-2-9 3-8 9s5 10 9 9" stroke="currentColor" strokeWidth="2.6" />
      <path d="M150 108c6-2 9 3 8 9s-5 10-9 9" stroke="currentColor" strokeWidth="2.6" />

      {/* Hair — short, heavy fringe, a few strands that never behave */}
      <path
        d="M48 104c-3-32 16-58 52-58s55 26 52 58c-4-14-10-22-18-27-6 9-14 12-24 10 2 7 0 12-6 15-8-9-18-13-30-12-12 1-21 6-26 14Z"
        fill="currentColor"
      />
      <path
        d="M78 46c4-6 10-9 18-10M112 37c10 1 18 5 24 12"
        stroke="currentColor"
        strokeWidth="2.4"
        opacity="0.5"
      />
      <path d="M96 34c-2-6-1-10 3-13M108 33c1-5 4-8 9-9" stroke="currentColor" strokeWidth="2.4" />

      {/* Brows */}
      <path d="M64 96c8-5 17-6 26-3M110 93c9-3 18-2 26 3" stroke="currentColor" strokeWidth="3" />

      {/* Glasses — the signature. Big, thin, squared-off metal frames. */}
      <rect
        x="52"
        y="102"
        width="42"
        height="36"
        rx="11"
        stroke="var(--accent)"
        strokeWidth="3.2"
      />
      <rect
        x="106"
        y="102"
        width="42"
        height="36"
        rx="11"
        stroke="var(--accent)"
        strokeWidth="3.2"
      />
      <path d="M94 116h12" stroke="var(--accent)" strokeWidth="3.2" />
      <path d="M52 112l-9-4M148 112l9-4" stroke="var(--accent)" strokeWidth="3.2" />

      {/* Eyes */}
      <circle cx="73" cy="120" r="4.6" fill="currentColor" />
      <circle cx="127" cy="120" r="4.6" fill="currentColor" />
      {/* the catchlight that stops a face looking asleep */}
      <circle cx="71.4" cy="118.4" r="1.5" fill="var(--bg-raised)" />
      <circle cx="125.4" cy="118.4" r="1.5" fill="var(--bg-raised)" />

      {/* Nose + closed-mouth half smile */}
      <path d="M100 126v11c0 3-2 4-5 4" stroke="currentColor" strokeWidth="2.6" opacity="0.65" />
      <path d="M86 150c9 6 19 6 28 0" stroke="currentColor" strokeWidth="3" />

      {/* Plate marks — the same drafting language as the rest of the site */}
      <path d="M8 8h10M13 3v10" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <path d="M182 8h10M187 3v10" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
    </svg>
  );
}

/**
 * A hanging frame. Used for the avatar and for the wall of framed plates —
 * mount, bevel, glass sheen and a very slight tilt, so a grid of them reads as
 * pictures on a wall rather than as a card grid.
 */
export function Frame({
  children,
  caption,
  tilt = 0,
  className = '',
}: {
  children: React.ReactNode;
  caption?: string;
  tilt?: number;
  className?: string;
}) {
  return (
    <figure
      className={`frame ${className}`}
      style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}
    >
      <div className="frame-mount">
        <div className="frame-plate">{children}</div>
      </div>
      {caption && <figcaption className="frame-caption">{caption}</figcaption>}
    </figure>
  );
}
