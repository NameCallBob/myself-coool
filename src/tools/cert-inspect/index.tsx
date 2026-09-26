'use client';

import { useMemo, useRef, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Btn,
  CopyButton,
  DropZone,
  Note,
  Panel,
  Readout,
  ResetButton,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import { decodeUtf8, toBase64 } from '@/lib/tools/bytes';
import {
  InspectError,
  MAX_DER_BYTES,
  certFingerprints,
  describeValidity,
  parsePemCertificates,
  parseSshPublicKey,
  sshFingerprint,
  type Certificate,
} from './logic';

/**
 * A self-signed example, generated for this page with OpenSSL: P-256, one year,
 * six SANs of every kind the parser handles. No private key ships with it, and
 * nothing trusts it — it is here so the readings have something to show.
 */
const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIICjzCCAjWgAwIBAgIBKjAKBggqhkjOPQQDAjBmMQswCQYDVQQGEwJUVzEPMA0G
A1UECAwGVGFpcGVpMRswGQYDVQQKDBJJbnN0cnVtZW50IENhYmluZXQxDjAMBgNV
BAsMBVRvb2xzMRkwFwYDVQQDDBB0b29scy5leGFtcGxlLnR3MB4XDTI1MDMwMTAw
MDAwMFoXDTI2MDMwMTAwMDAwMFowZjELMAkGA1UEBhMCVFcxDzANBgNVBAgMBlRh
aXBlaTEbMBkGA1UECgwSSW5zdHJ1bWVudCBDYWJpbmV0MQ4wDAYDVQQLDAVUb29s
czEZMBcGA1UEAwwQdG9vbHMuZXhhbXBsZS50dzBZMBMGByqGSM49AgEGCCqGSM49
AwEHA0IABKybPT1oGcsPcC1EXsG2WySluPGQfwLYQ87nkNa7vEYGHvLQflJ1GHdy
nbY6QqWmoyU77khyJ7P/wukGTkGCgj2jgdMwgdAwDAYDVR0TAQH/BAIwADAOBgNV
HQ8BAf8EBAMCBaAwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMHIGA1Ud
EQRrMGmCEHRvb2xzLmV4YW1wbGUudHeCEioudG9vbHMuZXhhbXBsZS50d4cEwAAC
CocQIAENuAAAAAAAAAAAAAAAAYEOb3BzQGV4YW1wbGUudHeGGWh0dHBzOi8vdG9v
bHMuZXhhbXBsZS50dy8wHQYDVR0OBBYEFGfmuyUofB399CIiV/pf6wzuDFieMAoG
CCqGSM49BAMCA0gAMEUCIE+rRCkcl991FW4vEeZ6So6kv7bkE0vWF/mTFNXo6pTl
AiEAgaoohbMFu+ukd9D5cq+2Oy1iVN007m5dF6DbboHfloA=
-----END CERTIFICATE-----`;

/** An example Ed25519 public key. Public halves are safe to publish. */
const SAMPLE_SSH =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOcWiepWenxLqQygKMhGPqzUa3atPFPp7zRYyP3MZ7C4 binbin@bench';

type Mode = 'cert' | 'ssh';
type Prints = { sha256: string; sha1: string; spkiPin: string };
type SshPrints = { sha256: string; sha512: string };

function explain(l: 'zh' | 'en', error: InspectError): string {
  const at = error.offset >= 0 ? t(l, `(第 ${error.offset} 位元組)`, `(byte ${error.offset})`) : '';
  switch (error.code) {
    case 'no-pem':
      return t(
        l,
        '找不到 -----BEGIN ...----- 區塊。貼 PEM 文字,或把 .pem/.crt/.der 檔拖進來。',
        'No -----BEGIN ...----- block. Paste PEM text, or drop a .pem/.crt/.der file.'
      );
    case 'bad-base64':
      return t(l, `base64 內容有非法字元:${error.where}`, `The base64 body has invalid characters: ${error.where}`);
    case 'label-mismatch':
      return t(l, `BEGIN 與 END 的標籤不一致:${error.where}`, `BEGIN and END labels disagree: ${error.where}`);
    case 'private-key':
      return t(
        l,
        `這是私鑰(${error.where}),這裡不讀私鑰,也請不要貼到任何網頁。只貼憑證或公鑰。`,
        `That is a private key (${error.where}). This tool does not read private keys — paste a certificate or a public key.`
      );
    case 'not-a-certificate':
      return t(l, `PEM 標籤是 ${error.where},不是憑證。`, `The PEM label is ${error.where}, not a certificate.`);
    case 'too-many-blocks':
      return t(l, `PEM 區塊超過 ${error.where} 個。`, `More than ${error.where} PEM blocks.`);
    case 'too-large':
      return t(
        l,
        `輸入超過 ${fmtBytes(MAX_DER_BYTES)} 上限。`,
        `Input exceeds the ${fmtBytes(MAX_DER_BYTES)} ceiling.`
      );
    case 'empty':
      return t(l, '沒有內容可以解析。', 'Nothing to parse.');
    case 'truncated':
      return t(
        l,
        `DER 在 ${error.where} 就沒了 ${at}:長度欄位指到資料尾端之外,檔案被截斷或貼漏了。`,
        `The DER ends inside ${error.where} ${at}: a length runs past the data. Truncated or partly pasted.`
      );
    case 'indefinite-length':
      return t(
        l,
        `${error.where} 用了不定長度編碼 ${at}。那是 BER 不是 DER,憑證不該這樣編。`,
        `${error.where} uses an indefinite length ${at}. That is BER, not DER; a certificate must not.`
      );
    case 'reserved-length':
    case 'length-too-long':
    case 'tag-too-long':
      return t(
        l,
        `${error.where} 的長度或標籤欄位不是這裡支援的形式 ${at}。`,
        `The length or tag at ${error.where} is not a form this parser accepts ${at}.`
      );
    case 'trailing-bytes':
      return t(
        l,
        `DER 結束後還有多餘位元組 ${at}:可能是兩份憑證黏在一起,或尾巴多貼了東西。`,
        `There are bytes after the DER value ends ${at}: two concatenated blobs, or extra pasted text.`
      );
    case 'too-deep':
    case 'too-many-nodes':
      return t(
        l,
        `結構太深或節點太多(${error.where}),已停止解析,避免凍住分頁。`,
        `The structure is too deep or too large (${error.where}); parsing stopped rather than hanging the tab.`
      );
    case 'unexpected-tag':
      return t(
        l,
        `${error.where} 的 ASN.1 標籤不是 RFC 5280 規定的那個 ${at}。這不是一份能照 X.509 讀的憑證。`,
        `The ASN.1 tag at ${error.where} is not what RFC 5280 requires ${at}. This does not read as X.509.`
      );
    case 'missing-field':
      return t(l, `缺少欄位:${error.where}`, `Missing field: ${error.where}`);
    case 'bad-oid':
    case 'bad-integer':
    case 'bad-string':
    case 'bad-bitstring':
    case 'bad-time':
    case 'bad-version':
      return t(l, `欄位內容不合法:${error.where} ${at}`, `Malformed value: ${error.where} ${at}`);
    case 'ssh-bad-line':
      return t(
        l,
        `這一行不是 OpenSSH 公鑰:${error.where}。格式是「演算法 base64 註解」。`,
        `Not an OpenSSH public key line: ${error.where}. The shape is "<algorithm> <base64> <comment>".`
      );
    case 'ssh-blob-mismatch':
      return t(
        l,
        `行首宣告的演算法和 blob 裡寫的不一致(${error.where})。這把鑰匙被改過或貼壞了,指紋不算。`,
        `The algorithm on the line and inside the blob disagree (${error.where}). The key is mangled; no fingerprint is shown.`
      );
    case 'ssh-truncated':
      return t(l, `公鑰 blob 不完整:${error.where}`, `The key blob is incomplete: ${error.where}`);
  }
}

function toPem(der: Uint8Array): string {
  const body = toBase64(der).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
}

const SAN_LABEL: Record<string, { zh: string; en: string }> = {
  dns: { zh: '網域', en: 'DNS' },
  ip: { zh: 'IP', en: 'IP' },
  email: { zh: '電子郵件', en: 'email' },
  uri: { zh: '網址', en: 'URI' },
  dirname: { zh: '目錄名稱', en: 'dirName' },
  'registered-id': { zh: '註冊 OID', en: 'registeredID' },
  other: { zh: '其他', en: 'other' },
};

/**
 * Reads a certificate. Does not judge one.
 *
 * The parse runs in render because it is pure; the two things that are not —
 * the clock and the WebCrypto digests — are set from the input handler, which
 * is also what keeps this out of an effect.
 */
export default function CertInspect({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('cert');
  const [input, setInput] = useState('');
  const [prints, setPrints] = useState<Record<number, Prints>>({});
  const [sshPrints, setSshPrints] = useState<SshPrints | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const request = useRef(0);

  const result = useMemo(() => {
    if (input.trim() === '') return { certs: [] as Certificate[], error: null as InspectError | null };
    try {
      return { certs: parsePemCertificates(input), error: null };
    } catch (error) {
      if (error instanceof InspectError) return { certs: [], error };
      throw error;
    }
  }, [input]);

  const sshResult = useMemo(() => {
    if (input.trim() === '') return { key: null, error: null as InspectError | null };
    try {
      return { key: parseSshPublicKey(input), error: null };
    } catch (error) {
      if (error instanceof InspectError) return { key: null, error };
      throw error;
    }
  }, [input]);

  /** Digests and the clock, both driven from the event rather than an effect. */
  const measure = (value: string, nextMode: Mode) => {
    const id = request.current + 1;
    request.current = id;
    setPrints({});
    setSshPrints(null);
    setCheckedAt(Date.now());
    if (value.trim() === '') return;
    try {
      if (nextMode === 'cert') {
        const certs = parsePemCertificates(value);
        void Promise.all(certs.map((cert) => certFingerprints(cert))).then((list) => {
          if (request.current !== id) return;
          const next: Record<number, Prints> = {};
          list.forEach((item, index) => {
            next[index] = item;
          });
          setPrints(next);
        });
      } else {
        const key = parseSshPublicKey(value);
        void sshFingerprint(key.blob).then((digests) => {
          if (request.current === id) setSshPrints(digests);
        });
      }
    } catch {
      // The pure parse above already reports the failure in the panel.
    }
  };

  const take = (value: string) => {
    setFileNote(null);
    setInput(value);
    measure(value, mode);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    measure(input, next);
  };

  const onFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_DER_BYTES) {
      setFileNote(
        t(
          l,
          `${file.name} 有 ${fmtBytes(file.size)},超過 ${fmtBytes(MAX_DER_BYTES)} 上限。`,
          `${file.name} is ${fmtBytes(file.size)}, over the ${fmtBytes(MAX_DER_BYTES)} ceiling.`
        )
      );
      return;
    }
    void file.arrayBuffer().then((buffer) => {
      const data = new Uint8Array(buffer);
      // A DER file starts with the SEQUENCE tag; PEM starts with '-'.
      const text = data[0] === 0x30 ? toPem(data) : decodeUtf8(data);
      setFileNote(
        data[0] === 0x30
          ? t(l, `${file.name} 是 DER,已轉成 PEM 顯示。`, `${file.name} is DER; shown as PEM.`)
          : null
      );
      setInput(text);
      measure(text, mode);
    });
  };

  const error = mode === 'cert' ? result.error : sshResult.error;
  const key = sshResult.key;

  const totalDer = result.certs.reduce((sum, cert) => sum + cert.der.length, 0);
  const first = result.certs[0];
  const status = first && checkedAt > 0 ? describeValidity(first, checkedAt) : null;

  const readout =
    mode === 'cert'
      ? [
          { k: t(l, '憑證', 'certs'), v: count(result.certs.length) },
          { k: t(l, 'DER', 'DER'), v: fmtBytes(totalDer) },
          { k: t(l, '金鑰', 'key'), v: first?.publicKey.bits ? `${count(first.publicKey.bits)} bit` : '—' },
          { k: t(l, 'SAN', 'SANs'), v: first ? count(first.sans.length) : '—' },
          {
            k: t(l, '剩餘', 'remaining'),
            v: status ? (status.state === 'valid' ? `${count(status.days)} d` : '—') : '—',
          },
        ]
      : [
          { k: t(l, '演算法', 'algorithm'), v: key?.algorithm ?? '—' },
          { k: t(l, '長度', 'size'), v: key?.bits ? `${count(key.bits)} bit` : '—' },
          { k: t(l, 'blob', 'blob'), v: key ? fmtBytes(key.blob.length) : '—' },
          { k: t(l, '欄位', 'fields'), v: key ? count(key.fields.length) : '—' },
        ];

  return (
    <div>
      <Row>
        <Seg
          label={t(l, '輸入類型', 'Input')}
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'cert', label: t(l, 'PEM 憑證', 'PEM certificate') },
            { value: 'ssh', label: t(l, 'OpenSSH 公鑰', 'OpenSSH public key') },
          ]}
        />
        <Btn onClick={() => take(mode === 'cert' ? SAMPLE_CERT : SAMPLE_SSH)}>
          {t(l, '放入範例', 'load sample')}
        </Btn>
        <ResetButton
          l={l}
          onReset={() => {
            setFileNote(null);
            setInput('');
            setPrints({});
            setSshPrints(null);
          }}
        />
      </Row>

      <div className="mt-6">
        <Panel label={mode === 'cert' ? t(l, '憑證', 'CERTIFICATE') : t(l, '公鑰', 'PUBLIC KEY')}>
          <Area
            label={
              mode === 'cert'
                ? t(l, '貼上 PEM(可以一次貼整條鏈)', 'Paste PEM (a whole chain is fine)')
                : t(l, '貼上一行 OpenSSH 公鑰', 'Paste one OpenSSH public key line')
            }
            hint={
              mode === 'cert'
                ? t(
                    l,
                    '私鑰會被擋下來不解析。檔案與貼上的內容都只在這個分頁裡處理。',
                    'Private keys are refused. Everything stays in this tab.'
                  )
                : t(
                    l,
                    'authorized_keys 那一行直接貼,前面的選項會被分開列出。',
                    'An authorized_keys line works as-is; leading options are listed separately.'
                  )
            }
            value={input}
            onChange={take}
            rows={mode === 'cert' ? 12 : 5}
            invalid={error !== null}
            placeholder={mode === 'cert' ? '-----BEGIN CERTIFICATE-----' : 'ssh-ed25519 AAAAC3Nz...'}
          />
          {mode === 'cert' ? (
            <DropZone
              l={l}
              onFiles={onFiles}
              accept=".pem,.crt,.cer,.der,application/x-x509-ca-cert,application/pkix-cert"
              hint={t(l, '或把 .pem / .crt / .der 拖進來', 'Or drop a .pem / .crt / .der file')}
            />
          ) : null}
          {fileNote ? <Note>{fileNote}</Note> : null}
          {error ? <Note error>{explain(l, error)}</Note> : null}
        </Panel>
      </div>

      {mode === 'cert' ? (
        <div aria-live="polite">
          {result.certs.map((cert, index) => {
            const print = prints[index];
            const state = checkedAt > 0 ? describeValidity(cert, checkedAt) : null;
            const cn = cert.subject.rdns.find((rdn) => rdn.label === 'CN')?.value ?? cert.subject.text;
            const rows: [string, string][] = [
              [t(l, '主體', 'subject'), cert.subject.text],
              [t(l, '簽發者', 'issuer'), cert.issuer.text],
              [
                t(l, '有效期', 'validity'),
                `${cert.notBefore.iso} → ${cert.notAfter.iso} (${count(
                  state?.lifetimeDays ?? Math.round((cert.notAfter.epochMs - cert.notBefore.epochMs) / 86_400_000)
                )} ${t(l, '天', 'days')})`,
              ],
              [
                t(l, '狀態', 'state'),
                state === null
                  ? t(l, '（尚未對時）', '(clock not read yet)')
                  : state.state === 'valid'
                    ? t(l, `有效,還有 ${count(state.days)} 天`, `valid, ${count(state.days)} days left`)
                    : state.state === 'expired'
                      ? t(l, `已過期 ${count(state.days)} 天`, `expired ${count(state.days)} days ago`)
                      : t(l, `還沒生效,${count(state.days)} 天後開始`, `not valid for another ${count(state.days)} days`),
              ],
              [t(l, '版本', 'version'), `v${cert.version}`],
              [t(l, '序號', 'serial'), `${cert.serialHex}  (${cert.serialDecimal})`],
              [
                t(l, '簽章演算法', 'signature'),
                `${cert.signatureAlgorithm.name || cert.signatureAlgorithm.oid} · ${count(cert.signatureBits)} bit`,
              ],
              [
                t(l, '公鑰', 'public key'),
                [
                  cert.publicKey.name || cert.publicKey.oid,
                  cert.publicKey.bits ? `${count(cert.publicKey.bits)} bit` : null,
                  cert.publicKey.curve,
                  cert.publicKey.exponent ? `e=${cert.publicKey.exponent}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              ],
              [t(l, '自簽', 'self-issued'), cert.selfIssued ? t(l, '是(主體等於簽發者)', 'yes (subject equals issuer)') : t(l, '否', 'no')],
              [t(l, 'SHA-256 指紋', 'SHA-256'), print?.sha256 ?? t(l, '計算中', 'computing')],
              [t(l, 'SHA-1 指紋', 'SHA-1'), print?.sha1 ?? t(l, '計算中', 'computing')],
              [t(l, '公鑰 pin-sha256', 'pin-sha256'), print?.spkiPin ?? t(l, '計算中', 'computing')],
            ];

            return (
              <div key={index} className="mt-8">
                <div className="inst-pane-label">
                  <span>
                    {t(l, '憑證', 'CERT')} {index + 1}/{result.certs.length} — {cn}
                  </span>
                  <span className="inst-no">{fmtBytes(cert.der.length)}</span>
                </div>

                <Table
                  head={[t(l, '欄位', 'field'), t(l, '值', 'value')]}
                  rows={rows.map(([field, value]) => [
                    field,
                    <span key={field} style={{ overflowWrap: 'anywhere' }}>
                      {value}
                    </span>,
                  ])}
                />

                {cert.signatureAlgorithm.oid !== cert.tbsSignatureAlgorithm.oid ? (
                  <Note error>
                    {t(
                      l,
                      `內外兩處的簽章演算法不一致:${cert.tbsSignatureAlgorithm.oid} 對 ${cert.signatureAlgorithm.oid}。RFC 5280 要求相同。`,
                      `The two signature algorithm fields disagree: ${cert.tbsSignatureAlgorithm.oid} vs ${cert.signatureAlgorithm.oid}. RFC 5280 requires them to match.`
                    )}
                  </Note>
                ) : null}

                {cert.sans.length > 0 ? (
                  <div className="mt-6">
                    <div className="inst-pane-label">
                      <span>{t(l, '主體別名 SAN', 'SUBJECT ALT NAMES')}</span>
                      <span className="inst-no">{count(cert.sans.length)}</span>
                    </div>
                    <Table
                      head={[t(l, '種類', 'kind'), t(l, '值', 'value')]}
                      rows={cert.sans.map((san, i) => [
                        t(l, SAN_LABEL[san.kind].zh, SAN_LABEL[san.kind].en),
                        <span key={i} style={{ overflowWrap: 'anywhere' }}>
                          {san.value}
                        </span>,
                      ])}
                    />
                    <Row>
                      <CopyButton
                        l={l}
                        text={cert.sans.map((san) => san.value).join('\n')}
                        label={t(l, '複製 SAN', 'copy SANs')}
                      />
                    </Row>
                  </div>
                ) : null}

                {cert.extensions.length > 0 ? (
                  <div className="mt-6">
                    <div className="inst-pane-label">
                      <span>{t(l, '擴充欄位', 'EXTENSIONS')}</span>
                      <span className="inst-no">{count(cert.extensions.length)}</span>
                    </div>
                    <Table
                      head={[
                        t(l, '名稱', 'name'),
                        t(l, '關鍵', 'critical'),
                        t(l, '位元組', 'bytes'),
                        t(l, '內容', 'value'),
                      ]}
                      align={['left', 'left', 'right', 'left']}
                      rows={cert.extensions.map((extension, i) => [
                        extension.name || extension.oid,
                        extension.critical ? t(l, '是', 'yes') : '—',
                        count(extension.size),
                        <span key={i} style={{ overflowWrap: 'anywhere' }}>
                          {extension.summary || t(l, '(未解析,只計位元組)', '(not decoded, size only)')}
                        </span>,
                      ])}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div aria-live="polite">
          {key ? (
            <div className="mt-8">
              <div className="inst-pane-label">
                <span>{t(l, '讀數', 'READINGS')}</span>
                <span className="inst-no">{fmtBytes(key.blob.length)}</span>
              </div>
              <Table
                head={[t(l, '欄位', 'field'), t(l, '值', 'value')]}
                rows={(
                  [
                    [t(l, '演算法', 'algorithm'), key.algorithm],
                    [t(l, '長度', 'size'), key.bits ? `${count(key.bits)} bit` : t(l, '未知(這個型別不推算)', 'unknown — not inferred')],
                    [t(l, '曲線', 'curve'), key.curve ?? '—'],
                    [t(l, '註解', 'comment'), key.comment || '—'],
                    [t(l, '選項', 'options'), key.options || '—'],
                    [t(l, 'SHA-256 指紋', 'SHA-256'), sshPrints?.sha256 ?? t(l, '計算中', 'computing')],
                    [t(l, 'SHA-512 指紋', 'SHA-512'), sshPrints?.sha512 ?? t(l, '計算中', 'computing')],
                  ] as [string, string][]
                ).map(([field, value]) => [
                  field,
                  <span key={field} style={{ overflowWrap: 'anywhere' }}>
                    {value}
                  </span>,
                ])}
              />
              <Row>
                <CopyButton
                  l={l}
                  text={sshPrints?.sha256 ?? ''}
                  label={t(l, '複製 SHA-256 指紋', 'copy SHA-256')}
                />
              </Row>

              <div className="mt-6">
                <div className="inst-pane-label">
                  <span>{t(l, 'blob 欄位', 'BLOB FIELDS')}</span>
                </div>
                <Table
                  head={[t(l, '欄位', 'field'), t(l, '位元組', 'bytes')]}
                  align={['left', 'right']}
                  rows={key.fields.map((field, i) => [`${i + 1}. ${field.name}`, count(field.size)])}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-8">
        <Note>
          {t(
            l,
            '這件工具只讀位元組:不驗簽章、不走信任鏈、不查 CRL 或 OCSP,也不連任何網路。「有效」只代表現在這台裝置的時鐘落在有效期之間。要判斷信任請用 openssl verify 或瀏覽器本身。',
            'This reads bytes only: no signature check, no chain building, no CRL or OCSP, no network. "Valid" means this device\'s clock falls inside the validity window. For trust decisions use openssl verify or the browser itself.'
          )}
        </Note>
        <Note>
          {t(
            l,
            'MD5 指紋不提供:WebCrypto 沒有 MD5,而為了印一個已經不該用的指紋自己實作破掉的雜湊不划算。OpenSSH 從 6.8 起預設也是 SHA-256。',
            'No MD5 fingerprints: WebCrypto has no MD5, and hand-rolling a broken hash to print a legacy value is not worth it. OpenSSH has defaulted to SHA-256 since 6.8.'
          )}
        </Note>
      </div>

      <Readout l={l} items={readout} />
    </div>
  );
}
