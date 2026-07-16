/**
 * Blueprint vertical guide lines — the site's structural signature.
 * Two lines on mobile (container edges), four on desktop (+ thirds).
 */
export function GridGuides() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 mx-auto w-full max-w-[1200px] px-5 md:px-6"
    >
      <div className="relative h-full">
        <div className="guide-line left-0" />
        <div className="guide-line right-0" />
        <div className="guide-line left-1/3 hidden lg:block" />
        <div className="guide-line left-2/3 hidden lg:block" />
      </div>
    </div>
  );
}
