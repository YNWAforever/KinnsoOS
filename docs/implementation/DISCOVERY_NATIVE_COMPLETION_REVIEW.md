# N01–N04 本機接線補充審閱

2026-11-01，Windows / Node 24.18.0，香港時間。本輪保留前次報告，以下是新的本機候選。**原生 DB／Auth／MCP 端到端驗收仍未完成。** 沒有套用遷移、執行 SQL、部署、建立真實連接或使用正式憑證。

## 本輪補齊

| 範圍 | 程式落點 | 本機交付與驗證邊界 |
|---|---|---|
| 原生商戶命令 | `supabase/migrations/20261101100000_discovery_native_commands.sql` | 既有五個私人命令沿用原 RPC；補齊 link、import、publication、grant、withdraw、match、choice 十一個分支。DB actor／merchant owner、revision、同一 request UUID、最小收據均在原交易內處理。SQL 尚未執行 |
| 來源核對及配對 | Journeys `lib/discovery/native-authority.ts`、`native-command-service.ts`、`server.ts`；`20261101100400_discovery_command_context.sql` | 伺服器觀察綁定 actor、UUID、命令摘要與 60 秒期限；觀察前後重讀 DB 身分／版本。nonce、一次性 proof、雙方 owner 範圍、SME 來源 hash／scope／時間核對。沿用原 `matching-v1`；不接受瀏覽器提交分數或來源文字。離線測試使用示例 verifier／transport／key |
| 公開讀取 | `20261101100100_discovery_native_readers.sql`、`20261101100300_discovery_original_writer_guards.sql` | direct REST 的 guide／version／trip row restrictive policies；公開 RPC、definer 查詢、行程 snapshot、舊 command 回應及 share receipt 讀取保護。原始版本不覆寫，撤權時按來源綁定隱藏欄位；私人筆記保留。DB 路徑只完成候選接線，尚未通過 RLS／實際查詢驗收 |
| 原交易與 brief | `20261101100200_discovery_native_transactions.sql`；`app/api/discovery/sources/route.ts`；`lib/discovery/domain-transport.ts`、`20261101100500_discovery_source_refresh.sql` | 本人 match → 既有 studio thread 來源，保留 licensed provenance；不能改標 own。原 guide save／publish、adopt、share 及 studio command 在寫入前只讀重驗來源；伺服器觀察綁定原參數與 UUID，再由一個 RPC 在同一交易內調用原 writer。兩個 app 的既有 server client 已加入預設關閉的包裝。rollback／競態尚未執行 |
| 混合 guide 的來源歸屬 | `20261101100600_discovery_field_lineage.sql`、`20261101100700_discovery_editor_lineage.sql`；`lib/creators/contracts.ts` | 以穩定 block ID 跟隨編輯器排序；原內容 schema 不加入內部標記，私有 marker map 保存位置。採用時按實際 upstream stop ID 傳遞來源綁定，自有站點不承接其他站點的 grant。撤權後的 DB 顯示／分享仍待實測 |
| 快取保護 | Web `lib/supabase/public.ts`、`uncached-public-fetch.ts`、guide OG、sitemap | 公開 Supabase 回應不進持久快取；guide OG 動態產生並 no-store，sitemap 每次重讀。原頁面／查詢簽名保留；以注入 fetch 測試重新讀取，不等同 hosted CDN 驗收 |
| SME 修復 | 隔離 SME checkout 的依賴連結、`lib/repositories/mcp-read.ts` | 本機已快取的 `next-themes@0.4.6` 重新連到隔離工作樹；四個 workspace 套件指回本候選。原 manifest 已宣告依賴，沒有升級套件或改動原 portal checkout。主程式及四套件的型別檢查通過。兩端 source hash 統一排序及 decimal 格式，排除觀察時間、衍生到期狀態和套用店舖 |

八份新 migration 都是 append-only 草稿，依檔名順序接在前次兩份 discovery 草稿之後。原 migration 歷史保留。`scripts/prepare-discovery-native-guards.py` 產生 `100300` 與 `100700` 候選，記錄原函式的來源與 hash；支援具名稱的 dollar quote，沒有任何資料庫執行功能。

`private_writes`／`licensed_writes` 均預設 false。簽署 key registry 與 rights approval registry 沒有配置資料。原 native capability、booking、payment 保持關閉。授權文件中的用途及來源並不因首頁或前端欄位而獲准。

## 本機驗證

機器可讀結果、UTC／HKT、測試命令、初次問題、來源指紋及保存證據見 `DISCOVERY_NATIVE_COMPLETION_EVIDENCE.json`。單元／契約、程式建置、示例瀏覽器與真實 DB 驗收分開記錄；SKIP／NOT_RUN 不計作 PASS。

主要測試包括：外部來源被改寫而保留 hash、錯誤 workspace、撤銷讀取同意、過期來源、錯誤 owner proof／nonce／範圍／時間、actor 或版本在等待期間改變、瀏覽器額外提交權限／分數／來源內容、同 UUID 重試、來源用途分離、保留私人筆記，以及公開回應不使用舊快取。

