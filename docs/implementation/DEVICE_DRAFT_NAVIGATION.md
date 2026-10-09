# Device draft navigation and deletion

N08 extends the existing explicit IndexedDB recovery and independent repair. Owner/source/version validation, bounded notes, account invalidation and server import boundaries are retained. It does not migrate or clear the store.

Controlled same-origin links and programmatic navigation offer Save and leave, Discard unsaved edits, and Continue editing. Save only authorizes navigation after the current edit revision receives the IndexedDB transaction acknowledgement. Failed, pending, older and unmounted writes cannot authorize it. Cancelling during a held acknowledgement cancels that navigation; the confirmed copy remains saved. Discard leaves the last persisted copy intact.

Cancelable same-document Back/Forward uses the public browser Navigation API and retains forward history. Cross-document or unsupported-browser traversal uses the native beforeunload warning: cancel leaving, save explicitly, then leave. No Next router internals or history sentinels are patched. Physical iOS/Android and older-browser acceptance remains pending. Process termination can recover only previously confirmed copies.

Delete is explicit and applies to one selected local id/owner in one transaction. Mismatched ownership aborts. Other copies and persisted account trips are kept. Deletion is confirmed only on transaction completion. Shared-device copies still require an explicit choice before their notes appear.

Verification uses synthetic data only in the ownership-verified isolated localhost target. Runtime/human acceptance is separate from source CI. Revert the provider, UI and helper changes independently; existing IndexedDB version1 remains readable. Preserve every local copy during rollback.

## Native dialog cancellation while deleting

While a device-copy deletion was awaiting its IndexedDB acknowledgement, its owner refused to close the confirmation. Native Escape still closed the dialog without removing its React state. Modal now prevents the native default close and delegates cancellation to its existing owner callback. Normal cancellation still closes the confirmation and returns focus to its opener; a busy owner can retain it until the operation finishes. The [HTML dialog cancel event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/cancel_event) permits preventing that default close.

Code commit: `77adb31ab10fbb5ce975f49bee3da60f951a314d`. Two English/Traditional Chinese real-browser cases reproduced the busy Escape failure, then verified ordinary cancellation/focus, Escape and Close during a held real transaction acknowledgement, deletion of only the selected copy, and reopening the other copy after reload. The tests keep the native IndexedDB transaction and committed bytes; they do not simulate successful persistence or undo a committed deletion.

All13 navigation cases PASS with0 fail/skip against the owned isolated local synthetic fixture target. Full connected at recording: 96PASS2FAIL0SKIP_RETAINED; corrected_existing_CI_profile_diagnostic5PASS0FAIL0SKIP; exact_head_full_CI_PENDING. Clean339 unit/build/typecheck PASS. Windows source packaging retains5PASS/1 symlink-permission SKIP; exact review-head Linux extraction/build/typecheck and full CI remain required before merge. Four cancelled-navigation stream messages match the previous actual-main CI and remain in the evidence.

N08/N14 remain partial. Named hosted roles, mailbox/content, physical iOS/Android,200% text,NVDA/VoiceOver acceptance are NOT_RUN. No IndexedDB migration, ownership/revision/RPC/import change, production SQL/settings/flags/provider activation or manual deployment is included. Rollback reverts the UI/test increment and retains device copies and account trips.

Initial full local run retained96PASS2FAIL0SKIP: Agent source origin was absent from the local process while existing CI config supplies it, causing canonical_origin_missing; creator English stop-focus setup exceeded its5s heading assertion although its final snapshot contains that heading. Corrected existing CI profile diagnostic: Agent and all four bilingual day/stop deletion-Undo controls5PASS0FAIL0SKIP at unchanged code77adb31. No product change, relaxed assertion or automatic retry was used; creator setup cause remains unconfirmed. Fresh full exact-head CI is the merge gate, not this diagnostic.
