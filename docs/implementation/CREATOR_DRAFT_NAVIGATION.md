# Creator draft navigation

The creator guide editor previously lost unsaved edits when client navigation unmounted it before its 900ms autosave started or received acknowledgement. It now uses the existing draft navigation provider for controlled same-origin links, programmatic navigation and cancelable browser traversal. The dialog offers Save and leave, Discard unsaved edits and Continue editing in English and Traditional Chinese. Reloads and unsupported traversal use the native beforeunload warning.

Save and leave uses the existing creator save command and succeeds only after acknowledgement of the current edit revision. A rejected save, conflict, older edit revision or unmounted editor cannot authorize leaving. An uncertain save retains its original request ID. Pending publish/withdraw commands must be reconciled through the existing explicit retry control; leaving cannot replay those public actions. Canceling navigation while acknowledgement is held keeps the editor open even if the save later completes. Discard retains the last confirmed draft. Existing device-draft copy remains the default.

## Verification

Baseline: main `3d9ac4049eeeef2d022ac21108f839c8c93d4323`.

- `pnpm --filter @kinnso/journeys test`: 1,344 passed, zero failures/skips. Seven new component-handler regressions were observed failing before their fixes, including pending publication and withdrawal replay.
- `pnpm --filter @kinnso/journeys typecheck`: passed.
- `pnpm --filter @kinnso/journeys build`: passed, including corresponding-source packaging and Next.js production compilation/prerendering.
- `pnpm --filter @kinnso/journeys exec playwright test --config playwright.creator-navigation.config.ts`: standalone browser suite; nine cases passed locally with the installed system Chromium selected in a temporary config. Both languages cover cancel/discard, held acknowledgement with canceled navigation, failed save with identical retry, and native reload warning. One case retains the existing device dialog. The suite is also included in the connected CI browser selection.

The browser tests run the real React editor, navigation provider and native dialog, with isolated Next routing and HTTP transport. Their synthetic draft storage is in memory. They do not verify real authentication, database persistence, hosted deployment, physical mobile browsers or assistive technology. No real clients or database writes were used for this change.

The first restricted-shell full test attempt had subprocess/socket permission failures and three affected test-harness imports. The imports were updated for the new guard dependency. The final full run in the network-enabled execution context passed all 1,344 tests; no failure or test was suppressed.

## Migration and rollback

No database migration, environment variable, API contract or storage format change is required. Deployment is outside this PR. Revert this PR to restore the earlier navigation behavior; saved drafts, published versions and traveller copies remain intact.
