# KinnsoOS 三方試營運 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 逐項執行；遵守本次 session 的工具與授權規則。先完成 PD01–PD03，繼續所有未受阻的相依工作。這份文件不要求啟動 subagents；只有使用者或適用規則明確允許時才安排獨立 agent。以 checkbox 追蹤步驟。

**Goal:** 讓旅客能使用真實攻略完成私人行程，Creator 與 Merchant 能完成有紀錄、可恢復的合作流程，並在指定環境通過具名驗收。

**Architecture:** 沿用 `apps/journeys`、BFF、Supabase RPC／RLS、request receipts、CAS 及 actor/company invalidation。新呈現以既有 DTO 與 selectors 組合；新增檔案集中承載路由決策或純資料投影，不另建 CRM、任務引擎、Auth 或支付系統。

**Tech Stack:** 證據基線 Next 16.3.8、React 19.2.4、TypeScript 5.9.3、Playwright 1.58.2、Supabase SSR 0.12.0／client 2.108.1；先確認 lockfile、CI Node 及 installed docs。Codex GPT‑6.1 Sol 是執行者要求，不是把產品內 AI provider 自動改成此模型。

**Spec:** 同行 `KinnsoOS_Product_Development_Plan_2026-10-22.md`，以及未修改的 `KinnsoOS_Audit_Evidence_2026-10-22.zip`。CSV 中 PD 依賴為執行依賴，原 T 依賴保持歷史原樣。

## Global Constraints

- 首先讀 root 及子目錄 AGENTS；Next 修改前讀 installed `node_modules/next/dist/docs` 的相關文件，不套用舊版本假設。
- main 基線 `0e9fd552f6e6270da23c8ebc25ec7487524850d6`；PR82 候選 `4b42fdebaf97cd11b91a7b6ca0d4366c92072e8d`。兩者必須在執行開始時重核。
- 675 passed 屬 ZIP 的本機結果；u20 未跑；hosted／實機未驗收。不要把歷史數字複製成新結果。
- 保留 A01–A20、G01–G18、U01–U06、LegacyE01–LegacyE09 共53列追蹤，以及 N01–N18 與既有 P／NEXT 紀錄。新 PD／PS 是增量，不替換舊結案規則。
- 不重做 PR77–80、已有 publicationReadiness、合作 selectors、提醒 context 或收益模型；已滿足的功能只補缺失驗收。
- EN／zh-HK、unknown 值、summary／structured 差異、private projection、immutable published versions、receipt／CAS 都不可退化。
- 本階段核心增量優先不改 SQL。確有 schema 缺口時先記 contract／writer／RLS／migration delta，新增相容 migration；不改歷史 migration、不重放全部 SQL。
- Source 允許開發不等於 hosted／release 通過；未知 command 保留原 payload、requestId 及 scope。
- 不因本計劃修改付款、保護規則、production flags、帳戶角色、排程或付費 provider；只在當次既有授權範圍內執行。

## Review Focus

1. 撤權後舊回應、晚到 chunk、跨公司選擇不能恢復私人資料：PD02／PD05／PD10。
2. 錯誤日期、時區、來源缺欄、summary guide 不能變成貌似有效的旅遊承諾：PD06／PD07。
3. 作者新版本或撤回不能覆蓋旅客私人筆記／既有副本：PD06／PD07／PD16。
4. Lost ACK／revision／approval 不得重複副作用、創造 payout 或將 unknown 改成 0：PD09／PD11／PD17。
5. 51+ records、分頁切換、320px、200% 文字及讀屏下仍能完成工作：PD10／PD15／PD16。

## 執行紀錄及共用介面

建議在獲准的完整 repo 中新增：

- `docs/superpowers/plans/2026-10-22-kinnsoos-product-pilot.md`：本計劃的版本化副本。
- `docs/implementation/KINNSO_PRODUCT_PHASE_2026-10-22.json`：任務及候選狀態。
- `docs/implementation/KINNSO_PRODUCT_PHASE_2026-10-22.md`：結果與限制。

`CandidateRecord` 必須有：`sourceSha, treeSha, baseSha, pr, deploymentId, environment, schemaFingerprint, configChecks, recoveryRef`。未核實欄位填 `null` 並列 reason，不能填舊值冒充最新。

`AcceptanceReceipt` 必須有：`taskId, scenarioId, candidate, actorRole, expected, observed, status, evidenceRef, cleanupStatus`。`status` 使用 `PASS | FAIL | BLOCKED | NOT_RUN`。Actor 身份對照、憑證及私人證明只留在適當的私有紀錄；公開 ledger 只用角色及 reference。

每個行為改動採用：重現／必要 failing test → 最小修改 → 相關測試 → 視影響建置／integration → 可審查 commit。文案和簡單樣式只需適量實際檢查，不為字串建立大量鏡像測試。重型 build／完整 suites 不並行爭用同一測試 stack。

