# KinnsoOS 對話式工作室重製 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留全部現有功能，以三方共用首頁及私人對話工作室重製 KinnsoOS 的使用體驗；第一批交付創作者從提問、文件、證據、brief 到既有 guide 保存與發佈的完整流程。

**Architecture:** `apps/journeys` 承載共用入口、獨立討論串及最少的成果 metadata；業務寫入仍由既有 repository／BFF／RPC 或 `apps/web` Server Actions 負責。新增來源 lineage、交接意圖及交易內檢查，讓保存、公開投影與原有 writer 使用同一套權限及版本事實。兩個 app 各自登入，先完成無外部連接也可用的創作者流程，再擴充角色與 provider。

**Tech Stack:** 現有 pnpm/Turborepo；Node ≥22.13.0、pnpm 11.6.0；Next.js 16.3.8、React 19.2.4、TypeScript；Supabase Auth/Postgres/RLS/RPC；Hono scan/sync workers；Node test、Vitest、Playwright。這是 checkout 的版本基線，不是升級任務。

**Spec:** [設計規格](../specs/2026-10-31-kinnsoos-conversation-studio-design.md) · [示例原型](../../prototypes/kinnsoos-conversation-studio.html) · [原型驗證](../specs/2026-10-31-kinnsoos-conversation-studio-validation.md)

**Status:** 2026-10-31，**完整實作計劃，供審閱；以下正式實作任務全部未執行**。使用者已接受設計方向，尚未批准修改正式程式、SQL、部署設定或建立真實連接。本輪只新增本文件。

## Global Constraints

- 首頁保留「探索、規劃及記錄旅程」；旅人、創作者、商戶三組入口同等呈現。Ops 在經驗證的內部工作區出現。
- 訪客可瀏覽公開目錄及本頁暫存試問；保存、建立分享及發佈先登入。公開分享的讀者不因此被強制登入。
- 所有現有 direct URL、別名、Back／reload、角色工作區、disabled 說明、demo 及原站入口保留；不得用「日後重做」刪除可用功能。
- DB 角色、company membership、RLS／RPC 為權威；首頁角色選擇、模型輸出及連接圖示均不授權。
- 新寫入必須使用 revision＋request UUID；結果未知保留同一意圖，ACK＋授權讀回才可顯示已保存。不得將 toast、build、mock 或 prototype PASS 當成真資料證據。
- 私人文件、媒體及衍生成果預設私人；保存、重新開啟、移交、公開都驗來源權限。逐項公開確認綁定內容版本、來源版本及 audience。
- 外部能力沿用 capability 機制、預設不可用、最小權限、預設只讀；booking／payment 繼續硬關閉。Gmail 只讀。
- `apps/journeys` 與 `apps/web` 分別驗證，不複製登入 cookie、不加跨站 SSO、不用 service role 代替使用者。
- 只用 `supabase/migrations` 作遷移歷史；不改已存在的歷史 SQL、不重放整套遷移、不以新驗收覆寫 PD／N 歷史紀錄。
- 保留 Journeys GPL-3.0、AdventureLog 來源及 corresponding-source 機制；新程式也納入來源封包。
- 手機優先，輸入字級至少 16px、主要觸控區 44px、文字錯誤提示、鍵盤可操作、尊重 reduced motion。商戶與 Ops 保持清晰實用。
- 不新增可兌換貨幣、懲罰式連續登入或公開排行。里程只代表可核實的進度；既有 tracked／settled／payout 意義不變。
- 本計劃不是 DDL、真資料寫入、付費呼叫、OAuth、發信、發佈、push／merge／deploy 的授權。執行前核實所批准的 target、revision、操作範圍；不可使用正式環境憑證。

## Review Focus

1. 預覽後撤權、公開確認後更改來源：原 writer 必須在交易內再次拒絕，cached brief 不可繞過；T04／T06／T07 驗證。
2. 雙擊、斷線、ACK 遺失、reload、同 UUID 換 payload：只產生一次效果，未知不能變成成功或重新開一筆；T03／T05／T06／T07 驗證。
3. 切換帳戶／公司後遲到的回應及舊分頁：不得顯示前一個 scope 的草稿、文件或訊息；T02／T05／T12 驗證。
4. brief 經人工編輯後失去引用或改變公開段落：確認失效，保留來源約束，要求重新檢查，不能把移除 citation 當成自動取得權利；T04／T06 驗證。
5. 從舊網址、原站 Server Action 或底層 publish RPC 直接操作：原功能仍可達，但 studio 衍生內容不能繞過檢查；T01／T06／T08 驗證。

---

## 1. 基線、證據與這份計劃補足的決策

研究基線為本機 `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`（Merge PR #83）；本輪再次核對 HEAD 相同。這不證明正式站正在執行此版本。現存未追蹤檔案是前輪設計、驗證及 prototype，須原樣保留。

| 已知狀態 | 本計劃如何處理 |
|---|---|
| 公開首頁曾實際讀到探索定位、攻略／收藏／記錄及分站登入；現況偏旅人 | 使用設計規格第 2 節的日期與觀察，不宣稱重新測過 live；T02 建三方共用入口 |
| roadmap 網站及 Ads Copilot 登入後內容未取得 | 不補寫網頁狀態；依使用者已確認的「倉庫逐版本證據及本次需求」 |
| PD02 原候選 CI blocked；10/24 指定候選有 CI success；PD18 仍 NO_GO | 保留三者時間、head、範圍差異；新候選需自己的證據，不借舊 PASS |
| CS0 原型通過固定示例互動及 viewport 檢查 | 僅設計可操作性證據；Auth／RLS／真保存／provider／實機／AT 尚未驗收 |
| Journeys 已有 `creatorMaterials` 等四種 agent 任務及 guide save/publish RPC | 重用任務政策及原 writer；第一批可用原創手動文件＋來源摘錄，不依賴模型或 OAuth |
| 原站 `apps/web/lib/guides/actions.ts:updateGuideAction` 直接更新 `guides`；不是 Journeys 的 revision／UUID writer | **新增保護落點**：T06 覆蓋原站及底層 RPC 的 studio 綁定檢查；不把「所有舊 writer 已具同一保證」寫成事實 |
| 原 `withdraw` 不接收 revision／request UUID | 原手動功能保留；首批工作室只接 save／publish，不代理 withdraw；要代理須另補合同 |
| 舊 chat log 不是多主題持久化 thread／ACL 模型 | 新增必要 metadata，不自動搬移舊對話；舊 agent／copilot 可從原入口繼續使用 |
| 尚未定案：第三方內容權利、保留／刪除時限、已公開衍生成果撤權政策 | 原創、自有資料切片可先開發；涉及這些政策的真來源與 provider 不得啟用，不能標為已解決 |

本文件把設計中的候選路徑具體化為 `/{locale}/workroom`；原 `studio` 繼續代表創作者工作區。`public-entry-registry` 的現有檔案落點是 `apps/journeys/app/integration/public-entry-registry.ts`。

## 2. 階段、依賴與交付界線

新階段沿用 CS 前綴，**不改寫 PD01–20、N01–18 或 A/G/U/LegacyE 的完成狀態**。沒有估算部署日期；外部批准、隔離環境及權利取得會影響交付時間。

| 階段 | 任務／程式落點摘要 | 依賴 | 階段完成標準 |
|---|---|---|---|
| CS0 設計基線 | 已有 spec／prototype／validation；本計劃 | 使用者審閱 | 方向及首批界線確認；不稱正式功能完成 |
| **CS1 第一批：創作者完整流程** | **T01–T07**；Journeys home/workroom、studio metadata、creator API/RPC、web guide 安全相容 | 實作獲批；指定非正式測試 target；原 creator 合同 | 三方同一首頁成立；真 creator 自有內容 evidence→brief→原 editor→published version 可讀回；故障／權限測試通過 |
| **CS2 第一批的受控驗收＋創作者完整工作區** | **T08–T09**；C2–C5、missions/earnings、原站入口、驗收包 | CS1；與 scope 相關的 PD14–17 gate | 第一批可交付判定完成；完整 creator 導覽無缺項；環境不就緒時只標 source-ready／BLOCKED，不能開始對外 rollout |
| CS3 旅人擴充 | T10–T11；trips/bookmarks/media/shares | CS1–2 創作者流程及共用首頁通過 | T1–T5 沿用原寫入；採用來源版本、私人筆記、分享及撤回可核對 |
| CS4 商戶與 Ops | T12–T14；merchant/ops/inbox/support/reports | CS2；公司 membership 與原審批合同 | M1–M5／O1–O5 不越公司或個案；原合作、審批、核銷、對帳仍可用 |
| CS5 分層連接 | T15–T17；connections、來源 adapter、工具執行 gate | 先完成手動工作流；逐 provider 政策與資格驗證 | 每個 provider 各自有讀／寫證據；可撤銷；未接通不限制基本功能 |
| CS6 有限 rollout | T18–T19；可達性、性能、來源封包、operating packet | 欲開放切片的所有 gate＋明確 rollout 批准 | exact revision／artifact／backend 對齊，故障回退可演練，必需證據無 FAIL/BLOCKED/NOT_RUN |

