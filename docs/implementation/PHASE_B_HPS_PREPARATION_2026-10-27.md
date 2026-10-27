# Phase B H/PS synthetic preparation — 2026-10-27

Status: **CODING_DOCS_ONLY / HOSTED_START_GATE_NOT_YET**. All H01–H14 and PS01–PS06 remain **NOT_RUN**. This is a dated overlay on the existing pilot docs, not hosted acceptance or a new product surface. Merge is for Willy; Phase C remains **NO_GO**.

Baseline: main `66265c8d37088e56a1c6151c7c1e9fb34c1826c2`, merged PR #103. The owner reports live apply + proxy DONE and recovery SKIPPED; this preparation does not repeat or independently attest those live operations. Target: Vercel `kinnso-os` and Supabase `scryfkefedzuetfdtrvl`, **SHARED_PRODUCTION**, with 0 live branches. A Preview is not an isolated backend.

## Owner decisions mirrored into the repository

Source: the owner's 2026-10-27 session summary of operator-box Phase B readiness §6. The operator intake files were not available/read here. Records below and the [fixture manifest](PHASE_B_SYNTHETIC_COHORT_2026-10-27.json) are tagged **SYNTHETIC**, **SYNTHETIC_OWNER_WAIVER**, and **filled_from_owner_synthetic_decision**. These are selected bindings, not newly created records or proof of login capability.

| Binding | Selected synthetic record | Limits / remaining facts |
| --- | --- | --- |
| Content decision | `SYNTHETIC_ALLOWED`: no real author/consent → synthetic OK | Closed pilot preparation only; real author consent and image rights are not established |
| Company A | Sunrise Stays HK | `SYNTHETIC_BRANCH_PENDING`; 0 live branches; company/branch IDs `OWNER_REQUIRED` |
| Company B | Wanderpack Gear | `SYNTHETIC_BRANCH_PENDING`; 0 live branches; company/branch IDs `OWNER_REQUIRED` |
| `creator-a` | Mika Tanaka; creator id `8671b8cf-cc59-6b79-48f8-51c463a7eafe` | Creator entity ID is not assumed to be an Auth user ID |
| `creator-b` | Jordan Lee; creator id `2e2dff32-09c2-444d-90f4-20dc4c38e781` | Creator entity ID is not assumed to be an Auth user ID |
| Guide A | Mika Tokyo ramen crawl → Mika / `creator-a` | `SYNTHETIC_OWNER_WAIVER`, pilot only, not real rights |
| Guide B | Jordan Singapore with kids → Jordan / `creator-b` | `SYNTHETIC_OWNER_WAIVER`, pilot only, not real rights |
| Guide C | Chalisa Bangkok street food → Chalisa Wong; creator id `19094b01-0391-35ad-ff48-967a414d32c0` | Outside a/b aliases; no invented `creator-c` Auth slot; same pilot-only waiver |
| Ops | Mod Chan, existing moderator | No new grant; exact private Auth reference/session/scope still needs later verification |
| Cleanup owner | Willy Lai | Named responsibility only; cleanup is not executed or newly authorized |

Guide/version IDs, days/stops, source checks, language, cover rights and publication evidence remain `OWNER_REQUIRED` where not supplied. No generated itinerary, fabricated source/date, assumed company UUID or contact address fills those gaps. Existing actor aliases/role names come from `apps/journeys/scripts/pilot-preparation.template.json`.

This overlay supersedes older blanket “synthetic cannot fill pilot content” wording **only for the approved synthetic preparation cohort**. It does not complete the original real-consent content gate or grant public publishing rights. No public synthetic guide/profile/brief/share publication without separate **Approve**.

## Later Auth create + role assign worksheet — offline only

The manifest scaffolds 11 unresolved Auth slots: eight merchant slots (owner/marketing/clerk/finance for each company), `traveller-a`, `traveller-b`, and `outsider`. Each has `auth_decision: OWNER_REQUIRED_CREATE_VS_SKIP`, `email: OWNER_REQUIRED`, and `auth_user_id: OWNER_REQUIRED`. Requested merchant membership roles describe the future review packet; `role_assignment: NOT_AUTHORIZED` is unchanged. Travellers/outsider have no requested merchant membership. Do not reinterpret the old proposal for 13 new non-Ops identities as current create authority. Creators have selected entity bindings; Ops is existing.

The connection-free [planner](../../scripts/phase-b-auth-plan.py) prints this fixed committed worksheet. It does not load `.env`, accept credentials/URLs, construct a client, call a service, write files, generate SQL, or implement an executor.

