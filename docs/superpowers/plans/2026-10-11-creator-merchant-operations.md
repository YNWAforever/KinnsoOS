# KinnsoOS Creator／Merchant 下一階段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 逐項執行；如使用者明確選擇平行代理，再使用 `superpowers:subagent-driven-development`。以下 `- [ ]` 是待辦，不代表已完成。

**Goal:** 在 PR #55 的既有成果上，完成可供真實創作者、商戶及營運人員日常使用的合作產品，先通過部署及角色驗收，再交付招募、排期、提醒、支援與成果查閱。

**Architecture:** 沿用 KinnsoOS monorepo、Journeys 版面、Next.js BFF、Supabase Auth／Postgres／RPC／RLS。重用 `apps/web` 的成熟邀請、搜尋及 insights 契約，把必要流程接入 Journeys；業務寫入留在具備身份、權限、版本及重試保護的原子命令。逐批 PR、逐能力發布，保留舊站及既有資料的相容性。

**Tech Stack:** Node ≥22.13（以 CI 的實際版本為準）、pnpm 11.6.0；Journeys 的 npm lockfile；Next 16.3.8、React 19.2.4、TypeScript 5.9.3、Supabase、Playwright。此階段不附帶框架升級。

**Spec:** 本文件「本階段產品範圍」為新增需求規格；既有規格為 `docs/superpowers/specs/2026-10-11-creator-merchant-phase.txt`，相容性及發布依據為 `docs/implementation/CREATOR_MERCHANT_PHASE_2026-10-11.md`、`NEXT_PHASE_RELEASE_GATE.md`。執行時把本計劃存入 `docs/superpowers/plans/2026-10-11-creator-merchant-operations.md`，不要覆寫舊計劃。

**證據日期：** 2026-10-11 香港／2026-10-10 UTC。這是下一階段計劃；本次沒有合併 PR、執行 hosted migration 或部署。

## Global Constraints

- 保留 Journeys 目前版面與設計語言；延伸工作區，不重建另一套產品。
- 先讀 repo root 及目標目錄的 `AGENTS.md`，寫 Next 程式前讀安裝版本的 `node_modules/next/dist/docs/`。
- 新功能不得取代成熟契約而失去權限、配額、audit reason、版本衝突或重試語意。
- 保留 `getUser()`、`kinnso_actor()`、RPC/RLS、同源寫入、body 上限、`private, no-store`、actor-scoped request receipts。
- 已發布合作條款不可靜默修改；關閉招募不剝奪已接受創作者的提交及修訂權。
- Owner 才可閱讀／審核私人合作證明；marketing、clerk、finance 保持既有權限。新功能不能順便擴權。
- 金額保留 exact decimal／minor-unit 語意，逐幣別及金額性質分列。提交獲批不等於已結算，已結算不等於已付款。
- Booking、真實收款、提款及付費供應商啟用不在此階段；既有歷史財務與對帳能力照常保留。
- EN／zh-HK 同步；320px、200% 文字、鍵盤操作及未保存內容保護列為核心驗收。
- 隔離測試只能使用經 ownership guard 確認的本機／CI stack；禁止把 reset、seed、cleanup 指向 hosted 環境。
- Hosted 變更按 repo 現有 release／recovery 程序及既有授權處理。遇到必需而尚未獲授權的正式變更，先備妥精確差異、驗證及回退資料，再提出該一步。
- 公開 PR 不放憑證、原始私人證明、聯絡資料、部署 bypass token 或完整敏感 release manifest。
- 無法驗收寫 `BLOCKED`／`NOT_RUN`；測試數量、舊截圖或舊部署成功不能代替當前環境的證據。

## Review Focus

1. **回應遺失後重試：** 同一 requestId／payload 不重複發邀請、扣配額或產生提醒。P03、P09、P11 負責測試。
2. **登入期間撤銷角色：** 舊分頁、游標、匯出及直接 RPC 不可繼續讀寫。P05、P09、P10、P14、P17 負責測試。
3. **時區及截止競態：** 伺服器時間判定，截止瞬間和併發接受邀請保持一致；已接受工作不消失。P08、P11 負責測試。
4. **大資料及真空狀態：** 穩定資料集分頁無漏列，並行變更後可重新整理；未配置、無權限、零筆資料及量測不足各有正確表示。P02、P03、P10、P14、P16 負責測試。
5. **舊系統同時寫入：** CAS、邀請配額、已發布條款及審核歷史在 legacy writers 下仍成立。P08、P09、P15、P17 負責測試。

---

## 1. 已核對的起點

