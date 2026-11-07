# Pilot Control Room release packet — 2026-11-07

**Isolated candidate: READY_FOR_USER_REVIEW. Real participation: BLOCKED. Public launch: HOLD.**

Branch `codex/single-origin-design-20261105`. Tested source `56161e2f6636850a5dac607738c419db1ba8f232`, tree `7781886e2618542ae3e62f1e0f08ba94e2c8ff4d`.
Attested Next.js 16.3.8 Webpack build `MDmYdK-8eWzfQzUzhN8M6`; archived source SHA-256 `09ce1545dc9b3750b180643f96d3354858e927e7a6271fb717301b8c241420cb` (715 inputs, clean source metadata). The build archive reflects Windows checkout bytes; the database used exact canonical SQL. The packet commit adds documentation and corrects the source package manifest; it does not replace the tested runtime identity. See the final tree receipt in the task report.

## Isolated migration envelope

Disposable project `kinnsoos-public-it-20261106`, loopback API 59721 and DB 59722, container `supabase_db_kinnsoos-public-it-20261106`. Ownership was verified before reset. No seed. The ledger matched 211 unique versions, head `20261107155000`; the seven pilot versions each appear once. All 211 staged migrations were verified against their Git blobs.

| Migration file | SHA-256 of exact Git bytes |
|---|---|
| 20261107081531_kinnso_pilot_control_room_schema.sql | `74c523d0c672925f39b4f51950b0fa7971ab497f38d3bf4820f3c0d9bd7adbc0` |
| 20261107085017_kinnso_pilot_control_room_rpcs.sql | `a217f40afc932e16e318a55773cc0018d2b575ebf61a02cfa22be60eab319e68` |
| 20261107110059_kinnso_pilot_readiness_publication_contract.sql | `b2702fdaa41963f2f1b44045a22d371e23c7867e695e380b199a1ed1ee2245e0` |
| 20261107135337_kinnso_pilot_traveller_support_context.sql | `d611bea3668888d7366544ab481d6bc14bc15e553a1ae18bf7e2b32c9616818e` |
| 20261107145100_kinnso_pilot_opaque_evidence.sql | `246579588dd27726de6d32076ca42512069d5b587758040bbae6c35ebf845b6d` |
| 20261107152000_kinnso_pilot_duplicate_intake.sql | `eabb4914d03924c0bcbfb58db7c3fa60efcfe49de502e1fa0587666c887188d2` |
| 20261107155000_kinnso_pilot_stored_intake_identity.sql | `13e49add8e9e57c32c337df8fa92ff268a749631282be32542b2c02412734588` |

Envelope SHA-256: `a47fc2f30279058b59915da813027e1c6b3e75f3366133738ac87205fc40a2a0`. Encoding: UTF-8, ascending version, each LF-terminated line contains version, filename and lowercase SHA-256 separated by single spaces. This identifies the migration set; it is not a production execution script.

## Final gates

- Unit: 1,583 passed, 2 skipped, 0 failed (1,585 total). The initial run reported 1,577 passed, 7 skipped and 1 Windows hard-link failure; a local rerun with the required permission passed.
- TypeScript: 1 gate passed. Default production build: Turbopack failed on the external dependency junction. Webpack production build passed and generated 73/73 entries. Source package: 11 passed, 1 expected Windows symlink skip, 0 failed.
- Advisors: 67 warnings (13 security and 54 performance), no errors. All 13 security keys match the prior pre-pilot baseline. None names a pilot object. Fresh exact pre-pilot replay: 67 keys; 0 new, 0 removed. Canonical 211-version ledger restoration: PASS.
- Isolated integration: 50 passed, 0 failed or skipped. Includes RLS, direct grants, function ownership, exact evidence and request replay.
- Chromium: one worker, no retries, fresh server. Only the final canonical migration run appears in the table. Earlier interrupted attempts remain separate in the JSON and task report.

