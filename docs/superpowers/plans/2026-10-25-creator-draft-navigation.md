# Creator draft navigation implementation plan

**Goal:** Protect a creator's edits when leaving the guide editor before its delayed autosave is acknowledged.

**Design:** Reuse the existing navigation provider for controlled links and supported Back/Forward navigation. Add creator-specific bilingual copy without changing device-draft defaults. The editor supplies a server-save callback which succeeds only for the current edit revision; failed, stale, conflicted or unmounted saves cannot authorize navigation. Preserve explicit discard and cancellation. Use native beforeunload for reloads and unsupported traversal.

**Scope:** Journeys creator editor, navigation provider, regression tests. Keep autosave timing, API commands, publication and account authorization unchanged. No database migration, deployment, provider setting or production data changes.

**Alternatives:** A separate creator modal would duplicate the existing navigation lifecycle. A beforeunload warning alone misses client navigation. Reusing the provider covers the existing navigation boundaries with one lifecycle.

## Task 1: Protect creator draft navigation

- [x] Add failing editor tests for dirty/clean guards, held/failed/stale acknowledgements, uncertain retries, unload and unmount.
- [x] Extend the provider guard with an optional creator kind; retain device defaults.
- [x] Register the creator editor and return a current-revision save result from its existing command handler.
- [x] Run targeted and full Journeys unit tests, typecheck, and isolated browser checks for continue/save/discard, failure and cancellation.
- [ ] Review the diff, document validation and rollback, then commit and open a PR against main.

## Review focus

Edits made while a save is pending; cancellation during acknowledgement; retryable commands; clean/new editors; existing device draft wording and behavior. Authentication and database persistence require the existing guarded integration environment and are separate from mocked-transport UI verification.
