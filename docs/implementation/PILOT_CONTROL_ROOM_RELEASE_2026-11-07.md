# Pilot Control Room final fix release packet

**READY_FOR_USER_REVIEW for isolated connected acceptance. Production unchanged; deployment UNVERIFIED. Journeys UNCHANGED / candidate not deployed. Real participation BLOCKED. Public launch HOLD.**

The continuation closes the two previously reported connected acceptance failures. The final complete matrix passed **73/73** on one fresh exact-attested clean default build/server and freshly reset isolated target, with **one worker, zero retries, no server reuse**. Earlier diagnostic and failed matrix results remain separate; no partial totals are combined.

## Exact source and environment

- Tested source: `18c6596d59e500b461963fe93f4394aa6cd674a1`; tree: `645fef5cc556c9712d35b2b88ffb9c7b63fc39ed`.
- Default `npm run build`: Next 16.3.8, supported Webpack path, 73/73 generated entries; build ID `h3ZJub5F0iuwSjosXHbFI`.
- Served health identity matched that HEAD/tree/build. The following packet/report commit changes documentation only.
- The Task10B capability configuration was restored **only in the test/build/server process**: `trips,bookmarks,media,sharing,creator,ops,merchant,notifications,agent,telemetry,pilot`. `.env.test` bytes are unchanged. No production capability or provider action was activated.
- Only the pilot E2E harness changed: populated Source summary/Source URLs fields use textbox-role selectors; actions/navigation are bounded; the original workflow error is preserved if context closure also fails. All **81 product assertion lines** are unchanged. Application and SQL blobs are unchanged.

## Verification

| Check | Result and scope |
|---|---|
| Final complete connected matrix | **73 passed, 0 failed, 0 skipped**; one invocation / one worker / retries 0 / reuse false |
| Corrected diagnostic | **4/4**: three role-bundle cases plus pilot journey; separate from final matrix |
| Default build and typecheck | PASS on exact tested source |
| Final reset/readback | All **212** canonical Git-byte migrations, no seed; ledger head `20261107165735` |
| Source archive regeneration | **746 inputs / 747 entries**; post-green regenerated runtime ZIP identical to built/tested ZIP; canonical members equal Git blobs |
| Cleanup | **43 zero-residue predicates per pilot scope**, **7 operations predicates**, **44-table aggregate residue 0** |
| Carried-forward focused checks | **151 passed**; suite/product implementation unchanged |
| Carried-forward full unit | **1,587 passed / 2 Windows skips / 0 failed**, 1,589 total |
| Carried-forward integration | **59/59**; identical SQL/application inputs |
| Carried-forward presentation | **53/53**; mocked desktop transport |
| Carried-forward source-package suite | **11 passed / 1 Windows symlink skip / 0 failed** |
| Carried-forward advisors | **67 existing warnings**, 13 security / 54 performance; no added or removed keys |

Previously green full unit/integration and other unchanged suites were not rerun, as requested. Windows POSIX FIFO/symlink cases remain skips. Presentation and desktop browser testing do not clear physical/AT acceptance.

| Final matrix suite | Passed |
|---|---:|
| account-recovery | 3 |
| creator-workspace | 20 |
| inbox-support-workspace | 1 |
| u04-merchant | 4 |
| u06-accessibility | 1 |
| u06-ops-content-admin | 1 |
| u06-role-bundle | 3 |
| u11-workspace-recovery | 2 |
| u25-public-accessibility | 36 |
| u26-pilot-control-room | 1 |
| u26-pilot-security | 1 |

The original role-bundle assertions verified signed-out invalidation, absent private controls, HTTP 401, and reauthentication restoring authorized UI/HTTP 200. The pilot journey operated all three intakes per scope, selection/resubmission, substantive exact review/rejection/reapproval, notification acknowledgement, mission-context support creation/resolution/evidence/acknowledgement, and withdrawal cancel/confirm through UI. Its real-classified fixture used synthetic actors and retained all four physical/AT blockers.

## Diagnosis and historical runs

