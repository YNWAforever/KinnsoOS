# Nightly read-only evidence retention

N01/N18 remain **PARTIAL**. Code source `2d0d9381845b577024f4d86b05d0edf4cc165d3f`, based on main `513b8c871f2551fb0989718017fdc73c2e5dc311`.

The existing legacy [nightly run 38010991911](https://github.com/YNWAforever/KinnsoOS/actions/runs/38010991911) succeeded at the base SHA and retained zero artifacts. Successful runs therefore could not be audited from their artifacts. This increment retains Playwright JSON/HTML and aggregate sitemap receipts on both success and failure.

The original target `https://remix-kinnso-web.vercel.app`, schedule, permissions, concurrency, pinned actions, dependency setup, test selection and `BOOKING_LIVE=false` remain unchanged. The workflow continues anonymous read-only legacy checks plus an explicitly labelled intercepted funnel fixture. It does not prove Journeys runtime or signed-in acceptance.

Receipts verify checkout SHA against the workflow source and the actual report's origin, source, run ID and attempt. They preserve discovered counts, failures, skips and flakes separately. A skipped or cancelled command cannot reuse an existing report as executed evidence. Missing, malformed, empty or contradictory successful funnel evidence fails the evidence step; existing command failures remain failures. Sitemap counts are checked URLs and failure records, not invented pass counts. Sitemap JSON contains no raw URLs, response bodies or error strings.

`runtimeSourceRevision` stays `NOT_CHECKED`, and both signed-in and Journeys role acceptance stay `NOT_RUN`. A checkout SHA identifies the checker source, not the deployed remote runtime. Upload success or a green nightly cannot close those gates.

## Local verification

All final code checks ran from the clean code SHA above with frozen pnpm dependencies on Windows, Node 24.18.0. No hosted fixtures or provider writes were used.

| Check | Actual result | Scope |
| --- | --- | --- |
| New nightly contracts | 24 PASS, 0 FAIL/SKIP | Meaningful RED-to-GREEN origin/source/run/attempt, count, missing report, skip and real loopback crawler controls |
| Complete root tooling | 57 PASS, 0 FAIL/SKIP | Native Node tooling, including the new contracts |
| Journeys unit / build / typecheck | 339 PASS, 0 FAIL/SKIP; build/typecheck exit 0 | Local source verification |
| Existing sitemap / browser-artifact tests | 15 PASS, 0 FAIL | Explicit unit mode with injected fetch/contracts; not DB integration |
| Actual Playwright funnel fixture | 2 PASS, 0 FAIL/SKIP/FLAKY | Loopback intercepted HTML, source-bound JSON; not hosted or signed-in UAT |
| ESLint / e2e typecheck | Exit 0 | Changed CLI/config scope |
| Parsed workflow comparison | PASS | Outside the declared reporter, receipt and retention changes, original workflow semantics match |

Earlier setup failures are retained separately: missing Turbo before dependency setup, two unit-mode attempts missing `SUPABASE_URL`, lint errors corrected before the final run, and a private verifier expectation that omitted Playwright's automatic `actualWorkers` metadata. They are not counted as product RED or final passes. Product RED controls were independently observed before their fixes.

## Remaining gates and rollback

At this documentation checkpoint the final PR head's Linux Root/Journeys CI and configured current-head review are pending. The candidate hosted nightly has not run. After any green authorized merge, inspect the next normal scheduled run's actual artifact, source, attempt, resolved target, command outcome and denominators; retain failures/skips rather than infer acceptance from job status. Do not use the intercepted fixture as real content or role UAT.

Revert this focused increment to remove the additional evidence collection. Preserve historical artifacts and original failure records. No database, capability, provider, credential, indexing, production booking/payment or application flow changes are included.

## Configured review correction

Current code increment `4beae1aaa34737684b7598a4e7450a0d55b62156` corrects finding [4236746985](https://github.com/YNWAforever/KinnsoOS/pull/49#discussion_r4236746985). The earlier implementation accepted zero checked sitemap URLs as valid success. Three true RED controls, including actual loopback empty XML and HTML crawler output, demonstrated the error. Receipts now mark zero checked URLs `EMPTY`; a successful command cannot satisfy the evidence gate with that result. Original counts and failures are retained. The allowed origin is substituted only in the receipt unit controls; those tests claim no remote crawl.

All 27 evidence controls and the complete 60 root tooling cases pass with no failures/skips at the clean code SHA; Journeys 339 unit tests, build and typecheck pass at that SHA. Earlier 24/57 counts above remain historical. The original head `84e7750` root push failed profile enquiries with Next dev JSON parse errors; its failure artifact is preserved, its cause is unconfirmed. The original root PR passed, but that does not validate the corrected head. Fresh Linux CI and current-head configured review are required. Hosted nightly and role UAT remain `NOT_RUN`.

Latest-main integration: native60tooling PASS0FAIL0SKIP against the main02cac8b combination. All five existing N18 source/config blobs are identical to1e87155; Journeys application subtree matches verified main02 exactly. Both append-only traceability increments and all18tasks/53mappings are preserved. Current integrated-head CI/configured review are fresh gates. Scheduled hosted nightly, formal role/U06 acceptance remain NOT_RUN; no nightly dispatch or production operation was performed.
