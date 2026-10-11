# Creator / Merchant operations release packet

M2 remains NO_GO. This packet is a reviewable preparation artifact, not a migration, merge, capability activation, pilot or release approval. The current code candidate is the exact reviewed PR #65 head and its validated native CI merge/tree; resolve those from retained CI artifacts at the final freeze. PR #65 depends on #63, which depends on #59; #61/#62/#64 are normally merged into the continuation without rewriting history. PR #55 remains a prerequisite until its current reviewed head is merged.

## Candidate and source

Use the current PR head, workflow head, tested merge parents/tree, source ZIP SHA256 and extracted rebuild evidence together. Any code change invalidates affected gates. The nine source migrations against main are frozen individually in [CREATOR_MERCHANT_OPERATIONS_MIGRATIONS.json](CREATOR_MERCHANT_OPERATIONS_MIGRATIONS.json); hosted catalog reconciliation may prove a smaller necessary delta. Do not execute the source list wholesale without that comparison. Root SQL is intentionally outside the Journeys source ZIP and requires this separate reviewed packet.

| Ordered source file | SHA256 | Hosted |
| --- | --- | --- |
| `supabase/migrations/20261010190752_kinnso_creator_collaboration.sql` | `2ee6af97838634aa0f38149152e88831b12a3cfc66e31f091216def7c5bdd881` | NOT_RUN |
| `supabase/migrations/20261010190758_kinnso_merchant_campaign_lifecycle.sql` | `f87e1cbb15cc7c2c9b03358a86e9d227a521dc4ddfb3b5582a05c51de7b38a26` | NOT_RUN |
| `supabase/migrations/20261010190951_kinnso_merchant_onboarding_profile.sql` | `12729159686cf5b8272b593d693540b5393d3ea7c4098916e066db79e0374ed2` | NOT_RUN |
| `supabase/migrations/20261010213700_kinnso_campaign_schedule_terms.sql` | `8eb3efca4c192bc8f2d11926cb0a4b9485d00f2aa5954c8c268ac3ee8548ba6e` | NOT_RUN |
| `supabase/migrations/20261010223500_kinnso_creator_discovery.sql` | `f09eabe33e2b840828117f73028eb97aab013d5fa31d6a2656ed55e6eec469f1` | NOT_RUN |
| `supabase/migrations/20261010230000_kinnso_collaboration_list_queries.sql` | `aa0dd7d70a729999caaa4386aec444e40ea98b4e1f30d8fc18fffeb9916807c7` | NOT_RUN |
| `supabase/migrations/20261010233500_kinnso_collaboration_reminders.sql` | `f9632046e880d49edf79496bada9298d6988ae50eb8d1dd3e71a8df4b826ffff` | NOT_RUN |
| `supabase/migrations/20261010234000_kinnso_collaboration_support_context.sql` | `404e2c882d7f745304c66fdd4ba1ee0a952b752a3cb3a6f2a80b5ca202662181` | NOT_RUN |
| `supabase/migrations/20261011004000_kinnso_merchant_insights.sql` | `fd8568daadd79140ad3a710d47cf4329652418ea7b099f8607b3fb5aab1ec46a` | NOT_RUN |

## Missing target and acceptance inputs

| Input | State | Required next action / owner |
| --- | --- | --- |
| Designated staging project, origin and ownership | BLOCKED_TARGET | Human deployment owner supplies exact non-production target; verify effective schema/config read-only |
| Two creators and two company owners | NOT_ASSIGNED | Pilot owner nominates consenting authorized actors and data |
| Moderator / marketing / clerk / finance | NOT_ASSIGNED | Access owner assigns test actors through separately authorized scope; verify owned success and foreign denial |
| Three real original guides and lawful covers | BLOCKED_CONTENT | Authors provide consent, version, days/stops/source/language/verification date/cover rights |
| iOS Safari / Android Chrome / VoiceOver / NVDA | NOT_RUN | Human device/AT owners perform named stories; emulated Chromium does not substitute |
| Candidate recovery export/restore/rehearsal | NOT_RUN | Recovery owner supplies consistent export within one hour and isolated failure/commit/postcheck exercise |
| Production mutation and final release decision | NOT_AUTHORIZED | Exact target/hash/scope/recovery/time-window packet only after all necessary gates |

No booking, payment, withdrawal, refund or provider sending capability is enabled by these PRs. Do not copy CI seed/reset/cleanup into a hosted DB. The current production-only configuration observation does not certify preview effective flags/Auth/schema.

