/**
 * HTTP reference: status codes, header fields, cache directives and methods.
 *
 * The data is here rather than in a JSON file so that it type-checks and so the
 * tests can assert things about it — that no id repeats, that every entry cites
 * a document, that the reason phrases are the current ones.
 *
 * ## Which documents this follows
 *
 * The HTTP core specification was re-cut in June 2022: RFC 9110 (Semantics),
 * 9111 (Caching), 9112 (HTTP/1.1), 9113 (HTTP/2), 9114 (HTTP/3). Those obsolete
 * RFC 7230–7235 and 2616 entirely, so a cheat sheet that still cites 7231 is
 * pointing at a document marked obsolete. Everything below cites 9110/9111
 * where the definition now lives, and the original RFC where it never moved
 * (WebDAV's 423, the 6585 codes, and so on).
 *
 * Two reason phrases changed in the re-cut and are given here in their current
 * form: 413 is **Content Too Large** (was "Payload Too Large") and 422 is
 * **Unprocessable Content** (was "Unprocessable Entity"). The old names are kept
 * as search tags, because that is what people still type.
 *
 * ## What this is not
 *
 * Hand-transcribed, and therefore capable of being wrong. The authorities are
 * the RFC text and the IANA registries ("HTTP Status Codes", "HTTP Field Name",
 * "HTTP Cache Directives"); the section numbers here are given so you can go
 * check rather than take this file's word for it. Section numbers are omitted
 * where the entry's document is small enough not to need one — an absent
 * section is an absent section, not a wrong one.
 */

export type Category = 'status' | 'method' | 'request' | 'response' | 'cache';

export type Entry = {
  /** Stable, unique, and what the UI uses as a React key. */
  id: string;
  category: Category;
  /** The literal token as it appears on the wire. */
  name: string;
  /** Reason phrase for a status; nothing for a header or a directive. */
  label?: string;
  zh: string;
  en: string;
  /** The document that defines it, e.g. 'RFC 9110'. */
  rfc: string;
  /** Section within that document. Absent when this file does not vouch for one. */
  section?: string;
  /** Aliases, former names and Chinese search terms. */
  tags?: readonly string[];
  /** Short machine-ish notes rendered as-is: 'safe', 'idempotent', … */
  flags?: readonly string[];
  /** Registered but no longer to be used. */
  deprecated?: boolean;
};

export const SPEC_SET = 'RFC 9110 / 9111 / 9112 (2022-06)';
export const DATA_CHECKED = '2026-09-26';
export const REGISTRIES = 'IANA: HTTP Status Codes, HTTP Field Name, HTTP Cache Directives';

/**
 * Responses a cache may reuse without an explicit freshness signal.
 * RFC 9110 §15.1 names exactly this set; everything else needs Cache-Control,
 * Expires or an Age of its own before a shared cache will keep it.
 */
const HEURISTIC = 'heuristically cacheable';

/* ── Status codes ─────────────────────────── */

