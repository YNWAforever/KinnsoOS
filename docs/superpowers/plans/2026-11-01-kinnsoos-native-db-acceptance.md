# KinnsoOS 原生資料庫驗收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在另行獲准的隔離本機資料庫，證明原生商戶、配對與既有 studio／guide／trip／share 寫入具備 RLS、跨租戶隔離、同 UUID 冪等、交易回滾及撤權保護，並保留所有既有功能與 C／T／M 流程。

**Architecture:** 真正的本機 PostgreSQL／Auth／PostgREST 負責資料與身分；SME、owner proof 與來源觀察使用測試程序注入的示例供應器。測試直接使用現有原生 runtime、原 RPC 及原 domain transport，不在正式 app 加入開啟 capability 的測試環境變數。SQL、Auth／REST、應用 adapter、示例瀏覽器四層證據分開，成功不代表真實 MCP 或部署驗收。

**Tech Stack:** 倉庫鎖定的 Supabase CLI 2.107.0、PostgreSQL 17、本機 Docker、Node >=22.13.0（前次環境 24.18.0）、supabase-js 2.108.1、TypeScript 5.9.3、Node test runner、Playwright 1.58.2。CLI／映像的實際可用性待執行前核對，本輪未啟動它們。

**Spec:** 本次使用者要求；`docs/superpowers/specs/2026-10-31-kinnsoos-trip-offer-matching-phase-0-2-design.md`；`docs/implementation/DISCOVERY_NATIVE_COMPLETION_REVIEW.md`；`docs/implementation/DISCOVERY_NATIVE_COMPLETION_READER_MATRIX.md`；`docs/implementation/CONVERSATION_STUDIO_DB_ACCEPTANCE.md`。

**日期／狀態：** 2026-11-01，Asia/Hong_Kong。**審閱稿；本輪只有文件，以下全部實作與 DB 驗收均未執行。**

## Global Constraints

- 保留所有現有功能及 C1–C5／T1–T5／M1–M5；對話層不取代原權威業務畫面及交易。
- 只用示例資料，不使用正式環境憑證；不部署、不建立真實連接。
- 本輪不改程式、不啟動資料庫、不套用遷移、不執行 SQL、不重設 3499。
- 審閱本計劃或批准編寫測試，均不自行解除目前「不套用遷移」限制；真正的本機初始化／遷移／fixture 寫入須包含在後續明確授權內。
- `supabase/migrations` 是唯一遷移歷史；不跳過失敗檔、不改成功定義、不把舊共享／pilot 容器當作可丟棄目標。
- capability 預設不可用；booking 與 payment 保持關閉；兩個 app 各自驗證，沒有跨站 SSO。
- 寫入沿用 revision 與 request UUID；逾時／傳輸錯誤為結果未知，重查及重試使用相同 UUID、target、expectedRevision 與 payload。
- 第三方內容權利問題尚未解決，不可宣稱已完成；測試 registry 的示例核准只驗證機制。
- Journeys 保留 GPL-3.0 與來源標示；不 reset／clean／覆蓋既有未提交修改，不自動 commit／push。

## Review Focus

1. **連得到 localhost，但背後連到錯誤 DB 或舊容器**：建立 client 前核對 gateway→REST/Auth→DB、network、volume、來源及 run 身分；NA01。
2. **測試全被 GRANT 擋下，卻宣稱 RLS 成功**：每個拒絕案配正向控制，分開表權限、列政策、definer 授權與最終資料；NA04。
3. **同 UUID 已提交但 ACK 遺失、nonce 已消耗**：重查不可要求再取得一次性 proof，也不能新建 UUID；NA05。
4. **撤權與保存同時發生，混合 guide 採用後的自有站點被一起隱藏**：雙提交順序、第三讀者、逐來源／逐站點斷言；NA07／NA08。
5. **SQL 出錯已回滾，但收據、marker、binding 或引用狀態留下半份**：在真正寫入後注入故障，逐表比對，與網路遺失 ACK 分開；NA06。

---

## 1. 已核對的起點與尚未證明的事情

本輪唯讀核對 HEAD 為 `b6291cf40ae0849c5e9eeea6cbb1b725136b4f54`，既有未提交 C／T／M／L／N 候選保留。前次證據所列 2,101 個來源檔案指紋仍相同：`6b1336db5e1c6f703cb36cf83edac3a480afcae417294d400b739cdeb80e57e6`。這是來源一致性，不是重新執行測試。

目前共 **210 份 SQL**：198 份既有歷史、2 份 studio、2 份 discovery metadata／grants、8 份原生補充；最新為 `20261101100700_discovery_editor_lineage.sql`。本計劃不把「八份新檔」當作可脫離前序歷史獨立套用。

