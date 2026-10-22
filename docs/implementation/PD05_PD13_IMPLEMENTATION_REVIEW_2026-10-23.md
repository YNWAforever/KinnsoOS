# PD05–PD13 實作核對及候選驗證 — 2026-10-23

基線：PR86 `16456ea32c71c60d42dad8d4bfe73b4832cff288`；本次獨立 stacked branch `codex/pd05-pd13-workflow-completion-20261023`。最終 head／PR／CI／Preview 由交付 receipt 綁定；基線 736 tests／舊 CI 只屬歷史。未 merge，未手動部署，未部署 production。

沿用 Remix-Kinnso；沒有新增 Supabase projects、建立原目標 client、SQL、Auth／角色／業務資料／cleanup／schedule／外部訊息／provider 動作。原目標仍是 shared backend，purpose／disposable ownership 未核實，schema 保持 `not_checked`。D01 保留現行 notice；D02/D03/D05/D06 的 A 方向沿用現有準備包，並不代表 hosted 操作已驗收。

## 逐項成果

| PD | 可觀察成果及實際來源 | 核對／保留／限制 |
|---|---|---|
| PD05 | Creator 清單使用既有 `listState`／`nextDueAt`，將修訂、等 Merchant 審核放到正確分組；等待文案分辨 Merchant／Ops。`tasks.ts`、`CollaborationTasks.tsx` | 不讀 detail 補資料、不重建 task engine。原有 company／role／loaded-page、empty/error、unknown lock、denial／late-response fencing 保留。 |
| PD06 | 首次建 trip 後可返回原 structured guide；顯示已保存時區。create/import/apply 保留原 intent；裝置讀寫失敗阻止新 writer；strict 日期／時區錯誤可修正；舊 ACK 不把其他／較新編輯稱已保存。`TripWorkspace.tsx`、`ImportPreview.tsx`、`GuestPlanner.tsx`、`GuideWorkspace.tsx`、`input-validation.ts`、`import.ts`、`adoption-preview.ts` | summary 不可採用；unknown 不換 payload/requestId；CAS 回讀失敗不解鎖。照片、private notes、offline controls 沿用。新 session／第二裝置／physical 接受度仍 PD16 NOT_RUN。 |
| PD06 分享 | `SharePreview.tsx` 區分載入、read error、成功空結果；建立前先讀所屬 metadata 及保存 tab-local hold。未知結果保留 selection/expiry，空讀／revoke／reload／到期均不解除；撤銷只重試同一已觀察 owned link。 | **後端沒有 durable create receipt／requestId dedupe／one-time raw token replay。** Client hold 不能提供跨分頁／裝置 idempotency；不提供自動解鎖，不把 metadata 當 outcome。此合同仍 open，不能宣稱 PD06 全完成。 |
| PD07 | 沿用 source-summary／publicationReadiness／immutable versions；`TripWarnings.tsx` 顯示已載入 facts 的原 source／verifiedAt，兩者未知獨立；危險 URL 不變 href，refresh 失敗保留但明示舊 snapshot。 | 不掃新 provider、不將 publication 或目前時間當查核時間、不翻譯作者內容、private override reason 仍私人。**三篇真攻略同意及圖片權利 BLOCKED。** |
| PD08 | Merchant 的 recovered 非法日期、Feb30、時區有可讀修正與欄位目的地，原 brief／raw 值保留；使用原 `campaignSchedule`／`scheduleTimestamp`。`MerchantCampaigns.tsx` | 不默默 rollover 日期、不猜時區／報酬；readonly 發布摘要、sealed terms、CAS／owner-marketing／unknown contract 沿用。 |
| PD09 | 沿用 authorized evidence timeline、repeatable/paged revision、等待方／milestone anchors／receipt controls。 | 沒有新 event engine；latest submission timestamp 不是完整歷史。核准只稱 delivery approval，沒有 payment 承諾。 |
| PD10 | 審核 A 以現有 atomic `recovery.complete` 只移除 A 草稿；B feedback／另一 brief／branch edits 留存，切頁與重新整理仍可讀回。`MerchantCampaigns.tsx` | company/account scope 清除及 late ACK fences 保留。新 native case 使用真 React＋IndexedDB＋keyboard/reload；network DTO 為 synthetic。51+、role proof、Back/cursor 由既有 owned stories 在新 CI 驗證。 |
| PD11 | 每個 cohort 及 total 顯示已知 numerator／denominator；0/0、unknown/10 有不同解釋。`MerchantInsights.tsx` | 不把 null 當0、不改 CSV／5000上限／formula escaping／fresh scope fence；snapshot/period/asOf、逐幣別 tracked/settled/payout 與無 ROI 合同沿用。 |
| PD12 | `InboxWorkspace.tsx` 新 command 必須有 fresh successful read＋ready recovery；在分配 pending 前阻止 stale handler。read failure 仍可 Refresh，不再進入未送出卻永久 unknown 的 deadlock。 | 真已送出 unknown 仍用原 receipt/payload/requestId；A/B/new draft 與 customer/internal 分隔保留。四類 case／owner／receipt／原角色回讀 runbook 沿用，真 Ops 交班 NOT_RUN。 |
| PD13 | 沿用 reminder context、通知時/current deadline、dedupe/deadline version、partial bounded job、safe anchor/fallback／不搶 focus。 | local fake emit 不是 DB dedupe／實際送達；scheduler/provider/recipient recovery 為 PD17 NOT_RUN。無新排程器或假 email success。 |

