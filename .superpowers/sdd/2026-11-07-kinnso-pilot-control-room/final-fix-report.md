# Final whole-branch fix wave report

**Status: FIXES COMMITTED; CONNECTED ACCEPTANCE BLOCKED.** The requested product/security changes and packet updates are implemented. The required complete UI-operated connected journey is **not verified**: the only matrix ended 71 pass / 2 fail. Its two test selectors were corrected, but the failed case was not retried. This report does not claim the whole task's acceptance gates are green.

Worktree: `C:/Users/laich/Documents/KinnsoOS/.worktrees/single-origin-design-20261105`. Base `2d8fce332bccbb6d4628f26dd3a0da75d3c46999`. Implementation commit `8f64c1b32a8d893b535d06782169d6a511e6a665`; test-selector/title correction commit `cae18527a9dfa2c37e1ed2022abf640ea8ac4095`; final tree `1312cc68c06fa11e987cc8509287c736dad4842e`. The following packet/report commit is documentation-only and is identified in the final reply. No subagents were used.

Read the final brief/reviewer output, plan, spec, release packet, repository/app AGENTS, RTK, installed Next guides and Supabase/Postgres security/locking guidance. Graph discovery did not produce timely usable discovery, so source reads used the plan's explicit file map. All work remained in the isolated worktree and disposable target.

## All 13 areas

| Area | Implementation | Evidence and limit |
|---|---|---|
| 1. Cover identity | Composite review digest includes exact current guide cover URL and recorded cover rights/reference; authenticated direct cover update blocks publish until rejection/resubmission and exact reapproval. | RED SQL cover case; GREEN integration exact rejection + reapproval + publication. |
| 2. Owner demotion race | Both owner mutation RPCs recheck owner authority after the shared advisory lock. | RED two-session stale owner succeeds; GREEN two-session denial with unchanged target/audit. |
| 3. Multi-intake | Safe owned intake list, selector/new action; only draft/rejected editable; submitted/approved/published read-only. | RED SQL/projection/UI; GREEN SQL, route and presentation. Connected three-intake execution is NOT COMPLETED because the new test stopped at its first dropdown locator. |
| 4. Withdrawal/completion | Confirmed self withdrawal retires scoped participation/invites/collaboration/intakes while ordinary account access remains; individual completed prohibited; atomic required-slot completion after execution checks. | RED premature/run completion; GREEN integration self/recovery/completion and presentation confirmation. Final connected cancellation/withdrawal steps NOT REACHED. |
| 5. Acknowledgements/support | Server-derived exact target IDs, exact mission support destination and operator support_case evidence form. | RED missing participant controls/projection; GREEN presentation/route/SQL. Final connected support creation/resolution/evidence/acknowledgement steps NOT REACHED. |
| 6. Substantive review | Allowlisted source/rights/cover and structured read-only draft preview, locale/current revision/digest and guide identity visible before approval. | RED route/review rendering; GREEN safe projection and presentation. Final connected approval/reapproval steps NOT REACHED. |
| 7. Readiness | Public profile predicate matches public rendering; application creation must follow acceptance; required-role presence comes from server facts. | RED public profile, corrected old application baseline control, missing role unit; GREEN all corresponding negative cases. |
| 8. Invitation/cap | Confirmed nonempty email enforced inside actor transaction; total slot maximum 20. | RED unconfirmed claim/21st slot; GREEN unchanged invite/row/audit/receipt assertions. |
| 9. Session retry | Unknown outcome retains exact URL/method/request ID/serialized body; definite rejection releases intent for editing; stale account responses guarded. | RED lost-success Retry remains ineffective; GREEN same serialized retry followed by reconciliation and editable definite rejection. |
| 10. Connected UI | Required controls now operate through product UI; authenticated API probes remain supplemental. | INCOMPLETE acceptance: one exact-attested matrix ran 73 cases, 71 passed and 2 failed; the happy journey timed out before its first intake; the exact active wait was obscured. Two dropdown locators corrected to role selectors afterward; failed case was not retried. No final-source browser pass claimed. |
| 11. Default build | npm build invokes source packaging then supported next build --webpack. | RED default build assertion; GREEN default npm run build, 73 generated entries. |
| 12. Packet regeneration | Manifest adds new regression test and migration; regenerated runtime and canonical archives, all source members verified, exact migration hashes. | Final-source build and canonical archives regenerated and verified; earlier failed-matrix archive preserved separately. All identities/hash bases are explicit. |
| 13. JSON clarity | Explicit realParticipation BLOCKED, Journeys UNCHANGED/not deployed, production UNVERIFIED, publicLaunch HOLD, per-hash byte conventions. | Both release documents regenerated from final evidence; no stale candidate hashes presented as current. |

