# S4 — Accessibility pass over the new surfaces (slice report)

**Status: audit complete and fixes verified locally; shipping with the release build. No schema change.**

Date: 2026-11-09 · Parent: `d6886d0` (S3 live, ledger 242).

## 1. Why this slice

Five surfaces were added or changed in the last three releases without an accessibility pass: the guide-reader honesty badge (S2), the Ops readiness + evidence panels (S2/S3), the creator content-status panel in the editor (S3), the spaces chat (S1/S2) and the AI-processing privacy notice (S2). This slice runs the repository's axe-core harness against them at 320 px and 1280 px, adds keyboard and reflow probes, fixes what it finds, and records the evidence.

## 2. Method

- Real Chromium via Playwright against the bound local stack with the two synthetic accounts (public surfaces anonymous, ops/creator surfaces signed in).
- axe-core (the repository's bundled `scripts/accessibility/node_modules/axe-core/axe.min.js`) with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, scoped to `.k-app`.
- Keyboard: 30 sequential Tab stops per surface; each stop is scrolled into view and checked for a computed accessible name (aria-label, title, associated `<label>`, text) and rendered visibility.
- Reflow: document `scrollWidth` must not exceed the viewport at 320 px and 1280 px.

## 3. Findings and fixes

| Surface | Finding | Fix |
|---|---|---|
| Ops readiness + evidence panel | **color-contrast (serious)**: status chip `#986319` on `#fbefda` = 4.46:1 and neutral chip `#637265` on `#eef1ed` = 4.47:1 at 12 px — both just under the 4.5:1 WCAG AA threshold | Scoped chip overrides in `OpsContentHygiene.tsx`: `#78500f` on amber (≈6.2:1) and `#4f5c50` on neutral (≈5.6:1) |
| Creator content-status panel | Same two chip pairs | Same scoped overrides in `CreatorContentStatus.tsx` |
| Public guide + badge, spaces chat, privacy notice | No violations | — |
| Keyboard probe (first version) | Reported unnamed/unrendered stops | False positives: the probe ignored `<label>` associations and elements below the fold. The probe now scrolls each stop into view and resolves labels; 30/30 stops are named and rendered on every surface |

Post-fix audit: **5/5 surfaces, 0 axe violations, 0 keyboard issues, 0 reflow issues** at 320 px and 1280 px.

## 4. What was deliberately not done

- Physical iOS/Android, VoiceOver and NVDA remain **NOT_RUN**; automation does not substitute for them.
- Contrast was fixed only on the new components; the shared `.k-chip` baseline remains 4.47:1 globally, which is a pre-existing design-token issue for any surface using that chip at 12 px. It should be fixed once in `globals.css` rather than incrementally; that touches every page and deserves its own review.
- No new CI spec was added in this slice. The audit harness is saved as a reproducible script under `.local-private/a11y-20261109/`; folding it into the connected E2E suite is the natural follow-up (it needs the authenticated fixtures).
- Focus-trap and modal behaviour of the new dialogs (rename/archive/delete, synthetic confirmation) were exercised in the S2/S3 slices; this slice does not re-open them.

## 5. Evidence

- `audit.json` — per-surface, per-width axe results, reflow and keyboard results (post-fix)
- `keyboard.json` — independent 30-stop keyboard probe
- `screenshots/` — each surface at 320 px and 1280 px

## 6. Deploy

Application-only change (no migration). Stage the release build, verify health and the affected pages, promote; rollback target is the S3 deployment `dpl_7gFDiibqTBr4nZhZxSdayXzasquJ`.