```sh
# From repo root. Expected exit 2: worksheet is valid but owner inputs are blocked.
python scripts/phase-b-auth-plan.py

# Expected exit 3: production planning is OFF by default.
python scripts/phase-b-auth-plan.py --target shared-production

# Optional OFFLINE metadata plan only, still exit 2, no Auth/role action.
PHASE_B_ALLOW_PRODUCTION_PLAN=1 python scripts/phase-b-auth-plan.py --target shared-production

# Always exit 3, including with the flag set: execution is unsupported.
python scripts/phase-b-auth-plan.py --execute
```

`PHASE_B_ALLOW_PRODUCTION_PLAN` defaults to `0`; only exact `1` permits printing the shared-production worksheet. **It never permits production execution.** All reports keep `execution_supported: false`, `authorized_actions: []`, `role_grants: []`, and runtime `NOT_RUN`. No environment or Vercel secret is set by this package. Exit 2 is a retained blocker, not a failed hosted operation.

Later, under a separate explicit authorization:

1. Willy/owner decides **CREATE or SKIP per alias**. Obtain real owner-controlled contacts privately only if CREATE is chosen. SKIP leaves affected acceptance cases blocked unless a separately approved alternative binding covers them; do not substitute a creator or Ops identity.
2. Bind exact Auth IDs privately, verify distinct actors, target ownership, company IDs and branch IDs, and reconcile existing users/memberships before proposing mutations. No inferred equivalence between creator IDs and Auth IDs; no self-granted `user_metadata` authority.
3. Prepare a reviewed, bounded executor as separate work: exact per-user Auth method, confirmation/recovery and contact ownership, existing authorized company membership mechanism, clerk branch scope, negative controls, side-effect receipts and cleanup IDs. This PR provides no runnable create/assign commands. Reuse Mod Chan's existing authority; never add moderator/admin grants.
4. Require explicit target-specific approval and a fresh production execution gate (OFF by default) before implementing/running that executor. A production-plan opt-in, merged source PR, completed live apply, synthetic waiver or CI pass is insufficient. No DDL, Auth configuration changes, Vercel secrets or blanket seed/reset/cleanup are part of this packet.
5. Resolve policy/mailbox/publication gates and obtain the separate H/PS **start** authorization. Only then can later bounded acceptance use exact source/deployment/schema/config/actor bindings and the existing owned-success/denial contracts. Recovery stays SKIPPED; it is not relabeled PASS.

## H/PS binding gap matrix

Sources: [H01–H14](CREATOR_MERCHANT_HOSTED_UAT.md), [PS01–PS06 §3](KINNSO_PRODUCT_SPEC_2026-10-22.md), and the [product pilot](KINNSO_PRODUCT_DEVELOPMENT_PLAN_2026-10-25.md). Scenario definitions are unchanged.

**These categories describe preparation/binding coverage only. `READY_WITH_CURRENT_SYNTHETIC_BINDS` never means runnable, passed, consent-cleared, publicly publishable or start-gate approved.** Creator/Ops slices may be binding-ready while the full multi-role case remains blocked. Every row also requires the separate start gate, target/source/schema/config checks and bounded fixture/cleanup approval; all observed hosted results remain `NOT_RUN`.

