'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { t } from '@/lib/tools/locale';
import { randomBytes } from '@/lib/tools/random';
import {
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  InvalidSecret,
  MAX_DIGITS,
  MIN_DIGITS,
  OTP_ALGOS,
  base32Decode,
  base32Encode,
  buildOtpauth,
  groupSecret,
  parseOtpauth,
  secondsLeft,
  stepOf,
  totpWindow,
  type OtpAlgo,
  type WindowCode,
} from './logic';

type Config = {
  secret: string;
  period: number;
  digits: number;
  algo: OtpAlgo;
  /** Seconds added to this device's clock, for testing against a server that disagrees. */
  skew: number;
};

type Snapshot = {
  second: number;
  left: number;
  step: number;
  codes: WindowCode[];
  error: string | null;
};

const EMPTY: Snapshot = { second: 0, left: 0, step: 0, codes: [], error: null };

/**
 * The clock and the codes behind one external store.
 *
 * Two house rules meet here: nothing may call `Date.now()` during render, and
 * nothing may `setState` inside an effect. A store satisfies both — the
 * interval lives in `subscribe`, the component only ever reads a snapshot,
 * and the async `crypto.subtle` work that produces a code writes into the
 * snapshot and notifies, instead of being started from a render pass.
 */
function createStore() {
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = EMPTY;
  let config: Config | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Identifies the (secret, parameters, step) a code was last computed for. */
  let computedFor = '';

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const refresh = async (current: Config, second: number, key: string) => {
    try {
      const secret = base32Decode(current.secret);
      if (secret.length === 0) {
        snapshot = { ...snapshot, codes: [], error: null };
        emit();
        return;
      }
      const codes = await totpWindow(secret, second, {
        period: current.period,
        digits: current.digits,
        algo: current.algo,
      });
      if (key !== computedFor) return; // a newer step or secret won the race
      snapshot = { ...snapshot, codes, error: null };
      emit();
    } catch (problem) {
      if (key !== computedFor) return;
      snapshot = {
        ...snapshot,
        codes: [],
        error: problem instanceof Error ? problem.message : String(problem),
      };
      emit();
    }
  };

  const tick = () => {
    if (!config) return;
    const second = Math.floor(Date.now() / 1000) + config.skew;
    const step = stepOf(second, config.period);
    const left = secondsLeft(second, config.period);
    if (snapshot.second !== second) {
      snapshot = { ...snapshot, second, step, left };
      emit();
    }
    const key = [config.secret, config.period, config.digits, config.algo, step].join('|');
    if (key !== computedFor) {
      computedFor = key;
      void refresh(config, second, key);
    }
  };

  return {
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      if (!timer) timer = setInterval(tick, 250);
      queueMicrotask(tick);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY,
    setConfig(next: Config) {
      config = next;
      tick();
    },
  };
}

/**
 * Sensitive tool. The secret is never written to localStorage, never put in
 * the URL, and is gone on reload — which is also why this is a bench
 * instrument rather than an authenticator: an authenticator has to remember.
 */