| 項目 | 最新已知狀態 | 對下一輪的含義 |
| --- | --- | --- |
| [PR #55](https://github.com/YNWAforever/KinnsoOS/pull/55) | OPEN、ready for review、未合併 | 不要重做已交付的核心合作流程 |
| PR head | `097b505d5e4b79948101877f98f331d27813e8af` | 下列通過數據只證明此程式版本 |
| main | `ad2c8ceb11a57d07ffb27be91ad0011a46fab3c8` | 開工時重新查證，不能當永久基線 |
| Journeys 驗證 | 396 unit、56 integration、108 connected browser 通過；build／typecheck／source package 通過 | 已有強的隔離測試基礎；不等於 hosted UAT |
| CI 證據 | [Journeys 38081449970](https://github.com/YNWAforever/KinnsoOS/actions/runs/38081449970)、[root 38081449892](https://github.com/YNWAforever/KinnsoOS/actions/runs/38081449892) | 保留 exact SHA、run、artifact，不只貼綠色徽章 |
| [PR preview](https://kinnso-o8617x94z-ynwaforevers-projects.vercel.app/en) | READY；公開／登入入口頁 HTTP 200 | UI 可載入 |
| Preview creator／merchant API | `503 UNAVAILABLE`、private/no-store | 需查能力／後端連接；尚未證明具體成因 |
| [Production](https://kinnso-os.vercel.app/) | 此次計劃未重新完成登入後驗收 | 不把 PR preview 當 production |
| 原始 ZIP | 已讀報告、任務 CSV 及證據說明 | 10 月 7 日記錄是歷史基線，不能覆蓋新結果 |

原始檔：`KinnsoOS_Audit_Evidence_2026-10-07.zip`  
SHA-256：`a505254fb4aa65d62901386ea2eff65875643d0c2b6528315f32b7aab09a3127`。

ZIP 的原始 20 項發現是 **A01–A20**，18 項補充需求是 **G01–G18**，六故事是 **U01–U06**；10 月 7 日新增稽核發現是 **F01–F12**。不要把這幾組編號混用。repo 的 `NEXT_PHASE_LEDGER.json` 與 `NEXT_PHASE_TRACEABILITY.csv` 已承接歷史映射。

### 已完成的程式，直接沿用

- 商戶申請 → 營運審核 → 公司資料 → 活動草稿／發布／關閉。
- 創作者申請／接受邀請 → 商戶接受 → 提交證明 → 要求修改 → 重交 → 批准／歷史。
- 創作者 onboarding、攻略編輯／發布、申請結果、站內通知、唯讀收益。
- 團隊邀請、分店及權限、核銷、營運佇列、客服、對帳、監測。
- 分頁、CAS、未知結果重試保護、私人 bundle 延後載入及雙語手機 reflow。

仍須 hosted 驗收；「已有」不代表每一項已在 production 可用。

## 2. 本階段產品範圍

交付兩個里程碑：

**M1：現有核心流程可以在指定環境實際使用。** 解決 503 的可觀察性與實際連接問題，完成 owner／creator／moderator 成功流程及禁止流程，形成可發布版本。

**M2：合作可以持續營運。** 商戶找合適創作者、建立有日期的合作、處理待辦及查看真實成果；創作者知道下一步、截止時間、修改要求和收益來源；營運可追蹤阻塞及支援個案。

本次新增產品決策：

- 工作區首頁顯示待辦及下一個動作，再進入清單／詳情；不以總數取代待處理工作。
- 活動有申請開始／截止時間；里程碑 `dueAt` 已存在，沿用。逾期先作提示，不自動拒絕證明或觸發罰款。
- 商戶搜尋沿用公開創作者資料、收藏及 tier quota；原有邀請權限維持 owner-only。
- 清單支援伺服器搜尋及狀態篩選；保留現有 Load more，無需無限滾動。
- 提醒先落站內 inbox；不預設寄真實 email／SMS／WhatsApp。
- 合作遇阻可開啟已連結活動的客服個案；此階段不建立無限制私人即時聊天。
- 報表只顯示可追溯的申請、邀請、提交、審核及既有核銷／歸因資料；不捏造 follower、ROI、轉換或收入。
- 至少三篇由作者核對的真實結構化攻略完成發布→旅人套用驗收；沒有內容授權時保留待辦，不用虛構內容填數。

## 3. 任務與依賴總表

下表是**新任務狀態**。P01–P03 可立即做；P04／P05 的 hosted 操作需要可用的指定 staging。若環境尚未就緒，繼續完成可在隔離環境驗證的 P07–P17。

| ID | 優先 | 交付 | 依賴 | 初始狀態 |
| --- | --- | --- | --- | --- |
| P01 | P0 | 最新基線、PR 與歷史需求對照 | — | READY |
| P02 | P0 | 安全的 backend readiness 診斷 | P01 | READY_AFTER_P01 |
| P03 | P0 | 正確的不可用／登入／衝突及重試 UI | P02 | READY_AFTER_P02 |
| P04 | P0 | Staging schema、設定及能力啟用 | P01、P02 | BLOCKED_TARGET |
| P05 | P0 | 指定角色 hosted 驗收 | P03、P04 | BLOCKED_TARGET |
| P06 | P0 | M1 核心流程發布與回退證據 | P05 | PENDING |
| P07 | P1 | Creator／Merchant 待辦工作台 | P01、P03 | PLANNED |
| P08 | P1 | 活動排期及截止語意 | P01 | PLANNED |
| P09 | P1 | 創作者搜尋、收藏、商戶邀請 | P08 | PLANNED |
| P10 | P1 | 活動／合作清單篩選及穩定分頁 | P07 | PLANNED |
| P11 | P1 | 合作事件及截止提醒 | P08、P09 | PLANNED |
| P12 | P1 | 合作支援個案及營運接手 | P03、P07 | PLANNED |
| P13 | P1 | 真實攻略供應及旅人套用 | P01；hosted 驗收需 P05 | PLANNED_CONTENT_GATE |
| P14 | P1 | 商戶成果報表與受控匯出 | P09、P10 | PLANNED |
| P15 | P1 | 收益來源、異常對帳與客服連結 | P01、P12 | PLANNED |
| P16 | P1 | 工作區量測及針對性效能優化 | P07–P15 程式完成 | PLANNED |
| P17 | P0 | 全流程手機、無障礙、權限回歸 | P07–P15 程式完成 | PLANNED |
| P18 | P0 | M2 pilot、監測及逐步發布 | P04–P06、P11、P13–P17 | PENDING |

每項另記 `code_status`、`ci_status`、`staging_status`、`release_status`；禁止只用一個 DONE 蓋過未完成的環境驗收。

## 4. 第一批：直接執行 P01–P03

### P01 — 核對基線並承接 PR #55

**檔案**

- 讀：`AGENTS.md`、`apps/journeys/AGENTS.md`、上述 phase/spec、`docs/implementation/NEXT_PHASE_LEDGER.json`、`NEXT_PHASE_TRACEABILITY.csv`。
- 更新：`docs/implementation/CREATOR_MERCHANT_PHASE_2026-10-11.md` 的最新證據附錄。
- 新增：`docs/implementation/CREATOR_MERCHANT_OPERATIONS_LEDGER.json`。

**介面：** 新 ledger 每項包含 `id, dependencies, code_status, ci_status, staging_status, release_status, source_sha, evidence[], blockers[], next_action`。沿用舊 N/A/G/U 編號作 references，不改寫歷史 ID。

- [ ] 讀最新 main、PR #55 的 head／狀態、open review、Actions、Vercel deployment SHA。
- [ ] 若 #55 已合併，從最新 main 建 branch；若仍未合併，從已核對的 #55 head 建 continuation branch，先以該 feature branch 作 stacked PR base，明列依賴。合併後再 retarget；不要重複 cherry-pick。
- [ ] 保留工作區既有修改；有衝突先判斷內容，不能 reset 掉使用者工作。
- [ ] 把原 20／18／6 與 N01–N18 的現況逐項連到新任務。舊狀態保留，只追加新證據。
- [ ] 對照當前程式與 #55，刪除計劃中已被新 main 完成的重複工作，記錄理由。
- [ ] 驗證 JSON 可解析、所有 dependency／reference 有對應 ID；人工確認 source、CI、hosted 沒有混淆。
- [ ] 提交獨立基線 commit，不為純文件變更編造測試。

**驗收：** 可回答「哪個版本、在哪個環境、哪個角色驗過、尚欠甚麼」。不能以 #55 的綠燈關閉整個 U03／U04／U06。

### P02 — 找出 503 的可診斷原因

**檔案**

- 讀／重用：`apps/journeys/lib/contracts/capabilities.ts`、`lib/api/server.ts`、`lib/supabase/server.ts`。
- 新增：`apps/journeys/lib/contracts/readiness.ts`、`scripts/check-readiness.mjs`、`tests/readiness.test.mjs`。
- 如需修改 `backendTarget`，必須維持既有安全條件與測試結果。

**介面（新增）**

`diagnoseReadiness(env: Environment): ReadinessReport` 為純函式，不連 DB。報告僅含：

- `schemaVersion: 1`；
- `backend: 'configured' | 'unavailable'`；
- `checks: {code: string; status: 'pass' | 'fail' | 'unknown'}[]`；
- `capabilities: Record<string, CapabilityMode>`；
- `schema: 'not_checked'`。

固定 code：`SUPABASE_ORIGIN`、`APPROVED_ORIGIN_MATCH`、`AUTH_ORIGIN_MATCH`、`PUBLISHABLE_KEY`、`SITE_ORIGIN`。不輸出 env 值、key 片段、URL、使用者資料或原始 exception。

- [ ] 寫測試：合法 target 通過；缺 URL／origin mismatch／secret key 被拒；booking/payment 永遠 unavailable。
- [ ] 測試含有假的秘密字串，斷言序列化報告完全不含該字串或原 URL；未知 DB 狀態必須是 `not_checked`。
- [ ] 跑新增測試，確認尚未實作時失敗，再實作 pure function 與 CLI。
- [ ] CLI 從執行環境取得設定，stdout 輸出上述 JSON；required capability 未就緒 exit 1，設定就緒 exit 0。exit 0 只代表 config gate，不宣稱 RPC／schema 已驗。
- [ ] 用既有 deployment 工具只讀查實際預覽配置的存在性與有效值關係；不把憑證帶回對話／PR。
- [ ] 依序分辨 config → Auth session → authoritative actor → RPC/schema。不要看到 503 就斷言「缺 migration」或直接開所有 flags。
- [ ] 跑 `node --experimental-strip-types --test tests/readiness.test.mjs`、既有 capabilities/API tests、typecheck；提交。

**驗收：** 能安全縮小 preview 503 的原因；公共 API 仍只回原有一般錯誤，不暴露內部診斷。沒有設定存取時，交付工具及 `BLOCKED_CONFIG_INSPECTION`，不填猜測結果。

### P03 — 讓工作區錯誤與恢復操作可理解

**檔案**

- 更新：`apps/journeys/app/travel/CreatorMissionsWorkspace.tsx`、`CreatorEarningsWorkspace.tsx`、`MerchantCampaigns.tsx`、`MerchantOnboarding.tsx`、`MerchantApplicationReview.tsx`。
- 新增：`apps/journeys/app/travel/WorkspaceServiceState.tsx`、`tests/workspace-service-state.test.mjs`。
- 重用：`lib/contracts/capabilities.ts` 的 `ErrorCode`、各工作區既有 pending command 與 request receipt。

**介面：** `WorkspaceServiceState({locale, code, requestId?, retryState, onRetry?})`；`retryState` 為 `read | immutable-command | blocked`。元件只顯示狀態及合法動作，不自行重建 command。

- [ ] 寫真實元件／handler 測試：503 不顯示「沒有活動」；401 提供安全返回的登入；403 不誘導重複提交；409 保留草稿並要求重新載入確認。
- [ ] 加「回應遺失→使用者再按→同 requestId、同 payload」測試，以及 pending 狀態禁止修改未知命令。
- [ ] 兩語顯示可操作文案；一般使用者只見服務暫時未能使用／重試／參考編號，不見 env 變數或 SQL 細節。
- [ ] 讀取重試可刷新；寫入重試使用既有 immutable intent。若意圖不能可靠恢復，先讀回結果，不發一個新命令。
- [ ] 錯誤區有可讀名稱／狀態宣告；鍵盤焦點仍可回到問題欄位。角色改變時清空不再可讀的私人結果。
- [ ] 跑新測試、相關既有 unknown-result regression、EN／zh-HK 瀏覽器錯誤案例、typecheck；提交。

**第一批完成條件：** P01 ledger、P02 診斷、P03 可恢復 UI 都有證據；提交一個範圍清晰的 PR。報告 config gate 與 hosted blocker，不宣稱 503 已解決，除非已重新取得成功回應。

## 5. M1：現有核心流程可使用

### P04 — Staging schema 與能力就緒

**檔案：** `docs/implementation/NEXT_PHASE_RELEASE_GATE.md`、`scripts/MIGRATION_RELEASE.md`、`docs/implementation/RELEASE_OPERATIONS.md`；新增公開的 `CREATOR_MERCHANT_STAGING_CHECKLIST.md`。敏感 manifest 留在受控位置。

**消費／產出：** P01 的 source binding＋P02 診斷 → 指定 staging 的 schema／config／runtime 驗收記錄。

- [ ] 確認環境用途、Auth 歸屬、備份／回復與既有授權；只讀比較 live definitions、grants、migration history。
- [ ] 盤點 PR #55 的三個 migration：`20261010190752_kinnso_creator_collaboration.sql`、`20261010190758_kinnso_merchant_campaign_lifecycle.sql`、`20261010190951_kinnso_merchant_onboarding_profile.sql`。
- [ ] 確定實際缺少的 delta 及全部先決 migration；不能假設只有這三個檔未套用，也不能對已存在物件盲目重播。
- [ ] 依既有 recovery gate 演練，記錄 exact SQL hashes、舊函式／grants、回退應用版本；不改寫已發布 migration。
- [ ] 在已獲授權的 staging 執行需要的 additive delta，再設定一致的 `KINNSO_SUPABASE_URL`、approved/auth origins、publishable key、canonical `KINNSO_SITE_URL`。
- [ ] 保留既有可用 capabilities；schema 就緒後才加入所需 `creator,merchant,ops,notifications`。不要把既有 trips/media 等 flags 整串覆蓋掉。
- [ ] 檢查 Auth callback／sign-up／recovery 的 redirect 與 cookie；獨立 Auth origin 不假裝可 SSO。
- [ ] 匿名 private API 在配置正確時應進入 401；以指定有效帳戶及有效 query 確認 200。403／404／409 的情境另在 P05 驗。

**驗收：** source、schema、flags、auth、deployment 對齊；500/503 無未解釋核心阻塞。若無目標或授權，保留精確 blocker，繼續其他隔離開發。

### P05 — 真實角色 hosted UAT

**檔案：** 重用 `apps/journeys/tests/e2e/u03-u04-collaboration.spec.ts`、`u04-merchant.spec.ts`、`u04-merchant-invitations.spec.ts`；新增 `docs/implementation/CREATOR_MERCHANT_HOSTED_UAT.md`。

**介面：** `{sourceSha, deploymentId, environment, schemaFingerprint, actorRole, scenarioId, expected, observed, evidence, status}`；帳戶識別及原始證據放私人記錄。

- [ ] 以指定 synthetic creator A/B、merchant owner A/B、marketing、clerk、finance、moderator 執行成功與禁止矩陣；使用已授權角色，不在瀏覽器自行提權。
- [ ] 跑「商戶申請→審核→公司→發布→創作者申請→接受→證明→修改→關閉招募後重交→批准→收益」。
- [ ] 跑雙帳戶讀寫、跨公司／分店、私人證明 URL、撤銷角色後舊分頁、直接 API／RPC 存取。
- [ ] 驗證 reload／新登入仍讀到已保存結果；timeout、重試、版本衝突無重複紀錄或丟稿。
- [ ] 驗證新客註冊、驗證信／復原信的實際測試郵箱；本機 mailbox 成功不可代替 hosted 設定。
- [ ] 用獨立的 staging 驗收程序，不把會 seed/reset/cleanup 的 CI suite 指向 staging。

**驗收：** 三角色主故事成功、所有禁止案例符合既有 403／404 隱藏政策、沒有重複副作用。未能操作的角色或郵箱明列 NOT_RUN。

### P06 — M1 發布及回退

**檔案：** `docs/implementation/NEXT_PHASE_RELEASE_GATE.md`、`.github/workflows/journeys-production.yml`、`scripts/verify-journeys-production.py`（原則上重用）；新增 `CREATOR_MERCHANT_M1_RELEASE.md`。

- [ ] 綁定實際 candidate SHA／CI／schema／部署；確認當前 review 已處理，不能沿用舊 head 的通過數據。
- [ ] 依授權及 repo gate 合併／發布已驗核心範圍；只需要部署前核准的步驟才交回使用者，先備齊可審核包。
- [ ] production 只讀驗 source archive、匿名 private fences、公開入口與 private noindex；真人寫入驗收須屬已同意的 pilot 範圍。
- [ ] 在 staging 演練應用／capability 回退；保留 schema、已接受合作、receipts、審核及 uncertain delivery 狀態。
- [ ] 記錄發現、回復方式及負責人；production 未發布則狀態停在 STAGING_ACCEPTED。

**驗收：** M1 有可操作環境及明確發布狀態，不以 Vercel READY 一項結案。

## 6. M2：日常合作營運

以下指定新檔／介面是設計，不代表 repo 現已有實作。每項行為改動按「失敗案例→最小實作→通過→commit」執行；每個 schema change 用執行當時唯一 timestamp 的新 migration。

### P07 — 待辦工作台與清晰導覽

**檔案：** 修改 `CreatorWorkspace.tsx`、`MerchantWorkspace.tsx`、`Workbench.tsx`、`routes.ts`、`workbench.css`；新增 `app/travel/CollaborationTasks.tsx`、`lib/collaboration/tasks.ts`、`tests/collaboration-tasks.test.mjs`。

**介面：** `NextAction = {kind, entityId, title, dueAt: string|null, href, priority}`。只使用角色可讀資料；若提供跨頁總數，需 server aggregate，不能從目前一頁推算全體。

- [ ] 先測新帳戶、待審核商戶、owner、marketing、creator 無資料／有修改要求／已有完成合作各自應見的動作。
- [ ] 把工作區分成總覽、合作、內容／創作者、收益／成果、公司／團隊等適用區域；權限不允許的入口不顯示，也不依靠隱藏入口作授權。
- [ ] 顯示「待我處理／等候對方／已完成」，每張待辦直達正確詳情；過期 session 不殘留上一帳戶資料。
- [ ] 沿用 dynamic imports；測 public bundle 不含 private 工作區，完成 component＋browser 驗證後提交。

**驗收：** 使用者登入後可以直接找到下一步，不需猜活動 UUID 或在所有模組間跳轉。

### P08 — 活動排期與截止時間

**檔案：** `lib/merchants/campaigns.ts`、`campaign-repository.ts`、`lib/creators/collaboration.ts`、`MerchantCampaigns.tsx`、`CreatorMissionsWorkspace.tsx`、相關 RPC 新 migration；`tests/campaign-schedule.test.mjs`、`tests/integration/campaign-schedule.test.mjs`。

**介面：** 擴充 `CampaignInput`：`applicationOpensAt: string|null`、`applicationClosesAt: string|null`、`scheduleTimeZone: string`。ISO UTC 儲存時間，IANA timezone 供顯示；舊活動 null 保留原行為。里程碑沿用 `dueAt`。

- [ ] 先測 `opensAt <= now < closesAt`；null 無該側界限，非 null 時 opens < closes；無效／無 offset 的 timestamp 拒絕。
- [ ] 草稿可編輯日期，publish 時再次在 DB 驗證。已發布日期與條款不可靜默修改；本階段要改條款就建新草稿。
- [ ] 套用到 join／invite／accept 的所有可達寫入入口，包括 legacy writers；僅 client 倒數不算限制。
- [ ] 舊邀請過截止後不可變 active；已 active 的 creator 保留提交／revision。dueAt 逾期只標示，不自動變 rejected／cancelled。
- [ ] 測香港午夜、UTC 邊界、夏令時間歧義輸入、截止瞬間併發及舊活動相容性；DB integration 通過後提交。

**驗收：** 兩邊看到同一個日期語意，改電腦時間不能繞過截止，既有合作不被排期破壞。

### P09 — 重用成熟創作者搜尋及邀請

**檔案：** 先讀 `apps/web/lib/merchants/{creator-search,relevance,saved,invite,tier-policy}.ts`、`invite-actions.ts` 及最新 `merchant_invite_creator` 定義。
新增 Journeys `lib/merchants/creator-discovery.ts`、`app/api/merchant/creators/route.ts`、`app/travel/MerchantCreatorDiscovery.tsx`、對應 unit／integration tests；擴充既有 campaign command 及 RPC。

**介面：** `merchantCreators.list(merchantId, {q?, after?, savedOnly?})` → `{items, nextCursor, quota}`；`saveCreator`／`unsaveCreator`／`inviteCreator` 命令均帶 actor-scoped `requestId`。邀請帶 `missionId, creatorId, expectedUpdatedAt`。

- [ ] 先測只回傳公開且 active 的創作者屬性，沒有私人 email／證明；不產生假 follower、評分或商業排名。
- [ ] 重用既有收藏／私人備註模型和搜尋語意，使用 bounded server query；不搬整個舊 Next app 或另建 creator 表。
- [ ] Owner 發送自己 published、時間有效的活動邀請；wrapper 沿用最新 DB tier quota／per-merchant serialization，不在 client 固定配額。
- [ ] 在同一 transaction 中做 current actor、CAS、receipt、quota、participant 與 inbox event；unknown response 重試取得原結果，不再次扣額。
- [ ] 測兩邀請爭最後一個配額、相同 creator 重邀、已參與、inactive creator、owner 撤權、跨商戶 ID、legacy/native 併發。
- [ ] 連接現有 creator accept／decline，邀請帶回完整 brief。跑 unit、integration、EN／zh-HK 主故事後提交。

**驗收：** 商戶不用猜 UUID 即可找人並邀請；原有權限、tier 與月度 quota 不被放寬。

### P10 — 搜尋、篩選與可重現分頁

**檔案：** `campaign-repository.ts`、`creators/collaboration.ts`、兩個 list API／RPC、`MerchantCampaigns.tsx`、`CreatorMissionsWorkspace.tsx`；新增 `lib/collaboration/list-query.ts`、`tests/collaboration-query.test.mjs`、`tests/integration/collaboration-query.test.mjs`。

**介面：** `CollaborationListQuery = {q?: string; status?: string; after?: string; sort?: 'recent'|'deadline'}`。只接受每個 scope 的列明狀態；搜尋字串上限 100；每頁維持既有較小上限且不得超過 50。

- [ ] 先測超長／重複 query key／錯狀態／不同 filter 的 cursor 被拒，換篩選會清掉舊 cursor。
- [ ] 使用 server query；recent 按不可變的 createdAt＋id，deadline 按最近待完成里程碑 dueAt＋id（null 最後）排序。新 cursor 綁 scope/filter/order，沿用舊 cursor 的路徑須明確 versioned。
- [ ] UI 保留 URL 查詢狀態、Load more、清除篩選與真空狀態；不做 client 全量下載再篩選。
- [ ] 用同時新增／更新與相同時間資料驗沒有越權、頁內重複或錯誤總數；狀態／deadline 改變後提供重新整理，不宣稱跨頁 snapshot。穩定資料集必須逐頁無漏列；新增索引前保留 EXPLAIN 證據。
- [ ] 測 51+ rows、filter switch、stale cursor、兩角色；通過後提交。

**驗收：** 能快速找出「待審、需修改、截止將至」；游標不能跨公司或角色復用。

### P11 — 站內通知及截止提醒

**檔案：** 重用 `lib/notifications/repository.ts`、`delivery.ts`、`InboxWorkspace.tsx`、現有 notification/outbox schema；新增 `lib/collaboration/reminders.ts`、`app/api/cron/collaboration-reminders/route.ts`、unit／integration tests。

**介面：** `dueCollaborationReminders(now, after, limit)` 回 bounded candidates；DB unique dedupe key 為 `eventKind + entityId + recipientId + deadlineVersion`。排程只呼叫受控函式，不讀取／輸出私人證明內容。

- [ ] 先測邀請、申請結果、revision、approved 等既有事件不被再造第二份；補缺的事件與正確 native link。
- [ ] 新提醒僅對 active 合作且未提交／待修訂的里程碑，在 dueAt 前 24 小時內發一次，過期後發一次。沒有 dueAt 不發。
- [ ] 截止版本、取消、完成、帳戶停用在執行當下重查；close 招募不壓掉 active 工作提醒。
- [ ] DB transaction 去重；job crash／兩個 worker／同一 tick 重跑無重複。掃描分頁 bounded，可補跑。
- [ ] 沿用 cron auth、監測及重試；無有效 token／owner／schedule 不啟用 hosted cron。
- [ ] email provider 保持未配置。若另獲授權啟用，沿用既有 opt-out、sending lease、accepted≠delivered 契約，不寫新發送器。
- [ ] 通過重複／故障／深連結測試後提交；排程的真實執行結果另驗。

**驗收：** inbox 會告訴使用者要處理甚麼；營運看得到 job 最後成功／失敗，未知不顯示綠色。

### P12 — 合作阻塞的客服接手

**檔案：** `lib/notifications/repository.ts`、`app/api/support/route.ts`、`app/api/support/[id]/messages/route.ts`、相關支援 UI／RPC；新增 `lib/collaboration/support-context.ts` 及測試。

**介面：** 支援 case 可有 `context: {type:'mission'; id:string} | null`，連結不可成為存取活動的授權；原有 linked event 與 case ownership 保留。

- [ ] 先測 creator／owner 只能從自己可讀的活動開個案；任意 mission UUID、別人的 case 或 entity link 不能跨權限。
- [ ] 表單預填活動名稱及非敏感識別；不自動複製私人 proof URL／聯絡資料。
- [ ] 複用現有 open／in_progress／waiting_customer／resolved、指派、回覆及稽核；相同 request 重試只建一個 case。
- [ ] 在工作區顯示本人 case 的狀態及下一步；對方不因共用活動而自動獲得 case 訊息。
- [ ] 跑 unit、客服 integration、營運接手 browser 案例後提交。

**驗收：** 使用者知道如何報告阻塞；營運可處理並保留歷史，不增加無關角色的私人內容可見度。

### P13 — 真實創作者內容閉環

**檔案：** 沿用 `CreatorWorkspace.tsx`、`lib/creators/editor-operations.ts`、guide publish/withdraw APIs、`lib/seo/guide-publication.ts`；新增 `docs/implementation/CREATOR_CONTENT_PILOT.md`。

- [ ] 核对已有 onboarding、刪除／復原／排序、HH:mm、發布前檢查及衝突恢復；只修重現出的缺口。
- [ ] 以作者同意的至少三篇攻略驗真實 days／stops／來源／內容語言／合法封面與核實日期；無內容時列 BLOCKED_CONTENT。
- [ ] 驗草稿不公開、發布版本可讀、私人筆記不外洩、旅人預覽套用保留來源、下架不刪旅人的私人副本。
- [ ] 合作證明不自動變公開攻略；公開仍須作者明確發布。
- [ ] 保留作者驗收與 U01／U03 證據；涉及程式修正按對應 unit／integration／browser gate 提交。

**驗收：** 真正有可使用的內容供應，不以假 itinerary 或 mock profile 完成產品。

### P14 — 可解釋的商戶成果及匯出

**檔案：** 先讀 `apps/web/lib/insights/merchant.ts`、最新 `merchant_insights`；新增 `apps/journeys/lib/merchants/insights.ts`、`app/api/merchant/insights/route.ts`、`app/travel/MerchantInsights.tsx` 及測試。

**介面：** `MerchantInsightsPage = {asOf, range, counts, perCampaign, nextCursor, coverage}`。counts 分開 current-status snapshot 與期間事件；沒有紀錄時 `unknown` 或 `null`，不可任意當 0。

- [ ] 先固定指標定義：邀請數是發出紀錄；接受率的 numerator／denominator 用同一 cohort；申請、提交、批准、核銷、歸因分開。
- [ ] Reuse 既有 RPC 定義與權限，server aggregate 全範圍；不得將當前頁 totals 當公司 totals。
- [ ] 提供 date/campaign filter，顯示 as-of 與資料覆蓋；未知／無足夠資料明示。
- [ ] 新增只限已授權欄位的 CSV 匯出，與畫面同 filter；固定上限 5,000 rows，超限要求縮小範圍，不能靜默截斷。
- [ ] 匯出防 formula injection，不含私人 evidence/contact；每次重查角色，私有 response 不快取。
- [ ] 測跨商戶、撤權、零 denominator、跨頁合計、duplicate joins、CSV 惡意文字；unit／integration 通過後提交。

**驗收：** 商戶能追查數字來自哪一類真實紀錄；未接支付時不顯示虛構營收或 ROI。

### P15 — 收益及對帳的解釋與追查

**檔案：** `CreatorEarningsWorkspace.tsx`、`lib/creators/collaboration.ts`、`lib/finance/contracts.ts`、`repository.ts`、`FinanceWorkspace.tsx`；新增／擴充 earnings／reconciliation tests。

**介面：** 沿用 `EarningsPage`、`FinanceWorkspace`；只在必要時補 source reference／asOf，不新增 payment command。

- [ ] 測 tracked／settled／payouts、unknown currency、負數／更正紀錄及大額 decimal 的正確顯示；不以浮點加總。
- [ ] 每筆顯示「這是甚麼、來源、時間、目前狀態」，提供可授權的活動／對帳／P12 支援連結。
- [ ] Finance 沿用現有 review statuses／owner／reason／revision，異常有跟進方式；不能把客服 resolved 當成 money settled。
- [ ] 驗 creator 只能看自己、merchant finance 只看授權範圍，historical payout 不等於現在可提款。
- [ ] 跑相關 unit／integration 及 no-invented-settlement 回歸後提交。

**驗收：** 創作者理解每一類數字；營運能追查問題；現有金錢狀態與不可用供應商界線不變。

## 7. 效能、整體驗收及發布

### P16 — 先量測工作區，再修最主要瓶頸

**檔案：** `apps/journeys/scripts/performance/README.md`、`run.mjs`、`run-latency.mjs`、`lib/telemetry/performance.ts`、`tests/e2e/performance.spec.ts`；針對測得瓶頸修改 UI／RPC／index。

- [ ] 在現有 owned-isolated performance lab 增加 creator list/detail、merchant campaign/review 路線；登入與匿名、冷／暖 cache 分開。
- [ ] 保留 exact SHA、dataset、viewport、throttling、樣本量及原始失敗。沿用現有量測完整性、latency baseline 及 budget 機制。
- [ ] 先取 baseline，再選一個瓶頸修正：重複 fetch、过大 payload、N+1、缺索引或過早下載 private bundle；不做無證據的全面重構。
- [ ] 同條件比較 before/after，保留功能與私有 cache 邊界；局部測試不能冒充完整 lab PASS。
- [ ] Field CWV 使用既有 consent／retention；樣本不足保持 insufficient。定義實際營運 thresholds 前，不宣称 production SLO。

**驗收：** 至少有 creator／merchant 關鍵路徑的可信 baseline 及最主要瓶頸的量測結果；沒有可重現瓶頸就交付 baseline，不為交差改架構。

### P17 — 手機、無障礙、資料及權限回歸

**檔案：** `tests/e2e/u03-u04-collaboration.spec.ts`、`u06-accessibility.spec.ts`、`u06-role-bundle.spec.ts`、相關 native/legacy integration；新增本階段測試及人工驗收記錄。

- [ ] EN／zh-HK、320／640／1280px、200% 文字：無遮擋重要操作，長 URL／名稱／錯誤可讀。
- [ ] 鍵盤完成 create/edit/filter/invite/review，focus、label、error summary、對話框關閉及返回可理解。
- [ ] 真實 iOS Safari／Android Chrome 與 VoiceOver／NVDA 分開記錄；沒有可用設備寫 NOT_RUN，emulation 不替代實機。
- [ ] 測 slow/offline／重新整理／登入失效／角色撤銷／unknown acknowledgement；未保存內容及 command receipt 不丟失。
- [ ] Native＋legacy 同時寫入測 CAS／deadline／quota／approved terms；檢查匿名 response、bundle、source archive 不含私人資料。
- [ ] Root regression、Journeys unit/integration/browser、source extraction rebuild、typecheck 全部綁最終候選 SHA。若修改 head，重跑受影響 gate。

**驗收：** 零未處理的跨帳戶存取、丟稿、重複命令副作用、關鍵路徑失敗。既有 skip 必須有名稱及理由，不能為新功能增加靜默 skip。

### P18 — Pilot 與 M2 逐步發布

**檔案：** 新增 `docs/implementation/CREATOR_MERCHANT_OPERATIONS_RELEASE.md`；更新新 ledger 及舊 N09/N14/N15/N16/N17/N18 的對應 increment。

- [ ] 設定具名負責人的小規模 pilot：至少兩位 creator、兩家公司 owner，並覆蓋 moderator／marketing／clerk／finance 邊界；使用經授權資料。
- [ ] 依序驗「找到人→邀請／申請→合作→修改→批准→成果／收益→支援」，包含至少一個跨公司禁止案例。
- [ ] 每個 scheduled job 有 owner、token／設定狀態、最後成功、失敗與可安全重試方法；通知 acceptance 不叫 delivered。
- [ ] 完成 exact-candidate release manifest、migration/recovery 演練、來源封裝比對及最後可回退部署。
- [ ] 依 P06 的授權／release 程序逐能力上線，觀察錯誤率、延遲、失敗工作及支援阻塞；threshold 來自已核對 baseline。
- [ ] 對越權、丟稿、重複業務寫入立即停止擴大發布，依演練關閉相關能力或回退應用；資料、receipts、歷史保留。
- [ ] 最終回報 source／CI／staging／production 狀態，完成與未完成項目、PR、證據、剩餘 blocker 及 owner。

**完成定義：** 所有本階段核心故事在指定環境通過，發布狀態可核對。仍待內容、實機、provider 或 production 授權的部分不能寫「整個產品 100% 完成」。

## 8. 驗證命令與證據規則

從 repo root：

```bash
git status --short
git rev-parse HEAD
pnpm --filter @kinnso/journeys test
pnpm --filter @kinnso/journeys build
pnpm --filter @kinnso/journeys typecheck
```

在 `apps/journeys`：

```bash
python -m unittest discover -s tests -p source_package_test.py
node --experimental-strip-types --test tests/readiness.test.mjs
node --experimental-strip-types --test tests/workspace-service-state.test.mjs
```

後兩個檔在 P02／P03 建立後執行。Integration／connected browser／Auth mailbox 按 `.github/workflows/journeys.yml` 的 owned stack 流程：

```bash
node scripts/ci-evidence.mjs unit
node scripts/ci-evidence.mjs integration
node scripts/ci-evidence.mjs browser
node scripts/ci-evidence.mjs auth-mailbox
```

這不是對任意環境直接執行的捷徑。先讀 workflow 的 config／stack startup／env／build 步驟；本機沒有 owned Docker stack 就使用 CI，不修改 target guard。Root monorepo gate 用現有 workflow，保留 legacy web／worker regression。

每個 task 的 evidence 至少含：source SHA、environment、test/scenario、result、run/artifact、觀察時間。歷史 396／56／108 是 baseline，不是未來必須硬湊的數字；新增案例通過且既有覆蓋保留才算完成。

## 9. PR 切分與執行方式

| 批次 | 工作 | 可審核成果 |
| --- | --- | --- |
| A | P01–P03 | 基線＋診斷＋服務狀態／恢復 UX |
| B | P04–P06 | Hosted 啟用、指定角色驗收與 M1；必要環境修正獨立列出 |
| C | P07、P08 | 待辦導覽與活動排期；可拆兩個 PR |
| D | P09、P10 | 創作者招募與清單效率；資料契約先於 UI |
| E | P11、P12 | 站內提醒、客服／營運接手 |
| F | P13–P15 | 真實內容、成果、收益解釋；內容驗收與程式 PR 分開記錄 |
| G | P16–P18 | 量測修正、全故事驗收、pilot／M2 release |

不要把七批壓成一個巨大 PR。每批先完成可驗收行為，review 後才擴展。環境受阻時可以開發其他無 hosted 依賴的任務，不能跳過 release gate。

## 10. 原有 20＋18 需求的承接

「接續」代表本階段貢獻，不代表整項原始需求完成。詳細 K→N→A/G/U 映射保留在舊 ledger；以下是新的 P 任務對照。

| 原 ID | 原範圍 | 本階段接續／保留 |
| --- | --- | --- |
| A01 | 分支、部署、DB 對齊 | P01、P04–P06、P18 |
| A02 | 架構／來源披露 | P01、P17；沿用現有 monorepo 決策 |
| A03 | Demo 與正式資料 | P03、P05、P13 |
| A04 | Booking 文案誠實 | P03、P15；保持 unavailable |
| A05 | 主要任務導覽 | P07、P17 |
| A06 | 結構化攻略 | P13；重用已有模型 |
| A07 | 錯誤不能當空結果 | P03、P10、P14 |
| A08 | 有界搜尋／分頁 | P09、P10、P16 |
| A09 | 審核佇列／詳情查詢 | P07、P10、P16 |
| A10 | 全量金融彙總風險 | P14、P15、P16 |
| A11 | 待辦、老化、指派 | P07、P11、P12 |
| A12 | 小屏後台導覽 | P07、P17 |
| A13 | 登入返回原任務 | P03、P05、P09 |
| A14 | AI 來源及不實承諾 | 保留 N17 回歸；此階段不增 AI／訂位承諾 |
| A15 | Nightly 覆蓋／證據 | P01、P06、P18 |
| A16 | 無障礙未完 | P17；人工與自動證據分列 |
| A17 | 本機資料／跨裝置 | P05、P13、P17；保留旅人回歸 |
| A18 | 真實合法封面 | P13；缺素材不虛構 |
| A19 | UI／領域耦合 | P07、P16；僅按需要拆分 |
| A20 | Locale 一致 | P03、P13、P17 |
| G01 | 核心價值與次序 | M1→M2；P01、P18 |
| G02 | 舊功能去留／完成定義 | P01、P09、P14、P18 |
| G03 | 身份及資料歸屬 | P04、P05、P17 |
| G04 | 多角色 onboarding | P05、P07；保留既有入口 |
| G05 | 本機資料正式匯入 | 保留 N04/N08 回歸；P05、P17 |
| G06 | 所有權／分享 | P05、P13、P17 |
| G07 | 真正可出行內容 | P13；原旅人需求仍按舊 ledger |
| G08 | 手機旅途中使用 | P17；U02 仍需其完整情境 |
| G09 | 地點／內容品質 | P12、P13 |
| G10 | 創作者素材到發布 | P07、P13 |
| G11 | 公司、分店、職員 | P05、P07、P09、P17 |
| G12 | 收入／對帳／爭議 | P12、P14、P15；支付另立階段 |
| G13 | 通知、提醒、客服 | P03、P11、P12 |
| G14 | 營運每日工作 | P07、P10–P12 |
| G15 | 語言、SEO、分享 | P13、P17、P18；不自動全站開索引 |
| G16 | AI 任務及驗收 | 保留 N17／accepted-output 回歸；本階段無 AI 擴張 |
| G17 | 發布、還原、來源 | P01、P04–P06、P17、P18 |
| G18 | 增長、留存、成本 | P11、P14、P16、P18；只報實測 |

## 11. 六故事完成狀態的更新規則

| 故事 | 本輪已知 | 下一輪驗收 | 不可誤報 |
| --- | --- | --- | --- |
| U01 新旅人 | 既有實作／隔離回歸；完整 hosted 故事本次未重驗 | P05、P13、P17：註冊、安全返回、真實攻略套用、保存讀回 | 公開首頁 200 不算完整 PASS |
| U02 旅途中與分享 | 本次未重新完成實機全故事 | P17 保留弱網、媒體、分享撤銷回歸；餘項沿用 N09/N14/N15 | 不因 creator/merchant 完成而關閉 U02 |
| U03 新創作者 | #55 核心程式／隔離測試通過；preview API 503 | P04、P05、P07–P13、P15、P17 | code complete 與 hosted accepted 分開 |
| U04 商戶成果 | #55 核心程式／隔離測試通過；preview API 503 | P04、P05、P07–P12、P14、P15、P17 | 邀請、核銷、結算、付款是不同事實 |
| U05 營運一天 | 既有 ops／客服／對帳及測試；本次 hosted 未驗 | P05、P11、P12、P15、P18 | 自動 job 有程式不等於有成功排程 |
| U06 發布切換 | #55 未合併，hosted migration／角色 UAT 待完成 | P01、P04–P06、P16–P18 | CI 綠燈、Vercel READY、正式放行不可互換 |

## 12. 直接交給 Codex GPT-6.1 Sol 的啟動指令

```text
你是接手 YNWAforever/KinnsoOS 的 Codex GPT-6.1 Sol。
請執行本計劃，先完成 P01–P03，再按依賴繼續下一批；不要只再寫一份計劃。

先重新讀最新 main、PR #55、review/CI 與 deployment SHA。
截至這份計劃，PR #55 head 為
097b505d5e4b79948101877f98f331d27813e8af，
仍 OPEN、未合併。Creator／Merchant 核心流程已完成程式及隔離測試，
不要重做 onboarding、申請、審核、campaign、證明／revision 或唯讀收益。

讀 AGENTS.md、安裝版本 Next docs、現有 phase/spec、原 N 任務 ledger、
NEXT_PHASE_RELEASE_GATE.md，以及本計劃。
維持 Journeys 版面，重用舊 web 的成熟契約。

第一個 PR：
P01 — 核對 source/CI/preview/production，建立新的 operations ledger；
P02 — 以不暴露秘密的 readiness 診斷分辨 preview 503；
P03 — 修復工作區 unavailable/auth/conflict/unknown-retry 的 UX。
每項行為改動先建立能失敗的測試，完成最小實作與相應驗證。

如果 PR #55 未合併，從其最新已驗 head 建 continuation branch，
使用 stacked PR，清楚標示依賴；若已合併則從最新 main 開始。
保留使用者修改，不重複搬程式，不 force-push 未經授權的歷史。

不要盲目開 capability flags，也不要把 CI reset/seed/cleanup 指向 hosted DB。
Staging 環境或配置未提供時，完成可驗證的程式、測試及精確 blocker，
繼續其他隔離開發任務。正式操作按既有授權及 release gate，
只在確實欠授權的最後一步提出具體請求。

重用 actor/session/RLS、同源、private/no-store、CAS、request receipts、
owner-only private evidence、既有 quota 及跨幣別財務界線。
Booking/payment/withdrawal 保持未啟用。
對不確定的寫入結果，保留原 requestId/payload，先 reconcile 再 retry。

每個 PR 回報：實際行為、改動原因、測試與 source SHA、
已知限制、code/CI/staging/production 狀態、下一個具體動作。
不用舊測試數字或「READY」代替當前驗收。
```

## 13. 計劃自我核對

- [x] 舊 ZIP 的 A01–A20、G01–G18、U01–U06 與現有 ledger 已保留，沒有重新編號或全部標完成。
- [x] PR #55 已交付內容與本階段新增內容分開。
- [x] 第一批有具體檔案、介面、失敗案例、命令及驗收。
- [x] 現有分頁、通知、客服、finance、性能工具與 merchant discovery/insights 被重用。
- [x] Hosted blockers 不會阻止所有隔離開發；但不能跳過發布驗收。
- [x] 五類 review 風險均有任務測試承接。
- [x] 任務依賴無循環；最終發布綁定實際候選版本。
- [x] 沒有聲稱本次已開發、合併、部署或完成真人 UAT。

