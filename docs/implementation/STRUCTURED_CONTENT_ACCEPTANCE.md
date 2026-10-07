# Structured content and first-wave acceptance

N07, N09 first wave and N13 first wave retain the existing catalog, creator publication, device import and account trip services. No summary text is converted into an itinerary. Existing destination alias and locale-path tests remain required.

Home now separates anonymous browsing from an authenticated account, retries a failed catalog request, translates interface chips/banner, and displays only the existing server-approved cover DTO. Missing or failed covers retain a readable destination, title and author. Retry does not repeat private trip loading or return-visit recording. Guide pages distinguish summary reading from structured adoption, identify authored original text, and label missing update/opening-hours metadata. Publication timestamps remain publication timestamps, not inferred update dates.

## Bounded public observation

The anonymous production sample at 2026-10-07T19:16:53.897Z inspected three entries from the first catalog page and their public guide DTOs:

| Public guide ID | Kind | Version | Days/stops | Authored locale | Approved cover |
|---|---|---|---|---|---|
| e1c2820d-25e5-9795-54b5-637be546e04a | summary | absent | 0/0 | not exposed | absent |
| 7559c30e-083f-5db5-d9c8-3d68cb242ce9 | summary | absent | 0/0 | not exposed | absent |
| 30d760a5-1ee5-3416-b122-dd9edc7012d7 | summary | absent | 0/0 | not exposed | absent |

Each response was 200; that establishes public reading only. The sample does not describe the whole catalog or establish content/image rights. At least three author-verified real structured publications and their rights review remain content-blocked. No synthetic guide was published to production.

## Isolated persistence evidence

The ownership-verified local project is `kinnsoos-b1-20261002`, API localhost:58421 and Journeys localhost:3495. Five focused browser regressions pass with synthetic fixtures: English/Traditional Chinese Home retry/covers/320px overflow, English/Traditional Chinese summary metadata, and creator-to-traveller persistence.

The persistence test uses manual onboarding, UI draft creation, saved revision changes and explicit version publication. A separate anonymous context searches that publication, saves an actual IndexedDB copy and private note, and registers through Journeys. The server has zero trips before explicit preview/confirmation. Repeating import retains one trip. A fresh browser context signs in and reads the server trip; the test verifies its database owner, authored stop and private note without a guest-draft database.

UI “Withdraw adoption” intentionally retains a readable summary while closing structured adoption. Full unpublication is a separate local fixture transition, scoped to that test's guide and creator IDs. Its public API then returns 404, and the persisted traveller copy/note remains readable. This does not claim a new unpublish UI or a production content operation.

The local Auth target has confirmation disabled. The registration result does not prove real email delivery. Prior synthetic OTP/recovery checks, cancellation, retry, source-withdrawal repair and A/B isolation regressions remain required. Formal U01/U03 with named identities/mailboxes and real content remains blocked.

## Verification and release boundary

At source `012841d5529a990f9969dcc8e1c57eefcffcc720` ([PR #27](https://github.com/YNWAforever/KinnsoOS/pull/27)), clean-tree build/typecheck, unit302, integration28 and complete connected browser72 pass on the ownership-verified isolated project. Collector artifacts retain that actual SHA, target and nonzero counters. Focused browser5 also passes. Windows source-package5 passes with1 platform skip; that skip does not replace the Linux extract/install/rebuild CI gate. Private evidence includes failed runs, corrected test synchronization, raw traces, and English/Traditional Chinese `home-320.png` screenshots. Failed runs stay failed.

The ledger separates source, merge, runtime and acceptance. CI artifacts bind actual checkout SHA and dirty state; neither CI nor the unchanged production baseline 58507ef is formal role acceptance for these candidates. PRs remain held while applicable current-head checks are pending. Native author review is recorded and is weaker than an independent review.

Root CI has conflicting environment evidence at source039b97d: push run37685207224 passes the actual profile-enquiry test; PR run37685221814 returns404 on the synthetic creator route twice. The unchanged local012841d enquiry-to-ops journey passes1 test. The cause is unresolved, and a failed-job rerun is pending. Additional fixture diagnostics require a selected updated row, verify the real anonymous projection, and assert the actual page response before submission. They retain the enquiry/ops persistence, role and cleanup assertions; no fallback profile, production write or relaxed gate is introduced.

Rollback this UI/test PR without deleting IndexedDB or server trips. There is no new schema, provider, paid-service or flag change in this task. Separate N06 empty-draft SQL and N05 recovery-secret/provider configuration gates remain pending. Hosted human, physical iOS/Android, 200% text and NVDA/VoiceOver acceptance remain unverified.
