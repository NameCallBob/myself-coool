'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  Input,
  Note,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { below, randomBytes } from '@/lib/tools/random';
import type { ToolProps } from '../types';
import {
  NANOID_ALPHABET,
  NANOID_HEX,
  NANOID_NUMBERS,
  NANOID_URL_SAFE,
  decodeId,
  entropyBits,
  idsBeforeCollision,
  nanoid,
  ulid,
  uuidV4,
  uuidV7,
  type DecodeNote,
} from './logic';

type Format = 'uuid4' | 'uuid7' | 'ulid' | 'nanoid';

const ALPHABETS: { value: string; label: string; chars: string }[] = [
  { value: 'urlsafe', label: 'A–Za–z0–9_- (64)', chars: NANOID_URL_SAFE },
  { value: 'nanoid', label: t('zh', 'NanoID 預設 (64)', 'NanoID default (64)'), chars: NANOID_ALPHABET },
  { value: 'crockford', label: 'Crockford base32 (32)', chars: '0123456789ABCDEFGHJKMNPQRSTVWXYZ' },
  { value: 'hex', label: 'hex (16)', chars: NANOID_HEX },
  { value: 'digits', label: '0–9 (10)', chars: NANOID_NUMBERS },
];

const MAX_BATCH = 200;

const pad = (n: number) => String(n).padStart(2, '0');

function localStamp(ms: number): string {
  const date = new Date(ms);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    String(date.getMilliseconds()).padStart(3, '0')
  );
}

/** Order-of-magnitude reading. 2.9e17 is the answer; 290000000000000000 is not. */
function magnitude(n: number): string {
  if (n === 0) return '—';
  if (n < 1e6) return Math.round(n).toLocaleString('en-US');
  const exponent = Math.floor(Math.log10(n));
  return `${(n / 10 ** exponent).toFixed(1)}×10^${exponent}`;
}

function noteText(note: DecodeNote, l: 'zh' | 'en'): string {
  switch (note) {
    case 'nil':
      return t(l, '這是 nil UUID(全部為零),通常代表「沒有值」而不是一個識別碼。', 'The nil UUID (all zeroes). It usually means "no value", not an identifier.');
    case 'max':
      return t(l, '這是 max UUID(全部為一),RFC 9562 保留給「最大值」語意。', 'The max UUID (all ones), reserved by RFC 9562 for "largest possible value".');
    case 'non-rfc-variant':
      return t(
        l,
        '變體位元不是 RFC 9562 的 10x。可能是舊的 Microsoft GUID,或者根本不是 UUID——底下按 RFC 佈局讀出來的欄位不一定有意義。',
        'The variant bits are not RFC 9562’s 10x. This may be an older Microsoft GUID, or not a UUID at all — the fields below assume the RFC layout.'
      );
    case 'time-ordered':
      return t(
        l,
        '前導位元是時間戳,所以字串排序等於時間排序。拿來當資料庫主鍵時,寫入會集中在索引尾端,不像 v4 那樣打散整棵 B-tree。',
        'The leading bits are a timestamp, so string order is time order. As a primary key this keeps inserts at the tail of the index instead of scattering them like v4.'
      );
    case 'not-time-based':
      return t(l, '這個格式不帶時間,從 ID 本身看不出建立時刻。', 'This format carries no time; the ID says nothing about when it was made.');
    case 'gregorian-epoch':
      return t(
        l,
        '時間基準是 1582-10-15(格里曆改制日),單位是 100 奈秒。不是 Unix epoch——直接把數值當秒或毫秒讀會錯四百年。',
        'The epoch is 1582-10-15, the Gregorian reform, counted in 100-nanosecond ticks — not Unix time. Reading the value as seconds is four centuries out.'
      );
    case 'name-based':
      return t(
        l,
        '這是雜湊出來的 ID:同樣的命名空間加同樣的名字永遠得到同一個值。它不是隨機的,也不該被當成無法猜測的東西。',
        'A hash-based ID: the same namespace and name always produce the same value. It is not random and must not be treated as unguessable.'
      );
    case 'unknown-version':
      return t(l, '版本號不在 1–8 之間,這不是標準 UUID 版本。', 'The version nibble is outside 1–8, so this is not a standard UUID version.');
    case 'alphabet-guess':
      return t(
        l,
        '這不是 UUID 也不是 ULID,所以字母表只能從用到的字元推測,長度與熵是照那個推測算的。',
        'Not a UUID or a ULID, so the alphabet is inferred from the characters present; the entropy figure follows that inference.'
      );
    case 'ambiguous-length':
      return t(
        l,
        '長度剛好 26 個字元,和 ULID 一樣,但前導字元代表的時間超過 48 位元能表示的範圍,所以不是 ULID。',
        'Exactly 26 characters, the same as a ULID, but the leading characters exceed what a 48-bit timestamp can hold, so it is not one.'
      );
    default:
      return note;
  }
}

