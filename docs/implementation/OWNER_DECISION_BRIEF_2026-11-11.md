# Owner decision brief — what is blocked, what is recommended

**Purpose:** convert every owner-blocked item into a decision you can answer in one sitting. Each decision lists the recommendation, what it unblocks, and what happens if it stays open. Nothing here requires engineering work before your answer.

**Deadline context:** four launch waivers expire **2026-12-09**; email E2b and Phase 6 both wait on sections 1 and 2.

## 1. Email delivery (blocks E2b — the last missing user-facing channel)

Everything else is built: outbox queue, sender cron, bilingual templates, retry/backoff, ops self-test, health check, alert state, retention. Production is deliberately flag-off with no provider.

| # | Decision | Recommended default | Unblocks | If deferred |
|---|---|---|---|---|
| E1 | **Provider** | **Resend** (simple API, fast domain setup; Postmark/SES are equally supportable) | provider adapter case | no email; in-app only |
| E2 | **Sending domain** | `mail.kinnso.com` subdomain, SPF + DKIM + DMARC; owner controls DNS | live sends, deliverability | — |
| E3 | **From / reply-to** | `Kinnso <bookings@mail.kinnso.com>`, reply-to unmonitored or none | template config | — |
| E4 | **Email mute semantics** | separate email preference (default in-app mute does not silently mute email) — needs a small follow-up slice | preference UX | reusing in-app mute is acceptable as v1 |
| E5 | **Service-role credential** in Vercel env | set `KINNSO_SUPABASE_SERVICE_ROLE_KEY` (the sender resolves addresses through Auth admin) | live sending | sender reports `service-role-missing` |

**Fastest path:** answer E1–E3 and E5; I implement the provider case, staging-test to your mailbox, then enable one event type before expanding.

## 2. Paid surfaces (blocks Phase 6 entire)

The five §8 answers from `PAID_SURFACES_DECISION_PACK_2026-11-10.md`:

| # | Decision | Recommended default |
|---|---|---|
| P1 | Booking model | **B — pay after the creator accepts** (matches the current request/accept flow) |
| P2 | Provider / merchant of record / currency | **Stripe, Kinnso as MoR, HKD** |
| P3 | Commission and payout cadence | e.g. 15% commission, monthly payouts — confirm the number |
| P4 | Cancellation/refund matrix and dispute owner | refund full before acceptance, policy-defined after; Kinnso owns disputes |
| P5 | First-market legal entity and card-data location | entity named by owner; **card data stays provider-hosted** (no card data touches our DB) |

**If deferred:** the free product still launches; paid booking cannot ship without these.

## 3. Backup / PITR (renewal decision)

- **Current:** two logical restore rehearsals matched production (181 tables / 434 functions / 421 indexes / 133 policies); platform PITR unverified.
- **Decision:** adopt platform PITR (Supabase add-on) or document the logical-restore runbook as the accepted posture.
- **Deadline:** waiver expires **2026-12-09**.

## 4. Privacy review (renewal decision)

- **Current:** AI disclosure, account export, deletion and request channel live and exercised; owner legal/privacy review pending.
- **Decision:** confirm the policy/legal review or renew the waiver with a new date.
- **Deadline:** **2026-12-09**.

## 5. Physical devices and assistive tech (renewal decision)

- **Current:** 0/24 matrix cells recorded (iOS Safari, Android Chrome, VoiceOver, NVDA across six surfaces); automated axe pass 0 violations, keyboard and reflow checks passed.
- **Decision:** is a physical-device pass required before public launch, or is the automated evidence + waiver acceptable for the soft-launch cohort?
- **Practical option:** record cells incrementally as devices are available; 24 cells is roughly 1–2 focused sessions on borrowed hardware.
- **Deadline:** **2026-12-09**.

## 6. Production data cleanup (10 minutes, owner-only)

| Item | Recommendation |
|---|---|
| 2 old accepted booking rows (`launch-traveller` / release-operator test data) | delete, so the queue reflects real users |
| 3 automation/test identities | delete or revoke, keeping only real creators/ops |
| Alert destination | already configured per the launch gate; confirm the receiver inbox is monitored |

## 7. Decision record

When you answer, I will record each choice in `docs/implementation/OWNER_DECISIONS_2026-11.md` with a date, then turn the email answers into E2b and the payment answers into a Phase 6 implementation plan. No engineering starts on guesses.