依賴主線：`T01 → T02 → T03 → T04 → T05 → T06 → T07 → T09`。T08 在 T07 後完成 creator 其餘工作區；T09 最後檢查 T08。T10–14 不能取代首批的完成條件。T15 的離線 adapter 設計可在 CS2 後並行，真連接仍受各自 gate 限制。

第一批成功故事：一位 DB 中有效 creator，在共用首頁選 C1，使用自己原創文字完成私人 brief，逐項確認可公開內容，移交既有 guide editor，保存、讀回、獨立確認發佈並讀回不可變 version。**不需**先有 Firecrawl、Drive、社交帳號、付費模型、商戶帳號或 Ops 核准；普通 guide 不新增強制 Ops 審批。

## 3. 檔案及責任邊界

以下路徑相對 repository root；「新增」均是未來計劃，這次未建立。既有檔案已以 code graph／實際 source 核對。執行時先重新檢查 drift；不要以行號當永久介面。

| 責任 | 既有落點 | 計劃新增 |
|---|---|---|
| 首頁／路由／導覽 | `apps/journeys/app/[locale]/[[...route]]/page.tsx`、`app/travel/Workbench.tsx`、`ConnectedHome.tsx`、`routes.ts`、`workbench.css` | `app/workroom/ConversationHome.tsx`、`WorkroomShell.tsx`、`TemplateCards.tsx`、`workroom.css`；`lib/studio/navigation.ts`、`templates.ts` |
| 對話／文件／成果 | `app/agent/AgentPage.tsx`、`AgentWorkspace.tsx`；`lib/agent/policy.ts`、`service.ts`、`result-contract.ts` | `app/workroom/ThreadWorkspace.tsx`、`DocumentPicker.tsx`、`EvidencePanel.tsx`、`BriefEditor.tsx`；`lib/studio/contracts.ts`、`repository.ts`、`command-state.ts`、`sources.ts`、`evidence.ts` |
| Server 邊界 | `lib/auth/actor.ts`、`lib/api/server.ts`、`validation.ts`、`lib/contracts/capabilities.ts` | `lib/studio/server.ts`、`policy.ts`；`app/api/studio/threads/route.ts`、`threads/[id]/route.ts`、`commands/route.ts`、`requests/[id]/route.ts` |
| Creator 交接 | `app/travel/CreatorWorkspace.tsx`；`lib/creators/contracts.ts`、`editor-operations.ts`；`app/api/creator/guides/[id]/route.ts`、`[id]/publish/route.ts` | `app/workroom/GuideHandoff.tsx`；`lib/studio/guide-handoff.ts`、`guide-publication.ts` |
| 原站相容 | `apps/web/lib/guides/actions.ts`、`versions.ts`、`queries.ts`；`lib/copilot/queries.ts` | `apps/web/lib/guides/studio-guard.ts`；`apps/web/tests/guides/studio-guard.test.ts` |
| Schema | 唯一 `supabase/migrations`；原 guide drafts／creator_requests／guide_versions | `20261031090000_add_studio_metadata.sql`、`20261031090100_guard_studio_guide_writes.sql`；CS5 再加 `20261031090200_add_studio_connections.sql` |
| Provider | 既有 `apps/scan`、`apps/sync` 暫不修改 | `apps/journeys/lib/studio/connections/` 下的 registry／policy／vault／sync／providers；`app/workroom/ConnectionsPage.tsx`；`app/api/studio/connections/` |
| 品質／保留 | `tests/*.test.mjs`、`tests/integration`、`tests/e2e`；`scripts/verify-test-target.mjs`、`scripts/source-manifest.json`；`packages/parity`、`packages/honesty` | 各任務具名 tests；`playwright.studio.config.ts`、`scripts/start-studio-test.mjs`；`docs/implementation/CONVERSATION_STUDIO_*` 驗收檔 |

三個 SQL 檔名是本計劃的預留名稱；實作當日如已被佔用或不再晚於最新 migration，先更正本計劃及依賴順序再建立，不能覆寫舊檔。`packages/db` 生成型別只在核對並獲准的隔離 schema 上更新；不得順手用預設 credential 生成。先在 app 內聚合 studio 模組，不因重製就新增共享 package 或重構整個 Workbench。

## 4. 合同與資料模型

### 4.1 跨任務介面

`apps/journeys/lib/studio/contracts.ts` 定義以下合同；UUID／revision 的執行期驗證沿用 API validation，TypeScript type 不代替 server 驗證。

```ts
type StudioTopic = 'travel' | 'creation' | 'merchant' | 'review' | 'support';
type TemplateId = 'T1'|'T2'|'T3'|'T4'|'T5'|'C1'|'C2'|'C3'|'C4'|'C5'
  | 'M1'|'M2'|'M3'|'M4'|'M5'|'O1'|'O2'|'O3'|'O4'|'O5';
type SourceRef = { sourceId: string; version: number; aclVersion: number; hash: string };
type StudioEnvelope<T> = { requestId: string; expectedRevision: number; payload: T };
type StudioReceipt<T> = { requestId: string; resourceId: string; revision: number; digest: string; data: T };
type StudioResult<T> = { status: 'verified'; receipt: StudioReceipt<T> }
  | { status: 'unknown'; requestId: string }
  | { status: 'conflict'; currentRevision: number }
  | { status: 'denied'|'invalid'|'restricted'|'unavailable'; code: string };
type BriefBlock = { id: string; text: string; sources: SourceRef[]; intendedUse: 'private'|'public-candidate' };
type StudioBrief = { id: string; threadId: string; revision: number; blocks: BriefBlock[] };
type GuideTarget = { id: string; expectedRevision: number };
type GuideProjection = { payload: DraftPayload; blockIds: string[]; sources: SourceRef[]; digest: string };
```

`DraftPayload` 使用現有 `lib/creators/contracts.ts` 型別，不重定義 guide 結構。`VerifiedStudioContext` 在 `lib/studio/server.ts` 由 server 建立，包含已驗 actor、app origin、可用角色及已驗 company scope；不從 body 接收。Company ID 是請求範圍，server 仍須核對 membership。

`studioRepository` 在 `repository.ts` 暴露 `getThread(id)`、`listThreads()`、`command(envelope)`、`getRequest(requestId)`；回傳型別在 contracts 同檔定義。command 是有界 discriminated union：`createThread`、`appendMessage`、`archiveThread`、`saveSource`、`restrictSource`、`saveArtifact`、`prepareGuideSave`、`prepareGuidePublish`。每個 command 限定 target、欄位、大小及權限，不接受任意 SQL、tool name 或 table name。

API `POST /api/studio/commands` → `apply_kinnso_studio_command(p_target_id uuid, p_expected_revision integer, p_request_id uuid, p_command jsonb)`，內部按上述 allowlist 分派小型函式。讀取使用 `get_kinnso_studio_thread`、`list_kinnso_studio_threads`、`get_kinnso_studio_request`；所有讀取重新驗 owner／來源限制，receipt 端點不能回傳已撤權的舊 body。建立物件用預先固定 UUID、expectedRevision=0；更新用實際版本。

### 4.2 最少新增實體

| 實體／位置 | 必要資料與不變條件 |
|---|---|
| `public.studio_threads` | owner、origin_app、topic、template/version、company nullable、target reference、revision、archived_at；初版 visibility 固定 private |
| `public.studio_messages` | thread、sequence、role、body、source refs、run reference；唯一 thread＋sequence；不讓 browser 冒充可信 tool response |
| `public.studio_sources` | owner、origin、原物件/version、最小摘錄、hash、來源及檢查時間、rights_state、ACL version、active/restricted；不保存 OAuth token |
| `public.studio_artifacts`＋`studio_artifact_versions` | artifact identity/current revision 與不可變 body 版本分開；brief/checklist/report；保留 origin thread |
| `public.studio_evidence_links` | artifact/message version、claim/block ID、source/version、locator、excerpt hash、allowed use；刪 citation 不清除既有 lineage |
| `kinnso_internal.studio_requests` | actor＋request UUID 唯一；command digest、結果 reference；同 UUID 不同內容拒絕；不是 domain receipt 的替代品 |
| `kinnso_internal.studio_handoffs` | actor/company、artifact revision、target/revision、domain request UUID、投影 digest、逐項公開選取、來源 ACL versions、confirmation hash；確認後不可變 |
| `kinnso_internal.studio_guide_bindings` | guide ID 與已使用 handoff／lineage 的持久綁定；原 guide 可公開資料不放私人 source URL；漏傳 handoff 不會解除綁定 |
| `kinnso_internal.studio_write_permits` | 原 writer 驗證後在同一 DB transaction 建立的最小 permit，綁 actor/guide/operation/digest/transaction；供 table guard 核對，交易後不可重用，不向外授權或回傳 |
| CS5：`kinnso_internal.studio_connections` | owner、provider、帳戶標籤、scope/version、status、last_success nullable、revoked_at、vault reference；只經 owner-scoped RPC 回傳安全摘要 |

Public metadata tables 啟用 RLS，預設拒絕；含私人正文的 messages/sources/artifact_versions/evidence 不向 browser roles 開放直接 SELECT，讀取 RPC 先驗 owner＋來源限制才回傳可讀投影。寫入只經命名 RPC；internal 表撤銷 browser roles 的直接存取。安全函式固定空 search_path、全限定名稱，使用 caller Auth 判斷。測試 authenticated A/B、anon、merchant owner/marketing/clerk/finance、Ops 及角色撤回；Ops／公司 owner 不可因此讀個人文件。

