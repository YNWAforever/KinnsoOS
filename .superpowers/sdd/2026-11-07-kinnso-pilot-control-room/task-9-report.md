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
