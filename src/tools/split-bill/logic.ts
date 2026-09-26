/**
 * Splitting a bill, and then settling it.
 *
 * Three parts, and the third is the one people get wrong by hand.
 *
 * Splitting is per item, not per bill: the two people who shared a bottle of
 * wine owe for the wine, and the person who did not drink does not. Each item
 * carries its participants and, optionally, a weight per participant so a
 * "double portion" or a couple counting as two can be expressed without
 * inventing a fake extra item.
 *
 * Service charge and tip are proportional surcharges on each person's own
 * subtotal, not an equal slice. Splitting a 10% service charge equally is the
 * common shortcut and it quietly transfers money from the person who ordered a
 * salad to the person who ordered the steak.
 *
 * Settling is the interesting one. What everybody actually wants is not "each
 * person's share" but the shortest list of transfers that clears every balance.
 * Greedily matching the largest debtor against the largest creditor gives at
 * most n−1 transfers for n people — usually far fewer — instead of everyone
 * paying everyone.
 *
 * Rounding is handled by largest remainder, so the rounded shares still add up
 * to the bill exactly. Rounding each person independently leaves a few dollars
 * unaccounted for, which is the thing that makes a group argue at the till.
 */

export type Person = { id: string; name: string };

export type Share = {
  person: string;
  /** Relative weight inside this item. 1 is a normal single share. */
  weight: number;
};

export type Item = {
  id: string;
  label: string;
  amount: number;
  /** Who fronted the money for this item. */
  paidBy: string;
  /** Who consumed it, and in what proportion. */
  shares: Share[];
};

export type TipBase = 'subtotal' | 'withService';

export type SplitInput = {
  people: Person[];
  items: Item[];
  /** Service charge, percent of each person's subtotal. */
  servicePercent: number;
  /** Tip, percent. */
  tipPercent: number;
  /** Whether the tip is taken on the subtotal or on subtotal plus service. */
  tipBase: TipBase;
  /**
   * Round each person's total to a multiple of this. 0 leaves exact cents.
   * The residual is redistributed so the rounded shares still sum to the bill.
   */
  roundTo: number;
};

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

export const MAX_PEOPLE = 60;
export const MAX_ITEMS = 200;

export type PersonResult = {
  id: string;
  name: string;
  /** Share of the items, before service and tip. */
  subtotal: number;
  service: number;
  tip: number;
  /** What this person owes in total, after rounding. */
  owes: number;
  /**
   * What this person actually put on the table, including their proportional
   * part of the service charge and tip.
   */
  paid: number;
  /** paid − owes. Positive means they are owed money. */
  net: number;
};

export type Transfer = { from: string; to: string; amount: number };

export type SplitResult = {
  people: PersonResult[];
  subtotal: number;
  service: number;
  tip: number;
  /** Subtotal plus service plus tip — the bill, to the cent. */
  total: number;
  transfers: Transfer[];
  /** Rounding moved this much between people, in total. */
  roundingAdjustment: number;
  /**
   * Rounding cannot put everybody on a whole step *and* add up to the bill
   * unless the bill happens to be on the step too. This is the leftover, and
   * `residualAbsorbedBy` names whoever ends up covering it — in practice the
   * person who is settling with the restaurant.
   */
  roundingResidual: number;
  residualAbsorbedBy: string | null;
};

function validate(input: SplitInput): void {
  if (input.people.length === 0) throw new SplitError('there is nobody to split between');
  if (input.people.length > MAX_PEOPLE) throw new SplitError(`at most ${MAX_PEOPLE} people`);
  if (input.items.length > MAX_ITEMS) throw new SplitError(`at most ${MAX_ITEMS} items`);

  const ids = new Set<string>();
  for (const person of input.people) {
    if (person.id === '') throw new SplitError('a person needs an id');
    if (ids.has(person.id)) throw new SplitError(`two people share the id ${person.id}`);
    ids.add(person.id);
  }

  for (const item of input.items) {
    if (!Number.isFinite(item.amount) || item.amount < 0) {
      throw new SplitError(`"${item.label || item.id}" has no usable amount`);
    }
    if (!ids.has(item.paidBy)) {
      throw new SplitError(`"${item.label || item.id}" is paid by somebody not in the group`);
    }
    if (item.shares.length === 0) {
      throw new SplitError(`"${item.label || item.id}" has nobody sharing it`);
    }
    let total = 0;
    for (const share of item.shares) {
      if (!ids.has(share.person)) {
        throw new SplitError(`"${item.label || item.id}" is shared with somebody not in the group`);
      }
      if (!Number.isFinite(share.weight) || share.weight <= 0) {
        throw new SplitError(`"${item.label || item.id}" has a share weight that is not positive`);
      }
      total += share.weight;
    }
    if (total <= 0) throw new SplitError(`"${item.label || item.id}" has no share weights`);
  }

  for (const [value, label] of [
    [input.servicePercent, 'service charge'],
    [input.tipPercent, 'tip'],
  ] as [number, string][]) {
    if (!Number.isFinite(value) || value < 0) throw new SplitError(`the ${label} cannot be negative`);
  }
  if (!Number.isFinite(input.roundTo) || input.roundTo < 0) {
    throw new SplitError('the rounding step cannot be negative');
  }
}

/**
 * Rounds a set of amounts to a multiple of `step` so that the rounded values
 * still sum to the same total.
 *
 * Largest remainder: floor everybody, work out how many steps are missing, and
 * give them to the people whose fraction was largest. Rounding each amount on
 * its own leaves the group short or over by a few dollars, which is exactly the
 * discrepancy that starts the argument.
 */