來源政策與機密不得依賴 client 傳入的 `rights_state`。原創聲明記為 owner attestation，**不等於第三方權利已經法律核實**。初批允許本人原創文字及明確選取的已授權來源引用；私人照片可先使用本人提供的文字描述，真正媒體存取仍走原 media scope，不另建上傳旁路。

### 4.3 Writer、重試及確認

`draft → previewed → confirmed → pending → acknowledged → verified`；例外為 unknown/conflict/denied/restricted/invalid/unavailable。

- Metadata command 的 UUID 與 save／publish 的 domain UUID 分開；`prepareGuideSave` 固定一個 domain intent，再以原 `creators.save(id, revision, domainRequestId, payload)` 送出，簽名不變。發佈使用另一個 `prepareGuidePublish` 及 UUID。
- Handoff 不是第二套 guide writer；`save_kinnso_guide_draft`、`publish_kinnso_guide_draft`、底層 `publish_guide_version` 及原站 mutation 路徑仍是 domain 權威。
- T06 的 DB guard 在原 writer 交易中鎖住相關 source ACL／binding，重新驗來源、guide revision、確認及 digest；相同 guide 使用一致鎖順序，與既有 adoption／withdraw 鎖順序回歸。單靠 BFF 先查後寫不合格。
- Table trigger 只接受該交易內由私有 guard 建立的匹配 permit；authenticated 不能呼叫 guard 或建立 permit，不採用 client 可設定的 session flag。原 `publish_kinnso_guide_draft` 目前以內部隨機 UUID 呼叫 `publish_guide_version`；studio-bound 路徑須明確傳遞同一 prepared publish domain UUID，分開核對 draft revision 與 published version，避免下層失去已確認意圖。兩層原 receipts 各保留自己的 digest，不混成一張表。
- 已綁定 guide 的後續人工編輯也需更新 lineage／確認。直接 table UPDATE 或省略 handoff 不得消除綁定；web 相容入口必須顯示可繼續的安全編輯路徑。非 studio 的舊 guide 不強制改用新 metadata。
- 原 writer 的 receipt 優先保留冪等結果；若之後來源撤權，只回傳最小的「此請求曾完成」狀態，不洩漏舊正文、不重執行。UI 不可把歷史完成改寫為「從未保存」。
- Timeout／傳輸錯誤保留同 UUID＋payload＋revision。查 receipt 仍未知不能把 404 當作確定失敗；有已保存的 handoff 才恢復原 payload 重試，不默默換 UUID。
- Client 只暫存 scope 雜湊及 opaque pending request/handoff ID；不把私人文件寫入未受控 localStorage。Reload 從 server 驗權後恢復 handoff；尚未確認保存的文字明示未保存。無法重建同一 intent 時維持未知及提供核對，禁止猜 payload 重試。
- Conflict 顯示遠端／本地差異；人工合併後是新 revision＋新 UUID。晚到 ACK 只更新已保存版本標記，不覆蓋更晚的本地修改。
- 撤權時停止新讀取／重用／分享；衍生 private body 也受限制。過去合法公開或他人已採用副本的處理依既有 withdraw/share 與政策，不能承諾全球刪除。

## 5. CS1：第一批可執行任務

下列步驟為未來執行清單。每個任務先寫具名失敗案例，確認測到缺口，再完成最少實作並驗證；本次不執行產品測試。程式碼提交、遠端操作或 DB 套用仍按屆時批准範圍處理。

### T01 — 鎖定功能保留清單與檢查入口

**Files:** 讀取既有 `app/travel/routes.ts`、`Workbench.tsx`、`app/integration/public-entry-registry.ts`、web filesystem routes；新增 `apps/journeys/lib/studio/navigation.ts`、`tests/studio-navigation.test.mjs`、`docs/implementation/CONVERSATION_STUDIO_ROUTE_INVENTORY.md`。

**Interfaces:** `retainedEntries` 含原 path/alias、app、locale、owner、role gate、capability、expected status、目的地及既有驗收來源；`getStudioNavigation(actor)` 只回導覽，不授權 command。依賴：核對 HEAD／dirty tree；讀本版本 Next 本地文件。

- [ ] 產出逐條 inventory，包括 web 原站、46 項 public registry、dynamic route 的有效／非法參數與全部 alias；每條標 connected／unavailable／demo，不以本文件路由族數當實際條數。另記 T18 要比較的原首頁/創作路徑、固定裝置/網路/資料集與未改版性能基線。
- [ ] 新增 `retains_every_original_entry_and_alias`：原 inventory 每條均能映射；`rejects_unknown_and_traversal_paths`：未知 path／`..` 仍 404；先執行並確認新映射尚未存在時失敗。
- [ ] 實作 `getStudioNavigation`，把「所有功能」作固定可達入口；任何原入口只能保留或經明示等價轉址，不能回到無關首頁。
- [ ] 執行 `pnpm --filter @kinnso/journeys exec node --experimental-strip-types --test tests/studio-navigation.test.mjs tests/public-entry-registry.test.mjs`；預期全部 PASS。
- [ ] 更新 inventory 的 owner／測試對應；T02、T08、T10–14 依此逐條核銷，刪除或改 gate 的 diff 一律不得通過本任務。

### T02 — 三方共用首頁、範本與工作室殼層

**Files:** 修改 `ConnectedHome.tsx`、`Workbench.tsx`、`routes.ts`、locale catch-all page、`lib/contracts/capabilities.ts`；新增第 3 節 home/shell/template/style 檔、`lib/studio/templates.ts`、`tests/studio-home.test.mjs`、`tests/e2e/studio-home.spec.ts`、`playwright.studio.config.ts`、`scripts/start-studio-test.mjs`。

**Interfaces:** `suggestTemplates(question, allowedTaskIds)` 回建議，不建立權限；20 張卡的 inputs/permissions/output/destination/difficulty/time 使用設計第 5 節。新增候選能力 `conversation`（私人 metadata）與 `creatorBriefHandoff`（交接）；同樣預設 unavailable。純公開首頁與手動暫存試問不依賴它們。

- [ ] 測試 `one_home_three_equal_audiences`：guest/traveller/creator/merchant 均見同一主標、提問框、三組入口；`persona_never_grants_creator`：點卡不能獲 creator API；`guest_save_requires_login`：試問無持久化、保存導向 safe-next 登入。
- [ ] 建立只綁 loopback、清除 production/provider env 的 fixture server；Playwright config 提供 desktop/mobile Chromium projects，拒絕非明確 test backend；先跑上述新案例確認失敗原因正確。
- [ ] 加 `/workroom`、`/workroom/t/:uuid`、`/workroom/templates`、`/workroom/documents`、`/settings/connections` 精確路由；保留 `/studio`／`workspace`。工作室及原角色頁按需載入，不將私人元件灌入公開首頁 bundle。
- [ ] 實作 spec 的固定首頁文案、等重入口、任務卡、單欄手機 brief；登入後詢問是否保存該訪客草稿，不自動搬移。Capability 未就緒時提供原工作區與手動入口。
- [ ] 執行 `pnpm --filter @kinnso/journeys exec playwright test --config playwright.studio.config.ts studio-home.spec.ts` 及 `tests/studio-home.test.mjs`；驗證 320/390/768/1280、鍵盤、safe-next、三方共同入口；模型及 provider calls 必須為 0。

### T03 — 私人 metadata、RLS 及持久化 API

**Files:** 新增 `20261031090000_add_studio_metadata.sql`、contracts/repository/server/policy、studio API 四組路由；測試 `apps/journeys/tests/studio-contracts.test.mjs`、`tests/integration/studio-metadata.test.mjs`。只在批准後更新 `packages/db` 對應生成型別。

**Interfaces:** 實作第 4.1 節合同及 RPC；`authorizeStudio(context, command)` 的判定在 DB 仍需重做。依賴 T02；SQL 套用前另核對批准的 target、schema/version、rollback/recovery packet。

- [ ] 寫 `other_actor_cannot_read_thread_or_receipt`、`ops_has_no_private_override`、`append_same_uuid_once`、`same_uuid_different_digest_rejected`、`revision_conflict_preserves_both`；先以已批准隔離 DB 證明缺口，無 target 則 BLOCKED。
- [ ] 建第 4.2 節首批 metadata tables／索引／RLS／internal receipts；每個 command 同交易檢查角色、來源、revision 與 UUID，限制 body 長度、分頁及每串資源數，不允許任意 raw table access。
- [ ] 接 BFF，沿用 `apiContext`、boundedBody、same-origin mutation 及錯誤合同；公司範圍由 server 驗；不要把 `auth.getUser` 成功等同 creator active。尚未完成的 prepareGuideSave/Publish command 回 unavailable；其實作由 T06/07 完成。關閉 mutation capability 後，已驗 owner 仍可查最小 request 狀態，不能讀回受限正文。
- [ ] 加 `new_session_reads_same_artifact_revision`、`deleted_role_denies_pending_command`；執行第 8 節 L1／L3 對應命令，確認原 creator／guide integration 不退步。
- [ ] 記錄 SQL revision、RLS角色矩陣、實際隔離 target 及 receipt。只有 ACK、相符讀回與資料庫證據俱備才標 persistence PASS。