| Case | Preparation category | Ready binding or specific gap; full-case hold |
| --- | --- | --- |
| H01 applicant → moderator → owner | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Mod Chan bound; merchant applicant/owner Auth and company binding unresolved |
| H02 brief → creator applies → owner accepts | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Mika bound; merchant owner Auth/company required; public brief needs separate Approve |
| H03 proof → revision → resubmit → approve | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Creator binding ready; merchant owner Auth and bounded participation/proof fixtures missing |
| H04 tracked / settled / historical earnings | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Creator binding ready; full approval/earnings lifecycle needs merchant Auth and approved records; no invented payment |
| H05 creator B cannot access A | READY_WITH_CURRENT_SYNTHETIC_BINDS | Mika/Jordan bound; distinct Auth references/sessions, owned A records and matching success controls still need verification; if merchant setup is required, its Auth remains blocked |
| H06 company B cannot access A | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Both company names bound; owners' Auth, company IDs and branch fixtures unresolved |
| H07 marketing public brief vs owner-only proof | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Marketing/owner Auth and scoped memberships unresolved; public publishing separate Approve |
| H08 clerk branch / finance scope | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Clerk/finance Auth unresolved; branches `SYNTHETIC_BRANCH_PENDING` (0 live), so Auth alone cannot clear this case |
| H09 moderator conflict / reason / history | READY_WITH_CURRENT_SYNTHETIC_BINDS | Mod Chan ready as existing moderator; bounded case/conflict fixture needed; company-membership negative control waits for merchant Auth; no new Ops grant |
| H10 revoked role clears old authority | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Merchant role actors/memberships and separately approved revocation procedure needed; no grant/revoke in this PR |
| H11 unknown ACK → identical retry → one effect | READY_WITH_CURRENT_SYNTHETIC_BINDS | Creator/Ops binding slice available; exact owned request/payload/fixture needed; merchant variants wait for merchant Auth |
| H12 saved state / drafts / CAS recovery | READY_WITH_CURRENT_SYNTHETIC_BINDS | Creator/Ops binding slice available; fresh login/readback and conflicts unmeasured; merchant/traveller variants wait for Auth |
| H13 signup / confirmation / recovery mailbox | OWNER_REQUIRED_POLICY | Designated controlled real mailbox, ownership and receipt/redirect checks `OWNER_REQUIRED`; new Auth create-vs-SKIP also unresolved; do not invent addresses |
| H14 EN/zh-HK / keyboard / 320px / 200% | READY_WITH_CURRENT_SYNTHETIC_BINDS | Creator/Ops binding slice available; physical/accessibility observations NOT_RUN; merchant/traveller states remain Auth-blocked |
| PS01 guide → adopt → private trip → new session | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Three synthetic guide bindings ready; traveller-a/b Auth unresolved; structured guide/version and public exposure approval still needed |
| PS02 prepare / photos / share / revoke | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Traveller-a/b and outsider Auth unresolved; recipient/share/media scope and separate public exposure approval remain required |
| PS03 creator draft → usable guide → publish | READY_WITH_CURRENT_SYNTHETIC_BINDS | Mika/Jordan/Chalisa + guides ready as selections; structured content/guide IDs/login mapping still required; publish/withdraw/adoption retention NOT_RUN and publication needs separate Approve |
| PS04 creator completes collaboration | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Creator ready; merchant owner Auth and collaboration fixtures/terms missing |
| PS05 merchant onboarding → brief → review/report | BLOCKED_UNTIL_MERCHANT_TRAVELLER_AUTH | Eight merchant Auth decisions, company IDs, branches and scoped roles unresolved; public brief separate Approve |
| PS06 Ops exception → support/job → handoff | OWNER_REQUIRED_POLICY | Mod Chan bound; support/processors/reviewers and handoff process `OWNER_REQUIRED`; original-role readback also depends on relevant merchant/traveller Auth; job/provider work needs separate scope |

Policy legal/privacy/support/processors/reviewers and H13 mailbox are **OWNER_REQUIRED** across the packet. They are not silently waived by a synthetic content choice or by Mod Chan's existing moderator role. The matrix highlights the most direct gap per case, and the last column preserves mixed-case dependencies.

## Implementation and review checklist

- [x] Mirror the fixed owner selections in a non-secret fixture manifest; preserve unknown IDs/contacts and pilot-only waiver limits.
- [x] Add an offline Auth worksheet with default-OFF production-plan guard and unconditional execution refusal; test those refusals before implementation.
- [x] Extend existing content/hosted preparation entry points with links to this dated overlay; retain historical evidence and scenario definitions.
- [x] Add the exact review branch to the three existing Git deployment holds; preserve builds, schedules and existing holds. This is source configuration only, with no Vercel secret changes.
- [x] Verify focused Python tests, fixture/doc consistency, links, deployment holds and final diff; independent review found no issues.

Validation: `python -m unittest discover -s scripts -p phase_b_hps_prep_test.py -v` passed 5 tests; deployment-hold checks passed 3 tests. The new guard checks failed before the planner/manifest existed, then passed. All 20 H/PS rows, 11 exact pending Auth aliases, policy placeholders and document links were checked locally; `git diff --check` passed. Independent read-only review reran the same 8 focused tests and found no findings.

Broader local limitations are retained: Python discovery ran 38 tests, with 28 passing and 10 `verify_journeys_production_test.ArchiveContract` errors when the sandbox denied creation of the tests' owned localhost HTTP socket (`EPERM`); no hosted request occurred. Existing Node pilot-preparation checks passed 24 in-process cases, while 5 CLI cases failed because Node `spawnSync` returned `EPERM` with no child output. These are not H/PS results. App build/typecheck/browser/integration and hosted acceptance were not run for this docs/offline package. PR checks, if any, are separate exact-commit evidence.

Delivery is a PR against `main` for Willy's review; the final delivery response supplies the PR URL and exact remote head. No merge is authorized.

Rollback is a source revert reviewed by Willy, preserving existing deployment holds. This preparation performs no live Auth create, role grant, H/PS run, scryf DDL, secret change, public synthetic publication or runtime cleanup.
