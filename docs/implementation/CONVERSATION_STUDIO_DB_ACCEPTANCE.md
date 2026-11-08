# 待批准隔離資料庫驗收 — 未執行

本文件是第一批原始碼的剩餘門檻。不可在正式資料庫執行；本次工作未套用任何 SQL，也未啟動資料庫。

先由負責人批准明確隔離 target、測試帳號及自有資料，再沿用 `scripts/verify-test-target.mjs`。不要修改 target allowlist 使錯誤環境通過。

## 單一連線與角色矩陣

使用 `apps/journeys/tests/integration/studio-creator.test.mjs` 驗證：

1. C1 thread/source/brief → handoff → 原 save／publish writer 的真實保存與讀回。
2. 第二帳戶與未登入拒絕私人來源；另外加入 Ops、失效 creator、撤回 session 的矩陣。
3. 同 UUID 相同 payload 重送只有一份成果，不同 payload 衝突；來源停用後所有舊 handoff／草稿讀取拒絕。
4. 原 bookmark/unbookmark 可更新收藏計數；直接改計數仍由原 column grant 拒絕。
5. Guide 固定 brief v1，brief head 改 v2 後原 guide 仍可獨立保存／發布；目前 source ACL 不能被略過。
6. 合法刪除 guide 後，同 UUID 不可直接重建或經舊 RPC 重建；刪除仍執行原 source withdrawal。

## 兩個同時連線的識別碼回歸案例

必須使用兩個獨立 PostgreSQL 連線及可驗證的同步屏障；單一連線依序 delete/insert 不能代替此案。使用新建立的已綁定 guide UUID `G`，使用權限測試只能用測試帳戶的 claims/session。

| 步驟 | 連線 A | 連線 B | 必須觀察 |
|---|---|---|---|
| 1 | `BEGIN`，以原擁有人刪除 `G`；暫不 commit | 尚未執行 | A 已有 identity transaction lock；tombstone 未提交 |
| 2 | 保持 transaction 開啟 | `BEGIN`，嘗試以相同 `G`、cached content、`status='published'` 直接 INSERT | B 被 identity lock 擋下；未產生可見的新公開 guide |
| 3 | `COMMIT` | 等待 INSERT 回覆 | B 收到 `studio_restricted`；沒有公開重建 row |
| 4 | 獨立第三個授權／匿名讀取 | `ROLLBACK` 後再用原 save、lower publish 及 direct UPDATE 嘗試 | 全部不可復活 `G`；tombstone 保留，原 source/ACL 限制未消失 |
| 5 | 重建另一個測試 guide，反過來安排 INSERT 比 DELETE 先取得 identity lock | 與上一步反向排序 | 可以回唯一鍵衝突、序列化／deadlock 拒絕，絕不能成功重建或顯示成功 |

記錄每個 transaction 的隔離等級、開始／commit 時間、錯誤碼、鎖等待、最終 row/binding/tombstone 數量。先驗 PostgREST 實際採用的 READ COMMITTED；若可暴露其他隔離等級，另驗 REPEATABLE READ／SERIALIZABLE。SQL source checks 不能關閉這個門檻。

另以兩個連線交錯 source revoke 與 domain save/publish：第一方持有來源鎖時，第二方等待；最後結果只能是在有效權限下完成後再撤權，或寫入被拒絕，不可出現未確認的新來源內容。

## 交付證據

每案列問題、角色、target 指紋、app、平台、時間、基線與變更來源 hash、expected/actual、PASS/FAIL/BLOCKED/NOT_RUN。證據中不保存 token、密碼、正式資料或帶存取權的 URL。