const STATUS: readonly Entry[] = [
  // 1xx — RFC 9110 §15.2
  {
    id: 's100', category: 'status', name: '100', label: 'Continue', rfc: 'RFC 9110', section: '15.2.1',
    zh: '伺服器收到了請求標頭,願意接收內文。只在請求帶 Expect: 100-continue 時才會出現,用途是先問過再送大檔。',
    en: 'Headers received; go ahead and send the body. Only sent in answer to Expect: 100-continue, so a large body can be cleared before it is uploaded.',
    tags: ['expect', '繼續'],
  },
  {
    id: 's101', category: 'status', name: '101', label: 'Switching Protocols', rfc: 'RFC 9110', section: '15.2.2',
    zh: '同意換協定,接下來這條連線照 Upgrade 指定的協定講話。WebSocket 交握就是這個。',
    en: 'The connection switches to the protocol named in Upgrade. This is the WebSocket handshake.',
    tags: ['websocket', 'upgrade', '升級'],
  },
  {
    id: 's102', category: 'status', name: '102', label: 'Processing', rfc: 'RFC 2518', deprecated: true,
    zh: 'WebDAV 舊版的「還在處理」。RFC 4918 已經移除它,實務上不要再送。',
    en: 'An old WebDAV “still working on it”. RFC 4918 removed it; do not send it.',
    tags: ['webdav'],
  },
  {
    id: 's103', category: 'status', name: '103', label: 'Early Hints', rfc: 'RFC 8297',
    zh: '在真正的回應之前先送 Link 標頭,讓瀏覽器提早 preload。最終狀態碼還會再來一次。',
    en: 'Link headers sent ahead of the real response so the browser can start preloading. The final status still follows.',
    tags: ['preload', 'link', '提早'],
  },

  // 2xx — RFC 9110 §15.3
  {
    id: 's200', category: 'status', name: '200', label: 'OK', rfc: 'RFC 9110', section: '15.3.1',
    zh: '成功。內文的意義隨方法而變:GET 是資源本身,POST 是動作的結果,不是「建立了什麼」。',
    en: 'Success. What the body means depends on the method: for GET it is the resource, for POST it is the result of the action.',
    flags: [HEURISTIC], tags: ['成功'],
  },
  {
    id: 's201', category: 'status', name: '201', label: 'Created', rfc: 'RFC 9110', section: '15.3.2',
    zh: '建立了一個或多個資源。要帶 Location 指向新資源;沒帶 Location 就等於沒說建了什麼。',
    en: 'One or more resources were created. Send Location pointing at the new resource; without it the client is not told what was made.',
    tags: ['location', '建立'],
  },
  {
    id: 's202', category: 'status', name: '202', label: 'Accepted', rfc: 'RFC 9110', section: '15.3.3',
    zh: '收下了,但還沒做,而且可能最後不會成功。非同步任務用這個,回應裡要給查詢進度的位址。',
    en: 'Accepted for processing but not done, and may yet fail. For async work; point at somewhere the status can be polled.',
    tags: ['async', '非同步', 'queue'],
  },
  {
    id: 's203', category: 'status', name: '203', label: 'Non-Authoritative Information', rfc: 'RFC 9110', section: '15.3.4',
    zh: '成功,但內容被中間的代理改過,不是來源伺服器的原話。',
    en: 'Successful, but a proxy altered the payload — this is not what the origin said.',
    flags: [HEURISTIC], tags: ['proxy', '代理'],
  },
  {
    id: 's204', category: 'status', name: '204', label: 'No Content', rfc: 'RFC 9110', section: '15.3.5',
    zh: '成功,而且刻意沒有內文。不可以帶內文;瀏覽器收到它不會離開現在的頁面。',
    en: 'Success with deliberately no body. It must not carry content, and a browser stays on the current page.',
    flags: [HEURISTIC], tags: ['empty', '空'],
  },
  {
    id: 's205', category: 'status', name: '205', label: 'Reset Content', rfc: 'RFC 9110', section: '15.3.6',
    zh: '成功,並要求送出端把表單清空。幾乎沒人用。',
    en: 'Success, and the sender should clear the form. Very rarely used.',
    tags: ['form', '表單'],
  },
  {
    id: 's206', category: 'status', name: '206', label: 'Partial Content', rfc: 'RFC 9110', section: '15.3.7',
    zh: '只回傳 Range 要的那幾段,要帶 Content-Range。續傳與影片 seek 靠它。',
    en: 'Only the requested ranges are returned; Content-Range is required. This is what resumable downloads and video seeking use.',
    flags: [HEURISTIC], tags: ['range', 'content-range', '續傳', '部分'],
  },
  {
    id: 's207', category: 'status', name: '207', label: 'Multi-Status', rfc: 'RFC 4918',
    zh: 'WebDAV:內文是一份 XML,裡面每個資源各有自己的狀態碼。整體的 207 不代表每一筆都成功。',
    en: 'WebDAV: the body is XML carrying a status per resource. A 207 overall says nothing about each one.',
    tags: ['webdav', 'xml'],
  },
  {
    id: 's208', category: 'status', name: '208', label: 'Already Reported', rfc: 'RFC 4918',
    zh: 'WebDAV:這個成員在同一份 207 裡已經列過了,不重複列。',
    en: 'WebDAV: this member was already listed in the same 207 response.',
    tags: ['webdav'],
  },
  {
    id: 's226', category: 'status', name: '226', label: 'IM Used', rfc: 'RFC 3229',
    zh: '回應是把一個或多個實例操作套用在目前狀態上的結果(delta encoding)。極少見。',
    en: 'The response is the result of instance manipulations applied to the current state (delta encoding). Rare.',
    tags: ['delta', 'a-im'],
  },

  // 3xx — RFC 9110 §15.4
  {
    id: 's300', category: 'status', name: '300', label: 'Multiple Choices', rfc: 'RFC 9110', section: '15.4.1',
    zh: '有多種表示法可選,讓使用者自己挑。沒有標準格式列出選項,所以實務上幾乎不用。',
    en: 'Several representations to choose from, for the user to pick. There is no standard way to list them, so it is barely used.',
    flags: [HEURISTIC],
  },
  {
    id: 's301', category: 'status', name: '301', label: 'Moved Permanently', rfc: 'RFC 9110', section: '15.4.2',
    zh: '永久搬家,新位址在 Location。瀏覽器會快取這個轉向,而且歷史上會把 POST 改成 GET——要保留方法請用 308。',
    en: 'Permanent move; the new URI is in Location. Browsers cache the redirect, and historically rewrite POST to GET — use 308 to keep the method.',
    flags: [HEURISTIC], tags: ['redirect', '轉向', 'location'],
  },
  {
    id: 's302', category: 'status', name: '302', label: 'Found', rfc: 'RFC 9110', section: '15.4.3',
    zh: '暫時搬到 Location。同樣有把 POST 改成 GET 的歷史包袱;要明確語意請用 303(改 GET)或 307(不改)。',
    en: 'Temporarily at Location. Carries the same POST→GET history; use 303 (do change) or 307 (do not) to be explicit.',
    tags: ['redirect', '轉向'],
  },
  {
    id: 's303', category: 'status', name: '303', label: 'See Other', rfc: 'RFC 9110', section: '15.4.4',
    zh: '去 Location 用 GET 拿結果。POST 之後轉向的標準做法,可以避免重新整理時重複送出。',
    en: 'GET the result from Location. The standard POST-then-redirect pattern, which stops a refresh from resubmitting.',
    tags: ['redirect', 'post-redirect-get', '轉向'],
  },
  {
    id: 's304', category: 'status', name: '304', label: 'Not Modified', rfc: 'RFC 9110', section: '15.4.5',
    zh: '條件式請求判定沒變,不送內文。不可以有內文,而且要帶上會影響快取判斷的標頭(ETag 等)。',
    en: 'The conditional request matched; no body is sent. It must have no content and must carry the headers a cache needs (ETag and friends).',
    tags: ['etag', 'if-none-match', 'conditional', '條件式', '快取'],
  },
  {
    id: 's305', category: 'status', name: '305', label: 'Use Proxy', rfc: 'RFC 9110', section: '15.4.6', deprecated: true,
    zh: '已廢棄,因為它等於讓伺服器指定客戶端的代理,有安全問題。不要送。',
    en: 'Deprecated: it let a server dictate the client’s proxy, which is a security problem. Do not send it.',
  },
  {
    id: 's306', category: 'status', name: '306', label: '(Unused)', rfc: 'RFC 9110', section: '15.4.7', deprecated: true,
    zh: '保留,不再使用。',
    en: 'Reserved and no longer used.',
  },
  {
    id: 's307', category: 'status', name: '307', label: 'Temporary Redirect', rfc: 'RFC 9110', section: '15.4.8',
    zh: '暫時轉向,而且方法與內文一律保留——POST 轉過去還是 POST。這是 302 想表達的意思的嚴格版。',
    en: 'Temporary redirect with the method and body preserved — a POST stays a POST. The strict version of what 302 was meant to say.',
    tags: ['redirect', '轉向'],
  },
  {
    id: 's308', category: 'status', name: '308', label: 'Permanent Redirect', rfc: 'RFC 9110', section: '15.4.9',
    zh: '永久轉向,方法保留。HSTS 與 API 版本搬遷用它比 301 安全。',
    en: 'Permanent redirect with the method preserved. Safer than 301 for HSTS and for moving an API.',
    flags: [HEURISTIC], tags: ['redirect', '轉向'],
  },

  // 4xx — RFC 9110 §15.5
  {
    id: 's400', category: 'status', name: '400', label: 'Bad Request', rfc: 'RFC 9110', section: '15.5.1',
    zh: '請求本身壞掉——語法錯、框架錯、路由錯。注意它不是「參數驗證失敗」的萬用答案,那通常是 422。',
    en: 'The request itself is malformed — syntax, framing, routing. It is not the catch-all for failed validation; that is usually 422.',
    tags: ['錯誤請求'],
  },
  {
    id: 's401', category: 'status', name: '401', label: 'Unauthorized', rfc: 'RFC 9110', section: '15.5.2',
    zh: '沒有通過認證,而且**必須**帶 WWW-Authenticate 說明怎麼認證。名字寫 Unauthorized,講的其實是 unauthenticated。',
    en: 'Not authenticated, and it MUST carry WWW-Authenticate saying how to authenticate. Despite the name, this is unauthenticated, not unauthorised.',
    tags: ['auth', 'www-authenticate', '認證'],
  },
  {
    id: 's402', category: 'status', name: '402', label: 'Payment Required', rfc: 'RFC 9110', section: '15.5.3',
    zh: '保留給付費機制,規範沒有定義細節。',
    en: 'Reserved for payment schemes; the spec defines no details.',
  },
  {
    id: 's403', category: 'status', name: '403', label: 'Forbidden', rfc: 'RFC 9110', section: '15.5.4',
    zh: '認證過了但沒有權限,或伺服器拒絕說明原因。不想透露資源存在與否時,404 比 403 安全。',
    en: 'Authenticated but not permitted, or the server refuses to explain. When the existence of the resource is itself sensitive, 404 leaks less.',
    tags: ['權限', 'authorization'],
  },
  {
    id: 's404', category: 'status', name: '404', label: 'Not Found', rfc: 'RFC 9110', section: '15.5.5',
    zh: '找不到,而且不說是暫時還是永久。確定永久消失、想讓快取與爬蟲知道,用 410。',
    en: 'Not found, with no statement about whether that is temporary. When it is permanently gone and caches and crawlers should know, use 410.',
    flags: [HEURISTIC], tags: ['找不到'],
  },
  {
    id: 's405', category: 'status', name: '405', label: 'Method Not Allowed', rfc: 'RFC 9110', section: '15.5.6',
    zh: '這個資源不接受這個方法。回應**必須**帶 Allow 列出它接受哪些。',
    en: 'The method is not supported on this resource. The response MUST include Allow listing what is.',
    flags: [HEURISTIC], tags: ['allow', '方法'],
  },
  {
    id: 's406', category: 'status', name: '406', label: 'Not Acceptable', rfc: 'RFC 9110', section: '15.5.7',
    zh: '沒有任何表示法符合請求的 Accept 系列標頭。實務上多數伺服器寧可回一個預設格式,也不回 406。',
    en: 'No representation matches the Accept-family headers. In practice most servers return a default rather than a 406.',
    tags: ['accept', '內容協商', 'content negotiation'],
  },
  {
    id: 's407', category: 'status', name: '407', label: 'Proxy Authentication Required', rfc: 'RFC 9110', section: '15.5.8',
    zh: '代理要求認證,要帶 Proxy-Authenticate。這是代理發的,不是來源伺服器。',
    en: 'The proxy demands authentication and sends Proxy-Authenticate. It comes from the proxy, not the origin.',
    tags: ['proxy', '代理'],
  },
  {
    id: 's408', category: 'status', name: '408', label: 'Request Timeout', rfc: 'RFC 9110', section: '15.5.9',
    zh: '客戶端拖太久沒把請求送完,伺服器收工。通常會跟著關連線。',
    en: 'The client took too long to finish sending; the server gave up. Usually accompanied by closing the connection.',
    tags: ['timeout', '逾時'],
  },
  {
    id: 's409', category: 'status', name: '409', label: 'Conflict', rfc: 'RFC 9110', section: '15.5.10',
    zh: '與資源目前的狀態衝突,例如編輯衝突或唯一鍵重複。回應應該說清楚衝突在哪,讓客戶端有辦法處理。',
    en: 'Conflicts with the resource’s current state — an edit conflict, a duplicate key. The body should say what conflicts so the client can act.',
    tags: ['衝突', 'conflict'],
  },
  {
    id: 's410', category: 'status', name: '410', label: 'Gone', rfc: 'RFC 9110', section: '15.5.11',
    zh: '曾經存在,已經永久移除,而且是刻意這樣講的。搜尋引擎會比 404 更快放棄這個 URL。',
    en: 'It existed, it is permanently gone, and that is being said on purpose. Search engines drop the URL faster than for a 404.',
    flags: [HEURISTIC], tags: ['刪除', 'deleted'],
  },
  {
    id: 's411', category: 'status', name: '411', label: 'Length Required', rfc: 'RFC 9110', section: '15.5.12',
    zh: '伺服器不接受沒有 Content-Length 的請求。',
    en: 'The server refuses a request with no Content-Length.',
    tags: ['content-length'],
  },
  {
    id: 's412', category: 'status', name: '412', label: 'Precondition Failed', rfc: 'RFC 9110', section: '15.5.13',
    zh: 'If-Match / If-Unmodified-Since 這類前置條件不成立,所以什麼都沒做。樂觀鎖失敗就是這個。',
    en: 'A precondition such as If-Match or If-Unmodified-Since did not hold, so nothing was done. This is a failed optimistic lock.',
    tags: ['if-match', 'etag', 'conditional', '樂觀鎖'],
  },
  {
    id: 's413', category: 'status', name: '413', label: 'Content Too Large', rfc: 'RFC 9110', section: '15.5.14',
    zh: '內文超過伺服器願意處理的大小。RFC 9110 之前叫 Payload Too Large,再更早叫 Request Entity Too Large。',
    en: 'The body is larger than the server will process. Called Payload Too Large before RFC 9110, and Request Entity Too Large before that.',
    tags: ['payload too large', 'request entity too large', '太大', 'upload'],
  },
  {
    id: 's414', category: 'status', name: '414', label: 'URI Too Long', rfc: 'RFC 9110', section: '15.5.15',
    zh: 'URI 太長。多半是把該用 POST 的查詢塞進 query string。',
    en: 'The URI is too long. Usually a query that should have been a POST body.',
    flags: [HEURISTIC], tags: ['uri', 'query string'],
  },
  {
    id: 's415', category: 'status', name: '415', label: 'Unsupported Media Type', rfc: 'RFC 9110', section: '15.5.16',
    zh: '不支援請求的 Content-Type(或 Content-Encoding)。忘記寫 application/json 最常撞到這個。',
    en: 'The request’s Content-Type (or Content-Encoding) is not supported. Most often a missing application/json.',
    tags: ['content-type', 'media type', 'mime'],
  },
  {
    id: 's416', category: 'status', name: '416', label: 'Range Not Satisfiable', rfc: 'RFC 9110', section: '15.5.17',
    zh: 'Range 要的範圍超出資源長度。回應要帶 Content-Range: bytes */長度。',
    en: 'The requested range lies outside the resource. The response should carry Content-Range: bytes */length.',
    tags: ['range', 'content-range'],
  },
  {
    id: 's417', category: 'status', name: '417', label: 'Expectation Failed', rfc: 'RFC 9110', section: '15.5.18',
    zh: '達不到 Expect 標頭的要求。實務上只會看到對 Expect: 100-continue 的拒絕。',
    en: 'The Expect header cannot be met. In practice only ever a refusal of Expect: 100-continue.',
    tags: ['expect'],
  },
  {
    id: 's418', category: 'status', name: '418', label: '(Unused)', rfc: 'RFC 9110', section: '15.5.19',
    zh: 'RFC 9110 把 418 標為保留不用,理由是 RFC 2324 那個愚人節笑話(I\'m a Teapot)已經被廣泛實作,不能再拿去做別的事。它不在 IANA 狀態碼註冊表裡。',
    en: 'RFC 9110 reserves 418 precisely because the RFC 2324 April Fools joke (I’m a Teapot) was widely implemented and the number cannot be reused. It is not in the IANA status registry.',
    tags: ['teapot', '茶壺', 'rfc 2324'],
  },
  {
    id: 's421', category: 'status', name: '421', label: 'Misdirected Request', rfc: 'RFC 9110', section: '15.5.20',
    zh: '這條連線不該用來問這個 authority。HTTP/2 連線重用把請求送到錯的虛擬主機時會看到。',
    en: 'This connection is not authoritative for the requested authority. Seen when HTTP/2 connection coalescing sends a request to the wrong vhost.',
    tags: ['http/2', 'authority', 'sni'],
  },
  {
    id: 's422', category: 'status', name: '422', label: 'Unprocessable Content', rfc: 'RFC 9110', section: '15.5.21',
    zh: '語法沒問題,但語意上處理不了——典型的欄位驗證失敗。RFC 9110 之前叫 Unprocessable Entity(RFC 4918)。',
    en: 'Syntactically fine but semantically unprocessable — the typical field-validation failure. Called Unprocessable Entity before RFC 9110 (RFC 4918).',
    tags: ['unprocessable entity', 'validation', '驗證'],
  },
  {
    id: 's423', category: 'status', name: '423', label: 'Locked', rfc: 'RFC 4918',
    zh: 'WebDAV:目標資源被鎖住。',
    en: 'WebDAV: the target resource is locked.',
    tags: ['webdav', 'lock'],
  },
  {
    id: 's424', category: 'status', name: '424', label: 'Failed Dependency', rfc: 'RFC 4918',
    zh: 'WebDAV:這個動作依賴的另一個動作失敗了,所以它也沒做。',
    en: 'WebDAV: the action depended on another action that failed, so it was not attempted.',
    tags: ['webdav'],
  },
  {
    id: 's425', category: 'status', name: '425', label: 'Too Early', rfc: 'RFC 8470',
    zh: '伺服器不願意處理在 TLS early data(0-RTT)裡送來的請求,因為那可能被重放。客戶端應該在交握完成後重送。',
    en: 'The server will not process a request sent in TLS early data (0-RTT), which could be replayed. The client should retry after the handshake.',
    tags: ['tls', '0-rtt', 'early data', 'replay'],
  },
  {
    id: 's426', category: 'status', name: '426', label: 'Upgrade Required', rfc: 'RFC 9110', section: '15.5.22',
    zh: '要換協定才肯服務,回應必須帶 Upgrade 說明換成什麼。',
    en: 'The server refuses to serve on this protocol; the response must name the alternative in Upgrade.',
    tags: ['upgrade'],
  },
  {
    id: 's428', category: 'status', name: '428', label: 'Precondition Required', rfc: 'RFC 6585',
    zh: '伺服器要求這個請求必須是條件式的,用來擋掉「先讀後寫」之間插入別人修改的遺失更新問題。',
    en: 'The server requires the request to be conditional, closing the lost-update window between a read and a write.',
    tags: ['if-match', 'lost update', '條件式'],
  },
  {
    id: 's429', category: 'status', name: '429', label: 'Too Many Requests', rfc: 'RFC 6585',
    zh: '超過速率限制。應該帶 Retry-After 告訴客戶端什麼時候可以再來,不然客戶端只能亂猜。',
    en: 'Rate limit exceeded. Send Retry-After, or the client can only guess when to come back.',
    tags: ['rate limit', 'retry-after', '限流'],
  },
  {
    id: 's431', category: 'status', name: '431', label: 'Request Header Fields Too Large', rfc: 'RFC 6585',
    zh: '請求標頭太大。通常是 Cookie 累積到超過伺服器的上限。',
    en: 'The request headers are too large. Usually a Cookie that has grown past the server’s limit.',
    tags: ['cookie', 'header'],
  },
  {
    id: 's451', category: 'status', name: '451', label: 'Unavailable For Legal Reasons', rfc: 'RFC 7725',
    zh: '因為法律要求而擋下。回應應該用 Link 標頭指向下令的主體,rel="blocked-by"。',
    en: 'Blocked for legal reasons. The response should identify the blocking authority with a Link header, rel="blocked-by".',
    tags: ['legal', '法律', 'censorship'],
  },

  // 5xx — RFC 9110 §15.6
  {
    id: 's500', category: 'status', name: '500', label: 'Internal Server Error', rfc: 'RFC 9110', section: '15.6.1',
    zh: '伺服器自己爆了,而且沒有更具體的說法。任何未捕捉的例外最後都是這個。',
    en: 'The server failed and has nothing more specific to say. Every uncaught exception ends up here.',
  },
  {
    id: 's501', category: 'status', name: '501', label: 'Not Implemented', rfc: 'RFC 9110', section: '15.6.2',
    zh: '伺服器不支援這個方法,而且是對任何資源都不支援。只對這個資源不支援請用 405。',
    en: 'The server does not support the method at all, for any resource. For one resource only, use 405.',
    flags: [HEURISTIC],
  },
  {
    id: 's502', category: 'status', name: '502', label: 'Bad Gateway', rfc: 'RFC 9110', section: '15.6.3',
    zh: '當閘道的這台從上游拿到不合法的回應。看到它要去查上游,不是查這台。',
    en: 'A gateway got an invalid response from upstream. Debug the upstream, not the gateway.',
    tags: ['gateway', 'proxy', 'upstream', '上游'],
  },
  {
    id: 's503', category: 'status', name: '503', label: 'Service Unavailable', rfc: 'RFC 9110', section: '15.6.4',
    zh: '暫時不能服務——過載或維護中。帶 Retry-After 就能讓客戶端與爬蟲乖乖等,不帶的話它們會一直重試。',
    en: 'Temporarily unable to serve — overload or maintenance. Retry-After makes clients and crawlers wait; without it they keep hammering.',
    tags: ['retry-after', 'maintenance', '維護', '過載'],
  },
  {
    id: 's504', category: 'status', name: '504', label: 'Gateway Timeout', rfc: 'RFC 9110', section: '15.6.5',
    zh: '當閘道的這台等上游等到逾時。跟 502 一樣,問題在上游。',
    en: 'A gateway timed out waiting for upstream. Like 502, the problem is upstream.',
    tags: ['gateway', 'timeout', '逾時'],
  },
  {
    id: 's505', category: 'status', name: '505', label: 'HTTP Version Not Supported', rfc: 'RFC 9110', section: '15.6.6',
    zh: '不支援請求用的 HTTP 主版本。',
    en: 'The request’s major HTTP version is not supported.',
  },
  {
    id: 's506', category: 'status', name: '506', label: 'Variant Also Negotiates', rfc: 'RFC 2295',
    zh: '透明內容協商設定錯了:被選到的變體自己又是個協商端點。實驗性規範。',
    en: 'A transparent content negotiation misconfiguration: the chosen variant is itself a negotiating endpoint. Experimental.',
    tags: ['content negotiation'],
  },
  {
    id: 's507', category: 'status', name: '507', label: 'Insufficient Storage', rfc: 'RFC 4918',
    zh: 'WebDAV:空間不夠,做不完這個請求。',
    en: 'WebDAV: not enough space to complete the request.',
    tags: ['webdav'],
  },
  {
    id: 's508', category: 'status', name: '508', label: 'Loop Detected', rfc: 'RFC 5842',
    zh: 'WebDAV:處理過程中偵測到無限迴圈。',
    en: 'WebDAV: an infinite loop was detected while processing.',
    tags: ['webdav'],
  },
  {
    id: 's510', category: 'status', name: '510', label: 'Not Extended', rfc: 'RFC 2774', deprecated: true,
    zh: '來自已廢止的 HTTP Extension Framework。不要用。',
    en: 'From the obsolete HTTP Extension Framework. Do not use.',
  },
  {
    id: 's511', category: 'status', name: '511', label: 'Network Authentication Required', rfc: 'RFC 6585',
    zh: '要先登入這個網路才能上網——公共 Wi-Fi 的 captive portal 應該回這個,而不是假裝成 200 或轉向。',
    en: 'You must authenticate to the network first. A captive portal should answer with this rather than faking a 200 or a redirect.',
    tags: ['captive portal', 'wifi', '網路認證'],
  },
];

