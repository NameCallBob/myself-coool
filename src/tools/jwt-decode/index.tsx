'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  CopyButton,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  JwtError,
  algFamily,
  decodeJwt,
  inspectClaims,
  secretStrength,
  verify,
  type Jwt,
  type VerifyOutcome,
} from './logic';

/* ── The clock, as a store ────────────────── */
/**
 * Expiry is a comparison against now, and reading a clock during render is
 * impure — React 19 rejects it. The instant therefore comes from a store whose
 * snapshot only changes when the interval writes one.
 */
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(notify: () => void): () => void {
  clockListeners.add(notify);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const listener of clockListeners) listener();
    }, 1000);
  }
  return () => {
    clockListeners.delete(notify);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const readClock = () => clockNow;
const serverClock = () => 0;

const ALGS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(ms: number): string {
  const date = new Date(ms);
  if (!Number.isFinite(ms)) return '—';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function gap(seconds: number, l: 'zh' | 'en'): string {
  const abs = Math.abs(seconds);
  const unit =
    abs < 60
      ? t(l, `${abs} 秒`, `${abs}s`)
      : abs < 3600
        ? t(l, `${Math.floor(abs / 60)} 分`, `${Math.floor(abs / 60)}m`)
        : abs < 86400
          ? t(l, `${Math.floor(abs / 3600)} 小時`, `${Math.floor(abs / 3600)}h`)
          : t(l, `${Math.floor(abs / 86400)} 天`, `${Math.floor(abs / 86400)}d`);
  return seconds >= 0 ? t(l, `還有 ${unit}`, `${unit} left`) : t(l, `已過 ${unit}`, `${unit} ago`);
}

function errorText(error: JwtError, l: 'zh' | 'en'): string {
  switch (error.code) {
    case 'empty':
      return t(l, '還沒有貼入 token。', 'No token pasted yet.');
    case 'segment-count':
      return t(
        l,
        `用點分成 ${error.detail} 段。JWS 要三段(header.payload.signature),JWE 要五段。中間少了一個點,或是複製時被截斷了。`,
        `Split into ${error.detail} dot-separated parts. JWS has three (header.payload.signature) and JWE has five — a dot is missing, or the copy was truncated.`
      );
    case 'bad-base64':
      return t(
        l,
        `不是合法的 base64url:「${error.detail}」。JWT 用的是 URL 安全字母表(- 和 _,沒有 = 補位),貼到標準 base64 會壞在這裡。`,
        `Not valid base64url: "${error.detail}". JWT uses the URL-safe alphabet (- and _, no = padding).`
      );
    default:
      return error.message;
  }
}

/**
 * A JWT taken apart, and — separately — a signature actually checked.
 *
 * Those two things are kept visibly apart on purpose. Decoding tells you what
 * the token says; only verification tells you whether to believe it. Anyone can
 * write `{"role":"admin"}` into a payload and base64 it, and a viewer that
 * renders the claims without that distinction is how people end up trusting
 * one. Nothing typed here is stored: no localStorage, no URL, no history.
 */
export default function JwtDecode({ l }: ToolProps) {
  const now = useSyncExternalStore(subscribeClock, readClock, serverClock);

  const [token, setToken] = useState('');
  const [key, setKey] = useState('');
  const [algOverride, setAlgOverride] = useState('');
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [checking, setChecking] = useState(false);

  const decoded = useMemo((): { jwt: Jwt; error: null } | { jwt: null; error: JwtError | null } => {
    if (token.trim() === '') return { jwt: null, error: null };
    try {
      return { jwt: decodeJwt(token), error: null };
    } catch (error) {
      return {
        jwt: null,
        error: error instanceof JwtError ? error : new JwtError('bad-base64', String(error)),
      };
    }
  }, [token]);

  const jwt = decoded.jwt;
  const claims = useMemo(() => inspectClaims(jwt?.payload.value ?? null, now), [jwt, now]);

  // The header's own `alg` is a hint for the dropdown, never the thing that
  // picks the verifier: letting the token choose its own algorithm is the JWT
  // confusion attack. The selection is always the user's.
  const headerAlg = jwt?.alg ?? '';
  const alg = algOverride || (ALGS.includes(headerAlg.toUpperCase() as (typeof ALGS)[number]) ? headerAlg.toUpperCase() : 'HS256');
  const family = algFamily(alg);
  const symmetric = family === 'HS';
  const strength = symmetric ? secretStrength(key, alg) : null;

  const runVerify = async () => {
    if (!jwt) return;
    setChecking(true);
    const result = await verify(jwt, alg, key, crypto.subtle);
    setChecking(false);
    setOutcome(result);
  };

  const verdictColour =
    outcome?.status === 'valid'
      ? 'var(--data-teal)'
      : outcome?.status === 'invalid'
        ? 'var(--accent)'
        : 'var(--fg-muted)';

  const verdictText = !outcome
    ? t(l, '尚未驗證', 'not verified')
    : outcome.status === 'valid'
      ? t(l, '✓ 簽章相符', '✓ signature matches')
      : outcome.status === 'invalid'
        ? t(l, '✕ 簽章不符', '✕ signature does not match')
        : outcome.status === 'key-error'
          ? t(l, `金鑰讀不進來:${outcome.reason}`, `Key problem: ${outcome.reason}`)
          : t(l, `無法驗證:${outcome.reason}`, `Cannot verify: ${outcome.reason}`);

  return (
    <div>
      <Bench
        leftLabel={t(l, 'TOKEN', 'TOKEN')}
        rightLabel={t(l, '內容', 'CONTENTS')}
        leftAside={<span className="inst-no">{bytes(new Blob([token]).size)}</span>}
        rightAside={
          jwt ? (
            <span className="inst-no">
              {jwt.encrypted ? 'JWE' : 'JWS'} · {jwt.alg ?? '?'}
            </span>
          ) : null
        }
        left={
          <>
            <Area
              label={t(l, '貼上 JWT(可以連 Bearer 一起貼)', 'Paste a JWT (Bearer prefix is fine)')}
              hint={t(
                l,
                '這是敏感輸入。這個工具不寫 localStorage、不放進網址、不留在任何地方,關掉分頁就沒了。',
                'Sensitive input. This tool writes no localStorage, puts nothing in the URL, and keeps nothing once the tab closes.'
              )}
              value={token}
              onChange={(value) => {
                setToken(value);
                // A verdict belongs to one token. Keeping it across an edit
                // would show "valid" next to something that was never checked.
                setOutcome(null);
              }}
              rows={6}
              invalid={decoded.error !== null}
            />

            <Row>
              <ResetButton
                l={l}
                onReset={() => {
                  setToken('');
                  setKey('');
                  setOutcome(null);
                }}
              />
              {jwt ? (
                <CopyButton
                  l={l}
                  text={jwt.payload.text}
                  label={t(l, '複製 payload', 'copy payload')}
                />
              ) : null}
            </Row>

            {decoded.error ? <Note error>{errorText(decoded.error, l)}</Note> : null}

            {jwt?.unsecured ? (
              <Note error>
                {t(
                  l,
                  'alg 是 none,簽章欄位是空的。這種 token 任何人都能自己寫一個,它不能用來證明任何事。如果這是你的服務發出來的,那是個要修的漏洞。',
                  'alg is none and the signature is empty. Anyone can mint this token; it proves nothing. If your own service issued it, that is a vulnerability to fix.'
                )}
              </Note>
            ) : null}

            {jwt?.encrypted ? (
              <Note>
                {t(
                  l,
                  '五段結構是 JWE:內容是加密的,沒有解密金鑰就沒有 payload 可看。只有 header 能讀。',
                  'Five segments means JWE: the content is encrypted and there is no payload to read without the decryption key. Only the header is legible.'
                )}
              </Note>
            ) : null}

            <Panel label={t(l, '在本機驗簽', 'VERIFY LOCALLY')}>
              <Row>
                <Select
                  label={t(l, '演算法', 'Algorithm')}
                  value={alg}
                  onChange={setAlgOverride}
                  options={ALGS.map((name) => ({ value: name, label: name }))}
                />
                {headerAlg && headerAlg.toUpperCase() !== alg ? (
                  <span className="inst-no" style={{ color: 'var(--accent)' }}>
                    {t(l, `header 寫的是 ${headerAlg}`, `header says ${headerAlg}`)}
                  </span>
                ) : null}
              </Row>

              <Area
                label={
                  symmetric
                    ? t(l, 'HMAC 共享密鑰', 'HMAC shared secret')
                    : t(l, '公開金鑰(PEM,SPKI)', 'Public key (PEM, SPKI)')
                }
                hint={
                  symmetric
                    ? t(
                        l,
                        'RFC 7518 要求密鑰長度不短於雜湊輸出:HS256 至少 32 位元組。',
                        'RFC 7518 requires a key no shorter than the hash output: 32 bytes for HS256.'
                      )
                    : t(
                        l,
                        '貼 -----BEGIN PUBLIC KEY----- 那種格式。私鑰不需要,驗簽只要公開金鑰。',
                        'Paste the -----BEGIN PUBLIC KEY----- form. Verification needs only the public key.'
                      )
                }
                value={key}
                onChange={(value) => {
                  setKey(value);
                  setOutcome(null);
                }}
                rows={symmetric ? 2 : 6}
              />

              <Row>
                <Btn onClick={() => void runVerify()} primary disabled={!jwt || checking}>
                  {checking ? t(l, '驗證中…', 'checking…') : t(l, '驗證簽章', 'verify signature')}
                </Btn>
                <span className="inst-no" style={{ color: verdictColour }} role="status">
                  {verdictText}
                </span>
              </Row>

              {strength?.weak && key !== '' ? (
                <Note>
                  {t(
                    l,
                    `這個密鑰是 ${strength.bytes} 位元組,${alg} 建議至少 ${strength.required}。短密鑰可以離線暴力破解,簽章就不再代表什麼。`,
                    `This secret is ${strength.bytes} bytes; ${alg} wants at least ${strength.required}. A short secret can be brute-forced offline, at which point the signature means nothing.`
                  )}
                </Note>
              ) : null}

              <Note>
                {t(
                  l,
                  '演算法是你選的,不是從 header 讀的。讓 token 自己決定用什麼演算法驗,就是 JWT 的演算法混淆漏洞——攻擊者把 RS256 換成 HS256,再用公開金鑰當 HMAC 密鑰簽一個新的。',
                  'The algorithm is your choice, not the header’s. Letting a token pick its own verifier is the JWT algorithm-confusion flaw: swap RS256 for HS256 and sign with the public key as the HMAC secret.'
                )}
              </Note>
            </Panel>
          </>
        }
        right={
          <>
            <div className="inst-pane-label">
              <span>{t(l, 'HEADER', 'HEADER')}</span>
              {jwt ? <span className="inst-no">{bytes(jwt.header.bytes)}</span> : null}
            </div>
            <div className="inst-out" style={{ minHeight: '4rem' }} aria-live="polite">
              {jwt ? (
                jwt.header.text || <span style={{ color: 'var(--fg-faint)' }}>—</span>
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '貼上 token 後出現在這裡。', 'Appears once a token is pasted.')}
                </span>
              )}
            </div>

            <div className="inst-pane-label mt-3">
              <span>{t(l, 'PAYLOAD', 'PAYLOAD')}</span>
              {jwt && !jwt.encrypted ? <span className="inst-no">{bytes(jwt.payload.bytes)}</span> : null}
            </div>
            <div className="inst-out" style={{ minHeight: '8rem' }} aria-live="polite">
              {jwt?.encrypted ? (
                <span style={{ color: 'var(--fg-faint)' }}>
                  {t(l, '(加密內容,無法顯示)', '(encrypted, nothing to show)')}
                </span>
              ) : jwt ? (
                jwt.payload.text || <span style={{ color: 'var(--fg-faint)' }}>—</span>
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>—</span>
              )}
            </div>

            {claims.times.length > 0 ? (
              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '時間宣告', 'TIME CLAIMS')}</span>
                </div>
                <Table
                  head={[
                    t(l, '宣告', 'claim'),
                    t(l, '數值', 'value'),
                    t(l, '本地時間', 'local time'),
                    t(l, '距現在', 'from now'),
                  ]}
                  rows={claims.times.map((claim) => [
                    claim.name,
                    <span key="v" className="inst-no">
                      {claim.seconds}
                      {claim.looksLikeMillis ? ' ⚠' : ''}
                    </span>,
                    <span key="s" className="inst-no">
                      {stamp(claim.ms)}
                    </span>,
                    gap(Math.round((claim.ms - now) / 1000), l),
                  ])}
                />
              </div>
            ) : null}

            {claims.times.some((claim) => claim.looksLikeMillis) ? (
              <Note error>
                {t(
                  l,
                  '有時間宣告的數值大得像毫秒。RFC 7519 的 NumericDate 是「秒」,寫成毫秒的 token 在嚴格的驗證器眼中會是西元五萬年才過期。上面的時間是照毫秒解讀的。',
                  'A time claim is large enough to be milliseconds. RFC 7519 NumericDate is in seconds; a millisecond value expires in the year 56000 as far as a strict verifier is concerned. The times above are read as milliseconds.'
                )}
              </Note>
            ) : null}

            {claims.expired !== null ? (
              <Note error={claims.expired}>
                {claims.expired
                  ? t(
                      l,
                      `已過期(${gap(claims.secondsToExpiry ?? 0, l)})。`,
                      `Expired (${gap(claims.secondsToExpiry ?? 0, l)}).`
                    )
                  : t(
                      l,
                      `尚未過期,${gap(claims.secondsToExpiry ?? 0, l)}。`,
                      `Not expired — ${gap(claims.secondsToExpiry ?? 0, l)}.`
                    )}
              </Note>
            ) : jwt && !jwt.encrypted ? (
              <Note>
                {t(
                  l,
                  '這個 token 沒有 exp。沒有到期時間的存取權杖只能靠撤銷清單收回,一旦外洩就一直有效。',
                  'No exp claim. An access token with no expiry can only be withdrawn by a revocation list; once leaked it stays valid.'
                )}
              </Note>
            ) : null}

            {claims.notYetValid ? (
              <Note error>{t(l, 'nbf 還沒到,現在用會被拒。', 'nbf has not arrived; this token is not yet usable.')}</Note>
            ) : null}
            {claims.issuedInFuture ? (
              <Note error>
                {t(
                  l,
                  'iat 在未來超過一分鐘。通常是簽發端的時鐘偏了。',
                  'iat is more than a minute in the future, which usually means the issuer’s clock is off.'
                )}
              </Note>
            ) : null}

            {claims.other.length > 0 ? (
              <div className="mt-3">
                <div className="inst-pane-label">
                  <span>{t(l, '其他宣告', 'OTHER CLAIMS')}</span>
                  <span className="inst-no">{count(claims.other.length)}</span>
                </div>
                <Table
                  head={[t(l, '鍵', 'key'), t(l, '值', 'value')]}
                  rows={claims.other.map((entry) => [
                    <span key="k" className="inst-no">
                      {entry.key}
                    </span>,
                    <span key="v" className="inst-wrap">
                      {entry.value}
                    </span>,
                  ])}
                />
              </div>
            ) : null}
          </>
        }
      />

      <Readout
        l={l}
        items={[
          { k: t(l, '段數', 'segments'), v: jwt ? count(jwt.segmentCount) : '—' },
          { k: t(l, 'header alg', 'header alg'), v: jwt?.alg ?? '—' },
          {
            k: t(l, '簽章長度', 'signature'),
            v: jwt ? (jwt.signature.bits === 0 ? t(l, '無', 'none') : `${jwt.signature.bits} bits`) : '—',
          },
          { k: t(l, '宣告數', 'claims'), v: jwt ? count(claims.times.length + claims.other.length) : '—' },
          {
            k: t(l, '簽章驗證', 'verified'),
            v: outcome?.status === 'valid' ? t(l, '相符', 'match') : outcome ? t(l, '否', 'no') : '—',
          },
          { k: t(l, '持久化', 'stored'), v: t(l, '無', 'nothing') },
        ]}
      />
    </div>
  );
}
