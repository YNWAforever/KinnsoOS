# Device draft navigation and deletion

N08 extends the existing explicit IndexedDB recovery and independent repair. Owner/source/version validation, bounded notes, account invalidation and server import boundaries are retained. It does not migrate or clear the store.

Controlled same-origin links and programmatic navigation offer Save and leave, Discard unsaved edits, and Continue editing. Save only authorizes navigation after the current edit revision receives the IndexedDB transaction acknowledgement. Failed, pending, older and unmounted writes cannot authorize it. Cancelling during a held acknowledgement cancels that navigation; the confirmed copy remains saved. Discard leaves the last persisted copy intact.

Cancelable same-document Back/Forward uses the public browser Navigation API and retains forward history. Cross-document or unsupported-browser traversal uses the native beforeunload warning: cancel leaving, save explicitly, then leave. No Next router internals or history sentinels are patched. Physical iOS/Android and older-browser acceptance remains pending. Process termination can recover only previously confirmed copies.

Delete is explicit and applies to one selected local id/owner in one transaction. Mismatched ownership aborts. Other copies and persisted account trips are kept. Deletion is confirmed only on transaction completion. Shared-device copies still require an explicit choice before their notes appear.

Verification uses synthetic data only in the ownership-verified isolated localhost target. Runtime/human acceptance is separate from source CI. Revert the provider, UI and helper changes independently; existing IndexedDB version1 remains readable. Preserve every local copy during rollback.
