# 創作者 C2–C5：本機示例流程審閱

2026-10-31，Asia/Hong_Kong。延續 C1 的隔離工作區；本批新增可操作的 C2–C5 流程與私人報告。所有資料皆為自行編寫的示例，保存只發生在本機程序記憶體。此文件不提升先前 DB／Auth／RLS／hosted 驗收狀態。

同一預覽：<http://127.0.0.1:3499/zh-HK/>。頂部「創作者示例任務」及原任務範本可進入四條流程；「私人示例成果庫」可重新開啟報告。

| 範本 | 已補齊的本機操作 | 完成界線 |
|---|---|---|
| C2 發佈前檢查 | 選已保存草稿→獨立討論→展開來源→私人缺項報告→原 guide 編輯器修正→重讀新版再保存報告 | 內容及來源檢查，不是發佈批准；示例預設欠摘要，修正後可看到結果更新 |
| C3 成效檢討 | 選原收益類別與紀錄期間→證據／未連接訊號→私人報告與下一步→成果庫→原收益紀錄 | 未連接平台、分母及缺少金額保持缺口；原幣別分開；不執行付款 |
| C4 回應修訂與交付 | 選已接受合作→讀修訂要求→撰寫回應及證明→保存私人報告→完整交付預覽→原 submitEvidence 命令→獨立讀回→原審核時間線 | 終點是提交後等待審核，不冒充商戶核准、外部訊息送達或付款 |
| C5 更新攻略版本 | 選已發佈 guide→保存修改提案→看具體前後差異與完整內容→原 writer 保存草稿→原編輯器另行確認發佈→查看版本及採用副本 | 示例 v2 發佈後保留 v1 快照及旅人已採用的 v1；不聲稱真 DB 版本驗收 |

每個報告包含問題、獨立討論、來源快照／版本、讀取時間、檢查發現、未驗證缺口和私人筆記。報告用 revision 與 request UUID 保存；只有 ACK 與另外讀回一致，才顯示保存完成。發出保存前，會先在本機 adapter 保留並讀回不可變意圖，瀏覽器只保留 UUID。傳輸中斷維持結果未知；即使保存 POST 從未送達，重新載入也能恢復該意圖，不改 request UUID 或 payload。程序重啟，或連準備階段也未完成且沒有留下意圖時，不保證找回未保存文字，仍不宣稱保存成功。

## 程式及保留範圍

- [creator-reports.ts](../../apps/journeys/lib/studio/creator-reports.ts)：私人報告合同、C2–C5 來源整理、C3 覆蓋範圍、C5 差異、保存讀回驗證。
- [CreatorTaskFlow.tsx](../../apps/journeys/app/workroom/CreatorTaskFlow.tsx)：任務討論、證據、可編輯成果、確認、原流程交接、未知結果恢復、帳戶失效清除。
- [WorkroomShell.tsx](../../apps/journeys/app/workroom/WorkroomShell.tsx)：可選成果儲存介面；**只有本機預覽注入記憶體 adapter**。正式 app 未注入時保留原 C2–C5 讀取檢查，不新增正式 API 或繞過 RLS 的 writer。
- [本機預覽目錄](../prototypes/conversation-studio-local/README.md)：示例資料、loopback server、報告 adapter、原 guide／合作／收益元件、版本與採用副本檢視。

原 creator domain writer、合作命令、收益合同、app 路由清單、web、資料庫遷移與部署設定本批沒有更改。C1 瀏覽器流程回歸通過；Journeys 既有回歸套件及功能保留契約通過。來源 manifest 納入新增共用 UI、純函式及測試。

## 驗證

平台：Windows、Node 24.18.0、Chromium 145.0.7632.6；手機為 390px 瀏覽器視窗，桌面為 1280px，並非 iOS／Android 真機。