/* ── Methods ──────────────────────────────── */

const SAFE = 'safe';
const IDEMPOTENT = 'idempotent';
const CACHEABLE = 'cacheable';
const BODY_OK = 'request body defined';

const METHODS: readonly Entry[] = [
  {
    id: 'm-get', category: 'method', name: 'GET', rfc: 'RFC 9110', section: '9.3.1',
    zh: '取得資源的目前表示法。安全、等冪、可快取。GET 不該有副作用,而且帶內文的 GET 沒有定義的意義,中間的代理可能直接丟掉。',
    en: 'Retrieve the current representation. Safe, idempotent, cacheable. A GET should have no side effects, and a body on a GET has no defined meaning — intermediaries may drop it.',
    flags: [SAFE, IDEMPOTENT, CACHEABLE], tags: ['讀取'],
  },
  {
    id: 'm-head', category: 'method', name: 'HEAD', rfc: 'RFC 9110', section: '9.3.2',
    zh: '跟 GET 一樣,但不回內文。標頭必須跟 GET 會給的一致,所以可以拿來問大小與 ETag。',
    en: 'Identical to GET but with no body. The headers must match what GET would send, so it can be used to ask for size and ETag.',
    flags: [SAFE, IDEMPOTENT, CACHEABLE],
  },
  {
    id: 'm-post', category: 'method', name: 'POST', rfc: 'RFC 9110', section: '9.3.3',
    zh: '把內文交給資源處理,由資源自己決定意義。不安全、不等冪。只有在明確給了新鮮度資訊時才可快取,實務上等於不可快取。',
    en: 'Hand the body to the resource to process as it sees fit. Neither safe nor idempotent. Cacheable only with explicit freshness information, which in practice means not cacheable.',
    flags: [BODY_OK], tags: ['新增', 'create'],
  },
  {
    id: 'm-put', category: 'method', name: 'PUT', rfc: 'RFC 9110', section: '9.3.4',
    zh: '用內文整份取代目標資源。等冪:送兩次跟送一次的結果一樣。局部更新請用 PATCH。',
    en: 'Replace the target resource entirely with the body. Idempotent: sending it twice leaves the same state. For partial updates use PATCH.',
    flags: [IDEMPOTENT, BODY_OK], tags: ['取代', 'replace'],
  },
  {
    id: 'm-delete', category: 'method', name: 'DELETE', rfc: 'RFC 9110', section: '9.3.5',
    zh: '移除目標資源。等冪——第二次回 404 或 204 都不違反等冪,等冪講的是狀態,不是回應。',
    en: 'Remove the target resource. Idempotent — a second call answering 404 or 204 does not break that, because idempotence is about state, not the response.',
    flags: [IDEMPOTENT], tags: ['刪除'],
  },
  {
    id: 'm-connect', category: 'method', name: 'CONNECT', rfc: 'RFC 9110', section: '9.3.6',
    zh: '請代理建立一條到目標的隧道。HTTPS 走 HTTP 代理就是靠它。',
    en: 'Ask a proxy to open a tunnel to the target. This is how HTTPS traverses an HTTP proxy.',
    tags: ['proxy', 'tunnel', '隧道'],
  },
  {
    id: 'm-options', category: 'method', name: 'OPTIONS', rfc: 'RFC 9110', section: '9.3.7',
    zh: '問這個資源支援什麼。CORS preflight 用的就是 OPTIONS,回應要帶 Allow 或 Access-Control-Allow-* 系列。',
    en: 'Ask what the resource supports. The CORS preflight is an OPTIONS; the response carries Allow or the Access-Control-Allow-* headers.',
    flags: [SAFE, IDEMPOTENT], tags: ['cors', 'preflight'],
  },
  {
    id: 'm-trace', category: 'method', name: 'TRACE', rfc: 'RFC 9110', section: '9.3.8',
    zh: '把收到的請求原封回送,用來看中間經過了什麼。因為會回送 Cookie 等敏感標頭,多數伺服器預設關閉。',
    en: 'Echo the received request back, to see what intermediaries did. Most servers disable it because it reflects sensitive headers such as Cookie.',
    flags: [SAFE, IDEMPOTENT], tags: ['max-forwards'],
  },
  {
    id: 'm-patch', category: 'method', name: 'PATCH', rfc: 'RFC 5789',
    zh: '套用一份「差異」到資源上。不等冪(除非 patch 格式自己保證),而且 Content-Type 決定 patch 的格式,例如 application/merge-patch+json(RFC 7396)。',
    en: 'Apply a set of changes to the resource. Not idempotent unless the patch format guarantees it, and the Content-Type decides the patch format — for example application/merge-patch+json (RFC 7396).',
    flags: [BODY_OK], tags: ['merge-patch', 'json patch', '局部更新'],
  },
];

