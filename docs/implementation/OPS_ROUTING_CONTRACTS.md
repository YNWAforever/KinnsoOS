# N10 operations routing contracts

This continuation uses the existing operations membership, Auth session and audit boundaries. A new additive migration implements assignments and private named filters. Production application is a separate approval and recovery gate.

## Assignment

An assignment references a real operations membership, with one row per submission. Expected revision 0 creates the first assignment; every accepted command increments revision, including clearing it. The authoritative submission lock serializes creation and updates. Only a fresh active owner/admin can assign; the target must be active owner/admin/moderator. Paused targets remain visible as unavailable, without granting permissions or silently transferring work. Routing does not grant read or review authority.

Commands require a nonempty audit reason and UUID request. One transaction checks roles, compare-and-swap revision, changes the assignment, appends the existing ops audit record and stores an immutable request receipt. A matching replay returns the original receipt without another audit; different payloads conflict. Revoked actors cannot replay receipts. Assignee revocation is locked against a concurrent new assignment.

## Private named filters

Each filter belongs to one existing operations member, contains only mission/status/assignment/order criteria and has a revision. No results, selected IDs, notes, evidence or financial snapshots are stored. Each member can keep up to 20 active filters. Creation limits are serialized per owner; global ID locks prevent a concurrent different owner overwriting a new record. Deleted records keep a revision tombstone. Reopening a filter checks the current account/role and starts a new cursor.

## Queue compatibility

Existing signal → deadline → ID ordering remains the default. The optional earliest-deadline order applies to the whole filtered server queue; null deadlines are last. It places past deadlines first without a moving-clock cursor bucket. Assigned-to-me and unassigned filters execute before LIMIT. Cursors bind all criteria and the actor for assigned-to-me. Missing routing schema disables routing controls while the existing queue remains usable. All new BFF writes retain same-origin checks, bounded bodies, fresh Auth and private/no-store.

The UI keeps the held request after an unknown outcome. Assignment retry is reachable inside the modal; presets retry on the page. A committed response lost in transport is retried with the same payload/request, then the queue reloads from the server. Role invalidation discards private results and held UI state.

## Verification and release

Tests cover real concurrent CAS/replay/audit, cross-owner preset creation, limits/tombstones, paused roles, 50+10 assignment paging and actor-bound cursors, 1,205-row deadline paging, original signal/bulk/currency contracts and a real committed-but-lost browser response. Synthetic local/CI verification is distinct from hosted U05 acceptance.

Before production application: inspect the exact migration SHA/digest and approved target, check baseline function fingerprints/internal object absence, obtain a fresh consistent backup and isolated restore/failure rehearsal, then apply the reviewed file as one transaction. Preserve existing provider schemas, flags and migration history. No historical migration repair is included. Run read-only fingerprints/grants afterward and separately authorize named-role UAT.

Source rollback: revert the UI/BFF while preserving receipts/audits. Before real writes, a tested SQL rollback can restore the prior queue function and remove only the new objects. After any real writes, retain assignments/presets/receipts and use a forward-compatible fix; do not drop real history or replay old commands blindly.

Code/local checks may pass while schema application, policy-owner acceptance and formal hosted U05 remain blocked. No new flag, email, content seed, payment or provider activation is included.