---

## PD01：證據、完整 repo 與差異基線

**依賴／owner／初始狀態：**無；Codex／Tech lead；PLANNED。對應 T01、N01／N02／N18。

**Files:** 讀 AGENTS、PR82、audit doc、`NEXT_PHASE_LEDGER.json`、`NEXT_PHASE_TRACEABILITY.csv`、既有 10月13日 plan；建立上述 phase ledger。不要編輯產品程式。

**Interfaces:** 消費 ZIP hashes 與真 remote；產出 `CandidateRecord`、來源差異及 `code/test/deployment/runtime` 四欄狀態，供所有任務使用。

- [ ] 驗證 ZIP SHA‑256 及 15 個 evidence hashes；讀 report、summary、tasks、limitations 和相關 logs，不以摘要代替原始結果。
- [ ] 記 `git remote -v`、branch、HEAD、base、dirty/untracked 歸屬；重讀 main、PR82 與最新 checks。若 PR82 已 merge，從已核實 main 接續；若未 merge，可從其真 remote head 建唯一、隔離的 stacked branch。
- [ ] 確認是完整 remote checkout。先前 `kinnso-oct22` 是 source capsule snapshot；不得把其 local HEAD 當 remote main、不得整個推上 GitHub。
- [ ] 若此環境無可用 clone，但同一獲准 repo 已有可用 connector，可用逐檔核對 Git blob 的 capsule 做 bounded patch；發布變更必須基於完整 remote base tree，只替換批准檔案並核對最終 blobs，且保留 root／整合 CI 未在本機執行的限制。不能證明來源或遇真正權限拒絕時，不改用其他路徑繞過。
- [ ] 舊計劃與現況做差異表：已完成、待 hosted、需要新 code、缺外部輸入。保留 N02 的既有 verified_done；完整53列（44列A/G/U＋9列LegacyE）的partial不自動關閉。
- [ ] 寫 ledger，確認依賴無循環、檔案來源可追溯；提交文件 checkpoint。

**驗收：**每個後續改動有明確 source／branch；沒有重做已合併工作、丟棄用戶檔案或虛構部署關係。**回退：**僅文件，不影響服務。

## PD02：完成 PR82 的必要資格

**依賴／owner／狀態：**PD01；T03 只阻擋需要 GitHub runner 的部分；Codex／QA；BLOCKED_INFRA（以 ZIP 為初始值，須重讀）。承接 T04。

**Files:** 保留 PR82 五項修正；重點 `MerchantWorkspace.tsx`、`WorkspacePanel.tsx`、`PublicInformation.tsx`、兩個 Creator unavailable states、`workbench.css`；既有 u18/u20、merchant denial、directory tests。

**Interfaces:** 沿用 `workspaceEpoch`、`ApiResult<T>` 及同 command 的 request/payload；產出 exact candidate 的 test receipts，不新增產品 API。

- [ ] 確認付款／spend 阻礙是否仍在；有 owner 恢復資格的證據後才合理重跑。失敗仍為 0 steps 時記 infrastructure blocked，不刪失敗、不降 gate、不無限 rerun。
- [ ] 核對五項修正仍存在；已有回歸不得為 TDD 人為破壞。新 drift／真正失敗才寫針對性修復。
- [ ] 在可執行的原生瀏覽器環境跑 u18、u20。瀏覽器取得受阻就記實際原因，不能用 mock DOM 或 Edge 手動紀錄冒充 Playwright PASS。
- [ ] 檢查最終 root／Journeys workflow、source verification、configured code review；以新 head 為準。整個 integration tree 與已測 head 不同，須在 PD15 重驗。
- [ ] 記 source、command、環境、passed/failed/skipped、是否真的執行 assertions；有阻礙仍繼續 PD03。

**已核對的 Journeys 指令**，cwd `apps/journeys`；先確認 scripts 沒有 drift：

```bash
npm test
npm run build
npm run typecheck
python -m unittest discover -s tests -p '*_test.py'
npx playwright test --config=playwright.service-state.config.ts tests/e2e/u18-workspace-entry.spec.ts
npx playwright test --config=playwright.public-entry.config.ts
```

root CI、owned integration、mailbox 使用當前 workflow 的實際指令及 target guard，不猜命令或指向 live。測試已充分、source 未改時避免重複全套。

**驗收：**真執行的必要 checks PASS；或逐項精確 BLOCKED，不能把此任務稱完成。**回退：**保留草稿；有產品修復採一般 revert，不改資料。

## PD03：剩餘公共路徑及可信入口

**依賴／owner／狀態：**PD01、T02 的 source；Frontend；PLANNED。對應 T09、OCT22-02/03/08。可以在 PD02 受阻時進行。

**Files:**

