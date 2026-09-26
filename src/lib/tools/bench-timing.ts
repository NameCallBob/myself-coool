/**
 * Timing helper for the few tests that guard against a complexity regression.
 *
 * A wall-clock assertion on a loaded machine measures the machine, not the
 * code: one scheduler preemption during the larger run turns "four times the
 * input" into "thirty times the time" and the suite goes red for no reason.
 * The usual response is to loosen the bound until it stops failing, at which
 * point the test no longer guards anything.
 *
 * So the estimator is the *minimum* of several runs. Noise on a timer only
 * ever adds time — a run cannot finish faster than the work takes — so the
 * fastest observed run is the closest estimate of the real cost, and it is
 * stable across a busy machine in a way that a single run or a mean is not.
 *
 * This lives outside any tool because three drawers needed the same thing and
 * three slightly different copies is how the bound drifts apart.
 */
export function fastestOf(run: () => void, attempts = 5): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < attempts; i += 1) {
    const started = performance.now();
    run();
    const elapsed = performance.now() - started;
    if (elapsed < best) best = elapsed;
  }
  return best;
}

/**
 * Asserts that `large` did not cost disproportionately more than `small`.
 *
 * `floor` keeps a sub-millisecond baseline from making the ratio meaningless:
 * when the smaller run is too fast to measure, any jitter in the larger one
 * looks like a blow-up.
 */
export function scaledWithin(
  small: number,
  large: number,
  factor: number,
  floor = 2
): { ok: boolean; detail: string } {
  const base = Math.max(small, floor);
  return {
    ok: large < base * factor,
    detail: `small ${small.toFixed(2)}ms, large ${large.toFixed(2)}ms, allowed ${(base * factor).toFixed(2)}ms`,
  };
}
