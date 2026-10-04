-- supabase/migrations/20260705120000_r4_agent_rate_limit_and_rating_rpc.sql

-- R4: (1) a DEDICATED IP rate limiter for /api/agent — deliberately NOT the same table
-- as R3A-2's checkout rate-limit table, since that RPC hardcodes the table name in its
-- SQL body (not parameterized); sharing it would couple two unrelated features' abuse
-- limits (plan PD notes this explicitly). Identical shape, new table, new function.
-- (2) rate_agent_message(): SECURITY DEFINER because agent_messages has no RLS-cheap
-- "owner" concept for anon rows — this checks real ownership (auth.uid() for signed-in,
-- a client-supplied opaque anon_session_id for anon) before allowing the one mutation
-- (rating) this table ever needs (PD-R4-1), same trust shape as the R3 guest-booking
-- confirmation-by-unguessable-session-id precedent.
--
-- Ownership-check note: the traveller branch below uses
-- `v_traveler_user_id is distinct from auth.uid()` rather than plain `!=`. Postgres'
-- `!=` returns NULL (not true/false) when either side is NULL, and plpgsql's `if`
-- treats NULL as "false" — so a naive `if v_traveler_user_id != auth.uid() then raise
-- exception` would silently skip the raise whenever an ANON caller (auth.uid() is
-- NULL) targets a message that belongs to a signed-in traveller (v_traveler_user_id is
-- NOT NULL), letting an anonymous request rate a stranger's message. `is distinct
-- from` is NULL-safe and correctly treats NULL as a distinct, non-matching value,
-- closing that gap.

create table public.agent_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.agent_rate_limits enable row level security;
revoke all on table public.agent_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_agent_rate_limit(
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
  insert into public.agent_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.agent_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.agent_rate_limits.window_start
        end,
        request_count = case
          when public.agent_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.agent_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_agent_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_agent_rate_limit(text, integer, integer) to anon, authenticated;

create or replace function public.rate_agent_message(
  p_message_id uuid,
  p_rating text,
  p_anon_session_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_traveler_user_id uuid;
  v_anon_session_id uuid;
begin
  if p_rating not in ('up','down') then
    raise exception 'invalid_rating';
  end if;

  select traveler_user_id, anon_session_id into v_traveler_user_id, v_anon_session_id
    from public.agent_messages
    where id = p_message_id and role = 'assistant';

  if not found then
    raise exception 'not_found';
  end if;

  if v_traveler_user_id is not null then
    -- NULL-safe comparison: `is distinct from` correctly rejects an anon caller
    -- (auth.uid() is NULL) targeting a traveller-owned message, unlike `!=` which
    -- would evaluate to NULL (not TRUE) and silently fall through without raising.
    if v_traveler_user_id is distinct from auth.uid() then
      raise exception 'forbidden';
    end if;
  else
    -- Same NULL-safety concern as the traveller branch above, hardened the same way
    -- even though agent_messages_exactly_one_identity currently guarantees
    -- v_anon_session_id is never null on this path: defense in depth against that
    -- invariant ever weakening, not just reliance on an external constraint.
    if p_anon_session_id is null or v_anon_session_id is distinct from p_anon_session_id then
      raise exception 'forbidden';
    end if;
  end if;

  update public.agent_messages set rating = p_rating where id = p_message_id;
end;
$$;

revoke all on function public.rate_agent_message(uuid, text, uuid) from public;
grant execute on function public.rate_agent_message(uuid, text, uuid) to anon, authenticated;
