import type { Localized } from './projects';

/**
 * Captions for the picture wall — the derivative half of the joke.
 *
 * The artwork underneath is CC0 public domain (see art-plates.ts); the
 * caption is original. Pairing is random per load, so N paintings times M
 * captions gives a wall that is never quite the same twice.
 *
 * House rules for adding lines:
 *   - about the work, never about a person
 *   - nothing that discloses a client's system or a live security issue
 *   - if it did not actually happen to me, it has to at least be true of the job
 */
export const CAPTIONS: Localized[] = [
  { zh: '當 PM 說「這個應該很快吧」', en: 'When the PM says "this should be quick, right?"' },
  { zh: '他說「只是改一個字」', en: 'He said it was "just one word"' },
  { zh: '需求變更在你按下 merge 的三秒後抵達', en: 'The spec change lands three seconds after you hit merge' },
  { zh: '凌晨三點四十七分,同一支 stack trace', en: '03:47. Same stack trace.' },
  { zh: '單元測試全綠,而功能是壞的', en: 'All tests green. Feature broken.' },
  { zh: '在 staging 上一切正常', en: 'It works on staging' },
  { zh: '部署完才想起來忘了跑 migrate', en: 'Deployed. Then remembered the migration.' },
  { zh: '你花兩小時寫腳本,省下五分鐘的手動作業', en: 'Two hours of scripting to save five minutes of clicking' },
  { zh: '當你終於看懂原作者為什麼那樣寫', en: 'When you finally understand why the original author did that' },
  { zh: '當你發現原作者就是三個月前的你', en: 'When the original author turns out to be you, three months ago' },
  { zh: '接手一份沒有交接的 codebase', en: 'Inheriting a codebase with no handover' },
  { zh: '有人問你為什麼不拆微服務', en: 'Someone asks why you did not split it into microservices' },
  { zh: '有人問你為什麼要拆微服務', en: 'Someone asks why you split it into microservices' },
  { zh: '使用者回報:「它就是壞掉了」', en: 'Bug report, in full: "it is broken"' },
  { zh: '你請他截圖,他傳來一張拍螢幕的照片', en: 'You ask for a screenshot. You get a photo of a screen.' },
  { zh: '「在我電腦上可以跑」', en: '"Works on my machine"' },
  { zh: '你打開兩年前的專案,它不能跑', en: 'You open a two-year-old project. It does not run.' },
  { zh: '那個 TODO 你決定明天再處理,那是去年的事', en: 'That TODO you would get to tomorrow. Last year.' },
  { zh: '這次一定要先寫測試', en: 'This time we write the tests first' },
  { zh: '你在寫 README,而不是在寫功能', en: 'Writing the README instead of the feature' },
  { zh: '當有人稱讚你的 commit message', en: 'When someone compliments your commit message' },
  { zh: 'Excel 認為自己才是真正的資料庫', en: 'The spreadsheet believes it is the database' },
  { zh: '客戶說:「跟上次一樣就好」', en: '"Just like last time," says the client' },
  { zh: '老師問:「可以順便加個報表嗎」', en: '"Could you also add a report?"' },
  { zh: '會議本來可以是一封信', en: 'This meeting could have been an email' },
  { zh: '你把 CHANGELOG 補寫完,日期跟 commit 對不上', en: 'You backfill the CHANGELOG. The dates do not match the commits.' },
  { zh: '你盯著兩千多筆匯入失敗,想起自己沒寫防呆', en: 'Two thousand failed rows, and you remember skipping the guard' },
  { zh: '你發現欄位叫 url,而程式讀的是 file_name', en: 'The column is url. The code reads file_name.' },
  { zh: '你把那支五千行的檔案拆完了', en: 'You finished splitting the five-thousand-line file' },
  { zh: '伺服器半夜起不來,而你是唯一有 SSH key 的人', en: 'The server dies at 2am and you hold the only SSH key' },
  { zh: '你在 production 下 SELECT,忘了加 LIMIT', en: 'SELECT in production. No LIMIT.' },
  { zh: '畢業專題的 repo 沒有 .gitignore', en: 'The student project repo has no .gitignore' },
  { zh: '你移除了一個套件,網站變快了', en: 'You removed a dependency and the site got faster' },
  { zh: '當你要在履歷上解釋這一年做了什麼', en: 'Explaining what you did this year, on one line of a CV' },
  { zh: '你為了一個功能熬夜,隔天忘了為什麼重要', en: 'You stayed up for that feature. By morning you forgot why it mattered.' },
  { zh: '你答應自己今天會早睡', en: 'You promised yourself an early night' },
  { zh: '文件寫著「應該不會有人這樣用」', en: 'The docs said "nobody would do that"' },
  { zh: '有人這樣用了', en: 'Somebody did that' },
  { zh: '你把預設從「先允許」改成「先拒絕」', en: 'You flipped the default from allow to deny' },
  { zh: '第一次有真的使用者在用你寫的東西', en: 'The first time a real person uses something you built' },
];