### T04 — 文件選擇、證據與來源限制

**Files:** 新增 `DocumentPicker.tsx`、`EvidencePanel.tsx`、`lib/studio/sources.ts`、`evidence.ts`、`tests/studio-evidence.test.mjs`、`tests/integration/studio-source-access.test.mjs`；使用 T03 sources/evidence/RPC。

**Interfaces:** `selectSources(context, refs, purpose)` 僅檢索已選來源；`validateEvidence(blocks, accessibleSources)` 回 valid/restricted/unverified 的逐項結果；`projectAuthorizedBrief(context, brief)` 不可回傳撤權內容。依賴 T03。

- [ ] 寫 `unselected_document_never_enters_answer`、`forged_source_ref_is_denied`、`remove_citation_does_not_remove_lineage`、`source_restricted_blocks_cached_derivative`，斷言未選 D2 不可被引用、跨 actor source 不可讀；先跑失敗案例。
- [ ] 實作本人原創文字／手選 app 物件引用的來源清單；證據顯示 source、locator、版本、取得／檢查時間與主張關係；無法核實的營業時間、交通或權利標「未驗證」。不自動抓網頁或讀整個雲端硬碟。
- [ ] 所有輸入文件、網頁及 tool output 當資料；不得用其中指示更改 system prompt、選 tool 或擴大資料範圍。手動新增無來源段落標 owner input／待確認，不捏造引用或站點。
- [ ] 補 `revocation_during_read_is_restricted` 及含 HTML/script／提示詞注入文件案例；文字安全渲染，來源改版需重新確認；private source URL 不進 public projection／telemetry。
- [ ] 執行 `tests/studio-evidence.test.mjs` 與 L3 的 `studio-source-access.test.mjs`；所有拒絕案例須在 server/DB 生效，不只 UI 隱藏。

### T05 — 獨立討論、brief 編輯及未知結果恢復

**Files:** 新增 `ThreadWorkspace.tsx`、`BriefEditor.tsx`、`lib/studio/command-state.ts`、`tests/studio-command-state.test.mjs`、`tests/e2e/studio-thread.spec.ts`；整合原 `AgentWorkspace`、`lib/agent/policy.ts`／`service.ts` 的可重用部分，保留原入口。

**Interfaces:** `reduceStudioCommand(state, event)` 管第 4.3 節狀態；`createBriefFromThread(threadId, sourceRefs)` 只建立 private artifact；來源摘錄模式明示不用模型，不偽裝生成。依賴 T03–04。

- [ ] 寫 `different_topics_have_independent_threads`、`brief_keeps_origin_thread`、`late_ack_keeps_newer_edits`、`switch_actor_drops_late_result`、`timeout_keeps_exact_intent`；先跑 FAIL。
- [ ] 接範本→選文件→討論→展開證據→另開 brief→私人保存；輸入與成果分開，最近討論只讀本人，收件匣仍是原通知介面。
- [ ] 保存後比對 owner/id/revision/digest；較早版本 ACK 不覆蓋新修改。Sign-out／403／切公司清理畫面與 scope cache，context epoch 拒絕舊請求結果。
- [ ] 加 `reload_unknown_uses_server_handoff`、`receipt_not_found_stays_unknown`、`fresh_login_requires_explicit_guest_import`；無法安全恢復的未保存正文清楚提示，不從另一帳戶草稿補內容。
- [ ] 執行 `tests/studio-command-state.test.mjs` 及 `playwright.studio.config.ts studio-thread.spec.ts`；測試另開兩串、返回原串、重開 brief、斷線與角色切換，頁面不得只靠 toast 表示成功。

### T06 — brief 移交既有 guide，封住旁路

**Files:** 新增 `GuideHandoff.tsx`、`lib/studio/guide-handoff.ts`、`20261031090100_guard_studio_guide_writes.sql`、`apps/web/lib/guides/studio-guard.ts`；修改 Journeys creator editor/BFF、web `lib/guides/actions.ts`／`versions.ts`；新增 `tests/studio-guide-handoff.test.mjs`、`tests/integration/studio-guide-guard.test.mjs`、web `tests/guides/studio-guard.test.ts`。

**Interfaces:** `buildGuideProjection(brief, selectedBlockIds): GuideProjection`；`prepareGuideSave(envelope)` 固定 target、來源與 domain intent；沿用 `creators.save(id, expectedRevision, requestId, payload)`。私有 `kinnso_internal.assert_studio_guide_write(p_guide_id uuid, p_operation text, p_request_id uuid, p_expected_revision integer, p_payload_hash text) returns void` 驗 binding、prepared intent 及來源後建立交易內 permit；operation 只允許 save/publish，只有原 domain writer 呼叫。依賴 T04–05。

- [ ] 寫 `private_block_excluded_by_default`、`summary_does_not_invent_stops`、`confirmation_invalid_after_edit`、`bound_guide_direct_update_is_rejected`、`legacy_unbound_guide_still_edits`；先確認缺少 guard 的失敗。
- [ ] 建欄位差異預覽 title/city/summary/content.days/stops；逐段／媒體顯示 audience、來源及權利用途。保存私人 brief 不代表同意公開；未知權利段落不可進 public-candidate 投影。
- [ ] 在原 save/publish writer 及底層 publish RPC 的交易內核對 actor／target revision／source ACL version／digest，記 guide binding；維持原 `creator_requests` 為原 save/publish receipt 權威。guard 不依賴可偽造的 session flag；原站直接 UPDATE、底層 RPC、後續 editor autosave 均納入測試。
- [ ] 對已綁定 guide，web action 使用 guard 回傳安全的「在 Journeys 繼續編輯」入口及分站登入說明；阻擋未經新確認的 mutation，不移除非 studio 舊作品的編輯／發佈／刪除功能。T08 再補原站對綁定 guide 的完整相容編輯。合法 withdraw／刪除按原權限處理，不能用刪綁定重新公開舊摘錄。
- [ ] 加 `revoke_between_preview_and_commit`、`same_uuid_different_payload_rejected`、`lock_order_with_adopt_and_withdraw`；執行 unit、web Vitest、L3 integration，對比無 studio guide 的舊 tests；保存後授權讀回一致才進原 editor。

### T07 — 既有發佈、公開讀回與第一條完整流程

**Files:** 新增 `lib/studio/guide-publication.ts`、`tests/studio-guide-publication.test.mjs`、`tests/integration/studio-creator-flow.test.mjs`、`tests/e2e/studio-creator-flow.spec.ts`；修改原 `CreatorWorkspace.tsx`、`editor-operations.ts`、creator publish route；使用 T06 已建立的交易內 guard，不修改已套用 migration。

**Interfaces:** `prepareGuidePublish(envelope)` 綁 saved draft revision、公開內容 digest、source ACL、獨立 domain UUID；`verifyGuidePublication(ack, authorizedDraft, publicSnapshot)` 回 confirmed/unknown/restricted。沿用 `creators.publish(id, expectedRevision, requestId)`，不從 thread 直接寫 `guide_versions`。依賴 T06。

- [ ] 寫 `publish_requires_saved_revision_and_separate_confirmation`、`publish_retry_creates_one_version`、`unknown_save_blocks_publish`、`lower_publish_rpc_cannot_bypass_binding`；先證明缺少該保護時失敗。
- [ ] 保留 `publicationReadiness` 與 server validation；顯示完整公開投影和來源標示。Publish 對應 `publish_kinnso_guide_draft`→`publish_guide_version`→immutable version；不增普通 guide 的 Ops 審批。
- [ ] 保存及發佈各記原 receipt，授權讀回 draft 與 public snapshot 對照實際 version/內容；發佈後撤權造成公開讀回不可得時顯示「曾完成，現時內容受限」，不可冒稱從未發佈或仍公開。
- [ ] 完成 `creator_home_to_verified_publication`：三方同首頁→C1→選原創文件→證據→獨立 brief→private save→公開選取→原 editor→publish；附第二帳戶拒絕、unknown retry、並行編輯衝突、private D2 不外洩案例。
- [ ] 執行 unit、L3 與 `playwright.studio.config.ts studio-creator-flow.spec.ts`；輸出每步 id/revision/request UUID 的遮蔽證據鏈。Mock PASS 與真隔離 DB PASS 分開記錄，送入 T09 驗收。

## 6. CS2–CS6：完成重製而不縮減功能

### T08 — 創作者其餘範本、工作區及原站相容（CS2）

**Files:** 修改 Journeys `CreatorWorkspace.tsx`、`CreatorMissionsWorkspace.tsx`、`CreatorCollaborationTasks.tsx`、`CreatorEarningsWorkspace.tsx`、`InboxWorkspace.tsx`、`lib/creators/collaboration.ts`；web `components/kinnso/GuideForm.tsx`、`StructuredGuideForm.tsx`、`pages/MyGuidesView.tsx`、`lib/guides/actions.ts`／`versions.ts`；新增 `lib/studio/creator-tasks.ts`、`tests/studio-creator-tasks.test.mjs`、`tests/e2e/studio-creator-workspace.spec.ts`；擴充 web `tests/guides/studio-guard.test.ts`。

