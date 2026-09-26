'use client';

import { useCallback, useState } from 'react';
import type { ToolProps } from '../types';
import {
  Area,
  Bench,
  Btn,
  Check2,
  CopyButton,
  DropZone,
  Input,
  Note,
  Panel,
  Readout,
  Row,
  Seg,
  Table,
} from '@/components/tools/bench';
import { bytes as fmtBytes, count } from '@/lib/tools/format';
import { t } from '@/lib/tools/locale';
import {
  AuthFailed,
  BadContainer,
  DEFAULT_ITERATIONS,
  HEADER_BYTES,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  TAG_BYTES,
  containerSize,
  dearmor,
  decryptBytes,
  decryptText,
  encryptBytes,
  encryptText,
  guessesPerSecond,
} from './logic';

type Mode = 'text' | 'file';
type Direction = 'encrypt' | 'decrypt';

/**
 * GCM is a single-shot operation in WebCrypto: the whole plaintext and the
 * whole ciphertext have to be in memory at once, so this is a real limit
 * rather than a policy. Past it the tab would allocate several copies of the
 * file and die, which is worse than being told no.
 */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

type Output =
  | { kind: 'text'; value: string; plainBytes: number; cipherBytes: number }
  | { kind: 'file'; name: string; blob: Blob; plainBytes: number; cipherBytes: number };

