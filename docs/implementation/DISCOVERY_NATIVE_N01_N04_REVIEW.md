# N01–N04 本機原生候選審閱

2026-11-01。本輪授權僅本機程式／測試、遷移檔與 MCP adapter。沒有套用任何遷移（包括本機 DB）、部署、真實連接或正式憑證。

**完成的是可離線驗證的原生候選；N01–N04 的原生端到端驗收尚未完成。** 原 C1–C5、T1–T5、M1–M5、L 配對流程和 3499 示例預覽保留。此次沒有把原生資料庫或 MCP 接到 3499，也沒有將任何未驗證 capability 改成 connected。

## 程式交付與限制

| 任務 | 本機程式／測試交付 | 尚未完成、保持關閉 |
|---|---|---|
| N01 | 兩份 append-only SQL 草稿；八組資料模型、private intent/preferences RPC、最小收據、相同 UUID／revision 邊界、tombstone、restricted 30/90 日維護函式；API command/read/request routes | SQL 未執行或通過 DB 語義驗證；RLS/Auth/競態/rollback/maintenance 未驗收；DB types 未產生。商戶 link/import/publication/grant/match commands 在原生 RPC 明確 unavailable，只有 L 示例實作可試走 |
| N02 | SME 隔離工作樹：六工具 dispatcher、嚴格輸入／輸出、可注入 verifier、每次及回應前重驗會員、限量／期限、真 repository adapter、保留 decimal 字串的唯讀 SQL adapter、共同 JSON contract | `/api/mcp` 固定 503；未安裝官方 SDK、未測 initialize/discovery/tools/list/tools/call。issuer/audience、持久 scope epoch、一次性 nonce／簽署 proof 服務尚未選定與實作；示例 attestor 重播測試不是持久化驗收 |
| N03 | 固定 link/scope/版本、≤60 秒來源核對、await 後撤權檢查；保留私人筆記的衍生欄位 projection；原生 reader/writer/cache 清單；SQL 阻止 licensed ingestion | 未把 projection 接到全部原讀取入口；未在原 guide/adopt/share SQL writer 交易加入 bindings；沒有來源事件／權利核准服務。因此原 studio own/unknown guard 不放寬，授權文字不能寫入舊公開路徑 |
| N04 | 關閉寫入仍可核對最小收據；只保留 ID／狀態／延遲的診斷投影；預設跳過的 native DB harness；真正 Next 的離線停用 API／頁面測試；停用恢復與人工保留 runbook | 沒有 hosted monitoring、SQL 清除／回退／恢復演練、連接 DB 的 native E2E、Preview 或真雙方 owner 驗收；G2–G5 仍未通過 |

SQL 的 `discovery_gate.private_writes=false` 是第二層阻擋。API 沿用目前 authenticated client／資料庫 actor，沒有 service-role 寫入旁路。`native.ts` 的 RPC 型別是手寫的**暫時受限介面**，不宣稱是已驗收的 generated DB types。

完整未開啟入口見 [reader 清單](DISCOVERY_NATIVE_READER_INVENTORY.md)，人工操作見 [停用恢復 runbook](../operations/DISCOVERY_NATIVE_DISABLE_RECOVERY.md)。沒有倒退或修改舊 migration。

## 倉庫與來源

Kinnso base：`b6291cf40ae0849c5e9eeea6cbb1b725136b4f54` 加本機既有 C/T/M/L 變更；本次獨立 baseline 與 ledger 在 `.superpowers/sdd/2026-11-01-kinnsoos-native-discovery/`。

SME：`YNWAforever/smeassistant`。原 portal checkout `85dbcd6cdfecbecad450977c5d9b9d5a732f94a5` 的未提交修改保留。新候選在 `.local-private/smeassistant-native-20261101`，branch `codex/kinnso-mcp-native-20261101`，從本機 `origin/main` 的 `df6f9a61095129d4f107a17cdcf159556457b940` 建立；不是宣稱與目前遠端 main 相同。遠端只讀核對 package.json 身分，未 fetch/push。SME 原始碼不混入 Journeys GPL 封包；交付獨立 patch 供審閱。

