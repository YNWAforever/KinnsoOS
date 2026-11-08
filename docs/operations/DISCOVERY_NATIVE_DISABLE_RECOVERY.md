# Discovery 原生候選：停用與恢復

2026-11-01；N01–N04 候選及 NA01–NA09 驗收準備。使用者已授權只在新建並核對的隔離本機 DB 套用遷移；本批因資源及原生工具尚未就緒，實際仍未套用、未部署、未連接服務。結果見 `../implementation/DISCOVERY_NATIVE_DB_ACCEPTANCE.md`。

目前邊界均關閉：Journeys 的五個新 capability 固定 unavailable；SQL 候選的 `discovery_gate.private_writes=false` 及 `licensed_writes=false`；SME `/api/mcp` 固定 503。`20261101090100` 的全面拒絕 ingestion 是歷史版本；後續 `20261101100200` 已加入受 gate、用途與交易 permit 控制的 licensed source 路徑，`100600`／`100700` 補上逐區塊來源與編輯接線。這些都是未經本批真 DB 執行的候選，不能描述成已啟用。修改環境變數不能解除正式 capability。booking/payment 保持關閉。3499 是原有 EXAMPLES_ONLY 預覽。

## 停用與未知結果

1. 維持新入口／寫入 capability 關閉。已完成的 C/T/M 和原功能保留；不刪 guide、trip、campaign 或私人筆記。
2. 已登入本人仍可經 `GET /api/discovery/requests/[id]` 核對最小收據；不因停用而改用 service role。帳戶失效回 restricted/auth required，資料庫失聯或逾時回 unknown。
3. 重查及重播保留原 request UUID、target、expectedRevision、command。修改內容才建立新意圖。SQL tombstone 防止已刪意向被舊 UUID 重建。
4. `discoveryEvent` 只投影 UUID、固定狀態和毫秒；不記錄正文、完整意向、token、SQL 或任意錯誤文字。目前尚未接到 hosted monitoring。可手動使用現有 Ops/support 入口記錄 stale/unknown 的最小 ID，不自動發信。

## 恢復的先決條件

由維護者在本批已獲准的新隔離 DB 核對 migration journal、schema hash、原 Studio 相容性、角色/RLS/交易競態、產生 DB types，再另行審閱正式 capability 改動。資源門檻維持 4 GiB 可用記憶體及 10 GiB Docker engine 資料磁碟。現時 runner 已能建立獨立 config/network/volume、核對四服務 ancestry、以同一 SQL transaction 記 migration journal、建立示例 Auth actors、以非管理員 worker 驗同 UUID 並跑已註冊 cases；2026-11-01 最新盤查 Docker disk 已由 daemon root／data directory 的同 device-inode 證明，但 RAM 只有 3,609,919,488 bytes，故只有在 provision 前 BLOCKED。不能接管舊 stack、降低 RAM 門檻或把 L0 工具測試當作 DB 驗收。不可只改 flag 便視為完成。

SME 需選定 OAuth issuer、resource audience、官方 SDK/protocol，補齊持久 scope epoch、server-issued nonce 與簽署 proof，驗證真雙方 owner、撤權和 Secret boundary。Neon 網站登入不等於 MCP 授權。

licensed 分支需完成真實權利證據，並原生驗收既有候選的 guide/adopt/share 同交易 bindings、全部 reader、metadata、OG、匯出和撤權行為。依 `DISCOVERY_NATIVE_COMPLETION_READER_MATRIX.md` 的最新逐版本矩陣驗收；不再把「移除最早版本 trigger」當作尚未寫程式的唯一工作。發現 SQL 缺陷仍以 append-only migration 修補，不能先把授權文字標成 own 或在第二個 HTTP 呼叫補寫 bindings。

## 人工保留期限

尚未安裝排程。責任人是另行授權的 DB 維護者。`kinnso_internal.maintain_discovery` 是未授予 browser/service-role 的人工函式；30 日 MatchRun、90 日無 saved choice／MatchRun／linked trip 的 archived intent 才列入清除。它保留 request receipt、tombstone 和計數稽核，不刪原業務成果。原生衍生關聯尚未啟用；未來新增關聯必須同時加入 retention 的「仍被引用」判斷。

本輪只做純函式/API 停用演練；未執行 SQL 清除、資料庫回退、託管停用或恢復。不提供可誤執行到正式環境的一鍵操作。