/* ── Request headers ──────────────────────── */

const REQUEST: readonly Entry[] = [
  {
    id: 'q-accept', category: 'request', name: 'Accept', rfc: 'RFC 9110', section: '12.5.1',
    zh: '客戶端接受哪些媒體類型,用 q= 給權重。q 的預設是 1,q=0 表示「明確不要」。',
    en: 'Which media types the client accepts, weighted with q=. The default q is 1, and q=0 means “explicitly not this”.',
    tags: ['content negotiation', '內容協商', 'q'],
  },
  {
    id: 'q-accept-encoding', category: 'request', name: 'Accept-Encoding', rfc: 'RFC 9110', section: '12.5.3',
    zh: '可以接受的內容編碼:gzip、br、zstd、identity。回應會用 Content-Encoding 回報實際用了哪個,並且應該 Vary: Accept-Encoding。',
    en: 'Acceptable content codings: gzip, br, zstd, identity. The response reports the choice in Content-Encoding and should Vary: Accept-Encoding.',
    tags: ['gzip', 'brotli', 'zstd', '壓縮', 'vary'],
  },
  {
    id: 'q-accept-language', category: 'request', name: 'Accept-Language', rfc: 'RFC 9110', section: '12.5.4',
    zh: '偏好的語言標籤(BCP 47),一樣用 q= 排序。拿它做語言判斷要記得 Vary: Accept-Language,否則快取會把別人的語言餵給你。',
    en: 'Preferred language tags (BCP 47), ordered with q=. If it drives the response, Vary: Accept-Language, or a cache will serve one visitor’s language to another.',
    tags: ['bcp 47', 'i18n', '語言', 'vary'],
  },
  {
    id: 'q-accept-charset', category: 'request', name: 'Accept-Charset', rfc: 'RFC 9110', section: '12.5.2', deprecated: true,
    zh: '已廢棄。RFC 9110 要求伺服器忽略它,字元集現在由 Content-Type 的 charset 參數決定。',
    en: 'Deprecated; RFC 9110 tells servers to ignore it. Character encoding is decided by the Content-Type charset parameter.',
    tags: ['charset'],
  },
  {
    id: 'q-authorization', category: 'request', name: 'Authorization', rfc: 'RFC 9110', section: '11.6.2',
    zh: '認證憑證,格式是 `scheme 參數`(Basic、Bearer、Digest)。共用快取預設不會儲存帶這個標頭的請求的回應。',
    en: 'Credentials, as `scheme parameters` (Basic, Bearer, Digest). Shared caches will not store responses to requests carrying it unless told to.',
    tags: ['bearer', 'basic', 'jwt', '認證', 'token'],
  },
  {
    id: 'q-connection', category: 'request', name: 'Connection', rfc: 'RFC 9110', section: '7.6.1',
    zh: '列出只對這一跳有效的標頭,以及 close/keep-alive。HTTP/2 與 HTTP/3 禁止這個標頭。',
    en: 'Lists hop-by-hop header names, plus close/keep-alive. Forbidden in HTTP/2 and HTTP/3.',
    tags: ['keep-alive', 'hop-by-hop'],
  },
  {
    id: 'q-content-length-req', category: 'request', name: 'Content-Length', rfc: 'RFC 9110', section: '8.6',
    zh: '內文的八位元組長度。跟 Transfer-Encoding: chunked 同時出現是請求走私的經典手法,所以代理必須挑一個並拒絕另一個。',
    en: 'The body length in octets. Sending it together with Transfer-Encoding: chunked is the classic request-smuggling vector, so proxies must pick one and reject the other.',
    tags: ['smuggling', 'chunked', '長度'],
  },
  {
    id: 'q-content-type-req', category: 'request', name: 'Content-Type', rfc: 'RFC 9110', section: '8.3',
    zh: '內文的媒體類型與參數(charset、boundary)。不對就是 415。',
    en: 'The body’s media type and parameters (charset, boundary). Wrong value, 415.',
    tags: ['mime', 'charset', 'boundary'],
  },
  {
    id: 'q-cookie', category: 'request', name: 'Cookie', rfc: 'RFC 6265', section: '4.2',
    zh: '把先前 Set-Cookie 存下來的名值對送回去,用 `; ` 分隔。它不帶 Path、Domain 等屬性,伺服器看不到 cookie 是哪個範圍來的。',
    en: 'Sends back the name/value pairs stored from Set-Cookie, separated by `; `. It carries no attributes, so the server cannot tell which scope a cookie came from.',
    tags: ['set-cookie', 'session'],
  },
  {
    id: 'q-expect', category: 'request', name: 'Expect', rfc: 'RFC 9110', section: '10.1.1',
    zh: '唯一定義的值是 100-continue:先問伺服器願不願意收內文,再決定要不要上傳。不願意就是 417。',
    en: 'The only defined value is 100-continue: ask whether the body is welcome before uploading it. A refusal is 417.',
    tags: ['100-continue'],
  },
  {
    id: 'q-forwarded', category: 'request', name: 'Forwarded', rfc: 'RFC 7239',
    zh: '代理記錄原始的 for / by / host / proto,取代 X-Forwarded-* 那組從來沒有標準化的標頭。任何一個都可以被偽造,只有你自己控制的那一跳寫的值才可信。',
    en: 'A proxy records the original for / by / host / proto, standardising what X-Forwarded-* never did. All of them are forgeable; only the hop you control can be trusted.',
    tags: ['x-forwarded-for', 'proxy', '代理', 'client ip'],
  },
  {
    id: 'q-from', category: 'request', name: 'From', rfc: 'RFC 9110', section: '10.1.2',
    zh: '發出請求的人的電子郵件。給爬蟲標示聯絡方式用,不是認證。',
    en: 'An email address for whoever is responsible for the request. For crawlers to identify themselves; not authentication.',
    tags: ['crawler', 'bot'],
  },
  {
    id: 'q-host', category: 'request', name: 'Host', rfc: 'RFC 9110', section: '7.2',
    zh: 'HTTP/1.1 必填,指出目標的 authority,虛擬主機靠它分流。HTTP/2 與 HTTP/3 用 :authority 這個 pseudo-header 代替。',
    en: 'Mandatory in HTTP/1.1; names the target authority, which is how virtual hosting works. HTTP/2 and HTTP/3 use the :authority pseudo-header instead.',
    tags: ['authority', 'vhost', 'virtual host', ':authority'],
  },
  {
    id: 'q-if-match', category: 'request', name: 'If-Match', rfc: 'RFC 9110', section: '13.1.1',
    zh: '只有 ETag 相符才執行,否則回 412。寫入前的樂觀鎖用這個,不要用 If-Unmodified-Since:秒級時間解析度擋不住同一秒內的兩次修改。',
    en: 'Proceed only if the ETag matches, otherwise 412. This is the optimistic lock for writes; If-Unmodified-Since cannot substitute, because one-second resolution misses two edits in the same second.',
    tags: ['etag', 'conditional', '樂觀鎖', '412'],
  },
  {
    id: 'q-if-none-match', category: 'request', name: 'If-None-Match', rfc: 'RFC 9110', section: '13.1.2',
    zh: '只有 ETag 不相符才執行。GET 用它做快取驗證(相符就回 304);寫入時用 If-None-Match: * 表示「只在資源還不存在時才建立」。',
    en: 'Proceed only if the ETag does not match. On GET it revalidates a cache (a match answers 304); on a write, If-None-Match: * means “only create if it does not exist yet”.',
    tags: ['etag', '304', 'conditional', '快取驗證'],
  },
  {
    id: 'q-if-modified-since', category: 'request', name: 'If-Modified-Since', rfc: 'RFC 9110', section: '13.1.3',
    zh: '只有在這個時間之後改過才回內容,否則 304。只對 GET 與 HEAD 有意義,而且優先度低於 If-None-Match。',
    en: 'Send content only if modified since this date, otherwise 304. Meaningful only for GET and HEAD, and outranked by If-None-Match.',
    tags: ['last-modified', '304', 'conditional'],
  },
  {
    id: 'q-if-unmodified-since', category: 'request', name: 'If-Unmodified-Since', rfc: 'RFC 9110', section: '13.1.4',
    zh: '只有在這個時間之後沒改過才執行,否則 412。解析度是秒,所以不如 If-Match 可靠。',
    en: 'Proceed only if unmodified since this date, otherwise 412. Its resolution is one second, which makes it weaker than If-Match.',
    tags: ['conditional', '412'],
  },
  {
    id: 'q-if-range', category: 'request', name: 'If-Range', rfc: 'RFC 9110', section: '13.1.5',
    zh: '搭配 Range 用:驗證子還相符就給那一段(206),不相符就整份重給(200)。續傳到一半檔案被換掉時,它是唯一能避免拼出壞檔的機制。',
    en: 'Used with Range: if the validator still matches, send the range (206); if not, send the whole thing (200). It is the only thing stopping a resumed download from stitching together two different files.',
    tags: ['range', '206', 'resume', '續傳'],
  },
  {
    id: 'q-max-forwards', category: 'request', name: 'Max-Forwards', rfc: 'RFC 9110', section: '7.6.2',
    zh: '限制 TRACE 與 OPTIONS 可以被轉送幾次,用來定位中間節點。',
    en: 'Limits how many times a TRACE or OPTIONS may be forwarded, for locating intermediaries.',
    tags: ['trace', 'options'],
  },
  {
    id: 'q-origin', category: 'request', name: 'Origin', rfc: 'RFC 6454', section: '7',
    zh: '發起請求的來源(scheme + host + port),不含路徑。CORS 與 CSRF 判斷都看它;隱私考量下有時會是 `null`,所以不要把 null 當成「同源」。',
    en: 'The initiating origin — scheme, host, port, no path. Both CORS and CSRF checks read it. It can legitimately be `null` for privacy reasons, so never treat null as same-origin.',
    tags: ['cors', 'csrf', '跨域'],
  },
  {
    id: 'q-priority', category: 'request', name: 'Priority', rfc: 'RFC 9218',
    zh: '用 u=(緊急程度 0–7)與 i(是否可增量渲染)表達傳輸優先度,取代 HTTP/2 原本那套樹狀優先度。',
    en: 'Expresses transfer priority with u= (urgency 0–7) and i (incremental). It replaces HTTP/2’s original priority tree.',
    tags: ['http/2', 'http/3', '優先度'],
  },
  {
    id: 'q-proxy-authorization', category: 'request', name: 'Proxy-Authorization', rfc: 'RFC 9110', section: '11.7.2',
    zh: '給代理看的憑證,回應 407 時用。它只對下一跳有效,不會被轉送。',
    en: 'Credentials for the proxy, in answer to a 407. It applies to the next hop only and is not forwarded.',
    tags: ['proxy', '407'],
  },
  {
    id: 'q-range', category: 'request', name: 'Range', rfc: 'RFC 9110', section: '14.2',
    zh: '要資源的哪幾段,例如 `bytes=0-1023` 或 `bytes=-500`(最後 500 位元組)。成功是 206,超出範圍是 416。',
    en: 'Which parts of the resource to send, e.g. `bytes=0-1023` or `bytes=-500` (the last 500 octets). Success is 206; out of range is 416.',
    tags: ['206', '416', 'bytes', '續傳'],
  },
  {
    id: 'q-referer', category: 'request', name: 'Referer', rfc: 'RFC 9110', section: '10.1.3',
    zh: '前一頁的 URI。拼字從第一版就錯了(少一個 r),改不動了。會外洩路徑與 query,用 Referrer-Policy 控制送多少。',
    en: 'The URI of the referring page. The spelling has been wrong (one r short) since the first version and cannot be fixed. It leaks paths and queries; Referrer-Policy controls how much is sent.',
    tags: ['referrer', 'referrer-policy', '來源頁'],
  },
  {
    id: 'q-te', category: 'request', name: 'TE', rfc: 'RFC 9110', section: '10.1.4',
    zh: '可以接受哪些傳輸編碼,以及願不願意收 trailer(`TE: trailers`)。gRPC 靠後者。',
    en: 'Which transfer codings are acceptable, and whether trailers are welcome (`TE: trailers`). gRPC relies on the latter.',
    tags: ['trailer', 'chunked', 'grpc'],
  },
  {
    id: 'q-upgrade', category: 'request', name: 'Upgrade', rfc: 'RFC 9110', section: '7.8',
    zh: '請求換到別的協定,伺服器同意就回 101。HTTP/2 之後不再用這個機制升級 HTTP 版本。',
    en: 'Asks to switch protocols; agreement is a 101. It is no longer the way HTTP versions are upgraded after HTTP/2.',
    tags: ['websocket', '101'],
  },
  {
    id: 'q-user-agent', category: 'request', name: 'User-Agent', rfc: 'RFC 9110', section: '10.1.5',
    zh: '客戶端自報的軟體資訊。三十年的相容性造假讓它幾乎無法解析,拿它做功能判斷是錯的做法。',
    en: 'The client’s self-description. Thirty years of compatibility lies make it nearly unparseable; feature detection should never depend on it.',
    tags: ['ua', 'browser', '瀏覽器'],
  },
  {
    id: 'q-via', category: 'request', name: 'Via', rfc: 'RFC 9110', section: '7.6.3',
    zh: '每一個轉送這個訊息的代理都要往上加一筆,用來追路徑與抓迴圈。請求與回應都有。',
    en: 'Every forwarding intermediary appends an entry, for tracing the path and detecting loops. Present on requests and responses.',
    tags: ['proxy', '代理', 'loop'],
  },
];

