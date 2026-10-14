# SDD ledger — plan: docs/superpowers/plans/2026-10-12-kinnsoos-continuation.md

Source spec: KinnsoOS_Audit_Evidence_2026-10-12.zip v1, SHA256 930652277aaabc3ca1e85e69e88f1aabcea54317ea1217ede3ac58445b31ab87.
Execution base: bfdcdc22858f7b925375bbeee724609b3700a603 (PR77, open draft), tree83ccb51ae54a11a875543d6c8378dbe6d2978c34. Main/production58d72e9, deploymentdpl_7DJFouZs9q6hWaxyA4dSaSFsnLrB unchanged during 2026-10-13 HK preflight.

## Rulings and preflight

- Ruling: reuse the clean task-owned checkout on a new continuation branch from exact remote PR77 head — tree matches prior local3f1db10; existing work is retained on its branch. No main or prior PR mutation.
- Ruling: cloud skill task-start/sdd-workspace resources could not be read; use this durable repo ledger and per-W task brief directly — same evidence/completion contract, manual bookkeeping instead of helper automation. Cost if wrong: missed progress; explicit task status and Git history mitigate it.
- Preflight W02→W17: configuration diagnosis does not assert schema readiness; hosted binding unknown. No database mutation without confirmed target.
- Preflight W03→W09/W13: service entry gates precede auth only for known disabled capability; unknown write receipt and private draft restoration stay unchanged.
- Preflight W04→W05: no fix before reproduction; label blank snapshot does not establish lock/reset cause.
- Preflight W06→W07: PR76 is not in main; compare exact diff, preserve PR77 recovery and authorization fences; source and performance assessments are separate.
- Preflight W08→W19: optional projected context must not change ReminderCandidate strict keys or dedupe; new SQL requires owned integration before hosted use.
- Preflight W17→W18/W21: final acceptance binds the actual candidate/schema/config, not an earlier deployment.

## Task status

- W01: 本次快照完成；開工須刷新 — 刷新來源、PR ancestry 與證據台帳
- W02: 受阻 — 確認503發生在哪一層
- W03: 已實作；首輪雙 CI 入口驗證 PASS；新 head 待整體驗證 — 先說清服務狀態，再引導登入與恢復
- W04: 已加診斷；受控案例 PASS；原失敗根因未證实 — 重現同事邀請名稱未保留
- W05: 待W04證實原因 — 修復已證實的邀請輸入原因
- W06: #76 差異及證據已分析；受控效能量測未完成 — 核對#76並定位效能瓶頸
- W07: 獨立評估閘門已實作／unit PASS；P16 數值驗收未完成 — 實作有依據的效能改善與發布評估門檻
- W08: UI 已實作／unit PASS；DB/native 待驗證 — 讓提醒指明哪個里程碑及期限
- W09: 既有功能待驗收；有重現才修改 — 以本人下一步整理工作台
- W10: 既有功能待驗收；有重現才修改 — 驗收排期與已接受合作的延續
- W11: 既有功能待驗收；有重現才修改 — 驗收找創作者、收藏及合作邀請
- W12: 既有功能待驗收；有重現才修改 — 讓搜尋、篩選和分頁保持上下文
- W13: 既有功能待驗收；有重現才修改 — 完成客服接手及草稿安全回歸
- W14: 受阻 — 完成三篇真實攻略到旅人採用
- W15: 既有功能待驗收；有重現才修改 — 核對商戶成果數字與CSV
- W16: 既有功能待驗收；有重現才修改 — 讓創作者收益與營運對帳可追查
- W17: 受阻 — 以最小delta接通指定staging
- W18: 受阻 — 完成creator↔merchant↔ops具名角色UAT
- W19: 受阻 — 驗收排程與營運每日處理
- W20: 待開始 — 完成手機、無障礙與私人資料回歸
- W21: 受阻 — 組合可放行M1與回退包
- W22: 受阻 — 完成真實內容與雙公司creator/merchant試點

## W01–W03 checkpoint

- W01: baseline refreshed, original ZIP and 21/38/6 mapping retained in imported plan. Clean exact PR77 tree; baseline npm test568 PASS,0FAIL,0SKIP.
- W02: BLOCKED_CONFIG_INSPECTION. Vercel project env metadata returns403 even with decrypt=false; no Vercel CLI available. Fresh anonymous GET at2026-10-12T16:42:46Z: missions/campaigns/inbox503UNAVAILABLE, session200null, private/no-store.
- W02 code tracing: at serving source58d, these routes call apiContext before query/RPC. Anonymous requests with a configured connected client return401 before business RPC. Observed503 therefore points to capability/backend configuration gate; exact missing/mismatched setting remains unconfirmed. No claim that the unrelated observed DB's missing query RPC causes this anonymous503.
- W03: source behavior fixed. Explicit disabled capability precedes sign-in and offers public explore; enabled first-read503 offers GET-only retry;401 offers safe localized return;403 does not offer futile retry.
- W03 RED:20 new cases,12 failed/8 passed for expected missing entry behavior. GREEN:20/20. Initial whole suite578PASS/10FAIL from new service-state import in editor-only VM fixtures; those fixtures now reject accidental entry rendering explicitly. Final whole unit588PASS,0FAIL,0SKIP. Native8 new cases added; local native baseline blocked by missing locked Chromium, not a product failure. Final CI pending.
- React best-practices checklist: hooks remain unconditional; retry counters primitive; cleanup fences late progress/membership reads; no new fetch waterfall/library/secret client props; localized status/alert/actions preserved.
- W04 investigation in progress; product invitation state unchanged. New bounded diagnostics retain only field presence/length/focus/disabled/mount/time, no field content or token.

