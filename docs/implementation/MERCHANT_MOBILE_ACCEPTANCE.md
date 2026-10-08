# Merchant form mobile checkpoint

N14/F12 remains PARTIAL. Source5e224566eae2ba7365fda14a9276ff8eb02026ff fixes the observed narrow-screen merchant forms; all original18 N IDs and53 requirement mappings are retained.

At320px the English and zh-HK branch input was31.59375px high and native text controls crowded their labels. A merchant-only scope now separates labels from full-width readable controls, adds form/section spacing, wraps checkbox labels, and keeps narrow-screen action buttons within the form. Wider forms retain a bounded reading width and existing cream/green styling.

Actual owned-local browser RED→GREEN covers both locales at320/640/1280px and bounded double-text emulation. Controls remain within the viewport, labels are above their fields, and keyboard Tab/Enter creates a branch through the existing service. The owned RPC and a fresh page reload confirm exactly one persisted branch. Test fixture cleanup was independently checked at0. No Auth, permission, ownership, command, SQL, provider or runtime flag is changed.

Exact clean source verification:333units/41integration/82connected browser PASS,0fail0skip; build/typecheck PASS. Windows corresponding-source tests:5PASS/1symlink-permissionSKIP. Final-review-head Linux6/extracted rebuild/typecheck and root/Journeys/Vercel CI are separate required merge gates. Native author review only; original failed checks and evidence remain preserved.

These results are isolated synthetic browser evidence. Actual iOS Safari/Android, actual200% text settings, NVDA/VoiceOver versions and named hosted U04 remain NOT_RUN. Double-text emulation is not physical-device or complete accessibility acceptance. Production merchant activation and separately reviewed SQL retain their own approval/recovery gates.

Rollback: revert the scoped UI/stylesheet change; preserve existing memberships, branch data, receipts, audit and migration history. No database rollback is needed for this source increment.
