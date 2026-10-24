# PD14 指定目標及恢復操作包 — 2026-10-22

狀態：**BLOCKED_TARGET**。Candidate base 為 PR82 `4b42fdeb`；實作分支 `codex/pd-public-entry-20261022`。最終 source/tree 在 PD15 固定；不沿用舊 PR55 的 target／migration 適用性。

| 必須綁定 | 本次狀態 | 下一個具體操作 |
|---|---|---|
| Target project/container ID、purpose、owner、可丟棄性及許可範圍 | null；沒有指定 staging/owned target | owner 提供 private target reference；交叉核對可信 metadata、解析 host/port/gateway、project identity；origin 相同不足以證明隔離 |
| Auth ownership、redirect/cookie、approved actor set | null | 綁 Creator A/B、公司 A/B owner、marketing/staff、clerk、finance、outsider、ops；不公開 credentials |
| Current schema/history/owners/grants/RLS fingerprint | null；未連 client／未跑 SQL | target gate 通過後才作已授權唯讀比對；source migration inventory 不是 executable delta |
| Source SQL/config delta | 無新 SQL／flag/provider 變更 | 與實際 target 比對後只選必要 additive packet；不重放所有 migrations／CI seed/reset |
| Last-good app、fresh backup及restore/failure rehearsal | null | 依 `scripts/MIGRATION_RELEASE.md` 綁 exact candidate、每檔hash、envelope、備份及一小時freshness gate；未授權前只準備 |
| RPO/RTO 與支援輪值 | null：需 owner 決定 | owner 固定目標後與演練結果比較；不自訂承諾 |
| Storage/Auth/provider recovery coverage | null | DB logical export、Storage bytes、Auth/OAuth/SMTP、passwords、Vault/encryption/provider 各自記涵蓋與缺口 |
| Scheduler、mailbox、provider scope | null／NOT_RUN | 綁收件角色／窗口／owner；PD17 獨立驗收 |

執行順序：確認 exact identity／可丟棄性及授權 → resources → 唯讀 metadata/schema比對 → delta與recovery包 → 該目標owned演練 → PD15固定source → PD16 H01–H14／PS01–PS06 → PD17真dispatch → PD18獨立GO/NO_GO。

準備好的無副作用操作：核對 app source/tree/config keys（不輸出值）、列出 schema fingerprint 所需類別、選擇必要 migration 的個別 SHA256／ordered envelope、綁 approved actor references、定義 receipt及rollback readback。這不是執行 SQL 的授權。

回退：若本次純UI增量未合併，保留draft；已獲准環境的app/capability rollback只使用已記錄last-good版本，不刪trip／proof／receipt／dedupe。Schema 用相容 forward-fix，不 blind downgrade。

原 staging checklist 及 operations ledger 的歷史 FAIL/BLOCKED 均保留。`schema:not_checked` 繼續表示未查。T06/T08/N16、真角色、新session／第二裝置、實機／AT皆未完成。
