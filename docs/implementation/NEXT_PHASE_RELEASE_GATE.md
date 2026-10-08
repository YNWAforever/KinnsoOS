# Next-phase release and rollback gate

N16 is **partial**. The release controls and bounded public checkpoint below are available for review; expansion to signed-in traveller/creator or commercial acceptance is **NO_GO** until its current-environment gates pass. This record does not authorize SQL, capability changes, jobs, content, redirects, indexing, provider calls or manual deployment.

## Verified checkpoint

Main `21898df946bd3e59037630ed475d7486496b8309` includes PR #36 after exact-head root/Journeys/Vercel success. Push and PR artifacts verify 333 units, 41 integrations and 80 browser tests with zero failures/skips, clean source and the owned isolated target. Linux collected six source-package checks and rebuilt/typechecked the extracted source. Root regression also passed; its two known Booking accessibility skips remain SKIPPED.

The automatic production deployment `dpl_GWvyWCbcUQsM5ZF1bLr595Z94v9N` was READY at that main SHA. Read-only run [37760263360](https://github.com/YNWAforever/KinnsoOS/actions/runs/37760263360) and an independent existing verifier matched 316 corresponding-source files and ten anonymous checks at `https://kinnso-os.vercel.app`; archive SHA-256 `1e3eeab3b232bfdad589443a6bea97bee000e5061763b5590a9eebdabc2fb832`. The packaging dirty flag is retained. This is a dated source/archive and anonymous-fence checkpoint; signed-in acceptance, current hosted schema/flags and provider delivery remain NOT_RUN.

The existing pure transaction/approval/recovery/claim guard suite was executed with nine PASS and zero FAIL/SKIP. It makes no DB connection. It proves those controls, not a candidate migration or disaster recovery.

## Required private release record

Keep the versioned release manifest and raw evidence outside the public repository and source archive. Bind the repository/frontend/backend source SHA, exact main/review tree, source archive hash, hosted project and scoped schema fingerprints, selected SQL names/bytes/hashes, effective flags, provider schedules/token owner, actual test runs and last-good application deployment. Record unknown and not-run fields without filling them from a previous release.

Five source migrations were added since the Oct8 starting baseline: empty creator drafts, Ops assignments/presets, merchant directory, merchant invitations and notification acceptance. Their private inventory is bound to Git-object SHA-256 values. It is not a production delta or an approved five-file bundle. Reconcile current object definitions, grants, ownership and history first; do not blindly replay the source list or repair history. Use each task's compatibility and rollback runbook.

| Gate | Current evidence | Required before expansion |
|---|---|---|
| Source/release binding | Main218 public source/archive and exact-head CI PASS | Recheck the actual proposed/deployed SHA and alias |
| Auth/content/roles | Local synthetic flows PASS | Named hosted U01/U03, author-verified structured content and mailbox; U02/U04/U05 for their capabilities |
| Schema/flags/jobs | Source/local candidate evidence; current hosted contracts and schedules unverified | Scoped live reconciliation, exact approval and recovery for each necessary delta; owner/token/schedule checks |
| Financial/AI | Scoped finance/evaluation and real local accounting checks | Approved refund/duplicate-receipt rules, reviewed rates and named Finance/Ops acceptance; paid providers stay unconfigured |
| Accessibility/performance | Local browser and laboratory evidence | Actual iOS/Android, NVDA/VoiceOver and field samples with appropriate consent |
| Recovery | Historical Oct6 consistent logical export/local restore | Fresh exact-candidate export, isolated restore and injected failure/commit/postcheck rehearsal; measured operational RPO/RTO and owner |
| URL/SEO | Existing public canonical/private-noindex controls | Actual original-site URL inventory and approved redirect/canonical decisions; no site-wide indexing |

The previously authorized Oct6 logical restore used network `none`, no public ports and a stopped final container. Its measured restore phase ran from 13:48:32.689Z to 13:48:47.322Z; that interval is not end-to-end RTO or measured RPO. It was bound to source `c53f1fc`, not today's candidate. Storage object bytes, Dashboard Auth/OAuth/SMTP configuration, DB login passwords and provider encryption-root-key/Vault decryptability were excluded. Historical success cannot satisfy the existing one-hour recovery freshness gate.

## Ordered release and rollback

1. Freeze the reviewed source and selected delta, inspect current target contracts, preserve the last-good deployment and complete the exact recovery gates. The persistent execution claim is retained after uncertainty; read-only reconciliation precedes any retry. A successful client COMMIT still requires a fresh catalog check.
2. After explicit authority, expose only the bounded traveller/creator scope that passed named U01/U03. Verify the same durable trips, revisions and receipts after reconnect/reopen. Media/sharing need their storage, retention/reference-race and revocation gates. Merchant/Ops/commercial scope waits for U04/U05/N17. Independent origins keep separate login; no automatic SSO or draft import is implied.
3. Stop expansion immediately for cross-account data, unrecoverable save loss or duplicated financial/import writes. The owner must approve 5xx/latency thresholds from a measured baseline before relying on an automated release threshold. Missing samples or job outcomes remain unknown.
4. For an authorized incident, disable the reviewed scope or promote the recorded exact last-good application, then reverify its source/archive and private fences. Preserve durable data, revisions, request receipts, accepted memberships and immutable history. Notification rollback must preserve uncertain sending leases and avoid automatic resend; an accepted provider receipt does not prove delivery.
5. Use a compatible forward schema repair or an explicitly reviewed, rehearsed restore when necessary. Never drop populated tables, clear receipts, reinstall old financial/notification functions, or restore over later writes without an approved data-preservation decision. Reverify share revocation and original-site availability. Application rollback, data restore and human acceptance are separate outcomes.

The existing [release operations](RELEASE_OPERATIONS.md), [migration guards](../../scripts/MIGRATION_RELEASE.md), [notification contract](NOTIFICATION_ACCEPTANCE_CONTRACT.md) and [finance/agent evidence](FINANCE_AGENT_ACCEPTANCE.md) remain the detailed procedures. Correct this evidence-only increment by reverting its documentation commit; it changes no runtime, schema or provider configuration.
