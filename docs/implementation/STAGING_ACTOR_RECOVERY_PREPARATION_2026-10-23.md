# 原有 backend、受控測試角色及恢復演練準備 — 2026-10-23

狀態：**PREPARED_PENDING_DECISIONS**。來源 base 為 PR85 `6126ed900c9fa7f17688ac3261970add46d70cfa`。用戶已決定沿用原有 Remix-Kinnso，**不建立任何新 Supabase project**；兩個新 cloud projects 的原提案已撤回，不查價、不升級或騰 quota。

本輪是可審查準備，沒有建立 Auth identity、派角色、SQL、provider／schedule、外部訊息、merge 或 production deploy。真攻略作者同意及圖片權利維持 **BLOCKED**。

## 方案與需要的決定

| ID | 建議方案 | 可選替代／取捨 | 仍須輸入或批准 |
|---|---|---|---|
| D01 | 指定營運法律實體及私隱責任人；身份以 private reference 記錄 | 未指定則保留原 notice，不啟動真人 pilot 收集 | 法律名稱、私隱聯絡及責任人。Codex 不代任營運方 |
| D02 | app case 為正式案件記錄，受控 mailbox 作私隱／未能登入後備；建議香港工作日10:00–18:00、兩個工作日內首次人工回覆作內部目標 | mailbox-only＋人工case reference；無輪值便不承諾服務時間／SLA | 真渠道、primary/backup owner及目標。確認受控 mailbox 前不寄訊息；法定請求時限另處理 |
| D03 | 審批雙語政策及實際 processor/region/retention inventory；本輪不新增 analytics／AI／marketing | 若要新增處理，先補用途、接收者、保留、consent及驗證 | 實際providers/config與可執行刪除／備份程序，不能把提議當現況 |
| D04 | **已選：原 Remix-Kinnso backend＋現有 KinnsoOS 的獨立 branch Preview URL＋明確 runId/cohort**。沒有 backend 隔離宣稱 | 若原 project 是共用正式環境，只準備範圍內私有／draft controls；公開寫入及完整流程仍 BLOCKED | project owner確認用途/共用讀者，核准 exact cohort/IDs/讀寫範圍。選用project不等同准schema、Auth config、role、provider變更 |
| D05 | 13個 synthetic非Ops身份＋一個**現有已獲准Ops**身份 slot、兩家公司/分支；不新增全域Ops/admin grant | 經另審可指定已有測試身份；Auth identity仍不跨persona重用。若要新Ops角色需明確審批其全域影響 | actor/company/branch private refs、建立與role變更的狹窄範圍。所有目前均未建立／未派角色 |
| D06 | 可丟棄**本機Docker**還原 synthetic cohort。先測一次 recovery drill；pilot候選目標可選RPO24h／RTO4h，未測量前不是承諾 | RPO1h／RTO1h需頻率/輪值/實測；或者暫只做一次無服務承諾的演練。完整原project restore另保留未驗收 | recovery primary/backup owner、目標、snapshot/export/restore授權與readback簽收；原project不覆寫 |

D01–D03實際可審批雙語copy見 `PRIVACY_SUPPORT_DRAFT_2026-10-23.md`；D04只有用戶選project的決定已收到，其他scope未批准。本文件/工具/文案批准不會自動建立資源或啟用任何服務。

## 已核對的事實與身份缺口

2026-10-23只讀Supabase management metadata確認 Remix-Kinnso 為 ACTIVE_HEALTHY、Singapore、Postgres17.6.1.127，所屬 org 為Free；exact refs留私有metadata receipt。這不證明它沒有production資料、可丟棄、Auth/Storage配置、schema/grants/RLS或角色正確；沒有讀keys、業務資料或執行SQL。原有inactive Kinnso與Remix-Kinnso不是同一project，不因名稱近似而替換。

原project與Preview仍可能共用Auth、DB、Storage、公開readers及全域Ops。新company/runId、不同Preview URL、matching origin或noindex都不能單獨證明隔離。

