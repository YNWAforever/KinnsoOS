# Drift-sweep cron flow

Trigger: Schedule (every 1 hour)
1. MySQL (legacy, READ-ONLY): select id, greatest(coalesce(edit_at,'1970-01-01'), updated_at) as changed_at
                              from posts where deleted_at is null
2. Supabase: select legacy_post_id, source_synced_at from articles
3. Code: ids whose legacy changed_at > source_synced_at (or missing in Supabase)
4. Split In Batches → POST {APPS_SYNC_URL}/sync/{{id}} (x-admin-token), retry on fail
Backstop for any missed/failed incremental webhook (spec §6, §8).
