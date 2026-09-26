import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DrawError,
  MAX_DICE,
  MAX_DICE_TERMS,
  MAX_DIE_FACES,
  MAX_ENTRIES,
  createRng,
  drawNames,
  formatDice,
  groupInto,
  parseDice,
  parseEntries,
  rollDice,
  seedState,
  shuffleWith,
  ticketPool,
} from './logic.ts';

const NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const entriesOf = (names: readonly string[]) => names.map((name) => ({ name, tickets: 1 }));

test('seedState reads a 128-bit hex seed straight into the state', () => {
  const state = seedState('0123456789abcdef0011223344556677');
  assert.deepEqual([...state], [0x01234567, 0x89abcdef, 0x00112233, 0x44556677]);
  // Case and surrounding whitespace do not change the seed.
  assert.deepEqual([...seedState('  0123456789ABCDEF0011223344556677 ')], [...state]);
});

test('seedState hashes anything that is not a 32-hex seed', () => {
  const a = seedState('draw for the christmas raffle');
  const b = seedState('draw for the christmas raffle ');
  const c = seedState('draw for the christmas raffl');
  assert.deepEqual([...a], [...b], 'trimming only');
  assert.notDeepEqual([...a], [...c], 'one character must change the state');
  // Chinese and emoji seeds work.
  assert.equal(seedState('尾牙抽獎').length, 4);
  assert.notDeepEqual([...seedState('尾牙抽獎')], [...seedState('尾牙摸彩')]);
});

test('seedState never leaves xoshiro in the all-zero state it cannot escape', () => {
  const zeroed = seedState('00000000000000000000000000000000');
  assert.ok(zeroed.some((word) => word !== 0));
  const rng = createRng('00000000000000000000000000000000');
  const values = Array.from({ length: 10 }, () => rng.uint32());
  assert.ok(values.some((value) => value !== 0), 'a zero seed must still produce output');
});

test('the generator is deterministic in the seed and nothing else', () => {
  const first = Array.from({ length: 50 }, () => createRng('seed-1').uint32());
  // A fresh generator from the same seed repeats the first value every time.
  assert.equal(new Set(first).size, 1);

  const a = createRng('seed-1');
  const b = createRng('seed-1');
  const c = createRng('seed-2');
  const streamA = Array.from({ length: 100 }, () => a.uint32());
  const streamB = Array.from({ length: 100 }, () => b.uint32());
  const streamC = Array.from({ length: 100 }, () => c.uint32());
  assert.deepEqual(streamA, streamB, 'the same seed must reproduce the draw');
  assert.notDeepEqual(streamA, streamC);
});

test('the generator only ever emits 32-bit unsigned values', () => {
  const rng = createRng('range check');
  for (let i = 0; i < 5000; i += 1) {
    const value = rng.uint32();
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `${value}`);
  }
});

test('below() stays in range and refuses a bad bound', () => {
  const rng = createRng('bounds');
  for (let i = 0; i < 2000; i += 1) {
    const value = rng.below(7);
    assert.ok(value >= 0 && value < 7);
  }
  assert.equal(rng.below(1), 0);
  assert.throws(() => rng.below(0), DrawError);
  assert.throws(() => rng.below(-3), DrawError);
  assert.throws(() => rng.below(2.5), DrawError);
});

test('below() is uniform enough that a chi-square does not object', () => {
  // Rejection sampling rather than `% n`: the bias a modulus introduces is
  // invisible in one draw and real over a thousand.
  const rng = createRng('uniformity');
  const buckets = new Array(50).fill(0);
  const draws = 50 * 400;
  for (let i = 0; i < draws; i += 1) buckets[rng.below(50)] += 1;
  const expected = draws / 50;
  const chi = buckets.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
  // 49 degrees of freedom: the 99.9th percentile is about 96.
  assert.ok(chi < 96, `chi-square ${chi.toFixed(1)} suggests a biased sampler`);
});