- Create `apps/journeys/app/integration/public-entry-registry.ts`、`apps/journeys/tests/public-entry-registry.test.mjs`。
- Modify `PublicInformation.tsx`、`Workbench.tsx`；必要時 `routes.ts`，但不擴闊未知動態路由。
- Extend `tests/e2e/u20-public-entry.spec.ts`；新檔加入 `scripts/source-manifest.json`。

**新介面（設計，尚未存在）：**

```ts
type EntryLocale = 'en' | 'zh-HK';
type EntryCapabilities = { creator: boolean; merchant: boolean; support: boolean };
type PublicEntryView = {
  kind: 'information' | 'workspace-link' | 'unavailable';
  title: string; bodyKey: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
};
resolvePublicEntry(path: string, locale: EntryLocale, enabled: EntryCapabilities): PublicEntryView | null;
```

Registry 只決定公開資訊內容和 CTA，沒有 network、Auth、寫入或 permission authority。Unknown path 回 `null`，由現有 route guard 處理 404；不能一律回 Help。

- [ ] 由 `routes.ts`／Workbench 列出所有 static public／retained entries：for-creators 系列、for-business 系列、legal 系列、about/contact/how-it-works 等。每條記 current handler、預期內容、能力、CTA；已接通的真實 catalog 頁保持原流程。
- [ ] 對仍落入 hub 的每一條決定 information／workspace-link／unavailable。Pricing、booking/refund/payment 等沒有核准規則時，明示未提供且返回有效入口；不可編造價格、條款、case study 或 lead form 成功。
- [ ] 先增加可失敗的行為測試：雙語 resolve；能力關閉不出現「登入即可啟用」；未知 legal path 不匹配；native 與 `/demo/` 目的地不混用；沒有假交易 action。
- [ ] 實作 registry 與頁面接線，保留四個已修頁面與 credits/source links。使用現有 dynamic boundary，避免公共路由載入 merchant 私人工具。
- [ ] 在 u20 真 Next server 檢查 direct URL、client click、reload、Back、鍵盤 CTA、未知404；偵測 public navigation 沒有 command POST。320px／200% 文字保留 header 不覆蓋控制的斷言。
- [ ] 頁面 title、語言、canonical／hreflang／robots 沿用 `lib/seo` policy 並與實際內容一致；未知404及未核准條款不能被包裝成可索引的完整政策。只調整本次涉及路由。
- [ ] 跑 focused test、u20、必要 build／typecheck／source pack；提交一個可獨立審查的 PR，附逐路徑 matrix。

```bash
node --experimental-strip-types --test tests/public-entry-registry.test.mjs tests/workspace-directory.test.mjs
npx playwright test --config=playwright.public-entry.config.ts
```

**驗收：**inventory 無未處理的 hub fallback；每條 known public route 有明確用途、可用 CTA 和真實內容；原 native/private routes 不退化。**回退：**revert 該 PR，不更改 schema 或 flags。

---

## PD04：核准的私隱、支援及資料請求流程

**依賴／owner／狀態：**PD01、T02 source；Product／policy／support owner＋Codex；OWNER_INPUT。承接 T05。

**Files:** `PublicInformation.tsx`、既有 support workspace；Create `docs/implementation/PRIVACY_SUPPORT_CONTENT_ACCEPTANCE.md`。新 intake 表單／資料表不在預設範圍。

**Interfaces:** 輸入 owner 核准的 EN／zh-HK 文案、真實聯絡及處理途徑；輸出內容版本、核准人角色、適用服務與可操作 request route。

- [ ] 列明缺失：connected／demo 資料、用途、providers、實際保留／刪除流程、聯絡、內容公開性、analytics consent；由 owner 提供可承諾的事實，不讓 Codex 代定政策。
- [ ] 把已有核准部分接入頁面；未齊部分保留誠實 notice，不虛構 email、保留期限或法律結論。
- [ ] 支援服務未接通時必須有經核實的聯絡方式，或維持不對外收集新申請；不能顯示無接收系統的「已提交」。
- [ ] 核對雙語、鍵盤與實際目的地；privacy request 到 owner 的人工處理演練需指定測試收件及既有授權。

**驗收：**核准內容＋有人接手的聯絡渠道；若欠 owner 仍為 BLOCKED_POLICY，source 文案完成不結案。**回退：**還原已知正確 notice，不刪請求紀錄。

## PD05：Creator／Merchant 的下一步入口

**依賴／owner／狀態：**PD01、PD03；Frontend；PLANNED。

**Files:** `CollaborationTasks.tsx`、`CreatorCollaborationTasks.tsx`、`CreatorMissionsWorkspace.tsx`、`MerchantWorkspace.tsx`；沿用 `lib/collaboration/tasks.ts`。新增 `tests/workspace-next-step.test.mjs` 只測新行為，延伸既有 task browser cases。