本機使用現有 Node/TypeScript/esbuild；SME 工作樹引用原 portal checkout 的已安裝依賴，未安裝／升級 SDK 或套件。全 SME typecheck 因已安裝套件中沒有 `next-themes` 而被阻擋；本次 baseline 的 package.json **已宣告** `^0.4.6`，這是借用依賴與 baseline 不完全一致，並非新增程式錯誤或 manifest 遺漏。MCP 範圍 typecheck 單獨通過，不冒充全倉通過。

官方參考： [Supabase database functions](https://supabase.com/docs/guides/database/functions)、[Supabase changelog](https://supabase.com/changelog)、[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)、[官方 SDK 清單](https://modelcontextprotocol.io/docs/2026-07-28/sdk)。參考文件用於設計邊界，不當作本實作已通過認證的證據。

## 驗證紀錄

最終結果、平台、UTC/HKT 時間、來源指紋、A01–A20 分層判定與 artifact hash 見 [驗證紀錄](DISCOVERY_NATIVE_N01_N04_EVIDENCE.json)。本機結果如下；SKIP／NOT_RUN 不計作 PASS。

- Journeys 全套 Node：1,406 項，1,405 PASS、1 個 Windows symlink SKIP，0 FAIL；其中新原生邊界／草稿檢查為 16 PASS。
- SME adapter：14 PASS；共同契約的雙方 in-process roundtrip：6 PASS；原優惠與新增唯讀 SQL adapter 回歸：49 PASS。全部是示例／注入 repositories，沒有真 DB、OAuth 或官方 MCP 協定。
- 示例瀏覽器：82 PASS（配對 9、C1 12、C2–C5 14、旅人 22、商戶 25）；配對在契約修正後重跑 9 PASS。無外部請求或頁面錯誤，涵蓋桌面與手機。
- 真正 Next、離線設定：2 PASS，新 command/read/request 接口停用、拒絕外站寫入、三方首頁／連接頁／GPL 來源入口保留。這不是 connected native E2E。
- Journeys typecheck／最終 build、SME MCP 範圍 typecheck、兩份 GPL source archive 逐檔核對 PASS。SME 全倉型別檢查仍因借用依賴缺 `next-themes` 被阻擋。
- Native DB：5 SKIP，沒有匯入 DB fixture 或連接 DB。涵蓋未來的本人隔離、UUID 並發、rollback、跨類型 tombstone、quota 競態及原 studio 相容性；尚未補齊所有原生 retention／撤權／A01–A20 測試，不宣稱完整覆蓋。
- 原有 2,418 個 baseline 檔案無刪除；原 C/T/M 工作室、web、scan、sync、packages 功能程式不變。測試更新既有 runner 的 latest-run 圖片／報告，N 證據另存；共享 Discovery parser／價格處理因原生契約相容性修正而更新。

獨立 source-only 審閱後，一次修正六個 Important 和一個 Minor：tombstone 類型隔離、SQL 缺值拒絕、原商戶文字／金額相容、未準備 draft 狀態、UUID 正規格式、quota 按 actor 序列化、來源 hash 不隨衍生到期狀態改變。SQL 修改只有靜態檢查和未執行的未來測試，不能視為已通過資料庫驗收。

3499 保留原 PID／示例記憶體，沒有重設。可繼續使用 [本機預覽](http://127.0.0.1:3499/zh-HK/)。本輪測試只用了獨立 3501／3497／3498；沒有把準備中的 native adapter 接入該預覽。

SME 獨立候選程式見 [可審閱 patch](SMEASSISTANT_N02_LOCAL_REVIEW.patch)，已做 reverse-check，未套用到原 checkout、未 commit/push。

下一步須先審閱此候選及上述未完成原生接線，再決定 G2 隔離資料庫、G3 OAuth/SDK/proof、G4 權利及讀取保護的範圍；本交付不自動啟動它們。