export default function AesEncrypt({ l }: ToolProps) {
  const [mode, setMode] = useState<Mode>('text');
  const [direction, setDirection] = useState<Direction>('encrypt');
  const [passphrase, setPassphrase] = useState('');
  const [reveal, setReveal] = useState(false);
  const [iterations, setIterations] = useState(DEFAULT_ITERATIONS);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setOutput(null);
    setError(null);
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setOutput(null);
    try {
      if (mode === 'text') {
        if (direction === 'encrypt') {
          const value = await encryptText(text, passphrase, { iterations });
          setOutput({
            kind: 'text',
            value,
            plainBytes: new TextEncoder().encode(text).length,
            cipherBytes: dearmor(value).length,
          });
        } else {
          const value = await decryptText(text, passphrase);
          setOutput({
            kind: 'text',
            value,
            plainBytes: new TextEncoder().encode(value).length,
            cipherBytes: dearmor(text).length,
          });
        }
      } else {
        if (!file) throw new BadContainer(t(l, '還沒選檔案', 'no file chosen'));
        const source = new Uint8Array(await file.arrayBuffer());
        if (direction === 'encrypt') {
          const sealed = await encryptBytes(source, passphrase, { iterations });
          setOutput({
            kind: 'file',
            name: `${file.name}.spenc`,
            blob: new Blob([sealed as BlobPart], { type: 'application/octet-stream' }),
            plainBytes: source.length,
            cipherBytes: sealed.length,
          });
        } else {
          const plain = await decryptBytes(source, passphrase);
          setOutput({
            kind: 'file',
            name: file.name.replace(/\.spenc$/i, '') || 'decrypted.bin',
            blob: new Blob([plain as BlobPart], { type: 'application/octet-stream' }),
            plainBytes: plain.length,
            cipherBytes: source.length,
          });
        }
      }
    } catch (problem) {
      setError(
        problem instanceof AuthFailed
          ? t(
              l,
              '解不開。GCM 只會說「驗證失敗」,不會說是密語錯還是資料被改過——這兩件事無法區分,也不應該被區分。',
              'It did not open. GCM reports one failure for both a wrong passphrase and altered data; those cannot, and should not, be told apart.'
            )
          : problem instanceof Error
            ? problem.message
            : String(problem)
      );
    } finally {
      setBusy(false);
    }
  }, [mode, direction, text, file, passphrase, iterations, l]);

  const takeFile = useCallback(
    (files: File[]) => {
      const picked = files[0];
      if (!picked) return;
      reset();
      if (picked.size > MAX_FILE_BYTES) {
        setFile(null);
        setError(
          t(
            l,
            `檔案 ${fmtBytes(picked.size)} 超過 ${fmtBytes(MAX_FILE_BYTES)}。AES-GCM 在瀏覽器裡沒有串流介面,整份要同時放在記憶體,再大就會把分頁弄死。大檔請用 age 或 gpg。`,
            `${fmtBytes(picked.size)} is over the ${fmtBytes(MAX_FILE_BYTES)} limit. WebCrypto has no streaming AES-GCM, so the whole file must sit in memory at once. For large files use age or gpg.`
          )
        );
        return;
      }
      setFile(picked);
      // A dropped container is almost certainly meant to be decrypted.
      try {
        if (picked.name.toLowerCase().endsWith('.spenc')) setDirection('decrypt');
      } catch {
        /* nothing to recover from — the name is only a hint */
      }
    },
    [l, reset]
  );

  const save = useCallback(() => {
    if (!output || output.kind !== 'file') return;
    const url = URL.createObjectURL(output.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = output.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [output]);

  const weakIterations = iterations < DEFAULT_ITERATIONS;
  const rate = guessesPerSecond(iterations);
  const ready = passphrase !== '' && (mode === 'text' ? text.trim() !== '' : file !== null);

  return (
    <div>
      <Bench
        leftLabel={t(l, '輸入', 'INPUT')}
        rightLabel={direction === 'encrypt' ? t(l, '密文', 'CIPHERTEXT') : t(l, '明文', 'PLAINTEXT')}
        leftAside={<span className="inst-no">{t(l, '不儲存', 'nothing stored')}</span>}
        rightAside={<span className="inst-no">AES-256-GCM</span>}
        left={
          <>
            <Row>
              <Seg
                label={t(l, '方向', 'Direction')}
                value={direction}
                onChange={(next) => {
                  setDirection(next);
                  reset();
                }}
                options={[
                  { value: 'encrypt', label: t(l, '加密', 'encrypt') },
                  { value: 'decrypt', label: t(l, '解密', 'decrypt') },
                ]}
              />
              <Seg
                label={t(l, '對象', 'Subject')}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  reset();
                }}
                options={[
                  { value: 'text', label: t(l, '文字', 'text') },
                  { value: 'file', label: t(l, '檔案', 'file') },
                ]}
              />
            </Row>

            <Input
              label={t(l, '密語', 'Passphrase')}
              hint={t(
                l,
                '這是唯一的鑰匙。忘了就沒有救援管道——沒有伺服器記得它,也沒有重設信。長度比複雜度有用,建議用四到六個隨機字組成的密語。',
                'This is the only key. There is no recovery: no server remembers it and there is no reset email. Length beats complexity — four to six random words.'
              )}
              type={reveal ? 'text' : 'password'}
              value={passphrase}
              onChange={(value) => {
                setPassphrase(value);
                reset();
              }}
              autoComplete="new-password"
            />
            <Row>
              <Check2
                label={t(l, '顯示密語', 'show passphrase')}
                checked={reveal}
                onChange={setReveal}
              />
            </Row>

            {mode === 'text' ? (
              <Area
                label={
                  direction === 'encrypt'
                    ? t(l, '要加密的文字', 'Text to encrypt')
                    : t(l, '貼上密文區塊', 'Paste the ciphertext block')
                }
                hint={
                  direction === 'decrypt'
                    ? t(
                        l,
                        '-----BEGIN SPENC MESSAGE----- 整段貼進來;只貼中間的 base64 也認。',
                        'Paste the whole -----BEGIN SPENC MESSAGE----- block, or just the base64 inside it.'
                      )
                    : undefined
                }
                value={text}
                onChange={(value) => {
                  setText(value);
                  reset();
                }}
                rows={10}
                placeholder={direction === 'encrypt' ? t(l, '要保護的內容', 'the content to protect') : '-----BEGIN SPENC MESSAGE-----'}
              />
            ) : (
              <>
                <DropZone
                  l={l}
                  onFiles={takeFile}
                  hint={
                    direction === 'encrypt'
                      ? t(l, '拖入要加密的檔案', 'Drop the file to encrypt')
                      : t(l, '拖入 .spenc 檔案', 'Drop a .spenc file')
                  }
                />
                {file ? (
                  <Note>
                    {file.name} — {fmtBytes(file.size)}
                  </Note>
                ) : null}
              </>
            )}

            {direction === 'encrypt' ? (
              <>
                <Input
                  label={t(l, 'PBKDF2 迭代次數', 'PBKDF2 iterations')}
                  hint={t(
                    l,
                    `預設 ${DEFAULT_ITERATIONS.toLocaleString('en-US')} 是 OWASP 對 PBKDF2-SHA256 的建議值。調低會讓加解密變快,也讓暴力猜測同樣變快。`,
                    `The default ${DEFAULT_ITERATIONS.toLocaleString('en-US')} is OWASP's figure for PBKDF2-SHA256. Lowering it speeds up both your decryption and an attacker's guessing.`
                  )}
                  type="number"
                  value={iterations}
                  min={MIN_ITERATIONS}
                  max={MAX_ITERATIONS}
                  step={10_000}
                  onChange={(value) => {
                    const next = Number(value);
                    if (Number.isInteger(next) && next >= MIN_ITERATIONS && next <= MAX_ITERATIONS) {
                      setIterations(next);
                      reset();
                    }
                  }}
                />
                {weakIterations ? (
                  <Note error>
                    {t(
                      l,
                      `低於預設值。以這個迭代數,單張 GPU 大約每秒可以試 ${Math.round(rate).toLocaleString('en-US')} 個密語。`,
                      `Below the default. At this count one GPU tries roughly ${Math.round(rate).toLocaleString('en-US')} passphrases per second.`
                    )}
                  </Note>
                ) : null}
              </>
            ) : null}

            <Row>
              <Btn primary onClick={run} disabled={!ready || busy}>
                {busy
                  ? t(l, '計算中…', 'working…')
                  : direction === 'encrypt'
                    ? t(l, '加密', 'encrypt')
                    : t(l, '解密', 'decrypt')}
              </Btn>
              <Btn
                onClick={() => {
                  setText('');
                  setFile(null);
                  setPassphrase('');
                  reset();
                }}
              >
                {t(l, '全部清空', 'clear everything')}
              </Btn>
            </Row>
            {busy ? (
              <Note>
                {t(
                  l,
                  '正在做金鑰導出。慢是故意的:同一段等待也套在任何想暴力破解的人身上。',
                  'Deriving the key. The wait is the point — it applies to anyone guessing, too.'
                )}
              </Note>
            ) : null}
            {error ? <Note error>{error}</Note> : null}
          </>
        }
        right={
          output ? (
            output.kind === 'text' ? (
              <>
                <Row>
                  <CopyButton l={l} text={output.value} />
                </Row>
                <div className="inst-out" style={{ minHeight: '16rem' }} aria-live="polite">
                  {output.value}
                </div>
                {direction === 'encrypt' ? (
                  <Note>
                    {t(
                      l,
                      '這段文字可以放進郵件或訊息。salt、IV 與迭代次數都在裡面且是公開資訊——沒有密語它們沒有用。',
                      'This block is safe to paste into mail or chat. The salt, IV and iteration count are inside it and are public by design — without the passphrase they are useless.'
                    )}
                  </Note>
                ) : null}
              </>
            ) : (
              <>
                <Row>
                  <Btn primary onClick={save}>
                    {t(l, `儲存 ${output.name}`, `save ${output.name}`)}
                  </Btn>
                </Row>
                <Table
                  head={[t(l, '項目', 'item'), t(l, '值', 'value')]}
                  rows={[
                    [t(l, '檔名', 'name'), output.name],
                    [t(l, '明文', 'plaintext'), fmtBytes(output.plainBytes)],
                    [t(l, '密文', 'ciphertext'), fmtBytes(output.cipherBytes)],
                    [
                      t(l, '額外開銷', 'overhead'),
                      `${HEADER_BYTES + TAG_BYTES} B (${t(l, '標頭', 'header')} ${HEADER_BYTES} + ${t(l, '驗證標籤', 'tag')} ${TAG_BYTES})`,
                    ],
                  ]}
                />
              </>
            )
          ) : (
            <Note>
              {t(
                l,
                direction === 'encrypt'
                  ? '按「加密」。每次都會用新的 salt 與 IV,所以同一份輸入兩次加密的結果不會一樣——這是對的。'
                  : '按「解密」。密語錯或資料被動過都會失敗,不會給你一半的內容。',
                direction === 'encrypt'
                  ? 'Press encrypt. A fresh salt and IV each time means the same input never produces the same output — that is correct behaviour.'
                  : 'Press decrypt. A wrong passphrase or altered data fails outright; you never get half the content.'
              )}
            </Note>
          )
        }
      />

      <Panel label={t(l, '這個工具用的組合', 'WHAT THIS USES')}>
        <Table
          head={[t(l, '環節', 'part'), t(l, '選擇', 'choice'), t(l, '為什麼', 'why')]}
          rows={[
            [
              t(l, '金鑰導出', 'key derivation'),
              `PBKDF2-HMAC-SHA256 × ${iterations.toLocaleString('en-US')}`,
              t(
                l,
                'WebCrypto 只有這個能拿來拉長密碼。Argon2id 更好,但瀏覽器沒有,而要自己實作就得引入依賴。',
                'The only password-stretching function WebCrypto offers. Argon2id is better but is not in the browser, and hand-rolling it would mean a dependency.'
              ),
            ],
            [
              t(l, '對稱加密', 'cipher'),
              'AES-256-GCM',
              t(
                l,
                '有驗證標籤,所以改一個位元就會被抓到。改過的密文不會解出「看起來還行」的內容。',
                'Authenticated: one flipped bit is detected. Altered ciphertext never decrypts into something plausible.'
              ),
            ],
            [
              t(l, 'salt / IV', 'salt / IV'),
              t(l, '每次重新抽 16 / 12 位元組', 'fresh 16 / 12 bytes each time'),
              t(
                l,
                'crypto.getRandomValues。GCM 的 (金鑰, IV) 重複使用會直接毀掉安全性,所以絕不重用。',
                'From crypto.getRandomValues. A repeated (key, IV) pair in GCM is fatal, so neither is ever reused.'
              ),
            ],
            [
              t(l, '參數保護', 'parameter integrity'),
              t(l, '標頭列入 GCM 的 AAD', 'header is GCM additional data'),
              t(
                l,
                '把檔案裡的迭代次數改小以便暴力破解,會直接讓驗證失敗。',
                'Editing the iteration count in the file to make cracking cheaper breaks authentication instead.'
              ),
            ],
          ]}
        />
        <Note>
          {t(
            l,
            `密文大小 = 明文 + ${HEADER_BYTES + TAG_BYTES} 位元組,1 MB 的檔案會變成 ${fmtBytes(containerSize(1024 * 1024))}。格式是這個工具自己的,別的軟體讀不了;要跟其他人長期交換檔案請用 age 或 gpg,那兩個有規格書與多方實作。`,
            `Ciphertext size is plaintext + ${HEADER_BYTES + TAG_BYTES} bytes, so a 1 MB file becomes ${fmtBytes(containerSize(1024 * 1024))}. The format is this tool's own and nothing else reads it — for exchanging files with other people over time, use age or gpg, which have specifications and several implementations.`
          )}
        </Note>
      </Panel>

      <Readout
        l={l}
        items={[
          { k: t(l, '迭代', 'iterations'), v: count(iterations) },
          {
            k: t(l, '輸入', 'input'),
            v: mode === 'text' ? fmtBytes(new Blob([text]).size) : file ? fmtBytes(file.size) : '—',
          },
          { k: t(l, '輸出', 'output'), v: output ? fmtBytes(output.cipherBytes) : '—' },
          {
            k: t(l, '標頭', 'header'),
            v:
              direction === 'decrypt' && output
                ? `${HEADER_BYTES} B`
                : `${HEADER_BYTES} B + ${TAG_BYTES} B`,
          },
          { k: t(l, '實作', 'implementation'), v: 'crypto.subtle' },
        ]}
      />
    </div>
  );
}
