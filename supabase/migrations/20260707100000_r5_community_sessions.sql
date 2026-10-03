-- supabase/migrations/20260707100000_r5_community_sessions.sql

-- R5: Community Sessions P1 — two content tables + a dedicated RSVP rate limiter.
--
-- host_creator_id RLS note: creators.id IS auth.users.id directly (creators is a
-- one-row-per-auth-user table, see 20260614000009_creator_tables.sql), so the
-- creator-owner policy below is a direct `host_creator_id = auth.uid()` equality —
-- NOT a subquery through a separate profile table like experiences_owner_all needs
-- (merchant_profiles.id is its own independently-generated PK). Getting this right
-- matters: a subquery here would silently never match and lock every creator out of
-- their own sessions.
--
-- session_rsvps identity note: deliberately NOT an exactly-one-of XOR like
-- bookings/agent_messages. The design doc's own wording is "email + optional user_id
-- (CRM capture)" — email is always captured, user_id is populated only when the
-- visitor happens to be signed in. The insert policy is still NULL-safe against a
-- signed-in caller trying to claim someone else's user_id.
--
-- rsvp_rate_limits is its own dedicated table + function, deliberately not a reuse of
-- either of this codebase's other two per-surface abuse limiters (house rule: each
-- abuse-control surface gets its own copy, since the existing agent-messages limiter
-- hardcodes its own table name and sharing would couple two features' unrelated abuse
-- limits).

create table public.community_sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  host_creator_id uuid not null references public.creators(id),
  title text not null,
  description text not null,
  type text not null check (type in ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro')),
  starts_at timestamptz not null,
  duration_minutes integer not null,
  embed_url text,
  replay_url text,
  destination_tags text[] not null default '{}',
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_sessions_starts_at_idx on public.community_sessions (starts_at);
create index community_sessions_host_idx on public.community_sessions (host_creator_id);

alter table public.community_sessions enable row level security;
revoke all on public.community_sessions from anon, authenticated;

-- Public read: anon + any signed-in role sees every non-cancelled session (scheduled,
-- live, and ended-with-or-without-a-replay all stay visible; cancelled is the ops-pull
-- path and should disappear from public view immediately).
create policy community_sessions_public_read on public.community_sessions
  for select to anon, authenticated using (status <> 'cancelled');

-- Creator owns their own sessions fully (create/edit/go-live/end/cancel their own).
create policy community_sessions_owner_all on public.community_sessions
  for all to authenticated
  using (host_creator_id = auth.uid())
  with check (host_creator_id = auth.uid());

-- Ops manage ANY session (create on a creator's behalf via a host picker, edit,
-- cancel, override status) regardless of who created it.
create policy community_sessions_ops_all on public.community_sessions
  for all to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

grant select on public.community_sessions to anon;
grant select, insert, update, delete on public.community_sessions to authenticated; -- gated by the policies above

alter table public.community_sessions
  add column if not exists updated_at timestamptz not null default now();

create trigger community_sessions_set_updated_at
  before update on public.community_sessions
  for each row execute procedure public.set_updated_at();

-- session_rsvps: append-only CRM capture. No anon SELECT policy exists at all — the
-- only reader is ops. Duplicate (session_id, email) inserts are expected to be
-- handled as success by the app layer (23505 unique-violation → ok:true), the same
-- idempotent-join shield agent_waitlist/agent_messages already established.
create table public.session_rsvps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.community_sessions(id) on delete cascade,
  email text not null check (
    email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254
  ),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(session_id, email)
);

create index session_rsvps_session_idx on public.session_rsvps (session_id);

alter table public.session_rsvps enable row level security;
revoke all on public.session_rsvps from anon, authenticated;

-- Fails closed for anon: auth.uid() is null for an anon caller, so
-- "user_id = auth.uid()" can only be true for an authenticated caller claiming their
-- own real id (same shape as agent_messages_insert).
create policy session_rsvps_insert on public.session_rsvps
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

create policy session_rsvps_ops_read on public.session_rsvps
  for select to authenticated using (public.is_active_ops());

grant insert on public.session_rsvps to anon, authenticated;
grant select on public.session_rsvps to authenticated; -- gated to ops by the policy above

-- Dedicated IP rate limiter for the RSVP write path (own table/function, per house rule).
create table public.rsvp_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.rsvp_rate_limits enable row level security;
revoke all on table public.rsvp_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_rsvp_rate_limit(
  p_ip text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rsvp_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.rsvp_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.rsvp_rate_limits.window_start
        end,
        request_count = case
          when public.rsvp_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.rsvp_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_rsvp_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_rsvp_rate_limit(text, integer, integer) to anon, authenticated;