**Interfaces:** 消費既有 `creatorTasks(items, locale)`、`campaignTasks(directory, locale, actorId)`、`merchantSetupTasks(page, locale)`、`actionGroup(action)` 及 `NextAction[]`；不新增 workflow state。

- [ ] 核對目前已有分組及導覽；僅補實際缺失：主要任務、等待原因、公司／角色、目前載入範圍，以及返回工作入口。
- [ ] 測試：0 records 與 read error 分開；等待審核不提供重複提交；首頁 counts 不冒充 total；未授權角色不載入 private tool。
- [ ] 用既有 selector 與 labels 組合呈現。unknown-command 時切 tab／company 的鎖定行為不改；fresh denial 清私人資料，晚回應不重現。
- [ ] 跑 collaboration tasks、workspace recovery、role loading 與相關 native cases；保存操作前後結果。

**驗收：**使用者能知道下一步、等待誰、目前公司及資料範圍；無新增私人請求風暴。**回退：**UI revert；保持草稿格式及 receipts。

## PD06：旅客首次行程、恢復與分享

**依賴／owner／狀態：**PD01、PD03；Full stack／QA；PLANNED。

**Files:** `GuideWorkspace.tsx`、`GuestPlanner.tsx`、`TripWorkspace.tsx`、`ImportPreview.tsx`、`TripWarnings.tsx`、`SharePreview.tsx`；只在重現缺口時改 `lib/trips/*`。測試沿用 adoption-preview、guest-draft-recovery、u01、u02、trip-editor。

**Interfaces:** 既有 `adoptionPreview`、`trips.create`、`trips.adopt`、`trips.apply`、`TripSnapshot`、`SourceCredit`；所有確認仍由使用者明確觸發。

- [ ] 走「無行程／有行程／guest 草稿」三種初始狀態；第一次建立後能返回原攻略。保留現有 GuestPlanner 能力，不另做重複 import wizard。
- [ ] 對新阻礙建立測試：summary 不產生 adoption write；非法日期／時區輸入有可讀錯誤；conflict 重新預覽；unknown adoption 重試同 request；不覆蓋 private note。
- [ ] 明確顯示 saved／unsaved／unconfirmed、來源版本與時區；已有 facts 不完整時說明 unknown。保留使用者 override 理由，不把估計交通／營業時間當已驗證。
- [ ] 驗證 offline→reconnect、跨帳戶草稿、照片 prepare/upload/finalize、share preview／revoke；不得聲稱背景離線同步已實作。
- [ ] 在 owned target 跑 u01／u02／trip editor；真正跨裝置及新 session 放入 PD16，不以當前 browser refresh 代替。

**驗收：**PS01／PS02 的 source 與 owned controls 成立；新增 UX 不造成隱式寫入或資料遺失。**回退：**revert UI；保留現有 draft、receipt、trip data。

## PD07：真實攻略與來源資訊卡

**依賴／owner／狀態：**PD01；Creator／content owner＋Frontend；PLANNED，真內容部分 OWNER_INPUT。

**Files:** `CreatorWorkspace.tsx`、`GuideWorkspace.tsx`、`lib/seo/PublicGuideContent.tsx`；Create `lib/guides/source-summary.ts`、`tests/guide-source-summary.test.mjs`、`docs/implementation/CREATOR_CONTENT_PILOT_2026-10-22.md`。延伸 publication／creator-source tests。

**新純介面：**`describeGuideSource(guide: PublicGuide): {kind:'summary'|'itinerary'; authorName:string|null; version:number|null; publishedAt:string|null; dayCount:number|null; stopCount:number|null}`。只用現有 guide／publication 資料；summary 不捏造 counts。`PlaceFact.verifiedAt/sourceUrl` 在已有 facts 載入的界面呈現，不為資訊卡擅自掃描新 provider。

- [ ] 保留既有 `publicationReadiness(payload)` 和缺欄定位，只補實際可用性缺口；現有完整功能記 REUSED。
- [ ] 新 source-summary 測試：structured 的作者／版本／發布時間正確；summary 未提供資料為 null；不使用 `Date.now()` 作查核時間；發布時間與 verifiedAt 不混淆。
- [ ] 接來源卡及清楚的版本／預覽文字；有未知語言就保留 unknown，UI locale 不能當作者內容語言。
- [ ] 內容 owner 準備三份真實攻略 intake：作者同意、來源、原文語言、查核日期、days/stops、圖片權利及公開範圍；不拿生成內容或 synthetic fixtures 替代。
- [ ] 在 owned tests 驗 publish→read→adopt→new version／withdraw 的邊界；指定 hosted 發布在 PD16。作者 withdraw 後旅客既有副本及私筆記仍在。

**驗收：**資訊卡來源可追溯＋三份可發布真內容準備齊；內容缺失不宣稱 pilot ready。**回退：**revert 投影；下架僅限獲准內容，不刪私人副本。

## PD08：Merchant brief 發布前檢查

