# 階段 0–2：設計與實作計劃審閱紀錄

日期：2026-11-01，Asia/Hong_Kong。**DOCUMENT_REVIEW_COMPLETE；IMPLEMENTATION_NOT_STARTED；LIVE_ACCEPTANCE_NOT_RUN。**

最後文件檢查記錄：2026-10-31 16:18:56 UTC／2026-11-01 00:18:56 HKT。三份文件的內部連結、Markdown fence 與空白檢查通過；核對六個工具、16 個任務（12 L＋4 N）及 20 項驗收標準。

本輪回應使用者已選定的「旅程與優惠配對優先」，交付文件供審閱。方向獲選不代表本份詳細設計、實作、資料庫或真實連接已獲批准。

## 文件與閱讀次序

1. [完整設計](../superpowers/specs/2026-10-31-kinnsoos-trip-offer-matching-phase-0-2-design.md)：產品範圍、資料權責、模型、六個唯讀 MCP 工具、配對規則、授權、恢復與 20 項驗收標準。
2. [實作計劃](../superpowers/plans/2026-10-31-kinnsoos-trip-offer-matching-phase-0-2.md)：程式落點、依賴圖、12 個本機任務 L01–L12、4 個需另批的原生任務 N01–N04，以及測試／驗收交付。
3. 本紀錄：獨立審閱修正、已檢查事項、仍未驗證及本輪變更邊界。

檔名保留 2026-10-31 的起草日期；完成文件審閱時已是 2026-11-01 HKT。

## 給產品審閱者的重點

- 共用首頁及 C1–C5／T1–T5／M1–M5 全部保留，新配對是可選入口。
- 首個可批准實作的交付是同一本機示例：旅程意向 → 商戶公開優惠 → 配對 → 證據 brief → 原 guide 編輯／發佈確認。
- 使用者旅程保持私人；商戶看不到原始意向或私人行程，SME 工具也不接收這些內容。
- SME confirmed 優惠、Kinnso 展示、創作者公開使用、旅人採用與再分享是不同的確認／授權。
- 本機示例不是已接通 MCP／OAuth／資料庫。真實交易、佣金、社交發送與挑戰獎勵不在階段 0–2。

設計者提出、待本輪審閱確認的選擇：香港單城市自有示例、owner-only 新商戶公開操作、唯讀 MCP、確定性 matching-v1、用途獨立授權、60 秒原生來源核對規則、先交付 L。這些不是已完成實作或已取得的第三方權利。

## 獨立 builder check

由獨立 software/product reviewer 讀設計，任務是指出「如果猜錯會改變實作」的問題；沒有授權該審閱者改檔、跑產品測試或建立連接。

首次提出六項問題，已逐項補入設計並同步計劃：

| 問題 | 已落實的設計決定 | 對應任務 |
|---|---|---|
| grant 與 publication revision 互相失效；單一 grant 無法獨立撤用途 | 分開 optimistic revision、contentVersion、grantVersion；每用途一筆 grant；明訂 import→prepare→grant→publish，發布不改 contentVersion | L02/L04、N01 |
| public_guide 是否也能 T2 採用、T3 分享；撤權會否刪自己的筆記 | 六用途分開；建立欄位級 DerivativeBinding。未獲權不能採用／分享，撤權保留 travellerNote 與自有內容；無法分離時拒讀，不改舊版本 bytes | L09/L10/L11、N03 |
| 展示權未明可否仍當 needs_confirmation 回傳內容 | 展示授權／必要來源核對不明直接排除，不回正文；合法展示但日期／預算待確認才進 pending 組 | L04/L06 |
| workspace-wide 優惠跨店會否撞 key 或共用權限 | import key 加 appliedLocationId；sourceHash 排除套用店；每店 publication／grant 獨立，整體來源封存使所有相關候選失效 | L03/L04 |
| 金額、當地日期及截止日缺乏一致語義 | MCP 價格為主要貨幣十進位字串，轉整數 minor units；真零與 null 分開；有效日首尾包含，以目的地下一日 00:00 為截止 | L02/L05/L06 |
| 主動商戶讀取與自動 60 秒驗證互相矛盾 | 初次匯入由商戶觸發；僅在事先同意 readRefreshAllowed 後，server 可因用戶動作唯讀核對已選 refs。沒有背景、付費或私人意向傳送 | L03/L07、N02/N03 |

