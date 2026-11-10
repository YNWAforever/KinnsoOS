# Cursor pagination for booking request history

**Status:** deployed and verified in production. Release dc89d53, ledger **263** (`20261110120000`), deployment dpl_HWHmH6gp4EsdGq1wLfNWLdUqYmGQ.

## What shipped

Offset pagination could skip or repeat rows when a request arrived while someone was paging. Both read RPCs now use keyset cursors: the creator cursor is `(pendingFirst, createdAt, id)` and the traveller cursor is `(createdAt, id)`. The APIs return an opaque base64url `nextCursor`; the creator inbox and traveller tracker follow it for Load older requests. The old no-argument/offset overloads were dropped so PostgREST resolves exactly one function.

## Verification

- Local 4/4 with 61 seeded/inserted requests: traveller 50 → 10 with no duplicates; a request inserted between pages did not confuse page 2; creator 50 → 11 preserving pending-first with no duplicates; the load-more control appended the rest and disappeared.
- Production: traveller API returned 2 rows with `hasMore=false` and no cursor, a malformed cursor fell back to the first page, both trackers/inboxes rendered, creator API returned its rows. Read-only; no rows touched.

## Limits

The cursor is opaque but unsigned; a caller can only page their own rows and malformed tokens fall back to page 1. The cutover dropped the old overloads, so rolling back to the offset deployment would require restoring them first.
