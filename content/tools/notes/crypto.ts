import type { ToolNote } from './index';

/** Drawer E — "how it works" prose for the indexable tools in this drawer. */
export const CRYPTO_NOTES: Record<string, ToolNote> = {
  hash: {
limits: [
      {
        zh: '文字模式的上限是 4 MB,超過就請切到檔案模式——文字模式把整份字串留在記憶體裡,檔案模式才是串流的。',
        en: 'Text mode caps at 4 MB; past that switch to file mode, which streams instead of holding everything.',
      },
      {
        zh: '比對欄一次只讀一行。一整行 sha256sum / shasum 輸出(含後面的檔名)、BSD 的 SHA256 (檔名) = 雜湊、大寫、sha256: 前綴、空格或冒號分組都認得,但整份 SHA256SUMS 檔案貼進來不會逐列核對——那是 E06 的工作。',
        en: 'The compare box reads one line. A whole sha256sum or shasum line with its filename, the BSD "SHA256 (file) = hash" form, upper case, a sha256: prefix and grouped digests are all understood, but a whole SHA256SUMS file is not checked row by row — that is what E06 does.',
      },
      {
        zh: '這裡算的是純摘要,沒有密鑰。要對 webhook 簽章做除錯請用 E05 的 HMAC;要拿官方公布的 checksum 逐項核對,E06 是為那個流程做的。',
        en: 'These are keyless digests. For a webhook signature use E05 (HMAC); to check a file against a published checksum, E06 is built for that flow.',
      },
      {
        zh: '不要拿這裡的 SHA-256 存密碼。密碼需要的是慢、有 salt 的導出函式,不是快的雜湊;那個方向請看 E07 的 PBKDF2 部分。',
        en: 'Do not store passwords with SHA-256 from here — passwords need a slow salted derivation, which is what E07 does with PBKDF2.',
      },
    ],
  },

  'aes-encrypt': {
limits: [
      {
        zh: '檔案上限 64 MB。WebCrypto 沒有串流版的 AES-GCM,整份明文與整份密文必須同時在記憶體裡,再大就會把分頁弄死。大檔請用 age 或 gpg。',
        en: 'Files cap at 64 MB: WebCrypto has no streaming AES-GCM, so the whole thing sits in memory. For larger files use age or gpg.',
      },
      {
        zh: 'SPENC 這個容器格式是這個工具自己定的,沒有別的軟體讀得懂它。要跟其他人長期交換加密檔案,請用 age 或 gpg——它們有規格書,也有多方實作,不會因為這個網站消失就解不開。',
        en: 'The SPENC container is this tool\'s own format and nothing else reads it. For exchanging encrypted files with other people over time, use age or gpg, which have specifications and multiple implementations.',
      },
      {
        zh: '真正決定強度的是你的密語,不是 600,000 這個數字——迭代只買到大約二十個 bit 的緩衝。密語請用 E01 或 E02 產生,不要用你記得住的那一個。',
        en: 'Your passphrase decides the strength, not the iteration count, which buys about twenty bits. Generate one with E01 or E02 rather than reusing the one you can remember.',
      },
    ],
  },

  'password-generator': {
limits: [
      {
        zh: '重抽最多一萬次。如果限制實際上難以滿足(例如長度 4 要同時塞四類字元、又開了避開易混淆字元),它會直接報錯要你放寬,而不是安靜地交出一個不合格或被補過的密碼。四類字元全部取消勾選也是同一個原則:那不是「預設小寫」,而是沒有東西可以抽,所以產生鈕直接停用並說明,不會給你一串看不出是怎麼來的小寫字母。',
        en: 'Rejection gives up after 10,000 attempts and raises rather than quietly handing back a patched or non-conforming password when the constraints are effectively impossible. Unselecting all four character types is treated the same way — there is nothing to draw from, so the button is disabled and says so, instead of falling back to lowercase.',
      },
      {
        zh: '這裡的熵描述的是產生器,不是你自己想的密碼——只要不是這個分佈抽出來的,這個數字就不適用。要評估手打的密碼請用 E03,它會去比對常見密碼、鍵盤序列與替換字母的老把戲。',
        en: 'The entropy describes the generator, not a password you invented; for that use E03, which checks common passwords, keyboard runs and letter substitutions.',
      },
      {
        zh: '純亂碼是給密碼管理器存的。需要用嘴唸出來、用手打進去的那一個(例如硬碟加密或管理器主密碼),請用 E02 的密語,同樣的熵好記得多。',
        en: 'Random strings are for a password manager to hold. For one you have to say aloud or type by hand, use the passphrases in E02 — the same entropy, far easier to remember.',
      },
    ],
  },
};
