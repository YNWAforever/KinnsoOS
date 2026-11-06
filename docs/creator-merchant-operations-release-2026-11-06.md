# Creator, merchant and operations combined release envelope

Status: **READY_FOR_USER_REVIEW**. Technical release verification: **PASS**. Deployment recommendation: **HOLD**.

## Candidate identity

- Final application source: `9947e97fd0b9b8692e81628c2af7dcf90c1a5953`.
- Feature implementation: `6a495a26919c4e85398047217de627de1c796d91`.
- Source-package repair: `5f9669d0fc80e8dd2faa7d20ae83881b28ecab50`.
- Operations team implementation: `366dc65f388c3342d8ad018314009f36e14edb81`.
- Operations team regression coverage: `d215f4b950800c500e6840457f16aa3e27942865`.
- Operations security and legacy-route hardening: `0eb3c55316c828484f8bf4d223a78a94df850f34`.
- Operational APIs and moderation controls: `cf16b82509d6cf67fdd6c56dfcf1a81ed55129cc`.
- Operations content administration and audited migration: `76d881ba528856bfb719dd43cd6f36ad0e6f317f`.
- Migration-journey and admin-heading fix: `9947e97fd0b9b8692e81628c2af7dcf90c1a5953`.
- Corresponding-source SHA-256: `36ec39cf47dfbf9c2e94ac0898799537fd704168a07605544760ee8cc0a88f67`.
- The source archive contains 676 hashed files and records final revision `9947e97`, `dirty=false`.
- Canonical user-facing project: `kinnso-os.vercel.app`.

## Implemented in this candidate

- Removed user-facing and canonical links to `remix-kinnso-web.vercel.app`.
- Added bounded native APIs for creator sessions, contribution tier, partner perks and merchant offers.
- Added creator session create/edit/status, tier history, next-tier perks, perk redemption and gated offer/scan states.
- Added merchant offer creation, publish/pause/end and exact claimed/redeemed counters inside the company workspace.
- Added operations overview and bounded creator, merchant, mission, session, team, perk, testimonial and user directories.
- Added owner-only operations invitations and one-time acceptance, role changes, suspension/reactivation and invite revocation.
- Added retry-safe operations-team database transitions so repeated requests do not duplicate invites or audit events.
- Closed the legacy operations-suspension bypass and serialized concurrent owner changes so the final active owner cannot be removed.
- Added current-session validation to operations RPCs and RLS, column-level protection for invite secrets, verified-email acceptance, locked accept/revoke transitions, idempotent acceptance and audited acceptance.
- Closed the remaining public, authentication, creator and merchant route aliases; traveller offer claims and booking confirmations now return explicit capability gates instead of broken routes.
- Ported native health, consented analytics ingestion/reporting, retention cron and secret-authenticated cache revalidation APIs.
- Added operations creator suspension/reinstatement, verification, directory listing and private notes.
- Added operations merchant pause/reactivation, tier changes and private notes.
- Added connected operations session creation and status controls, partner-perk creation/activation, testimonial draft publication and enquiry status review.
- Added a 204th migration that puts those six operations mutations behind transaction-bound `SECURITY DEFINER` RPCs with a fresh moderator-role check, exact request-ID retry reconciliation, row locks, input bounds and audit events.
- Replaced permissive operations write policies for these tables with moderator read policies, revoked direct perk/testimonial writes, and retained creator ownership rules for community sessions.
- Corrected the legacy `/admin/enquiries` alias to the native enquiry-administration view instead of the support-message queue.
- Mapped legacy creator, merchant and `/admin/*` entry paths to native sections while preserving safe filters and rejecting malformed ids and mutation methods.
- Added explicit gated states for paid AI/scan, affiliate execution, experience/media editing, booking, payments and settlements.
- Repaired `redeem_perk`, whose unqualified columns previously failed every call with PostgreSQL `42702 ambiguous column`.

## Database evidence

The separate disposable project `kinnsoos-clean-review-20261107` was started on a dedicated Docker network with seed data disabled and replayed all **204 migrations** from zero through `20261107020000_kinnso_ops_content_audit`. Docker reported **16.6 GB** of capacity, with WSL2 reporting 15 GiB total and 12 GiB available. The reset database contained zero Auth users, sessions, perks, testimonials, enquiries and audit rows.

The clean exploration API loaded **216 functions**. PostgreSQL confirmed all six content administration RPCs are `SECURITY DEFINER` and executable by authenticated users, while `ops_audit_log_append` is not client-executable. The three operations read policies exist, the former permissive operations write policies are absent, and authenticated users have no direct `INSERT`, `UPDATE` or `DELETE` grants on partner perks or testimonials.