本機Docker Linux daemon目前不可連接（dockerDesktopLinuxEngine pipe不存在）。沒有啟動Docker或移動/刪除原containers。若要跑local restore，先重新取得四個fresh 4-GiB RAM samples／6-GiB disk gate，再核對新owned/unlinked workdir、marker、container/volume/network/port。既有環境及歷史fixtures不改動。

## 原backend必須保留的停止點

- **無 public synthetic publication 預設授權**：Creator profile/guide、Merchant public brief或共享token若可能被既有production reader讀到，先保持draft/private。直到逐條public/SEO/API projection的cohort排除或可處置用途獲核實才提出exact寫入包；Preview noindex不能代替DB公開邊界。真三篇攻略仍BLOCKED。
- **無 schema／Auth config／全域roles變更預設授權**：不關email confirmation、放寬RLS、改redirect/wildcard、停用既有provider或新派global moderator/admin來讓測試通過。Ops queue/monitoring可能全域；未核實exact mission/case filter與讀取scope前不打開全域頁或拉取非cohort資料。
- **無 CI seed/reset/cleanup**：`prepare-connected-ci.mjs`及`verify-test-target.mjs`保留approved local/CI合同，絕不把原project加進allowlist或偽造CI flags。Cloud bounded驗收另記，不改原suite適用範圍。
- **無 privileged server key預設啟用**：media/unified服務可能需server secret；未審查同target、owner wrapper、用途及authority前留空/關閉，photos的hosted驗收仍NOT_RUN，不以一個全權key代替角色測試。
- **沒有 in-place restore**：本輪不把backup還原回原project；只準備經核准的synthetic subset到可丟棄local目的地。subset成功不證明整個DB、Storage/Auth/OAuth/SMTP/secrets或production RPO/RTO。

## 執行順序、設定及rollback

| 步驟 | 具體操作及必須記錄 | gate／停止點 | 現況 |
|---|---|---|---|
| S0 決定 | D01–D06 refs、明確cohort/IDs/owner、資料用途、範圍、故障/cleanup決定 | D04project選擇不擴成寫入授權；沒有paid資源建立 | PARTIAL |
| S1 身份 | management exactproject metadata＋DNS/host/gateway/transport＋owner對用途及範圍readback；核對Preview配置指向原project | client import/constructor/health probe前先核實；設定變更重做；不假定可丟棄 | METADATA_ONLY |
| S2 只讀reconcile | 針對獲准scope比對schema history、owners/grants/role membership、RLS、RPC/views、storage政策 | 另有只讀SQL/client scope才做；configuration check不檢查schema | NOT_RUN |
| S3 exact setup包 | 如需角色/fixtures/schema，先列精確target、recordIDs來源、ordered delta/hash、影響、測試及rollback | shared target無reset/replay-all；未審scope停在packet | NOT_RUN |
| S4 identities/cohort | 13個非Opssynthetic身份＋既有Ops slot、兩公司/分支；獨立contexts與privatecredentials；每筆新ID記owner/run | 原有records不覆寫；不手寫auth.users或user_metadata自授權；public/全域寫入停在上節gate | NOT_RUN |
| S5 Preview | 固定候選source/tree、URL、schema/config/actor refs；只有獲准branch Preview設定 | 不改production vars/domain/alias；分支Preview不是DB隔離 | NOT_RUN |
| S6 bounded UAT | 同權限正控制＋A/B/outsider拒絕、fresh login/第二裝置、撤權、CAS/unknownACK、case readback | H/PS逐案receipt，未能安全隔離的publish/mailbox/globalOps保持NOT_RUN | NOT_RUN |
| S7 local restore | synthetic snapshot/objectbytes到新owned/unlinked localtarget，failure/commit/reconcile/readback | Docker/資源及identity gate；不用原project當restore target | NOT_RUN |
| S8 handoff | primary/backup owner用case/run receipt接手，列實測loss/time及coverage、exact cleanup決定 | 不虛構另一人簽名；失敗保留IDs停止後續寫入 | NOT_RUN |

`apps/journeys/scripts/pilot-staging.env.example`是停用預設的**提議模板**，不會被Next/CI自動載入：