/* ── Response headers ─────────────────────── */

const RESPONSE: readonly Entry[] = [
  {
    id: 'r-accept-ranges', category: 'response', name: 'Accept-Ranges', rfc: 'RFC 9110', section: '14.3',
    zh: '宣告支援哪種範圍單位,實務上只有 `bytes`。`none` 表示不支援續傳。',
    en: 'Declares the supported range unit; in practice only `bytes`. `none` means ranges are not supported.',
    tags: ['range', '續傳'],
  },
  {
    id: 'r-age', category: 'response', name: 'Age', rfc: 'RFC 9111', section: '5.1',
    zh: '這份回應在快取裡待了幾秒。看到非 0 就知道是快取給的,而不是來源伺服器。',
    en: 'How many seconds this response has been in a cache. A non-zero value means it came from a cache, not the origin.',
    tags: ['快取', 'cache', 'cdn'],
  },
  {
    id: 'r-allow', category: 'response', name: 'Allow', rfc: 'RFC 9110', section: '10.2.1',
    zh: '這個資源支援哪些方法。回 405 時必須帶;空值表示完全不接受任何方法。',
    en: 'Which methods the resource supports. Required with a 405; an empty value means no method is allowed at all.',
    tags: ['405', 'options', '方法'],
  },
  {
    id: 'r-cache-control-res', category: 'response', name: 'Cache-Control', rfc: 'RFC 9111', section: '5.2',
    zh: '快取指令。請求與回應各有自己的一組指令,見下面的 Cache-Control 分類。',
    en: 'Cache directives. Requests and responses have separate sets — see the Cache-Control category below.',
    tags: ['快取', 'max-age', 'no-store'],
  },
  {
    id: 'r-content-disposition', category: 'response', name: 'Content-Disposition', rfc: 'RFC 6266',
    zh: '`inline` 直接顯示,`attachment` 觸發下載。非 ASCII 檔名要用 filename*=UTF-8\'\'…(RFC 5987 的編碼),不是直接塞 UTF-8 位元組。',
    en: '`inline` displays, `attachment` downloads. A non-ASCII filename needs filename*=UTF-8\'\'… (the RFC 5987 encoding), not raw UTF-8 bytes.',
    tags: ['download', 'attachment', 'filename', '下載', '檔名'],
  },
  {
    id: 'r-content-encoding', category: 'response', name: 'Content-Encoding', rfc: 'RFC 9110', section: '8.4',
    zh: '內文套了哪些編碼(gzip、br、zstd)。它是資源本身的一部分,所以 ETag 要跟著不同——這跟 Transfer-Encoding 是逐跳的不一樣。',
    en: 'Which codings were applied to the content (gzip, br, zstd). It is part of the representation, so the ETag must differ — unlike Transfer-Encoding, which is hop-by-hop.',
    tags: ['gzip', 'brotli', '壓縮', 'etag'],
  },
  {
    id: 'r-content-language', category: 'response', name: 'Content-Language', rfc: 'RFC 9110', section: '8.5',
    zh: '這份表示法是給哪些語言的讀者看的。它不是「內文用什麼語言寫」,一份雙語文件可以列兩個。',
    en: 'The audience this representation is intended for, not the language the text is written in — a bilingual document may list two.',
    tags: ['i18n', '語言', 'bcp 47'],
  },
  {
    id: 'r-content-length', category: 'response', name: 'Content-Length', rfc: 'RFC 9110', section: '8.6',
    zh: '內文長度。204 與 304 不可以帶內文,HEAD 的回應可以帶這個標頭來報大小但沒有內文。',
    en: 'The body length. 204 and 304 carry no body; a HEAD response may state the length it would have sent.',
    tags: ['長度', 'head'],
  },
  {
    id: 'r-content-location', category: 'response', name: 'Content-Location', rfc: 'RFC 9110', section: '8.7',
    zh: '這份特定表示法的位址。它不是轉向——Location 是轉向,Content-Location 只是說「你拿到的這份東西也能從這裡拿」。',
    en: 'Where this specific representation lives. It is not a redirect — Location redirects; Content-Location only says the payload is also available there.',
    tags: ['location'],
  },
  {
    id: 'r-content-range', category: 'response', name: 'Content-Range', rfc: 'RFC 9110', section: '14.4',
    zh: '206 回應裡說明送的是哪一段與總長度,例如 `bytes 0-1023/146515`。416 時用 `bytes */146515`。',
    en: 'In a 206, states which part was sent and the total length, e.g. `bytes 0-1023/146515`. In a 416, `bytes */146515`.',
    tags: ['206', '416', 'range'],
  },
  {
    id: 'r-content-type', category: 'response', name: 'Content-Type', rfc: 'RFC 9110', section: '8.3',
    zh: '內文的媒體類型。搭配 X-Content-Type-Options: nosniff 才能阻止瀏覽器猜型別,否則上傳的文字檔可能被當成 HTML 執行。',
    en: 'The body’s media type. Pair it with X-Content-Type-Options: nosniff, or a browser may sniff an uploaded text file as HTML and run it.',
    tags: ['mime', 'nosniff', 'charset'],
  },
  {
    id: 'r-date', category: 'response', name: 'Date', rfc: 'RFC 9110', section: '6.6.1',
    zh: '訊息產生的時間,格式是 IMF-fixdate(GMT)。快取算新鮮度要靠它,所以伺服器時鐘歪掉會讓快取行為整體歪掉。',
    en: 'When the message was generated, as an IMF-fixdate in GMT. Cache freshness is computed from it, so a skewed server clock skews caching.',
    tags: ['imf-fixdate', 'gmt', '時間'],
  },
  {
    id: 'r-etag', category: 'response', name: 'ETag', rfc: 'RFC 9110', section: '8.8.3',
    zh: '這份表示法的識別碼。強驗證子代表位元組完全相同;`W/` 前綴是弱驗證子,只保證語意等價,不能用在 Range 的條件判斷上。',
    en: 'An identifier for this representation. A strong validator means byte-for-byte identical; the `W/` prefix is weak and only promises semantic equivalence, so it cannot validate a Range.',
    tags: ['if-none-match', 'weak', '304', '驗證子'],
  },
  {
    id: 'r-expires', category: 'response', name: 'Expires', rfc: 'RFC 9111', section: '5.3',
    zh: '過期的絕對時間。Cache-Control: max-age 存在時 max-age 優先。過去的日期或無法解析的值都當成「已過期」。',
    en: 'An absolute expiry date. Cache-Control: max-age wins when both are present. A past or unparseable date counts as already stale.',
    tags: ['快取', 'max-age'],
  },
  {
    id: 'r-last-modified', category: 'response', name: 'Last-Modified', rfc: 'RFC 9110', section: '8.8.2',
    zh: '最後修改時間,解析度只到秒。同一秒內的兩次修改分不出來,所以它是弱驗證子;要精確請用 ETag。',
    en: 'When it last changed, to one-second resolution. Two edits in the same second are indistinguishable, which makes it a weak validator; use an ETag when precision matters.',
    tags: ['if-modified-since', '304', '驗證子'],
  },
  {
    id: 'r-location', category: 'response', name: 'Location', rfc: 'RFC 9110', section: '10.2.2',
    zh: '3xx 的轉向目標,或 201 新建資源的位址。可以是相對參照,要以請求的 URI 為基準解析。',
    en: 'The redirect target for a 3xx, or the new resource for a 201. It may be a relative reference, resolved against the request URI.',
    tags: ['redirect', '301', '201', '轉向'],
  },
  {
    id: 'r-proxy-authenticate', category: 'response', name: 'Proxy-Authenticate', rfc: 'RFC 9110', section: '11.7.1',
    zh: '407 時代理用它宣告認證方式。只對這一跳有效。',
    en: 'How the proxy wants to be authenticated, sent with a 407. Applies to this hop only.',
    tags: ['407', 'proxy'],
  },
  {
    id: 'r-retry-after', category: 'response', name: 'Retry-After', rfc: 'RFC 9110', section: '10.2.3',
    zh: '多久之後可以再試,值是秒數或 HTTP 日期。503、429 與 301 都適用。沒給的話客戶端只能自己 backoff。',
    en: 'How long to wait before retrying, as seconds or an HTTP date. Applies to 503, 429 and 301. Without it, clients can only guess at a backoff.',
    tags: ['503', '429', '限流', 'backoff'],
  },
  {
    id: 'r-server', category: 'response', name: 'Server', rfc: 'RFC 9110', section: '10.2.4',
    zh: '伺服器軟體資訊。帶版本號等於免費告訴掃描器要試哪些漏洞,生產環境通常縮短或關掉。',
    en: 'The server software. Including a version number tells scanners which exploits to try, so production usually trims or removes it.',
    tags: ['指紋', 'fingerprint'],
  },
  {
    id: 'r-set-cookie', category: 'response', name: 'Set-Cookie', rfc: 'RFC 6265', section: '4.1',
    zh: '設一個 cookie。每個 cookie 要各自一行,不能用逗號合併。屬性裡 HttpOnly 擋 JavaScript 讀取、Secure 只走 HTTPS、SameSite 擋跨站帶送。',
    en: 'Sets one cookie. Each cookie needs its own header line; they cannot be comma-folded. HttpOnly keeps JavaScript out, Secure restricts it to HTTPS, SameSite limits cross-site sending.',
    tags: ['cookie', 'httponly', 'samesite', 'secure', 'session'],
  },
  {
    id: 'r-trailer', category: 'response', name: 'Trailer', rfc: 'RFC 9110',
    zh: '預告哪些標頭會出現在分塊內文之後的 trailer 區。只有客戶端送了 `TE: trailers` 才適合用。',
    en: 'Announces which fields will appear in the trailer section after a chunked body. Only appropriate when the client sent `TE: trailers`.',
    tags: ['chunked', 'te', 'grpc'],
  },
  {
    id: 'r-vary', category: 'response', name: 'Vary', rfc: 'RFC 9110', section: '12.5.5',
    zh: '這份回應的內容取決於哪些請求標頭,快取必須把它們納入鍵。漏掉它是快取污染最常見的原因——語言、壓縮、行動版切換都會中。',
    en: 'Which request headers the response depends on; a cache must key on them. Omitting it is the commonest cause of cache poisoning — language, compression and mobile variants all hit it.',
    tags: ['快取', 'cache key', '快取污染', 'accept-encoding'],
  },
  {
    id: 'r-via', category: 'response', name: 'Via', rfc: 'RFC 9110', section: '7.6.3',
    zh: '回應經過的每一個代理都會加一筆。看 CDN 命中狀況時常搭配 Age 一起讀。',
    en: 'Each intermediary the response passed through appends an entry. Read together with Age when checking CDN behaviour.',
    tags: ['proxy', 'cdn'],
  },
  {
    id: 'r-www-authenticate', category: 'response', name: 'WWW-Authenticate', rfc: 'RFC 9110', section: '11.6.1',
    zh: '401 時宣告可用的認證方式與 realm。401 少了它就不符合規範,因為客戶端無從得知要怎麼認證。',
    en: 'Declares the available authentication schemes and realm with a 401. A 401 without it is non-conformant: the client has no way to know how to authenticate.',
    tags: ['401', 'basic', 'bearer', '認證'],
  },
  {
    id: 'r-authentication-info', category: 'response', name: 'Authentication-Info', rfc: 'RFC 9110', section: '11.6.3',
    zh: '認證成功後回傳該方案的額外資訊(例如 Digest 的 nextnonce)。',
    en: 'Carries scheme-specific information after successful authentication, such as Digest’s nextnonce.',
    tags: ['digest', '認證'],
  },
];