| 現況 | 對下一批的影響 |
|---|---|
| `tests/integration/discovery.test.mjs` 只有五個預設 SKIP 案例 | 要移植其五項斷言並新增本計劃矩陣，不能靠取消 SKIP 宣稱完整 |
| `scripts/verify-test-target.mjs` 只接受舊隔離 project／port；`local-fixtures.mjs` 在 import 時建立 clients | 新驗收入口先核對新 target，再建立 clients；不放寬舊 allowlist，不直接 import 舊 fixture |
| `scripts/gen-kinnso-local-types.mjs` 也鎖定舊目標並會寫 `packages/db/types.ts` | 新批次先產生測試專用 types，審閱差異後才考慮共享 types |
| `nativeDiscoveryRuntime` 可注入 providers；正式路由沒有配置 provider；capability 固定關閉 | 在測試程序注入示例服務；正式路由仍維持不可用 |
| `discoveryDomainTransport` 已包住原 writer，但 SQL 尚未執行 | 要證明原參數／UUID、一次交易、讀回、來源綁定與回滾，不能只驗函式存在 |
| 舊停用 runbook 仍描述全面禁止 licensed ingestion；後續 `100200` 已提供受 gate／permit 控制的實作 | 依使用者既定「逐版本證據及本次需求」原則採最新候選；NA09 更新 runbook，兩道 DB gate 預設仍 false，不需另開產品方向決策 |

前次 1,423 項 Node、82 項示例瀏覽器及型別／建置通過，僅作回歸基線。本輪沒有重跑，所有 DB、真正 provider、hosted 與實機接受測試仍為 NOT_RUN。

## 2. 依賴、隔離目標與證據邊界

| 依賴 | 具體約束／完成標準 | 未具備時 |
|---|---|---|
| 本批執行授權 | 一次列清新 project、run ID、工作目錄、來源／SQL manifest、建立本機 stack、初始化／遷移、示例帳號、故障注入及自有 fixture 清理範圍 | 僅能做文件／獲准的離線測試準備；DB NOT_RUN |
| 專用目標 | 建議 project `kinnsoos-native-acceptance-20261101`；API `127.0.0.1:60021`、DB `127.0.0.1:60022`、shadow `60020`；全屬提案，未探測／保留。名稱已存在或 port 被占用就 BLOCKED，不接管 | 提交具體替代 target；不轉用 root `kinnso-v3`、舊 58421／59521 或 3499 |
| Stack 與資源 | 在 `.local-private/native-acceptance/<runId>/stack` 產生獨立設定；固定 CLI 及 image digest、PG 17、loopback bindings、隔離 internal network；關閉外部郵件、analytics、provider、排程與 root seed。建議本批啟動前可用 RAM ≥4 GiB、Docker 資料磁碟 ≥10 GiB，這是新提案而非沿用舊授權 | 不自行下載／升級、不降低門檻、不刪其他容器／資料；記 BLOCKED |
| Migration 可重播 | 對完整 210 檔記錄順序及 SHA-256；先初始化空白專用 stack，核對身分後才允許業務 migration；逐檔 fail-fast | 記首個失敗版本及 SQLSTATE；不先跑後面八份或偽造 journal |
| 真實本機 Auth | 用本機 Auth 建立／登入示例帳號，取得真 session；SQL claims 取自該帳號的已發行 JWT，且 DB session 記錄存在 | 只設 `auth.uid()` 的測試不得算 Auth 驗收 |
| SME／proof | `NativeCommandProviders` 測試實作，使用本批臨時 key、確定的來源 hash／scope／nonce；限定記憶體內呼叫，沒有 HTTP provider | 官方 MCP、issuer／audience 與持久 epoch 仍 BLOCKED，並不阻擋驗證本機 SQL 機制 |
| 權利 | 由 fixture 管理端填入本批示例 rights registry，並做空 registry／用途缺失／撤回的拒絕測試 | 不能以商戶按確認或 fixture 核准聲稱真實第三方權利已解決 |

授權描述檔不得包含密碼／token；執行前仍需核對實際 container ID、network ID、volume ID、mount、gateway 路由、DB 主機與資料庫名稱。只依 URL 或 project 名稱不算隔離證據。CLI 若不能在獨立設定達成上述網路約束，先停在目標準備，不能為讓測試啟動而放寬它。

本批證據分層：

- **L0**：離線 runner／target guard／結果彙總單元測試。
- **L1**：真正 PostgreSQL 的政策、函式、鎖、回滾及資料讀回。
- **L2**：真正本機 Auth→PostgREST→原 RPC，以及注入示例 provider 的原生 adapter／原交易 transport。
- **L3**：現有 82 項 C／T／M／配對示例瀏覽器，以及實際 Next 未連接邊界；不算連接原生 DB 的 UI 驗收。
- **未涵蓋**：正式 Next 的原生功能啟用、真實 SME MCP、外部網站／社群／支付、hosted CDN／部署。即使 L1/L2 全過，也不自動清除 N02 或整體 N04 的門檻。

## 3. 檔案與介面配置

本節都是後續落點，**本輪沒有建立下列程式**。測試工具集中在 `apps/journeys/tests/native-db/`，不更改 root `supabase/config.toml` 或正式部署設定。