- W03 build: initial Turbopack persistence range panic; removed only derived .next/cache, next build PASS. Original log retained; no source workaround or dependency change.
- W04: strengthened original U04 with one fill per field and immediate/current value assertions; bounded no-content event timeline attached. Added four real React controlled initial/refresh campaign/profile/invitation reads and company/actor-fence cases. Local browser unavailable; these remain CI_PENDING, N12-13 still OPEN, W05 not started.
- Ruling: preserve N12-13 as OPEN unless the actual controlled/full story reproduces a cause; diagnostics alone are not a product fix. Cost if wrong: a remaining user input defect blocks release, which remains NO_GO.

## W04 / W06–W08 continuation

- First published source1f105dce078a2a632fe29f5218fd4042a5c7bb1c, treea2876684e3cf756f570823181a2ee5c44068c079, matches local8c9244c. Draft PR78 is stacked on PR77; no main merge/deploy. Original Journeys push38280513573 and PR38280522823, attempt1, both verify/workspace-fixtures/auth-mailbox PASS; full connected/performance pending at17:07Z.
- W04 four controlled real-React retention/company/actor scenarios passed in both original fixture runs. Original U04 diagnostics now run in the full connected suite; no product cause established and no invitation-state patch applied. N12-13 stays OPEN until final full-story evidence is reviewed.
- W06 diff analysis: PR76 head773f91c12fc49ac43e413313c4fc3dff0a433eb4 merged into PR74's2400da1 as992fc09, not main. Ten files include lazy merchant tools, chunk-failure recovery, role/native bundle tests and evidence. The293098→215426 byte comparison is an uncompressed synthetic compiled fixture; it does not establish runtime LCP improvement. Both original PR76 numeric reports FAIL on different CPUs, despite complete48/8/24 denominators and cleanup. Do not claim a causal improvement or blindly port source.
- Ruling: implement W07's independent assessment gate while W05 remains unresolved; defer lazy-tool port/performance PASS until controlled same-host measurements justify the change — the gate cannot alter invitation behavior, source loading or product permissions. Cost if wrong: an additional non-passing CI prerequisite, while release already remains NO_GO.
- W07 gate RED→GREEN: four CLI behavior tests using real temporary Git commits/merge parents, clean/dirty/staged/untracked source, slow/missing/forged/role/cleanup/source failures; workflow contract RED→GREEN. Collector semantics and original artifacts preserved. This completes gate implementation, not P16 performance acceptance.
- W08 frontend RED:3 valid failures for missing contextual names/anchors/deadlines; first native-TypeScript module-resolution failure retained separately and corrected in test harness before product edits. Frontend GREEN7/7 reminder tests; whole unit595/595 and typecheck PASS. Legacy caller without payload exposed by full suite and now safely falls back. New event time explicitly labels the deadline snapshot in UTC; creation time remains distinct.
- W08 DB/native RED source published asb3177e8ee8be9c8c3654acbca47148bbaf31de80, exact local92535ac tree4aea8e4381fb364902df27e124ce05dfa85f178a. Original push38281772659/PR38281780745 retain test-first failures; no rerun to hide them. Additive migration is not applied to any hosted target.
- Ruling: use the pinned Supabase CLI's generated20261012170745 migration filename instead of the plan's illustrative20261012160000 — matches current execution time and avoids handwritten collision. Cost if wrong: migration ordering conflict; current migration inventory checked before use.

- W08 owned DB RED confirmed at17:13:56Z, push38281772659/job114920495170:94PASS/1FAIL, only new milestone-context assertion fails (`each reminder identifies its actual milestone`). Additive SQL written after observing this failure; no historical migration edited. Emitter obtains title from the already locked milestone and revalidated due timestamp; recipient-scoped inbox explicitly projects four optional fields. Existing service-only emitter/authenticated inbox grants re-established. Candidate keys/dedupe/atomicity unchanged.
- W04 new recurrence: first PR run38280522823 has194PASS/1FAIL, while push38280513573 has195PASS/0FAIL on the same source tree. Immediate assertion now catches recipient email clearing before label entry, with disabled→enabled observations. This narrows the symptom, not the cause. Controlled four-case tests still PASS. No refill, longer timeout or rerun used.
- W04 evidence retention defect: Playwright list reporter did not persist in-memory attachment bodies into the uploaded output directory; downloaded failure archive contains only error-context and existing screenshots. Diagnostics now write explicit output JSON before attaching, so the next original run retains field lengths/mounts/locks/events without field contents. N12-13 remains OPEN pending that timeline.
- W08 focus navigation RED→GREEN: actual component test catches returning from a missing fragment to the same milestone; hash navigation resets the focus key while ordinary data refresh does not. Actor invalidation removes the handler and old private content. Native two-language slow-detail/refresh/hash controls added.


