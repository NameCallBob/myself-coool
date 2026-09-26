import type { ToolNote } from './index';

/** Drawer I — "how it works" prose for the indexable tools in this drawer. */
export const MEDIA_NOTES: Record<string, ToolNote> = {
  'image-convert': {
limits: [
      {
        zh: '同一個 quality 0.8 在不同瀏覽器產生的檔案大小與畫質都不一樣,因為編碼器不同。這裡的數字是關於你這台電腦這個瀏覽器的量測結果,不是可以寫進規格的常數。探測不到編碼器的格式會直接從格式清單消失,AVIF 在不少瀏覽器就是只能讀不能寫。',
        en: 'Quality 0.8 means different sizes in different browsers, because the encoder differs; these numbers describe this browser, not a spec. A format whose encoder fails the probe disappears from the list, which is what AVIF does in several browsers.',
      },
      {
        zh: '解碼失敗的方向相反:createImageBitmap 會直接丟錯,iPhone 的 HEIC/HEIF 與部分 TIFF 都不在瀏覽器的解碼範圍內。這種失敗是逐檔回報的,不會讓整批停下來,但這件工具沒有自己的 HEIC 解碼器,遇到就是遇到了。單張超過 4000 萬像素會拒收:解好的像素是每像素 4 位元組,4000 萬像素就是 160 MB 的 RGBA,一次收八個檔案的上限也是同一個理由。',
        en: 'Decoding fails the other way — createImageBitmap throws — and HEIC/HEIF from an iPhone is outside what browsers decode; that is reported per file, but there is no HEIC decoder here. Over 40 megapixels is refused: decoded pixels are 4 bytes each, so 40 MP is already 160 MB of RGBA.',
      },
      {
        zh: '縮放是 canvas 的 drawImage 一次縮到位,imageSmoothingQuality 設成 high,但那還是瀏覽器的重採樣,不是 Lanczos 也不是多階段縮放;大幅縮小的邊緣銳利度比專用的 resampler 差一截。裁切、旋轉與翻轉請用 I02。另外重畫一次等於把 EXIF 全部丟掉,那是副作用不是承諾——要確認照片裡的 GPS 真的清掉了,用 I03 檢查。',
        en: 'Resizing is one drawImage with high smoothing quality — still the browser\'s resampler, not Lanczos or a multi-step downscale. Use I02 for cropping and rotation. Repainting also drops EXIF, but that is a side effect rather than a promise: verify with I03.',
      },
    ],
  },

  exif: {
limits: [
      {
        zh: 'TIFF 只能看,不能洗。TIFF 沒有把 metadata 包成一個可以整塊剪掉的區塊,要移除就得重建每一個 IFD 並改寫每一個 strip offset,而一個半對的 TIFF 寫入器比沒有寫入器糟得多——它會產生一個看起來能開、某些軟體開不起來的檔案。所以 TIFF 走的是唯讀路徑,並且在畫面上說明原因。',
        en: 'TIFF is read-only here. Its metadata is not a detachable block, so stripping means rebuilding every IFD and rewriting every strip offset, and a half-correct TIFF writer produces files that open in some software and not others.',
      },
      {
        zh: '只認 JPEG、PNG 與 TIFF 三種容器。HEIC、WebP 與 AVIF 完全不解析,不是解析失敗,是連試都沒試——它們的 metadata 在 ISOBMF 的 box 樹裡,那是另一支解析器。iPhone 直接匯出的 HEIC 想清乾淨的話,務實的做法是用 I01 重新編碼成 JPEG 或 WebP,canvas 重繪不會把 metadata 帶過去,代價是影像被重新壓縮一次。',
        en: 'Only JPEG, PNG and TIFF are parsed — HEIC, WebP and AVIF are not attempted at all, since their metadata lives in an ISOBMF box tree. For a HEIC straight off an iPhone, re-encoding through I01 drops the metadata, at the cost of one recompression.',
      },
      {
        zh: '有幾段東西被列出來但沒有解碼:zTXt 與壓縮過的 iTXt 需要 inflate,這裡沒有;MakerNote 只以十六進位位元組呈現,因為每家廠商的格式都是私有的。兩者都能被勾起來刪掉,但內容你看不到——MakerNote 裡常常另外有一份機身序號與鏡頭資料,想清乾淨就連它一起刪。另外 JPEG 的 segment 掃描停在第一個 SOS,之後的位元組原樣複製,所以理論上藏在第一個 scan 之後的 metadata 不會被列出;相機與手機產生的檔案不會長那樣,而停在那裡最多只會多留位元組,不會弄壞檔案。',
        en: 'A few things are listed but not decoded: zTXt and compressed iTXt need inflate, which is not here, and MakerNote is shown as raw hex because every vendor\'s layout is proprietary — it often holds a second copy of the body serial number, so delete it too. Segment scanning also stops at the first SOS; the tail is copied verbatim, so stopping early can only keep bytes, never corrupt them.',
      },
    ],
  },

  'image-redact': {
limits: [
      {
        zh: '它不偵測任何東西。沒有人臉、車牌或文字偵測,每一塊都是你自己框的,漏掉一塊它不會提醒你。覆蓋率只回報「有多少像素被改過」,不回報「改對了地方」——那件事只有你自己看得出來。',
        en: 'It detects nothing: no faces, no plates, no text. Every rectangle is one you drew, and a spot you missed goes unmentioned. The coverage number says how many pixels changed, never whether they were the right ones.',
      },
      {
        zh: '輸出是 PNG 或 JPEG 92%。截圖請選 PNG:JPEG 會重新壓縮,細小的文字邊緣會多一層壓縮痕跡。兩種輸出都不帶任何 Exif,因為 canvas 編碼器不寫,但那是編碼器的行為不是這件工具的功能;要知道原檔裡帶了什麼——GPS、機型、拍攝時間——請用 I03 看過。',
        en: 'Output is PNG or JPEG at 92%; screenshots should take PNG, because JPEG adds compression artefacts around small text. Neither output carries Exif, but only because the canvas encoder writes none — to see what the original carried, read it with I03.',
      },
      {
        zh: '單張超過四千萬像素會拒收,因為每一次拖曳都要重畫一次預覽,再大就不流暢了。拖曳距離不到三個影像像素的動作會被當成點一下而不是一塊遮罩,免得滿畫面都是誤觸產生的小方塊。',
        en: 'Images over forty megapixels are refused, because the preview redraws on every pointer move. A drag shorter than three image pixels counts as a click, not a mark.',
      },
    ],
  },

  'qr-generate': {
limits: [
      {
        zh: '上限是 271 個位元組(version 10、容錯等級 L),等級越高能裝的越少。超過的時候它不會偷偷升版本或換模式,會直接說明超了多少。QR Code 本來就不是裝長文的容器——要放一段文字或一份資料,放一個指向它的網址。',
        en: 'The ceiling is 271 bytes at version 10 level L, and less at every higher level. Over that it says by how much rather than quietly switching version or mode. A QR code is not a container for long text: point it at a URL instead.',
      },
      {
        zh: '中文與 emoji 是以 UTF-8 塞進 byte mode 的,而且沒有加 ECI 指示子(宣告 UTF-8 要用 ECI 000026)。嚴格照規格,byte mode 的預設字元集是 ISO-8859-1,所以理論上那些位元組該被解成亂碼;實務上手機的掃描器幾乎都會自動偵測 UTF-8,但老舊的或工業用的固定式掃描器不一定會。payload 全是 ASCII 時沒有這個問題,含中文時請實際用目標裝置掃一次。',
        en: 'Chinese and emoji go in as UTF-8 byte mode with no ECI designator, though declaring UTF-8 formally needs ECI 000026. Strictly, byte mode defaults to ISO-8859-1, so those bytes should decode as mojibake; phone scanners almost all sniff UTF-8, while older or industrial fixed scanners may not. Test on the target device when the payload is not ASCII.',
      },
      {
        zh: '網址欄位的 scheme 判斷是一組文字規則,不是一個 URL 解析器。冒號前面沒有點、又不叫 localhost 的主機名稱——內網那種 myserver:8080——會被當成「已經有 scheme」而原樣輸出,遇到這種請自己把 http:// 打上去。它也不做 punycode 轉換、不檢查網址存不存在、不縮短網址。',
        en: 'The URL field applies text rules, not a URL parser: a host with no dot that is not named localhost — an intranet `myserver:8080` — is treated as already having a scheme and left as typed, so type the http:// yourself. No punycode conversion, no reachability check, no shortening.',
      },
      {
        zh: '罰分是規格給的掃描難易度代理指標,不是量測值——分數低不等於一定掃得到。印出來或貼上去之後請用 I08 實際掃一次,不同解碼器的差異只有那樣才看得出來。另外這裡不做中間挖洞放 logo:容錯等級 H 的 30% 是碼字層級的比例,不是可以隨便蓋掉的面積比例,而蓋到 finder、timing 或 alignment 圖樣的話,任何容錯等級都救不回來。',
        en: 'The penalty score is the standard\'s proxy for scannability, not a measurement — a low score is not a guarantee. Scan the printed result with I08. There is also no logo overlay: the 30% at level H is a share of codewords, not an area you may cover, and no level survives a finder, timing or alignment pattern being obscured.',
      },
    ],
  },
};