**Interfaces:** `prepareCreatorTask(templateId, selectedTarget)` 只回 proposal／readiness／report；C2 讀 saved revision、C3 讀原 earnings/insights、C4 接原 submission/review、C5 接 T06–07。Web studio-bound guide 經原站 Auth 呼叫同一組已加 guard 的 RPC；不向 Journeys 借 cookie。依賴 T07。

- [ ] 寫 `c2_is_check_not_approval`、`c3_missing_signal_is_null`、`c4_requires_accepted_participant`、`c5_keeps_adopted_trip_copy`、`web_login_is_independent`；以實際原 contract 的拒絕碼／結果斷言。
- [ ] 將 C2–C5 接入範本卡；成效報告固定包含問題、平台、期間／as-of、分母、幣別、來源及缺口，不把 tracked 叫成 payout，不把未連接的社交成效填 0。
- [ ] 保留 onboarding、profile、handles/scan、合作申請／邀請／修訂／交付／收益／收件匣及原站 perks/tier 等入口；新 presentation 用卡片／進度，不替換原有審批或收益引擎。
- [ ] 為 web 綁定 guide 加 revision／UUID／逐項確認的相容 UI，使用 T06 同一準備與原 writer；保留不需此 metadata 的舊 guide 行為。若尚未完成，此項驗收保持 BLOCKED，不能以 T06 的暫時安全交接宣稱完整原站相容。
- [ ] 執行 `tests/studio-creator-tasks.test.mjs`、新 creator workspace e2e、web guard Vitest 與既有 creator collaboration/earnings 測試；T01 inventory 的全部 creator 入口逐條對照 PASS。

### T09 — 第一批受控驗收與交付判定（CS2）

**Files:** 新增 `docs/implementation/CONVERSATION_STUDIO_CREATOR_ACCEPTANCE.md`、`CONVERSATION_STUDIO_EVIDENCE.json`；使用 T01–08 測試及現有 `scripts/verify-test-target.mjs`，不改 allowlist 來掩蓋錯 target。

**Interfaces:** `acceptanceCase` 記 question、caseId、commit、artifact、environment/target、role、platform/version、time/timezone、expected/actual、status、source/evidence reference；狀態只用 PASS/FAIL/BLOCKED/NOT_RUN。依賴 T07–08、範圍相關 PD14–17 gate、有效權利與私人資料保留政策。

- [ ] 建立可核對的隔離 target／資料來源／角色矩陣；使用獲准測試帳號及自有內容，不沿用歷史 permission 或正式憑證。無隔離證據就停在 fixture／source-ready。
- [ ] 在獲准環境實際走完整 C1，另以乾淨 session 重開 brief/draft/public version；第二帳戶、失效 creator、Ops 不可越權。記錄真 RPC/receipt 及可公開 projection，證據檔不含敏感正文或 access-bearing URL。
- [ ] 執行 timeout、傳輸中斷、相同 UUID 重送、不同 payload 衝突、並行編輯、撤權、reload、舊分頁與跨 app 登入案例；保留原始失敗及修復後結果。
- [ ] 按第 8 節驗 desktop/mobile、真機及 AT；未測平台標 NOT_RUN，不能用 Chrome viewport 替代 Safari／實機。與本切片相關的 PD gate 逐一引用，不把無關 provider gate 誤算成已解決。
- [ ] 產出首批結論：`source-ready`、`isolated-accepted`、`hosted-accepted` 分開；只有所批准交付層的必需案例皆 PASS 才通過，否則列明 blocker/owner/重試條件。此紀錄不自動授權 CS6 rollout。

### T10 — 旅人規劃、採用與收藏（CS3）

**Files:** 修改 `apps/journeys/app/travel/TripWorkspace.tsx`、`GuideWorkspace.tsx`（內含 `BookmarkWorkspace`）、`Workbench.tsx`、`lib/trips/repository.ts`、`lib/bookmarks/repository.ts`；新增 `lib/studio/traveller-tasks.ts`、`tests/studio-traveller-tasks.test.mjs`、`tests/e2e/studio-traveller-flow.spec.ts`，不另建收藏系統。

**Interfaces:** `prepareTravellerTask(templateId, selectedTrip, sourceRefs)` 產生 T1/T2/T4 proposal；提交仍用原 `trips.apply`／`trips.adopt`／bookmark contract，未支援的分組先保存 private brief。依賴 CS2 及現有 trips/bookmarks gate。

- [ ] 寫 `adopt_pins_exact_guide_version`、`summary_guide_cannot_become_invented_stops`、`organize_does_not_fake_saved_groups`、`wrong_trip_owner_denied`；先跑失敗案例。
- [ ] 接 T1 規劃、T2 收藏 guide 採用、T4 收藏整理；日期／時區／衝突提示使用原 trip 合同，先預覽再採納，不用聊天文字直接覆寫 trip。
- [ ] 沿用原 revision/request UUID、作者 attribution、source version、草稿恢復與私人筆記；已採用副本不隨創作者新版本覆寫。
- [ ] 補來源 withdrawn、同 UUID 重試、跨 trip/actor、缺 capability 回原入口的案例；執行新 tests 與原 `guide-contract`／`guide-publication` integration。
- [ ] T01 的 explore/library/destinations/g/saved/bookmarks/trips/trip-planner 及別名全部可達，更新證據；來源／權利未取得的真 guide 不拿示例替代。

### T11 — 私人記錄、媒體、分享及撤回（CS3）

**Files:** 修改 `TripWorkspace.tsx`、`lib/media/service.ts`、`uploads.ts`、`lib/trips/sharing.ts`、`share-receipt-api.ts`；沿用 `app/api/media/*`、`app/api/shares/*`、`app/api/shared-media/[token]/[id]/route.ts`；新增 `lib/studio/trip-sharing.ts`、`tests/studio-trip-sharing.test.mjs`、`tests/e2e/studio-trip-sharing.spec.ts`。

**Interfaces:** `prepareTripShare(tripId, revision, selectedItemIds)` 回明確 public projection；T3/T5 只調用原分享／撤回／媒體 finalize，不另建 token 或公開 bucket。依賴 T10、原 media/sharing/shareRecovery gate。

- [ ] 寫 `private_note_excluded`、`private_media_requires_source_permission`、`upload_without_finalize_not_saved`、`revoked_share_no_longer_reads`；先證明拒絕與未知分支受測。
- [ ] 接 T5 筆記／照片與 T3 分享／撤回，逐項確認文字及媒體；新來源加入或 trip revision 改變會使舊分享確認失效。
- [ ] 沿用 durable share receipt、原 recovery 與 revoke；timeout 不發第二份 share。只有新公開投影可讀回才顯示分享完成；無復原配置時保留原 BLOCKED 狀態。
- [ ] 執行新 unit/e2e 及原 `u22-workflow-continuation.spec.ts`、`u23-share-receipt-recovery.spec.ts` 在它們指定環境的回歸；不要繞 keyring／target gate 令測試變綠。
- [ ] 以第二帳戶／第二裝置查私人來源與撤回結果；保留已採用私人副本的規則，不聲稱撤回會刪除所有外部副本。

### T12 — 商戶資料、查詢及活動素材（CS4）

**Files:** 修改 `MerchantWorkspace.tsx`、`MerchantOnboarding.tsx`、`MerchantProfile.tsx`、`MerchantTeamAccess.tsx`、`InboxWorkspace.tsx`；使用 `lib/merchants/access.ts`、`repository.ts`、`lib/collaboration/support-context.ts`、`support-drafts.ts`；新增 `lib/studio/merchant-tasks.ts`、`tests/studio-merchant-scope.test.mjs`、`tests/e2e/studio-merchant-flow.spec.ts`。

**Interfaces:** `prepareMerchantTask(templateId, companyId, selectedRefs)` 的 company scope 必須由 server 驗；M1 寫原 profile、M2 回原 support/case 草稿、M3 交原 campaign。依賴 CS2；可與已通過核心的 T10–11 獨立排程。

- [ ] 寫 `switch_company_clears_drafts_and_late_result`、`clerk_cannot_gain_marketing_permission`、`case_reply_stays_in_selected_case`、`company_owner_cannot_read_member_private_document`，先跑 FAIL。
- [ ] 接 M1 欄位差異、M2 查詢草稿、M3 素材 brief；既有 onboarding／team／branch／invitation recipient binding 保留。系統不因選擇公司或 M3 卡授予 marketing 權限。
- [ ] WhatsApp Business／Instagram 標為使用者確認現用的候選；CS5 未完成前不讀對話、不顯示已連接、不送出。站內草稿與外部訊息送達分開顯示。
- [ ] 使用原 writer 的 revision／receipt 合同；不具相同合同的 command 先補具名冪等／衝突測試，未通過前只提供草稿及原入口，不標成已接通寫入。
- [ ] 執行新 scope unit/e2e 與原 merchant team/invitation/profile/support 測試，owner/marketing/clerk/finance 撤 membership 案例全部受測，T01 商戶入口無缺項。

### T13 — 商戶合作、核銷、報表與原站（CS4）