完整 **38 個需求檢查點**、原 PD task rows 及對應 source/tests 在 `PD05_PD13_REQUIREMENTS_2026-10-23.json`。`KINNSO_PRODUCT_TASKS_2026-10-22.csv` 更新本次狀態；原 `NEXT_PHASE_LEDGER.json` 的18項 N、`NEXT_PHASE_TRACEABILITY.csv` 的完整53列（44 A/G/U＋9 LegacyE）及各自 closure rules 不變。T08／N16 仍 open；PD18 NO_GO。

## 驗證與原始失敗

本機 Node24.18.0／Next16.3.8／Windows；改 Next component 前已讀 installed docs。以下結果來自同一份本次 source edits；最終 canonical source manifest／receipt 另綁 exact head。

- 首輪全套 `npm test`：861 PASS、0 FAIL、0 SKIP。第一次 console wrapper exit1 僅 cp950 無法輸出測試勾號；npm 子程序 exit0、完整 raw log 保留，另以 UTF-8 讀回。沒有把 wrapper failure 改成未發生。
- `npm run typecheck`：首次3處 TS2556 FAIL；對雙語 map 加一致 readonly tuple type 後 PASS。`npm run build` PASS；`pnpm lint` 0 errors、30 existing warnings（root3／web27，web turbo cache hit）。
- Source contracts 9 PASS／1 Windows symlink SKIP；workflow contracts10 PASS。Linux CI 必須實際執行 symlink case。
- Chromium workspace synthetic fixture suite106 PASS；新增4例有 EN/zh-HK、320px／200%＝32px、keyboard、real IndexedDB／reload、無後端寫入。resource 四樣本7.850／7.776／7.797／7.659GiB RAM、44.688+GiB disk，原4GiB／6GiB gate 保留。
- Public backend-disabled Next routing90/90 PASS（EN/zh-HK direct/client navigation/Back/reload/keyboard/reflow，無 command）；不使用已往版本結果。
- TDD 原始 RED、fixture/harness setup errors、中途失敗及後續 GREEN 全部在本機 evidence 保存；Merchant5 data-loss RED、pagination1 RED、calendar/timezone RED、traveller baseline31 RED、share/facts4＋4 RED、support/insights10 RED、PD05分組3 RED 均有實際斷言。沒有降低斷言／重試／timeout／numeric gates。
- Full owned CI／Auth/Mailpit／integration／connected browser／performance 是獨立層，由最終 exact-candidate receipt 列出；歷史164 CI不代用。原 Remix hosted角色、第二裝置、Safari/WebKit、physical mobile、AT、真 schedule/provider、field performance NOT_RUN；未設定 latency budget 的量測不可稱 budget pass。

## 獨立 review 後續

Fresh reviewer 以 boundary doubles 重現4項 P2，原始判斷及 repro 全保留：Merchant 在 durable completion 前解鎖導致 B 新回饋被舊 snapshot 蓋過；A→B 後舊 completion error 把 B 鎖成 unknown；Trip 還原舊草稿錯綁目前 edit generation；demo read 可錯誤解除 guest read failure。這些是實際修復項，沒有以先前 green suite 駁回。

