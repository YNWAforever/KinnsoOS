# Backfill trigger flow

Trigger: Manual
1. HTTP → POST {APPS_SYNC_URL}/backfill (x-admin-token), high timeout. (apps/sync paginates 200/batch internally.)
2. HTTP → POST {APPS_SYNC_URL}/redirects (x-admin-token), `Content-Type: text/plain`, body = the raw
   contents of the legacy `redirect.php`. apps/sync runs `parseRedirectsPhp()` over it and upserts the
   result into `seo_redirects` on `from_path`.
   - Responds `{ ok: true, parsed, written }`. `parsed` counts matched `redirectI18n(...)` lines;
     `written` is lower when the file repeats a `from_path` — the first entry wins, matching the
     legacy router's first-match-wins order.
   - Idempotent: re-posting the same file converges. Safe to re-run after a partial failure.
   - Bodies over 1 MiB are rejected with 413 before parsing.

`apps/web/proxy.ts` reads `seo_redirects` at request time to serve 307s; nothing else in production
writes that table, so step 2 is what keeps legacy URLs from 404ing after cutover.
