# Creator/Merchant M1 release — P06

Status: **NO_GO / BLOCKED_TARGET**. P04 target/recovery/config/schema and P05 hosted role acceptance are outstanding. PR55 remains open on `097b505`; PR56 is a stacked recovery/diagnostic continuation, and its independent review fixes are at `220990b`. Neither PR has been merged by this task. Production last read-only metadata checkpoint remains main `ad2c8ce`, not either candidate.

The private candidate manifest must bind the actual reviewed frontend/backend SHA, required root/Journeys CI runs/artifacts, source archive hash, selected live SQL delta and hashes, schema/config/flags, named role cases, actual deployment and last-good application. Documentation or skipped checks cannot satisfy runtime gates. Rebind after every changed candidate; don't inherit parent successes.

Before release: resolve the published-terms table boundary review (P08), pass current-source owned CI and source extraction rebuild, reconcile live prerequisites, rehearse fresh scoped recovery, and pass the named staging role/mailbox cases. Only then is there a concrete merge/deploy/config/SQL action for the existing release authority to cover. See [the established release gate](NEXT_PHASE_RELEASE_GATE.md); this document grants none.

Application rollback must preserve additive data, accepted creator work, immutable review history and command receipts. Record an exact last-good deployment and verify the same data/private fences after an authorized rollback. Do not drop collaboration tables, erase receipts, replace newer functions with historical financial/notification code or replay uncertain operations. Forward schema repair or data restore needs its separately reviewed preservation/recovery decision.

Stop expansion for cross-account exposure, unrecoverable draft loss or duplicate commands. Error/latency thresholds await measured baseline and an accountable owner. P01–P03 code/CI status, P04/P05 staging status and production release status remain separate in the [ledger](CREATOR_MERCHANT_OPERATIONS_LEDGER.json).

Next concrete action: designate staging and its private recovery/actor packet; meanwhile continue isolated P07–P17 development. Booking/payment/withdrawal and paid providers remain unavailable.