| 問題／案例 | 結果 | 來源 |
|---|---|---|
| C2 能否發現缺項、修正後讀新版，再重新開啟私人報告？ | PASS | `c2-c5-browser-check.json` C2 |
| C3 是否保留未連接平台／未驗證分母，報告可從成果庫重開？ | PASS | 同檔 C3；`c2-c5-unit-green.log` |
| C4 是否需有效參與者、完整確認後才提交，結果停在待審核？ | PASS | 同檔 C4 正向及 invited 拒絕 |
| C5 是否先顯示差異、另行確認發佈，且採用副本不變？ | PASS | 同檔 C5 |
| 未知報告結果能否以相同 UUID／payload 重試、重載核對？ | PASS | 同檔兩個 report ACK 案例 |
| C4 ACK 遺失後重載，會否改成另一個提交意圖？ | PASS：保留原命令及 UUID | 同檔 C4 retry 案例 |
| 確認後修改內容會否失效？帳戶切換會否清除私人結果？ | PASS | 同檔 edit invalidation／account clearing |
| 保存 POST 未送達便重載，可否恢復同一意圖？ | PASS | 同檔 unreceived POST 案例 |
| 來源停用後，報告、重試及歷史收據是否拒絕私密內容？ | PASS | 同檔 source stop 案例 |
| C4 是否沿用原 1–5 條、不重複 HTTPS 連結規則？重讀來源會否丟失已寫修改？ | PASS | 同檔 validator／refresh 案例 |
| 原 C1 是否仍可完成？ | PASS | `c1-reviewed-regression.log`、`preview-check.json` |
| 型別、原功能與來源封包 | PASS：1,318 tests；1 個平台跳過；631 封包項目一致 | `c2-c5-typecheck.log`、`c2-c5-journeys-reviewed.log`、`c2-c5-source-check.json` |
| Journeys 無後端設定的本機建置 | PASS | `c2-c5-build-reviewed.log` |

上述檔案皆位於 [本機預覽目錄](../prototypes/conversation-studio-local/README.md)。瀏覽器十四個案例沒有頁面 JavaScript 錯誤或外部網路請求。首次測試曾發現表單標籤不穩定，已加入明確可達名稱；第一次完整離線套件在受限制的暫存 Git／硬連結操作失敗，改在獲准本機執行後通過。原始失敗日誌保留，沒有刪測試或放寬斷言來掩蓋問題。

畫面：[手機成果](../prototypes/conversation-studio-local/c3-report-mobile.png) · [桌面成果](../prototypes/conversation-studio-local/c3-report-desktop.png)。

## 仍未驗證或未接通

- 正式報告持久化 adapter、真實身分／RLS／RPC、SQL、跨帳戶授權、來源 ACL 競態：本批沒有接通或測試。示例 cookie 隔離不是 Auth/RLS 驗收。
- 任何真實 AI／MCP／OAuth、Instagram／TikTok／YouTube／Search Console 或其他 provider：未連接。booking/payment 保持原關閉狀態。
- 真實內容權利、資料保留及刪除政策：未解決；本批使用示例文字，不因 UI 完成而宣稱通過。
- 真機、輔助科技、CI 指定候選、hosted／部署、web 完整環境建置：本次未測，先前門檻不變。
- 本機程序停止／重設後，報告與模擬紀錄會消失。此預覽不是永久保存服務。

## 設計判斷

1. 只在示例預覽注入成果儲存介面，保留正式 app 的原行為；代價是尚未提供正式永久報告。
2. C3 日期篩選以紀錄時間為準，不偽裝平台分析期間；代價是資料不足時無法給出平台轉換或投資回報結論。
3. C4 完成至待審核、C5 保留採用副本；代價是真實商戶審核及資料庫版本行為仍需分開驗收。

4. 來源重讀保留已寫的修訂／版本提案，並與最新來源比較；若交付對象改變則停下來核對，避免把舊文字送往另一個里程碑。
5. 交付確認列出里程碑及原提交參考，讓確認綁定具體目的地；這仍不是商戶批准。

獨立覆核發現三個 P2，另兩項關乎覆寫修改及確認對象的問題按實際影響提升為 P2。五項均已修正，重現測試先失敗再通過；沒有留下 deferred minor。完整記錄及最終本機網址狀態見 [執行紀錄](CONVERSATION_STUDIO_C2_C5_EXECUTION.md)。


機器可讀的測試、來源指紋及界線：[C2–C5 證據清單](CONVERSATION_STUDIO_C2_C5_EVIDENCE.json)。

最終 3499 預覽已重啟並驗證首頁、四任務入口及 C3 保存／讀回；無外部請求，示例進度已重設。見 `live-preview-check.json`。