**依賴／owner／狀態：**PD01、PD05；Frontend／Merchant owner；PLANNED。

**Files:** `MerchantCampaigns.tsx`、`lib/merchants/campaigns.ts`、`campaign-schedule.ts`；既有 merchant-campaigns／schedule tests。只在現有 validator 需要可讀回饋時作小幅抽取。

**Interfaces:** 沿用 `CampaignInput`、`CampaignCommand`、`expectedUpdatedAt`；發布前摘要是既有 input 的 read-only projection。後端驗證、quota、terms sealing 不改。

- [ ] 顯示 title／requirements／deliverables／milestones／scheduleTimeZone／報酬種類的發布摘要，並定位缺欄；來源沒有報酬數據時不能補 0 或預設 payout。
- [ ] 測試跨日／時區、非法時間、已發布條款鎖定、CAS 衝突、owner／marketing 權限；沿用既有 server business rules，不另設較寬 client 規則。
- [ ] 同一 command unknown 結果維持 lock 與原 payload；回讀確認後才顯示 published。
- [ ] 跑對應 component／owned RPC controls，直接 API 非法修改也須拒絕。

**驗收：**商戶在提交前知道將發布甚麼；合法發布保存可讀回；非法 direct writes 仍被拒絕。**回退：**UI／來源 revert，保留已發布條款。

## PD09：Creator 交付時間線與修訂下一步

**依賴／owner／狀態：**PD05、PD08；Frontend／Creator QA；PLANNED。

**Files:** `CreatorMissionsWorkspace.tsx`、`CreatorCollaborationTasks.tsx`；必要時 Create `lib/collaboration/evidence-timeline.ts`、`tests/evidence-timeline.test.mjs`；沿用 collaboration UI tests。

**新純介面（僅在現有 projection 不足時加入）：**`evidenceTimeline(detail: CreatorMissionDetail): {key:string; at:string|null; kind:'submission'|'review'; status:string; note:string|null; submissionId:string}[]`。輸入是已授權 detail；沒有原始事件時間就 null，不生成虛構活動紀錄。

- [ ] 用既有 participation、milestone、Evidence／reviews 組合提交→修訂→再提交→核准；顯示等待誰及當前可做 action。
- [ ] 先測多 submissions／repeatable milestone、truncated milestone／cursor、revision feedback、過期限但已接受工作仍可交／改的既有合同。
- [ ] 測 fresh permission read、撤權、lost ACK、回讀失敗及原 payload 重試；feedback 不覆寫未送出筆記。
- [ ] 檢查核准訊息只稱交付核准，沒有建立結算／付款承諾；EN／zh-HK 及鍵盤可到正確 milestone。

**驗收：**每項交付有真實歷程與下一步；0 次重複副作用；歷程不變成新寫入模型。**回退：**還原呈現，保留 submission／reviews／receipts。

## PD10：Merchant 審批清單與上下文

**依賴／owner／狀態：**PD08、PD09；Frontend／Merchant QA；PLANNED。

**Files:** `MerchantCampaigns.tsx`、`MerchantCreatorDiscovery.tsx`、`CollaborationListFilters.tsx`、`lib/collaboration/list-query.ts`；沿用 u03-u04、u06 creator-discovery、u07 query tests。

**Interfaces:** 既有 campaign directory／query／cursor、reviewApplication／reviewSubmission commands；不提供 bulk approval。

- [ ] 明示當前公司、campaign、Creator、待審狀態及有權限的 proof；review feedback 與其他表單各自保留。
- [ ] 51+ records 測 filter→下一頁→Back→reload；stable ordering、cursor scope、空結果／失敗分開；明示 detail／milestones 截斷。
- [ ] 測 company A→B、舊 response／cursor／export、role revoke；marketing 不取得 owner-only proof，owner 有成功對照。
- [ ] 提交後回到正確清單與項目；focus 不跳到別案，未知結果不可用新 requestId 再審一次。

**驗收：**商戶可連續審核且不串公司／項目；列表行為在多頁資料下成立。**回退：**UI revert；保留 review history。

## PD11：可信成果報告與收益解釋

**依賴／owner／狀態：**PD08、PD10；Full stack／Finance/Ops；PLANNED。

**Files:** `MerchantInsights.tsx`、`CreatorEarningsWorkspace.tsx`、`lib/merchants/insights.ts`／repository；既有 insights tests／u10。不新增金流 writer。

**Interfaces:** `MerchantInsightsPage`、`InsightsSnapshot`、`InvitationCohort`、`InsightsEvents`、`EarningsPage`；沿用 `insightsCsv` 的欄位投影和 5000 上限。