test('between() covers both ends inclusively', () => {
  const rng = createRng('between');
  const seen = new Set<number>();
  for (let i = 0; i < 500; i += 1) seen.add(rng.between(3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('shuffleWith is a permutation and leaves the input alone', () => {
  const input = Object.freeze(NAMES.slice());
  const out = shuffleWith(createRng('shuffle'), input);
  assert.deepEqual(out.slice().sort(), NAMES.slice().sort());
  assert.deepEqual([...input], NAMES);
  // Same seed, same permutation.
  assert.deepEqual(shuffleWith(createRng('shuffle'), NAMES), out);
  assert.notDeepEqual(shuffleWith(createRng('other'), NAMES), out);
  assert.deepEqual(shuffleWith(createRng('x'), []), []);
  assert.deepEqual(shuffleWith(createRng('x'), ['only']), ['only']);
});

test('parseEntries reads one name per line and ignores structure', () => {
  const result = parseEntries('  阿明 \n\n# 這行是註解\nBob\n小美\n');
  assert.deepEqual(result.entries, [
    { name: '阿明', tickets: 1 },
    { name: 'Bob', tickets: 1 },
    { name: '小美', tickets: 1 },
  ]);
  assert.equal(result.truncated, false);
  assert.deepEqual(parseEntries('').entries, []);
});

test('parseEntries reads extra tickets from a trailing multiplier', () => {
  const result = parseEntries('阿明 *3\nBob x2\n小美 ×5\nplain\nweird*0');
  assert.deepEqual(result.entries, [
    { name: '阿明', tickets: 3 },
    { name: 'Bob', tickets: 2 },
    { name: '小美', tickets: 5 },
    { name: 'plain', tickets: 1 },
    { name: 'weird', tickets: 1 },
  ]);
  // A line that is only a multiplier is a name, not a ticket count.
  assert.deepEqual(parseEntries('*3').entries, [{ name: '*3', tickets: 1 }]);
});

test('parseEntries stops at the ceiling and says so', () => {
  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => `n${i}`).join('\n');
  const result = parseEntries(many);
  assert.equal(result.entries.length, MAX_ENTRIES);
  assert.equal(result.truncated, true);
});

test('ticketPool repeats a name once per ticket', () => {
  assert.deepEqual(ticketPool([{ name: 'a', tickets: 3 }, { name: 'b', tickets: 1 }]), [
    'a',
    'a',
    'a',
    'b',
  ]);
  assert.deepEqual(ticketPool([]), []);
});

test('a draw without replacement never repeats a name', () => {
  const draw = drawNames(entriesOf(NAMES), 3, 'raffle-2026');
  assert.equal(draw.winners.length, 3);
  assert.equal(new Set(draw.winners).size, 3);
  assert.equal(draw.poolSize, 8);
  // Winners plus the rest is the whole list, exactly once each.
  assert.deepEqual([...draw.winners, ...draw.rest].sort(), NAMES.slice().sort());
  // The same seed reproduces the order, which is what makes it checkable.
  assert.deepEqual(drawNames(entriesOf(NAMES), 3, 'raffle-2026').winners, draw.winners);
  assert.notDeepEqual(drawNames(entriesOf(NAMES), 3, 'raffle-2027').winners, draw.winners);
});

test('extra tickets improve the odds without letting one name win twice', () => {
  const entries = [
    { name: 'heavy', tickets: 50 },
    { name: 'light1', tickets: 1 },
    { name: 'light2', tickets: 1 },
    { name: 'light3', tickets: 1 },
  ];
  let heavyWins = 0;
  for (let i = 0; i < 400; i += 1) {
    const draw = drawNames(entries, 1, `seed-${i}`);
    assert.equal(draw.winners.length, 1);
    if (draw.winners[0] === 'heavy') heavyWins += 1;
  }
  // 50 of 53 tickets; anything near 50% would mean the tickets were ignored.
  assert.ok(heavyWins > 330, `heavy won only ${heavyWins} of 400`);
  // Drawing everybody still lists each name once.
  const all = drawNames(entries, 4, 'all');
  assert.equal(new Set(all.winners).size, 4);
});

test('a draw with replacement can repeat and is not limited by the list length', () => {
  const draw = drawNames(entriesOf(['a', 'b']), 20, 'repeat', true);
  assert.equal(draw.winners.length, 20);
  for (const winner of draw.winners) assert.ok(['a', 'b'].includes(winner));
  assert.deepEqual(draw.rest, []);
  // Twenty draws from two names must contain a repeat.
  assert.ok(new Set(draw.winners).size < draw.winners.length);
  assert.deepEqual(drawNames(entriesOf(['a', 'b']), 20, 'repeat', true).winners, draw.winners);
});

test('a draw refuses what it cannot do', () => {
  assert.throws(() => drawNames([], 1, 's'), /nobody to draw from/);
  assert.throws(() => drawNames(entriesOf(NAMES), 0, 's'), /at least one name/);
  assert.throws(() => drawNames(entriesOf(NAMES), 1.5, 's'), /at least one name/);
  assert.throws(() => drawNames(entriesOf(['a', 'b']), 3, 's'), /only 2 names/);
  // With replacement, asking for more than the list is fine.
  assert.equal(drawNames(entriesOf(['a', 'b']), 3, 's', true).winners.length, 3);
});

test('grouping by count balances the groups', () => {
  const groups = groupInto(NAMES, 'count', 3, 'groups');
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.length).sort(),
    [2, 3, 3],
    '8 into 3 is 3/3/2, never 3/3/1/1'
  );
  assert.deepEqual(groups.flat().slice().sort(), NAMES.slice().sort());
  assert.deepEqual(groupInto(NAMES, 'count', 3, 'groups'), groups, 'reproducible');
});

test('grouping by size never leaves a group of one', () => {
  // 7 people in groups of 3 would chunk to 3/3/1; round-robin gives 3/2/2.
  const groups = groupInto(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'size', 3, 'sizes');
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.length).sort(), [2, 2, 3]);
  assert.ok(groups.every((group) => group.length >= 2));
});