- URL／approved／legacyAuth origin應同屬選定原project；publishable/anon與server-only secret用途分開。原有設定不抄到新scope或輸出值。
- `KINNSO_SITE_URL`候選是獲准branch Preview的穩定origin；native `/auth/callback`及alias `/callback`沿用。只準備exact allowlist差異；原project已有Auth/production redirect不能自行替換。需要改Auth設定時再交exact操作包，不以wildcard處理。
- capabilities初始留空；已存在production能力不更改。先驗schema及各項role再逐項提出獲准啟用；agent/telemetry/cron/provider不在本輪啟用，canonical source未指定則source recommendations關閉。
- 本機configuration-only命令：`node --experimental-strip-types scripts/check-readiness.mjs`。它不連DB；exit0只表示configuration relationships，不把schema:not_checked、company/account權限或runtime升級。
- Auth identities由owner核准的Auth管理流程建立；若只預先設好帳戶，H13真mailbox confirmation/recovery仍未跑。不得寄到非指定收件者或用production用戶身份測試。

App rollback使用記錄的last-good Preview版本；文案回到原notice。Unknown write保留同requestId/payload，read failure不解鎖/重建命令；schema若需要另案執行，依既有migration-release guard及compatible forward-fix，不blind downgrade。cleanup只處理經授權、本輪ownership manifest可證明的exact IDs，無blanket delete/按名稱掃除；失敗保留checkpoint。

## 14個身份slots及驗收

`PILOT_TEST_ACTORS_2026-10-23.csv`沒有credentials或真身份；traveller/creator是persona，company技術角色沿用owner/marketing/clerk/finance，Ops最小source moderation角色是moderator（不是company owner，也不是settlements/admin）。本方案優先由現有獲准Ops責任人處理exact測試case；沒有新增global grant。

| 驗收範圍 | 正控制／負控制 | 安全範圍／仍未驗收 |
|---|---|---|
| 旅客 PS01–PS03 | traveller-a自己的structured guide採用、notes/self-madephoto、reload/login/第二裝置；traveller-b/anonymous拒絕，summary-only不採用，share revoke | 真內容及公開fixture visibility未核實；全部hosted observed仍NOT_RUN |
| Creator H02–H05／PS04 | creator-a合作/交付/修訂/收益；creator-b拒絕A私人資料；approval不創payment | private/draft只在cohort scope獲准後；public publish另gate |
| Merchant H01–H08／PS05 | a-owner/marketing/clerk/finance正scope；b-*跨公司denial、privateproof owner-only、pagination51+/CSV denominators | 公開brief不得污染既有production readers；既有quota/records不改 |
| Ops H09–H12／PS06 | existingOps exact case/mission，reason/history，outsider/company無Ops；撤權後舊tab/cursor/export/directRPC失權；unknownACK同request重試 | 全域list/assignment/revocation均須明確範圍，不能因測試自授權 |
| Auth/可達性 H13–H14 | 受控真mailbox；EN/zh-HK、keyboard、320px/200% | 外部mail沒有授權；physical devices/AT另記，localfixture不替代 |

Synthetic內容／自製幾何圖只作經核准測試，不替代三篇獲作者同意、圖片權利已核實的真攻略。Booking/payment/automaticpayout/bulkapproval/newmarketplace及改AIprovider不在本方案。

## Synthetic subset恢復演練卡

