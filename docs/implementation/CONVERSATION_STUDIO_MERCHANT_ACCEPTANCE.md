# 商戶 M1–M5：本機示例流程審閱

2026-10-31，Asia/Hong_Kong。延續同一個隔離工作區及 [3499 共用首頁](http://127.0.0.1:3499/zh-HK/)，新增五個商戶流程，保留創作者 C1–C5、旅人 T1–T5 及所有原應用功能。全部使用自有示例文字，保存／回覆／發佈只發生在本機程序記憶體；重設或重啟後清除。

本批沒有套用遷移、部署、讀取正式憑證或建立真實連接。這是本機互動及原合約驗證，不是正式上線或真 Auth／RLS 驗收。

## 試走路徑

共用首頁的商戶入口或「任務範本」→ 選目前公司 → 讀取資料與證據 → 另開私人 brief → 保存並讀回 → 核對完整內容 → 明確確認 → 原有流程。商戶 brief 庫可重開各份獨立成果。

| 範本 | 完整試走內容 | 權限及成果存回 |
|---|---|---|
| M1 更新商戶資料 | 公司資料 → 修改七項原欄位 → 公開介紹／私人聯絡資料差異 → 私人 brief → 確認 → 原商戶表單讀回 | 原 profile API；目前公司 owner。地址、營業時間未有原欄位，只能留在私人備註，不宣稱已更新 |
| M2 處理查詢 | 可用站內個案 → 原訊息／版本證據 → 編輯回覆 → 核對完整回覆及指定個案 → 確認 → 原 receipt + 個案訊息讀回 | 原 support command/receipt/list；原帳戶個案權限與公司範圍。公司角色不授權閱讀所有人的支援個案；沒有發送 WhatsApp／Instagram |
| M3 製作活動素材 | 勾選自有品牌／私人文件 → Instagram、WhatsApp Business、海報文字草稿 → 私人來源逐項用途同意 → 私人 brief → 原活動草稿 | owner／marketing。未同意供公司使用的私人來源只產生私人 brief；草稿不會自動發佈，私人備註不交到公司 |
| M4 檢查合作 brief | 選已存活動 → 缺項、UTC 日期與原驗證器檢查 → 私人檢查報告 → 原活動編輯器補齊 → 新檢查 → 完整條款確認 → 示例發佈讀回 | 原 campaign command；owner／marketing。已發佈條款不可當成草稿覆寫；創作者作品及 Ops 審批不被繞過 |
| M5 檢討活動成果 | UTC 建立日期範圍 → 原彙總、來源及缺口 → CSV → 私人分析 brief → 原成果頁 | 目前公司 owner。保留未知接受數／分母、歸因、營收及幣別；平台未連接不填零，不推算 ROI |

預設提供兩間 owner 示例公司，以及 marketing、clerk、finance 公司，方便試看角色界線。這些是 fixture 角色，不是首頁授權。M1／M5 的 owner-only 限制來自目前倉庫 RPC，已修正舊範本文案較寬的權限描述。

M3 → M4 可完整連續試走：存公司草稿，進原編輯器補優惠碼、網址、佣金百分比及里程碑，儲存後回 M4 檢查並確認發佈。佣金欄位不代表付款，booking／payment 仍關閉。

## 程式落點及保留範圍

- [MerchantTaskFlow.tsx](../../apps/journeys/app/workroom/MerchantTaskFlow.tsx)：公司切換、五個任務、證據、私人 brief、完整內容確認、成果庫及手機畫面；沿用首頁問題。
- [merchant-tasks.ts](../../apps/journeys/lib/studio/merchant-tasks.ts)：角色與私人來源判斷、不可變 brief 合約、profile 差異、原 campaign 檢查及誠實指標呈現。
- [merchant-execution.ts](../../apps/journeys/lib/studio/merchant-execution.ts)：呼叫既有商戶／支援 clients，另外讀回和核對才能標示完成。
- [WorkroomShell.tsx](../../apps/journeys/app/workroom/WorkroomShell.tsx)：新增可選 `merchantStore`。只有獨立預覽注入；正式 app 不注入時仍保留原範本交接，沒有新正式商戶 writer。
- [merchant-backend.mjs](../prototypes/conversation-studio-local/merchant-backend.mjs)、[merchant-store.ts](../prototypes/conversation-studio-local/merchant-store.ts)：每個示例 session 的記憶體資料、不可變意圖、來源與公司權限核對、原 API 路徑替身及收據。
- [merchant-workspace.tsx](../prototypes/conversation-studio-local/merchant-workspace.tsx)：直接使用原 MerchantProfile、MerchantCampaigns、SupportWorkspace、MerchantInsights 元件。原編輯器的恢復快取沿用先前預覽的 session 記憶體邊界。

本批沒有修改原 merchant/support domain writer、正式 API、資料庫、apps/web 或 capability 預設。團隊、分店、邀請、人才探索、核銷及歷史財務仍保留在原應用；預覽沒有假裝接通這些額外資料。Journeys GPL-3.0 與來源標示保留，新增 UI／函式／測試列入對應來源封包。

## 保存、權限與誠實界線

- profile／campaign 保留原 `expectedUpdatedAt` 與 request UUID；support 保留原 `expectedRevision`、request UUID 及 receipt。逾時、傳輸失敗或讀回不一致都保持「結果未知」。
- 發送前先把不透明 run ID 放入網址，再保留完整不可變意圖。ACK 遺失、保存 POST 未到達、重載後，能從同一 session 取回意圖並重用原請求；不把私人正文存進 URL、localStorage 或 sessionStorage。
- 準備請求從未到達、程序重啟或重設後，沒有完整意圖可恢復；介面不宣稱已保存，亦不提供永久保存保證。
- 每次讀、保存及重播都核對公司／來源權限。已綁定的商戶 brief 請求在示例 domain 寫入邊界再次檢查來源，阻擋「確認後、寫入前撤權」的競態；正式 RPC 的相同交易保證仍未驗收。
- 公司切換會清除未保存草稿、私人來源、確認及成果，忽略晚到回應。帳戶失效由工作室父層清除內容。不同示例 session 不能讀取彼此 brief。
- 公司 owner 不會取得其他成員私人文件。自有私人來源未逐項同意公司用途，成果只留在私人 brief；來源停用後，原 brief／意圖不可再讀或交接。
- M2 成功需要原 receipt 及該個案新增訊息讀回。M3 成功只表示原活動草稿存在，M4 另外確認發佈；都不代表通知已送達、第三方平台已貼文或真實付款。
- M5 的計數來自明確示例記錄，可核實為零的原狀態仍顯示零；缺少時間、分母或平台連接的資料保持未知。來源是自有示例，第三方內容權利仍未解決。

## 測試與證據

平台：Windows、Node 24.18.0、Chromium 145.0.7632.6；390px 手機與 1280px 桌面視窗，並非手機真機。每項測試的問題、UTC 時間、平台、程式來源雜湊及限制見 [機器可讀驗收證據](CONVERSATION_STUDIO_MERCHANT_EVIDENCE.json)。日誌、JSON 和畫面在 [本機預覽目錄](../prototypes/conversation-studio-local/README.md)。

| 測試問題 | 結果與證據 |
|---|---|
| M1 是否由共用首頁到 profile 差異、原保存及原表單？私人聯絡資料是否分開？ | PASS；`merchant-browser-check.json` M1 |
| M2 是否只交到指定個案，確認前不寫入，成功必須有 receipt？ | PASS；同檔 M2 及 receipt 失敗案例 |
| M3 是否只用所選文件、分別確認私人來源，存原草稿後能接 M4？ | PASS；同檔素材／私人來源／M3→M4 案例 |
| M4 缺項能否回原編輯器補齊？確認前不發佈，已發佈條款不能被覆寫？ | PASS；同檔 M3→M4、M4 immutable 案例 |
| M5 是否遵守 UTC 範圍、不填假零、不匯出私人聯絡資料？ | PASS；同檔 M5／CSV／日期邊界案例 |
| 公司切換／延遲回應／owner 與 clerk 界線／成員撤銷是否正確？ | PASS；同檔 scope 及 revocation 案例 |
| 來源在保存後或實際寫入前撤權，是否阻擋舊 brief／收據？ | PASS；同檔 document revocation 案例 |
| 意圖 ACK、保存 ACK、四類 domain ACK 遺失，重載是否保持 UUID 且不重複？ | PASS；同檔 7 個恢復案例 |
| 私人內容是否按 session 隔離，帳戶失效清除？手機是否橫向溢出？ | PASS；同檔 library／session／mobile 案例 |
| C1、C2–C5、T1–T5 是否保留完整流程？ | PASS；`merchant-c1-regression.json`、`merchant-creator-regression.json` 14/14、`merchant-traveller-regression.json` 22/22 |
| 原測試、純函式、型別、無後端設定建置與來源封包？ | PASS；Journeys 1,325 通過、1 個既有 Windows symlink 跳過；型別與建置通過 |

商戶首輪 18 個情境通過、1 個停在原表單欄位定位；定位修正後通過。加入額外競態、首頁問題及 receipt 核對後，審查前完整商戶 22/22 通過，沒有瀏覽器例外或外部請求。這些測試沒有使用 toast 或建置成功代替資料讀回。

## 獨立審查與修正

一位獨立審查者找到三項 P2，沒有 P0／P1。三項均已修正，並先以瀏覽器重現失敗，再驗證通過：

1. 「另開一份提案」在 URL 未變時未清空：改為明確重新掛載任務，清除來源、草稿、確認及 run ID，保留已保存成果供成果庫重開。
2. owner 改為 marketing 仍有 M4 權限，但私有審核旗標令新快照比較誤報衝突：讀取與比較使用同一個按目前角色投影的 campaign detail。
3. 原活動停止接收申請的狀態是 `paused`：示例 close command 及彙總改回原狀態，原清單篩選能找回活動。

`merchant-review-red.json` 為 0/3 通過；`merchant-review-green.json` 為 3/3 通過。最後完整商戶測試 25/25 通過；測試、型別、建置及來源封包再次通過。

3499 已載入最新商戶流程，2026-10-31T11:12:06.092Z 以獨立示例 session 實走 M3 素材 → 原活動編輯器補齊 → M4 確認發佈並讀回，PASS。沒有外部請求或頁面錯誤。獨立 3500 測試程序已停止，3499 留供審閱。重啟已清除先前記憶體示例進度；請重新整理原預覽。

對應來源封包：641 entries，逐檔比對 0 mismatch；SHA-256 `a1e4022f2604254fa2994c7476ca0d8fea6108ac732dd9a115eaec616413ee5e`。

## 仍未接通／驗收

- 正式商戶 brief 持久化、真正帳戶／公司成員／個案權限、Auth／RLS／RPC 的隔離、交易及撤權競態。記憶體 fixture 不替代資料庫證據；本批沒有執行先前待審的 SQL。
- 真 AI、MCP、OAuth、Search Console、Google Calendar、WhatsApp Business、Instagram 或其他平台；只有未連接狀態和自有示例素材，沒有實際帳號授權、發信、貼文或日曆修改。
- 真商戶公開資料更新、對外活動發佈、送達、營收／支付／預訂歸因及第三方內容權利；booking／payment 持續關閉。
- 原合約未支援的地址／營業時間寫入、其他商戶子模組資料連接；目前只保留原功能及清楚標示範圍。
- 手機真機、輔助科技、正式後端整合、CI 候選、hosted 與部署驗收。