The retained browser project `kinnsoos-public-it-20261106` intentionally contains clearly labeled synthetic records for review: **51 Auth users, 51 creator records, 10 merchant profiles, 23 operations members, 75 audit rows, 10 sessions, 10 perks, 10 testimonials and 13 enquiries**. The latest successful moderation run is `5d77d43b-ea5d-4783-9667-0ef56561124f`; its creator is active/verified/listed and its merchant is active on the growth tier. Guides, experiences, merchant offers, analytics events and operations invitations remain zero.

The latest passing content run retained:

| Entity | ID | Final state | Audit actions |
| --- | --- | --- | --- |
| Session | `22fa4bd2-3518-43e6-a5f8-7d7287e889b8` | cancelled | create, live, ended, cancelled |
| Partner perk | `ff8a1920-e1dc-4c11-b153-ef71b2e2ce8a` | active | create, active |
| Testimonial | `2a97b78d-6c0b-4578-931d-b716efa13820` | published | create, published |
| Enquiry | `c24728a0-8e47-46a4-84ed-51fa60ba160c` | resolved | in progress, resolved |

The ten content audit rows belong to operations member `a642fc9c-b0be-400f-a1ac-c15654eace2a`; the run contains one event per successful state transition and no duplicate events.

### Combined-chain verification

The clean 204-migration reset passed. A dedicated network was required because Docker’s predefined address pools were exhausted; only the temporary clean-review network and containers were created, then removed after verification.

The repaired RPC was exercised directly from the clean chain and returned:

```json
[{"redemption_type":"code","redemption_value":"DEBUG-CODE"}]
```

The temporary diagnostic rows were removed afterward.

## Verification

- Full Journeys suite at the final application source: **1,489 passed, 2 skipped, 0 failed**.
- TypeScript: pass.
- Exact clean-commit source pack plus production-mode webpack build: pass; all 71 routes generated.
- Source-package acceptance: **10 passed, 1 Windows symlink test skipped, 0 failed**.
- Connected browser coverage: **111 distinct creator, merchant, operations, inbox, recovery, publication, access-lifecycle and SSR cases passed across the candidate line**.
- The hardened build passed **14 connected browser cases**: the complete creator-merchant-operations migration journey, operations-team lifecycle, authenticated recovery/sign-out behavior, legacy aliases and explicit no-write capability gates.
- The operations security integration suite passed **3/3** on the clean 203-migration database, including simultaneous owner demotions, accept-versus-revoke, stale-session denial, invite token isolation, audit forgery denial, confirmed-email enforcement and expired-invite replacement.
- The operational API contract suite passed **9/9**; safe browser mode passed; production-mode analytics persisted one consent-bounded event and suppressed an identical retry.
- The focused creator/merchant moderation browser workflow verified suspension, reinstatement, verification, directory listing, tier changes and audited private notes.
- The focused operations-content browser workflow verified session, perk, testimonial and enquiry mutations, ten exact audit events, and the corrected legacy enquiry alias.
- The isolated operations-content integration case verified duplicate-create reconciliation, concurrent status audit deduplication, moderator-role denial and denial of direct authenticated perk, testimonial and cross-creator session writes.
- Browser coverage includes 320px layouts, 200% text, keyboard controls, duplicate/interrupted commands, role revocation, cross-company denial, stale responses and SSR privacy isolation.
- The complete authenticated creator-merchant-operations migration journey passed on the exact final build in **25.3 seconds**, including creator session creation, perk redemption, merchant offers, operations directories, role revocation, legacy enquiry routing and responsive width.
- The shorter audited content-admin mutation flow also passed on the final build.

## Route matrix

| Disposition | Count |
| --- | ---: |
| Native port accepted | 76 |
| Native port local-only | 6 |
| Excluded and gated | 20 |
| Native-equivalent candidate | 0 |
| Identifier resolution | 2 |
| Operational API unresolved | 0 |
| Port required | 0 |
| **Total** | **104** |

## Remaining launch gates

- Real author-reviewed guides, lawful cover assets and the three-guide content pilot remain content gates.
- Physical iOS/Android, VoiceOver and NVDA acceptance remains unverified.
- Production deployment, production database changes and rollback promotion require separate scoped approval.

## Boundaries

Production and the deployed Journeys application remain unchanged. No production migration, feature-setting change, deployment, redirect, role grant, provider activation or old-host retirement occurred. Backup/restore remains **waived**, not passed.

Paid AI, uploads/media execution, affiliate provider activation, traveller offer-claim retrieval, booking, payment and payout execution remain gated.