test('grouping handles the degenerate requests', () => {
  assert.deepEqual(groupInto([], 'count', 3, 's'), []);
  // More groups than people: one each, no empty groups.
  const sparse = groupInto(['a', 'b'], 'count', 5, 's');
  assert.equal(sparse.length, 2);
  assert.deepEqual(sparse.flat().sort(), ['a', 'b']);
  // One group is everybody, shuffled.
  assert.equal(groupInto(NAMES, 'count', 1, 's')[0].length, 8);
  assert.throws(() => groupInto(NAMES, 'count', 0, 's'), /positive number/);
  assert.throws(() => groupInto(NAMES, 'size', -1, 's'), /positive number/);
});

test('parseDice reads the notation people actually write', () => {
  assert.deepEqual(parseDice('2d6'), [{ kind: 'dice', count: 2, faces: 6, sign: 1 }]);
  assert.deepEqual(parseDice('d20'), [{ kind: 'dice', count: 1, faces: 20, sign: 1 }]);
  assert.deepEqual(parseDice('1d20+5'), [
    { kind: 'dice', count: 1, faces: 20, sign: 1 },
    { kind: 'constant', value: 5, sign: 1 },
  ]);
  assert.deepEqual(parseDice('3d8-2'), [
    { kind: 'dice', count: 3, faces: 8, sign: 1 },
    { kind: 'constant', value: 2, sign: -1 },
  ]);
  assert.deepEqual(parseDice(' 2D6 + 1d4 + 3 ').length, 3);
  assert.deepEqual(parseDice('2d6-1d4'), [
    { kind: 'dice', count: 2, faces: 6, sign: 1 },
    { kind: 'dice', count: 1, faces: 4, sign: -1 },
  ]);
});

test('parseDice refuses nonsense and runaway dice', () => {
  assert.throws(() => parseDice(''), /something like 2d6/);
  assert.throws(() => parseDice('   '), /something like 2d6/);
  assert.throws(() => parseDice('hello'), /not dice notation/);
  assert.throws(() => parseDice('2d6 apples'), /not dice notation/);
  assert.throws(() => parseDice('2d1'), /2 to 1000 faces/);
  assert.throws(() => parseDice(`${MAX_DICE + 1}d6`), /between 1 and 1000 dice/);
  assert.throws(() => parseDice(`2d${MAX_DIE_FACES + 1}`), /2 to 1000 faces/);
  assert.throws(
    () => parseDice(Array.from({ length: MAX_DICE_TERMS + 1 }, () => '1d6').join('+')),
    /at most 20 terms/
  );
});

test('rollDice stays inside the range the notation allows', () => {
  const terms = parseDice('3d6+2');
  for (let i = 0; i < 300; i += 1) {
    const roll = rollDice(terms, `roll-${i}`);
    assert.equal(roll.min, 5);
    assert.equal(roll.max, 20);
    assert.ok(roll.total >= roll.min && roll.total <= roll.max, `${roll.total}`);
    assert.equal(roll.terms[0].rolls.length, 3);
    for (const die of roll.terms[0].rolls) assert.ok(die >= 1 && die <= 6);
    assert.equal(
      roll.terms.reduce((sum, term) => sum + term.subtotal, 0),
      roll.total
    );
  }
});

test('rollDice handles negative terms and reproduces from a seed', () => {
  const terms = parseDice('2d6-1d4');
  const roll = rollDice(terms, 'fixed');
  assert.equal(roll.min, 2 - 4);
  assert.equal(roll.max, 12 - 1);
  assert.deepEqual(rollDice(terms, 'fixed'), roll, 'the same seed rolls the same dice');
  assert.notDeepEqual(rollDice(terms, 'other').total, undefined);

  const constantOnly = rollDice(parseDice('7'), 'x');
  assert.equal(constantOnly.total, 7);
  assert.equal(constantOnly.min, 7);
  assert.equal(constantOnly.max, 7);
});

test('a d6 over many seeds hits every face roughly equally', () => {
  const terms = parseDice('1d6');
  const faces = new Array(7).fill(0);
  for (let i = 0; i < 6000; i += 1) faces[rollDice(terms, `s${i}`).total] += 1;
  assert.equal(faces[0], 0);
  const expected = 1000;
  const chi = faces.slice(1).reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
  assert.ok(chi < 20.5, `chi-square ${chi.toFixed(1)} on five degrees of freedom`);
});

test('formatDice round-trips the notation', () => {
  for (const source of ['2d6', '1d20+5', '3d8-2', '2d6+1d4+3', '2d6-1d4', '7']) {
    const terms = parseDice(source);
    const written = formatDice(terms);
    assert.deepEqual(parseDice(written), terms, `${source} → ${written}`);
  }
  assert.equal(formatDice(parseDice('d20')), '1d20');
  assert.equal(formatDice(parseDice(' 2D6 + 3 ')), '2d6+3');
});

test('a big but legal draw still finishes', () => {
  const entries = Array.from({ length: 5000 }, (_, i) => ({ name: `n${i}`, tickets: 1 }));
  const draw = drawNames(entries, 10, 'big');
  assert.equal(draw.winners.length, 10);
  assert.equal(new Set(draw.winners).size, 10);
  assert.equal(draw.rest.length, 4990);
  const groups = groupInto(entries.map((entry) => entry.name), 'size', 4, 'big');
  assert.equal(groups.flat().length, 5000);
});
