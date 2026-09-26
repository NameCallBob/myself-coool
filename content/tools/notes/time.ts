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
        zh: '反方向才是麻煩的那一邊:「某地當地時間下午兩點半是哪一刻」沒有對應的 API。做法是取那個當地時間前後各一天的偏移——跨過一整天,是為了讓當天任何一次換時間都被夾在中間——用這兩個偏移各算出一個候選時刻,再把候選格式化回目標時區,檢查它是不是真的等於你輸入的那組數字。只拿當地時間本身那一刻的偏移去猜並不夠,重複的那一小時它只找得到其中一次。驗證有四種結果:恰好一個候選通過,是一般情況;兩個都通過,表示時鐘往後撥、這一小時出現兩次,頁面取較早的那次並標出偏移;零個通過而前後兩天的偏移不同,表示時鐘往前跳、這個當地時間根本不存在,頁面會講明並顯示跳完之後的第一個時刻。一年就這兩個小時會如此,而它們正是會議偶爾被行事曆自己挪走一小時的原因。第四種是零個通過、前後兩天偏移卻相同——那天沒有任何跳躍,對不回去的原因在別處(見下方界線),頁面就不會謊稱它是被跳過的一小時,而是標明「找不到完全對應的時刻」並給出最接近的一刻。',
        en: 'The other direction is the hard one: nothing answers "which instant is 14:30 there". Both offsets in force a day either side are tried, each candidate verified by formatting it back. One match is the ordinary case; two means the hour repeats; zero, with the two probes disagreeing, means clocks jumped and that wall clock does not exist. Zero with both probes agreeing is not a jump at all — the page says no exact instant was found and shows the nearest, rather than claiming an hour was skipped. It names the case instead of silently picking one.',
      },
      {
        zh: '日光節約沒有旗標可讀——Intl 不會告訴你此刻是不是夏令時間——所以是比出來的:取同一年一月一日與七月一日的偏移,較小的那個當標準時間,當下偏移大於它就標記為夏令。南北半球都成立,而不換時間的時區一月等於七月,於是永遠不會被標記;代價是遇到不隨季節走的換時間(摩洛哥的齋月)就會歪,下面的界線有寫。旁邊的日期差也不是時差除以二十四:兩地的年月日各自換算成 1970 年以來的日數(Hinnant 的 days_from_civil)再相減,所以看到 −1 就真的是對方還停在昨天。',
        en: 'Nothing exposes a DST flag, so it is inferred: compare 1 January and 1 July of the same year, treat the smaller offset as standard time, flag anything larger. That reads correctly in both hemispheres, and a zone that never shifts has January equal to July; it bends for shifts that are not seasonal, which the limits below spell out. The date-shift column subtracts civil day numbers rather than dividing the offset by 24.',
      },
      {
        zh: '「接下來的偏移變更」那張表,掃法有點刻意。直覺的寫法是在未來一年上二分搜尋「偏移是否仍等於現在」的邊界,但這個條件在一年的區間上不是單調的:它在第一次換時間時變假,第二次換回來時又變真。二分法因此可能落進後面那段為真的區間,回報一年後的那次變更;三月讀雪梨、十月讀柏林,錯的就是這樣錯。現在改成以一週為步長往前掃,找出第一個末端偏移不同的那一週,只在那一週內二分——一週之內條件確實單調,結果才可信。這份掃描是整件工具最貴的部分:400 天的視野是 58 個步長,不換時間的時區因此要 59 次格式化讀取(多的一次是起點偏移),會換的則是走到那一週的步數再加上週內二分的 30 次,最壞約九十次。預設六個時區加起來一次要兩百多次讀取,而偏移一年只變兩次,所以掃描的起點固定對齊到整點:時鐘每跳一秒都重算一次,是拿幾百次格式化去換一個一年只動兩次的答案。同理,Intl.DateTimeFormat 貴在建構而不在使用,所以每個時區的格式化器都快取;抓到之前,時鐘每跳一秒就重建一次時區縮寫的格式化器,那一項占了讀整張表將近一半的成本。',
        en: 'The upcoming-changes scan steps forward a week at a time and bisects only inside the first week whose end offset differs. Bisecting the whole year is unsound: "still the starting offset" goes false at the first transition and true again at the second, so a whole-range bisection can land in that second stretch and report a change a year out — which is how Sydney in March and Berlin in October came back wrong. A 400-day horizon is 58 steps, so a zone that never shifts costs 59 formatter reads and one that does costs about ninety at worst — a couple of hundred for the default six. Offsets change twice a year, so the scan is anchored to the top of the hour rather than rerun on every tick of the clock, and formatters are cached per zone because constructing them is the expensive part.',
      },
    ],
    limits: [
      {
        zh: '只認現代日期。1891 年以前許多地方用的是地方平時,偏移不是整分鐘(巴黎 +00:09:21、都柏林 −00:25:21),這裡一律取到分鐘。後果是那些年份的當地時間換算回去永遠差幾秒、對不回原本輸入,頁面會標成「找不到完全對應的時刻」並給最接近的一刻——不是宣稱那一刻被跳過。要查歷史時刻請找專門的時區資料庫。',
        en: 'Modern dates only. Before 1891 many places kept local mean time on offsets that were not whole minutes (Paris +00:09:21, Dublin −00:25:21) and offsets here are held to the minute. Such a wall clock can never format back exactly, so it is reported as having no exact instant, with the nearest one shown, rather than as a skipped hour.',
      },
      {
        zh: '日期範圍限西元 100 到 275760 年。JavaScript 的 Date 只到距離 1970 年 ±8.64e15 毫秒,再遠就算不出偏移;另一頭,Date.UTC 會把 0 到 99 年當成 1900 到 1999 年,而這裡的格式化器不帶紀元,西元前的年份會被讀回成正數。兩種都是無聲的錯,所以直接拒絕輸入,不假裝算得出來。',
        en: 'Years 100 to 275760 only. JavaScript dates stop at ±8.64e15 ms from 1970, and at the other end Date.UTC maps years 0-99 into 1900-1999 while the formatter here carries no era, so BC years read back positive. Both fail silently, so such input is refused rather than answered.',
      },
      {
        zh: '「日光節約中」是推論,不是資料。Intl 不提供這個旗標,所以拿一月與七月的偏移相比,較小的當標準時間。碰到不隨季節走的時區就會歪:摩洛哥全年 +01、齋月退回 +00,而齋月每年提前約十一天,所以在一月一日落在齋月的年份,整年非齋月的日子都會被標成夏令時間——IANA 本身也是把那些 +01 的月份記成 +00 標準時間上的日光節約,所以這個標記其實跟時區資料庫一致,只是看起來奇怪。反過來的都柏林(IANA 認為它冬天才是偏移過的那一邊)會在任何「修好摩洛哥」的規則下變錯,所以這裡不改規則,只把界線寫在這裡。要準確判斷請看偏移欄位本身,不要只看這個標記。',
        en: 'The DST flag is inferred, not read: Intl exposes no such flag, so January and July are compared and the smaller offset treated as standard. Zones whose shift is not seasonal bend it — Morocco keeps +01 all year and drops to +00 for Ramadan, which drifts, so in years whose 1 January falls inside Ramadan every non-Ramadan day is flagged. IANA models those +01 months as DST over a +00 standard offset, so the flag agrees with the database while reading oddly; and Dublin, the mirror case, breaks under any rule that would unflag Morocco. Read the offset column, not the flag.',
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
