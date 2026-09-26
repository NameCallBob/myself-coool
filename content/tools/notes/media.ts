import type { ToolNote } from './index';

/** Drawer I — what each indexable tool in this drawer will not do. */
export const MEDIA_NOTES: Record<string, ToolNote> = {
  'image-convert': {
    limits: [
      {
        zh: '單張上限四千萬像素,一次最多八個檔案;HEIC 與部分 TIFF 解不開。',
        en: 'Up to 40 megapixels per image and eight files per batch; HEIC and some TIFF cannot be decoded.',
      },
      {
        zh: '可輸出的格式看瀏覽器的編碼器,AVIF 多半只能讀不能寫。',
        en: 'Available output formats depend on the browser encoder; AVIF is often read-only.',
      },
      {
        zh: '只做格式轉換與縮放;裁切旋轉請用 I02,檢查 EXIF 請用 I03。',
        en: 'Converts and resizes only: crop and rotate with I02, inspect EXIF with I03.',
      },
    ],
  },

  exif: {
    limits: [
      {
        zh: '只解析 JPEG、PNG、TIFF;HEIC、WebP、AVIF 一律不讀。',
        en: 'Parses JPEG, PNG and TIFF only; HEIC, WebP and AVIF are not read.',
      },
      {
        zh: 'TIFF 只能檢視,不能移除 metadata。',
        en: 'TIFF is view-only here; metadata cannot be stripped.',
      },
      {
        zh: 'zTXt、壓縮的 iTXt 與 MakerNote 只列出不解碼,可刪但看不到內容。',
        en: 'zTXt, compressed iTXt and MakerNote are listed but not decoded — deletable, not readable.',
      },
    ],
  },

  'image-redact': {
    limits: [
      {
        zh: '不做人臉、車牌或文字偵測,每一塊遮罩都要自己框。',
        en: 'No face, plate or text detection: every mask is one you draw.',
      },
      {
        zh: '覆蓋率只算改過多少像素,不保證遮到該遮的地方。',
        en: 'Coverage counts changed pixels, not whether the right areas were covered.',
      },
      {
        zh: '單張上限四千萬像素;輸出 PNG 或 JPEG 92%,截圖請選 PNG。',
        en: 'Up to 40 megapixels; output is PNG or JPEG at 92%, and screenshots want PNG.',
      },
    ],
  },

  'qr-generate': {
    limits: [
      {
        zh: '上限 271 位元組(version 10、容錯 L),容錯越高裝越少,超過不會自動升版。',
        en: 'Ceiling is 271 bytes at version 10 level L, less at higher levels, and it will not upgrade for you.',
      },
      {
        zh: '中文與 emoji 用 UTF-8 byte mode 無 ECI,舊掃描器可能讀成亂碼。',
        en: 'Non-ASCII goes in as UTF-8 byte mode without an ECI designator, so older fixed scanners may show mojibake.',
      },
      {
        zh: '不挖洞放 logo,不縮網址也不驗證網址是否存在;印出後請用 I08 實掃一次。',
        en: 'No logo overlay, no shortening, no reachability check; scan the printed result with I08.',
      },
    ],
  },
};
