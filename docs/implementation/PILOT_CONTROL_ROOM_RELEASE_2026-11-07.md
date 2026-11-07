# Pilot Control Room final fix packet

**BLOCKED_CONNECTED_ACCEPTANCE. Fixes committed with a validation gap. Production unchanged and candidate deployment UNVERIFIED. Journeys UNCHANGED. Real participation BLOCKED. Public launch HOLD.**

## Outcome and exact identities

This packet supersedes the earlier READY_FOR_USER_REVIEW result. The single final fix wave began at `2d8fce332bccbb6d4628f26dd3a0da75d3c46999`. Implementation source `8f64c1b32a8d893b535d06782169d6a511e6a665` was clean-built and served as `lem8OcSMklC65xoay8fQH` (tree `b7b6802f4dd28605fb344db785342f4a5d113e2a`). Its sole fresh connected matrix executed 73 cases: **71 passed, 2 failed**, no retries or reuse. The happy journey timed out before saving the first intake; a context-close error in finally obscured its exact active wait. The separate role-bundle case failed after reauthentication because the local agent capability was disabled and the page showed service not connected. Remaining connected intake/review/acknowledgement/support/withdrawal steps are **NOT VERIFIED** by this run.

The final source `cae18527a9dfa2c37e1ed2022abf640ea8ac4095` (tree `1312cc68c06fa11e987cc8509287c736dad4842e`) corrects the two dropdown selectors to exact accessible combobox roles and narrows a presentation test title to what it asserts. The application and SQL blobs are unchanged. A static HTML diagnostic confirmed 0 exact-label matches and 1 combobox-role match for each dropdown. The failed test was **not retried**, respecting the one-matrix/no-retry constraint. This correction is not claimed as a connected pass.

Final `npm run build` passed on Next 16.3.8 using supported Webpack, 73/73 generated entries, build `3TtlBRHqox9YapCQP0xRO`. This final build was **not** used for another connected matrix. The subsequent release packet/report commit is documentation-only.

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

## Concerns and remaining gates

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

Exact approved EN/zh-HK notices and hashes, named support/privacy owners, processor and retention/redaction decisions, and consented real participants/content remain BLOCKED/NOT_RUN. Physical iOS/Android, VoiceOver and NVDA remain BLOCKED/NOT_RUN. Completed runs remain retained; no automatic retention/deletion term is introduced. Exports exclude private text and raw invitation material.

The final connected happy journey requires fresh evidence before acceptance can be cleared. Push, deployment, target migrations/capabilities and real participation require separate authorization with target preflight/rollback. Public launch remains HOLD.

Detailed evidence is in `.superpowers/sdd/2026-11-07-kinnso-pilot-control-room/final-fix-report.md`; aggregate logs/receipts and private archives are under `.local-private/final-fix/`. Private fixture journals are excluded from source/public packet artifacts.
