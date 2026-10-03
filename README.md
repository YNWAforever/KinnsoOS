# KinnsoOS

One pnpm/Turborepo workspace contains the Journeys traveller frontend, the mature Kinnso site, shared services, workers, database migrations and their tests.

| Workspace | Purpose |
| --- | --- |
| `apps/journeys` | Journeys layout, traveller auth, catalog, bookmarks, trips, guide adoption, media and shares |
| `apps/web` | Existing Kinnso site, creator publishing, merchant/operations flows, service boundaries and media verification |
| `apps/scan`, `apps/sync` | Existing worker entry points |
| `apps/e2e` | Existing Kinnso browser regression suites |
| `packages/*` | Database types, scan, sync, honesty and parity modules |
| `supabase` | Single ordered migration history and synthetic local fixtures |

## Install and run

Use Node >=22.13.0 and the pinned `pnpm@11.6.0` (`corepack enable`). Run `pnpm install --frozen-lockfile`. The root lockfile is authoritative for this workspace. The npm lockfile in `apps/journeys` supports that application's standalone corresponding-source archive.

`pnpm dev` starts Journeys on port 3000; `pnpm dev:web` starts the original site on port 3001. Configure each app's ignored `.env.local` using its `.env.example`. Point both applications at the same explicitly approved Supabase identity/data for the environment. Separate hosts authenticate independently. Consolidating source does not create cross-origin SSO.

Database types are a generated, ignored build input. Before checking or building the whole workspace, configure `apps/web/.env.test` for the approved isolated local stack and set `KINNSO_LOCAL_STACK_DIR` to its verified Supabase work directory. Run `pnpm db:types`. The generator checks the local URL, project, Docker label and work-directory identity; it never resets or migrates a database. CI generates these types from its own migration-built local stack. Do not use production credentials or a cloud URL for this command.

The pre-existing isolated development target is `kinnsoos-b1-20261002`, API `http://127.0.0.1:58421`, container `supabase_db_kinnsoos-b1-20261002`. CI uses its disposable `kinnso-v3` stack at port 54421 and requires `CI=true`. Starting/resetting any existing target remains a separate explicit operation; installing dependencies does not start or modify a database.

## Verify

- `pnpm test` / `npm test`: tooling tests and all workspace test scripts. Live integration suites require their guarded local environment.
- `pnpm typecheck` / `npm run typecheck`: every workspace's TypeScript checks.
- `pnpm build` / `npm run build`: both Next.js production builds; safe flags and approved per-app environments are required.
- `pnpm lint`: existing service and original-site lint checks.
- `pnpm test:integration`, `pnpm test:e2e`: guarded Journeys integration and browser suites.
- `pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts`: original-site browser regression suite.
- `pnpm source:pack`: the allowlisted Journeys corresponding-source archive.

## Deployment roots

Configure two distinct projects from this repository: `apps/journeys` and `apps/web`. Each project needs its own approved environment and auth callbacks; both use the shared workspace lockfile. The web project additionally needs generated database types supplied as a build input from a verified migration-matched local/CI build. A hosted builder without that input cannot typecheck/build it; do not bypass that check. The scan image retains `apps/scan/Dockerfile` with this repository root as its build context; `railway.json` preserves its entry point.

No production project, DNS, database or payment capability is switched by this source consolidation. The existing deployed site stays on its current deployment until a separately approved cutover. Booking/payment capability gates remain enforced. Cloud staging acceptance and migration rehearsals must be completed against an explicitly approved target before cutover.

## Source boundaries

The source was consolidated from the current Journeys implementation and the public `YNWAforever/Remix-Kinnso` service implementation. Their executable code, tests, configuration and migrations are here. Credentials, original implementation packs, private reports/audit evidence, generated full database type dumps, dependency folders and build output are excluded. Local evidence remains ignored.

Journeys retains its GPL-3.0 license and AdventureLog/source attribution in `apps/journeys/LICENSE` and `apps/journeys/docs/SOURCE_PROVENANCE.md`. Keep the existing corresponding-source download and per-file notices. Repository consolidation does not resolve the outstanding third-party content-rights gate.
