# Creator draft navigation

The creator guide editor previously lost unsaved edits when client navigation unmounted it before its 900ms autosave started or received acknowledgement. It now uses the existing draft navigation provider for controlled same-origin links, programmatic navigation and same-document browser traversal. The dialog offers Save and leave, Discard unsaved edits and Continue editing in English and Traditional Chinese. Reloads, tab close and cross-document traversal use the native beforeunload warning.

Save and leave uses the existing creator save command and succeeds only after acknowledgement of the current edit revision. A rejected save, conflict, older edit revision or unmounted editor cannot authorize leaving. An uncertain save retains its original request ID. Pending publish/withdraw commands must be reconciled through the existing explicit retry control; leaving cannot replay those public actions. Canceling navigation while acknowledgement is held keeps the editor open even if the save later completes. Discard retains the last confirmed draft. Existing device-draft copy remains the default.

## Verification

Baseline: main `3d9ac4049eeeef2d022ac21108f839c8c93d4323`.

- `pnpm --filter @kinnso/journeys test`: 1,344 passed, zero failures/skips. Seven new component-handler regressions were observed failing before their fixes, including pending publication and withdrawal replay.
- `pnpm --filter @kinnso/journeys typecheck`: passed.
- `pnpm --filter @kinnso/journeys build`: passed, including corresponding-source packaging and Next.js production compilation/prerendering.
- `pnpm --filter @kinnso/journeys exec playwright test --config playwright.creator-navigation.config.ts`: standalone browser suite; nine cases passed locally with the installed system Chromium selected in a temporary config. Both languages cover cancel/discard, held acknowledgement with canceled navigation, failed save with identical retry, and native reload warning. One case retains the existing device dialog. The suite is also included in the connected CI browser selection.

The browser tests run the real React editor, navigation provider and native dialog, with isolated Next routing and HTTP transport. Their synthetic draft storage is in memory. They do not verify real authentication, database persistence, hosted deployment, physical mobile browsers or assistive technology. No real clients or database writes were used for this change.

The first restricted-shell full test attempt had subprocess/socket permission failures and three affected test-harness imports. The imports were updated for the new guard dependency. The final full run in the network-enabled execution context passed all 1,344 tests; no failure or test was suppressed.

## PR #103 hardening follow-up

Same-document Back/Forward does not fire `beforeunload`. The original Navigation API handler also left browsers without that API unprotected, and canceling Forward in Chromium could suppress repeated `history.forward()` attempts. The provider now tracks its own history positions, restores the editor entry before Next handles `popstate`, then replays the requested traversal only after save/discard. It preserves opaque router/user history state, including native hash entries, and makes retired wrappers transparent during StrictMode cleanup. In-page hash traversal keeps the editor open without a leave prompt.

A first save on `/new` must not canonicalize to `/id/edit` while Save and leave is pending: that can remount the editor and cancel the navigation intent. The save receives a live intent predicate; canceled navigation retains the normal acknowledged edit URL. Manual save and autosave keep their existing URL behavior.

Original Actions run [40261180416](https://github.com/YNWAforever/KinnsoOS/actions/runs/40261180416) executed jobs: these failures were not billing failures. `workspace-fixtures` failed because the W03 fixture did not isolate the newly imported guard and its narrow UI/router ports lacked `Modal`/`usePathname`. `verify` omitted the creator unit test from the source manifest. `connected` still expected immediate navigation while a save acknowledgement was held. The fixture boundary, explicit source manifest and connected expectation are updated. The standalone creator suite now also runs in `workspace-fixtures`, without a database.

Validation of the follow-up (on top of `594de83`):

- Full Journeys unit suite: **1,344 passed**, zero failures/skips.
- Creator browser suite: **29 passed** in system Chromium 154, with StrictMode and Next-like history wrappers. Covers both languages, new-guide save/cancel, repeated Back/Forward with/without Navigation API, opaque history state, native hashes/multi-step traversal, programmatic navigation, held/failed saves, native reload/tab-close/cross-document warnings and existing device copy. New behavior was observed failing before its fixes.
- W03 workspace-entry fixture: **12 passed**. Corresponding-source Python tests: **10 passed**. Journeys typecheck and production build/source packaging: passed.
- Broader workspace fixtures: all **114 non-accessibility cases passed** before the added creator cases; after installing the pinned optional auditor, **47/50 accessibility cases passed**. Three unchanged `PD15 zh-HK {320,640,1280} merchant` cases report an axe incomplete color-contrast check on `.k-collaboration-tasks > h2` (`elmPartiallyObscured`). That separate fixture does not import this guard; no accessibility gate was suppressed or unrelated merchant code changed.
- Local source-package tests use a temporary directory under the checkout because the managed environment's `/tmp/.git` placeholder otherwise makes the standalone packaging fixture attempt Git discovery in a non-repository. No packaging behavior was changed to work around it.

The connected database test was updated but not run locally. No database, production data, deployment, billing or provider configuration was changed. Independent review checked history-state preservation, StrictMode cleanup and the new-guide acknowledgement/cancellation races.

## Migration and rollback

No database migration, environment variable, API contract or storage format change is required. Deployment is outside this PR. Revert this PR to restore the earlier navigation behavior; saved drafts, published versions and traveller copies remain intact.