/* ── Cache-Control ────────────────────────── */

const CACHE: readonly Entry[] = [
  {
    id: 'c-req-max-age', category: 'cache', name: 'max-age (request)', rfc: 'RFC 9111', section: '5.2.1.1',
    zh: '請求方向:我不要比這個秒數更舊的回應。',
    en: 'On a request: do not give me a response older than this many seconds.',
    tags: ['request'],
  },
  {
    id: 'c-req-max-stale', category: 'cache', name: 'max-stale', rfc: 'RFC 9111', section: '5.2.1.2',
    zh: '請求方向:過期的也可以,但不要超過這個秒數。不給數值表示多舊都收。',
    en: 'On a request: stale is acceptable, but by no more than this many seconds. With no value, any staleness will do.',
    tags: ['request', 'stale'],
  },
  {
    id: 'c-req-min-fresh', category: 'cache', name: 'min-fresh', rfc: 'RFC 9111', section: '5.2.1.3',
    zh: '請求方向:給我至少還能新鮮這麼多秒的回應。',
    en: 'On a request: the response must stay fresh for at least this many more seconds.',
    tags: ['request'],
  },
  {
    id: 'c-req-no-cache', category: 'cache', name: 'no-cache (request)', rfc: 'RFC 9111', section: '5.2.1.4',
    zh: '請求方向:先去源頭驗證,不要直接給我快取的。這是瀏覽器強制重新整理送的東西。',
    en: 'On a request: revalidate with the origin before serving. This is what a browser’s hard reload sends.',
    tags: ['request', '重新整理', 'reload'],
  },
  {
    id: 'c-req-no-store', category: 'cache', name: 'no-store (request)', rfc: 'RFC 9111', section: '5.2.1.5',
    zh: '請求方向:這個請求與它的回應都不要存。注意它不能清掉已經存在的快取。',
    en: 'On a request: store neither this request nor its response. It does not remove anything already stored.',
    tags: ['request', '隱私'],
  },
  {
    id: 'c-req-no-transform', category: 'cache', name: 'no-transform (request)', rfc: 'RFC 9111', section: '5.2.1.6',
    zh: '請求方向:中間人不得改寫內容(壓圖、轉檔都不行)。',
    en: 'On a request: intermediaries must not transform the content — no recompressing images, no transcoding.',
    tags: ['request', 'proxy'],
  },
  {
    id: 'c-req-only-if-cached', category: 'cache', name: 'only-if-cached', rfc: 'RFC 9111', section: '5.2.1.7',
    zh: '請求方向:只吃快取,沒有就回 504,不要去源頭。離線模式用它。',
    en: 'On a request: serve from cache or answer 504; do not go to the origin. This is how offline mode asks.',
    tags: ['request', 'offline', '離線', '504'],
  },
  {
    id: 'c-max-age', category: 'cache', name: 'max-age', rfc: 'RFC 9111', section: '5.2.2.1',
    zh: '回應方向:這份回應在幾秒內算新鮮。這是新鮮度的主要來源,優先於 Expires。',
    en: 'On a response: fresh for this many seconds. The primary freshness signal, and it outranks Expires.',
    tags: ['新鮮度', 'freshness'],
  },
  {
    id: 'c-must-revalidate', category: 'cache', name: 'must-revalidate', rfc: 'RFC 9111', section: '5.2.2.2',
    zh: '回應方向:過期之後一定要驗證過才能再用,就算連不到源頭也不可以給舊的(要回 504)。',
    en: 'On a response: once stale it must be revalidated, and may not be served stale even when the origin is unreachable (answer 504 instead).',
    tags: ['stale', '504'],
  },
  {
    id: 'c-must-understand', category: 'cache', name: 'must-understand', rfc: 'RFC 9111', section: '5.2.2.3',
    zh: '回應方向:只有看得懂這個狀態碼的快取需求的快取才可以存。要跟 no-store 一起送,讓不懂的快取退回去照 no-store 處理。',
    en: 'On a response: only a cache that understands the caching requirements of this status code may store it. Sent together with no-store so that caches which do not understand it fall back to not storing.',
    tags: ['no-store'],
  },
  {
    id: 'c-no-cache', category: 'cache', name: 'no-cache', rfc: 'RFC 9111', section: '5.2.2.4',
    zh: '回應方向:可以存,但每次用之前都要先驗證。名字騙人——不存是 no-store,不是 no-cache。',
    en: 'On a response: may be stored, but must be revalidated before every reuse. The name misleads: “do not store” is no-store, not no-cache.',
    tags: ['revalidate', '驗證'],
  },
  {
    id: 'c-no-store', category: 'cache', name: 'no-store', rfc: 'RFC 9111', section: '5.2.2.5',
    zh: '回應方向:任何快取都不得保存這份回應的任何部分。敏感資料用這個,不要用 no-cache。',
    en: 'On a response: no cache may store any part of this. This is the one for sensitive data, not no-cache.',
    tags: ['隱私', 'sensitive', 'private'],
  },
  {
    id: 'c-no-transform', category: 'cache', name: 'no-transform', rfc: 'RFC 9111', section: '5.2.2.6',
    zh: '回應方向:中間人不得改寫這份內容。',
    en: 'On a response: intermediaries must not transform the content.',
    tags: ['proxy'],
  },
  {
    id: 'c-private', category: 'cache', name: 'private', rfc: 'RFC 9111', section: '5.2.2.7',
    zh: '回應方向:只有單一使用者的私有快取(瀏覽器)可以存,共用快取(CDN、代理)不可以。帶登入狀態的頁面要有它。',
    en: 'On a response: only a single-user private cache (the browser) may store it; shared caches (CDNs, proxies) may not. Anything personalised needs it.',
    tags: ['cdn', '共用快取', 'shared cache'],
  },
  {
    id: 'c-proxy-revalidate', category: 'cache', name: 'proxy-revalidate', rfc: 'RFC 9111', section: '5.2.2.8',
    zh: '回應方向:等同 must-revalidate,但只約束共用快取。',
    en: 'On a response: the same as must-revalidate, but binding on shared caches only.',
    tags: ['shared cache'],
  },
  {
    id: 'c-public', category: 'cache', name: 'public', rfc: 'RFC 9111', section: '5.2.2.9',
    zh: '回應方向:即使有 Authorization 或狀態碼預設不可快取,也允許共用快取保存。用錯會把別人的私人資料放上 CDN。',
    en: 'On a response: a shared cache may store it even with Authorization present, or a status code that is not cacheable by default. Misused, it puts one user’s private data on a CDN.',
    tags: ['authorization', 'cdn', 'shared cache'],
  },
  {
    id: 'c-s-maxage', category: 'cache', name: 's-maxage', rfc: 'RFC 9111', section: '5.2.2.10',
    zh: '回應方向:只給共用快取的 max-age,會覆蓋 max-age。CDN 放久一點、瀏覽器放短一點就靠這一對。',
    en: 'On a response: a max-age for shared caches only, overriding max-age. This is the pair that keeps a CDN copy long and a browser copy short.',
    tags: ['cdn', 'shared cache', 'max-age'],
  },
  {
    id: 'c-immutable', category: 'cache', name: 'immutable', rfc: 'RFC 8246',
    zh: '擴充指令:在新鮮期內不要因為使用者按重新整理就去驗證。給內容雜湊過的檔名用(app.a1b2c3.js),因為那種檔案的內容永遠不會變。',
    en: 'An extension: do not revalidate while fresh, even on a user-initiated reload. For content-hashed filenames (app.a1b2c3.js), whose bytes never change.',
    tags: ['擴充', 'hash', 'static assets'],
  },
  {
    id: 'c-stale-while-revalidate', category: 'cache', name: 'stale-while-revalidate', rfc: 'RFC 5861',
    zh: '擴充指令:過期之後這麼多秒內,可以先給舊的,同時在背景去更新。延遲換一點資料新鮮度。',
    en: 'An extension: for this many seconds after going stale, serve the stale copy while refreshing in the background. Latency traded for a little staleness.',
    tags: ['擴充', 'swr', 'stale'],
  },
  {
    id: 'c-stale-if-error', category: 'cache', name: 'stale-if-error', rfc: 'RFC 5861',
    zh: '擴充指令:源頭出錯(或連不到)時,這麼多秒內可以拿舊的頂著。',
    en: 'An extension: when the origin errors or is unreachable, serve the stale copy for this many seconds.',
    tags: ['擴充', 'stale', '5xx'],
  },
  {
    id: 'c-pragma', category: 'cache', name: 'Pragma: no-cache', rfc: 'RFC 9111', section: '5.4', deprecated: true,
    zh: '已廢棄。只為 HTTP/1.0 相容而存在,而且只在請求方向有意義。送 Cache-Control 就夠了,不必再補 Pragma。',
    en: 'Deprecated; it exists only for HTTP/1.0 compatibility and only means anything on a request. Cache-Control alone is sufficient — there is no need to add Pragma.',
    tags: ['http/1.0', 'legacy'],
  },
];

