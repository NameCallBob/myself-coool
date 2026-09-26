'use client';

import { useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { t, type Loc } from '@/lib/tools/locale';
import {
  BIT_WIDTH,
  cidrToString,
  classify,
  contains,
  describe,
  expandIPv6,
  formatAddress,
  formatBigCount,
  parseAddress,
  parseCidr,
  powerLabel,
  rangeToCidrs,
  reversePointer,
  reverseZone,
  split,
  subnetCount,
  type ParseFailure,
} from './logic';

const SPLIT_CAP = 128;
const RANGE_CAP = 64;

function failureText(l: Loc, code: ParseFailure): string {
  switch (code) {
    case 'empty':
      return t(l, '輸入網段,例如 192.168.1.0/24 或 2001:db8::/48。', 'Enter a block, e.g. 192.168.1.0/24 or 2001:db8::/48.');
    case 'bad-address':
      return t(
        l,
        '位址部分讀不出來。IPv4 要四段 0–255 且不可有前導零(010 這種寫法各家解讀不同,一律拒絕);IPv6 最多一組 ::。',
        'The address part does not parse. IPv4 needs four 0–255 octets with no leading zeros; IPv6 allows at most one "::".'
      );
    case 'bad-prefix':
      return t(l, '/ 後面要是數字,或 IPv4 的點分遮罩。', 'After the slash: a number, or a dotted IPv4 mask.');
    case 'prefix-range':
      return t(l, '前綴長度超過位址寬度(IPv4 最多 32,IPv6 最多 128)。', 'Prefix longer than the address width (32 for IPv4, 128 for IPv6).');
    case 'mask-not-contiguous':
      return t(
        l,
        '這個遮罩的 1 不連續,不是合法的 CIDR 遮罩。',
        'That mask does not have contiguous ones, so it is not a CIDR mask.'
      );
    case 'mask-on-ipv6':
      return t(l, 'IPv6 不用點分遮罩,直接寫 /48 這種前綴長度。', 'IPv6 has no dotted mask — write the prefix length, e.g. /48.');
  }
}

function scopeText(l: Loc, id: string): string {
  const table: Record<string, [string, string]> = {
    private: ['私有位址(RFC 1918),不會出現在公網路由', 'private (RFC 1918), not routed on the public internet'],
    loopback: ['迴圈位址,只到本機', 'loopback — this host only'],
    'link-local': ['連線本地,DHCP 失敗時自己給的位址', 'link-local, self-assigned when DHCP fails'],
    cgnat: ['電信業者級 NAT 共用位址(RFC 6598)', 'carrier-grade NAT shared space (RFC 6598)'],
    multicast: ['多播位址,不能當主機位址', 'multicast — never a host address'],
    broadcast: ['受限廣播位址', 'limited broadcast address'],
    documentation: ['文件用保留位址,可以安心寫在文章裡', 'reserved for documentation — safe to write down'],
    benchmark: ['網路設備效能測試保留', 'reserved for device benchmarking'],
    protocol: ['IETF 協定指派保留', 'IETF protocol assignments'],
    '6to4-relay': ['6to4 中繼 anycast(已廢止)', '6to4 relay anycast (deprecated)'],
    'this-network': ['本網路/未指定', 'this network / unspecified'],
    reserved: ['保留未指派', 'reserved, unassigned'],
    'global-unicast': ['全球單播範圍(不代表一定通)', 'global unicast range (which is not a promise it is reachable)'],
    unspecified: ['未指定位址', 'the unspecified address'],
    'ipv4-mapped': ['IPv4 映射位址,雙棧 socket 用', 'IPv4-mapped, used by dual-stack sockets'],
    nat64: ['NAT64 轉譯前綴', 'NAT64 translation prefix'],
    discard: ['丟棄前綴', 'discard prefix'],
    teredo: ['Teredo 隧道', 'Teredo tunnelling'],
    '6to4': ['6to4 隧道', '6to4 tunnelling'],
    'unique-local': ['唯一區域位址,相當於 IPv6 的私有網段', 'unique local — the IPv6 counterpart of private space'],
  };
  const hit = table[id];
  return hit ? t(l, hit[0], hit[1]) : id;
}

export default function Cidr({ l }: ToolProps) {
  const [text, setText] = useState('192.168.1.0/24');
  const [newPrefix, setNewPrefix] = useState('26');
  const [probe, setProbe] = useState('');
  const [view, setView] = useState<'split' | 'range'>('split');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const parsed = useMemo(() => parseCidr(text), [text]);
  const report = useMemo(() => (parsed.ok ? describe(parsed.cidr) : null), [parsed]);

  const scope = useMemo(
    () => (parsed.ok && report ? classify(parsed.cidr.family, report.network) : null),
    [parsed, report]
  );

  const splitResult = useMemo(() => {
    if (!parsed.ok || view !== 'split') return null;
    const target = Number(newPrefix);
    if (!Number.isInteger(target)) return null;
    if (target < parsed.cidr.prefix || target > BIT_WIDTH[parsed.cidr.family]) return null;
    return split(parsed.cidr, target, SPLIT_CAP);
  }, [parsed, newPrefix, view]);

  const rangeResult = useMemo(() => {
    if (view !== 'range') return null;
    const a = parseAddress(rangeStart);
    const b = parseAddress(rangeEnd);
    if (!a || !b) return null;
    if (a.family !== b.family) return { mismatch: true as const };
    if (b.addr < a.addr) return { reversed: true as const };
    return { ...rangeToCidrs(a.family, a.addr, b.addr, RANGE_CAP), family: a.family };
  }, [view, rangeStart, rangeEnd]);

  const probeResult = useMemo(() => {
    if (!parsed.ok || probe.trim() === '') return null;
    const address = parseAddress(probe);
    if (!address) return { bad: true as const };
    if (address.family !== parsed.cidr.family) return { mismatch: true as const };
    return { inside: contains(parsed.cidr, address.addr) };
  }, [parsed, probe]);

  const fmt = (value: bigint) => (report ? formatAddress(report.family, value) : '—');

  const rows: [string, string][] = report
    ? [
        [t(l, '網段位址', 'network'), fmt(report.network)],
        [
          report.family === 4 ? t(l, '廣播位址', 'broadcast') : t(l, '區塊末位址', 'last address'),
          fmt(report.last),
        ],
        [
          t(l, '可用範圍', 'usable range'),
          report.firstUsable !== null && report.lastUsable !== null
            ? `${fmt(report.firstUsable)} – ${fmt(report.lastUsable)}`
            : '—',
        ],
        [t(l, '遮罩', 'mask'), `${fmt(report.mask)}  /${report.prefix}`],
        [t(l, '反向遮罩', 'wildcard'), fmt(report.wildcard)],
        [
          t(l, '區塊大小', 'block size'),
          `${formatBigCount(report.total)}  (${powerLabel(BIT_WIDTH[report.family] - report.prefix)})`,
        ],
        [t(l, '可配置主機', 'usable hosts'), formatBigCount(report.usable)],
        [t(l, '反向解析區域', 'reverse zone'), parsed.ok ? (reverseZone(parsed.cidr) ?? t(l, '不在標籤邊界上', 'not on a label boundary')) : '—'],
        [t(l, '這台的 PTR', 'PTR for the address'), reversePointer(report.family, report.given)],
      ]
    : [];

  if (report?.family === 6) {
    rows.push([t(l, '完整寫法', 'expanded'), expandIPv6(report.network)]);
  }

  const noteText = () => {
    if (!report) return null;
    if (report.note === 'point-to-point') {
      return t(
        l,
        '/31 沒有廣播位址:RFC 3021 把兩個位址都給點對點鏈路的兩端,所以可用數是 2 不是 0。',
        'A /31 has no broadcast address — RFC 3021 gives both addresses to the two ends of a point-to-point link, so the usable count is 2, not 0.'
      );
    }
    if (report.note === 'single-host') {
      return t(l, '單一位址,沒有網段與廣播的概念。', 'A single address: no network or broadcast address to speak of.');
    }
    if (report.family === 6) {
      return t(
        l,
        'IPv6 沒有廣播,整個區塊都可以配置;全零主機部分被保留為子網路路由器 anycast(RFC 4291 §2.6.1),那是給路由器用的保留,不從數量裡扣。',
        'IPv6 has no broadcast, so the whole block is addressable. The all-zeros host part is reserved as the subnet-router anycast address (RFC 4291 §2.6.1) — a reservation for routers, not a hole in the count.'
      );
    }
    return null;
  };

  const copyText = report
    ? rows.map(([key, value]) => `${key}: ${value}`).join('\n')
    : '';

  return (
    <div>
      <Bench
        leftLabel={t(l, '網段', 'BLOCK')}
        rightLabel={t(l, '拆解', 'BREAKDOWN')}
        leftAside={
          report ? (
            <span className="inst-no">
              IPv{report.family} · /{report.prefix}
            </span>
          ) : null
        }
        rightAside={report ? <CopyButton l={l} text={copyText} /> : null}
        left={
          <>
            <Input
              label={t(l, 'CIDR 或位址', 'CIDR or address')}
              value={text}
              onChange={setText}
              placeholder="192.168.1.0/24"
              invalid={!parsed.ok && text.trim() !== ''}
              hint={t(
                l,
                '接受 10.0.0.0/8、10.0.0.0/255.0.0.0、單一位址(視為 /32 或 /128)、2001:db8::/48。',
                'Accepts 10.0.0.0/8, 10.0.0.0/255.0.0.0, a bare address (taken as /32 or /128), and 2001:db8::/48.'
              )}
            />
            {!parsed.ok ? <Note error>{failureText(l, parsed.code)}</Note> : null}

            {report?.hostBitsSet ? (
              <Note>
                {t(
                  l,
                  `你給的是區塊裡的一個主機位址,不是網段位址。這個網段是 ${cidrToString({ family: report.family, addr: report.network, prefix: report.prefix })}。`,
                  `That is a host address inside the block, not the network address. The block is ${cidrToString({ family: report.family, addr: report.network, prefix: report.prefix })}.`
                )}
              </Note>
            ) : null}

            {scope ? (
              <p className="inst-hint">
                {t(l, '位址性質', 'Scope')}:{' '}
                <span style={{ color: 'var(--fg-muted)' }}>{scopeText(l, scope.id)}</span>{' '}
                <span className="inst-no">({scope.block})</span>
              </p>
            ) : null}

            <Input
              label={t(l, '這個位址在網段裡嗎', 'Is this address inside?')}
              value={probe}
              onChange={setProbe}
              placeholder={report?.family === 6 ? '2001:db8::5' : '192.168.1.77'}
            />
            {probeResult ? (
              <p className="inst-hint" aria-live="polite">
                {'bad' in probeResult
                  ? t(l, '× 這不是可以解析的位址', '× not a parseable address')
                  : 'mismatch' in probeResult
                    ? t(l, '× 位址家族與網段不同', '× different address family from the block')
                    : probeResult.inside
                      ? t(l, '✓ 在網段內', '✓ inside the block')
                      : t(l, '× 不在網段內', '× outside the block')}
              </p>
            ) : null}

            {noteText() ? <Note>{noteText()}</Note> : null}
          </>
        }
        right={
          report ? (
            <div aria-live="polite">
              <Table
                head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                rows={rows.map(([key, value]) => [
                  key,
                  <span key={key} className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    {value}
                  </span>,
                ])}
              />
            </div>
          ) : (
            <Note>{t(l, '輸入合法的網段就會在這裡拆開。', 'A valid block is broken down here.')}</Note>
          )
        }
      />

      <Panel
        label={t(l, '切分與彙總', 'SUBNET & SUMMARISE')}
        aside={
          <Seg
            label={t(l, '模式', 'mode')}
            value={view}
            onChange={setView}
            options={[
              { value: 'split', label: t(l, '切成小網段', 'split') },
              { value: 'range', label: t(l, '範圍轉 CIDR', 'range → CIDR') },
            ]}
          />
        }
      >
        {view === 'split' ? (
          <>
            <Row>
              <Input
                label={t(l, '新前綴長度', 'New prefix')}
                type="number"
                value={newPrefix}
                onChange={setNewPrefix}
                min={0}
                max={report ? BIT_WIDTH[report.family] : 128}
              />
              {splitResult ? (
                <span className="inst-no">
                  {formatBigCount(splitResult.total)} {t(l, '個子網段', 'subnets')}
                </span>
              ) : null}
            </Row>
            {parsed.ok && !splitResult ? (
              <Note error>
                {t(
                  l,
                  `新前綴要介於 ${parsed.cidr.prefix} 與 ${BIT_WIDTH[parsed.cidr.family]} 之間。`,
                  `The new prefix must be between ${parsed.cidr.prefix} and ${BIT_WIDTH[parsed.cidr.family]}.`
                )}
              </Note>
            ) : null}
            {splitResult ? (
              <>
                <Table
                  head={[
                    '#',
                    t(l, '子網段', 'subnet'),
                    t(l, '第一個可用', 'first usable'),
                    t(l, '最後一個可用', 'last usable'),
                  ]}
                  rows={splitResult.subnets.map((subnet, index) => {
                    const child = describe(subnet);
                    return [
                      String(index + 1),
                      <span key="c" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                        {cidrToString(subnet)}
                      </span>,
                      child.firstUsable === null ? '—' : formatAddress(subnet.family, child.firstUsable),
                      child.lastUsable === null ? '—' : formatAddress(subnet.family, child.lastUsable),
                    ];
                  })}
                />
                <Row>
                  <CopyButton
                    l={l}
                    text={splitResult.subnets.map(cidrToString).join('\n')}
                    label={t(l, '複製清單', 'copy list')}
                  />
                  {splitResult.truncated ? (
                    <span className="inst-no">
                      {t(
                        l,
                        `只列出前 ${SPLIT_CAP} 個,共 ${formatBigCount(splitResult.total)} 個。`,
                        `Showing the first ${SPLIT_CAP} of ${formatBigCount(splitResult.total)}.`
                      )}
                    </span>
                  ) : null}
                </Row>
              </>
            ) : null}
          </>
        ) : (
          <>
            <Row>
              <Input
                label={t(l, '起始位址', 'From')}
                value={rangeStart}
                onChange={setRangeStart}
                placeholder="192.168.1.1"
              />
              <Input
                label={t(l, '結束位址', 'To')}
                value={rangeEnd}
                onChange={setRangeEnd}
                placeholder="192.168.1.10"
              />
            </Row>
            <p className="inst-hint">
              {t(
                l,
                '把一段連續位址換成最少的 CIDR 區塊——防火牆規則與路由表只吃 CIDR,不吃範圍。',
                'Turns a contiguous range into the fewest CIDR blocks. Firewall rules and routing tables take CIDR, not ranges.'
              )}
            </p>
            {rangeResult && 'mismatch' in rangeResult ? (
              <Note error>{t(l, '兩端的位址家族要一樣。', 'Both ends must be the same address family.')}</Note>
            ) : null}
            {rangeResult && 'reversed' in rangeResult ? (
              <Note error>{t(l, '結束位址比起始位址小。', 'The end address is below the start address.')}</Note>
            ) : null}
            {rangeResult && 'blocks' in rangeResult ? (
              <>
                <Table
                  head={[t(l, '區塊', 'block'), t(l, '位址數', 'addresses')]}
                  rows={rangeResult.blocks.map((block) => [
                    <span key="b" className="inst-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                      {cidrToString(block)}
                    </span>,
                    formatBigCount(BigInt(1) << BigInt(BIT_WIDTH[block.family] - block.prefix)),
                  ])}
                />
                <Row>
                  <CopyButton
                    l={l}
                    text={rangeResult.blocks.map(cidrToString).join('\n')}
                    label={t(l, '複製清單', 'copy list')}
                  />
                  {rangeResult.truncated ? (
                    <span className="inst-no">
                      {t(l, `超過 ${RANGE_CAP} 個區塊,已截斷。`, `More than ${RANGE_CAP} blocks — truncated.`)}
                    </span>
                  ) : null}
                </Row>
              </>
            ) : null}
          </>
        )}
      </Panel>

      <Readout
        l={l}
        items={
          report
            ? [
                { k: t(l, '家族', 'family'), v: `IPv${report.family}` },
                { k: t(l, '前綴', 'prefix'), v: `/${report.prefix}` },
                { k: t(l, '區塊大小', 'block'), v: formatBigCount(report.total) },
                { k: t(l, '可用主機', 'hosts'), v: formatBigCount(report.usable) },
                {
                  k: t(l, '切分數', 'subnets'),
                  v:
                    view === 'split' && splitResult
                      ? formatBigCount(subnetCount(report.prefix, Number(newPrefix)))
                      : '—',
                },
              ]
            : [{ k: t(l, '狀態', 'status'), v: parsed.ok ? '—' : t(l, '無法解析', 'unparsed') }]
        }
      />
    </div>
  );
}
