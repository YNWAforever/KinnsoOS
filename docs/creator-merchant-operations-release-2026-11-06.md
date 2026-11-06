# Creator, merchant and operations combined release envelope

Status: **READY_FOR_USER_REVIEW**. Launch recommendation: **HOLD**.

## Candidate identity

- Final application source: `202da454b3fff37588fdad37448bf3f0a5218bbc`.
- Feature implementation: `6a495a26919c4e85398047217de627de1c796d91`.
- Source-package repair: `5f9669d0fc80e8dd2faa7d20ae83881b28ecab50`.
- Operations team implementation: `366dc65f388c3342d8ad018314009f36e14edb81`.
- Operations team regression coverage: `d215f4b950800c500e6840457f16aa3e27942865`.
- Operations security and legacy-route hardening: `0eb3c55316c828484f8bf4d223a78a94df850f34`.
- Final source-package correction: `202da454b3fff37588fdad37448bf3f0a5218bbc`.
- Corresponding-source SHA-256: `05627f712886095e5d121eb319299ec0297ce9c06e6191c626e6aea70178fe0a`.
- The source archive records final revision `202da45`, `dirty=false`.
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
- Mapped legacy creator, merchant and `/admin/*` entry paths to native sections while preserving safe filters and rejecting malformed ids and mutation methods.
- Added explicit gated states for paid AI/scan, affiliate execution, experience/media editing, booking, payments and settlements.
- Repaired `redeem_perk`, whose unqualified columns previously failed every call with PostgreSQL `42702 ambiguous column`.

## Database evidence

The disposable project `kinnsoos-public-it-20261106` was reset from an empty database. All **203 migrations** applied in order through `20261106135230_harden_ops_team_security`.

The latest browser work intentionally retained clearly labeled synthetic records for review: **17 Auth users, 17 creator records, 8 merchant profiles, 8 operations members and 33 audit rows**. The latest successful moderation run is `5d77d43b-ea5d-4783-9667-0ef56561124f`; its creator is active/verified/listed and its merchant is active on the growth tier. Guides, experiences, sessions, offers, perks, analytics events and throttle rows remained zero.

The repaired RPC was exercised directly from the clean chain and returned:

```json
[{"redemption_type":"code","redemption_value":"DEBUG-CODE"}]
```

The temporary diagnostic rows were removed afterward.

## Verification

- Full Journeys suite at the final application source: **1,482 passed, 2 skipped, 0 failed**.
- TypeScript: pass.
- Clean source pack plus production-mode webpack build: pass.
- Source-package acceptance: **9 passed, 1 Windows symlink test skipped, 0 failed**.
- Connected browser coverage: **111 distinct creator, merchant, operations, inbox, recovery, publication, access-lifecycle and SSR cases passed across the candidate line**.
- The hardened build passed **14 connected browser cases**: the complete creator-merchant-operations migration journey, operations-team lifecycle, authenticated recovery/sign-out behavior, legacy aliases and explicit no-write capability gates.
- The operations security integration suite passed **3/3** on the clean 203-migration database, including simultaneous owner demotions, accept-versus-revoke, stale-session denial, invite token isolation, audit forgery denial, confirmed-email enforcement and expired-invite replacement.
- The operational API contract suite passed **9/9**; safe browser mode passed; production-mode analytics persisted one consent-bounded event and suppressed an identical retry.
- The focused creator/merchant moderation browser workflow verified suspension, reinstatement, verification, directory listing, tier changes and audited private notes.
- Browser coverage includes 320px layouts, 200% text, keyboard controls, duplicate/interrupted commands, role revocation, cross-company denial, stale responses and SSR privacy isolation.

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

- Session, perk, testimonial and enquiry administration mutations remain incomplete.
- Real author-reviewed guides, lawful cover assets and the three-guide content pilot remain content gates.
- Physical iOS/Android, VoiceOver and NVDA acceptance remains unverified.
- Production deployment, production database changes and rollback promotion require separate scoped approval.

## Boundaries

Production and the deployed Journeys application remain unchanged. No production migration, feature-setting change, deployment, redirect, role grant, provider activation or old-host retirement occurred. Backup/restore remains **waived**, not passed.

Paid AI, uploads/media execution, affiliate provider activation, traveller offer-claim retrieval, booking, payment and payout execution remain gated.