export const ENTRIES: readonly Entry[] = [...STATUS, ...METHODS, ...REQUEST, ...RESPONSE, ...CACHE];

export const CATEGORIES: readonly { key: Category; zh: string; en: string }[] = [
  { key: 'status', zh: '狀態碼', en: 'Status codes' },
  { key: 'method', zh: '方法', en: 'Methods' },
  { key: 'request', zh: '請求標頭', en: 'Request headers' },
  { key: 'response', zh: '回應標頭', en: 'Response headers' },
  { key: 'cache', zh: 'Cache-Control', en: 'Cache-Control' },
];

/* ── Lookups ──────────────────────────────── */

/** 'RFC 9110 §15.5.5', or just the RFC when this file does not vouch for a section. */
export function citation(entry: Entry): string {
  return entry.section === undefined ? entry.rfc : `${entry.rfc} §${entry.section}`;
}

export type Family = {
  /** The leading digit: 1 through 5. */
  digit: number;
  zh: string;
  en: string;
};

/**
 * The class of a status code, per RFC 9110 §15. Returns a family for any code
 * in 100–599, registered or not, so that a code seen in a log (499, 520, 598)
 * still gets an honest answer instead of a shrug.
 */
export function statusFamily(code: number): Family | null {
  if (!Number.isInteger(code) || code < 100 || code > 599) return null;
  const digit = Math.floor(code / 100);
  const table: Record<number, [string, string]> = {
    1: ['1xx 訊息類:請求已收到,處理還在繼續', '1xx Informational: request received, continuing'],
    2: ['2xx 成功類:請求被收下、理解並接受了', '2xx Successful: the request was received, understood and accepted'],
    3: ['3xx 轉向類:要完成請求還需要進一步動作', '3xx Redirection: further action is needed to complete the request'],
    4: ['4xx 客戶端錯誤:請求有問題,或伺服器不願意處理', '4xx Client error: the request is faulty, or the server will not process it'],
    5: ['5xx 伺服器錯誤:伺服器知道自己出錯了,或做不到', '5xx Server error: the server failed, or cannot do what was asked'],
  };
  const [zh, en] = table[digit];
  return { digit, zh, en };
}

