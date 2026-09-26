import type { ToolNote } from './index';

/** Drawer F — "how it works" prose for the indexable tools in this drawer. */
export const TIME_NOTES: Record<string, ToolNote> = {
  timezone: {
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
