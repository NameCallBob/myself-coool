# 經歷流程圖

> 依 2026-09-12 使用者口述補充重繪。這張圖同時是 `/about` 的敘事骨架,
> 也是「投影布」改版裡預計佔一整張投影片的主視覺。

```mermaid
flowchart TD
    START["起點<br/><i>待補</i>"]:::todo

    ECO["<b>環飽 EcoBǎo</b><br/>剩食訂購平台<br/><small>大三</small>"]:::proj
    CDRI["<b>商業發展研究院</b><br/>系統撰寫"]:::org
    DIGI["<b>DIGI⁺Talent</b><br/>代表商研院發表<br/><small>2023</small>"]:::org
    SRV["<b>伺服器管理</b><br/>Ubuntu · web server 架設與調參<br/>系統安裝 · VM 開設管理"]:::skill
    NOW_SRV["至今仍在顧"]:::skill

    MUSEUM["<b>四時煮食時</b><br/>科工館 × 教育部<br/>AI 健康應用計畫<br/><small>2024</small>"]:::proj

    IAC{"<b>產學合作案</b>"}:::gate
    SY["<b>新揚科技</b><br/>機器學習<br/><small>具名與否待確認</small>"]:::proj
    NAILY["<b>Naily 平台</b><br/>後端 80% · 前端 40%"]:::proj
    WARR["保固期<br/>到公司做後續"]:::gate

    ALUMNI["<b>系友會平台</b><br/>老師找我接<br/><small>2024/08</small>"]:::proj
    ALUMNI_W["default-deny 翻轉<br/>SEC-001 ~ SEC-030<br/>aaic.nkust.edu.tw 上線"]:::note

    PTJOB["<b>系上工讀</b><br/>借還設備是我的工作"]:::org
    BORROW["<b>設備借用系統</b><br/>舊系統簡陋且無原始碼<br/>→ 重做一套<br/><small>equipment-borrowing.binbinbob.work</small>"]:::proj

    JOB["<b>日秀美學 · 全端開發</b><br/><small>2025/06 —</small>"]:::org
    HRIS["HRIS 多租戶 SaaS<br/>36 模組 · 241 models · 728 端點"]:::proj
    CONSOLE["營運後台前端"]:::proj
    APP["<b>NailyApp</b> 前端接手<br/><small>2025/11 —</small>"]:::proj

    START --> ECO
    ECO --> CDRI --> DIGI
    ECO --> SRV --> NOW_SRV
    DIGI --> MUSEUM
    MUSEUM --> IAC
    IAC --> SY
    IAC --> NAILY --> WARR --> JOB
    MUSEUM --> ALUMNI --> ALUMNI_W
    ECO -.-> PTJOB --> BORROW
    JOB --> HRIS
    JOB --> CONSOLE
    JOB --> APP

    classDef proj fill:#fff,stroke:#a31621,stroke-width:2px,color:#1a1714
    classDef org fill:#f2efe8,stroke:#5e574e,stroke-width:1.5px,color:#1a1714
    classDef skill fill:#fff,stroke:#2a7d7f,stroke-width:2px,color:#1a1714
    classDef gate fill:#a31621,stroke:#a31621,color:#faf8f4
    classDef note fill:#faf8f4,stroke:#c9c2b6,stroke-dasharray:4 3,color:#5e574e
    classDef todo fill:#faf8f4,stroke:#c9c2b6,stroke-dasharray:4 3,color:#726a5d
```

## 這張圖修正了什麼

- 舊敘事把 Naily 寫成「接手別人的 codebase」。實際上它是**產學合作案**,
  後端 80%、前端 40% 是你寫的,**保固**才是通往正職的那條邊;
  **NailyApp 是進公司之後(2025/11)才接的**,跟平台是兩件事。
- **伺服器管理**是一條從大三延續至今、站上完全沒出現過的線,圖裡用另一個顏色獨立畫出來。
- **設備借用系統**的來源是你自己的工讀經驗,不是被指派的題目——圖上用虛線把它接回 EcoBǎo 時期。
- 兩個產學案是同一個節點分岔,不是先後關係。
