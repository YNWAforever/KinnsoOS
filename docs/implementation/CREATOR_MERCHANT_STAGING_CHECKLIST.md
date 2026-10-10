# Creator/Merchant staging checkpoint — P04

Status: **BLOCKED_TARGET**. No designated staging target, Auth ownership, approved actor set or fresh recovery packet has been supplied. This checkpoint performs no hosted mutation. Current-source readiness and protected preview probes are recorded in the [operations ledger](CREATOR_MERCHANT_OPERATIONS_LEDGER.json); preview 503 remains unresolved.

Source inventory at PR55 `097b505d5e4b79948101877f98f331d27813e8af` (hashes of exact Git-object bytes):

| Migration | SHA-256 |
| --- | --- |
| `20261010190752_kinnso_creator_collaboration.sql` | `2ee6af97838634aa0f38149152e88831b12a3cfc66e31f091216def7c5bdd881` |
| `20261010190758_kinnso_merchant_campaign_lifecycle.sql` | `f87e1cbb15cc7c2c9b03358a86e9d227a521dc4ddfb3b5582a05c51de7b38a26` |
| `20261010190951_kinnso_merchant_onboarding_profile.sql` | `12729159686cf5b8272b593d693540b5393d3ea7c4098916e066db79e0374ed2` |

These are the source differences from main `ad2c8ce`, **not an executable target delta**. Earlier migrations and current live definitions/grants/history remain prerequisites to reconcile. The published-term direct-table UPDATE bypass is a known release blocker; P08 must add and isolate-test the table guard before selecting release SQL.

The private target record must bind environment purpose, exact target/Auth ownership, schema fingerprints and migration history, current definitions/grants, candidate SQL hashes, selected prerequisite delta, last-good application, approved actors, backup coverage and the fresh recovery rehearsal required by [the release gate](NEXT_PHASE_RELEASE_GATE.md), [release operations](RELEASE_OPERATIONS.md) and [migration guards](../../scripts/MIGRATION_RELEASE.md). Keep credentials, actor identities, customer records and sensitive manifest fields outside the public repository/archive.

After that read-only reconciliation, prepare the exact additive change and rollback packet. Any hosted execution uses its existing scope-bound authority; uncertainty retains the execution claim for read-only reconciliation. Do not replay all source migrations or use CI reset/seed/cleanup on staging.

Configuration verification must check effective value relationships without exporting values: backend URL and approved/Auth origins agree, publishable key is accepted, site origin is canonical, Auth callback/sign-up/recovery redirects and cookies work. Preserve existing capabilities; enable only individually authorized `creator,merchant,ops,notifications` after schema/role gates. Booking/payment/withdrawal remain unavailable. The readiness CLI exit confirms config only; it leaves schema `not_checked`.

| Runtime gate | Status |
| --- | --- |
| Designated target and Auth/recovery ownership | BLOCKED_TARGET |
| Live schema/grants/history and scoped delta | NOT_RUN |
| Fresh backup/isolated recovery rehearsal | NOT_RUN |
| Effective deployment config and Auth redirects | NOT_RUN |
| Configured anonymous private request → 401 | NOT_RUN |
| Approved owner/creator/moderator query → 200 | NOT_RUN |
| Exact-source role UAT | NOT_RUN — see [P05 matrix](CREATOR_MERCHANT_HOSTED_UAT.md) |

Next concrete action: identify the staging/Auth target and its private recovery/actor record, then compare live definitions read-only. No approval request for an unselected SQL bundle is warranted yet.

P08 source-only inventory at `0021f821d6cd6f2a6e58d9020cc1602e9c3b69e2`: `20261010213700_kinnso_campaign_schedule_terms.sql` SHA-256 `8eb3efca4c192bc8f2d11926cb0a4b9485d00f2aa5954c8c268ac3ee8548ba6e`. Current owned CI is pending; this is not an authorized/executable hosted delta. Backfill seals previously published merchant terms, including historical draft-shaped rows, and advances existing CAS timestamps. Reconcile live definitions, grants, publication history and recovery coverage before selecting any SQL packet.

P09 source-only candidate on `ec3b30b`: `20261010223500_kinnso_creator_discovery.sql` SHA-256 `1cb8f76ce74df13ce863cdc89739103a2d0928340e04b82e7339e2db1a7f238a`. Hosted status **NOT_EXECUTED**; this adds owner private CRM versioning, mature monthly invitation quota protection across native/legacy/direct writers, owner receipts, and transactional single invitation inbox event. Reconcile current live schema and dependent P08 guard before selecting any hosted delta. Current owned CI and role UAT remain separate gates.