| 落點 | 責任 |
|---|---|
| `apps/journeys/scripts/native-db-acceptance.mjs` | 明確分離 `--plan`、`--preflight`、`--provision`、`--migrate`、`--run`、`--cleanup-owned`；run 不自動初始化或遷移；沒有完整授權返回 BLOCKED |
| `tests/native-db/target.mjs`、`target.test.mjs`、`stack.config.json` | 純 manifest 檢查、Docker／port／路由／資源核對、獨立 stack 設定；plan 模式不讀 credential、不連 DB |
| `tests/native-db/migrations.mjs`、`schema.test.mjs`、`sql/catalog.sql` | 完整重播、journal／hash、角色 grants／RLS／trigger／函式簽名清單；catalog SQL 唯讀 |
| `tests/native-db/fixtures.mjs`、`provider.mjs`、`effects.mjs` | 本批 Auth 帳號、company／location、來源與用途；示例 verifier；獨立管理端觀察最終資料，不用管理端執行被測行為 |
| `tests/native-db/sessions.mjs`、`sessions.test.mjs` | 兩個長連線與第三讀者、同步屏障、鎖觀察與期限；SQL 客戶端只使用固定範本／綁定資料 |
| `tests/native-db/commands.test.mjs`、`rls-tenancy.test.mjs` | 原生 16 命令及權限／範圍矩陣 |
| `tests/native-db/idempotency.test.mjs`、`rollback.test.mjs`、`sql/faults.sql` | 同 UUID、CAS、結果未知；專用 test schema 的故障 trigger；不加入正式 migration |
| `tests/native-db/revocation.test.mjs`、`original-writers.test.mjs`、`readers.test.mjs` | 撤權交錯、完整既有交易、公開／私人讀取及舊收據保護 |
| `tests/native-db/results.mjs`、`results.test.mjs`、`cases.json` | 固定 case ID、每案依賴與預期結果、缺案／SKIP／失敗皆不能產生整批 PASS |
| `tests/native-db/generated/database.types.ts`、`type-contract.ts`、`tsconfig.json` | 從獲准 schema 產生測試用 types，編譯核對 RPC 名稱、參數、overload；不直接覆寫共享 types |
| `apps/journeys/lib/discovery/native-runtime.ts`（條件式小幅抽取） | 如 Node harness 無法直接載入含 Next request imports 的 `server.ts`，只把既有 `nativeDiscoveryRuntime(rpc,actorId,providers?)` 原封抽到純 module；`server.ts` 保留原出口及呼叫，不能改 gate |
| `docs/implementation/DISCOVERY_NATIVE_DB_ACCEPTANCE.md`、`..._EVIDENCE.json`、`evidence/discovery-native-db/<runId>/` | 結果、來源、schema、case 紀錄、已驗證與阻擋項 |
| `docs/operations/DISCOVERY_NATIVE_DISABLE_RECOVERY.md` | 更新逐版本狀態及本機停用／恢復證據；不加入真部署操作 |

所有 `tests/...` 縮寫均相對 `apps/journeys/`。既有產品修正只限實測證明的缺陷：`lib/discovery/{native,native-authority,native-command-service,domain-transport}.ts`、`lib/integrations/smeassistant/native-bridge.ts` 及新 append-only SQL；不因測試方便重寫原 guide／trip／merchant 工作流。若需修補 SQL，由當時已核對的 CLI 建立下一個 migration 檔名，不能覆寫已重播版本或在測試中偷偷 monkey-patch 後宣稱產品通過。

共用介面約定：

```ts
type Stage = 'plan'|'preflight'|'provision'|'migrate'|'run'|'cleanup-owned';
type CaseStatus = 'PASS'|'FAIL'|'BLOCKED'|'NOT_RUN'|'SKIP';
type ActorName = 'travellerA'|'travellerB'|'creatorA'|'creatorB'|'merchantA'|'merchantB'|'memberA'|'ops';
type VerifiedTarget = Readonly<{runId:string; project:string; apiOrigin:string;
  dbContainerId:string; networkId:string; volumeId:string; sourceHash:string; migrationHash:string}>;
// 只由核對模組建立 VerifiedTarget；在建立任何 SDK／SQL client 前完成。
validatePlan(manifest: unknown): Plan;
attestTarget(plan: Plan, stage: Stage): Promise<VerifiedTarget>;
replayMigrations(target: VerifiedTarget, manifest: MigrationManifest): Promise<SchemaReceipt>;
createFixture(target: VerifiedTarget, caseId: string): Promise<Fixture>;
openActorSession(target: VerifiedTarget, actor: Actor): Promise<ActorSession>;
observeEffects(fixture: Fixture, resourceIds: string[]): Promise<EffectsSnapshot>;
summarizeCases(manifest: CaseManifest, results: CaseResult[]): BatchResult;
```

`Plan` 包含 run/project/ports、有效期限、允許 Stage、來源與 migration hashes、資源門檻及 scope；`SchemaReceipt` 包含 ordered journal、schema hash、PG/CLI/image 版本；`Fixture` 提供 `actor(name)`、`seedScenario(name)`、`setGates(privateWrites,licensedWrites)`、`provider`、`cleanupOwned()`。`ActorSession` 提供 `begin(isolation)`、`rpc(name,args)`、`pid()`、`commit()`、`rollback()`、`close()`。effects 只觀察本案 UUID；CaseResult 記 expected/actual、狀態、時間、SQLSTATE、來源指紋及 sanitized counts/hashes。

SQL 並發連線優先使用已固定 DB image 內的 `psql -X`，由 Node 長存子程序控制，避免為本批新增另一套連線庫。建立本批專用 `NOSUPERUSER NOBYPASSRLS` login，只有所需 `authenticated` 角色切換權；每個交易核對有效角色、session 與 claims。管理端只做 fixture／catalog／鎖與效果觀察。REST 正向與負向案必須另外以一般 anon key＋使用者 JWT 執行，不能拿管理端 SQL 模擬代替。

