# Booking fixture readiness and CI evidence

The isolated root browser runner previously accepted any visible H1 as a healthy experience. A branded 404 therefore reached the keyboard helper and waited for a date control that did not exist. PR #47's root PR run failed this way in its original attempt and one fresh failed-job rerun, although its root PUSH and Journeys checks passed. Both failures remain evidence; no merge occurred.

Source increment: `3964a9780b970e6e17c4cdde86aa28effba7b1b2`, based on main `c0068de66f851c5a57e69489749fdb5bccf0f318`. N01/N18 remain partial.

Both Booking OFF and isolated Booking ON now require HTTP 200 and the exact seeded experience title before keyboard work. Three registered browser controls reject an actual missing-resource 404, reject a synthetic 200 with a wrong heading, and accept the anonymous seeded experience. The synthetic shell is a negative control, not hosted acceptance.

Before the isolated ON flow, bounded anonymous reads check the pinned experience, its public merchant projection and future open availability. The browser artifact attaches actual checkout SHA, loopback API origin, three booleans and sanitized error codes. Dev-server output supplies route statuses. No service-role access, fixture reseeding or new grants are used by this preflight. Original keyboard and Stripe test-checkout assertions, test-mode guards, retry policy and production flags remain unchanged.

Native validation: the unchanged assertion produced two genuine RED controls and one healthy PASS; the strict assertion produced 3 PASS. Scoped existing regression: 20 PASS, 1 deliberate Booking ON-in-OFF SKIP, zero failure/flaky. E2E typecheck PASS after correcting two installed-builder typing errors; those failed compiler results are retained. CI tooling: 33 PASS. Clean code SHA: Journeys 339 unit PASS, build and typecheck PASS.

An initial clean scoped run also reproduced the fixture 404: 18 PASS, 2 FAIL, 1 SKIP, with all three anonymous API checks true. Temporary local boolean diagnostics then passed; a simultaneous build experiment did not establish the cause. Both app files were restored byte-for-byte, and the final clean scoped run at the code SHA had 20 PASS, 1 SKIP, zero failure/flaky. Earlier failures are not overwritten or reclassified as passes. The cause of the intermittent page 404 remains unconfirmed; this increment fixes the proven readiness loophole and improves evidence, rather than claiming to fix that application failure.

Review-head root/Journeys CI and configured review are pending. Merge, candidate production runtime and named-role/physical acceptance are NOT_RUN. The expected full root OFF denominator increases by three controls; other browser surfaces remain unchanged. A green workflow alone cannot establish hosted role acceptance. Reverting the source increment removes these test-only checks; existing historical evidence must be retained.
