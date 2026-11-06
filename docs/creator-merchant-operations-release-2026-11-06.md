# Creator, merchant and operations combined release envelope

Status: **READY_FOR_USER_REVIEW**. Launch recommendation: **HOLD**.

## Candidate identity

- Final application source: `76d881ba528856bfb719dd43cd6f36ad0e6f317f`.
- Feature implementation: `6a495a26919c4e85398047217de627de1c796d91`.
- Source-package repair: `5f9669d0fc80e8dd2faa7d20ae83881b28ecab50`.
- Operations team implementation: `366dc65f388c3342d8ad018314009f36e14edb81`.
- Operations team regression coverage: `d215f4b950800c500e6840457f16aa3e27942865`.
- Operations security and legacy-route hardening: `0eb3c55316c828484f8bf4d223a78a94df850f34`.
- Operational APIs and moderation controls: `cf16b82509d6cf67fdd6c56dfcf1a81ed55129cc`.
- Operations content administration and audited migration: `76d881ba528856bfb719dd43cd6f36ad0e6f317f`.
- Corresponding-source SHA-256: `da80ead579488249a9585a105e41489352a158330c960c4a7251d3eb10d2e33f`.
- The source archive contains 676 hashed files and records final revision `76d881b`, `dirty=false`.
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

The disposable project `kinnsoos-public-it-20261106` was previously reset from an empty database and all **203 migrations** applied in order through `20261106135230_harden_ops_team_security`. The reviewed **204th migration**, `20261107020000_kinnso_ops_content_audit`, was then applied to that isolated chain and recorded in the migration ledger without deleting retained records.

The latest browser work intentionally retained clearly labeled synthetic records for review: **39 Auth users, 39 creator records, 8 merchant profiles, 19 operations members, 55 audit rows, 8 sessions, 8 perks, 8 testimonials and 11 enquiries**. The latest successful moderation run is `5d77d43b-ea5d-4783-9667-0ef56561124f`; its creator is active/verified/listed and its merchant is active on the growth tier. Guides, experiences, merchant offers, analytics events and operations invitations remain zero.

The latest passing content run retained:

| Entity | ID | Final state | Audit actions |
| --- | --- | --- | --- |
| Session | `d1ec2717-b72f-4f2c-9fdf-f9bc42e08b2c` | cancelled | create, live, ended, cancelled |
| Partner perk | `dec2f0ac-90e5-4cb3-855e-e9198d525e33` | active | create, active |
| Testimonial | `9aba8e72-4ed2-48e6-8f59-386e2936f9bd` | published | create, published |
| Enquiry | `81f98460-b197-4af8-9a3b-0f2383e5cf18` | resolved | in progress, resolved |

The ten content audit rows belong to operations member `7047dfbd-eb8c-4e06-bc48-241f01216bf3`; the run contains one event per successful state transition and no duplicate events.

### Combined-chain limitation

A fresh 204-migration reset was not started because Windows reported only **0.97 GiB free RAM**, below the established **4 GiB resource gate**. No existing Docker volume or network was stopped or removed. This limitation is recorded as a launch gate rather than converted into passing evidence.

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
- A longer exact-head migration journey was attempted after the alias change, but Chromium closed during a subsequent perk-redemption step under the documented memory pressure before completion. The shorter content-admin journey passed on the same build and explicitly covers the changed alias.

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

- A fresh 204-migration reset remains blocked by the 4 GiB memory resource gate; the predecessor 203-migration reset and subsequent reviewed migration are verified separately.
- Real author-reviewed guides, lawful cover assets and the three-guide content pilot remain content gates.
- Physical iOS/Android, VoiceOver and NVDA acceptance remains unverified.
- Production deployment, production database changes and rollback promotion require separate scoped approval.

## Boundaries

Production and the deployed Journeys application remain unchanged. No production migration, feature-setting change, deployment, redirect, role grant, provider activation or old-host retirement occurred. Backup/restore remains **waived**, not passed.

Paid AI, uploads/media execution, affiliate provider activation, traveller offer-claim retrieval, booking, payment and payout execution remain gated.
