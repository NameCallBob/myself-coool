import type { ToolNote } from './index';

/** Drawer E — what each indexable tool in this drawer will not do. */
export const CRYPTO_NOTES: Record<string, ToolNote> = {
  hash: {
    limits: [
      {
        zh: '文字模式上限 4 MB,更大的內容請改用檔案模式。',
        en: 'Text mode caps at 4 MB; use file mode for anything larger.',
      },
      {
        zh: '比對欄一次只讀一行,整份 SHA256SUMS 逐列核對請用 E06。',
        en: 'The compare box reads one line; use E06 to check a whole SHA256SUMS file.',
      },
      {
        zh: '這裡只算無密鑰摘要,簽章請用 E05,存密碼請用 E07。',
        en: 'Keyless digests only: use E05 for signatures, E07 for password storage.',
      },
    ],
  },

  'aes-encrypt': {
    limits: [
      {
        zh: '檔案上限 64 MB,不支援串流,更大的檔請用 age 或 gpg。',
        en: 'Files cap at 64 MB with no streaming; use age or gpg for larger ones.',
      },
      {
        zh: 'SPENC 是本站自訂容器,其他軟體讀不懂,長期交換請用 age 或 gpg。',
        en: 'SPENC is this site\'s own container that no other software reads.',
      },
      {
        zh: '強度取決於你的密語,請用 E01 或 E02 產生,別用記得住的那一個。',
        en: 'Strength comes from the passphrase — generate one with E01 or E02.',
      },
    ],
  },

  'password-generator': {
    limits: [
      {
        zh: '限制無法同時滿足時會直接報錯,不會交出不合格的密碼。',
        en: 'Impossible constraints raise an error instead of returning a weaker password.',
      },
      {
        zh: '熵值只描述這個產生器,評估你自己想的密碼請用 E03。',
        en: 'The entropy describes this generator only; use E03 to rate your own password.',
      },
      {
        zh: '需要唸出來或手打的密碼請用 E02 的密語,同樣熵值好記得多。',
        en: 'For passwords you say or type by hand, use the passphrases in E02.',
      },
    ],
  },
};