## 4. 任務順序、依賴與完成標準

| 任務 | 依賴 | 可獨立審閱的交付 |
|---|---|---|
| NA01 目標與執行器 | 本計劃；執行 DB 前需明確授權 | 錯目標／來源／權限時零 client、零寫入；自有 stack 可核對 |
| NA02 遷移、catalog、型別 | NA01 | 全歷史可重播，實際 grants／RLS／函式與候選一致 |
| NA03 身分、示例供應器與命令基線 | NA02 | 正向原生保存與讀回、三種 gate 狀態、authority 驗證 |
| NA04 RLS 與跨租戶 | NA03 | 各角色／入口可見範圍、跨公司／跨 location／跨 thread 拒絕 |
| NA05 同 UUID、並發與恢復 | NA04 | 真的重疊交易只寫一次，衝突不覆寫，遺失 ACK 可恢復 |
| NA06 原交易回滾 | NA03、NA05 | 寫入後故障不留下任何半份 domain／binding／receipt |
| NA07 撤權與公開讀取 | NA04–NA06 | 兩種先後次序成立，所有 reader 舊快取／舊版本受保護 |
| NA08 完整原生業務鏈與相容 | NA07 | 商戶→配對→C1→原 guide→T 採用／分享／撤回，混合自有內容保留 |
| NA09 回歸、停用、證據與交付 | NA01–NA08 | case 清冊全數對帳、C／T／M 保留、只清本批資源、仍阻擋項明列 |

### NA01 — 目標識別及不會自動執行的 runner

**Files:** `native-db-acceptance.mjs`；`target.mjs`／`target.test.mjs`／`stack.config.json`；`results.mjs` 的 BLOCKED 基本輸出。

**Interfaces:** 產生 `validatePlan`、`attestTarget`；後續只接受本次實際核對的 `VerifiedTarget`，不用舊 helper 的 project allowlist。

- [ ] 先寫離線失敗測試：`noApprovalCreatesNoClient`、`foreignGatewayRejected`、`reusedVolumeRejected`、`sourceDriftRejected`、`port3499Rejected`、`runCannotProvisionOrMigrate`；為 process／fetch 注入 spy，預期零副作用。
- [ ] 用 `node --test tests/native-db/target.test.mjs` 確認缺實作時失敗，再完成各 stage 的封閉預設及 sanitized exit 78。
- [ ] 加入實際 container／network／mount／port／gateway／上游核對與 manifest freshness；不列印 Docker env 或完整 connection string。
- [ ] 僅在獲准後建立本批 stack；bootstrap 不載入倉庫 seed 或業務 migration，初始化後重新 attest 才可到 NA02。離線測試全過，錯目標與缺授權案均為 BLOCKED 才算本任務通過。

### NA02 — 真正 schema 與權限基線

**Files:** `migrations.mjs`、`schema.test.mjs`、`sql/catalog.sql`、測試專用 generated types／type contract；比對 210 個 `supabase/migrations/*.sql` 及 `scripts/prepare-discovery-native-guards.py` 的輸出。

**Interfaces:** `replayMigrations` 產生 `SchemaReceipt`；NA03 的 fixture 必須核對它和本次 migration manifest 一致。

- [ ] 先測 `missingOrChangedMigrationBlocksReplay`、`firstSqlFailureStopsLaterFiles`、`typesDoNotWriteSharedPackage`，注入假執行器驗證 fail-fast。
- [ ] 獲准後在專用空白 DB 按完整順序重播，禁止 continue-on-error；記原始版本、檔案 hash、SQLSTATE 與成功 journal，不能只有最後 migration 的 success。
- [ ] 真 DB 查 `pg_class`／`pg_policy`／`pg_proc`／`pg_trigger`／ACL；核對 internal schema 不暴露、函式四／五參數 overload、所有 public definer 的 role／session／scope guard、禁止的 EXECUTE、最新 Creator 360 `is_listed` 及原角色判斷。
- [ ] 核對初始兩道 discovery DB gate=false、key／rights registry 空、原 owned guide／trip 功能可用；CLI 對新表預設 GRANT 的版本差異不可替代實際 ACL 查詢。
- [ ] 產生 test-only DB types，執行 `tsc --noEmit -p tests/native-db/tsconfig.json`；RPC 型別不匹配為 FAIL，不以 `any` 消除。首個重播故障先修候選並重新凍結 manifest；此前 NA03–NA09 為 BLOCKED。

### NA03 — 真 Auth、示例來源與原生命令正向控制

**Files:** `fixtures.mjs`、`provider.mjs`、`effects.mjs`、`commands.test.mjs`；必要時抽出 `lib/discovery/native-runtime.ts`，不變更正式 gate。

**Interfaces:** `createFixture`；`provider` 實作既有 `NativeCommandProviders`，`nativeDiscoveryRuntime(rpc,actorId,provider)` 接一般使用者 client；來源字串帶 case ID，方便查出洩漏與殘留。