1. **R01 範圍與計時**：固定candidate/app tree、原project＋owned localtarget、exact synthetic record/object IDs、owner、case/runId、snapshot boundary及故障宣告時間。沒有原project全域freeze權限，不宣稱全project一致snapshot；只依批准的cohort凍結/版本邊界核實subset一致性。
2. **R02 Export manifest**：只匯出獲准synthetic IDs及必要依賴，記每檔SHA256、時間、對象數/bytes及關聯。DB rows/Storage metadata與實際objectbytes分開；Auth user/config/roles/OAuth/SMTP/secrets哪些未覆蓋逐項記。不要dump整個shared DB順便取得production資料。
3. **R03 Local identity**：核對`kinnsoos-rehearsal-<12hex>` owned/unlinked workdir/marker/container/volume/network/59421API/59422DB；與原project及既有localcontainers不同。既有`authorizeRehearsalTarget`仍是後續執行前核實，不以packet references代替。Docker未就緒不創client。
4. **R04 Rebuild／restore**：source inventory先作目標reconcile，經批准才在ownedlocal重建相容schema＋restore subset及self-madeobjectbytes。不是把cloud CIseed/reset套原project；既有`isolated-rehearsal.mjs`有canonical full-schema replay，不宣稱它已匯入或驗過本subset。
5. **R05 Failure/unknownACK**：本機純guard測試已準備；真target另驗deliberatefailure rollback、commitACK未知保留claim→唯讀catalog/receipt reconcile、COMMIT後freshpostcheck；原requestId/payload不換。原project若將來需SQL，既有fresh≤1h一致**完整DB export**、isolatedrestore和exactfailure/commit/postcheck gates仍未滿足，subset不能頂替。
6. **R06 Readback**：在核准localapp以自己的cohort身份檢查traveller privatecopy/photo、creator receipt、companyroles、share revoke、Opscase與原dedupe/immutableversions；matched正控制與跨scope負控制都記錄。auth/cloudprovider不能還原的項目保持partial/NOT_RUN。
7. **R07 Measure/handoff**：本輪subset RPO是fault boundary與最後確定可恢復subset的一致時間差；RTO由故障宣告至指定readback完成（含資源/配置時間）。只對本次subset／local環境報告，不換算production能力；對照D06提議目標，backupowner用receipt接手。
8. **R08 Retain/cleanup**：原project不覆寫；cohort IDs和localtarget保留至owner的explicit cleanup決定。只刪可證明自己本輪建立且已准的exact IDs，不清inbox/dedupe/history來回退。cleanup失敗停止並保存證據。

Receipt：scenario/run、source/tree/deployment、schema/config binding、target/purpose/owner refs、actor/company refs、backup/objectmanifest hashes、expected/observed/status、時間、coverage缺口、next owner/action。公開repo只放角色/reference；個人資料、proof、credentials和原projectexactrefs在private record。

## 本機packet工具

```text
cd apps/journeys
node scripts/pilot-preparation.mjs --packet scripts/pilot-preparation.template.json
node --test tests/pilot-preparation.test.mjs
```

預期模板exit2 `BLOCKED_INPUTS`；D04的project方向已記，其餘決定/identity/cohort/actors/recovery未填。22個tests覆蓋exactcandidate、原projectbinding、禁止新projects、ref/origin、15分鐘declaredobservations、14個獨立identityrefs、role mapping、禁止cloudreset/schema/globalgrant/fullrestore冒認、secret回顯及malformedinput。工具不連線，報告不回顯inputvalues，JSON上限256KiB。

填滿references最多得到`REVIEWABLE_NOT_EXECUTABLE`；`authorizedActions:[]`／schema:not_checked／runtime:NOT_RUN／realContent:BLOCKED／fullRestore:NOT_RUN不變，isolation固定`SHARED_BACKEND_NOT_ISOLATED_STAGING`。欄位PASS只表示聲明格式，不證明artifact存在、用途/authority/permission或真正隔離；operator必須另查metadata/transport/ownership再做clients/寫入。

`PILOT_MIGRATION_SOURCE_INVENTORY_2026-10-23.json`是source-only排序/hash清單，selectedDelta=null、execution=NOT_RUN。PR55/65舊packet不適用本候選/原target。既有migration release及test-target guards未改。

## 官方參考（2026-10-23查閱）

- [Database backups](https://supabase.com/docs/guides/platform/backups)、[CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)：DB、Storagebytes、自訂Auth/role/config及外部secrets需各自核對，不能把dump當全產品備份。
- [Supabase changelog](https://supabase.com/changelog)：已核對2026-10-12 TLScipher變更（2026-11-10生效）；本輪無SDK/TLS變更，真正執行前再核對相容性。