/** The registered entry for a code, or null. Accepts 404 and '404' alike. */
export function lookupStatus(code: number | string): Entry | null {
  const text = String(code).trim();
  return STATUS.find((entry) => entry.name === text) ?? null;
}

export function countByCategory(): Record<Category, number> {
  const counts: Record<Category, number> = { status: 0, method: 0, request: 0, response: 0, cache: 0 };
  for (const entry of ENTRIES) counts[entry.category] += 1;
  return counts;
}

/* ── Search ───────────────────────────────── */

const norm = (value: string) => value.toLowerCase().trim();

function score(entry: Entry, q: string): number {
  const name = norm(entry.name);
  if (name === q) return 1000;
  // 'max-age (request)' should still be found by 'max-age'.
  if (name.startsWith(q)) return 900;

  if (entry.category === 'status') {
    const family = /^([1-5])(?:xx|\*\*)$/.exec(q);
    if (family && entry.name.startsWith(family[1])) return 850;
    if (/^[1-5]\d{0,2}$/.test(q) && entry.name.startsWith(q)) return 840;
  }

  if (norm(entry.label ?? '') === q) return 800;
  if (norm(entry.label ?? '').includes(q)) return 700;
  if (name.includes(q)) return 650;
  if (entry.tags?.some((tag) => norm(tag) === q)) return 600;
  if (entry.tags?.some((tag) => norm(tag).includes(q))) return 500;
  if (norm(entry.rfc).replace(/\s+/g, '') === q.replace(/\s+/g, '')) return 450;
  if (norm(entry.rfc).includes(q)) return 400;
  if (entry.flags?.some((flag) => norm(flag).includes(q))) return 350;
  if (entry.zh.includes(q) || entry.zh.toLowerCase().includes(q)) return 200;
  if (entry.en.toLowerCase().includes(q)) return 150;
  return 0;
}

/**
 * Substring search over the whole table, ranked. Deliberately not fuzzy: on a
 * closed set of a couple of hundred known tokens, exact-then-prefix ranking is
 * predictable, and a fuzzy matcher would put 431 above 403 for the query "403"
 * on some inputs. Ties keep the table's own order, so 4xx stays in numeric
 * order rather than being shuffled by the sort.
 */
export function searchEntries(query: string, categories?: readonly Category[]): Entry[] {
  const pool =
    categories === undefined || categories.length === 0
      ? ENTRIES
      : ENTRIES.filter((entry) => categories.includes(entry.category));
  const q = norm(query);
  if (q === '') return pool.slice();

  return pool
    .map((entry, index) => ({ entry, index, rank: score(entry, q) }))
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.entry);
}