export function roundShares(amounts: readonly number[], step: number): number[] {
  if (step <= 0) return amounts.slice();
  if (amounts.length === 0) return [];

  const total = amounts.reduce((sum, value) => sum + value, 0);
  const targetSteps = Math.round(total / step);

  const floored = amounts.map((value) => Math.floor(value / step));
  const used = floored.reduce((sum, value) => sum + value, 0);
  // Σfloor(x) ≤ floor(Σx) ≤ round(Σx) for non-negative amounts, so `missing` is
  // never negative and is at most one step per person — a single pass suffices.
  const missing = Math.max(0, targetSteps - used);

  const order = amounts
    .map((value, index) => ({ index, remainder: value / step - Math.floor(value / step) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const out = floored.slice();
  for (let i = 0; i < missing && i < order.length; i += 1) {
    out[order[i].index] += 1;
  }

  return out.map((steps) => steps * step);
}

/**
 * Clears every balance with as few transfers as possible.
 *
 * Greedy largest-against-largest. The exactly-minimal version of this problem is
 * NP-hard, but greedy always lands within n−1 transfers and on real groups is
 * almost always optimal — and an exact solver would spend exponential time to
 * save nobody a payment.
 */
export function settle(balances: readonly { id: string; net: number }[], epsilon = 0.005): Transfer[] {
  const creditors = balances
    .filter((entry) => entry.net > epsilon)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.net - a.net);
  const debtors = balances
    .filter((entry) => entry.net < -epsilon)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => a.net - b.net);

  const transfers: Transfer[] = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const owed = creditors[c].net;
    const owing = -debtors[d].net;
    const amount = Math.min(owed, owing);
    if (amount > epsilon) {
      transfers.push({ from: debtors[d].id, to: creditors[c].id, amount });
    }
    creditors[c].net -= amount;
    debtors[d].net += amount;
    if (creditors[c].net <= epsilon) c += 1;
    if (debtors[d].net >= -epsilon) d += 1;
  }
  return transfers;
}

export function computeSplit(input: SplitInput): SplitResult {
  validate(input);

  const subtotals = new Map<string, number>();
  const fronted = new Map<string, number>();
  for (const person of input.people) {
    subtotals.set(person.id, 0);
    fronted.set(person.id, 0);
  }

  for (const item of input.items) {
    const weightTotal = item.shares.reduce((sum, share) => sum + share.weight, 0);
    for (const share of item.shares) {
      const amount = (item.amount * share.weight) / weightTotal;
      subtotals.set(share.person, (subtotals.get(share.person) ?? 0) + amount);
    }
    fronted.set(item.paidBy, (fronted.get(item.paidBy) ?? 0) + item.amount);
  }

  const serviceRate = input.servicePercent / 100;
  const tipRate = input.tipPercent / 100;

  const exact = input.people.map((person) => {
    const subtotal = subtotals.get(person.id) ?? 0;
    const service = subtotal * serviceRate;
    const tipOn = input.tipBase === 'withService' ? subtotal + service : subtotal;
    const tip = tipOn * tipRate;
    return { person, subtotal, service, tip, owes: subtotal + service + tip };
  });

  const subtotal = exact.reduce((sum, entry) => sum + entry.subtotal, 0);
  const service = exact.reduce((sum, entry) => sum + entry.service, 0);
  const tip = exact.reduce((sum, entry) => sum + entry.tip, 0);
  const total = subtotal + service + tip;

  /**
   * The service charge and tip were on the same bill as the items, so whoever
   * fronted an item fronted that item's surcharge too. Scaling each payer's
   * fronted amount by the bill's surcharge factor is what makes the paid side
   * and the owed side add up to the same number — without it a 10% service
   * charge looks like money nobody handed over.
   */
  const surchargeFactor = subtotal > 0 ? total / subtotal : 1;

  const rounded = roundShares(
    exact.map((entry) => entry.owes),
    input.roundTo
  );

  // Rounding almost never lands on the bill exactly. Somebody covers the
  // difference, and the realistic somebody is whoever fronted the most.
  const residual = total - rounded.reduce((sum, value) => sum + value, 0);
  let absorber = -1;
  if (Math.abs(residual) > 1e-9) {
    let most = -1;
    for (let i = 0; i < input.people.length; i += 1) {
      const amount = fronted.get(input.people[i].id) ?? 0;
      if (amount > most) {
        most = amount;
        absorber = i;
      }
    }
    if (absorber >= 0) rounded[absorber] += residual;
  }

  const people: PersonResult[] = exact.map((entry, index) => {
    const owes = rounded[index];
    const paid = (fronted.get(entry.person.id) ?? 0) * surchargeFactor;
    return {
      id: entry.person.id,
      name: entry.person.name,
      subtotal: entry.subtotal,
      service: entry.service,
      tip: entry.tip,
      owes,
      paid,
      net: paid - owes,
    };
  });

  const roundingAdjustment = people.reduce(
    (sum, person, index) => sum + Math.abs(person.owes - exact[index].owes),
    0
  );

  return {
    people,
    subtotal,
    service,
    tip,
    total,
    transfers: settle(people.map((person) => ({ id: person.id, net: person.net }))),
    roundingAdjustment,
    roundingResidual: residual,
    residualAbsorbedBy: absorber >= 0 ? input.people[absorber].id : null,
  };
}

/** Everybody shares everything equally — the common case, as one call. */
export function evenShares(people: readonly Person[]): Share[] {
  return people.map((person) => ({ person: person.id, weight: 1 }));
}

export function money(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
