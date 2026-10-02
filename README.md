# KinnsoOS

The Kinnso Journeys layout with an approved-backend traveller workspace, a bounded published-guide catalog and explicit handoffs to the existing Kinnso operations application. Connected features fail closed until their environment and capabilities are configured.

## Run

Node >=22.13.0. `npm ci` then `npm run dev`. Open `http://localhost:3000/zh-HK` or `/en`.

`npm test` runs boundary, feasibility, import and retained demo model tests. `npm run typecheck` checks the application. `npm run build` creates the production Next.js build and corresponding source download. `npm start` serves that build. `npm run test:integration` and `npm run test:e2e` require the separately guarded synthetic local backend; they fail when its URL or project does not match. Browser evidence is local and ignored by Git.

## Feature states

| Surface | Status |
|---|---|
| Catalog, guide versions, bookmarks, private trips and imports | Connected to the approved backend; actual writes, revisions and retry checks |
| Private photos, finite offline drafts, revocable read-only shares | Capability controlled; separate private media service required |
| `/en/demo`, `/zh-HK/demo` | Explicit browser-local **demo** inherited from Journeys |
| Creator/merchant commercial journeys | Local **demo**; no payments, notifications or production writes |
| `/en/library`, `/zh-HK/library` | New published-guide integration; configuration required |
| `/en/workspace`, `/zh-HK/workspace`, `/en/admin` | Explicit handoff directory; **not** a new authenticated admin panel |
| Account login and trip sync | Independent login on each host against the same approved identity; no automatic SSO |
| Booking / payment | Disabled until a real supported capability is available |

## Catalog configuration

Copy `.env.example` to `.env.local`. Configure `KINNSO_SUPABASE_URL` and `KINNSO_SUPABASE_PUBLISHABLE_KEY` for an approved Supabase target. The adapter rejects secret/service-role keys, uses only anonymous published-guide reads, selects explicit columns, caps page size at 12 with one lookahead record, and distinguishes unavailable, empty and unconfigured responses. Never paste credentials into source files. Existing RLS/grants must allow anonymous reads of **published** guide rows.

No production environment values were obtained or applied. Do not infer cloud staging or production success from local tests. Backend schema, publishing, privileged media verification and business services remain in the private application and must be reviewed and installed on an explicitly approved target before enabling connected features.

The existing app uses Next.js Server Actions and its own cookie session. Its TypeScript functions are not cross-origin REST endpoints. Workspace links preserve that app's authentication boundary. A local demo persona grants no production permissions.

## Source and licensing

Adapted from the publicly distributed Kinnso Journeys revision `9f7eaba1d3b2f69aae9d99a01aebf2c48bdd649d`. GPL-3.0 applies to the covered application; retain `LICENSE`, AdventureLog attribution and corresponding source access. `npm run source:pack` regenerates the source ZIP, also done before production build. Public photographs retain their original attribution/provenance.

The private Remix-Kinnso repository was reviewed but its implementation files and Git history were **not copied into this public repository**. The catalog adapter is newly authored against the observed data contract. Reusing private backend implementation code requires an explicit publication/licensing decision first.

This project has no original Sites project ID, production credentials, database dumps, private audit attachments or inherited deployment configuration. Neither reference site is modified. Deploy as a separate Next.js project only after the remaining staging and authenticated acceptance gates in `docs/IMPLEMENTATION_PLAN.md` pass.