- [ ] 建立兩位旅人、兩位 active creator、A/B 商戶 owner、A 的非 owner member、具既有 DB 權限的 Ops；另建立失效 creator、匿名登入、過期／已撤銷 session 案。A 有 A1/A2 店舖，B 有 B1；fixture 對 Ops 的安排遵循實際 role schema，名稱本身不授權。
- [ ] 先寫 `closedGatesDoNotWrite`、`validAuthorityCommitsOneReceipt`、`browserFactsCannotAuthorize`：空 key／rights、錯 actor／digest／scope／nonce、60 秒過期 proof 必須拒絕且 effects 不變。
- [ ] 逐一驗證三種 DB gate 組合：false/false、true/false、true/true；只由 fixture 管理端更改這個獨立 DB。正式 app capability、SME `/api/mcp` 及 booking/payment 仍關閉。
- [ ] 走 5 個私人命令與 11 個商戶／配對命令，成功後由另一使用者連線讀回適當投影、由觀察者核對一次 effect／receipt；SQL 與 TS command digest 相同。
- [ ] 正向匯入可以讀示例 `sme_offer_evidence_v1`；配對與保存重驗只能呼叫 `sme_validate_offer_refs_v1`。未知／未驗證不變零，match 儲存 references，不儲存整份上游正文或把私人 trip intent 傳給供應器。

私人 5 命令：`savePreferences`、`clearPreferences`、`saveIntent`、`archiveIntent`、`deleteIntent`。其餘 11 命令：`beginLink`、`confirmLink`、`revokeLink`、`importOffer`、`preparePublication`、`grantContentUse`、`revokeContentUse`、`publishOffer`、`withdrawOffer`、`recordMatch`、`chooseOffer`。

### NA04 — RLS、跨租戶及角色退權

**Files:** `rls-tenancy.test.mjs`、`readers.test.mjs`；實際落點 `20261101090000`／`090100`、`100100`／`100300`／`100400`／`100500` 的政策、reader、context、definer。

**Interfaces:** 使用 NA03 fixture 與 effects；產生角色×資源×操作×入口的 case 清單，NA09 必須逐一對帳。

- [ ] 先列每個受測表／RPC 的正向與負向預期，再寫測試。新 discovery 表可能完全禁止 direct REST，這是 GRANT 層驗收；原 guide／trip 的 row policies 另以允許入口驗證，不能統稱「RLS PASS」。
- [ ] 以 anon、A、B、同公司非 owner、Ops、失效／撤銷 session 驗 direct SELECT/INSERT/UPDATE/DELETE、正式 public RPC、內部函式可呼叫性及 receipt。檢查錯誤／空結果、實際 row count 與本文 sentinel，HTTP 200 或有 error 任一單獨都不夠。
- [ ] 替換 company/link/import/publication/grant/match/thread/source/guide/trip/request UUID；測同公司越 location、跨公司、跨 owner、跨 thread，偽造 `owner_actor_id`／role／user metadata。公開可讀資料與私人 intent／來源明確分開。
- [ ] Ops 只獲既有審核能力，不能藉首頁角色或知悉 UUID 操作他人私人 intent；原允許的 Ops 入口也要有成功案，避免「全部拒絕」假通過。
- [ ] 本地 Auth session 撤銷／`not_after` 到期後，已發行 JWT 對敏感 RPC 與舊 receipt 不可再讀私人正文。直接 SQL 每案核對 effective role 非 superuser／BYPASSRLS；真正 REST 使用一般使用者憑證。

**完成標準：** 允許案可讀回自己的有效成果；拒絕案無跨租戶 rows／正文／可用 receipt，不更改他人 revision；context 也不洩漏他人 link／來源。`publicOffers` 目前雖以 public 命名，RPC 仍要求 authenticated；本批不自行增加匿名權限。既有公開 guide／目錄／share 的匿名可讀案保留。

### NA05 — 同 UUID 並發、版本衝突與結果未知

**Files:** `sessions.mjs`／`sessions.test.mjs`、`idempotency.test.mjs`；原生 request tables、`native.ts` 收據恢復、原 guide／trip／share writers。

**Interfaces:** `openActorSession` 及 third observer；屏障記錄 backend PID、開始／鎖等待／commit／rollback 時間，不用 `Promise.all` 或固定 sleep 本身當作重疊證據。

- [ ] 先以離線 fake session 驗證 barrier 超時會中止並回收連線；設定每個 barrier ≤5 秒、statement ≤15 秒，workers=1，案例內才開 2–3 個連線。
- [ ] 對 16 個 discovery 命令、六個原交易入口及 `ingest_kinnso_matched_source`，準備各自合法前態；兩連線以同 actor／UUID／payload 重疊呼叫，兩次收據相同，resource／版本／domain side effect 只增加一次。
- [ ] 同 actor／UUID 不同 payload 或 target：只一個合法結果，另一個為衝突，原收據及資料不被覆寫。同 UUID 不同 actor 不能讀到對方收據或造成無關自有請求被封鎖。
- [ ] 不同 UUID、相同 expectedRevision：恰一個提交，另一個 conflict；另保留「99 個 active intents＋兩個同時建立，最多 100」與刪除 tombstone 防重建。
- [ ] 注入「提交成功後丟棄 ACK／第一次收據也失聯」與「POST 根本未送達」兩類故障；重開 client 後保留原 UUID／payload 重查。`confirmLink` 已消耗 nonce 的情況仍恢復 minimal receipt；grant／account 已撤銷則不帶回舊正文。
- [ ] 關鍵重疊案固定資料重跑 10 輪，兩種先後次序都有；有一次無法證明重疊、未處理 deadlock、timeout 或不確定副作用，該案不能 PASS。

