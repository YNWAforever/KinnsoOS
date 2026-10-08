# Operations queue filters

N10 continues from main `987289d46d49bb1c43056f9f5d70798758a81d94`.
This change adds controls for the existing server contract; it adds no SQL,
provider configuration, production fixtures or capability activation.

Operators can filter by mission and by submitted / revision requested status.
Mission choices come from the displayed page or the current filter link. Every
filter change restarts the server cursor and clears the previous page, selection,
evidence, preview and batch result. Selection covers the displayed page only.
The server retains its 50-row keyset page limit and filter-bound cursor.

The reusable link contains only validated mission/status criteria. It can be
bookmarked and survives sign-in and reload in either language. It stores no
private results, selected IDs, evidence, cursor or audit reason. Invalid links
require a filter reset. Reload always checks the current account and role.
Server-managed named presets are not implemented by this link.

The existing server orders by verification signal, then review deadline and ID.
The UI explains this order and labels overdue records with a count for the
displayed page only. It does not claim a global overdue count or globally
overdue-first ordering. Settlement totals remain server aggregates grouped by
currency and optionally scoped to the mission; submission status does not filter
settlements. A settlement is not described as a payment.

Bulk decisions retain immutable previews, fresh role checks, mandatory audit
reasons, idempotent request receipts and per-item stale-state checks. Results
show the batch reference. Retry prepares a new preview of only the failed IDs.
Unknown outcomes retry the same request rather than creating a replacement.

Verification covers the actual component and BFF, 1,205 local submissions above
the configured API row limit, filter-bound keysets, server currency aggregates,
a 100-item decision with 97 successes and 3 stale failures, a retry of only those
3, and reasons on all 100 resulting audit entries. Connected browser tests cover
filters, safe sign-in, reload, 50+4 paging, page-only selection, partial retry,
320px width and revoked-role direct API denial. These are isolated synthetic
checks; current production operations activation and human U05 acceptance are
separate gates.

## Assignment and named-preset continuation

The subsequent N10 source change implements membership-backed assignments,
revision/idempotency/audit commands, private named criteria and optional server
scheduling by earliest deadline. See [OPS_ROUTING_CONTRACTS.md](OPS_ROUTING_CONTRACTS.md)
for the contract and release boundaries. This source implementation does not
establish production SQL application, policy-owner acceptance or hosted U05.

Existing signal-first ordering remains the default. Missing routing schema keeps
these controls unavailable while preserving the existing queue. Production
activation and formal role UAT remain separate gates; N10 remains PARTIAL.
