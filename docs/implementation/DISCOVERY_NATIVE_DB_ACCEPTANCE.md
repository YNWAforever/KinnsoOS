# NA01–NA09 本機原生驗收：部分實作，DB 尚未執行

2026-11-01，Asia/Hong_Kong。基準 HEAD `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`；保留同一 worktree 的既有未提交 C／T／M／L／N 候選。

**本批未完成原生驗收，不能標示 LOCAL_NATIVE_DB_ACCEPTANCE_PASS。** 已實作離線防護與測試工具；沒有新建 stack、沒有執行 SQL／遷移、沒有部署或建立真實連接。使用者已明確授權新隔離本機 DB，本次阻擋不是缺少批准。

## 已有程式與仍缺的部分

| 任務 | 本次實作 | 原生完成標準的狀態 |
|---|---|---|
| NA01 | 明確 stage runner、manifest／來源／資源防護、真實只讀 preflight、獨立 config／network／volume provisioner、Docker inspect→gateway/Auth/REST/DB ancestry attestor | **可離線測試；未執行**：資源門檻仍封鎖 live stack；fresh review 已修正 provision 父目錄、後續 stage 與 target 身分連續性 |
| NA02 | 全 210 檔 ordered SHA-256 manifest、缺檔／改檔拒絕、逐檔 fail-fast psql replay、DB server journal、read-only catalog 及 SchemaReceipt | **可離線測試；未執行**：resources 未達標，沒有真 schema fingerprint |
| NA03 | 真正 Supabase admin/session adapter、9 類示例 actor、creator／merchant／member／Ops fixtures、instrumented gate cleanup | **可離線測試；未執行**：沒有建立本機 Auth users、session 或 DB rows |
| NA04 | GRANT、跨公司、跨 thread、foreign receipt、Ops 範圍、撤銷 session、匿名、internal EXECUTE 案例 | **部分 handler；未執行**：member／location、原 guide／trip 子案仍 BLOCKED |
| NA05 | revision CAS、tombstone；同 UUID 改由真實 Auth claims 的非管理員持久 psql sessions 執行，第三 observer 驗精確 PID、blocker 與 SQL literal request identity；另保留 10 輪雙次序 matrix | **部分 handler；未執行**：saveIntent 已接好，其他 15 原生命令及六原 writer 仍未有 live handler |
| NA06 | Case-owned fault trigger SQL、manager rollback、before/after effects；新增後段 receipt trigger 先證明 intent 已寫入再以 P0001 回滾，移除 fault 後同 UUID 重試一次 | **部分／BLOCKED**：privateIntentReceipt 已接好，其餘 transaction boundaries 未展開 |
| NA07 | 六用途、來源／scope 變動、兩種撤權順序、reader 清單列入必要案例 | **待實作／BLOCKED**：原生撤權競態及 reader 讀回 |
| NA08 | 原業務鏈、自有／混合內容、marker、tombstone 列入必要案例 | **待實作／BLOCKED**：真正商戶→配對→C1→guide→T 採用／分享／撤回 |
| NA09 | 嚴格結果對帳器、182 個必要案例、runbook、回歸及證據 | **部分**：31 個 handler 已註冊、151 個仍未有 handler、catalog 尚未展開；不能計為原生完成 |

新程式集中於 `apps/journeys/tests/native-db/` 及 `apps/journeys/scripts/native-db-acceptance.mjs`。未修改正式 app、既有流程、migration、capability、部署設定或共享 DB types。沒有為了讓 harness 載入而抽取正式 runtime。

## 實際阻擋與安全邊界