**完成標準：** 已提交成功不是只靠 toast／HTTP 200；由新連線核對 receipt 與 business effects。一份原生請求的 effect 是恰一次，失敗不因換 UUID 被偽裝成新成功。

### NA06 — 原交易原子性與故障後回滾

**Files:** `rollback.test.mjs`、`sql/faults.sql`、`effects.mjs`；候選 `100200`／`100500`／`100600`／`100700` 及原 writer。

**Interfaces:** 在本批專用 test schema 安裝只匹配 fixture UUID 的故障 trigger；僅管理端可建立／移除，從不放進 `supabase/migrations` 或暴露 HTTP 開關。

- [ ] 每個案例先記 effects snapshot，再在一次原 RPC 的真實中後段引發 SQL exception；不能只以無效輸入在第一行失敗代替 rollback。
- [ ] 故障位置涵蓋：confirmLink 的 nonce／used proof／receipt；import／publication 及 receipt；matched source／provenance／ingest permit；brief／evidence links；guide draft／handoff／marker；guide version／bindings；adopt day／stop／trip revision；share projection／bindings／receipt。
- [ ] 第三連線確認失敗後各表資料及 revision 與基線相同，無 orphan binding、消耗的 nonce/proof、殘留 permit、完成 receipt 或公開資料；source check 的同交易更新也回滾。
- [ ] 移除該故障後，以同一原始 UUID 重試，恰一次成功。另跑成功控制，確定故障沒有讓整個系統永久拒絕。
- [ ] 區分 SQL rollback 與提交後連線遺失：後者可有一次已提交 effect，必須由 NA05 核對；不要求 PostgreSQL sequence 數值回退，要求業務 rows／revision／收據正確。

**完成標準：** 每個位置至少一個「已寫入部分資料後失敗」與一個成功控制；所有 case-owned triggers 清理後 catalog hash 回到純產品 schema。清理失敗則隔離保留本批 target 並 BLOCKED，不刪其他資源，也不繼續出具乾淨 PASS。

### NA07 — 撤權、過時來源及所有 reader

**Files:** `revocation.test.mjs`、`readers.test.mjs`、`sessions.mjs`；`native-authority.ts`／`native-bridge.ts`、`100000`–`100700`；既有 reader inventory 中的 Web／Journeys 入口。

**Interfaces:** NA03 provider 可確定地回 current／changed／expired／unavailable／scope changed；SQL 本地 grant 撤銷由另一真連線執行；兩者證據分開。

- [ ] 六用途逐項測 `catalog`、`matching`、`private_brief`、`public_guide`、`trip_adoption`、`trip_share`；撤一用途不得被另一用途的有效 grant 補權，重授新 grant/version 不能復活舊 pinned 引用。
- [ ] grant revoked／expired、publication withdrawn／新版內容、link revoked／scopeVersion 或 location 改變、rights basis 撤銷、source hash／revision 不符、讀取同意撤回，逐項阻止新受影響寫入與舊內容投影。
- [ ] DB 過期案使用伺服器時間與明顯超過／低於 60 秒的邊界，記錄測量窗口；精確 59,999／60,000 ms 邊界留在注入 clock 的單元測試，不能為省等待修改資料庫時鐘或增加正式 clock override。
- [ ] 編輯超過來源有效期後，原保存／發佈／採用／分享使用 reference-only refresh：核對 actor／scope 前後一致、同 UUID／原參數、一個 bound write transaction。缺 provider、scope 在等待中改變、過大／重複 ref、慢回應都不能簽署或提交。
- [ ] 真兩連線交錯 revoke 與 save／publish／adopt／share：撤權先提交則寫入拒絕；寫入先取得必要鎖且合法提交則可以成功，但撤權提交後新讀者不能讀受影響的舊 licensed 文字。每案用第三個新交易讀取；較高隔離等級的舊 snapshot 不能當「撤權後新讀者」。
- [ ] 逐入口查 guide／版本 raw rows、catalog／listing／creator definer、studio source／brief／handoff／draft、trip／agent／media／export 投影、公開 share、舊 command result／share receipt；加入有權正向控制，搜尋本案獨有 licensed sentinel 是否外洩。
- [ ] 明確區分公開 guide 與私人採用投影：若 `root_metadata` 依賴已撤權來源，公開 guide 可按既定候選整體隱藏；私人行程的無關自有 stop／note 不可因此被隱藏，不能把兩種不同預期混算。
- [ ] Web 公開 transport、OG、sitemap 的 cache 契約用資料庫前後撤權讀回配合現有 no-store 單元測試；未跑到實際 Web HTTP／CDN 的層次明列 NOT_RUN，不用 SQL 成功宣稱它們全部驗收。

