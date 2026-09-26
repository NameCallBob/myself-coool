import type { ToolNote } from './index';

/** Drawer I — "how it works" prose for the indexable tools in this drawer. */
export const MEDIA_NOTES: Record<string, ToolNote> = {
  'image-convert': {
    body: [
      {
        zh: 'WebP 與 AVIF 的編碼器不是這裡寫的,是瀏覽器本來就有的那一份:把檔案交給 createImageBitmap 解碼、畫進一張輸出尺寸的 canvas、再呼叫 convertToBlob(有 OffscreenCanvas 時走它,Safari 17 之前沒有,退回 DOM canvas 的 toBlob)。所以這件工具真正的工作不是壓縮,是不要相信那組 API 回報的東西。canvas 的規格寫得很清楚:遇到它不會編的格式,toBlob 會默默改用 image/png,不丟錯、不警告。一個沒有 AVIF 編碼器的 Chrome 版本被要求輸出 AVIF 時,你會拿到一張比來源 JPEG 大好幾倍的 PNG,副檔名寫著 .avif。因此每個格式在掛載時都先用一張 8×8 的畫布試編一次,清單上只留試成功的;每一次真實的編碼結束後再比一次 blob.type 與當初要求的 MIME(參數部分要切掉,瀏覽器可能回 image/jpeg;charset=… 這種字串),不一致就當場標成「瀏覽器換了格式」。',
        en: 'The encoders are the browser\'s own: decode with createImageBitmap, paint into a canvas at the output size, call convertToBlob (or toBlob before Safari 17). The real work is distrusting that API — canvas is specified to silently substitute image/png for a format it cannot write, so every format is probed once on an 8x8 canvas at mount and every finished blob has its reported type compared against what was asked for.',
      },
      {
        zh: '「壓到 300 KB 以下」那個模式是對 quality 做二分搜尋,前提是檔案大小隨 quality 單調遞增——JPEG、WebP、AVIF 實務上都成立,但沒有任何規格保證它成立。所以搜尋從頭到尾不預測大小,只記得「量過而且有塞進預算」的那一組 quality 與位元組數;達不到預算就回報達不到,不會把一個差一點的結果講成成功,那時候該建議的是縮尺寸而不是換一個比較圓的數字。第一次試 0.8,因為多數照片落在那附近,常見情況四到七次編碼就收斂;上限七次是給「大小不隨品質遞增」那種編碼器的保險,單調的編碼器用不到它,因為區間會先收完。二分是在整數百分比上做的,不是在浮點數上:0.30 與 0.35 取中點會得到 0.32499999999999996,四捨五入成 0.32,於是那個本來塞得進去的 0.33 就被跳過了,使用者看到的是一張莫名其妙差一點的圖。收斂條件是「區間收到 2 個百分點就停」,那是刻意省下的一次編碼,代價要講清楚:區間兩端一邊量過會過、一邊量過會超,中間就剩一個沒試過的百分點,所以回報的品質可能比真正塞得進去的最高品質低一個百分點——一個,不會是兩個,而且回報的那個一定是實際量過會過的。還有一個細節是上界 1 從來沒被量過,所以一個怎麼編都不會超標的預算會收在 0.98(0.8 → 0.9 → 0.95 → 0.98,此時 0.98 對著沒試過的 1 剛好差兩個百分點)——它不會宣稱自己用了一個沒試過的品質,想要純 quality 1 就把預算關掉。',
        en: 'The "fit under N KB" mode bisects on quality, assuming size grows with quality — true in practice for JPEG, WebP and AVIF, guaranteed by nothing. So it never predicts: it only reports a quality whose byte count was actually measured, and an unreachable budget comes back as unreachable rather than as a near miss. Bisection runs in whole percent, because the float midpoint of 0.30 and 0.35 is 0.32499999999999996 and rounds away the 0.33 that would have fit. The bracket closes at two percent, which buys one fewer encode and costs one untried percent: the quality reported is the highest that fits to within one percent, and a budget nothing overshoots ends at 0.98, since the ceiling of 1 is never measured.',
      },
      {
        zh: '縮放那一側的決定大多是關於誠實。預設不放大,而且要求的尺寸比來源大時是整張退回原尺寸,不是把一邊夾住——夾一邊會改變長寬比,而放大本來就不會生出細節。長寬各自四捨五入到整數像素,比例最多跑掉半個像素,那是能做到最小的誤差:任意比例本來就沒有一組整數寬高能精確表示。JPEG 沒有 alpha 通道,所以透明來源會先鋪一層你選的底色再畫上去,不鋪的話透明處會落在編碼器認定的空值上,通常是黑的。PNG 是無損的,canvas 對它完全忽略 quality,所以選 PNG 時那條滑桿是停用的,而不是留著讓它假裝有作用。大小的呈現給了三個數字:省下的位元組、省下的比例、剩下的比例——「壓縮了 70%」這句話兩種意思都有人用——另外給了每像素位元數,因為改過尺寸之後單純比檔案大小完全說不出編碼器做了多少事。',
        en: 'The resize side is mostly about honesty: no upscaling by default, and a request larger than the source returns the source whole rather than clamping one side and skewing the ratio. JPEG has no alpha, so a transparent source is flattened onto a chosen background first, or the empty pixels land wherever the encoder puts them — usually black. PNG is lossless and canvas ignores quality for it, so the slider is disabled rather than decorative. Bits per pixel is shown alongside the byte counts, since file size alone says nothing once the dimensions changed.',
      },
    ],
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
    body: [
      {
        zh: 'EXIF 不是一種格式,是一個 TIFF 檔被塞在別的容器裡。JPEG 是一串 FF xx 開頭的 segment,相機的 metadata 放在 APP1,payload 前面有 Exif\\0\\0 六個位元組當標記;跳過那六個位元組之後,剩下的就是一份完整的 TIFF:前兩個位元組 II 或 MM 宣告位元組順序,接著是魔數 42,然後是一串以 IFD 串起來的表。每個 IFD 項目固定 12 位元組——tag、type、count,最後四個位元組如果值裝得下就直接放值,裝不下就放一個偏移量,而那個偏移量是從 TIFF 區塊的開頭算的,不是從檔案開頭算的。這件事決定了整支解析器的形狀:Exif 區塊被切成它自己的 Uint8Array 再往下傳,否則每一次讀值都要記得加上那個容器造成的位移,而那種偏移錯誤讀出來的東西看起來像資料,不像錯誤。IFD0 裡的 0x8769、0x8825、0xA005 三個 tag 是指向 Exif、GPS、Interop 子 IFD 的指標,它們是管線不是欄位,所以遞迴下去讀完內容之後,指標本身不會出現在列表上。PNG 那邊的結構完全不同(長度前綴的 chunk,eXIf 帶 TIFF、tEXt/iTXt/zTXt 帶自由文字),但 eXIf 裡面又是同一份 TIFF,所以兩條路最後匯到同一個解析函式。',
        en: 'EXIF is a TIFF file wrapped in something else. JPEG is a chain of FF xx segments; Exif sits in APP1 behind a six-byte Exif\\0\\0 prefix, and past that is a real TIFF — II or MM for byte order, magic 42, then a linked list of IFDs whose 12-byte entries hold either the value or an offset counted from the start of the TIFF block. That is why the block is carried as its own array: an off-by-container offset reads as data, not as an error. PNG chunks are a different shape but eXIf is the same TIFF, so both paths meet in one parser.',
      },
      {
        zh: '這支解析器的假設是「檔案可能是壞的,也可能是有人故意做壞的」,因為它跑在讀者自己的分頁裡。每一次讀取都先檢查有沒有越界:宣告 65535 個項目的 IFD 會被砍到「這個區塊實際上放得下幾個」,總欄位數再壓在 4096 以內;type 不在 1 到 12 之間的項目跳過,值指到區塊外面的項目跳過;IFD 的 next 指標會用一個 seen 集合記住走過的偏移,因為一個指回自己的 IFD 在沒有這道檢查時就是一個無限迴圈,而在瀏覽器裡無限迴圈跟當掉沒有分別。那個 next 指標的位置也要算對:它在「IFD 宣告的項目數」之後,不是在「我們決定讀幾個」之後。一個宣告一百個項目而區塊只放得下兩個的檔案,正確算出來的指標會落在檔案外面,也就是沒有 IFD1;用讀到的數量去算則會從項目表中間撿四個位元組當指標,然後把縮圖那張 IFD1 從一個錯的偏移讀進來——邊界檢查會擋住越界,但列出來的會是一整組根本不存在的欄位。整份檔案超過 64 MB 直接不收。重點是:每一次跳過都往 warnings 裡寫一句話,然後顯示在畫面上。一個隱私工具最危險的失敗模式不是報錯,是把「我讀不到這一段」靜靜顯示成「這裡沒東西」,使用者就這樣把含 GPS 的照片傳出去了。',
        en: 'The parser assumes the file may be broken or hostile, because it runs in the reader\'s own tab: every read is bounds-checked, an IFD claiming 65535 entries is cut to what the block can hold, the total field count is capped at 4096, entries with an unknown type or an out-of-block offset are skipped, and a seen-set stops an IFD that links back to itself from looping forever. The next-IFD pointer is read after the entries the IFD declared rather than after the ones we agreed to read, or a truncated count would make four bytes from the middle of the table into an offset and list a whole IFD1 of fields that do not exist. Every skip is written into a warnings list and shown, because the dangerous failure for a privacy tool is not an error — it is reading nothing and displaying "no metadata".',
      },
      {
        zh: '顯示值的部分有幾個地方刻意不化簡。快門存的是有理數 1/200,把它印成 0.005 秒技術上正確而實際上沒用,所以分子分母照原樣留著,只在分子大於分母時才轉成小數秒。ShutterSpeedValue 與 ApertureValue 存的是 APEX 值,分別要做 2 的次方與根號二的次方才變回秒與 f 值,兩個都標示原始 EV。Flash 是一個位元欄位,拆開來講「有沒有擊發、模式是什麼、有沒有紅眼消除」比印 0x19 有用。列舉值照 Exif 2.32 的表翻譯,沒列在表上的代碼直接顯示數字,不猜。GPS 是最需要小心的一個:座標以度分秒三個有理數存放,南緯與西經的負號不在數字裡,而在 GPSLatitudeRef 這個獨立的 tag 上——所以真的會遇到有座標卻沒有半球標記的檔案,那時候它回報「讀不到半球」而不是預設北緯東經,因為猜錯的結果是把座標指到地球另一邊。算出來的十進位度數還會檢查緯度不超過 90、經度不超過 180,超了就當檔案損壞。',
        en: 'Some values are deliberately not simplified. A shutter speed is stored as the rational 1/200, and printing 0.005 s is correct but useless, so numerator and denominator survive as written; ShutterSpeedValue and ApertureValue are APEX numbers needing a power of two and a power of root two; Flash is a bit field worth unpacking. Enumerations follow Exif 2.32 and unlisted codes are shown as raw numbers rather than guessed. GPS carries its sign in a separate reference tag, so a file with coordinates and no hemisphere is reported as unreadable instead of assumed north-east.',
      },
      {
        zh: '移除是真的重寫檔案,不是設一個旗標。每一個可移除的區塊都以「在原始檔案裡的起始位移與長度」被記住,清除時把要刪的區間排序,然後把區間之外的位元組逐段複製到一個新的陣列——壓縮過的影像資料一個位元都沒動,所以畫質完全沒有損失,而被刪掉的那幾段在輸出檔裡不存在,不是被蓋住。PNG 不需要重算 CRC,因為 chunk 只被整塊刪除、沒有被編輯,活下來的 chunk 帶著它原本的 CRC 就是對的。輸出檔名是 photo.clean.jpg,永遠不覆蓋原檔。另外區塊分成兩類標示:APP1 Exif、APP13 的 IPTC、XMP、COM 註解這些是身分資訊,ICC profile、APP0 JFIF、APP14 Adobe 則標成「刪掉會影響顯示」——把 ICC 跟 GPS 混在一起叫「metadata 一鍵清除」,代價是使用者的照片顏色會變。值得單獨講一句的是 IFD1:Exif 裡面藏著一張縮圖,而縮圖是在裁切與修圖之前產生的,所以那張縮圖有時候比原圖多露出東西。它跟 APP1 Exif 是同一個區塊,刪 Exif 就一起不見了。',
        en: 'Removal rewrites the file. Each block is addressed by its offset and length in the original, the cuts are sorted, and everything outside them is copied byte for byte — the compressed image data is bit-identical, and what was removed is absent rather than covered. PNG needs no CRC work because chunks are only deleted, never edited, and the output is saved as photo.clean.jpg so the original survives. Blocks are labelled identifying or rendering-affecting separately, because an ICC profile is not a privacy problem and dropping it changes the colours. The embedded thumbnail lives in the same APP1 block, which matters: it predates cropping.',
      },
    ],
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
    body: [
      {
        zh: '在 PDF、簡報或 SVG 上面畫一個黑色方塊,原本的像素還在底下,只差一個「刪除物件」就被讀回來。這種事每年都上新聞,而且出事的通常是最該懂的人。這件工具的整個設計就是為了讓那個檔案層級的還原不存在:遮罩不是畫在影像上面,是直接寫進解碼出來的 RGBA 位元組陣列,然後整個陣列重新編碼成一個新檔案。輸出檔裡沒有圖層可以剝,也沒有那些像素的舊值。所有計算都寫成純函式——輸入一個 RGBA 陣列,回傳一個新的陣列——canvas 只出現在最外圈的解碼與編碼,所以同一份程式碼在瀏覽器裡跑,也在 node --test 裡跑。',
        en: 'A black rectangle drawn over an image in a PDF, a slide or an SVG leaves the pixels underneath, one "delete object" away from being read back. Here the marks are written into the decoded RGBA buffer and the whole buffer is re-encoded, so the output has no layer to peel and no earlier copy of those pixels. The pixel work is pure functions over a byte array, with canvas only at the decode and encode edges.',
      },
      {
        zh: '兩種遮罩的安全程度不一樣,而介面上有寫。實心遮罩把矩形內每一個像素寫成同一個顏色,原本的值就是沒了,只剩矩形的形狀還透露資訊;alpha 一律寫成 255,這是刻意的——半透明的遮罩蓋在一張帶透明的 PNG 上,合成到別的背景時原圖會透出來。馬賽克也是一樣寫成不透明,而且平均色是按 alpha 加權算的:alpha 跟著一起平均的話,方塊會變成半透明,合成到不同背景時亮度會跑掉,更糟的是方塊裡原本透明與不透明的邊界會以平均值的形式留下形狀——那正是遮蔽最不該留下的東西;而全透明的像素帶的 RGB 從來沒被看見過(canvas 給的是 0),讓它進到未加權的平均只會把方塊莫名拉黑。馬賽克本身是把每個方塊換成該方塊的平均色,那是真的資訊損失,平均不可逆,但它是「減少」而不是「消除」:方塊的平均值全都還在那裡,對付短字串又是已知字型、方塊又設得小的時候,攻擊者可以把候選字串渲染出來、用同樣的方式取平均、然後比對,直到找到一致的那一組。所以要遮的是文字就用實心,馬賽克留給「這裡有一張臉但不必辨認」這類場合。',
        en: 'The two mark kinds are not equally safe, and the UI says so. Solid writes one colour over every pixel and forces alpha to 255 on purpose, since a semi-transparent mask over a transparent PNG would show through whatever is composited behind it. Mosaic is written opaque too, with the colour mean weighted by alpha: averaging alpha instead leaves a half-transparent block whose alpha channel still outlines the transparent/opaque boundary that was under the mark. Mosaic replaces each block with its mean — a real, non-invertible loss, but a reduction rather than an erasure: for short text in a known font with a small block size, an attacker can render candidates, average them the same way and compare. Solid is the honest choice for text.',
      },
      {
        zh: '沒有高斯模糊,而且不是還沒做。模糊是線性卷積,半徑小的時候反卷積就能把字讀回來——這已經有現成的實作,不需要什麼特殊資源。它是一個視覺效果,不是遮蔽手段,提供它等於預設多數人會選它,因為它最好看。把選項收掉比在旁邊寫一行警告有效。',
        en: 'There is no Gaussian blur, and that is a decision rather than a gap. Blur is a linear convolution, and at a small radius deconvolution reads the text back; it is a rendering effect, not redaction. Offering it would mean most people pick it, because it looks the best. Removing the option works better than a warning beside it.',
      },
      {
        zh: '座標全部存成影像像素,不是畫面像素。canvas 顯示的寬度由欄位寬度決定,和像素格完全是兩個尺寸,所以指標位置先換算回影像座標再記下來,否則改一次視窗大小遮罩就跑掉了。拖曳的兩個角會先排序,往左上拖跟往右下拖一樣有效;每一個像素迴圈跑的都是夾過邊界的矩形,所以拖出畫布外只是被截掉,而不是寫進下一列的記憶體。馬賽克的格線對齊影像原點而不是對齊你框的矩形,兩塊重疊的馬賽克因此接成一片連續的,不會出現一道明顯的接縫——接縫本身就是在說「這兩塊是分開框的」;而每個格子的取樣範圍會夾在矩形內,平均值不會把框外的顏色帶進來。覆蓋率那個數字是用一張每像素一位元組的遮罩算的,不是把每塊面積加起來:面積相加會把重疊處算兩次,而那個數字是使用者用來判斷「我遮夠了嗎」的依據。',
        en: 'Marks are stored in image pixels, not display pixels: the canvas is shown at whatever width the column gives it, so a mark recorded in screen coordinates would move when the window is resized. Drag corners are sorted, and every pixel loop runs over a clamped rectangle, so a drag off the canvas is truncated rather than an out-of-bounds write. The mosaic grid is aligned to the image origin, so overlapping marks form one continuous mosaic with no telltale seam, and coverage is counted with a one-byte-per-pixel mask because summing areas would double-count overlaps.',
      },
    ],
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
    body: [
      {
        zh: '整個編碼器是照 ISO/IEC 18004 寫出來的,不是包一個函式庫,而範圍刻意縮小成兩件事:只用 byte mode,只做 version 1 到 10。byte mode 以每位元組 8 bits 編碼任何 UTF-8 文字,它是唯一不會編錯的模式;numeric 與 alphanumeric 只在很窄的一類輸入上能把符號縮小一級,而模式指示子填錯的結果不是報錯,是一個掃出來是亂碼的碼。版本停在 10 的理由類似:每個版本都要自己的錯誤更正區塊表與對齊圖樣座標,而那種表格抄錯一格產生的東西看起來完全像一個 QR Code,只是解不開。十個驗證過的版本比四十個猜的版本有用,而 10-L 已經能裝 271 個位元組。所有有公開常數的地方——總碼字數、區塊切法、byte mode 容量、format 與 version 的位元串——都在測試裡對著規格的數字核對過;Reed–Solomon 那一步不是比對一組記下來的向量,是驗證它的定義性質:編碼後的多項式在生成多項式的每一個根上都等於零。',
        en: 'The encoder is written out from ISO/IEC 18004 rather than imported, with the scope deliberately cut to byte mode and versions 1 to 10. Byte mode encodes any UTF-8 text at eight bits per byte and is the one mode that is never wrong; a mismatched mode indicator does not error, it scans as garbage. Versions stop at 10 because each needs its own error-correction block table and alignment coordinates, and a mis-transcribed row yields something that looks like a QR code and does not decode. Ten verified versions beat forty guessed ones, and 10-L already holds 271 bytes.',
      },
      {
        zh: '錯誤更正的算術在 GF(256) 裡做,就是規格指定的那個場:位元組對 x^8 + x^4 + x^3 + x^2 + 1 取模(實作上就是溢位時 XOR 0x11d),以 2 為生成元建一次指數表與對數表,各 256 個位元組。乘法要特別處理零,因為對數表沒辦法表達零。每個區塊的更正碼字是「資料乘上 x^n 再除以生成多項式 (x−α^0)(x−α^1)…(x−α^(n−1)) 的餘式」,是系統碼,所以原本的資料碼字原封不動地被傳出去。真正讓這些更正碼字有意義的是後面的交錯:資料先按版本與等級切成區塊,各自算出更正碼字,然後把所有區塊的第 i 個碼字排在一起。一杯咖啡潑上去、一根手指壓住一角,毀掉的是空間上相鄰的模組;交錯之後那一片連續的損壞被分攤成每個區塊少數幾個錯誤,而少數幾個錯誤才是 Reed–Solomon 修得動的量。補滿用的是規格點名的 0xEC 與 0x11 交替,不是補零——補零也合法,但實務上每一個編碼器都輸出這兩個值,跟著寫才能把輸出拿去跟別人的編碼器逐位元組比對。',
        en: 'The arithmetic runs in GF(256): bytes modulo x^8 + x^4 + x^3 + x^2 + 1, which in code is an XOR with 0x11d on overflow, with exponent and log tables built once, and a special case for zero because the log table cannot express it. Each block\'s check codewords are the remainder of the data times x^n divided by the generator polynomial, systematic, so the data passes through unchanged. Interleaving is what makes them worth having: a coffee stain destroys spatially adjacent modules, and spreading every block\'s codewords across the symbol turns one continuous burst into a few errors per block, which is the amount Reed-Solomon can repair. Padding uses the alternating 0xEC and 0x11 the standard names, so the output can be compared byte for byte with another encoder.',
      },
      {
        zh: '遮罩是照規格選的,不是挑一個好看的:八種遮罩全部建出來,每一個用四條罰分規則算分,取總分最低的那一個。四條規則分別是同色連續五個以上的線段(每多一個加一分)、每一個 2×2 同色方塊、以及那個最重要的第三條——與 finder 圖樣同比例的 1:1:3:1:1 加上一側四個淺色模組,寫成 1011101 0000 這個十一位元的滑動視窗,橫向與縱向、兩個方向都掃,因為那正是解碼器找定位圖樣時會誤認的東西,單獨罰四十分——最後是深色模組比例偏離一半的程度,每偏離 5% 加十分。算八次的成本是在最大 57×57 的矩陣上跑八趟,實務上等於零,而它就是「每一台掃描器都掃得到」與「只有當初測試的那支手機掃得到」的差別。四個分項在介面上分開列出,因為一個總分在符號掃不出來的時候什麼都告訴不了你。format 資訊是 5 個資料位元加 BCH(15,5) 的餘式,再 XOR 0x5412,那個 XOR 的用途是讓全白的符號不會構成一個合法的表頭;version 7 以上另外有 18 位元的版本資訊,BCH(18,6)。',
        en: 'The mask is chosen the way the standard says: build all eight, score each with the four penalty rules, keep the lowest total. Rule three is the one that matters — the 1:1:3:1:1 finder ratio with four light modules beside it, written as the literal eleven-bit window 1011101 0000 and scanned in both orientations, because that is exactly what a decoder\'s finder search trips over. Eight passes over at most 57 by 57 modules costs nothing, and it is the difference between a code that scans everywhere and one that scans on the phone it was tested with. The four sub-scores are listed separately, since a single total explains nothing when a symbol reads badly.',
      },
      {
        zh: '把內容變成 payload 的那幾個樣板,每一個都是在跟現實妥協。WIFI: 那個格式不是 ISO 也不是 IETF 的東西,它是 Android 的 ZXing 年代長出來的慣例,iOS 11 之後才跟進,所以欄位順序照慣例寫成 T、S、P、H——有些讀取器是按位置解析而不是按鍵解析的;反斜線、分號、逗號、冒號與雙引號都要轉義,因為它們在那個格式裡是結構字元,SSID 裡有一個分號就足以讓整段解析錯位。vCard 寫 3.0 而不是 4.0,理由是手機的聯絡人匯入器接受 3.0,好幾款會直接無聲忽略 4.0;空欄位是整行不輸出而不是輸出一個空值,因為一行空的 TEL 會讓某些匯入器拒收整張名片。網址只在明顯沒有 scheme 的時候補上 https://,因為一個光禿禿的 example.com 在不同讀取器上是擲硬幣——有的補 http、有的當搜尋關鍵字、有的直接顯示原字串;而 mailto:、tel: 這些已經有 scheme 的一律照原樣留著,去猜一個已經正確的 payload 只會把它弄壞。麻煩的是 scheme 的字元集允許點與減號,所以 example.com:8080/path 與 localhost:3000 在文法上完全符合「有 scheme」,補不補全靠額外判斷:冒號前面要像主機(有點,或就叫 localhost)、冒號後面要像埠(1 到 65535 的數字,一路到結尾或第一個 /、?、#),兩個條件同時成立才當成主機加埠號補上 https://——這樣 tel:0212345678 不會被誤動,十位數的電話號碼不是埠號。輸出的 SVG 是把每一列連續的深色模組合成一條 path 指令,不是一個模組一個 rect:後者是最直覺的寫法,產生的檔案大好幾倍,而且有些編輯器開不動;合併之後一個 version 10 的符號只有兩三 KB。四個模組寬的靜空區照規格留著,那不是留白美學,是解碼器需要的。',
        en: 'The payload templates are all compromises with reality. WIFI: is not an ISO or IETF format but a de-facto one from the ZXing days that iOS 11 adopted, so the field order stays conventional because some readers parse positionally, and the five structural characters are escaped — one semicolon in an SSID misaligns the whole string. vCard is 3.0, not 4.0, because phone importers accept 3.0 and several ignore 4.0 in silence, and empty fields are omitted entirely since a blank TEL line makes some importers reject the card. A scheme is added only when there plainly is none — with one correction, because the scheme charset allows dots and hyphens, so `example.com:8080/path` and `localhost:3000` satisfy the grammar: https:// is added when the part before the colon looks like a host and the part after it looks like a port, which leaves `tel:0212345678` alone. The SVG merges each row\'s dark runs into one path instead of a rect per module, which keeps a version-10 symbol at a couple of kilobytes, and the four-module quiet zone is there because decoders need it.',
      },
    ],
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
