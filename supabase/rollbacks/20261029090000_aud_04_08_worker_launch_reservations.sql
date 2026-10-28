-- Stop/drain the new worker before rollback; it fails closed without this RPC.
-- Retain the ledger (and its restrictive grants) so rollback never refunds or
-- discards launch history. Reverting source restores the old quota weaknesses.
drop function public.reserve_worker_launch(text, uuid, uuid, uuid, text);
-- Full destructive removal of the ledger is deliberately not part of rollback.
-- Reapply the forward function definition + grants only to resume new workers;
-- do not replay CREATE TABLE/backfill over the retained ledger.
