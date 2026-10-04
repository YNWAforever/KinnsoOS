# Local mobile performance lab

Use Node 22.19 or later. Install the optional auditor separately from product dependencies:

```sh
npm ci --prefix scripts/performance --ignore-scripts
npx playwright install chromium
npm run build
node scripts/performance/run.mjs
```

The runner requires the existing approved `.env.test`, verifies the owned isolated Supabase project/container, and starts its own production build on loopback port 3521. An occupied port fails closed. It never targets a cloud URL. It creates one synthetic local author, an explicitly authored guide and a persisted trip; cleanup deletes only that owned actor and cascading fixtures. Do not supply production credentials.

It measures home, explore, guide and the signed-in trip editor three times each with cold and warm browser HTTP cache. Every pair gets a fresh browser context; the trip's login cookies are retained when clearing HTTP cache. The app process and database stay warm. Chrome uses a 390×844 mobile viewport, 4× CPU slowdown, 150 ms network latency, 1,600 Kbps download and 750 Kbps upload. Lighthouse uses applied DevTools throttling, not simulated scores. External HTTP requests are blocked and recorded.

Each navigation retains its Lighthouse report, LCP, CLS, TBT, JavaScript/image transfer bytes and browser API timings. Actual search/filter/draft/persisted-note interactions retain traces and assertions. Trace arguments are removed; timestamps, categories and durations remain. Artifacts stay in ignored `evidence/performance/`. Failed or missing measurements cannot pass. The median targets are LCP ≤2.5 s and CLS ≤0.1 for each page/cache group; `report.json` reports failure without rewriting measurements. A successfully collected failing target is still useful evidence, so the process exits nonzero for collection/cleanup failures, not merely a slow target.

Query timing separately executes three equivalent backend reads per core page using the real local catalog projection/guide/trip RPCs. This includes HTTP/PostgREST overhead; isolated PostgreSQL execution time remains unmeasured. API timings are local browser observations, not cloud/query p95. Interaction elapsed time is not field INP. A synthetic guide with no cover does not measure real image delivery. Production, physical-device and human accessibility acceptance remain separate gates.

To compare the frozen PR #1 foundation on the same host/tool/browser:

```sh
node scripts/performance/prepare-foundation.mjs
node scripts/performance/run.mjs --foundation
# Set KINNSO_LAB_BASELINE to that run's absolute report.json path, then run current again.
node scripts/performance/run.mjs
```

The foundation archive is exported to a new ignored directory without changing the checkout. An existing directory is preserved. The runner uses its own port 3522. Foundation guide/trip are demo screens and explicitly not comparable to current durable behavior; home/explore also have different datasets. Same-condition deltas show shell delivery cost, not a claim of functional or content parity. Baseline collection/comparison that has not run remains `NOT_RUN`.
