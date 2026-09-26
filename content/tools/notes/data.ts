import type { ToolNote } from './index';

/** Drawer C — what each indexable tool in this drawer will not do. */
export const DATA_NOTES: Record<string, ToolNote> = {
  'json-format': {
    limits: [
      {
        zh: '數字一律過 IEEE 754,超過 2^53 的 ID 會被靜靜改掉。',
        en: 'Numbers pass through IEEE 754 doubles, so IDs beyond 2^53 change silently.',
      },
      {
        zh: '重複鍵只留最後一個,但會列出每次重複的位置。',
        en: 'Duplicate keys keep only the last one, with every repeat listed by position.',
      },
      {
        zh: '不收註解與尾逗號;比對兩份請用 C05,撈欄位請用 C03。',
        en: 'No comments or trailing commas; compare with C05, extract fields with C03.',
      },
    ],
  },
  'data-convert': {
    limits: [
      {
        zh: '註解一律消失,TOML 的日期時間會變成字串。',
        en: 'Comments are always dropped, and TOML datetimes land as strings.',
      },
      {
        zh: '不支援 YAML 區塊純量,多數 Kubernetes manifest 會被拒收。',
        en: 'YAML block scalars are unsupported, so most Kubernetes manifests are refused.',
      },
      {
        zh: '上限 524,288 字元;CSV 的巢狀值會壓成一行 JSON,瀏覽請用 C06。',
        en: 'Capped at 524,288 characters; nested values collapse to inline JSON in CSV — browse one with C06.',
      },
    ],
  },
  'json-to-types': {
    limits: [
      {
        zh: '結構相同的物件會共用一個型別名稱,要分開得自己改名。',
        en: 'Same-shaped objects share a single type name; rename them by hand.',
      },
      {
        zh: '哪些欄位是 optional 只反映你貼的樣本,不等於真正的契約。',
        en: 'Optional fields reflect only the pasted sample, not the real contract.',
      },
      {
        zh: '不產 enum;整數或小數是猜的,Go 與 Pydantic 會猜錯。',
        en: 'No enums, and int-versus-float is a guess that Go and Pydantic commit to.',
      },
    ],
  },
  'curl-convert': {
    limits: [
      {
        zh: '讀不到本機檔案,-d @、-F @ 與 -T 只留下佔位變數。',
        en: 'Local files are unreachable: -d @, -F @ and -T leave a placeholder variable.',
      },
      {
        zh: '一次一條指令;--cert、--key、--resolve 等旗標會被丟掉。',
        en: 'One command at a time; flags such as --cert and --resolve are dropped.',
      },
      {
        zh: '只做 curl 轉程式碼;拆 URL 請用 J02,拆 JWT 請用 D03。',
        en: 'Only curl to code, never the reverse; use J02 for URLs and D03 for JWTs.',
      },
    ],
  },
};