export default function Totp({ l }: ToolProps) {
  const [store] = useState(createStore);
  const [config, setConfig] = useState<Config>({
    secret: '',
    period: DEFAULT_PERIOD,
    digits: DEFAULT_DIGITS,
    algo: 'sha1',
    skew: 0,
  });
  const [paste, setPaste] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const apply = useCallback(
    (patch: Partial<Config>) => {
      const next = { ...config, ...patch };
      setConfig(next);
      store.setConfig(next);
    },
    [config, store]
  );

  /** A pasted otpauth:// URI carries every parameter; a pasted secret is just the secret. */
  const takePaste = useCallback(
    (text: string) => {
      setPaste(text);
      const trimmed = text.trim();
      if (!trimmed.toLowerCase().startsWith('otpauth://')) {
        setNotice(null);
        return;
      }
      try {
        const parsed = parseOtpauth(trimmed);
        apply({
          secret: parsed.secret,
          period: parsed.period,
          digits: parsed.digits,
          algo: parsed.algo,
        });
        setNotice(
          t(
            l,
            `讀到 ${parsed.issuer ?? '(無發行者)'} / ${parsed.account ?? '(無帳號)'}${
              parsed.ignored.length > 0 ? `,忽略了 ${parsed.ignored.join('、')} 參數` : ''
            }`,
            `Read ${parsed.issuer ?? '(no issuer)'} / ${parsed.account ?? '(no account)'}${
              parsed.ignored.length > 0 ? `; ignored ${parsed.ignored.join(', ')}` : ''
            }`
          )
        );
      } catch (problem) {
        setNotice(problem instanceof InvalidSecret ? problem.message : String(problem));
      }
    },
    [apply, l]
  );

  const current = snapshot.codes.find((entry) => entry.offset === 0) ?? null;
  const fraction = config.period > 0 ? snapshot.left / config.period : 0;

  return (
    <div>
      <Bench
        leftLabel={t(l, '密鑰與參數', 'SECRET AND PARAMETERS')}
        rightLabel={t(l, '驗證碼', 'CODE')}
        leftAside={<span className="inst-no">{t(l, '不儲存', 'nothing stored')}</span>}
        rightAside={
          current ? (
            <span className="inst-no">
              {t(l, `剩 ${snapshot.left} 秒`, `${snapshot.left}s left`)}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, 'base32 密鑰,或整段 otpauth:// URI', 'Base32 secret, or a whole otpauth:// URI')}
              hint={t(
                l,
                '服務印給你的那串(A-Z 與 2-7,大小寫與空格都沒關係)。貼 otpauth:// 的話,演算法、位數、週期會一起帶進來。',
                'The string the service printed (A–Z and 2–7; case and spaces do not matter). An otpauth:// URI also fills in the algorithm, digits and period.'
              )}
              value={paste}
              onChange={takePaste}
              rows={3}
              invalid={snapshot.error !== null}
              placeholder="JBSWY3DPEHPK3PXP"
            />
            {!paste.trim().toLowerCase().startsWith('otpauth://') ? (
              <Row>
                <Btn
                  primary
                  onClick={() => {
                    apply({ secret: paste.replace(/[\s-]/g, '').toUpperCase() });
                    setNotice(null);
                  }}
                >
                  {t(l, '用這個密鑰', 'use this secret')}
                </Btn>
                <Btn
                  onClick={() => {
                    // 20 bytes is the RFC 4226 recommendation and what most
                    // issuers use: 160 bits, 32 base32 characters.
                    const secret = base32Encode(randomBytes(20));
                    setPaste(secret);
                    apply({ secret });
                    setNotice(t(l, '新的 160 bit 密鑰,只存在這個分頁。', 'A fresh 160-bit secret, held in this tab only.'));
                  }}
                >
                  {t(l, '產生新密鑰', 'new secret')}
                </Btn>
              </Row>
            ) : null}

            <Row>
              <Select
                label={t(l, '雜湊', 'Hash')}
                value={config.algo}
                onChange={(algo) => apply({ algo })}
                options={OTP_ALGOS.map((algo) => ({
                  value: algo,
                  label: algo === 'sha1' ? 'SHA-1 (default)' : algo.toUpperCase(),
                }))}
              />
              <Input
                label={t(l, '位數', 'Digits')}
                value={config.digits}
                type="number"
                min={MIN_DIGITS}
                max={MAX_DIGITS}
                onChange={(value) => {
                  const digits = Number(value);
                  if (Number.isInteger(digits) && digits >= MIN_DIGITS && digits <= MAX_DIGITS) {
                    apply({ digits });
                  }
                }}
              />
              <Input
                label={t(l, '週期(秒)', 'Period (s)')}
                value={config.period}
                type="number"
                min={1}
                max={600}
                onChange={(value) => {
                  const period = Number(value);
                  if (Number.isInteger(period) && period >= 1 && period <= 600) apply({ period });
                }}
              />
            </Row>

            <Row>
              <Input
                label={t(l, '時鐘校正(秒)', 'Clock offset (s)')}
                hint={t(
                  l,
                  '伺服器說碼不對、但你確定密鑰沒錯時,先懷疑時鐘。填 +30 或 -30 看看是不是差一個週期。',
                  'When the server rejects a code you are sure about, suspect the clock. Try +30 or −30 to see if you are one step out.'
                )}
                value={config.skew}
                type="number"
                min={-3600}
                max={3600}
                onChange={(value) => {
                  const skew = Number(value);
                  if (Number.isFinite(skew)) apply({ skew: Math.trunc(skew) });
                }}
              />
            </Row>

            {snapshot.error ? (
              <Note error>
                {t(l, `密鑰讀不出來:${snapshot.error}`, `Could not read the secret: ${snapshot.error}`)}
              </Note>
            ) : null}
            {notice ? <Note>{notice}</Note> : null}
          </>
        }
        right={
          current ? (
            <>
              <div className="inst-field">
                <span className="inst-label">{t(l, '現在的碼', 'Current code')}</span>
                <div
                  aria-live="polite"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'clamp(2rem, 8vw, 3.25rem)',
                    letterSpacing: '0.12em',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.1,
                  }}
                >
                  {current.code.replace(/(\d{3})(?=\d)/g, '$1 ')}
                </div>
                {/* The bar is decoration for the number beside it; the seconds
                    are always written out, so nothing depends on colour. */}
                <div
                  style={{
                    height: 2,
                    background: 'var(--border-2)',
                    marginTop: '0.5rem',
                  }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
                      background: snapshot.left <= 5 ? 'var(--accent)' : 'var(--data-teal)',
                    }}
                  />
                </div>
                <p className="inst-hint">
                  {t(
                    l,
                    `這個碼在 ${snapshot.left} 秒後換一組(第 ${snapshot.step} 個週期)。`,
                    `Changes in ${snapshot.left} s (step ${snapshot.step}).`
                  )}
                </p>
              </div>

              <Row>
                <CopyButton l={l} text={current.code} label={t(l, '複製這組碼', 'copy code')} />
              </Row>

              <Table
                head={[t(l, '週期', 'step'), t(l, '碼', 'code'), t(l, '用途', 'why')]}
                rows={snapshot.codes.map((entry) => [
                  <span key="s" className="inst-no">
                    {entry.offset === 0 ? t(l, '現在', 'now') : entry.offset > 0 ? `+${entry.offset}` : entry.offset}
                  </span>,
                  <span key="c" style={{ fontFamily: 'var(--font-mono)' }}>
                    {entry.code}
                  </span>,
                  entry.offset === 0
                    ? t(l, '正在生效', 'in force')
                    : entry.offset < 0
                      ? t(l, '多數伺服器仍接受(容忍時鐘慢)', 'usually still accepted (clock drift)')
                      : t(l, '下一組,時鐘快的伺服器會接受', 'next one; accepted by a server running fast'),
                ])}
              />

              <Panel
                label={t(l, '這個設定的 otpauth:// URI', 'THE otpauth:// URI FOR THIS SETUP')}
                aside={
                  <CopyButton
                    l={l}
                    text={buildOtpauth({
                      secret: config.secret,
                      algo: config.algo,
                      digits: config.digits,
                      period: config.period,
                    })}
                  />
                }
              >
                <div className="inst-out" style={{ minHeight: 0 }}>
                  {buildOtpauth({
                    secret: config.secret,
                    algo: config.algo,
                    digits: config.digits,
                    period: config.period,
                  })}
                </div>
                <Note>
                  {t(
                    l,
                    '密鑰就寫在這串裡面,等於把第二因素整個交出去——只在自己看得到的地方用。',
                    'The secret is inside that string, so it is the whole second factor — keep it to yourself.'
                  )}
                </Note>
              </Panel>

              <Row>
                <Btn
                  onClick={() => {
                    setPaste('');
                    setNotice(null);
                    apply({ secret: '' });
                  }}
                >
                  {t(l, '清空密鑰', 'clear the secret')}
                </Btn>
                <span className="inst-no">
                  {t(l, `密鑰 ${secretBits(config.secret)} bit · ${groupSecret(config.secret)}`, `${secretBits(config.secret)}-bit secret · ${groupSecret(config.secret)}`)}
                </span>
              </Row>
            </>
          ) : (
            <Note>
              {t(
                l,
                '貼上密鑰後這裡會每秒更新。碼是用這台裝置的時鐘算的,沒有任何連線。',
                'Paste a secret and this updates every second. Codes come from this device’s clock, with no connection to anything.'
              )}
            </Note>
          )
        }
      />

      <Panel label={t(l, '碼不被接受的時候', 'WHEN A CODE IS REJECTED')}>
        <Table
          head={[t(l, '症狀', 'symptom'), t(l, '通常的原因', 'usual cause')]}
          rows={[
            [
              t(l, '每一組都被拒絕', 'every code is rejected'),
              t(
                l,
                '密鑰讀錯了。最常見是把 base32 當 base64、或漏掉一個字元。也可能是位數或雜湊不是預設值。',
                'The secret is wrong — usually base32 read as base64, or a dropped character. Otherwise the digits or hash are not the defaults.'
              ),
            ],
            [
              t(l, '上一組或下一組才對', 'the previous or next code works'),
              t(
                l,
                '時鐘差了一個週期。校正這台裝置的時間,不要靠伺服器容忍。',
                'The clock is one step out. Fix this device’s time rather than relying on the server’s tolerance.'
              ),
            ],
            [
              t(l, '偶爾失敗', 'fails occasionally'),
              t(
                l,
                '在週期邊界送出的。剩 5 秒以內就等下一組。',
                'Submitted on a step boundary. With under five seconds left, wait for the next one.'
              ),
            ],
            [
              t(l, '只有某個服務不行', 'only one service fails'),
              t(
                l,
                '那個服務可能用 8 位數、60 秒週期或 SHA-256。照它文件上的值改左邊的參數。',
                'That service may use 8 digits, a 60-second period or SHA-256. Set the parameters to match its documentation.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            'TOTP 的安全性完全來自密鑰的保密。把密鑰貼進任何網頁都是風險——這一頁不連線、不儲存,但你仍應該只在自己的裝置上這樣做,並且優先用手機上的 authenticator。',
            'TOTP’s security rests entirely on the secret staying secret. Pasting one into any web page is a risk — this page makes no connections and stores nothing, but do it only on your own device, and prefer an authenticator app for real use.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '雜湊', 'hash'), v: config.algo.toUpperCase() },
          { k: t(l, '位數', 'digits'), v: String(config.digits) },
          { k: t(l, '週期', 'period'), v: `${config.period} s` },
          { k: t(l, '校正', 'offset'), v: `${config.skew >= 0 ? '+' : ''}${config.skew} s` },
          { k: t(l, '週期序號', 'step'), v: current ? String(snapshot.step) : '—' },
        ]}
      />
    </div>
  );
}

/**
 * Secret length in bits, or 0 when it does not decode.
 *
 * Called during render, so it must not throw: a keystroke can leave the
 * secret temporarily invalid while the previous step's codes are still on
 * screen, and a render-time exception would take the tool down with it.
 */
function secretBits(secret: string): number {
  try {
    return base32Decode(secret).length * 8;
  } catch {
    return 0;
  }
}
