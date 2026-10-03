-- supabase/migrations/20260705110000_r4_agent_messages.sql

-- R4 (design doc D-R4-4, plan Ground Truth note): a single message-log table, no
-- separate "conversations" table — mirrors copilot_messages' shape exactly (a
-- traveller's/anon session's "thread" is just every row sharing their identity,
-- ordered by created_at). Anon gets a client-generated anon_session_id in place of a
-- real user id; the two identity columns are mutually exclusive, same pattern as
-- bookings.traveler_user_id/guest_email. No anon SELECT ever — sign-in is required to
-- read a thread back (D-R4-4's actual requirement).

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately CASCADEs (unlike bookings.traveler_user_id, which has no on-delete
  -- clause and blocks account deletion instead): this is a chat log, not a financial/
  -- legal record, so it follows copilot_messages' precedent (full teardown of a
  -- person's own conversational data on account deletion) rather than bookings'
  -- "never silently disappear" stance.
  traveler_user_id uuid references auth.users(id) on delete cascade,
  anon_session_id uuid,
  role text not null check (role in ('user','assistant')),
  content text not null,
  tool_calls jsonb,
  rating text check (rating in ('up','down')),
  created_at timestamptz not null default now(),
  constraint agent_messages_exactly_one_identity check (
    (traveler_user_id is not null and anon_session_id is null) or
    (traveler_user_id is null and anon_session_id is not null)
  )
);

create index agent_messages_traveler_idx on public.agent_messages (traveler_user_id, created_at);
create index agent_messages_anon_session_idx on public.agent_messages (anon_session_id, created_at);

alter table public.agent_messages enable row level security;

-- Insert-only for both anon and authenticated. The check clause fails closed for an
-- anon caller trying to claim a traveler_user_id: auth.uid() is null for anon, so
-- "traveler_user_id = auth.uid()" can only be true for an authenticated caller
-- claiming their own real id.
create policy agent_messages_insert on public.agent_messages
  for insert to anon, authenticated
  with check (traveler_user_id is null or traveler_user_id = auth.uid());

-- Only a signed-in traveller can ever read their own rows back. No anon select policy
-- exists at all — this is the concrete meaning of "sign-in unlocks saved history".
create policy agent_messages_owner_select on public.agent_messages
  for select to authenticated
  using (traveler_user_id = auth.uid());

grant select, insert on public.agent_messages to anon, authenticated;
revoke update, delete on public.agent_messages from anon, authenticated;
