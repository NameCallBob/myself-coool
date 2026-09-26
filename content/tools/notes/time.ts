import type { ToolNote } from './index';

/** Drawer F — "how it works" prose for the indexable tools in this drawer. */
export const TIME_NOTES: Record<string, ToolNote> = {
  timezone: {
    body: [
      {
        zh: '這裡沒有打包任何時區表。偏移是問出來的:用 Intl.DateTimeFormat 把一個時刻格式化到目標時區,把讀回來的年月日時分當成 UTC,再減掉原本的時刻,差值就是那一刻的偏移。理由很實際——IANA 時區資料庫一年改好幾次,打包在網站裡的表會過期,瀏覽器的表會隨著瀏覽器更新;代價是這一頁的答案取決於使用者的瀏覽器有多舊。偏移一律以分鐘保存、以 ±HH:MM 顯示,所以印度 +05:30、尼泊爾 +05:45、南澳 +09:30、查塔姆群島 +12:45 不會被湊成整點,排會議時也就不會莫名晚十五分鐘。城市清單同樣來自瀏覽器的 Intl.supportedValuesOf,但那份清單跟著 CLDR 走,把加爾各答列成 Asia/Calcutta、胡志明市列成 Asia/Saigon,而且不含 UTC,所以選單裡另外併進一份常用城市名單,兩種寫法都查得到。',
        en: 'No zone table is bundled. Every offset is read back from the browser: format one instant into the target zone, read the returned wall clock as if it were UTC, subtract. The IANA database changes several times a year, so a bundled table rots while the browser’s updates with the browser — at the cost of depending on how old that browser is. Offsets are held in minutes and shown as ±HH:MM, so +05:30, +05:45, +09:30 and +12:45 survive intact.',
      },
      {
        zh: '反方向才是麻煩的那一邊:「某地當地時間下午兩點半是哪一刻」沒有對應的 API。做法是取那個當地時間前後各一天的偏移——跨過一整天,是為了讓當天任何一次換時間都被夾在中間——用這兩個偏移各算出一個候選時刻,再把候選格式化回目標時區,檢查它是不是真的等於你輸入的那組數字。只拿當地時間本身那一刻的偏移去猜並不夠,重複的那一小時它只找得到其中一次。驗證有三種結果:恰好一個候選通過,是一般情況;零個通過,表示時鐘往前跳、這個當地時間根本不存在,頁面會講明並顯示跳完之後的第一個時刻;兩個都通過,表示時鐘往後撥、這一小時出現兩次,頁面取較早的那次並標出偏移。一年就這兩個小時會如此,而它們正是會議偶爾被行事曆自己挪走一小時的原因。',
        en: 'The other direction is the hard one: nothing answers "which instant is 14:30 there". Both offsets in force a day either side are tried, each candidate verified by formatting it back. One match is the ordinary case; zero means clocks jumped and that wall clock does not exist; two means the hour repeats. The page names the case instead of silently picking one.',
      },
      {
        zh: '日光節約沒有旗標可讀——Intl 不會告訴你此刻是不是夏令時間——所以是比出來的:取同一年一月一日與七月一日的偏移,較小的那個當標準時間,當下偏移大於它就標記為夏令。南北半球都成立,而不換時間的時區一月等於七月,於是永遠不會被標記。旁邊的日期差也不是時差除以二十四:兩地的年月日各自換算成 1970 年以來的日數(Hinnant 的 days_from_civil)再相減,所以看到 −1 就真的是對方還停在昨天。',
        en: 'Nothing exposes a DST flag, so it is inferred: compare 1 January and 1 July of the same year, treat the smaller offset as standard time, flag anything larger. That reads correctly in both hemispheres, and a zone that never shifts has January equal to July. The date-shift column subtracts civil day numbers rather than dividing the offset by 24.',
      },
      {
        zh: '「接下來的偏移變更」那張表,掃法有點刻意。直覺的寫法是在未來一年上二分搜尋「偏移是否仍等於現在」的邊界,但這個條件在一年的區間上不是單調的:它在第一次換時間時變假,第二次換回來時又變真。二分法因此可能落進後面那段為真的區間,回報一年後的那次變更;三月讀雪梨、十月讀柏林,錯的就是這樣錯。現在改成以一週為步長往前掃,找出第一個末端偏移不同的那一週,只在那一週內二分——一週之內條件確實單調,結果才可信。掃滿一年大約六十次格式化呼叫,而 Intl.DateTimeFormat 貴在建構而不在使用,所以每個時區的格式化器都快取;抓到之前,時鐘每跳一秒就重建一次時區縮寫的格式化器,那一項占了讀整張表將近一半的成本。',
        en: 'The upcoming-changes scan steps forward a week at a time and bisects only inside the first week whose end offset differs. Bisecting the whole year is unsound: "still the starting offset" goes false at the first transition and true again at the second, so a whole-range bisection can land in that second stretch and report a change a year out — which is how Sydney in March and Berlin in October came back wrong. A year costs about sixty formatter reads, and formatters are cached per zone because constructing them is the expensive part.',
      },
    ],
    limits: [
      {
        zh: '只認現代日期。1970 年以前許多地方用的是地方平時,偏移不是整分鐘,這裡一律四捨五入到分鐘;查歷史時刻請找專門的時區資料庫。',
        en: 'Modern dates only. Before roughly 1970 many places kept local mean time on non-integer offsets, which are rounded to the minute here.',
      },
      {
        zh: '變更表只往後掃 400 天,而且每個時區只回報第一次變更。它也預測不了還沒公告的規則改變——那要等瀏覽器更新時區資料,不是等這個網站更新。',
        en: 'The change table scans 400 days and reports only the first change per zone. Unpublished rule changes arrive with a browser update, not with a deploy of this site.',
      },
      {
        zh: '要找「大家都醒著」的時段請用 F07 跨時區會議時段,它把每個人的上班時間疊起來看重疊;要算兩個日期之間的工作日請用 F02。',
        en: 'For hours that suit everyone, use F07, which overlays working hours. For working days between two dates, use F02.',
      },
    ],
  },
};
