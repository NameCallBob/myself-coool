'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Bench,
  Btn,
  CopyButton,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Select,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  EC_CURVES,
  RSA_SIZES,
  UnsupportedKey,
  describeKind,
  equivalentBits,
  exportPair,
  generatePair,
  toBase64Url,
  toHex,
  type EcKind,
  type Exported,
  type KeyKind,
  type RsaKind,
} from './logic';

type Family = 'rsa' | 'ec' | 'ed25519';
type Shown = 'public-pem' | 'private-pem' | 'public-jwk' | 'private-jwk' | 'openssh';

/**
 * Sensitive tool. The private key is in this tab's memory and nowhere else —
 * no localStorage, no URL, gone on reload. Which also means: if you generate
 * a key you intend to keep, save it before you close the tab.
 */
export default function KeyPair({ l }: ToolProps) {
  const [family, setFamily] = useState<Family>('ec');
  const [modulusBits, setModulusBits] = useState(3072);
  const [rsaAlgorithm, setRsaAlgorithm] = useState<RsaKind['algorithm']>('RSASSA-PKCS1-v1_5');
  const [hash, setHash] = useState<RsaKind['hash']>('SHA-256');
  const [curve, setCurve] = useState<EcKind['curve']>('P-256');
  const [ecAlgorithm, setEcAlgorithm] = useState<EcKind['algorithm']>('ECDSA');
  const [comment, setComment] = useState('');
  const [shown, setShown] = useState<Shown>('public-pem');
  const [revealPrivate, setRevealPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<{ kind: KeyKind; exported: Exported } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoised so the generate callback is not rebuilt on every keystroke in
  // the comment field.
  const kind = useMemo<KeyKind>(
    () =>
      family === 'rsa'
        ? { family: 'rsa', algorithm: rsaAlgorithm, modulusBits, hash }
        : family === 'ec'
          ? { family: 'ec', algorithm: ecAlgorithm, curve }
          : { family: 'ed25519', algorithm: 'Ed25519' },
    [family, rsaAlgorithm, modulusBits, hash, ecAlgorithm, curve]
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setKeys(null);
    setRevealPrivate(false);
    try {
      const pair = await generatePair(kind);
      setKeys({ kind, exported: await exportPair(pair, comment.trim()) });
      setShown('public-pem');
    } catch (problem) {
      setError(
        problem instanceof UnsupportedKey
          ? problem.message
          : problem instanceof Error
            ? problem.message
            : String(problem)
      );
    } finally {
      setBusy(false);
    }
  }, [kind, comment]);

  const exported = keys?.exported ?? null;
  const isPrivate = shown === 'private-pem' || shown === 'private-jwk';
  const body = !exported
    ? ''
    : shown === 'public-pem'
      ? exported.publicPem
      : shown === 'private-pem'
        ? exported.privatePem
        : shown === 'public-jwk'
          ? exported.publicJwk
          : shown === 'private-jwk'
            ? exported.privateJwk
            : (exported.openssh ??
              t(l, '這種金鑰沒有 OpenSSH 的表示法。', 'This key type has no OpenSSH representation.'));

  return (
    <div>
      <Bench
        leftLabel={t(l, '金鑰規格', 'KEY SPECIFICATION')}
        rightLabel={t(l, '匯出', 'EXPORT')}
        leftAside={<span className="inst-no">{t(l, '不儲存', 'nothing stored')}</span>}
        rightAside={exported ? <span className="inst-no">{describeKind(kind)}</span> : null}
        left={
          <>
            <Row>
              <Seg
                label={t(l, '類型', 'Type')}
                value={family}
                onChange={setFamily}
                options={[
                  { value: 'ec', label: 'ECDSA / ECDH' },
                  { value: 'rsa', label: 'RSA' },
                  { value: 'ed25519', label: 'Ed25519' },
                ]}
              />
            </Row>

            {family === 'rsa' ? (
              <Row>
                <Select
                  label={t(l, '用途', 'Purpose')}
                  value={rsaAlgorithm}
                  onChange={setRsaAlgorithm}
                  options={[
                    { value: 'RSASSA-PKCS1-v1_5', label: t(l, '簽章 PKCS#1 v1.5', 'sign, PKCS#1 v1.5') },
                    { value: 'RSA-PSS', label: t(l, '簽章 PSS', 'sign, PSS') },
                    { value: 'RSA-OAEP', label: t(l, '加密 OAEP', 'encrypt, OAEP') },
                  ]}
                />
                <Select
                  label={t(l, '長度', 'Modulus')}
                  value={String(modulusBits)}
                  onChange={(value) => setModulusBits(Number(value))}
                  options={RSA_SIZES.map((size) => ({ value: String(size), label: `${size} bit` }))}
                />
                <Select
                  label={t(l, '雜湊', 'Hash')}
                  value={hash}
                  onChange={setHash}
                  options={[
                    { value: 'SHA-256', label: 'SHA-256' },
                    { value: 'SHA-384', label: 'SHA-384' },
                    { value: 'SHA-512', label: 'SHA-512' },
                  ]}
                />
              </Row>
            ) : null}

            {family === 'ec' ? (
              <Row>
                <Select
                  label={t(l, '用途', 'Purpose')}
                  value={ecAlgorithm}
                  onChange={setEcAlgorithm}
                  options={[
                    { value: 'ECDSA', label: t(l, '簽章 ECDSA', 'sign, ECDSA') },
                    { value: 'ECDH', label: t(l, '金鑰協商 ECDH', 'key agreement, ECDH') },
                  ]}
                />
                <Select
                  label={t(l, '曲線', 'Curve')}
                  value={curve}
                  onChange={setCurve}
                  options={EC_CURVES.map((value) => ({ value, label: value }))}
                />
              </Row>
            ) : null}

            {family === 'ed25519' ? (
              <Note>
                {t(
                  l,
                  'Ed25519 只做簽章,金鑰 32 位元組,沒有參數可以調。瀏覽器支援較新,不支援時下面會直接說。',
                  'Ed25519 signs only, has a 32-byte key and nothing to configure. Browser support is recent; if it is missing you will be told.'
                )}
              </Note>
            ) : null}

            <Input
              label={t(l, 'OpenSSH 註解(選填)', 'OpenSSH comment (optional)')}
              hint={t(
                l,
                '會接在 authorized_keys 那一行的後面,通常寫 user@host。',
                'Appended to the authorized_keys line — usually user@host.'
              )}
              value={comment}
              onChange={setComment}
              placeholder="binbin@laptop"
            />

            <Row>
              <Btn primary onClick={generate} disabled={busy}>
                {busy ? t(l, '產生中…', 'generating…') : t(l, '產生金鑰對', 'generate pair')}
              </Btn>
              {keys ? (
                <Btn
                  onClick={() => {
                    setKeys(null);
                    setRevealPrivate(false);
                  }}
                >
                  {t(l, '從記憶體清掉', 'drop from memory')}
                </Btn>
              ) : null}
            </Row>
            {family === 'rsa' && modulusBits >= 4096 ? (
              <Note>
                {t(
                  l,
                  'RSA 4096 在手機上可能要等好幾秒,期間分頁不會回應。',
                  'RSA 4096 can take several seconds on a phone, and the tab will not respond while it works.'
                )}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          exported ? (
            <>
              <Row>
                <Seg
                  label={t(l, '要看哪一份', 'Which part')}
                  value={shown}
                  onChange={setShown}
                  options={[
                    { value: 'public-pem', label: t(l, '公鑰 PEM', 'public PEM') },
                    { value: 'private-pem', label: t(l, '私鑰 PEM', 'private PEM') },
                    { value: 'public-jwk', label: t(l, '公鑰 JWK', 'public JWK') },
                    { value: 'private-jwk', label: t(l, '私鑰 JWK', 'private JWK') },
                    { value: 'openssh', label: 'OpenSSH' },
                  ]}
                />
              </Row>

              {isPrivate && !revealPrivate ? (
                <div className="inst-out" style={{ minHeight: '12rem' }}>
                  <p className="inst-hint" style={{ marginTop: 0 }}>
                    {t(
                      l,
                      '私鑰先遮著。確認旁邊沒有人、也沒有在分享畫面再按下面那顆。',
                      'The private key is hidden. Press below once you have checked nobody is looking over your shoulder or at a shared screen.'
                    )}
                  </p>
                  <Btn onClick={() => setRevealPrivate(true)}>{t(l, '顯示私鑰', 'reveal the private key')}</Btn>
                </div>
              ) : (
                <>
                  <Row>
                    <CopyButton l={l} text={body} />
                    {isPrivate ? (
                      <Btn onClick={() => setRevealPrivate(false)}>{t(l, '再遮起來', 'hide again')}</Btn>
                    ) : null}
                  </Row>
                  <div className="inst-out" style={{ minHeight: '14rem' }} aria-live="polite">
                    {body}
                  </div>
                </>
              )}

              <Table
                head={[t(l, '指紋', 'fingerprint'), t(l, '雜湊了什麼', 'over what'), t(l, '值', 'value')]}
                rows={[
                  [
                    'SHA-256 (DER)',
                    t(l, 'SubjectPublicKeyInfo', 'SubjectPublicKeyInfo'),
                    <span key="a" className="inst-wrap inst-no">
                      {toHex(exported.spkiSha256, ':')}
                    </span>,
                  ],
                  [
                    'SSH',
                    t(l, 'SSH 線路格式', 'the SSH wire format'),
                    <span key="b" className="inst-wrap inst-no">
                      {exported.sshFingerprint ?? t(l, '不適用', 'n/a')}
                    </span>,
                  ],
                  [
                    t(l, 'JWK 指紋 (RFC 7638)', 'JWK thumbprint (RFC 7638)'),
                    t(l, '必要欄位的正規 JSON', 'the canonical required members'),
                    <span key="c" className="inst-wrap inst-no">
                      {exported.thumbprint}
                    </span>,
                  ],
                ]}
              />
              <Note>
                {t(
                  l,
                  '三個都是「這把公鑰」的指紋,但雜湊的東西不一樣,所以值一定不同。跟別人核對時要先講清楚是哪一種。',
                  'All three fingerprint the same public key but hash different encodings, so the values differ. Say which one you mean before comparing with someone.'
                )}
              </Note>
              <Row>
                <span className="inst-no">
                  {t(l, 'base64url 的 DER 指紋', 'DER fingerprint, base64url')}: {toBase64Url(exported.spkiSha256)}
                </span>
              </Row>
            </>
          ) : (
            <Note>
              {t(
                l,
                '按左邊的按鈕產生。金鑰由瀏覽器的 WebCrypto 產生,私鑰只存在這個分頁的記憶體裡——要留就先存檔。',
                'Generate with the button on the left. Keys come from the browser’s WebCrypto and the private key lives only in this tab’s memory — save it if you want to keep it.'
              )}
            </Note>
          )
        }
      />

      <Panel label={t(l, '選哪一種', 'WHICH TO PICK')}>
        <Table
          head={[
            t(l, '金鑰', 'key'),
            t(l, '對等強度', 'equivalent'),
            t(l, '公鑰大小', 'public key'),
            t(l, '適合', 'good for'),
          ]}
          rows={[
            [
              'ECDSA P-256',
              `${equivalentBits({ family: 'ec', algorithm: 'ECDSA', curve: 'P-256' })} bit`,
              '~91 B',
              t(l, 'JWT、TLS、SSH,現在的預設選擇', 'JWTs, TLS, SSH — the default choice today'),
            ],
            [
              'Ed25519',
              '128 bit',
              '~44 B',
              t(l, 'SSH 與簽章;格式最小、最快', 'SSH and signing; smallest and fastest'),
            ],
            [
              'RSA 2048',
              `${equivalentBits({ family: 'rsa', algorithm: 'RSA-PSS', modulusBits: 2048, hash: 'SHA-256' })} bit`,
              '~294 B',
              t(l, '只為了相容老系統', 'only for compatibility with old systems'),
            ],
            [
              'RSA 3072',
              '128 bit',
              '~422 B',
              t(l, '需要 RSA 又要 128 bit 強度時', 'when RSA is required and 128-bit strength is wanted'),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            '對等強度取自 NIST SP 800-57 的對照。同樣 128 bit 強度,RSA 要 3072 bit、P-256 只要 256 bit——這是為什麼新系統幾乎都選橢圓曲線。公鑰大小是實測 SPKI DER 的量級,會因編碼細節差幾個位元組。',
            'Equivalent strengths follow NIST SP 800-57. For the same 128-bit level RSA needs 3072 bits where P-256 needs 256, which is why new systems pick elliptic curves. The public-key sizes are measured SPKI DER and vary by a few bytes with encoding details.'
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '金鑰', 'key'), v: describeKind(kind) },
          { k: t(l, '對等強度', 'equivalent'), v: `${equivalentBits(kind)} bit` },
          { k: t(l, '公鑰', 'public'), v: exported ? fmtBytes(exported.spki.length) : '—' },
          { k: t(l, '私鑰', 'private'), v: exported ? fmtBytes(exported.pkcs8.length) : '—' },
          { k: t(l, '來源', 'source'), v: 'crypto.subtle.generateKey' },
        ]}
      />
    </div>
  );
}