**完成標準：** 本地撤權的兩個提交順序均符合授權結果，不能默默接受 deadlock 當通過；若設計明示允許 `55P03`／`40001`，須在 case catalog 預先列出、驗證零部分 effect 及同 UUID 恢復。先以實際 PostgREST 的隔離等級驗收，直接可用的 REPEATABLE READ／SERIALIZABLE 另列子案。外部 60 秒觀察不等於跨資料庫即時原子撤銷，也不能收回已下載副本。

### NA08 — 原生完整鏈與自有內容保留

**Files:** `original-writers.test.mjs`；既有 `native.ts`／`domain-transport.ts`、`lib/creators/contracts.ts`、`editor-operations.ts`；原 studio、guide、adopt、share SQL。

**Interfaces:** 使用 NA03 的使用者 clients、provider 及 NA05 的 effects／收據觀察；不以管理端直接 insert 模擬成功的業務成果。

- [ ] 用真正本機 Auth／RPC 跑：商戶 A 連結核對→匯入→展示預覽→示例用途核准→發佈→旅人／創作者私人意向→配對收藏→本人 studio source→C1 brief→原 save draft→原 publish→T 採用→原 share→撤回。
- [ ] 每個保存點讀回 UUID／revision／內容與 lineage；原採用及分享紀錄由原 writer 產生；舊 C1 自有來源完成同一條鏈而不需要 discovery provider。
- [ ] 建立 licensed A、licensed B、自有 stop 混合 guide；移動日／站點、更改自有標題、保存、再發佈、採用。撤 A 後，私人採用行程中的 B／自有 stop／私人筆記仍保留；只分享自有 stop 不需要 A 的 `trip_share` 權限。公開 guide 的根資料限制另按 NA07 判定。
- [ ] 同來源多站點、跨日、兩個採用版本、brief v1 與更新 head v2 分別核對；舊 request replay 不能覆蓋新 draft marker map。marker 刪除／重複／挪用 foreign block 必須拒絕；目前移除 licensed block 仍須新 brief／guide，不在本批擴展產品功能。
- [ ] 測原 guide delete→tombstone→同 ID 重建的雙連線案；原自有 bookmark／分享撤回／編輯流程仍可用，不能因新增 restrictive policies 全部消失。

**完成標準：** 真資料庫內完整結果及同交易 lineage 一致，跨 actor 仍拒絕；各步沒有第二個 HTTP 補寫 binding。這是本機 native DB＋示例 provider 的接受測試，不是已啟用的正式 Next／真 MCP 用戶旅程。

### NA09 — 回歸、停用與可審閱證據

**Files:** `results.mjs`／`results.test.mjs`／`cases.json`；`docs/implementation/DISCOVERY_NATIVE_DB_ACCEPTANCE.md`／`..._EVIDENCE.json`；停用 runbook；必要時更新兩份 GPL source manifest／archive。

**Interfaces:** `summarizeCases` 對每個 manifest case ID 及參數展開項只接受一個終態；缺案、重複 ID、unexpected skip、零執行或 cleanup 失敗不能給整批 PASS。

- [ ] 先寫 `zeroCasesCannotPass`、`missingCaseFails`、`skippedCaseStaysNotRun`、`mockCannotSatisfyDbCase`、`cleanupFailureBlocksComplete`；離線測試後才接真結果。
- [ ] 回歸 Journeys 全量 Node、Journeys/Web 型別、必要建置、SME 主程式及四套件型別、14+49 SME 測試及兩端契約；核對原功能覆蓋數不減少，前次 PASS 不代替本批最終結果。
- [ ] 在獨立測試 ports 跑既有 C1 12、C2–C5 14、T 22、M 25、配對 9 案及 Next 未連接邊界；3499 的程序與進度不被 reset。Windows symlink SKIP 原因分列，DB 必要案例不能 SKIP 後仍宣稱整批通過。
- [ ] 本批 DB gate 關閉後：新寫入拒絕、已登入本人仍可核對最小收據、原自有 C／T／M 資料保留。重新開啟只在同一獲准測試目標、有效來源重新核對後測；不 rollback schema、不刪原成果。
- [ ] 保留 30／90 日人工 retention 為獨立子案：仍被 saved choice／match／trip／source 引用者保留，刪除者留 tombstone／收據且不可復活；不建排程。失敗保留其它案例的獨立結果，但阻止本批整體 PASS，更不能把整體 N04 標完成。
- [ ] 清理只按本批 run ledger 的確切 actor／resource／test role／trigger；沒有授權刪 volume 就保留已停用目標。保留初次失敗、修正 hash、重跑結果，不覆寫舊證據。
- [ ] 做一次最終整體唯讀審閱；修正發現的實際問題後重跑受影響案例。更新 runbook 的舊版本描述及明確未通過 gate；不安排自動部署或真連接。

## 5. Case 清冊必須覆蓋的範圍

實作時 `cases.json` 必須固定以下群組及參數展開；測試數是清冊的結果，不能先填預計 PASS 數。

