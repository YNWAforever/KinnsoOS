# PD06 原 Remix-Kinnso 操作包（未執行）

Source／candidate 待最終 receipt 綁定。原 project 不變、不新建 projects、不 merge／production deploy。此包只供審核，沒有執行原 target client、SQL、secret、role 或 cleanup。

前置：重新核實 project identity、owner、schema migration baseline、Auth/RLS／共用資料隔離及獲准角色。Origin 相符不代表 owned isolation。現有 schema:not_checked 保留；owned CI 不替代這一步。先審 `20261023033353_kinnso_durable_share_receipts.sql` 完整差異及 same-head CI，再另行授權原目標操作。

Migration 新增 private receipt table（RLS、Data API roles 無權限）、non-exposed kinnso_share_api schema／三個 fresh actor/owner DEFINER entry functions，及三個 invoker-only public RPC。Legacy create 僅加與 v2 相同的 actor quota transaction lock；其 signature／projection／list／revoke／public media 邏輯保留。新 table 的 update trigger 拒絕改 receipt，FK delete 只跟隨原 owner/trip/share lifecycle。

Server inputs：

- KINNSO_SHARE_RECEIPT_ACTIVE_KEY：1–32 位 ASCII key ID，以英數字起首。
- KINNSO_SHARE_RECEIPT_KEYS：最多8個 key ID→canonical base64 32-byte key 的 JSON，必須包含 active ID。使用核准 secret manager／安全 random source 生成；不把 key 貼到 repo、日誌或對話。
- 所有服務此 BFF 的 instances／Preview／staging 必須用該 target 穩定且一致的 keyring。CI ci-job key 是每 job 臨時鍵，禁止挪用。

Rotation：先加入新 key 並保留舊 key，核對讀回舊 receipt；再切 active key，核對新建立與兩個 authenticated contexts。移除舊 key 前須依已核准 retention／權利刪除／backup 規則證明沒有仍需解密的 receipt。缺 key／錯 key／tag mismatch 應為 UNAVAILABLE，不產生 replacement token。

最小驗收順序：authenticated owner 建立 synthetic 分享→丟棄 ACK→原 request receipt 讀回→同 payload/requestId retry 只有一筆→另一個 owner session 取回同 URL→outsider/anon拒絕→revoke原 share與照片均404→expiry terminal、url=null。舊 v1 hash-only／unreceipted holds 無法補造token，只能沿原 owned list/revoke 與支援處理。三篇真攻略 consent／圖片權利仍 BLOCKED，synthetic 不替代。

Rollback：先停止新 shareRecovery writes／回復上個 source candidate，保留 legacy owned list/revoke 及合法 public links。保留 encrypted receipt table／keyring／immutable投影／requestId去重，不 DROP table、清 rows、re-mint token 或刪 key。資料庫變更沒有自動 down migration；任何後續 rollback SQL 需 exact target、diff及批准。Source revert 不可當成資料回復成功。

Restore rehearsal：需先指定原 target 可測的 actor／records／權限，以及 operator、RPO／RTO、備份與 keyring 一致版本、恢復目的地和可覆核 receipt/read/revoke 證據。沒有獨立核准前，不對共用 Remix-Kinnso 做 restore、seed、reset 或 cleanup。

狀態：code package PREPARED；原 target migration／key config／角色驗收／restore NOT_RUN。真攻略 rights BLOCKED，T08/N16 OPEN，PD18 NO_GO。
