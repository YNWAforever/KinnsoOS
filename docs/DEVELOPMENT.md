# Run, test and deploy

Commands below run from the repository root unless a block changes directory. Use the root `pnpm-lock.yaml` for monorepo work. These commands describe source behavior; [release operations](implementation/RELEASE_OPERATIONS.md) defines the separate release acceptance record.

## Install and run

Requirements: Node >=22.13.0 (CI uses Node 22), the `packageManager`-pinned pnpm 11.6.0 and Python 3 for the corresponding-source archive. Docker and the pinned Supabase CLI are needed only for connected database checks/rehearsals. Playwright browser checks need Chromium and its system dependencies.

```sh
corepack enable
corepack pnpm --version  # 11.6.0
pnpm install --frozen-lockfile
cp apps/journeys/.env.example apps/journeys/.env.local
pnpm dev               # Journeys: http://localhost:3000/en or /zh-HK
```

Blank backend/capability values support layout exploration with explicit unavailable states. To use connected Journeys features, configure `KINNSO_SUPABASE_URL`, its publishable key, `KINNSO_APPROVED_SUPABASE_ORIGIN` and `KINNSO_LEGACY_AUTH_ORIGIN` to the same approved origin. Set `KINNSO_SITE_URL` to the application's actual origin and enable only accepted capabilities. HTTP loopback requires `KINNSO_ENVIRONMENT=local`. See [the app's environment example](../apps/journeys/.env.example) for media/recovery fields. Never put server keys in public variables.

For the mature site, copy `apps/web/.env.example` to its ignored `.env.local`, configure its public Supabase environment and service flags, generate database types as below, then run `pnpm dev:web` on port 3001. Both apps may use the same approved backend but separate origins have independent logins.

## Fast checks without a database

These suites use local fixtures or fake dependency ports. They do not start/reset a backend or require application credentials.

```sh
node --test tooling-tests/*.test.mjs
pnpm test:journeys
pnpm --filter @kinnso/journeys typecheck
pnpm lint                 # repository + both apps, including Journeys
python -m unittest discover -s apps/journeys/tests -p source_package_test.py
python scripts/git_deployment_hold_test.py -v
```

For just the bookmark/API transport boundary (run inside the app so relative dependencies resolve normally):

```sh
cd apps/journeys
node --experimental-strip-types --test tests/bookmarks-api.test.mjs tests/repository-transport.test.mjs
```

The bookmark tests execute the real API context, validation and route with fake session/database/telemetry ports. They cover owner filters, composite cursor validation, page boundaries, same-origin and actor denials, stable mutation identity and a lost RPC acknowledgement. Transport tests execute the real repositories with VM-local fetch, covering cursor/path encoding, no-store requests, explicit denials, cancellation/failure envelopes and consent headers. They do not prove database idempotency or RLS; [the connected bookmark tests](../apps/journeys/tests/integration/bookmarks.test.mjs) cover those separately.

## Database types and connected checks

`packages/db/types.ts` is generated and ignored. Root `typecheck` and `build` deliberately stop when it is absent. Configure `apps/web/.env.test` for an explicitly approved isolated stack and set `KINNSO_LOCAL_STACK_DIR` to that stack's verified work directory before:

```sh
pnpm db:types
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm db:types` validates URL, project, container label and work directory; it does not start, reset or migrate a database. Existing local target identifiers in [README](../README.md) are guard inputs, not evidence that a stack exists on this machine. Do not substitute a cloud URL, invent types or disable the guard. Root `pnpm test` includes integration-capable workspace suites; it is not the credential-free fast lane above.

Journeys has additional guarded checks:

```sh
pnpm test:integration
pnpm --filter @kinnso/journeys exec playwright install --with-deps chromium
pnpm test:e2e
```

Use only the verified synthetic target accepted by the runner. Inspect [test-integration.mjs](../apps/journeys/scripts/test-integration.mjs), [target guards](../apps/journeys/scripts/verify-test-target.mjs) and [the Journeys workflow](../.github/workflows/journeys.yml) before provisioning it. The workflow creates a disposable owned stack, verifies its identity and derives test credentials before fixtures. Never load all browser specs against an arbitrary deployed URL.