**Files:** 修改 `MerchantCampaigns.tsx`、`MerchantInvitations.tsx`、`MerchantCreatorDiscovery.tsx`、`MerchantInsights.tsx`、`FinanceWorkspace.tsx`；使用 `lib/merchants/campaign-repository.ts`、`campaign-schedule.ts`、`insights-repository.ts`；web `components/kinnso/pages/MerchantProfileView.tsx`、`MerchantMissionsView.tsx`、`MerchantInsightsView.tsx` 與原 Server Actions；新增 `tests/studio-merchant-workflows.test.mjs`、`tests/e2e/studio-merchant-workflows.spec.ts`。

**Interfaces:** M4 的 proposal 送原 campaign publish/review；M5 讀原 insights/CSV；核銷／對帳仍走原合同。依賴 T12。

- [ ] 寫 `published_terms_are_not_overwritten`、`campaign_dates_use_existing_utc_validation`、`unknown_profit_remains_unknown`、`booking_payment_remain_disabled`；先跑 FAIL。
- [ ] 將合作 brief、milestone、日期／時區、修訂與發布摘要接原流程；creator submission→merchant/Ops review 不因聊天而跳過。
- [ ] 重製商戶報表呈現及原站對應入口，仍提供完整 CSV／細節；card 可揭示分母、coverage、as-of、幣別與來源，不用虛構零值填卡。
- [ ] 維持核銷、邀請、成員、branch、offers/experiences 等既有可用／不可用狀態；對帳入口保留，但不觸發 payment。分站切換清楚顯示需獨立登入。
- [ ] 執行新 unit/e2e 及原 campaign/insights/finance 回歸；逐條關閉 T01 相應 inventory 缺口，原站 action 的業務 owner 不搬到工作室。

### T14 — Ops、支援與營運（CS4）

**Files:** 修改 `OpsWorkspace.tsx`、`MerchantApplicationReview.tsx`、`MonitoringWorkspace.tsx`、`ReportWorkspace.tsx`、`InboxWorkspace.tsx`（內含 `SupportWorkspace`）；使用 `lib/ops/repository.ts`、`queue-filters.ts`、`reports.ts`、`lib/notifications/repository.ts`／`delivery.ts`；web `lib/admin/creators-actions.ts`、`merchants-actions.ts`、`merchant-applications-actions.ts` 保持原 owner；新增 `lib/studio/ops-tasks.ts`、`tests/studio-ops-tasks.test.mjs`、`tests/e2e/studio-ops-workflows.spec.ts`。

**Interfaces:** O1–O5 回 queue summary／anomaly brief／release checklist／case handoff／delivery timeline；具體 command 只在原 queue/assignment/support/notification 合同內執行。依賴 CS2，涉及商戶 workflow 的案例依賴 T13。

- [ ] 寫 `ops_does_not_inherit_personal_oauth`、`internal_reason_not_in_customer_reply`、`bulk_action_keeps_each_target_authorization`、`unknown_delivery_does_not_resend`；先跑 FAIL。
- [ ] 接 O1 queue filters/presets/assignment；O2/O4 只讀原 case/job/遮蔽 receipt；O3 產生 GO/NO_GO 建議，不變成部署或授權按鈕；O5 區分站內事件、provider ACK、recipient evidence。
- [ ] 所有原 moderation、review、reconciliation、reports、support、monitoring 直接可達；Ops 版減少裝飾，保留逐項決策、原因及審計紀錄。
- [ ] 補角色撤回、錯 case、錯 company、越權私人來源、逾時通知案例；新 unit/e2e 及原 notifications/support/ops tests PASS 才交付。
- [ ] 為每項新增 Ops 建議提供原物件連結與資料時間；不把事件已記錄當成已發送、已收妥、已恢復或正式 release 已完成。

### T15 — 已連接帳號、授權／撤銷與工具閘門（CS5 基礎）

**Files:** 新增 `20261031090200_add_studio_connections.sql`、`lib/studio/connections/registry.ts`、`policy.ts`、`vault.ts`、`sync.ts`、`app/workroom/ConnectionsPage.tsx`、`app/api/studio/connections/route.ts`、`[id]/revoke/route.ts`；新增 `tests/studio-connections.test.mjs`、`tests/integration/studio-connections.test.mjs`、`tests/e2e/studio-connections.spec.ts`。

**Interfaces:** `ConnectionSummary` 回 provider/account/scope/scopeVersion/status/lastSuccess/revokedAt，不回 token；`authorizeToolCall(context, connectionId, toolId, purpose)` 逐項驗 policy；`revokeConnection(id, envelope)` 先停本地新使用再處理 provider 撤銷。依賴 T03–04；真 OAuth 前須定案 retention/deletion/revocation policy、provider terms、測試帳號與成本。

- [ ] 寫 `unconfigured_provider_is_unavailable`、`account_owner_only`、`token_never_reaches_browser_or_model`、`revocation_invalidates_cached_derivatives_and_late_sync`，先用離線假 adapter 測 FAIL。
- [ ] 建 registry 的 server/tool allowlist、版本、最小讀取範圍與獨立 read/write capability；沿用 `capabilities(env)`，保留原 auth/catalog 特殊規則與 booking/payment 硬關閉。
- [ ] 建帳號卡：授權範圍、私人／指定公司、最後成功同步或「未同步」、錯誤／到期／撤銷、一鍵撤銷；未連接／未驗證不填 0；manual sources/templates 始終可用。
- [ ] 撤銷立即停讀取、排程及 tool 使用並限制 lineage 衍生內容；provider 撤銷未確認時顯示「本地已停用，外部撤銷待確認」，不假稱遠端 token 已失效。重連不自動恢復舊公開確認。
- [ ] 執行離線 unit/e2e、獲准 target integration；未有真 provider 證據仍標 unavailable。新 worker／排程如有需要另列審閱變更，不順手修改 scan/sync 部署。

### T16 — 逐一開放只讀來源（CS5-A／B／C）

**Files:** 新增 `lib/studio/connections/providers/firecrawl.ts`、`google-drive.ts`、`google-calendar.ts`、`gmail.ts`、`search-console.ts`、`instagram.ts`、`tiktok.ts`、`youtube.ts`、`telegram.ts`、`whatsapp-business.ts`；各 adapter 對應一個 `tests/studio-provider-<name>.test.mjs`；新增 `docs/implementation/CONVERSATION_STUDIO_PROVIDER_MATRIX.md`。

**Interfaces:** 每個 adapter 實作 `readSelected(context, connection, selection)` 回來源 reference、最小摘錄、時間、coverage/verification；不得把 provider 文字當 tool 指令。無資料回 null＋原因，只有經驗證的真零才回 0。依賴 T15；每個 provider 獨立批准及驗收，不以共用 SDK 已安裝視作完成。

| 波次 | 角色／provider | 選取範圍與門檻 |
|---|---|---|
| A | 內容層 Firecrawl；旅人／創作者 Drive | 一個明選公開 URL／一份明選文件；官方 API/MCP、terms、來源用途及 SSRF/redirect/private-network 防護；先使用者自有內容 |
| B | 旅人 Calendar、Gmail；創作者／商戶 Search Console；商戶 Calendar | 明確 calendar/time range／mail thread/date range／已驗自有 property/期間；Gmail 永久只讀，GSC 無權 property 必須拒絕 |
| C1 | 創作者 Instagram、TikTok、YouTube、Telegram | 自己帳號、明選內容／channel 與期間；逐項核實帳號資格、app review、scopes、API/MCP tool、費用與 rate limit |
| C2 | 商戶 WhatsApp Business、Instagram | 使用者確認的現用工具；仍需帳號／公司 binding、合法用途及工具能力核實；先一段指定對話或指定內容，不整批匯入聯絡人 |

- [ ] 為每個 provider 寫 `selection_bounds_reads`、`scope_denied_no_fallback_to_broader_scope`、`missing_data_is_not_zero`、`revoked_connection_discards_inflight_result`；先用離線 provider fixtures 驗錯誤語義。
- [ ] 實作前閱讀該 provider 當時的官方文件，將精確 scope/tool、版本、方案限制、條款引用與核實時間寫 matrix；若功能不可得標 BLOCKED，提供手動文件流程，不改成宣稱支援。
- [ ] 完成 A 的一個 adapter 後先驗它，再加入下一個；逐個處理 URL 注入、SSRF、分頁截斷、限流、到期、部分結果、成本上限與重試，不記敏感 payload。
- [ ] 用獲准測試帳號做所選讀取及撤銷實測；對外部撤權只能保證最近驗證與本地 enforcement，不聲稱和遠端 ACL 有跨服務原子交易。
- [ ] 按 provider 分別標 offline/authorized-read/revoke PASS 或 BLOCKED；只開有證據的 read capability，其餘保持 unavailable；完成報告列問題、平台、時間與來源。

### T17 — 外部寫入的完整預覽與獨立確認（CS5-D）

**Files:** 新增 `lib/studio/connections/write-intent.ts`、`app/workroom/ExternalActionPreview.tsx`、`app/api/studio/connections/actions/route.ts`、`tests/studio-external-write.test.mjs`；修改已獲准 provider adapter 的 write 子介面，無條件新增所有 write adapter 不在範圍。

**Interfaces:** `prepareExternalAction(context, connection, action)` 固定帳號、scope version、對象、完整正文／附件／日期時區、費用如有、digest；`executeConfirmedAction(intentId, confirmationHash, requestId)` 再驗內容及 scope。依賴對應 T16 provider 已驗收、額外 write scope 與使用者確認。

