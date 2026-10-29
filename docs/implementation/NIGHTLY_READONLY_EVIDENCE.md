# Nightly read-only evidence retention

The Nightly funnel synthetic targets the KinnsoOS hosted pilot at `https://kinnso-os.vercel.app`. Both workflow jobs, the crawler's default and the evidence writer use this origin. The schedule, permissions, concurrency, pinned actions and `BOOKING_LIVE=false` remain unchanged. The fixture spec serves intercepted synthetic HTML; it does not prove hosted content or signed-in acceptance.

The guide funnel checks `/en` for HTTP 200 before inspecting published `/en/g/` links. It waits for catalog loading to finish. An explicit empty or unconfigured catalog with zero visible guide links produces a Playwright skip with reason `PILOT_EMPTY: no published /en/g/ guides are available; guide-to-experience funnel not exercised.` The JSON report retains that reason and the receipt retains the skipped count. A catalog error, home non-200 or a published guide missing the required creator/attributed experience link remains a failure. When guides exist, the existing guide-to-experience and price assertions run. Anonymous navigation checks the KinnsoOS header destinations. With booking disabled, browser smoke requests use GET only; other methods are blocked. The notfound spec continues to require HTTP 404, including `/en/experiences/r7-missing-experience`.

A valid empty sitemap urlset is expected during the pilot. The crawl exits 0 and reports `checked: 0` and `failureCount: 0`; its receipt retains `reportStatus: EMPTY`, `checkedUrls: 0` and `failures: 0` and also exits 0. This explicitly records zero page coverage. Missing sitemaps, network errors and non-sitemap HTML still fail; zero checked URLs cannot hide a nonzero failure count. The synthetic is an owner-run GET availability check and does not apply search-indexer robots rules. `robots.txt` containing `Disallow: /` does not fail it, change indexing settings or cause extra page discovery.

Receipts verify checkout SHA against the workflow source and the actual report's origin, source, run ID and attempt. They preserve failures, skips and flakes separately. A skipped or cancelled command cannot reuse an existing report as executed evidence. Missing, malformed, zero-test or contradictory successful funnel evidence fails the evidence step; command failures remain failures. Sitemap JSON contains aggregate counts without raw URLs, response bodies or transport details. Both jobs retain receipts and reports on success and failure.

`runtimeSourceRevision` stays `NOT_CHECKED`, and signed-in and Journeys role acceptance stay `NOT_RUN`. A checkout SHA identifies the checker source, not the deployed runtime. A green nightly with an empty sitemap or skipped funnel cannot close those acceptance gates. The historical zero-page rejection introduced during PR #49 is superseded by this explicit pilot contract; invalid sitemap responses still fail.

## Local verification (2026-10-29)

Frozen pnpm 11.6.0 dependencies, Node 24.22.1 and Chromium were used. Production probes used read-only GETs. No hosted content, provider or environment settings were changed.

| Command / control | Result |
| --- | --- |
| `pnpm lint` | Exit 0; existing warnings only |
| `pnpm --filter @kinnso/e2e typecheck` | Exit 0 |
| `pnpm --filter @kinnso/e2e exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module esnext --moduleResolution bundler --typeRoots node_modules/@types ../../scripts/crawl-sitemap.ts` | Exit 0 |
| `pnpm exec node --test tooling-tests/*.test.mjs` | 113 passed; no failures or skips |
| `SUPABASE_URL=http://127.0.0.1:54421 pnpm --filter web test tests/crawl-sitemap.test.ts` | 16 passed; injected fetch only, no database requests |
| Actual Nightly specs against synthetic loopback HTML, empty catalog | 11 passed, 1 skipped; JSON contains the `PILOT_EMPTY` reason |
| Actual Nightly specs against synthetic loopback HTML, complete funnel | 12 passed, 0 skipped |
| Synthetic home 503 / missing-experience 200 / catalog error controls | Each exits 1; no empty-pilot skip hides these errors |
| `pnpm typecheck` | Blocked before Turbo: generated `packages/db/types.ts` is absent; scoped checker typechecks above pass |

The GET probe confirms `/en` HTTP 200, `/sitemap.xml` HTTP 200 with an empty urlset, `/robots.txt` HTTP 200 with `Disallow: /`, and the missing experience HTTP 404. Run the same crawl used by the workflow with:

```sh
BASE_URL=https://kinnso-os.vercel.app \
  node --experimental-strip-types scripts/crawl-sitemap.ts
```

It exits 0 with `Checked 0 sitemap URLs; 0 failures`.

The browser probe revealed a material difference from the initial server-HTML probe: `/en` initially has zero guide links and “Loading published guides…”, but hydration loads four visible guide links from a catalog with eight published entries. The first guide is a summary without the required `/en/c/` creator link. Consequently the actual remote guide funnel fails that existing assertion; it is **not** recorded as an empty-pilot skip. The five notfound checks, KinnsoOS navigation and five intercepted fixture tests pass (11 passed, 1 failed overall). This remains a live content/contract limitation; the checker does not invent content or weaken the guide assertions to turn it green.

```sh
E2E_BASE_URL=https://kinnso-os.vercel.app E2E_ALLOW_REMOTE_TARGET=1 \
  BOOKING_LIVE=false PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/nightly-funnel.json \
  pnpm --filter @kinnso/e2e e2e funnel-smoke funnel-fixture notfound --reporter=list,json
```

## Remaining gates and rollback

The scheduled workflow with these changes has not run. After an authorized merge, inspect its actual reports, receipt source/run/attempt, target, command outcome and coverage counts. The hydrated guide contract failure must remain visible until the published content supplies the required links or the owner authorizes a different pilot acceptance contract. Intercepted fixtures are not hosted funnel acceptance.

Revert this focused change to restore the previous checker behavior. No application, database, provider, credential, indexing or booking/payment configuration changes are included.
