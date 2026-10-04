# @kinnso/parity

Layer 1 **cutover parity gate** for KINNSO v3. Enumerates the published article set from Supabase
(anon, RLS-gated) and proves the live deploy serves every URL, redirect, sitemap entry, per-locale
count, and structured-data shape. Pure comparison engine (`src/checks/*` over injected source
adapters) + thin CLI (`src/bin.ts`). The engine's unit tests run in pre-merge `ci.yml`; the live run
runs in `verify.yml`.

## CLI

```bash
pnpm --filter @kinnso/parity parity -- \
  --base-url https://remix-kinnso-web.vercel.app \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --supabase-anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  [--legacy-sitemap <url>] \
  [--sample N] [--json] [--fail-fast]
```

Flags default to the env vars the web app uses (`BASE_URL`/`E2E_BASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Exit codes: `0` pass, `1` parity fail,
`2` misconfiguration. `--json` emits the `ParityReport` for CI artifacts.

## Baseline modes

- **Default (this environment):** the expected baseline is the seed fixtures in
  `kinnso-v3/supabase/seed.sql`, encoded in `src/fixtures/baseline.ts`. The live deploy serves these.
- **`--legacy-sitemap <url>`:** baseline URL set = the legacy site's `/sitemap.xml` (cutover, no DB).
- **`--legacy-mysql <dsn>`:** the real cutover baseline, derived from legacy MySQL.

  It does **not** build the baseline in SQL. `isPostLive` (`!deleted_at && !!published_at`) is *not*
  the publication predicate: `transform/index.ts` runs `validatePublication` and unpublishes the
  whole article when a locale has fewer than three visible blocks, fewer than 150 words, an invalid
  external link, or no active named author. None of that is expressible in SQL, so a SQL baseline
  would be a strict superset of what the new stack publishes and every article in the gap would
  surface as a phantom `sitemap-superset` failure.

  Instead the baseline runs the real code — `LegacyReader.streamPostBundles()` feeding the sync's own
  `transformPost` — and reads the verdict off the article row it produces. One pool, one TLS policy,
  one timezone policy, and zero new baseline SQL (nothing in this repo documents the legacy schema,
  so a new column name would be unverifiable until it failed in production).

  Articles legacy serves that the new stack will deliberately not publish are neither dropped nor
  expected: they are reported by the `seo-loss` check, which **fails** unless a redirect already
  covers the URL. `buildReport` is `ok: counts.fail === 0`, so a warn there would exit `0` and
  silently certify the loss.

  TLS and timezone come from `LEGACY_DB_SSL` / `LEGACY_DB_TIMEZONE`, never from the DSN. A DSN
  carrying `ssl`/`sslmode`/`useSSL` is **rejected** rather than ignored, so the mode cannot silently
  downgrade a connection an operator believes is encrypted.

  The mode still exits `2` rather than `0` whenever it cannot measure: an empty scan, a corpus with
  nothing visible, a scan shorter than `livePostCount()`, a locale fan-out exceeding the SQL
  translation ceiling, or an unroutable category (aggregated into one error, never a dropped path).

## Production acceptance gate (master spec §10 — documented, NOT executed in this plan)

At real cutover, run with `--legacy-mysql` (or the lighter `--legacy-sitemap`) against
the **legacy production URL** to assert: every legacy published URL still resolves (200 or intended
301), the new sitemap is a superset of the legacy sitemap, per-locale counts match legacy
`post_translations`, and a real redirect sample maps 1:1. Pair with a Google Search Console 2-week
index watch. These run in the deferred cutover plan, not here.