- [ ] 寫 `read_scope_cannot_publish`、`editing_invalidates_confirmation`、`gmail_send_is_never_registered`、`calendar_write_shows_exact_event`、`timeout_without_provider_idempotency_never_auto_resends`；先跑 FAIL。
- [ ] 為實際批准的 Calendar 變更、社交發佈、Telegram／WhatsApp／Instagram 發送呈現完整預覽；provider 的訊息 window/template/recipient 等條件以當時官方文件核實，不把本計劃當接口承諾。
- [ ] 未確認時最多保存 private draft；同一 request UUID 固定意圖。Provider 無冪等或可核對結果時，timeout 保持未知並轉人工核對，不自動再發一次。
- [ ] Receipt 區分本地接受、provider ACK、實際發布／收件結果；重新授權、換帳號、附件改變、source ACL 變化均使確認失效。
- [ ] 在明確獲准的測試範圍完成 read-only 拒絕、單次送出／修改、unknown、撤銷與私人資料公開檢查；沒有該授權只跑 mock 並保留 write unavailable。Booking/payment 不加入 registry。

### T18 — 可達性、性能與克制的進度提示（CS6 準備）

**Files:** 修改 `app/workroom/workroom.css` 及對應控制項；新增 `lib/studio/milestones.ts`、`tests/studio-milestones.test.mjs`、`tests/e2e/studio-accessibility.spec.ts`、`docs/implementation/CONVERSATION_STUDIO_DEVICE_PERFORMANCE.md`；使用 T01 全功能 inventory。

**Interfaces:** `deriveMilestones(verifiedDomainReceipts, ruleVersion)` 產生可查的非金錢進度；重複 actor＋action＋target version＋ruleVersion 不重複計算，無有效 receipt 無獎勵。依賴欲交付切片；基本 a11y 在 T02 起執行，不延後到本任務才處理。

- [ ] 寫 `chat_only_earns_no_verified_milestone`、`retry_has_one_milestone`、`reduced_motion_disables_completion_animation`；規則與證據 reference 對使用者可查，撤回／修正狀態不再呈現不實完成。
- [ ] 逐頁驗焦點順序、dialog focus/return、錯誤關聯、非色彩狀態、200% zoom、44px touch、16px input、320px reflow；主要流程不靠拖曳或 hover 才能完成。
- [ ] 記錄 desktop Chrome/Edge、實際 Android Chrome、iOS Safari、Windows NVDA 或 iOS VoiceOver 的版本、裝置與時間；未測平台保持 NOT_RUN，不把 axe 無報錯當全部 AT 通過。
- [ ] 以固定網路／裝置及同一資料集量首頁與 C1 路徑，記 route JS、LCP/INP/CLS 及操作等待時間；內部 gate 為新首頁不載入 private workspace/provider SDK、無新增未授權 API，代表情境至少 20 次 run 的 p95 較 T01 基線不得退步超過 10%，超標須先修復或明示批准例外。
- [ ] 跑新 e2e/milestone test、T01 路由回歸及實機／AT，保存原始測量與限制；完成提示不能因動畫播放就寫成已保存或已發布。

### T19 — 候選、來源封包、有限 rollout 與回退（CS6）

**Files:** 更新 `apps/journeys/scripts/source-manifest.json`，使用 `scripts/package-source.py`、`scripts/ci-evidence.mjs` 與現有 CI；新增 `docs/implementation/CONVERSATION_STUDIO_RELEASE_PACKET.md`、`CONVERSATION_STUDIO_ROLLBACK_RUNBOOK.md`，更新本輪 evidence ledger；部署設定變更只有在具體操作包獲批後另作變更。

**Interfaces:** release packet 綁 commit／artifact／source archive hash／環境與 backend identity／遷移集合／capability cohort／必需測試／owner／回退條件。依賴所開 scope 的 T09/T18 與所有適用 provider/PD gate；不必等未納入 scope 的 provider，但不能將其標完成。

- [ ] 跑所改 packages 的 typecheck/lint/test/build、整合與適用 parity；驗 corresponding source 含新增檔、正確 revision 及授權 notices。每個 CI 結果綁本候選，不沿用舊 head 綠燈。
- [ ] 對批准候選核對 hosted URL、artifact、backend、角色與 schema；重跑相關 C1/角色案例。Build ready、deployment ready、source archive checker 分別記錄，不當真 hosted／restore 證據。
- [ ] 演練只關新 `conversation`／`creatorBriefHandoff`／provider gates 及切回舊首頁入口；保留相容的 creator editor/guard adapter 與受限 request recovery。Studio-bound guide 不可退回沒有 guard 相容能力的舊 artifact；回退基線須預先證明能安全編輯既有與新綁定作品。不得為回退刪 source、brief、guide versions、私人筆記、receipts 或重設 DB。
- [ ] 先限內部獲准 creator cohort；每一擴批按錯誤、未知結果未解數、權限事件與操作支援觀察決定。任何跨 actor/company 洩漏或重複公開寫入立即停新 mutation gate；不能以預設成功 toast 掩蓋。
- [ ] 將具體可審閱的 rollout 操作包交使用者決定；**未批准前不部署、不啟用 capability、不建真連接**。回退到 last-good UI 亦須保留資料／SQL前向相容，DB recovery 走獨立演練與批准，不 blind downgrade。

## 7. 功能保留驗收對照

這是 T01 的路由族檢查基準；實際驗收以產出的逐條 inventory 為準。原本不可用的功能保留誠實狀態，不因重製「保留功能」而被啟用。

| 既有功能 | 新入口／範本 | 權威與保留驗收 | 任務 |
|---|---|---|---|
| 探索、library、目的地、公開 guide | 首頁三組入口下的探索／T1/T2 | 原 catalog/guide，作者、版本、canonical/source 不消失 | T01/02/10 |
| 收藏 | 我的行程→收藏／T4 | 原 bookmark owner、原 toggle 合同；不虛構分類保存 | T10 |
| trips／trip-planner／record、草稿恢復 | 我的行程／T1/T2/T5 | 原 trip revision、adopt、facts/progress、私人筆記不被新版 guide 覆蓋 | T10/11 |
| 私人媒體、share/revoke/recovery | 記錄／T3/T5 | 原 Storage/RLS/finalize/share receipt；每項公開預覽 | T11 |
| creator onboarding/profile/handles/scan | 創作→個人資料／原路由 | 原 active creator/scan readiness，不因範本建立角色 | T02/08 |
| guides/new/edit/adventures aliases | 創作→我的攻略／C1/C2/C5 | 原 drafts/creator_requests/guide_versions/publish/withdraw | T06–09 |
| missions/opportunities/outcomes | 創作→合作／C4 | 原申請／邀請／accepted participant／submission／修訂及審批歷史 | T08 |
| earnings、原站 perks/tier/offers | 創作→收益及原站功能／C3 | 原 ledger 定義及權限；不另增貨幣，不當作真金錢獎勵 | T08/18 |
| agent/studio/copilot 及原 chat log | 工作室→範本；所有功能→既有 agent | 保留四任務、budget、sources、人工採納；舊 log 不自動跨站匯入 | T05/08 |
| merchant 與 merchants/dashboard aliases | 商戶→公司工作區／M1–M5 | profile/team/branch/invitations/discovery/campaign/redemption/insights/CSV 原合同 | T12/13 |
| merchant/ops reconciliation | 商戶／Ops→對帳 | 原 finance 可見範圍；payment 仍關閉 | T13/14 |
| inbox/studio/inbox | 收件匣 | 原通知仍獨立；不是工作室 thread 或外部已送達 | T08/14 |
| ops queues/filter/presets/assignments/merchants | Ops 工作區／O1 | 原 Ops/對象權限、逐項決策、audit | T14 |
| support/reports/monitoring | 更多→支援／Ops／O2–O5 | 原 case scope、內外理由分開、unknown delivery 不自動重送 | T14 |
| 公開作者／文章／活動／商戶／法律支援入口 | 探索／所有功能／頁尾 | 46 項 public registry、原 canonical adapter、unknown 404、locale | T01/02/19 |
| workspace/admin/account/settings/Auth/recovery | 更多／帳戶／已連接帳號 | safe-next、PKCE/recovery、登出清 scope；workspace ≠ Ops 權限 | T01/02/15 |
| bookings/ticket-wallet/commerce retained pages | 所有功能→目前未提供 | 原 disabled 說明與返回；booking/payment 永不隨 connector 開啟 | T01/13/17 |
| demo/demo-lab | 更多→明示示範 | 與 connected mode 分開，不共用真保存狀態 | T01/02 |
| apps/web 原 creator/merchant/Ops | 對應原站入口 | 保留 Server Actions、原角色流程與分站登入；studio-bound guide 有 guard | T06/08/13/14 |
| scan/sync、db/honesty/parity、GPL/source | 原服務與來源頁 | 不擅改 worker/部署，唯一 migration history、來源封包與 notices | T01/19 |

## 8. 驗證命令、平台及證據層次

以下是**計劃執行命令**，本輪未執行。所有新增 test/config/script 要由所屬任務先建立。不要把整份命令表直接對未知環境跑一遍。