Merchant8個新增 EN/zh-HK held-completion／scope regressions 先全部 FAIL，修正後5個 focused files52 PASS；busy 維持至 durable ACK 及套用狀態，retain/release/complete success/error 都檢查原 scope。旅客新增16個測試：43 PASS／10 FAIL →53 PASS；只修正還原 request 的未知 generation 和切換 demo 時清 preview。最終全套 npm test885 PASS、0FAIL／SKIP，root lint重新PASS；最終 typecheck/build/lint 均PASS，483個app manifest檔案在執行前後指紋相同；修復後完整native suite再驗106/106 PASS，四個fresh資源樣本6.908–7.256GiB RAM、44.481+GiB disk。獨立 reviewer覆核4P2全已修復、無新P1/P2，另行24/24 targeted regressions PASS；同head CI由最終 receipt 綁定；Windows source9PASS/1SKIP，Linux symlink gate仍必須執行。上方861／106／90屬 pre-follow-up source fingerprint，最終 exact candidate 必須重新跑受影響 checks／完整 CI，不直接沿用。

## d49c2ca 的 connected FAIL 與修正候選

`d49c2ca4b840506a629eb237fccce22c158b85fa` 保留為歷史候選：owned integration97 PASS，connected browser223 PASS／1 FAIL。`account-recovery.spec.ts` 原斷言重現 fresh reload後重試 offline draft：server已ACK、沒有較新UI編輯，畫面卻稱還有修改未保存。不是環境問題；沒有改弱該native斷言。

新增EN/zh-HK兩個「無新編輯」對照先2 FAIL；只將保存訊息改按未確認 dirty targets 是否仍存在。原generation規則繼續控制哪些targets能被ACK清除，16個較新輸入／來源切換guards保留；55個trip恢復controls PASS，新全套887 PASS。`playwright.connected.config.ts` 明確收錄U22四例；原`--list`選不到0cases，新列表4cases。獨立 scoped reviewer另跑55/55 PASS，無blocking P1/P2；完整887 unit/component、build/typecheck及root lint均PASS。未改retry/timeout/assertion或network/role/SQL合同。

同d49的operations worker曾因JSR `@panva/jose@6.2.13` manifest connection reset啟動FAIL，`.env.test`未建立，後續report不存在FAIL保持；PR workspace fixture在原10分鐘runtime installation取消，cases NOT_RUN。一次job-only retry請求因workflow仍執行未被GitHub接受，沒有啟動；確認source regression後不再重試過時d49，保存全部結果並取消仍pending的owned舊run。最終修正head必須重新資格化四組CI；d49的SUCCESS／FAIL／CANCELLED不移作新head證據。

## 首次建立行程的較新輸入保護

再走create late ACK邊界，EN/zh-HK ×首次in-flight／unknown retry四例真斷言重現：即使使用者已輸入較新的title/date/zone，已確認舊create會自動導頁令新輸入消失。原navigation provider只保護已註冊的guest草稿，不能代替此create generation核對。

修復只為原create intent記錄既有editGeneration：沒有較新輸入仍照常開啟已建立trip；有較新輸入則留在form、明示尚未保存，現有清單加入去重的server已確認trip及原fromGuide連結。原payload/requestId不變，沒有第二次隱式寫入；actor invalidation照常清除private link。四例RED→59tripcontrols PASS；獨立review再指出舊list response蓋過confirmed link/warning，同類current-version read亦可蓋過已ACK編輯。另4例RED後加readVersion fence，成功create/apply後拒絕較早讀取，後續明確讀取仍可執行。全63tripcontrols PASS，獨立follow-up另跑63/63、無blocking P1/P2；完整895 unit/component、build/type/root lint PASS，483個app source執行前後指紋不變。下一個source/head須重跑完整CI。616的97integration／228browser及root CI成功屬歷史，不能移作新head驗收。

## 交付及恢復

獨立 stacked draft PR，以 PR86 remote head 為 base；使用正常 commit／push，不 reset／force push。新增 app source/tests 納入 `apps/journeys/scripts/source-manifest.json`，本增量其他 source/doc hashes 另有 manifest。未新增 backend schema、API envelope、receipt 或 local-draft schema；回退用本增量 source revert，保留已存在的 drafts、private notes、immutable published versions、reviews、receipt/dedupe/history。

仍需的具體下一步：在本候選取得同 head CI；用既有 target 操作包核實原 Remix 的 hosted scope／roles／recovery authority；收齊真攻略同意與圖片權利；完成 PD16 原 H01–H14／PS01–PS06 和 PD17 真收件／恢復，再形成 PD18 可審查發布決定。此增量不批准 merge 或 production deploy。