| 群組 | 必須有的案例／讀回 | 所屬任務 |
|---|---|---|
| TARGET | 缺授權、來源漂移、舊 volume、別的 upstream、跨目錄、port 3499、資源不足；零 client／零寫入 | NA01 |
| SCHEMA | 210 檔順序／hash、首錯即停、最新函式 body、ACL／RLS／trigger、兩 gate 關、空 key／rights、實際 types | NA02 |
| CMD | 16 命令正向控制、錯 proof／scope／hash／nonce、三 gate 組合、伺服器資料不可由 browser 覆寫 | NA03 |
| ACL | 表級 GRANT、row policy、definer、內部 schema、session 撤銷、Ops／非 owner／匿名登入 | NA04 |
| TENANT | A↔B actor/company/location/thread、foreign target/source/receipt、偽造 role、公開與私人邊界 | NA04 |
| UUID | 同 payload 重疊一次提交、不同 payload 衝突、跨 actor 同 UUID、CAS、100 意向上限、刪除 tombstone、lost ACK | NA05 |
| ATOMIC | import／provenance／brief／guide／adopt／share 逐階段故障；effect、revision、permit、marker、receipt 完全對帳 | NA06 |
| REVOKE | 六用途、兩提交順序、link/scope/rights/source 失效、過期、重授不可復活、60 秒後原 writer 重驗 | NA07 |
| READ | 原 reader inventory 全列、definer／raw rows／舊版本／舊收據／公開分享、cache 層次明確 | NA07 |
| FLOW | 商戶→配對→C1→guide→T採用／分享／撤回；混合 source、自有 stop、marker 及 guide 刪除重建 | NA08 |
| KEEP | 既有五個 DB 案斷言覆蓋映射、82 個示例瀏覽器、原 API 不可用邊界、全量單元／型別、GPL | NA09 |
| DISABLE | 停用／本人 minimal receipt、同目標恢復、retention 引用、cleanup ownership、無外發及無秘密記錄 | NA09 |

## 6. 統一判定及證據格式

每案記錄：使用者問題／風險、case ID、角色、實際入口、expected／actual、平台及 UTC＋HKT、product HEAD＋未提交來源 hash、SQL ordered manifest、schema fingerprint、CLI/PG/image 版本、run／target 身分、隔離等級、SQLSTATE、交易時間線、前後 row counts／revision／內容 hash，以及引用的程式／migration。不得寫出 password、JWT、cookie、完整授權 proof／key、完整私人文件或帶存取能力的 share token／URL。

- **PASS**：該層實際執行、正負控制及資料讀回符合；必要的重疊已被觀察。
- **FAIL**：執行結果違反標準，保留首個失敗與後續修復證據。
- **BLOCKED**：明確依賴未達，例如目標／資源／完整重播／可驗證 barrier 缺失。
- **NOT_RUN／SKIP**：未執行；不得計入 PASS。環境造成的既有非 DB skip 另列。

只有清冊內所有必要 L1/L2 案通過、無缺案／意外 skip、清理與原功能回歸成立，才可標 `LOCAL_NATIVE_DB_ACCEPTANCE_PASS`。同時仍列 `REAL_MCP_NOT_RUN`、`RIGHTS_NOT_VERIFIED`、`CONNECTED_APP_HTTP_NOT_RUN`、`HOSTED_NOT_RUN`；不改整體產品為可上線。

審閱交付包括案例矩陣、target／source／schema 證據、交易時間線、故障前後 effects、遷移問題與修正清單、C／T／M 保存證據、仍被阻擋事項。批准這批本機結果也不等於批准部署。

## 7. 本輪自查與來源

本計劃已對照五個優先風險、所有 16 個命令、六種用途、原六個 writer 入口、公開讀取矩陣及 C／T／M 保留要求；每項都有任務與可觀察結果。共用介面只在測試目標核對後建立 clients，正式 app 無新啟用途徑。實作採現有隔離工作樹逐項執行，最後一次獨立整體審閱；本輪到文件交付為止。

倉庫依據：前述 Spec、`tests/integration/discovery.test.mjs`／`local-fixtures.mjs`、`scripts/verify-test-target.mjs`、`tests/real-integration/target.mjs`、`scripts/gen-kinnso-local-types.mjs`、`lib/discovery/{server,native,domain-transport,operations}.ts`、210 份 migrations 及前次機器可讀 evidence。本輪 graph inventory 未在 15 秒內回覆，改用受限的本機來源查閱，不宣稱完成 graph 分析。

公開文件於 2026-11-01 核對，均只作技術參考，不作為執行指令：

- GRANT 與 row policies 是兩層；管理端不能代替一般使用者驗 RLS：[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
- 資料庫層及應用層的測試分開；本計劃沿用 Node／SQL，不新增 pgTAP 依賴：[Supabase testing overview](https://supabase.com/docs/guides/local-development/testing/overview)。
- 提交順序、各隔離等級的 snapshot，以及 sequence 不隨 transaction rollback 回退：[PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)。
- 用實際鎖狀態觀察等待，不以同時送出請求推定已交錯：[PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html)。
- 保留依序重播與 migration history：[Supabase local database migrations](https://supabase.com/docs/guides/local-development/database-migrations)。
- 已查閱 [Supabase changelog](https://supabase.com/changelog)；Markdown 入口不受讀取工具支援，改讀 HTML。近期時區資料修正提示需記錄實際 PG image／tzdata 版本；本批固定 Asia/Hong_Kong 的案例不代表其它城市時區已驗收，亦不自動升級版本。
