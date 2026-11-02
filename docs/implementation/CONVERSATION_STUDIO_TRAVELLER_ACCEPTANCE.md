# 旅人 T1–T5：本機示例流程審閱

2026-10-31，Asia/Hong_Kong。延續原 C1–C5 工作區，在同一個 <http://127.0.0.1:3499/zh-HK/> 預覽加入五個旅人流程。全部使用自有示例文字／固定色塊，資料只在本機程序記憶體保存，重啟或重設後清除。本批沒有套用資料庫遷移、部署、讀取正式憑證或建立真實連接。

## 試走路徑

| 範本 | 可試用的完整流程 | 成果存回及界線 |
|---|---|---|
| T1 規劃我的行程 | 共用首頁／範本 → 行程名稱、日期、時區、1–5 個示例站點 → 討論及證據 → 私人 brief → 確認建立 → 原行程編輯器 | 原 `trips.create`、`trips.apply`；示例時間可再編輯，交通、費用及營業時間未驗證 |
| T2 收藏 guide 轉行程 | 選已收藏 guide／自己的行程 → 核對作者、版本、新增天數及站點 → 私人 brief → 確認採用 → 原行程 | 原 `trips.adopt`；原筆記保留、作者及版本標示保留、新版不覆寫已採用副本；摘要-only 拒絕採用 |
| T3 分享並撤回 | 選行程 → 逐項選站點／有權公開的圖片 → 完整公開預覽 → 私人 brief → 確認分享 → 匿名唯讀頁 → 確認撤回 | 原 `sharing.create/receipt/revoke`；只選定的公開欄位、約六天到期；撤回確認新讀取被拒，不能刪除他人已保存副本 |
| T4 整理收藏 | 讀收藏 → 分清可採用攻略與靈感摘要 → 寫私人分類建議 → 可逐項選擇移除 → 確認 → 原收藏頁 | 原 `bookmarks.toggle/list`；分類只是私人 brief，未新增正式分類資料模型 |
| T5 留住旅途片刻 | 選自己的行程及站點 → 完整私人筆記／圖片描述 → 可選固定示例圖 → 私人 brief → 確認 → finalize／attach／讀回 → 原行程 | 原 `updateStop`、`uploadPhoto` 與 `attachMedia`；描述保留在私人筆記，分享前另行逐圖確認；真實檔案與物件儲存上載未驗收 |

「旅人 brief 庫」可以重開每個獨立任務。旅人頁預設收起長指引及原導航，展開即可進入既有功能。首頁旅人、創作者、商戶三組入口保留；原 C1–C5 指引和成果庫繼續可用。

## 程式落點與保留範圍

- [traveller-tasks.ts](../../apps/journeys/lib/studio/traveller-tasks.ts)：不可變私人 brief 合同、採用證據、公開欄位白名單、命令讀回驗證。
- [traveller-execution.ts](../../apps/journeys/lib/studio/traveller-execution.ts)：用既有 trip／bookmark／share／media clients 執行原請求；另外讀回才能完成。
- [TravellerTaskFlow.tsx](../../apps/journeys/app/workroom/TravellerTaskFlow.tsx)：五個任務、證據、brief、公開預覽、逐項確認、撤回及私人成果庫。
- [WorkroomShell.tsx](../../apps/journeys/app/workroom/WorkroomShell.tsx)：可選 `travellerStore`；只有獨立預覽注入 adapter。正式 app 不注入時仍走原範本交接，沒有新正式 writer。
- [本機預覽](../prototypes/conversation-studio-local/README.md)：會話隔離的原創示例、不可變意圖、原 API 路徑替身、匿名公開讀取及原 `TripWorkspace`／`GuideWorkspace`／`BookmarkWorkspace`。

本批沒有改動既有 domain writer、正式 API 路由、capability 預設、資料庫或 apps/web。所有原功能入口保留。Journeys GPL-3.0、作者來源標示和對應來源封包保留；新增共享 UI／函式／測試列入原 source manifest。

## 誠實與復原行為

- brief 先在記憶體 adapter 保留完整不可變意圖，讀回後才保存；瀏覽器網址只帶不透明 ID。保存 POST 未送達也可從意圖復原完整內容，沿用原 ID。
- 原行程變更用 revision + request UUID；收藏沿用原 desired-state/request UUID；分享沿用完整原 intent，撤回沿用同一分享 ID。傳輸錯誤或讀回不一致都顯示「結果未知」，不重新產生原操作的 UUID。
- 分享確認綁定來源行程 revision 及完整公開內容；確認後資料變更會被拒絕。分享完成需要原 receipt 及獨立、無 Cookie 的公開讀取一致；撤回需要 receipt 撤回及原連結／選定媒體的新讀取被拒。
- 私人筆記和圖片描述永不自動帶入公開 projection。未選站點和圖片排除；每張選定圖片需使用者確認權利。
- T2 來源撤回後，對應 brief／意圖不能再讀取。帳戶失效時隱藏私人任務內容並拒絕晚到回應。
- 固定色塊 bytes 預先存在示例服務；`uploadPhoto` 走既有 prepare/finalize 路徑，然後原 trip attach。這不證明真實 signed upload、EXIF 清理、物件儲存、服務端影像解碼或媒體授權安全已通過。
- 在發出準備請求之前，網址先保留不透明 run ID；準備 ACK 遺失後仍可重載讀回。準備請求從未送達、程序停止或重設後的資料不保證可找回；沒有宣稱永久保存。
- 原行程編輯器的 snapshot、pending command、建立／採用恢復均改由預覽專用記憶體 adapter 儲存；重新載入可恢復同一請求，重設／重啟則清除。啟動預覽時刪除先前本機預覽留下的已知 IndexedDB cache；正式 app 的原離線快取實作不變。

