# KinnsoOS 第一批創作者流程 — 本機審閱交付

2026-10-31，Asia/Hong_Kong。基線 `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`；變更留在獨立工作區，尚未提交、合併或部署。

本批已實作「三方共用首頁 → C1 → 明選文件 → 證據 → 獨立私人 brief → 完整公開投影 → 原 guide 編輯器 → 獨立發布確認 → 授權讀回核對」。本機測試使用自有示例文字；連接帳號、模型、資料庫及發布結果沒有冒充真實服務。

**交付層級：本機程式與測試供審閱。真實 DB/Auth/RLS、隔離環境持久化、hosted 驗收均未通過，也未嘗試。** 兩份遷移僅為來源檔；不可因本機測試或建置通過就啟用 capability。

## 可審閱內容

| 項目 | 本批行為 | 主要程式落點 |
|---|---|---|
| 共用首頁 | 保留「探索、規劃及記錄旅程」、原目錄與導覽；旅人／創作者／商戶並列；問題只在記憶體試用 | `apps/journeys/app/travel/ConnectedHome.tsx`、`app/workroom/ConversationHome.tsx` |
| 範本及討論串 | 20 張角色任務卡；C1 可完成本機整條流程；每個主題獨立 thread；Ops 卡按身分呈現 | `lib/studio/templates.ts`、`app/workroom/WorkroomShell.tsx`、`ThreadWorkspace.tsx` |
| 文件與證據 | 只保存明選文件；本人原創聲明與已核實權利分開；來源含版本、權限版本、雜湊；第三方權利仍未驗證 | `DocumentPicker.tsx`、`EvidencePanel.tsx`、`lib/studio/evidence.ts` |
| 私人 brief | 分開於聊天歷史；來源引用保留；保存需 ACK 及獨立讀回；衝突保留本機文字；離頁有未保存提示 | `BriefEditor.tsx`、`ThreadWorkspace.tsx`、`repository.ts` |
| 原 guide 寫入 | 不新增 guide writer；使用既有 save/publish RPC；公開投影排除未選私人段落；逐次完整確認；readback 不符仍不宣稱成功 | `lib/studio/guide-editor.ts`、`guide-publication.ts`、`app/travel/CreatorWorkspace.tsx` |
| 舊網站相容 | 使用 web 自己的登入；綁定 guide 走同一組準備及原 writer；未綁定 guide 保留舊流程；保留新增日期、站點及撤回套用 | `apps/web/lib/guides/studio-actions.ts`、`studio-adapter.ts`、`components/kinnso/StudioBoundGuideForm.tsx` |
| C2–C5 | 讀已保存版本、原收益／合作資料，產生本頁檢查及回到原工作區的入口；追蹤記錄不叫付款 | `lib/studio/creator-tasks.ts`、`app/workroom/CreatorTaskPanel.tsx` |
| 連接頁 | Firecrawl、Google、社交平台及已確認的 WhatsApp Business／Instagram 均只呈現候選／未連接／未同步 | `app/workroom/ConnectionsPage.tsx` |

C2–C5 的檢查結果目前只在本頁呈現，**未實作為可永久保存的 canonical report**。旅人、商戶及 Ops 的新對話寫入流程不在這批完成範圍；它們的原功能仍可直接進入。對話目前是明示的來源摘錄／人工整理模式，沒有接通生成模型或 MCP。

## 原功能保留

既有 Journeys 路由檔扣除兩處新工作室入口後，與基線的 SHA-256 相同：76 個靜態入口及全部原動態辨識規則保留。原 web 108 個 page/API route 檔案仍存在；這是入口及來源保留證據，並不表示 108 個功能都已作真實後端驗收。

完整清單見 [路由基線](../../apps/journeys/tests/contracts/studio-route-baseline.json)；測試見 [保留契約](../../apps/journeys/tests/studio-preservation.test.mjs)。保留範圍包含探索、收藏、行程、媒體、分享／撤回、創作者 onboarding／guide／合作／收益、商戶、Ops、收件匣、原 agent 工作區，以及 GPL 授權／原始碼入口。