| 驗證層 | 結果 | 不能代表的驗收 |
|---|---|---|
| Journeys 全量 Node 回歸 | 1,423 PASS，1 SKIP；無失敗 | Windows 缺少建立 symlink 權限的測試略過；不代表 DB 驗收 |
| 本輪針對性測試 | 18 PASS，已包含在上列總數 | authority／transport 注入示例；SQL 只做原始碼斷言 |
| 完整型別檢查 | Journeys、Web、隔離 SME 主程式及四套件均 PASS | SME 以已安裝 TypeScript 直接執行各套件宣告的檢查；未生成或核對實際 DB schema types |
| Journeys 本機建置 | PASS | 非部署結果，也不代表已保存資料 |
| SME 單元及既有優惠回歸 | 14 + 49 PASS | 未執行官方 MCP HTTP 協定或外部服務 |
| 兩端契約及來源 hash | 7 PASS | 進程內呼叫測試，不是真實連接 |
| Web 公開讀取快取 | 2 PASS | 注入 fetch 測試；非 hosted CDN 驗收 |
| 手機／桌面示例瀏覽器 | C1 12、C2–C5 14、T 22、M 25、配對 9，共 82 PASS | 示例後端保存及讀回，非 Supabase 保存 |
| 真實 Next 的未連接邊界 | 2 PASS | 確認原生入口回覆不可用、跨來源寫入被拒及三角色入口保留 |
| 原生 DB harness | 5 SKIP，0 PASS | 沒有執行 SQL；還需擴充原生商戶、來源及原交易案例 |

測試問題：最初一次配對瀏覽器測試在頁面載入時遇到本機連線錯誤（8 PASS／1 FAIL），未進入該情境的操作；保留原始日誌，獨立完整重跑後 9 PASS。這是本機測試問題，不列作產品或原生 DB 通過證據。後續最終回歸記錄見 evidence JSON。

SME 的 `corepack pnpm -r typecheck` 包裝命令因未快取 `pnpm@9.12.0`、且關閉下載而無法啟動。改用已安裝 TypeScript 執行主程式與 contracts、region、scan-engine、scoring 各自的 `tsc --noEmit`，五項均通過；沒有聲稱原包裝命令通過。初次建立本機套件 junction 遇到作業系統權限限制，取得執行工具授權後完成並逐項核對，沒有更動原 SME 工作樹。

## 一輪審閱後的修正

唯讀審閱提出 5 項 Important、0 項 Critical；完成一次修正及針對性回歸，沒有把「修正完成」當作 DB 接受測試：

1. 產生器保留最新 Creator 360 的 `is_listed` 與角色判斷，沒有退回舊版本。
2. 連結確認先查 actor-bound 收據及 digest；已消耗 nonce 的成功請求仍可在遺失 ACK 後恢復。
3. 編輯超過 60 秒後，原保存／發佈／採用／分享入口會重新核對引用，再由原交易執行寫入。
4. 來源綁定依 block／stop 傳遞，避免把另一站點的授權附到自有站點；原編輯器排序保留 marker。
5. 旅人配對只呼叫 `sme_validate_offer_refs_v1`，文字取自通過簽署核對的 Kinnso immutable import；重新驗證 import hash。完整 SME evidence 只留在商戶明確匯入的動作。

## 3499 與功能保留

[原本機預覽](http://127.0.0.1:3499/zh-HK/) 保留原程序與記憶體進度。C1–C5、T1–T5、M1–M5 及 L 配對頁仍是示例流程。本輪沒有把 native DB adapter 或 SME 真連接接到 3499，不能用此頁的示例成功代替原生保存證據。

瀏覽器測試使用獨立 3501／3497／3498；沒有重設使用者預覽。原 scan、sync、packages 及 C／T／M 工作室流程保留。共用 server client 的包裝預設關閉；creator 型別只新增可選的來源 block marker。GPL／來源標示與兩份 corresponding-source archive 更新後逐檔核對；SME 另以 patch 交付，不混入 GPL app 封包。

## 仍被阻擋／未完成

- **DB 驗收**：全部新舊候選遷移未套用，也未執行 SQL 語法／語義、RLS、Auth、同 UUID 並發、撤權競態、交易 rollback、retention 或恢復測試；暫時受限 RPC 型別不是 generated DB types。
- **SME 真實協定與信任服務**：官方 MCP SDK／HTTP initialize、tools/list、tools/call 未接入；issuer／audience、持久 scope epoch、實際 proof verifier 與 key 管理仍待選定及實作／驗收。SME `/api/mcp` 繼續固定拒絕服務，沒有 connected 宣稱。
- **權利批准**：rights registry 是預設空的受限資料模型；真實第三方權利核准流程、來源變更事件及完整營運服務未驗收。簽署範例或商戶按確認不會自行產生核准。
- **混合來源編輯限制**：新授權 guide 可改文字及順序，但不可刪去已選 licensed block 的 marker。移除該來源須另建 brief／guide；目前沒有可審核的來源解除流程。既有自有內容編輯不受此新增限制。
- **公開撤權**：候選程式已加 read guard／cache／原交易接線，仍要在獲准的隔離 DB 逐入口驗證。外部來源觀察限時 60 秒，不能保證跨資料庫即時原子撤銷，也不能收回已下載的副本。
- **正式運作**：hosted 監察、部署、provider 故障／恢復演練、雙方真 owner 接受測試、收入／聯盟／付款驗收均未進行。booking／payment 不在本次授權範圍內。

以上限制保留 G2–G5 的未通過狀態。本候選供審閱，沒有自動進入下一個環境。

## 來源與版本

Kinnso checkout base：`b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`；本輪開始時有既有 C/T/M/L/N 未提交內容，baseline 記錄於 `.superpowers/sdd/2026-11-01-native-completion/baseline.json`。SME 隔離候選 base：`df6f9a61095129d4f107a17cdcf159556457b940`，不是宣稱遠端最新版本。沒有 commit／push。

依據：既有逐版本 migration、N01–N04 設計與計劃、前次 `DISCOVERY_NATIVE_N01_N04_REVIEW.md`、本次測試原始輸出，以及本機 Next 16.3.8 `fetch` 文件的 no-store 語義。網站或來源文件不作為執行指令。
