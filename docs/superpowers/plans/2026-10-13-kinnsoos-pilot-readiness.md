# KinnsoOS Creator／Merchant 完整工作流程與試點就緒 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 按任務執行；每個 checkbox 只在有證據時勾選。本計劃交給 **Codex GPT‑6.1 Sol**。原生執行即可；如採用獨立 reviewer，按當時適用規則安排，不能拿舊 review 代替新差異。

**Goal:** 把 PR #78 已驗證的 creator／merchant 能力，推進至同版本效能達標、指定 staging 可用、跨角色完整驗收及真實小規模試點，同時保留旅人、內容與營運的完整價值流程。

**Architecture:** 延續現有 Next.js `apps/journeys`、BFF API、Supabase RPC／RLS、request receipts 和本機草稿恢復。先量測商戶授權讀取與首個可操作欄位，再決定最小載入改動；不另建平行後台或重寫已通過的領域模型。發佈以 exact candidate、schema、config、roles 和 recovery 證據作同一組驗收。

**Tech Stack:** 證據基線為 Next 16.3.8、React 19.2.4、TypeScript 5.9.3、Playwright 1.58.2、Supabase CLI 2.107.0；CI Node 22。本機舊執行曾用 Node 24.19.0，受控比較改用同一明確版本並記錄，不混合比較；不為本階段順手升級依賴。

**Spec:** `KinnsoOS_Continuation_Evidence_2026-10-13.zip` 中的 report、22 工作單元、6 故事、PR76 逐檔決策、performance／verification／source-runs，以及保留的 20 項 A 發現、18 項 G 需求與21項 P/D 任務。原 ZIP 是隨行輸入；本計劃包不重複打包私有原始資料。

建議實作時將本計劃存入 repo：`docs/superpowers/plans/2026-10-13-kinnsoos-pilot-readiness.md`。本次只編製計劃，沒有修改產品、重跑 CI、合併 PR 或部署。

## Global Constraints

- 保留原 `W01–W22`、`A01–A20`、`G01–G18`、`U01–U06`、`P/D` ID；本次 NEXT-01～11 是接續執行順序，不取代原需求。
- 保留 Journeys 既有版面與 EN／zh-HK；本階段以使用者能完成工作為驗收。服務 unavailable、未登入、403、空結果、unknown write 各有不同處理。
- `MerchantProfile` 全公司鎖只涵蓋現有 pending-write／unknown；自身 read busy 留在自己的表單。不得把唯讀初載再次送成全公司 lock。
- fresh actor/company/role authorization、RLS、CAS、same request ID/payload、receipt、dedupe、v2 drafts 及跨帳戶隔離全部保留；未知寫入先查原結果，不重建 command。
- 不將 local/CI seed、reset、cleanup 或 performance lab 指向 hosted；不用 production 做負載測試。每項測試必須知道 target 和 fixture owner。
- 已有 migration 不改寫；已完成提醒 migration 是 `20261012170745_kinnso_reminder_context.sql`。CSV 歷史範圍中的 `20261012160000` 是舊計劃示意，不能重建第二份。
- LCP≤2500ms、CLS≤0.1 是每 page/cache group 的既有 local median 門檻；48 navigation、8 interaction、24 backend reads 及 cleanup 缺一不能 PASS。
- Latency 960 samples／72 warmups 的 `MEASURED_BUDGET_NOT_SET` 繼續如實保留；不得當成 cloud SLO 或 latency PASS。另訂 budget 必須先有 source-bound baseline 和明確 owner。
- 遵守 AGENTS.md；改 Next code 前讀安裝版 `node_modules/next/dist/docs/`。如改 Supabase，先核對適用官方文件及 pinned CLI help，再做 owned 驗證；不因權限错误放寬 policy。
- 現有授權支持本機、隔離驗證、自己的分支與 draft PR。main merge、正式部署、hosted SQL／配置／帳戶／scheduler 變動、對外訊息及 provider 啟用，須有相應明確 scope。先完成可審查 packet，最後才提出具體操作批准；缺外部輸入不阻止獨立本機工作。
- 本階段無新增 booking、payment、withdrawal、email provider 或 AI 擴張。已批准≠已結算≠已付款；fixture bytes≠真實網頁改善；READY≠已驗收。

## Review Focus

1. **晚載入奪焦點：** 使用者已聚焦邀請欄位後 profile 才 mount／GET 返回；一次輸入仍保留，pending write 仍鎖定。NEXT-03 沿用 W05 控制，NEXT-06 hosted 再驗。
2. **失權時 lazy chunk／舊回應返回：** 公司或 actor 改變後不得重現前一角色控制與私人稿件。NEXT-03 chunk failure／late response 控制及 NEXT-06 H05–H10。
3. **lost acknowledgement：** 邀請、proof、客服或財務操作結果未知時，reload／retry 仍只有原 request 的一次副作用。NEXT-06 H11–H12；NEXT-09 弱網與實際 IndexedDB。
4. **期限變更及 partial job：** 提醒版本、收件者授權、dedupe 與 last-success 正確，舊通知不虛構新期限。NEXT-08 兩期限／失敗補跑控制。
5. **發布後 source/schema/config 漂移：** 不同版本的 CI、UAT、restore 結果不能拼成 GO。NEXT-05 manifest 與 NEXT-10 join 檢查；任一差異使相關驗收重新待驗。

## 1. 已知事實與這一階段的起點

原 ZIP SHA256：`e21552e9dc72c930aa0a4afeca0ca4e5bc5d4cbb586a44a9612c4632fa68b2d2`。編計劃時已核對 ZIP 完整性、member checksums，以及 GitHub PR77／PR78／main metadata；時間見 `Plan_Source_Manifest.json`。沒有重新測 live，正式 503 是證據包的觀測，不能寫成此次重新確認。

