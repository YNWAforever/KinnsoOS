# SDD ledger — plan: docs/superpowers/plans/2026-10-31-kinnsoos-conversation-studio-remake.md

2026-10-31 HKT. Local implementation only; no migration application, deployment, production credentials, or provider connection.
Base: b6291cf40ae0849c5e9eeea6cbb1b725136b4f54. Managed isolated worktree; original untracked design artifacts preserved.

## Rulings and preflight
- Ruling: T01–T09 are the first-batch source scope; real DB/Auth/RLS and hosted acceptance remain BLOCKED by the explicit no-migration/no-connection instruction. Offline contract/browser evidence cannot close those gates.
- Ruling: code graph discovery timed out; use previously verified owners plus local source searches until service recovers. No secrets or environment files read.
- Ruling: retain ledger and failure evidence in docs rather than delete scratch or create commits; this is an uncommitted review handoff.
- T02→T03: common home works without conversation capability; persistence remains default-unavailable.
- T03→T04→T05: source references and artifact revisions are immutable inputs to evidence and command recovery.
- T05→T06→T07: metadata request UUID differs from fixed domain UUID; unknown preserves exact payload; publication gets separate confirmation/UUID.
- T06→T08: web direct writes and lower publication RPC must respect studio binding without changing unbound legacy workflows.
- T07/T08→T09: mock readback is local evidence only, not real persistence acceptance.

## Task status
- T01–T09: in progress; no product verification claimed yet.

## Local evidence so far
- Dependency setup: offline/frozen lockfile/ignore-scripts; 893 packages reused/added, 0 downloaded. No env files copied.
- Existing focused baseline: 32/32 PASS (creator-editor, creator-routes, auth-contract, public-entry-registry, guide-publication).
- Core RED: 11/11 failed for missing functions/routes. Core GREEN: 11/11 PASS (navigation, templates, evidence, immutable command state).
- API/UI RED: 5/5 failed before implementation. Initial rerun exposed CSS handling in the SSR test harness; fix only the harness loader, retain production CSS.
- Initial Journeys TypeScript check: PASS.
- New source currently includes public home, 20 template definitions, private workroom UI, BFF/RPC allowlist, capability keys, evidence/brief and request recovery contracts. SQL, original editor bridge, web compatibility, browser acceptance and final review remain in progress.
- Ruling: private metadata source schema is authored but must NOT be applied under this turn's scope; generated DB types use one bounded RPC adapter until approved schema generation is possible.

## Implementation checkpoint
- Common homepage, C1 private thread/evidence/brief, fixed UUID recovery, original editor and publication readback are implemented. C2-C5 read-only checks link back to original domain workspaces.
- Web source-bound guide editor uses independent web Auth and the same original RPCs; direct legacy update/lower publication paths reject bound writes.
- Two SQL migration sources exist but are UNAPPLIED. Integration case source exists but has NOT RUN. Source assertions do not prove SQL execution, RLS, trigger or lock behavior.
- Offline UI fixture: 7/7 PASS including full C1, private D2 exclusion, exact UUID retry and four viewport widths. This is not real persistence.
- 34 new/focused Node tests PASS. Web dedicated offline suite 10/10 PASS. The original web integration setup required .env.test; it was not provided or bypassed. A separate allowlisted offline suite rejects network requests.
- Web typecheck initially lacked the ignored packages/db/types.ts artifact; copied the existing local generated type file without querying DB. Subsequent typecheck PASS; not a schema regeneration.
- Original route inventory: 76 static Journeys paths plus unchanged dynamic recognition; 108 web page/API files. New GPL manifest entries retain all prior entries.
- Ruling: C3 reports/checks are ephemeral read-only results in this first batch; canonical persisted report artifacts and broader role rollout are not claimed complete.
- Ruling: opaque recovery keys use actor UUID and guide/thread UUID scope, with no body/token/document title in storage. This is an explicit local identifier rather than a hash; actual access is always server-authorized.
- Ruling: legacy publication retains its internal child UUID; fixed caller UUID remains the authoritative outer domain receipt, so replay does not issue a second version.
- Native Next first run found only strict selector errors (route announcer and GPL link wording); correction is in the test, product attribution unchanged.

## Independent review R1 and fixes (2026-10-31)
Fresh reviewer Socrates found 4 P1 / 2 P2. All were accepted for correction; SQL verification remains source-only.
- R1.1: renamed the ambiguous PLpgSQL guide local to v_guide_id.
- R1.2: opaque guide-ID tombstones survive legitimate guide deletion; BEFORE INSERT/DELETE and original-writer entry reject resurrection. They contain no private body or owner identifier.
- R1.3: counter-only guide updates (saves_count plus updated_at) bypass content permits; existing authenticated column grants still prevent direct counter editing. Content/identity changes remain guarded.
- R1.4: preserve readback permission error codes and clear private bodies centrally, including recovery. New browser test covers revocation between original writer ACK and GET.
- R1.5 design ruling: guide binds an immutable brief version. Later brief-head edits stay separate; guide editing/publication continues against the pinned version with live source ACL checks. No automatic rebinding or silent inclusion of new source content. UI now states this.
- R1.6: recovery keys use actor plus thread; a completed request can only remove its own reference. Thread UUID enters the URL before the first private write so a lost create reply is discoverable after reload. New unit/browser coverage includes independent thread B saving while A is unresolved.
- Added NOT_RUN integration cases for bookmark/unbookmark, brief-head changes and delete/recreate identity. No schema or DB process was run.

- R1 follow-up: 12/12 browser cases PASS, including permission denial after guide ACK, cross-thread unknown isolation, reload and conflict; 28 focused studio unit/source tests PASS before the final capability assertion addition.
- Actual Next unavailable-backend browser 2/2 PASS; original source package tests 9 PASS / 1 platform skip.
- Web offline suite 14/14 PASS, own ESLint PASS, typecheck PASS. Web Next build BLOCKED at its existing core environment validation (missing Supabase URL/key); no dummy or production config supplied.
- Journeys build PASS with all backend capabilities disabled. A final regeneration will include R1 source fixes.

## Final local review handoff — 2026-10-31T11:29:28.809592+08:00
- R2 source follow-up found one READ COMMITTED delete/reinsert race and stale manifest entries. Both addressed: shared identity advisory lock + AFTER INSERT validation + tombstone mutation rejection; all new source/tests explicitly listed.
- Fresh reviewer final pass: no further P1/P2 source findings under documented READ COMMITTED assumptions. This is not DB proof.
- Final source archive verified against ALL current manifest inputs: 627 entries, zero byte mismatches. This closes the reviewer's earlier stale-archive observation.
- Final Journeys offline tests: 1313 total / 1312 PASS / 0 FAIL / 1 Windows symlink skip. New route inventory now executes and passes (not skipped).
- UI fixture browser: 12/12 PASS. Actual Next disabled-backend: 2/2 PASS. Web offline: 14/14 PASS. Both typechecks, web lint, final Journeys build PASS.
- Web build BLOCKED at existing required Supabase environment gate; real DB/RLS/RPC/concurrency/provider/hosted gates remain BLOCKED or NOT_RUN as listed in acceptance report.
- T01/T02/T04/T05 local source/UI checks complete. T03/T06/T07 source and offline behavior implemented; real database acceptance blocked. T08 read helpers/web local compatibility delivered, canonical C2-C5 report persistence incomplete. T09 local evidence handoff complete, isolated/hosted acceptance not granted.
- Original checkout still contains only its prior untracked design/prototype docs. No source edit there, migration application, real connection, commit, push or deployment.
