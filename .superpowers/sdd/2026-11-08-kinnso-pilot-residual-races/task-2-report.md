# Task 2 — residual race release validation

**READY_FOR_USER_REVIEW**. Tested commit `773db0961153eeb3f03a4802791573ef6bd9ff9f`, tree `56f3dc84326e1f241be76aa670fe1204b760905a`, build `E4cIIBrHzL9j9JlLUzIEp`. Base `b5fcbcb178f8b3d7957d58e5392daf983a28becd`. No subagents. Reviewed the task brief, Task 1 report and both reviews, prior packet, AGENTS/RTK, installed Next CLI guide, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and [Postgres locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## RED evidence (historical Task 1)

The Task 1 report and reviews record the original failing unit, SQL and presentation cases: unbound withdrawal, stale withdrawal returning INVALID instead of CONFLICT, missing edit revision, missing edit RPC and retry revision, wrongful denial of ordinary unconfirmed publication, and a stale edit succeeding after row deletion/recreation. The baseline commands were the focused Node unit test on withdrawal/session mutations, the integration test with --test-name-pattern for stale withdrawal, unconfirmed publication and lost edit response, the focused Playwright lost-edit presentation case, and the later integration stale delete/recreate case. The row-lifetime re-review approved the correction. Task 2 did not revert or weaken assertions or include historical runs in its counts.

## GREEN commands and results

Commands below ran from `apps/journeys` unless marked otherwise. Exact logs and hashes are in the JSON packet and `.local-private/task2/`.

- `npm test` with Windows process access and worktree-local TEMP/TMP: 1591 passed, 2 skipped, 0 failed.
- `npm run typecheck` and default `npm run build`: PASS. Attestation captured clean HEAD/tree before and after build; the connected server verified the served identity.
- `python -m unittest discover -s tests -p source_package_test.py`: 11 passed, 1 Windows symlink skip. The default build regenerated the runtime ZIP; the canonical archive was regenerated independently and all members verified.
- `node --env-file=.env.test scripts/verify-test-target.mjs`: owned loopback stack verified. Supabase CLI `db reset --local --no-seed`, `migration list --local`, and `db advisors --local --level warn --type all --output json` ran with the isolated project workdir. Exact 213 Git-blob migrations staged and replayed, all list pairs matched, head `20261108120000`; 67 advisor warnings, 0 added/0 removed.
- `node --env-file=.env.test --experimental-strip-types --test tests/integration/pilot-control-room.test.mjs`: 64 passed, 0 failed. Scope includes direct privilege checks, stale withdrawal, exact replay, row lifetime and publication gates.
- `node node_modules/@playwright/test/cli.js test --config playwright.connected.config.ts --workers 1 --retries 0 <11 release suites>`: 73/73 passed, 0 failed. Attested mode disables server reuse. One invocation only.
- `node node_modules/@playwright/test/cli.js test --config playwright.pilot-presentation.config.ts`: PASS; 54 passed.
- Existing exact operations cleanup SQL and aggregate readback: pilot predicates verified True, operations predicates verified True, residue 0 across 44 tables. Disposable Auth override removed and original limits restored; test environment file unchanged.

## Concerns and scope

Windows FIFO/symlink skips, existing advisor warnings, and the prior disposable Auth pooling prerequisite remain. The local presentation suite uses mocked transport. Hosted deployment, real notices/consent/owners and physical device/AT checks remain separate gates. Production and Journeys unchanged, real participation BLOCKED, public launch HOLD, backup/restore waived. The release Markdown and JSON retain the historical rollback reference and exact hash bases.
