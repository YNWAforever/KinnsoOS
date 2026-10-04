# Incremental sync flow

Trigger: Webhook (POST /webhook/foso-incoming)  [n8n is the public endpoint the legacy listener calls]
1. Crypto/Code: recompute HMAC-SHA256(rawBody, $SYNC_WEBHOOK_SECRET); compare to header X-Foso-Signature → IF mismatch, respond 401 + stop.
2. HTTP Request → POST {APPS_SYNC_URL}/sync/{{$json.legacy_post_id}}  (header x-admin-token)
     Settings: retry on fail (3x, exponential backoff). On final failure → "dead-letter" branch.
3. HTTP Request → Vercel revalidate (or {APPS_SYNC_URL}) — continueOnFail (non-fatal).
4. Respond 200.
Dead-letter branch: append to an n8n Data Table / Slack alert with {legacy_post_id, error}.