## Exact RED evidence

| Log | Executed | Failed | Valid behavioral RED cases | Qualification |
|---|---:|---:|---:|---|
| red-db.log | 8 | 8 | 7 | The original freshness fixture hit immutable attribution before the target assertion; excluded until the corrected baseline predicate control below. |
| red-freshness.log | 1 | 1 | 1 | Corrected rollback-only old-application fixture with the base check_rows function restored temporarily; candidate function restored afterward. |
| red-race.log | 1 | 1 | 1 | Two database sessions: waiting owner is demoted after precheck; base code wrongly changes target membership. |
| red-unit.log | 2 | 2 | 2 | Missing required roles and unsupported default build. |
| red-projection.log | 2 | 2 | 2 | Exact base route files restored temporarily, then candidate restored; missing safe review/self projection. |
| red-ui.log | 3 | 3 | 3 | Missing multi-intake controls, acknowledgement/withdrawal controls, and ineffective identical session retry. |
| red-review-ui.log | 1 | 1 | 1 | Exact base review component lacks substantive source/rights preview. Its test title also mentions support attachment; the assertion in this test covers review rendering only. Connected UI coverage proves support attachment. |

These represent **17 distinct valid behavioral RED cases**. The original old-application fixture first hit the immutable attribution constraint and is excluded until the corrected baseline-function control. Projection/review controls temporarily restored exact base files, then restored the candidate. Earlier fixture/implementation corrections are retained privately, not blended into final counts. The baseline assertion permitting individual required-slot completion was replaced by the requested denial; positive fixtures now explicitly supply confirmed email/public profile. No assertions were relaxed to hide the final failure.

## Final results and source attribution

## Verification

| Check | Exact result |
|---|---|
| Final-source focused unit/contracts/routes | 151 passed, 0 failed |
| Final-source full Journeys unit | 1,587 passed, 2 Windows skips, 0 failed; 1,589 total |
| Final-source typecheck | PASS |
| Final-source default npm build | PASS locally; no hosted deployment claim |
| Final-source source package | 11 passed, 1 Windows symlink skip, 0 failed |
| Full isolated unseeded reset | 212 exact Git-blob migrations; ledger head 20261107165735 |
| Isolated integration (unchanged SQL/application) | 59 passed, 0 failed |
| Advisors | 67 existing warnings: 13 security, 54 performance; 0 added/removed keys |
| Sole connected browser matrix | **71 passed, 2 failed**, 73 total, 11 suites; one worker, retries 0, reuse false |
| Final-source presentation | 53 passed, 0 failed; stubbed transport |
| Cleanup | 43 exact predicates per pilot scope; 7 operations predicates; recorded aggregate residue 0 |

The two unit skips are POSIX FIFO and Windows symlink creation. They are not passes. Presentation is not connected or physical/AT evidence. No second browser invocation occurred.

| Connected suite | Passed | Failed |
|---|---:|---:|
| account-recovery | 3 | 0 |
| creator-workspace | 20 | 0 |
| inbox-support-workspace | 1 | 0 |
| u04-merchant | 4 | 0 |
| u06-accessibility | 1 | 0 |
| u06-ops-content-admin | 1 | 0 |
| u06-role-bundle | 2 | 1 |
| u11-workspace-recovery | 2 | 0 |
| u25-public-accessibility | 36 | 0 |
| u26-pilot-control-room | 0 | 1 |
| u26-pilot-security | 1 | 0 |



The final source differs from the matrix source only in two select locators and a presentation title. Final focused/full unit/typecheck/default build/source package/presentation were completed again on that final source. The 59 integration checks apply to identical application/SQL bytes after a full 212-migration clean reset. The connected matrix belongs only to `8f64c1b32a8d893b535d06782169d6a511e6a665`, served tree `b7b6802f4dd28605fb344db785342f4a5d113e2a`, build `lem8OcSMklC65xoay8fQH`; it is **not** final-source connected acceptance. Final build `3TtlBRHqox9YapCQP0xRO` is separately identified.

## Failure diagnosis and no-retry boundary

The happy journey timed out before its first intake submitted. The known fixture journal contains four users, one run, one intended guide and no mission. The finally-block context-close error masks the exact active action. Independently, static diagnostics confirmed that `getByLabel('Rights basis', {exact:true})` and the analogous Cover rights locator cannot resolve their controls. The nested select's option text affects Playwright label matching; a static HTML diagnostic found **0 exact-label matches / 1 exact combobox-role match** for Rights basis and Cover rights. The test now uses the two exact combobox roles. The product input contract and assertions were not weakened. The presentation test title was narrowed because that case asserts review rendering, not support evidence attachment.

