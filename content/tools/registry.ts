import type { CategoryId, Localized, Tool } from './types';

/**
 * The catalogue.
 *
 * Grouped by drawer rather than listed flat, because the drawer is what gives
 * a tool its part-number letter — keeping them apart would let the two drift.
 * `indexable` marks the tools that carry enough prose of their own to earn a
 * place in search results; the rest are `noindex, follow` (plan §3).
 */

type Entry = Omit<Tool, 'category'>;

const DRAWERS: Record<CategoryId, Entry[]> = {
  text: [
    {
      id: 'A01',
      slug: 'text-stats',
      name: { zh: '字數統計', en: 'Text stats' },
      blurb: {
        zh: '字元、字、行、段落與閱讀時間,中英混排分開計算。',
        en: 'Characters, words, lines, paragraphs and reading time, counted separately for CJK and Latin.',
      },
      keywords: ['字數', '字元', '計數', 'word count', 'character count', 'wc'],
      indexable: true,
    },
    {
      id: 'A02',
      slug: 'case-convert',
      name: { zh: '命名與大小寫轉換', en: 'Case & naming' },
      blurb: {
        zh: 'camelCase、snake_case、kebab-case、PascalCase、CONSTANT_CASE 與標題式大寫一次全出。',
        en: 'camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE and title case, all at once.',
      },
      keywords: ['命名', '駝峰', '大小寫', 'camel', 'snake', 'kebab', 'pascal'],
      indexable: true,
    },
    {
      id: 'A03',
      slug: 'line-tools',
      name: { zh: '行排序與去重', en: 'Line tools' },
      blurb: {
        zh: '逐行排序、去重、反轉、加行號、前後綴,支援自然排序與忽略大小寫。',
        en: 'Sort, dedupe, reverse, number and affix lines — natural sort and case-insensitive options.',
      },
      keywords: ['排序', '去重', '反轉', 'sort', 'unique', 'dedupe', 'reverse'],
    },
    {
      id: 'A04',
      slug: 'find-replace',
      name: { zh: '尋找取代', en: 'Find & replace' },
      blurb: {
        zh: '純文字或正規表達式取代,支援擷取群組與多行模式,即時預覽命中處。',
        en: 'Literal or regex replace with capture groups and multiline mode, matches highlighted live.',
      },
      keywords: ['取代', '替換', '搜尋', 'replace', 'regex', 'substitute'],
    },
    {
      id: 'A05',
      slug: 'text-diff',
      name: { zh: '文字比對', en: 'Text diff' },
      blurb: {
        zh: '逐行或逐字比對兩段文字,自寫 Myers 差異演算法,不送出任何內容。',
        en: 'Line or word level diff of two texts. Hand-written Myers algorithm, nothing leaves the page.',
      },
      keywords: ['比對', '差異', 'diff', 'compare', '比較'],
      indexable: true,
    },
    {
      id: 'A06',
      slug: 'cjk-tidy',
      name: { zh: '中文排版修整', en: 'CJK typography' },
      blurb: {
        zh: '中英之間補空格、全形半形正規化、標點統一、直引號改彎引號。',
        en: 'Spacing between CJK and Latin, width normalisation, punctuation and curly quotes.',
      },
      keywords: ['排版', '全形', '半形', '標點', 'cjk', 'fullwidth', 'pangu'],
      indexable: true,
    },
    {
      id: 'A07',
      slug: 'whitespace',
      name: { zh: '空白正規化', en: 'Whitespace' },
      blurb: {
        zh: 'Tab 與空格互換、去行尾空白、壓縮空行、統一縮排寬度。',
        en: 'Tabs to spaces and back, trailing whitespace, blank-line squeezing, indent width.',
      },
      keywords: ['空白', '縮排', 'tab', 'space', 'indent', 'trim'],
    },
    {
      id: 'A08',
      slug: 'slugify',
      name: { zh: 'Slug 產生', en: 'Slugify' },
      blurb: {
        zh: '把標題轉成網址片段,可選保留或移除非 ASCII、自訂分隔符與長度上限。',
        en: 'Titles into URL slugs, with options for non-ASCII, separator and length cap.',
      },
      keywords: ['slug', '網址', 'url', 'permalink'],
    },
    {
      id: 'A09',
      slug: 'fake-data',
      name: { zh: '假資料產生', en: 'Fake data' },
      blurb: {
        zh: '中英姓名、地址、電話、Email、UUID、Luhn 測試卡號與亂文,供填表與測試用。',
        en: 'Names, addresses, phones, emails, UUIDs, Luhn-valid test card numbers and filler text.',
      },
      keywords: ['假資料', '測試資料', 'lorem', 'faker', 'mock', 'dummy'],
    },
    {
      id: 'A10',
      slug: 'pii-mask',
      name: { zh: '敏感資訊遮蔽', en: 'Redact PII' },
      blurb: {
        zh: '把身分證、卡號、手機、Email、IP 與長串 token 遮掉——貼 log 給同事前先過一遍。',
        en: 'Mask ID numbers, card numbers, phones, emails, IPs and long tokens before you paste a log.',
      },
      keywords: ['遮蔽', '去識別', '個資', 'redact', 'mask', 'pii', 'sanitize'],
      sensitive: true,
      indexable: true,
    },
  ],
  encode: [
    {
      id: 'B01',
      slug: 'base64',
      name: { zh: 'Base64 編解碼', en: 'Base64' },
      blurb: {
        zh: '文字與檔案的 Base64 編解碼,支援 URL-safe 變體與 Data URI 產生。',
        en: 'Base64 for text and files, with URL-safe variant and Data URI output.',
      },
      keywords: ['base64', '編碼', '解碼', 'data uri', 'b64'],
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'B02',
      slug: 'url-codec',
      name: { zh: 'URL 編解碼', en: 'URL codec' },
      blurb: {
        zh: 'percent-encoding 編解碼,並把 query string 拆成表格編輯後重組。',
        en: 'Percent-encoding both ways, plus a table editor for query strings.',
      },
      keywords: ['url', 'encode', 'decode', 'percent', 'query', '編碼'],
      indexable: true,
    },
    {
      id: 'B03',
      slug: 'html-entities',
      name: { zh: 'HTML 實體編解碼', en: 'HTML entities' },
      blurb: {
        zh: '具名與數值實體雙向轉換,可只轉最小必要字元或全部非 ASCII。',
        en: 'Named and numeric entities both ways — minimal set or every non-ASCII character.',
      },
      keywords: ['html', 'entity', '實體', 'escape', '轉義'],
    },
    {
      id: 'B04',
      slug: 'unicode-escape',
      name: { zh: 'Unicode escape', en: 'Unicode escape' },
      blurb: {
        zh: '\\uXXXX、\\xNN、\\u{...} 與碼位檢視,逐字看出是哪個字元在搞鬼。',
        en: '\\uXXXX, \\xNN, \\u{...} and a code-point inspector for when one character is the problem.',
      },
      keywords: ['unicode', 'escape', '碼位', 'codepoint', '跳脫'],
    },
    {
      id: 'B05',
      slug: 'basex',
      name: { zh: 'BaseX 轉換', en: 'BaseX' },
      blurb: {
        zh: 'Hex、Base32、Base58、Base64url 與位元組陣列之間互轉。',
        en: 'Hex, Base32, Base58, Base64url and raw byte arrays, all interchangeable.',
      },
      keywords: ['hex', 'base32', 'base58', 'base64url', '位元組'],
    },
    {
      id: 'B06',
      slug: 'line-endings',
      name: { zh: '換行與編碼檢查', en: 'Line endings' },
      blurb: {
        zh: 'CRLF 與 LF 互換、BOM 偵測與移除、UTF-8 有效性驗證與不可見字元標示。',
        en: 'CRLF/LF conversion, BOM detection, UTF-8 validation and invisible-character flagging.',
      },
      keywords: ['crlf', 'lf', 'bom', 'utf-8', '換行', '編碼'],
      needs: ['file'],
    },
    {
      id: 'B07',
      slug: 'string-escape',
      name: { zh: '程式字串轉義', en: 'String escape' },
      blurb: {
        zh: '把一段文字轉成可貼進 JSON、Java、C、Python、Shell 或 SQL 的字串常值。',
        en: 'Turn text into a string literal you can paste into JSON, Java, C, Python, shell or SQL.',
      },
      keywords: ['escape', '轉義', 'string', 'literal', 'quote'],
    },
    {
      id: 'B08',
      slug: 'morse',
      name: { zh: 'Morse 與拼讀碼', en: 'Morse & NATO' },
      blurb: {
        zh: 'Morse 電碼雙向轉換,以及電話上唸英數字用的 NATO 拼讀字母。',
        en: 'Morse code both ways, plus the NATO spelling alphabet for reading codes over the phone.',
      },
      keywords: ['morse', '摩斯', 'nato', '拼讀', 'alphabet'],
    },
    {
      id: 'B09',
      slug: 'rot13',
      name: { zh: '字母位移', en: 'Letter shift' },
      blurb: {
        zh: 'ROT13、任意位移的 Caesar 與 Atbash。這是遮擋,不是加密——要加密請用 E07。',
        en: 'ROT13, arbitrary Caesar shifts and Atbash. This obscures text; it does not encrypt it.',
      },
      keywords: ['rot13', 'caesar', 'atbash', '位移', '凱薩'],
    },
    {
      id: 'B10',
      slug: 'hex-viewer',
      name: { zh: 'Hex 檢視器', en: 'Hex viewer' },
      blurb: {
        zh: '任何檔案的 hexdump,附 ASCII 側欄與檔頭簽章辨識,大檔在 Worker 裡串流讀。',
        en: 'Hexdump any file with an ASCII gutter and magic-number detection, streamed in a Worker.',
      },
      keywords: ['hex', 'hexdump', '二進位', 'binary', 'magic number'],
      needs: ['file'],
    },
  ],
  data: [
    {
      id: 'C01',
      slug: 'json-format',
      name: { zh: 'JSON 格式化', en: 'JSON format' },
      blurb: {
        zh: '格式化、壓縮、排序鍵值與驗證,語法錯誤標到行列與位移。',
        en: 'Pretty-print, minify, sort keys and validate — syntax errors pinned to line, column and offset.',
      },
      keywords: ['json', '格式化', 'format', 'pretty', 'minify', 'validate'],
      indexable: true,
    },
    {
      id: 'C02',
      slug: 'data-convert',
      name: { zh: '格式互轉', en: 'Format convert' },
      blurb: {
        zh: 'JSON、YAML、TOML、XML、CSV 與 query string 互轉。YAML/TOML 支援常用子集,頁內列明界線。',
        en: 'JSON, YAML, TOML, XML, CSV and query strings. YAML/TOML cover a documented common subset.',
      },
      keywords: ['yaml', 'toml', 'xml', 'csv', 'json', '轉換', 'convert'],
      weight: 'heavy',
      indexable: true,
    },
    {
      id: 'C03',
      slug: 'jsonpath',
      name: { zh: 'JSON 查詢', en: 'JSON query' },
      blurb: {
        zh: '用路徑語法從大包 JSON 撈出需要的欄位,求值器自己寫,沒有 eval。',
        en: 'Pull fields out of a large JSON payload with path syntax. Hand-written evaluator, no eval.',
      },
      keywords: ['jsonpath', 'jq', '查詢', 'query', 'filter'],
    },
    {
      id: 'C04',
      slug: 'json-to-types',
      name: { zh: 'JSON 轉型別', en: 'JSON to types' },
      blurb: {
        zh: '從一份 JSON 樣本產生 TypeScript interface、Zod schema、Go struct 或 Pydantic model。',
        en: 'Generate a TypeScript interface, Zod schema, Go struct or Pydantic model from a JSON sample.',
      },
      keywords: ['typescript', 'zod', 'golang', 'pydantic', '型別', 'interface'],
      indexable: true,
    },
    {
      id: 'C05',
      slug: 'json-diff',
      name: { zh: 'JSON 差異', en: 'JSON diff' },
      blurb: {
        zh: '結構化比對兩份 JSON:新增、刪除、型別改變與值改變分開列出,不是文字比對。',
        en: 'Structural comparison — added, removed, retyped and changed listed apart. Not a text diff.',
      },
      keywords: ['json', 'diff', '差異', '比對', 'compare'],
    },
    {
      id: 'C06',
      slug: 'csv-viewer',
      name: { zh: 'CSV 檢視器', en: 'CSV viewer' },
      blurb: {
        zh: '貼上或拖入 CSV/TSV,排序、選欄、轉置、去重與統計,大檔交給 Worker。',
        en: 'Paste or drop CSV/TSV, then sort, pick columns, transpose, dedupe and summarise. Worker-backed.',
      },
      keywords: ['csv', 'tsv', '表格', 'table', 'spreadsheet'],
      needs: ['file'],
    },
    {
      id: 'C07',
      slug: 'sql-format',
      name: { zh: 'SQL 格式化', en: 'SQL format' },
      blurb: {
        zh: '把一行長 SQL 攤成可讀的縮排,關鍵字大小寫可選,支援常見方言的語法糖。',
        en: 'Break a one-line query into readable indentation, with keyword casing options.',
      },
      keywords: ['sql', '格式化', 'format', 'beautify', 'query'],
    },
    {
      id: 'C08',
      slug: 'sql-convert',
      name: { zh: 'SQL 與資料互轉', en: 'SQL ↔ data' },
      blurb: {
        zh: 'CSV/JSON 產生 INSERT 語句,或把貼上的 INSERT 拆回表格。值一律參數化跳脫。',
        en: 'Build INSERT statements from CSV/JSON, or parse pasted INSERTs back into a table.',
      },
      keywords: ['sql', 'insert', 'csv', 'json', '轉換'],
    },
    {
      id: 'C09',
      slug: 'dotenv-convert',
      name: { zh: '.env 轉換', en: '.env convert' },
      blurb: {
        zh: '.env 與 JSON、YAML、docker-compose environment、Shell export 互轉,含引號處理。',
        en: '.env to JSON, YAML, compose environment or shell exports, with quoting handled.',
      },
      keywords: ['env', 'dotenv', 'docker', 'compose', '環境變數'],
      sensitive: true,
    },
    {
      id: 'C10',
      slug: 'curl-convert',
      name: { zh: 'curl 轉程式碼', en: 'curl to code' },
      blurb: {
        zh: '把一條 curl 指令轉成 fetch、axios、Python requests 或 httpie。只解析,不會發出請求。',
        en: 'Turn a curl command into fetch, axios, Python requests or httpie. Parsed, never executed.',
      },
      keywords: ['curl', 'fetch', 'axios', 'requests', 'httpie', '轉換'],
      sensitive: true,
      indexable: true,
    },
  ],
  dev: [
    {
      id: 'D01',
      slug: 'regex-tester',
      name: { zh: '正規表達式測試', en: 'Regex tester' },
      blurb: {
        zh: '即時標示命中與擷取群組,跑在 Worker 裡並設超時,災難性回溯不會凍住這一頁。',
        en: 'Live matches and capture groups, run in a Worker with a timeout so backtracking cannot hang the page.',
      },
      keywords: ['regex', '正規', '正則', 'regexp', 'pattern', '測試'],
      indexable: true,
    },
    {
      id: 'D02',
      slug: 'cron-explain',
      name: { zh: 'Cron 解譯', en: 'Cron explain' },
      blurb: {
        zh: '把 cron 字串翻成白話,並列出接下來幾次執行時刻。支援五欄與 Quartz 六欄。',
        en: 'Plain-language reading of a cron string plus the next runs. Five-field and Quartz six-field.',
      },
      keywords: ['cron', 'crontab', 'quartz', '排程', 'schedule'],
      indexable: true,
    },
    {
      id: 'D03',
      slug: 'jwt-decode',
      name: { zh: 'JWT 檢視', en: 'JWT inspect' },
      blurb: {
        zh: '解出 header 與 payload、標示過期時間,可用你自備的密鑰在本機驗 HMAC 簽章。',
        en: 'Decode header and payload, flag expiry, and verify an HMAC signature with your own key, locally.',
      },
      keywords: ['jwt', 'token', 'bearer', 'jws', '解碼'],
      sensitive: true,
      indexable: true,
    },
    {
      id: 'D04',
      slug: 'id-generator',
      name: { zh: 'ID 產生與解析', en: 'ID generator' },
      blurb: {
        zh: 'UUID v4/v7、ULID、NanoID 批次產生,並能把既有 ID 反解出版本與時間戳。',
        en: 'Batch UUID v4/v7, ULID and NanoID, plus decoding an existing ID back to version and timestamp.',
      },
      keywords: ['uuid', 'ulid', 'nanoid', 'guid', 'id'],
      indexable: true,
    },
    {
      id: 'D05',
      slug: 'timestamp',
      name: { zh: '時間戳轉換', en: 'Timestamp' },
      blurb: {
        zh: 'Unix 秒、毫秒、微秒與 ISO 8601、RFC 2822 互轉,含本地與 UTC 並列。',
        en: 'Unix seconds, millis and micros against ISO 8601 and RFC 2822, local and UTC side by side.',
      },
      keywords: ['timestamp', 'unix', 'epoch', 'iso8601', '時間戳'],
      indexable: true,
    },
    {
      id: 'D06',
      slug: 'bitwise',
      name: { zh: '位元運算', en: 'Bitwise' },
      blurb: {
        zh: 'AND、OR、XOR、位移與遮罩的逐位檢視,附 IEEE 754 浮點拆解。',
        en: 'AND, OR, XOR, shifts and masks shown bit by bit, plus IEEE 754 float breakdown.',
      },
      keywords: ['bitwise', '位元', 'xor', 'shift', 'ieee754', 'float'],
    },
    {
      id: 'D07',
      slug: 'semver',
      name: { zh: 'Semver 比較', en: 'Semver' },
      blurb: {
        zh: '版本號排序比較,以及 ^ ~ >= 這類範圍到底涵蓋哪些版本。',
        en: 'Compare and sort versions, and see exactly which versions a ^ ~ >= range covers.',
      },
      keywords: ['semver', 'version', '版本', 'range', 'npm'],
    },
    {
      id: 'D08',
      slug: 'commit-message',
      name: { zh: 'Commit 訊息', en: 'Commit message' },
      blurb: {
        zh: 'Conventional Commits 表單產生器,含 breaking change 標記與字數檢查。',
        en: 'A Conventional Commits form with breaking-change markers and subject-length checks.',
      },
      keywords: ['commit', 'conventional', 'git', 'changelog'],
    },
    {
      id: 'D09',
      slug: 'http-reference',
      name: { zh: 'HTTP 速查', en: 'HTTP reference' },
      blurb: {
        zh: '狀態碼、請求與回應標頭、快取指令的離線速查,可搜尋。',
        en: 'Searchable offline reference for status codes, headers and cache directives.',
      },
      keywords: ['http', 'status', 'header', 'cache-control', '狀態碼'],
      weight: 'heavy',
    },
    {
      id: 'D10',
      slug: 'tree-draw',
      name: { zh: '目錄樹繪製', en: 'Tree draw' },
      blurb: {
        zh: '把縮排清單畫成 ├── └── 的樹狀圖,貼進 README 或 issue 就能用。',
        en: 'Turn an indented list into a ├── └── tree you can paste into a README or an issue.',
      },
      keywords: ['tree', '目錄', 'ascii', 'structure', '樹狀'],
    },
  ],
  crypto: [
    {
      id: 'E01',
      slug: 'password-generator',
      name: { zh: '密碼產生器', en: 'Password generator' },
      blurb: {
        zh: 'crypto.getRandomValues 取樣、無取模偏差,並直接告訴你這串密碼有幾 bit 熵。',
        en: 'Sampled from crypto.getRandomValues without modulo bias, with the entropy in bits shown.',
      },
      keywords: ['password', '密碼', '產生', 'generator', 'random', '亂數'],
      sensitive: true,
      indexable: true,
    },
    {
      id: 'E02',
      slug: 'passphrase',
      name: { zh: '密語產生器', en: 'Passphrase' },
      blurb: {
        zh: '多字組成的密語,比同長度亂碼好記且好打。熵依實際字表大小計算,不虛報。',
        en: 'Multi-word passphrases — easier to type than random strings. Entropy from the real wordlist size.',
      },
      keywords: ['passphrase', '密語', 'diceware', '詞組', 'password'],
      sensitive: true,
      weight: 'heavy',
    },
    {
      id: 'E03',
      slug: 'password-strength',
      name: { zh: '密碼強度檢測', en: 'Password strength' },
      blurb: {
        zh: '估算熵、比對常見密碼與鍵盤序列、抓出替換字母的老把戲。完全在本機判斷。',
        en: 'Entropy estimate, common-password and keyboard-run checks, and the usual letter substitutions.',
      },
      keywords: ['password', '強度', 'strength', 'entropy', '檢測'],
      sensitive: true,
      weight: 'heavy',
    },
    {
      id: 'E04',
      slug: 'hash',
      name: { zh: '雜湊計算', en: 'Hash' },
      blurb: {
        zh: '文字與檔案的 SHA-256/384/512 與 SHA-1、MD5。後兩者只適合校驗,頁內有標記。',
        en: 'SHA-256/384/512 plus SHA-1 and MD5 for text and files — the last two flagged as checksum-only.',
      },
      keywords: ['hash', 'sha256', 'md5', 'sha1', '雜湊', '摘要'],
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'E05',
      slug: 'hmac',
      name: { zh: 'HMAC 計算', en: 'HMAC' },
      blurb: {
        zh: '用你的密鑰算 HMAC-SHA256/384/512,對 webhook 簽章除錯很好用。',
        en: 'HMAC-SHA256/384/512 with your key — handy when debugging a webhook signature.',
      },
      keywords: ['hmac', 'signature', '簽章', 'webhook', 'sha256'],
      sensitive: true,
    },
    {
      id: 'E06',
      slug: 'checksum-verify',
      name: { zh: '檔案校驗', en: 'Checksum verify' },
      blurb: {
        zh: '拖入下載的檔案,貼上官方公布的 checksum,直接告訴你符不符合。',
        en: 'Drop a downloaded file, paste the published checksum, get a yes or no.',
      },
      keywords: ['checksum', '校驗', 'verify', 'sha256sum', '完整性'],
      needs: ['file'],
    },
    {
      id: 'E07',
      slug: 'aes-encrypt',
      name: { zh: 'AES 加解密', en: 'AES encrypt' },
      blurb: {
        zh: 'AES-256-GCM 加密文字或檔案,金鑰由 PBKDF2-SHA256 600,000 次迭代導出,每次新的 salt 與 IV。',
        en: 'AES-256-GCM for text and files. Keys from PBKDF2-SHA256 at 600,000 iterations, fresh salt and IV.',
      },
      keywords: ['aes', 'gcm', '加密', 'encrypt', 'decrypt', 'pbkdf2'],
      sensitive: true,
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'E08',
      slug: 'keypair',
      name: { zh: '金鑰對產生', en: 'Key pair' },
      blurb: {
        zh: 'WebCrypto 產生 RSA 或 ECDSA 金鑰對,匯出 PEM 與 JWK。私鑰只存在這個分頁。',
        en: 'RSA or ECDSA key pairs from WebCrypto, exported as PEM and JWK. The private key never leaves the tab.',
      },
      keywords: ['rsa', 'ecdsa', 'keypair', '金鑰', 'pem', 'jwk'],
      sensitive: true,
    },
    {
      id: 'E09',
      slug: 'totp',
      name: { zh: 'TOTP 驗證碼', en: 'TOTP' },
      blurb: {
        zh: '輸入 secret 在本機算出六位動態碼,附剩餘秒數。預設不儲存任何東西。',
        en: 'Six-digit codes computed locally from a secret, with the seconds remaining. Nothing is stored.',
      },
      keywords: ['totp', '2fa', 'otp', 'authenticator', '驗證碼'],
      sensitive: true,
    },
    {
      id: 'E10',
      slug: 'cert-inspect',
      name: { zh: '憑證與公鑰檢視', en: 'Certificate inspect' },
      blurb: {
        zh: '解析 PEM 憑證的主體、簽發者、有效期與 SAN,並算 SSH 公鑰指紋。',
        en: 'Subject, issuer, validity and SANs from a PEM certificate, plus SSH public-key fingerprints.',
      },
      keywords: ['x509', 'certificate', '憑證', 'ssl', 'ssh', 'fingerprint'],
      weight: 'heavy',
    },
  ],
  time: [
    {
      id: 'F01',
      slug: 'timezone',
      name: { zh: '時區對照', en: 'Time zones' },
      blurb: {
        zh: '多個城市並排看同一個時刻,含日期跨越與日光節約標示。用瀏覽器內建時區資料。',
        en: 'One moment across several cities, with date rollover and DST flags, from the browser tz data.',
      },
      keywords: ['時區', 'timezone', 'utc', 'dst', '換算'],
      indexable: true,
    },
    {
      id: 'F02',
      slug: 'workdays',
      name: { zh: '工作日計算', en: 'Working days' },
      blurb: {
        zh: '兩個日期間的工作日數、往後推 N 個工作日,假日表可自行編輯。',
        en: 'Working days between two dates, or N working days out. The holiday table is editable.',
      },
      keywords: ['工作日', '假日', 'workday', 'business day', '天數'],
      weight: 'heavy',
    },
    {
      id: 'F03',
      slug: 'roc-date',
      name: { zh: '民國年與週次', en: 'ROC date & week' },
      blurb: {
        zh: '民國、西元、ISO 週次與年積日互換,填公文和排版本號都會用到。',
        en: 'ROC year, Gregorian, ISO week number and ordinal day, all interchangeable.',
      },
      keywords: ['民國', '西元', 'roc', 'iso week', '週次'],
    },
    {
      id: 'F04',
      slug: 'age',
      name: { zh: '年齡與紀念日', en: 'Age & anniversary' },
      blurb: {
        zh: '算實際年齡、下一個生日還有幾天,以及任兩個日期之間相隔多久。',
        en: 'Exact age, days to the next birthday, and the span between any two dates.',
      },
      keywords: ['年齡', '生日', 'age', 'anniversary', '紀念日'],
    },
    {
      id: 'F05',
      slug: 'countdown',
      name: { zh: '倒數與碼表', en: 'Countdown & stopwatch' },
      blurb: {
        zh: '倒數計時與碼表,含分段計時。時間到會通知,分頁在背景也算得準。',
        en: 'Countdown and stopwatch with laps. It notifies when done and keeps time in a background tab.',
      },
      keywords: ['倒數', '計時', 'countdown', 'timer', 'stopwatch', '碼表'],
      needs: ['notify'],
    },
    {
      id: 'F06',
      slug: 'pomodoro',
      name: { zh: '番茄鐘', en: 'Pomodoro' },
      blurb: {
        zh: '工作與休息輪替,週期長度可調,完成次數留在本機。離線也能跑。',
        en: 'Work and break cycles with adjustable lengths. The tally stays on this device. Works offline.',
      },
      keywords: ['番茄鐘', 'pomodoro', '專注', 'focus', '計時'],
      needs: ['notify'],
    },
    {
      id: 'F07',
      slug: 'meeting-slots',
      name: { zh: '跨時區會議時段', en: 'Meeting slots' },
      blurb: {
        zh: '把幾個人的時區與上班時間疊起來,直接看出哪幾個小時大家都醒著。',
        en: 'Overlay several time zones and working hours to see which hours everyone is awake.',
      },
      keywords: ['會議', '時區', 'meeting', 'schedule', '時段'],
    },
    {
      id: 'F08',
      slug: 'shift-roster',
      name: { zh: '輪班表產生', en: 'Shift roster' },
      blurb: {
        zh: '依人數與班別循環產生輪班表,可匯出 CSV 或 ICS 行事曆檔。',
        en: 'Generate a rotating roster from people and shift patterns. Exports CSV or an ICS calendar.',
      },
      keywords: ['輪班', '排班', 'shift', 'roster', 'ics'],
    },
    {
      id: 'F09',
      slug: 'timesheet',
      name: { zh: '工時記錄', en: 'Timesheet' },
      blurb: {
        zh: '開始、停止、加註,累計每日與每案工時,存在這台裝置,可匯出 CSV。',
        en: 'Start, stop, annotate. Daily and per-project totals stored on this device, exportable as CSV.',
      },
      keywords: ['工時', '記錄', 'timesheet', 'tracking', '計時'],
    },
    {
      id: 'F10',
      slug: 'stage-clock',
      name: { zh: '簡報大字鐘', en: 'Stage clock' },
      blurb: {
        zh: '全螢幕時鐘或倒數,超時會變色。放在講台的第二個螢幕上。',
        en: 'Full-screen clock or countdown that changes colour when you run over. For the stage monitor.',
      },
      keywords: ['時鐘', '簡報', 'clock', 'presentation', '倒數'],
    },
  ],
  calc: [
    {
      id: 'G01',
      slug: 'unit-convert',
      name: { zh: '單位換算', en: 'Unit convert' },
      blurb: {
        zh: '長度、重量、溫度、面積、體積、速度、壓力、資料量與能量,含台制坪與斤。',
        en: 'Length, mass, temperature, area, volume, speed, pressure, data and energy — including ping and catty.',
      },
      keywords: ['單位', '換算', 'unit', 'convert', '坪', '公斤'],
      indexable: true,
    },
    {
      id: 'G02',
      slug: 'radix-convert',
      name: { zh: '進位轉換', en: 'Radix convert' },
      blurb: {
        zh: '2 到 36 進位任意互轉,支援大整數與分組顯示。',
        en: 'Any base from 2 to 36, with big-integer support and digit grouping.',
      },
      keywords: ['進位', '二進位', '十六進位', 'radix', 'binary', 'hex'],
    },
    {
      id: 'G03',
      slug: 'percentage',
      name: { zh: '百分比計算', en: 'Percentage' },
      blurb: {
        zh: '佔比、增減幅、折扣前後價、稅前稅後,六種常問的百分比一次算完。',
        en: 'Share of total, change, discounts, and before/after tax — the six percentage questions.',
      },
      keywords: ['百分比', '折扣', '漲幅', 'percent', 'discount', '稅'],
    },
    {
      id: 'G04',
      slug: 'calculator',
      name: { zh: '運算式計算機', en: 'Expression calculator' },
      blurb: {
        zh: '打一整行算式直接出答案,支援函式、變數與括號。剖析器自己寫,沒有用 eval。',
        en: 'Type a whole expression — functions, variables, parentheses. Hand-written parser, no eval.',
      },
      keywords: ['計算機', '算式', 'calculator', 'expression', 'math'],
      indexable: true,
    },
    {
      id: 'G05',
      slug: 'statistics',
      name: { zh: '統計摘要', en: 'Statistics' },
      blurb: {
        zh: '貼上一欄數字,得到平均、中位、標準差、四分位與直方圖。',
        en: 'Paste a column of numbers for mean, median, standard deviation, quartiles and a histogram.',
      },
      keywords: ['統計', '平均', '標準差', 'statistics', 'median', 'stdev'],
    },
    {
      id: 'G06',
      slug: 'loan',
      name: { zh: '貸款試算', en: 'Loan' },
      blurb: {
        zh: '本息平均攤還、寬限期與提前還款,逐期攤還表可展開檢查。',
        en: 'Equal-payment amortisation with grace periods and prepayment, and a full schedule to check.',
      },
      keywords: ['貸款', '房貸', '攤還', 'loan', 'mortgage', '利率'],
      indexable: true,
    },
    {
      id: 'G07',
      slug: 'compound-interest',
      name: { zh: '複利與定期定額', en: 'Compound interest' },
      blurb: {
        zh: '單筆與定期投入的複利成長,可扣通膨看實質購買力。',
        en: 'Compound growth for lump sums and regular contributions, with an inflation-adjusted view.',
      },
      keywords: ['複利', '定期定額', 'compound', 'investment', '通膨'],
    },
    {
      id: 'G08',
      slug: 'utility-bill',
      name: { zh: '電費水費試算', en: 'Utility bill' },
      blurb: {
        zh: '累進級距電費與水費試算。級距表內建預設值但可整張編輯,以帳單為準。',
        en: 'Tiered electricity and water bills. The rate table ships with defaults and is fully editable.',
      },
      keywords: ['電費', '水費', '台電', '級距', 'electricity', 'bill'],
      weight: 'heavy',
    },
    {
      id: 'G09',
      slug: 'split-bill',
      name: { zh: '分帳計算', en: 'Split bill' },
      blurb: {
        zh: '多人分帳,支援不均分、指定項目、服務費與小費,算出誰該付誰多少。',
        en: 'Split a bill unevenly, per item, with service charge and tip — and who owes whom.',
      },
      keywords: ['分帳', '拆帳', '小費', 'split', 'bill', 'tip'],
    },
    {
      id: 'G10',
      slug: 'random-draw',
      name: { zh: '抽籤與分組', en: 'Random draw' },
      blurb: {
        zh: '抽人、抽獎、隨機分組、骰子。用 getRandomValues,可公開種子讓人事後驗證。',
        en: 'Draw names, pick winners, split groups, roll dice. From getRandomValues, with a verifiable seed.',
      },
      keywords: ['抽籤', '抽獎', '分組', 'random', 'draw', 'dice'],
    },
  ],
  design: [
    {
      id: 'H01',
      slug: 'color-convert',
      name: { zh: '顏色轉換', en: 'Colour convert' },
      blurb: {
        zh: 'HEX、RGB、HSL、OKLCH、LAB 互轉,支援螢幕取色(瀏覽器支援時)。',
        en: 'HEX, RGB, HSL, OKLCH and LAB, with a screen eyedropper where the browser has one.',
      },
      keywords: ['顏色', 'color', 'hex', 'rgb', 'hsl', 'oklch'],
      indexable: true,
    },
    {
      id: 'H02',
      slug: 'contrast',
      name: { zh: '對比度檢查', en: 'Contrast check' },
      blurb: {
        zh: 'WCAG 2.2 對比率與 AA/AAA 判定,並附 APCA 對照,直接給出可用的最近色。',
        en: 'WCAG 2.2 ratio with AA/AAA verdicts and an APCA reading, plus the nearest passing colour.',
      },
      keywords: ['對比', '無障礙', 'contrast', 'wcag', 'apca', 'a11y'],
      indexable: true,
    },
    {
      id: 'H03',
      slug: 'palette',
      name: { zh: '色階與配色', en: 'Palette' },
      blurb: {
        zh: '從一個顏色長出感知均勻的色階,或推互補、三分、類似色配色。',
        en: 'Grow a perceptually even ramp from one colour, or derive complementary and triadic sets.',
      },
      keywords: ['配色', '色階', 'palette', 'ramp', 'oklch', '調色'],
    },
    {
      id: 'H04',
      slug: 'gradient',
      name: { zh: '漸層產生器', en: 'Gradient' },
      blurb: {
        zh: 'CSS 線性與放射漸層,中繼點可調,並在 OKLCH 空間插值避免中間變灰。',
        en: 'Linear and radial CSS gradients with adjustable stops, interpolated in OKLCH to avoid grey middles.',
      },
      keywords: ['漸層', 'gradient', 'css', 'linear', 'radial'],
    },
    {
      id: 'H05',
      slug: 'shadow-css',
      name: { zh: '陰影與邊框 CSS', en: 'Shadow & border CSS' },
      blurb: {
        zh: 'box-shadow 多層堆疊、圓角與邊框產生器,即時預覽並輸出可貼的 CSS。',
        en: 'Layered box-shadows, radii and borders with a live preview and copyable CSS.',
      },
      keywords: ['陰影', 'shadow', 'border', 'radius', 'css'],
    },
    {
      id: 'H06',
      slug: 'cubic-bezier',
      name: { zh: '緩動曲線編輯', en: 'Cubic bezier' },
      blurb: {
        zh: '拖曲線調 easing,並排比對動畫節奏,輸出 cubic-bezier() 值。',
        en: 'Drag the curve, compare the motion side by side, copy the cubic-bezier() value.',
      },
      keywords: ['easing', 'bezier', '曲線', 'animation', 'css'],
    },
    {
      id: 'H07',
      slug: 'type-scale',
      name: { zh: '字級比例尺', en: 'Type scale' },
      blurb: {
        zh: '選一個比例產生完整字級階梯,附建議行高與 clamp() 的流體級距。',
        en: 'A full type ladder from one ratio, with line-height suggestions and fluid clamp() steps.',
      },
      keywords: ['字級', '比例', 'type scale', 'typography', 'clamp'],
    },
    {
      id: 'H08',
      slug: 'color-blind',
      name: { zh: '色盲模擬', en: 'Colour blindness' },
      blurb: {
        zh: '把配色或截圖套上三型色覺缺陷的模擬,檢查是否只靠顏色傳達資訊。',
        en: 'Simulate the three common colour-vision deficiencies over a palette or a screenshot.',
      },
      keywords: ['色盲', '色弱', 'color blind', 'deuteranopia', 'a11y'],
      needs: ['file'],
    },
    {
      id: 'H09',
      slug: 'aspect-ratio',
      name: { zh: '比例與解析度', en: 'Aspect ratio' },
      blurb: {
        zh: '等比換算寬高、算出最接近的整數比,附常見裝置與社群平台尺寸。',
        en: 'Scale dimensions proportionally, find the nearest integer ratio, with common device sizes.',
      },
      keywords: ['比例', '解析度', 'aspect ratio', 'resolution', '尺寸'],
    },
    {
      id: 'H10',
      slug: 'svg-optimize',
      name: { zh: 'SVG 最佳化', en: 'SVG optimise' },
      blurb: {
        zh: '刪冗餘屬性與註解、收斂小數位、輸出可內嵌的 SVG。預覽走 blob 不內嵌 DOM。',
        en: 'Drop redundant attributes, round coordinates, output inline-ready SVG. Preview via blob, never inline.',
      },
      keywords: ['svg', '最佳化', 'optimize', 'svgo', '壓縮'],
      needs: ['file'],
    },
  ],
  media: [
    {
      id: 'I01',
      slug: 'image-convert',
      name: { zh: '圖片壓縮與轉檔', en: 'Image convert' },
      blurb: {
        zh: 'WebP、AVIF、JPEG、PNG 互轉與品質調整,顯示前後大小差。完全在本機編碼。',
        en: 'WebP, AVIF, JPEG and PNG with quality control and a before/after size readout. Encoded locally.',
      },
      keywords: ['圖片', '壓縮', '轉檔', 'webp', 'avif', 'image'],
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'I02',
      slug: 'image-crop',
      name: { zh: '圖片裁切縮放', en: 'Image crop' },
      blurb: {
        zh: '裁切、縮放、旋轉、翻轉,可鎖定比例與輸出指定像素尺寸。',
        en: 'Crop, resize, rotate and flip, with ratio locking and exact output dimensions.',
      },
      keywords: ['裁切', '縮放', '旋轉', 'crop', 'resize', 'image'],
      needs: ['file'],
    },
    {
      id: 'I03',
      slug: 'exif',
      name: { zh: 'EXIF 檢視與移除', en: 'EXIF' },
      blurb: {
        zh: '看照片裡藏了什麼——含 GPS 座標與裝置型號——然後整批洗掉再輸出。',
        en: 'See what a photo carries, GPS and device included, then strip it and re-export.',
      },
      keywords: ['exif', 'gps', 'metadata', '隱私', '照片'],
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'I04',
      slug: 'image-redact',
      name: { zh: '截圖打碼', en: 'Redact screenshot' },
      blurb: {
        zh: '在截圖上刷實心遮罩或馬賽克,像素真的被改掉,不是疊一層可還原的圖層。',
        en: 'Paint solid or mosaic redactions. The pixels are actually replaced, not covered by a layer.',
      },
      keywords: ['打碼', '馬賽克', '遮蔽', 'redact', 'blur', '截圖'],
      needs: ['file'],
      indexable: true,
    },
    {
      id: 'I05',
      slug: 'image-join',
      name: { zh: '圖片拼接', en: 'Join images' },
      blurb: {
        zh: '多張圖縱向或橫向接成一張,可設間距與背景,長截圖對照用。',
        en: 'Stack or line up several images into one, with gap and background control.',
      },
      keywords: ['拼接', '合併', 'join', 'stitch', 'collage', '截圖'],
      needs: ['file'],
    },
    {
      id: 'I06',
      slug: 'video-frame',
      name: { zh: '影片擷取影格', en: 'Video frame' },
      blurb: {
        zh: '開本機影片、逐格找到那一秒,存成 PNG 或 JPEG。影片不會離開這台電腦。',
        en: 'Open a local video, step to the frame you want, save it as PNG or JPEG. Nothing is uploaded.',
      },
      keywords: ['影片', '擷取', '影格', 'video', 'frame', 'screenshot'],
      needs: ['file'],
    },
    {
      id: 'I07',
      slug: 'qr-generate',
      name: { zh: 'QR Code 產生', en: 'QR code' },
      blurb: {
        zh: '網址、WiFi、vCard 與純文字的 QR Code,可調容錯等級,輸出 SVG 或 PNG。',
        en: 'QR codes for URLs, WiFi, vCards and plain text, with error-correction control. SVG or PNG out.',
      },
      keywords: ['qr', 'qrcode', '二維碼', 'wifi', 'vcard'],
      weight: 'heavy',
      indexable: true,
    },
    {
      id: 'I08',
      slug: 'barcode-scan',
      name: { zh: 'QR 與條碼掃描', en: 'Scan code' },
      blurb: {
        zh: '用相機或一張圖掃 QR 與常見一維條碼。畫面不錄製、不外傳。',
        en: 'Scan QR and common 1D barcodes from the camera or an image. Nothing is recorded or sent.',
      },
      keywords: ['掃描', 'qr', '條碼', 'barcode', 'scan', '相機'],
      needs: ['camera', 'file'],
    },
    {
      id: 'I09',
      slug: 'favicon',
      name: { zh: 'Favicon 產生', en: 'Favicon' },
      blurb: {
        zh: '一張圖產生整組 favicon 與 apple-touch-icon,含多尺寸 ICO 與要貼的 HTML。',
        en: 'One image into a full favicon set and apple-touch-icon, multi-size ICO plus the HTML to paste.',
      },
      keywords: ['favicon', 'ico', 'icon', '圖示', 'apple touch'],
      needs: ['file'],
    },
    {
      id: 'I10',
      slug: 'images-to-pdf',
      name: { zh: '圖片轉 PDF', en: 'Images to PDF' },
      blurb: {
        zh: '把掃描件或截圖依序併成一份 PDF,可選紙張大小與邊界。PDF 在瀏覽器裡組出來。',
        en: 'Combine scans or screenshots into one PDF with paper size and margin options, assembled in-browser.',
      },
      keywords: ['pdf', '圖片', '合併', '掃描', 'scan', 'merge'],
      needs: ['file'],
    },
  ],
  net: [
    {
      id: 'J01',
      slug: 'cidr',
      name: { zh: '子網路計算', en: 'Subnet calculator' },
      blurb: {
        zh: 'IPv4 與 IPv6 的 CIDR 拆解:網段、廣播、可用範圍、遮罩與切分子網。純算術。',
        en: 'CIDR arithmetic for IPv4 and IPv6 — network, broadcast, usable range, mask and subnetting.',
      },
      keywords: ['cidr', '子網', 'subnet', 'ip', 'netmask', 'ipv6'],
      indexable: true,
    },
    {
      id: 'J02',
      slug: 'url-inspect',
      name: { zh: '網址解析與清理', en: 'URL inspect' },
      blurb: {
        zh: '拆解網址每個部件、編輯 query,並一鍵移除 utm_ 這類追蹤參數再複製。',
        en: 'Break a URL into parts, edit the query, and strip utm_-style tracking before copying.',
      },
      keywords: ['url', '網址', 'utm', 'tracking', 'query', '追蹤'],
      indexable: true,
    },
    {
      id: 'J03',
      slug: 'user-agent',
      name: { zh: 'User-Agent 解析', en: 'User agent' },
      blurb: {
        zh: '把 UA 字串拆成瀏覽器、引擎、系統與裝置,並顯示你自己現在的 UA。',
        en: 'Break a UA string into browser, engine, OS and device — and show your own.',
      },
      keywords: ['user agent', 'ua', '瀏覽器', 'browser', 'parse'],
    },
    {
      id: 'J04',
      slug: 'device-info',
      name: { zh: '裝置資訊', en: 'Device info' },
      blurb: {
        zh: '螢幕、像素比、色域、記憶體、核心數與瀏覽器能力。只讀不送,用來回報 bug。',
        en: 'Screen, DPR, colour gamut, memory, cores and feature support. Read-only, for filing bug reports.',
      },
      keywords: ['裝置', '螢幕', 'device', 'screen', 'support', '能力'],
    },
    {
      id: 'J05',
      slug: 'tw-validate',
      name: { zh: '台灣格式驗證', en: 'Taiwan ID formats' },
      blurb: {
        zh: '身分證、居留證、統一編號與手機號碼的檢查碼驗證。純演算法,不查任何資料庫。',
        en: 'Check digits for Taiwan ID, ARC, business number and mobile formats. Pure arithmetic, no lookup.',
      },
      keywords: ['身分證', '統編', '驗證', 'taiwan', 'validate', '檢查碼'],
      indexable: true,
    },
    {
      id: 'J06',
      slug: 'bmi-tdee',
      name: { zh: 'BMI 與熱量需求', en: 'BMI & TDEE' },
      blurb: {
        zh: 'BMI、基礎代謝與每日總熱量消耗,附台灣衛福部的體重分級對照。',
        en: 'BMI, basal metabolic rate and total daily energy expenditure, with weight-category bands.',
      },
      keywords: ['bmi', 'tdee', '熱量', '基礎代謝', '體重'],
    },
    {
      id: 'J07',
      slug: 'volumetric-weight',
      name: { zh: '材積重計算', en: 'Volumetric weight' },
      blurb: {
        zh: '長寬高換材積重,比對實重取計費重,常見快遞係數可切換。',
        en: 'Dimensional weight from L×W×H against actual weight, with switchable carrier divisors.',
      },
      keywords: ['材積', '運費', '快遞', 'volumetric', 'shipping', '重量'],
    },
    {
      id: 'J08',
      slug: 'cooking-convert',
      name: { zh: '烹飪份量換算', en: 'Cooking convert' },
      blurb: {
        zh: '份數縮放、杯匙與公克互換(依食材密度)、烤箱溫度換算。',
        en: 'Scale servings, convert cups and spoons to grams by ingredient density, and oven temperatures.',
      },
      keywords: ['烹飪', '食譜', '份量', 'cooking', 'recipe', '換算'],
    },
    {
      id: 'J09',
      slug: 'notepad',
      name: { zh: '便條紙', en: 'Notepad' },
      blurb: {
        zh: 'Markdown 便條,存在這台裝置的瀏覽器裡,離線可用,可整包匯出。',
        en: 'Markdown notes kept in this browser on this device. Works offline, exports in one file.',
      },
      keywords: ['便條', '筆記', 'note', 'markdown', 'scratchpad'],
    },
    {
      id: 'J10',
      slug: 'checklist',
      name: { zh: '檢查表與決策表', en: 'Checklist & matrix' },
      blurb: {
        zh: '上線前檢查表與加權決策矩陣,可存多份、可列印、可匯出 Markdown。',
        en: 'Release checklists and weighted decision matrices. Save several, print them, export Markdown.',
      },
      keywords: ['檢查表', '決策', 'checklist', 'matrix', '評分'],
    },
  ],
};

export const TOOLS: Tool[] = Object.entries(DRAWERS).flatMap(([category, entries]) =>
  entries.map((entry) => ({ ...entry, category: category as CategoryId }))
);

export const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

export function findTool(slug: string): Tool | undefined {
  return TOOL_BY_SLUG.get(slug);
}

/** Tools in a drawer, in catalogue order. */
export function toolsIn(category: CategoryId): Tool[] {
  return TOOLS.filter((t) => t.category === category);
}

export function localized(value: Localized, locale: string): string {
  return locale === 'en' ? value.en : value.zh;
}
