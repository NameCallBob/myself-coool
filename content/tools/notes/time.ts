import type { ToolNote } from './index';

/** Drawer TIME — "how it works" prose for the indexable tools in this drawer. */
export const TIME_NOTES: Record<string, ToolNote> = {
  timezone: {
    body: [
      {
        zh: '這裡沒有打包任何時區表。所有偏移都是問瀏覽器的:用 Intl.DateTimeFormat 把同一個時刻格式化到目標時區,再把讀回來的年月日時分當成 UTC 減掉原本的時刻,差值就是那一刻的偏移。這樣做的理由很實際——IANA 的時區資料庫一年改好幾次(某個國家宣布廢除日光節約、某個地區換偏移),打包在網站裡的表會過期,而瀏覽器的表會隨著瀏覽器更新。代價是這一頁的答案取決於使用者的瀏覽器有多舊。',
        en: 'No zone table is bundled here. Every offset is read back from the browser: the same instant is formatted into the target zone, and the returned wall clock read as if it were UTC gives the offset by subtraction. The IANA database changes several times a year, so a bundled table rots while the browser’s own updates with the browser. The trade is that the answer depends on how old that browser is.',
      },
      {
        zh: '真正麻煩的是反方向。「某地當地時間下午兩點半是哪一刻」沒有對應的 API,只能猜再驗:先用那個當地時間當成 UTC 去問偏移,換算出一個候選時刻,然後把候選時刻再格式化回去,看看是不是真的等於你要的當地時間。一年裡有兩個小時會驗不過——時鐘往前跳的那一小時根本不存在,時鐘往後撥的那一小時會出現兩次。這頁不會偷偷選一個,而是標成「不存在」或「出現兩次」,因為那正是會議被行事曆莫名挪走一小時的原因。',
        en: 'The other direction is the hard one. There is no API for "what instant is 14:30 local", so the tool guesses and verifies: convert with the offset at the naive instant, then format the candidate back and check it really is the wall clock you asked for. Two hours a year fail that check — the hour skipped when clocks jump forward does not exist, and the hour repeated when they go back happens twice. Rather than silently picking one, the page labels it, because that ambiguity is exactly why a meeting sometimes moves by an hour on its own.',
      },
      {
        zh: '日光節約沒有旗標可以讀,所以是比出來的:拿同一年一月和七月的偏移,取較小的當成標準時間,現在的偏移比它大就是夏令時間。南北半球都適用,不換時間的時區一月和七月相同,就永遠不會被標記。「日期差」那一欄同理——它不是時差除以二十四,而是把兩地的年月日換成日數相減,所以看到 −1 就真的是對方還在昨天。',
        en: 'Nothing exposes a DST flag, so it is inferred: compare January and July of the same year, take the smaller offset as standard time, and anything larger is summer time. That reads correctly in both hemispheres, and a zone that never shifts has January equal to July and is never flagged. The date-shift column works the same way — civil dates converted to day numbers and subtracted, so a −1 really does mean the other person is still on yesterday.',
      },
      {
        zh: '半小時與四十五分鐘的時區不是例外情況,是正常情況:印度 +05:30、尼泊爾 +05:45、南澳 +09:30、查塔姆群島 +12:45。偏移一律以分鐘儲存、以 ±HH:MM 顯示,所以這些地方不會被四捨五入到最近的整點——那種錯誤在排會議時剛好會讓人晚到十五分鐘。',
        en: 'Half-hour and quarter-hour zones are not edge cases: India at +05:30, Nepal +05:45, South Australia +09:30, the Chathams +12:45. Offsets are held in minutes and shown as ±HH:MM, so none of them get rounded to the nearest hour — the kind of error that makes someone fifteen minutes late to a call.',
      },
    ],
    limits: [
      {
        zh: '只處理現代日期。1970 年以前許多地方用的是地方平時,偏移不是整分鐘,這裡會四捨五入到分鐘;要查歷史時刻請找專門的資料庫。',
        en: 'Modern dates only. Before about 1970 many places kept local mean time on non-integer offsets, which are rounded to the minute here. Historical instants need a dedicated database.',
      },
      {
        zh: '「接下來一年內的偏移變更」只往後掃 400 天,而且每個時區只找第一次變更;它也預測不了還沒公告的規則改變,那要等瀏覽器更新時區資料。',
        en: 'The upcoming-changes table scans 400 days and reports only the first change per zone. It cannot predict rule changes that have not been published; those arrive with a browser update.',
      },
      {
        zh: '要找「大家都醒著的時段」請用 F07 跨時區會議時段,它把每個人的上班時間疊起來;要算兩個日期之間的工作日請用 F02。',
        en: 'To find hours that suit everyone, use F07, which overlays working hours. For working days between two dates, use F02.',
      },
    ],
  },
};
