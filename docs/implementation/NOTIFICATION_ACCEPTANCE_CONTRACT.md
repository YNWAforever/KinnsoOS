# Notification provider acceptance

An email provider receipt establishes acceptance by that provider. It does not establish delivery to the recipient. `deliverNext` and `completeDelivery` therefore report `accepted`, including when an older store responds with `delivered`. No configured provider or runtime caller was found during this source review; this change does not claim a production delivery incident or activate email.

## Compatibility and authority

The existing `delivered` boolean in pending completions and `p_delivered` RPC argument remain compatibility names. A true value means provider acceptance. Their exact argument order, JSON shape, receipt and request digest remain unchanged, allowing an unknown acknowledgement to be retried without another provider send.

The worker still checks recipient, preference, creator and approved channel immediately before sending. Claim and finish retain locked leases, digest conflict checks, append-only completion audit and service-only execute grants. Anonymous and authenticated users cannot call them. Failed sends retain retry/dead-letter behavior; suppressed or stale claims cannot reach the provider. Delivery work occurs after the business transaction and never performs a payment or reward command.

An expired lease can be reclaimed only before send-start (`queued`/`retry`). An expired `sending` row retains its token and is neither automatically reclaimed nor moved to dead-letter, including on its fifth attempt. The service can acknowledge a known completion under that exact sending token after expiry. A replaced, foreign, absent or unsent token cannot establish acceptance. A provider receipt whose finish request never committed can therefore be retried without another call to the provider. If the completion itself is lost, keep the outcome uncertain and require provider reconciliation; do not automatically resend or manually force it into retry. Provider idempotency keys alone do not authorize resending an uncertain request.

New successful completions store `accepted`, which is terminal and cannot be reclaimed. Historical `delivered` outbox and immutable completion rows remain intact and must be understood as unverified provider acceptance. Replaying an old completion normalizes only its returned state. It neither changes the historical audit nor queues another send. Recipient delivery requires a separately reviewed provider proof contract; none is introduced here.

## SQL candidate and release boundary

Candidate: `supabase/migrations/20261008083508_kinnso_notification_provider_acceptance.sql`.

SHA-256: `d89dde56367df4b142b7a66e53858e1711a98a73ffd52353b87d8ae0d54aa896`.

The installed Supabase CLI generated the migration. Apply it atomically through the migration runner or `psql --single-transaction`; it has a 5-second lock timeout and a 30-second statement timeout. Preconditions reject missing contracts or drifted API-role execution grants. It extends the existing state constraint and replaces the existing claim and finish functions without changing their signatures, owners, empty search paths, table ACL or RLS. It does not change provider-managed Auth/Storage schemas, repair migration history, activate a scheduler or backfill data.

Only the identified isolated local project has been rehearsed. An injected failure after all final candidate statements restored both exact prior functions, constraint and authorization metadata. Atomic application then passed, including unchanged service-only grants. Production application is **NOT_RUN** and requires a fresh scoped preflight, consistent backup with isolated restore, exact candidate review and specific authorization. Earlier migration approvals do not cover this file.

Code rollback may retain the SQL contract. Do not restore the former claim behavior that resends expired `sending` rows, blindly restore the former state constraint after accepted rows exist, rewrite immutable audit, or resend historical entries. Any SQL reversal needs its own data-aware reviewed correction or demonstrated restore procedure. Pending completions remain replayable across the code rollback boundary.

## Acceptance and remaining operations

Local regression exercises real RPC acceptance, exact replay, conflicting receipts, old completion immutability, terminal queue/claim behavior and direct-grant denial. A review regression also covers a successful provider receipt whose finish never committed: after lease expiry, another worker remains idle and the original token completes without another provider send. Expired unsent leases remain reclaimable, and their replaced tokens cannot complete. Existing media tests continue to exercise references, retention, claim/finalize races, late signed-upload replay, cancelled selections and cleanup. These are isolated fixture checks, separate from hosted and named-user acceptance.

Hosted scheduler ownership and token configuration, approved retention policy, provider identity, sender, test mailbox and recipient proof remain external gates. Keep unconfigured delivery closed. Never label an accepted receipt as delivered, count synthetic recipients as production success, or enable cron/email merely to close the ledger.
