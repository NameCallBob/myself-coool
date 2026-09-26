import type { ToolNote } from './index';

/** Drawer NET — what each indexable tool in this drawer will not do. */
export const NET_NOTES: Record<string, ToolNote> = {
  cidr: {
    limits: [
      {
        zh: 'IPv4 前導零與 /024 這類寫法一律拒絕,不會替你猜進位。',
        en: 'Leading zeros are refused, in the address and in the prefix alike.',
      },
      {
        zh: '切分最多列 128 個子網段,範圍彙總最多 64 個區塊,總數照算但列表截斷。',
        en: 'Splitting lists at most 128 subnets, ranges at most 64 blocks; totals are still exact.',
      },
      {
        zh: '只做算術,不查 whois、DNS 或連通性;保留清單是 2024 年 IANA 快照。',
        en: 'Arithmetic only — no whois, DNS or reachability; the reserved-range list is a 2024 IANA snapshot.',
      },
    ],
  },

  'url-inspect': {
    limits: [
      {
        zh: '只解析字串,不會連線抓取、不跟隨重新導向,也不知道連結是否還活著。',
        en: 'Nothing is fetched: no redirects followed, no way to tell if the link still works.',
      },
      {
        zh: 'Punycode 只做 RFC 3492,沒有 UTS-46,不可作安全比對依據。',
        en: 'Punycode is RFC 3492 without UTS-46, so it is not a basis for security comparisons.',
      },
      {
        zh: '追蹤參數清單是整理出來的,少數網站若靠 utm 參數路由,清理後會壞掉。',
        en: 'The tracking-parameter list is curated; a site that routes on utm will break once cleaned.',
      },
    ],
  },

  'tw-validate': {
    limits: [
      {
        zh: '只驗檢查碼,不代表號碼真有人持有;查公司請用財政部稅籍登記查詢。',
        en: 'Check digits only — a valid number need not exist; look companies up at the tax registry.',
      },
      {
        zh: '舊式兩字母統一證號依移民署編碼原則實作,無公開清單可比對,信心較低。',
        en: 'The legacy two-letter resident number follows published rules but has no public list to verify against.',
      },
      {
        zh: '不支援健保卡號、統一發票號碼、銀行帳號與自然人憑證。',
        en: 'Not covered: health insurance cards, invoice numbers, bank accounts, digital certificates.',
      },
    ],
  },
};
