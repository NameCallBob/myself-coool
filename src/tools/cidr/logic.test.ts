import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIT_WIDTH,
  cidrToString,
  classify,
  contains,
  describe as describeCidr,
  expandIPv6,
  formatAddress,
  formatBigCount,
  formatIPv4,
  formatIPv6,
  maskFor,
  parseAddress,
  parseCidr,
  parseIPv4,
  parseIPv6,
  powerLabel,
  prefixFromMask,
  rangeToCidrs,
  reversePointer,
  reverseZone,
  split,
  subnetCount,
} from './logic.ts';

/* ── IPv4 parsing ─────────────────────────── */

test('dotted quad maps to the documented integer', () => {
  assert.equal(parseIPv4('0.0.0.0'), BigInt(0));
  assert.equal(parseIPv4('255.255.255.255'), BigInt(4294967295));
  assert.equal(parseIPv4('192.168.1.1'), BigInt(3232235777));
  assert.equal(parseIPv4('1.2.3.4'), BigInt(16909060));
});

test('malformed IPv4 is rejected rather than guessed at', () => {
  assert.equal(parseIPv4('1.2.3'), null);
  assert.equal(parseIPv4('1.2.3.4.5'), null);
  assert.equal(parseIPv4('256.0.0.1'), null);
  assert.equal(parseIPv4('1.2.3.-1'), null);
  assert.equal(parseIPv4('a.b.c.d'), null);
  assert.equal(parseIPv4(''), null);
  assert.equal(parseIPv4('1.2.3.4/24'), null);
});

test('leading zeros are refused because their meaning is not agreed on', () => {
  assert.equal(parseIPv4('010.0.0.1'), null);
  assert.equal(parseIPv4('192.168.01.1'), null);
  // A single zero octet is still fine.
  assert.equal(parseIPv4('10.0.0.0'), BigInt(167772160));
});

test('IPv4 round-trips through the formatter', () => {
  for (const text of ['0.0.0.0', '10.0.0.1', '172.31.255.254', '255.255.255.255']) {
    assert.equal(formatIPv4(parseIPv4(text)!), text);
  }
});

/* ── IPv6 parsing ─────────────────────────── */

test('IPv6 known values', () => {
  assert.equal(parseIPv6('::'), BigInt(0));
  assert.equal(parseIPv6('::1'), BigInt(1));
  assert.equal(parseIPv6('2001:db8::1'), BigInt('0x20010db8000000000000000000000001'));
  assert.equal(
    parseIPv6('fe80:0000:0000:0000:0202:b3ff:fe1e:8329'),
    BigInt('0xfe800000000000000202b3fffe1e8329')
  );
  // Compressed and expanded forms of the same address agree.
  assert.equal(parseIPv6('fe80::202:b3ff:fe1e:8329'), parseIPv6('fe80:0:0:0:202:b3ff:fe1e:8329'));
});

test('embedded IPv4 in the low 32 bits', () => {
  assert.equal(parseIPv6('::ffff:192.168.1.1'), BigInt(0xffff) * BigInt(0x100000000) + BigInt(3232235777));
  assert.equal(parseIPv6('::192.168.1.1'), BigInt(3232235777));
  assert.equal(parseIPv6('64:ff9b::192.0.2.33'), parseIPv6('64:ff9b::c000:221'));
});

test('a zone id identifies an interface and is dropped', () => {
  assert.equal(parseIPv6('fe80::1%eth0'), parseIPv6('fe80::1'));
});

test('malformed IPv6 is rejected', () => {
  assert.equal(parseIPv6('1:2:3:4:5:6:7'), null, 'seven groups without ::');
  assert.equal(parseIPv6('1:2:3:4:5:6:7:8:9'), null, 'nine groups');
  assert.equal(parseIPv6('1::2::3'), null, 'two :: runs');
  assert.equal(parseIPv6(':::'), null);
  assert.equal(parseIPv6('1:2:3:4:5:6:7::8'), null, ':: must cover at least one group');
  assert.equal(parseIPv6('12345::'), null, 'hextet too long');
  assert.equal(parseIPv6('g::1'), null, 'not hex');
  assert.equal(parseIPv6(':1:2:3:4:5:6:7:8'), null, 'stray leading colon');
  assert.equal(parseIPv6('::ffff:1.2.3'), null, 'broken IPv4 tail');
});