/**
 * Four identifier formats, and a decoder for identifiers you already have.
 *
 * The decoder is the half that earns its keep: an ID in a log line is only
 * opaque until you know which format it is, and v7 and ULID will tell you the
 * millisecond the row was created.
 */
export default function IdGenerator({ l }: ToolProps) {
  const [format, setFormat] = useState<Format>('uuid7');
  const [batch, setBatch] = useState('10');
  const [size, setSize] = useState('21');
  const [alphabetId, setAlphabetId] = useState('urlsafe');
  const [uppercase, setUppercase] = useState(false);
  const [braces, setBraces] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [probe, setProbe] = useState('');

  const alphabet = ALPHABETS.find((entry) => entry.value === alphabetId) ?? ALPHABETS[0];
  const wanted = Math.min(Math.max(Number.parseInt(batch, 10) || 0, 0), MAX_BATCH);
  const length = Math.min(Math.max(Number.parseInt(size, 10) || 0, 1), 64);

  const bits =
    format === 'uuid4'
      ? 122
      : format === 'uuid7'
        ? 74
        : format === 'ulid'
          ? 80
          : Math.round(entropyBits(new Set(alphabet.chars).size, length));

  const generate = useCallback(() => {
    if (wanted < 1) {
      setProblem(t(l, '數量至少要 1。', 'Ask for at least one.'));
      return;
    }
    setProblem(null);
    // Date.now() lives in the handler, never in render: a clock read during
    // render is impure and React 19 rejects it.
    const madeAt = Date.now();
    const out: string[] = [];
    for (let i = 0; i < wanted; i += 1) {
      const raw =
        format === 'uuid4'
          ? uuidV4(randomBytes)
          : format === 'uuid7'
            ? uuidV7(madeAt, randomBytes)
            : format === 'ulid'
              ? ulid(madeAt, randomBytes)
              : nanoid(length, alphabet.chars, below);
      const cased = uppercase ? raw.toUpperCase() : raw;
      out.push(braces && format.startsWith('uuid') ? `{${cased}}` : cased);
    }
    setIds(out);
  }, [wanted, format, length, alphabet.chars, uppercase, braces, l]);

  const decoded = useMemo(() => decodeId(probe), [probe]);

  const sorted = useMemo(() => ids.slice().sort(), [ids]);
  const alreadySorted = useMemo(
    () => ids.length > 1 && ids.every((id, index) => id === sorted[index]),
    [ids, sorted]
  );

  return (
    <div>
      <Bench
        leftLabel={t(l, '產生', 'GENERATE')}
        rightLabel={t(l, '解析既有 ID', 'DECODE AN ID')}
        leftAside={<span className="inst-no">{bits} bits</span>}
        rightAside={
          decoded.kind === 'unknown' ? null : (
            <span className="inst-no">
              {decoded.kind === 'uuid'
                ? `UUID v${decoded.version ?? '?'}`
                : decoded.kind === 'ulid'
                  ? 'ULID'
                  : t(l, '不明格式', 'unrecognised')}
            </span>
          )
        }
        left={
          <>
            <Seg
              label={t(l, '格式', 'Format')}
              value={format}
              onChange={setFormat}
              options={[
                { value: 'uuid7', label: 'UUID v7' },
                { value: 'uuid4', label: 'UUID v4' },
                { value: 'ulid', label: 'ULID' },
                { value: 'nanoid', label: 'NanoID' },
              ]}
            />

            <Note>
              {format === 'uuid7'
                ? t(
                    l,
                    '48 位元的 Unix 毫秒放在最前面,後面 74 位元隨機。時間在前的好處是字串排序就是時間排序,當主鍵時寫入集中在索引尾端。',
                    '48 bits of Unix milliseconds first, then 74 random bits. Time-first means string order is time order, so inserts stay at the tail of an index.'
                  )
                : format === 'uuid4'
                  ? t(
                      l,
                      '122 位元純隨機,不帶時間也沒有順序。當資料庫主鍵會把寫入打散到整棵 B-tree,大表上這件事量得出來。',
                      '122 purely random bits with no time and no order. As a primary key it scatters inserts across the whole B-tree, which is measurable on a large table.'
                    )
                  : format === 'ulid'
                    ? t(
                        l,
                        '26 個 Crockford base32 字元:10 個字元的毫秒時間 + 16 個字元的隨機。比 UUID 短、可以唸出來,也是時間排序的。',
                        '26 Crockford base32 characters: ten of millisecond time and sixteen of randomness. Shorter than a UUID, pronounceable, and time-ordered.'
                      )
                    : t(
                        l,
                        '長度與字母表都是你決定的,所以熵也是。預設 21 個字元取自 64 字母表 = 126 位元,和 UUID v4 同級。',
                        'Length and alphabet are yours to choose, so the entropy is too. The 21-character default over 64 symbols is 126 bits, on par with UUID v4.'
                      )}
            </Note>

            <Row>
              <Input
                label={t(l, '數量', 'How many')}
                type="number"
                min={1}
                max={MAX_BATCH}
                value={batch}
                onChange={setBatch}
              />
              {format === 'nanoid' ? (
                <Input
                  label={t(l, '長度', 'Length')}
                  type="number"
                  min={1}
                  max={64}
                  value={size}
                  onChange={setSize}
                />
              ) : null}
            </Row>

            {format === 'nanoid' ? (
              <Select
                label={t(l, '字母表', 'Alphabet')}
                hint={t(
                  l,
                  '重複字元會被去掉再抽樣,否則報出來的熵會比實際高。',
                  'Duplicate characters are removed before sampling; otherwise the reported entropy would be too high.'
                )}
                value={alphabetId}
                onChange={setAlphabetId}
                options={ALPHABETS.map((entry) => ({ value: entry.value, label: entry.label }))}
              />
            ) : null}

            <Row>
              <Btn onClick={generate} primary>
                {t(l, '產生', 'generate')}
              </Btn>
              <Check2 label={t(l, '大寫', 'upper case')} checked={uppercase} onChange={setUppercase} />
              {format.startsWith('uuid') ? (
                <Check2 label={t(l, '加大括號', 'wrap in braces')} checked={braces} onChange={setBraces} />
              ) : null}
              {ids.length > 0 ? (
                <CopyButton l={l} text={ids.join('\n')} label={t(l, '全部複製', 'copy all')} />
              ) : null}
            </Row>

            {problem ? <Note error>{problem}</Note> : null}

            <div className="inst-out mt-3" style={{ minHeight: '10rem' }} aria-live="polite">
              {ids.length === 0 ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '按「產生」。', 'Press generate.')}
                </span>
              ) : (
                ids.map((id) => (
                  <div key={id} className="inst-wrap">
                    {id}
                  </div>
                ))
              )}
            </div>

            {ids.length > 1 ? (
              <Note>
                {alreadySorted
                  ? t(
                      l,
                      '這一批照產生順序就已經是字典序——時間排序的格式本來就該這樣。',
                      'This batch is already in lexicographic order, which is what a time-ordered format should do.'
                    )
                  : t(
                      l,
                      '這一批的產生順序不等於字典序,因為這個格式不帶時間。要「新的排在後面」就用 v7 或 ULID。',
                      'Generation order is not lexicographic order here, because this format carries no time. Use v7 or ULID if newer must sort later.'
                    )}
              </Note>
            ) : null}
          </>
        }
        right={
          <>
            <Area
              label={t(l, '貼一個 ID 進來', 'Paste an identifier')}
              hint={t(
                l,
                'UUID(含大括號或 urn:uuid: 前綴)、ULID、或任何短字串。認不出來的會照字元推測字母表。',
                'A UUID (braces and urn:uuid: are fine), a ULID, or any short string. Anything unrecognised gets an inferred alphabet.'
              )}
              value={probe}
              onChange={setProbe}
              rows={3}
              placeholder="017f22e2-79b0-7cc3-98c4-dc0c0c07398f"
            />

            <div aria-live="polite">
              {decoded.kind === 'unknown' ? (
                <Note>{t(l, '貼上之後會拆給你看。', 'Paste something to take it apart.')}</Note>
              ) : (
                <>
                  <Table
                    head={[t(l, '項目', 'field'), t(l, '值', 'value')]}
                    rows={[
                      [
                        t(l, '判定格式', 'read as'),
                        decoded.kind === 'uuid'
                          ? `UUID v${decoded.version ?? '—'}`
                          : decoded.kind === 'ulid'
                            ? 'ULID'
                            : t(l, '不明(當作一般隨機字串)', 'unrecognised (treated as a random string)'),
                      ],
                      [
                        t(l, '正規化', 'canonical'),
                        <span key="c" className="inst-wrap">
                          {decoded.canonical}
                        </span>,
                      ],
                      ...(decoded.variant ? [[t(l, '變體', 'variant'), decoded.variant]] : []),
                      ...(decoded.timestampMs !== null
                        ? [
                            [
                              t(l, '時間戳(本地)', 'timestamp (local)'),
                              <span key="ts" className="inst-no">
                                {localStamp(decoded.timestampMs)}
                              </span>,
                            ],
                            [
                              t(l, '時間戳(UTC)', 'timestamp (UTC)'),
                              <span key="tu" className="inst-no">
                                {new Date(decoded.timestampMs).toISOString()}
                              </span>,
                            ],
                          ]
                        : []),
                      ...(decoded.timestampSub100ns
                        ? [
                            [
                              t(l, '毫秒以下', 'sub-millisecond'),
                              `+${decoded.timestampSub100ns} × 100 ns`,
                            ],
                          ]
                        : []),
                      ...decoded.parts.map((part) => [
                        part.label,
                        <span key={part.label} className="inst-wrap inst-no">
                          {part.value}
                        </span>,
                      ]),
                      [
                        t(l, '隨機位元', 'random bits'),
                        decoded.randomBits === 0 ? t(l, '無(非隨機格式)', 'none (not random)') : String(decoded.randomBits),
                      ],
                      ...(decoded.randomBits > 0
                        ? [
                            [
                              t(l, '1% 碰撞前可產生', 'ids before 1% collision'),
                              magnitude(idsBeforeCollision(decoded.randomBits, 0.01)),
                            ],
                          ]
                        : []),
                    ]}
                  />

                  {decoded.notes.map((note) => (
                    <Note key={note} error={note === 'non-rfc-variant' || note === 'unknown-version'}>
                      {noteText(note, l)}
                    </Note>
                  ))}
                </>
              )}
            </div>
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '格式', 'format'), v: format === 'nanoid' ? `NanoID ${length}` : format.toUpperCase() },
          { k: t(l, '隨機位元', 'random bits'), v: String(bits) },
          {
            k: t(l, '1% 碰撞前', 'before 1% collision'),
            v: magnitude(idsBeforeCollision(bits, 0.01)),
          },
          { k: t(l, '這批數量', 'batch'), v: count(ids.length) },
          { k: t(l, '亂數來源', 'source'), v: 'crypto.getRandomValues' },
        ]}
      />
    </div>
  );
}
