# Existing merchant team access

N11/F08/G04/G11/G12/U04: this increment replaces typed account UUIDs with an owner-scoped existing-member selector, explains organization role and branch scope before saving, and labels commission values in both languages as percentages. The original task and requirement identifiers remain unchanged.

The new authenticated `get_kinnso_merchant_team` RPC checks the current canonical session and active owner of the requested company. It reads only related merchant memberships, a bounded display name and their assigned branch metadata. It returns50 members per UUID keyset page, validates that a cursor belongs to this company, includes inactive members for explicit revocation/review and labels archived assignments. It returns no email, unrelated account directory, Auth metadata or financial totals. The existing composite membership primary key supports this pagination. Anonymous execution and direct internal-table access remain denied.

The UI uses existing merchant commands, reasons, atomic audit and idempotent request receipts. An unknown response retains the exact request. Refreshes reread current server access; account/company changes discard prior private reads and drafts. The role preview explains existing server policy and grants no authority. Unavailable branch assignments require explicit removal, rather than silently changing a saved scope. Cancel discards the form without a command.

Mature commission fields are nonnegative numeric(8,2) percentage values:70 remains70%,0.70 remains0.70%. Inputs reject missing/invalid values and implicit rounding. This increment does not invent a commercial split, reinterpret fractions, enable funding/payment or mark obligations paid. Recorded amounts retain their server-provided currency and settlement meaning.

New-account invitations are still unavailable. A separate model must supply limited recipient binding, expiry, single use, revocation, safe delivery and fresh authorization; there is no global email/UUID search or synthetic invitation success. N11 remains PARTIAL until that model, policy and named hosted U04 acceptance are verified.

The read RPC migration is source-local until separately authorized and recovery-checked for production. Missing schema is shown as unavailable. Source tests, merge status, public production release checks and role acceptance are separate evidence. Revert the UI/BFF to roll back this increment; never erase existing memberships, merchant audit or request receipts.