## Ordered pilot

After P04/P05 target gates, verify the same durable records through find/save creator → invitation/application → acceptance → proof → revision → approval → report/earnings → support. Include a foreign-company forbidden case, current-role revocation, stable pagination, exact same-currency amounts, lost acknowledgment reconciliation and private evidence denial. Record source, actor role, target, timestamps, request receipt, expected/actual result and cleanup for each case. Named human acceptance is separate from owned synthetic CI.

## Scheduled job ownership

| Job / feature | Source behavior | Hosted state and safe recovery |
| --- | --- | --- |
| Collaboration reminders | Service-only bounded deadline scan, private fact dedupe and notification in one transaction; 50-row pages, 10 pages /20s budget; incomplete response retains prior cursor | Owner/token/canonical origin/schedule NOT_ASSIGNED; no hosted dispatch. Read last execution and cursor before explicitly scoped retry; notification acceptance is not delivery |
| Existing notification delivery | Existing leases, attempts and provider receipts | Sending not activated; retain uncertain leases and reconcile provider state before any separately authorized retry |
| Operations performance CI | Dedicated owned localhost synthetic fixture with explicit dataset/route/role/sample/cleanup denominators | CI is not a hosted scheduled job or a production monitor |

## Migration and rollback gate

Follow [NEXT_PHASE_RELEASE_GATE.md](NEXT_PHASE_RELEASE_GATE.md), [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md), [MIGRATION_RELEASE.md](../../scripts/MIGRATION_RELEASE.md) and notification/finance acceptance contracts. Before any SQL request: review exact effective owners/grants/RLS/function definitions/roles/catalog; freeze only the necessary ordered file bytes and envelope hash; confirm a consistent export no older than one hour; restore those same bytes in an isolated target and exercise injected failure, commit and postcheck. Persist one exclusive execution claim before the transaction. Missing acknowledgment or timeout keeps the claim and requires read-only reconciliation before any retry. Confirmed COMMIT still requires fresh catalog readback.

Record a current last-good deployment and alias before application promotion. Stop expansion for cross-account access, save loss, duplicate business writes, incomplete denominators or thresholds without an approved measured baseline. A separately authorized incident may disable the reviewed capability or restore the exact compatible application. Preserve durable rows, receipts, memberships, proof/review history and unknown notification leases. Application rollback is not data restore; never blindly reapply old functions or remove populated schema.

## Current limitations

P16 first actual lab failed fixture setup with PGRST204 and zero samples; failure and successful actor cleanup are retained. Corrected061 source produced880 valid latency samples, but2 merchant SQL groups failed because shared authorization locks are incompatible with READ ONLY. The browser collector produced0 samples because its Chromium sandbox could not start; both results remain INCOMPLETE and cleanup passed. The owned performance job is pinned to Ubuntu22.04 while retaining the sandbox and ImageOS/kernel metadata; different OS samples are not comparable. A complete current-source baseline is still required before optimization or a budget. P17 now covers actor-bound same-device recovery for creator applications/evidence, merchant campaign drafts/reviews, support and finance; explicit logout/account switch intentionally clears local private caches. Device storage denial blocks new writes, and raw invitation/redemption tokens are not newly journaled. Broader unknown-recovery edges remain open until tested. Forced termination before an async local save is not guaranteed lossless. Source package local Windows symlink creation is an explicit permission skip; native Ubuntu source gate remains required.

## Historical N increments

N09/N14/N15/N16/N17/N18 receive this operations increment without replacing historical Oct7 evidence or closing U01–U06. Current final code/CI receipts are appended in the operations ledger and PR #65; P04/P05/P06/P13/P18 hosted, content, human and release gates remain independently open. No prior READY, CI count or HTTP200 certifies this candidate.

## Final source review

One fresh whole-branch review of061c5f4 against68df690 found0 Critical,6 Important and1 Minor. The Minor was regraded Important after reproducing a confirmed-receipt path that could permanently freeze the support workspace. All7 have valid RED tests and were fixed in one pass;19 focused tests,4 actual IDB boundaries and508 unit tests pass locally. Final native/source CI remains required. Every finding, decision and declined judgment with its cost is retained in the operations ledger; no second review is used to replace current acceptance. Terminal failure atomically releases only the request and keeps its draft. Unknown authorization denial preserves original UUID/payload while clearing private UI, and scope changes require fresh company authorization.
