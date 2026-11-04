# KinnsoOS

The Kinnso Journeys layout with an approved-backend traveller workspace, a bounded published-guide catalog and explicit handoffs to the existing Kinnso operations application. Connected features fail closed until their environment and capabilities are configured.

## Run

Node >=22.13.0. `npm ci` then `npm run dev`. Open `http://localhost:3000/zh-HK` or `/en`.

`npm test` runs boundary, feasibility, import and retained demo model tests. `npm run typecheck` checks the application. `npm run build` creates the production Next.js build and corresponding source download. `npm start` serves that build. `npm run test:integration` and `npm run test:e2e` require the separately guarded synthetic local backend; they fail when its URL or project does not match. Browser evidence is local and ignored by Git.

## Lint

In the monorepo, run `pnpm lint` from the repository root. It runs repository ESLint
and both app tasks through Turbo, including `pnpm --filter @kinnso/journeys lint`.
For the standalone source archive, use `npm ci` then `npm run lint`.

Journeys checks TypeScript/JavaScript application code, scripts and tests. Unused
bindings are errors (intentionally unused `_` bindings and caught errors are allowed);
React Hook dependency findings remain warnings. `eslint-suppressions.json` records
the existing unused-binding counts per file so new violations fail without changing
product code. When removing old violations, run `pnpm exec eslint . --prune-suppressions`
inside this app and commit the reduced baseline. Do not regenerate or expand it to
make new violations pass.

To verify coverage locally, temporarily add `const aud09UnusedBinding = 1;` to a
Journeys `.ts` or `.tsx` file and run root `pnpm lint`: it must fail with
`@typescript-eslint/no-unused-vars`. Remove the binding and rerun to return to green.
Keep that deliberate failure out of committed source.

## Feature states

| Surface | Status |
|---|---|
| Catalog, guide versions, bookmarks, private trips and imports | Connected to the approved backend; actual writes, revisions and retry checks |
| Private photos, finite offline drafts, revocable read-only shares | Capability controlled; unified server media module or approved external media service |
| `/en/demo`, `/zh-HK/demo` | Explicit browser-local **demo** inherited from Journeys |
| Creator/merchant commercial journeys | Local **demo**; no payments, notifications or production writes |
| `/en/library`, `/zh-HK/library` | New published-guide integration; configuration required |
| `/en/workspace`, `/zh-HK/workspace`, `/en/admin` | Explicit handoff directory; **not** a new authenticated admin panel |
| Account login and trip sync | Independent login on each host against the same approved identity; no automatic SSO |
| Booking / payment | Disabled until a real supported capability is available |

One unresolved edit is retained per trip on the device. Retry or review it before
saving another operation. Logout and account changes clear mounted private views
and account caches; offline maps and photos are unavailable.

The homepage's **Plan my trip** task can turn a reviewed manual brief into a
device itinerary with one to thirty days. Choose **Prepare a trip draft**, name
each day and enter its stops, date/time zone and note. Days can be reordered or
removed after confirmation. Each day supports one to twenty stops, with at most
two hundred stops in total. Review the complete itinerary and confirm
**Save itinerary on this device**.
Open **View saved device trips** to reopen, edit or delete it through the existing
trip workspace. Device drafts are readable by anyone using the browser. Account
import still requires sign-in and a separate confirmation.

Saved manual copies also allow editing the trip title, optional start date,
time zone and day titles. Invalid details keep the last saved copy intact.
Device saves require a matching storage readback before confirming success or
enabling account import; an unconfirmed read retains edits for same-copy retry.

Saved manual trips support adding, moving and removing days and stops. Moving
stops keeps their notes and times attached. Choose **Move to day** and confirm
**Move stop to day** to append a stop to another day; focus follows the moved
stop. Choosing a destination does not edit the trip. Moving stops between days
preserves existing dates; day changes renumber dates from the start date.
Removal requires confirmation and affects the saved copy only after Save.
The editor supports thirty days, fifty stops per day and two hundred total.
Empty days and unfinished stop names can stay in device working copies; account
import retains its existing completeness checks. Guide-derived structural data
is not changed. Temporary editor keys are not stored or sent to parent workflows.

Saved manual stops also support optional start times (`HH:mm`, 00:00–23:59) and
whole-minute durations (1–1440). Times use the trip's time zone. Blank fields
mean unknown; midnight is `00:00`. Partial input stays with its stop when moved,
and invalid input blocks Save and save-and-leave without changing the saved
copy. Correct or clear the field, then Save. Reopening restores the saved times;
temporary input text is not stored or sent to parent workflows.

## Catalog configuration

Copy `.env.example` to `.env.local`. Configure `KINNSO_SUPABASE_URL` and `KINNSO_SUPABASE_PUBLISHABLE_KEY` for an approved Supabase target. The adapter rejects secret/service-role keys, uses only anonymous published-guide reads, selects explicit columns, caps page size at 12 with one lookahead record, and distinguishes unavailable, empty and unconfigured responses. Never paste credentials into source files. Existing RLS/grants must allow anonymous reads of **published** guide rows.

Environment configuration and authenticated acceptance are verified separately. Backend schema, publishing and business services in `apps/web`, shared packages and root `supabase` migrations must match the approved target before enabling their connected features.

For a single application runtime, set `KINNSO_MEDIA_RUNTIME=unified` and supply `KINNSO_SUPABASE_SECRET_KEY` only on the server for the same approved backend. This reuses the mature private-media validator, owner/session checks and revocable image delivery in `lib/media/service.ts`; `apps/web` also imports this implementation. The publishable key remains separate and public-safe. Keep media/sharing disabled until the key, private bucket/RPC grants, authenticated acceptance, orphan cleanup operation and recovery requirements have been verified. The existing approved external-service configuration remains supported.

The protected `/api/cron/media-cleanup` operation reuses the bounded mature cleanup queue. It acknowledges queued paths only after Storage removal succeeds. Configure and verify the operation using [media operations](docs/media-operations.md) before enabling uploads; scheduling is a separate deployment configuration.

The existing app uses Next.js Server Actions and its own cookie session. Its TypeScript functions are not cross-origin REST endpoints. Workspace links preserve that app's authentication boundary. A local demo persona grants no production permissions.

## Source and licensing

Adapted from the publicly distributed Kinnso Journeys revision `9f7eaba1d3b2f69aae9d99a01aebf2c48bdd649d`. GPL-3.0 applies to the covered application; retain `LICENSE`, AdventureLog attribution and corresponding source access. `npm run source:pack` regenerates the source ZIP, also done before production build. Public photographs retain their original attribution/provenance.

This application is part of the unified KinnsoOS workspace. The mature service implementation is in the sibling `apps/web` and shared packages. This application's allowlisted corresponding-source archive remains independently installable and contains no private evidence or generated schema dump.

This source contains no original Sites project ID, production credentials, database dumps or private audit attachments. Neither reference site is modified. Verify the explicit deployment target and authenticated acceptance before enabling connected capabilities.
