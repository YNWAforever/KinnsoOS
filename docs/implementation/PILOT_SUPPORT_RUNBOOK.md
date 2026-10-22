# Kinnso pilot 支援、提醒恢復及交班 — 2026-10-22

狀態：source/local controls 可審查；真角色／target／輪值／schedule delivery **NOT_RUN/BLOCKED**。用戶確認沒有指定target／owner inputs；不另建case或排程系統。

| 接手類別 | 入口及需要的reference | 有權角色與核對 | 可做及不能重做的事 | 原角色回讀 |
|---|---|---|---|---|
| 存取／角色 | `/{locale}/support`；requestId、company、當時actor角色，私有保存身份 | Ops用自己的fresh權限；company membership不是ops authority；分開configuration與permission | 先讀目前authority；AUTH_REQUIRED/FORBIDDEN清除被拒private view，晚回應不可恢復；不代派角色、不叫用戶登入以啟用未接通服務 | 原帳戶新session讀成功對照；outsider仍拒絕 |
| 草稿／衝突／未知提交 | 既有case及request receipt；保存原requestId/payload/revision/scope | 核對同actor/company/entity；先read receipt/current revision | read failure不解鎖、不清草稿；unknown用原payload/requestId核對後重試；CAS conflict顯示差異，再由原用戶決定；不建立新request假裝修復 | 保存後reload／new login／第二裝置；只稱實際執行層級 |
| 合作／交付爭議 | Creator/merchant「向客服查詢此合作」；server核實mission context／case ID／submission ID | 只讀被授權detail；private proof僅owner等既有權限，marketing不繞過 | 客戶reply與internal decision/reason分開；case A/B/new draft各自保留；不以核准創造payment/refund/settlement | Creator回讀review／修訂；Merchant回讀該campaign，不改另一案 |
| Job／通知故障 | `/ops/monitoring`、inbox event reference、job/run與deadline version | Ops核對target及job owner；最新attempt/result與最後success各自記錄 | 先查原receipt與recipient inbox；unknown send不盲目重發、不清dedupe；partial保持incomplete，只補必要page/window | 原收件角色讀同event；in-app recorded與外部provider送達分開 |

## 值班交接記錄

每次handoff包含：case/reference、source/tree/deployment/schema/config binding、target目的與owner reference、current actor role/company、expected/observed、最後確定成功、最後失敗／unknown、原requestId與receipt reference、已嘗試動作及結果、下一個owner/action、截止窗口、cleanup decision。公開repo只存角色及reference，私人內容／credentials不放入log。

目前owner／輪值及支援渠道未指定：保留未分配，不能承諾回覆時間或RPO/RTO。以既有case ID交接；不自行發送外部訊息或更改assignment。

## 提醒補跑與停止程序（PD13 source；PD17真實驗收仍未跑）

- 既有`runCollaborationReminders`預設每頁50、最多4頁、15s budget；date/cursor/loop守衛不放寬。due-soon定義沿用24h，deadline version及通知時期限不改寫成目前期限。
- 記錄`completed/scanned/emitted/nextCursor`及原now/window。逾budget保持incomplete；發送ACK未知先查receipt／dedupe，不用新事件ID再送。
- 同事件重跑、期限version不同、撤權與partial各有既有unit controls；本機fake emit成功不是DB去重或recipient送達證據。
- Job failure保留舊`lastSuccessAt`；最近attempt/time/result可見，沒有觀測顯示unknown。job記錄不證明外部delivery。
- 排程owner、真正dispatch window、recipient scope、provider sender、告警接收者全部未指定；不註冊schedule、不開email、不執行hosteddispatch。
- 適用scope獲准後：固定exact candidate/target/window → 讀receipt → bounded補跑 → 原recipient回讀 → 一班handoff。停止future dispatch亦須有該環境授權；保留inbox/dedupe/history，不刪通知作回退。

## 操作停止點

遇到target身份不明、cleanup失敗、跨scope資料、unknown外部副作用，停止該動作並保留reference。未指定target時不建立client，不把CI reset/seed/cleanup指向shared staging或production。來源回退使用對應PR revert；資料及immutable versions/receipts保留。

本輪未執行任何真角色case／schedule／provider／cleanup；PS06、H09–H13、PD16/17維持NOT_RUN。