- [ ] 說明 snapshot 與 period events、日期區間、asOf、coverage；每個比率顯示分子／分母；0 denominator 和 null accepted 各自清楚。
- [ ] 對 known fixture 核對 raw records→API→UI→CSV；attribution／submissions 缺資料維持 null，不補 0；不把 approvalActions 當 unique completed creators。
- [ ] 驗 CSV formula injection、只匯出已套用範圍、超出5000提示縮窄；取消／撤權後不得繼續下載舊公司資料。
- [ ] 收益按幣別顯示 exact amount；tracked／settled／payouts 保留差別；approval 不自動產生 settlement／payment。

**驗收：**商戶和 Creator 能解釋每個數字的來源與限制；沒有虛構 ROI／已付款。**回退：**revert 表達與投影，保留財務歷史。

## PD12：Ops 與支援接手

**依賴／owner／狀態：**PD05；Ops／Full stack；PLANNED。

**Files:** `InboxWorkspace.tsx`、`OpsWorkspace.tsx`、`MonitoringWorkspace.tsx`、`lib/ops/*`、`lib/collaboration/support-drafts.ts`；既有 support isolation、u05、u09、u17 tests；Create `docs/implementation/PILOT_SUPPORT_RUNBOOK.md`。

**Interfaces:** 既有 case／ops commands；phase `AcceptanceReceipt` 只作營運證據。`diagnoseReadiness` 是本機 operator 診斷，不暴露秘密或當作 runtime authority。

- [ ] 定義四類接手：存取／資料衝突／合作爭議／job故障；使用既有 case context 及 reference，不在 browser 搬入任意用戶資料。
- [ ] 核對 case A／B／new draft 各自恢復；確認 A 不清 B；customer reply 與 internal reason／decision 分離。
- [ ] 既有 monitoring 明確呈現 unknown、last success、last failure；無資料不顯示「正常」。需要人工核對時提供既有 owner 操作步驟。
- [ ] 完成一份可交班 runbook：誰接手、如何核對權限及 receipt、如何回到原角色確認、哪些情況不能重發。

**驗收：**PS06 可跟進至使用者回讀；Ops 權限不由 merchant membership 推導。**回退：**保留 cases／drafts，還原 UI。

## PD13：站內通知與提醒的產品行為

**依賴／owner／狀態：**PD09、PD10、PD12；Backend／Ops；PLANNED。

**Files:** `lib/collaboration/reminders.ts`、InboxWorkspace、cron collaboration reminders route、既有 u08 tests；不新增另一排程器。

**Interfaces:** 既有 reminder context、dedupe、deadline version、bounded job contract；輸出 local／owned recovery evidence，供 PD17 使用。

- [ ] 保留通知時期限與目前期限，連結正確 campaign／milestone；無效 payload 有安全 fallback。
- [ ] 測同事件重跑、不同deadline version、撤權、partial job、late ACK、同 anchor revisit 不搶焦點；一項失敗不改成整批成功。
- [ ] 區分 scheduled／in-app recorded／email sent／delivery unknown；當前未接通 email 不加假成功徽章。
- [ ] 記 owner、dispatch window、補跑與停止 future dispatch 的程序；實際 scheduler／外部發送留給 PD17。

**驗收：**owned 環境恢復與去重成立，營運程序可執行。**回退：**來源 revert；保留 dedupe／事件歷史。

---

## PD14：指定 staging 與恢復準備

**依賴／owner／狀態：**PD01；Platform／DB／Auth owner；OWNER_INPUT。可與 M1 同時準備。

**Files:** `CREATOR_MERCHANT_STAGING_CHECKLIST.md`、`scripts/MIGRATION_RELEASE.md`、現有 release gate／operations migration ledger；不改歷史 SQL。

**Interfaces:** 產出目標 identity、Auth ownership、schema fingerprint、grants/policies、source delta、approved actors、fresh recovery reference；候選 source 在 PD15 完成後綁定最終版本。

- [ ] 先唯讀核對實際 target 及 owner；確認不是 production 或共用資料的錯誤別名；測試隔離 skill 的 target gate 必須先通過才建立副作用 client。
- [ ] 對照最新 schema／history／grants／policies 與 current source。舊 staging doc 內 PR55 hash 只屬歷史，不重放所有 migration。
- [ ] 若有必要 delta，準備 exact additive packet，在已核實 disposable target 演練；記資料/CAS相容性、last-good app、DB/Auth/Storage/provider恢復涵蓋範圍。
- [ ] 由 owner 記錄本階段可接受的 RPO／RTO 與支援輪值；恢復演練結果須與該目標比較，不能用「有備份」代替。未定義時保留 release blocker，不自行承諾數值。
- [ ] 綁定兩公司、兩 Creator、owner／marketing／clerk／finance／outsider／ops 與 test mailbox；身份及 credentials 私下保管。
- [ ] 完成可審查的目標／操作／恢復包。僅在既有 scope 授權涵蓋時執行 hosted 配置或 SQL；否則準備完成後處理那一項所缺決定。