## 資料與權限邊界

- `20261031090000_add_studio_metadata.sql`：私人 threads、sources、messages、artifacts、不可變 artifact versions、evidence links、request receipts；直接表權限關閉，以 caller RPC 驗 owner 及來源權限。
- `20261031090100_guard_studio_guide_writes.sql`：保留既有 writer；交易內許可、來源鎖及版本檢查；直接改 guide 與底層發布也受限制；合法收藏計數更新保留。
- 刪除 guide 仍獲支持；只留不含正文或 owner 的 UUID tombstone，阻止同一 ID 重建成無來源限制的 guide。此新資料的正式保留政策仍需完成。
- Guide 固定使用交接當時的不可變 brief 版本。之後修改 brief head 不會自動改 guide，也不會鎖死其編輯器；來源的現時權限／版本仍要通過檢查。
- 身分以資料庫為準；首頁卡片不授權。Ops 不獲得私人文件或個人連接的額外權限。兩個 app 不共用 session。
- 未知結果保留原 request UUID、revision 及 payload。瀏覽器只存 actor／thread／guide 範圍下的恢復 UUID，不存正文、來源文字或 token；不同 thread 不會覆蓋彼此的待核對請求。
- `conversation`、`creatorBriefHandoff` 預設 unavailable；booking／payment 維持硬關閉。沒有新增 provider 憑證、OAuth 流程、排程或部署設定。

**資料庫限制：**上述 SQL 尚未套用或以 PostgreSQL 執行。來源契約測試及獨立審閱不能替代 migration replay、真實角色隔離、RLS、觸發器、鎖順序、並行交易及效能驗收。新增的 [整合案例來源](../../apps/journeys/tests/integration/studio-creator.test.mjs) 刻意未執行。

## 驗收證據

所有證據位於 `docs/implementation/evidence/conversation-studio/`；機器可讀清單為 [CONVERSATION_STUDIO_EVIDENCE.json](CONVERSATION_STUDIO_EVIDENCE.json)。平台：Windows、Node 24.18.0、pnpm 11.6.0、Playwright 1.58.2、Chromium 145.0.7632.6。JSDOM 結果僅屬元件測試。

| 測試問題 | 層級／資料來源 | 結果及證據 |
|---|---|---|
| 共用首頁能否不偏向單一角色？ | 實際 React 與原 Next／無後端 | PASS；`native-green.log`、`browser-results.json` |
| C1 能否接回既有編輯器並分開確認發佈？私人 D2 會否外洩？ | 真實 UI＋本機假後端 | PASS；`review-browser-green.log`；公開 projection 不含 D2 |
| 逾時後是否保留同 UUID／payload？重新載入能否核對？ | 模擬傳輸中斷、opaque reference | PASS；同檔的 retry、reload 案例 |
| 來源撤權、ACK 後讀回拒絕、帳戶切換會否清除私密成果？ | 模擬拒絕及帳戶生命週期 | PASS；同檔的 permission-denial、source/account 案例 |
| 未選文件是否完全不送出？不同討論串會否互相覆蓋恢復資料？ | 實際元件＋命令攔截 | PASS；unselected-source、thread A/B 案例 |
| 發生較新版本時可否保留本機文字再明確比對？ | 模擬並行版本 | PASS；conflict 案例 |
| 手機／桌面是否橫向溢出？ | Chromium 320／390／768／1280 px | PASS；四個 viewport 案例及 `brief-*.png`；不是實機 Safari 驗收 |
| 舊網站是否獨立驗身分並保留明確確認及相同 UUID？ | 純 adapter／JSDOM | PASS；`web-offline-final.log`，14 項 |
| 舊路由是否保留？ | 基線 hash／檔案清單 | PASS；`preservation-green.log`，76 靜態入口、108 web routes |
| 私人資料確實寫入／真實發布及跨帳戶隔離是否通過？ | 真實 DB/Auth/RLS | BLOCKED；本次明確禁止套用遷移及建立連接 |