The one-matrix/no-retry instruction was honored: **one invocation, retries 0, reuse false**, no rerun after the failure/correction. Therefore three-intake creation/review, acknowledgement/support evidence, and withdrawal steps later in that connected case remain unverified. The negative connected pilot security test passed. There were 71 passes in total. The other failure was the existing role-bundle reauthentication case: its page said service not connected and the verified local capability list excluded agent. That missing matrix prerequisite is documented; no product regression is established and no provider was activated. Cleanup completed for both pilot scopes despite the happy-case failure.

This is a remaining technical validation blocker. No claim of READY_FOR_USER_REVIEW or 73/73 success is made.

## Migrations, hashes and cleanup

## Artifacts and explicit hash basis

There are **746 source inputs and 747 ZIP entries**. All canonical members match final committed Git blobs. Final build archive members match actual checkout bytes and metadata hashes; **61** differ from Git only by CRLF/LF. The canonical ZIP was not separately built.

| Artifact | SHA-256 | Byte basis |
|---|---|---|
| Final build ZIP | `d4f1313169fc3551f0850bc6caf3fe86a9e5ad6deedce223bc6eee4daaa81025` | `.local-private/final-fix/tested-runtime-source.zip`, exact file bytes from final npm build, NOT connected-attested |
| Final canonical ZIP | `185a505cac30774d15caf4bd5c1f59e89f64e161836340c9083df5d4caf7d425` | `.local-private/final-fix/final-committed-source.zip`, exact file bytes; members equal final Git blobs |
| Failed-matrix runtime ZIP | `e76e26c8747c828d551f9d97a9e6ce30998315d053c24e02690f8cfac705cc78` | `.local-private/final-fix/browser-tested-runtime-source.zip`, exact file bytes used by sole matrix |
| Final manifest Git blob | `f0c46feb5f0d69406a3b95e22b7c10a7b74dd6cedd6403504661491cc508c323` | Exact committed `apps/journeys/scripts/source-manifest.json` bytes |
| Final manifest checkout | `365912a5c377da99c96f92bb74a0f5ede833ecc1e6624c3969161c71d3da8232` | Exact Windows checkout/final-build ZIP member bytes |
| Pilot migration envelope | `b91430438f465bf5436e6c3eda1cbe7ac7db879db40d50ed0758467a13fc0938` | UTF-8, ascending version; LF lines of version + space + filename + space + exact Git-blob SHA-256 |

## Database and production boundaries

Only `kinnsoos-public-it-20261106`, API `http://127.0.0.1:59721`, DB port 59722 and container `supabase_db_kinnsoos-public-it-20261106` were used. Ownership was verified before reset, integration, browser and cleanup. Every staged SQL file matched its Git blob. All 212 migrations replayed without seed; ledger count/head were read back. Eight pilot migrations:

| Migration | Exact Git-blob SHA-256 |
|---|---|
| `20261107081531_kinnso_pilot_control_room_schema.sql` | `74c523d0c672925f39b4f51950b0fa7971ab497f38d3bf4820f3c0d9bd7adbc0` |
| `20261107085017_kinnso_pilot_control_room_rpcs.sql` | `a217f40afc932e16e318a55773cc0018d2b575ebf61a02cfa22be60eab319e68` |
| `20261107110059_kinnso_pilot_readiness_publication_contract.sql` | `b2702fdaa41963f2f1b44045a22d371e23c7867e695e380b199a1ed1ee2245e0` |
| `20261107135337_kinnso_pilot_traveller_support_context.sql` | `d611bea3668888d7366544ab481d6bc14bc15e553a1ae18bf7e2b32c9616818e` |
| `20261107145100_kinnso_pilot_opaque_evidence.sql` | `246579588dd27726de6d32076ca42512069d5b587758040bbae6c35ebf845b6d` |
| `20261107152000_kinnso_pilot_duplicate_intake.sql` | `eabb4914d03924c0bcbfb58db7c3fa60efcfe49de502e1fa0587666c887188d2` |
| `20261107155000_kinnso_pilot_stored_intake_identity.sql` | `13e49add8e9e57c32c337df8fa92ff268a749631282be32542b2c02412734588` |
| `20261107165735_kinnso_pilot_final_review.sql` | `a5e22ecdd44bdecb55c78a8fa188b9f0d7664ef8e0b3c7be71bbae8b7dc74885` |

The prior production receipt records application rollback deployment `dpl_BZDa82gXNB7KGJeZzjvhBSTB6TtP`, source `950d08b2011f1c23265a193b8f7adc377a44eb26`, ledger 209/head `20261107020000` and pilot excluded. This is historical evidence only, not a current read or a database rollback plan. Do not infer production migration delta from ledger counts. No production change, push, deployment, capability activation, provider use, real participant/content or external message occurred. Backup/restore is WAIVED_BY_USER, not passed.



