# Homepage to studio continuation implementation plan

**Goal:** Complete the shared homepage's task intake and manual continuation.
**Architecture:** Existing Next.js components, a scoped in-memory question, and the
original workspaces remain authoritative for persisted actions.
**Tech stack:** Next.js 16.3.8, React 19, TypeScript, Node tests, Playwright.
**Spec:** ../specs/2026-11-03-homepage-studio-continuation-design.md

## Constraints and review focus

Keep private text out of URLs/storage. Account changes clear staged and visible
text. Specific intents take precedence over generic words such as “guide”. Empty
input does not start a task. Native capabilities stay closed; manual preparation
does not claim a save. Preserve original routes, authorship and source packaging.

## Tasks

- [x] Add failing intent tests in `tests/studio-home.test.mjs` and real-app browser
  regressions in `tests/e2e/studio-home-continuation.spec.ts`; reproduce wrong task,
  lost document/template handoff, and missing manual brief behavior.
- [x] Update `lib/studio/templates.ts` with specific bilingual task matching.
  Scope `lib/studio/guest-draft.ts` by actor/template, clear it on account changes,
  and use `app/workroom/useStudioQuestion.ts` in question-consuming components.
- [x] Update ConversationHome and TemplateCards with clear task links and audience
  filters; stage the question on the documents/templates links. Add TaskStarter
  for review/copy/continuation where no connected task store exists. Route all
  recognized workroom paths through WorkroomShell, including merchant discovery.
- [x] Run relevant unit and browser tests, all Journeys unit tests, TypeScript,
  changed-file lint and a Journeys production build. Update the source archive
  allowlist and record results and remaining connected acceptance boundaries.

Baseline: 1,562 Journeys tests pass on this Linux environment. The first sandboxed
run could not capture child-process output (EPERM); the unchanged suite passed
with normal subprocess permissions. This is not a product failure.

Final results and boundaries: `docs/implementation/HOMEPAGE_STUDIO_CONTINUATION_2026-11-03.md`.
