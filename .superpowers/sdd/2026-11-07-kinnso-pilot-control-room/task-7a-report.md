# Task 7A — Participant onboarding service contract

Base: 807ed7ff05d0d32cb70f27c6ff39604c45e14835. Worktree: single-origin-design-20261105. Branch: codex/single-origin-design-20261105.

## Delivered

- Extended only the still-unaccepted 20261107110059 migration. Configure run takes three exact lowercase SHA-256 digests supplied for the notice artifacts. Version and digest pairs lock together when enrollment opens or a slot links to an account. No digest is inferred from a version label.
- Participation consent compares both exact notice identities under the run lock and records a combined digest over the ordered version/digest pairs. Current self readiness and consent replay check that identity. Creator intake compares and stores the exact content notice digest separately from the payload fingerprint. Only draft and rejected intakes accept owner edits; approved and published guide revisions still go through the guide editor and existing review flow.
- Self read and mutation responses use the same caller-owned projection. The active creator can see current intake form fields, review reason, and the bound guide editor and draft revision when owned. Merchant campaign and traveller trip links are derived from owned records; support is an owned case reference. Operations facts, other slots and private workflow text stay out. New participant receipts store only the original run and slot IDs plus the existing request fingerprint; replay rebuilds self state and suppresses duplicate metrics.
- The browser repository keeps one unresolved command in actor-scoped memory, coalesces identical concurrent attempts, preserves exact request identity on retryable failure, rejects a different intent, and clears and aborts on sign-out or actor change. Late old-account responses are discarded. Claim codes travel only in the POST body. The repository exposes the existing account invalidation subscription for the future participant view.
- Updated the existing operations configuration form to collect the three digests. No Task 8 participant UI. Verified all affected package paths, including the existing migration alias and tests, are already in the source manifest; no manifest entries changed.

## Verification

- Repository RED: the original code sent a different unresolved claim intent instead of returning CONFLICT. The new focused tests pass, including coalescing, invalidation, POST-only claim and self DTO projection.
- SQL negative control: the missing-digest assertion failed against the base participant RPC in a rollback-only transaction on the isolated target (INVALID instead of CONFLICT). The amended RPC passes that check and tests for stale identities, run immutability, cross-slot privacy, canonical links, draft/rejected updates and approved/published denial.
- Typecheck passed. Focused contracts, routes and migration checks: 64 passed. Full Journeys unit suite run once: 1,561 passed, 2 skipped, 0 failed.
- Source package suite: 11 passed, 1 skipped with worktree-local TEMP/TMP; an initial run using Windows' default temp directory failed on permissions before exercising the assertions.
- Verified kinnsoos-public-it-20261106 using the env-file verifier; reset only its local profile with no seed. The final SQL and creator integration run passed 47/47. Security advisors reported 13 existing findings before and after, with no changed finding keys. The initial reset exposed a line-ending mismatch in an existing SQL replacement anchor; normalizing the migration to LF resolved it.
- git diff --check passed.

## Boundaries

The production notice artifacts and their approved hashes are setup inputs. Tests use synthetic notices and synthetic accounts. No production migration, push, deployment, provider activation, real invitations, real accounts or nested agents. Task 8 remains separate.
