# PD16／PD17 main A0 審查 — 2026-10-25

基線為 main `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`／tree `23464c0013b0cecb15984356159c0df21dc80c44`。PR81–90 及該 main 的 owned CI 已完成的紀錄屬原版本，本修正候選須有自己的 final head／tree／CI receipt，不借用舊結果。

已獨立重驗原交付 ZIP：160 entries、159 hashes／CRC，573 個 corresponding-source hashes 與 raw Git bytes 相符；沒有修改原封包。此項證明來源與封包完整性，不解除 hosted／營運停止點。原 2026-10-24 plan／case／requirements／source manifests 保留為歷史 source snapshots，新的進度由本 overlay 及獨立 delivery receipt 綁定。

## 可重現問題與修正

`verifySourceInputs` 原本比對 manifest／metadata hashes 後，直接對每個宣告 name 作 path.resolve。自洽的 capsule 可使用 parent／absolute 路徑讀取 app root 外檔案，也接受 dot／empty-segment alias；path normalization 不能代替 canonical input validation。

五個 filesystem regressions 使用自己建立的 temp root、app 及 unrelated file，沒有真資料或 credentials。原實作為 4 FAIL／1 PASS；parent／absolute 兩案各實際讀取外部 owned file 一次並回 VERIFIED。修正先檢查所有 manifest names 為非空、非 absolute、只用 forward slash 的 canonical 相對路徑，拒絕 colon／NUL／backslash／空或 dot segments，才讀取任何宣告 source input。修正後 5 PASS，outside reads=0。合法 `.env.example`、既有 canonical repo／standalone source 及 SQL-only mapping 的 hash checks 保留。

此工具仍只是 connection-free source／packet preparation。Metadata 不是遠端 commit 簽署或 target authority；沒有增加 SQL、restore、client、schedule 或 provider 能力。Reference strings 不代替 target identity，`authorizedActions:[]`、runtime／full restore NOT_RUN、schema:not_checked 及 D06 null 目標不變。

## 驗收及證據

- 本機 baseline：75 PASS／1 Windows file-symlink SKIP。
- Boundary RED：4 FAIL／1 PASS；GREEN：5 PASS／0 SKIP。
- 相關 source／pilot／subset／cleanup focused suite：80 PASS／1 Windows file-symlink SKIP。
- 完整 Journeys pure suite：1288 PASS／1 Windows file-symlink SKIP，共 1289 cases；Node 24、Windows，單 worker／192MB heap。Head／dirty diff／新檔 fingerprint 存於獨立本機 receipt，不宣稱已測完整最終 commit。
- 新候選仍須自己的 owned Linux CI、source-package／build／typecheck、integration／browser／Auth／performance gates，最後結果綁獨立 delivery receipt。Windows SKIP 不代替 Linux link boundary。

`PD16_PD17_MAIN_REVIEW_REQUIREMENTS_2026-10-25.json` 保留 14 H、6 PS、8 R 的原 hosted／shared rehearsal NOT_RUN，R01／R02 增加此 source-boundary regression reference。Reference 只是覆蓋定位，不能逐案升級為 hosted PASS。Owned reminder ACK-loss／partial-cursor 案例沿用原 port、ownership gate、exact-ID cleanup 及 failure checkpoint；這不代表 shared subset、SQL COMMIT-unknown、Auth／Storage 或 provider 恢復。

## 停止點與交付方式

A0、原 Remix-Kinnso 不變；PD06 403／管理員／schema／keyring、真攻略同意及圖片權利維持 BLOCKED。被拒 endpoint 不重試或繞過；A1–A5 NOT_EXECUTED，不新增 Supabase projects，不作 production／manual Preview deploy。R03 四個 fresh 4-GiB RAM／6-GiB disk 加 container／volume／network／marker／unlinked 身份 gate 保留；本輪 pure-test 資源觀察不代替 R03，沒有啟動 Docker 或 restore。

後續 source PR 可沿用已設 Git deployment hold 的 `codex/pd16-pd17-a0-rehearsal-20261024` remote branch，從其已合併 head 作普通 fast-forward 納入 main 及本增量；push 前須重新核對 exact remote head、ancestry 和三份 hold。原 PR90 及 main commits 保留，新 PR 獨立審查，不自動 merge。沒有擴展任何 provider 設定或 branch protection。

D01 現行 notice；D02／D03／D05／D06=A 的方向不代替真 owner／backup／渠道／角色／收件／排程／交班記錄。RPO／RTO=null、NOT_PROMISED；H／PS hosted 及 R shared rehearsal 仍 NOT_RUN／BLOCKED；T08／N16 OPEN，PD18 NO_GO。剩餘 exact target／owner／權利／role／操作批准由既有 operator pack 接續。本輪 rollback 為審查後普通 source revert，保留 deployment hold、合法資料、immutable versions、receipts 及 dedupe；不執行 runtime rollback。
