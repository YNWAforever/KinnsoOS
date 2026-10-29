# Nightly read-only evidence retention

The Nightly funnel synthetic targets the KinnsoOS hosted pilot at `https://kinnso-os.vercel.app`. Both workflow jobs, the crawler's default and the evidence writer use this origin. The schedule, permissions, concurrency, pinned actions and `BOOKING_LIVE=false` remain unchanged. The fixture spec serves intercepted synthetic HTML; it does not prove hosted content or signed-in acceptance.

The guide funnel checks `/en` for HTTP 200 before inspecting published `/en/g/` links. It waits for catalog loading to finish. An explicit empty or unconfigured catalog with zero visible guide links produces a Playwright skip with reason `PILOT_EMPTY: no published /en/g/ guides are available; guide-to-experience funnel not exercised.` A catalog error and home non-200 remain failures.

Under the owner's incomplete-pilot contract, a featured guide without a creator link is annotated with type `pilot-incomplete-creator-link` and reason `pilot-incomplete-creator-link: guide /en/g/<slug> has no creator link`. The checker waits for guide loading to finish, requires HTTP 200 and a visible heading, and rejects the guide's retry/error state before inspecting its creator link. It continues past incomplete guides to the first guide with a visible creator link and attributed experience link. Each incomplete guide encountered stays annotated even when a later complete guide passes or fails. If every featured guide lacks a creator link, the funnel soft-skips with all affected paths in the skip reason. A creator-complete catalog without an attributed experience still fails with `CONTENT_MISSING`; incomplete annotations cannot turn that into a skip.

Workbench's server-rendered guide can remain visible while its initial client refresh is pending, without showing a loading marker. The checker observes that same-origin `/api/guides/<slug>` GET before navigation and requires HTTP 200 and `ok: true` before permitting an incomplete-guide skip. HTTP failures, missing guides and unsuccessful API results remain hard failures. Static web and intercepted fixture pages do not require this Workbench API.

After selecting a complete guide, its creator page must return HTTP 200 with a visible heading. The existing experience HTTP 200, heading, price and conditional booking assertions still run. These regressions remain hard failures. Anonymous navigation checks the KinnsoOS header destinations for Nightly; local R7.10 and the production web config retain the `apps/web` Navbar destinations. The production config declares that shell in report metadata. With booking disabled, browser smoke requests use GET only; other methods are blocked. The notfound spec continues to require HTTP 404, including `/en/experiences/r7-missing-experience`.

A valid empty sitemap urlset is expected during the pilot. The crawl exits 0 and reports `checked: 0` and `failureCount: 0`; its receipt retains `reportStatus: EMPTY`, `checkedUrls: 0` and `failures: 0` and also exits 0. This explicitly records zero page coverage. Missing sitemaps, network errors and non-sitemap HTML still fail; zero checked URLs cannot hide a nonzero failure count. The synthetic is an owner-run GET availability check and does not apply search-indexer robots rules. `robots.txt` containing `Disallow: /` does not fail it, change indexing settings or cause extra page discovery.

Receipts verify checkout SHA against the workflow source and the actual report's origin, source, run ID and attempt. They preserve failures, skips and flakes separately. Funnel receipts additionally retain `pilotContent`, an array of known public pilot reasons with `reason`, `description` and the actual Playwright `testOutcome` (`expected`, `unexpected`, `flaky` or `skipped`). `pilot-empty` classifies the existing skip; `pilot-incomplete-creator-link` classifies each missing creator link. Successful mixed-guide runs keep `skipped: 0` and the incomplete annotations with `testOutcome: expected`. All-incomplete runs keep the skipped count and annotations with `testOutcome: skipped`. These annotations do not override execution outcomes or failure counts. Arbitrary annotations, error messages and report metadata are not copied into the receipt.

A skipped or cancelled command cannot reuse an existing report as executed evidence or pilot annotations. Missing, malformed, zero-test or contradictory successful funnel evidence fails the evidence step; command failures remain failures. Sitemap JSON contains aggregate counts without raw URLs, response bodies or transport details. Both jobs retain receipts and reports on success and failure.

`runtimeSourceRevision` stays `NOT_CHECKED`, and signed-in and Journeys role acceptance stay `NOT_RUN`. A checkout SHA identifies the checker source, not the deployed runtime. A green nightly with an empty sitemap or skipped funnel cannot close those acceptance gates. The historical zero-page rejection introduced during PR #49 is superseded by this explicit pilot contract; invalid sitemap responses still fail.

## Local verification (2026-10-29)

Frozen pnpm 11.6.0 dependencies, Node 24.22.1 and Chromium were used. This CLI session uses the existing writable Corepack cache via command-scoped `COREPACK_HOME=/tmp/kinnso-corepack`; no environment files or hosted settings change.

| Command / control | Result |
| --- | --- |
| `pnpm lint` | Exit 0; existing warnings only |
| `pnpm --filter @kinnso/e2e typecheck` | Exit 0 |
| `node --test tooling-tests/*.test.mjs` | 122 passed; no failures or skips |
| `SUPABASE_URL=http://127.0.0.1:54421 pnpm --filter web test tests/crawl-sitemap.test.ts` | 16 passed; injected fetch only, no database requests |
| `pnpm --filter @kinnso/e2e test:nightly-controls` | Exit 0; 18 scenarios pass (19 TAP tests including parent); cases below |

The committed loopback harness covers empty and complete catalogs, all-incomplete guides (annotated skip), and mixed guides (earlier incomplete annotation retained, later complete creator and experience exercised). Hard controls require nonzero exit for home 503, missing-experience 200, selected creator 500, selected experience 500, missing price, a creator-complete guide without an attributed experience, and catalog errors. Additional controls exercise the actual production web config, reject a wrong web Navbar destination, retain the local R7.10 path, and ensure delayed Workbench refresh 503/404/`ok: false` results fail while successful incomplete content still skips. The intercepted fixture spec also checks that a loading guide is not prematurely classified as incomplete. Reports and per-case logs remain under `.ci-evidence/nightly-softgate-controls/`.

The initial proof at `1fcde64ff1b1bc96c209859faddd8d932c267c89` failed because hydrated production guides lacked creator links. The owner's new acceptance contract supersedes that failure classification; it does not change hosted content. To run the current read-only proof:

```sh
E2E_BASE_URL=https://kinnso-os.vercel.app E2E_ALLOW_REMOTE_TARGET=1 \
  BOOKING_LIVE=false PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/nightly-funnel.json \
  pnpm --filter @kinnso/e2e e2e funnel-smoke funnel-fixture notfound --reporter=list,html,json

BASE_URL=https://kinnso-os.vercel.app \
  node --experimental-strip-types scripts/crawl-sitemap.ts
```

Set matching checkout/run/attempt metadata when generating source-bound receipts, as the workflow does. CLI logs for this change are saved as `/workspace/cli-logs/kinnso-110-softgate.*.log`; the PR addendum records the committed-source production results.

## Remaining gates and rollback

The scheduled workflow with these changes has not run. After an authorized merge, inspect its actual reports, receipt source/run/attempt, target, command outcome and coverage counts. Incomplete guide annotations and skipped coverage must remain visible until published content supplies complete paths. Intercepted fixtures are not hosted funnel acceptance. Keep the PR draft and hold further review until exact-head CI is green.

Revert this focused change to restore the previous checker behavior. No application, database, provider, credential, indexing or booking/payment configuration changes are included.