同一審閱者針對六項修正作一次有界覆核，回覆：**“nothing important left”**。這只表示該輪設計問題已處理，不是程式／安全／版權／正式環境驗收。

主作者另作實作計劃自查：每個規格章節有任務落點；刪除意向／偏好、tombstone、30/90 日保留及人工清除補入對應任務；public reader inventory 加入既有 catalog、SEO／OG、分享及私人採用來源欄位，避免只保護新 UI。

## 本輪已核對

| 問題 | 平台／時間／證據 | 結果與限制 |
|---|---|---|
| SME 分支基線是否沿用正確 repo | GitHub connector 唯讀，2026-10-31 HKT；main `4f20fde582f26be2aff97d4afd6b7ca680ce8c06` | 已核對；固定 SHA 的程式證據，不推定目前部署版本 |
| Kinnso 原流程、型別、writer 及測試落點是否存在 | Windows／PowerShell，本輪唯讀；HEAD `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54` 加先前未提交 C/T/M 內容 | 已讀原契約及本機驗收文件；未重跑產品測試 |
| MCP 契約是否參考具體版本資料 | 2026-10-31 HKT；官方 2026-07-28 tools／authorization 文件，來源連結在設計 §7 | 已檢閱；未選定／安裝 SDK，未驗證真 protocol transport 或 OAuth |
| 文件內部連結、fence、工具／任務／驗收編號是否完整 | Windows，本機唯讀文件檢查；2026-11-01 HKT | 文件檢查通過；不等於產品測試通過 |
| 原程式與現有預覽是否被改動 | 2026-11-01 HKT 檔案指紋核對；方法為排序路徑＋每檔 SHA-256，再取集合 SHA-256 | 兩組均與起草前完全相同，見下表 |

| 範圍 | 檔案數 | 起草前＝完成文件後的 SHA-256 |
|---|---:|---|
| Git tracked＋非忽略 untracked，排除 docs 的既有檔案 | 2,204 | `30ac49d8945552d46ecac0bfb955d97b4f175606cb480951d242ac5d29a19fe1` |
| `docs/prototypes` 的既有預覽檔案 | 54 | `095dd590c01843cb39e188e250cdec8d9a5d3e5d96f826c5cdb89bbb497a5db0` |

上表核對原內容未變；不宣稱監測了所有外部程序、資料庫或正式服務。工具未呼叫產品 server、資料庫或 provider，亦沒有重啟使用者 3499 預覽。

## 尚未驗證／仍被阻擋

| 項目 | 狀態 | 下一個必要條件 |
|---|---|---|
| L01–L12 實作與 A01–A19 新測試 | NOT_STARTED／NOT_RUN | 使用者審閱後明確批准本機實作 |
| 既有 C/T/M 在本次新候選的回歸 | NOT_RUN | 實作候選存在後跑指定舊流程；不沿用舊 PASS 充數 |
| 真 SME MCP bridge | UNVERIFIED | 找到既有 bridge 或經批准實作契約；證明 tools、scope、真 caller 與來源 |
| MCP OAuth authorization server、SDK／protocol | BLOCKED | 選定及驗證 G3；Neon 登入不直接視為 MCP 授權服務 |
| Kinnso 新 schema／RLS／RPC、原 studio SQL | NOT_APPLIED／NOT_RUN | G2 指定並批准隔離資料庫；原 SQL 與新模型相容驗收 |
| 真商戶供給、內容權利及再使用授權 | BLOCKED | 商戶與來源權利證據；示例授權不能替代 |
| 來源撤銷、公開 reader／cache 及跨系統 freshness | NOT_RUN | N03 全入口及故障驗收，明確接受設計的核對窗口 |
| Preview／正式部署、收入、社交發佈、booking/payment | NOT_AUTHORIZED／OUT_OF_SCOPE | 另立範圍、驗收及批准；本輪不啟用 |

## 本輪變更清單

只新增以下三份 Markdown 文件：

- `docs/superpowers/specs/2026-10-31-kinnsoos-trip-offer-matching-phase-0-2-design.md`
- `docs/superpowers/plans/2026-10-31-kinnsoos-trip-offer-matching-phase-0-2.md`
- `docs/implementation/TRIP_OFFER_MATCHING_PHASE_0_2_REVIEW.md`

沒有改程式或既有預覽檔案、套用遷移、讀正式憑證、部署、建立真實連接，亦沒有執行 build／產品測試。未提交、推送或開 PR；文件留在本機供使用者審閱。
