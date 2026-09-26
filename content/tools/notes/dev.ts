import type { ToolNote } from './index';

/** Drawer D — what each indexable tool in this drawer will not do. */
export const DEV_NOTES: Record<string, ToolNote> = {
  'regex-tester': {
    limits: [
      {
        zh: '掃到一千筆命中就停,後面那段不會被比對,更長的檔案請分段貼。',
        en: 'The scan stops at 1000 matches; the rest of the text is never examined, so paste long files in sections.',
      },
      {
        zh: '命中位置是 UTF-16 碼位偏移,不是字元數,emoji 與部分漢字各算兩個。',
        en: 'Positions are UTF-16 code-unit offsets, not character counts.',
      },
      {
        zh: '用瀏覽器的 JavaScript 引擎,不支援 PCRE 遞迴樣式與 RE2 保證。',
        en: 'It runs the browser JavaScript engine: no PCRE recursion, no RE2 linear-time guarantee.',
      },
    ],
  },

  'cron-explain': {
    limits: [
      {
        zh: '不收 Jenkins 的 H 與 Quartz 的 W/LW,它們要靠工作名稱或行事曆。',
        en: 'Jenkins H and Quartz W/LW are refused: they need a job name or a calendar.',
      },
      {
        zh: '時刻照你的瀏覽器時區或 UTC 算,伺服器 TZ 不同會差幾小時,指定時區請用 F01。',
        en: 'Times use your browser zone or UTC, not the server TZ. For a named zone, use F01.',
      },
      {
        zh: '日光節約那兩天,春天跳掉的時刻不報,秋天重複的一小時只報前一次。',
        en: 'On daylight-saving days a skipped time is omitted and a repeated hour is listed once.',
      },
    ],
  },

  'jwt-decode': {
    limits: [
      {
        zh: '只回答簽名對不對,aud、iss、scope、jti 重放與金鑰撤銷一律不檢查。',
        en: 'Only the signature is checked — never audience, issuer, scope, jti replay or revocation.',
      },
      {
        zh: '不連網也不抓 JWKS,非對稱驗簽要自己貼 SPKI 公鑰,JWE 只辨識不解密。',
        en: 'No network, no JWKS fetch: paste an SPKI key for asymmetric algorithms. A JWE is identified, not decrypted.',
      },
      {
        zh: '不簽發也不修改 token,裸 HMAC 請用 E05,X.509 憑證請用 E10。',
        en: 'It does not mint or rewrite tokens. Use E05 for a bare HMAC, E10 for an X.509 certificate.',
      },
    ],
  },

  'id-generator': {
    limits: [
      {
        zh: '同一批 ID 共用一次時鐘讀值,同毫秒內的先後只由隨機段決定。',
        en: 'A batch shares one clock read, so ordering inside a millisecond comes from the random part alone.',
      },
      {
        zh: 'v4、v3/v5、v8 沒有時間戳可以解,會標成非時間型。',
        en: 'v4, v3/v5 and v8 carry no timestamp and are marked non-temporal.',
      },
      {
        zh: '解出的時間戳是發行端的時鐘,可以偽造,換算格式與時區請用 D05。',
        en: 'A decoded timestamp is the issuer clock and is forgeable. To convert it, use D05.',
      },
    ],
  },

  'timestamp': {
    limits: [
      {
        zh: '超出 Date 範圍(±8.64e15 毫秒)顯示破折號,不會繞回錯值。',
        en: 'Beyond the JavaScript Date range of ±8.64e15 ms the output is a dash, never a wrapped value.',
      },
      {
        zh: '微秒、奈秒與閏秒只顯示不計算,秒數 60 會滾進下一分鐘。',
        en: 'Sub-millisecond digits and leap seconds are displayed but not computed; a :60 rolls into the next minute.',
      },
      {
        zh: '本地指你這台瀏覽器的時區,不查 IANA 歷史規則,城市間換算請用 F01。',
        en: 'Local means this browser zone and no historical IANA rules are consulted. For city-to-city, use F01.',
      },
    ],
  },
};