| 層 | 命令／方法 | 可證明／不能證明 |
|---|---|---|
| L1 純單元 | `pnpm --filter @kinnso/journeys exec node --experimental-strip-types --test tests/studio-command-state.test.mjs`；其他任務替換為其具名檔，多檔以明確路徑逐一列出，不依賴 shell glob | 轉移／映射／拒絕規則；不證明真 DB 或 provider |
| L2 Fixture browser | `pnpm --filter @kinnso/journeys exec playwright test --config playwright.studio.config.ts`；單一任務加其 spec 檔名 | DOM/互動/viewport/隔離 fake adapter；不證明持久化或真機 |
| L3 真隔離 Auth/DB | 批准並核實 target 後：`pnpm --filter @kinnso/journeys test:integration`；由現有 script load `.env.test` 並先 `verifyTestTarget()` | 真 RPC/RLS/receipt；若 target 未確認，BLOCKED，不去擴 allowlist 或改 shared project |
| L4 原 connected 回歸 | 僅在獲准隔離配置：`pnpm --filter @kinnso/journeys exec playwright test --config playwright.connected.config.ts`，依任務可篩原 specs | 既有路由/creator/agent/auth；config 的原 testMatch 不會自動涵蓋新 studio specs |
| Web | `pnpm --filter web exec vitest run tests/guides/studio-guard.test.ts`；再跑受影響的原 guides/mission/admin 測試；現有 package name 是 `web` | 原站 action/guard 相容；不證明分站真登入或正式寫入 |
| 靜態與來源 | `pnpm --filter @kinnso/journeys typecheck`、`pnpm --filter web typecheck`、`pnpm --filter @kinnso/journeys check:url-parity`、`pnpm source:pack`；受影響 package lint/test/build | 型別、parity、封包；build 不是資料保存、權利或 hosted 驗收 |
| L5 Hosted/裝置/AT | 明確獲准候選與非正式 target，依 T09/T18 問題清單手動＋受控 browser 檢查 | exact app/backend/revision 的 scope；新裝置或 provider 仍需各自證據 |
| L6 Provider | 每個 provider 獨立測試帳號／selection／scope／撤銷／write intent | 只涵蓋該次服務、帳號及 scope；不能泛稱全部 MCP 已接通 |

`playwright.studio.config.ts` 要明分 fixture 與獲准 connected 模式；connected 啟動前走現有 target verifier，不得將 route interception 的 PASS 寫成 integration。新增 helper 要拒絕外部 URL／正式 origin，不從環境自動取得 production credentials。測試 runner 支援的 glob 以已核對 Node 版本為準；個別案例優先指定精確檔名。

每次報告至少記：測試問題、caseId、實際操作、預期、實際、status、app/平台及版本、viewport或裝置、時間與時區、commit/artifact/target、role/company scope、引用檔案或遮蔽 receipt、未測限制。故障證據保留，修復結果另列；私人正文、郵件、token、access-bearing URL 不進公開報告。

原型的固定示例 PASS 不填進上述產品層級。若只有 L1/L2，結論寫「本機示例流程可操作，真保存未驗證」；若 L3 PASS、L5 BLOCKED，寫「隔離環境通過，hosted 交付未通過」。

## 9. 第一批審閱及執行門檻

本次可直接審閱的範圍是 **T01–T09**；其餘任務是完整重製的後續順序與合同。建議先批准該切片的本機程式工作，再另審具體 DB／隔離測試／hosted 操作包，不把「接受計劃」當成一次批准所有外部動作。

| 門檻 | 必需決策／材料 | 未滿足時可做的工作 |
|---|---|---|
| 實作開始 | 使用者確認計劃及 T01–T09 程式範圍；核對 checkout、既有 dirty files 與 branch/worktree | 目前只保留本計劃供審閱 |
| 首批 DB 測試 | 精確隔離 target、當前 schema、可執行 migration 集、測試帳號、recovery/容量與互斥檢查 | 純函式、fixture、SQL source review；不得 apply SQL 或借正式憑證 |
| 私人資料持久化 | 政策 owner 確認自有筆記/brief 的保留、刪除與 audit 最小資料；不得自行發明日數 | 使用合成測試資料，真私人內容驗收 BLOCKED |
| 第三方來源 | 所選來源/圖片的權利、用途及撤權處理可核實 | 用本人原創文字完成首批；第三方段落不得進公開投影 |
| Provider | 官方能力/條款/帳號/scope/費用/資料保留已核實，真連接另有批准 | adapter fixtures、未連接 UI、手動文件流程 |
| 有限開放 | T09/T18/T19 證據、相關 PD gates、操作包及 rollout 批准 | source-ready 或 isolated-accepted；不宣稱正式完成 |

未來執行建議按任務進行、逐任務檢查，再做整體審閱；涉及 RPC/RLS/lineage 的 T03/T06/T07 需獨立安全及相容性 review。使用者尚未選擇執行方式，也未授權現在開始實作。

## 10. 自我審閱與來源

本輪只做計劃的 source 核對與文件檢查；沒有重跑產品、資料庫、provider、hosted 或實機測試。

文件檢查紀錄：2026-10-31 05:43 HKT，Windows／PowerShell／本機 Python。檢查問題為「任務是否連續、連結與主要既有程式落點是否存在、是否誤標實作完成、是否改到 tracked 正式檔案」；T01–T19、95 個未勾選步驟、相對文件連結、核對的 owner 檔案及格式檢查通過，tracked diff 為空。此為計劃文件檢查，產品驗收仍全部待執行。

| 設計要求 | 計劃覆蓋 |
|---|---|
| 共用首頁、角色公平、訪客試問、原功能直達 | T01–02、T07、T01 inventory／第 7 節 |
| 每角色 4–6 範本及文件/權限/產物/存回位置 | 固定 5 張/角色；T02 templates 照 spec 第 5 節，T07/08/10–14 接原服務 |
| 獨立串→證據→另開 brief→保存 | T03–05，private metadata 與 lineage |
| 創作者先行，revision／UUID／來源檢查，無旁路 | T06–09；涵蓋 web direct writer、底層 RPC、交易內撤權與晚 ACK |
| 全角色及 apps/web/worker/授權來源保留 | T01、T08、T10–14、T19；不平行重建業務引擎 |
| 角色分層 MCP、實際商戶工具、可撤銷、預設只讀 | T15–17；provider matrix 逐個 gate；Gmail 無 send、booking/payment 關閉 |
| 私人來源、未知結果、權利未決、透明獎勵 | 第 4 節、T04–07、T11、T15–18、門檻表 |
| 手機桌面／實機AT、測試問題/平台/時間/來源 | T02/T09/T18、第 8 節；示例與產品證據不混用 |

自我審閱確認：五項 Review Focus 均有具名測試；prepare 的 metadata UUID 與原 writer domain UUID 分開；`DraftPayload` 只引用既有型別；私有 brief 保存與公開發布分開；保留政策及 provider 權利是明確未決 gate，沒有填入虛構「已完成」。所有新檔、SQL、capability 及測試仍是計劃，非已存在功能。

核對來源：

- 本計劃的 [設計規格](../specs/2026-10-31-kinnsoos-conversation-studio-design.md) 第 2–12 節：公開研究、逐版本 roadmap、20 範本、保留矩陣與原型界線。
- 根 `README.md`、`AGENTS.md` 及 journeys/web 的 AGENTS；未發現根 `ARCHITECTURE.md`，不引用不存在文件。
- `apps/journeys/app/[locale]/[[...route]]/page.tsx`、`app/travel/Workbench.tsx`、`ConnectedHome.tsx`、`routes.ts`、`app/integration/public-entry-registry.ts`：真首頁及路由責任。
- `apps/journeys/lib/auth/actor.ts`、`lib/contracts/capabilities.ts`、`app/agent/AgentWorkspace.tsx`、`lib/agent/policy.ts`：DB 角色、default unavailable、原四任務。
- `apps/journeys/app/travel/CreatorWorkspace.tsx`、`lib/creators/contracts.ts`、`editor-operations.ts`、creator guide PUT/publish POST：原 pending intent、revision、UUID 及發佈流程。
- `supabase/migrations/20261003193322_add_creator_workspace_commands.sql`、`20261008000000_allow_empty_creator_editing_drafts.sql`、`20261002122534_kinnso_guide_versions.sql`：原 writer、receipt、版本與來源採用／撤回；只核對 source，沒有查 live schema。
- `apps/web/lib/guides/actions.ts:updateGuideAction`、`lib/guides/versions.ts`、`lib/copilot/queries.ts`：原站直接更新與底層發布路徑、舊對話分組限制。
- 各角色 owner 檔及 `package.json`、`apps/journeys/playwright.connected.config.ts`、`playwright.config.ts`、`scripts/test-integration.mjs`、`verify-test-target.mjs`、`source-manifest.json`：工具／驗證及來源封包落點。
- `docs/implementation/KINNSO_PRODUCT_PHASE_2026-10-22.md`、`KINNSO_PRODUCT_TASKS_2026-10-22.csv`、`NEXT_PHASE_LEDGER.json`、`PILOT_RELEASE_DECISION_2026-10-22.md`、`PD16_PD17_A0_VALIDATION_2026-10-24.md`：原 PD/N 歷史、不同候選 CI 及未完成 hosted/recovery gate，原有狀態不由此計劃覆寫。

