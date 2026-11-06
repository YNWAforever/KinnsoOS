# Creator, merchant and operations combined release envelope

Status: **READY_FOR_USER_REVIEW**. Technical release verification: **PASS**. Deployment recommendation: **HOLD**.

## Candidate identity

- Final application source: `b049d310b3016eea78aa8754da0992e8bdd1e48b`.
- Runtime application commit: `9947e97fd0b9b8692e81628c2af7dcf90c1a5953`.
- Feature implementation: `6a495a26919c4e85398047217de627de1c796d91`.
- Source-package repair: `5f9669d0fc80e8dd2faa7d20ae83881b28ecab50`.
- Operations team implementation: `366dc65f388c3342d8ad018314009f36e14edb81`.
- Operations team regression coverage: `d215f4b950800c500e6840457f16aa3e27942865`.
- Operations security and legacy-route hardening: `0eb3c55316c828484f8bf4d223a78a94df850f34`.
- Operational APIs and moderation controls: `cf16b82509d6cf67fdd6c56dfcf1a81ed55129cc`.
- Operations content administration and audited migration: `76d881ba528856bfb719dd43cd6f36ad0e6f317f`.
- Migration-journey and admin-heading fix: `9947e97fd0b9b8692e81628c2af7dcf90c1a5953`.
- Final device and accessibility harness: `b049d310b3016eea78aa8754da0992e8bdd1e48b`.
- Corresponding-source SHA-256: `a2c80d60ea9198332d3bf4a918079aa3e283bc17b39448bb273c29254357687c`.
- The source archive contains 676 hashed files and records final revision `b049d31`, `dirty=false`.
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
- The final source built successfully under both Node.js 24.22.1 and Node.js 26.13.0, generating all 71 routes.
- The device draft suite passed **13/13**, covering offline/device-style navigation, IndexedDB persistence, recovery, Back/Forward protection, import and cancellation.
- Connected accessibility passed **1/1**, public accessibility passed **36/36**, component accessibility passed **50/50**, and the content workflow passed **5/5**.

## Content readiness

The production content check **FAILED**. Production currently displays nine published guide cards: one explicitly synthetic workflow fixture and eight non-synthetic summaries. Only the synthetic guide has a structured `guide_version`; the other eight have no version, no days or stops, no source references, no cover asset and no place-verification date. No named author-consent record, editorial approval or cover-rights record exists.

The seven article rows are placeholder/seed fixtures with generated UUIDs, no publication dates and no source or validation references. They do not satisfy the three-guide real-content pilot.

## Device and accessibility

Automated Chromium coverage passes across EN/zh-HK, 320/640/1280px, 200% zoom-equivalent text, touch-style device navigation, keyboard-only operation, axe WCAG A/AA through 2.2, focus restoration and loading/error announcements.

Physical iOS Safari, physical Android Chrome, actual VoiceOver and actual NVDA remain **NOT_RUN**. Automated browser emulation and axe results do not close those acceptance gates.

## Production rollout

Production is unchanged and remains on deployment `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`, source lineage `42be3ce4c7207b6ec11ec8c4bd85a5feaa6588ef`. The deployment is READY, no rollback is pending, and `/api/health` on the old production release returns 404.

Production binds to Supabase project `scryfkefedzuetfdtrvl` with `trips,bookmarks,creator,merchant,ops,notifications` enabled. Its ledger has 204 entries but ends at `20261105123750`, while the candidate’s 204-entry clean chain ends at `20261107020000`. Production is missing the reviewed public-inventory suspension, redeem-perk repair, operations-lifecycle and security hardening, and audited content migration. It also retains the permissive operations write policies, permits authenticated audit-log appends and lacks the six audited content RPCs.

The exact rollback target is recorded as `dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs`. The currently deployed app does not use the table-write paths revoked by migration 204, so the reviewed database delta can be applied before the new app, followed by application verification and capability checks. A database reversal must be a reviewed forward fix; historical migrations must not be replayed.

No production error logs were found for the last 24 hours. The installed Vercel CLI does not expose the metrics command, and an external alert binding is not verified. Two hosted Preview attempts were rejected by Vercel packaging/CLI limitations before runtime: the directory upload omitted the required `.gitignore`, and local prebuilt packaging could not spawn `cmd.exe`. No Preview alias or production alias was changed.

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

- No author-consented structured guide, source/verification record or lawful cover asset exists. Production has eight summary-only cards plus one synthetic test guide.
- Physical iOS/Android, VoiceOver and NVDA remain unverified.
- Production is missing five reviewed migrations and still has the pre-hardening schema/security behavior; the current app is 41 commits behind the runtime candidate.
- Production deployment, database application, capability verification and rollout approval remain separate gates.

## Boundaries

Production and the deployed Journeys application remain unchanged. No production migration, feature-setting change, deployment, redirect, role grant, provider activation or old-host retirement occurred. Backup/restore remains **waived**, not passed.

Paid AI, uploads/media execution, affiliate provider activation, traveller offer-claim retrieval, booking, payment and payout execution remain gated.
