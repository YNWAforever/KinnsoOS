-- supabase/migrations/20260817090000_r10_3_notifications_table.sql
--
-- R10.3: the notifications table. RLS lets a creator read and mark-read their own rows;
-- nothing else. There is deliberately no insert grant to any client role, and no insert
-- policy either — every row is written by a SECURITY DEFINER trigger function (Task 2),
-- which bypasses RLS as the function owner. This is the same "RLS + zero policies for the
-- write path, RPC/trigger-only" shape every table in this codebase since R10.2's
-- creator_payout_batches uses.
--
-- No copy is ever stored here. KINNSO's i18n is custom across 7 locales with no per-creator
-- locale preference tracked anywhere in this schema — payload carries only the interpolation
-- values a client-side i18n template needs (e.g. {"mission_title": "..."}), never rendered
-- text. The 8 KiB cap (Adfocate 0022's own number) keeps a buggy trigger from ever writing
-- something absurd; every payload this phase's triggers write is well under 200 bytes.

create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.creators(id) on delete cascade,
  notification_type text not null,
  entity_type       text not null,
  entity_id         uuid not null,
  payload           jsonb not null default '{}'::jsonb,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  constraint notifications_payload_size check (pg_column_size(payload) <= 8192)
);

create index notifications_creator_created_idx on public.notifications (creator_id, created_at desc);
create index notifications_creator_unread_idx on public.notifications (creator_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (creator_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Supabase's default privileges re-grant broadly to every client role on a new table (see
-- 20260627155000) — name each role explicitly, matching every other money/ledger table in
-- this codebase since R10.2 Task 1.
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