| 項目 | 本次基準與含義 |
|---|---|
| main | `58d72e9f76e99a5c527d0f88efe37c65912bac31` |
| [PR #77](https://github.com/YNWAforever/KinnsoOS/pull/77) | draft、未合併；head `bfdcdc22858f7b925375bbeee724609b3700a603`，base main |
| [PR #78](https://github.com/YNWAforever/KinnsoOS/pull/78) | draft、未合併；head `168f653475b421efaeb9dc29356f0a84deb5ec49`；base 是 PR77 feature branch |
| 完整 source tree | `fce7b687d86d6cbbfeacfa42d8a44106561ec3ce`；本機 `239b1ec…` 與 remote commit metadata 不同，tree 相同 |
| 原始功能驗證 | push `38288895147`、PR `38288901550` 均 599 unit／95 DB／199 native PASS；72 fixture 已包括在199之內，另有4 auth/mailbox |
| 已交付原始修正 | W03 服務入口；W05 邀請 profile read-lock；W08 提醒內容／期限／焦點；W07 嚴格效能 gate |
| 數值效能 | push FAIL、PR PASS；不是兩輪均達標，W07 維持 OPEN |
| 審查範圍 | 前次 independent review 未涵蓋最後 W05 一行 product delta；其已有 TDD／CI。NEXT-05 審查須明確包含這個差異 |
| Hosted／release | 配置精確根因、staging、具名角色、實際排程、真實內容、實機及回退驗收仍未完成；NO_GO |

兩個原始同 tree 但不同 runner 的 merchant cold median：

| 頁面 | push | PR | 結論 |
|---|---:|---:|---|
| merchantCampaigns | 2701.319ms | 2486.897ms | 一過一未過，不能挑快的一輪 |
| merchantReview | 2709.559ms | 2466.460ms | 需受控量測與改善 |

原始 LCP 曾落在商戶資金／付款說明段落；render delay 是線索。PR76 的 293098→215426 為 uncompressed fixture bytes，不能視為 runtime 或 LCP 改善。不得移走有用說明來美化分數。

## 2. 交付順序與完成狀態

NEXT-01～03 是第一批可開始的工程工作；NEXT-04 的 read-only 存取準備，以及角色、內容、設備資料收集可同時進行。下表「受阻」只描述外部驗收條件，不應讓可做的本機工作停止。

| 任務 | 工作單元 | 依賴 | 交付 | 狀態 | 估算 |
|---|---|---|---|---|---|
| NEXT-01 | W01 | — | 凍結接續基線與整合路徑 | 待開始 | 0.25–0.5 工程日 |
| NEXT-02 | W06 | NEXT-01 | 建立同主機效能基準及首次可輸入量測 | 待開始 | 0.5–1.5 工程日 |
| NEXT-03 | W05、W06、W07 | NEXT-02 | 採用最小且測得改善的商戶載入改動 | 待開始 | 1–2 工程日；根因不確定 |
| NEXT-04 | W02 | NEXT-01 | 確認503配置根因並準備可審查修正 | 受阻 | 0.5–1 工程日＋權限等待 |
| NEXT-05 | W01、W02、W03、W05、W07、W08、W17 | NEXT-03、NEXT-04 | 組合候選、審查差異並接通指定staging | 受阻 | 1–2 工程日＋目標/授權等待 |
| NEXT-06 | W03、W04、W05、W09、W10、W11、W12、W13、W15、W16、W18 | NEXT-05 | 完成商戶、創作者與營運14項具名驗收 | 受阻 | 1–2 驗收日＋角色等待 |
| NEXT-07 | W09、W14 | NEXT-05 | 完成三篇真實攻略至旅人採用閉環 | 受阻 | 1–3 驗收日＋內容等待 |
| NEXT-08 | W08、W09、W10、W11、W13、W19 | NEXT-05 | 證實提醒排程與營運故障恢復 | 受阻 | 0.5–1 驗收日＋排程等待 |
| NEXT-09 | W03、W05、W08、W09、W12、W13、W14、W20 | NEXT-05 | 完成真實手機、弱網和讀屏驗收 | 受阻 | 1–2 驗收日＋設備等待 |
| NEXT-10 | W01、W07、W14、W17、W18、W19、W20、W21 | NEXT-03、NEXT-05、NEXT-06、NEXT-07、NEXT-08、NEXT-09 | 收斂M1候選及GO/NO_GO發布包 | 受阻 | 0.5–1 工程日＋發布授權 |
| NEXT-11 | W14、W15、W16、W19、W21、W22 | NEXT-10 | 完成雙公司試點並產出下一輪產品決策 | 受阻 | 2–5 觀察日；非工程承諾 |


NEXT-05 先固定實際候選，再開始 hosted 驗收。NEXT-06／07／08／09 可按同一候選分別驗收；NEXT-10 聚合全部證據後才作發布判斷。若任何驗收引起 code/schema/config 改動，更新候選並使受影響證據失效，不能沿用「差不多同版」。

估算是專業工作量區間，不含權限、內容、參與者或部署等待，也不是指定完成日期。以每項實際 blocker 更新，不能把所有區間直接加總當工期承諾。

## 3. 第一批三個任務：可直接執行的步驟

### NEXT-01：來源、分支與證據

**Files:** 讀 `AGENTS.md`、`apps/journeys/AGENTS.md`；新增本計劃 repo 副本及 `docs/implementation/KINNSO_NEXT_PHASE_2026-10-13.json`。沿用歷史 ledger，不覆寫舊狀態。

**Interfaces:** 消費原 ZIP；產出上表定義的 `BaselineRecord`，供所有下游引用。schema/live deployment 未重新確認時用 `unknown`，不填舊值冒充最新。

- [ ] 讀 report、current verification/performance、22 W、38 A/G、6 U、PR76 十檔決策；核對 ZIP SHA 與所有 checksums。
- [ ] 重讀 repo 規則、git status 及 PR77/78/main；若已有新提交，只調查新 diff 與證據適用範圍，保存舊基線。
- [ ] 在不破壞現有工作的情況下，從實際 PR78 remote head 建新分支 `codex/creator-merchant-pilot-readiness-20261013`；如名稱已存在，先核對 owner/head，另取唯一分支名，不能 reset／force push。
- [ ] 寫 BaselineRecord 與 PR ancestry。推薦先 stacked draft PR 以 PR78 branch 為 base；正式候選整合在 NEXT-05 明確完成，不能誤把 merge feature branch 當 main release。
- [ ] 核對矩陣：22 W、38 requirements、6 stories、21 original tasks 全可追蹤；依賴無循環；原始失敗與 NOT_RUN 仍在。
- [ ] Commit 文件與來源紀錄；只報「計劃／基準已核對」，不重報功能已部署。

讀取命令（repo root；不會改 source）：

```bash
git status --short
git rev-parse HEAD 'HEAD^{tree}'
git log -6 --oneline
git show --stat HEAD
```

通過條件：工作分支、full tree、PR base 與所有證據來源可回答「哪個版本、哪個環境、哪個角色、何時、做了甚麼」。本步無需重跑已完成的整套 CI。

### NEXT-02：同主機基準與 first-usable 指標

**Files:** 修改 `apps/journeys/scripts/performance/run.mjs`、`README.md`；新增 `scripts/performance/first-usable.mjs`、`compare-operations.mjs`、`tests/performance-first-usable.test.mjs`；追加 `scripts/source-manifest.json`。新 helper 只承載量測與比較，不搬入產品元件。

**Interfaces（新設計，尚未存在）：**

- `first-usable.mjs` 匯出 `summarizeFirstUsable(samples, context)`。context 含 `sourceSha, sourceTree, conditionsHash, cleanup`；sample 含 `task, cache, run, acceptedInputMs, retained, authorized, status`。task 限 `merchantInvitation|merchantBrief|merchantReview`，cache 限 `cold|warm`，run 1～3；每輪18筆。
- `compare-operations.mjs` 匯出 `compareOperationsBatch({protocol, runs})`；runs 必須依預定順序 A1/B1/B2/A2，各附既有 report、sidecar、source/tool/condition hashes。回傳 `{status, blockers, groups, sourceRefs}`；條件不等或缺資料時 `INCOMPARABLE`，不能算改善。
- `first-usable.json` 是 sidecar，schemaVersion 1。原48／8／24及 `assert-operations-assessment.mjs` 的合同不變；first-usable 無資料不能借既有8個 interaction PASS 補位。

- [ ] 驗證 owned local project/container、工具鎖定、可用 loopback port、來源重建；無法提供合適環境則記 BLOCKED_OWNED_LAB，繼續 NEXT-04 文件，不改用 live。
- [ ] 先寫評估器失敗控制：缺第18筆、重複 task/cache/run、wrong SHA、不同 conditions、非有限或負的acceptedInputMs、授權錯、`retained=false`、cleanup fail 均不能 PASS；合法完整18筆才可完成。保存 RED。
- [ ] 實作 sidecar 及比較器；用實際 browser 控制「欄位曾短暫 enabled，但輸入前 disabled」不得計為成功；離開/公司切換後舊 observer 不回填新頁結果。
- [ ] 在同一 owned server／fixture 存續期間，以獨立 browser page 量 first-usable；不要把額外打字塞進 Lighthouse 樣本。每個 task 三 cold/warm pair，頁面保持相同資料與授權；只輸入測試字串，不 submit 新 command。
- [ ] 起點是 navigation timing 的導航開始；先確認 fresh authorized actor/company，再 focus enabled field 並 `keyboard.insertText` 一次；記 accepted input event 的時間，等待相關讀取結束核對值/焦點仍正確。沒有輸入事件、重新填寫、晚鎖定失敗或授權丟失均失敗；不能用任意 sleep 製造穩定。
- [ ] 三個選擇器使用既有可存取名稱：`Recipient email`／`Brief title`／`Deliverable review feedback`；merchantReview 只選目前指定 fixture submission 的欄位。EN 是受控 lab 量測語言；zh-HK 行為由 native 控制保留，不宣稱已量 zh-HK 性能。
- [ ] 將 measurement-only source commit 為 A，record full tree/tool/instrumentation hashes。先固定實驗 protocol，再跑 A1。此時 A 的 numeric FAIL 是有效基線，不是停止記錄或刪除的理由。
- [ ] 更新 PR76 逐檔決策與瓶頸假設：JS transfer/parse、auth/company read 時序、首次可輸入、LCP 元素；只用實際 Next build 資料。

**預先固定的比較 protocol：**

| 項目 | 固定要求 |
|---|---|
| 次序 | 同一主機順序 A1 → B1 → B2 → A2；不得 concurrent；每輪 clean committed source 並重新 build。A/B measurement code 完全相同 |
| 條件 | 390×844、DPR1、4×CPU、150ms、1600/750Kbps；三 cold/warm pair；server/DB warm；dataset 55 campaigns、55 accepted creator work、至少1 submitted deliverable |
| 每輪 | 原完整48 navigation／8 interaction／24 reads，新增18 first-usable sidecar；各有清理；latency另維持完整960／72，不將其當first-usable |
| 比較 | 每個 task/cache 合併兩個A共6筆、兩個B共6筆；B median ≤ A median + max(50ms, 5%×A median)。這是本計劃新增的 provisional local 非退步界線，非既有產品SLO；須在B量測前寫入protocol，不能事後放寬 |
| 採用 | B1和B2各自完整既有numeric gate PASS、全部18 first-usable成功；6個task/cache group均不退步；權限/失敗恢复控制通过。原push及PR gate仍另需通過 |
| 失敗 | 任一 required sample 失敗/timeout/cleanup錯誤保留；no backfill/no retry-to-green。環境漂移則整個比較不成立，保留原批並只在原因修正後開新protocol批次 |

聚合中位數是小樣本 local 工程判斷，不能宣稱統計顯著、field INP 或 cloud p95。若噪音仍無法支持取捨，結果是 INCONCLUSIVE／OPEN；下一次量測必須先說清要解決的剩餘不確定性。

### NEXT-03：最小商戶載入改動與保護測試

**Files:** `apps/journeys/app/travel/MerchantWorkspace.tsx`；只有 NEXT-02 支持 lazy boundary 才新增 `loadMerchantTool.tsx`；對應 `u06-role-bundle`、`u16-merchant-native-bundle`、`u16-merchant-panel-bundle`；追加 service-state config／source manifest。不要覆蓋目前 workspace-harness 的 document/hash/recovery complete 支援。

**Interfaces:** 沿用現有 MerchantWorkspace／工具 props、fresh company DTO、onDenied、onLockChange、request receipts。若採 PR76 helper，先讀其 exact interface，保留並寫入 task ledger；不另造第二個 auth/state model。

- [ ] 根據 A1 的實際瓶頸選一個最小 product diff。若資料不支持 lazy panels，就更新「不採用」決策並調查已觀測的 read/render critical path；不要預先將 PR76 標為必做。
- [ ] 先寫能在 A 上失敗的必要控制：未授權角色不載 private tool；owner chunk503可局部retry；sibling draft／unknown request不丟；role/company失效後晚chunk不重現舊控制。保持 W05 已GREEN控制，不為TDD重新破壞既有修正。
- [ ] 實作最小載入變動，只在當次授權公司/角色成立後載入所需工具；保留 loading/error/retry 與可用的下一步。不要把所有資訊延後到第一次點擊才發現不可用。
- [ ] 受控 profile晚mount：聚焦→hold GET→單次insertText→GET完成，email／label／焦點仍正確；pending-write/unknown仍按原scope鎖定。若失敗保存timeline，按真正事件追查，不能加fill重試或延時。
- [ ] 跑 focused tests→build/types/source封裝；Commit B。按固定protocol跑B1、B2，再切回A跑A2。資料清理只作用於本輪owned actor；不處理別人的server/port。
- [ ] 比較完整結果。通過才保留B；不通過則保持W07 OPEN並revert該perf改動或依新證據另開小diff，保留全部原始資料。
- [ ] 最終候選跑既有 required CI，取得**原始**push與PR的numeric assessment及source parents/tree。合法改善不能靠加timeout、減samples、移除assertion、重新挑最快run或放寬門檻。
- [ ] 更新22 W矩陣及draft PR：說明改善前後、測試範圍、未知限制與目前NO_GO。未經批准不merge/deploy。

**常用驗證命令**（下列 cwd 為 `apps/journeys`；integration/connected 僅在既有 owned fixture 程序完成後）：

```bash
node --experimental-strip-types --test tests/performance-first-usable.test.mjs tests/performance-release-gate.test.mjs tests/merchant-profile-lock.test.mjs
npm test
npm run build
npm run typecheck
npm exec playwright test -- --config=playwright.service-state.config.ts
npm run test:integration
npm exec playwright test -- --config=playwright.connected.config.ts
node scripts/performance/run.mjs --operations
node scripts/performance/run-latency.mjs --operations
```

最後兩個 collector 的 exit 0 不等於 numeric PASS。每份準確 report 路徑需交給既有 CLI：

```text
node scripts/performance/assert-operations-assessment.mjs REPORT_PATH EXPECTED_MEASURED_SHA [CANDIDATE_HEAD [PR_BASE_SHA]]
```

這是參數格式，不可原樣貼含 placeholder 的命令執行。原 workflow 位於 `.github/workflows/journeys.yml`；沿用其 source rebuild、owned fixtures、job/artifact規則。599／95／199是基線，不是要求新增測試後仍維持相同數字；任何刪除/skip必須有合理說明，不能為數量寫鏡像測試。

## 4. 後續任務：指定輸入齊備後執行

以下每任務的 exact scope、interface、owner、依賴、rollback 亦在 `KinnsoOS_Next_Tasks_2026-10-13.csv`。每個程式缺陷採「重現／RED→最小修正→GREEN→commit」；純角色驗收、內容收集及文件不為流程形式加入無意義測試。

### NEXT-04：確認503配置根因並準備可審查修正

**依賴／負責／估算：** NEXT-01；Platform owner + Codex；0.5–1 工程日＋權限等待。

**Files：** lib/contracts/readiness.ts、capabilities.ts；lib/api/server.ts；scripts/check-readiness.mjs；CREATOR_MERCHANT_STAGING_CHECKLIST.md。

**Interfaces：** diagnoseReadiness(env: Environment): ReadinessReport；配置 pass/fail 與 schema:not_checked 分開；只記變數名稱及對應關係結果。

- [ ] 以 read-only 方式綁定指定環境及 owner；記錄403存取限制，不能繞過或要求貼秘密。
- [ ] 核對 `KINNSO_ENVIRONMENT`、`KINNSO_ENABLED_CAPABILITIES`、`KINNSO_SUPABASE_URL`、`KINNSO_APPROVED_SUPABASE_ORIGIN`、`KINNSO_LEGACY_AUTH_ORIGIN` 和 publishable key存在/類型。前三個backend/Auth origin關係須符合現有守衛；site canonical及Auth redirect另核對。報告只記名稱及pass/fail。
- [ ] 沿 `capabilities/backendTarget → auth → business RPC` 定位阻擋層。configuration readiness通過仍保留schema `not_checked`；RPC與migration問題須另有資料證據。
- [ ] 寫出確定的最小配置修正及回退，交 NEXT-05 target packet。存取仍缺時保留 BLOCKED_CONFIG_ACCESS，完成其他獨立任務。

**驗收：** 明確 environment/project/deployment 綁定；定位 capability/backend/config 的具體原因或維持 precise blocker；不推定缺 migration；不移除 origin/auth guard。

**驗證：** readiness unit；在指定環境執行 check-readiness --require=creator,merchant,notifications；匿名401及合法/拒絕角色結果另於 NEXT-05/06 驗。

**回退：** read-only 診斷；後續批准的配置改動須有原配置版本/rollback，但不把秘密值寫進報告。

### NEXT-05：組合候選、審查差異並接通指定staging

**依賴／負責／估算：** NEXT-03、NEXT-04；Release + DB owner + reviewer；1–2 工程日＋目標/授權等待。

**Files：** scripts/MIGRATION_RELEASE.md、migration-release.mjs；CREATOR_MERCHANT_STAGING_CHECKLIST.md、OPERATIONS_MIGRATIONS.json；新 candidate manifest；既有提醒 migration 只讀。

**Interfaces：** 輸出 CandidateManifest：sourceSha/tree/base/main/deployment/environment/schemaFingerprint/migrationHashes/configChecks/roleFixtures/recoveryRef；所有 NEXT-06～10 消費同一 manifest。

- [ ] 先在 isolated branch組合 PR77、PR78與新變更；記main/base/ordered parents/full tree。若merge改變tree，更新candidate並驗證新source，不能拿PR78舊CI當新整合結果。
- [ ] 建完整source archive並核對manifest；按實際source執行required workflows。安排一次符合當時規則的獨立分支review，範圍明確涵蓋前次未覆蓋的W05最後delta、本次perf與新測試。
- [ ] Read-only比對指定target的migration history、functions/grants/policies、Auth ownership、source/schema fingerprint；舊staging文件內PR55/ad2c8ce等值只屬歷史，先更新inventory再選delta。
- [ ] 在disposable owned環境演練exact additive delta、既有資料/CAS相容性、last-good app及restore；不編造可回退的DB downgrade。新SQL如確有必要，使用pinned CLI建立新migration而不改歷史檔。
- [ ] 組成scope-bound staging packet：實際target、候選、SQL hashes、配置名稱、授權角色、備份與恢復結果、具體操作及rollback。只有已有相應scope授權才執行；否則完成packet後提出一次具體批准。
- [ ] 部署/套用後核對source/schema/config：已配置的匿名私有request為401；合法角色200，越權按原403/404合同；保留private/no-store。CandidateManifest完成才開NEXT-06～09。

**驗收：** 整合 PR77/78/新改动至 isolated candidate，未 merge main；新 head/base/tree 重新 CI；獨立審查涵蓋最終 W05 delta 與 perf diff；staging exact delta、backup/restore 演練及權限/匿名控制成立。

**驗證：** source archive 重建；原 workflow gate；disposable migration rehearsal；指定 staging catalog/grants/policies readback；不得 replay 全部 migration 或使用 hosted seed/reset。

**回退：** 已演練 app/capability rollback；schema 以相容 additive/必要 forward-fix 處理；保留資料、dedupe、receipts、v2 drafts。

### NEXT-06：完成商戶、創作者與營運14項具名驗收

**依賴／負責／估算：** NEXT-05；QA + named role owners；1–2 驗收日＋角色等待。

**Files：** CREATOR_MERCHANT_HOSTED_UAT.md H01–H14；對應 route/component 僅在失敗證實後修；新增同 candidate evidence。

**Interfaces：** 每案 {candidateId,sourceSha,deploymentId,schemaFingerprint,actorRole,scenarioId,expected,observed,status,evidenceRef,cleanup}；私下 actor mapping，公開不含帳戶資料。

- [ ] 私下綁定兩company、至少兩creator、owner/marketing/clerk/finance/ops及指定test mailbox；準備每個denial的合法control。
- [ ] 逐項執行附件H01–H14：申請/批准、campaign、proof/revision/關閉後續交、收益、雙creator/雙company隔離、marketing、branch/finance、ops衝突、撤權、lost ack、重登入恢復、註冊信件、雙語小屏。
- [ ] 增加W05 hosted晚profile情境；公司同事邀請和creator合作邀請分開記request/receipt及一次副作用。保持原quota/owner-only規則。
- [ ] 以51+筆已批准fixture核對搜尋/分頁/filter/Back/reload；用known cohort核對insights/CSV applied filter、asOf、5000上限及撤權；finance逐幣別核對exact amount，unknown不等於0。
- [ ] 客服A/B案例：A送出後不是新稿、B草稿仍可用；GET503不解鎖未知寫入；client/internal reason分離。Ops接手後回到creator/merchant核對結果。
- [ ] 若真實操作證實UI阻礙，以角色/步驟/expected/observed開issue，修失敗路徑並驗affected cases；不得先重造已驗證功能。
- [ ] 完成同candidate H矩陣及cleanup；每個NOT_RUN保留原因，不用599/95/199替代。

**驗收：** H01–H14 全有結果；兩公司/兩creator及 owner/marketing/clerk/finance/ops 真角色；成功控制伴隨跨scope拒絕；同事/合作邀請各一次副作用；CSV及逐幣別資料回讀可追查。

**驗證：** bounded hosted manual/browser 程序；重用原 u03-u04/u04/u10/u12 情境；真 test mailbox；出站操作須有指定收件者/授權，不向客戶發訊息。

**回退：** 只清批准 fixture；新 bug 最小修正及新候選重新受影響驗收；不得刪 receipts 或降低權限。

### NEXT-07：完成三篇真實攻略至旅人採用閉環

**依賴／負責／估算：** NEXT-05；Content owner + creator + QA；1–3 驗收日＋內容等待。

**Files：** CREATOR_CONTENT_PILOT.md；CreatorWorkspace.tsx/editor-operations.ts、GuideWorkspace.tsx、SEO/publication 僅有真實阻礙才改。

**Interfaces：** 沿用 structured days/stops、publish/withdraw、explicit adopt、private copy；三份 content intake 具作者同意/封面權利/核實日期/locale/source。

- [ ] 先補三份真實content intake：作者同意/範圍/日期、structured days/stops、查核來源/日期、locale、封面權利與editorial owner。
- [ ] 每篇走creator draft→缺欄定位→publish→匿名閱讀；摘要內容保持明確手動建立提示，不冒充可完整匯入行程。
- [ ] 旅人安全登入返回→明確adopt→私人筆記保存→新session及第二裝置讀回。保留adoption provenance及原request控制。
- [ ] 經授權的withdraw情境後，確認公開內容按合同下架、旅人既有私人副本仍在；公開share/SEO/sitemap無私人筆記或未發布資料。
- [ ] 只修真實使用暴露的內容/編輯/採用阻礙。三篇證據未齊則W14 BLOCKED_REAL_CONTENT，不以生成或synthetic內容替代。

**驗收：** 三篇各完成 draft→publish→公開讀取→明確採用→私人筆記→新session/第二裝置讀回→作者withdraw後已採用副本保留；私有資料無公開/SEO洩漏。

**驗證：** publication/SEO existing tests；content-first-wave/creator-source/u01 情境；同 candidate 具名內容/旅人證據；不能以 synthetic guide 结案。

**回退：** 停止新發布/採用或下架經批准內容；保留旅人私人副本和來源歷史。

### NEXT-08：證實提醒排程與營運故障恢復

**依賴／負責／估算：** NEXT-05；Backend + operations owner；0.5–1 驗收日＋排程等待。

**Files：** cron/collaboration-reminders route；reminders.ts；telemetry/repository.ts；OpsWorkspace.tsx；排程交接紀錄。

**Interfaces：** 既有 cronAccess/trackScheduled；limit50、maxPages4、budgetMs15000；上限maxPages10/budgetMs20000；dedupe(eventKind,milestoneId,recipientId,deadlineVersion)不變。

- [ ] 記scheduler owner、target、精確candidate/schema、允許窗口與排程來源；沒有scope授權不建立/啟用job。
- [ ] 以批准fixture提供同campaign兩里程碑、不同deadline，執行一次真正schedule dispatch，再執行同事件重跑，確認通知/去重fact單一且recipient正確。
- [ ] 改期限版本及撤權controls按批准範圍驗證；inbox顯示「通知時期限」及正確milestone，authorized anchor可鍵盤到達，刷新不搶焦点。
- [ ] 注入一次可回復失敗及bounded partial；ops能分辨last success與last failure、定位錯誤、只重試必要工作；恢复後回到收件角色讀回。
- [ ] 寫營運交接：誰處理告警、何時補跑、怎樣核實、怎樣停future dispatch；email provider未啟用時不宣稱發送。

**驗收：** 實際 schedule dispatch 可追查；兩里程碑/兩期限正確；重跑不重複；deadline version/撤權控制；一次失敗及bounded partial後恢復，last success 不被假成功覆蓋；無冒稱email已送。

**驗證：** owned提醒/telemetry故障測試；批准 staging 測試窗口；creator/inbox 和 ops/job 兩端回讀；记录下一班接手人。

**回退：** 只停 future dispatch；保留通知/dedupe/失敗歷史；不增大無界掃描或重發所有通知。

### NEXT-09：完成真實手機、弱網和讀屏驗收

**依賴／負責／估算：** NEXT-05；QA + accessibility owner；1–2 驗收日＋設備等待。

**Files：** u02-travel-share、media/local-drafts/sharing；關鍵 creator/merchant/support UI；EN/zh-HK device matrix。

**Interfaces：** Native Chromium 與 physical iOS/Safari、Android/Chrome、VoiceOver、Windows/NVDA 分列；實際版本記錄；320/640/1280及200%文字。

- [ ] 固定實際iOS/Safari+VoiceOver、Android/Chrome、Windows/NVDA組合及版本；現有Chromium尺寸/zoom測試分開列證據。
- [ ] 在兩語完成商戶邀請/審核、creator提交/提醒、客服焦點順序、錯誤標籤及恢復；320/640/1280與200%文字不遮住核心控制。
- [ ] U02實機旅途中編輯→斷網/恢復→照片prepare/upload/finalize→reload/new login→share→接收者讀→撤銷→media不可再讀；未知寫入先receipt，重試不重複/誤刪。
- [ ] 切actor與guest草稿明確匯入同意；前一人draft不導入新帳戶。沿用原N04/N08/N09/N14/N15範圍；原N17 AI來源/accepted-output只做既有回歸。
- [ ] 有真內容時完成U01跨裝置部分；其餘設備案例可先做。將實際阻礙修成最小diff，更新candidate及相關驗收；沒有設備則明列NOT_RUN。

**驗收：** U02實機弱網/媒體prepare-upload-finalize/分享撤銷全走；鍵盤/讀屏可完成邀請、審核、提醒、客服；無跨帳戶稿件、丟稿或重複寫入；AI accepted-output只回歸不擴張。

**驗證：** owned受控offline/lost ack/IDB；實機與AT逐案記錄；裝置無法提供則NOT_RUN；browser emulation不替代。

**回退：** revert問題UI且保持draft格式/receipts可讀；保留原失敗，不以capture錯誤自動判产品PASS。

### NEXT-10：收斂M1候選及GO/NO_GO發布包

**依賴／負責／估算：** NEXT-03、NEXT-05、NEXT-06、NEXT-07、NEXT-08、NEXT-09；Release owner + QA；0.5–1 工程日＋發布授權。

**Files：** NEXT_PHASE_RELEASE_GATE.md；CREATOR_MERCHANT_M1_RELEASE.md；candidate/evidence manifest；journeys-production workflow只必要時調整。

**Interfaces：** 聚合同 source/tree/deployment/schema/config 的功能/效能/role/device/job/content/rollback證據；merge、deploy、live accepted 分開。

- [ ] 對齊NEXT-03、05、06、07、08、09的manifest；candidate/source/tree/schema/config不一致不能拼接PASS。NEXT-09的真內容子案例須連到NEXT-07。
- [ ] 檢查這次增補的顯式release前置：W14內容及W19排程，避免只看原W21依賴而漏放。保留原依賴欄作歷史，新NEXT DAG才是本次執行路徑。
- [ ] 輸出GO/NO_GO逐項表：完整功能+數值原CI、source extraction、review範圍、H01–H14、三guide、scheduler/partial recovery、devices/AT、last-good/restore、owner。未知或核心失敗保留NO_GO。
- [ ] 若準備發布，提交一次具體可審查的merge/deploy請求：exact head/base、target、能力範圍、migration/config delta、readback和回退；本計劃不預先批准正式動作。
- [ ] 獲授權後逐能力執行並bounded readback；READY、merged、deployed、live accepted各有獨立欄位。若本次只批准staging pilot，不能寫production已發布。

**驗收：** 零未解核心權限/資料/重複寫入/丟稿缺陷；完整原始 push/PR numeric gate PASS；內容/排程/實機不得漏入依賴；精確操作、target、scope、rollback可供一次批准。

**驗證：** 同candidate evidence join；如 source/schema/config 改變，受影響驗收重跑並保存差異；任何unknown/partial保留NO_GO；獲授權發布後bounded live readback。

**回退：** 按已演練last-good app/capability回退；保留業務資料；不得blind DB downgrade。

### NEXT-11：完成雙公司試點並產出下一輪產品決策

**依賴／負責／估算：** NEXT-10；Product + operations + creator/merchant owners；2–5 觀察日；非工程承諾。

**Files：** CREATOR_MERCHANT_OPERATIONS_RELEASE.md；pilot evidence/issue ledger；下一輪經證據排序的backlog。

**Interfaces：** 至少2 creator、2 company、ops/finance、3授權攻略、U01–U06；先指明可操作的受控M1環境，production擴量另決策。

- [ ] 在NEXT-10明確允許的M1環境排定2 creators、2 companies、ops/finance和3指南；角色只做自己的已授權工作。
- [ ] 走完整U01–U06並回到起始角色核對成果；至少一班營運可交接，記失敗、恢復、實際耗時及支援需要。
- [ ] 指標只報實際分母：攻略閱讀→採用、creator/merchant首個成功任務、合作接受→提交→批准時間、revision輪次、客服恢復、提醒延遲；provider未啟用則付款/ROI不計。
- [ ] 按影響×頻率×恢復難度選最多三項下一輪工作，逐項給證據、user story、scope、AC及成本；沒有試點證據就保留需求假設。
- [ ] 發布完整結案表及residual backlog；只有每故事自己的條件成立才結案。production擴量、AI/booking/payment/email另立具體規格及批准範圍。

**驗收：** 角色最終回讀與一次營運班次交接；所有六故事有完整結果；記成功/嘗試分母、time-to-first-task、revision耗時、求助恢復、提醒延遲及真實樣本；列最多3項最高影響的下一輪阻礙。

**驗證：** 真實任務逐步證據與清理/保留決策；不以測試通過數代替採用/留存；零樣本寫未測，無付款來源不計營收/ROI。

**回退：** 停止擴量或問題能力；保留內容、私人副本及財務歷史；依NEXT-10回退。

## 5. 六個使用者故事的結案界線

| 故事 | 最終要完成的工作 | 本次主要任務 | 仍欠甚麼 |
|---|---|---|---|
| U01 新旅人 | 真實攻略→明確採用→私人編輯→跨裝置讀回→作者下架後副本仍在 | NEXT-06/07/09/11 | 三篇內容、旅人、第二裝置；首頁200不算完成 |
| U02 旅途中與分享 | 實機弱網、媒體恢復、分享與撤銷 | NEXT-09/11 | 真iOS/Android與share/media完整故事；emulation不替代 |
| U03 新創作者 | onboarding、真實發布、合作接受、proof、revision、批准、收益來源及支援 | NEXT-06/07/08/11 | hosted角色、內容、排程與來源可追查 |
| U04 商戶成果 | 公司/同事、campaign、找creator、合作邀請、審核、成果CSV及對帳 | NEXT-03/06/08/11 | 效能、兩公司/真角色、兩種邀請及數字回讀 |
| U05 營運一天 | 收件→處理→角色回讀→job故障恢復→對帳→交接 | NEXT-06/08/11 | 實際scheduler及具名班次；有cron檔案不足 |
| U06 發布切換 | source/schema/auth/config/role/性能/恢復同版本→逐能力放行 | NEXT-01/04/05/10/11 | 精確candidate、回退、授權與live readback |

`KinnsoOS_6_Stories_2026-10-13.csv` 保留每個故事原有 acceptance/completion boundary；細節源自原ZIP的原始故事映射。完成任一NEXT任務不會自動關閉整個U故事、A/G需求或舊P/D任務。

## 6. 外部輸入清單與不中斷原則

| 輸入 | 最少需要 | 解鎖工作 |
|---|---|---|
| Target／configuration | staging URL、Vercel/Supabase/Auth ownership、可讀metadata及變更scope；不要求貼key值 | NEXT-04/05 |
| Recovery | schema/grants/history讀取、last-good app、備份涵蓋與實際restore rehearsal | NEXT-05/10 |
| Roles／mailbox | 兩公司、兩creator及owner/marketing/clerk/finance/ops；指定真test mailbox與允許的測試收件行為 | NEXT-06 |
| Content | 三篇真structured guides、作者同意、封面權利、核實來源/日期、旅人 | NEXT-07 |
| Scheduler | 負責人、target、排程來源、測試窗口及停用/恢復權限 | NEXT-08 |
| Devices | 實體手機、AT組合、帳戶與執行者 | NEXT-09 |
| Release／pilot | exact candidate與環境、能力範圍、執行及監察owner | NEXT-10/11 |

缺資料時，將具體項目、owner、requestedAt、impact及可先完成工作寫入ledger。不要反覆請使用者「確認是否繼續」，不要把整個工程階段停在一項外部阻擋；也不要捏造角色、内容、run、SLO或完成率。

## 7. 狀態、證據及交付格式

每個任務使用：**待開始 → 進行中 → 待驗收 → 已驗證完成**；缺必要輸入為**受阻**。另設 `sourceStatus / ownedStatus / hostedStatus / releaseStatus`，不能用單一「done」混合四者。

每次task交付要含：task ID、原W/A/G/U映射、source SHA/tree、changed files、expected/observed、test/run/job/attempt、環境/角色、原始失敗及修正證據、cleanup、blocker、下一步與rollback。敏感帳戶/consent/secret/private proof留在限制存取紀錄，只輸出reference。

對文件中的舊狀態：保留時間與source；本次最終status另新增，不覆蓋原FAIL。計劃包內CSV有明確註記：W08用真正migration檔名；舊183等測試數只屬歷史；release依賴顯式補W14/W19。原38需求的W映射未包含W02，因此本計劃另補NEXT-04→A01/A07/G03/G17直接連結，保留原欄不改寫。沒有把歷史狀態改成PASS。

每個有意義的獨立改動一個commit；每批draft PR說明問題、改動後行為、驗證及限制。一般修正不必為低風險文字/文件寫鏡像測試；廣泛回歸只在共享鎖、授權、source/schema改動或required gate有需要時跑。第一批完成交付受控performance報告、必要product diff、原始CI、22 W及38需求/6故事更新；hosted未齊仍交付明確NO_GO和最少解阻輸入。

## 8. 交给 Codex GPT‑6.1 Sol 的啟動指示

```text
你要接續開發 YNWAforever/KinnsoOS。先讀取隨附的
KinnsoOS_Continuation_Evidence_2026-10-13.zip，以及本計劃與所有CSV。
原ZIP SHA256必須為 e21552e9dc72c930aa0a4afeca0ca4e5bc5d4cbb586a44a9612c4632fa68b2d2。

遵守repo/子目錄AGENTS.md及安裝版Next文件。以現時實際PR78 head作起點；
計劃基準是168f653475b421efaeb9dc29356f0a84deb5ec49，tree為
fce7b687d86d6cbbfeacfa42d8a44106561ec3ce。PR78 base是PR77 feature branch，
兩者都未合併main；先刷新metadata，不可假設main包含現有修正。

保留W03服務入口、W05 profile唯讀不鎖其他表單、W08提醒/期限/焦點，
以及W07 strict assessment gate。599unit/95DB/199native是原source已通過證據，
不是hosted驗收；72fixture已包含在199，不可相加。原push數值FAIL、PR PASS，
W07 OPEN，整體NO_GO。

按NEXT-01→NEXT-02→NEXT-03直接完成第一批：新task-owned分支、同host
measurement-only baseline、18筆first-usable sidecar、固定ABBA protocol，
再做有證據支持的最小performance改動。PR76只按十檔決策選擇採用。
新行為先RED→最小修正→GREEN；保留原始失敗，不fill重試、不加timeout、
不減samples、不放寬auth/RLS/CAS/receipts/dedupe、不挑最快run。

NEXT-04 read-only配置解阻及roles/content/devices準備可獨立前進。
只有指定staging與相應授權才做NEXT-05 hosted動作；不能將local
seed/reset/cleanup/performance lab指向hosted。維持22W、38A/G、6U、21P/D映射。

第一批完成後更新矩陣、evidence、draft PR和blockers，再按依賴推进NEXT-04～11。
任何source/schema/config改變都核對受影響證據，不把舊PASS搬到新候選。
main merge、production部署、hosted帳戶/SQL/config/scheduler變更、對外訊息及
provider啟用只在具體scope已授權時執行；先做好可審查packet再提出最後批准。
缺外部輸入時繼續獨立工作，不虛構通過。交付說清改了甚麼、證據、未驗範圍、
回退及下一步。不要將「已寫碼」「已部署」「可操作」「端到端驗證」混成完成。
```

本計劃的終點是可被真實旅人、creator、merchant和ops使用並驗證的M1試點。後續擴張先根據NEXT-11觀察決定；這次不宣稱已達到市場最佳或全產品100%完成。
