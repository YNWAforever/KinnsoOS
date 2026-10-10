# Private photo cancellation and interrupted-upload recovery

N15 (F12), with N04 account invalidation and N14 bilingual feedback regressions. Based on main `513b8c871f2551fb0989718017fdc73c2e5dc311`.

A photo task now stops its transport and rejects late continuations when its owning trip/account/capability view unmounts. Both languages offer Cancel during upload. Cancelling retains the chosen original and the normalized blob/request id for an explicit same-file retry. Once the atomic trip attachment starts, Cancel is disabled; cancellation does not claim to undo an accepted write or delete accepted private bytes.

Storage can accept immutable bytes before a response is lost or cancelled. When another signed upload URL cannot be created, the prepare BFF now checks the RPC-owned object path with authenticated Storage `exists`. Only confirmed existing bytes return `alreadyUploaded: true` with a null upload URL. The client skips another PUT, computes its original checksum and uses the existing finalizer. Ownership, revoked-session checks, exact length/checksum, image decoding and aggregate revision/idempotency still apply. No overwrite grant, migration, direct grant or flag change is introduced. Unknown presence retains the failure response.

The three existing account-recovery browser cases are now explicitly selected by the connected CI configuration; no recovery function was rebuilt. All previous selected cases remain. The new suite adds six bilingual lifetime/cancellation cases. Current discovery is 105 tests in 20 files; discovery is not a pass result.

Native Windows validation (owned local project `kinnsoos-b1-20261002`, API `http://127.0.0.1:58421`, browser `http://127.0.0.1:3495`, Node24.18.0/npm11.16.0):

- 348 unit tests PASS, zero failures/skips. Nine focused cancellation/resume units PASS. Four cancellation RED failures preceded the transport fix; two valid resume-contract RED failures preceded the BFF/client change.
- Ten real browser cases PASS, zero failures/skips: six new bilingual media cases, three existing account/offline regressions, and the existing private photo/share/revocation flow. RPC snapshots prove empty media after invalidation and exactly one owned ready photo/revision2 after cancellation/retry/reload. A separate signed-in browser receives exact NOT_FOUND/404 for another actor's prepare and finalize before the matching owned resume succeeds.
- Build and typecheck PASS. Windows source-package check retains its platform permission skip; clean committed-source and Linux full CI/extracted-package evidence remain required before merge.

Historical failures remain separate: the first browser reproduction observed two late attachment responses; its two missing-cancel cases timed out and cleanup masked their original lookup. It did not establish the old aggregate contents after the failing assertion. The next expanded browser run was eight PASS/two FAIL and exposed a real503 on prepare after Storage accepted bytes. Test harness/setup errors (missing binary while installation ran, absent Node location, route-test bundling/Host/credential formats and root working-directory invocation) are not product RED or pass evidence.

This is synthetic local engineering evidence. Code review, merge, deployed runtime, named hosted U02, real provider configuration, physical devices and assistive technology are separate gates. The overall task remains partial. Booking/payment and approved production operations retain their existing gates.

Rollback: revert this source PR; retain private stored data and existing RPCs. Reverting does not delete uploads or change Storage policies. The previous UI can still read saved photos, but its interrupted-upload limitation returns.

Storage method reference: [exists](https://supabase.com/docs/reference/javascript/storage-from-exists) and [immutable signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl); verified against the installed SDK.