**驗收：**選定目標、必要 delta 與恢復 evidence 具體可查；沒有資料就 BLOCKED_TARGET，不臆測 missing migration。**回退：**演練過的 app／capability rollback；schema 使用相容 forward-fix，禁止 blind downgrade。

## PD15：最終整合、效能及可達性資格

**依賴／owner／狀態：**PD02–PD13 全部需要的 source／policy／content準備；QA／Frontend／Release；NOT_RUN。

**Files:** 既有 `scripts/performance/*`、u19 first-usable、performance release gates、source manifest、release ledger。實機結果記新 phase evidence，不覆蓋舊 logs。

**Interfaces:** 固定最終 `CandidateRecord`；原 performance protocol 和 thresholds 沿用，任何新增候選 API target 在觀測前記錄條件與 owner 決定。

- [ ] 整合小 PR 到一個隔離候選；重新檢查 full tree、private boundaries、source archive、required workflows 及 review。新 SHA 不挪用舊 CI。
- [ ] 保留原始 push／PR numeric gates；比較同機／同角色／同 fixture／cold-warm 的 first-usable 與 bundle；不加 timeout、減樣本或挑最快 run 來過關。
- [ ] 若量測顯示缺陷，只修被觀察到的 critical path；不要順手大拆 Workbench 或搬動 Auth。
- [ ] EN／zh-HK 真 browser：320／640／1280px、200%文字、鍵盤、error focus、狀態公告；VoiceOver／NVDA 與真實 iOS／Android 記實際版本及逐案結果。
- [ ] 記 lab 與 field 分開；field 無樣本就是 unknown／insufficient。檢查核心 API latency，新增門檻不能弱化既有 committed gates。

**驗收：**同一候選必要 CI、source、性能與可達性有有效結果；缺設備不能填 PASS。**回退：**revert造成退化的最小變更，重新評估相關候選證據。

## PD16：H01–H14 與六個產品情境的 hosted pilot

**依賴／owner／狀態：**PD14、PD15；QA＋具名角色＋內容 owner；NOT_RUN。承接 T06。

**Files:** `CREATOR_MERCHANT_HOSTED_UAT.md`、新 phase receipts、三篇 content pilot record；只有實際失敗才改對應產品。

**Interfaces:** 每案 `AcceptanceReceipt` 綁 source／deployment／schema／environment／role；同 candidate 執行。

- [ ] 在獲准 staging 綁定最終 source／schema／effective config；匿名私有請求401、合法200、越權按原403／404 concealment policy。
- [ ] H01–H14 每案有成功對照與必要拒絕；owner A/B、Creator A/B、marketing、branch clerk、finance、outsider、ops 都用實際角色。
- [ ] 三篇真攻略各跑 draft→publish→匿名讀→明確採用→私人筆記→新 session／第二裝置→授權withdraw後私人副本保留。
- [ ] 撤回測試後記錄內容保留決定；開放pilot前須仍有至少三篇獲作者同意、可讀取的攻略。重新發布須有作者授權並保留新版本；沒有授權就另選同意的內容，不能偷偷復原已撤回公開資料。
- [ ] PS01–PS06 全流程回到起始角色核對結果；lost ACK、撤權、support、insights、team invitation 與 collaboration invitation 分開驗。
- [ ] 測試 mailbox 的註冊／確認／復原需指定接收者和既有發送授權；不能用 UI success 代替實際到信與 redirect／cookie 結果。
- [ ] 記失敗、補救、耗時、求助及 cleanup；不能把 owned seed/reset/cleanup suite 指到 hosted。只清本次批准 fixture。

**驗收：**所有必要 H／PS／內容情境結果齊、核心無 FAIL；不足為 NO_GO。新 fix 改 source 後重新驗受影響 cases。**回退：**停止 pilot、已演練 rollback、保留業務／receipt資料。

## PD17：提醒、provider 與營運真實驗收

**依賴／owner／狀態：**PD13、PD16、PD04；Ops／Platform；NOT_RUN。承接 T07。

**Files:** 既有 cron／reminder／telemetry 程式與營運 runbook；必要失敗修復才改 source。

**Interfaces:** 真 scheduler receipt、recipient readback、failure／recovery record。站內送達與外部 provider 結果各自記狀態。

- [ ] 在指定窗口、既有授權 target 執行真正 dispatch；以兩milestones／兩deadline及一個重跑確認去重與收件正確。
- [ ] 演練 partial／provider timeout／撤權；先核對既有 receipt，unknown send 不盲目重發，不清 dedupe 來「恢復」。
- [ ] Ops 能區分 last-success／last-failure、只補必要工作，原收件角色回讀；完成一班交接。
- [ ] 外部 email／provider 未在本階段獲准啟用時保持關閉，列 N/A 的範圍理由；這不代表 T07 的外部部分完成。若任何產品承諾依賴它，release 保持 blocked。