For the mature-site local browser suite, use `pnpm --filter @kinnso/e2e e2e --config playwright.r7-10.config.ts` only after its guarded local setup. The deployed read-only subset uses `playwright.prod.config.ts`, selected by [verify.yml](../.github/workflows/verify.yml); it is a different acceptance scope.

`node scripts/isolated-rehearsal.mjs` is an explicit database-creating operation, not a prerequisite for offline tests. It uses a unique owned local identity, checks ports 59420–59422 and rehearses historical upgrade plus clean rebuild. Read [README's rehearsal contract](../README.md#verify) before running it. Historical migration replay does not prove equality with a live schema.

## Build and corresponding source

```sh
pnpm --filter @kinnso/journeys build
pnpm --filter @kinnso/journeys typecheck
pnpm start              # serves the built Journeys app on 3000
# In another terminal, for a separately built mature site:
pnpm start:web          # port 3001
```

The Journeys build first runs `source:pack`, then `next build`. Its generated `public/source/kinnsoos-source.zip` uses an explicit [allowlist](../apps/journeys/scripts/source-manifest.json). Add new distributed files/tests there; keep credentials, private evidence, generated full schema dumps and dependencies out. CI extracts the archive and runs install/test/build/typecheck independently. GPL/AdventureLog notices and corresponding-source access remain part of deployment.

## Deployment procedure

1. Bind the candidate commit, reviewed schema delta, enabled capabilities, generated-type provenance, test runs and last-good deployment in a private release record. Verify the migration/restore and role-specific acceptance described in [release operations](implementation/RELEASE_OPERATIONS.md).
2. Configure separate hosted projects rooted at `apps/journeys` and `apps/web`, including source outside each directory so workspace dependencies and the root lockfile are available. Give each its approved environment and auth callbacks. Journeys' checked-in config pins the install command; web's config builds through the repository root and needs migration-matched generated database types supplied by CI/build input.
3. Preserve the Git deployment hold in root and both app `vercel.json` files. `main` and the explicitly listed review branches are disabled; this is a branch-specific map, not a global wildcard hold. Before pushing a new code-only review branch, add its exact name to all three maps and `scripts/git_deployment_hold_test.py`, then run that test. Any approved deployment/cutover is a separate provider operation after acceptance.
4. For an authorized release, deploy the selected application with its verified inputs; record the actual deployment SHA, URL and schema relation. Confirm the appropriate production read-only workflow selected that surface. A skipped check or a layout-only preview is not persisted-flow acceptance. Complete authenticated checks with approved actors/content and retain cleanup evidence.
5. For an authorized rollback, restore the recorded last-good application/capability scope and verify persisted revisions/receipts. Preserve database data and use a reviewed forward schema fix where reversal loses new data. Do not reset production. Rolling back to the old single-app repository layout also requires restoring the hosted Root Directory.

The scan worker's [Railway configuration](../railway.json) builds `apps/scan/Dockerfile` with the **repository root** as context and starts `@kinnso/scan-app`; `/health` is its healthcheck. Worker/provider credentials and numeric budget acceptance are separate from a successful container build. Sync has its own Hono bootstrap; the root Railway config does not deploy it.

## Which CI result proves what?

| Workflow | Evidence |
| --- | --- |
| `ci.yml` | Workspace quality, migration-built types, mature-site/browser and scan-container checks using owned CI setup. |
| `journeys.yml` | Unit/build/typecheck, source archive rebuild, isolated connected/browser/mailbox and operations checks. Each job's artifact has its own scope. |
| `deployment-scope.yml` | Deployment selection metadata only; no runtime acceptance. |
| `journeys-production.yml` | SHA-bound anonymous Journeys production reads; no sign-in or mutation acceptance. |
| `verify.yml` | Selected mature-site cutover/parity checks and deployed read-only browser subset. |

See [architecture risks and the next three investments](../ARCHITECTURE.md#short-risk-map) for remaining engineering priorities. Report failed, skipped and unavailable checks separately from passing ones.
