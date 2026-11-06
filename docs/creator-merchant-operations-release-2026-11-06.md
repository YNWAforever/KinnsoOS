# Creator, merchant and operations combined release envelope

Status: **READY_FOR_USER_REVIEW**. Launch recommendation: **HOLD**.

## Candidate identity

- Final application source: `c0763a152716b0f69de136fc90fa09215de8cae8`.
- Feature implementation: `6a495a26919c4e85398047217de627de1c796d91`.
- Source-package repair: `5f9669d0fc80e8dd2faa7d20ae83881b28ecab50`.
- Corresponding-source SHA-256: `744a25629e5b9a0bbd5a7ac42b03b0a7280da12bbc07f1b888f856bbedb2c749`.
- The source archive records final revision `c0763a1`, `dirty=false`.
- Canonical user-facing project: `kinnso-os.vercel.app`.

## Implemented in this candidate

- Removed user-facing and canonical links to `remix-kinnso-web.vercel.app`.
- Added bounded native APIs for creator sessions, contribution tier, partner perks and merchant offers.
- Added creator session create/edit/status, tier history, next-tier perks, perk redemption and gated offer/scan states.
- Added merchant offer creation, publish/pause/end and exact claimed/redeemed counters inside the company workspace.
- Added operations overview and bounded creator, merchant, mission, session, team, perk, testimonial and user directories.
- Mapped legacy creator, merchant and `/admin/*` entry paths to native sections while preserving safe filters and rejecting malformed ids and mutation methods.
- Added explicit gated states for paid AI/scan, affiliate execution, experience/media editing, booking, payments and settlements.
- Repaired `redeem_perk`, whose unqualified columns previously failed every call with PostgreSQL `42702 ambiguous column`.

## Database evidence

The disposable project `kinnsoos-public-it-20261106` was reset from an empty database. All **201 migrations** applied in order through `20261106110000_fix_redeem_perk_ambiguity`. After the final browser run, guides, experiences, sessions, articles, merchant offers, partner perks, operations members and Auth users were all zero.

The repaired RPC was exercised directly from the clean chain and returned:

```json
[{"redemption_type":"code","redemption_value":"DEBUG-CODE"}]
```

The temporary diagnostic rows were removed afterward.

## Verification

- Full Journeys suite: **1,451 passed, 2 skipped, 0 failed**.
- TypeScript: pass.
- Clean source pack plus production-mode webpack build: pass.
- Source-package acceptance: **9 passed, 1 Windows symlink test skipped, 0 failed**.
- Connected browser coverage: **110 distinct creator, merchant, operations, inbox, recovery, publication and SSR cases passed across the candidate line**.
- The core migration journey was rerun at final alias-only commit `c0763a1` after the clean 201-migration reset.
- Browser coverage includes 320px layouts, 200% text, keyboard controls, duplicate/interrupted commands, role revocation, cross-company denial, stale responses and SSR privacy isolation.

## Route matrix

| Disposition | Count |
| --- | ---: |
| Native port accepted | 53 |
| Native port local-only | 6 |
| Excluded and gated | 17 |
| Native-equivalent candidate | 5 |
| Identifier resolution | 2 |
| Operational API unresolved | 5 |
| Port required | 16 |
| **Total** | **104** |

## Remaining launch gates

- Operations invitation acceptance and operations role administration remain incomplete.
- Some operations record mutations are still read/browse only; the candidate does not claim complete administrative write parity.
- Sixteen port-required routes, five native-equivalent candidates and the operational API ownership rows remain unaccepted.
- Real author-reviewed guides, lawful cover assets and the three-guide content pilot remain content gates.
- Physical iOS/Android, VoiceOver and NVDA acceptance remains unverified.
- Production deployment, production database changes and rollback promotion require separate scoped approval.

## Boundaries

Production and the deployed Journeys application remain unchanged. No production migration, feature-setting change, deployment, redirect, role grant, provider activation or old-host retirement occurred. Backup/restore remains **waived**, not passed.

Paid AI, uploads/media execution, affiliate provider activation, booking, payment and payout execution remain gated.