## Whole-branch review and native correction

- Fresh reviewer (GPT-6 Astra), exactbfdcdc2..9f98668: no actionable Critical/Important/Minor finding;65 focused tests PASS. Reviewer deliberately leaves invitation rootcause, final CI/DB/native execution, numeric performance and hosted/device/scheduler acceptance unjudged; those remain evidence gates and NO_GO blockers here.
- Final: Ruling: keep unresolved invitation clearing, current DB/native results, performance, hosted/device/scheduler acceptance OPEN until their own evidence exists — review cannot substitute for runtime/role proof. Cost if wrong: delayed release; no false completion.
- W08 native sourcec0796b5: both original fixture jobs68PASS/2FAIL at the new refresh-focus assertion. The test expected a native disabled button to retain focus; Chromium blurs it. Anchor initial focus passed before that assertion.
- Ruling: correct the native focus control by focusing an enabled sibling while the refresh response is deliberately held, then assert that completion leaves focus there — verifies the actual no-focus-theft contract without demanding browser-invalid disabled-button behavior. Product focus code unchanged. Cost if wrong: a refresh focus regression may escape; explicit held-response focus assertion and hash/actor controls mitigate it. Original failures retained.


## Connected fixture schema correction

- Source1f82d86 push38283597004:95/95 DB integration PASS;195/197 browser PASS. Both U08 native stories fail before navigation while bulk-inserting two milestone rows:23502 sort_order is null on the first row. The second row supplied sort_order:1, so the bulk insert column union includes sort_order and the omitted first value is null rather than its table default. Existing DB reminder context test passes.
- Ruling: explicitly set sort_order:0 on the first synthetic milestone, retaining sort_order:1 on the second — repairs an observed seed/schema mismatch, without weakening schema or changing product code/assertions. Cost if wrong: owned U08 still fails; the original failed run and new native execution remain the acceptance gate.
- Source1f82d86 fixture push70PASS; PR69PASS/1FAIL is the existing P07 English1280 screenshot CDP capture, after its functional assertions. No screenshot removal, retry or timeout change. New W08 focus cases pass both runs.
- W04 persisted diagnostic artifact11763181705 sha25647414518022ded7643679762086dbae51e98fc7ce704b9c692469d0ef2c8a5ca verified. Current success timeline retains identical field mounts1/2/3 and lengths67/27/36 through pre-Create; no failure timeline exists yet. Original N12-13 cause remains OPEN.
- W07 original sourcec0796b5 push38283155033 now numeric/gate PASS while PR38283160806 numericFAIL; source1f82d86 push38283597004 numericFAIL and new gate correctly rejects recorded non-PASS. No cherry-picking the green measurement as overall performance acceptance.


## W04 evidence-backed W05 correction

- Source8224212 original PR38285982762/job114934348264:95DB PASS;196/197 native PASS. U04 recipient email again empty immediately after single fill. This time artifact11764278082 (sha2568ba4f78e02acff1b0bc0a49726ac4313f4392c7db46f6b1ef58a1214493492b3) retains the failure timeline. All8 bounded merchant API responses200.
- Actual failure: same field mounts1/2/3 throughout; recipient focusin1565ms, disabled/focusout1569ms, all fields disabled1572ms, enabled1659ms. No input/change event and no nonzero field length occurred. This recurrence is input suppression through a late lock, not evidence of a typed value being cleared/remounted. Original earlier label-only screenshot remains a less specific symptom.
- Source tracing: MerchantProfile is separately dynamic in Workbench. Its initial read sets busy, which was propagated as a global company lock although it is not a write; campaign/discovery initial reads have separate loading state. Controlled actual-component RED:2/3 tests fail because the profile read exports lock=true; existing unknown-write lock control passes.
- Ruling: export the existing pending-write lock (plus unknown) from MerchantProfile, preserving its local busy UI and all write/CAS/request fences; do not export a read-only busy state to unrelated invitation fields. Cost if wrong: concurrent profile reads could reveal stale scope; late-company and actor invalidation controls plus same-request unknown-write tests are required and pass locally. No invitation refill, delay, permission change or timeout increase.
- W05 focused GREEN3/3. Native EN/zh-HK controls now delay the actual profile component mount until an enabled invitation has focus, hold its GET, enter text once, then verify retained focus/value after both reads. Earlier profile discard-read test now expects unrelated invitation to stay enabled while the profile itself remains disabled. Final original CI pending.
- React check: hooks/dependencies and local profile busy behavior unchanged; pending-write ref is read only in the existing lock effect triggered by busy/unknown. No additional request, cache, dependency or bundle boundary change.
- Whole-branch fresh review predates this newly evidenced one-line product correction. This delta is author-checked with RED/GREEN controls and final original CI; no second reviewer was dispatched.
- W05 final local verification:599 unit PASS,0FAIL/0SKIP; typecheck and production/source-package build PASS. Native controls and full connected stories await the original new candidate runs.
