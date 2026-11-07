# Task 9 — Capability and route integration

Status: DONE_WITH_CONCERNS (full unit run hit a Windows hard-link permission error).

Base: a5093c86cac6987a15386eea3fbe602e01e159fa.

- Registered the private, session-bound pilot capability. It requires an approved backend and explicit enablement; no environment file or setting was changed.
- The locale page passes the pilot gate in both Workbench feature maps. Exact EN and zh-HK participant routes render the existing workspace, including when disconnected. Unknown pilot descendants and the demo alias return 404.
- Exact Ops entry delegates the pilot query through OpsWorkspace, requiring both Ops and pilot gates. Disabled entry shows disconnected copy even without a session. Existing API authorization and other Ops views are unchanged. Pilot navigation stays out of the public header; the Ops link requires pilot enablement and a successfully loaded Operations queue.
- Added a server page entry test to the source manifest and extended capability, routing, and retired-host coverage.

## RED

From apps/journeys: `node --experimental-strip-types --test --test-reporter=dot tests/capabilities.test.mjs tests/consolidated-origin-navigation.test.mjs` exited 1. Four expected failures: pilot returned undefined instead of unavailable, exact page admission was missing, the participant workspace was not wired, and Ops did not pass separate exact-path and pilot gates.

## GREEN

- Same focused command after implementation: 14 passed.
- Expanded focused command with `tests/pilot-page-entry.test.mjs tests/ops-filters.test.mjs tests/pilot-control-room-ui.test.mjs tests/pilot-participant-ui.test.mjs`: 31 passed.
- `npm run typecheck`: passed.
- `npm test` run once, with TEMP and TMP set to the repo-local task-9-tmp directory: 1,575 total, 1,567 passed, 7 skipped, 1 failed. The unchanged subset-recovery-report test “hard-linked artifacts cannot borrow files from another ownership scope” failed at line 117 with EPERM on the link syscall. The failure occurred creating the test fixture.
- `git diff --check`: passed.

Self-review checked exact dispatch, the disabled and signed-out states, account invalidation, legacy route guards, manifest coverage, and navigation visibility. The server route test exercises real page dispatch with external dependencies stubbed. No live browser, authenticated backend, production service, database, credentials, deployment, or capability activation was used.

## Round 1 — Behavioral route regression coverage

Replaced the pilot source-pattern assertions with a route integration harness that executes the real locale page, Workbench, OpsWorkspace, PilotWorkspace and PilotControlRoom. Next routing and dynamic loading, unrelated UI and external reads are stubbed. Kept the server dispatch and 404 tests and the existing retired-host guard.

The integration tests cover both participant locales, pilot independence from trips, the exact Ops query and run ID, both independent gates, wrong Ops path/view, disabled and signed-out entries making no private requests, and ordinary-account navigation on home and in the denied Ops queue. Both participant and Ops invalidation are exercised with a read in flight: participant aborts the request, Ops drops the late result, and neither restarts a read for the invalidated actor.

- RED: Ran only “only exact Ops pilot query starts control-room reads” on a temporary test copy with the router query suppressed. It exited 1 at “exact Ops pilot query must delegate to the control room.” The temporary copy was removed.
- GREEN: Ran capabilities, consolidated-origin-navigation, pilot-page-entry, ops-filters, pilot-control-room-ui and pilot-participant-ui with Node's test runner: 33 passed. `npm run typecheck` and `git diff --check` passed.
- This round changed only tests and this report. No full unit rerun, browser launch, database, production access, or deployment.