**驗收：**範圍內真送達、恢復與owner交班成立；未接通能力在產品中明示。**回退：**停 future dispatch，保留通知、dedupe及失敗歷史。

## PD18：有限發布及現場觀測

**依賴／owner／狀態：**PD15、PD16、PD17；Release owner／QA；NOT_DEPLOYED。承接 T08，原 T08 不自動縮小。

**Files:** 現有 release gate、operations release docs、candidate manifest、phase evidence；不另建部署系統。

**Interfaces:** `GO | NO_GO` 決策、exact source/schema/config、適用能力、rollback、授權範圍及實際 runtime receipt。

- [ ] 對照 original T08／N16 與本次 pilot scope；若只發布較小能力範圍，明列未完成原任務，不能把 narrowed pilot 當整個 T08 結案。
- [ ] 提出具體 merge/deploy packet：head/base/target、SQL/config差異、能力、readback、回退、owner；已有授權則按範圍執行，沒有則只停發布。
- [ ] 發布後核 source SHA／tree／部署／schema、public read-only smoke、corresponding source archive。Protected preview redirect 與可下載 ZIP 分別驗證。
- [ ] 以獲准角色／範圍作必要 live readback；觀測錯誤、latency、同意範圍的使用指標。field 樣本不足保留 pending，不編造轉化率。

**驗收：**merged、deployed、runtime accepted 分列；發布及現場觀測都有實際證據。**回退：**已演練 last-good app／能力，不刪新合法資料。

## PD19：可選的有來源 AI 工作助手

**依賴／owner／狀態：**PD16、PD06、PD07、PD08，加 provider／品質條件；Product／AI owner；DEFERRED。不阻塞 PD18。

**Files:** `app/agent/AgentWorkspace.tsx`、`lib/agent/service.ts`、`result-contract.ts`、`tools.ts`、`policy.ts`；既有 evaluation／transport／accounting tests。

**Interfaces:** 原 `AgentTask` 四種、`AgentResult`、`ProviderPort`／budget store、accepted-output流程。執行者 GPT‑6.1 Sol 不改變產品當前 provider。

- [ ] 由 pilot 選一個最高頻痛點，優先改善 sourceQA／tripSuggestion 或 merchantBrief 的既有流程，不同時開四個新 Copilot。
- [ ] 固定 evaluation：至少20個版本化案例，涵蓋有效／缺來源／過時／衝突／跨租戶／prompt injection／timeout／quota；沒有來源不能裝成查證答案。
- [ ] 建議顯示引用與限制，套用前預覽差異並由使用者確認；model 不自動發布、審批、邀請、訂位或付款。
- [ ] 讀既有 budget／rate policy；歷史 ledger 記載的 US$5 aggregate cap不等同新provider批准。核實仍有效的授權、實際費率及成本記錄，不能為完成測試增加支出上限。

**驗收：**跨scope／未授權工具／無確認寫入控制零違規；bounded quality及cost evidence；條件欠缺維持 deferred。**回退：**停新AI路徑，保留手動工作流程。

## PD20：Pilot 回顧及下一輪三項優先工作

**依賴／owner／狀態：**PD18；Product／Ops；NOT_RUN。

**Files:** phase evidence、原需求ledger；新增下一輪 backlog，不把所有假設變成 must-have。

**Interfaces:** 分角色 success/attempts、首次成果時間、修訂輪次、支援需求、source/ref與剩餘未知；產品計劃第11節候選是輸入，不是已批准功能。

- [ ] 觀測至少一個完整合作循環及一次營運交班；逐角色記實際樣本、失敗和恢復，沒有資料便寫未測。
- [ ] 確認三方各自得到價值：旅客保存可重開、Creator 內容／交付被使用、Merchant 看懂核准及可核實成果。
- [ ] 依影響×頻率×恢復難度與成本選最多三項：例如 content metadata、matching、離線或AI；每項附 user story、scope、AC、owner、依賴和回退。
- [ ] 更新真正被證據覆蓋的 A/G/U 結案狀態；只完成子功能時保留 partial。停止本階段，不無限擴大 backlog。

**驗收：**可追溯的產品決策與 residual gaps；不以測試數或 demo流量冒充採用／留存。**回退：**停止擴量，保留內容、私人行程和歷史紀錄。

## 交付及停止條件

每個可審查增量附：問題與使用者影響、精確變更、必要測試及限制、source/head、部署／runtime狀態、rollback。首批至少交付 PD01 紀錄、PD02 實際驗證／阻礙、PD03 完整路由增量。之後持續完成授權內未受阻工作。

完成本階段或剩餘工作全屬明確缺失的外部輸入時，交付 ledger、相關 PR、AcceptanceReceipts、原始 logs、manifest／hashes 和下一個具體 action。不要在一般可修復測試失敗、pending job 或剛寫完方案時自稱完成產品。