最終 Journeys 離線結果：**1,312 PASS／1 個 Windows symlink 平台跳過／0 FAIL**。工作室瀏覽器：**12/12 PASS**；原 Next 訪客：**2/2 PASS**；web 離線：**14/14 PASS**。兩 app 型別檢查、web lint、Journeys 建置通過；對應來源封裝逐位元核對 **627 entries，0 mismatch**。

初始 RED、測試架構失敗及修復紀錄保留。最初 native 測試失敗為 Next 的 route announcer 造成模糊選取，以及 GPL 連結文字選取不符；只修正測試選取器，沒有移除 Next 行為或授權標示。Web 原測試 setup 要求 `.env.test`，因此沒有提供憑證；另建只允許這四個 unit/component 檔的離線設定，並禁止 fetch，未修改原 integration gate。

## 獨立審閱

第一輪發現 4 個 P1、2 個 P2：SQL 區域變數、刪除重建繞過、收藏計數被誤擋、讀回撤權清除、brief head 改變鎖死 guide、多 thread 恢復覆蓋。已修正來源並新增針對性回歸；完整決策及後續審閱狀態見 [執行紀錄](CONVERSATION_STUDIO_EXECUTION.md)。最後來源覆核未再提出 P1/P2（限明列的 READ COMMITTED 行為）；並行刪除重建另加共用 identity lock、AFTER INSERT 再檢查及兩連線驗收 runbook。覆核時看到的舊封裝已重新產生，並逐檔核對 627 entries 完全一致。SQL 案例仍待獲准環境實測。

## 尚未通過的門檻

| 狀態 | 項目 | 繼續條件 |
|---|---|---|
| BLOCKED | Web Next 建置的既有 core env gate | 另行提供獲准隔離 target；本次未填正式或假冒設定，typecheck／lint／14 個離線測試已通過 |
| BLOCKED | 遷移 replay、真實 receipt／RLS／RPC、跨帳戶與 Ops 拒絕、交易鎖與來源撤權競態 | 另行批准明確隔離資料庫及測試帳號，先審閱兩份 SQL |
| BLOCKED | 真實 guide 保存／發布／收藏／撤回及 web 跨站獨立登入 | 隔離 DB 驗收後，以非正式帳戶及自有內容執行新增 integration cases |
| BLOCKED | 第三方內容權利、私人衍生資料／tombstone 的保留及刪除政策 | 產品／資料治理決策及來源授權證據；本批沒有宣稱已解決 |
| NOT_RUN | Safari、iOS／Android 真機、輔助科技、效能負載測試 | 確認測試裝置及驗收範圍；Chromium viewport 不代替它們 |
| NOT_RUN | Hosted／CI 指定候選及部署驗收 | 本次不部署；沿用倉庫逐版本證據，不覆蓋歷史 blocker |
| NOT_RUN | C2–C5 永久報告、其餘角色新對話流程、所有真實連接 | 後續批次及相應 capability／權限／provider 驗收 |

## 本機重現

在隔離工作區執行；不要提供 `.env.test` 或正式憑證。

```powershell
pnpm --filter @kinnso/journeys test
pnpm --filter @kinnso/journeys exec playwright test --config playwright.studio.config.ts
pnpm --filter @kinnso/journeys exec playwright test --config playwright.studio-native.config.ts
pnpm --filter web exec vitest run --config vitest.studio.config.ts
pnpm --filter @kinnso/journeys typecheck
pnpm --filter web typecheck
```

新 SQL 及新增 integration test 的執行均不屬上述步驟。若重新載入後原請求從未在伺服器留下紀錄，會維持「結果未知」，不會以新 UUID 自動再發；只在記憶體內的未保存文字不能保證復原。

本機試用可啟動 Journeys，後端設定保持空白；其保存入口會如實顯示未接通。互動測試中的保存／發布由 Playwright 假後端提供，不能當成可用的真實服務。

審閱畫面：[手機 brief](evidence/conversation-studio/brief-390.png)、[桌面 brief](evidence/conversation-studio/brief-1280.png)、[原編輯器發布流程示例](evidence/conversation-studio/creator-published.png)、[真實 Next 訪客試用](evidence/conversation-studio/native-guest.png)。