Release JSON SHA-256 (exact Windows checkout UTF-8 CRLF file bytes): `55b84c33a71573d9bbb8585316146b9d61849f001974ed80185a7aa951ed63c7`.
Release Markdown SHA-256 (exact Windows checkout UTF-8 CRLF file bytes): `b655fb009651a73adae55fe2cbf66d84c35cba9537920532c8d5455bcf94dc7a`.
Evidence manifest SHA-256 (exact saved UTF-8 bytes): `57d85c307c844d00bb2fec4bb67c45827e6a37de73f45407420d02a03b441109`.


Committed packet Git-blob hashes (LF bytes, distinct from the checkout hashes above):
- `PILOT_CONTROL_ROOM_RELEASE_2026-11-07.json`: `75eb91304d5c1f0ebe032282db2e3d6604cccf316a19b20d9a7cf53c7cec965d`.
- `PILOT_CONTROL_ROOM_RELEASE_2026-11-07.md`: `4647e6c81423d364d344431b4aaaba6aa042a5ee2b9792c67bc071082e05f3ea`.

The new SQL migration was CLI-created with explicit reviewed function definitions. `supabase db pull` unexpectedly reported no schema changes for function replacements; the exact full replay plus ledger/advisors/integration is the migration proof. The earlier baseline advisors were recorded in task11; this wave reran current advisors and compared all warning keys. Cleanup used exact fixture IDs with preserved journals, **43 predicates per pilot scope and 7 operations predicates**, then aggregate readback **44 tables / residue 0**. No reset was used to hide residue.

## Narrow decisions and remaining concerns

- The role-bundle reauthentication case also failed: Query was absent and the page said service not connected. The local enabled-capability list excluded agent; this is a missing matrix prerequisite, not established evidence of a product regression. No provider/capability activation or test retry was performed.
- Connected acceptance is BLOCKED: the only matrix ran at source 8f64c1b32a8d893b535d06782169d6a511e6a665 and had 71 pass / 2 fail. The happy journey timed out before any intake was saved. Its finally-block context-close error obscures the exact active wait, so a specific timeout cause is not conclusively established. A static diagnostic found 0 exact-label matches and 1 exact combobox-role match for both Rights basis and Cover rights. Both locators were corrected; no retry or second matrix was run under the explicit one-run/no-retry constraint.
- The final source differs from the matrix source only in the two dropdown selectors and an accurately scoped presentation test title. Application and migration Git blobs are unchanged, but this does not prove the remaining UI journey or a final-source connected pass.
- The new final-source default build passed but was not used for another connected matrix. The earlier served build identity and failed result remain preserved separately.
- 67 existing advisor warnings remain (13 security, 54 performance); no added or removed keys against the recorded task11 fresh pre-pilot baseline.
- Legacy acknowledgement commands may omit an ID for compatibility. The new UI always supplies the exact server-selected ID; supplied mismatches fail.
- The 20-slot maximum includes retired historical slots. Individual completion is forbidden; completion transitions required active slots with the same audited run command after checks pass.
- The composite digest intentionally invalidates older pilot approvals until exact re-review. Empty cover URL means no cover; a nonblank cover requires cover-rights evidence.
- The operator draft preview is scoped read-only structured JSON, not a visual guide renderer.
- Supabase db pull reported no schema changes despite function replacements. The CLI-created explicit migration was reviewed and proved through full exact reset/readback and 59 integration passes.
- Windows skips, real consent/content, hosted deployment, physical devices and assistive technology remain independent evidence gaps.

Completed runs remain retained; no automatic retention or deletion term. Approve exact EN and zh-HK notice bytes/digests, processors, owner contacts, retention/redaction and escalation workflow before collecting real information. Keep exports restricted and free of private text and raw invite material.

Production unchanged; deployment UNVERIFIED; Journeys UNCHANGED; real participation BLOCKED; physical iOS/Android, VoiceOver and NVDA BLOCKED/NOT_RUN; public launch HOLD. Exact notices, named owners and privacy/retention/real-participant approval remain external gates. Backup/restore remains WAIVED_BY_USER. No push, production mutation, provider activation or participant contact occurred.

## Deliverables

- Release MD/JSON: `docs/implementation/PILOT_CONTROL_ROOM_RELEASE_2026-11-07.md` and `.json`.
- Report: `.superpowers/sdd/2026-11-07-kinnso-pilot-control-room/final-fix-report.md`.
- Final build and canonical archives plus preserved failed-matrix runtime: `.local-private/final-fix/`.
- Exact log hashes: `.local-private/final-fix/evidence-manifest.json`; migration/source receipts, aggregate cleanup and advisor comparison alongside it.
- Private synthetic fixture journals remain local and excluded from source/public artifacts.