- 初次資源量測：可用 RAM 1,680,019,456 bytes；C: 空間 7,292,055,552 bytes。
- 2026-11-01T05:59:43.668Z（13:59 HKT）只讀 preflight：RAM **1,023,897,600 bytes**，未達 **4 GiB**；exit **78 / INSUFFICIENT_RAM**。
- 同時 C: 剩餘 **7,270,596,608 bytes**；發現 Docker VHDX 位於 C:，但尚未完成「此檔案正是目前 engine 使用的 backing disk」證明。runner 回 `DOCKER_DISK_UNVERIFIED`，不能把任意磁碟剩餘空間冒充 10 GiB 門檻已通過。
- 2026-11-01T13:51:38.005Z（21:51 HKT）最後 fix-pass 後 preflight：RAM **3,609,919,488 bytes（約 3.36 GiB）**，仍低於 **4 GiB**，exit 78 / INSUFFICIENT_RAM，沒有初始化 DB。
- Docker disk 現已核對：daemon PID 152 的 `/proc/152/root/var/lib/docker` 與 `/mnt/docker-desktop-disk/data/docker` 在探測前後均為相同 device／inode `2096:24`，`df` 顯示可用 **820,012,236,800 bytes（約 764 GiB）**，高於 10 GiB。disk gate PASS；這只是容量與 ancestry，不代表 DB 已啟動。
- CLI **2.107.0** 已用執行輸出核實；Docker Server **29.8.1**。CLI 首次 telemetry 檔案寫入被沙箱拒絕；之後只在子程序設定 `SUPABASE_TELEMETRY_DISABLED=1`／`DO_NOT_TRACK=1`，版本與 help 查詢成功，沒有改全域設定。依據：[官方 CLI 文件](https://supabase.com/docs/guides/local-development/cli/getting-started)。
- project `kinnsoos-native-acceptance-20261101` 的 container／volume／network 都不存在，60020／60021／60022 未被占用。**名稱空閒不等於 target 已 attested。**
- 3499 仍是原 PID **45748**；只讀 health 核對不重設使用者 session。瀏覽器回歸使用另一個自有示例測試程序。

最終 3499 health 為 HTTP 200、`EXAMPLES_ONLY`、`persistent=false`、`realConnections=false`。本批自建的 3501 PID 31072 已在核對 PID／啟動時間／命令／port 後停止；3497／3498 由 Playwright 回收。2462 個既有檔案沒有遺失，正式 apps／packages／SQL 無變更；既有文件只有停用 runbook 更正，以及商戶測試重新產生的兩張 1280／390px 截圖。新驗收工具與報告為新增檔案。

Runner 已接上獨立 provision、topology attestor、逐檔 migration、Auth fixtures、native cases 及 owned cleanup；但因 preflight 先失敗，`--provision`、`--migrate`、`--run`、`--cleanup-owned` 均未進入副作用階段。`--plan` 只讀來源；`--preflight` 只讀主機、CLI、Docker、WSL disk、port inventory。工具不載入 `.env`，CLI 子程序排除繼承的 provider token、DB URL 與 binary override。

## 測試與證據

本段的 artifact hashes、時間、完整命令及機器可讀狀態見同目錄 `DISCOVERY_NATIVE_DB_ACCEPTANCE_EVIDENCE.json`。平台：Windows、Node 24.18.0；瀏覽器版本在各份原始報告中。

| 層次 | 本次結果 |
|---|---|
| L0 新驗收工具 | 最後 review fix-pass 後 134 案：133 PASS、1 Windows symlink 權限 SKIP；無真 DB 行為 |
| L1 PostgreSQL | **NOT_RUN**：新 stack 未啟動、210 遷移未套用 |
| L2 Auth→PostgREST→RPC | **NOT_RUN**：沒有真正 actor sessions／fixture／writer case |
| Journeys 既有 Node／型別 | 1,424 案：1,423 PASS、1 Windows symlink SKIP；Journeys／Web 型別 PASS |
| SME 型別／契約 | 主程式及四套件各自 tsc PASS；14 Node＋49 Vitest PASS；兩端記憶體契約 7 PASS。未重跑缺少快取的 pnpm 9.12 包裝命令，沒有下載套件 |
| Web 公開快取契約 | 2 PASS；這是 mock transport，並非真 DB 或 hosted CDN 驗證 |
| L3 示例 C／T／M／配對 | 本輪再次重跑：C2–C5 14、T 22、M 25、配對 9，合計 **70 PASS**；另有先前 12 項真 Next C1 邊界 PASS。全部只用示例資料，沒有外部請求 |
| 真 Next 未連接邊界 | **2 PASS**；原首頁角色入口與原生 endpoint 的 fail-closed 行為，並非已連 DB 的 UI 驗收 |

已觀察 RED→GREEN：目標模組缺失、遷移／屏障／結果模組缺失、provider／runner 缺失；之後補實作。實際 preflight 亦找到「probe 完成時間晚於進入時間被誤判為 future」問題，新增重現案後改為完成時重新核對授權有效期與觀察新鮮度。

第一次既有 Node 回歸在沙箱中有 13 個環境失敗（暫存 Git 初始化／hard link 權限）及 2 SKIP；Vitest 亦遇暫存檔 rename EPERM，尚未開始案例。取得工具執行授權後，以相同原測試在正常 Windows 權限重跑，得到上表 PASS。兩次記錄皆保留；沒有改斷言、刪案例或把失敗改算略過。未重新 build：本批沒有產品程式變動，原 Next 關閉邊界使用既有本機 build，這不代表重新建置成功。

`cases.json` 是 **182 個必要案例**，不是 182 個測試通過。31 個已有 native handler，151 個仍未有 handler；全部 native handler 都是 NOT_RUN。同 UUID case 不再依賴 `Promise.all`、sleep 或 PostgREST bind-parameter 猜測：writer 先保持交易，waiter 被 `pg_blocking_pids()` 觀察到後才釋放，且第三 observer 核對實際 literal request UUID。缺案、SKIP、mock 冒充 L1/L2、錯 run／來源／schema／target 收據、空實際結果、重複 ID、cleanup 失敗與未展開清單，都不能給整批 PASS。

## 獨立審閱與修正

一次 fresh-context 整體審閱提出三項 Important，無 Critical／Minor；三項均新增可重現的失敗測試，確認 RED 後修正，同一輪完整 L0 suite 得到 51 PASS／1 SKIP：

1. network／volume ID 同時缺失可能互相比對相等：現在先驗證非空、合法格式的資源 ID，再比對。
2. Node 接受 base64url 尾字元未使用位元的不同拼法，可能繞過示例 token 字串撤回：驗簽前強制 canonical signature 編碼。
3. private-only gate 的清單預期與 SQL 候選不符：16 個 metadata 命令在有效前態、authority／rights 下由 `private_writes` 控制；licensed source ingest 及有 licensed refs 的 bound write 才要求兩道 gate。同 UUID 舊收據另案處理。修正測試預期並新增六個 licensed gate 家族，**沒有更改產品 SQL gate**。

審閱者沒有評定未執行的 DB／Auth／RLS／rollback／race，亦沒有重審既有 C／T／M／L／N 程式。本報告維持這些原生項目 NOT_RUN；既有回歸數字來自本批實際命令，不以審閱意見代替執行。沒有第二輪 reviewer；修正以重現案及全 L0 suite 核對。

凍結版第二次 fresh-context 審閱另找出三個 Critical 及六個 Important，全部先加重現測試再修正：

1. provision 父目錄未先建立：現在只會建立全新的 owned run 目錄，已存在即拒絕。
2. `migrate`／`run`／`cleanup-owned` 被空 stack preflight 擋死：後續 stage 改為只重驗已有的 owned topology，不再要求資源不存在。
3. 後續 stage 未綁定 provision 的 DB／network／volume／image 身分：runner 現在先比對 saved 與 fresh identity，不符即 `TARGET_CONTINUITY_MISMATCH`。
4. side effect 後仍報 `mutations:0`：已改成在副作用可能開始後失敗回 `UNKNOWN`。
5. 旁路 WSL mount 被誤當 Docker disk：已撤回「764 GiB 已證明」的主張；只有當 `df /var/lib/docker` 可直接成立才可過 disk gate。
6. handler 接受任意 RPC error：跨 thread、撤銷 session、匿名及 internal RPC 改驗固定 error code／status；沒有 location-scoped resource 的 member case 不再標 implemented。
7. rollback oracle 接受網路錯誤：現在只接受 `P0001`、指定 fault marker 及 `wroteBeforeFault=true`。
8. UUID observer 無法由 PostgREST bind query 可靠識別同一 RPC：後續已改為非管理員 psql session 直接執行 literal RPC 參數，第三連線只在精確 waiter／blocker／request UUID 均相符後通過；10 輪、兩種順序已接回 handler。

第三次審閱再找到 2 個 Critical、4 個 Important；全部加入失敗測試後修正：

1. `runCases` 的 summary failure 沒有提升到 stage 頂層，CLI 可 exit 0：現在只有完整 native PASS 才回 `PASS`，INCOMPLETE／BLOCKED 回 78，FAIL／INVALID 回 1。
2. cleanup 只驗 project label，可能在檢查後刪到同名替換 stack：現在以 saved container IDs、network ID、volume name 與 image digests 作每次 destructive boundary 的 precondition；container 以 ID 停止及刪除。
3. handler 接受任意 RPC error：auth、ACL、Ops、tombstone、receipt 現驗固定 SQLSTATE／PostgREST code／message 與完整 receipt key allowlist。
4. UUID case 只跑 2 次：現已在同一對 worker sessions 上跑足 10 輪 × 2 順序，共 20 場重疊交易。
5. run 只信持久化 schema 檔：現在執行案例前重讀 live migration journal 與 catalog，重新計算 hash；漂移即 `LIVE_SCHEMA_DRIFT`。
6. setup 失敗後的 partial Auth cleanup handle 消失：現在 error 保留可重試 handle，live runner 最多重試三次才回 cleanup blocked。
9. Auth fixture 部分 cleanup 後不可重試：cleanup 現在只在全部成功後標完成，外層 runner 在 manifest／evidence 建立失敗亦會 finally-like cleanup。

上述仍只是 L0／code review 驗證。即使 RAM 與 disk 都達標，也不能靠這批修正宣稱 DB、Auth、RLS、race 或 rollback 已通過。

## 接續順序

1. 主機達到 4 GiB 可用 RAM，證明 Docker backing disk 且至少 10 GiB；重新核對來源、manifest 到期時間、名稱／ports。保留本次既有授權範圍，不需要再批准相同動作。
2. 完成並驗證獨立 stack bootstrap、實際 Docker attestor、完整 migration executor／journal。不要把目前 L0 正向物件接成 live client。
3. full replay 成功後，以真正 schema 建 Auth fixtures、actor sessions、generated types，再逐項編寫及執行 NA03–NA08 native cases；182 個案例逐一展開，沒有 handler 的項目維持未完成。
4. 原生 runtime 確實驗證後，再做停用／retention／owned cleanup 對帳與 NA09 總結。保持原流程及 3499。

真實 SME MCP、issuer／audience／持久 epoch、第三方內容權利、正式 Next 原生功能啟用、外部平台、booking/payment、hosted/CDN 與部署均不在本次已驗證範圍。資源恢復也不會自動解除這些門檻。
