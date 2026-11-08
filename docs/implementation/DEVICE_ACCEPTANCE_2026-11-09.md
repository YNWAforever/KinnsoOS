# L4 — Device and assistive-tech acceptance, recorded per surface

**Status:** implemented and verified locally (13/13); committed, CI/deploy pending.

Date: 2026-11-09 · Parent: `776914b` · Production: `dpl_6qMW…`, ledger 246.

## 1. Why

L4's exit criterion is "physical iOS/Android, VoiceOver, NVDA passes recorded per surface". A single "devices accepted" checkbox cannot represent six surfaces across four platforms and gives the owner nothing to point at. This slice replaces the blanket claim with a matrix: one recorded outcome plus an evidence note per surface × platform, and the launch gate counts only a complete passing matrix (or an explicitly dated waiver from the launch panel).

## 2. Delivered

- `kinnso_internal.device_acceptance` (append-only; latest row per cell wins; no client grants).
- `kinnso_ops_device_acceptance()` — ops-only; returns the full 6×4 grid with `pending`/`pass`/`fail`, counts and `complete`.
- `kinnso_ops_record_device_acceptance(surface, platform, outcome, note)` — ops-only; validates enums and a 20–1000 char evidence note.
- `GET/POST /api/ops/devices` — ops session required; 400 invalid, 401 anonymous, 403 non-ops.
- Launch evaluation: the `devices` gate is `accepted` only when the matrix is complete (24/24 passing); a failing cell reopens it as pending with "23/24 passing, 1 failing"; a dated waiver still overrides, and an expired waiver blocks as before.
- Launch packet: same derivation, marked `decision: matrix-complete`.
- `DeviceAcceptance` panel on `/ops/readiness`: progress line, six surface groups, per-cell outcome + evidence note + record button, explicit access-required/unavailable states.

## 3. Local verification (13/13)

anonymous 401 · 24 cells exposed · starts incomplete · short note 400 · unknown surface 400 · complete matrix reports 24/24 · launch devices gate accepted with "24/24 passing device results recorded" · verdict `launch-ready` · a failing VoiceOver cell recorded (201) · matrix incomplete with 1 failing · devices gate reopened (`pending`, "23/24 passing, 1 failing") · ops page renders the matrix · non-ops 403.

Two test-authoring defects were caught during the run (an invalid surface/platform pair and stale local state masking the incomplete state); the acceptance now resets its own fixtures through SQL inside the test target only.

## 4. What L4 still needs from the owner

The product can now record the acceptance but cannot perform it. The owner (or a tester) must run the six surfaces on iOS Safari, Android Chrome, VoiceOver and NVDA and record each cell with a real evidence note. The gate stays open until 24/24 pass, or the owner records a dated waiver.

## 5. Limits

- A matrix is only as honest as the person recording it; the note is evidence, not proof.
- There is no screenshot/file attachment yet — evidence is text (the launch packet carries the notes).
- The platform list is fixed (four platforms); adding Android TalkBack or Firefox would be a small migration.