| Chromium suite | Passed / expected | Failed |
|---|---:|---:|
| account-recovery | 3/3 | 0 |
| creator-workspace | 20/20 | 0 |
| inbox-support-workspace | 1/1 | 0 |
| u04-merchant | 4/4 | 0 |
| u06-accessibility | 1/1 | 0 |
| u06-ops-content-admin | 1/1 | 0 |
| u06-role-bundle | 3/3 | 0 |
| u11-workspace-recovery | 2/2 | 0 |
| u25-public-accessibility | 36/36 | 0 |
| u26-pilot-control-room | 1/1 | 0 |
| u26-pilot-security | 1/1 | 0 |

Both pilot scopes use synthetic accounts and content. Exact cleanup predicates reported by the happy and negative specs: 43 and 43. Exact operations fixture cleanup: 7/7. Separate desktop Chrome presentation run: 49/49 passed (0 failed), with stubbed transport, including EN/zh-HK keyboard, focus and reflow. Browser accessibility is desktop automation; physical iOS, physical Android, VoiceOver and NVDA remain BLOCKED/NOT_RUN.

## Design and earlier evidence

| Design scope | Evidence |
|---|---|
| Intent, approach, goals, non-goals, scope and composition | Task 4 readiness and exact-run integration; Tasks 10A/10B connected synthetic scopes. The real-classified replay uses fixtures and cannot satisfy real participation. |
| Invitation, consent, replacement and onboarding | Task 7A exact notice/digest and replay checks; Task 8 presentation; Task 10B connected claim, account invalidation and cross-scope denial; SQL covers expiry and concurrent claims. |
| Content rights, approval, collaboration and traveller work | Task 5 forward readiness/publication contract, Task 7A intake boundaries, Task 10A connected approval through discovery, adoption, trip recovery and scoped support, Task 10B foreign writes and stale approvals. |
| Operations, lifecycle, data model, API, database, readiness, security and concurrency | Tasks 3–6 and 9 plus exact reset, pilot SQL, both pilot Chromium specs and their cleanup. These cover current roles, RLS and direct grants, digest/version, acceptance window, audit/idempotency and pause/revoke races. |
| Accessibility, metrics, evidence and alerts | Task 8 established EN/zh-HK presentation and keyboard/focus/reflow coverage. Task 11 reruns that presentation matrix separately, plus public and connected accessibility. Tasks 4, 6 and 10A exercise scoped readiness and allowlisted export; owner routing and physical/assistive technology checks require external evidence. |
| Testing, approval, rollout, rollback and handoff | Task 11 isolated regression, exact release envelope, recorded previous deployment and explicit next approval gates. |

Tasks 7A–10B are historical supporting evidence. Task 7A's final focused run passed 68 tests and its corrected isolated run passed 48. Task 8's final presentation run passed 49 and Task 9's routing check passed 33. Task 10's unattested run was 3/4 with a logout timeout; Task 10A and 10B later established attested acceptance. Task 10B's review rerun on this source previously passed 73 Chromium and 50 SQL cases. These counts are separate from Task 11.

## Production and approval

Task 11 did not push, deploy, change production or enable any production capability. It used no real participant, sent no participant message and activated no external provider. The prior rollout receipt records `dpl_BZDa82gXNB7KGJeZzjvhBSTB6TtP` at `950d08b2011f1c23265a193b8f7adc377a44eb26`, ledger 209/head `20261107020000`. This is the recorded application rollback target, not a fresh read or a database reversal plan. The isolated ledger is a repository replay; the recorded production ledger includes production history and cannot be reconciled by subtracting counts. Preserve the recorded production-only entries and mapping and require a fresh, separately approved target preflight.

Recorded production capabilities: `trips, bookmarks, creator, merchant, ops, notifications`. Keep `pilot` excluded. Journeys deployment unchanged. Backup/restore: **WAIVED_BY_USER**.

Completed runs are retained; the candidate introduces no automatic deletion period. Before any real collection, obtain the approved EN and zh-HK notice artifacts and hashes, named support and privacy owners, processor and retention/redaction decisions, and consented real participants and content. Keep export access restricted and include only allowlisted fields and opaque references. Physical iOS/Android and VoiceOver/NVDA are BLOCKED/NOT_RUN.

Next approval: review this isolated candidate. Obtain separate authorization for a push, exact production migration and deployment plan for the seven hashed files with a target-bound preflight and rollback, capability activation, and any real intake or participant contact. Public launch stays HOLD until external gates pass and launch is explicitly approved.