## 測試與證據

平台：Windows、Node 24.18.0、Chromium 145.0.7632.6；390px 手機及 1280px 桌面瀏覽器視窗，並非手機真機。每項測試的 UTC 時間、平台、問題、來源檔案雜湊與範圍界線見 [機器可讀驗收證據](CONVERSATION_STUDIO_TRAVELLER_EVIDENCE.json)。

| 測試問題 | 結果 | 證據 |
|---|---|---|
| T1 能否由共用首頁建立行程，再進原編輯器修改？ | PASS | `traveller-browser-check.json` T1 |
| T2 能否保留筆記、作者及精確版本，拒絕摘要／已變更版本？ | PASS | 同檔兩個 T2 案例 |
| T3 是否排除私人內容，匿名可讀且撤回後失效？確認後修改是否阻擋？ | PASS | 同檔 T3 公開／衝突案例 |
| T4 整理建議及選定移除是否存回正確位置？ | PASS | 同檔 T4 |
| T5 是否 finalize 後才 attach、另外讀回；圖片是否預設私人？ | PASS | 同檔 T5／finalize 失敗／選定媒體案例 |
| 失去 ACK、POST 未送達、重載是否沿用同一 UUID／payload？ | PASS | 同檔 adoption、share、revoke、brief 恢復案例 |
| ACK 成功但讀回內容不一致，是否保持結果未知？ | PASS | 同檔 readback mismatch |
| 私人 brief 是否跨示例 session 隔離，來源撤回／帳戶變更是否清除？手機有無橫向溢出？ | PASS | 同檔 isolation／withdrawal／mobile |
| 原 C1 及 C2–C5 是否仍可完成？ | PASS | `traveller-c1-regression.log`、`traveller-creator-regression.log` |
| Journeys 既有回歸／新純函式／型別／無後端設定的建置 | PASS | `traveller-journeys-tests.log`、`traveller-typecheck.log`、`traveller-build.log` |

上述日誌及截圖在 [本機預覽目錄](../prototypes/conversation-studio-local/README.md)。完整旅人瀏覽器案例 22 項、C2–C5 14 項及 C1 回歸，無頁面錯誤或外部請求。Journeys 1,321 個測試通過，1 個 Windows symlink 測試跳過。早期失敗（Next Image 邊界及表單可達名稱）已修正，原始失敗證據保留。

## 獨立審查及修正

一位獨立審查者找到五項 P2，沒有 P0／P1。已全部修正，沒有擱置：

1. 圖片 prepare 期間帳戶失效：傳遞 AbortSignal，中止後續 finalize；工作室父層也清除私人內容，避免 URL 中 run ID 改變引致子元件重新掛載而顯示舊 brief。
2. 原旅人編輯器的持久暫存：只在獨立預覽把儲存邊界替換為 session 記憶體，清除舊 preview cache；驗證未保存命令可跨重載以同 UUID 恢復，重設後消失。
3. 準備請求 ACK 遺失：發送前先保留 opaque run ID，重新載入恢復原 payload。
4. 已撤回 guide 的收藏移除：容許明確 `desiredState=false`，仍拒絕加入及採用已撤回來源。
5. 已刪行程 ACK 遺失：先核對匹配的刪除收據，再判斷行程是否存在，讓原編輯器以同 UUID 確認刪除。

五個修正案例通過；另加原編輯器跨重載復原、舊 cache 清除／原建立表單測試。最終全部 22 個旅人瀏覽器案例及 C1／C2–C5、Journeys 回歸均通過。審查結論來自來源檢查及隔離模擬；最終瀏覽器驗證由主流程在新的示例 session 執行，沒有使用共享真實資料。初始測試中的等待字串曾誤把「尚未保存」視作完成，已改為等候明確完成狀態後獨立 API 讀回。

## 仍未接通／驗證

- 正式資料持久化、真 Auth／RLS／RPC、分享 token keyring／加密／服務端公開頁、跨帳戶及 ACL 競態驗收。這次的 cookie 隔離和匿名示例頁不替代這些證據。
- 真實私人文件、媒體上載、EXIF／像素解碼、真物件儲存及其撤回權限。
- 真 AI／MCP／OAuth、Calendar／Drive／Gmail 或其他個人帳號。booking 與 payment 繼續關閉。
- 真實第三方內容使用權、資料保留／刪除政策，未因示例完成而解決。
- 真機、輔助科技、CI 候選、hosted、部署及正式環境驗收。本批沒有套用先前待審閱的 SQL。

這批的完成界線是可審閱的本機示例流程；正式上線門檻維持原有阻擋狀態。
