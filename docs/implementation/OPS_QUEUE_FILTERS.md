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

## Assignment and named-preset review boundary

No existing assignment contract was found in this queue. The following minimal
contract is proposed for a separate review; it is not an applied schema or an
implemented feature:

- One assignment per submission, with `assigned_ops_member_id` referencing an
  existing operations membership, a monotonic revision and timestamps. An
  arbitrary account UUID cannot be assigned.
- An active admin/owner assigns or clears work. The assignee must be an active
  member with review permission. Every command checks fresh actor/assignee
  authority, the expected revision and an idempotency key in one transaction.
  It records before/after membership, actor, reason and request reference in the
  existing audit boundary. No authenticated direct table-write grants.
- Assignment is routing information, not permission to approve or read work.
  Existing review authority still applies. A paused assignee is shown as
  unavailable, without silently transferring work or granting access.
- Named presets belong to an operations membership and contain only an
  allowlisted filter version and criteria. They contain no submission snapshots,
  notes or financial results. Every reopened preset uses current role checks and
  a fresh cursor. Sharing presets needs a separately approved scope.
- Assigned/unassigned filters, cursor scope, indexes and the interaction with
  existing batch previews must be specified and tested together before migration.
  Global overdue-first ordering also requires its own cursor/index contract.

Assignment policy acceptance, new schema authorization/recovery, runtime
configuration and named-role UAT remain pending. N10 remains PARTIAL until the
applicable remaining gates are met. Revert the UI/BFF change to roll back this
increment; existing batch receipts and audit records remain intact.
