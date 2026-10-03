-- R8.2: bound anonymous analytics ingestion by client IP.
--
-- `check_and_increment_traveller_analytics_rate_limit` is keyed on the
-- client-supplied `journey_id`, so a caller that mints a fresh uuid per request
-- always lands in a brand-new bucket and the throttle never engages. The route
-- is unauthenticated and persists through the service role, so that left
-- `traveller_analytics_events` open to unbounded writes.
--
-- This adds the IP-keyed companion limit every other public write path already
-- has (checkout, agent, rsvp). The journey limit stays as-is: it still bounds a
-- single well-behaved session, while this bounds the caller.

create table public.traveller_analytics_ip_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.traveller_analytics_ip_rate_limits enable row level security;
-- No policies at all: like checkout_rate_limits, this table is never read or
-- written directly by any client role — only through the definer function below.
revoke all on table public.traveller_analytics_ip_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_traveller_analytics_ip_rate_limit(
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
  if coalesce(btrim(p_ip), '') = '' then
    raise exception 'analytics_ip_required' using errcode = '22023';
  end if;

  insert into public.traveller_analytics_ip_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.traveller_analytics_ip_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.traveller_analytics_ip_rate_limits.window_start
        end,
        request_count = case
          when public.traveller_analytics_ip_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.traveller_analytics_ip_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_traveller_analytics_ip_rate_limit(text, integer, integer)
  from public;
grant execute on function public.check_and_increment_traveller_analytics_ip_rate_limit(text, integer, integer)
  to anon, authenticated;
