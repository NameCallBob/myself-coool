import type { ToolNote } from './index';

/** Drawer A — "how it works" prose for the indexable tools in this drawer. */
export const TEXT_NOTES: Record<string, ToolNote> = {
  'text-diff': {
    body: [
      {
        zh: '這裡用的是 Myers 1986 年那篇論文的演算法:它把「把左邊改成右邊最少要動幾下」當成在編輯圖上找最短路徑,複雜度是 O((N+M)·D),D 是實際的差異量。換句話說,兩段很像的文字比得飛快,兩段毫不相干的文字才會慢——而「貼兩段毫不相干的東西」剛好是任何人都會試一次的操作。',
        en: 'This is Myers (1986): the minimum edit script as a shortest path through an edit graph, at O((N+M)·D) in the actual edit distance D. Similar texts compare instantly; unrelated ones are the slow case — which is exactly what everyone tries first.',
      },
      {
        zh: '所以在跑演算法之前會先把兩邊共同的開頭與結尾切掉。真實的修改幾乎都只動中間一小段,切完之後要比的長度常常只剩原本的百分之幾。剩下的部分若還是太大(超過一萬兩千個片段),它會直接告訴你比不動,而不是把你的分頁凍住——那種凍住在瀏覽器裡跟當掉是一樣的,唯一的出路是關掉分頁。',
        en: 'So the shared prefix and suffix come off first. A real edit touches a small middle span, and trimming often leaves a few percent of the original length. If what remains is still too large, the tool says so rather than freezing the tab — in a browser a runaway loop is indistinguishable from a crash.',
      },
      {
        zh: '逐字模式對中文有特別處理:中文沒有空格,若照英文那樣用空白切詞,一整段中文會變成一個片段,改一個字就報告整段被換掉。這裡把中日韓字元逐字切開,標點與全形字元也算在內,所以「一段」改成「兩段」就只會標出那一個字。',
        en: 'Word mode treats CJK per character. Chinese has no spaces, so splitting on whitespace would make a whole paragraph one token and report it entirely replaced over a single character. Splitting ideographs individually keeps the change as small as it actually is.',
      },
    ],
    limits: [
      {
        zh: '比的是文字,不是結構。JSON 或程式碼請用 C05 的結構化比對,它認得欄位順序改變與型別改變。',
        en: 'It compares text, not structure. For JSON use C05, which knows the difference between a reordered key and a changed value.',
      },
      {
        zh: '逐行模式會把 CRLF 與 LF 視為相同,否則一份從 Windows 來的檔案會顯示「每一行都改了」。要專門檢查換行差異請用 B06。',
        en: 'Line mode treats CRLF and LF as equal, or a file from Windows would report every line as changed. To inspect line endings themselves, use B06.',
      },
    ],
  },
};