The missing agent capability was an isolated test-process prerequisite. The pilot stall was a harness locator defect: populated textarea content prevents the exact label lookup from matching; textbox-role selectors resolve the controls. Live trace/network observation showed the first intake and review cycle succeeding, followed by a pending Source summary fill before a new request was sent. No product fix or assertion relaxation was needed.

The initial continuation diagnostic recorded 0 pass / 4 fail: the pilot locator stalled and global trace finalization timed out under severe observed host memory pressure. Partial trace files and recovered complete members are retained privately; no full archive/pass is claimed for that diagnostic. A later reset initially reported storage unhealthy after replaying SQL; storage recovered and the exact ledger was verified before diagnostics resumed. The final reset completed successfully. Short trace paths and recovered resource headroom were used for later runs. No server was restarted mid-run; failed tests were not automatically retried.

The first complete continuation matrix was **72 passed / 1 failed** on build `d2MGeLofu18nfajGcJKZl`, source `18c6596d59e500b461963fe93f4394aa6cd674a1`. The second foreign-merchant ownership probe returned401 instead of the unchanged403/404 assertion. At that time, local GoTrue v2.190.0 logged **173 GET /user failures** with `cannot assign requested address`; startup confirmed zero reusable idle connections. This matches the [upstream Auth pooling defect](https://github.com/supabase/auth/issues/2831). This is isolated infrastructure evidence; no product authorization assertion was relaxed. The failed trace archive is partial (only two complete source members), so exact per-request browser/provider correlation is not claimed. The failure stack, run timing, Auth/server logs and build identity are retained. Both pilot cleanups and the exact operations cleanup completed; 44-table residue was zero before another reset.

Before the new fresh acceptance run, only `supabase_auth_kinnsoos-public-it-20261106` received a temporary `/.env` containing `GOTRUE_DB_MAX_IDLE_POOL_SIZE=20` and `GOTRUE_DB_MAX_POOL_SIZE=20`; the file did not previously exist. The container restarted **before** the final build/server/test, and startup confirmed20/20. It was not restarted during the matrix. The final green run used this recorded infrastructure configuration. After final cleanup, the exact temporary file was removed and the original zero-idle setting restored. Reproduction requires the same isolated prerequisite or an upstream-fixed Auth version. No tracked env/config, application, SQL, production capability, or provider integration changed.

## Source archives and hash basis

The tested Windows archive and canonical Git archive contain the same source. **61** members differ only in CRLF/LF. All member metadata hashes were verified. The canonical ZIP was not separately built.

| Artifact | SHA-256 | Exact byte basis |
|---|---|---|
| Tested runtime ZIP | `d23cb4bc0d9a63ff6b71ef77189278dbcd9378c5c43d9774e49925facdfe56fc` | `.local-private/final-fix-cont/tested-runtime-source.zip`; default-build ZIP bytes, identical after post-green regeneration |
| Canonical source ZIP | `a308a7427ef80aef55b4141538e53a48604e5d5eda20a09d6cd9ac329af12eef` | `.local-private/final-fix-cont/final-committed-source.zip`; deterministic ZIP with exact committed Git-blob members |
| Manifest Git blob | `f0c46feb5f0d69406a3b95e22b7c10a7b74dd6cedd6403504661491cc508c323` | Committed LF bytes at tested source |
| Manifest checkout | `365912a5c377da99c96f92bb74a0f5ede833ecc1e6624c3969161c71d3da8232` | Exact tested Windows checkout / ZIP-member bytes |
| Pilot migration envelope | `b91430438f465bf5436e6c3eda1cbe7ac7db879db40d50ed0758467a13fc0938` | UTF-8 ascending version; LF line: version + space + filename + space + exact Git-blob lowercase SHA-256 |

Manifest membership was revalidated; no new files or mappings were needed in this continuation. Source metadata names the clean tested commit above, not the subsequent documentation commit.

## Database and release boundaries

The only target was `kinnsoos-public-it-20261106`: loopback API 59721, DB 59722, container `supabase_db_kinnsoos-public-it-20261106`. Ownership, staged Git bytes, fresh reset and ledger were verified. Eight pilot migrations:

| Migration | Exact Git-blob SHA-256 |
|---|---|
| `20261107081531_kinnso_pilot_control_room_schema.sql` | `74c523d0c672925f39b4f51950b0fa7971ab497f38d3bf4820f3c0d9bd7adbc0` |
| `20261107085017_kinnso_pilot_control_room_rpcs.sql` | `a217f40afc932e16e318a55773cc0018d2b575ebf61a02cfa22be60eab319e68` |
| `20261107110059_kinnso_pilot_readiness_publication_contract.sql` | `b2702fdaa41963f2f1b44045a22d371e23c7867e695e380b199a1ed1ee2245e0` |
| `20261107135337_kinnso_pilot_traveller_support_context.sql` | `d611bea3668888d7366544ab481d6bc14bc15e553a1ae18bf7e2b32c9616818e` |
| `20261107145100_kinnso_pilot_opaque_evidence.sql` | `246579588dd27726de6d32076ca42512069d5b587758040bbae6c35ebf845b6d` |
| `20261107152000_kinnso_pilot_duplicate_intake.sql` | `eabb4914d03924c0bcbfb58db7c3fa60efcfe49de502e1fa0587666c887188d2` |
| `20261107155000_kinnso_pilot_stored_intake_identity.sql` | `13e49add8e9e57c32c337df8fa92ff268a749631282be32542b2c02412734588` |
| `20261107165735_kinnso_pilot_final_review.sql` | `a5e22ecdd44bdecb55c78a8fa188b9f0d7664ef8e0b3c7be71bbae8b7dc74885` |

Production was neither read nor changed in this continuation. The prior receipt records application rollback deployment `dpl_BZDa82gXNB7KGJeZzjvhBSTB6TtP`, source `950d08b2011f1c23265a193b8f7adc377a44eb26`, ledger 209/head `20261107020000`, pilot excluded. These are historical records, not a fresh production verification or database rollback plan. Do not infer production migration delta from counts. Backup/restore remains WAIVED_BY_USER.

Exact approved EN/zh-HK notices and hashes, named support/privacy owners, processor/retention/redaction decisions, and consented real participants/content remain BLOCKED/NOT_RUN. Physical iOS/Android, VoiceOver and NVDA remain BLOCKED/NOT_RUN. No push, deployment, provider activation, real participant/content, external messages or subagents. Production deployment remains UNVERIFIED; Journeys UNCHANGED; public launch HOLD.

- Acceptance requires the recorded disposable Auth pool configuration (20 idle / 20 maximum). It was applied before the final run and removed/restored after cleanup. No production configuration changed; upstream issue https://github.com/supabase/auth/issues/2831 remains independent.
- 67 pre-existing advisor warnings remain: 13 security and 54 performance. No application/SQL change in continuation; prior key comparison is carried forward.
- Windows unit/source-package skips remain skips; hosted deployment, real participation and physical/AT acceptance remain separate blocked gates.
- The canonical archive is Git-byte verified; the exact tested Windows-checkout archive is separately hashed. The canonical ZIP was not separately built.
- Legacy acknowledgement calls may omit IDs; the new UI always sends server-selected IDs and mismatches are rejected.
- The 20-slot cap includes retired history. Individual completion is forbidden; required active slots complete atomically with the run after checks pass.
- Composite review digests invalidate older approvals until re-review. Nonblank covers require cover rights/evidence.
- The operator preview is a scoped structured JSON view rather than a visual guide renderer.
- Diagnostic trace packaging was incomplete under observed host memory pressure. Original partial files and recovered complete members remain private; those failed diagnostics are not counted as acceptance.
- Supabase db pull previously reported no changes for replaced functions; the explicit migration has full clean replay and integration evidence.

Latest continuation evidence is appended to `.superpowers/sdd/2026-11-07-kinnso-pilot-control-room/final-fix-report.md`. Private diagnostics and aggregate receipts are under `.local-private/final-fix-cont/`; raw trace/fixture material is excluded from public release/source artifacts.
