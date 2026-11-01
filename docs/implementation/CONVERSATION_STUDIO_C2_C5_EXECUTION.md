# C2–C5 本機示例流程執行紀錄

2026-10-31，Asia/Hong_Kong。沿用已隔離的 creator 工作區與 3499 預覽，依據已確認計劃 T08。原 C1 驗收文件保留為當時來源快照。

本批工作：C2 發佈前檢查、C3 成效檢討、C4 回應修訂與交付、C5 更新攻略版本。每項含問題、獨立討論、證據、私人成果、保存讀回及相關原流程。

Ruling: 本次完整流程的驗收層級是本機示例；新增可注入的成果儲存介面，只有本機預覽接記憶體 adapter。原 app 未配置 adapter 時保留原讀取檢查，不新增可繞過 RLS 的正式 writer。正式成果持久化仍待資料模型及隔離 DB 驗收。

Ruling: C3 的選定日期只篩來源紀錄時間，不冒充平台分析期間；來源總計不按局部紀錄重算。社交訊號／分母維持未連接／未驗證，追蹤活動不代表付款。

Ruling: C4 的終點為重新提交並讀回「待審核」，不由創作者模擬獲批；C5 用原 guide writer／發佈確認，保留舊發布快照及旅人採用副本。

Pre-flight: C2/C5 共用已保存 guide revision；C4 用原 command 的 expectedUpdatedAt/request UUID；C3 使用原 EarningsPage，不假設日期／曝光分母欄位。成果保存與業務交付是兩個獨立確認，失敗／逾時保留同一意圖。

本批不套用遷移、不部署、不建立真連接、不讀取正式憑證、不提交或推送。既有 dirty files 全部保留。圖譜工具 10 秒未回應，改讀已知 owner 檔及直接字串查詢。

## 任務與證據

- [x] 私人成果模型與讀回、missing data、版本差異的純函式測試。
- [x] C2–C5 任務互動、成果庫、來源版本／確認／未知結果處理。
- [x] 本機 adapter、完整示例資料、原 guide／合作／收益介面與導覽。
- [x] C1 回歸、四條瀏覽器流程、手機桌面、拒絕／重試／隔離案例。
- [x] Journeys 回歸、typecheck、來源封包、獨立覆核及交付報告。

## 獨立覆核與修正

- Linnaeus 唯讀覆核：3 個 P2，沒有 P1；另 2 項初列 minor。
- Final fixed P2：保存 POST 未送達就重載會丟失 immutable body。增加 store stage/readback，保存前先保留不可變意圖，瀏覽器只存 UUID。unreceived POST RED→GREEN。
- Final fixed P2：停用來源後報告與收據仍可讀。記憶體 adapter 在 list/get/stage/save/receipt 都核對現時綁定來源，拒絕受限內容。source stop RED→GREEN。
- Final fixed P2：C4 連結超過五條／重複仍成功。UI 和示例端均重用原 creatorMissionCommand validator。validator RED→GREEN。
- Final Ruling: 原 minor「重讀來源覆蓋已寫修改」提升 P2，因會實際丟失作者內容；保留改過欄位與修訂文字，對象不同則保留原文並要求核對。refresh test 等候完成後 RED→GREEN。
- Final Ruling: 原 minor「確認缺少里程碑／提交參考」提升 P2，因完整確認須指向實際交付；顯示里程碑與提交參考。confirmation RED→GREEN。
- Deferred minors: none。
- 修正後：6 項純函式與14項新增瀏覽器案例通過；無外部請求／page errors。最終完整回歸與封包另記於驗收證據。

最終交付：14/14 瀏覽器案例、C1 回歸、1318 PASS/1 Windows symlink skip、typecheck、無後端 build 通過；631 封包項目逐位元一致。3499 已重啟並通過實際入口檢查，示例進度重設。沒有 apply migration、部署、真連接或提交。詳見 CONVERSATION_STUDIO_C2_C5_EVIDENCE.json。
