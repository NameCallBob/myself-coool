import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ITEMS,
  MAX_PEOPLE,
  SplitError,
  computeSplit,
  evenShares,
  money,
  roundShares,
  settle,
  type Item,
  type Person,
  type SplitInput,
} from './logic.ts';

const near = (actual: number, expected: number, tolerance = 1e-9, message?: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${expected}, got ${actual}`
  );
};

const people: Person[] = [
  { id: 'a', name: '阿明' },
  { id: 'b', name: '小美' },
  { id: 'c', name: 'Chris' },
];

const item = (over: Partial<Item> & { id: string; amount: number; paidBy: string }): Item => ({
  label: over.id,
  shares: evenShares(people),
  ...over,
});

const split = (over: Partial<SplitInput> = {}): SplitInput => ({
  people,
  items: [],
  servicePercent: 0,
  tipPercent: 0,
  tipBase: 'subtotal',
  roundTo: 0,
  ...over,
});

test('evenShares gives everybody one share', () => {
  assert.deepEqual(evenShares(people), [
    { person: 'a', weight: 1 },
    { person: 'b', weight: 1 },
    { person: 'c', weight: 1 },
  ]);
  assert.deepEqual(evenShares([]), []);
});

test('an evenly split bill paid by one person is owed back by the others', () => {
  const result = computeSplit(split({ items: [item({ id: 'dinner', amount: 900, paidBy: 'a' })] }));
  near(result.subtotal, 900);
  near(result.total, 900);
  for (const person of result.people) near(person.owes, 300);
  near(result.people[0].net, 600, 1e-9, 'the payer is owed the other two shares');
  near(result.people[1].net, -300);
  assert.equal(result.transfers.length, 2);
  for (const transfer of result.transfers) {
    assert.equal(transfer.to, 'a');
    near(transfer.amount, 300);
  }
});

test('per-item participants mean the person who did not share does not pay', () => {
  const result = computeSplit(
    split({
      items: [
        item({ id: 'food', amount: 900, paidBy: 'a' }),
        item({
          id: 'wine',
          amount: 1200,
          paidBy: 'b',
          shares: [
            { person: 'a', weight: 1 },
            { person: 'b', weight: 1 },
          ],
        }),
      ],
    })
  );
  const byId = new Map(result.people.map((person) => [person.id, person]));
  near(byId.get('a')!.owes, 300 + 600);
  near(byId.get('b')!.owes, 300 + 600);
  near(byId.get('c')!.owes, 300, 1e-9, 'Chris had no wine');
  near(result.total, 2100);
});

test('weights express a double portion without a fake extra item', () => {
  const result = computeSplit(
    split({
      items: [
        item({
          id: 'hotpot',
          amount: 1000,
          paidBy: 'a',
          shares: [
            { person: 'a', weight: 2 },
            { person: 'b', weight: 1 },
            { person: 'c', weight: 1 },
          ],
        }),
      ],
    })
  );
  const byId = new Map(result.people.map((person) => [person.id, person]));
  near(byId.get('a')!.owes, 500);
  near(byId.get('b')!.owes, 250);
  near(byId.get('c')!.owes, 250);
  // Fractional weights work the same way.
  const half = computeSplit(
    split({
      items: [
        item({
          id: 'kid',
          amount: 300,
          paidBy: 'a',
          shares: [
            { person: 'a', weight: 1 },
            { person: 'b', weight: 0.5 },
          ],
        }),
      ],
    })
  );
  near(half.people[0].owes, 200);
  near(half.people[1].owes, 100);
});

test('service charge is proportional to each subtotal, not split equally', () => {
  const result = computeSplit(
    split({
      servicePercent: 10,
      items: [
        item({ id: 'steak', amount: 1000, paidBy: 'a', shares: [{ person: 'a', weight: 1 }] }),
        item({ id: 'salad', amount: 200, paidBy: 'a', shares: [{ person: 'b', weight: 1 }] }),
      ],
    })
  );
  const byId = new Map(result.people.map((person) => [person.id, person]));
  near(byId.get('a')!.service, 100, 1e-9);
  near(byId.get('b')!.service, 20, 1e-9, 'the salad pays 10% of the salad');
  near(byId.get('c')!.service, 0);
  near(result.service, 120);
  near(result.total, 1320);
  // Splitting the 120 equally would have charged the salad 40 instead of 20.
  assert.ok(byId.get('b')!.service < 40);
});

test('the tip can be taken on the subtotal or on subtotal plus service', () => {
  const onSubtotal = computeSplit(
    split({
      servicePercent: 10,
      tipPercent: 10,
      tipBase: 'subtotal',
      items: [item({ id: 'meal', amount: 1000, paidBy: 'a', shares: [{ person: 'a', weight: 1 }] })],
    })
  );
  near(onSubtotal.tip, 100);
  near(onSubtotal.total, 1200);

  const onGross = computeSplit(
    split({
      servicePercent: 10,
      tipPercent: 10,
      tipBase: 'withService',
      items: [item({ id: 'meal', amount: 1000, paidBy: 'a', shares: [{ person: 'a', weight: 1 }] })],
    })
  );
  near(onGross.tip, 110, 1e-9, '10% of 1 100');
  near(onGross.total, 1210);
});

test('several payers net out to the fewest transfers', () => {
  const result = computeSplit(
    split({
      items: [
        item({ id: 'lunch', amount: 300, paidBy: 'a' }),
        item({ id: 'coffee', amount: 300, paidBy: 'b' }),
        item({ id: 'taxi', amount: 300, paidBy: 'c' }),
      ],
    })
  );
  // Everybody paid 300 and owes 300: nothing to settle.
  for (const person of result.people) near(person.net, 0);
  assert.equal(result.transfers.length, 0);
});

test('settle clears every balance and never invents money', () => {
  const balances = [
    { id: 'a', net: 600 },
    { id: 'b', net: -250 },
    { id: 'c', net: -350 },
  ];
  const transfers = settle(balances);
  assert.equal(transfers.length, 2);
  const moved = new Map<string, number>();
  for (const transfer of transfers) {
    moved.set(transfer.from, (moved.get(transfer.from) ?? 0) - transfer.amount);
    moved.set(transfer.to, (moved.get(transfer.to) ?? 0) + transfer.amount);
  }
  // A positive net means money flows towards that person.
  for (const balance of balances) {
    near(moved.get(balance.id) ?? 0, balance.net, 1e-9, balance.id);
  }
  near(
    transfers.reduce((sum, transfer) => sum + transfer.amount, 0),
    600
  );
});

test('settle produces at most n−1 transfers on a messy group', () => {
  const balances = [
    { id: 'a', net: 100 },
    { id: 'b', net: 250 },
    { id: 'c', net: -75 },
    { id: 'd', net: -125 },
    { id: 'e', net: -150 },
  ];
  const transfers = settle(balances);
  assert.ok(transfers.length <= balances.length - 1, `${transfers.length} transfers`);
  const net = new Map(balances.map((entry) => [entry.id, entry.net]));
  for (const transfer of transfers) {
    net.set(transfer.from, (net.get(transfer.from) ?? 0) + transfer.amount);
    net.set(transfer.to, (net.get(transfer.to) ?? 0) - transfer.amount);
  }
  for (const [id, remaining] of net) near(remaining, 0, 1e-9, id);
});

test('settle ignores balances inside the epsilon and an already-square group', () => {
  assert.deepEqual(settle([{ id: 'a', net: 0 }, { id: 'b', net: 0 }]), []);
  assert.deepEqual(settle([{ id: 'a', net: 0.001 }, { id: 'b', net: -0.001 }]), []);
  assert.deepEqual(settle([]), []);
  assert.equal(settle([{ id: 'a', net: 10 }]).length, 0, 'a lone creditor has nobody to collect from');
});

test('roundShares keeps the rounded shares adding up to the bill', () => {
  // 1000 between three is 333.33…; rounded to dollars the three must still be 1000.
  const thirds = roundShares([1000 / 3, 1000 / 3, 1000 / 3], 1);
  assert.equal(
    thirds.reduce((sum, value) => sum + value, 0),
    1000
  );
  assert.deepEqual(thirds.slice().sort((a, b) => a - b), [333, 333, 334]);

  // To the nearest 10.
  const tens = roundShares([333.33, 333.33, 333.34], 10);
  assert.equal(
    tens.reduce((sum, value) => sum + value, 0),
    1000
  );

  // Step zero means no rounding at all.
  assert.deepEqual(roundShares([1.5, 2.5], 0), [1.5, 2.5]);
  assert.deepEqual(roundShares([], 1), []);
  assert.deepEqual(roundShares([7], 1), [7]);
  assert.deepEqual(roundShares([0, 0, 10], 1), [0, 0, 10]);
});

test('roundShares gives the extra unit to the largest remainder', () => {
  // 10.9 + 10.05 + 10.05 = 31. The 0.9 gets the spare dollar.
  const out = roundShares([10.9, 10.05, 10.05], 1);
  assert.deepEqual(out, [11, 10, 10]);
  assert.equal(out.reduce((sum, value) => sum + value, 0), 31);
});

test('rounding inside computeSplit still balances the group', () => {
  const result = computeSplit(
    split({ roundTo: 1, items: [item({ id: 'dinner', amount: 1000, paidBy: 'a' })] })
  );
  assert.equal(result.total, 1000);
  const owed = result.people.map((person) => person.owes);
  assert.deepEqual(owed.slice().sort((a, b) => a - b), [333, 333, 334]);
  near(
    result.people.reduce((sum, person) => sum + person.net, 0),
    0,
    1e-9,
    'the nets must cancel'
  );
  assert.ok(result.roundingAdjustment > 0 && result.roundingAdjustment < 3);
  // Transfers are whole dollars too, because the balances are.
  for (const transfer of result.transfers) {
    assert.equal(Number.isInteger(transfer.amount), true);
  }
});

test('rounding to 10 or 100 balances, with one person covering the leftover', () => {
  for (const step of [5, 10, 50, 100]) {
    const result = computeSplit(
      split({ roundTo: step, items: [item({ id: 'trip', amount: 7777, paidBy: 'b' })] })
    );
    // Whatever the step, the group still settles to zero and the bill is 7 777.
    near(
      result.people.reduce((sum, person) => sum + person.net, 0),
      0,
      1e-9,
      `step ${step}`
    );
    near(
      result.people.reduce((sum, person) => sum + person.owes, 0),
      7777,
      1e-9,
      `step ${step}`
    );
    // Everyone except the person covering the leftover lands on the step.
    assert.equal(result.residualAbsorbedBy, 'b', `step ${step}`);
    for (const person of result.people) {
      if (person.id === result.residualAbsorbedBy) continue;
      assert.equal(person.owes % step, 0, `step ${step}: ${person.owes}`);
    }
  }
});

test('the surcharge is fronted by whoever fronted the items it sat on', () => {
  const result = computeSplit(
    split({
      servicePercent: 10,
      items: [
        item({ id: 'food', amount: 3000, paidBy: 'a' }),
        item({ id: 'drink', amount: 600, paidBy: 'b' }),
      ],
    })
  );
  // The bill is 3 600 + 10% = 3 960, and it was all on one receipt.
  near(result.total, 3960);
  const byId = new Map(result.people.map((person) => [person.id, person]));
  near(byId.get('a')!.paid, 3300, 1e-9, '3 000 of items plus their 10%');
  near(byId.get('b')!.paid, 660, 1e-9);
  near(
    result.people.reduce((sum, person) => sum + person.paid, 0),
    3960,
    1e-9,
    'the paid side must equal the bill'
  );
  near(
    result.people.reduce((sum, person) => sum + person.net, 0),
    0,
    1e-9
  );
});

test('a bill with no items costs nobody anything', () => {
  const result = computeSplit(split());
  near(result.total, 0);
  assert.deepEqual(result.transfers, []);
  for (const person of result.people) {
    near(person.owes, 0);
    near(person.net, 0);
  }
});

test('one person alone owes the whole bill and is owed nothing', () => {
  const result = computeSplit(
    split({
      people: [{ id: 'a', name: 'solo' }],
      items: [
        {
          id: 'meal',
          label: 'meal',
          amount: 480,
          paidBy: 'a',
          shares: [{ person: 'a', weight: 1 }],
        },
      ],
    })
  );
  near(result.people[0].owes, 480);
  near(result.people[0].net, 0);
  assert.deepEqual(result.transfers, []);
});

test('a zero-amount item is allowed and changes nothing', () => {
  const result = computeSplit(
    split({ items: [item({ id: 'free', amount: 0, paidBy: 'a' })] })
  );
  near(result.total, 0);
  for (const person of result.people) near(person.owes, 0);
});

test('bad input is refused with a reason', () => {
  assert.throws(() => computeSplit(split({ people: [] })), /nobody to split/);
  assert.throws(
    () => computeSplit(split({ people: [{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }] })),
    /share the id/
  );
  assert.throws(() => computeSplit(split({ people: [{ id: '', name: 'x' }] })), /needs an id/);
  assert.throws(
    () => computeSplit(split({ items: [item({ id: 'x', amount: -1, paidBy: 'a' })] })),
    /no usable amount/
  );
  assert.throws(
    () => computeSplit(split({ items: [item({ id: 'x', amount: 10, paidBy: 'zzz' })] })),
    /not in the group/
  );
  assert.throws(
    () => computeSplit(split({ items: [item({ id: 'x', amount: 10, paidBy: 'a', shares: [] })] })),
    /nobody sharing it/
  );
  assert.throws(
    () =>
      computeSplit(
        split({ items: [item({ id: 'x', amount: 10, paidBy: 'a', shares: [{ person: 'zzz', weight: 1 }] })] })
      ),
    /not in the group/
  );
  assert.throws(
    () =>
      computeSplit(
        split({ items: [item({ id: 'x', amount: 10, paidBy: 'a', shares: [{ person: 'a', weight: 0 }] })] })
      ),
    /not positive/
  );
  assert.throws(() => computeSplit(split({ servicePercent: -1 })), /service charge/);
  assert.throws(() => computeSplit(split({ tipPercent: -1 })), /tip cannot be negative/);
  assert.throws(() => computeSplit(split({ roundTo: -1 })), /rounding step/);
  assert.throws(
    () => computeSplit(split({ people: Array.from({ length: MAX_PEOPLE + 1 }, (_, i) => ({ id: `p${i}`, name: `p${i}` })) })),
    /at most 60 people/
  );
  assert.throws(
    () =>
      computeSplit(
        split({
          items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) =>
            item({ id: `i${i}`, amount: 1, paidBy: 'a' })
          ),
        })
      ),
    /at most 200 items/
  );
  assert.ok(new SplitError('x') instanceof Error);
});

test('a real dinner, checked by hand', () => {
  // Four people. A pays the food, B pays the drinks, C had no alcohol, D came
  // late and only shared dessert. 10% service, no tip, rounded to dollars.
  const four: Person[] = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ];
  const result = computeSplit({
    people: four,
    items: [
      { id: 'food', label: 'food', amount: 2400, paidBy: 'a', shares: evenShares(four.slice(0, 3)) },
      {
        id: 'beer',
        label: 'beer',
        amount: 900,
        paidBy: 'b',
        shares: [
          { person: 'a', weight: 1 },
          { person: 'b', weight: 2 },
        ],
      },
      { id: 'dessert', label: 'dessert', amount: 400, paidBy: 'a', shares: evenShares(four) },
    ],
    servicePercent: 10,
    tipPercent: 0,
    tipBase: 'subtotal',
    roundTo: 1,
  });

  const byId = new Map(result.people.map((person) => [person.id, person]));
  // Subtotals: A 800 + 300 + 100 = 1200; B 800 + 600 + 100 = 1500;
  // C 800 + 100 = 900; D 100.
  near(byId.get('a')!.subtotal, 1200);
  near(byId.get('b')!.subtotal, 1500);
  near(byId.get('c')!.subtotal, 900);
  near(byId.get('d')!.subtotal, 100);
  near(result.subtotal, 3700);
  near(result.service, 370);
  // Owed with 10% service: 1320, 1650, 990, 110 — all whole, so no rounding.
  assert.equal(byId.get('a')!.owes, 1320);
  assert.equal(byId.get('b')!.owes, 1650);
  assert.equal(byId.get('c')!.owes, 990);
  assert.equal(byId.get('d')!.owes, 110);
  assert.equal(result.total, 4070);
  // A fronted 2800, B fronted 900.
  // The 10% service charge rode on the same receipts, so the fronted amounts
  // scale by 1.1: A fronted 2 800 of items, therefore 3 080 of bill.
  near(byId.get('a')!.paid, 3080);
  near(byId.get('b')!.paid, 990);
  near(byId.get('a')!.net, 1760);
  near(byId.get('b')!.net, -660);
  near(
    result.people.reduce((sum, person) => sum + person.net, 0),
    0
  );
  assert.ok(result.transfers.length <= 3);
});

test('money renders the way a group settles up', () => {
  assert.equal(money(1234), '1,234');
  assert.equal(money(333.333, 2), '333.33');
  assert.equal(money(Number.NaN), '—');
});
