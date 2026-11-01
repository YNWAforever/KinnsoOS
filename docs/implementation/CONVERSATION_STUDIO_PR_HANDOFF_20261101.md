# Conversation Studio PR handoff — 2026-11-01

This addendum records the candidate after rebasing the local branch onto `main` at `90d7ffe1946fe4d061d5743eda0292cfec97f094`. Earlier acceptance JSON files are historical snapshots and retain their original timestamps and hashes; they are not evidence for the rebased tree.

## Scope and boundaries

- The candidate carries the shared conversation home, creator C1–C5, traveller T1–T5, merchant M1–M5, discovery and offer matching, native command and read adapters, isolated DB acceptance runner, tests, and example-only local preview. Original navigation and domain workflows remain available.
- The 12 new SQL files in this branch are migration candidates only. No migration was applied, isolated DB provisioned, deployment made, or real MCP/provider connection created in this handoff.
- The 3499 preview health endpoint returned HTTP 200 with `EXAMPLES_ONLY`, `persistent=false`, and `realConnections=false` on 2026-11-01 UTC. This confirms the example server only; it does not establish a live database, hosted, or role-security result.

## Fresh local verification

| Check | Result |
| --- | --- |
| Journeys TypeScript `tsc --noEmit` | Exit 0 |
| Web TypeScript `tsc --noEmit` | Exit 0 |
| Journeys `node --experimental-strip-types --test --test-concurrency=1 --test-reporter=tap tests/*.test.mjs` | 1,561 tests: 1,553 pass, 0 fail, 8 skip; writable test-local `TEMP`/`TMP` on Windows |
| Native offline `node --test --test-reporter=tap --test-concurrency=1 apps/journeys/tests/native-db/*.test.mjs` | 134 tests: 133 pass, 0 fail, 1 Windows symlink skip; same writable test-local temporary directory |
| `node apps/journeys/scripts/native-db-acceptance.mjs --plan` | `PLAN_ONLY`, 0 mutations, 2,402 source files, 213 migration files, 31 native handlers, catalog not expanded |

The 213 migration files include three files added on `main` after the earlier 210-file evidence. The rebased source hash is `0b696def9a4f18554203308844b18bbc58c92928c37db82abc165ac244336b24`; migration hash is `e9888e3d8ec0d2bbcf4c8b75355f07a7ef0f2d2f8013a3d3ace7e1c49d5f19a9`.

## Remaining gates

- A read-only resource probe at `2026-11-01T15:19:32.152Z` measured 2,262,745,088 free RAM bytes, below the required 4 GiB. Docker container, network, volume, version, and disk probes were unavailable in this execution environment. The older Docker disk attestation is not a fresh acceptance for this candidate.
- No isolated local DB Auth/RLS, cross-tenant, concurrent same-UUID, transactional rollback, revocation, or hosted run has occurred on this tree. The case catalog remains incomplete; 151 of 182 required cases have no live handler.
- Windows skipped tests require their owned Linux CI checks, including filesystem-link boundaries. A green offline suite does not clear native DB or hosted gates.
- Historical browser evidence covers earlier example candidates. The rebased 3499 server was checked for health, but the full C/T/M browser journey was not rerun in this handoff.

The draft PR is for review of the candidate and these explicit gaps. Keep booking and payment capabilities closed.
