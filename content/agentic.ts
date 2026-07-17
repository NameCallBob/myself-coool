/**
 * Content for the /ai page — the agentic engineering write-up.
 * Every claim must trace to a verifiable artifact: a repo file, a commit,
 * an audit document or a live system. Same sourcing rule as projects.ts
 * (see docs/content-request.md).
 */

type Localized = { zh: string; en: string };

type MethodRow = { label: string; vibe: Localized; agentic: Localized };

type Evidence = { ref: string; desc: Localized };

type CaseBlock = {
  no: string;
  label: string;
  title: Localized;
  prose: Localized;
  evidence: Evidence[];
};

export const AGENTIC: {
  intro: Localized[];
  method: { title: Localized; note: Localized; rows: MethodRow[] };
  loop: { caption: Localized };
  cases: CaseBlock[];
  boundaries: { title: Localized; note: Localized; items: Localized[] };
} = {
  intro: [
    {
      zh: '這一頁記錄我怎麼把 AI 寫進開發流程。起點和多數人一樣,是 vibe coding——用一句話描述需求,收下看起來能動的程式碼。這種做法在丟棄式腳本上成立,但放到有真實使用者的系統就會失效:產出不可重現、錯誤藏在沒人讀過的程式碼裡,而且沒有任何東西擋在 AI 與生產環境之間。',
      en: "This page documents how AI actually fits into my development process. Like most people I started with vibe coding — describe what you want in a sentence, accept whatever code appears to run. That holds for throwaway scripts and breaks down on systems with real users: output isn't reproducible, bugs hide in code nobody read, and nothing stands between the AI and production.",
    },
    {
      zh: '現在的做法是把 agent 當成需要被工程化管理的協作者:規格先行、上下文受控,每一次產出都要通過驗證迴圈與人工審核才算數。下面是這套方法的拆解,以及它實際運作的兩個場域——本網站,和兩個在高科大生產環境運行的系統。',
      en: 'The approach now treats agents as collaborators that need engineering management: specs come first, context is controlled, and no output counts until it clears a verification loop and human review. Below is the method itself, and the two places it demonstrably runs — this website, and two systems in production at NKUST.',
    },
  ],

  method: {
    title: { zh: '從 vibe 到 agentic', en: 'From vibe to agentic' },
    note: {
      zh: '差別不在用不用 AI,而在流程有沒有工程性質:可驗證、可重現、有人負責。',
      en: "The difference isn't whether AI is used — it's whether the process has engineering properties: verifiable, reproducible, with a human accountable.",
    },
    rows: [
      {
        label: 'SPEC',
        vibe: {
          zh: '一句話需求,規格邊生成邊想。',
          en: 'One-line prompts; requirements invented mid-generation.',
        },
        agentic: {
          zh: '先寫規格與驗收條件,agent 對著規格工作,偏離就退回。',
          en: 'Spec and acceptance criteria first; the agent works against them and gets sent back on drift.',
        },
      },
      {
        label: 'CONTEXT',
        vibe: {
          zh: '每次對話從零開始,重複解釋專案。',
          en: 'Every conversation starts from zero, re-explaining the project.',
        },
        agentic: {
          zh: 'AGENTS.md 與跨 session 記憶:專案慣例、硬性禁令與歷史決策都在 agent 的上下文裡。',
          en: 'AGENTS.md plus cross-session memory: conventions, hard constraints and past decisions ride along in context.',
        },
      },
      {
        label: 'VERIFY',
        vibe: {
          zh: '「看起來能跑」就採用。',
          en: "“Looks like it runs” is the bar.",
        },
        agentic: {
          zh: '測試、E2E、無障礙與效能門檻構成迴圈;不過關就退回 agent 重做,而不是由我手動收尾。',
          en: 'Tests, E2E, accessibility and performance gates form a loop; failures go back to the agent instead of being hand-patched.',
        },
      },
      {
        label: 'REVIEW',
        vibe: {
          zh: '產出直接進 codebase。',
          en: 'Output lands in the codebase unread.',
        },
        agentic: {
          zh: '人工審核是必經關卡:每個階段通過審核,才進下一階段。',
          en: 'Human review is a hard gate: each phase ships only after sign-off.',
        },
      },
      {
        label: 'REPRODUCE',
        vibe: {
          zh: '結果是一次性的,換個專案就重來。',
          en: 'Results are one-off; the next project starts over.',
        },
        agentic: {
          zh: '規格與流程本身是文件,同一套方法可以在下一個系統重跑。',
          en: 'The spec and the process are themselves documents; the same method reruns on the next system.',
        },
      },
    ],
  },

  loop: {
    caption: {
      zh: '開發迴圈:驗證不通過退回 agent;人工審核擋在 commit 之前。',
      en: 'The development loop: failed verification returns to the agent; human review gates every commit.',
    },
  },

  cases: [
    {
      no: '03',
      label: 'EVIDENCE / THIS SITE',
      title: { zh: '本網站:流程本身就是產物', en: 'This website: the process is the artifact' },
      prose: {
        zh: '這個網站以十階段流程開發——研究、資訊架構、線框、視覺、動效、SEO、前端架構、開發、驗證、驗收——每階段先產出文件,經人工審核通過才進入下一階段。案例內容也不是手寫的行銷稿:先訂取材規格,派 agent 進四個專案 repo 逐一核實,再依核實結果改寫,數字以 repo 為準。整個過程留在公開的 git 歷史裡,可以逐條驗證。',
        en: "This site was built through a ten-phase process — research, IA, wireframes, visual design, motion, SEO, frontend architecture, build, verification, acceptance — each phase producing a document that had to pass review before the next began. The case studies aren't hand-written marketing either: a sourcing spec came first, agents were dispatched into each project repo to verify facts, and the write-ups were rebuilt from what survived verification. All of it sits in public git history.",
      },
      evidence: [
        {
          ref: 'docs/phase-1…7',
          desc: {
            zh: '每一階段的規格與審核文件——流程本身留有紀錄。',
            en: 'Per-phase spec and review documents — the process left a paper trail.',
          },
        },
        {
          ref: 'docs/content-request.md',
          desc: {
            zh: '內容取材規格:agent 進各專案 repo 核實事實後,case study 才據以改寫。',
            en: 'Content-sourcing spec: case studies were rewritten only from repo-verified facts.',
          },
        },
        {
          ref: 'AGENTS.md · memory',
          desc: {
            zh: 'agent 帶著專案慣例、硬性禁令與跨 session 的決策紀錄工作。',
            en: 'Agents work with project conventions, hard constraints and cross-session decisions in context.',
          },
        },
        {
          ref: 'commit 7fd3e21',
          desc: {
            zh: '驗證迴圈實例:對比度檢測出 3.13:1,修至 WCAG AA(≥ 4.5:1)。',
            en: 'Verification loop in action: a contrast audit caught 3.13:1, fixed to WCAG AA (≥ 4.5:1).',
          },
        },
        {
          ref: 'commit bf3fa85',
          desc: {
            zh: '效能門檻實例:案例截圖轉 WebP,1.5 MB → 218 KB(−86%)。',
            en: 'Performance gate in action: case-study screenshots to WebP, 1.5 MB → 218 KB (−86%).',
          },
        },
        {
          ref: 'github.com/NameCallBob',
          desc: {
            zh: '原始碼與完整 commit 歷史公開可查。',
            en: 'Source and full commit history are public.',
          },
        },
      ],
    },
    {
      no: '04',
      label: 'EVIDENCE / PRODUCTION',
      title: {
        zh: '校園系統:有守門,agent 才碰生產',
        en: 'Campus systems: agents touch production only behind gates',
      },
      prose: {
        zh: '兩個系統——高科大系友會平台與設備借用系統——有真實使用者,所以 agent 的每一次修改都先過守門:借用系統的 repo 內有自己的 AGENTS.md,1,112 個後端測試與 RWD 驗證器擋在合併之前。系友會平台的資安修補則以六階段稽核管線進行:系統理解、前後端 findings、修補 backlog、「已驗證修復」與「待驗證」分流,最後才落地。UIUX 也用同一套方法在兩個系統各跑一輪:頁面盤點、Top 30 問題、上線阻斷項、修復清單。',
        en: 'Both systems — the NKUST alumni platform and the equipment-borrowing system — have real users, so every agent change clears gates first: the borrowing repo carries its own AGENTS.md, with 1,112 backend tests and an RWD validator standing before merge. Security hardening on the alumni platform ran as a six-stage audit pipeline — system understanding, backend and frontend findings, a remediation backlog, verified-fix versus needs-verification triage, then rollout. UI/UX got the same treatment on each system: page inventory, top-30 issues, launch blockers, fix list.',
      },
      evidence: [
        {
          ref: 'SECURITY_REVIEW',
          desc: {
            zh: '六份文件的稽核管線:SEC-001–030 修補,權限模型翻轉為 default-deny。',
            en: 'Six-document audit pipeline: SEC-001–030 remediations; permission model flipped to default-deny.',
          },
        },
        {
          ref: 'UIUX_AUDIT × 2',
          desc: {
            zh: '兩個系統各一輪:頁面盤點 → Top 30 → 上線阻斷 → 修復清單。',
            en: 'One full pass per system: page inventory → top 30 → launch blockers → fix list.',
          },
        },
        {
          ref: 'AGENTS.md(borrow)',
          desc: {
            zh: 'repo 內建的 agent 工作規範:結構、測試指令、命名與提交慣例。',
            en: 'In-repo agent playbook: structure, test commands, naming and commit conventions.',
          },
        },
        {
          ref: '1,112 tests · RWD',
          desc: {
            zh: 'agent 產出的守門:後端整合測試,加上 Puppeteer RWD 驗證。',
            en: 'The gates agent output must clear: backend integration tests plus a Puppeteer RWD validator.',
          },
        },
        {
          ref: 'aaic.nkust.edu.tw',
          desc: {
            zh: '兩系統上線中:系友會平台,與 equipment-borrowing.binbinbob.work。',
            en: 'Both systems are live: the alumni platform, and equipment-borrowing.binbinbob.work.',
          },
        },
      ],
    },
  ],

  boundaries: {
    title: { zh: '界線', en: 'Boundaries' },
    note: {
      zh: '哪些事不交給 agent——這一節和前面的流程一樣重要。',
      en: "What agents don't get to do — as important as the loop itself.",
    },
    items: [
      {
        zh: '架構與資料模型的決策不外包:agent 提供選項與分析,取捨由我決定並記錄下來。',
        en: 'Architecture and data-model decisions are not outsourced: agents propose options and analysis; I make the call and record it.',
      },
      {
        zh: '個資與公司內部資料不進 agent 的上下文;要公開的內容一律先做保密邊界處理。',
        en: 'Personal data and company-internal material never enter agent context; anything published is scrubbed to a confidentiality boundary first.',
      },
      {
        zh: '產出不等於完成:通過測試、E2E 與人工審核才算數;資安修補必經人工確認才上線。',
        en: 'Output is not done: it counts only after tests, E2E and human review — and security fixes ship only after manual confirmation.',
      },
    ],
  },
};
