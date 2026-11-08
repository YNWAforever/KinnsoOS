# Phase 4 closeout checklist — current state and the exact remaining actions

Generated: 2026-11-09 · Production: `https://kinnso-os.vercel.app`, deployment `dpl_5fYHH4VKq7WyKEz1mRXNB3AecK3a`, database ledger **248** (`20261109190000`).

This is the authoritative owner checklist for closing Phase 4. Every row is a decision or an act that **cannot be performed by engineering without fabricating evidence**.

## Where the product actually stands (queried from production, not narrated)

| Fact | Value |
|---|---|
| Published guides | **9** |
| Verified guides | **0** |
| Unverified published guides | **9** |
| Synthetic-labelled guides | **0** |
| Launch sign-offs recorded | **0** (all 6 gates pending) |
| Device/AT matrix rows | **0 of 24** |
| Privacy requests | 0 |
| Alert destination | in-product inbox (verification destination) |
| Backup/PITR | 7 Nov waiver still stands; unverified |
| Restore rehearsal | passed twice; second run exactly matches production: 181 tables / 434 functions / 421 indexes / 133 policies |
| Rollback drill | passed against production (`ROLLBACK_REHEARSAL.json`) |
| Alert transport drill | passed in production (`{test:true, delivered:true}`) |

Because the nine published guides are all unverified, the **content gate is blocked** and the launch verdict is `hold` regardless of the other gates.

## 1. Content gate — the largest blocker

**Why blocked:** 9 published, 0 verified, 9 unverified, 0 synthetic.

Two acceptable paths (or a mix):

1. **Evidence path (preferred):** for each guide that is real authored content —
   - author attests authorship/rights in the creator studio panel (`/studio/guides/{id}/edit` → Content status),
   - add at least one source reference (https),
   - operations records a place-verification date in `/ops/readiness` → Evidence list.
   Three guides become verified; the rest must also be verified or reclassified, because the gate requires `unverified = 0`.
2. **Honesty path for fixtures:** mark sample/fixture guides as synthetic in the ops Evidence list. `synthetic = 0` is required for `launch-ready`, so synthetic content must be **unpublished or replaced**, not merely labelled, before the gate can pass.

Note: the production guide titled *"Kinnso creator test — 2026-11-05"* contains the text "Test content only. No real venue or booking." and is a test artifact — it should not ship as published content.

## 2. Privacy gate

Record an accepted sign-off in the launch panel after confirming:
- the AI-processing disclosure text on `/{locale}/legal/privacy` is accurate for the owner's purposes,
- the privacy request channel (`/account/data` + `/ops/readiness` queue) is the intended process,
- retention wording matches operations (chats until deleted, hourly counters expire, exports not stored).

## 3. Rollback gate

Evidence is already recorded (production rollback drill: previous deployment promoted, verified, current restored). Open `/ops/readiness` → Launch decision → record `rollback` **accepted** with a note referencing `ROLLBACK_REHEARSAL.json`.

## 4. Backup gate (the only genuinely undecided item)

Choose one:
- **Reinstate platform backups** (Supabase plan/PITR or scheduled dumps to an owner-controlled bucket), run one restore, record `backup accepted`; or
- **Waive with a review date** (the panel now requires a future date within 90 days and re-blocks when it expires). The 7 Nov waiver is not valid for this release because it has no review date in the product.

The logical restore rehearsal is evidence that the product schema restores cleanly, but it is **not** platform PITR.

## 5. Accessibility gate

Automated evidence exists (axe pass on the new surfaces, keyboard/reflow checks). Record `accessibility accepted` with a note referencing `ACCESSIBILITY_PASS_2026-11-09.md`, or waive with a review date if the owner wants a manual review first.

## 6. Devices gate

The product now records per-surface results: **6 surfaces × 4 platforms = 24 cells**, each needing a pass/fail plus a 20+ character evidence note.

- Test: public site, guide reader, account & data rights, studio editor, spaces chat, ops pages on **iOS Safari, Android Chrome, VoiceOver, NVDA**.
- Record at `/ops/readiness` → Device and assistive-tech acceptance.
- Gate is satisfied only at **24/24 pass**, or by a dated waiver.

## 7. Alert destination (L3 completion)

Current destination is the in-product inbox, which proves transport but does not page a human.

1. Create a destination (Slack incoming webhook, PagerDuty events API endpoint, or an email relay that accepts `{text}` JSON).
2. `vercel env add KINNSO_ALERT_WEBHOOK_URL production` with that URL (and remove the inbox URL), then redeploy.
3. Press **Send test alert** on `/ops/readiness`, or run the labelled failure drill with the scheduler credential:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://kinnso-os.vercel.app/api/cron/health-alert?test=1&state=unavailable"`
4. Record the `backup`/ops notes accordingly.

## 8. Close the phase

When every gate shows accepted (or a dated waiver):

1. Open `/ops/readiness` → **Launch decision** → **Download launch packet** — the artifact records the verdict, each gate decision, evidence notes, expiry dates and the deployment identity.
2. The packet plus this checklist form the Phase 4 completion record.

## What is already done and needs no further work

- L1 launch control plane with evidence-based verdict, rejection reopening the hold, waiver expiry and daily waiver digest.
- L2 export/deletion/request channel with ops queue and retention tied to code.
- L3 alert transport, labelled failure drill, rollback rehearsal and two restore rehearsals.
- L4 device matrix mechanism (24 cells with evidence notes).
- Production verification of every release; migration ledger 248; green CI on every slice.
