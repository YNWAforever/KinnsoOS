# Homepage to studio continuation

Scope: the Journeys homepage and Conversation Studio. The user selected completing
these flows as the next phase. Changes are local and uncommitted, based on `807714e`.

## Delivered

- Homepage questions survive the documents and template-picker detours. Handoffs
  stay in memory, belong to an account/task, and expire on account changes or when
  the user leaves the intake routes. Same-page actor prop changes reset the form.
- English and Traditional Chinese intent matching selects specific tasks, including
  adoption, sharing, publishing checks, revisions, and campaign reports. The
  homepage's own example correctly starts a creator brief. Mixed intents ask the
  user to choose; an empty question cannot submit.
- Each audience has a link to its five-task catalogue, with audience filters.
  Creator, traveller and merchant screens receive the staged question.
- Traveller/merchant tasks without a connected store have a manual question/notes
  brief, review, explicit copy, copy-failure recovery, and original-workflow link.
  The interface explicitly says the brief is not saved and resets on reload.
- M1's original `merchant/profile` continuation was a 404; it now opens the known
  merchant workspace. The real router also dispatches merchant discovery through
  WorkroomShell. Neither change enables discovery or grants access.

## Verification

| Check | Final result |
| --- | --- |
| All Journeys Node tests | 1,594 passed; 0 failed/skipped |
| Real Next homepage browser suite | 12 passed, Chromium; 320/390/768/1280 px |
| Existing creator browser fixture + actor-prop regression | 13 passed |
| Source archive Python tests | 10 passed |
| Journeys TypeScript | Passed |
| ESLint on changed application/test files | 0 errors; 15 hook warnings in existing effect blocks |
| Journeys production build + source pack | Passed with backend capabilities disabled |
| Independent code review and targeted recheck | Reported issues fixed; no remaining actionable findings |

Commands: `node --experimental-strip-types --test --test-reporter=spec tests/*.test.mjs`,
`node node_modules/@playwright/test/cli.js test --config playwright.home.config.ts`,
the existing `playwright.studio.config.ts` suite (temporary configuration used the
installed system Chromium and `/tmp` output), `python -m unittest discover -s tests
-p source_package_test.py`, `tsc --noEmit`, changed-file ESLint, and `npm run build`.
Commands run from `apps/journeys`; system Chromium was selected via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` for the homepage suite.

Initial regression tests reproduced wrong task routing, lost questions, account
scope leakage, and the merchant 404 before fixes. Browser checks use accessible
textbox roles for prefilled textareas and wait for the destination screen before
testing Back or account events. These corrections did not remove assertions.
The initial sandboxed unit/source runs encountered subprocess restrictions and
synthetic `.git` mounts; unchanged checks passed with normal execution permissions.
The already-installed lint plugin needed its missing workspace symlink restored;
no dependency versions changed.

## Remaining boundary

Manual briefs are not persisted or automatically imported into another workflow.
Connected storage, real Auth/DB/RLS, native discovery/provider acceptance, and
deployment were not performed. Existing capability gates, database migrations,
booking/payment restrictions, and the mature web site's homepage remain unchanged.
The creator browser fixture validates React behavior with simulated backend
responses; it does not establish database publication acceptance.
