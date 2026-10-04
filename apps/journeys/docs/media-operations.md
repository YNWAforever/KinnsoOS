# Unified media operations

Use the same explicitly approved backend for login, traveller data and private
media. The unified runtime requires `KINNSO_MEDIA_RUNTIME=unified`, the existing
approved backend settings, and a server-only `KINNSO_SUPABASE_SECRET_KEY`. Keep
privileged keys out of public variables, source archives, request bodies and logs.
Retain the separate publishable key for browser-safe and ordinary user requests.

## Cleanup operation

`GET /api/cron/media-cleanup` requires the exact approved site origin and an
`Authorization: Bearer <CRON_SECRET>` header. Supply a random server-only
`CRON_SECRET` of at least 32 characters. Missing credentials, missing privileged
backend configuration and other deployment origins fail closed. Responses contain
only a removed count and use `Cache-Control: private, no-store`.

The operation uses the service-only `claim_kinnso_media_cleanup` contract, which
locks expired pending uploads, marks them terminal `failed`, and queues their
paths atomically before returning at most 100 queued paths. Finalization takes
the same row lock and rejects failed intents: if finalization wins, the ready
photo is retained; if cleanup wins, the user needs a fresh upload intent. The
read-only `kinnso_media_cleanup_candidates` inspects only already queued paths.
It never accepts
paths from the caller or deletes by listing arbitrary user objects. Storage must
confirm removal before `kinnso_media_cleanup_ack` clears the queued metadata.
Failed removal or acknowledgement returns a retryable 503. Retrying the same
queued removal is safe; an empty queue returns a removed count of zero.

Signed upload URLs remain usable for two hours without fresh authorization
([Supabase contract](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)).
Changing metadata state cannot revoke an already issued token. Cleanup therefore
keeps tombstones eligible for at least two hours and five minutes after queuing.
Only a successful later removal retires them. The returned count describes
successful removal requests, including repeat sweeps; it does not mean every
queued path has retired. Failed intents cannot obtain new signed upload URLs.
Verify the deployed provider's token lifetime remains within this window before
enabling uploads; a longer lifetime requires a reviewed retention adjustment.

The reviewed database must include the cleanup claim/finalizer and signed-token
retention migrations before
this operation can run. An unmigrated target fails before Storage deletion;
there is no fallback to the previous unclaimed selection protocol. Applying
that migration to a live environment is a separate release action.

Before enabling uploads, verify the operation with owned disposable local test
media: an expired unfinished upload and a deleted photo must disappear from
Storage and the queue; a retained ready photo must stay available. Verify that
incorrect credentials cannot reach Storage, and that removal failures retain
work for retry. Record actual results separately from scheduled-job configuration.

## Scheduler configuration

This source does not enable a production scheduler. After the release and cleanup
target are approved, add a scheduler to the selected deployment configuration.
For Vercel, a daily starting schedule can be added to `vercel.json` while retaining
its existing install/build settings:

```json
{
  "crons": [
    { "path": "/api/cron/media-cleanup", "schedule": "0 3 * * *" }
  ]
}
```

Configure `CRON_SECRET` in that environment. Vercel supplies it in the
Authorization header; see [Vercel's cron security documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
Verify the real deployed cron result and private logs. Treat repeated 503s or
batches consistently reaching 100 after the token-retention window as unfinished
work: investigate the queue and
choose an approved cadence that can drain it. Do not claim a job succeeded from
configuration alone.

## Release and recovery checks

Verify that the privileged key belongs to the approved project, the private
bucket and narrowly granted media RPCs match the reviewed contract, and the
application can complete owned upload/finalize/reload/share/revoke flows. Revoke
must block subsequent image requests, including previously opened share pages.
Keep personal notes and unselected media out of anonymous shares.

Enable `media` and `sharing` capabilities only after authenticated acceptance,
cleanup execution and recovery evidence are recorded. Recovery evidence must
cover private Storage bytes as well as database metadata. If a release fails,
disable those capabilities and restore the previous reviewed runtime; do not
reset the backend or delete user media as an application rollback.