test('RFC 5952 canonical output: longest zero run, leftmost on a tie', () => {
  assert.equal(formatIPv6(BigInt(0)), '::');
  assert.equal(formatIPv6(BigInt(1)), '::1');
  assert.equal(formatIPv6(parseIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')!), '2001:db8::1');
  // Two equal-length runs: the left one collapses.
  assert.equal(formatIPv6(parseIPv6('2001:0:0:1:0:0:0:1')!), '2001:0:0:1::1');
  assert.equal(formatIPv6(parseIPv6('1:0:0:1:1:0:0:1')!), '1::1:1:0:0:1');
  // A single zero group is never collapsed — '::' must stand for two or more.
  assert.equal(formatIPv6(parseIPv6('1:2:3:4:5:6:0:8')!), '1:2:3:4:5:6:0:8');
  assert.equal(formatIPv6(parseIPv6('FE80::AB')!), 'fe80::ab', 'lowercase');
});

test('IPv6 round-trips through the canonical formatter', () => {
  for (const text of ['::', '::1', '2001:db8::1', 'fe80::202:b3ff:fe1e:8329', 'ff02::2']) {
    assert.equal(formatIPv6(parseIPv6(text)!), text);
  }
});

test('expandIPv6 writes all eight hextets', () => {
  assert.equal(expandIPv6(BigInt(0)), '0000:0000:0000:0000:0000:0000:0000:0000');
  assert.equal(expandIPv6(parseIPv6('2001:db8::1')!), '2001:0db8:0000:0000:0000:0000:0000:0001');
});

test('parseAddress picks the family from the text', () => {
  assert.deepEqual(parseAddress('10.0.0.1'), { family: 4, addr: BigInt(167772160) + BigInt(1) });
  assert.deepEqual(parseAddress('::1'), { family: 6, addr: BigInt(1) });
  assert.equal(parseAddress(''), null);
  assert.equal(parseAddress('nope'), null);
});

test('formatAddress dispatches on family', () => {
  assert.equal(formatAddress(4, BigInt(16909060)), '1.2.3.4');
  assert.equal(formatAddress(6, BigInt(1)), '::1');
});

/* ── Masks ────────────────────────────────── */

test('mask for a prefix', () => {
  assert.equal(formatIPv4(maskFor(4, 0)), '0.0.0.0');
  assert.equal(formatIPv4(maskFor(4, 1)), '128.0.0.0');
  assert.equal(formatIPv4(maskFor(4, 24)), '255.255.255.0');
  assert.equal(formatIPv4(maskFor(4, 26)), '255.255.255.192');
  assert.equal(formatIPv4(maskFor(4, 32)), '255.255.255.255');
  assert.equal(formatIPv6(maskFor(6, 64)), 'ffff:ffff:ffff:ffff::');
  assert.equal(maskFor(6, 128), (BigInt(1) << BigInt(128)) - BigInt(1));
  assert.equal(maskFor(4, 99), BigInt(4294967295), 'over-long prefix saturates');
});

test('prefixFromMask accepts contiguous masks and rejects the rest', () => {
  assert.equal(prefixFromMask(parseIPv4('255.255.255.0')!, 4), 24);
  assert.equal(prefixFromMask(parseIPv4('255.255.255.252')!, 4), 30);
  assert.equal(prefixFromMask(parseIPv4('0.0.0.0')!, 4), 0);
  assert.equal(prefixFromMask(parseIPv4('255.255.255.255')!, 4), 32);
  assert.equal(prefixFromMask(parseIPv4('255.0.255.0')!, 4), null);
  assert.equal(prefixFromMask(parseIPv4('255.255.255.1')!, 4), null);
  assert.equal(prefixFromMask(maskFor(6, 48), 6), 48);
});

/* ── CIDR text ────────────────────────────── */

test('parseCidr reads all the forms it claims to', () => {
  assert.deepEqual(parseCidr('192.168.1.0/24'), {
    ok: true,
    cidr: { family: 4, addr: BigInt(3232235776), prefix: 24 },
  });
  assert.deepEqual(parseCidr('192.168.1.0/255.255.255.0'), {
    ok: true,
    cidr: { family: 4, addr: BigInt(3232235776), prefix: 24 },
  });
  assert.deepEqual(parseCidr('  10.1.2.3  '), {
    ok: true,
    cidr: { family: 4, addr: parseIPv4('10.1.2.3')!, prefix: 32 },
  });
  assert.deepEqual(parseCidr('2001:db8::/48'), {
    ok: true,
    cidr: { family: 6, addr: parseIPv6('2001:db8::')!, prefix: 48 },
  });
  assert.deepEqual(parseCidr('::1'), { ok: true, cidr: { family: 6, addr: BigInt(1), prefix: 128 } });
});

test('parseCidr failures are named', () => {
  assert.deepEqual(parseCidr(''), { ok: false, code: 'empty' });
  assert.deepEqual(parseCidr('   '), { ok: false, code: 'empty' });
  assert.deepEqual(parseCidr('999.1.1.1/24'), { ok: false, code: 'bad-address' });
  assert.deepEqual(parseCidr('10.0.0.0/'), { ok: false, code: 'bad-prefix' });
  assert.deepEqual(parseCidr('10.0.0.0/xx'), { ok: false, code: 'bad-prefix' });
  assert.deepEqual(parseCidr('10.0.0.0/33'), { ok: false, code: 'prefix-range' });
  assert.deepEqual(parseCidr('2001:db8::/129'), { ok: false, code: 'prefix-range' });
  assert.deepEqual(parseCidr('10.0.0.0/255.0.255.0'), { ok: false, code: 'mask-not-contiguous' });
  assert.deepEqual(parseCidr('2001:db8::/255.255.0.0'), { ok: false, code: 'mask-on-ipv6' });
});

test('cidrToString', () => {
  assert.equal(cidrToString({ family: 4, addr: BigInt(3232235776), prefix: 24 }), '192.168.1.0/24');
  assert.equal(cidrToString({ family: 6, addr: BigInt(0), prefix: 0 }), '::/0');
});

/* ── Derived values, case by case ─────────── */

test('a /24 has 254 hosts between network and broadcast', () => {
  const report = describeCidr({ family: 4, addr: parseIPv4('192.168.1.130')!, prefix: 24 });
  assert.equal(formatIPv4(report.network), '192.168.1.0');
  assert.equal(formatIPv4(report.last), '192.168.1.255');
  assert.equal(formatIPv4(report.mask), '255.255.255.0');
  assert.equal(formatIPv4(report.wildcard), '0.0.0.255');
  assert.equal(report.total, BigInt(256));
  assert.equal(report.usable, BigInt(254));
  assert.equal(formatIPv4(report.firstUsable!), '192.168.1.1');
  assert.equal(formatIPv4(report.lastUsable!), '192.168.1.254');
  assert.equal(report.note, 'normal');
  assert.equal(report.hostBitsSet, true, 'host bits were set in the input');
});

test('a /26 splits the third octet, hand-checked', () => {
  const parsed = parseCidr('10.0.0.200/26');
  assert.equal(parsed.ok, true);
  const report = describeCidr({ family: 4, addr: parseIPv4('10.0.0.200')!, prefix: 26 });
  assert.equal(formatIPv4(report.network), '10.0.0.192');
  assert.equal(formatIPv4(report.last), '10.0.0.255');
  assert.equal(formatIPv4(report.mask), '255.255.255.192');
  assert.equal(report.usable, BigInt(62));
  assert.equal(formatIPv4(report.firstUsable!), '10.0.0.193');
  assert.equal(formatIPv4(report.lastUsable!), '10.0.0.254');
});

test('a /30 leaves two hosts', () => {
  const report = describeCidr({ family: 4, addr: parseIPv4('192.0.2.4')!, prefix: 30 });
  assert.equal(report.total, BigInt(4));
  assert.equal(report.usable, BigInt(2));
  assert.equal(formatIPv4(report.firstUsable!), '192.0.2.5');
  assert.equal(formatIPv4(report.lastUsable!), '192.0.2.6');
  assert.equal(report.hostBitsSet, false);
});

test('a /31 is a point-to-point link with both addresses usable (RFC 3021)', () => {
  const report = describeCidr({ family: 4, addr: parseIPv4('192.0.2.4')!, prefix: 31 });
  assert.equal(report.total, BigInt(2));
  assert.equal(report.usable, BigInt(2));
  assert.equal(report.note, 'point-to-point');
  assert.equal(formatIPv4(report.firstUsable!), '192.0.2.4');
  assert.equal(formatIPv4(report.lastUsable!), '192.0.2.5');
});

test('a /32 is one host and no network', () => {
  const report = describeCidr({ family: 4, addr: parseIPv4('192.0.2.7')!, prefix: 32 });
  assert.equal(report.total, BigInt(1));
  assert.equal(report.usable, BigInt(1));
  assert.equal(report.note, 'single-host');
  assert.equal(report.firstUsable, report.lastUsable);
});

test('a /0 covers the whole IPv4 space without a sign flip', () => {
  const report = describeCidr({ family: 4, addr: parseIPv4('8.8.8.8')!, prefix: 0 });
  assert.equal(report.total, BigInt(4294967296));
  assert.equal(report.usable, BigInt(4294967294));
  assert.equal(formatIPv4(report.network), '0.0.0.0');
  assert.equal(formatIPv4(report.last), '255.255.255.255');
  assert.equal(formatIPv4(report.wildcard), '255.255.255.255');
});

test('IPv6 has no broadcast address, so the whole block is addressable', () => {
  const report = describeCidr({ family: 6, addr: parseIPv6('2001:db8:abcd:1234::1')!, prefix: 64 });
  assert.equal(formatIPv6(report.network), '2001:db8:abcd:1234::');
  assert.equal(formatIPv6(report.last), '2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
  assert.equal(report.total, BigInt(1) << BigInt(64));
  assert.equal(report.usable, report.total);
  assert.equal(report.note, 'ipv6');
  assert.equal(report.firstUsable, report.network);
});

test('a /128 is a single IPv6 address', () => {
  const report = describeCidr({ family: 6, addr: BigInt(1), prefix: 128 });
  assert.equal(report.total, BigInt(1));
  assert.equal(report.note, 'single-host');
  assert.equal(report.hostBitsSet, false);
});

test('contains is a mask comparison, both families', () => {
  const net = { family: 4, addr: parseIPv4('10.1.0.0')!, prefix: 16 } as const;
  assert.equal(contains(net, parseIPv4('10.1.255.255')!), true);
  assert.equal(contains(net, parseIPv4('10.2.0.0')!), false);
  const v6 = { family: 6, addr: parseIPv6('2001:db8::')!, prefix: 32 } as const;
  assert.equal(contains(v6, parseIPv6('2001:db8:ffff::1')!), true);
  assert.equal(contains(v6, parseIPv6('2001:db9::1')!), false);
});

/* ── Classification ───────────────────────── */

test('special-purpose blocks are matched longest-prefix-first', () => {
  assert.equal(classify(4, parseIPv4('10.1.2.3')!).id, 'private');
  assert.equal(classify(4, parseIPv4('172.16.0.1')!).id, 'private');
  assert.equal(classify(4, parseIPv4('172.32.0.1')!).id, 'global-unicast');
  assert.equal(classify(4, parseIPv4('192.168.0.1')!).id, 'private');
  assert.equal(classify(4, parseIPv4('127.0.0.1')!).id, 'loopback');
  assert.equal(classify(4, parseIPv4('169.254.1.1')!).id, 'link-local');
  assert.equal(classify(4, parseIPv4('100.64.0.1')!).id, 'cgnat');
  assert.equal(classify(4, parseIPv4('224.0.0.1')!).id, 'multicast');
  assert.equal(classify(4, parseIPv4('255.255.255.255')!).id, 'broadcast');
  assert.equal(classify(4, parseIPv4('203.0.113.9')!).id, 'documentation');
  assert.equal(classify(4, parseIPv4('8.8.8.8')!).id, 'global-unicast');
});

test('2001:db8::1 is documentation, not Teredo', () => {
  const hit = classify(6, parseIPv6('2001:db8::1')!);
  assert.equal(hit.id, 'documentation');
  assert.equal(hit.block, '2001:db8::/32');
  assert.equal(classify(6, parseIPv6('2001:0:1::1')!).id, 'teredo');
});

test('other IPv6 scopes', () => {
  assert.equal(classify(6, BigInt(0)).id, 'unspecified');
  assert.equal(classify(6, BigInt(1)).id, 'loopback');
  assert.equal(classify(6, parseIPv6('fe80::1')!).id, 'link-local');
  assert.equal(classify(6, parseIPv6('fd00::1')!).id, 'unique-local');
  assert.equal(classify(6, parseIPv6('ff02::1')!).id, 'multicast');
  assert.equal(classify(6, parseIPv6('2606:4700::1')!).id, 'global-unicast');
  assert.equal(classify(6, parseIPv6('::ffff:1.2.3.4')!).id, 'ipv4-mapped');
  assert.equal(classify(6, parseIPv6('3fff::1')!).id, 'global-unicast');
  // Outside 2000::/3 and every listed block: reserved by exhaustion.
  assert.equal(classify(6, parseIPv6('4000::1')!).id, 'reserved');
});

/* ── Subnetting ───────────────────────────── */

test('subnetCount is a power of two of the prefix difference', () => {
  assert.equal(subnetCount(24, 26), BigInt(4));
  assert.equal(subnetCount(24, 24), BigInt(1));
  assert.equal(subnetCount(26, 24), BigInt(0), 'a longer prefix cannot be split into a shorter one');
  assert.equal(subnetCount(48, 64), BigInt(65536));
});

test('splitting a /24 into /26 gives the four hand-known blocks', () => {
  const result = split({ family: 4, addr: parseIPv4('192.168.1.0')!, prefix: 24 }, 26);
  assert.equal(result.total, BigInt(4));
  assert.equal(result.truncated, false);
  assert.deepEqual(result.subnets.map(cidrToString), [
    '192.168.1.0/26',
    '192.168.1.64/26',
    '192.168.1.128/26',
    '192.168.1.192/26',
  ]);
});

test('split normalises the parent and caps the list', () => {
  const result = split({ family: 4, addr: parseIPv4('10.0.0.37')!, prefix: 8 }, 24, 3);
  assert.equal(result.total, BigInt(65536));
  assert.equal(result.truncated, true);
  assert.deepEqual(result.subnets.map(cidrToString), ['10.0.0.0/24', '10.0.1.0/24', '10.0.2.0/24']);
});

test('split of an IPv6 /48 into /64s', () => {
  const result = split({ family: 6, addr: parseIPv6('2001:db8:1::')!, prefix: 48 }, 52, 4);
  assert.deepEqual(result.subnets.map(cidrToString), [
    '2001:db8:1::/52',
    '2001:db8:1:1000::/52',
    '2001:db8:1:2000::/52',
    '2001:db8:1:3000::/52',
  ]);
  assert.equal(result.total, BigInt(16));
});

test('split rejects impossible requests instead of looping', () => {
  assert.deepEqual(split({ family: 4, addr: BigInt(0), prefix: 24 }, 16), {
    subnets: [],
    total: BigInt(0),
    truncated: false,
  });
  assert.deepEqual(split({ family: 4, addr: BigInt(0), prefix: 24 }, 33), {
    subnets: [],
    total: BigInt(0),
    truncated: false,
  });
});

/* ── Range to CIDR ────────────────────────── */

test('an aligned range is one block', () => {
  const { blocks } = rangeToCidrs(4, parseIPv4('192.168.1.0')!, parseIPv4('192.168.1.255')!);
  assert.deepEqual(blocks.map(cidrToString), ['192.168.1.0/24']);
});

test('a ragged range decomposes minimally', () => {
  // Hand-checked: .1-.3 needs /32+/31, .4-.7 is a /30, .8-.10 is /31+/32.
  const { blocks } = rangeToCidrs(4, parseIPv4('192.168.1.1')!, parseIPv4('192.168.1.10')!);
  assert.deepEqual(blocks.map(cidrToString), [
    '192.168.1.1/32',
    '192.168.1.2/31',
    '192.168.1.4/30',
    '192.168.1.8/31',
    '192.168.1.10/32',
  ]);
});

test('the whole IPv4 space is a single /0 starting at zero', () => {
  const { blocks } = rangeToCidrs(4, BigInt(0), BigInt(4294967295));
  assert.deepEqual(blocks.map(cidrToString), ['0.0.0.0/0']);
});

test('a single address, a reversed range, and the cap', () => {
  assert.deepEqual(rangeToCidrs(4, BigInt(5), BigInt(5)).blocks.map(cidrToString), ['0.0.0.5/32']);
  assert.deepEqual(rangeToCidrs(4, BigInt(10), BigInt(5)), { blocks: [], truncated: false });
  const capped = rangeToCidrs(4, BigInt(1), BigInt(4294967294), 2);
  assert.equal(capped.truncated, true);
  assert.equal(capped.blocks.length, 2);
});

test('range decomposition covers exactly the range it was given', () => {
  const start = parseIPv4('10.0.0.13')!;
  const end = parseIPv4('10.0.3.200')!;
  const { blocks } = rangeToCidrs(4, start, end, 64);
  let cursor = start;
  for (const block of blocks) {
    assert.equal(block.addr, cursor, 'blocks are contiguous');
    const size = BigInt(1) << BigInt(BIT_WIDTH[4] - block.prefix);
    assert.equal(block.addr % size, BigInt(0), 'each block is aligned to its own size');
    cursor += size;
  }
  assert.equal(cursor - BigInt(1), end, 'and they stop exactly at the end');
});

test('IPv6 ranges decompose too', () => {
  const { blocks } = rangeToCidrs(6, parseIPv6('2001:db8::')!, parseIPv6('2001:db8::ff')!);
  assert.deepEqual(blocks.map(cidrToString), ['2001:db8::/120']);
});

/* ── Reverse DNS ──────────────────────────── */

test('PTR names reverse the address', () => {
  assert.equal(reversePointer(4, parseIPv4('192.0.2.5')!), '5.2.0.192.in-addr.arpa');
  assert.equal(
    reversePointer(6, BigInt(1)),
    '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa'
  );
});

test('reverse zones only exist on label boundaries', () => {
  assert.equal(reverseZone({ family: 4, addr: parseIPv4('192.0.2.0')!, prefix: 24 }), '2.0.192.in-addr.arpa');
  assert.equal(reverseZone({ family: 4, addr: parseIPv4('10.0.0.0')!, prefix: 8 }), '10.in-addr.arpa');
  assert.equal(reverseZone({ family: 4, addr: BigInt(0), prefix: 0 }), 'in-addr.arpa');
  assert.equal(reverseZone({ family: 4, addr: parseIPv4('192.0.2.0')!, prefix: 26 }), null);
  assert.equal(
    reverseZone({ family: 6, addr: parseIPv6('2001:db8::')!, prefix: 32 }),
    '8.b.d.0.1.0.0.2.ip6.arpa'
  );
  assert.equal(reverseZone({ family: 6, addr: BigInt(0), prefix: 0 }), 'ip6.arpa');
  assert.equal(reverseZone({ family: 6, addr: parseIPv6('2001:db8::')!, prefix: 33 }), null);
});

/* ── Readout formatting ───────────────────── */

test('counts stay readable at both ends', () => {
  assert.equal(formatBigCount(BigInt(0)), '0');
  assert.equal(formatBigCount(BigInt(254)), '254');
  assert.equal(formatBigCount(BigInt(4294967296)), '4,294,967,296');
  assert.equal(formatBigCount(BigInt(1) << BigInt(64)), '1.844e19');
  assert.equal(formatBigCount(-BigInt(1)), '—');
});

test('powerLabel', () => {
  assert.equal(powerLabel(64), '2^64');
  assert.equal(powerLabel(0), '2^0');
});
